-- Two additions to the call feature:
--
-- 1) log_call_event(): writes a plain system message into the chat summarizing what happened with a
--    call (ended with duration, missed, or declined) — reusing the existing system_message() helper,
--    the exact same mechanism already used for "chat concluded" / "only admins can send" / rating
--    lines. No new message type, column, or renderer needed: it is just a normal text bubble with
--    sender_id null, exactly like those.
--
-- 2) notify_incoming_ring(): unlike the existing ring:<calleeId> Realtime broadcast (ringSignaling.ts),
--    which only reaches a device that already has a live socket open, this writes an actual row into
--    public.notifications — so the EXISTING push pipeline (the notifications_push trigger from
--    20260919000008, already firing on every insert into this table) delivers it through Web Push even
--    to a fully closed app. A random single-use token travels in notifications.data so the edge
--    function can let someone decline straight from the OS notification action without a session.

create or replace function public.log_call_event(p_chat uuid, p_kind text, p_duration_seconds int default null) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); prof public.profiles; line text;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if not public.is_chat_member(p_chat) then raise exception 'You are not a participant in this chat.' using errcode = '42501'; end if;
  select * into prof from public.profiles where id = me;
  line := case p_kind
    when 'ended' then '📞 Call ended · ' || lpad((greatest(coalesce(p_duration_seconds, 0), 0) / 60)::text, 2, '0')
                       || ':' || lpad((greatest(coalesce(p_duration_seconds, 0), 0) % 60)::text, 2, '0')
    when 'missed' then '📞 Missed call from @' || prof.username
    when 'declined' then '📞 @' || prof.username || ' declined the call'
    else null
  end;
  if line is null then raise exception 'Invalid call event.'; end if;
  perform public.system_message(p_chat, line);
end;
$$;

create or replace function public.notify_incoming_ring(p_chat uuid, p_callee uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); prof public.profiles; c public.chats; token text; nid uuid;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into prof from public.profiles where id = me;
  if not found then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into c from public.chats where id = p_chat;
  if not found then raise exception 'Calls are not available in this chat.'; end if;
  if not public.is_chat_member(p_chat) then raise exception 'You are not a participant in this chat.' using errcode = '42501'; end if;
  if not public.can_start_call(p_chat) then raise exception 'Calls are not available in this chat.'; end if;
  if not exists (select 1 from public.chat_members where chat_id = p_chat and user_id = p_callee) then
    raise exception 'That person is not in this chat.';
  end if;
  token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.notifications (target_user_id, actor_id, type, title, message, chat_id, action_status, data)
  values (p_callee, me, 'call_ring', '📞 Incoming call',
          '@' || prof.username || ' is calling you' || case when c.is_group then ' in ' || coalesce(nullif(c.name, ''), 'a group') else '' end,
          p_chat, 'pending',
          jsonb_build_object(
            'token', token, 'chatId', p_chat, 'chatName', coalesce(c.name, ''), 'isGroup', c.is_group,
            'callerId', me, 'callerUsername', prof.username, 'callerDisplayName', prof.display_name, 'callerAvatar', prof.avatar))
  returning id into nid;
  return jsonb_build_object('success', true, 'notificationId', nid);
end;
$$;

-- Called by the edge function (service role only) when the "Decline" action on an incoming-call push
-- notification is tapped — possibly with no NOOB tab open at all, so this can't rely on a user session.
-- The token is a single, unguessable, single-use value this same migration just started minting above,
-- so knowing it is exactly as strong a proof as holding the push subscription that delivered it.
create or replace function public.decline_ring_token(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n public.notifications;
begin
  update public.notifications set action_status = 'declined'
  where type = 'call_ring' and action_status = 'pending' and data->>'token' = p_token
    and created_at > now() - interval '5 minutes'
  returning * into n;
  if not found then return jsonb_build_object('success', false); end if;
  return jsonb_build_object('success', true, 'chatId', n.chat_id, 'callerId', n.actor_id);
end;
$$;
revoke all on function public.decline_ring_token(text) from public, anon, authenticated;
grant execute on function public.decline_ring_token(text) to service_role;

-- push_claim (20260919000008) fed the edge function only {title, body} — enough for a like/comment,
-- but a call needs the type + the caller/chat details + the decline token so the notification can show
-- real Accept/Decline actions. Also: muting a chat's texts should never silence an actual incoming call,
-- so call_ring is exempted from the "chat is muted" push filter that every other notification respects.
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
    and not (n.type <> 'call_ring' and n.chat_id is not null and exists (
      select 1 from public.chat_members m where m.chat_id = n.chat_id and m.user_id = s.user_id and m.is_muted));
  return jsonb_build_object(
    'claimed', true,
    'type', n.type,
    'title', left(coalesce(nullif(btrim(n.title), ''), case when who is not null then '@' || who else 'NOOB' end), 100),
    'body', left(coalesce(nullif(btrim(n.message), ''), 'You have a new notification.'), 160),
    'data', n.data,
    'publicKey', (select value from public.internal_config where key = 'vapid_public_key'),
    'recipients', subs);
end;
$$;
revoke all on function public.push_claim(text, uuid) from public, anon, authenticated;
grant execute on function public.push_claim(text, uuid) to service_role;
