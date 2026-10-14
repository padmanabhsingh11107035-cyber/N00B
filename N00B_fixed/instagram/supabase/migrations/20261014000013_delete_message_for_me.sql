-- "Delete for me" in chat (like WhatsApp): a person can remove any message, including other people's, from THEIR OWN view of a chat. The message is not deleted:
-- everyone else (and the sender) still sees it. "Delete for everyone" (the author, or a group admin) works as before.
-- Safe to run more than once.

create table if not exists public.message_hides (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  chat_id    uuid not null references public.chats (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);
create index if not exists message_hides_user_chat_idx on public.message_hides (user_id, chat_id, created_at);
alter table public.message_hides enable row level security;
drop policy if exists message_hides_select_own on public.message_hides;
create policy message_hides_select_own on public.message_hides for select to authenticated using (user_id = auth.uid());
revoke all on public.message_hides from anon, authenticated;
grant select on public.message_hides to authenticated;   -- only your own rows (the policy); writing goes through hide_message_for_me

do $$ begin
  alter publication supabase_realtime add table public.message_hides;   -- so a second device of yours drops the message too
exception when others then null;
end $$;

create or replace function public.hide_message_for_me(p_message uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); chat uuid;
begin
  select m.chat_id into chat from public.messages m where m.id = p_message;
  if chat is null then raise exception 'Message not found'; end if;
  if not public.is_chat_member(chat) then raise exception 'You are not a participant in this chat.' using errcode = '42501'; end if;
  insert into public.message_hides (user_id, message_id, chat_id) values (me, p_message, chat) on conflict do nothing;
  return jsonb_build_object('success', true);
end;
$$;
revoke all on function public.hide_message_for_me(uuid) from public, anon;
grant execute on function public.hide_message_for_me(uuid) to authenticated;

-- Opening a chat: the messages YOU have deleted for yourself are left out. A later refresh (p_after) also says which messages you have just removed
-- ("hiddenIds"), so a second device of yours drops them without a full reload.
drop function if exists public.chat_messages(uuid, integer, timestamptz);
create function public.chat_messages(p_chat uuid, p_limit integer default 300, p_after timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.chats where id = p_chat) then raise exception 'Chat not found'; end if;
  if not public.is_chat_member(p_chat) then raise exception 'You are not a participant in this chat.' using errcode = '42501'; end if;
  insert into public.chat_members (chat_id, user_id, last_read_at) values (p_chat, me, now())
  on conflict (chat_id, user_id) do update set last_read_at = now();

  if p_after is not null then
    return jsonb_build_object(
      'messages', coalesce((
        select jsonb_agg(public.message_json(t) order by t.created_at)
        from (select m.* from public.messages m
              where m.chat_id = p_chat and m.updated_at > p_after
                and not exists (select 1 from public.message_hides h where h.user_id = me and h.message_id = m.id)
              order by m.updated_at limit 500) t), '[]'::jsonb),
      'hiddenIds', coalesce((select jsonb_agg(h.message_id) from public.message_hides h where h.user_id = me and h.chat_id = p_chat and h.created_at > p_after - interval '1 minute'), '[]'::jsonb));
  end if;
  return jsonb_build_object('messages', coalesce((
    select jsonb_agg(public.message_json(t) order by t.created_at)
    from (select m.* from public.messages m
          where m.chat_id = p_chat
            and not exists (select 1 from public.message_hides h where h.user_id = me and h.message_id = m.id)
          order by m.created_at desc limit least(greatest(p_limit, 1), 500)) t), '[]'::jsonb));
end;
$$;
grant execute on function public.chat_messages(uuid, integer, timestamptz) to authenticated;

-- The chat list: the preview line and the unread count ignore messages you have deleted for yourself.
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
    'isEncryptable', not c.is_global_default and not c.is_ai and public.chat_is_encryptable(c.id),
    'unreadCount', (
      select count(*) from public.messages um
      where um.chat_id = c.id and um.sender_id is distinct from auth.uid()
        and um.created_at > coalesce(me.last_read_at, 'epoch'::timestamptz)
        and not exists (select 1 from public.message_hides h where h.user_id = auth.uid() and h.message_id = um.id)),
    'isPinned', c.is_global_default or coalesce(me.is_pinned, false), 'isMuted', coalesce(me.is_muted, false),
    'themeColor', c.theme_color, 'vanishMode', c.vanish_mode, 'customNickname', me.nickname,
    'readReceiptsEnabled', c.read_receipts_enabled, 'createdAt', c.created_at,
    'lastMessage', (select public.message_json(lm) from public.messages lm
                    where lm.chat_id = c.id
                      and not exists (select 1 from public.message_hides h where h.user_id = auth.uid() and h.message_id = lm.id)
                    order by lm.created_at desc limit 1))
  from (select 1) v left join public.chat_members me on me.chat_id = c.id and me.user_id = auth.uid();
$$;
