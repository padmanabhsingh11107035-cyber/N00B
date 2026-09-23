-- NOOB — real ringing (incoming-call screen with Accept/Decline) for both 1:1 and group calls, and
-- lets a 1:1 chat call at all (calling was group-only until now).
--
-- Nothing here changes what a call itself already does: still direct, unrecorded WebRTC between
-- devices (see 20260922000024_group_calls.sql), still nothing about a call ever written to a table.
-- "Ringing" is just one more small, ephemeral Realtime broadcast, exactly like the offer/answer/ice
-- signaling a call already uses — ring:<calleeUserId> instead of call:<chatId>, discarded the moment
-- it is delivered, never persisted.

-- 1) A 1:1 chat can now start a call too — was previously refused unless c.is_group. Everything else
--    about who may call stays the same (not the AI chat, not the Global Lounge, not while an
--    "only admins can send" restriction is on — that last one only ever applies to groups anyway).
create or replace function public.can_start_call(p_chat uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.chats c
    where c.id = p_chat and not c.is_global_default and not c.is_ai
      and not c.only_admins_can_send
      and public.is_chat_member(p_chat)
  );
$$;

-- notify_call_started (20260922000025) had its OWN separate, hardcoded "must be a group" check
-- rather than deferring to can_start_call — relaxing can_start_call above without also fixing this
-- would have left the passive "a call started" notification broken for 1:1 chats even though
-- can_start_call now correctly allows them. Rebuilt to check membership first (kept separate, so
-- "you're not a participant" and "calls aren't available here" stay two different, correct error
-- messages) and can_start_call second, so the two functions can never drift apart like this again.
create or replace function public.notify_call_started(p_chat uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); prof public.profiles; c public.chats; m record;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into prof from public.profiles where id = me;
  if not found then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into c from public.chats where id = p_chat;
  if not found then raise exception 'Calls are not available in this chat.'; end if;
  if not public.is_chat_member(p_chat) then raise exception 'You are not a participant in this chat.' using errcode = '42501'; end if;
  if not public.can_start_call(p_chat) then raise exception 'Calls are not available in this chat.'; end if;

  for m in select user_id from public.chat_members where chat_id = p_chat and user_id <> me loop
    perform public.notify_user(m.user_id, 'call_started', me,
      '@' || prof.username || ' started a call in ' || coalesce(nullif(c.name, ''), case when c.is_group then 'the group' else 'the chat' end),
      '📞 Call started', null, null, p_chat);
  end loop;
  return jsonb_build_object('success', true);
end;
$$;

-- 2) Realtime Authorization for ring:<calleeUserId> — a call's *invitation*, separate from the call's
--    own call:<chatId> signaling channel (unchanged). Topic carries only the callee's id, so who a
--    ring is legitimately FOR is checked from the broadcast's own payload (chatId), not the topic:
--      - only the addressed person can ever receive on their own ring:<their-id> channel;
--      - sending requires the sender to be a real, call-eligible member of the chat named in the
--        payload (can_start_call), AND the callee to be a genuine member of that same chat — so this
--        can never be used to ring a stranger you don't share a chat with.
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "ring channel members can receive" on "realtime"."messages"';
    execute 'drop policy if exists "ring channel members can send" on "realtime"."messages"';
    execute $policy$
      create policy "ring channel members can receive" on "realtime"."messages"
        for select to authenticated
        using (
          realtime.topic() like 'ring:%'
          and substring(realtime.topic() from 6)::uuid = auth.uid()
        )
    $policy$;
    execute $policy$
      create policy "ring channel members can send" on "realtime"."messages"
        for insert to authenticated
        with check (
          realtime.topic() like 'ring:%'
          and payload ? 'chatId'
          and public.can_start_call((payload->>'chatId')::uuid)
          and exists (
            select 1 from public.chat_members cm
            where cm.chat_id = (payload->>'chatId')::uuid
              and cm.user_id = substring(realtime.topic() from 6)::uuid
          )
        )
    $policy$;
  end if;
end
$$;
