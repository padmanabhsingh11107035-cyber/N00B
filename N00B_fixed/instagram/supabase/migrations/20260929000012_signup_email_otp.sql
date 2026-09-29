-- NOOB — verify the email address BEFORE an account is created: a 6-digit code is emailed to it,
-- and only once that code is entered correctly can signup actually proceed. Mirrors the existing
-- recovery_otp_request/verify (20260922000016) almost exactly, but keyed by email instead of an
-- existing account, since there is no account yet — and the real backstop is handle_new_user()
-- itself refusing to create an account for an unverified email, not just check_signup's friendly
-- pre-flight, exactly like the mandatory-avatar requirement (20260925000041) added before it.

create table if not exists public.signup_otp_attempts (
  id         uuid primary key default gen_random_uuid(),
  ip         text not null,
  email      text not null,
  ok         boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists signup_otp_attempts_idx on public.signup_otp_attempts (email, created_at desc);
alter table public.signup_otp_attempts enable row level security;
revoke all on public.signup_otp_attempts from anon, authenticated;
grant all on public.signup_otp_attempts to service_role;

create table if not exists public.signup_otps (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  code_hash   text not null,
  attempts    integer not null default 0,
  verified_at timestamptz,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists signup_otps_email_idx on public.signup_otps (lower(email), created_at desc);
alter table public.signup_otps enable row level security;
revoke all on public.signup_otps from anon, authenticated;
grant all on public.signup_otps to service_role;

create or replace function public.signup_otp_hash(p_email text, p_code text) returns text
language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(btrim(coalesce(p_code, '')) || ':' || lower(btrim(coalesce(p_email, ''))), 'UTF8')), 'hex');
$$;

