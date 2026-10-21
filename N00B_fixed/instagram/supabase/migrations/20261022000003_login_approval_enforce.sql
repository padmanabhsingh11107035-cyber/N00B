-- Login approval by email: close the side door. The login page already asks for the approval, but Supabase's own login address ("password grant") would still let anyone who knows
-- a password in without it. This function is the guard for that address: Supabase calls it every time it is about to hand out a login (a "Custom Access Token" hook), and it
-- refuses ONLY one case: a plain password login for an account that has login approval switched on. Everything else passes through untouched:
--   * the approved logins (their one-time token is a "magiclink"/"otp" login), "Forgot password", Google/other sign-in, accounts that did not switch it on,
--   * keeping a login alive (token refresh), so nobody who is already signed in is logged out.
-- It never breaks a login by accident: if anything at all goes wrong inside it, it lets the login through (fail open).
--
-- This file only CREATES the function. It does nothing until the hook is switched on in Supabase (Authentication -> Hooks -> Customize Access Token (JWT) Claims ->
-- Postgres function -> public.login_approval_access_hook). Switching the hook off there undoes it at once. Safe to run more than once.

create or replace function public.login_approval_access_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid;
begin
  if coalesce(event->>'authentication_method', '') = 'password' then
    uid := (event->>'user_id')::uuid;
    if exists (
      select 1
      from public.login_approval_settings s
      left join public.profile_private pp on pp.user_id = s.user_id
      where s.user_id = uid and s.enabled and coalesce(pp.email, '') <> ''
    ) then
      return jsonb_build_object('error', jsonb_build_object(
        'http_code', 403,
        'message', 'This account asks for an approval by email. Log in from the NOOB login page and tap "Yes, it''s me" in the email.'
      ));
    end if;
  end if;
  return jsonb_build_object('claims', event->'claims');
exception when others then
  -- never lock anybody out because of a problem in here
  return jsonb_build_object('claims', event->'claims');
end;
$$;

revoke execute on function public.login_approval_access_hook(jsonb) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema public to supabase_auth_admin;
    grant execute on function public.login_approval_access_hook(jsonb) to supabase_auth_admin;
  end if;
end
$$;
