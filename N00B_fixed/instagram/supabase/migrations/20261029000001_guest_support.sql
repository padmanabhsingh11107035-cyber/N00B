-- NOOB — customer support for people who are NOT logged in ("guest support"). A round help button on the login page opens a chat that first asks for the email of the account,
-- then what is wrong, then the User ID (or "I forgot my ID"); after that the person can ask the helper to email a 6-digit code to the address on file and, once the right code is typed
-- in the chat, is logged in. A browser may use guest support only 3 times.
--
-- Purely ADDITIVE: three new tables and new functions. No existing table, row, function or policy is changed, and nothing is deleted anywhere.
--
-- Who can do what (nothing here is open to the public):
--   * The three tables can be read and written by nobody but the server (the "recover-account" Edge Function with its private service key). The app's public key can not even see them.
--   * Every function here can be called only by that server key, EXCEPT the two admin ones, which check that the caller is the NOOB administrator.
--   * The visitor holds a "case key" (64 random characters, made here, shown once); only its salted hash is stored. A case can be used only with its key, from the browser that began it,
--     for 24 hours, and only while it is open. Browser ids, network addresses and keys are all stored as salted hashes, so the table can not be turned back into them.
--   * The emailed code is the SAME kind of code as the "forgot password" code (table recovery_otps: salted hash only, 10 minutes, 5 wrong tries, 3 codes an hour per account, 45 seconds
--     between codes) and shares its guess limits (recovery_attempts), so this is not a second, weaker door: the two share every limit.
--   * On top: a case may ask for 3 codes; a network may start 12 cases a day and ask for 10 codes an hour; an email may be looked up 10 times an hour per browser and 40 per network.

-- A secret salt (made once, here) for the hashes below.
create table if not exists public.guest_support_secret (
  only_row boolean primary key default true check (only_row),
  salt     text not null default (gen_random_uuid()::text || gen_random_uuid()::text)
);
insert into public.guest_support_secret (only_row) values (true) on conflict (only_row) do nothing;
alter table public.guest_support_secret enable row level security;
revoke all on public.guest_support_secret from public, anon, authenticated;
grant all on public.guest_support_secret to service_role;

-- How many times each browser has used guest support (the allowance is 3, for good: it only goes up).
create table if not exists public.guest_support_browsers (
  browser_hash text primary key,
  uses         integer not null default 0 check (uses >= 0),
  first_at     timestamptz not null default now(),
  last_at      timestamptz not null default now()
);
alter table public.guest_support_browsers enable row level security;
revoke all on public.guest_support_browsers from public, anon, authenticated;
grant all on public.guest_support_browsers to service_role;

-- One row for every guest support chat that was started: who (the email they typed), what (the problem they described), and how it went. The administrator can read them.
create table if not exists public.guest_support_cases (
  id           uuid primary key default gen_random_uuid(),
  key_hash     text not null,
  browser_hash text not null,
  ip_hash      text not null,
  email        text not null,
  user_id      uuid references public.profiles (id) on delete set null,   -- the account that email belongs to (empty when there is none, or more than one until an ID is given)
  many         boolean not null default false,                            -- more than one account uses that email
  id_state     text not null default 'none' check (id_state in ('none', 'matched', 'forgot', 'mismatch')),
  claimed_id   text,
  issue        text not null,
  kind         text not null default 'other' check (kind in ('login', 'password', 'forgot_id', 'suspended', 'signup', 'other')),
  messages     integer not null default 0,
  id_checks    integer not null default 0,
  otp_sends    integer not null default 0,
  otp_fails    integer not null default 0,
  status       text not null default 'open' check (status in ('open', 'signed_in', 'closed')),
  created_at   timestamptz not null default now(),
  last_at      timestamptz not null default now()
);
create index if not exists guest_support_cases_browser_idx on public.guest_support_cases (browser_hash, created_at desc);
create index if not exists guest_support_cases_created_idx on public.guest_support_cases (created_at desc);
create index if not exists guest_support_cases_user_idx on public.guest_support_cases (user_id) where user_id is not null;
alter table public.guest_support_cases enable row level security;
revoke all on public.guest_support_cases from public, anon, authenticated;
grant all on public.guest_support_cases to service_role;

-- ------------------------------------------------------------------ small helpers
create or replace function public.guest_support_hash(p_text text) returns text
language sql stable security definer set search_path = public as $$
  select encode(sha256(convert_to(coalesce(p_text, '') || ':' || (select salt from public.guest_support_secret limit 1), 'UTF8')), 'hex');
