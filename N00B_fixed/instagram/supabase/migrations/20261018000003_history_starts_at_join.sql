-- What happened BEFORE a person arrived is not shown to them (nothing is deleted — it is only left out of what they are sent):
--   * notifications: a person who creates their account after this migration sees only notifications from the day they joined (no old broadcasts);
--   * chats: a person who joins a chat after this migration (a new group, or the Global Lounge as a new member of NOOB) sees only the messages from the
--     moment they joined — when they open it, in the chat list's last-message line, and in the unread counts.
-- Everyone who was already here keeps everything they had: the rule starts from the moment this migration is run (history_rules.starts_at) and a
-- membership or account older than that is never cut. Safe to run more than once (the start time is only written the first time).

create table if not exists public.history_rules (
  id        integer primary key default 1 check (id = 1),
  starts_at timestamptz not null default now()
);
insert into public.history_rules (id) values (1) on conflict (id) do nothing;
alter table public.history_rules enable row level security;
revoke all on public.history_rules from anon, authenticated;

-- When did this person's account start counting? NULL = everything (an account older than the rule).
create or replace function public.account_history_start(p_user uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select case when p.created_at >= r.starts_at then p.created_at end
  from public.profiles p, public.history_rules r
  where p.id = p_user;
$$;
revoke all on function public.account_history_start(uuid) from public, anon;
grant execute on function public.account_history_start(uuid) to authenticated;

-- From when may this person see this chat? NULL = all of it. The Global Lounge (everyone is in it) counts from the day the account was made;
-- any other chat counts from the day the person joined it.
create or replace function public.history_start(p_chat uuid, p_user uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select case
           when c.is_global_default then public.account_history_start(p_user)
           else (select case when m.joined_at >= r.starts_at then m.joined_at end
                 from public.chat_members m, public.history_rules r
                 where m.chat_id = c.id and m.user_id = p_user)
         end
  from public.chats c
  where c.id = p_chat;
$$;
revoke all on function public.history_start(uuid, uuid) from public, anon;
grant execute on function public.history_start(uuid, uuid) to authenticated;

-- Notifications: only those from the day the account was made (for accounts made after this migration).
create or replace function public.my_notifications() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('notifications', coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id, 'type', x.type, 'title', x.title, 'message', x.message, 'createdAt', x.created_at,
    'targetUserId', coalesce(x.target_user_id::text, 'all'),
    'actorId', x.actor_id, 'actorUsername', x.username, 'actorDisplayName', x.display_name, 'actorAvatar', x.avatar,
    'senderId', x.actor_id, 'senderUsername', x.username, 'senderDisplayName', x.display_name, 'senderAvatar', x.avatar,
    'senderIsVerified', coalesce(x.is_verified, false),
    'postId', x.post_id, 'reelId', x.reel_id, 'chatId', x.chat_id, 'actionStatus', x.action_status,
    'scratchCardId', x.scratch_card_id,
    'isRead', exists (select 1 from public.notification_reads r where r.notification_id = x.id and r.user_id = auth.uid())
  ) order by x.created_at desc), '[]'::jsonb))
  from (
    select n.*, a.username, a.display_name, a.avatar, a.is_verified, n.data->>'scratchCardId' as scratch_card_id
    from public.notifications n
    left join public.profiles a on a.id = n.actor_id
    where auth.uid() is not null
      and (n.target_user_id = auth.uid() or n.target_user_id is null)
      and n.created_at >= (select coalesce(public.account_history_start(auth.uid()), '-infinity'::timestamptz))
      and not exists (select 1 from public.notification_clears c where c.notification_id = n.id and c.user_id = auth.uid())
    order by n.created_at desc
    limit 150
  ) x;
$$;

