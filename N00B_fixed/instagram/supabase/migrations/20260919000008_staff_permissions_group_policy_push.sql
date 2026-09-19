-- NOOB — Supabase phase 5:
--   1. Delegated administrators: the main admin ticks exactly which powers another person gets; only those work,
--      and every use of them is written to an activity log the main admin can read.
--   2. Groups: admins can switch "only admins can send messages" on/off (everyone sees the same notice).
--      Admin roles (and that setting) also work in the Global Lounge.
--   3. Push notifications: the app's public push key is stored, and every new notification asks the "push" function
--      to deliver it (pop-ups even when the app is closed).
-- Safe to run more than once.

-- ===========================================================================
-- 1. Groups: "only admins can send messages"
-- ===========================================================================
alter table public.chats add column if not exists only_admins_can_send boolean not null default false;

-- Group admin = the creator, anyone promoted to admin, or the main NOOB admin (same rule the app has always shown).
create or replace function public.is_group_admin(p_chat uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.chats c
    where c.id = p_chat and c.is_group and (
      c.creator_id = p_user
      or exists (select 1 from public.chat_members m where m.chat_id = p_chat and m.user_id = p_user and m.is_admin)
      or exists (select 1 from public.profiles p where p.id = p_user and p.is_admin and lower(p.username) = 'noob')
    ));
$$;

-- chat_json: same as before plus the new setting
create or replace function public.chat_json(c public.chats) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', c.id, 'name', c.name, 'avatar', c.avatar, 'description', c.description,
    'participants', coalesce(public.chat_participants_json(c.id), '[]'::jsonb),
    'isGroup', c.is_group, 'creatorId', c.creator_id,
    'adminIds', (
      select coalesce(jsonb_agg(distinct t.x), '[]'::jsonb) from (
        select m2.user_id as x from public.chat_members m2 where m2.chat_id = c.id and m2.is_admin
        union select c.creator_id where c.creator_id is not null
        union select p2.id from public.profiles p2 where c.is_group and p2.is_admin and lower(p2.username) = 'noob'
      ) t),
    'onlyAdminsCanSend', c.only_admins_can_send,
    'isGlobalDefault', c.is_global_default, 'isAi', c.is_ai, 'isEnded', c.is_ended, 'endedAt', c.ended_at, 'review', c.review,
    'unreadCount', (
      select count(*) from public.messages um
      where um.chat_id = c.id and um.sender_id is distinct from auth.uid()
        and um.created_at > coalesce(me.last_read_at, 'epoch'::timestamptz)),
    'isPinned', c.is_global_default or coalesce(me.is_pinned, false), 'isMuted', coalesce(me.is_muted, false),
    'themeColor', c.theme_color, 'vanishMode', c.vanish_mode, 'customNickname', me.nickname,
    'readReceiptsEnabled', c.read_receipts_enabled, 'createdAt', c.created_at,
    'lastMessage', (select public.message_json(lm) from public.messages lm where lm.chat_id = c.id order by lm.created_at desc limit 1))
  from (select 1) v left join public.chat_members me on me.chat_id = c.id and me.user_id = auth.uid();
$$;

