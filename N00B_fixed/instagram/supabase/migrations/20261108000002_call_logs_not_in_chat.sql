-- NOOB — Call logs live on the Calls page only: a call (ended, missed or declined) is no longer written into the chat as a line. Safe to run more than once.

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
  -- the Calls page only: nothing is written into the chat any more
  insert into public.call_logs (owner_id, chat_id, actor_id, kind, duration_seconds)
  select m.user_id, p_chat, me, p_kind, case when p_kind = 'ended' then greatest(coalesce(p_duration_seconds, 0), 0) end
  from public.chat_members m where m.chat_id = p_chat;
end;
$$;
revoke execute on function public.log_call_event(uuid, text, int) from public, anon;
grant execute on function public.log_call_event(uuid, text, int) to authenticated;

