-- Chat was re-downloading up to its last 300 messages (reactions, text, replies, shared-post
-- previews, everything) on EVERY tiny change — a new message anywhere in the chat, someone reacting,
-- an edit — AND again every 30 seconds regardless of whether anything changed at all. For an active
-- group chat that's a huge amount of repeated text data for what's usually a single new row.
--
-- This adds an incremental path: the client can ask for only what's new or changed since the last
-- message it already has (`p_after`), instead of the whole history every time. A generic trigger
-- bumps `updated_at` on ANY change to a message row — edits, reactions, whatever comes next — so the
-- incremental query never needs to know which specific columns to watch for.

alter table public.messages add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_message_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists messages_touch_updated_at on public.messages;
create trigger messages_touch_updated_at before update on public.messages
  for each row execute function public.touch_message_updated_at();

drop function if exists public.chat_messages(uuid, integer);
create function public.chat_messages(p_chat uuid, p_limit integer default 300, p_after timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.chats where id = p_chat) then raise exception 'Chat not found'; end if;
  if not public.is_chat_member(p_chat) then raise exception 'You are not a participant in this chat.' using errcode = '42501'; end if;
  insert into public.chat_members (chat_id, user_id, last_read_at) values (p_chat, me, now())
  on conflict (chat_id, user_id) do update set last_read_at = now();

  if p_after is not null then
    return jsonb_build_object('messages', coalesce((
      select jsonb_agg(public.message_json(t) order by t.created_at)
      from (select * from public.messages where chat_id = p_chat and updated_at > p_after order by updated_at limit 500) t), '[]'::jsonb));
  end if;
  return jsonb_build_object('messages', coalesce((
    select jsonb_agg(public.message_json(t) order by t.created_at)
    from (select * from public.messages where chat_id = p_chat order by created_at desc limit least(greatest(p_limit, 1), 500)) t), '[]'::jsonb));
end;
$$;
grant execute on function public.chat_messages(uuid, integer, timestamptz) to authenticated;