-- send_message: identical to before, plus the admins-only rule
create or replace function public.send_message(p_chat uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); prof public.profiles; c public.chats; mid uuid;
  t text := coalesce(p->>'text', ''); media text := nullif(p->>'mediaUrl', '');
  reply jsonb := null; orig public.messages; other uuid;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into prof from public.profiles where id = me;
  if not found or prof.is_suspended then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into c from public.chats where id = p_chat;
  if not found then raise exception 'Chat not found'; end if;
  if not public.is_chat_member(p_chat) then raise exception 'You are not a participant in this chat.' using errcode = '42501'; end if;
  if c.is_group and c.only_admins_can_send and not public.is_group_admin(p_chat, me) then
    raise exception 'Only admins can send messages' using errcode = '42501';
  end if;
  if btrim(t) = '' and media is null and (p->'gameInvite') is null and (p->'sharedTrack') is null then raise exception 'Message cannot be empty.'; end if;

  if not c.is_group then
    select m.user_id into other from public.chat_members m where m.chat_id = p_chat and m.user_id <> me limit 1;
    if other is not null and exists (select 1 from public.blocks b where (b.blocker_id = me and b.blocked_id = other) or (b.blocker_id = other and b.blocked_id = me)) then
      raise exception 'You can''t message this person.' using errcode = '42501';
    end if;
  end if;

  -- only the id of a quoted message is trusted: the quote itself is rebuilt from the real stored message
  if (p->'replyTo'->>'messageId') ~* '^[0-9a-f-]{36}$' then
    select * into orig from public.messages where id = (p->'replyTo'->>'messageId')::uuid and chat_id = p_chat;
    if found then
      reply := jsonb_build_object('messageId', orig.id,
        'senderUsername', (select username from public.profiles where id = orig.sender_id),
        'textPreview', case when nullif(orig.text, '') is not null then left(orig.text, 120)
                            when orig.media_type = 'sticker' then 'Sticker' when orig.media_url is not null then 'Attachment' else '' end);
    end if;
  end if;

  insert into public.messages (chat_id, sender_id, text, media_url, media_type, shared_track, game_invite, reply_to, audio_duration, scheduled_at)
  values (p_chat, me, t, media,
          coalesce(nullif(p->>'mediaType', ''), case when media is not null then 'image' when (p->'gameInvite') is not null then 'game_invite' else 'text' end),
          p->'sharedTrack', p->'gameInvite', reply, nullif(p->>'audioDuration', ''), nullif(p->>'scheduledAt', '')::timestamptz)
  returning id into mid;

  -- 1:1 chats notify the other person (groups don't: one per member per message would flood large groups)
  if not c.is_group and t <> '' and other is not null then
    perform public.notify_user(other, 'new_message', me, '@' || prof.username || ': ' || left(t, 80) || case when length(t) > 80 then '…' else '' end,
                               '💬 New Message', null, null, p_chat);
  end if;
  return jsonb_build_object('success', true, 'message', (select public.message_json(m) from public.messages m where m.id = mid));
end;
$$;

-- Turn the setting on or off (group admins only). Everyone in the group is told with a notice in the chat.
create or replace function public.set_group_send_policy(p_chat uuid, p_only_admins boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.chats; want boolean := coalesce(p_only_admins, false);
begin
  if auth.uid() is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into c from public.chats where id = p_chat and is_group;
  if not found then raise exception 'Group chat not found'; end if;
  if not public.is_chat_admin(p_chat) then raise exception 'Only group admins can change this setting' using errcode = '42501'; end if;
  if c.only_admins_can_send is distinct from want then
    update public.chats set only_admins_can_send = want where id = p_chat;
    perform public.system_message(p_chat, case when want then '🔒 Only admins can send messages now.' else '🔓 All members can send messages now.' end);
  end if;
  return jsonb_build_object('success', true, 'chat', (select public.chat_json(x) from public.chats x where x.id = p_chat));
end;
$$;

-- Making someone a group admin now also works in the Global Lounge (everyone is implicitly a member there).
create or replace function public.manage_group_admin(p_chat uuid, p_target uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.chats; noob uuid;
begin
  select * into c from public.chats where id = p_chat and is_group;
  if not found then raise exception 'Group chat not found'; end if;
  if not public.is_chat_admin(p_chat) then raise exception 'Only group admins can manage admin roles' using errcode = '42501'; end if;
  select id into noob from public.profiles where is_admin and lower(username) = 'noob' limit 1;
  if p_action = 'make_admin' then
    if not exists (select 1 from public.profiles where id = p_target) then raise exception 'That person was not found.'; end if;
    if not c.is_global_default and not exists (select 1 from public.chat_members where chat_id = p_chat and user_id = p_target) then
      raise exception 'That person is not in this group.';
    end if;
    insert into public.chat_members (chat_id, user_id, is_admin) values (p_chat, p_target, true)
    on conflict (chat_id, user_id) do update set is_admin = true;
  elsif p_action = 'remove_admin' then
    if p_target = noob then raise exception 'Cannot remove NOOB official admin from group admin role'; end if;
    if p_target = c.creator_id then raise exception 'Cannot remove group creator from admin role'; end if;
    update public.chat_members set is_admin = false where chat_id = p_chat and user_id = p_target;
  else
    raise exception 'Unknown action.';
  end if;
  return jsonb_build_object('success', true, 'chat', (select public.chat_json(x) from public.chats x where x.id = p_chat),
                            'adminIds', (select public.chat_json(x)->'adminIds' from public.chats x where x.id = p_chat));
end;
$$;

create or replace function public.update_group_details(p_chat uuid, p_name text default null, p_avatar text default null, p_description text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.chats;
begin
  select * into c from public.chats where id = p_chat and is_group;
  if not found then raise exception 'Group chat not found'; end if;
  if not public.is_chat_admin(p_chat) then
    raise exception 'Only group admins can modify group details' using errcode = '42501';
  end if;
  update public.chats set
    name = coalesce(nullif(btrim(p_name), ''), name),
    avatar = coalesce(nullif(p_avatar, ''), avatar),
    description = case when p_description is not null then p_description else description end
  where id = p_chat;
  return jsonb_build_object('success', true, 'chat', (select public.chat_json(x) from public.chats x where x.id = p_chat));
end;
$$;

create or replace function public.remove_group_member(p_chat uuid, p_target uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.chats; me uuid := auth.uid();
begin
  select * into c from public.chats where id = p_chat and is_group;
  if not found then raise exception 'Group chat not found'; end if;
  if c.is_global_default then raise exception 'Everyone on NOOB is in the Global Lounge — people can''t be removed from it.'; end if;
  if not (p_target = me or public.is_chat_admin(p_chat)) then raise exception 'Only group admins can remove members' using errcode = '42501'; end if;
  if p_target = c.creator_id and p_target <> me then raise exception 'Cannot remove group creator'; end if;
  delete from public.chat_members where chat_id = p_chat and user_id = p_target;
  return jsonb_build_object('success', true, 'chat', case when public.is_chat_member(p_chat) then (select public.chat_json(x) from public.chats x where x.id = p_chat) else null end,
                            'participants', coalesce(public.chat_participants_json(p_chat), '[]'::jsonb));
end;
$$;

create or replace function public.add_group_members(p_chat uuid, p_user_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid; c public.chats;
begin
  select * into c from public.chats where id = p_chat and is_group;
  if not found then raise exception 'Group chat not found'; end if;
  if c.is_global_default then raise exception 'Everyone on NOOB is already in the Global Lounge.'; end if;
  if not public.is_chat_admin(p_chat) then raise exception 'Only group admins can add new members' using errcode = '42501'; end if;
  if p_user_ids is null or cardinality(p_user_ids) = 0 then raise exception 'No members provided to add'; end if;
  foreach u in array p_user_ids loop
    if exists (select 1 from public.profiles where id = u) then
      insert into public.chat_members (chat_id, user_id) values (p_chat, u) on conflict do nothing;
    end if;
  end loop;
  return jsonb_build_object('success', true, 'chat', (select public.chat_json(x) from public.chats x where x.id = p_chat),
                            'participants', coalesce(public.chat_participants_json(p_chat), '[]'::jsonb));
end;
$$;

-- ===========================================================================
-- 2. Delegated administrators
-- ===========================================================================
create table if not exists public.admin_grants (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  permissions text[] not null default '{}',
  granted_by  uuid references public.profiles (id) on delete set null,
  granted_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.admin_grants enable row level security;
drop policy if exists admin_grants_select on public.admin_grants;
create policy admin_grants_select on public.admin_grants for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- What each administrator did (who, what, to whom). Only the main admin reads it, through admin_audit_log().
create table if not exists public.admin_audit_log (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_name  text,
  action      text not null,
  target_id   uuid,
  target_name text,
  details     jsonb not null default '{}'
);
create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
alter table public.admin_audit_log enable row level security;

create or replace function public.admin_permission_keys() returns text[]
language sql immutable set search_path = public as $$
  select array['view_accounts', 'suspend_accounts', 'delete_accounts', 'adjust_points', 'handle_reports',
               'send_notifications', 'manage_coupons', 'manage_store', 'moderate_content', 'moderate_chats'];
$$;

-- The main admin: the NOOB account, or any account flagged admin — and not suspended.
create or replace function public.is_master_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (p.is_admin or lower(p.username) = 'noob') and not p.is_suspended from public.profiles p where p.id = auth.uid()), false);
$$;

-- May the signed-in person use this power? (the main admin: always; a delegate: only what was ticked)
create or replace function public.has_permission(p_perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_master_admin() or exists (
    select 1 from public.admin_grants g join public.profiles p on p.id = g.user_id
    where g.user_id = auth.uid() and p_perm = any(g.permissions) and not p.is_suspended);
$$;

create or replace function public.can_moderate_content() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.has_permission('moderate_content');
$$;

create or replace function public.require_permission(p_perm text, p_msg text default 'Access denied. You do not have permission for this.') returns uuid
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or not public.has_permission(p_perm) then raise exception '%', p_msg using errcode = '42501'; end if;
  return me;
end;
$$;

-- Is this person an administrator of any kind (main admin or delegate)?
create or replace function public.is_staff(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = p_user and (p.is_admin or lower(p.username) = 'noob'))
      or exists (select 1 from public.admin_grants g where g.user_id = p_user and cardinality(g.permissions) > 0);
$$;

-- Delegates can never act on the main admin, on another administrator, or on themselves.
create or replace function public.assert_can_act_on(p_target uuid, p_own_ok boolean default false) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if public.is_master_admin() then return; end if;
  if p_target = auth.uid() and not p_own_ok then raise exception 'You can''t do this to your own account.' using errcode = '42501'; end if;
  if public.is_staff(p_target) then raise exception 'Only the main administrator can change another administrator''s account.' using errcode = '42501'; end if;
end;
$$;

create or replace function public.log_admin_action(p_action text, p_target uuid default null, p_details jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.admin_audit_log (actor_id, actor_name, action, target_id, target_name, details)
  values (auth.uid(), (select username from public.profiles where id = auth.uid()), p_action, p_target,
          (select username from public.profiles where id = p_target), coalesce(p_details, '{}'::jsonb));
end;
$$;

-- ---- the main admin's staff tools --------------------------------------------------------
create or replace function public.staff_json(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('userId', p.id, 'username', p.username, 'displayName', coalesce(nullif(p.display_name, ''), p.username),
    'avatar', p.avatar, 'isVerified', p.is_verified, 'permissions', to_jsonb(g.permissions),
    'grantedAt', g.granted_at, 'updatedAt', g.updated_at, 'grantedBy', (select username from public.profiles where id = g.granted_by))
  from public.admin_grants g join public.profiles p on p.id = g.user_id where g.user_id = p_user;
$$;

create or replace function public.admin_staff_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_master_admin('Only the main NOOB administrator can see who has admin access.');
  return jsonb_build_object('success', true, 'staff', coalesce((
    select jsonb_agg(public.staff_json(g.user_id) order by g.granted_at) from public.admin_grants g where cardinality(g.permissions) > 0), '[]'::jsonb));
end;
$$;

create or replace function public.admin_set_permissions(p_user uuid, p_permissions text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid; perms text[]; bad text; t public.profiles; had boolean;
begin
  me := public.require_master_admin('Only the main NOOB administrator can give or remove admin access.');
  select * into t from public.profiles where id = p_user;
  if not found then raise exception 'That account was not found.'; end if;
  if p_user = me or public.is_master_admin_user(p_user) then raise exception 'The main administrator already has full access.'; end if;
  select coalesce(array_agg(distinct x order by x), '{}') into perms from unnest(coalesce(p_permissions, '{}')) x;
  select x into bad from unnest(perms) x where not x = any(public.admin_permission_keys()) limit 1;
  if bad is not null then raise exception 'Unknown permission: %', bad; end if;
  had := exists (select 1 from public.admin_grants where user_id = p_user and cardinality(permissions) > 0);

  if cardinality(perms) = 0 then
    delete from public.admin_grants where user_id = p_user;
    if had then
      perform public.notify_user(p_user, 'admin_direct', me, 'The NOOB administrator removed your admin access.', '🛡️ Admin access removed');
      perform public.log_admin_action('admin_access_removed', p_user, '{}'::jsonb);
    end if;
    return jsonb_build_object('success', true, 'staff', null, 'message', '@' || t.username || ' no longer has admin access.');
  end if;

  insert into public.admin_grants (user_id, permissions, granted_by) values (p_user, perms, me)
  on conflict (user_id) do update set permissions = excluded.permissions, updated_at = now();
  perform public.notify_user(p_user, 'admin_direct', me,
    'The NOOB administrator gave you admin access: ' || replace(array_to_string(perms, ', '), '_', ' ') || '. Open your Profile menu to find the Admin Control Panel.',
    '🛡️ You are now a NOOB admin');
  perform public.log_admin_action('admin_access_set', p_user, jsonb_build_object('permissions', to_jsonb(perms)));
  return jsonb_build_object('success', true, 'staff', public.staff_json(p_user),
    'message', '@' || t.username || ' now has ' || cardinality(perms) || ' admin permission' || case when cardinality(perms) = 1 then '' else 's' end || '.');
end;
$$;

-- (used by admin_set_permissions: is this specific account the main admin?)
create or replace function public.is_master_admin_user(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = p_user and (p.is_admin or lower(p.username) = 'noob'));
$$;

create or replace function public.admin_audit_log(p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_master_admin('Only the main NOOB administrator can read the admin activity log.');
  return jsonb_build_object('success', true, 'entries', coalesce((
    select jsonb_agg(jsonb_build_object('id', l.id, 'at', l.created_at, 'actor', l.actor_name, 'action', l.action,
                                        'target', l.target_name, 'details', l.details) order by l.created_at desc, l.id desc)
    from (select * from public.admin_audit_log order by created_at desc, id desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) l), '[]'::jsonb));
end;
$$;

-- ---- your own record now carries your admin permissions ----------------------------------
create or replace function public.get_my_user() returns jsonb
language sql stable set search_path = public as $$
  select public.user_public_json(p) || jsonb_build_object(
    'email', pp.email, 'firstName', pp.first_name, 'lastName', pp.last_name,
    'countryCode', pp.country_code, 'mobileNumber', pp.mobile_number, 'dateOfBirth', pp.date_of_birth,
    'gender', pp.gender, 'businessEmail', pp.business_email, 'businessPhone', pp.business_phone,
    'businessAddress', pp.business_address, 'businessAddresses', to_jsonb(coalesce(pp.business_addresses, '{}')),
    'agreedToTerms', pp.agreed_to_terms, 'suspendedReason', pp.suspended_reason,
    'isSuspended', p.is_suspended, 'privacySettings', p.privacy_settings,
    'proBilling', p.pro_billing, 'proAutoRenew', p.pro_auto_renew, 'proRenewsAt', p.pro_renews_at,
    'purchasedItemIds', to_jsonb(p.purchased_item_ids),
    'adminPermissions', coalesce((select to_jsonb(g.permissions) from public.admin_grants g where g.user_id = p.id), '[]'::jsonb),
    'blockedUserIds', coalesce((select jsonb_agg(b.blocked_id) from public.blocks b where b.blocker_id = p.id), '[]'::jsonb),
    'followRequests', coalesce((
      select jsonb_agg(jsonb_build_object('userId', r.requester_id, 'username', q.username, 'displayName', q.display_name,
                                          'avatar', q.avatar, 'requestedAt', r.created_at) order by r.created_at desc)
      from public.follow_requests r join public.profiles q on q.id = r.requester_id where r.target_id = p.id), '[]'::jsonb),
    'pendingSentRequests', coalesce((select jsonb_agg(r.target_id) from public.follow_requests r where r.requester_id = p.id), '[]'::jsonb),
    'noobTransactions', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'amount', t.amount, 'reason', t.reason, 'timestamp', t.created_at, 'balanceAfter', t.balance_after)
                       order by t.created_at desc)
      from (select * from public.noob_transactions where user_id = p.id order by created_at desc limit 200) t), '[]'::jsonb)
  )
  from public.profiles p
  left join public.profile_private pp on pp.user_id = p.id
  where p.id = auth.uid();
$$;

-- ---- every admin tool now asks for ITS OWN permission (the main admin always passes) -----
-- One account as THIS administrator may see it: contact details (email, phone, birthday) only with "view accounts".
create or replace function public.admin_user_view(p public.profiles) returns jsonb
language sql stable security definer set search_path = public as $$
  select (case when public.has_permission('view_accounts') then public.admin_user_json(p)
               else public.user_public_json(p) || jsonb_build_object('isSuspended', p.is_suspended,
                      'suspendedReason', (select pp.suspended_reason from public.profile_private pp where pp.user_id = p.id)) end)
         || jsonb_build_object('isStaff', public.is_staff(p.id));
$$;

create or replace function public.admin_users_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.has_permission('view_accounts') or public.has_permission('suspend_accounts') or public.has_permission('delete_accounts')
          or public.has_permission('adjust_points') or public.has_permission('handle_reports')) then
    raise exception 'Access denied. Administrator privileges required.' using errcode = '42501';
  end if;
  return jsonb_build_object('success', true,
    'users', coalesce((select jsonb_agg(public.admin_user_view(p) order by p.created_at) from public.profiles p), '[]'::jsonb));
end;
$$;

create or replace function public.admin_suspend_user(p_target text, p_reason text default null, p_suspend boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid; t public.profiles; reason text; admin_id uuid := public.noob_admin_id();
begin
  me := public.require_permission('suspend_accounts', 'Access denied. You do not have permission to suspend accounts.');
  if btrim(coalesce(p_target, '')) = '' then raise exception 'Target user ID or username is required.'; end if;
  select * into t from public.profiles where id::text = btrim(p_target) or lower(username) = lower(btrim(p_target)) limit 1;
  if not found then raise exception 'Target account not found.'; end if;
  if lower(t.username) = 'noob' then raise exception 'The primary NOOB administrator account cannot be suspended.'; end if;
  perform public.assert_can_act_on(t.id);
  reason := coalesce(nullif(btrim(p_reason), ''), 'Account suspended by NOOB Admin for policy violation');
  perform public.set_suspension(t.id, coalesce(p_suspend, true), reason);
  perform public.notify_user(t.id, 'admin_direct', admin_id,
    case when coalesce(p_suspend, true) then 'Your account @' || t.username || ' has been suspended by NOOB Admin. Reason: ' || reason
         else 'Your account access has been restored by NOOB Administrator. You may now continue using all features.' end,
    case when coalesce(p_suspend, true) then '⚠️ Account Suspended' else '✅ Account Restored' end);
  perform public.log_admin_action(case when coalesce(p_suspend, true) then 'account_suspended' else 'account_restored' end, t.id,
    jsonb_build_object('reason', case when coalesce(p_suspend, true) then reason end));
  return jsonb_build_object('success', true,
    'message', 'Account @' || t.username || ' has been ' || case when coalesce(p_suspend, true) then 'suspended' else 'unsuspended' end || ' successfully.',
    'user', (select public.admin_user_view(p) from public.profiles p where p.id = t.id));
end;
$$;

create or replace function public.admin_delete_user(p_target text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.profiles;
begin
  perform public.require_permission('delete_accounts', 'Access denied. You do not have permission to delete accounts.');
  if btrim(coalesce(p_target, '')) = '' then raise exception 'Target user ID or username is required.'; end if;
  select * into t from public.profiles where id::text = btrim(p_target) or lower(username) = lower(btrim(p_target)) limit 1;
  if not found then raise exception 'Target account not found.'; end if;
  if lower(t.username) = 'noob' or t.is_admin then raise exception 'The primary NOOB administrator account cannot be deleted.'; end if;
  perform public.assert_can_act_on(t.id);
  perform public.log_admin_action('account_deleted', t.id, jsonb_build_object('username', t.username));
  delete from auth.users where id = t.id;   -- cascades to the profile and everything they made
  return jsonb_build_object('success', true, 'message', 'Account @' || t.username || ' and their content have been permanently deleted.');
end;
$$;

create or replace function public.admin_adjust_points(p_target uuid, p_set_to numeric default null, p_delta numeric default null, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.profiles; before_pts bigint; after_pts bigint; admin_id uuid := public.noob_admin_id();
begin
  perform public.require_permission('adjust_points', 'Access denied. You do not have permission to adjust point balances.');
  select * into t from public.profiles where id = p_target for update;
  if not found then raise exception 'Target account not found.'; end if;
  perform public.assert_can_act_on(t.id);
  before_pts := t.noob_points;
  if p_set_to is not null then after_pts := greatest(0, round(p_set_to))::bigint;
  elsif p_delta is not null then after_pts := greatest(0, before_pts + round(p_delta))::bigint;
  else raise exception 'Provide either setTo or delta as a finite number.';
  end if;
  perform public.apply_points(t.id, after_pts - before_pts,
    coalesce(nullif(btrim(p_reason), ''), 'Balance corrected by NOOB Admin (' || public.fmt_points(before_pts) || ' → ' || public.fmt_points(after_pts) || ')'));
  perform public.notify_user(t.id, 'admin_direct', admin_id,
    'Your NOOB Points balance was adjusted by an administrator: ' || public.fmt_points(before_pts) || ' → ' || public.fmt_points(after_pts) || '.',
    '⚠️ Balance Adjusted');
  perform public.log_admin_action('points_adjusted', t.id, jsonb_build_object('from', before_pts, 'to', after_pts, 'reason', nullif(btrim(p_reason), '')));
  return jsonb_build_object('success', true,
    'message', '@' || t.username || '''s balance updated to ' || public.fmt_points(after_pts) || ' points.',
    'user', (select public.admin_user_view(p) from public.profiles p where p.id = t.id));
end;
$$;

create or replace function public.admin_send_notification(p_target text default 'all', p_title text default null, p_message text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.profiles; admin_id uuid := public.noob_admin_id(); nid uuid; clean text; label text; broadcast boolean;
begin
  perform public.require_permission('send_notifications', 'Access denied. You do not have permission to send notifications.');
  if btrim(coalesce(p_title, '')) = '' or btrim(coalesce(p_message, '')) = '' then
    raise exception 'Notification title and message are required.';
  end if;
  clean := regexp_replace(btrim(coalesce(p_target, 'all')), '^@', '');
  broadcast := clean = '' or lower(clean) = 'all';
  if not broadcast then
    select * into t from public.profiles where id::text = clean or lower(username) = lower(clean) limit 1;
    if not found then raise exception 'User "@%" was not found.', clean; end if;
  end if;
  insert into public.notifications (target_user_id, actor_id, type, title, message)
  values (case when broadcast then null else t.id end, admin_id, case when broadcast then 'admin_broadcast' else 'admin_direct' end,
          btrim(p_title), btrim(p_message))
  returning id into nid;
  label := case when broadcast then 'All Users' else '@' || t.username end;
  perform public.log_admin_action('notification_sent', case when broadcast then null else t.id end,
    jsonb_build_object('to', label, 'title', btrim(p_title)));
  return jsonb_build_object('success', true, 'message', 'Custom notification successfully dispatched to ' || label || '.', 'notification', jsonb_build_object('id', nid));
end;
$$;

create or replace function public.admin_reports() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_permission('handle_reports', 'Access denied. Administrator privileges required.');
  return jsonb_build_object('success', true,
    'reports', coalesce((select jsonb_agg(public.report_json(r) order by r.created_at desc) from public.reports r), '[]'::jsonb));
end;
$$;

create or replace function public.admin_report_action(p_id uuid, p_action text default 'resolved', p_suspend boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid; rep public.reports; t public.profiles; st text;
begin
  me := public.require_permission('handle_reports', 'Access denied. Administrator privileges required.');
  if coalesce(p_suspend, false) and not public.has_permission('suspend_accounts') then
    raise exception 'You need the "suspend accounts" permission to suspend the reported account.' using errcode = '42501';
  end if;
  st := case when p_action in ('resolved', 'dismissed', 'banned') then p_action else 'resolved' end;
  update public.reports set status = st, reviewed_by = me, reviewed_at = now() where id = p_id returning * into rep;
  if not found then raise exception 'Report not found'; end if;
  if coalesce(p_suspend, false) then
    select * into t from public.profiles where id = rep.target_id;
    if found and lower(t.username) <> 'noob' then
      perform public.assert_can_act_on(t.id);
      perform public.set_suspension(t.id, true, 'Account suspended following safety report: ' || rep.reason);
    end if;
  end if;
  perform public.log_admin_action('report_' || st, rep.target_id, jsonb_build_object('reportId', rep.id, 'suspended', coalesce(p_suspend, false)));
  return jsonb_build_object('success', true, 'report', public.report_json(rep), 'message', 'Report ' || p_id || ' marked as ' || st || '.');
end;
$$;

create or replace function public.my_coupons(p_manage boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.acting_user(); master boolean;
begin
  master := public.has_permission('manage_coupons');
  return coalesce((
    select jsonb_agg(public.coupon_json(c, me) order by c.created_at desc)
    from public.coupons c
    where (coalesce(p_manage, false) and master)
       or (c.active and (c.target_user_id is null or c.target_user_id = me))
  ), '[]'::jsonb);
end;
$$;

create or replace function public.delete_coupon(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_permission('manage_coupons', 'Only the NOOB admin account can manage coupons.');
  update public.coupons set active = false where id = p_id;
  if not found then raise exception 'Coupon not found.'; end if;
  perform public.log_admin_action('coupon_removed', null, jsonb_build_object('couponId', p_id));
  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.delete_store_product(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_permission('manage_store', 'Only the NOOB admin account can manage products.');
  delete from public.store_products where id = p_id;
  if not found then raise exception 'Product not found.'; end if;
  perform public.log_admin_action('product_removed', null, jsonb_build_object('productId', p_id));
  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.admin_delete_message(p_message uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_permission('moderate_chats', 'Access denied. Administrator privileges required.');
  delete from public.messages where id = p_message;
  if not found then raise exception 'Message not found'; end if;
  perform public.log_admin_action('message_deleted', null, jsonb_build_object('messageId', p_message));
  return jsonb_build_object('success', true, 'message', 'Message deleted successfully');
end;
$$;

-- create_coupon / create_store_product: only the permission check (and a log line) changed
create or replace function public.create_coupon(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid; ctype text; lim text; pct numeric := 100; target uuid; tname text; base text; suffix text;
  new_code text; guard int := 0; termsarr text[]; cid uuid; raw_target text;
begin
  me := public.require_permission('manage_coupons', 'Only the NOOB admin account can create coupons.');
  ctype := case when p->>'type' = 'verification' then 'verification' else 'discount' end;
  lim := case when ctype = 'verification' or p->>'usageLimit' = 'once' then 'once' else 'unlimited' end;
  raw_target := btrim(coalesce(p->>'targetUsername', ''));

  if btrim(coalesce(p->>'title', '')) = '' then raise exception 'A coupon title is required.'; end if;
  if ctype = 'verification' and raw_target = '' then
    raise exception 'A verification coupon must target one specific user.';
  end if;
  if ctype = 'discount' then
    begin pct := (p->>'discountPercent')::numeric; exception when others then pct := null; end;
    if pct is null or pct <= 0 or pct > 100 then raise exception 'Discount must be a percentage between 1 and 100.'; end if;
  end if;

  if raw_target <> '' then
    tname := regexp_replace(raw_target, '^@', '');
    select id, username into target, tname from public.profiles where lower(username) = lower(tname);
    if target is null then raise exception 'No account found for @%.', regexp_replace(raw_target, '^@', ''); end if;
  end if;

  base := left(regexp_replace(upper(p->>'title'), '[^A-Z0-9]', '', 'g'), 10);
  if base = '' then base := 'NOOB'; end if;
  suffix := case when ctype = 'verification' then 'VERIFY' else round(pct)::text end;
  new_code := base || suffix;
  while exists (select 1 from public.coupons c where lower(c.code) = lower(new_code)) and guard < 20 loop
    new_code := base || suffix || (10 + floor(random() * 90))::int::text;
    guard := guard + 1;
  end loop;

  select coalesce(array_agg(t), '{}'::text[]) into termsarr
  from (select btrim(x, E' \t\r') as t from unnest(string_to_array(coalesce(p->>'terms', ''), E'\n')) x) s where t <> '';

  insert into public.coupons (code, title, type, discount_percent, terms, target_user_id, created_by, usage_limit, active)
  values (new_code, btrim(p->>'title'), ctype, round(pct), termsarr, target, me, lim, true)
  returning id into cid;
  perform public.log_admin_action('coupon_created', target, jsonb_build_object('code', new_code, 'type', ctype));
  return jsonb_build_object('success', true, 'coupon', (select public.coupon_json(c, me) from public.coupons c where c.id = cid));
end;
$$;

create or replace function public.create_store_product(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid; media jsonb; photos int; videos int; pr public.store_products;
begin
  me := public.require_permission('manage_store', 'Only the NOOB admin account can add products.');
  if coalesce(jsonb_typeof(p->'price'), '') <> 'number' or (p->>'price')::numeric <= 0 then raise exception 'Enter a valid price.'; end if;
  if btrim(coalesce(p->>'description', '')) = '' then raise exception 'A description is required.'; end if;
  if coalesce(jsonb_typeof(p->'media'), '') <> 'array' or jsonb_array_length(p->'media') = 0 then raise exception 'Add at least one photo or video.'; end if;
  select count(*) filter (where x->>'type' = 'photo'), count(*) filter (where x->>'type' = 'video')
    into photos, videos from jsonb_array_elements(p->'media') x;
  if photos > 10 then raise exception 'A product can have at most 10 photos.'; end if;
  if videos > 10 then raise exception 'A product can have at most 10 videos.'; end if;
  select jsonb_agg(jsonb_build_object('type', case when x->>'type' = 'video' then 'video' else 'photo' end, 'url', x->>'url'))
    into media from jsonb_array_elements(p->'media') x;
  insert into public.store_products (price, description, media, in_stock, created_by)
  values ((p->>'price')::numeric, btrim(p->>'description'), media, coalesce((p->>'inStock')::boolean, true), me)
  returning * into pr;
  perform public.log_admin_action('product_added', null, jsonb_build_object('productId', pr.id));
  return jsonb_build_object('success', true, 'product', jsonb_build_object('id', pr.id, 'price', pr.price,
    'description', pr.description, 'media', pr.media, 'inStock', pr.in_stock, 'createdAt', pr.created_at));
end;
$$;

-- ---- removing other people's posts, reels, stories, comments and music: main admin OR "moderate content" ----
drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts for delete to authenticated
  using (user_id = auth.uid() or public.can_moderate_content());
drop policy if exists reels_delete on public.reels;
create policy reels_delete on public.reels for delete to authenticated
  using (user_id = auth.uid() or public.can_moderate_content());
drop policy if exists stories_delete on public.stories;
create policy stories_delete on public.stories for delete to authenticated
  using (user_id = auth.uid() or public.can_moderate_content());
drop policy if exists story_comments_delete on public.story_comments;
create policy story_comments_delete on public.story_comments for delete to authenticated
  using (user_id = auth.uid() or public.can_moderate_content() or exists (select 1 from public.stories s where s.id = story_id and s.user_id = auth.uid()));
drop policy if exists music_tracks_delete on public.music_tracks;
create policy music_tracks_delete on public.music_tracks for delete to authenticated
  using (uploader_id = auth.uid() or public.can_moderate_content());
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete to authenticated
  using (
    user_id = auth.uid()
    or public.can_moderate_content()
    or exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid())
    or exists (select 1 from public.reels r where r.id = reel_id and r.user_id = auth.uid())
  );

-- ===========================================================================
-- 3. Push notifications
-- ===========================================================================
alter table public.notifications add column if not exists push_sent_at timestamptz;

-- Private settings for the server side (never readable from a browser).
create table if not exists public.internal_config (
  key   text primary key,
  value text not null
);
alter table public.internal_config enable row level security;

-- The app's PUBLIC push key (it is sent to every browser anyway) — the matching private key lives only in the "push" function's secret.
-- Kept in the private config table (not the app settings) so a later data import can never overwrite it.
insert into public.internal_config (key, value) values ('vapid_public_key', 'BJD8vrncNsY8azuccm06W6rB5DKz6OcBqbegOUj5N-ZzAmYW_PgUddPNCQVnoR4lUf9r4f2z5orkhPLfIf6i2r8')
on conflict (key) do update set value = excluded.value;
create or replace function public.get_vapid_public_key() returns text
language sql stable security definer set search_path = public as $$
  select nullif(value, '') from public.internal_config where key = 'vapid_public_key';
$$;

-- Where to send "please deliver this notification" (the Edge Function), and a private password only the database and that function know.
insert into public.internal_config (key, value) values ('push_url', 'https://abffssydapumuhwgzeck.supabase.co/functions/v1/dynamic-handler')
on conflict (key) do nothing;
insert into public.internal_config (key, value) values ('push_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- Every new notification asks the function to push it. This must NEVER stop a notification from being created, so any problem is swallowed.
create or replace function public.push_on_notification() returns trigger
language plpgsql security definer set search_path = public as $$
declare u text; s text;
begin
  begin
    select value into u from public.internal_config where key = 'push_url';
    select value into s from public.internal_config where key = 'push_secret';
    if u is not null and s is not null then
      perform net.http_post(url := u,
                            body := jsonb_build_object('action', 'push', 'notificationId', new.id),
                            headers := jsonb_build_object('Content-Type', 'application/json', 'x-noob-push', s));
    end if;
  exception when others then
    null;
  end;
  return null;
end;
$$;
drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push after insert on public.notifications
  for each row execute function public.push_on_notification();

-- What the push function calls (service role only, and it must know the private password). It marks the notification as pushed —
-- so the same notification is never pushed twice, even if the trigger fires twice — and returns what to say and to whom:
--   * a personal notification goes to that person; a broadcast goes to everyone who turned notifications on
--   * never to the person who caused it, never to a suspended account, never for a chat the person has muted
create or replace function public.push_claim(p_secret text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare expected text; n public.notifications; who text; subs jsonb;
begin
  select value into expected from public.internal_config where key = 'push_secret';
  if expected is null or p_secret is distinct from expected then raise exception 'Unauthorized'; end if;
  update public.notifications set push_sent_at = now() where id = p_id and push_sent_at is null returning * into n;
  if not found then return jsonb_build_object('claimed', false); end if;
  select username into who from public.profiles where id = n.actor_id;
  select coalesce(jsonb_agg(jsonb_build_object('userId', s.user_id, 'subscription', s.subscription)), '[]'::jsonb) into subs
  from public.push_subscriptions s join public.profiles pr on pr.id = s.user_id
  where not pr.is_suspended
    and (n.target_user_id is null or s.user_id = n.target_user_id)
    and s.user_id is distinct from n.actor_id
    and not (n.chat_id is not null and exists (
      select 1 from public.chat_members m where m.chat_id = n.chat_id and m.user_id = s.user_id and m.is_muted));
  return jsonb_build_object(
    'claimed', true,
    'title', left(coalesce(nullif(btrim(n.title), ''), case when who is not null then '@' || who else 'NOOB' end), 100),
    'body', left(coalesce(nullif(btrim(n.message), ''), 'You have a new notification.'), 160),
    'publicKey', (select value from public.internal_config where key = 'vapid_public_key'),
    'recipients', subs);
end;
$$;

-- Removes push addresses the browser's push service says no longer exist (the person uninstalled the app or blocked notifications).
-- Matches on the exact address too, so a fresh subscription the person made a moment ago is never removed by mistake.
create or replace function public.push_forget(p_secret text, p_dead jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare expected text; cnt integer;
begin
  select value into expected from public.internal_config where key = 'push_secret';
  if expected is null or p_secret is distinct from expected then raise exception 'Unauthorized'; end if;
  if p_dead is null or jsonb_typeof(p_dead) <> 'array' then return 0; end if;
  with d as (select (x->>'userId')::uuid as uid, x->>'endpoint' as ep from jsonb_array_elements(p_dead) x)
  delete from public.push_subscriptions s using d where s.user_id = d.uid and s.subscription->>'endpoint' = d.ep;
  get diagnostics cnt = row_count;
  return cnt;
end;
$$;

-- pg_net (the database's built-in way to call a web address) is on by default in Supabase; make sure of it where allowed.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
exception when others then
  raise notice 'pg_net could not be enabled here: %', sqlerrm;
end
$$;

-- ===========================================================================
-- 4. Who may call what
-- ===========================================================================
revoke all on public.admin_grants, public.admin_audit_log, public.internal_config from anon, authenticated;
grant select on public.admin_grants to authenticated;
grant all on public.admin_grants, public.admin_audit_log, public.internal_config to service_role;
grant usage, select on all sequences in schema public to service_role;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.resolve_login_email(text), public.username_taken(text), public.check_signup(jsonb) to anon;

-- Internal helpers: only other database functions may call these — never a browser.
revoke execute on function public.award_points(uuid, bigint, text) from authenticated;
revoke execute on function public.notify_user(uuid, text, uuid, text, text, uuid, uuid, uuid, text) from authenticated;
revoke execute on function public.system_message(uuid, text) from authenticated;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.notify_post_like() from authenticated;
revoke execute on function public.notify_reel_like() from authenticated;
revoke execute on function public.touch_chat_on_message() from authenticated;
revoke execute on function public.bump_counter() from authenticated;
revoke execute on function public.guard_inline_media() from authenticated;
revoke execute on function public.cleanup_expired_stories() from authenticated;
revoke execute on function public.apply_points(uuid, bigint, text) from authenticated;
revoke execute on function public.find_eligible_coupon(text, uuid) from authenticated;
revoke execute on function public.consume_coupon(uuid, uuid) from authenticated;
revoke execute on function public.pick_birthday_gift() from authenticated;
revoke execute on function public.run_birthday_check() from authenticated;
revoke execute on function public.run_pro_renewals() from authenticated;
revoke execute on function public.cleanup_stale_games() from authenticated;
revoke execute on function public.finalize_room_outcome(text, jsonb) from authenticated;
revoke execute on function public.set_suspension(uuid, boolean, text) from authenticated;
revoke execute on function public.game_player_json(uuid) from authenticated;
revoke execute on function public.noob_admin_id() from authenticated;
revoke execute on function public.require_master_admin(text) from authenticated;
revoke execute on function public.acting_user() from authenticated;
revoke execute on function public.report_json(public.reports) from authenticated;
revoke execute on function public.admin_user_json(public.profiles) from authenticated;
revoke execute on function public.admin_user_view(public.profiles) from authenticated;
revoke execute on function public._cron_status() from authenticated;
revoke execute on function public.recovery_check(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.recovery_check(text, text, text, text, text) to service_role;
revoke execute on function public.require_permission(text, text) from authenticated;
revoke execute on function public.assert_can_act_on(uuid, boolean) from authenticated;
revoke execute on function public.log_admin_action(text, uuid, jsonb) from authenticated;
revoke execute on function public.staff_json(uuid) from authenticated;
revoke execute on function public.is_staff(uuid) from authenticated;
revoke execute on function public.is_master_admin_user(uuid) from authenticated;
revoke execute on function public.is_group_admin(uuid, uuid) from authenticated;
revoke execute on function public.push_on_notification() from authenticated;
revoke execute on function public.push_claim(text, uuid), public.push_forget(text, jsonb) from public, anon, authenticated;
grant execute on function public.push_claim(text, uuid), public.push_forget(text, jsonb) to service_role;
