-- NOOB — Supabase phase 2b: chats, groups, messages (live via Realtime).
--
-- All writes go through functions with their own permission checks, so a person can only ever act as
-- themselves, only inside chats they belong to, and can never promote themselves or forge a message.
-- Reads are protected by row-level security (a chat's messages are visible to its members only; the
-- Global Lounge is open to everyone) and stream live through Supabase Realtime, replacing the old
-- "ask the server every 5 seconds".

-- ===========================================================================
-- 1. Schema additions
-- ===========================================================================
alter table public.chats
  add column is_ai          boolean     not null default false,
  add column is_ended       boolean     not null default false,
  add column ended_at       timestamptz,
  add column review         jsonb,
  add column last_message_at timestamptz not null default now();

alter table public.messages
  add column shared_track   jsonb,
  add column game_invite    jsonb,
  add column audio_duration text,
  add column scheduled_at   timestamptz,
  add column edited_at      timestamptz;

create table public.chat_reviews (
  id         uuid primary key default gen_random_uuid(),
  chat_id    uuid references public.chats (id) on delete set null,
  user_id    uuid references public.profiles (id) on delete set null,
  rating     integer not null check (rating between 1 and 5),
  feedback   text not null default '',
  created_at timestamptz not null default now()
);
alter table public.chat_reviews enable row level security;
create policy chat_reviews_admin_select on public.chat_reviews for select to authenticated using (public.is_admin());
grant select on public.chat_reviews to authenticated;
grant all on public.chat_reviews to service_role;

-- keep "most recent activity" up to date for sorting the chat list
create or replace function public.touch_chat_on_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.chats set last_message_at = new.created_at where id = new.chat_id;
  return null;
end;
$$;
create trigger messages_touch_chat after insert on public.messages
  for each row execute function public.touch_chat_on_message();

-- The one room everybody is in. Created here (with the same id the data import uses) so it always exists.
insert into public.chats (id, name, avatar, description, is_group, is_global_default, theme_color)
values ('48fd69c6-1d91-5380-b643-17d24d3363b0', '🌐 NOOB Global Lounge', '/noob-logo-circle.png',
        'Official global community group chat for all NOOB members', true, true, '#00FF66')
on conflict (id) do nothing;

-- Pictures sent in chat must be real files too, never huge inline images (same guard as profile photos).
create or replace function public.guard_inline_media() returns trigger
language plpgsql set search_path = public as $$
declare v text;
begin
  -- (read the field by name: a plain "new.media_url" would not even compile for the tables that lack it)
  v := to_jsonb(new) ->> (case when tg_table_name in ('post_slides', 'messages') then 'media_url' else 'avatar' end);
  if v is not null and v like 'data:%' and length(v) > 30000 then
    raise exception 'That picture is too large to save directly. Please upload it as a file instead.' using errcode = '22001';
  end if;
  return new;
end;
$$;
create trigger messages_no_inline_media before insert or update of media_url on public.messages
  for each row execute function public.guard_inline_media();

-- ===========================================================================
-- 2. Tighten what a browser may do directly (everything else goes through functions)
-- ===========================================================================
-- These allowed things like "make yourself a group admin" or "rewrite a message's timestamp".
drop policy chat_members_update_self on public.chat_members;
drop policy chats_insert on public.chats;
drop policy chats_update on public.chats;
drop policy chats_delete on public.chats;
drop policy messages_insert on public.messages;
drop policy messages_update on public.messages;
revoke insert, update, delete on public.chats from authenticated;
revoke update on public.chat_members from authenticated;
revoke insert, update on public.messages from authenticated;
-- (members may still LEAVE / be removed — chat_members_delete — and delete messages per messages_delete)

-- ===========================================================================
-- 3. JSON shapes (the old server's)
-- ===========================================================================
create or replace function public.message_json(m public.messages) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', m.id, 'chatId', m.chat_id, 'senderId', coalesce(m.sender_id::text, 'system'),
    'senderUsername', a.username, 'senderDisplayName', a.display_name, 'senderAvatar', a.avatar,
    'senderIsVerified', coalesce(a.is_verified, false),
    'text', m.text, 'mediaUrl', m.media_url, 'mediaType', coalesce(m.media_type, 'text'), 'audioDuration', m.audio_duration,
    'sharedTrack', m.shared_track, 'gameInvite', m.game_invite, 'replyTo', m.reply_to,
    'createdAt', m.created_at, 'isEdited', m.is_edited, 'isPinned', m.is_pinned, 'reactions', m.reactions,
    'scheduledAt', m.scheduled_at,
    -- "read" (blue ticks) once anyone else in the chat has opened it since this was sent
    'status', case when m.sender_id = auth.uid()
                   then case when exists (select 1 from public.chat_members cm
                                          where cm.chat_id = m.chat_id and cm.user_id <> m.sender_id and cm.last_read_at >= m.created_at)
                             then 'read' else 'sent' end
                   else 'read' end)
  from (select 1) v left join public.profiles a on a.id = m.sender_id;
