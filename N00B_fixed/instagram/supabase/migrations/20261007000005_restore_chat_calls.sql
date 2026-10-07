-- Restoring voice calling in Chat. The underlying plumbing from before (can_start_call(), and the
-- Realtime Authorization policies for the call:<chatId> and ring:<calleeId> topics — migrations
-- 20260922000024, 20260923000035/36/37) was deliberately left in place when the feature was removed
-- and is unchanged here. This migration only restores the two functions that migration
-- 20260926000002_remove_call_feature.sql dropped — log_call_event() and notify_incoming_ring() —
-- and re-adds call_ring handling to push_claim() so a ring reaches someone even with the app fully
-- closed. Decline-from-the-OS-notification (decline_ring_token) is intentionally NOT restored —
-- declining now always happens inside the app's own incoming-call screen.

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
revoke execute on function public.log_call_event(uuid, text, int) from public, anon;
grant execute on function public.log_call_event(uuid, text, int) to authenticated;

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
revoke execute on function public.notify_incoming_ring(uuid, uuid) from public, anon;
grant execute on function public.notify_incoming_ring(uuid, uuid) to authenticated;

-- push_claim: restores type/data passthrough and the call_ring mute-exemption (muting a chat's
-- texts should never silence an actual incoming call) on top of whatever push_claim currently does
-- for every other notification type — read from the live function, not reconstructed from memory.
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
