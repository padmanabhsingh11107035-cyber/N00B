-- NOOB Family Map: a room for a family (or friends) where everybody sees everybody's live place on a map. Free, optional, switched on and off by the person.
--
-- What it adds (nothing that exists is changed, no row is touched):
--   public.family_rooms        one row per room: its name, its 8-letter join code and its owner
--   public.family_members      who is in which room, and whether that person shares the place with that room right now (can be paused at any time)
--   public.family_locations    the LAST known place of a person: one row per person, replaced every few seconds. No history, no trail is ever kept
--   public.family_join_misses  wrong codes that were tried, so a code cannot be found by trying (8 wrong tries in 10 minutes pause the person for a while)
-- Nobody can read or write these tables directly (row-level security is on and there is no policy). Everything goes through the functions below, and each one checks who is asking:
--   family_create_room  family_join_room  family_my_rooms  family_room_state  family_push_location  family_set_sharing
--   family_leave_room   family_remove_member  family_rotate_code  family_delete_room
-- A person's place is shown only to people who are in a room with that person while that person shares with that room. It is dropped after 24 hours without news, when the person
-- pauses sharing in every room, and when the person leaves the last room. Even the administrators have no way to read places. The Pages switch "family" stops new rooms, new members and new places.
-- Limits: 10 rooms per person, 20 people per room. Safe to run more than once.

