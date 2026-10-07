-- my_notifications() had no limit at all — it returned every notification ever sent to the account
-- and not cleared, in full, every single time it was called (and it's called on every realtime
-- change to the notifications table). For an account with months of history that's a lot of text
-- being re-downloaded for what's really just a recent-activity bell. Caps it at the 150 most recent,
-- same pattern every other "my_X list" function in this app already uses.
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
      and not exists (select 1 from public.notification_clears c where c.notification_id = n.id and c.user_id = auth.uid())
    order by n.created_at desc
    limit 150
  ) x;
$$;
