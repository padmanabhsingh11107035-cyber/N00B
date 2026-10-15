-- Hide / show the Music page from the admin panel (Admin Control Panel -> Platform -> "Hide the Music page").
--
-- One more yes/no on the single-row platform_settings table, read by everybody through public_platform_settings() (the same call that already carries the sign-ups pause,
-- the maintenance lock and the other switches) and changed only by the main administrator, through its own small function so the long admin_set_platform_settings() is left
-- exactly as it is. Hiding the page deletes nothing: the music library, songs on posts and the player all stay as they are, and turning the switch off brings the page back.
--
-- Safe to run more than once. No data is touched; the only change is one new column (default: not hidden) and two functions.

alter table public.platform_settings add column if not exists music_page_hidden boolean not null default false;

-- Same as before (20261007000002) plus 'musicPageHidden'.
create or replace function public.public_platform_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'signupsEnabled', s.signups_enabled, 'maintenanceEnabled', s.maintenance_enabled, 'maintenanceMessage', s.maintenance_message,
    'noobAiMaintenance', s.noob_ai_maintenance, 'sparkxOpen', s.sparkx_open, 'joinTeamOpen', s.join_team_open,
    'noobAiWakeRequestedAt', s.noob_ai_wake_requested_at,
    'liveLoungeMaintenance', s.live_lounge_maintenance, 'liveLoungeMaintenanceMessage', s.live_lounge_maintenance_message,
    'noobRoomsEnabled', s.noob_rooms_enabled, 'noobRoomsDisabledMessage', s.noob_rooms_disabled_message,
    'musicPageHidden', s.music_page_hidden)
  from public.platform_settings s where s.id = true;
$$;
grant execute on function public.public_platform_settings() to anon, authenticated;

create or replace function public.admin_set_music_page_hidden(p_hidden boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_master_admin() then raise exception 'Access denied. Administrator privileges required.' using errcode = '42501'; end if;
  if p_hidden is null then raise exception 'Say whether the Music page should be hidden.'; end if;
  update public.platform_settings set music_page_hidden = p_hidden, updated_by = auth.uid(), updated_at = now() where id = true;
  perform public.log_admin_action('music_page_hidden_changed', null, jsonb_build_object('musicPageHidden', p_hidden));
  return public.public_platform_settings();
end;
$$;
revoke execute on function public.admin_set_music_page_hidden(boolean) from public, anon;
grant execute on function public.admin_set_music_page_hidden(boolean) to authenticated;