create table if not exists public.family_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  name text not null check (char_length(name) between 1 and 40),
  emoji text check (emoji is null or char_length(emoji) <= 8),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.family_members (
  room_id uuid not null references public.family_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  sharing boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists family_members_user_idx on public.family_members (user_id);

create table if not exists public.family_locations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy real check (accuracy is null or accuracy >= 0),
  heading real check (heading is null or (heading >= 0 and heading <= 360)),
  speed real check (speed is null or speed >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.family_join_misses (
  user_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists family_join_misses_idx on public.family_join_misses (user_id, at desc);

alter table public.family_rooms enable row level security;
alter table public.family_members enable row level security;
alter table public.family_locations enable row level security;
alter table public.family_join_misses enable row level security;
revoke all on public.family_rooms, public.family_members, public.family_locations, public.family_join_misses from public, anon, authenticated;

-- a new random join code: 8 letters and digits without the look-alikes (no I, O, 0, 1), made from the database's own secure random numbers (32 symbols, so every byte maps evenly)
create or replace function public.family_new_code() returns text language plpgsql volatile set search_path = public as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text;
  i int;
begin
  loop
    v_bytes := decode(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4), 'hex');
    v_code := '';
    for i in 0..7 loop v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1); end loop;
    exit when not exists (select 1 from public.family_rooms r where r.code = v_code);
  end loop;
  return v_code;
end $$;
revoke all on function public.family_new_code() from public, anon, authenticated;

-- one room as the person p_me sees it (nothing for a room the person is not in)
create or replace function public.family_room_json(p_room uuid, p_me uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'code', r.code, 'name', r.name, 'emoji', r.emoji, 'ownerId', r.owner_id, 'createdAt', r.created_at,
    'role', m.role, 'sharing', m.sharing,
    'memberCount', (select count(*) from public.family_members x where x.room_id = r.id))
  from public.family_rooms r join public.family_members m on m.room_id = r.id and m.user_id = p_me
  where r.id = p_room;
$$;
revoke all on function public.family_room_json(uuid, uuid) from public, anon, authenticated;

-- the place of a person is dropped from the database as soon as that person shares with no room any more
create or replace function public.family_drop_place_if_alone(p_user uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.family_members where user_id = p_user and sharing) then
    delete from public.family_locations where user_id = p_user;
  end if;
end $$;
revoke all on function public.family_drop_place_if_alone(uuid) from public, anon, authenticated;

create or replace function public.family_create_room(p_name text, p_emoji text default null, p_share boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_emoji text := nullif(btrim(coalesce(p_emoji, '')), '');
  v_id uuid;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if public.feature_blocked('family') then return jsonb_build_object('ok', false, 'error', 'switched_off'); end if;
  if char_length(v_name) < 1 or char_length(v_name) > 40 then return jsonb_build_object('ok', false, 'error', 'bad_name'); end if;
  if v_emoji is not null and char_length(v_emoji) > 8 then v_emoji := null; end if;
  if (select count(*) from public.family_members where user_id = v_me) >= 10 then return jsonb_build_object('ok', false, 'error', 'too_many_rooms'); end if;
  insert into public.family_rooms (code, name, emoji, owner_id) values (public.family_new_code(), v_name, v_emoji, v_me) returning id into v_id;
  insert into public.family_members (room_id, user_id, role, sharing) values (v_id, v_me, 'owner', coalesce(p_share, true));
  return jsonb_build_object('ok', true, 'room', public.family_room_json(v_id, v_me));
end $$;

create or replace function public.family_join_room(p_code text, p_share boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_room public.family_rooms;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if public.feature_blocked('family') then return jsonb_build_object('ok', false, 'error', 'switched_off'); end if;
  if v_code !~ '^[A-HJ-NP-Z2-9]{8}$' then return jsonb_build_object('ok', false, 'error', 'bad_code'); end if;
  if (select count(*) from public.family_join_misses where user_id = v_me and at > now() - interval '10 minutes') >= 8 then
    return jsonb_build_object('ok', false, 'error', 'too_many_tries');
  end if;
  select * into v_room from public.family_rooms where code = v_code for update;
  if not found then
    insert into public.family_join_misses (user_id) values (v_me);
    delete from public.family_join_misses where user_id = v_me and at < now() - interval '1 day';
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if exists (select 1 from public.family_members where room_id = v_room.id and user_id = v_me) then
    return jsonb_build_object('ok', true, 'already', true, 'room', public.family_room_json(v_room.id, v_me));
  end if;
  if (select count(*) from public.family_members where room_id = v_room.id) >= 20 then return jsonb_build_object('ok', false, 'error', 'room_full'); end if;
  if (select count(*) from public.family_members where user_id = v_me) >= 10 then return jsonb_build_object('ok', false, 'error', 'too_many_rooms'); end if;
  insert into public.family_members (room_id, user_id, role, sharing) values (v_room.id, v_me, 'member', coalesce(p_share, true));
  return jsonb_build_object('ok', true, 'room', public.family_room_json(v_room.id, v_me));
end $$;

create or replace function public.family_my_rooms() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public.family_room_json(m.room_id, m.user_id) order by m.joined_at), '[]'::jsonb)
  from public.family_members m where m.user_id = auth.uid();
$$;

-- the room, its people and where they are: only for a person who is in the room. The name shown is the first word of the profile name.
create or replace function public.family_room_state(p_room uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null or not exists (select 1 from public.family_members where room_id = p_room and user_id = v_me) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  return jsonb_build_object(
    'ok', true,
    'now', now(),
    'room', public.family_room_json(p_room, v_me),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.user_id,
        'name', coalesce(nullif(split_part(btrim(p.display_name), ' ', 1), ''), p.username),
        'username', p.username,
        'avatar', p.avatar,
        'role', m.role,
        'sharing', m.sharing,
        'me', m.user_id = v_me,
        'lat', case when m.sharing and l.updated_at > now() - interval '24 hours' then l.lat end,
        'lng', case when m.sharing and l.updated_at > now() - interval '24 hours' then l.lng end,
        'accuracy', case when m.sharing and l.updated_at > now() - interval '24 hours' then l.accuracy end,
        'heading', case when m.sharing and l.updated_at > now() - interval '24 hours' then l.heading end,
        'speed', case when m.sharing and l.updated_at > now() - interval '24 hours' then l.speed end,
        'updatedAt', case when m.sharing and l.updated_at > now() - interval '24 hours' then l.updated_at end
      ) order by m.joined_at)
      from public.family_members m
      join public.profiles p on p.id = m.user_id
      left join public.family_locations l on l.user_id = m.user_id
      where m.room_id = p_room), '[]'::jsonb));
end $$;

