-- NOOB Family Map, part 3: the DAY REPORT ("where did each person go today"). Run after 20261031000002_family_sealed.sql. Safe to run more than once.
--
-- What it is: a person who switches it on shares, with the rooms they share their location with, the places they stayed at and the trips between them, for TODAY only. The phone works the stays and
-- trips out itself and LOCKS every one of them (end-to-end encrypted, the same locking as the live places) before sending it: the database keeps only locked data and can not read it.
-- A day is the calendar day in the person's own time zone. At 00:00 of that time zone the report is over:
--   * nothing of an older day is ever handed out (the functions below look at the clock of every row's own time zone, to the second), and
--   * nothing of an older day is accepted, and what is left of it is deleted at once by the next call, or every minute by a scheduled job where the database has pg_cron.
-- What changes:
--   family_members.report / family_prefs.report_default   NEW   the person's switch (per room, and what a new room starts with)
--   family_timeline                                       NEW   the locked stays and trips (one row per person, room, day and minute-of-day the stay or trip began)
--   family_housekeeping                                   NEW   one row: when expired reports were last deleted (so the clean-up runs about once a minute, whoever calls)
--   family_tz_ok / family_today / family_purge_timeline / family_purge_if_due                         NEW   time zones and the clean-up
--   family_set_report_all / family_push_timeline / family_timeline_get                                 NEW   switch it, send it, read it
--   family_drop_place_if_alone / family_room_json / family_room_state / family_my_prefs               changed (they know about the report)

alter table public.family_members add column if not exists report boolean not null default false;
alter table public.family_prefs add column if not exists report_default boolean not null default false;

create table if not exists public.family_timeline (
  room_id uuid not null references public.family_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  tz text not null check (char_length(tz) between 1 and 64),
  seq int not null check (seq between 0 and 1600),
  envelope jsonb not null check (pg_column_size(envelope) <= 60000),
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id, day, seq)
);
create index if not exists family_timeline_user_idx on public.family_timeline (user_id);
create index if not exists family_timeline_updated_idx on public.family_timeline (updated_at);

create table if not exists public.family_housekeeping (
  id boolean primary key default true check (id),
  purged_at timestamptz not null default 'epoch'
);
insert into public.family_housekeeping (id) values (true) on conflict do nothing;

alter table public.family_timeline enable row level security;
alter table public.family_housekeeping enable row level security;
revoke all on public.family_timeline, public.family_housekeeping from public, anon, authenticated;

-- a person's report starts the way they last chose (a room made or joined later has the report on when they switched it on for all rooms and share their location with it)
create or replace function public.family_member_report_default() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.report := new.sharing and coalesce((select p.report_default from public.family_prefs p where p.user_id = new.user_id), false);
  return new;
end $$;
revoke all on function public.family_member_report_default() from public, anon, authenticated;
drop trigger if exists family_members_report_default on public.family_members;
create trigger family_members_report_default before insert on public.family_members for each row execute function public.family_member_report_default();

-- ------------------------------------------------------------------------------------------------ time zones and the clean-up
create or replace function public.family_tz_ok(p_tz text) returns boolean language plpgsql stable set search_path = public as $$
begin
  if p_tz is null or char_length(p_tz) > 64 or p_tz !~ '^[A-Za-z0-9_+/-]+$' then return false; end if;
  perform now() at time zone p_tz;
  return true;
exception when others then
  return false;
end $$;

-- the calendar day it is right now in a time zone
create or replace function public.family_today(p_tz text) returns date language sql stable set search_path = public as $$
  select (now() at time zone p_tz)::date;
$$;

-- delete every report of a day that is over in its own time zone (and, whatever the zone, anything not touched for 48 hours)
create or replace function public.family_purge_timeline() returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.family_timeline t where t.day < (now() at time zone t.tz)::date or t.updated_at < now() - interval '48 hours';
  get diagnostics n = row_count;
  return n;
end $$;

-- the clean-up, at most once a minute (the caller that wins the row does it; the others go on)
create or replace function public.family_purge_if_due() returns void language plpgsql security definer set search_path = public as $$
begin
  update public.family_housekeeping set purged_at = now() where id and purged_at < now() - interval '60 seconds';
  if found then perform public.family_purge_timeline(); end if;
