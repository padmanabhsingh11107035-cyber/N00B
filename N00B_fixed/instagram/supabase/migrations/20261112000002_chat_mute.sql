-- Mute notifications per chat (1:1 and groups). Additive only: no table or column changes.
-- chat_members.is_muted already exists (core schema); the chat list already returns it as 'isMuted',
-- and the push filter already skips muted chats (except call rings). This adds an explicit, idempotent
-- "set to this value" function (the older toggle_chat_flag flips, which is unsafe to retry) and a list.

create or replace function public.set_chat_muted(p_chat uuid, p_muted boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v boolean;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if p_muted is null then raise exception 'Say whether to mute or unmute.'; end if;
  if not public.is_chat_member(p_chat) then raise exception 'You are not a participant in this chat.' using errcode = '42501'; end if;
  insert into public.chat_members (chat_id, user_id) values (p_chat, me) on conflict do nothing;
  update public.chat_members set is_muted = p_muted where chat_id = p_chat and user_id = me returning is_muted into v;
  return jsonb_build_object('success', true, 'isMuted', coalesce(v, p_muted));
end;
$$;

create or replace function public.my_muted_chats() returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.chat_id from public.chat_members m where m.user_id = auth.uid() and m.is_muted;
$$;

revoke all on function public.set_chat_muted(uuid, boolean) from public, anon;
revoke all on function public.my_muted_chats() from public, anon;
grant execute on function public.set_chat_muted(uuid, boolean) to authenticated;
grant execute on function public.my_muted_chats() to authenticated;
