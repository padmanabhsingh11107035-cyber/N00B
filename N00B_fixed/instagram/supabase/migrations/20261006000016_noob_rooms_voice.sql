-- NOOB Rooms, slice 1: public many-person voice rooms + the lobby.
--
-- Unlike Live Lounge (private, invite+admission gated, no public listing) these rooms are public and
-- instant-join, like tapping into a Discord voice channel — closer to Live Streaming's public
-- list_live_streams() pattern, but with everyone able to talk (Live Lounge's Agora publisher model),
-- not one broadcaster. `activity_type` is null for a plain user-created voice room; the four games
-- (Guess the Song, Meme Battle, Mini Game Room, Truth or Dare) are seeded as system rooms
-- (host_id null) in their own later migrations, once each one's round engine exists to back it.
--
-- No admission/waiting-room step, so there is exactly one join action (unlike Live Lounge's
-- join-by-code-then-wait-for-admission two-step): requesting an Agora token via the noobRoomId branch
-- of the agora-token Edge Function IS the join - noob_room_join() both authorizes and records the
-- participant row, same as live_stream_join() already does for Live Streaming.

create table public.noob_rooms (
  id           uuid primary key default gen_random_uuid(),
  host_id      uuid references public.profiles(id) on delete set null,
  name         text not null,
  category     text not null default 'General',
  activity_type text check (activity_type in ('guess_song', 'meme_battle', 'mini_game', 'truth_or_dare')),
  channel_name text not null unique,
  status       text not null default 'live' check (status in ('live', 'ended')),
  created_at   timestamptz not null default now(),
  ended_at     timestamptz
);
create index noob_rooms_status_idx on public.noob_rooms (status) where status = 'live';
alter table public.noob_rooms enable row level security;
-- Public lobby - every room's existence and name is meant to be seen by anyone, unlike Live Lounge.
create policy noob_rooms_read on public.noob_rooms for select using (true);

create table public.noob_room_participants (
  room_id    uuid not null references public.noob_rooms(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index noob_room_participants_room_idx on public.noob_room_participants (room_id);
alter table public.noob_room_participants enable row level security;
create policy noob_room_participants_read on public.noob_room_participants for select using (true);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.noob_room_participants;
  end if;
end
$$;

create or replace function public.list_noob_rooms() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'name', r.name, 'category', r.category, 'activityType', r.activity_type, 'createdAt', r.created_at,
    'participantCount', (select count(*) from public.noob_room_participants p where p.room_id = r.id),
    'host', case when r.host_id is null then null else
      (select jsonb_build_object('id', h.id, 'username', h.username, 'avatar', h.avatar) from public.profiles h where h.id = r.host_id)
    end
  ) order by (r.activity_type is null), (select count(*) from public.noob_room_participants p where p.room_id = r.id) desc, r.created_at desc), '[]'::jsonb)
  from public.noob_rooms r
  where r.status = 'live';
$$;
grant execute on function public.list_noob_rooms() to authenticated;

create or replace function public.start_noob_room(p_name text, p_category text default 'General') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); nm text; r public.noob_rooms;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  nm := left(btrim(coalesce(p_name, '')), 60);
  if nm = '' then raise exception 'Give your room a name.'; end if;
  insert into public.noob_rooms (host_id, name, category, channel_name)
  values (me, nm, left(btrim(coalesce(p_category, 'General')), 30), 'noobroom_' || replace(gen_random_uuid()::text, '-', ''))
  returning * into r;
  return jsonb_build_object('success', true, 'roomId', r.id, 'name', r.name);
end;
$$;
grant execute on function public.start_noob_room(text, text) to authenticated;

-- The one place that decides "can this person actually be in this room's voice channel right now" -
-- the agora-token Edge Function calls this exactly like it calls live_stream_join()/live_lounge_room_join().
-- Everyone who gets in is a publisher (see the Edge Function's role logic), so this is also where the
-- participant row (and therefore the public headcount) gets created.
create or replace function public.noob_room_join(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.noob_rooms;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into r from public.noob_rooms where id = p_room_id;
  if not found or r.status <> 'live' then raise exception 'This room has ended.'; end if;
  insert into public.noob_room_participants (room_id, user_id) values (p_room_id, me)
    on conflict (room_id, user_id) do update set joined_at = now();
  return jsonb_build_object('channelName', r.channel_name, 'isHost', r.host_id = me);
end;
$$;
grant execute on function public.noob_room_join(uuid) to authenticated;

create or replace function public.leave_noob_room(p_room_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.noob_rooms; remaining int;
begin
  delete from public.noob_room_participants where room_id = p_room_id and user_id = me;
  select * into r from public.noob_rooms where id = p_room_id;
  if found and r.host_id is not null and r.status = 'live' then
    select count(*) into remaining from public.noob_room_participants where room_id = p_room_id;
    if remaining = 0 then
      update public.noob_rooms set status = 'ended', ended_at = now() where id = p_room_id;
    end if;
  end if;
end;
$$;
grant execute on function public.leave_noob_room(uuid) to authenticated;

-- Host, or an admin moderating the lobby, can force-end any room. System activity rooms (host_id null)
-- can only be ended by an admin.
create or replace function public.end_noob_room(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.noob_rooms;
begin
  select * into r from public.noob_rooms where id = p_room_id;
  if not found or r.status <> 'live' then raise exception 'That room was not found or has already ended.'; end if;
  if r.host_id <> me and not public.is_admin() then raise exception 'Only the host can do that.'; end if;
  update public.noob_rooms set status = 'ended', ended_at = now() where id = p_room_id;
  delete from public.noob_room_participants where room_id = p_room_id;
  return jsonb_build_object('success', true);
end;
$$;
grant execute on function public.end_noob_room(uuid) to authenticated;

create or replace function public.noob_room_participants_list(p_room_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('userId', pr.id, 'username', pr.username, 'avatar', pr.avatar) order by p.joined_at), '[]'::jsonb)
  from public.noob_room_participants p join public.profiles pr on pr.id = p.user_id
  where p.room_id = p_room_id;
$$;
grant execute on function public.noob_room_participants_list(uuid) to authenticated;
