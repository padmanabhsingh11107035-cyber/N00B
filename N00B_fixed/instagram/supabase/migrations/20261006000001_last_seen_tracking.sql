-- Admin panel: "last seen" time + whether that was the installed app or a web browser, for EVERY
-- account — not just whoever happens to be online right now. The live Presence-based online/offline
-- badge (see startPresenceHeartbeat/subscribeToOnlinePresence) is deliberately ephemeral and tells you
-- nothing once someone disconnects; this is the persisted complement to it.

alter table public.profile_private add column if not exists last_seen_at timestamptz;
alter table public.profile_private add column if not exists last_seen_platform text;
alter table public.profile_private drop constraint if exists profile_private_last_seen_platform_check;
alter table public.profile_private add constraint profile_private_last_seen_platform_check
  check (last_seen_platform is null or last_seen_platform in ('app', 'web'));

-- Called periodically by every signed-in session (same cadence as the presence heartbeat) — cheap,
-- single-row upsert, never raises (a failed "last seen" write must never surface as an app error).
create or replace function public.touch_last_seen(p_platform text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or p_platform not in ('app', 'web') then return; end if;
  insert into public.profile_private (user_id, last_seen_at, last_seen_platform)
    values (me, now(), p_platform)
  on conflict (user_id) do update set last_seen_at = excluded.last_seen_at, last_seen_platform = excluded.last_seen_platform;
end;
$$;
grant execute on function public.touch_last_seen(text) to authenticated;

create or replace function public.admin_user_json(p public.profiles) returns jsonb
language sql stable security definer set search_path = public as $$
  select public.user_public_json(p) || jsonb_build_object(
    'email', pp.email, 'firstName', pp.first_name, 'lastName', pp.last_name, 'countryCode', pp.country_code,
    'mobileNumber', pp.mobile_number, 'dateOfBirth', pp.date_of_birth, 'gender', pp.gender,
    'businessEmail', pp.business_email, 'businessPhone', pp.business_phone, 'businessAddress', pp.business_address,
    'isSuspended', p.is_suspended, 'suspendedReason', pp.suspended_reason,
    'proBilling', p.pro_billing, 'proRenewsAt', p.pro_renews_at,
    'ipAddress', pp.ip_address, 'signupPlatform', pp.signup_platform,
    'lastSeenAt', pp.last_seen_at, 'lastSeenPlatform', pp.last_seen_platform)
  from (select 1) one left join public.profile_private pp on pp.user_id = p.id;
$$;
