-- "Our Team", part 2: people join the team page themselves, from a link, inside the app.
--
--   * A signed-in person fills in photo, name, qualification and description. Their NOOB account (User ID, account ID) is taken from their
--     login: nobody types it and nobody can fill the form for someone else.
--   * Their application waits in the Admin Control Panel → Our Team → Applications; one tap adds them to the page. A switch there can also
--     publish new applications straight away, and another one closes applications (the link then says so).
--   * A team member can be linked to a NOOB account (every applicant is; the admin can link anyone by typing their User ID). The team page
--     then shows their @user ID and a "Follow on NOOB" button.
--
--   * The administrator can remove anyone, from either list. That erases, for good, everything the person filled in (the card and the whole
--     joining form, and their name in the activity log) and hands back the photo files to delete. Their NOOB account is never touched.
--
-- (The older table "team_applications" belongs to the private staff form in Explore and is not touched.)

alter table public.team_members add column if not exists user_id uuid references public.profiles(id) on delete set null;
create unique index if not exists team_members_user_uidx on public.team_members (user_id) where user_id is not null;

create table if not exists public.team_settings (
  id                 boolean primary key default true check (id),
  applications_open  boolean not null default true,
  auto_publish       boolean not null default false,
  updated_at         timestamptz not null default now()
);
insert into public.team_settings (id) values (true) on conflict (id) do nothing;
alter table public.team_settings enable row level security;

create table if not exists public.team_page_applications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null unique references public.profiles(id) on delete cascade,
  name           text not null,
  qualification  text not null default '',
  description    text not null default '',
  photo          text,
  status         text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  decided_at     timestamptz,
  decided_by     uuid references public.profiles(id) on delete set null,
  constraint team_page_applications_name_len  check (char_length(btrim(name)) between 1 and 80),
  constraint team_page_applications_qual_len  check (char_length(qualification) <= 160),
  constraint team_page_applications_desc_len  check (char_length(description) <= 1200),
  constraint team_page_applications_photo_ok  check (photo is null or (char_length(photo) <= 400 and photo not like 'data:%'))
);
create index if not exists team_page_applications_status_idx on public.team_page_applications (status, created_at desc);
alter table public.team_page_applications enable row level security;

-- ---------------------------------------------------------------- the team list, now with the linked account and the viewer's follow state
create or replace function public.team_json() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'name', t.name, 'qualification', t.qualification, 'description', t.description,
    'photo', t.photo, 'position', t.position,
    'userId', t.user_id, 'username', p.username, 'avatar', p.avatar, 'isVerified', coalesce(p.is_verified, false),
    'isMe', t.user_id is not null and t.user_id = auth.uid(),
    'following', t.user_id is not null and exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = t.user_id),
    'requested', t.user_id is not null and exists (select 1 from public.follow_requests r where r.requester_id = auth.uid() and r.target_id = t.user_id),
    'blocked', t.user_id is not null and exists (
      select 1 from public.blocks b where (b.blocker_id = auth.uid() and b.blocked_id = t.user_id) or (b.blocker_id = t.user_id and b.blocked_id = auth.uid()))
  ) order by t.position, t.created_at, t.id), '[]'::jsonb)
  from public.team_members t
  left join public.profiles p on p.id = t.user_id;
$$;
revoke execute on function public.team_json() from public, anon, authenticated;

