-- NOOB — Login approval by email ("2-step login"). After the right User ID and password, an email asks "Is this you?" with two buttons:
-- "Yes, it's me" logs the waiting device in at once, "No, it's not me" shows "Access denied" there. No code is typed anywhere.
--
-- It is OPT-IN, per account (Settings -> Your NOOB account -> Login approval, and the switch near the bottom of the profile's three-dots menu): nobody is asked for an approval
-- unless they turned it on, and turning it on is itself confirmed by an email (so an address that cannot receive mail can never lock someone out of their own account).
-- Purely ADDITIVE: two new tables and some new functions. No existing table, column, function or row is changed or removed, so nothing about today's login changes for anyone
-- until the app and the "recover-account" function are updated AND a person switches it on.
--
-- Secrets: the three secrets of a request (the waiting screen's own, and one for each button in the email) are long random strings; only their SHA-256 hashes are stored.
-- Everything except the three small "ask" functions at the bottom may only be called by the Edge Function (service key), exactly like the emailed recovery code.

-- ------------------------------------------------------------------------------------------------ who has it switched on
create table if not exists public.login_approval_settings (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  enabled    boolean not null default false,
  enabled_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.login_approval_settings enable row level security;
revoke all on public.login_approval_settings from anon, authenticated;
grant all on public.login_approval_settings to service_role;

-- ------------------------------------------------------------------------------------------------ the questions that were asked
create table if not exists public.login_challenges (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  purpose    text not null default 'login' check (purpose in ('login', 'enable')),
  status     text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'used', 'expired')),
  poll_hash  text not null,
  yes_hash   text not null,
  no_hash    text not null,
  device     text not null default '',
  ip         text not null default '',
  expires_at timestamptz not null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists login_challenges_user_idx on public.login_challenges (user_id, created_at desc);
alter table public.login_challenges enable row level security;
revoke all on public.login_challenges from anon, authenticated;
grant all on public.login_challenges to service_role;

create or replace function public.login_approval_hash(p_secret text) returns text
language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(coalesce(p_secret, ''), 'UTF8')), 'hex');
$$;

-- a long random secret (two random UUIDs, 244 bits)
create or replace function public.login_approval_secret() returns text
language sql volatile set search_path = public as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
$$;

-- ------------------------------------------------------------------------------------------------ 1. the login box: does this account ask for an approval?
-- Same lookup as resolve_login_email (user ID, email or mobile number; anything else gets a random address that matches nobody), so it says "no" for everything unknown.
create or replace function public.login_approval_needed(identifier text) returns boolean
language plpgsql security definer set search_path = public as $$
declare needed boolean;
begin
  select (s.enabled and coalesce(pp.email, '') <> '') into needed
  from auth.users u
  join public.login_approval_settings s on s.user_id = u.id
  left join public.profile_private pp on pp.user_id = u.id
  where u.email = public.resolve_login_email(identifier)
  limit 1;
  return coalesce(needed, false);
end;
$$;

