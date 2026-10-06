-- 1) One signed-in device at a time per account. device_sessions is purely an app-level bookkeeping
--    table (it never touches Supabase Auth's own session store) — logging in on a second device is
--    blocked at the APP layer: upsert_device_session refuses to register a new device while another
--    of the account's devices is still active, and the device that gets remotely logged out finds out
--    via a realtime subscription on its own row (see subscribeToDeviceRevoked in the client), with the
--    existing 30s session-status poll as a fallback for a tab that was asleep when the push happened.
--
-- 2) A phone number can only belong to one account, enforced going forward only (existing accounts are
--    left exactly as they are — this only ever runs at the moment of a NEW signup). Email uniqueness
--    going forward already exists (signup_otp_request refuses to issue a code for an already-registered
--    email), so this closes the one remaining gap: mobile_number had no uniqueness check at all.

create table public.device_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  device_id     text not null,
  device_label  text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  revoked_at    timestamptz,
  unique (user_id, device_id)
);
create index device_sessions_active_idx on public.device_sessions (user_id) where revoked_at is null;

alter table public.device_sessions enable row level security;
create policy device_sessions_select on public.device_sessions for select to authenticated
  using (user_id = auth.uid());
grant select on public.device_sessions to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'device_sessions') then
    alter publication supabase_realtime add table public.device_sessions;
  end if;
end
$$;

-- Called right after a successful login/signup AND once at app boot for an already-signed-in session
-- (so a returning user with a session from before this feature shipped is checked too). Registers this
-- device as the active one UNLESS another of this account's devices is already active, in which case it
-- reports that device list instead so the UI can offer to log one of them out.
create or replace function public.upsert_device_session(p_device_id text, p_device_label text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  others jsonb;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if coalesce(btrim(p_device_id), '') = '' then raise exception 'Missing device id.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'deviceId', d.device_id, 'label', coalesce(d.device_label, 'Another device'),
    'lastSeenAt', d.last_seen_at, 'createdAt', d.created_at
  ) order by d.last_seen_at desc), '[]'::jsonb)
  into others
  from public.device_sessions d
  where d.user_id = me and d.revoked_at is null and d.device_id <> p_device_id;

  if jsonb_array_length(others) > 0 then
    return jsonb_build_object('conflict', true, 'devices', others);
  end if;

  insert into public.device_sessions (user_id, device_id, device_label, last_seen_at, revoked_at)
    values (me, p_device_id, nullif(btrim(p_device_label), ''), now(), null)
  on conflict (user_id, device_id) do update
    set device_label = coalesce(excluded.device_label, public.device_sessions.device_label),
        last_seen_at = now(), revoked_at = null;

  return jsonb_build_object('conflict', false);
end;
$$;

-- Self-service only: a user can revoke their OWN other device (never anyone else's), which is exactly
-- the "log out that device so I can use this one" action the conflict screen offers.
create or replace function public.revoke_device_session(p_device_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  update public.device_sessions set revoked_at = now()
  where user_id = me and device_id = p_device_id and revoked_at is null;
  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.upsert_device_session(text, text) to authenticated;
grant execute on function public.revoke_device_session(text) to authenticated;

-- -----------------------------------------------------------------------------------------------
-- Phone-number uniqueness, going forward only — same two-layer pattern (friendly pre-check +
-- trigger backstop) already used for the mandatory-avatar and email-verification requirements.
-- -----------------------------------------------------------------------------------------------
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

  if exists (select 1 from public.profile_private where mobile_number = mob) then
    return jsonb_build_object('error', 'An account with that mobile number already exists.');
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
  mob text := nullif(btrim(m->>'mobile_number'), '');
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

  if mob is not null and exists (select 1 from public.profile_private where mobile_number = mob) then
    raise exception 'An account with that mobile number already exists.';
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
    coalesce(nullif(m->>'country_code', ''), '+91 (IN)'), mob,
    nullif(m->>'date_of_birth', '')::date, coalesce(nullif(m->>'gender', ''), 'Prefer not to say'),
    case when kind = 'business' then coalesce(nullif(m->>'business_email', ''), em) else nullif(m->>'business_email', '') end,
    case when kind = 'business' then coalesce(nullif(m->>'business_phone', ''), mob) else nullif(m->>'business_phone', '') end,
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
