-- "Our Team": the page in the Home menu that introduces the people behind NOOB. The main NOOB administrator adds, edits, reorders and removes
-- team members (name, qualification, photo, description) from the Admin Control Panel; every signed-in person can read the list.
--
-- The table is reached only through the functions below (row level security on, no policies), like the NOOB Draw tables. The photo is
-- stored as a file key in the media bucket ("team/…"), never as a picture inside the database.

-- The "team" folder joins the folders people are allowed to upload into (the full list as of the last change, plus 'team').
drop policy if exists media_upload on storage.objects;
create policy media_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] in
      ('posts', 'reels', 'stories', 'avatars', 'music', 'covers', 'stickers', 'products', 'chat', 'instants', 'comments', 'videos', 'daily', 'songs', 'team')
  );

create table if not exists public.team_members (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  qualification  text not null default '',
  description    text not null default '',
  photo          text,
  position       integer not null default 0,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint team_members_name_len  check (char_length(btrim(name)) between 1 and 80),
  constraint team_members_qual_len  check (char_length(qualification) <= 160),
  constraint team_members_desc_len  check (char_length(description) <= 1200),
  constraint team_members_photo_ok  check (photo is null or (char_length(photo) <= 400 and photo not like 'data:%'))
);
create index if not exists team_members_order_idx on public.team_members (position, created_at, id);
alter table public.team_members enable row level security;

-- The whole list, in the order the admin chose.
create or replace function public.team_json() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'name', t.name, 'qualification', t.qualification, 'description', t.description,
    'photo', t.photo, 'position', t.position
  ) order by t.position, t.created_at, t.id), '[]'::jsonb)
  from public.team_members t;
$$;
revoke execute on function public.team_json() from public, anon, authenticated;

create or replace function public.team_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please log in.'; end if;
  return public.team_json();
end;
$$;
revoke execute on function public.team_list() from public, anon;
grant execute on function public.team_list() to authenticated;

-- Add a member (p_id null) or change one. Returns the fresh list.
create or replace function public.admin_team_save(
  p_id uuid, p_name text, p_qualification text, p_description text, p_photo text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid;
  nm text := btrim(coalesce(p_name, ''));
  ql text := btrim(coalesce(p_qualification, ''));
  ds text := btrim(coalesce(p_description, ''));
  ph text := nullif(btrim(coalesce(p_photo, '')), '');
  rid uuid;
begin
  me := public.require_master_admin('Only the main NOOB administrator can change the team page.');
  if nm = '' then raise exception 'Please write the name.'; end if;
  if char_length(nm) > 80 then raise exception 'The name can be at most 80 characters.'; end if;
  if char_length(ql) > 160 then raise exception 'The qualification can be at most 160 characters.'; end if;
  if char_length(ds) > 1200 then raise exception 'The description can be at most 1200 characters.'; end if;
  if ph is not null and (char_length(ph) > 400 or ph like 'data:%') then raise exception 'Please upload the photo as a file.'; end if;

  if p_id is null then
    insert into public.team_members (name, qualification, description, photo, position, created_by)
    values (nm, ql, ds, ph, coalesce((select max(position) from public.team_members), 0) + 1, me)
    returning id into rid;
    perform public.log_admin_action('team_member_added', null, jsonb_build_object('name', nm));
  else
    update public.team_members set name = nm, qualification = ql, description = ds, photo = ph, updated_at = now()
    where id = p_id returning id into rid;
    if rid is null then raise exception 'That team member no longer exists.'; end if;
    perform public.log_admin_action('team_member_updated', null, jsonb_build_object('name', nm));
  end if;
  return jsonb_build_object('success', true, 'id', rid, 'team', public.team_json());
end;
$$;
revoke execute on function public.admin_team_save(uuid, text, text, text, text) from public, anon;
grant execute on function public.admin_team_save(uuid, text, text, text, text) to authenticated;

-- Remove a member. Returns the fresh list (and the removed photo's key so the app can delete the file).
create or replace function public.admin_team_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare gone public.team_members;
begin
  perform public.require_master_admin('Only the main NOOB administrator can change the team page.');
  delete from public.team_members where id = p_id returning * into gone;
  if gone.id is null then raise exception 'That team member no longer exists.'; end if;
  update public.team_members t set position = u.n
  from (select id, row_number() over (order by position, created_at, id) as n from public.team_members) u
  where t.id = u.id;
  perform public.log_admin_action('team_member_removed', null, jsonb_build_object('name', gone.name));
  return jsonb_build_object('success', true, 'removedPhoto', gone.photo, 'team', public.team_json());
end;
$$;
revoke execute on function public.admin_team_delete(uuid) from public, anon;
grant execute on function public.admin_team_delete(uuid) to authenticated;

-- Move a member one place up or down. Returns the fresh list.
create or replace function public.admin_team_move(p_id uuid, p_direction text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ids uuid[]; i int; j int; tmp uuid;
begin
  perform public.require_master_admin('Only the main NOOB administrator can change the team page.');
  select array_agg(id order by position, created_at, id) into ids from public.team_members;
  i := array_position(ids, p_id);
  if i is null then raise exception 'That team member no longer exists.'; end if;
  j := case lower(coalesce(p_direction, '')) when 'up' then i - 1 when 'down' then i + 1 else null end;
  if j is null then raise exception 'The direction must be up or down.'; end if;
  if j >= 1 and j <= array_length(ids, 1) then
    tmp := ids[i]; ids[i] := ids[j]; ids[j] := tmp;
    update public.team_members t set position = u.n
    from unnest(ids) with ordinality as u(id, n)
    where t.id = u.id;
    perform public.log_admin_action('team_member_moved', null, jsonb_build_object('name', (select name from public.team_members where id = p_id), 'direction', lower(p_direction)));
  end if;
  return jsonb_build_object('success', true, 'team', public.team_json());
end;
$$;
revoke execute on function public.admin_team_move(uuid, text) from public, anon;
grant execute on function public.admin_team_move(uuid, text) to authenticated;
