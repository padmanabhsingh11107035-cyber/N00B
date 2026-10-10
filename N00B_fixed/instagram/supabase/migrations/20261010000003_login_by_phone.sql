-- Log in with a mobile number too: the login box now takes a user ID, an email address, or a mobile number.
--
-- Same function as before (resolve_login_email), one more way to find the account. User ID and email are tried first,
-- exactly as before, so nothing that worked yesterday changes. A mobile number is matched against the number saved on the
-- account, with or without the country code (+91 98240 04927 and 98240 04927 both find the same account).
--
-- Still no account probing: a number (or anything else) that matches nothing gets a random well-formed address, so it looks
-- exactly like a real one, and the password check afterwards is what decides.
-- A number only finds accounts whose login address is NOOB's own private one (<uuid>@users.nooob.xyz), never an account that
-- was made with Google/Discord/... and uses that real email as its login address.
--
-- Safe to run more than once. It only replaces this one function; no data is touched.

create or replace function public.resolve_login_email(identifier text) returns text
language sql stable security definer set search_path = public as $$
  with q as (
    select btrim(identifier) as raw,
           regexp_replace(btrim(identifier), '\D', '', 'g') as digits
  )
  select coalesce(
    -- 1. user ID or email (unchanged)
    (
      select u.email
      from q, public.profiles p
      join auth.users u on u.id = p.id
      left join public.profile_private pp on pp.user_id = p.id
      where lower(p.username) = lower(q.raw)
         or lower(pp.email) = lower(q.raw)
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

grant execute on function public.resolve_login_email(text) to anon, authenticated;
