-- NOOB — "Sign in with Google". Supabase Auth creates the auth.users row itself the moment someone
-- finishes the Google OAuth redirect (handle_new_user's trigger sees no "username" in Google's own
-- metadata — it only ever has full_name/picture/email — so its existing "clean = ''" guard just
-- returns, same as it already does for any other insert with no username; no profile is created and
-- nothing errors). This migration adds the one new piece: once that already-logged-in person has
-- filled in whatever Google didn't hand over (username, bio, mobile number, date of birth, ...) and
-- proved their email the same way every other NOOB signup does (a 6-digit code — signup_otp_request /
-- signup_otp_verify, both completely unchanged), this creates their profile row.
--
-- Deliberately NOT folded into handle_new_user() itself, and not reusing its trigger: that function is
-- what every single existing signup already depends on, so rather than risk it, this keeps its own
-- short, separate copy of the same insert.
--
-- service_role only (same boundary signup_otp_verify itself already uses) — reachable only via the
-- recover-account Edge Function's new "oauth-complete-signup" action, which is the one place that
-- knows which Google session is asking (its own bearer token) and already holds the service-role key
-- signup_otp_verify needs.
create or replace function public.complete_oauth_profile(p_user_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  clean text;
  dob date;
  age numeric;
  em text := lower(btrim(coalesce(p->>'email', '')));
  mob text := btrim(coalesce(p->>'mobileNumber', ''));
  first_n text := btrim(coalesce(p->>'firstName', ''));
  last_n text := btrim(coalesce(p->>'lastName', ''));
  kind text := case when p->>'accountType' in ('private', 'business') then p->>'accountType' else 'public' end;
  admin_id uuid;
begin
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    return jsonb_build_object('error', 'Could not find your account. Please try signing in again.');
  end if;
  -- the one account per identity rule: a Google identity that already has a profile never gets a second one
  if exists (select 1 from public.profiles where id = p_user_id) then
    return jsonb_build_object('error', 'This account already has a profile.');
  end if;

  if em = '' or em !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    return jsonb_build_object('error', 'Please enter a valid email address.');
  end if;
  if not exists (select 1 from public.signup_otps where lower(email) = em and verified_at is not null and expires_at > now()) then
    return jsonb_build_object('error', 'Please verify your email with the code we sent before creating your account.');
  end if;

  if btrim(coalesce(p->>'bio', '')) = '' then return jsonb_build_object('error', 'Bio is compulsory. Please write a short bio about yourself.'); end if;
  if mob = '' then return jsonb_build_object('error', 'Mobile number is required.'); end if;
  if btrim(coalesce(p->>'avatar', '')) = '' then return jsonb_build_object('error', 'Please upload a profile photo. It is required to create a NOOB account.'); end if;
  if coalesce((p->>'agreedToTerms')::boolean, false) is not true then
    return jsonb_build_object('error', 'You must agree to NOOB''s general terms and privacy policy.');
  end if;

  if coalesce(p->>'dateOfBirth', '') = '' then return jsonb_build_object('error', 'Date of birth is required.'); end if;
  begin
    dob := (p->>'dateOfBirth')::date;
  exception when others then
    return jsonb_build_object('error', 'Please enter a valid date of birth.');
  end;
  if dob > current_date then return jsonb_build_object('error', 'Please enter a valid date of birth.'); end if;
  age := (current_date - dob) / 365.25;
  if age < 13 then return jsonb_build_object('error', 'You must be at least 13 years old to create a NOOB account.'); end if;
  if age > 82 then return jsonb_build_object('error', 'NOOB accounts are only available to users 82 years old or younger.'); end if;

  clean := regexp_replace(lower(btrim(coalesce(p->>'username', ''))), '[^a-z0-9_.]', '', 'g');
  if clean = '' then return jsonb_build_object('error', 'User ID / Username is required.'); end if;
  if exists (select 1 from public.profiles where lower(username) = clean) then
    return jsonb_build_object('error', 'User ID is already taken. Please choose another.');
  end if;
  if exists (select 1 from public.profile_private where mobile_number = mob) then
    return jsonb_build_object('error', 'An account with that mobile number already exists.');
  end if;

  -- a suspended person can't just sign up again under a new name (same check check_signup/handle_new_user make)
  if exists (
    select 1 from public.profiles pr join public.profile_private pp on pp.user_id = pr.id
    where pr.is_suspended and (lower(pp.email) = em or pp.mobile_number = mob)
  ) then
    return jsonb_build_object(
      'error', 'This account is suspended.', 'suspended', true,
      'message', 'We have detected that your account is suspended, and attempting to create a new account could result in further action against you. Please wait — our team will contact you.'
    );
  end if;

  insert into public.profiles (id, username, display_name, avatar, bio, account_type, is_business, business_category)
  values (
    p_user_id, clean,
    coalesce(nullif(btrim(p->>'displayName'), ''), nullif(btrim(first_n || ' ' || last_n), ''), clean),
    btrim(p->>'avatar'), btrim(p->>'bio'),
    kind, kind = 'business',
    case when kind = 'business' then coalesce(nullif(p->>'businessCategory', ''), 'Creator & Brand') else nullif(p->>'businessCategory', '') end
  );

  insert into public.profile_private (
    user_id, email, first_name, last_name, country_code, mobile_number, date_of_birth, gender,
    business_email, business_phone, business_address, business_addresses, agreed_to_terms
  ) values (
    p_user_id, em, nullif(first_n, ''), nullif(last_n, ''),
    coalesce(nullif(p->>'countryCode', ''), '+91 (IN)'), mob, dob,
    coalesce(nullif(p->>'gender', ''), 'Prefer not to say'),
    case when kind = 'business' then coalesce(nullif(p->>'businessEmail', ''), em) else nullif(p->>'businessEmail', '') end,
    case when kind = 'business' then coalesce(nullif(p->>'businessPhone', ''), mob) else nullif(p->>'businessPhone', '') end,
    nullif(p->>'businessAddress', ''),
    case when nullif(p->>'businessAddress', '') is null then '{}'::text[] else array[p->>'businessAddress'] end,
    true
  );

  -- used up: the same email can't be replayed for a second account without a fresh code
  delete from public.signup_otps where lower(email) = em;

  -- everyone starts out following the official NOOB account
  select id into admin_id from public.profiles where is_admin and lower(username) = 'noob' limit 1;
  if admin_id is not null and admin_id <> p_user_id then
    insert into public.follows (follower_id, followee_id) values (p_user_id, admin_id) on conflict do nothing;
  end if;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.complete_oauth_profile(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.complete_oauth_profile(uuid, jsonb) to service_role;