-- Same guess/spam limits as recovery_otp_request (8 failed/hour per email, 30/hour per IP, 3-per-hour
-- send cap, 45s cooldown) — only the "who" being checked (an email, not yet an account) differs.
create or replace function public.signup_otp_request(p_ip text, p_email text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  em   text := lower(btrim(coalesce(p_email, '')));
  v_ip text := coalesce(nullif(btrim(p_ip), ''), 'unknown');
  recent integer; last_at timestamptz;
  code text;
begin
  delete from public.signup_otp_attempts where created_at < now() - interval '2 days';
  delete from public.signup_otps where created_at < now() - interval '1 day';

  if em = '' or em !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    return jsonb_build_object('status', 'invalid_email');
  end if;

  if (select count(*) from public.signup_otp_attempts a where not a.ok and a.email = em and a.created_at > now() - interval '1 hour') >= 8
     or (select count(*) from public.signup_otp_attempts a where not a.ok and a.ip = v_ip and a.created_at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  if exists (select 1 from public.profile_private where lower(email) = em) then
    return jsonb_build_object('status', 'already_registered');
  end if;

  select count(*), max(created_at) into recent, last_at from public.signup_otps where lower(email) = em and created_at > now() - interval '1 hour';
  if recent >= 5 then return jsonb_build_object('status', 'rate_limited'); end if;
  if last_at is not null and last_at > now() - interval '45 seconds' then return jsonb_build_object('status', 'cooldown'); end if;

  code := lpad(floor(random() * 1000000)::text, 6, '0');
  insert into public.signup_otps (email, code_hash, expires_at) values (em, public.signup_otp_hash(em, code), now() + interval '10 minutes');
  insert into public.signup_otp_attempts (ip, email, ok) values (v_ip, em, true);
  return jsonb_build_object('status', 'ok', 'code', code);
end;
$$;

-- On success the row is kept (not deleted, unlike recovery's) and its expiry pushed out 30 minutes —
-- check_signup / handle_new_user look for exactly this "verified and not yet expired" row a little
-- later, once the rest of the sign-up form is filled in and submitted.
create or replace function public.signup_otp_verify(p_ip text, p_email text, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  em   text := lower(btrim(coalesce(p_email, '')));
  v_ip text := coalesce(nullif(btrim(p_ip), ''), 'unknown');
  rec public.signup_otps; ok boolean;
begin
  if em = '' then return jsonb_build_object('status', 'missing_email'); end if;
  if btrim(coalesce(p_code, '')) = '' then return jsonb_build_object('status', 'missing'); end if;
  if (select count(*) from public.signup_otp_attempts a where not a.ok and a.email = em and a.created_at > now() - interval '1 hour') >= 8
     or (select count(*) from public.signup_otp_attempts a where not a.ok and a.ip = v_ip and a.created_at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select * into rec from public.signup_otps where lower(email) = em and expires_at > now() and verified_at is null order by created_at desc limit 1;
  if not found then
    insert into public.signup_otp_attempts (ip, email, ok) values (v_ip, em, false);
    return jsonb_build_object('status', 'expired');
  end if;

  ok := public.signup_otp_hash(em, p_code) = rec.code_hash;
  insert into public.signup_otp_attempts (ip, email, ok) values (v_ip, em, ok);
  if ok then
    update public.signup_otps set verified_at = now(), expires_at = now() + interval '30 minutes' where id = rec.id;
    return jsonb_build_object('status', 'ok');
  end if;
  if rec.attempts + 1 >= 5 then
    delete from public.signup_otps where id = rec.id;
    return jsonb_build_object('status', 'too_many_attempts');
  end if;
  update public.signup_otps set attempts = attempts + 1 where id = rec.id;
  return jsonb_build_object('status', 'mismatch');
end;
$$;

revoke execute on function public.signup_otp_hash(text, text), public.signup_otp_request(text, text), public.signup_otp_verify(text, text, text)
  from public, anon, authenticated;
grant execute on function public.signup_otp_hash(text, text), public.signup_otp_request(text, text), public.signup_otp_verify(text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------------------------------
-- The two enforcement points, same pattern as the mandatory-avatar requirement: check_signup is only
-- a friendly pre-flight the form calls first; handle_new_user is the real backstop that refuses to
-- create the account at all, so it can't be bypassed by calling auth.signUp() directly.
-- ---------------------------------------------------------------------------------------------------

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

  if not exists (select 1 from public.signup_otps where lower(email) = em and verified_at is not null and expires_at > now()) then
    return jsonb_build_object('error', 'Please verify your email with the code we sent before creating your account.');
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

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  clean text := regexp_replace(lower(btrim(coalesce(m->>'username', ''))), '[^a-z0-9_.]', '', 'g');
  em text := lower(nullif(btrim(m->>'email'), ''));
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

  if em is null or not exists (select 1 from public.signup_otps where lower(email) = em and verified_at is not null and expires_at > now()) then
    raise exception 'Please verify your email before creating your account.';
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
    new.id, em, nullif(first_n, ''), nullif(last_n, ''),
    coalesce(nullif(m->>'country_code', ''), '+91 (IN)'), nullif(btrim(m->>'mobile_number'), ''),
    nullif(m->>'date_of_birth', '')::date, coalesce(nullif(m->>'gender', ''), 'Prefer not to say'),
    case when kind = 'business' then coalesce(nullif(m->>'business_email', ''), em) else nullif(m->>'business_email', '') end,
    case when kind = 'business' then coalesce(nullif(m->>'business_phone', ''), nullif(btrim(m->>'mobile_number'), '')) else nullif(m->>'business_phone', '') end,
    nullif(m->>'business_address', ''),
    case when nullif(m->>'business_address', '') is null then '{}'::text[] else array[m->>'business_address'] end,
    coalesce((m->>'agreed_to_terms')::boolean, false)
  );

  -- used up: the same email can't be replayed for a second account without a fresh code
  delete from public.signup_otps where lower(email) = em;

  -- everyone starts out following the official NOOB account
  select id into admin_id from public.profiles where is_admin and lower(username) = 'noob' limit 1;
  if admin_id is not null and admin_id <> new.id then
    insert into public.follows (follower_id, followee_id) values (new.id, admin_id) on conflict do nothing;
  end if;
  return new;
end;
$$;