-- the phone says where it is; the place is kept only when the person shares with at least one room. A second call within 2 seconds is ignored.
create or replace function public.family_push_location(p_lat double precision, p_lng double precision, p_accuracy real default null, p_heading real default null, p_speed real default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null or p_lat is null or p_lng is null or not (p_lat between -90 and 90) or not (p_lng between -180 and 180) then return; end if;
  if public.feature_blocked('family') then return; end if;
  if not exists (select 1 from public.family_members where user_id = v_me and sharing) then return; end if;
  insert into public.family_locations as l (user_id, lat, lng, accuracy, heading, speed, updated_at)
  values (v_me, p_lat, p_lng,
          case when p_accuracy >= 0 then p_accuracy end,
          case when p_heading between 0 and 360 then p_heading end,
          case when p_speed >= 0 then p_speed end,
          now())
  on conflict (user_id) do update
    set lat = excluded.lat, lng = excluded.lng, accuracy = excluded.accuracy, heading = excluded.heading, speed = excluded.speed, updated_at = excluded.updated_at
    where l.updated_at < now() - interval '2 seconds';
end $$;

create or replace function public.family_set_sharing(p_room uuid, p_on boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  update public.family_members set sharing = coalesce(p_on, true) where room_id = p_room and user_id = v_me;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  perform public.family_drop_place_if_alone(v_me);
  return jsonb_build_object('ok', true);
end $$;

-- leaving: the room goes on without the person; if the owner leaves, the longest-standing member becomes the owner; the last one out closes the room
create or replace function public.family_leave_room(p_room uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_role text;
  v_next uuid;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select role into v_role from public.family_members where room_id = p_room and user_id = v_me;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  delete from public.family_members where room_id = p_room and user_id = v_me;
  select user_id into v_next from public.family_members where room_id = p_room order by (role = 'owner') desc, joined_at limit 1;
  if v_next is null then
    delete from public.family_rooms where id = p_room;
  elsif v_role = 'owner' then
    update public.family_members set role = 'owner' where room_id = p_room and user_id = v_next;
    update public.family_rooms set owner_id = v_next where id = p_room;
  end if;
  perform public.family_drop_place_if_alone(v_me);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.family_remove_member(p_room uuid, p_user uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not exists (select 1 from public.family_rooms where id = p_room and owner_id = v_me) then return jsonb_build_object('ok', false, 'error', 'not_owner'); end if;
  if p_user is null or p_user = v_me then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  delete from public.family_members where room_id = p_room and user_id = p_user;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  perform public.family_drop_place_if_alone(p_user);
  return jsonb_build_object('ok', true);
end $$;

-- a new code for the room (the old one stops working at once); only the owner
create or replace function public.family_rotate_code(p_room uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_code text;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if public.feature_blocked('family') then return jsonb_build_object('ok', false, 'error', 'switched_off'); end if;
  if not exists (select 1 from public.family_rooms where id = p_room and owner_id = v_me) then return jsonb_build_object('ok', false, 'error', 'not_owner'); end if;
  update public.family_rooms set code = public.family_new_code() where id = p_room returning code into v_code;
  return jsonb_build_object('ok', true, 'code', v_code);
end $$;

create or replace function public.family_delete_room(p_room uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_people uuid[];
  v_one uuid;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not exists (select 1 from public.family_rooms where id = p_room and owner_id = v_me) then return jsonb_build_object('ok', false, 'error', 'not_owner'); end if;
  select coalesce(array_agg(user_id), '{}') into v_people from public.family_members where room_id = p_room;
  delete from public.family_rooms where id = p_room;
  foreach v_one in array v_people loop perform public.family_drop_place_if_alone(v_one); end loop;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.family_create_room(text, text, boolean), public.family_join_room(text, boolean), public.family_my_rooms(), public.family_room_state(uuid),
  public.family_push_location(double precision, double precision, real, real, real), public.family_set_sharing(uuid, boolean), public.family_leave_room(uuid),
  public.family_remove_member(uuid, uuid), public.family_rotate_code(uuid), public.family_delete_room(uuid) from public, anon;
grant execute on function public.family_create_room(text, text, boolean), public.family_join_room(text, boolean), public.family_my_rooms(), public.family_room_state(uuid),
  public.family_push_location(double precision, double precision, real, real, real), public.family_set_sharing(uuid, boolean), public.family_leave_room(uuid),
  public.family_remove_member(uuid, uuid), public.family_rotate_code(uuid), public.family_delete_room(uuid) to authenticated;