-- "ann" or "@Ann" -> the account's id; blank -> null; unknown -> a clear error.
create or replace function public.team_resolve_user(p_username text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare u text := lower(btrim(regexp_replace(coalesce(p_username, ''), '^\s*@+', ''))); rid uuid;
begin
  if u = '' then return null; end if;
  select id into rid from public.profiles where lower(username) = u;
  if rid is null then raise exception 'There is no NOOB account with the User ID @%.', u; end if;
  return rid;
end;
$$;
revoke execute on function public.team_resolve_user(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- admin: add / edit a member (now with the optional NOOB User ID)
drop function if exists public.admin_team_save(uuid, text, text, text, text);
create or replace function public.admin_team_save(
  p_id uuid, p_name text, p_qualification text, p_description text, p_photo text, p_username text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid;
  nm text := btrim(coalesce(p_name, ''));
  ql text := btrim(coalesce(p_qualification, ''));
  ds text := btrim(coalesce(p_description, ''));
  ph text := nullif(btrim(coalesce(p_photo, '')), '');
  uid uuid;
  rid uuid;
begin
  me := public.require_master_admin('Only the main NOOB administrator can change the team page.');
  if nm = '' then raise exception 'Please write the name.'; end if;
  if char_length(nm) > 80 then raise exception 'The name can be at most 80 characters.'; end if;
  if char_length(ql) > 160 then raise exception 'The qualification can be at most 160 characters.'; end if;
  if char_length(ds) > 1200 then raise exception 'The description can be at most 1200 characters.'; end if;
  if ph is not null and (char_length(ph) > 400 or ph like 'data:%') then raise exception 'Please upload the photo as a file.'; end if;
  uid := public.team_resolve_user(p_username);
  if uid is not null and exists (select 1 from public.team_members where user_id = uid and id is distinct from p_id) then
    raise exception 'That account is already on the team page.';
  end if;

  if p_id is null then
    insert into public.team_members (name, qualification, description, photo, position, created_by, user_id)
    values (nm, ql, ds, ph, coalesce((select max(position) from public.team_members), 0) + 1, me, uid)
    returning id into rid;
    perform public.log_admin_action('team_member_added', uid, jsonb_build_object('name', nm));
  else
    update public.team_members set name = nm, qualification = ql, description = ds, photo = ph, user_id = uid, updated_at = now()
    where id = p_id returning id into rid;
    if rid is null then raise exception 'That team member no longer exists.'; end if;
    perform public.log_admin_action('team_member_updated', uid, jsonb_build_object('name', nm));
  end if;
  return jsonb_build_object('success', true, 'id', rid, 'team', public.team_json());
end;
$$;
revoke execute on function public.admin_team_save(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.admin_team_save(uuid, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------- applying (the signed-in person, from the link)
-- Puts an approved application on the page (unless that account is already there). Internal.
create or replace function public.team_publish(p_application uuid, p_decider uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a public.team_page_applications;
begin
  select * into a from public.team_page_applications where id = p_application for update;
  if not found then raise exception 'That application no longer exists.'; end if;
  if not exists (select 1 from public.team_members where user_id = a.user_id) then
    insert into public.team_members (name, qualification, description, photo, position, created_by, user_id)
    values (a.name, a.qualification, a.description, a.photo, coalesce((select max(position) from public.team_members), 0) + 1, p_decider, a.user_id);
  end if;
  update public.team_page_applications set status = 'approved', decided_at = now(), decided_by = p_decider, updated_at = now() where id = a.id;
end;
$$;
revoke execute on function public.team_publish(uuid, uuid) from public, anon, authenticated;

create or replace function public.team_apply(p_name text, p_qualification text, p_description text, p_photo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  nm text := btrim(coalesce(p_name, ''));
  ql text := btrim(coalesce(p_qualification, ''));
  ds text := btrim(coalesce(p_description, ''));
  ph text := nullif(btrim(coalesce(p_photo, '')), '');
  st public.team_settings;
  aid uuid;
  published boolean := false;
begin
  if me is null or (select is_suspended from public.profiles where id = me) is not false then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into st from public.team_settings where id;
  if not st.applications_open then raise exception 'Applications for the team page are closed right now.'; end if;
  if exists (select 1 from public.team_members where user_id = me) then raise exception 'You are already on the Our Team page.'; end if;
  if ph is null then raise exception 'Please add a photo.'; end if;
  if nm = '' then raise exception 'Please write your name.'; end if;
  if char_length(nm) > 80 then raise exception 'The name can be at most 80 characters.'; end if;
  if ql = '' then raise exception 'Please write your qualification.'; end if;
  if char_length(ql) > 160 then raise exception 'The qualification can be at most 160 characters.'; end if;
  if ds = '' then raise exception 'Please write a short description.'; end if;
  if char_length(ds) > 1200 then raise exception 'The description can be at most 1200 characters.'; end if;
  if char_length(ph) > 400 or ph like 'data:%' then raise exception 'Please upload the photo as a file.'; end if;

  insert into public.team_page_applications (user_id, name, qualification, description, photo, status)
  values (me, nm, ql, ds, ph, 'pending')
  on conflict (user_id) do update
    set name = excluded.name, qualification = excluded.qualification, description = excluded.description, photo = excluded.photo,
        status = 'pending', updated_at = now(), decided_at = null, decided_by = null
  returning id into aid;

  if st.auto_publish then
    perform public.team_publish(aid, me);
    published := true;
  end if;
  return jsonb_build_object('success', true, 'status', case when published then 'approved' else 'pending' end);
end;
$$;
revoke execute on function public.team_apply(text, text, text, text) from public, anon;
grant execute on function public.team_apply(text, text, text, text) to authenticated;

-- What the join form needs to know about me: are applications open, am I already on the page, and what I sent before.
create or replace function public.team_my_application() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); a public.team_page_applications; st public.team_settings;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into st from public.team_settings where id;
  select * into a from public.team_page_applications where user_id = me;
  return jsonb_build_object(
    'open', st.applications_open,
    'onTeam', exists (select 1 from public.team_members where user_id = me),
    'application', case when a.id is null then null else jsonb_build_object(
      'status', a.status, 'name', a.name, 'qualification', a.qualification, 'description', a.description, 'photo', a.photo, 'updatedAt', a.updated_at) end
  );
end;
$$;
revoke execute on function public.team_my_application() from public, anon;
grant execute on function public.team_my_application() to authenticated;

-- ---------------------------------------------------------------- admin: applications and settings
create or replace function public.team_admin_json() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'settings', (select jsonb_build_object('open', s.applications_open, 'autoPublish', s.auto_publish) from public.team_settings s where s.id),
    'applications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'userId', a.user_id, 'username', p.username, 'displayName', coalesce(nullif(p.display_name, ''), p.username), 'avatar', p.avatar,
        'name', a.name, 'qualification', a.qualification, 'description', a.description, 'photo', a.photo,
        'status', a.status, 'createdAt', a.created_at, 'decidedAt', a.decided_at,
        'onTeam', exists (select 1 from public.team_members m where m.user_id = a.user_id)
      ) order by (a.status = 'pending') desc, coalesce(a.decided_at, a.created_at) desc)
      from (select * from public.team_page_applications order by (status = 'pending') desc, coalesce(decided_at, created_at) desc limit 60) a
      join public.profiles p on p.id = a.user_id
    ), '[]'::jsonb)
  );
$$;
revoke execute on function public.team_admin_json() from public, anon, authenticated;

create or replace function public.admin_team_page_applications() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_master_admin('Only the main NOOB administrator can see the team applications.');
  return public.team_admin_json();
end;
$$;
revoke execute on function public.admin_team_page_applications() from public, anon;
grant execute on function public.admin_team_page_applications() to authenticated;

create or replace function public.admin_team_settings(p_open boolean default null, p_auto_publish boolean default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_master_admin('Only the main NOOB administrator can change the team page.');
  update public.team_settings set
    applications_open = coalesce(p_open, applications_open),
    auto_publish = coalesce(p_auto_publish, auto_publish),
    updated_at = now()
  where id;
  perform public.log_admin_action('team_settings_changed', null, jsonb_build_object('open', p_open, 'autoPublish', p_auto_publish));
  return public.team_admin_json();
end;
$$;
revoke execute on function public.admin_team_settings(boolean, boolean) from public, anon;
grant execute on function public.admin_team_settings(boolean, boolean) to authenticated;

-- Approve (puts them on the page, tells them) or turn down (tells them, kindly).
create or replace function public.admin_team_decide(p_application uuid, p_approve boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid; a public.team_page_applications; admin_id uuid;
begin
  me := public.require_master_admin('Only the main NOOB administrator can decide on team applications.');
  select * into a from public.team_page_applications where id = p_application for update;
  if not found then raise exception 'That application no longer exists.'; end if;
  if a.status <> 'pending' then raise exception 'That application was already decided.'; end if;
  admin_id := public.noob_admin_id();

  if coalesce(p_approve, false) then
    perform public.team_publish(a.id, me);
    perform public.notify_user(a.user_id, 'admin_direct', admin_id,
      'You are now on the Our Team page, with your photo, name and qualification. Open the Home menu → Our Team to see it.', 'Welcome to the team');
    perform public.log_admin_action('team_application_approved', a.user_id, jsonb_build_object('name', a.name));
  else
    update public.team_page_applications set status = 'rejected', decided_at = now(), decided_by = me, updated_at = now() where id = a.id;
    perform public.notify_user(a.user_id, 'admin_direct', admin_id,
      'Thank you for applying to the Our Team page. We cannot add you right now, but you are always welcome to apply again.', 'About your team page application');
    perform public.log_admin_action('team_application_rejected', a.user_id, jsonb_build_object('name', a.name));
  end if;
  return jsonb_build_object('success', true, 'admin', public.team_admin_json(), 'team', public.team_json());
end;
$$;
revoke execute on function public.admin_team_decide(uuid, boolean) from public, anon;
grant execute on function public.admin_team_decide(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------- removing someone: everything they filled in is erased
-- Erases a person from the team page: their card and their joining form (both halves of the same person, found by account), and their name in
-- the activity log. Only what they filled in goes: their NOOB account, posts, followers and notifications are not touched. Returns the photo
-- files to delete (SQL cannot delete stored files; the app removes them through the Storage API). Internal.
create or replace function public.team_erase(p_member uuid, p_application uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare m public.team_members; a public.team_page_applications; uid uuid; nm text; keys text[];
begin
  if p_member is not null then select * into m from public.team_members where id = p_member for update; end if;
  if p_application is not null then select * into a from public.team_page_applications where id = p_application for update; end if;
  uid := coalesce(m.user_id, a.user_id);
  if m.id is null and uid is not null then select * into m from public.team_members where user_id = uid for update; end if;
  if a.id is null and uid is not null then select * into a from public.team_page_applications where user_id = uid for update; end if;
  if m.id is null and a.id is null then raise exception 'That team member no longer exists.'; end if;
  nm := coalesce(m.name, a.name);
  select coalesce(array_agg(distinct k), '{}') into keys from unnest(array[m.photo, a.photo]) as k where k is not null;

  if m.id is not null then delete from public.team_members where id = m.id; end if;
  if a.id is not null then delete from public.team_page_applications where id = a.id; end if;
  update public.team_members t set position = u.n
  from (select id, row_number() over (order by position, created_at, id) as n from public.team_members) u
  where t.id = u.id;

  -- their name in the older log lines goes too; the log keeps that someone was removed, not who they were
  update public.admin_audit_log set details = coalesce(details, '{}'::jsonb) - 'name'
  where action like 'team\_%' and ((uid is not null and target_id = uid) or details->>'name' = nm);
  perform public.log_admin_action('team_member_removed', uid, '{}'::jsonb);
  return keys;
end;
$$;
revoke execute on function public.team_erase(uuid, uuid) from public, anon, authenticated;

-- Remove a member (from the Members list): the card and, for someone who joined through the form, the form too.
create or replace function public.admin_team_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare keys text[];
begin
  perform public.require_master_admin('Only the main NOOB administrator can change the team page.');
  keys := public.team_erase(p_id, null);
  return jsonb_build_object('success', true, 'removedPhotos', to_jsonb(keys), 'team', public.team_json(), 'admin', public.team_admin_json());
end;
$$;
revoke execute on function public.admin_team_delete(uuid) from public, anon;
grant execute on function public.admin_team_delete(uuid) to authenticated;

-- Delete what someone sent through the form (from the Applications list), whatever its status. If they are on the page, they are removed too.
create or replace function public.admin_team_application_erase(p_application uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare keys text[];
begin
  perform public.require_master_admin('Only the main NOOB administrator can change the team page.');
  keys := public.team_erase(null, p_application);
  return jsonb_build_object('success', true, 'removedPhotos', to_jsonb(keys), 'team', public.team_json(), 'admin', public.team_admin_json());
end;
$$;
revoke execute on function public.admin_team_application_erase(uuid) from public, anon;
grant execute on function public.admin_team_application_erase(uuid) to authenticated;
