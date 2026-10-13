-- NOOB STUDY, part 7: study rooms. A small private group (up to 8 friends) with a shared goal and an invite code. Nothing about a student is shared with the room
-- unless they switch it on: their minutes this week and "I am focusing now" are both OFF by default, and each can be turned off again at any time.
-- There is no free text chat here (NOOB's own chat is for that): only a few kind, fixed cheers, so a room can never be used to be unkind.
-- Safe to run more than once.

create table if not exists public.study_rooms (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.study_profiles(user_id),
  name        text not null check (char_length(name) between 1 and 60),
  topic       text not null default '' check (char_length(topic) <= 100),
  goal        text not null default '' check (char_length(goal) <= 200),
  goal_minutes integer check (goal_minutes is null or goal_minutes between 30 and 6000),
  code        text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.study_rooms enable row level security;

create table if not exists public.study_room_members (
  room_id       uuid not null references public.study_rooms(id) on delete cascade,
  user_id       uuid not null references public.study_profiles(user_id) on delete cascade,
  role          text not null default 'member' check (role in ('owner', 'member')),
  share_minutes boolean not null default false,
  share_status  boolean not null default false,
  joined_at     timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists study_room_members_user_idx on public.study_room_members (user_id);
alter table public.study_room_members enable row level security;

create table if not exists public.study_room_cheers (
  id         bigint generated always as identity primary key,
  room_id    uuid not null references public.study_rooms(id) on delete cascade,
  from_user  uuid not null references public.study_profiles(user_id) on delete cascade,
  to_user    uuid references public.study_profiles(user_id) on delete cascade,
  kind       text not null check (kind in ('cheer', 'proud', 'break', 'start')),
  created_at timestamptz not null default now()
);
create index if not exists study_room_cheers_room_idx on public.study_room_cheers (room_id, created_at desc);
create index if not exists study_room_cheers_from_idx on public.study_room_cheers (from_user, created_at desc);
alter table public.study_room_cheers enable row level security;

-- guesses at invite codes (so a code can not be found by trying many)
create table if not exists public.study_room_tries (
  id      bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists study_room_tries_idx on public.study_room_tries (user_id, at desc);
alter table public.study_room_tries enable row level security;

-- ---------------------------------------------------------------- helpers
create or replace function public.study_int_room_code() returns text
language plpgsql volatile security definer set search_path = public as $$
declare chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i integer; tries integer := 0;
begin
  loop
    c := '';
    for i in 1..6 loop c := c || substr(chars, 1 + floor(random() * length(chars))::integer, 1); end loop;
    exit when not exists (select 1 from public.study_rooms where code = c);
    tries := tries + 1;
    if tries > 50 then raise exception 'Could not make a room code. Please try again.'; end if;
  end loop;
  return c;
end;
$$;

create or replace function public.study_int_in_room(p_user uuid, p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.study_room_members where room_id = p_room and user_id = p_user);
$$;

-- the room goes to its longest-standing other member; a room with nobody else is closed
create or replace function public.study_int_room_handover(p_room uuid, p_leaving uuid) returns void
language plpgsql security definer set search_path = public as $$
declare nxt uuid;
begin
  select user_id into nxt from public.study_room_members where room_id = p_room and user_id <> p_leaving order by joined_at, user_id limit 1;
  if nxt is null then
    delete from public.study_rooms where id = p_room;
  else
    update public.study_rooms set owner_id = nxt, updated_at = now() where id = p_room;
    update public.study_room_members set role = 'owner' where room_id = p_room and user_id = nxt;
  end if;
end;
$$;

-- when a student's study profile goes (they erased everything, or deleted their account), the rooms they own pass to someone else or close
create or replace function public.study_int_rooms_before_profile_delete() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.study_rooms where owner_id = old.user_id loop
    perform public.study_int_room_handover(r.id, old.user_id);
  end loop;
  return old;
end;
$$;
drop trigger if exists study_rooms_profile_delete on public.study_profiles;
create trigger study_rooms_profile_delete before delete on public.study_profiles for each row execute function public.study_int_rooms_before_profile_delete();

create or replace function public.study_int_name(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(display_name), ''), username) from public.profiles where id = p_user;
$$;

-- ---------------------------------------------------------------- rooms
create or replace function public.study_room_create(p_name text, p_topic text, p_goal text, p_goal_minutes integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); r public.study_rooms; nm text := left(btrim(coalesce(p_name, '')), 60);
begin
  perform public.study_int_require_feature(me, 'rooms');
  if nm = '' then raise exception 'Please give your room a name.'; end if;
  if p_goal_minutes is not null and (p_goal_minutes < 30 or p_goal_minutes > 6000) then raise exception 'A weekly goal can be between 30 minutes and 100 hours.'; end if;
  perform public.study_int_ensure_profile(me);
  perform 1 from public.study_profiles where user_id = me for update;
  if (select count(*) from public.study_rooms where owner_id = me) >= 5 then raise exception 'You already run 5 rooms. Please close one first.'; end if;
  if (select count(*) from public.study_room_members where user_id = me) >= 10 then raise exception 'You are in 10 rooms already. Please leave one first.'; end if;
  insert into public.study_rooms (owner_id, name, topic, goal, goal_minutes, code)
  values (me, nm, left(btrim(coalesce(p_topic, '')), 100), left(btrim(coalesce(p_goal, '')), 200), p_goal_minutes, public.study_int_room_code()) returning * into r;
  insert into public.study_room_members (room_id, user_id, role) values (r.id, me, 'owner');
  return jsonb_build_object('id', r.id, 'name', r.name, 'code', r.code);
end;
$$;

-- Joining by code. A wrong guess is answered with {success:false, error:...} (not an error), so the guess is remembered: after 15 wrong guesses in an hour
-- the student has to wait, and an invite code can not be found by trying many.
create or replace function public.study_room_join(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); c text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')); r public.study_rooms;
begin
  perform public.study_int_require_feature(me, 'rooms');
  if (select count(*) from public.study_room_tries where user_id = me and at > now() - interval '1 hour') >= 15 then
    return jsonb_build_object('success', false, 'error', 'That is a lot of tries. Please wait a little and then try again.');
  end if;
  if length(c) <> 6 then
    insert into public.study_room_tries (user_id) values (me);
    return jsonb_build_object('success', false, 'error', 'That code does not look right. It has 6 letters and numbers.');
  end if;
  select * into r from public.study_rooms where code = c;
  if not found then
    insert into public.study_room_tries (user_id) values (me);
    return jsonb_build_object('success', false, 'error', 'No room has that code. Please check it with your friend.');
  end if;
  perform public.study_int_ensure_profile(me);
  perform 1 from public.study_rooms where id = r.id for update;
  if public.study_int_in_room(me, r.id) then return jsonb_build_object('success', true, 'id', r.id, 'name', r.name, 'already', true); end if;
  if (select count(*) from public.study_room_members where room_id = r.id) >= 8 then return jsonb_build_object('success', false, 'error', 'This room is full (8 people).'); end if;
  if (select count(*) from public.study_room_members where user_id = me) >= 10 then return jsonb_build_object('success', false, 'error', 'You are in 10 rooms already. Please leave one first.'); end if;
  insert into public.study_room_members (room_id, user_id) values (r.id, me);
  return jsonb_build_object('success', true, 'id', r.id, 'name', r.name, 'already', false);
end;
$$;

create or replace function public.study_rooms_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.study_int_uid();
begin
  perform public.study_int_require_feature(me, 'rooms');
  return jsonb_build_object('rooms', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'topic', r.topic, 'goal', r.goal, 'role', m.role,
      'members', (select count(*) from public.study_room_members x where x.room_id = r.id)) order by r.created_at desc)
    from public.study_room_members m join public.study_rooms r on r.id = m.room_id where m.user_id = me), '[]'::jsonb));
