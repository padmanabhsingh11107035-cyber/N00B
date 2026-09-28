-- 1) Two accounts — @NOOB and @padmanabh — can see everyone's posts/reels/stories no matter the account's
--    privacy setting (this already worked for @NOOB via is_admin(); it now also covers @padmanabh, and both
--    routes through can_view_author(), the single choke point every post/reel/story read goes through).
-- 2) A delegate admin (given "Suspend accounts" or "Delete accounts" access from the panel) can no longer act
--    immediately — their tap now files a request that only the main NOOB administrator can approve or reject;
--    approving performs the action right away. The main administrator's own taps still act immediately.
-- 3) Deleting an account (one at a time, or several selected together) needs the NOOB account's own password —
--    nothing else on the panel does.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Super viewers
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.is_super_viewer() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or lower(coalesce((select username from public.profiles where id = auth.uid()), '')) in ('noob', 'padmanabh');
$$;

-- Same rule as before, only the admin check widened from is_admin() to is_super_viewer(). Also fixes a real
-- hole found while testing that widening: "author = auth.uid()" is NULL (not false) for a logged-out visitor,
-- and that NULL then poisoned the whole "or" chain — instead of ending up false, this function came back
-- NULL, which every plain "if not can_view_author(...) then raise" guard (post_by_id, reel_by_id, story_by_id,
-- etc.) silently treats as "don't raise", so a signed-out visitor could read a private account's post/reel/
-- story just by knowing its id. "is not distinct from" is null-safe (false, not null, when signed out), and the
-- outer coalesce makes sure this function can never again return anything but a real true/false.
create or replace function public.can_view_author(author uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    author is not distinct from auth.uid()
    or public.is_super_viewer()
    or (
      not exists (
        select 1 from public.blocks b
        where (b.blocker_id = author and b.blocked_id = auth.uid())
           or (b.blocker_id = auth.uid() and b.blocked_id = author)
      )
      and not exists (select 1 from public.profile_hides h where h.owner_id = author and h.hidden_from_id = auth.uid())
      and (
        (select p.account_type from public.profiles p where p.id = author) <> 'private'
        or exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = author)
        or exists (select 1 from public.follows f where f.follower_id = author and f.followee_id = auth.uid())
      )
    ),
    false
  );
$$;

