-- NOOB — Supabase phase 12: END-TO-END ENCRYPTED CHATS.
-- Direct chats and private groups can now carry messages that are LOCKED on the sender's device and only opened on the devices of the
-- people in the chat: the server stores and delivers the locked message but can not read it. This migration is purely ADDITIVE:
--   * no existing message, chat, account or setting is changed or removed (old messages stay exactly as they are, readable as before);
--   * a new nullable column messages.e2ee holds the locked envelope of an encrypted message (its "text" stays empty);
--   * chat_keys keeps each device's PUBLIC key (the private half never leaves the device; a private key is refused if it is ever sent);
--   * chat_key_backups keeps an optional backup of a person's device keys that is locked with a passphrase only they know.
-- The Global Lounge and the AI chat stay readable by the server (they are public / answered by the server), and a chat where somebody has not
-- updated the app yet keeps working as before, unlocked, until everyone has a key. Safe to run more than once.

-- ---------------------------------------------------------------------------- keys
create table if not exists public.chat_keys (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kid        text not null check (kid ~ '^[0-9a-f]{16}$'),
  public_key jsonb not null,
  label      text not null default '' check (char_length(label) <= 60),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, kid)
);
create index if not exists chat_keys_active_idx on public.chat_keys (user_id) where active;
alter table public.chat_keys enable row level security;
revoke all on public.chat_keys from anon, authenticated;
grant all on public.chat_keys to service_role;