-- Opening a chat: only the messages from the moment the person joined it.
drop function if exists public.chat_messages(uuid, integer, timestamptz);
create function public.chat_messages(p_chat uuid, p_limit integer default 300, p_after timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); hs timestamptz;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.chats where id = p_chat) then raise exception 'Chat not found'; end if;
  if not public.is_chat_member(p_chat) then raise exception 'You are not a participant in this chat.' using errcode = '42501'; end if;
  hs := coalesce(public.history_start(p_chat, me), '-infinity'::timestamptz);
  insert into public.chat_members (chat_id, user_id, last_read_at) values (p_chat, me, now())
  on conflict (chat_id, user_id) do update set last_read_at = now();

  if p_after is not null then
    return jsonb_build_object(
      'messages', coalesce((
        select jsonb_agg(public.message_json(t) order by t.created_at)
        from (select m.* from public.messages m
              where m.chat_id = p_chat and m.updated_at > p_after and m.created_at >= hs
                and not exists (select 1 from public.message_hides h where h.user_id = me and h.message_id = m.id)
              order by m.updated_at limit 500) t), '[]'::jsonb),
      'hiddenIds', coalesce((select jsonb_agg(h.message_id) from public.message_hides h where h.user_id = me and h.chat_id = p_chat and h.created_at > p_after - interval '1 minute'), '[]'::jsonb));
  end if;
  return jsonb_build_object('messages', coalesce((
    select jsonb_agg(public.message_json(t) order by t.created_at)
    from (select m.* from public.messages m
          where m.chat_id = p_chat and m.created_at >= hs
            and not exists (select 1 from public.message_hides h where h.user_id = me and h.message_id = m.id)
          order by m.created_at desc limit least(greatest(p_limit, 1), 500)) t), '[]'::jsonb));
end;
$$;
grant execute on function public.chat_messages(uuid, integer, timestamptz) to authenticated;

-- The chat list: the last-message line and the unread count also start from the moment the person joined.
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
        and um.created_at >= h.hs
        and not exists (select 1 from public.message_hides hh where hh.user_id = auth.uid() and hh.message_id = um.id)),
    'isPinned', c.is_global_default or coalesce(me.is_pinned, false), 'isMuted', coalesce(me.is_muted, false),
    'themeColor', c.theme_color, 'vanishMode', c.vanish_mode, 'customNickname', me.nickname,
    'readReceiptsEnabled', c.read_receipts_enabled, 'createdAt', c.created_at,
    'lastMessage', (select public.message_json(lm) from public.messages lm
                    where lm.chat_id = c.id
                      and lm.created_at >= h.hs
                      and not exists (select 1 from public.message_hides hh where hh.user_id = auth.uid() and hh.message_id = lm.id)
                    order by lm.created_at desc limit 1))
  from (select 1) v
  left join public.chat_members me on me.chat_id = c.id and me.user_id = auth.uid()
  cross join lateral (select coalesce(public.history_start(c.id, auth.uid()), '-infinity'::timestamptz) as hs) h;
$$;

-- The unread-chats badge on the bottom bar counts the same way.
create or replace function public.my_unread_chat_summary() returns jsonb
language sql stable security definer set search_path = public as $$
  with mine as (
    select c.id, c.is_ai, c.is_global_default, m.last_read_at,
           coalesce(public.history_start(c.id, auth.uid()), '-infinity'::timestamptz) as hs
    from public.chats c
    left join public.chat_members m on m.chat_id = c.id and m.user_id = auth.uid()
    where auth.uid() is not null and (c.is_global_default or m.user_id is not null)
  ),
  real as (
    select mine.id, mine.last_read_at, mine.hs from mine
    where not coalesce(mine.is_ai, false)
      and case when mine.is_global_default
               then not exists (select 1 from (select pr.is_ai from public.profiles pr order by pr.created_at limit 500) g where g.is_ai)
               else not exists (select 1 from public.chat_members cm join public.profiles pp on pp.id = cm.user_id
                                where cm.chat_id = mine.id and pp.is_ai) end
  ),
  per as (
    select r.id,
           (select count(*) from public.messages um
             where um.chat_id = r.id and um.sender_id is distinct from auth.uid()
               and um.created_at >= r.hs
               and um.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz)) as unread
    from real r
  )
  select jsonb_build_object('unreadChats', count(*) filter (where unread > 0), 'unreadMessages', coalesce(sum(unread), 0)) from per;
$$;
revoke execute on function public.my_unread_chat_summary() from public, anon;
grant execute on function public.my_unread_chat_summary() to authenticated;