-- Fixes a real hole found while testing the above: `owner <> auth.uid()` is NULL (not true) for a
-- logged-out visitor, so plpgsql's `if` never ran and these three skipped the can_view_author() check
-- entirely — anyone signed out could fetch ANY post/reel/story by id, private accounts included, just by
-- knowing its id. `is distinct from` is null-safe, so a logged-out visitor now correctly falls through to
-- can_view_author(), which (correctly) refuses them for anything not public.
create or replace function public.post_by_id(p_post uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare owner uuid; archived boolean;
begin
  select user_id, is_archived into owner, archived from public.posts where id = p_post;
  if owner is null or archived then return null; end if;
  if owner is distinct from auth.uid() and not public.can_view_author(owner) then raise exception 'You cannot see this post.' using errcode = '42501'; end if;
  return (select public.post_json(p) from public.posts p where p.id = p_post);
end;
$$;

create or replace function public.reel_by_id(p_reel uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare owner uuid;
begin
  select user_id into owner from public.reels where id = p_reel;
  if owner is null then return null; end if;
  if owner is distinct from auth.uid() and not public.can_view_author(owner) then raise exception 'You cannot see this reel.' using errcode = '42501'; end if;
  return (select public.reel_json(r) from public.reels r where r.id = p_reel);
end;
$$;

create or replace function public.story_by_id(p_story uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare owner uuid;
begin
  select user_id into owner from public.stories where id = p_story;
  if owner is null then return null; end if;
  if owner is distinct from auth.uid() and not public.can_view_author(owner) then raise exception 'You cannot see this story.' using errcode = '42501'; end if;
  return (select public.story_json(s) from public.stories s where s.id = p_story);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Suspend/delete requests — a delegate files one, only the main administrator resolves it
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.account_action_requests (
  id             uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references public.profiles (id) on delete cascade,
  action         text not null check (action in ('suspend', 'unsuspend', 'delete')),
  reason         text,
  requested_by   uuid not null references public.profiles (id) on delete cascade,
  status         text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz,
  resolved_by    uuid references public.profiles (id)
);
create index if not exists account_action_requests_pending_idx on public.account_action_requests (target_user_id, action) where status = 'pending';
alter table public.account_action_requests enable row level security;
revoke all on public.account_action_requests from anon, authenticated;   -- only through the functions below

-- Does the actual work — called once the main administrator has said yes (either right away, or on approval).
create or replace function public._perform_suspend(p_target public.profiles, p_reason text, p_suspend boolean, p_actor uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare reason text; admin_id uuid := public.noob_admin_id();
begin
  reason := coalesce(nullif(btrim(p_reason), ''), 'Account suspended by NOOB Admin for policy violation');
  perform public.set_suspension(p_target.id, coalesce(p_suspend, true), reason);
  perform public.notify_user(p_target.id, 'admin_direct', admin_id,
    case when coalesce(p_suspend, true) then 'Your account @' || p_target.username || ' has been suspended by NOOB Admin. Reason: ' || reason
         else 'Your account access has been restored by NOOB Administrator. You may now continue using all features.' end,
    case when coalesce(p_suspend, true) then '⚠️ Account Suspended' else '✅ Account Restored' end);
  perform public.log_admin_action(case when coalesce(p_suspend, true) then 'account_suspended' else 'account_restored' end, p_target.id,
    jsonb_build_object('reason', case when coalesce(p_suspend, true) then reason end));
  return jsonb_build_object('success', true,
    'message', 'Account @' || p_target.username || ' has been ' || case when coalesce(p_suspend, true) then 'suspended' else 'unsuspended' end || ' successfully.',
    'user', (select public.admin_user_view(p) from public.profiles p where p.id = p_target.id));
end;
$$;

create or replace function public._perform_delete(p_target public.profiles) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  delete from auth.users where id = p_target.id;   -- cascades to the profile and everything they made
  return jsonb_build_object('success', true, 'message', 'Account @' || p_target.username || ' and their content have been permanently deleted.');
end;
$$;

-- The main administrator acts at once; anyone else with "Suspend accounts" access files a request instead.
create or replace function public.admin_suspend_user(p_target text, p_reason text default null, p_suspend boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid; t public.profiles; existing uuid; act text := case when coalesce(p_suspend, true) then 'suspend' else 'unsuspend' end;
begin
  me := public.require_permission('suspend_accounts', 'Access denied. You do not have permission to suspend accounts.');
  if btrim(coalesce(p_target, '')) = '' then raise exception 'Target user ID or username is required.'; end if;
  select * into t from public.profiles where id::text = btrim(p_target) or lower(username) = lower(btrim(p_target)) limit 1;
  if not found then raise exception 'Target account not found.'; end if;
  if lower(t.username) = 'noob' then raise exception 'The primary NOOB administrator account cannot be suspended.'; end if;
  perform public.assert_can_act_on(t.id);

  if public.is_master_admin() then
    return public._perform_suspend(t, p_reason, coalesce(p_suspend, true), me);
  end if;

  select id into existing from public.account_action_requests where target_user_id = t.id and action = act and status = 'pending';
  if existing is not null then
    raise exception 'A request to % @% is already waiting for the NOOB administrator''s approval.', act, t.username;
  end if;
  insert into public.account_action_requests (target_user_id, action, reason, requested_by)
  values (t.id, act, nullif(btrim(p_reason), ''), me);
  perform public.notify_user(public.noob_admin_id(), 'admin_direct', me,
    '@' || (select username from public.profiles where id = me) || ' asked to ' || act || ' @' || t.username || '. Open the admin panel to approve.',
    '🛡️ Approval needed');
  perform public.log_admin_action('action_requested', t.id, jsonb_build_object('action', act));
  return jsonb_build_object('success', true, 'pending', true,
    'message', 'Your request to ' || act || ' @' || t.username || ' has been sent to the NOOB administrator for approval.');
end;
$$;

-- The main administrator's own delete needs their password; a delegate's tap files a request instead (no
-- password — they never actually delete anything themselves).
drop function if exists public.admin_delete_user(text);
create or replace function public.admin_delete_user(p_target text, p_password text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me uuid; t public.profiles; existing uuid; enc text;
begin
  me := public.require_permission('delete_accounts', 'Access denied. You do not have permission to delete accounts.');
  if btrim(coalesce(p_target, '')) = '' then raise exception 'Target user ID or username is required.'; end if;
  select * into t from public.profiles where id::text = btrim(p_target) or lower(username) = lower(btrim(p_target)) limit 1;
  if not found then raise exception 'Target account not found.'; end if;
  if lower(t.username) = 'noob' or t.is_admin then raise exception 'The primary NOOB administrator account cannot be deleted.'; end if;
  perform public.assert_can_act_on(t.id);

  if public.is_master_admin() then
    select encrypted_password into enc from auth.users where id = me;
    if coalesce(p_password, '') = '' or enc is null or crypt(p_password, enc) <> enc then
      raise exception 'Incorrect password. Please re-enter your NOOB account password to confirm.' using errcode = '28P01';
    end if;
    perform public.log_admin_action('account_deleted', t.id, jsonb_build_object('username', t.username));
    return public._perform_delete(t);
  end if;

  select id into existing from public.account_action_requests where target_user_id = t.id and action = 'delete' and status = 'pending';
  if existing is not null then raise exception 'A request to delete @% is already waiting for the NOOB administrator''s approval.', t.username; end if;
  insert into public.account_action_requests (target_user_id, action, requested_by) values (t.id, 'delete', me);
  perform public.notify_user(public.noob_admin_id(), 'admin_direct', me,
    '@' || (select username from public.profiles where id = me) || ' asked to delete @' || t.username || '. Open the admin panel to approve.',
    '🛡️ Approval needed');
  perform public.log_admin_action('action_requested', t.id, jsonb_build_object('action', 'delete'));
  return jsonb_build_object('success', true, 'pending', true,
    'message', 'Your request to delete @' || t.username || ' has been sent to the NOOB administrator for approval.');
end;
$$;

-- Select as many accounts as you like on the panel and delete them together — one password prompt either way.
create or replace function public.admin_bulk_delete_users(p_targets uuid[], p_password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me uuid; enc text; tid uuid; t public.profiles; deleted text[] := '{}'; skipped jsonb := '[]'::jsonb; n int := 0;
begin
  me := public.require_master_admin('Only the main NOOB administrator can delete accounts.');
  if p_targets is null or cardinality(p_targets) = 0 then raise exception 'Choose at least one account to delete.'; end if;
  if cardinality(p_targets) > 200 then raise exception 'Please delete at most 200 accounts at a time.'; end if;
  select encrypted_password into enc from auth.users where id = me;
  if coalesce(p_password, '') = '' or enc is null or crypt(p_password, enc) <> enc then
    raise exception 'Incorrect password. Please re-enter your NOOB account password to confirm.' using errcode = '28P01';
  end if;

  foreach tid in array p_targets loop
    select * into t from public.profiles where id = tid;
    if not found then continue; end if;
    if lower(t.username) = 'noob' or t.is_admin or tid = me then
      skipped := skipped || jsonb_build_object('username', t.username, 'reason', 'protected');
      continue;
    end if;
    perform public.log_admin_action('account_deleted', t.id, jsonb_build_object('username', t.username, 'bulk', true));
    perform public._perform_delete(t);
    deleted := deleted || t.username;
    n := n + 1;
  end loop;

  return jsonb_build_object('success', true, 'deletedCount', n, 'deleted', to_jsonb(deleted), 'skipped', skipped,
    'message', n || ' account' || case when n = 1 then '' else 's' end || ' permanently deleted.');
end;
$$;

-- The main administrator's own list of what is waiting on them — nobody else can call this (no other admin,
-- even with every other permission ticked, can see or act on this page).
create or replace function public.admin_action_requests_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_master_admin('Only the main NOOB administrator can see approval requests.');
  return jsonb_build_object('success', true, 'requests', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'action', r.action, 'reason', r.reason, 'status', r.status, 'createdAt', r.created_at, 'resolvedAt', r.resolved_at,
      'target', jsonb_build_object('id', p.id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar, 'isVerified', p.is_verified),
      'requestedBy', jsonb_build_object('id', rp.id, 'username', rp.username, 'displayName', rp.display_name, 'avatar', rp.avatar)
    ) order by (r.status = 'pending') desc, r.created_at desc)
    from public.account_action_requests r
    join public.profiles p on p.id = r.target_user_id
    join public.profiles rp on rp.id = r.requested_by
    where r.status = 'pending' or r.created_at > now() - interval '7 days'
    limit 200
  ), '[]'::jsonb));
end;
$$;

create or replace function public.admin_resolve_action_request(p_id uuid, p_approve boolean, p_password text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me uuid; r public.account_action_requests; t public.profiles; result jsonb; enc text;
        label text;
begin
  me := public.require_master_admin('Only the main NOOB administrator can approve or reject requests.');
  select * into r from public.account_action_requests where id = p_id for update;
  if not found then raise exception 'That request was not found.'; end if;
  if r.status <> 'pending' then raise exception 'That request was already resolved.'; end if;
  label := case r.action when 'delete' then 'delete' when 'unsuspend' then 'restore' else 'suspend' end;

  if not p_approve then
    update public.account_action_requests set status = 'rejected', resolved_at = now(), resolved_by = me where id = p_id;
    perform public.notify_user(r.requested_by, 'admin_direct', me,
      'Your request to ' || label || ' @' || coalesce((select username from public.profiles where id = r.target_user_id), 'that account') || ' was declined.',
      '🛡️ Request declined');
    perform public.log_admin_action('action_request_rejected', r.target_user_id, jsonb_build_object('action', r.action));
    return jsonb_build_object('success', true, 'message', 'Request declined.');
  end if;

  select * into t from public.profiles where id = r.target_user_id;
  if t.id is null then
    update public.account_action_requests set status = 'rejected', resolved_at = now(), resolved_by = me where id = p_id;
    raise exception 'That account no longer exists; the request was dismissed.';
  end if;

  if r.action = 'delete' then
    select encrypted_password into enc from auth.users where id = me;
    if coalesce(p_password, '') = '' or enc is null or crypt(p_password, enc) <> enc then
      raise exception 'Incorrect password. Please re-enter your NOOB account password to confirm.' using errcode = '28P01';
    end if;
    perform public.log_admin_action('account_deleted', t.id, jsonb_build_object('username', t.username, 'approvedRequest', p_id));
    result := public._perform_delete(t);
  else
    result := public._perform_suspend(t, r.reason, r.action = 'suspend', me);
  end if;

  update public.account_action_requests set status = 'approved', resolved_at = now(), resolved_by = me where id = p_id;
  perform public.notify_user(r.requested_by, 'admin_direct', me,
    'Your request to ' || label || ' @' || t.username || ' was approved and is now done.', '✅ Request approved');
  return result;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Auto-accept follow requests defaults ON (still sticky: once someone switches it off, it stays off)
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.toggle_follow(p_target uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.profiles; auto_accept boolean;
begin
  if me is null then raise exception 'Unauthorized' using errcode = '28000'; end if;
  if p_target = me then raise exception 'You can''t follow yourself.'; end if;
  if (select is_suspended from public.profiles where id = me) then raise exception 'Unauthorized' using errcode = '28000'; end if;
  select * into t from public.profiles where id = p_target;
  if not found then raise exception 'User not found'; end if;

  if exists (select 1 from public.follows where follower_id = me and followee_id = p_target) then
    delete from public.follows where follower_id = me and followee_id = p_target;
  elsif exists (select 1 from public.follow_requests where requester_id = me and target_id = p_target) then
    delete from public.follow_requests where requester_id = me and target_id = p_target;
    delete from public.notifications
      where type = 'follow_request_received' and target_user_id = p_target and actor_id = me and action_status = 'pending';
  else
    if exists (select 1 from public.blocks b where (b.blocker_id = p_target and b.blocked_id = me) or (b.blocker_id = me and b.blocked_id = p_target)) then
      raise exception 'You can''t follow this account.';
    end if;
    if t.account_type = 'private' then
      auto_accept := coalesce((t.privacy_settings->>'autoAcceptFollowRequests')::boolean, true);
      if auto_accept then
        insert into public.follows (follower_id, followee_id) values (me, p_target) on conflict do nothing;
        perform public.notify_user(p_target, 'new_follower', me, 'started following you.');
      else
        insert into public.follow_requests (requester_id, target_id) values (me, p_target) on conflict do nothing;
        perform public.notify_user(p_target, 'follow_request_received', me, 'wants to follow you.', null, null, null, null, 'pending');
      end if;
    else
      insert into public.follows (follower_id, followee_id) values (me, p_target) on conflict do nothing;
      perform public.notify_user(p_target, 'new_follower', me, 'started following you.');
    end if;
  end if;

  return jsonb_build_object(
    'success', true,
    'isFollowing', exists (select 1 from public.follows where follower_id = me and followee_id = p_target),
    'isFollowRequested', exists (select 1 from public.follow_requests where requester_id = me and target_id = p_target),
    'followersCount', (select followers_count from public.profiles where id = p_target)
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Lock down every brand-new function's access explicitly, one function at a time (never with a blanket
-- "grant on all functions" here — that would silently re-open every internal-only function from earlier
-- migrations, since a fresh CREATE FUNCTION defaults to PUBLIC being able to call it).
-- ---------------------------------------------------------------------------------------------------------------
revoke execute on function public.is_super_viewer() from public;
revoke execute on function public._perform_suspend(public.profiles, text, boolean, uuid) from public;
revoke execute on function public._perform_delete(public.profiles) from public;

revoke execute on function public.admin_action_requests_list() from public;
grant execute on function public.admin_action_requests_list() to authenticated;
revoke execute on function public.admin_resolve_action_request(uuid, boolean, text) from public;
grant execute on function public.admin_resolve_action_request(uuid, boolean, text) to authenticated;
revoke execute on function public.admin_bulk_delete_users(uuid[], text) from public;
grant execute on function public.admin_bulk_delete_users(uuid[], text) to authenticated;

-- admin_delete_user was dropped and recreated with a new signature (added p_password), which drops its
-- old grants along with it — put back exactly what it had before.
revoke execute on function public.admin_delete_user(text, text) from public;
grant execute on function public.admin_delete_user(text, text) to authenticated;
