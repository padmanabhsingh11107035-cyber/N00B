-- NOOB — tells the OTHER members of a group when a call actually starts (goes from empty to having
-- someone in it). This writes exactly one small notifications row per other member — the same, already
-- existing table every like/comment/message notification already uses — and nothing else: no row is
-- ever written for the call itself (who's in it, audio, video), only this one "a call started" ping,
-- and only once per call, not once per person who joins an already-live one.
create or replace function public.notify_call_started(p_chat uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); prof public.profiles; c public.chats; m record;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into prof from public.profiles where id = me;
  if not found then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into c from public.chats where id = p_chat;
  if not found or not c.is_group or c.is_global_default or c.is_ai or c.only_admins_can_send then
    raise exception 'Calls are not available in this chat.';
  end if;
  if not public.is_chat_member(p_chat) then raise exception 'You are not a participant in this chat.' using errcode = '42501'; end if;

  for m in select user_id from public.chat_members where chat_id = p_chat and user_id <> me loop
    perform public.notify_user(m.user_id, 'call_started', me, '@' || prof.username || ' started a call in ' || coalesce(nullif(c.name, ''), 'the group'), '📞 Call started', null, null, p_chat);
  end loop;
  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function public.notify_call_started(uuid) from public, anon;
grant execute on function public.notify_call_started(uuid) to authenticated, service_role;
