-- One on / off switch for every page of the app, in the Admin Control Panel (the "Pages" tab).
--
-- The single-row platform_settings table gets one more column: the list of pages the administrator has switched OFF. The list is read by everybody through
-- public_platform_settings() (the same call that already carries the sign-ups pause, the maintenance lock and the Music switch) and changed only by the main administrator,
-- through its own small function. A page that is switched off disappears for everyone except the administrators; nothing is deleted (posts, reels, chats, points, orders stay as they
-- are) and switching the page on again brings it back at once.
--
-- The page names are short words that the app knows (reels, chat, games, daily, ai ...); the database only checks that a name looks like one, so a new page needs no new SQL.
--
-- Safe to run more than once. No data is touched; the only change is one new column (default: nothing is off) and one function.

alter table public.platform_settings add column if not exists disabled_features text[] not null default '{}';

-- Same as before (20261015000001) plus 'disabledFeatures'.
create or replace function public.public_platform_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'signupsEnabled', s.signups_enabled, 'maintenanceEnabled', s.maintenance_enabled, 'maintenanceMessage', s.maintenance_message,
    'noobAiMaintenance', s.noob_ai_maintenance, 'sparkxOpen', s.sparkx_open, 'joinTeamOpen', s.join_team_open,
    'noobAiWakeRequestedAt', s.noob_ai_wake_requested_at,
    'liveLoungeMaintenance', s.live_lounge_maintenance, 'liveLoungeMaintenanceMessage', s.live_lounge_maintenance_message,
    'noobRoomsEnabled', s.noob_rooms_enabled, 'noobRoomsDisabledMessage', s.noob_rooms_disabled_message,
    'musicPageHidden', s.music_page_hidden,
    'disabledFeatures', to_jsonb(coalesce(s.disabled_features, '{}'::text[])))
  from public.platform_settings s where s.id = true;
$$;
grant execute on function public.public_platform_settings() to anon, authenticated;

-- Switch one page off (p_on = false) or on (p_on = true).
create or replace function public.admin_set_feature(p_key text, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k text := lower(btrim(coalesce(p_key, '')));
begin
  if not public.is_master_admin() then raise exception 'Access denied. Administrator privileges required.' using errcode = '42501'; end if;
  if k !~ '^[a-z0-9-]{2,40}$' then raise exception 'That is not the name of a page.'; end if;
  if p_on is null then raise exception 'Say whether the page should be on or off.'; end if;
  update public.platform_settings s set
    disabled_features = case
      when p_on then array_remove(s.disabled_features, k)
      when k = any (s.disabled_features) then s.disabled_features
      when cardinality(s.disabled_features) >= 100 then s.disabled_features
      else array_append(s.disabled_features, k) end,
    updated_by = auth.uid(), updated_at = now()
  where s.id = true;
  perform public.log_admin_action('feature_switch_changed', null, jsonb_build_object('feature', k, 'on', p_on));
  return public.public_platform_settings();
end;
$$;
revoke execute on function public.admin_set_feature(text, boolean) from public, anon;
grant execute on function public.admin_set_feature(text, boolean) to authenticated;