$$;

create or replace function public.chat_participants_json(p_chat uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case
    when (select is_global_default from public.chats where id = p_chat) then
      (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'displayName', p.display_name,
                                                    'avatar', p.avatar, 'isVerified', p.is_verified, 'isAi', p.is_ai)), '[]'::jsonb)
       from (select * from public.profiles order by created_at limit 500) p)
    else
      (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'displayName', p.display_name,
                                                    'avatar', p.avatar, 'isVerified', p.is_verified, 'isAi', p.is_ai) order by m.joined_at), '[]'::jsonb)
       from public.chat_members m join public.profiles p on p.id = m.user_id where m.chat_id = p_chat)
  end
  where public.is_chat_member(p_chat);
$$;

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

create or replace function public.my_chats() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(public.chat_json(x.c) order by x.top desc, x.last_at desc), '[]'::jsonb)
  from (
    select c, (c.is_global_default or coalesce(m.is_pinned, false)) as top, c.last_message_at as last_at
    from public.chats c left join public.chat_members m on m.chat_id = c.id and m.user_id = auth.uid()
    where auth.uid() is not null and (c.is_global_default or m.user_id is not null)
  ) x;
$$;

-- ===========================================================================
-- 4. Creating chats and managing groups
-- ===========================================================================
create or replace function public.create_chat(
  p_participant_ids uuid[], p_is_group boolean default false, p_name text default null,
  p_avatar text default null, p_description text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); ids uuid[]; existing uuid; cid uuid; u uuid;
begin
  if me is null or (select is_suspended from public.profiles where id = me) is not false then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select coalesce(array_agg(distinct p.id), '{}') into ids from public.profiles p where p.id = any(coalesce(p_participant_ids, '{}') || me);

  if not coalesce(p_is_group, false) then
    if cardinality(ids) < 2 then raise exception 'Could not find the other participant to start this chat.'; end if;
    if exists (select 1 from public.blocks b where b.blocker_id = any(ids) and b.blocked_id = any(ids)) then
      raise exception 'You can''t message this person.' using errcode = '42501';
    end if;
    -- reuse the existing 1:1 chat between the same two people
    select c.id into existing from public.chats c
    where not c.is_group and not c.is_global_default
      and (select array_agg(m.user_id order by m.user_id) from public.chat_members m where m.chat_id = c.id)
        = (select array_agg(x order by x) from unnest(ids) x)
    limit 1;
    if existing is not null then
      return jsonb_build_object('success', true, 'chat', (select public.chat_json(c) from public.chats c where c.id = existing));
    end if;
  end if;

  insert into public.chats (name, avatar, description, is_group, creator_id)
  values (case when p_is_group then coalesce(nullif(btrim(p_name), ''), 'Group Chat') else null end,
          case when p_is_group then coalesce(nullif(p_avatar, ''), '/noob-logo-circle.png') else null end,
          nullif(p_description, ''), coalesce(p_is_group, false), case when p_is_group then me else null end)
  returning id into cid;
  foreach u in array ids loop
    insert into public.chat_members (chat_id, user_id, is_admin) values (cid, u, coalesce(p_is_group, false) and u = me);
  end loop;
  return jsonb_build_object('success', true, 'chat', (select public.chat_json(c) from public.chats c where c.id = cid));
end;
$$;

