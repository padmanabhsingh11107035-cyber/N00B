-- NOOB Rooms on/off toggle — same pattern as live_lounge_maintenance: the room-list lobby polls
-- continuously while open (and a room's own participant list polls while someone's inside one), which
-- is real, ongoing Supabase egress. Flipping this off lets the admin stop that immediately (and turn
-- it back on later) without touching code, same as every other maintenance-style lock already here.

alter table public.platform_settings add column if not exists noob_rooms_enabled boolean not null default true;
alter table public.platform_settings add column if not exists noob_rooms_disabled_message text not null default 'NOOB Rooms is turned off right now. Check back soon.';

create or replace function public.public_platform_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'signupsEnabled', s.signups_enabled, 'maintenanceEnabled', s.maintenance_enabled, 'maintenanceMessage', s.maintenance_message,
    'noobAiMaintenance', s.noob_ai_maintenance, 'sparkxOpen', s.sparkx_open, 'joinTeamOpen', s.join_team_open,
    'noobAiWakeRequestedAt', s.noob_ai_wake_requested_at,
    'liveLoungeMaintenance', s.live_lounge_maintenance, 'liveLoungeMaintenanceMessage', s.live_lounge_maintenance_message,
    'noobRoomsEnabled', s.noob_rooms_enabled, 'noobRoomsDisabledMessage', s.noob_rooms_disabled_message)
  from public.platform_settings s where s.id = true;
$$;
grant execute on function public.public_platform_settings() to anon, authenticated;

-- The 8-argument version is removed first so calls are never ambiguous (same reasoning as the
-- live_lounge_maintenance migration before it).
drop function if exists public.admin_set_platform_settings(boolean, boolean, text, boolean, boolean, boolean, boolean, text);
create function public.admin_set_platform_settings(
  p_signups_enabled boolean default null, p_maintenance_enabled boolean default null, p_maintenance_message text default null,
  p_noob_ai_maintenance boolean default null, p_sparkx_open boolean default null, p_join_team_open boolean default null,
  p_live_lounge_maintenance boolean default null, p_live_lounge_maintenance_message text default null,
  p_noob_rooms_enabled boolean default null, p_noob_rooms_disabled_message text default null
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
    noob_rooms_enabled = coalesce(p_noob_rooms_enabled, noob_rooms_enabled),
    noob_rooms_disabled_message = coalesce(nullif(btrim(p_noob_rooms_disabled_message), ''), noob_rooms_disabled_message),
    updated_by = me, updated_at = now()
  where id = true;
  perform public.log_admin_action('platform_settings_changed', null,
    jsonb_build_object('signupsEnabled', p_signups_enabled, 'maintenanceEnabled', p_maintenance_enabled,
                       'noobAiMaintenance', p_noob_ai_maintenance, 'sparkxOpen', p_sparkx_open, 'joinTeamOpen', p_join_team_open,
                       'liveLoungeMaintenance', p_live_lounge_maintenance, 'noobRoomsEnabled', p_noob_rooms_enabled));
  return public.public_platform_settings();
end;
$$;
revoke execute on function public.admin_set_platform_settings(boolean, boolean, text, boolean, boolean, boolean, boolean, text, boolean, text) from public, anon;
grant execute on function public.admin_set_platform_settings(boolean, boolean, text, boolean, boolean, boolean, boolean, text, boolean, text) to authenticated;

-- Enforced where rooms actually get created/joined (admin exempt, same as every other lock here) —
-- this alone stops the heavy per-room polling (it never starts if you can never get into a room), but
-- the lobby's own list-polling loop is a client-side concern (see NoobRoomsLobbyView), since the real
-- goal is for a disabled NOOB Rooms to stop making ANY of these calls, not just have them rejected.
create or replace function public.start_noob_room(p_name text, p_category text default 'General', p_description text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); nm text; r public.noob_rooms; locked boolean; msg text;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select not noob_rooms_enabled, noob_rooms_disabled_message into locked, msg from public.platform_settings where id = true;
  if locked and not public.is_master_admin_user(me) then raise exception '%', msg; end if;
  nm := left(btrim(coalesce(p_name, '')), 60);
  if nm = '' then raise exception 'Give your room a name.'; end if;
  insert into public.noob_rooms (host_id, name, category, description, channel_name)
  values (me, nm, left(btrim(coalesce(p_category, 'General')), 30), left(btrim(coalesce(p_description, '')), 200), 'noobroom_' || replace(gen_random_uuid()::text, '-', ''))
  returning * into r;
  return jsonb_build_object('success', true, 'roomId', r.id, 'name', r.name);
end;
$$;
grant execute on function public.start_noob_room(text, text, text) to authenticated;

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
    on conflict (room_id, user_id) do update set joined_at = now();
  return jsonb_build_object('channelName', r.channel_name, 'isHost', r.host_id = me);
end;
$$;
grant execute on function public.noob_room_join(uuid) to authenticated;
