-- NOOB — a meeting (Live Lounge room) that is still running one hour after it started is ended by itself.
--
-- Why: a room whose host forgot to press End stays "active" for ever. Everybody still in it keeps asking the database about it every few seconds, and the host's
-- laptop or phone keeps its connection open, which is what the monthly Cached Egress allowance of the plan goes on. One hour is the longest a meeting lasts now.
--
-- What changes: one new column (why a room ended, "time_limit" for this), one function that ends the rooms that are an hour old, a call to it inside the "what is my
-- status in this room" question that every person in a room already asks every few seconds (so it works by itself, with no extra schedule), and, where the
-- pg_cron extension is on, a schedule that does it every 5 minutes as well. Nothing else about rooms, people or history changes.

alter table public.live_lounge_rooms add column if not exists ended_reason text;
create index if not exists live_lounge_rooms_active_idx on public.live_lounge_rooms (created_at) where status = 'active';

create or replace function public.end_stale_live_lounge_rooms() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with ended as (
    update public.live_lounge_rooms
       set status = 'ended', ended_at = now(), ended_reason = 'time_limit'
     where status = 'active' and created_at < now() - interval '1 hour'
    returning id
  )
  select count(*) into n from ended;
  return coalesce(n, 0);
end;
$$;
revoke execute on function public.end_stale_live_lounge_rooms() from public, anon, authenticated;
grant execute on function public.end_stale_live_lounge_rooms() to service_role;

-- Same function as before (meeting rules, waiting room wording, breakout room), plus the hour rule and the reason a room ended.
create or replace function public.live_lounge_room_my_status(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); res jsonb; m public.live_lounge_meetings; rm public.live_lounge_rooms;
begin
  if me is null then return null; end if;
  perform public.end_stale_live_lounge_rooms();   -- a meeting is never left running for more than an hour
  update public.live_lounge_room_participants set last_seen_at = now()
  where room_id = p_room_id and user_id = me and status in ('waiting', 'admitted') and last_seen_at < now() - interval '20 seconds';
  select jsonb_build_object('status', p.status, 'role', p.role, 'roomStatus', r.status, 'endedReason', r.ended_reason, 'title', r.title, 'roomCode', r.room_code, 'locked', r.locked)
  into res
  from public.live_lounge_room_participants p join public.live_lounge_rooms r on r.id = p.room_id
  where p.room_id = p_room_id and p.user_id = me;
  if res is null then return null; end if;
  select * into rm from public.live_lounge_rooms where id = p_room_id;
  if rm.meeting_id is not null then
    select * into m from public.live_lounge_meetings where id = rm.meeting_id;
    res := res || jsonb_build_object('meetingId', m.id, 'settings', jsonb_build_object(
      'chatEnabled', m.chat_enabled, 'hostOnlyScreenShare', m.host_only_screen_share,
      'waitingRoomTitle', m.waiting_room_title, 'waitingRoomMessage', m.waiting_room_message,
      'hasPasscode', m.passcode is not null,
      'passcode', case when rm.host_id = me or m.created_by = me then m.passcode else null end,
      'meetingCode', m.meeting_code, 'description', m.description, 'breakoutEnabled', m.breakout_enabled,
      'myBreakoutRoom', (select b->>'name' from jsonb_array_elements(m.breakout_rooms) b where (b->'members') ? me::text limit 1)));
  end if;
  return res;
end;
$$;
revoke execute on function public.live_lounge_room_my_status(uuid) from public;
grant execute on function public.live_lounge_room_my_status(uuid) to authenticated;

-- Where the pg_cron extension is on, the same sweep also runs every 5 minutes (so a room nobody is looking at is closed too). Without it the line above still does the work.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('noob-end-stale-meetings', '*/5 * * * *', $job$ select public.end_stale_live_lounge_rooms(); $job$);
  end if;
exception when others then
  raise notice 'The 5-minute meeting sweep was not scheduled: %', sqlerrm;
end
$$;
