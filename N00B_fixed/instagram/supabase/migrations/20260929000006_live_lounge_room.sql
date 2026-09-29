-- NOOB Live Lounge meeting room: a private, Zoom-style room. Everyone who touches it — hosting OR
-- joining — must have Live Lounge access (has_live_lounge_access), matching how it was described:
-- a subscription that lets you USE the lounge, not a free-to-watch broadcast like Live Streaming.
--
-- Privacy: a room is invisible to anyone who isn't already the host or a participant (no public
-- discovery) — joining means typing in the host's shared room code, which puts you in the waiting
-- room until the host admits you.

create table if not exists public.live_lounge_rooms (
  id           uuid primary key default gen_random_uuid(),
  host_id      uuid not null references public.profiles(id) on delete cascade,
  title        text not null default '',
  room_code    text not null unique,
  channel_name text not null unique,
  status       text not null default 'active' check (status in ('active', 'ended')),
  created_at   timestamptz not null default now(),
  ended_at     timestamptz
);
alter table public.live_lounge_rooms enable row level security;

create table if not exists public.live_lounge_room_participants (
  room_id    uuid not null references public.live_lounge_rooms(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'participant' check (role in ('host', 'participant')),
  status     text not null default 'waiting' check (status in ('waiting', 'admitted', 'removed', 'left')),
  joined_at  timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists live_lounge_room_participants_room_idx on public.live_lounge_room_participants (room_id);
alter table public.live_lounge_room_participants enable row level security;
drop policy if exists live_lounge_room_participants_read on public.live_lounge_room_participants;
create policy live_lounge_room_participants_read on public.live_lounge_room_participants for select using (
  user_id = auth.uid() or room_id in (select id from public.live_lounge_rooms where host_id = auth.uid())
);

-- Added here (participants table now exists) rather than right after the table itself.
drop policy if exists live_lounge_rooms_read on public.live_lounge_rooms;
create policy live_lounge_rooms_read on public.live_lounge_rooms for select using (
  host_id = auth.uid() or exists (select 1 from public.live_lounge_room_participants p where p.room_id = id and p.user_id = auth.uid())
);

create table if not exists public.live_lounge_room_chat (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.live_lounge_rooms(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id) on delete cascade,
  text       text not null,
  created_at timestamptz not null default now()
);
create index if not exists live_lounge_room_chat_room_idx on public.live_lounge_room_chat (room_id, created_at desc);
alter table public.live_lounge_room_chat enable row level security;
drop policy if exists live_lounge_room_chat_read on public.live_lounge_room_chat;
create policy live_lounge_room_chat_read on public.live_lounge_room_chat for select using (
  exists (select 1 from public.live_lounge_room_participants p where p.room_id = room_id and p.user_id = auth.uid() and p.status = 'admitted')
  or room_id in (select id from public.live_lounge_rooms where host_id = auth.uid())
);

create or replace function public.start_live_lounge_room(p_title text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_code text; r public.live_lounge_rooms;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if not public.has_live_lounge_access(me) then
    raise exception 'NOOB Live Lounge is a members-only feature. Unlock it to host a room.';
  end if;
  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.live_lounge_rooms where room_code = v_code and status = 'active');
  end loop;
  insert into public.live_lounge_rooms (host_id, title, room_code, channel_name)
  values (me, left(btrim(coalesce(p_title, '')), 80), v_code, 'lounge_' || replace(gen_random_uuid()::text, '-', ''))
  returning * into r;
  insert into public.live_lounge_room_participants (room_id, user_id, role, status) values (r.id, me, 'host', 'admitted');
  return jsonb_build_object('roomId', r.id, 'roomCode', r.room_code, 'channelName', r.channel_name, 'title', r.title);
end;
$$;
revoke execute on function public.start_live_lounge_room(text) from public;
grant execute on function public.start_live_lounge_room(text) to authenticated;

-- Typing in a room code: puts you in the waiting room (or straight back into a room you already
-- left/were in before, without re-queueing) — never lets anyone in without the host admitting them.
create or replace function public.join_live_lounge_room_by_code(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_code text := upper(btrim(coalesce(p_code, ''))); r public.live_lounge_rooms; existing public.live_lounge_room_participants;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if not public.has_live_lounge_access(me) then
    raise exception 'NOOB Live Lounge is a members-only feature. Unlock it to join a room.';
  end if;
  select * into r from public.live_lounge_rooms where room_code = v_code and status = 'active';
  if not found then raise exception 'That room code is not valid, or the room has ended.'; end if;

  select * into existing from public.live_lounge_room_participants where room_id = r.id and user_id = me;
  if found then
    if existing.status = 'removed' then raise exception 'The host removed you from this room.'; end if;
    if existing.status = 'left' then
      update public.live_lounge_room_participants set status = 'waiting', updated_at = now() where room_id = r.id and user_id = me;
    end if;
  else
    insert into public.live_lounge_room_participants (room_id, user_id) values (r.id, me);
  end if;
  return jsonb_build_object('roomId', r.id, 'title', r.title);
end;
$$;
revoke execute on function public.join_live_lounge_room_by_code(text) from public;
grant execute on function public.join_live_lounge_room_by_code(text) to authenticated;

-- Polled/subscribed by a waiting participant's client to learn the moment the host admits them.
create or replace function public.live_lounge_room_my_status(p_room_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('status', p.status, 'role', p.role, 'roomStatus', r.status, 'title', r.title, 'roomCode', r.room_code)
  from public.live_lounge_room_participants p join public.live_lounge_rooms r on r.id = p.room_id
  where p.room_id = p_room_id and p.user_id = auth.uid();
$$;
revoke execute on function public.live_lounge_room_my_status(uuid) from public;
grant execute on function public.live_lounge_room_my_status(uuid) to authenticated;

create or replace function public.live_lounge_room_participants_list(p_room_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); am_host boolean;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  am_host := exists (select 1 from public.live_lounge_rooms where id = p_room_id and host_id = me);
  return jsonb_build_object(
    'admitted', coalesce((
      select jsonb_agg(jsonb_build_object('userId', pr.id, 'username', pr.username, 'displayName', pr.display_name,
                                          'avatar', pr.avatar, 'role', p.role) order by p.joined_at)
      from public.live_lounge_room_participants p join public.profiles pr on pr.id = p.user_id
      where p.room_id = p_room_id and p.status = 'admitted'), '[]'::jsonb),
    'waiting', case when am_host then coalesce((
      select jsonb_agg(jsonb_build_object('userId', pr.id, 'username', pr.username, 'displayName', pr.display_name, 'avatar', pr.avatar) order by p.joined_at)
      from public.live_lounge_room_participants p join public.profiles pr on pr.id = p.user_id
      where p.room_id = p_room_id and p.status = 'waiting'), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;
revoke execute on function public.live_lounge_room_participants_list(uuid) from public;
grant execute on function public.live_lounge_room_participants_list(uuid) to authenticated;

create or replace function public.live_lounge_room_admit(p_room_id uuid, p_user_id uuid, p_admit boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if not exists (select 1 from public.live_lounge_rooms where id = p_room_id and host_id = me) then
    raise exception 'Only the host can do that.';
  end if;
  update public.live_lounge_room_participants set status = case when p_admit then 'admitted' else 'removed' end, updated_at = now()
  where room_id = p_room_id and user_id = p_user_id and status in ('waiting', 'admitted');
  if not found then raise exception 'That person is not waiting to join.'; end if;
  return jsonb_build_object('success', true);
end;
$$;
revoke execute on function public.live_lounge_room_admit(uuid, uuid, boolean) from public;
grant execute on function public.live_lounge_room_admit(uuid, uuid, boolean) to authenticated;

-- The one place that decides "can this person actually be in the video/audio channel right now" —
-- the agora-token Edge Function calls this exactly like it calls live_stream_join() for streams.
create or replace function public.live_lounge_room_join(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.live_lounge_rooms; p public.live_lounge_room_participants;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into r from public.live_lounge_rooms where id = p_room_id;
  if not found or r.status <> 'active' then raise exception 'This room has ended.'; end if;
  select * into p from public.live_lounge_room_participants where room_id = p_room_id and user_id = me;
  if not found or p.status <> 'admitted' then raise exception 'You are still in the waiting room.'; end if;
  return jsonb_build_object('channelName', r.channel_name, 'isHost', p.role = 'host');
end;
$$;
revoke execute on function public.live_lounge_room_join(uuid) from public;
grant execute on function public.live_lounge_room_join(uuid) to authenticated;

create or replace function public.end_live_lounge_room(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update public.live_lounge_rooms set status = 'ended', ended_at = now() where id = p_room_id and host_id = auth.uid() and status = 'active';
  if not found then raise exception 'That room was not found or has already ended.'; end if;
  return jsonb_build_object('success', true);
end;
$$;
revoke execute on function public.end_live_lounge_room(uuid) from public;
grant execute on function public.end_live_lounge_room(uuid) to authenticated;

create or replace function public.leave_live_lounge_room(p_room_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.live_lounge_room_participants set status = 'left', updated_at = now()
  where room_id = p_room_id and user_id = auth.uid() and status = 'admitted';
$$;
revoke execute on function public.leave_live_lounge_room(uuid) from public;
grant execute on function public.leave_live_lounge_room(uuid) to authenticated;

create or replace function public.live_lounge_room_chat_send(p_room_id uuid, p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); body text := btrim(coalesce(p_text, '')); row_id uuid; row_created timestamptz;
  sname text; sdisplay text; savatar text;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if body = '' or length(body) > 300 then raise exception 'Enter a message up to 300 characters.'; end if;
  if not exists (select 1 from public.live_lounge_room_participants where room_id = p_room_id and user_id = me and status = 'admitted') then
    raise exception 'You are not in this room.';
  end if;
  insert into public.live_lounge_room_chat (room_id, sender_id, text) values (p_room_id, me, body)
  returning id, created_at into row_id, row_created;
  select username, display_name, avatar into sname, sdisplay, savatar from public.profiles where id = me;
  return jsonb_build_object('id', row_id, 'roomId', p_room_id, 'text', body, 'createdAt', row_created,
    'sender', jsonb_build_object('id', me, 'username', sname, 'displayName', sdisplay, 'avatar', savatar));
end;
$$;
revoke execute on function public.live_lounge_room_chat_send(uuid, text) from public;
grant execute on function public.live_lounge_room_chat_send(uuid, text) to authenticated;

create or replace function public.live_lounge_room_chat_recent(p_room_id uuid, p_limit int default 50) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t."createdAt"), '[]'::jsonb) from (
    select c.id, c.room_id as "roomId", c.text, c.created_at as "createdAt",
           jsonb_build_object('id', p.id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar) as sender
    from public.live_lounge_room_chat c
    join public.profiles p on p.id = c.sender_id
    where c.room_id = p_room_id
      and exists (select 1 from public.live_lounge_room_participants pp where pp.room_id = c.room_id and pp.user_id = auth.uid() and pp.status = 'admitted')
    order by c.created_at desc
    limit least(greatest(p_limit, 1), 100)
  ) t;
$$;
revoke execute on function public.live_lounge_room_chat_recent(uuid, int) from public;
grant execute on function public.live_lounge_room_chat_recent(uuid, int) to authenticated;