create table if not exists public.chat_key_backups (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  blob       jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.chat_key_backups enable row level security;
revoke all on public.chat_key_backups from anon, authenticated;
grant all on public.chat_key_backups to service_role;

alter table public.messages add column if not exists e2ee jsonb;

-- A public key (and only a public key): the curve's name, two coordinates, nothing else. A private key ("d") is refused.
create or replace function public.valid_chat_public_key(k jsonb) returns boolean
language sql immutable set search_path = public as $$
  select case
    when jsonb_typeof(k) is distinct from 'object' then false
    when k->>'kty' is distinct from 'EC' or k->>'crv' is distinct from 'P-256' then false
    when coalesce(k->>'x', '') !~ '^[A-Za-z0-9_-]{43}$' or coalesce(k->>'y', '') !~ '^[A-Za-z0-9_-]{43}$' then false
    else (k - 'kty' - 'crv' - 'x' - 'y') = '{}'::jsonb
  end;
$$;

-- A locked message: version 1, a locked text, a locked key for at least one and at most 200 devices, from one of the sender's own keys.
-- (Checked step by step, so odd input is simply refused and never causes an error.)
create or replace function public.valid_e2ee_envelope(e jsonb, p_sender uuid) returns boolean
language sql stable set search_path = public as $$
  select case
    when jsonb_typeof(e) is distinct from 'object' then false
    when e->>'v' is distinct from '1' or length(e::text) > 60000 then false
    when jsonb_typeof(e->'keys') is distinct from 'object' or jsonb_typeof(e->'epk') is distinct from 'object' then false
    when coalesce(e->>'ct', '') = '' or coalesce(e->>'iv', '') = '' then false
    when (select count(*) from jsonb_object_keys(e->'keys')) not between 1 and 200 then false
    else exists (select 1 from public.chat_keys k where k.user_id = p_sender and k.kid = e->>'skid')
  end;
$$;

-- Register this device's public key (at most 8 devices at a time: the oldest is switched off beyond that).
create or replace function public.register_chat_key(p_kid text, p_key jsonb, p_label text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); existing jsonb;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if exists (select 1 from public.profiles where id = me and is_suspended) then raise exception 'Please log in.' using errcode = '28000'; end if;
  if coalesce(p_kid, '') !~ '^[0-9a-f]{16}$' then raise exception 'That is not a valid key id.'; end if;
  if not public.valid_chat_public_key(p_key) then raise exception 'That is not a valid public key.'; end if;
  select public_key into existing from public.chat_keys where user_id = me and kid = p_kid;
  if existing is not null and existing <> p_key then raise exception 'That key id is already used by a different key.'; end if;
  insert into public.chat_keys (user_id, kid, public_key, label) values (me, p_kid, p_key, left(btrim(coalesce(p_label, '')), 60))
  on conflict (user_id, kid) do update set active = true;
  update public.chat_keys set active = false
   where user_id = me and active and kid not in (select kid from public.chat_keys where user_id = me and active order by created_at desc limit 8);
  return public.my_chat_keys();
end;
$$;

create or replace function public.my_chat_keys() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  return jsonb_build_object('success', true,
    'keys', coalesce((select jsonb_agg(jsonb_build_object('kid', kid, 'label', label, 'active', active, 'createdAt', created_at) order by created_at) from public.chat_keys where user_id = me), '[]'::jsonb),
    'hasBackup', exists (select 1 from public.chat_key_backups where user_id = me),
    'backupAt', (select updated_at from public.chat_key_backups where user_id = me));
end;
$$;

-- Switch a device's key off (for example a lost phone): new messages are no longer locked for it.
create or replace function public.remove_chat_key(p_kid text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  update public.chat_keys set active = false where user_id = me and kid = p_kid;
  return public.my_chat_keys();
end;
$$;

-- Everything a sender needs to lock a message for this chat: the public keys of every member's devices. Only members may ask. Chats that
-- the server has to read (the public Global Lounge, the AI chat), very large groups, and chats where somebody has no key yet are not
-- "encryptable": messages there are sent as before.
create or replace function public.chat_member_keys(p_chat uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c public.chats; n integer; miss uuid[];
begin
  if auth.uid() is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into c from public.chats where id = p_chat;
  if not found then raise exception 'Chat not found'; end if;
  if not public.is_chat_member(p_chat) then raise exception 'You are not a participant in this chat.' using errcode = '42501'; end if;
  if c.is_global_default or c.is_ai then return jsonb_build_object('encryptable', false, 'reason', 'public'); end if;
  select count(*) into n from public.chat_members where chat_id = p_chat;
  if n > 100 then return jsonb_build_object('encryptable', false, 'reason', 'large'); end if;
  select coalesce(array_agg(m.user_id), '{}') into miss from public.chat_members m
   where m.chat_id = p_chat and not exists (select 1 from public.chat_keys k where k.user_id = m.user_id and k.active);
  return jsonb_build_object('encryptable', n > 0 and coalesce(array_length(miss, 1), 0) = 0, 'reason', case when coalesce(array_length(miss, 1), 0) > 0 then 'missing' else 'ok' end,
    'isGroup', c.is_group, 'missing', to_jsonb(miss),
    'members', coalesce((select jsonb_agg(jsonb_build_object('userId', m.user_id, 'username', p.username,
        'keys', coalesce((select jsonb_agg(jsonb_build_object('kid', k.kid, 'key', k.public_key) order by k.created_at)
                          from public.chat_keys k where k.user_id = m.user_id and k.active), '[]'::jsonb)))
      from public.chat_members m join public.profiles p on p.id = m.user_id where m.chat_id = p_chat), '[]'::jsonb));
end;
$$;

-- One person's public keys (also old, switched-off ones: needed to check who sent an old message). Public keys are public.
create or replace function public.chat_keys_of(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('kid', kid, 'key', public_key, 'active', active) order by created_at)
                   from (select * from public.chat_keys where user_id = p_user order by created_at desc limit 50) k), '[]'::jsonb);
end;
$$;

-- The passphrase-locked backup of a person's device keys (only they can read or change it).
create or replace function public.save_chat_key_backup(p_blob jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if jsonb_typeof(p_blob) <> 'object' or p_blob->>'v' <> '1' or length(p_blob::text) > 200000
     or coalesce(p_blob->>'salt', '') = '' or coalesce(p_blob->>'iv', '') = '' or coalesce(p_blob->>'ct', '') = ''
     or coalesce(p_blob->>'iterations', '') !~ '^[0-9]{5,7}$' or (p_blob->>'iterations')::int not between 100000 and 5000000 then
    raise exception 'That is not a valid key backup.';
  end if;
  insert into public.chat_key_backups (user_id, blob) values (me, p_blob)
  on conflict (user_id) do update set blob = excluded.blob, updated_at = now();
  return public.my_chat_keys();
end;
$$;

create or replace function public.get_chat_key_backup() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  return jsonb_build_object('success', true, 'backup', (select blob from public.chat_key_backups where user_id = me));
end;
$$;

create or replace function public.delete_chat_key_backup() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  delete from public.chat_key_backups where user_id = me;
  return public.my_chat_keys();
end;
$$;

-- ---------------------------------------------------------------------------- messages
-- What the app receives for a message: the same as before, plus the locked envelope of an encrypted one.
create or replace function public.message_json(m public.messages) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', m.id, 'chatId', m.chat_id, 'senderId', coalesce(m.sender_id::text, 'system'),
    'senderUsername', a.username, 'senderDisplayName', a.display_name, 'senderAvatar', a.avatar,
    'senderIsVerified', coalesce(a.is_verified, false),
    'text', m.text, 'mediaUrl', m.media_url, 'mediaType', coalesce(m.media_type, 'text'), 'audioDuration', m.audio_duration,
    'sharedTrack', m.shared_track, 'gameInvite', m.game_invite, 'replyTo', m.reply_to,
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

-- send_message: exactly as before, plus locked messages ("e2ee"). A locked message has no visible text, picture or track (the server can not
-- see it); its notification says only that a message arrived; a quote of a locked message shows no text from the server.
create or replace function public.send_message(p_chat uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); prof public.profiles; c public.chats; mid uuid;
  t text := coalesce(p->>'text', ''); media text := nullif(p->>'mediaUrl', '');
  reply jsonb := null; orig public.messages; other uuid;
  env jsonb := case when jsonb_typeof(p->'e2ee') = 'object' then p->'e2ee' else null end;
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
    if (p->'gameInvite') is not null or (p->'sharedTrack') is not null then raise exception 'That is not a valid encrypted message.'; end if;
  end if;
  if btrim(t) = '' and media is null and (p->'gameInvite') is null and (p->'sharedTrack') is null and env is null then raise exception 'Message cannot be empty.'; end if;

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

  insert into public.messages (chat_id, sender_id, text, media_url, media_type, shared_track, game_invite, reply_to, audio_duration, scheduled_at, e2ee)
  values (p_chat, me, t, media,
          coalesce(nullif(p->>'mediaType', ''), case when media is not null then 'image' when (p->'gameInvite') is not null then 'game_invite' else 'text' end),
          case when env is null then p->'sharedTrack' end, case when env is null then p->'gameInvite' end, reply,
          case when env is null then nullif(p->>'audioDuration', '') end, nullif(p->>'scheduledAt', '')::timestamptz, env)
  returning id into mid;

  -- 1:1 chats notify the other person (groups don't: one per member per message would flood large groups)
  if not c.is_group and other is not null and (t <> '' or env is not null) then
    perform public.notify_user(other, 'new_message', me,
      case when env is not null then '@' || prof.username || ': 🔒 New message'
           else '@' || prof.username || ': ' || left(t, 80) || case when length(t) > 80 then '…' else '' end end,
      '💬 New Message', null, null, p_chat);
  end if;
  return jsonb_build_object('success', true, 'message', (select public.message_json(m) from public.messages m where m.id = mid));
end;
$$;

-- Editing: a locked message can only be replaced by another locked message (the readable edit path refuses it, so a plain-text edit can
-- never leak or overwrite a locked message).
create or replace function public.edit_message(p_chat uuid, p_message uuid, p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m public.messages; t text := btrim(coalesce(p_text, ''));
begin
  if auth.uid() is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into m from public.messages where id = p_message and chat_id = p_chat;
  if not found then raise exception 'Message not found'; end if;
  if m.sender_id is distinct from auth.uid() then raise exception 'You can only edit your own messages.' using errcode = '42501'; end if;
  if m.e2ee is not null then raise exception 'This message is end-to-end encrypted, so it has to be edited from the app.'; end if;
  if t = '' then raise exception 'Message text cannot be empty.'; end if;
  update public.messages set text = t, is_edited = true, edited_at = now() where id = p_message;
  return jsonb_build_object('success', true, 'message', (select public.message_json(x) from public.messages x where x.id = p_message));
end;
$$;

create or replace function public.edit_message_e2ee(p_chat uuid, p_message uuid, p_e2ee jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m public.messages;
begin
  if auth.uid() is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into m from public.messages where id = p_message and chat_id = p_chat;
  if not found then raise exception 'Message not found'; end if;
  if m.sender_id is distinct from auth.uid() then raise exception 'You can only edit your own messages.' using errcode = '42501'; end if;
  if m.e2ee is null then raise exception 'That message is not an encrypted one.'; end if;
  if not public.valid_e2ee_envelope(p_e2ee, auth.uid()) then raise exception 'That is not a valid encrypted message.'; end if;
  update public.messages set e2ee = p_e2ee, is_edited = true, edited_at = now() where id = p_message;
  return jsonb_build_object('success', true, 'message', (select public.message_json(x) from public.messages x where x.id = p_message));
end;
$$;

-- ---------------------------------------------------------------------------- who may call what
revoke execute on function public.valid_chat_public_key(jsonb), public.valid_e2ee_envelope(jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.register_chat_key(text, jsonb, text), public.my_chat_keys(), public.remove_chat_key(text), public.chat_member_keys(uuid),
  public.chat_keys_of(uuid), public.save_chat_key_backup(jsonb), public.get_chat_key_backup(), public.delete_chat_key_backup(),
  public.edit_message_e2ee(uuid, uuid, jsonb) from public, anon;
grant execute on function public.register_chat_key(text, jsonb, text), public.my_chat_keys(), public.remove_chat_key(text), public.chat_member_keys(uuid),
  public.chat_keys_of(uuid), public.save_chat_key_backup(jsonb), public.get_chat_key_backup(), public.delete_chat_key_backup(),
  public.edit_message_e2ee(uuid, uuid, jsonb) to authenticated, service_role;
