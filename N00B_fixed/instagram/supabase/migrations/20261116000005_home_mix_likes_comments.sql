-- Likes and comments on the anonymous thoughts and public polls that are mixed into the Home page.
--
-- Rules are kept HERE, in the database:
--   * the two tables can not be read or written by the app directly; everything goes through the functions below;
--   * one like per person per item (primary key); a like or comment is only accepted on an item that exists and is visible (not removed, not hidden);
--   * a comment shows who wrote it (name + picture) - but nothing here ever reveals who wrote an anonymous thought itself;
--   * limits: comments 1-500 characters, 1 per 5 seconds, 40 per hour; 200 like/unlike actions per hour; suspended accounts can not like or comment;
--   * a comment can be removed by its writer, or by someone who may moderate content.
-- Safe to run more than once. No existing table or function is changed.

create table if not exists public.mix_likes (
  kind text not null check (kind in ('anon', 'poll')),
  target_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (kind, target_id, user_id)
);
create index if not exists mix_likes_user_idx on public.mix_likes (user_id, created_at desc);

create table if not exists public.mix_comments (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('anon', 'poll')),
  target_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
create index if not exists mix_comments_target_idx on public.mix_comments (kind, target_id, created_at desc) where removed_at is null;
create index if not exists mix_comments_user_idx on public.mix_comments (user_id, created_at desc);

alter table public.mix_likes enable row level security;
alter table public.mix_comments enable row level security;
revoke all on public.mix_likes, public.mix_comments from public, anon, authenticated;

