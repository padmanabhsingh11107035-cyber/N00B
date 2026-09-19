-- NOOB — Supabase phase 4: account recovery ("forgot password").
--
-- The old app let someone back in after they proved three personal details (mobile number, date of birth and
-- email on file). The check lives here; a tiny Edge Function (supabase/functions/recover-account) calls it with
-- the service key and, only if it says "ok", signs that person in. No browser can call this function directly,
-- and wrong guesses are limited: 8 wrong tries per hour for one username and 30 per hour from one device/network.
-- Safe to run more than once.

create table if not exists public.recovery_attempts (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  ip         text,
  username   text not null,
  ok         boolean not null default false
);
create index if not exists recovery_attempts_user_idx on public.recovery_attempts (username, created_at);
create index if not exists recovery_attempts_ip_idx   on public.recovery_attempts (ip, created_at);
alter table public.recovery_attempts enable row level security;
revoke all on public.recovery_attempts from anon, authenticated;
grant all on public.recovery_attempts to service_role;

create or replace function public.recovery_check(p_ip text, p_username text, p_mobile text, p_dob text, p_email text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uname text := lower(btrim(coalesce(p_username, '')));
  v_ip text := coalesce(nullif(btrim(p_ip), ''), 'unknown');
  pr public.profiles; pp public.profile_private; dob date; matched boolean;
  digits text := right(regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g'), 10);
begin
  delete from public.recovery_attempts where created_at < now() - interval '2 days';
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
  if btrim(coalesce(p_mobile, '')) = '' or btrim(coalesce(p_dob, '')) = '' or btrim(coalesce(p_email, '')) = '' then
    return jsonb_build_object('status', 'missing');
  end if;

  select * into pp from public.profile_private where user_id = pr.id;
  if pr.is_suspended then
    return jsonb_build_object('status', 'suspended', 'reason', pp.suspended_reason);
  end if;

  begin
    dob := substring(btrim(p_dob) from 1 for 10)::date;
  exception when others then
    dob := null;
  end;

  -- one combined answer: never reveal WHICH detail was wrong
  matched := coalesce(pp.email, '') <> '' and lower(btrim(p_email)) = lower(btrim(pp.email))
         and digits <> '' and digits = right(regexp_replace(coalesce(pp.mobile_number, ''), '\D', '', 'g'), 10)
         and dob is not null and dob = pp.date_of_birth;

  insert into public.recovery_attempts (ip, username, ok) values (v_ip, uname, matched);
  if not matched then return jsonb_build_object('status', 'mismatch'); end if;
  return jsonb_build_object('status', 'ok', 'userId', pr.id);
end;
$$;

-- Only the Edge Function (service key) may call it.
revoke execute on function public.recovery_check(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.recovery_check(text, text, text, text, text) to service_role;