end;
$$;

-- One room, as a member sees it. Another member's minutes appear only if THEY chose to share them; "focusing now" only if they chose to show it.
create or replace function public.study_room_get(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); r public.study_rooms; mine public.study_room_members; members jsonb; total bigint; shared integer; cheers jsonb;
begin
  perform public.study_int_require_feature(me, 'rooms');
  select * into mine from public.study_room_members where room_id = p_id and user_id = me;
  if not found then raise exception 'You are not in this room.'; end if;
  select * into r from public.study_rooms where id = p_id;
  select coalesce(jsonb_agg(x.j order by x.rk, x.joined_at, x.uid), '[]'::jsonb), coalesce(sum(x.mins) filter (where x.counted), 0), count(*) filter (where x.counted)
    into members, total, shared
  from (
    select m.user_id as uid, m.joined_at, case when m.role = 'owner' then 0 else 1 end as rk,
           (m.user_id = me or m.share_minutes) as counted,
           case when m.user_id = me or m.share_minutes then w.mins else 0 end as mins,
           jsonb_build_object('userId', m.user_id, 'username', p.username, 'displayName', public.study_int_name(m.user_id),
             'avatar', case when length(p.avatar) <= 500 then p.avatar else null end, 'role', m.role, 'isMe', m.user_id = me,
             'sharesMinutes', m.share_minutes,
             'minutes', case when m.user_id = me or m.share_minutes then w.mins else null end,
             'studyingNow', case when m.user_id = me or m.share_status then exists (select 1 from public.study_focus_sessions f where f.user_id = m.user_id and f.status = 'running' and f.kind = 'focus'
                                    and f.started_at > now() - (f.planned_min + 10) * interval '1 minute') else null end) as j
    from public.study_room_members m join public.profiles p on p.id = m.user_id
    left join lateral (select coalesce(sum(e.minutes), 0)::integer as mins from public.study_events e where e.user_id = m.user_id and e.kind in ('focus_done', 'session_done') and e.created_at >= now() - interval '7 days') w on true
    where m.room_id = p_id
  ) x;
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'from', public.study_int_name(c.from_user), 'to', case when c.to_user is null then null else public.study_int_name(c.to_user) end,
      'mine', c.from_user = me, 'toMe', c.to_user = me, 'at', c.created_at) order by c.created_at desc), '[]'::jsonb) into cheers
  from (select * from public.study_room_cheers where room_id = p_id and created_at > now() - interval '7 days' order by created_at desc limit 12) c;
  return jsonb_build_object('room', jsonb_build_object('id', r.id, 'name', r.name, 'topic', r.topic, 'goal', r.goal, 'goalMinutes', r.goal_minutes,
      'code', case when mine.role = 'owner' then r.code else null end, 'role', mine.role, 'memberCount', jsonb_array_length(members), 'maxMembers', 8),
    'members', members, 'totalMinutes', total, 'sharingCount', shared,
    'me', jsonb_build_object('shareMinutes', mine.share_minutes, 'shareStatus', mine.share_status), 'cheers', cheers);
