-- NOOB — nobody can make an account without the emailed code, not even by calling the login service's public sign-up address directly.
--
-- What was open: the service's public key is in every copy of the app, so anybody can call its sign-up address (auth.signUp) or its
-- "email me a link" address (signInWithOtp) themselves. handle_new_user() asks for a verified code, but it deliberately lets two kinds of
-- new login rows through without making a profile (a "legacy_id" in the sign-up data, and no username at all), and both of those are
-- things the caller writes. The result was an account-less login that never needed a code.
--
-- The fix is a ticket. The emailed-code flow (the recover-account function, signup-otp-verify) writes the private, random login address
-- it is about to create into signup_tickets, with the service key, a moment before it creates the login. A new trigger on auth.users
-- (next file, 20261027000002_signup_tickets_turn_on.sql) refuses every NEW email / phone / anonymous login that has no such ticket.
-- Sign-in with Google and the other providers is not affected (those logins come with the provider's own proof, and their profile is made
-- by complete_oauth_profile, which already needs a verified code).
--
-- This file only prepares things: it changes nothing for anyone. Run it, deploy the function, then run the next file.

create table if not exists public.signup_tickets (
  auth_email text primary key,
  created_at timestamptz not null default now()
);
alter table public.signup_tickets enable row level security;
revoke all on public.signup_tickets from public, anon, authenticated;
grant all on public.signup_tickets to service_role;

create or replace function public.noob_block_direct_signup() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  prov text := lower(coalesce(new.raw_app_meta_data->>'provider', ''));
  addr text := lower(coalesce(new.email, ''));
begin
  delete from public.signup_tickets where created_at < now() - interval '10 minutes';
  if prov in ('email', 'phone', 'anonymous') then
    if addr <> '' and exists (select 1 from public.signup_tickets t where t.auth_email = addr) then
      delete from public.signup_tickets where auth_email = addr;   -- used up: one ticket, one login
      return new;
    end if;
    raise exception 'Please verify your email before creating your account.';
  end if;
  return new;
end;
$$;
revoke execute on function public.noob_block_direct_signup() from public, anon, authenticated;

-- "Is there an account with this email?" for the login screen: a wrong email says "Email not found, enter the correct one" instead of "wrong password".
-- (Like username_taken, which the login screen already uses for a User ID: a yes or a no, nothing else about the account.)
create or replace function public.email_in_use(candidate text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profile_private where lower(email) = lower(btrim(coalesce(candidate, ''))));
$$;
grant execute on function public.email_in_use(text) to anon, authenticated;
