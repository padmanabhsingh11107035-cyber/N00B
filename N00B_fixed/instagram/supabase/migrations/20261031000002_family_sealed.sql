-- NOOB Family Map, part 2: places are END-TO-END ENCRYPTED, "share my location" is one remembered switch, and a room can be locked. Run after 20261031000001_family_map.sql. Safe to run more than once.
--
-- Until now a person's last place was stored as plain numbers (readable by the database). From now on the phone LOCKS each place (the same locking as NOOB chats, see src/e2ee) for the
-- devices of the people in the room before it leaves the phone; the database keeps only the locked envelope and can not read it (a database copy, a backup or an administrator sees noise).
-- What changes (everything else of part 1 stays):
--   family_sealed     NEW   the last LOCKED place of a person in a room (one row per person and room, replaced every few seconds, hidden after 24 hours, no history)
--   family_locations  GONE  the plain places (and family_push_location, the function that wrote them) are removed: nothing readable is kept any more
--   family_prefs      NEW   one row per person: the "share my location" switch, so a new room starts the way the person last chose
--   family_rooms.locked NEW a locked room accepts nobody new (the owner switches it, for example once everybody has joined)
--   family_room_keys / family_push_sealed / family_set_sharing_all / family_my_prefs / family_set_locked   NEW functions;  family_room_state / family_join_room / family_room_json   changed

alter table public.family_rooms add column if not exists locked boolean not null default false;

