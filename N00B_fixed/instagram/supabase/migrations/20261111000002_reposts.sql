-- NOOB — Repost: share someone else's post / reel / story onto your own profile (a "Reposts" tab).
-- Only adds a new table + functions; nothing existing is changed. A repost is a pointer to the original
-- (no media is copied), so it disappears if the original is deleted (on delete cascade not possible across
-- three tables, so user_reposts simply skips pointers whose original is gone).

create table if not exists public.reposts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('post', 'reel', 'story')),
  content_id  uuid not null,
  created_at  timestamptz not null default now(),
  unique (user_id, kind, content_id)
);
create index if not exists reposts_user_idx on public.reposts (user_id, created_at desc);
create index if not exists reposts_content_idx on public.reposts (kind, content_id);
alter table public.reposts enable row level security;
-- no direct table access: everything goes through the functions below

create or replace function public.toggle_repost(p_kind text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); owner uuid; n integer; done boolean;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if p_kind = 'post' then select user_id into owner from public.posts where id = p_id and not is_archived;
  elsif p_kind = 'reel' then select user_id into owner from public.reels where id = p_id;
  elsif p_kind = 'story' then select user_id into owner from public.stories where id = p_id and expires_at > now();
  else raise exception 'Unknown kind'; end if;
  if owner is null then raise exception 'This is no longer available.'; end if;
  if owner = me then raise exception 'You cannot repost your own content.' using errcode = '42501'; end if;
  if not public.can_view_author(owner) then raise exception 'You cannot see this.' using errcode = '42501'; end if;
  if exists (select 1 from public.reposts where user_id = me and kind = p_kind and content_id = p_id) then
    delete from public.reposts where user_id = me and kind = p_kind and content_id = p_id;
    done := false;
  else
    insert into public.reposts (user_id, kind, content_id) values (me, p_kind, p_id);
    done := true;
  end if;
  select count(*) into n from public.reposts where kind = p_kind and content_id = p_id;
  return jsonb_build_object('success', true, 'isReposted', done, 'count', n);
end;
$$;

create or replace function public.repost_state(p_kind text, p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'isReposted', exists (select 1 from public.reposts where user_id = auth.uid() and kind = p_kind and content_id = p_id),
    'count', (select count(*) from public.reposts where kind = p_kind and content_id = p_id));
$$;

-- What a person has reposted (newest first). Hidden when the viewer cannot see that person, and any original
-- the viewer cannot see (blocked / private / archived / expired) is left out.
create or replace function public.user_reposts(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb := '[]'::jsonb; r record; item jsonb; owner uuid;
begin
  if auth.uid() is null then return out; end if;
  if p_user is distinct from auth.uid() and not public.can_view_author(p_user) then return out; end if;
  for r in select kind, content_id, created_at from public.reposts where user_id = p_user order by created_at desc limit 60 loop
    item := null; owner := null;
    if r.kind = 'post' then
      select user_id into owner from public.posts where id = r.content_id and not is_archived;
      if owner is not null and (owner = auth.uid() or public.can_view_author(owner)) then
        select public.post_json(p) into item from public.posts p where p.id = r.content_id;
      end if;
    elsif r.kind = 'reel' then
      select user_id into owner from public.reels where id = r.content_id;
      if owner is not null and (owner = auth.uid() or public.can_view_author(owner)) then
        select public.reel_json(x) into item from public.reels x where x.id = r.content_id;
      end if;
    else
      select user_id into owner from public.stories where id = r.content_id and expires_at > now();
      if owner is not null and (owner = auth.uid() or public.can_view_author(owner)) then
        select public.story_json(s) into item from public.stories s where s.id = r.content_id;
      end if;
    end if;
    if item is not null then out := out || jsonb_build_array(jsonb_build_object('kind', r.kind, 'at', r.created_at, 'item', item)); end if;
  end loop;
  return out;
end;
$$;

grant execute on function public.toggle_repost(text, uuid) to authenticated;
grant execute on function public.repost_state(text, uuid) to authenticated;
grant execute on function public.user_reposts(uuid) to authenticated;
