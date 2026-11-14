-- Growth preparation (docs/GROWTH-PREPARATION.md, measure 3): how much storage each person uses, and an OPTIONAL per-person limit.
-- ADDITIVE: three new functions, nothing is changed or deleted, no policy of the storage tables is touched. Safe to run twice.
--
-- Measuring: storage.objects keeps for every file its owner (owner_id = the person's id, set by Supabase Storage from the sign-in) and its size (metadata->>'size').
-- The admin Storage tab already relies on both. A file without a size counts as 0 and a file without an owner counts for nobody, so a measurement can only be too LOW, never
-- too high: nobody is ever refused because of a file that is not theirs.
--
-- The limit is OFF until the owner switches it on with one line (nothing is enforced by this migration alone):
--     insert into public.internal_config (key, value) values ('storage_cap_mb', '50') on conflict (key) do update set value = excluded.value;
--   and off again with:   delete from public.internal_config where key = 'storage_cap_mb';
-- It is NOT a server-side wall (Supabase Storage uploads go straight from the phone to storage; the size of a file is not known to the database when the upload is accepted).
-- The app asks my_storage_usage() before it uploads and shows "Storage full: delete something to upload more." It never deletes or blocks anything that already exists, and
-- when the question can not be answered (network, this migration not run) the upload goes ahead as before.
-- Never limited: admins, AI accounts, Pro accounts, and the account called noob.

create or replace function public.storage_used_bytes(p_user uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when (o.metadata ->> 'size') ~ '^[0-9]+$' then (o.metadata ->> 'size')::bigint else 0 end), 0)::bigint
  from storage.objects o
  where p_user is not null and o.owner_id = p_user::text and o.bucket_id in ('media', 'chatmedia');
$$;
revoke all on function public.storage_used_bytes(uuid) from public, anon, authenticated;

-- is this account never limited?
create or replace function public.storage_exempt(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin or p.is_ai or p.pro_tier is not null or lower(p.username) = 'noob' from public.profiles p where p.id = p_user), false);
$$;
revoke all on function public.storage_exempt(uuid) from public, anon, authenticated;

-- the limit in bytes, or null when it is switched off (or set to something that is not a positive number)
create or replace function public.storage_cap_bytes() returns bigint
language sql stable security definer set search_path = public as $$
  select case when c.value ~ '^[0-9]{1,6}$' and c.value::bigint > 0 then c.value::bigint * 1048576 end
  from (select 1) s left join public.internal_config c on c.key = 'storage_cap_mb';
$$;
revoke all on function public.storage_cap_bytes() from public, anon, authenticated;

-- what the app asks before an upload: { usedBytes, capBytes (null = no limit for this person), exempt, limitOn }
create or replace function public.my_storage_usage() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); cap bigint := public.storage_cap_bytes(); ex boolean;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  ex := public.storage_exempt(me);
  return jsonb_build_object('usedBytes', public.storage_used_bytes(me), 'capBytes', case when ex then null else cap end, 'exempt', ex, 'limitOn', cap is not null);
end;
$$;
revoke all on function public.my_storage_usage() from public, anon;
grant execute on function public.my_storage_usage() to authenticated, service_role;

-- admin: the people using the most storage (max 200), whether the limit applies to them and whether they are over it
create or replace function public.admin_storage_by_person(p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cap bigint := public.storage_cap_bytes();
begin
  if not public.is_admin() then raise exception 'Admin only.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'capBytes', cap,
    'people', coalesce((
      select jsonb_agg(jsonb_build_object('userId', u.uid, 'username', p.username, 'displayName', p.display_name, 'files', u.files, 'bytes', u.bytes,
                                           'exempt', public.storage_exempt(u.uid),
                                           'overLimit', cap is not null and not public.storage_exempt(u.uid) and u.bytes >= cap) order by u.bytes desc)
      from (
        select o.owner_id::uuid as uid, count(*) as files,
               sum(case when (o.metadata ->> 'size') ~ '^[0-9]+$' then (o.metadata ->> 'size')::bigint else 0 end) as bytes
        from storage.objects o
        where o.bucket_id in ('media', 'chatmedia') and o.owner_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        group by 1 order by 3 desc limit least(greatest(coalesce(p_limit, 50), 1), 200)
      ) u left join public.profiles p on p.id = u.uid), '[]'::jsonb));
end;
$$;
revoke all on function public.admin_storage_by_person(integer) from public, anon;
grant execute on function public.admin_storage_by_person(integer) to authenticated, service_role;