create or replace function public.update_group_details(p_chat uuid, p_name text default null, p_avatar text default null, p_description text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.chats;
begin
  select * into c from public.chats where id = p_chat and is_group and not is_global_default;
  if not found then raise exception 'Group chat not found'; end if;
  if not (c.creator_id = auth.uid() or exists (select 1 from public.chat_members m where m.chat_id = p_chat and m.user_id = auth.uid() and m.is_admin)) then
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

create or replace function public.manage_group_admin(p_chat uuid, p_target uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.chats; noob uuid;
begin
  select * into c from public.chats where id = p_chat and is_group and not is_global_default;
  if not found then raise exception 'Group chat not found'; end if;
  if not public.is_chat_admin(p_chat) then raise exception 'Only group admins can manage admin roles' using errcode = '42501'; end if;
  select id into noob from public.profiles where is_admin and lower(username) = 'noob' limit 1;
  if p_action = 'make_admin' then
    if not exists (select 1 from public.chat_members where chat_id = p_chat and user_id = p_target) then raise exception 'That person is not in this group.'; end if;
    update public.chat_members set is_admin = true where chat_id = p_chat and user_id = p_target;
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

create or replace function public.remove_group_member(p_chat uuid, p_target uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.chats; me uuid := auth.uid();
begin
  select * into c from public.chats where id = p_chat and is_group and not is_global_default;
  if not found then raise exception 'Group chat not found'; end if;
  if not (p_target = me or public.is_chat_admin(p_chat)) then raise exception 'Only group admins can remove members' using errcode = '42501'; end if;
  if p_target = c.creator_id and p_target <> me then raise exception 'Cannot remove group creator'; end if;
  delete from public.chat_members where chat_id = p_chat and user_id = p_target;
  return jsonb_build_object('success', true, 'chat', case when public.is_chat_member(p_chat) then (select public.chat_json(x) from public.chats x where x.id = p_chat) else null end,
                            'participants', coalesce(public.chat_participants_json(p_chat), '[]'::jsonb));
end;
$$;

create or replace function public.add_group_members(p_chat uuid, p_user_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  if not exists (select 1 from public.chats where id = p_chat and is_group and not is_global_default) then raise exception 'Group chat not found'; end if;
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

-- per-person pin / mute (the old app shared one flag between everyone in the chat)
create or replace function public.toggle_chat_flag(p_chat uuid, p_flag text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v boolean;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if not public.is_chat_member(p_chat) then raise exception 'You are not a participant in this chat.' using errcode = '42501'; end if;
  insert into public.chat_members (chat_id, user_id) values (p_chat, me) on conflict do nothing;
  if p_flag = 'pin' then
    update public.chat_members set is_pinned = not is_pinned where chat_id = p_chat and user_id = me returning is_pinned into v;
    return jsonb_build_object('success', true, 'isPinned', v);
  elsif p_flag = 'mute' then
    update public.chat_members set is_muted = not is_muted where chat_id = p_chat and user_id = me returning is_muted into v;
    return jsonb_build_object('success', true, 'isMuted', v);
  end if;
  raise exception 'Unknown chat setting.';
end;
$$;

create or replace function public.update_chat_settings(p_chat uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if not public.is_chat_member(p_chat) then raise exception 'You are not a participant in this chat.' using errcode = '42501'; end if;
  update public.chats set
    theme_color = case when p ? 'themeColor' and (p->>'themeColor') ~ '^#[0-9a-fA-F]{3,8}$' then p->>'themeColor' else theme_color end,
    vanish_mode = case when p ? 'vanishMode' then (p->>'vanishMode')::boolean else vanish_mode end,
    read_receipts_enabled = case when p ? 'readReceiptsEnabled' then (p->>'readReceiptsEnabled')::boolean else read_receipts_enabled end
  where id = p_chat;
  if p ? 'nickname' then
    insert into public.chat_members (chat_id, user_id) values (p_chat, me) on conflict do nothing;
    update public.chat_members set nickname = nullif(btrim(p->>'nickname'), '') where chat_id = p_chat and user_id = me;
  end if;
  return jsonb_build_object('success', true, 'chat', (select public.chat_json(x) from public.chats x where x.id = p_chat));
end;
$$;

-- ===========================================================================
-- 5. Messages
-- ===========================================================================
-- Opening a chat marks it read (blue ticks for the sender, unread badge cleared) and returns the latest messages.
create or replace function public.chat_messages(p_chat uuid, p_limit integer default 300) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.chats where id = p_chat) then raise exception 'Chat not found'; end if;
  if not public.is_chat_member(p_chat) then raise exception 'You are not a participant in this chat.' using errcode = '42501'; end if;
  insert into public.chat_members (chat_id, user_id, last_read_at) values (p_chat, me, now())
  on conflict (chat_id, user_id) do update set last_read_at = now();
  return jsonb_build_object('messages', coalesce((
    select jsonb_agg(public.message_json(t) order by t.created_at)
    from (select * from public.messages where chat_id = p_chat order by created_at desc limit least(greatest(p_limit, 1), 500)) t), '[]'::jsonb));
end;
$$;

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

create or replace function public.edit_message(p_chat uuid, p_message uuid, p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m public.messages; t text := btrim(coalesce(p_text, ''));
begin
  if auth.uid() is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into m from public.messages where id = p_message and chat_id = p_chat;
  if not found then raise exception 'Message not found'; end if;
  if m.sender_id is distinct from auth.uid() then raise exception 'You can only edit your own messages.' using errcode = '42501'; end if;
  if t = '' then raise exception 'Message text cannot be empty.'; end if;
  update public.messages set text = t, is_edited = true, edited_at = now() where id = p_message;
  return jsonb_build_object('success', true, 'message', (select public.message_json(x) from public.messages x where x.id = p_message));
end;
$$;

-- Moderation: the site admin can remove any message (given its id, e.g. from a report) WITHOUT being able to read
-- private chats — being allowed to delete a row in Postgres normally also means being allowed to see it.
create or replace function public.admin_delete_message(p_message uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Access denied. Administrator privileges required.' using errcode = '42501'; end if;
  delete from public.messages where id = p_message;
  if not found then raise exception 'Message not found'; end if;
  return jsonb_build_object('success', true, 'message', 'Message deleted successfully');
end;
$$;

create or replace function public.system_message(p_chat uuid, p_text text) returns uuid
language plpgsql security definer set search_path = public as $$
declare mid uuid;
begin
  insert into public.messages (chat_id, sender_id, text, extra) values (p_chat, null, p_text, '{"system": true}'::jsonb) returning id into mid;
  return mid;
end;
$$;

create or replace function public.end_chat(p_chat uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if not exists (select 1 from public.chats where id = p_chat) then raise exception 'Chat not found'; end if;
  if not public.is_chat_member(p_chat) then raise exception 'You are not a participant in this chat.' using errcode = '42501'; end if;
  update public.chats set is_ended = true, ended_at = now() where id = p_chat;
  perform public.system_message(p_chat, '🏁 This chat session has been concluded. Please leave a rating & review about your experience below!');
  return jsonb_build_object('success', true, 'chat', (select public.chat_json(x) from public.chats x where x.id = p_chat), 'message', 'Chat session successfully ended.');
end;
$$;

create or replace function public.submit_chat_review(p_chat uuid, p_rating integer, p_feedback text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare r integer := least(5, greatest(1, coalesce(p_rating, 5))); rid uuid; rev jsonb;
begin
  if auth.uid() is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if not exists (select 1 from public.chats where id = p_chat) then raise exception 'Chat not found'; end if;
  if not public.is_chat_member(p_chat) then raise exception 'You are not a participant in this chat.' using errcode = '42501'; end if;
  insert into public.chat_reviews (chat_id, user_id, rating, feedback) values (p_chat, auth.uid(), r, coalesce(p_feedback, '')) returning id into rid;
  rev := jsonb_build_object('id', rid, 'chatId', p_chat, 'userId', auth.uid(), 'rating', r, 'feedback', coalesce(p_feedback, ''), 'createdAt', now());
  update public.chats set review = rev where id = p_chat;
  perform public.system_message(p_chat, '⭐ Rating Submitted: ' || repeat('★', r) || repeat('☆', 5 - r) || ' (' || r || '/5 stars). Thank you for your feedback!');
  return jsonb_build_object('success', true, 'review', rev, 'message', 'Thank you for your rating and feedback!');
end;
$$;

create or replace function public.delete_chat(p_chat uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.chats;
begin
  if auth.uid() is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into c from public.chats where id = p_chat;
  if not found then raise exception 'Chat not found'; end if;
  if c.is_global_default then raise exception 'The Global Lounge cannot be deleted.'; end if;
  if not exists (select 1 from public.chat_members where chat_id = p_chat and user_id = auth.uid()) then
    raise exception 'You are not a participant in this chat.' using errcode = '42501';
  end if;
  delete from public.chats where id = p_chat;
  return jsonb_build_object('success', true, 'message', 'Chat conversation deleted successfully');
end;
$$;

-- ===========================================================================
-- 6. Blocking
-- ===========================================================================
create or replace function public.block_user(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Unauthorized' using errcode = '28000'; end if;
  if p_user = me then raise exception 'You can''t block yourself.'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'User not found'; end if;
  insert into public.blocks (blocker_id, blocked_id) values (me, p_user) on conflict do nothing;
  -- blocking also ends the follow both ways, like on every social app
  delete from public.follows where (follower_id = me and followee_id = p_user) or (follower_id = p_user and followee_id = me);
  delete from public.follow_requests where (requester_id = me and target_id = p_user) or (requester_id = p_user and target_id = me);
  return jsonb_build_object('success', true, 'message', 'User successfully blocked.',
    'blockedUserIds', coalesce((select jsonb_agg(blocked_id) from public.blocks where blocker_id = me), '[]'::jsonb));
end;
$$;

create or replace function public.unblock_user(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Unauthorized' using errcode = '28000'; end if;
  delete from public.blocks where blocker_id = me and blocked_id = p_user;
  return jsonb_build_object('success', true, 'message', 'User successfully unblocked.',
    'blockedUserIds', coalesce((select jsonb_agg(blocked_id) from public.blocks where blocker_id = me), '[]'::jsonb));
end;
$$;

-- ===========================================================================
-- 7. Who may call what
-- ===========================================================================
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.resolve_login_email(text), public.username_taken(text), public.check_signup(jsonb) to anon;
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