-- Is this item there, and visible to everyone?
create or replace function public.mix_target_ok(p_kind text, p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_kind = 'anon' then exists (select 1 from public.anon_messages m where m.id = p_id and m.removed_at is null and not m.hidden)
    when p_kind = 'poll' then exists (select 1 from public.polls p where p.id = p_id and p.removed_at is null and not p.hidden)
    else false end;
$$;
revoke execute on function public.mix_target_ok(text, uuid) from public, anon, authenticated;

-- Numbers for many items at once: { "<id>": { "likes": n, "comments": n, "liked": bool } }
create or replace function public.mix_stats(p_kind text, p_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  res jsonb;
begin
  if p_kind not in ('anon', 'poll') or p_ids is null or cardinality(p_ids) = 0 then return '{}'::jsonb; end if;
  select coalesce(jsonb_object_agg(i.id::text, jsonb_build_object(
      'likes', (select count(*) from public.mix_likes l where l.kind = p_kind and l.target_id = i.id),
      'comments', (select count(*) from public.mix_comments c where c.kind = p_kind and c.target_id = i.id and c.removed_at is null),
      'liked', me is not null and exists (select 1 from public.mix_likes l where l.kind = p_kind and l.target_id = i.id and l.user_id = me))), '{}'::jsonb)
    into res
  from (select distinct x as id from unnest(p_ids[1:60]) x) i;
  return res;
end;
$$;
grant execute on function public.mix_stats(text, uuid[]) to anon, authenticated;

-- Like or unlike.
create or replace function public.mix_like(p_kind text, p_id uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  n int;
begin
  if me is null then raise exception 'Please log in to like this.' using errcode = '28000'; end if;
  if coalesce((select is_suspended from public.profiles where id = me), true) then raise exception 'This account can not like right now.'; end if;
  if not public.mix_target_ok(p_kind, p_id) then raise exception 'That is no longer available.'; end if;
  if coalesce(p_on, true) then
    select count(*) into n from public.mix_likes where user_id = me and created_at > now() - interval '1 hour';
    if n >= 200 then raise exception 'You are liking very fast. Please slow down a little.'; end if;
    insert into public.mix_likes (kind, target_id, user_id) values (p_kind, p_id, me) on conflict do nothing;
  else
    delete from public.mix_likes where kind = p_kind and target_id = p_id and user_id = me;
  end if;
  return jsonb_build_object('liked', coalesce(p_on, true), 'likes', (select count(*) from public.mix_likes l where l.kind = p_kind and l.target_id = p_id));
end;
$$;
revoke execute on function public.mix_like(text, uuid, boolean) from public, anon;
grant execute on function public.mix_like(text, uuid, boolean) to authenticated;

-- One comment as the app gets it.
create or replace function public.mix_comment_json(c public.mix_comments) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', c.id, 'body', c.body, 'createdAt', c.created_at,
    'user', jsonb_build_object('userId', u.id, 'username', u.username, 'displayName', coalesce(nullif(u.display_name, ''), u.username), 'avatar', u.avatar, 'isVerified', u.is_verified),
    'mine', c.user_id is not distinct from auth.uid())
  from public.profiles u where u.id = c.user_id;
$$;
revoke execute on function public.mix_comment_json(public.mix_comments) from public, anon, authenticated;

-- The comments of one item, oldest first, a page at a time.
create or replace function public.mix_comments_list(p_kind text, p_id uuid, p_limit int default 30, p_after timestamptz default null, p_after_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  lim int := least(greatest(coalesce(p_limit, 30), 1), 60);
  rows jsonb := '[]'::jsonb;
  n int := 0;
  r public.mix_comments;
begin
  if not public.mix_target_ok(p_kind, p_id) then return jsonb_build_object('comments', '[]'::jsonb, 'hasMore', false); end if;
  for r in
    select * from public.mix_comments c
    where c.kind = p_kind and c.target_id = p_id and c.removed_at is null
      and (p_after is null or (c.created_at, c.id) > (p_after, coalesce(p_after_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    order by c.created_at, c.id
    limit lim + 1
  loop
    n := n + 1;
    if n <= lim then rows := rows || jsonb_build_array(public.mix_comment_json(r)); end if;
  end loop;
  return jsonb_build_object('comments', rows, 'hasMore', n > lim);
end;
$$;
grant execute on function public.mix_comments_list(text, uuid, int, timestamptz, uuid) to anon, authenticated;

-- Write a comment.
create or replace function public.mix_comment_add(p_kind text, p_id uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  clean text := public.fun_clean_text(p_body);
  n int;
  c public.mix_comments;
begin
  if me is null then raise exception 'Please log in to comment.' using errcode = '28000'; end if;
  if coalesce((select is_suspended from public.profiles where id = me), true) then raise exception 'This account can not comment right now.'; end if;
  if not public.mix_target_ok(p_kind, p_id) then raise exception 'That is no longer available.'; end if;
  if clean = '' then raise exception 'Write a comment first.'; end if;
  if char_length(clean) > 500 then raise exception 'A comment can be at most 500 characters.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('mix_comment:' || me::text, 0));
  if exists (select 1 from public.mix_comments where user_id = me and created_at > now() - interval '5 seconds') then raise exception 'Please wait a moment before commenting again.'; end if;
  select count(*) into n from public.mix_comments where user_id = me and created_at > now() - interval '1 hour';
  if n >= 40 then raise exception 'You have commented a lot just now. Please try again a little later.'; end if;
  insert into public.mix_comments (kind, target_id, user_id, body) values (p_kind, p_id, me, clean) returning * into c;
  return public.mix_comment_json(c);
end;
$$;
revoke execute on function public.mix_comment_add(text, uuid, text) from public, anon;
grant execute on function public.mix_comment_add(text, uuid, text) to authenticated;

-- Remove a comment: its writer, or someone who may moderate content.
create or replace function public.mix_comment_remove(p_comment uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  c public.mix_comments;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into c from public.mix_comments where id = p_comment and removed_at is null;
  if not found then raise exception 'That comment is no longer there.'; end if;
  if c.user_id is distinct from me and not public.fun_can_manage() then raise exception 'You can only remove your own comments.' using errcode = '42501'; end if;
  update public.mix_comments set removed_at = now() where id = c.id;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.mix_comment_remove(uuid) from public, anon;
grant execute on function public.mix_comment_remove(uuid) to authenticated;