end $$;
revoke all on function public.family_tz_ok(text), public.family_today(text), public.family_purge_timeline(), public.family_purge_if_due() from public, anon, authenticated;

-- every minute, where the database has pg_cron (otherwise the clean-up still happens at the next call; and nothing of an old day can be read in the meantime)
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('noob-family-purge', '* * * * *', $job$ select public.family_purge_timeline(); $job$);
  end if;
exception when others then
  raise notice 'The Family Map clean-up job was not scheduled: %', sqlerrm;
end
$$;

-- ------------------------------------------------------------------------------------------------ what changes in what exists
-- places AND reports are dropped for every room where the person does not share (any more)
create or replace function public.family_drop_place_if_alone(p_user uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.family_sealed s
   where s.user_id = p_user
     and not exists (select 1 from public.family_members m where m.room_id = s.room_id and m.user_id = p_user and m.sharing);
  delete from public.family_timeline t
   where t.user_id = p_user
     and not exists (select 1 from public.family_members m where m.room_id = t.room_id and m.user_id = p_user and m.sharing and m.report);
end $$;
revoke all on function public.family_drop_place_if_alone(uuid) from public, anon, authenticated;

create or replace function public.family_room_json(p_room uuid, p_me uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'code', r.code, 'name', r.name, 'emoji', r.emoji, 'ownerId', r.owner_id, 'createdAt', r.created_at, 'locked', r.locked,
    'role', m.role, 'sharing', m.sharing, 'report', m.report,
    'memberCount', (select count(*) from public.family_members x where x.room_id = r.id))
  from public.family_rooms r join public.family_members m on m.room_id = r.id and m.user_id = p_me
  where r.id = p_room;
$$;
revoke all on function public.family_room_json(uuid, uuid) from public, anon, authenticated;

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
        'report', m.sharing and m.report,
        'me', m.user_id = v_me,
        'sealed', case when m.sharing and s.updated_at > now() - interval '24 hours' then public.family_trim_envelope(s.envelope, v_me) end,
        'updatedAt', case when m.sharing and s.updated_at > now() - interval '24 hours' then s.updated_at end
      ) order by m.joined_at)
      from public.family_members m
      join public.profiles p on p.id = m.user_id
      left join public.family_sealed s on s.room_id = m.room_id and s.user_id = m.user_id
      where m.room_id = p_room), '[]'::jsonb));
end $$;

create or replace function public.family_my_prefs() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'shareDefault', coalesce((select share_default from public.family_prefs where user_id = auth.uid()), true),
    'reportDefault', coalesce((select report_default from public.family_prefs where user_id = auth.uid()), false));
$$;