end;
$$;

create or replace function public.study_room_settings(p_id uuid, p_share_minutes boolean, p_share_status boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); m public.study_room_members;
begin
  update public.study_room_members set share_minutes = coalesce(p_share_minutes, share_minutes), share_status = coalesce(p_share_status, share_status)
  where room_id = p_id and user_id = me returning * into m;
  if not found then raise exception 'You are not in this room.'; end if;
  return jsonb_build_object('shareMinutes', m.share_minutes, 'shareStatus', m.share_status);
end;
$$;

create or replace function public.study_room_update(p_id uuid, p_name text, p_topic text, p_goal text, p_goal_minutes integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); nm text := left(btrim(coalesce(p_name, '')), 60); r public.study_rooms;
begin
  if not exists (select 1 from public.study_rooms where id = p_id and owner_id = me) then raise exception 'Only the person who made the room can change it.'; end if;
  if nm = '' then raise exception 'Please give your room a name.'; end if;
  if p_goal_minutes is not null and (p_goal_minutes < 30 or p_goal_minutes > 6000) then raise exception 'A weekly goal can be between 30 minutes and 100 hours.'; end if;
  update public.study_rooms set name = nm, topic = left(btrim(coalesce(p_topic, '')), 100), goal = left(btrim(coalesce(p_goal, '')), 200), goal_minutes = p_goal_minutes, updated_at = now()
  where id = p_id returning * into r;
  return jsonb_build_object('id', r.id, 'name', r.name);
end;
$$;

create or replace function public.study_room_regenerate_code(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); c text;
begin
  if not exists (select 1 from public.study_rooms where id = p_id and owner_id = me) then raise exception 'Only the person who made the room can change its code.'; end if;
  c := public.study_int_room_code();
  update public.study_rooms set code = c, updated_at = now() where id = p_id;
  return jsonb_build_object('code', c);
end;
$$;

create or replace function public.study_room_remove_member(p_id uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); n integer;
begin
  if not exists (select 1 from public.study_rooms where id = p_id and owner_id = me) then raise exception 'Only the person who made the room can remove someone.'; end if;
  if p_user = me then raise exception 'To leave your own room, use "Leave the room".'; end if;
  delete from public.study_room_members where room_id = p_id and user_id = p_user;
  get diagnostics n = row_count;
  return jsonb_build_object('success', true, 'removed', n > 0);
end;
$$;

create or replace function public.study_room_leave(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); own uuid;
begin
  select owner_id into own from public.study_rooms where id = p_id for update;
  if not found or not public.study_int_in_room(me, p_id) then return jsonb_build_object('success', true, 'left', false); end if;
  if own = me then perform public.study_int_room_handover(p_id, me); end if;
  delete from public.study_room_members where room_id = p_id and user_id = me;
  return jsonb_build_object('success', true, 'left', true);
end;
$$;

create or replace function public.study_room_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); n integer;
begin
  delete from public.study_rooms where id = p_id and owner_id = me;
  get diagnostics n = row_count;
  return jsonb_build_object('success', true, 'deleted', n > 0);
end;
$$;

-- a few kind, fixed words to a friend in the room (or to everyone); at most 20 a day
create or replace function public.study_room_cheer(p_id uuid, p_to uuid, p_kind text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid();
begin
  if p_kind not in ('cheer', 'proud', 'break', 'start') then raise exception 'That cheer is not known.'; end if;
  if not public.study_int_in_room(me, p_id) then raise exception 'You are not in this room.'; end if;
  if p_to is not null and p_to = me then raise exception 'Cheer a friend, not yourself.'; end if;
  if p_to is not null and not public.study_int_in_room(p_to, p_id) then raise exception 'That person is not in this room.'; end if;
  if (select count(*) from public.study_room_cheers where from_user = me and created_at > now() - interval '1 day') >= 20 then raise exception 'That is plenty of cheers for today. Thank you for being kind.'; end if;
  insert into public.study_room_cheers (room_id, from_user, to_user, kind) values (p_id, me, p_to, p_kind);
  return jsonb_build_object('success', true);
end;
$$;

-- ---------------------------------------------------------------- who may call what
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig, p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'study\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    if r.proname like 'study\_svc\_%' then execute format('grant execute on function %s to service_role', r.sig);
    elsif r.proname not like 'study\_int\_%' then execute format('grant execute on function %s to authenticated', r.sig);
    end if;
  end loop;
end;
$$;
