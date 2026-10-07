-- Only a genuinely missed call writes anything into the chat now — a call that connected (however
-- long it ran) and a declined call no longer log a line at all, so a chat that's used for calling a
-- lot doesn't accumulate a message row per call. log_call_event() is narrowed to the one kind it
-- still needs to support (duration tracking for the dropped 'ended' case goes with it).
drop function if exists public.log_call_event(uuid, text, int);
create function public.log_call_event(p_chat uuid, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); prof public.profiles;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if not public.is_chat_member(p_chat) then raise exception 'You are not a participant in this chat.' using errcode = '42501'; end if;
  if p_kind <> 'missed' then raise exception 'Invalid call event.'; end if;
  select * into prof from public.profiles where id = me;
  perform public.system_message(p_chat, '📞 Missed call from @' || prof.username);
end;
$$;
revoke execute on function public.log_call_event(uuid, text) from public, anon;
grant execute on function public.log_call_event(uuid, text) to authenticated;
