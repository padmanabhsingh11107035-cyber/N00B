-- NOOB Rooms + Live Lounge: someone who closes the app / the tab without tapping Leave is taken out of the room by themselves.
--
-- Until now the only thing that removed a person from a room was tapping Leave. Closing the app or the tab never told the database,
-- so that person stayed in the headcount for good. Now every person in a room sends a small "I am still here" signal every few
-- seconds, and anyone who has been silent for 75 seconds is removed (the app also removes them straight away when the page closes
-- normally). Existing rows, people and rooms are not changed: one new column on each participants table, new functions, and updated
-- versions of the functions that count or list people.
--
-- NOOB Rooms (public voice rooms)

alter table public.noob_room_participants add column if not exists last_seen_at timestamptz not null default now();
create index if not exists noob_room_participants_seen_idx on public.noob_room_participants (last_seen_at);

-- Internal: removes everyone who went quiet, and ends a room that a person created once the last person has gone (the always-on
-- default rooms have no host and never end), the same rule leave_noob_room already uses. Not callable from the app.
create or replace function public.sweep_noob_rooms(p_room_id uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare rids uuid[];
begin
  with gone as (
    delete from public.noob_room_participants
    where last_seen_at < now() - interval '75 seconds' and (p_room_id is null or room_id = p_room_id)
    returning room_id
  )
  select coalesce(array_agg(distinct room_id), '{}') into rids from gone;
  if array_length(rids, 1) is null then return; end if;
  update public.noob_rooms r set status = 'ended', ended_at = now()
  where r.id = any(rids) and r.status = 'live' and r.host_id is not null
    and not exists (select 1 from public.noob_room_participants p where p.room_id = r.id);
end;
$$;
revoke execute on function public.sweep_noob_rooms(uuid) from public, anon, authenticated;

-- The "I am still here" signal. Returns false when the person is no longer listed in the room (the app then puts them back).
create or replace function public.noob_room_heartbeat(p_room_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); here boolean;
begin
  if me is null then return false; end if;
  update public.noob_room_participants set last_seen_at = now() where room_id = p_room_id and user_id = me;
  here := found;
  perform public.sweep_noob_rooms(p_room_id);
  return here;
end;
$$;
revoke execute on function public.noob_room_heartbeat(uuid) from public, anon;
grant execute on function public.noob_room_heartbeat(uuid) to authenticated;

-- Same as before (including the on/off switch), plus: joining counts as being seen just now.
create or replace function public.noob_room_join(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.noob_rooms; locked boolean; msg text;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select not noob_rooms_enabled, noob_rooms_disabled_message into locked, msg from public.platform_settings where id = true;
  if locked and not public.is_master_admin_user(me) then raise exception '%', msg; end if;
  select * into r from public.noob_rooms where id = p_room_id;
  if not found or r.status <> 'live' then raise exception 'This room has ended.'; end if;
  insert into public.noob_room_participants (room_id, user_id) values (p_room_id, me)
    on conflict (room_id, user_id) do update set joined_at = now(), last_seen_at = now();
  return jsonb_build_object('channelName', r.channel_name, 'isHost', r.host_id = me);
end;
$$;
grant execute on function public.noob_room_join(uuid) to authenticated;

-- The lobby list: clears out anyone who went quiet first, so the headcount on every room card is real.
create or replace function public.list_noob_rooms() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.sweep_noob_rooms();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'name', r.name, 'category', r.category, 'description', r.description, 'activityType', r.activity_type, 'createdAt', r.created_at,
      'participantCount', (select count(*) from public.noob_room_participants p where p.room_id = r.id),
      'host', case when r.host_id is null then null else
        (select jsonb_build_object('id', h.id, 'username', h.username, 'avatar', h.avatar) from public.profiles h where h.id = r.host_id)
      end
    ) order by (r.activity_type is null), (select count(*) from public.noob_room_participants p where p.room_id = r.id) desc, r.created_at desc)
    from public.noob_rooms r
    where r.status = 'live'
  ), '[]'::jsonb);
end;
$$;
grant execute on function public.list_noob_rooms() to authenticated;

-- Live Lounge rooms (private meetings)
--
-- People inside a Lounge room already ask for their own status every few seconds; that same call now doubles as the "still here"
-- signal, so no app update is needed for it to start working. Only admitted people are removed when they go quiet: someone who was
-- invited and has not opened the app yet is still just waiting, and the host is never removed (a host who comes back by code is
-- let straight in).

alter table public.live_lounge_room_participants add column if not exists last_seen_at timestamptz not null default now();

-- Internal: admitted guests who went quiet are marked as having left (they can join again with the room code).
create or replace function public.sweep_live_lounge_room(p_room_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.live_lounge_room_participants set status = 'left', updated_at = now()
  where room_id = p_room_id and role <> 'host' and status = 'admitted'
    and greatest(last_seen_at, updated_at) < now() - interval '75 seconds';
end;
$$;
revoke execute on function public.sweep_live_lounge_room(uuid) from public, anon, authenticated;

create or replace function public.live_lounge_room_my_status(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); res jsonb;
begin
  if me is null then return null; end if;
  update public.live_lounge_room_participants set last_seen_at = now()
  where room_id = p_room_id and user_id = me and status in ('waiting', 'admitted') and last_seen_at < now() - interval '20 seconds';
  perform public.sweep_live_lounge_room(p_room_id);
  select jsonb_build_object('status', p.status, 'role', p.role, 'roomStatus', r.status, 'title', r.title, 'roomCode', r.room_code)
  into res
  from public.live_lounge_room_participants p join public.live_lounge_rooms r on r.id = p.room_id
  where p.room_id = p_room_id and p.user_id = me;
  return res;
end;
$$;
revoke execute on function public.live_lounge_room_my_status(uuid) from public;
grant execute on function public.live_lounge_room_my_status(uuid) to authenticated;

-- The "In the room" list no longer shows an admitted guest who went quiet, even before the next cleanup runs.
create or replace function public.live_lounge_room_participants_list(p_room_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); am_host boolean;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  am_host := exists (select 1 from public.live_lounge_rooms where id = p_room_id and host_id = me);
  return jsonb_build_object(
    'admitted', coalesce((
      select jsonb_agg(jsonb_build_object('userId', pr.id, 'username', pr.username, 'displayName', pr.display_name,
                                          'avatar', pr.avatar, 'role', p.role) order by p.joined_at)
      from public.live_lounge_room_participants p join public.profiles pr on pr.id = p.user_id
      where p.room_id = p_room_id and p.status = 'admitted'
        and (p.role = 'host' or greatest(p.last_seen_at, p.updated_at) > now() - interval '75 seconds')), '[]'::jsonb),
    'waiting', case when am_host then coalesce((
      select jsonb_agg(jsonb_build_object('userId', pr.id, 'username', pr.username, 'displayName', pr.display_name, 'avatar', pr.avatar) order by p.joined_at)
      from public.live_lounge_room_participants p join public.profiles pr on pr.id = p.user_id
      where p.room_id = p_room_id and p.status = 'waiting'), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;
revoke execute on function public.live_lounge_room_participants_list(uuid) from public;
grant execute on function public.live_lounge_room_participants_list(uuid) to authenticated;
