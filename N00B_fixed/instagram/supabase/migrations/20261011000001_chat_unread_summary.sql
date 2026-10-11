-- The little unread-chats badge on the bottom bar used to download the WHOLE chat list (every chat, its last message, and for the
-- everyone-included Lounge up to 500 people) every 30 seconds AND every time anyone sent a message anywhere, for every person who
-- had the app open. That is a lot of data for one number. This returns just the numbers.
--
-- "Real chat" is exactly the filter the app already applied: not an AI chat, and no AI account among its people.
create or replace function public.my_unread_chat_summary() returns jsonb
language sql stable security definer set search_path = public as $$
  with mine as (
    select c.id, c.is_ai, c.is_global_default, m.last_read_at
    from public.chats c
    left join public.chat_members m on m.chat_id = c.id and m.user_id = auth.uid()
    where auth.uid() is not null and (c.is_global_default or m.user_id is not null)
  ),
  real as (
    select mine.id, mine.last_read_at from mine
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
               and um.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz)) as unread
    from real r
  )
  select jsonb_build_object('unreadChats', count(*) filter (where unread > 0), 'unreadMessages', coalesce(sum(unread), 0)) from per;
$$;

revoke execute on function public.my_unread_chat_summary() from public, anon;
grant execute on function public.my_unread_chat_summary() to authenticated;
