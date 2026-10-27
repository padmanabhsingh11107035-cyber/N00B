-- NOOB — Call logs (Messages page > the call icon): every call that ends, is missed or is declined is written down for each person in that chat, and each person can delete
-- their own lines (all of them, or the ones they chose) without touching anybody else's. Until now a call only left a line inside the chat.
-- From the day this is run; older calls are not listed.

create table if not exists public.call_logs (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles (id) on delete cascade,
  chat_id          uuid not null references public.chats (id) on delete cascade,
  actor_id         uuid references public.profiles (id) on delete set null,
  kind             text not null check (kind in ('ended', 'missed', 'declined')),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  created_at       timestamptz not null default now()
);
create index if not exists call_logs_owner_idx on public.call_logs (owner_id, created_at desc);
alter table public.call_logs enable row level security;
revoke all on public.call_logs from public, anon, authenticated;
grant all on public.call_logs to service_role;

-- the same as before (the line in the chat), plus one log line for every person in the chat
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
  insert into public.call_logs (owner_id, chat_id, actor_id, kind, duration_seconds)
  select m.user_id, p_chat, me, p_kind, case when p_kind = 'ended' then greatest(coalesce(p_duration_seconds, 0), 0) end
  from public.chat_members m where m.chat_id = p_chat;
end;
$$;
revoke execute on function public.log_call_event(uuid, text, int) from public, anon;
grant execute on function public.log_call_event(uuid, text, int) to authenticated;

-- my own call lines, newest first (the screen knows the chat names and pictures)
create or replace function public.my_call_logs(p_limit integer default 200) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'chatId', x.chat_id, 'actorId', x.actor_id, 'actorUsername', pr.username,
           'kind', x.kind, 'durationSeconds', x.duration_seconds, 'createdAt', x.created_at) order by x.created_at desc), '[]'::jsonb)
  from (select * from public.call_logs where owner_id = auth.uid() order by created_at desc limit least(greatest(coalesce(p_limit, 200), 1), 500)) x
  left join public.profiles pr on pr.id = x.actor_id;
$$;
revoke execute on function public.my_call_logs(integer) from public, anon;
grant execute on function public.my_call_logs(integer) to authenticated;

-- delete my own lines: the ones given, or all of them when no list is given. Nobody else's lines are touched.
create or replace function public.delete_my_call_logs(p_ids uuid[] default null) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  with gone as (
    delete from public.call_logs where owner_id = auth.uid() and (p_ids is null or id = any (p_ids)) returning 1
  ) select count(*) into n from gone;
  return coalesce(n, 0);
end;
$$;
revoke execute on function public.delete_my_call_logs(uuid[]) from public, anon;
grant execute on function public.delete_my_call_logs(uuid[]) to authenticated;
