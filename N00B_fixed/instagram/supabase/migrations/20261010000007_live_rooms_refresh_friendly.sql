-- Follow-up to 20261010000006 (people who close the app disappear from live rooms): a REFRESH or a quick reopen must not cost anybody
-- their place.
--
-- NOOB Rooms:  a room someone created used to end the instant its last person left, so the host refreshing their own page ended their
--              own room. Now an emptied room waits 90 seconds before it ends (tapping Leave still ends it straight away), and the
--              silence limit is 45 seconds (the app sends its "still here" signal every 15).
-- Live Lounge: a guest who went quiet used to be marked as having left, which meant coming back put them in the waiting room again.
--              Now they are only hidden from "In the room" while quiet, and simply appear again the moment their app is back, so a
--              refresh or reopening the app reconnects them to the same meeting without the host admitting them again.
--              (Tapping Leave still means leaving.)
--
-- Additive: one new column, replaced functions, one removed internal function. No rows are changed.

-- ===== NOOB Rooms

alter table public.noob_rooms add column if not exists empty_since timestamptz;

create or replace function public.sweep_noob_rooms(p_room_id uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare rids uuid[];
begin
  with gone as (
    delete from public.noob_room_participants
    where last_seen_at < now() - interval '45 seconds' and (p_room_id is null or room_id = p_room_id)
    returning room_id
  )
  select coalesce(array_agg(distinct room_id), '{}') into rids from gone;
  -- a room somebody created that just lost its last person starts its 90 second wait
  if array_length(rids, 1) is not null then
    update public.noob_rooms r set empty_since = coalesce(r.empty_since, now())
    where r.id = any(rids) and r.status = 'live' and r.host_id is not null
      and not exists (select 1 from public.noob_room_participants p where p.room_id = r.id);
  end if;
  -- ...and ends once nobody has come back during it (the always-on default rooms have no host and never end)
  update public.noob_rooms r set status = 'ended', ended_at = now()
  where r.status = 'live' and r.host_id is not null and r.empty_since is not null and r.empty_since < now() - interval '90 seconds'
    and (p_room_id is null or r.id = p_room_id)
    and not exists (select 1 from public.noob_room_participants p where p.room_id = r.id);
end;
$$;
revoke execute on function public.sweep_noob_rooms(uuid) from public, anon, authenticated;

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
  if r.empty_since is not null then update public.noob_rooms set empty_since = null where id = p_room_id; end if;
  return jsonb_build_object('channelName', r.channel_name, 'isHost', r.host_id = me);
end;
$$;
grant execute on function public.noob_room_join(uuid) to authenticated;

-- Leaving: tapping Leave (p_explicit) ends a room somebody created once it is empty, right away, as before. Anything else (the app
-- closing, a refresh) only starts the 90 second wait.
drop function if exists public.leave_noob_room(uuid);
create or replace function public.leave_noob_room(p_room_id uuid, p_explicit boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.noob_rooms; remaining int;
begin
  delete from public.noob_room_participants where room_id = p_room_id and user_id = me;
  select * into r from public.noob_rooms where id = p_room_id;
  if found and r.host_id is not null and r.status = 'live' then
    select count(*) into remaining from public.noob_room_participants where room_id = p_room_id;
    if remaining = 0 then
      if p_explicit then
        update public.noob_rooms set status = 'ended', ended_at = now() where id = p_room_id;
      else
        update public.noob_rooms set empty_since = coalesce(empty_since, now()) where id = p_room_id;
      end if;
    end if;
  end if;
end;
$$;
revoke execute on function public.leave_noob_room(uuid, boolean) from public, anon;
grant execute on function public.leave_noob_room(uuid, boolean) to authenticated;

-- ===== Live Lounge

-- No more marking quiet guests as having left: they are only hidden from the list below while quiet.
drop function if exists public.sweep_live_lounge_room(uuid);

create or replace function public.live_lounge_room_my_status(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); res jsonb;
begin
  if me is null then return null; end if;
  update public.live_lounge_room_participants set last_seen_at = now()
  where room_id = p_room_id and user_id = me and status in ('waiting', 'admitted') and last_seen_at < now() - interval '20 seconds';
  select jsonb_build_object('status', p.status, 'role', p.role, 'roomStatus', r.status, 'title', r.title, 'roomCode', r.room_code)
  into res
  from public.live_lounge_room_participants p join public.live_lounge_rooms r on r.id = p.room_id
  where p.room_id = p_room_id and p.user_id = me;
  return res;
end;
$$;
revoke execute on function public.live_lounge_room_my_status(uuid) from public;
grant execute on function public.live_lounge_room_my_status(uuid) to authenticated;

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
        and (p.role = 'host' or greatest(p.last_seen_at, p.updated_at) > now() - interval '45 seconds')), '[]'::jsonb),
    'waiting', case when am_host then coalesce((
      select jsonb_agg(jsonb_build_object('userId', pr.id, 'username', pr.username, 'displayName', pr.display_name, 'avatar', pr.avatar) order by p.joined_at)
      from public.live_lounge_room_participants p join public.profiles pr on pr.id = p.user_id
      where p.room_id = p_room_id and p.status = 'waiting'), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;
revoke execute on function public.live_lounge_room_participants_list(uuid) from public;
grant execute on function public.live_lounge_room_participants_list(uuid) to authenticated;
