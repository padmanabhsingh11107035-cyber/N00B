-- NOOB — show the "encrypted" / "not encrypted" tag on every row of the chat LIST, not only once a
-- chat is opened. chat_json itself is a plain (non-definer) function, so it runs with the CALLER's own
-- privileges — and chat_keys refuses authenticated entirely (only service_role and the definer
-- functions in migration 15 may read it). A small security-definer helper does the actual check, the
-- same way chat_member_keys already safely does for the open-chat header.
create or replace function public.chat_is_encryptable(p_chat uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.chat_members m where m.chat_id = p_chat)
     and not exists (
       select 1 from public.chat_members m where m.chat_id = p_chat
         and not exists (select 1 from public.chat_keys k where k.user_id = m.user_id and k.active)
     );
$$;

revoke execute on function public.chat_is_encryptable(uuid) from public, anon;
grant execute on function public.chat_is_encryptable(uuid) to authenticated, service_role;

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
    'isEncryptable', not c.is_global_default and not c.is_ai and public.chat_is_encryptable(c.id),
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
