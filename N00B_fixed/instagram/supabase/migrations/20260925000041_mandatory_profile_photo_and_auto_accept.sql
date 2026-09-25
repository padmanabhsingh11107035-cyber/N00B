-- NOOB — three independent additions:
--
-- 1) A real profile photo is now required to create an account — the client no longer offers a
--    preset/random-character picker at all, so this closes the matching server-side gap: without
--    it, anyone bypassing the normal sign-up form (calling auth.signUp() directly) could still
--    create an account with no photo, silently falling back to the generic NOOB logo.
--
-- 2) Private accounts get an auto-accept-follow-requests switch: when on, anyone who requests to
--    follow is accepted immediately (never followed back automatically — that's a separate,
--    unrelated action). Stored in profiles.privacy_settings (already the home for per-user
--    settings like hideTaggedPhotos/blockedWords), no new column needed.
--
-- 3) A place for the admin console's new device/IP columns (populated by a later edge-function
--    call, not by this migration) — see profile_private.signup_platform below.

-- ===========================================================================
-- 1. Mandatory profile photo
-- ===========================================================================
-- Based on the CURRENT check_signup (20260922000020, which added the email-format check below) —
-- adds only the new avatar requirement, everything else is unchanged.
create or replace function public.check_signup(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  clean text;
  dob date;
  age numeric;
  em text := lower(btrim(coalesce(p->>'email', '')));
  mob text := btrim(coalesce(p->>'mobileNumber', ''));
begin
  if btrim(coalesce(p->>'firstName', '')) = '' then return jsonb_build_object('error', 'Please enter your name'); end if;
  if em = '' then return jsonb_build_object('error', 'Email address is required'); end if;
  if em !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' or length(em) > 254 then
    return jsonb_build_object('error', 'Please enter a valid email address');
  end if;
  if btrim(coalesce(p->>'username', '')) = '' then return jsonb_build_object('error', 'User ID / Username is required'); end if;
  if coalesce(p->>'password', '') = '' then return jsonb_build_object('error', 'Password is required'); end if;
  if btrim(coalesce(p->>'bio', '')) = '' then return jsonb_build_object('error', 'Bio is compulsory. Please write a short bio about yourself.'); end if;
  if mob = '' then return jsonb_build_object('error', 'Mobile number is required'); end if;
  if btrim(coalesce(p->>'avatar', '')) = '' then return jsonb_build_object('error', 'Please upload a profile photo. It is required to create a NOOB account.'); end if;
  if coalesce((p->>'agreedToTerms')::boolean, false) is not true then
    return jsonb_build_object('error', 'You must agree to NOOB''s general terms and privacy policy');
  end if;

  if coalesce(p->>'dateOfBirth', '') = '' then return jsonb_build_object('error', 'Date of birth is required'); end if;
  begin
    dob := (p->>'dateOfBirth')::date;
  exception when others then
    return jsonb_build_object('error', 'Please enter a valid date of birth');
  end;
  if dob > current_date then return jsonb_build_object('error', 'Please enter a valid date of birth'); end if;
  age := (current_date - dob) / 365.25;
  if age < 13 then return jsonb_build_object('error', 'You must be at least 13 years old to create a NOOB account'); end if;
  if age > 82 then return jsonb_build_object('error', 'NOOB accounts are only available to users 82 years old or younger'); end if;

  clean := regexp_replace(lower(btrim(p->>'username')), '[^a-z0-9_.]', '', 'g');
  if clean = '' then return jsonb_build_object('error', 'User ID contains invalid characters'); end if;
  if exists (select 1 from public.profiles where lower(username) = clean) then
    return jsonb_build_object('error', 'User ID is already taken. Please choose another.');
  end if;

  -- a suspended person can't just sign up again under a new name
  if exists (
    select 1 from public.profiles pr join public.profile_private pp on pp.user_id = pr.id
    where pr.is_suspended and (lower(pp.email) = em or (mob <> '' and pp.mobile_number = mob))
  ) then
    return jsonb_build_object(
      'error', 'This account is suspended.', 'suspended', true,
      'message', 'We have detected that your account is suspended, and attempting to create a new account could result in further action against you. Please wait — our team will contact you.'
    );
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.check_signup(jsonb) to anon, authenticated;

-- The real backstop: check_signup above is only a friendly pre-flight the normal sign-up form
-- always calls first — this is what actually creates the account, so it's what actually has to
-- refuse one with no photo, not just tell the form to. Data-import accounts (m ? 'legacy_id')
-- return before this and are unaffected.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  clean text := regexp_replace(lower(btrim(coalesce(m->>'username', ''))), '[^a-z0-9_.]', '', 'g');
  kind text := case when m->>'account_type' in ('private', 'business') then m->>'account_type' else 'public' end;
  first_n text := btrim(coalesce(m->>'first_name', ''));
  last_n text := btrim(coalesce(m->>'last_name', ''));
  admin_id uuid;
begin
  if m ? 'legacy_id' or clean = '' then
    return new;
  end if;

  if btrim(coalesce(m->>'avatar', '')) = '' then
    raise exception 'A profile photo is required to create a NOOB account.';
  end if;

  insert into public.profiles (id, username, display_name, avatar, bio, account_type, is_business, business_category)
  values (
    new.id, clean,
    coalesce(nullif(btrim(m->>'display_name'), ''), nullif(btrim(first_n || ' ' || last_n), ''), clean),
    btrim(m->>'avatar'),
    coalesce(nullif(btrim(m->>'bio'), ''), '🎉 Here for fun, laughs & connecting with cool people!'),
    kind, kind = 'business',
    case when kind = 'business' then coalesce(nullif(m->>'business_category', ''), 'Creator & Brand') else nullif(m->>'business_category', '') end
  );

  insert into public.profile_private (
    user_id, email, first_name, last_name, country_code, mobile_number, date_of_birth, gender,
    business_email, business_phone, business_address, business_addresses, agreed_to_terms
  ) values (
    new.id, lower(nullif(btrim(m->>'email'), '')), nullif(first_n, ''), nullif(last_n, ''),
    coalesce(nullif(m->>'country_code', ''), '+91 (IN)'), nullif(btrim(m->>'mobile_number'), ''),
    nullif(m->>'date_of_birth', '')::date, coalesce(nullif(m->>'gender', ''), 'Prefer not to say'),
    case when kind = 'business' then coalesce(nullif(m->>'business_email', ''), lower(nullif(btrim(m->>'email'), ''))) else nullif(m->>'business_email', '') end,
    case when kind = 'business' then coalesce(nullif(m->>'business_phone', ''), nullif(btrim(m->>'mobile_number'), '')) else nullif(m->>'business_phone', '') end,
    nullif(m->>'business_address', ''),
    case when nullif(m->>'business_address', '') is null then '{}'::text[] else array[m->>'business_address'] end,
    coalesce((m->>'agreed_to_terms')::boolean, false)
  );

  -- everyone starts out following the official NOOB account
  select id into admin_id from public.profiles where is_admin and lower(username) = 'noob' limit 1;
  if admin_id is not null and admin_id <> new.id then
    insert into public.follows (follower_id, followee_id) values (new.id, admin_id) on conflict do nothing;
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- 2. Auto-accept follow requests (private accounts)
-- ===========================================================================
-- Identical to the original except for the new "if auto_accept" branch inside the existing
-- "if t.account_type = 'private'" case — nothing else here changed.
create or replace function public.toggle_follow(p_target uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.profiles; auto_accept boolean;
begin
  if me is null then raise exception 'Unauthorized' using errcode = '28000'; end if;
  if p_target = me then raise exception 'You can''t follow yourself.'; end if;
  if (select is_suspended from public.profiles where id = me) then raise exception 'Unauthorized' using errcode = '28000'; end if;
  select * into t from public.profiles where id = p_target;
  if not found then raise exception 'User not found'; end if;

  if exists (select 1 from public.follows where follower_id = me and followee_id = p_target) then
    delete from public.follows where follower_id = me and followee_id = p_target;
  elsif exists (select 1 from public.follow_requests where requester_id = me and target_id = p_target) then
    delete from public.follow_requests where requester_id = me and target_id = p_target;
    delete from public.notifications
      where type = 'follow_request_received' and target_user_id = p_target and actor_id = me and action_status = 'pending';
  else
    if exists (select 1 from public.blocks b where (b.blocker_id = p_target and b.blocked_id = me) or (b.blocker_id = me and b.blocked_id = p_target)) then
      raise exception 'You can''t follow this account.';
    end if;
    if t.account_type = 'private' then
      auto_accept := coalesce((t.privacy_settings->>'autoAcceptFollowRequests')::boolean, false);
      if auto_accept then
        insert into public.follows (follower_id, followee_id) values (me, p_target) on conflict do nothing;
        perform public.notify_user(p_target, 'new_follower', me, 'started following you.');
      else
        insert into public.follow_requests (requester_id, target_id) values (me, p_target) on conflict do nothing;
        perform public.notify_user(p_target, 'follow_request_received', me, 'wants to follow you.', null, null, null, null, 'pending');
      end if;
    else
      insert into public.follows (follower_id, followee_id) values (me, p_target) on conflict do nothing;
      perform public.notify_user(p_target, 'new_follower', me, 'started following you.');
    end if;
  end if;

  return jsonb_build_object(
    'success', true,
    'isFollowing', exists (select 1 from public.follows where follower_id = me and followee_id = p_target),
    'isFollowRequested', exists (select 1 from public.follow_requests where requester_id = me and target_id = p_target),
    'followersCount', (select followers_count from public.profiles where id = p_target)
  );
end;
$$;

-- ===========================================================================
-- 3. Device/IP tracking — populated by a signup-time edge-function call (dynamic-handler's new
--    'record_signup_device' action, not by anything in this migration), surfaced to the admin
--    console's account-details view, which already had an (always-empty, since nothing ever
--    wrote it) ipAddress field wired up.
-- ===========================================================================
alter table public.profile_private add column if not exists signup_platform text;

create or replace function public.admin_user_json(p public.profiles) returns jsonb
language sql stable security definer set search_path = public as $$
  select public.user_public_json(p) || jsonb_build_object(
    'email', pp.email, 'firstName', pp.first_name, 'lastName', pp.last_name, 'countryCode', pp.country_code,
    'mobileNumber', pp.mobile_number, 'dateOfBirth', pp.date_of_birth, 'gender', pp.gender,
    'businessEmail', pp.business_email, 'businessPhone', pp.business_phone, 'businessAddress', pp.business_address,
    'isSuspended', p.is_suspended, 'suspendedReason', pp.suspended_reason,
    'proBilling', p.pro_billing, 'proRenewsAt', p.pro_renews_at,
    'ipAddress', pp.ip_address, 'signupPlatform', pp.signup_platform)
  from (select 1) one left join public.profile_private pp on pp.user_id = p.id;
$$;