-- ------------------------------------------------------------------------------------------------ the switch
-- "share my day report" for ALL the person's rooms at once, remembered for the rooms they make or join later; switching it off deletes every report of theirs at once
create or replace function public.family_set_report_all(p_on boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_on boolean := coalesce(p_on, false);
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if v_on and public.feature_blocked('family') then return jsonb_build_object('ok', false, 'error', 'switched_off'); end if;
  update public.family_members set report = v_on where user_id = v_me;
  insert into public.family_prefs (user_id, report_default) values (v_me, v_on)
  on conflict (user_id) do update set report_default = excluded.report_default, updated_at = now();
  perform public.family_drop_place_if_alone(v_me);
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------------------------------------------ sending
-- the phone sends the locked stays and trips of its TODAY: [{ "room": "<id>", "day": "2026-10-29", "tz": "Asia/Kolkata", "seq": 540, "env": { locked envelope } }, ...]
-- ("env": null removes that stay or trip). Only today in the person's own time zone is stored, only from a member who shares with that room and has the report on, only locked data made with
-- the sender's own key. Anything else is skipped (never an error); the answer says how many were taken.
create or replace function public.family_push_timeline(p_items jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_item jsonb; v_room uuid; v_tz text; v_day date; v_seq int; v_env jsonb;
  v_saved int := 0; v_n int;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if public.feature_blocked('family') then return jsonb_build_object('ok', false, 'error', 'switched_off'); end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 40 then return jsonb_build_object('ok', false, 'error', 'failed'); end if;
  perform public.family_purge_if_due();
  for v_item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) is distinct from 'object' then continue; end if;
    if coalesce(v_item->>'room', '') !~ '^[0-9a-fA-F-]{36}$' or coalesce(v_item->>'seq', '') !~ '^[0-9]{1,4}$' or coalesce(v_item->>'day', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then continue; end if;
    v_tz := v_item->>'tz';
    if not public.family_tz_ok(v_tz) then continue; end if;
    begin v_day := (v_item->>'day')::date; exception when others then continue; end;
    v_room := (v_item->>'room')::uuid;
    v_seq := (v_item->>'seq')::int;
    if v_seq > 1600 then continue; end if;
    -- only the person's TODAY is ever stored: a report of yesterday (or of tomorrow, by a wrong clock) is refused
    if v_day is distinct from public.family_today(v_tz) then continue; end if;
    if not exists (select 1 from public.family_members where room_id = v_room and user_id = v_me and sharing and report) then continue; end if;
    -- a new day or a new time zone: whatever else this person has in this room is out of date and goes at once
    delete from public.family_timeline where room_id = v_room and user_id = v_me and (day, tz) is distinct from (v_day, v_tz);
    if v_item ? 'env' and jsonb_typeof(v_item->'env') = 'null' then
      delete from public.family_timeline where room_id = v_room and user_id = v_me and day = v_day and seq = v_seq;
      v_saved := v_saved + 1;
      continue;
    end if;
    v_env := v_item->'env';
    if v_env is null or not public.valid_e2ee_envelope(v_env, v_me) then continue; end if;
    select count(*) into v_n from public.family_timeline where room_id = v_room and user_id = v_me and day = v_day;
    if v_n >= 700 and not exists (select 1 from public.family_timeline where room_id = v_room and user_id = v_me and day = v_day and seq = v_seq) then continue; end if;
    insert into public.family_timeline as t (room_id, user_id, day, tz, seq, envelope, updated_at) values (v_room, v_me, v_day, v_tz, v_seq, v_env, now())
    on conflict (room_id, user_id, day, seq) do update set envelope = excluded.envelope, updated_at = excluded.updated_at
      where t.updated_at < now() - interval '2 seconds';
    get diagnostics v_n = row_count;
    if v_n > 0 then v_saved := v_saved + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'saved', v_saved);
end $$;

-- ------------------------------------------------------------------------------------------------ reading
-- one person's report of today, for a member of the same room: the locked stays and trips (each reduced to the locks of the asking person's devices); "seqs" lists every one that exists, so a
-- phone that asks only for what changed since `p_since` still learns what was removed. A person who does not share, or has the report off, shows nothing.
create or replace function public.family_timeline_get(p_room uuid, p_user uuid, p_since timestamptz default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_on boolean; v_rows jsonb; v_seqs jsonb;
begin
  if v_me is null or not exists (select 1 from public.family_members where room_id = p_room and user_id = v_me) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  perform public.family_purge_if_due();
  select (m.sharing and m.report) into v_on from public.family_members m where m.room_id = p_room and m.user_id = p_user;
  if v_on is null then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  if not v_on then return jsonb_build_object('ok', true, 'now', now(), 'on', false, 'seqs', '[]'::jsonb, 'rows', '[]'::jsonb); end if;
  select coalesce(jsonb_agg(t.seq order by t.seq), '[]'::jsonb) into v_seqs
    from public.family_timeline t where t.room_id = p_room and t.user_id = p_user and t.day = (now() at time zone t.tz)::date;
  select coalesce(jsonb_agg(jsonb_build_object('seq', t.seq, 'day', t.day, 'tz', t.tz, 'at', t.updated_at, 'env', public.family_trim_envelope(t.envelope, v_me)) order by t.seq), '[]'::jsonb) into v_rows
    from public.family_timeline t where t.room_id = p_room and t.user_id = p_user and t.day = (now() at time zone t.tz)::date and (p_since is null or t.updated_at > p_since);
  return jsonb_build_object('ok', true, 'now', now(), 'on', true, 'seqs', v_seqs, 'rows', v_rows);
end $$;

revoke all on function public.family_set_report_all(boolean), public.family_push_timeline(jsonb), public.family_timeline_get(uuid, uuid, timestamptz), public.family_my_prefs(), public.family_room_state(uuid) from public, anon;
grant execute on function public.family_set_report_all(boolean), public.family_push_timeline(jsonb), public.family_timeline_get(uuid, uuid, timestamptz), public.family_my_prefs(), public.family_room_state(uuid) to authenticated;
