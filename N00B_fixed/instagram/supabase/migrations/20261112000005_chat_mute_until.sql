-- Mute a chat for 8 hours / 1 week / always. Additive only: ONE new table, new functions, one cron job. Nothing that exists is changed.
-- chat_members.is_muted (what the push filter reads) is still the single switch; this only remembers WHEN it should switch back off.

create table if not exists public.chat_mute_until (
  chat_id uuid not null,
  user_id uuid not null,
  until timestamptz not null,
  primary key (chat_id, user_id)
);
alter table public.chat_mute_until enable row level security;
-- no policies on purpose: nobody reads or writes this table directly, only the functions below (security definer)
revoke all on public.chat_mute_until from public, anon, authenticated;

-- p_hours null or 0 = always (no end time); -1 = unmute (and forget the end time); otherwise muted for that many hours.
create or replace function public.set_chat_muted_for(p_chat uuid, p_hours integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v boolean; u timestamptz;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if p_hours is not null and (p_hours < -1 or p_hours > 8760) then raise exception 'That is not a valid mute time.'; end if;
  if not public.is_chat_member(p_chat) then raise exception 'You are not a participant in this chat.' using errcode = '42501'; end if;
  insert into public.chat_members (chat_id, user_id) values (p_chat, me) on conflict do nothing;
  if p_hours = -1 then
    update public.chat_members set is_muted = false where chat_id = p_chat and user_id = me;
    delete from public.chat_mute_until where chat_id = p_chat and user_id = me;
    return jsonb_build_object('success', true, 'isMuted', false, 'until', null);
  end if;
  update public.chat_members set is_muted = true where chat_id = p_chat and user_id = me returning is_muted into v;
  if p_hours is null or p_hours = 0 then
    delete from public.chat_mute_until where chat_id = p_chat and user_id = me;
    u := null;
  else
    u := now() + make_interval(hours => p_hours);
    insert into public.chat_mute_until (chat_id, user_id, until) values (p_chat, me, u)
      on conflict (chat_id, user_id) do update set until = excluded.until;
  end if;
  return jsonb_build_object('success', true, 'isMuted', coalesce(v, true), 'until', u);
end;
$$;

-- My end times (only my own rows).
create or replace function public.my_chat_mutes() returns table (chat_id uuid, until timestamptz)
language sql stable security definer set search_path = public as $$
  select t.chat_id, t.until from public.chat_mute_until t where t.user_id = auth.uid();
$$;

-- Switches the mute off where the end time has passed. Called by cron for everybody (no login: auth.uid() is null)
-- and by a logged-in user for ONLY their own rows.
create or replace function public.expire_chat_mutes() returns integer
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n integer := 0; r record;
begin
  for r in
    select t.chat_id, t.user_id from public.chat_mute_until t
    where t.until < now() and (me is null or t.user_id = me)
  loop
    update public.chat_members set is_muted = false where chat_id = r.chat_id and user_id = r.user_id;
    delete from public.chat_mute_until where chat_id = r.chat_id and user_id = r.user_id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.set_chat_muted_for(uuid, integer) from public, anon;
revoke all on function public.my_chat_mutes() from public, anon;
revoke all on function public.expire_chat_mutes() from public, anon;
grant execute on function public.set_chat_muted_for(uuid, integer) to authenticated;
grant execute on function public.my_chat_mutes() to authenticated;
grant execute on function public.expire_chat_mutes() to authenticated;

-- Every 5 minutes (skipped with a notice when pg_cron is not installed; the app also calls expire_chat_mutes() when the chat list loads, and never shows an expired mute as muted).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('noob-expire-chat-mutes');
    exception when others then null;   -- not scheduled yet
    end;
    perform cron.schedule('noob-expire-chat-mutes', '*/5 * * * *', $job$ select public.expire_chat_mutes(); $job$);
  else
    raise notice 'pg_cron is not installed: chat mutes will end when the chat list is next loaded instead.';
  end if;
exception when others then
  raise notice 'The chat-mute job was not scheduled: %', sqlerrm;
end $$;
