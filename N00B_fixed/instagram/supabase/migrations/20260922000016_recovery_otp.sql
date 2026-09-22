-- NOOB — "Forgot password": a second way in, alongside the existing security-question check (mobile + date of birth + email):
-- a one-time 6-digit code emailed to the address already on file. Purely ADDITIVE — the existing recovery_check function and flow are
-- untouched, so nothing about today's "forgot password" changes unless somebody chooses the new "email me a code" option.
--
-- The code itself is generated and checked entirely in the database; only its SALTED HASH is ever stored (never the code itself), it
-- expires in 10 minutes, allows 5 wrong tries before it is thrown away, and sending is both rate-limited per account and given a short
-- cooldown so one account's inbox can not be spammed. The email is sent by the "recover-account" Edge Function (see its updated code),
-- which is the only caller allowed to reach either function here.

create table if not exists public.recovery_otps (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  code_hash  text not null,
  attempts   integer not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists recovery_otps_user_idx on public.recovery_otps (user_id, created_at desc);
alter table public.recovery_otps enable row level security;
revoke all on public.recovery_otps from anon, authenticated;
grant all on public.recovery_otps to service_role;

-- A code is hashed together with the account id, so the same 6 digits hash differently for every account (one leaked hash from
-- some other table could never be replayed here). sha256() is Postgres's own built-in — no extension needed.
create or replace function public.recovery_otp_hash(p_user uuid, p_code text) returns text
language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(btrim(coalesce(p_code, '')) || ':' || p_user::text, 'UTF8')), 'hex');
$$;

-- Make (and "send") a fresh code for this account. Returns the code itself ONLY to the Edge Function (service_role) that must email
-- it — nobody else may ever call this. The same generic per-username / per-IP guess limits as the existing recovery check apply, so an
-- attacker can not use this as a second door to get around them; on top of that, an account can not be emailed more than 3 codes an
-- hour, and codes are at least 45 seconds apart, so one account's inbox can not be spammed.
create or replace function public.recovery_otp_request(p_ip text, p_username text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uname text := lower(btrim(coalesce(p_username, '')));
  v_ip  text := coalesce(nullif(btrim(p_ip), ''), 'unknown');
  pr public.profiles; pp public.profile_private;
  recent integer; last_at timestamptz;
  code text;
begin
  delete from public.recovery_attempts where created_at < now() - interval '2 days';
  delete from public.recovery_otps where created_at < now() - interval '1 day';

  if uname = '' then return jsonb_build_object('status', 'missing_username'); end if;
  if (select count(*) from public.recovery_attempts a where not a.ok and a.username = uname and a.created_at > now() - interval '1 hour') >= 8
     or (select count(*) from public.recovery_attempts a where not a.ok and a.ip = v_ip and a.created_at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select * into pr from public.profiles where lower(username) = uname;
  if not found then
    insert into public.recovery_attempts (ip, username, ok) values (v_ip, uname, false);
    return jsonb_build_object('status', 'not_found');
  end if;
  if pr.is_suspended then return jsonb_build_object('status', 'suspended'); end if;

  select * into pp from public.profile_private where user_id = pr.id;
  if coalesce(pp.email, '') = '' then return jsonb_build_object('status', 'no_email'); end if;

  select count(*), max(created_at) into recent, last_at from public.recovery_otps where user_id = pr.id and created_at > now() - interval '1 hour';
  if recent >= 3 then return jsonb_build_object('status', 'rate_limited'); end if;
  if last_at is not null and last_at > now() - interval '45 seconds' then return jsonb_build_object('status', 'cooldown'); end if;

  code := lpad(floor(random() * 1000000)::text, 6, '0');
  insert into public.recovery_otps (user_id, code_hash, expires_at) values (pr.id, public.recovery_otp_hash(pr.id, code), now() + interval '10 minutes');
  insert into public.recovery_attempts (ip, username, ok) values (v_ip, uname, true);
  return jsonb_build_object('status', 'ok', 'userId', pr.id, 'email', pp.email, 'code', code);
end;
$$;

-- Check a typed-in code. On success the newest un-expired code (and every other outstanding one for the account) is thrown away, so a
-- code can only ever be used once and asking for a new one invalidates an older, still-live one.
create or replace function public.recovery_otp_verify(p_ip text, p_username text, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uname text := lower(btrim(coalesce(p_username, '')));
  v_ip  text := coalesce(nullif(btrim(p_ip), ''), 'unknown');
  pr public.profiles; rec public.recovery_otps; ok boolean;
begin
  if uname = '' then return jsonb_build_object('status', 'missing_username'); end if;
  if btrim(coalesce(p_code, '')) = '' then return jsonb_build_object('status', 'missing'); end if;
  if (select count(*) from public.recovery_attempts a where not a.ok and a.username = uname and a.created_at > now() - interval '1 hour') >= 8
     or (select count(*) from public.recovery_attempts a where not a.ok and a.ip = v_ip and a.created_at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select * into pr from public.profiles where lower(username) = uname;
  if not found then
    insert into public.recovery_attempts (ip, username, ok) values (v_ip, uname, false);
    return jsonb_build_object('status', 'not_found');
  end if;
  if pr.is_suspended then return jsonb_build_object('status', 'suspended'); end if;

  select * into rec from public.recovery_otps where user_id = pr.id and expires_at > now() order by created_at desc limit 1;
  if not found then
    insert into public.recovery_attempts (ip, username, ok) values (v_ip, uname, false);
    return jsonb_build_object('status', 'expired');
  end if;

  -- 5 wrong tries are allowed; whichever call reaches the 5th one throws the code away then and there (even if that same call happens
  -- to be the right code, it still succeeds — the limit is only on WRONG tries).
  ok := public.recovery_otp_hash(pr.id, p_code) = rec.code_hash;
  insert into public.recovery_attempts (ip, username, ok) values (v_ip, uname, ok);
  if ok then
    delete from public.recovery_otps where user_id = pr.id;
    return jsonb_build_object('status', 'ok', 'userId', pr.id);
  end if;
  if rec.attempts + 1 >= 5 then
    delete from public.recovery_otps where user_id = pr.id;
    return jsonb_build_object('status', 'too_many_attempts');
  end if;
  update public.recovery_otps set attempts = attempts + 1 where id = rec.id;
  return jsonb_build_object('status', 'mismatch');
end;
$$;

-- Only the Edge Function (service key) may call any of this, exactly like the existing recovery_check.
revoke execute on function public.recovery_otp_hash(uuid, text), public.recovery_otp_request(text, text), public.recovery_otp_verify(text, text, text)
  from public, anon, authenticated;
grant execute on function public.recovery_otp_hash(uuid, text), public.recovery_otp_request(text, text), public.recovery_otp_verify(text, text, text)
  to service_role;
