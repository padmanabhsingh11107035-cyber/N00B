-- Live Lounge: delete chat when a room ends (no message history is kept, only the room/participant
-- metadata used for the "meeting history" list below), host-issued invites, pending-invite lookup for
-- the Lounge hub's top banner, and a per-user history of rooms hosted/joined (titles and dates only —
-- never chat content).

create or replace function public.end_live_lounge_room(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update public.live_lounge_rooms set status = 'ended', ended_at = now() where id = p_room_id and host_id = auth.uid() and status = 'active';
  if not found then raise exception 'That room was not found or has already ended.'; end if;
  delete from public.live_lounge_room_chat where room_id = p_room_id;
  return jsonb_build_object('success', true);
end;
$$;

-- Inviting someone puts them straight into the waiting room (same as typing the code) and notifies
-- them; only someone already admitted to the room can invite, and only into a room that's still live.
create or replace function public.invite_to_live_lounge_room(p_room_id uuid, p_target_user_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.live_lounge_rooms; my_status text; existing public.live_lounge_room_participants;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if p_target_user_id = me then raise exception 'You are already in this room.'; end if;
  select * into r from public.live_lounge_rooms where id = p_room_id and status = 'active';
  if not found then raise exception 'This room has ended.'; end if;
  select status into my_status from public.live_lounge_room_participants where room_id = p_room_id and user_id = me;
  if my_status is distinct from 'admitted' then raise exception 'You need to be in the room to invite people.'; end if;
  if not public.has_live_lounge_access(p_target_user_id) then
    raise exception 'That person does not have NOOB Live Lounge unlocked yet.';
  end if;
  select * into existing from public.live_lounge_room_participants where room_id = p_room_id and user_id = p_target_user_id;
  if found then
    if existing.status = 'removed' then raise exception 'The host removed that person from this room.'; end if;
    if existing.status in ('left', 'waiting') then
      update public.live_lounge_room_participants set status = 'waiting', updated_at = now() where room_id = p_room_id and user_id = p_target_user_id;
    end if;
    -- already 'admitted': nothing to do, they're already in the room
  else
    insert into public.live_lounge_room_participants (room_id, user_id) values (p_room_id, p_target_user_id);
  end if;
  perform public.notify_user(p_target_user_id, 'live_lounge_invite', me, p_room_id::text,
    'Invited you to "' || coalesce(nullif(btrim(r.title), ''), 'a NOOB Live Room') || '"');
  return jsonb_build_object('success', true);
end;
$$;
revoke execute on function public.invite_to_live_lounge_room(uuid, uuid) from public, anon;
grant execute on function public.invite_to_live_lounge_room(uuid, uuid) to authenticated;

-- Shown at the top of the Live Lounge hub: rooms the person has an unactioned 'waiting' spot in
-- (whether they typed the code themselves or were invited), so they never miss an invite.
create or replace function public.my_pending_live_lounge_invites() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'roomId', r.id, 'title', r.title, 'roomCode', r.room_code,
    'hostUsername', h.username, 'hostAvatar', h.avatar, 'joinedAt', p.joined_at
  ) order by p.joined_at desc), '[]'::jsonb)
  from public.live_lounge_room_participants p
  join public.live_lounge_rooms r on r.id = p.room_id
  join public.profiles h on h.id = r.host_id
  where p.user_id = auth.uid() and p.status = 'waiting' and r.status = 'active';
$$;
revoke execute on function public.my_pending_live_lounge_invites() from public, anon;
grant execute on function public.my_pending_live_lounge_invites() to authenticated;

-- Every room the person hosted or joined, newest first — title, code, role and dates only, nothing
-- from inside the room (chat is deleted when a room ends, and never included here even for the time
-- it existed).
create or replace function public.my_live_lounge_history(p_limit int default 30) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'roomId', t."roomId", 'title', t.title, 'roomCode', t."roomCode", 'role', t.role,
    'roomStatus', t."roomStatus", 'joinedAt', t."joinedAt", 'endedAt', t."endedAt"
  ) order by t."joinedAt" desc), '[]'::jsonb)
  from (
    select r.id as "roomId", r.title, r.room_code as "roomCode", p.role,
           r.status as "roomStatus", p.joined_at as "joinedAt", r.ended_at as "endedAt"
    from public.live_lounge_room_participants p
    join public.live_lounge_rooms r on r.id = p.room_id
    where p.user_id = auth.uid()
    order by p.joined_at desc
    limit least(greatest(p_limit, 1), 100)
  ) t;
$$;
revoke execute on function public.my_live_lounge_history(int) from public, anon;
grant execute on function public.my_live_lounge_history(int) to authenticated;
