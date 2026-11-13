-- Deleted accounts must disappear completely: profile, followers / following, counts.
--
-- WHAT WE FOUND (read from every migration; the live database could not be queried from here)
--   * "Delete my account", the admin's delete and the bulk delete all end in `delete from auth.users`. profiles.id references auth.users ON DELETE CASCADE, and
--     follows, follow_requests, blocks, chat_members, likes, saves, comments, posts, ... all reference profiles ON DELETE CASCADE, so in a database where those
--     constraints are intact nothing is left behind. A profile can therefore only survive if its login was removed WITHOUT that cascade:
--       (a) the login was "soft deleted" (auth.users.deleted_at is set, the row stays, so the cascade never fires) - e.g. the Supabase dashboard / auth admin API
--           with soft delete - or
--       (b) the login row is gone but the profile was never removed (a database whose foreign key was bypassed/missing, e.g. by the original data import).
--     Either way the profile kept showing up in search_users, so it kept showing up in everybody's followers / following lists, with the stored counters unchanged.
--   * Foreign keys to profiles that do NOT cascade: 4 "no action" (account_action_requests.resolved_by, platform_settings.updated_by, sparkx_applications.reviewed_by,
--     team_applications.reviewed_by - only administrators who reviewed something are affected: their delete would fail with an error, never leave a half-deleted account)
--     and ~40 "set null" (messages.sender_id, notifications.actor_id, reports, orders...: the row stays, the person is blanked). Messages are kept exactly as before.
--
-- WHAT THIS FILE DOES (additive, safe to run twice)
--   1. account_is_gone(id) / gone_account_ids(): a profile is a "deleted account" ONLY when its login is missing from auth.users or soft-deleted (deleted_at set).
--      Administrators, AI accounts and the account called noob are never treated as gone.
--   2. is_hidden_from_me() now also hides gone accounts, so search_users / user_by_id (behind every people list, followers and following list) never return one.
--   3. A BEFORE DELETE trigger on auth.users removes what the cascade does not: the person's follows (both directions, so every counter is corrected), follow requests,
--      notifications that were about them (they would otherwise stay with a blank name) and their per-chat mute settings. It can never block a deletion.
--      A new trigger on auth.users.deleted_at (when that column exists) does the full removal when a login is soft-deleted from now on.
--   4. The clean-up for accounts already deleted: purge_gone_accounts(dry_run, max). Before removing a profile it saves the profile row and its follow rows
--      into deleted_accounts_cleanup_backup (service role only). It refuses to act if more than 25 accounts (or half of all profiles) would be removed.
--      It runs once at the bottom of this file. RUN supabase/one-off/deleted-accounts-preview.sql FIRST and read it.
--   5. After a purge the stored followers / following counts of every person affected are recomputed from the real follow rows.

create table if not exists public.deleted_accounts_cleanup_backup (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  username   text,
  reason     text not null,
  profile    jsonb not null,
  follows    jsonb not null default '[]'::jsonb,
  purged_at  timestamptz not null default now()
);
alter table public.deleted_accounts_cleanup_backup enable row level security;
revoke all on public.deleted_accounts_cleanup_backup from public, anon, authenticated;
grant all on public.deleted_accounts_cleanup_backup to service_role;

-- 1. what "deleted account" means
create or replace function public.account_is_gone(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_id is not null
     and exists (select 1 from public.profiles p where p.id = p_id and not p.is_admin and not p.is_ai and lower(p.username) <> 'noob')
     and not exists (select 1 from auth.users u where u.id = p_id and (to_jsonb(u) ->> 'deleted_at') is null);
$$;
revoke execute on function public.account_is_gone(uuid) from public, anon;
grant execute on function public.account_is_gone(uuid) to authenticated, service_role;

create or replace function public.gone_account_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select p.id from public.profiles p
  where not p.is_admin and not p.is_ai and lower(p.username) <> 'noob'
    and not exists (select 1 from auth.users u where u.id = p.id and (to_jsonb(u) ->> 'deleted_at') is null);
$$;
revoke execute on function public.gone_account_ids() from public, anon, authenticated;
grant execute on function public.gone_account_ids() to service_role;

-- 2. never show a gone account in any people list (same function, one extra condition)
create or replace function public.is_hidden_from_me(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profile_hides h where h.owner_id = owner and h.hidden_from_id = auth.uid())
      or public.account_is_gone(owner);
$$;

-- 3. what the cascade does not cover (runs BEFORE the login is deleted, whoever deletes it)
create or replace function public._purge_account_leftovers(p_id uuid, p_with_follows boolean default true) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- (the clean-up of an already-orphaned profile passes false: its follows go with the profile in one step, because updating the counters of a profile whose login
  --  is missing would trip its foreign key)
  if p_with_follows then
    delete from public.follows where follower_id = p_id or followee_id = p_id;        -- the counters of everyone on the other side go down by themselves
  end if;
  delete from public.follow_requests where requester_id = p_id or target_id = p_id;
  delete from public.notifications where actor_id = p_id;                              -- "@x followed you" etc. (otherwise left with a blank name)
  if to_regclass('public.chat_mute_until') is not null then delete from public.chat_mute_until where user_id = p_id; end if;
end;
$$;
revoke execute on function public._purge_account_leftovers(uuid, boolean) from public, anon, authenticated;

create or replace function public.purge_leftovers_before_login_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public._purge_account_leftovers(old.id);
  exception when others then
    null;   -- tidying up must never be the reason an account cannot be deleted
  end;
  return old;
end;
$$;
revoke execute on function public.purge_leftovers_before_login_delete() from public, anon, authenticated;
drop trigger if exists purge_leftovers_before_login_delete on auth.users;
create trigger purge_leftovers_before_login_delete before delete on auth.users for each row execute function public.purge_leftovers_before_login_delete();

-- a login that is soft-deleted from now on takes the profile with it (the cascade never fires for a soft delete)
create or replace function public.purge_profile_after_soft_delete() returns trigger
language plpgsql security definer set search_path = public as $$
declare prof public.profiles;
begin
  begin
    select * into prof from public.profiles where id = new.id and not is_admin and not is_ai and lower(username) <> 'noob';
    if found then
      insert into public.deleted_accounts_cleanup_backup (user_id, username, reason, profile, follows)
      values (prof.id, prof.username, 'login soft-deleted', to_jsonb(prof),
              coalesce((select jsonb_agg(to_jsonb(f)) from public.follows f where f.follower_id = prof.id or f.followee_id = prof.id), '[]'::jsonb));
      perform public._purge_account_leftovers(prof.id);
      delete from public.profiles where id = prof.id;
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;
revoke execute on function public.purge_profile_after_soft_delete() from public, anon, authenticated;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'deleted_at') then
    drop trigger if exists purge_profile_after_soft_delete on auth.users;
    create trigger purge_profile_after_soft_delete after update of deleted_at on auth.users
      for each row when (new.deleted_at is not null and old.deleted_at is null) execute function public.purge_profile_after_soft_delete();
  end if;