create table if not exists public.family_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  share_default boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.family_sealed (
  room_id uuid not null references public.family_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  envelope jsonb not null check (pg_column_size(envelope) <= 60000),
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists family_sealed_updated_idx on public.family_sealed (updated_at);

alter table public.family_prefs enable row level security;
alter table public.family_sealed enable row level security;
revoke all on public.family_prefs, public.family_sealed from public, anon, authenticated;

-- the plain places are gone for good
drop function if exists public.family_push_location(double precision, double precision, real, real, real);
drop table if exists public.family_locations;

-- locked places of a person are dropped for every room where the person does not share (any more)
create or replace function public.family_drop_place_if_alone(p_user uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.family_sealed s
   where s.user_id = p_user
     and not exists (select 1 from public.family_members m where m.room_id = s.room_id and m.user_id = p_user and m.sharing);
end $$;
revoke all on function public.family_drop_place_if_alone(uuid) from public, anon, authenticated;

create or replace function public.family_room_json(p_room uuid, p_me uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'code', r.code, 'name', r.name, 'emoji', r.emoji, 'ownerId', r.owner_id, 'createdAt', r.created_at, 'locked', r.locked,
    'role', m.role, 'sharing', m.sharing,
    'memberCount', (select count(*) from public.family_members x where x.room_id = r.id))
  from public.family_rooms r join public.family_members m on m.room_id = r.id and m.user_id = p_me
  where r.id = p_room;
$$;
revoke all on function public.family_room_json(uuid, uuid) from public, anon, authenticated;

-- a locked envelope reduced to the locks of ONE person's devices (the other locks are of no use to them, and an envelope for a big room is large)
create or replace function public.family_trim_envelope(e jsonb, p_viewer uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_set(e, '{keys}', coalesce((select jsonb_object_agg(k.key, k.value) from jsonb_each(e->'keys') k
                                          where k.key in (select kid from public.chat_keys where user_id = p_viewer)), '{}'::jsonb));
$$;
revoke all on function public.family_trim_envelope(jsonb, uuid) from public, anon, authenticated;

-- the public keys of the devices of everybody in the room (public keys are public): what a phone needs to lock a place for the room
create or replace function public.family_room_keys(p_room uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null or not exists (select 1 from public.family_members where room_id = p_room and user_id = v_me) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  return jsonb_build_object('ok', true, 'members', coalesce((
    select jsonb_agg(jsonb_build_object('userId', m.user_id,
      'keys', coalesce((select jsonb_agg(jsonb_build_object('kid', k.kid, 'key', k.public_key) order by k.created_at)
                        from public.chat_keys k where k.user_id = m.user_id and k.active), '[]'::jsonb)))
    from public.family_members m where m.room_id = p_room), '[]'::jsonb));
end $$;

-- the phone sends its LOCKED place for the rooms where the person shares: [{ "room": "<id>", "env": { locked envelope } }, ...] (at most 10 rooms). A second one within 2 seconds is ignored.
create or replace function public.family_push_sealed(p_items jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_item jsonb;
  v_room uuid;
  v_saved int := 0;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if public.feature_blocked('family') then return jsonb_build_object('ok', false, 'error', 'switched_off'); end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 10 then return jsonb_build_object('ok', false, 'error', 'failed'); end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce(v_item->>'room', '') !~ '^[0-9a-fA-F-]{36}$' then continue; end if;
    v_room := (v_item->>'room')::uuid;
    if not exists (select 1 from public.family_members where room_id = v_room and user_id = v_me and sharing) then continue; end if;
    if not public.valid_e2ee_envelope(v_item->'env', v_me) then continue; end if;
    insert into public.family_sealed as s (room_id, user_id, envelope, updated_at) values (v_room, v_me, v_item->'env', now())
    on conflict (room_id, user_id) do update set envelope = excluded.envelope, updated_at = excluded.updated_at
      where s.updated_at < now() - interval '2 seconds';
    v_saved := v_saved + 1;
  end loop;
  delete from public.family_sealed where updated_at < now() - interval '3 days';
  return jsonb_build_object('ok', true, 'saved', v_saved);
end $$;

-- the room, its people and their LOCKED places (each reduced to the locks of the asking person's devices); the names and pictures are the public profile
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
        'sealed', case when m.sharing and s.updated_at > now() - interval '24 hours' then public.family_trim_envelope(s.envelope, v_me) end,
        'updatedAt', case when m.sharing and s.updated_at > now() - interval '24 hours' then s.updated_at end
      ) order by m.joined_at)
      from public.family_members m
      join public.profiles p on p.id = m.user_id
      left join public.family_sealed s on s.room_id = m.room_id and s.user_id = m.user_id
      where m.room_id = p_room), '[]'::jsonb));
end $$;

-- join with a code (as before) and a locked room accepts nobody new
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
  if v_room.locked then return jsonb_build_object('ok', false, 'error', 'room_locked'); end if;
  if (select count(*) from public.family_members where room_id = v_room.id) >= 20 then return jsonb_build_object('ok', false, 'error', 'room_full'); end if;
  if (select count(*) from public.family_members where user_id = v_me) >= 10 then return jsonb_build_object('ok', false, 'error', 'too_many_rooms'); end if;
  insert into public.family_members (room_id, user_id, role, sharing) values (v_room.id, v_me, 'member', coalesce(p_share, true));
  return jsonb_build_object('ok', true, 'room', public.family_room_json(v_room.id, v_me));
end $$;

-- the owner locks or unlocks the room
create or replace function public.family_set_locked(p_room uuid, p_locked boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  update public.family_rooms set locked = coalesce(p_locked, false) where id = p_room and owner_id = v_me;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_owner'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- "share my location" for ALL the person's rooms at once, remembered for the rooms they make or join later
create or replace function public.family_set_sharing_all(p_on boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  update public.family_members set sharing = coalesce(p_on, true) where user_id = v_me;
  insert into public.family_prefs (user_id, share_default) values (v_me, coalesce(p_on, true))
  on conflict (user_id) do update set share_default = excluded.share_default, updated_at = now();
  perform public.family_drop_place_if_alone(v_me);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.family_my_prefs() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('shareDefault', coalesce((select share_default from public.family_prefs where user_id = auth.uid()), true));
$$;

revoke all on function public.family_room_keys(uuid), public.family_push_sealed(jsonb), public.family_set_sharing_all(boolean), public.family_my_prefs(), public.family_set_locked(uuid, boolean) from public, anon;
grant execute on function public.family_room_keys(uuid), public.family_push_sealed(jsonb), public.family_set_sharing_all(boolean), public.family_my_prefs(), public.family_set_locked(uuid, boolean) to authenticated;
revoke all on function public.family_room_state(uuid), public.family_join_room(text, boolean) from public, anon;
grant execute on function public.family_room_state(uuid), public.family_join_room(text, boolean) to authenticated;
