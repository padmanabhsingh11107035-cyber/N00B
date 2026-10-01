-- NOOB — a host who left their own Live Lounge room and rejoined by code was dropped back into
-- 'waiting' like any other participant, with nobody able to admit them (they were the only host).
-- The client separately never restored isHost after rejoining either, so even admitting it by hand
-- would still have hidden Share/End. This fixes the server side: rejoining your own room (host_id
-- matches) goes straight to 'admitted', never through the waiting room.

create or replace function public.join_live_lounge_room_by_code(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_code text := upper(btrim(coalesce(p_code, ''))); r public.live_lounge_rooms; existing public.live_lounge_room_participants;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if not public.has_live_lounge_access(me) then
    raise exception 'NOOB Live Lounge is a members-only feature. Unlock it to join a room.';
  end if;
  select * into r from public.live_lounge_rooms where room_code = v_code and status = 'active';
  if not found then raise exception 'That room code is not valid, or the room has ended.'; end if;

  select * into existing from public.live_lounge_room_participants where room_id = r.id and user_id = me;
  if found then
    if existing.status = 'removed' then raise exception 'The host removed you from this room.'; end if;
    if existing.status = 'left' then
      update public.live_lounge_room_participants
      set status = case when r.host_id = me then 'admitted' else 'waiting' end, updated_at = now()
      where room_id = r.id and user_id = me;
    end if;
  else
    insert into public.live_lounge_room_participants (room_id, user_id, role, status)
    values (r.id, me, case when r.host_id = me then 'host' else 'participant' end, case when r.host_id = me then 'admitted' else 'waiting' end);
  end if;
  return jsonb_build_object('roomId', r.id, 'title', r.title);
end;
$$;
