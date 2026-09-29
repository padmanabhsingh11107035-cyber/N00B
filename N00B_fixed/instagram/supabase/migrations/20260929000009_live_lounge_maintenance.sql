-- Live Lounge maintenance lock: the admin can take the private meeting room offline (Live Streaming —
-- "Go Live" — is untouched, this is only host/join for the Lounge room) with a message shown instead,
-- same pattern as the whole-app and NOOB AI maintenance locks already in platform_settings.

alter table public.platform_settings add column if not exists live_lounge_maintenance boolean not null default false;
alter table public.platform_settings add column if not exists live_lounge_maintenance_message text not null default 'NOOB Live Room is down. It will be back soon.';

create or replace function public.public_platform_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'signupsEnabled', s.signups_enabled, 'maintenanceEnabled', s.maintenance_enabled, 'maintenanceMessage', s.maintenance_message,
    'noobAiMaintenance', s.noob_ai_maintenance, 'sparkxOpen', s.sparkx_open, 'joinTeamOpen', s.join_team_open,
    'noobAiWakeRequestedAt', s.noob_ai_wake_requested_at,
    'liveLoungeMaintenance', s.live_lounge_maintenance, 'liveLoungeMaintenanceMessage', s.live_lounge_maintenance_message)
  from public.platform_settings s where s.id = true;
$$;
grant execute on function public.public_platform_settings() to anon, authenticated;

-- The 6-argument version is removed first so calls are never ambiguous (same reasoning as 20260927000003).
drop function if exists public.admin_set_platform_settings(boolean, boolean, text, boolean, boolean, boolean);
create function public.admin_set_platform_settings(
  p_signups_enabled boolean default null, p_maintenance_enabled boolean default null, p_maintenance_message text default null,
  p_noob_ai_maintenance boolean default null, p_sparkx_open boolean default null, p_join_team_open boolean default null,
  p_live_lounge_maintenance boolean default null, p_live_lounge_maintenance_message text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid;
begin
  if not public.is_master_admin() then raise exception 'Access denied. Administrator privileges required.' using errcode = '42501'; end if;
  me := auth.uid();
  update public.platform_settings set
    signups_enabled = coalesce(p_signups_enabled, signups_enabled),
    maintenance_enabled = coalesce(p_maintenance_enabled, maintenance_enabled),
    maintenance_message = coalesce(nullif(btrim(p_maintenance_message), ''), maintenance_message),
    noob_ai_maintenance = coalesce(p_noob_ai_maintenance, noob_ai_maintenance),
    sparkx_open = coalesce(p_sparkx_open, sparkx_open),
    join_team_open = coalesce(p_join_team_open, join_team_open),
    live_lounge_maintenance = coalesce(p_live_lounge_maintenance, live_lounge_maintenance),
    live_lounge_maintenance_message = coalesce(nullif(btrim(p_live_lounge_maintenance_message), ''), live_lounge_maintenance_message),
    updated_by = me, updated_at = now()
  where id = true;
  perform public.log_admin_action('platform_settings_changed', null,
    jsonb_build_object('signupsEnabled', p_signups_enabled, 'maintenanceEnabled', p_maintenance_enabled,
                       'noobAiMaintenance', p_noob_ai_maintenance, 'sparkxOpen', p_sparkx_open, 'joinTeamOpen', p_join_team_open,
                       'liveLoungeMaintenance', p_live_lounge_maintenance));
  return public.public_platform_settings();
end;
$$;
revoke execute on function public.admin_set_platform_settings(boolean, boolean, text, boolean, boolean, boolean, boolean, text) from public, anon;
grant execute on function public.admin_set_platform_settings(boolean, boolean, text, boolean, boolean, boolean, boolean, text) to authenticated;

-- Enforce it where hosting/joining actually happen (admin exempt, same as every other lock here).
create or replace function public.start_live_lounge_room(p_title text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_code text; r public.live_lounge_rooms; locked boolean; msg text;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if not public.has_live_lounge_access(me) then
    raise exception 'NOOB Live Lounge is a members-only feature. Unlock it to host a room.';
  end if;
  select live_lounge_maintenance, live_lounge_maintenance_message into locked, msg from public.platform_settings where id = true;
  if locked and not public.is_master_admin_user(me) then raise exception '%', msg; end if;
  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.live_lounge_rooms where room_code = v_code and status = 'active');
  end loop;
  insert into public.live_lounge_rooms (host_id, title, room_code, channel_name)
  values (me, left(btrim(coalesce(p_title, '')), 80), v_code, 'lounge_' || replace(gen_random_uuid()::text, '-', ''))
  returning * into r;
  insert into public.live_lounge_room_participants (room_id, user_id, role, status) values (r.id, me, 'host', 'admitted');
  return jsonb_build_object('roomId', r.id, 'roomCode', r.room_code, 'channelName', r.channel_name, 'title', r.title);
end;
$$;

create or replace function public.join_live_lounge_room_by_code(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_code text := upper(btrim(coalesce(p_code, ''))); r public.live_lounge_rooms;
  existing public.live_lounge_room_participants; locked boolean; msg text;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if not public.has_live_lounge_access(me) then
    raise exception 'NOOB Live Lounge is a members-only feature. Unlock it to join a room.';
  end if;
  select live_lounge_maintenance, live_lounge_maintenance_message into locked, msg from public.platform_settings where id = true;
  if locked and not public.is_master_admin_user(me) then raise exception '%', msg; end if;
  select * into r from public.live_lounge_rooms where room_code = v_code and status = 'active';
  if not found then raise exception 'That room code is not valid, or the room has ended.'; end if;

  select * into existing from public.live_lounge_room_participants where room_id = r.id and user_id = me;
  if found then
    if existing.status = 'removed' then raise exception 'The host removed you from this room.'; end if;
    if existing.status = 'left' then
      update public.live_lounge_room_participants set status = 'waiting', updated_at = now() where room_id = r.id and user_id = me;
    end if;
  else
    insert into public.live_lounge_room_participants (room_id, user_id) values (r.id, me);
  end if;
  return jsonb_build_object('roomId', r.id, 'title', r.title);
end;
$$;
