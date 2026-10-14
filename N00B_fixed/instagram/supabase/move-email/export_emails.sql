-- Everyone who can be emailed about the move: one row per real email address (accounts that signed up with only a username have none),
-- suspended accounts and the AI accounts left out. Run in the Supabase SQL Editor, then press "Download CSV" (the columns are the ones
-- Resend's contact import expects: email, first_name).

-- 1) how many people
select count(distinct lower(btrim(pp.email))) as people_to_email
from public.profile_private pp
join public.profiles p on p.id = pp.user_id
where pp.email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  and not p.is_suspended and not p.is_ai;

-- 2) the list (download this one as CSV)
select distinct on (lower(btrim(pp.email)))
       lower(btrim(pp.email)) as email,
       coalesce(nullif(btrim(pp.first_name), ''), nullif(btrim(p.display_name), ''), p.username) as first_name
from public.profile_private pp
join public.profiles p on p.id = pp.user_id
where pp.email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  and not p.is_suspended and not p.is_ai
order by lower(btrim(pp.email)), p.created_at;
