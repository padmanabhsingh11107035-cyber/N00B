-- NOOB's own posts on the Home page (3D models and pictures that live in the app itself, not in storage): people can like, comment, save and repost them, but nobody can publish one.
--
-- What is stored here is only the small counters: one row per like / comment / save / repost. The models and pictures are NOT stored anywhere on the server (they ship with the app), so they use no storage space.
-- A "featured" item is known by a fixed id (f0f0f0f0-0000-4000-8000-0000000000NN, NN = 01..ff) written in the app's code; the database accepts only that id range, so nothing else can be attached to it.
-- There is no way for a user to create such an item: no table of items exists, and no function here adds one.
-- Safe to run more than once. Likes and comments of thoughts and polls are not changed.

alter table public.mix_likes drop constraint if exists mix_likes_kind_check;
alter table public.mix_likes add constraint mix_likes_kind_check check (kind in ('anon', 'poll', 'featured'));
alter table public.mix_comments drop constraint if exists mix_comments_kind_check;
alter table public.mix_comments add constraint mix_comments_kind_check check (kind in ('anon', 'poll', 'featured'));

create table if not exists public.mix_saves (
  kind text not null check (kind = 'featured'),
  target_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (kind, target_id, user_id)
);
create index if not exists mix_saves_user_idx on public.mix_saves (user_id, created_at desc);

create table if not exists public.mix_reposts (
  kind text not null check (kind = 'featured'),
  target_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (kind, target_id, user_id)
);
create index if not exists mix_reposts_user_idx on public.mix_reposts (user_id, created_at desc);

alter table public.mix_saves enable row level security;
alter table public.mix_reposts enable row level security;
revoke all on public.mix_saves, public.mix_reposts from public, anon, authenticated;

-- Is this item there, and visible to everyone? (a featured item: only the fixed id range)
create or replace function public.mix_target_ok(p_kind text, p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_kind = 'anon' then exists (select 1 from public.anon_messages m where m.id = p_id and m.removed_at is null and not m.hidden)
    when p_kind = 'poll' then exists (select 1 from public.polls p where p.id = p_id and p.removed_at is null and not p.hidden)
    when p_kind = 'featured' then p_id::text ~ '^f0f0f0f0-0000-4000-8000-0000000000[0-9a-f]{2}$' and p_id::text <> 'f0f0f0f0-0000-4000-8000-000000000000'
    else false end;
$$;
revoke execute on function public.mix_target_ok(text, uuid) from public, anon, authenticated;

-- Numbers for many items at once: { "<id>": { "likes", "comments", "liked", "reposts", "saved", "reposted" } }
create or replace function public.mix_stats(p_kind text, p_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  res jsonb;
begin
  if p_kind not in ('anon', 'poll', 'featured') or p_ids is null or cardinality(p_ids) = 0 then return '{}'::jsonb; end if;
  select coalesce(jsonb_object_agg(i.id::text, jsonb_build_object(
      'likes', (select count(*) from public.mix_likes l where l.kind = p_kind and l.target_id = i.id),
      'comments', (select count(*) from public.mix_comments c where c.kind = p_kind and c.target_id = i.id and c.removed_at is null),
      'liked', me is not null and exists (select 1 from public.mix_likes l where l.kind = p_kind and l.target_id = i.id and l.user_id = me),
      'reposts', (select count(*) from public.mix_reposts r where r.kind = p_kind and r.target_id = i.id),
      'saved', me is not null and exists (select 1 from public.mix_saves s where s.kind = p_kind and s.target_id = i.id and s.user_id = me),
      'reposted', me is not null and exists (select 1 from public.mix_reposts r where r.kind = p_kind and r.target_id = i.id and r.user_id = me))), '{}'::jsonb)
    into res
  from (select distinct x as id from unnest(p_ids[1:60]) x) i;
  return res;
end;
$$;
grant execute on function public.mix_stats(text, uuid[]) to anon, authenticated;

-- Save or unsave one featured item (a private bookmark: nobody else sees it).
create or replace function public.mix_save(p_kind text, p_id uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  n int;
begin
  if me is null then raise exception 'Please log in to save this.' using errcode = '28000'; end if;
  if coalesce((select is_suspended from public.profiles where id = me), true) then raise exception 'This account can not save right now.'; end if;
  if p_kind <> 'featured' or not public.mix_target_ok(p_kind, p_id) then raise exception 'That is no longer available.'; end if;
  if coalesce(p_on, true) then
    select count(*) into n from public.mix_saves where user_id = me and created_at > now() - interval '1 hour';
    if n >= 200 then raise exception 'You are saving very fast. Please slow down a little.'; end if;
    insert into public.mix_saves (kind, target_id, user_id) values (p_kind, p_id, me) on conflict do nothing;
  else
    delete from public.mix_saves where kind = p_kind and target_id = p_id and user_id = me;
  end if;
  return jsonb_build_object('on', coalesce(p_on, true));
end;
$$;
revoke execute on function public.mix_save(text, uuid, boolean) from public, anon;
grant execute on function public.mix_save(text, uuid, boolean) to authenticated;

-- Repost or undo the repost of one featured item (the number of reposts is shown on the item).
create or replace function public.mix_repost(p_kind text, p_id uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  n int;
begin
  if me is null then raise exception 'Please log in to repost this.' using errcode = '28000'; end if;
  if coalesce((select is_suspended from public.profiles where id = me), true) then raise exception 'This account can not repost right now.'; end if;
  if p_kind <> 'featured' or not public.mix_target_ok(p_kind, p_id) then raise exception 'That is no longer available.'; end if;
  if coalesce(p_on, true) then
    select count(*) into n from public.mix_reposts where user_id = me and created_at > now() - interval '1 hour';
    if n >= 200 then raise exception 'You are reposting very fast. Please slow down a little.'; end if;
    insert into public.mix_reposts (kind, target_id, user_id) values (p_kind, p_id, me) on conflict do nothing;
  else
    delete from public.mix_reposts where kind = p_kind and target_id = p_id and user_id = me;
  end if;
  return jsonb_build_object('on', coalesce(p_on, true), 'reposts', (select count(*) from public.mix_reposts r where r.kind = p_kind and r.target_id = p_id));
end;
$$;
revoke execute on function public.mix_repost(text, uuid, boolean) from public, anon;
grant execute on function public.mix_repost(text, uuid, boolean) to authenticated;
