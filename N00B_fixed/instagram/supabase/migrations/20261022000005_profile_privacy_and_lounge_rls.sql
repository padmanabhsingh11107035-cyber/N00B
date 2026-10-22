-- Two fixes found by the security check (nothing else changes for anybody):
--
-- 1. PROFILE PRIVACY. Every logged-in person could read the whole profiles row of every other person, which included when somebody's NOOB Pro renews, how they pay for it
--    (monthly / yearly, automatic renewal) and which shop items they bought. Those four columns can now be read only by the database's own functions (the ones that
--    run Pro, the shop and the person's own profile) and so only ever reach the person they belong to (get_my_user) and the admin (admin_user_json).
--    Because a "whole row" can no longer be handed around by an ordinary function, the few functions that did that now ask for a person by id instead.
--    Reminder for later migrations: a NEW column of profiles is not readable by logged-in people until it is granted (grant select (new_column) on public.profiles to
--    authenticated); scripts/security-audit-db.mjs fails until that is done, so it cannot be forgotten.
-- 2. LIVE LOUNGE. The rules of its three tables looked at each other (the rooms' rule asks the participants table, whose rule asks the rooms table again), so any read of
--    them by a logged-in person failed with "infinite recursion detected in policy". That also stopped the database's live updates for them (the app refreshed on a timer
--    instead). The questions "am I the host / in the room / admitted" are now asked by small functions that look at the tables without going through their rules.
--    Who can see what is exactly as before.

-- ============================================================================================================== 2. Live Lounge
create or replace function public.lounge_is_host(p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.live_lounge_rooms r where r.id = p_room and r.host_id = auth.uid());
$$;
create or replace function public.lounge_is_member(p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.live_lounge_room_participants p where p.room_id = p_room and p.user_id = auth.uid());
$$;
create or replace function public.lounge_is_admitted(p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.live_lounge_room_participants p where p.room_id = p_room and p.user_id = auth.uid() and p.status = 'admitted');
$$;
revoke execute on function public.lounge_is_host(uuid), public.lounge_is_member(uuid), public.lounge_is_admitted(uuid) from public, anon;
grant execute on function public.lounge_is_host(uuid), public.lounge_is_member(uuid), public.lounge_is_admitted(uuid) to authenticated;

drop policy if exists live_lounge_room_participants_read on public.live_lounge_room_participants;
create policy live_lounge_room_participants_read on public.live_lounge_room_participants for select using (
  user_id = auth.uid() or public.lounge_is_host(room_id)
);
drop policy if exists live_lounge_rooms_read on public.live_lounge_rooms;
create policy live_lounge_rooms_read on public.live_lounge_rooms for select using (
  host_id = auth.uid() or public.lounge_is_member(id)
);
drop policy if exists live_lounge_room_chat_read on public.live_lounge_room_chat;
create policy live_lounge_room_chat_read on public.live_lounge_room_chat for select using (
  public.lounge_is_admitted(room_id) or public.lounge_is_host(room_id)
);
-- Like every table, these three were closed to logged-in people altogether (the app reads them through functions), which is also why the database's live updates for them never
-- arrived: a live update is only sent to somebody who may read the row. Reading is now allowed, but the rules above still decide which rows: the host sees their rooms, everyone
-- who joined and the chat; a person sees the rooms they are in and their own place; the chat is for the host and admitted people only. Writing stays closed (functions only).
grant select on public.live_lounge_rooms, public.live_lounge_room_participants, public.live_lounge_room_chat to authenticated;

-- ============================================================================================================== 1. Profile privacy
-- a person (or one row of a list) by id, built with the database's own rights: the same answer the functions gave before, without handing a whole profiles row to a caller
create or replace function public.user_public_json_by_id(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select public.user_public_json(pr) from public.profiles pr where pr.id = p_id;
$$;
create or replace function public.user_list_json_by_id(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select public.user_list_json(pr) from public.profiles pr where pr.id = p_id;
$$;
revoke execute on function public.user_public_json_by_id(uuid), public.user_list_json_by_id(uuid) from public, anon;
grant execute on function public.user_public_json_by_id(uuid), public.user_list_json_by_id(uuid) to authenticated;

create or replace function public.search_users(p_search text default '') returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(
           case when x.pin is not null then public.user_public_json_by_id(x.id) || jsonb_build_object('pinned', true)
                else public.user_public_json_by_id(x.id) end
           order by x.pin desc nulls last, x.created_at desc), '[]'::jsonb)
  from (
    select pr.id, pr.created_at, public.explore_pinned_at(pr.id) as pin from public.profiles pr
    where (btrim(coalesce(p_search, '')) = ''
       or pr.username ilike '%' || btrim(p_search) || '%'
       or pr.display_name ilike '%' || btrim(p_search) || '%'
       or pr.bio ilike '%' || btrim(p_search) || '%')
      and not public.is_hidden_from_me(pr.id)
    order by public.explore_pinned_at(pr.id) desc nulls last, pr.created_at desc limit 300
  ) x;
$$;

create or replace function public.user_by_id(p_id uuid) returns jsonb
language sql stable set search_path = public as $$
  select public.user_public_json_by_id(pr.id) from public.profiles pr
  where pr.id = p_id and not public.is_hidden_from_me(pr.id);
$$;

create or replace function public.post_likers(p_post uuid) returns jsonb
language plpgsql stable set search_path = public as $$
begin
  if not exists (select 1 from public.posts where id = p_post) then raise exception 'You cannot view this post.' using errcode = '42501'; end if;
  return jsonb_build_object('users', coalesce((
    select jsonb_agg(public.user_list_json_by_id(pr.id) order by l.created_at desc)
    from public.post_likes l join public.profiles pr on pr.id = l.user_id where l.post_id = p_post), '[]'::jsonb));
end;
$$;

create or replace function public.reel_likers(p_reel uuid) returns jsonb
language plpgsql stable set search_path = public as $$
begin
  if not exists (select 1 from public.reels where id = p_reel) then raise exception 'You cannot view this reel.' using errcode = '42501'; end if;
  return jsonb_build_object('users', coalesce((
    select jsonb_agg(public.user_list_json_by_id(pr.id) order by l.created_at desc)
    from public.reel_likes l join public.profiles pr on pr.id = l.user_id where l.reel_id = p_reel), '[]'::jsonb));
end;
$$;

-- the person's own full record (it includes their own Pro and shop details): everything in it is filtered to the person themselves (where p.id = auth.uid()), so it can run with the database's rights
alter function public.get_my_user() security definer;

-- the four columns are no longer readable by logged-in people; every other column is, exactly as before
revoke select on public.profiles from authenticated;
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles'
     and column_name not in ('pro_billing', 'pro_auto_renew', 'pro_renews_at', 'purchased_item_ids');
  execute 'grant select (' || cols || ') on public.profiles to authenticated';
end $$;
