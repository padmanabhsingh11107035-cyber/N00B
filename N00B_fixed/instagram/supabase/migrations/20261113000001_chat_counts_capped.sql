-- P1 (load report): unread counts are capped. Counting every unread message of a huge shared chat made my_chats() take
-- tens of seconds. Each chat now counts at most 100 unread messages (the app shows 100 as "99+"). Counts of 0-99 are unchanged.
-- Only the counting changed; columns, security settings and grants are exactly as in 20261018000003. No data is touched.

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
      select count(*) from (
        select 1 from public.messages um
        where um.chat_id = c.id and um.sender_id is distinct from auth.uid()
          and um.created_at > coalesce(me.last_read_at, 'epoch'::timestamptz)
          and um.created_at >= h.hs
          and not exists (select 1 from public.message_hides hh where hh.user_id = auth.uid() and hh.message_id = um.id)
        limit 100) capped),
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
           (select count(*) from (
              select 1 from public.messages um
               where um.chat_id = r.id and um.sender_id is distinct from auth.uid()
                 and um.created_at >= r.hs
                 and um.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz)
               limit 100) capped) as unread
    from real r
  )
  select jsonb_build_object('unreadChats', count(*) filter (where unread > 0), 'unreadMessages', coalesce(sum(unread), 0)) from per;
$$;
revoke execute on function public.my_unread_chat_summary() from public, anon;
grant execute on function public.my_unread_chat_summary() to authenticated;

-- Missing foreign-key indexes on small tables (only adds indexes).
create index if not exists family_rooms_owner_id_fk_idx on public.family_rooms (owner_id);
create index if not exists family_sealed_user_id_fk_idx on public.family_sealed (user_id);
create index if not exists scratch_comments_user_id_fk_idx on public.scratch_comments (user_id);
create index if not exists scratch_reactions_user_id_fk_idx on public.scratch_reactions (user_id);
create index if not exists scratch_reveals_user_id_fk_idx on public.scratch_reveals (user_id);
create index if not exists scratch_saves_user_id_fk_idx on public.scratch_saves (user_id);