-- ------------------------------------------------------------------------------------------------ 2. credentials: is this the right password? (the Edge Function asks, nothing is signed in)
-- Wrong passwords are counted in recovery_attempts, with the same limits the other recovery checks use (8 wrong per account and 30 per address in an hour).
create or replace function public.login_approval_check(p_ip text, p_identifier text, p_password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  ident text := btrim(coalesce(p_identifier, ''));
  v_ip  text := coalesce(nullif(btrim(p_ip), ''), 'unknown');
  login_email text; uid uuid; enc text; pr public.profiles; pp public.profile_private; uname text; req boolean;
begin
  delete from public.recovery_attempts where created_at < now() - interval '2 days';
  delete from public.login_challenges where created_at < now() - interval '2 days';
  if ident = '' or coalesce(p_password, '') = '' then return jsonb_build_object('status', 'missing'); end if;

  uname := lower(ident);
  if (select count(*) from public.recovery_attempts a where not a.ok and a.ip = v_ip and a.created_at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  login_email := public.resolve_login_email(ident);
  select u.id, u.encrypted_password into uid, enc from auth.users u where u.email = login_email;
  if uid is null then
    insert into public.recovery_attempts (ip, username, ok) values (v_ip, uname, false);
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into pr from public.profiles where id = uid;
  if not found then
    insert into public.recovery_attempts (ip, username, ok) values (v_ip, uname, false);
    return jsonb_build_object('status', 'not_found');
  end if;
  uname := lower(pr.username);
  if (select count(*) from public.recovery_attempts a where not a.ok and a.username = uname and a.created_at > now() - interval '1 hour') >= 8 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if pr.is_suspended then
    select * into pp from public.profile_private where user_id = uid;
    return jsonb_build_object('status', 'suspended', 'reason', pp.suspended_reason);
  end if;
  if enc is null or crypt(p_password, enc) <> enc then
    insert into public.recovery_attempts (ip, username, ok) values (v_ip, uname, false);
    return jsonb_build_object('status', 'bad_password');
  end if;
  insert into public.recovery_attempts (ip, username, ok) values (v_ip, uname, true);

  select * into pp from public.profile_private where user_id = uid;
  select coalesce((select s.enabled from public.login_approval_settings s where s.user_id = uid), false) and coalesce(pp.email, '') <> '' into req;
  return jsonb_build_object('status', 'ok', 'userId', uid, 'required', req);
end;
$$;

-- ------------------------------------------------------------------------------------------------ 3. make the question (the Edge Function then emails it)
-- purpose 'login'  : someone entered the right password
-- purpose 'enable' : the person is turning the setting on (approving that email switches it on)
-- An address can not be spammed: 20 seconds between emails and 8 an hour per account. An older, still-open question of the same kind is closed when a new one is made.
create or replace function public.login_approval_create(p_user uuid, p_purpose text, p_device text, p_ip text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  pr public.profiles; pp public.profile_private; recent integer; last_at timestamptz;
  t_poll text; t_yes text; t_no text; cid uuid; kind text := case when p_purpose = 'enable' then 'enable' else 'login' end;
begin
  select * into pr from public.profiles where id = p_user;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select * into pp from public.profile_private where user_id = p_user;
  if coalesce(pp.email, '') = '' then return jsonb_build_object('status', 'no_email'); end if;

  select count(*), max(created_at) into recent, last_at from public.login_challenges where user_id = p_user and created_at > now() - interval '1 hour';
  if recent >= 8 then return jsonb_build_object('status', 'rate_limited'); end if;
  if last_at is not null and last_at > now() - interval '20 seconds' then
    return jsonb_build_object('status', 'cooldown', 'seconds', greatest(1, ceil(extract(epoch from (last_at + interval '20 seconds' - now())))::int));
  end if;

  update public.login_challenges set status = 'expired' where user_id = p_user and purpose = kind and status = 'pending';

  t_poll := public.login_approval_secret(); t_yes := public.login_approval_secret(); t_no := public.login_approval_secret();
  insert into public.login_challenges (user_id, purpose, poll_hash, yes_hash, no_hash, device, ip, expires_at)
  values (p_user, kind, public.login_approval_hash(t_poll), public.login_approval_hash(t_yes), public.login_approval_hash(t_no),
          left(btrim(coalesce(p_device, '')), 120), left(btrim(coalesce(p_ip, '')), 64), now() + interval '10 minutes')
  returning id into cid;
  return jsonb_build_object('status', 'ok', 'id', cid, 'poll', t_poll, 'yes', t_yes, 'no', t_no, 'email', pp.email,
                            'username', pr.username, 'displayName', coalesce(nullif(pr.display_name, ''), pr.username));
end;
$$;

-- ------------------------------------------------------------------------------------------------ 4. a button in the email was tapped
-- One answer only: the first tap decides, and a later tap on the other button changes nothing. Approving an 'enable' question switches the setting on.
create or replace function public.login_approval_decide(p_id uuid, p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.login_challenges; h text := public.login_approval_hash(p_token);
begin
  select * into c from public.login_challenges where id = p_id for update;
  if not found or (h <> c.yes_hash and h <> c.no_hash) then return jsonb_build_object('status', 'invalid'); end if;
  if c.status = 'pending' and c.expires_at <= now() then
    update public.login_challenges set status = 'expired' where id = c.id;
    return jsonb_build_object('status', 'expired');
  end if;
  if c.status <> 'pending' then return jsonb_build_object('status', 'already', 'result', c.status, 'purpose', c.purpose); end if;
  if h = c.yes_hash then
    update public.login_challenges set status = 'approved', decided_at = now() where id = c.id;
    if c.purpose = 'enable' then
      insert into public.login_approval_settings (user_id, enabled, enabled_at, updated_at) values (c.user_id, true, now(), now())
      on conflict (user_id) do update set enabled = true, enabled_at = now(), updated_at = now();
    end if;
    return jsonb_build_object('status', 'approved', 'purpose', c.purpose);
  end if;
  update public.login_challenges set status = 'denied', decided_at = now() where id = c.id;
  return jsonb_build_object('status', 'denied', 'purpose', c.purpose);
end;
$$;

-- ------------------------------------------------------------------------------------------------ 5. the waiting screen asks "was it answered?"
-- An approved LOGIN question can be collected once: the first poll that sees it marks it 'used' and says redeem = true (the Edge Function then makes the sign-in token).
create or replace function public.login_approval_poll(p_id uuid, p_poll text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.login_challenges;
begin
  select * into c from public.login_challenges where id = p_id for update;
  if not found or public.login_approval_hash(p_poll) <> c.poll_hash then return jsonb_build_object('status', 'invalid'); end if;
  if c.status = 'pending' and c.expires_at <= now() then
    update public.login_challenges set status = 'expired' where id = c.id;
    return jsonb_build_object('status', 'expired', 'purpose', c.purpose);
  end if;
  if c.status = 'approved' and c.purpose = 'login' then
    update public.login_challenges set status = 'used' where id = c.id;
    return jsonb_build_object('status', 'approved', 'purpose', c.purpose, 'redeem', true, 'userId', c.user_id);
  end if;
  return jsonb_build_object('status', c.status, 'purpose', c.purpose);
end;
$$;

-- ------------------------------------------------------------------------------------------------ 6. the signed-in person: is it on? (and turning it off)
create or replace function public.my_login_approval() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  return jsonb_build_object(
    'enabled', coalesce((select s.enabled from public.login_approval_settings s where s.user_id = me), false),
    'hasEmail', coalesce((select pp.email from public.profile_private pp where pp.user_id = me), '') <> ''
  );
end;
$$;

-- Turning it OFF needs the password again (a stranger on someone's unlocked phone must not be able to take the protection away). Wrong passwords are counted like everywhere else.
create or replace function public.login_approval_turn_off(p_password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me uuid := auth.uid(); enc text; uname text;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select lower(username) into uname from public.profiles where id = me;
  if (select count(*) from public.recovery_attempts a where not a.ok and a.username = uname and a.created_at > now() - interval '1 hour') >= 8 then
    return jsonb_build_object('success', false, 'error', 'Too many wrong passwords. Please try again in a while.');
  end if;
  select encrypted_password into enc from auth.users where id = me;
  if coalesce(p_password, '') = '' or enc is null or crypt(p_password, enc) <> enc then
    -- answered (not raised) so that the wrong try is really saved: an error would undo it
    insert into public.recovery_attempts (ip, username, ok) values ('app', uname, false);
    return jsonb_build_object('success', false, 'error', 'Incorrect password. Please enter your password to turn this off.');
  end if;
  insert into public.login_approval_settings (user_id, enabled, updated_at) values (me, false, now())
  on conflict (user_id) do update set enabled = false, updated_at = now();
  update public.login_challenges set status = 'expired' where user_id = me and status = 'pending';
  return jsonb_build_object('success', true);
end;
$$;

-- ------------------------------------------------------------------------------------------------ who may call what
revoke execute on function public.login_approval_hash(text), public.login_approval_secret(),
  public.login_approval_check(text, text, text), public.login_approval_create(uuid, text, text, text),
  public.login_approval_decide(uuid, text), public.login_approval_poll(uuid, text)
  from public, anon, authenticated;
grant execute on function public.login_approval_hash(text), public.login_approval_secret(),
  public.login_approval_check(text, text, text), public.login_approval_create(uuid, text, text, text),
  public.login_approval_decide(uuid, text), public.login_approval_poll(uuid, text)
  to service_role;

revoke execute on function public.login_approval_needed(text) from public;
grant execute on function public.login_approval_needed(text) to anon, authenticated, service_role;
revoke execute on function public.my_login_approval(), public.login_approval_turn_off(text) from public, anon;
grant execute on function public.my_login_approval(), public.login_approval_turn_off(text) to authenticated, service_role;