$$;

-- A browser id is a random id the app keeps in the browser (16 to 80 letters, digits, - and _).
create or replace function public.guest_support_clean_browser(p text) returns text
language sql immutable set search_path = public as $$
  select case when btrim(coalesce(p, '')) ~ '^[A-Za-z0-9_-]{16,80}$' then btrim(p) else null end;
$$;

-- An email address: trimmed, lower case, at most 254 characters, one @ with something on both sides and a dot after it.
create or replace function public.guest_support_clean_email(p text) returns text
language sql immutable set search_path = public as $$
  select case
    when length(btrim(coalesce(p, ''))) between 5 and 254 and lower(btrim(p)) ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then lower(btrim(p))
    else null end;
$$;

-- A six-digit code from the database's secure random numbers (gen_random_uuid is made from them).
create or replace function public.guest_support_code() returns text
language sql volatile set search_path = public as $$
  select lpad((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint % 1000000)::text, 6, '0');
$$;

-- The open case behind a case id + key + browser (nothing when any of the three is wrong, or it is older than 24 hours, or it is no longer open).
create or replace function public.guest_support_get_case(p_case uuid, p_key text, p_browser text) returns public.guest_support_cases
language sql stable security definer set search_path = public as $$
  select c.* from public.guest_support_cases c
  where c.id = p_case and c.status = 'open' and c.created_at > now() - interval '24 hours'
    and c.key_hash = public.guest_support_hash('k:' || coalesce(p_key, ''))
    and c.browser_hash = public.guest_support_hash('b:' || coalesce(public.guest_support_clean_browser(p_browser), ''));
$$;

