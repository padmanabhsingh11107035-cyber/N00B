-- Follow requests to private accounts are NOT accepted automatically any more.
-- Before: a private account that never touched the switch auto-accepted everybody (the default was ON).
-- Now: the default is OFF, and every account is set to OFF today. Anybody can still switch it on themselves in Settings.
-- Nobody's existing followers or pending requests are touched.

update public.profiles
   set privacy_settings = jsonb_set(coalesce(privacy_settings, '{}'::jsonb), '{autoAcceptFollowRequests}', 'false'::jsonb, true)
 where coalesce(privacy_settings->>'autoAcceptFollowRequests', 'true') <> 'false';

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
      auto_accept := coalesce((t.privacy_settings->>'autoAcceptFollowRequests')::boolean, false);
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