end $$;

-- 4. clean-up of accounts that were already deleted
create or replace function public.purge_gone_accounts(p_dry_run boolean default true, p_max integer default 25) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ids uuid[];
  n integer; total integer;
  r record; prof public.profiles;
  purged integer := 0; skipped jsonb := '[]'::jsonb; affected uuid[];
begin
  select array_agg(g), count(*) into ids, n from public.gone_account_ids() g;
  n := coalesce(n, 0);
  select count(*) into total from public.profiles;
  if n = 0 then return jsonb_build_object('success', true, 'gone', 0, 'purged', 0, 'message', 'No deleted accounts left over.'); end if;
  if p_dry_run then return jsonb_build_object('success', true, 'dryRun', true, 'gone', n, 'ids', to_jsonb(ids)); end if;
  if n > greatest(coalesce(p_max, 25), 0) or n * 2 > total then
    return jsonb_build_object('success', false, 'aborted', true, 'gone', n, 'message',
      'Nothing was changed: ' || n || ' accounts look deleted, which is more than the safety limit. Check the preview, then call purge_gone_accounts(false, ' || n || ') yourself.');
  end if;

  select coalesce(array_agg(distinct s.x), '{}') into affected from (
    select follower_id as x from public.follows where followee_id = any(ids)
    union select followee_id from public.follows where follower_id = any(ids)) s where s.x <> all(ids);

  for r in select unnest(ids) as id loop
    select * into prof from public.profiles where id = r.id;
    if not found then continue; end if;
    begin
      insert into public.deleted_accounts_cleanup_backup (user_id, username, reason, profile, follows)
      values (prof.id, prof.username,
              case when exists (select 1 from auth.users u where u.id = prof.id) then 'login soft-deleted' else 'login missing' end,
              to_jsonb(prof),
              coalesce((select jsonb_agg(to_jsonb(f)) from public.follows f where f.follower_id = prof.id or f.followee_id = prof.id), '[]'::jsonb));
      perform public._purge_account_leftovers(prof.id, false);
      delete from public.profiles where id = prof.id;     -- the follows and the rest (posts, likes, saves, chat memberships, blocks, ...) follows by cascade
      begin
        insert into public.account_deletions (user_id, username, display_name, had_profile, signed_up_at, how, followers_count)
        values (prof.id, prof.username, prof.display_name, true, prof.created_at, 'system', prof.followers_count);
      exception when others then null;
      end;
      purged := purged + 1;
    exception when others then
      skipped := skipped || jsonb_build_object('id', prof.id, 'username', prof.username, 'error', sqlerrm);
    end;
  end loop;

  -- counters of the people who followed / were followed by them: recompute from the real rows
  update public.profiles p set
    followers_count = (select count(*) from public.follows f where f.followee_id = p.id),
    following_count = (select count(*) from public.follows f where f.follower_id = p.id)
  where p.id = any(affected);

  return jsonb_build_object('success', true, 'gone', n, 'purged', purged, 'skipped', skipped, 'recountedPeople', coalesce(cardinality(affected), 0));
end;
$$;
revoke execute on function public.purge_gone_accounts(boolean, integer) from public, anon, authenticated;
grant execute on function public.purge_gone_accounts(boolean, integer) to service_role;

-- run it once now (does nothing when there is nothing to clean; refuses when it would remove an unexpectedly large number)
do $$
declare res jsonb;
begin
  res := public.purge_gone_accounts(false, 25);
  raise notice 'deleted-accounts clean-up: %', res;
end $$;
