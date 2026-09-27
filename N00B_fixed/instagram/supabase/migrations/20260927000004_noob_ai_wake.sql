-- NOOB — anyone signed in can wake NOOB AI up. The "Wake up NOOB" button records a wake request here; the small
-- keeper program on the NOOB AI computer (noob_autostart.py) checks it every few seconds and starts NOOB AI when
-- it is asleep. People can only wake it — never stop it or change anything else. (If that computer itself is
-- switched off, nothing can wake it; the app says so.)

alter table public.platform_settings add column if not exists noob_ai_wake_requested_at timestamptz;

create or replace function public.public_platform_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'signupsEnabled', s.signups_enabled, 'maintenanceEnabled', s.maintenance_enabled, 'maintenanceMessage', s.maintenance_message,
    'noobAiMaintenance', s.noob_ai_maintenance, 'sparkxOpen', s.sparkx_open, 'joinTeamOpen', s.join_team_open,
    'noobAiWakeRequestedAt', s.noob_ai_wake_requested_at)
  from public.platform_settings s where s.id = true;
$$;
grant execute on function public.public_platform_settings() to anon, authenticated;

-- Records a wake request (at most one every 10 seconds for everyone together, so tapping many times changes nothing).
create or replace function public.request_noob_ai_wake() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); at timestamptz;
begin
  if me is null or (select is_suspended from public.profiles where id = me) is not false then
    raise exception 'Please log in.' using errcode = '28000';
  end if;
  update public.platform_settings set noob_ai_wake_requested_at = now()
  where id = true and (noob_ai_wake_requested_at is null or noob_ai_wake_requested_at < now() - interval '10 seconds');
  select noob_ai_wake_requested_at into at from public.platform_settings where id = true;
  return jsonb_build_object('success', true, 'requestedAt', at);
end;
$$;
revoke execute on function public.request_noob_ai_wake() from public, anon;
grant execute on function public.request_noob_ai_wake() to authenticated;
