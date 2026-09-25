-- NOOB — "share profile" message type: send someone's profile card into a chat, same shape as the
-- existing sharedTrack/gameInvite rich message types.
--
-- Unlike sharedTrack/gameInvite (already stored exactly as the client sends them — established
-- precedent, unchanged here), the client only ever sends WHICH account (sharedProfileUserId); the
-- server looks that account up itself and builds the stored snapshot from the real row. A shared
-- profile names a specific person, so it is not trusted the same way a music-track caption is —
-- nothing should be able to make @admin's name/avatar show up attached to a profile card that was
-- never actually theirs.

alter table public.messages add column if not exists shared_profile jsonb;

create or replace function public.message_json(m public.messages) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', m.id, 'chatId', m.chat_id, 'senderId', coalesce(m.sender_id::text, 'system'),
    'senderUsername', a.username, 'senderDisplayName', a.display_name, 'senderAvatar', a.avatar,
    'senderIsVerified', coalesce(a.is_verified, false),
    'text', m.text, 'mediaUrl', m.media_url, 'mediaType', coalesce(m.media_type, 'text'), 'audioDuration', m.audio_duration,
    'sharedTrack', m.shared_track, 'gameInvite', m.game_invite, 'sharedProfile', m.shared_profile, 'replyTo', m.reply_to,
    'createdAt', m.created_at, 'isEdited', m.is_edited, 'isPinned', m.is_pinned, 'reactions', m.reactions,
    'scheduledAt', m.scheduled_at, 'e2ee', m.e2ee,
    -- "read" (blue ticks) once anyone else in the chat has opened it since this was sent
    'status', case when m.sender_id = auth.uid()
                   then case when exists (select 1 from public.chat_members cm
                                          where cm.chat_id = m.chat_id and cm.user_id <> m.sender_id and cm.last_read_at >= m.created_at)
                             then 'read' else 'sent' end
                   else 'read' end)
  from (select 1) v left join public.profiles a on a.id = m.sender_id;
$$;

create or replace function public.send_message(p_chat uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); prof public.profiles; c public.chats; mid uuid;
  t text := coalesce(p->>'text', ''); media text := nullif(p->>'mediaUrl', '');
  reply jsonb := null; orig public.messages; other uuid;
  env jsonb := case when jsonb_typeof(p->'e2ee') = 'object' then p->'e2ee' else null end;
  shared_profile_id uuid := nullif(p->>'sharedProfileUserId', '')::uuid;
  shared_profile jsonb := null;
  target public.profiles;
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
  if env is not null then
    if c.is_global_default or c.is_ai then raise exception 'This chat can not be end-to-end encrypted.'; end if;
    if not public.valid_e2ee_envelope(env, me) then raise exception 'That is not a valid encrypted message.'; end if;
    t := ''; media := null;
    if (p->'gameInvite') is not null or (p->'sharedTrack') is not null or shared_profile_id is not null then
      raise exception 'That is not a valid encrypted message.';
    end if;
  end if;

  if shared_profile_id is not null and env is null then
    select * into target from public.profiles where id = shared_profile_id;
    if not found then raise exception 'That account no longer exists.'; end if;
    shared_profile := jsonb_build_object(
      'userId', target.id, 'username', target.username, 'displayName', target.display_name,
      'avatar', target.avatar, 'isVerified', coalesce(target.is_verified, false));
  end if;

  if btrim(t) = '' and media is null and (p->'gameInvite') is null and (p->'sharedTrack') is null and shared_profile is null and env is null then
    raise exception 'Message cannot be empty.';
  end if;

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
        'textPreview', case when orig.e2ee is not null then ''
                            when nullif(orig.text, '') is not null then left(orig.text, 120)
                            when orig.media_type = 'sticker' then 'Sticker' when orig.media_url is not null then 'Attachment' else '' end);
    end if;
  end if;

  insert into public.messages (chat_id, sender_id, text, media_url, media_type, shared_track, game_invite, shared_profile, reply_to, audio_duration, scheduled_at, e2ee)
  values (p_chat, me, t, media,
          coalesce(nullif(p->>'mediaType', ''), case when media is not null then 'image' when (p->'gameInvite') is not null then 'game_invite' else 'text' end),
          case when env is null then p->'sharedTrack' end, case when env is null then p->'gameInvite' end, shared_profile, reply,
          case when env is null then nullif(p->>'audioDuration', '') end, nullif(p->>'scheduledAt', '')::timestamptz, env)
  returning id into mid;

  -- 1:1 chats notify the other person (groups don't: one per member per message would flood large groups)
  if not c.is_group and other is not null and (t <> '' or env is not null or shared_profile is not null) then
    perform public.notify_user(other, 'new_message', me,
      case when env is not null then '@' || prof.username || ': 🔒 New message'
           when t = '' and shared_profile is not null then '@' || prof.username || ' shared @' || (shared_profile->>'username') || '''s profile with you'
           else '@' || prof.username || ': ' || left(t, 80) || case when length(t) > 80 then '…' else '' end end,
      '💬 New Message', null, null, p_chat);
  end if;
  return jsonb_build_object('success', true, 'message', (select public.message_json(m) from public.messages m where m.id = mid));
end;
$$;
