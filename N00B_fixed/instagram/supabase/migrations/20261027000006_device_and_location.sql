-- NOOB — what the administrator can see about a person's device and place, all of it told to people in the Terms and the Privacy Policy:
--   * the operating system (for example "Android 14", "iOS 17", "Windows"), and the battery level in per cent with "charging" where the browser or phone shares it (iPhone does not)
--   * the city the person typed (optional, at sign-up), and the approximate place (city, region, country) worked out from the internet connection by NOOB's own web address (/__geo)
-- It is written by the person's own app about the person's own account, and read only by the administrator. It is never sold or shared and is used for nothing else.

alter table public.profile_private add column if not exists device_os text;
alter table public.profile_private add column if not exists device_battery smallint;
alter table public.profile_private add column if not exists device_charging boolean;
alter table public.profile_private add column if not exists device_info_at timestamptz;
alter table public.profile_private add column if not exists signup_city text;
alter table public.profile_private add column if not exists approx_city text;
alter table public.profile_private add column if not exists approx_region text;
alter table public.profile_private add column if not exists approx_country text;
alter table public.profile_private add column if not exists location_at timestamptz;
alter table public.profile_private drop constraint if exists profile_private_device_battery_range;
alter table public.profile_private add constraint profile_private_device_battery_range check (device_battery is null or device_battery between 0 and 100);

-- the person's own app tells the database about this device (a few times an hour at most; the app decides)
create or replace function public.save_my_device_info(p_os text, p_battery integer, p_charging boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.profile_private (user_id, device_os, device_battery, device_charging, device_info_at)
  values (auth.uid(), left(nullif(btrim(coalesce(p_os, '')), ''), 40), case when p_battery between 0 and 100 then p_battery end, p_charging, now())
  on conflict (user_id) do update set
    device_os = left(nullif(btrim(coalesce(p_os, '')), ''), 40),
    device_battery = case when p_battery between 0 and 100 then p_battery end,
    device_charging = p_charging,
    device_info_at = now();
end;
$$;
revoke execute on function public.save_my_device_info(text, integer, boolean) from public, anon;
grant execute on function public.save_my_device_info(text, integer, boolean) to authenticated;

-- the city the person typed (kept only when they typed one) and the approximate place of the connection
create or replace function public.save_my_location(p_typed_city text, p_city text, p_region text, p_country text) returns void
language plpgsql security definer set search_path = public as $$
declare typed text := left(nullif(btrim(regexp_replace(coalesce(p_typed_city, ''), '[<>]', '', 'g')), ''), 60);
begin
  if auth.uid() is null then return; end if;
  insert into public.profile_private (user_id, signup_city, approx_city, approx_region, approx_country, location_at)
  values (auth.uid(), typed, left(nullif(btrim(coalesce(p_city, '')), ''), 60), left(nullif(btrim(coalesce(p_region, '')), ''), 60), left(nullif(btrim(coalesce(p_country, '')), ''), 60), now())
  on conflict (user_id) do update set
    signup_city = coalesce(typed, public.profile_private.signup_city),
    approx_city = coalesce(left(nullif(btrim(coalesce(p_city, '')), ''), 60), public.profile_private.approx_city),
    approx_region = coalesce(left(nullif(btrim(coalesce(p_region, '')), ''), 60), public.profile_private.approx_region),
    approx_country = coalesce(left(nullif(btrim(coalesce(p_country, '')), ''), 60), public.profile_private.approx_country),
    location_at = now();
end;
$$;
revoke execute on function public.save_my_location(text, text, text, text) from public, anon;
grant execute on function public.save_my_location(text, text, text, text) to authenticated;

-- the administrator's view of a person: the same as before, plus the device and the place
create or replace function public.admin_user_json(p public.profiles) returns jsonb
language sql stable security definer set search_path = public as $$
  select public.user_public_json(p) || jsonb_build_object(
    'email', pp.email, 'firstName', pp.first_name, 'lastName', pp.last_name, 'countryCode', pp.country_code,
    'mobileNumber', pp.mobile_number, 'dateOfBirth', pp.date_of_birth, 'gender', pp.gender,
    'businessEmail', pp.business_email, 'businessPhone', pp.business_phone, 'businessAddress', pp.business_address,
    'isSuspended', p.is_suspended, 'suspendedReason', pp.suspended_reason,
    'proBilling', p.pro_billing, 'proRenewsAt', p.pro_renews_at,
    'ipAddress', pp.ip_address, 'signupPlatform', pp.signup_platform,
    'lastSeenAt', pp.last_seen_at, 'lastSeenPlatform', pp.last_seen_platform,
    'deviceOs', pp.device_os, 'deviceBattery', pp.device_battery, 'deviceCharging', pp.device_charging, 'deviceInfoAt', pp.device_info_at,
    'signupCity', pp.signup_city, 'approxCity', pp.approx_city, 'approxRegion', pp.approx_region, 'approxCountry', pp.approx_country, 'locationAt', pp.location_at)
  from (select 1) one left join public.profile_private pp on pp.user_id = p.id;
$$;
