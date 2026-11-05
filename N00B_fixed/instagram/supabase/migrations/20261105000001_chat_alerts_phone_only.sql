-- Chat alerts are for the PHONE only.
--   1. A new chat message rings the other person's phone (a push notification), also when the app is closed or the phone is offline for a while (the push service holds it
--      and delivers it when the phone is back). Until now only one-to-one chats did this: messages in a GROUP chat never alerted anybody. They do now (the Global Lounge, where
--      every member of NOOB is a member, is left out on purpose; a muted chat stays quiet).
--   2. These alerts are NOT kept in the app: they are not listed on the Notifications page and do not count there. The chat list's own unread numbers are the only in-app trace.
--      The row that carries the alert is removed as soon as it has been handed to the phone (push_claim). Old rows of this kind are only left out of the list (nothing is deleted).
-- Safe to run more than once.

-- ---------------------------------------------------------------------------------------------------- 1. group chats alert their members
create or replace function public.group_message_alert() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.chats; who text; body text; m record; n integer := 0;
begin
  begin
    if new.sender_id is null then return new; end if;
    if new.scheduled_at is not null and new.scheduled_at > now() then return new; end if;   -- a scheduled message rings when it is due, not when it is written
    select * into c from public.chats where id = new.chat_id;
    if not found or not c.is_group or c.is_global_default then return new; end if;
    select username into who from public.profiles where id = new.sender_id;
    body := case when new.e2ee is not null then '🔒 New message'
                 when nullif(btrim(new.text), '') is not null then left(new.text, 80) || case when length(new.text) > 80 then '…' else '' end
                 when new.media_type = 'sticker' then 'Sticker'
                 when new.media_url is not null then 'Attachment'
                 else 'New message' end;
    for m in select user_id from public.chat_members where chat_id = new.chat_id and user_id <> new.sender_id and not is_muted limit 200 loop
      perform public.notify_user(m.user_id, 'new_message', new.sender_id, '@' || coalesce(who, 'someone') || ': ' || body, '💬 ' || coalesce(nullif(btrim(c.name), ''), 'Group chat'), null, null, new.chat_id);
      n := n + 1;
    end loop;
  exception when others then
    null;   -- an alert must never stop a message from being sent
  end;
  return new;
end;
$$;
revoke execute on function public.group_message_alert() from public, anon, authenticated;
drop trigger if exists messages_group_alert on public.messages;
create trigger messages_group_alert after insert on public.messages for each row execute function public.group_message_alert();

-- ---------------------------------------------------------------------------------------------------- 2. not kept in the app
-- The Notifications page leaves chat alerts out (same function as before, one more condition).
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
      and n.type <> 'new_message'
      and n.created_at >= (select coalesce(public.account_history_start(auth.uid()), '-infinity'::timestamptz))
      and not exists (select 1 from public.notification_clears c where c.notification_id = n.id and c.user_id = auth.uid())
    order by n.created_at desc
    limit 150
  ) x;
$$;

-- The row that carries a chat alert is removed once the phone has been told (everything else in push_claim is as before: quiet hours, muted chats, who it goes to).
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
    and not public.in_quiet_hours(s.user_id, now())
    and not (n.type <> 'call_ring' and n.chat_id is not null and exists (
      select 1 from public.chat_members m where m.chat_id = n.chat_id and m.user_id = s.user_id and m.is_muted));
  if n.type = 'new_message' then delete from public.notifications where id = p_id; end if;   -- a chat alert lives on the phone only
  return jsonb_build_object(
    'claimed', true,
    'type', n.type,
    'chatId', n.chat_id,
    'title', left(coalesce(nullif(btrim(n.title), ''), case when who is not null then '@' || who else 'NOOB' end), 100),
    'body', left(coalesce(nullif(btrim(n.message), ''), 'You have a new notification.'), 160),
    'data', n.data,
    'publicKey', (select value from public.internal_config where key = 'vapid_public_key'),
    'recipients', subs);
end;
$$;
revoke execute on function public.push_claim(text, uuid) from public, anon, authenticated;
grant execute on function public.push_claim(text, uuid) to service_role;
