-- READ-ONLY PREVIEW for migration 20261114000006_deleted_accounts_cleanup.sql. Run it in the Supabase SQL editor BEFORE that migration. It changes nothing.
-- "Deleted account" here = a profile whose login row is missing from auth.users, or whose login is soft-deleted (deleted_at set). Admins, AI accounts and "noob" are never counted.
--
-- WHAT TO LOOK FOR
--   Result 1: the accounts that would be removed. Each should be a person you really deleted (check the usernames). If you see a real, active person, STOP and tell me.
--   Result 2: how many rows in each table belong to those accounts (follows both ways, posts, likes...). They are removed together with the profile.
--   Result 3: people whose stored followers / following number differs from the real follow rows (the migration recomputes it for the people it touches).
--   Result 4: a one-line verdict. More than 25 accounts, or half of all profiles = the migration refuses to act by itself.
-- (The SQL editor only shows the LAST result of a script: run each block separately, or select one block and press Run.)

-- Result 1
select p.id, p.username, p.display_name, p.created_at,
       case when exists (select 1 from auth.users u where u.id = p.id) then 'login soft-deleted' else 'login missing' end as why
from public.profiles p
where not p.is_admin and not p.is_ai and lower(p.username) <> 'noob'
  and not exists (select 1 from auth.users u where u.id = p.id and (to_jsonb(u) ->> 'deleted_at') is null)
order by p.created_at;

-- Result 2 (rows that reference those profiles, per table and column; only non-zero)
with gone as (
  select string_agg(quote_literal(p.id::text) || '::uuid', ',') as ids from public.profiles p
  where not p.is_admin and not p.is_ai and lower(p.username) <> 'noob'
    and not exists (select 1 from auth.users u where u.id = p.id and (to_jsonb(u) ->> 'deleted_at') is null)
), fks as (
  select cl.relname as tbl, a.attname as col,
         case k.confdeltype when 'c' then 'deleted with the profile' when 'n' then 'kept, person blanked' else 'would block (no action)' end as what_happens
  from pg_constraint k
  join pg_class cl on cl.oid = k.conrelid join pg_namespace n on n.oid = cl.relnamespace
  join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
  where k.contype = 'f' and k.confrelid = 'public.profiles'::regclass and n.nspname = 'public' and cardinality(k.conkey) = 1
), counted as (
  select f.tbl, f.col, f.what_happens,
         (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I where %I in (%s)', f.tbl, f.col, g.ids), false, true, '')))[1]::text::bigint as n
  from fks f, gone g where g.ids is not null
)
select tbl, col, what_happens, n as rows from counted where n > 0 order by tbl, col;

-- Result 3
select p.id, p.username, p.followers_count as stored_followers,
       (select count(*) from public.follows f where f.followee_id = p.id) as real_followers,
       p.following_count as stored_following,
       (select count(*) from public.follows f where f.follower_id = p.id) as real_following
from public.profiles p
where p.followers_count <> (select count(*) from public.follows f where f.followee_id = p.id)
   or p.following_count <> (select count(*) from public.follows f where f.follower_id = p.id)
order by p.username;

-- Result 4
select count(*) filter (where gone) as accounts_that_would_be_removed, count(*) as all_profiles,
       case when count(*) filter (where gone) = 0 then 'nothing to clean'
            when count(*) filter (where gone) > 25 or count(*) filter (where gone) * 2 > count(*) then 'TOO MANY - migration will refuse, tell Claude'
            else 'ok, the migration will remove them' end as verdict
from (select not p.is_admin and not p.is_ai and lower(p.username) <> 'noob'
             and not exists (select 1 from auth.users u where u.id = p.id and (to_jsonb(u) ->> 'deleted_at') is null) as gone
      from public.profiles p) s;
