-- NOOB — a maintenance lock for NOOB AI (the voice assistant), switched in the Admin Control Panel → Platform, next
-- to the whole-app maintenance lock. While it is on, the NOOB app shows "NOOB AI is under maintenance" instead of
-- opening it (the main admin can still open it), and the NOOB AI server itself (ai.nooob.xyz, which reads this
-- through public_platform_settings) answers everyone except its owner with the same message.

alter table public.platform_settings add column if not exists noob_ai_maintenance boolean not null default false;

create or replace function public.public_platform_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'signupsEnabled', s.signups_enabled, 'maintenanceEnabled', s.maintenance_enabled, 'maintenanceMessage', s.maintenance_message,
    'noobAiMaintenance', s.noob_ai_maintenance)
  from public.platform_settings s where s.id = true;
$$;
grant execute on function public.public_platform_settings() to anon, authenticated;

-- One more optional switch. The old 3-argument version is removed first so there is only one function to call
-- (calls that pass only the first three still work: the new one defaults to "leave it as it is").
drop function if exists public.admin_set_platform_settings(boolean, boolean, text);
create function public.admin_set_platform_settings(
  p_signups_enabled boolean default null, p_maintenance_enabled boolean default null, p_maintenance_message text default null,
  p_noob_ai_maintenance boolean default null
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
    updated_by = me, updated_at = now()
  where id = true;
  perform public.log_admin_action('platform_settings_changed', null,
    jsonb_build_object('signupsEnabled', p_signups_enabled, 'maintenanceEnabled', p_maintenance_enabled,
                       'noobAiMaintenance', p_noob_ai_maintenance));
  return public.public_platform_settings();
end;
$$;
revoke execute on function public.admin_set_platform_settings(boolean, boolean, text, boolean) from public, anon;
grant execute on function public.admin_set_platform_settings(boolean, boolean, text, boolean) to authenticated;