-- ------------------------------------------------------------------ how many times this browser has used guest support
create or replace function public.guest_support_status(p_browser text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare br text := public.guest_support_clean_browser(p_browser); u integer;
begin
  if br is null then return jsonb_build_object('status', 'bad_browser'); end if;
  select b.uses into u from public.guest_support_browsers b where b.browser_hash = public.guest_support_hash('b:' || br);
  u := coalesce(u, 0);
  return jsonb_build_object('status', case when u >= 3 then 'limit_reached' else 'ok' end, 'uses', u, 'remaining', greatest(0, 3 - u), 'limit', 3);
end;
$$;

-- ------------------------------------------------------------------ "is there an account with this email?" (limited: 10 an hour for a browser, 40 for a network)
create or replace function public.guest_support_email_check(p_browser text, p_ip text, p_email text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  br text := public.guest_support_clean_browser(p_browser);
  em text := public.guest_support_clean_email(p_email);
  bh text; ih text; hr text := to_char(now() at time zone 'utc', 'YYYYMMDDHH24'); u integer; n integer; sus integer;
begin
  if br is null then return jsonb_build_object('status', 'bad_browser'); end if;
  if em is null then return jsonb_build_object('status', 'invalid_email'); end if;
  bh := public.guest_support_hash('b:' || br);
  ih := public.guest_support_hash('i:' || coalesce(nullif(btrim(p_ip), ''), 'unknown'));
  select b.uses into u from public.guest_support_browsers b where b.browser_hash = bh;
  if coalesce(u, 0) >= 3 then return jsonb_build_object('status', 'limit_reached'); end if;
  if not public.ui_usage_take('gs-mail-b:' || bh || ':' || hr, 1, 10) or not public.ui_usage_take('gs-mail-ip:' || ih || ':' || hr, 1, 40) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select count(*), count(*) filter (where p.is_suspended) into n, sus
    from public.profiles p join public.profile_private pp on pp.user_id = p.id where lower(pp.email) = em;
  if n = 0 then return jsonb_build_object('status', 'no_account'); end if;
  return jsonb_build_object('status', 'found', 'many', n > 1, 'suspended', n = sus);
end;
$$;

-- ------------------------------------------------------------------ begin a chat: this is the moment a "use" of the browser's 3 is spent
create or replace function public.guest_support_begin(p_browser text, p_ip text, p_email text, p_issue text, p_kind text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  br text := public.guest_support_clean_browser(p_browser);
  em text := public.guest_support_clean_email(p_email);
  iss text := btrim(coalesce(p_issue, ''));
  knd text := case when p_kind in ('login', 'password', 'forgot_id', 'suspended', 'signup', 'other') then p_kind else 'other' end;
  bh text; ih text; day text := to_char(now() at time zone 'utc', 'YYYYMMDD'); used integer; n integer; uid uuid; ckey text; cid uuid;
begin
  if br is null then return jsonb_build_object('status', 'bad_browser'); end if;
  if em is null then return jsonb_build_object('status', 'invalid_email'); end if;
  if length(iss) < 3 or length(iss) > 1500 then return jsonb_build_object('status', 'invalid_issue'); end if;
  bh := public.guest_support_hash('b:' || br);
  ih := public.guest_support_hash('i:' || coalesce(nullif(btrim(p_ip), ''), 'unknown'));
  if coalesce((select b.uses from public.guest_support_browsers b where b.browser_hash = bh), 0) >= 3 then return jsonb_build_object('status', 'limit_reached'); end if;
  if not public.ui_usage_take('gs-case-ip:' || ih || ':' || day, 1, 12) then return jsonb_build_object('status', 'rate_limited'); end if;
  -- spend one use, in one step (two chats started at the same moment can not both get the last one)
  insert into public.guest_support_browsers (browser_hash, uses) values (bh, 1)
    on conflict (browser_hash) do update set uses = public.guest_support_browsers.uses + 1, last_at = now() where public.guest_support_browsers.uses < 3
    returning uses into used;
  if used is null then return jsonb_build_object('status', 'limit_reached'); end if;
  select count(*) into n from public.profiles p join public.profile_private pp on pp.user_id = p.id where lower(pp.email) = em;
  if n = 1 then select p.id into uid from public.profiles p join public.profile_private pp on pp.user_id = p.id where lower(pp.email) = em; end if;
  ckey := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.guest_support_cases (key_hash, browser_hash, ip_hash, email, user_id, many, issue, kind)
  values (public.guest_support_hash('k:' || ckey), bh, ih, em, uid, n > 1, iss, knd) returning id into cid;
  return jsonb_build_object('status', 'ok', 'caseId', cid, 'caseKey', ckey, 'remaining', 3 - used, 'accountFound', n > 0, 'many', n > 1);
end;
$$;

-- ------------------------------------------------------------------ the User ID step: a match, a mismatch, or "I forgot my ID"
create or replace function public.guest_support_id_check(p_case uuid, p_key text, p_browser text, p_username text, p_forgot boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.guest_support_cases; uname text; pid uuid;
begin
  c := public.guest_support_get_case(p_case, p_key, p_browser);
  if c.id is null then return jsonb_build_object('status', 'bad_case'); end if;
  if coalesce(p_forgot, false) then
    if c.user_id is null and c.many then return jsonb_build_object('status', 'need_id'); end if;   -- more than one account uses this email: the ID is needed to pick the right one
    if c.user_id is null then return jsonb_build_object('status', 'no_account'); end if;
    update public.guest_support_cases set id_state = 'forgot', last_at = now() where id = c.id;
    return jsonb_build_object('status', 'forgot');
  end if;
  if c.id_checks >= 6 then return jsonb_build_object('status', 'rate_limited'); end if;
  uname := lower(regexp_replace(btrim(coalesce(p_username, '')), '^@', ''));
  if uname = '' or length(uname) > 40 then return jsonb_build_object('status', 'invalid_id'); end if;
  update public.guest_support_cases set id_checks = id_checks + 1, last_at = now() where id = c.id;
  select p.id into pid from public.profiles p join public.profile_private pp on pp.user_id = p.id where lower(pp.email) = c.email and lower(p.username) = uname limit 1;
  if pid is null then
    update public.guest_support_cases set id_state = 'mismatch' where id = c.id;
    return jsonb_build_object('status', 'mismatch');
  end if;
  update public.guest_support_cases set user_id = pid, id_state = 'matched', claimed_id = uname where id = c.id;
  return jsonb_build_object('status', 'match');
end;
$$;

-- ------------------------------------------------------------------ "email me a code": makes the code (hashed) and hands it back to the server that sends the email
create or replace function public.guest_support_otp_request(p_case uuid, p_key text, p_browser text, p_ip text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.guest_support_cases; pr public.profiles; pp public.profile_private; ih text; hr text := to_char(now() at time zone 'utc', 'YYYYMMDDHH24');
  recent integer; last_at timestamptz; code text; wait integer;
begin
  c := public.guest_support_get_case(p_case, p_key, p_browser);
  if c.id is null then return jsonb_build_object('status', 'bad_case'); end if;
  if c.user_id is null then return jsonb_build_object('status', case when c.many then 'need_id' else 'no_account' end); end if;
  if c.id_state not in ('matched', 'forgot') then return jsonb_build_object('status', 'id_required'); end if;
  select * into pr from public.profiles where id = c.user_id;
  if not found then return jsonb_build_object('status', 'no_account'); end if;
  if pr.is_suspended then return jsonb_build_object('status', 'suspended'); end if;
  select * into pp from public.profile_private where user_id = pr.id;
  if coalesce(pp.email, '') = '' or lower(pp.email) <> c.email then return jsonb_build_object('status', 'no_account'); end if;
  if c.otp_sends >= 3 then return jsonb_build_object('status', 'case_limit'); end if;
  ih := public.guest_support_hash('i:' || coalesce(nullif(btrim(p_ip), ''), 'unknown'));
  if not public.ui_usage_take('gs-otp-ip:' || ih || ':' || hr, 1, 10) then return jsonb_build_object('status', 'rate_limited'); end if;
  select count(*), max(created_at) into recent, last_at from public.recovery_otps where user_id = pr.id and created_at > now() - interval '1 hour';
  if recent >= 3 then return jsonb_build_object('status', 'rate_limited'); end if;
  if last_at is not null and last_at > now() - interval '45 seconds' then
    wait := greatest(1, ceil(45 - extract(epoch from (now() - last_at)))::integer);
    return jsonb_build_object('status', 'cooldown', 'seconds', wait);
  end if;
  code := public.guest_support_code();
  insert into public.recovery_otps (user_id, code_hash, expires_at) values (pr.id, public.recovery_otp_hash(pr.id, code), now() + interval '10 minutes');
  insert into public.recovery_attempts (ip, username, ok) values (coalesce(nullif(btrim(p_ip), ''), 'unknown'), lower(pr.username), true);
  update public.guest_support_cases set otp_sends = otp_sends + 1, last_at = now() where id = c.id;
  return jsonb_build_object('status', 'ok', 'userId', pr.id, 'email', pp.email, 'username', pr.username, 'code', code, 'sendsLeft', 3 - (c.otp_sends + 1));
end;
$$;

-- ------------------------------------------------------------------ the code typed back in the chat
create or replace function public.guest_support_otp_verify(p_case uuid, p_key text, p_browser text, p_ip text, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.guest_support_cases; pr public.profiles; rec public.recovery_otps; v_ip text := coalesce(nullif(btrim(p_ip), ''), 'unknown'); uname text; good boolean; typed text := btrim(coalesce(p_code, ''));
begin
  c := public.guest_support_get_case(p_case, p_key, p_browser);
  if c.id is null then return jsonb_build_object('status', 'bad_case'); end if;
  if typed = '' then return jsonb_build_object('status', 'missing'); end if;
  if typed !~ '^[0-9]{6}$' then return jsonb_build_object('status', 'bad_format'); end if;
  if c.user_id is null or c.id_state not in ('matched', 'forgot') then return jsonb_build_object('status', 'id_required'); end if;
  if c.otp_fails >= 8 then return jsonb_build_object('status', 'case_locked'); end if;
  select * into pr from public.profiles where id = c.user_id;
  if not found then return jsonb_build_object('status', 'no_account'); end if;
  if pr.is_suspended then return jsonb_build_object('status', 'suspended'); end if;
  uname := lower(pr.username);
  if (select count(*) from public.recovery_attempts a where not a.ok and a.username = uname and a.created_at > now() - interval '1 hour') >= 8
     or (select count(*) from public.recovery_attempts a where not a.ok and a.ip = v_ip and a.created_at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into rec from public.recovery_otps where user_id = pr.id and expires_at > now() order by created_at desc limit 1;
  if not found then
    insert into public.recovery_attempts (ip, username, ok) values (v_ip, uname, false);
    update public.guest_support_cases set otp_fails = otp_fails + 1, last_at = now() where id = c.id;
    return jsonb_build_object('status', 'expired');
  end if;
  good := public.recovery_otp_hash(pr.id, typed) = rec.code_hash;
  insert into public.recovery_attempts (ip, username, ok) values (v_ip, uname, good);
  if good then
    delete from public.recovery_otps where user_id = pr.id;
    update public.guest_support_cases set status = 'signed_in', last_at = now() where id = c.id;
    return jsonb_build_object('status', 'ok', 'userId', pr.id);
  end if;
  update public.guest_support_cases set otp_fails = otp_fails + 1, last_at = now() where id = c.id;
  if rec.attempts + 1 >= 5 then
    delete from public.recovery_otps where user_id = pr.id;
    return jsonb_build_object('status', 'too_many_attempts');
  end if;
  update public.recovery_otps set attempts = attempts + 1 where id = rec.id;
  return jsonb_build_object('status', 'mismatch');
end;
$$;

-- ------------------------------------------------------------------ a message to the helper: only inside an open chat, at most 40 a chat. Hands back what the helper may know (never the email).
create or replace function public.guest_support_touch(p_case uuid, p_key text, p_browser text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.guest_support_cases;
begin
  c := public.guest_support_get_case(p_case, p_key, p_browser);
  if c.id is null then return jsonb_build_object('status', 'bad_case'); end if;
  if c.messages >= 40 then return jsonb_build_object('status', 'limit'); end if;
  update public.guest_support_cases set messages = messages + 1, last_at = now() where id = c.id;
  return jsonb_build_object('status', 'ok', 'issue', c.issue, 'kind', c.kind, 'hasAccount', c.user_id is not null or c.many, 'idState', c.id_state, 'messagesLeft', 40 - (c.messages + 1));
end;
$$;

-- The person ends the chat (the "use" stays spent).
create or replace function public.guest_support_close(p_case uuid, p_key text, p_browser text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.guest_support_cases;
begin
  c := public.guest_support_get_case(p_case, p_key, p_browser);
  if c.id is null then return jsonb_build_object('status', 'bad_case'); end if;
  update public.guest_support_cases set status = 'closed', last_at = now() where id = c.id;
  return jsonb_build_object('status', 'ok');
end;
$$;

-- ------------------------------------------------------------------ the administrator reads the chats
create or replace function public.admin_guest_support_cases(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_master_admin('Only the NOOB administrator can read guest support chats.');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'email', c.email, 'issue', c.issue, 'kind', c.kind, 'status', c.status, 'accountFound', c.user_id is not null or c.many,
      'username', p.username, 'claimedId', c.claimed_id, 'idState', c.id_state, 'codesSent', c.otp_sends, 'wrongCodes', c.otp_fails,
      'messages', c.messages, 'createdAt', c.created_at, 'lastAt', c.last_at
    ) order by c.created_at desc)
    from (select * from public.guest_support_cases where p_status is null or status = p_status order by created_at desc limit 200) c
    left join public.profiles p on p.id = c.user_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_guest_support_close(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_master_admin('Only the NOOB administrator can close guest support chats.');
  update public.guest_support_cases set status = 'closed', last_at = now() where id = p_id and status <> 'closed';
  return jsonb_build_object('success', true);
end;
$$;

-- ------------------------------------------------------------------ who may call what
revoke execute on function
  public.guest_support_hash(text), public.guest_support_clean_browser(text), public.guest_support_clean_email(text), public.guest_support_code(),
  public.guest_support_get_case(uuid, text, text), public.guest_support_status(text), public.guest_support_email_check(text, text, text),
  public.guest_support_begin(text, text, text, text, text), public.guest_support_id_check(uuid, text, text, text, boolean),
  public.guest_support_otp_request(uuid, text, text, text), public.guest_support_otp_verify(uuid, text, text, text, text),
  public.guest_support_touch(uuid, text, text), public.guest_support_close(uuid, text, text)
  from public, anon, authenticated;
grant execute on function
  public.guest_support_hash(text), public.guest_support_clean_browser(text), public.guest_support_clean_email(text), public.guest_support_code(),
  public.guest_support_get_case(uuid, text, text), public.guest_support_status(text), public.guest_support_email_check(text, text, text),
  public.guest_support_begin(text, text, text, text, text), public.guest_support_id_check(uuid, text, text, text, boolean),
  public.guest_support_otp_request(uuid, text, text, text), public.guest_support_otp_verify(uuid, text, text, text, text),
  public.guest_support_touch(uuid, text, text), public.guest_support_close(uuid, text, text)
  to service_role;
revoke execute on function public.admin_guest_support_cases(text), public.admin_guest_support_close(uuid) from public, anon;
grant execute on function public.admin_guest_support_cases(text), public.admin_guest_support_close(uuid) to authenticated;
