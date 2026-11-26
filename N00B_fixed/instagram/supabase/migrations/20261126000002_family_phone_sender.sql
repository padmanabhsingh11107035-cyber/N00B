-- NOOB Family Map, part 4: the Android app can keep sending a person's LOCKED place after the app is swiped away. Run after 20261031000003_family_day_report.sql. Safe to run more than once.
--
-- Why a separate key: when the app is swiped away its web part (and so the login it holds) is gone, and the phone's small background service has to send on its own. Handing the service
-- the person's real login would be unsafe (two copies of a login that renews itself sign each other out). Instead the app gives it a "phone token":
--   * a long random secret made by the database for ONE phone (the database keeps only its SHA-256 fingerprint, never the secret itself);
--   * it can do exactly two things: ask which rooms the person shares with and for the public keys of the people in them, and hand in LOCKED places for those rooms;
--   * it expires after 60 days, at most 3 phones per person (the oldest is switched off), and it is deleted when the person logs out, pauses everything or switches background sharing off.
-- The place itself is locked on the phone exactly as before (end-to-end encryption), so the database still can not read it, and the lock proves who made it.
--
--   family_phone_tokens         NEW   the fingerprints of the phone tokens
--   family_phone_register()     NEW   (logged in) makes a token for this phone and returns it once
--   family_phone_revoke()       NEW   (logged in) deletes all the person's phone tokens
--   family_phone_rooms(token)   NEW   (token) rooms the person shares with + the public keys of everybody in them
--   family_phone_push(token, items) NEW (token) hands in locked places, like family_push_sealed

create table if not exists public.family_phone_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '60 days',
  last_used_at timestamptz
);
create index if not exists family_phone_tokens_user_idx on public.family_phone_tokens (user_id);
alter table public.family_phone_tokens enable row level security;
revoke all on public.family_phone_tokens from public, anon, authenticated;

-- the person a token belongs to (null when unknown or expired); remembers the use at most once a minute
create or replace function public.family_phone_user(p_token text) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_user uuid; v_last timestamptz;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select id, user_id, last_used_at into v_id, v_user, v_last from public.family_phone_tokens
   where token_hash = encode(sha256(convert_to(p_token, 'utf8')), 'hex') and expires_at > now();
  if v_id is null then return null; end if;
  if exists (select 1 from public.profiles where id = v_user and is_suspended) then return null; end if;
  if v_last is null or v_last < now() - interval '1 minute' then update public.family_phone_tokens set last_used_at = now() where id = v_id; end if;
  return v_user;
end $$;
revoke all on function public.family_phone_user(text) from public, anon, authenticated;

create or replace function public.family_phone_register() returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_token text;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if public.feature_blocked('family') then return jsonb_build_object('ok', false, 'error', 'switched_off'); end if;
  delete from public.family_phone_tokens where user_id = v_me and expires_at <= now();
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');   -- 64 hex characters, 244 random bits
  insert into public.family_phone_tokens (user_id, token_hash) values (v_me, encode(sha256(convert_to(v_token, 'utf8')), 'hex'));
  -- at most 3 phones: the oldest tokens are switched off
  delete from public.family_phone_tokens where user_id = v_me and id not in (select id from public.family_phone_tokens where user_id = v_me order by created_at desc limit 3);
  return jsonb_build_object('ok', true, 'token', v_token, 'days', 60);
end $$;

create or replace function public.family_phone_revoke() returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  delete from public.family_phone_tokens where user_id = v_me;
  return jsonb_build_object('ok', true);
end $$;

-- the rooms this person shares with right now, and the public keys of everybody in each (public keys are public): what the service needs to lock a place
create or replace function public.family_phone_rooms(p_token text) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.family_phone_user(p_token);
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'invalid_token'); end if;
  if public.feature_blocked('family') then return jsonb_build_object('ok', false, 'error', 'switched_off'); end if;
  return jsonb_build_object('ok', true, 'rooms', coalesce((
    select jsonb_agg(jsonb_build_object('room', m.room_id, 'keys', coalesce((
      select jsonb_agg(jsonb_build_object('kid', k.kid, 'key', k.public_key) order by k.created_at)
        from public.family_members x join public.chat_keys k on k.user_id = x.user_id and k.active
       where x.room_id = m.room_id), '[]'::jsonb)))
    from (select room_id from public.family_members where user_id = v_me and sharing order by joined_at limit 10) m), '[]'::jsonb));
end $$;

-- locked places from the service, for the rooms where the person shares: [{ "room": "<id>", "env": { locked envelope } }, ...] (at most 10). The same rules as family_push_sealed.
create or replace function public.family_phone_push(p_token text, p_items jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.family_phone_user(p_token);
  v_item jsonb; v_room uuid; v_saved int := 0;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'invalid_token'); end if;
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
  return jsonb_build_object('ok', true, 'saved', v_saved);
end $$;

revoke all on function public.family_phone_register(), public.family_phone_revoke() from public, anon;
grant execute on function public.family_phone_register(), public.family_phone_revoke() to authenticated;
-- the service has no login: these two are checked by the secret token inside
revoke all on function public.family_phone_rooms(text), public.family_phone_push(text, jsonb) from public;
grant execute on function public.family_phone_rooms(text), public.family_phone_push(text, jsonb) to anon, authenticated;
