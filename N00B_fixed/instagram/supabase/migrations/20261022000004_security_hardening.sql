-- Security hardening, found by the database audit (scripts/security-audit-db.mjs). Three things, none of them changes what the app does for a normal person:
--
-- 1. resolve_login_email(identifier) is how a User ID typed on the login screen becomes the address Supabase signs in with. It can be called by anybody who is not logged in
--    (the login screen has to). Accounts made with a password use a made-up address (...@users.nooob.xyz), which is harmless, but an account made with "Continue with Google"
--    signs in with the person's REAL e-mail address, and the function handed that address to anyone who typed the person's User ID. Now it gives out an address only when it is
--    a made-up one, or when the account really has a password (the only reason to need the address at all). Everything else gets the same look-alike decoy that an unknown
--    User ID already got.
-- 2. ensure_daily_challenge(date) fills in a day of Daily NOOB. It was meant to be used only by other functions (an earlier migration even revoked it from logged-in users), but the
--    right to run it comes through PUBLIC, so the revoke did nothing and anybody could call it for any date and fill the table with made-up days. Now nobody but the database's own
--    functions can (they run as the owner, so Daily NOOB works exactly as before).
-- 3. Every admin_* function checks inside that the caller is an administrator, so they were already safe; they are now also closed to visitors who are not logged in at all.

create or replace function public.resolve_login_email(identifier text) returns text
language sql stable security definer set search_path = public
as $$
  with q as (
    select btrim(identifier) as raw,
           regexp_replace(btrim(identifier), '\D', '', 'g') as digits
  )
  select coalesce(
    -- 1. user ID or email: only an address that is made up for NOOB, or one that belongs to an account that has a password (so a Google account's real address is never given out)
    (
      select u.email
      from q, public.profiles p
      join auth.users u on u.id = p.id
      left join public.profile_private pp on pp.user_id = p.id
      where (lower(p.username) = lower(q.raw)
         or lower(pp.email) = lower(q.raw))
        and (u.email like '%@users.nooob.xyz' or coalesce(u.encrypted_password, '') <> '')
      order by p.created_at asc
      limit 1
    ),
    -- 2. mobile number
    (
      select u.email
      from q, public.profiles p
      join auth.users u on u.id = p.id
      join public.profile_private pp on pp.user_id = p.id
      where q.raw ~ '^[+(]?[0-9][0-9 ().-]{5,}$'
        and u.email like '%@users.nooob.xyz'
        and length(regexp_replace(coalesce(pp.mobile_number, ''), '\D', '', 'g')) >= 7
        and (
          q.digits = regexp_replace(coalesce(pp.mobile_number, ''), '\D', '', 'g')
          or q.digits = regexp_replace(coalesce(pp.country_code, ''), '\D', '', 'g') || regexp_replace(coalesce(pp.mobile_number, ''), '\D', '', 'g')
          or (
            length(regexp_replace(coalesce(pp.mobile_number, ''), '\D', '', 'g')) >= 10
            and right(q.digits, 10) = right(regexp_replace(coalesce(pp.mobile_number, ''), '\D', '', 'g'), 10)
          )
        )
      order by p.created_at asc
      limit 1
    ),
    -- 3. nothing matched: a well-formed decoy, so nobody can probe which accounts exist
    gen_random_uuid()::text || '@users.nooob.xyz'
  );
$$;

revoke execute on function public.ensure_daily_challenge(date) from public, anon, authenticated;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig, has_function_privilege('authenticated', p.oid, 'execute') as auth_had
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'admin\_%' escape '\' loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    if r.auth_had then execute format('grant execute on function %s to authenticated', r.sig); end if;   -- only where logged-in people could call it before
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
