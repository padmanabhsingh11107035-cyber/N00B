-- NOOB Live Lounge: proper MEETINGS (title, description, date and time, repeats, passcode, waiting room, who may join, invitations,
-- registration, reminders ...), not only a bare room code.
--
-- A meeting is the plan ("live_lounge_meetings"). When the host starts it, the existing live room is created from it
-- ("live_lounge_rooms.meeting_id"), so the video room itself keeps working exactly as before. Everything below is checked on the
-- server, so nobody can skip a passcode, a waiting room, a lock or a guest list by calling the database directly:
--   passcode  - waiting room (on/off) - join before the host - who may join (named people / e-mail domains) - lock - registration
--   (with approval) - chat on/off.
-- Saved with the meeting but NOT acted on inside the call yet: breakout rooms and language interpretation.

-- ================================================================================================================ tables
create table if not exists public.live_lounge_meetings (
  id                    uuid primary key default gen_random_uuid(),
  host_id               uuid not null references public.profiles (id) on delete cascade,
  created_by            uuid not null references public.profiles (id) on delete cascade,
  title                 text not null default '',
  description           text not null default '',
  meeting_type          text not null default 'meeting' check (meeting_type in ('meeting', 'class', 'webinar', 'interview', 'hangout')),
  instant               boolean not null default false,
  scheduled_for         timestamptz not null,
  duration_minutes      integer not null default 60 check (duration_minutes between 5 and 1440),
  timezone              text not null default 'UTC',
  recurrence            text not null default 'none' check (recurrence in ('none', 'daily', 'weekly', 'monthly')),
  recurrence_interval   integer not null default 1 check (recurrence_interval between 1 and 30),
  recurrence_end_date   date,
  recurrence_count      integer check (recurrence_count is null or recurrence_count between 2 and 60),
  meeting_code          text not null,
  uses_personal_id      boolean not null default false,
  passcode              text,
  waiting_room          boolean not null default true,
  waiting_room_title    text not null default '',
  waiting_room_message  text not null default '',
  join_before_host      boolean not null default false,
  restrict_users        boolean not null default false,
  restrict_domains      boolean not null default false,
  allowed_domains       text[] not null default '{}',
  auto_lock             boolean not null default false,
  chat_enabled          boolean not null default true,
  host_only_screen_share boolean not null default false,
  registration_required boolean not null default false,
  registration_approval text not null default 'auto' check (registration_approval in ('auto', 'manual')),
  breakout_enabled      boolean not null default false,
  breakout_rooms        jsonb not null default '[]'::jsonb,
  interpretation        jsonb not null default '[]'::jsonb,
  reminder_minutes      integer not null default 10 check (reminder_minutes between 0 and 1440),
  include_passcode_in_invite boolean not null default true,
  status                text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index if not exists live_lounge_meetings_code_uidx on public.live_lounge_meetings (meeting_code) where not uses_personal_id;
create index if not exists live_lounge_meetings_host_idx on public.live_lounge_meetings (host_id, scheduled_for);

create table if not exists public.live_lounge_meeting_invitees (
  meeting_id uuid not null references public.live_lounge_meetings (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  invited_by uuid references public.profiles (id) on delete set null,
  invited_at timestamptz not null default now(),
  primary key (meeting_id, user_id)
);
create index if not exists live_lounge_meeting_invitees_user_idx on public.live_lounge_meeting_invitees (user_id);

create table if not exists public.live_lounge_meeting_registrations (
  meeting_id uuid not null references public.live_lounge_meetings (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  note       text not null default '',
  status     text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (meeting_id, user_id)
);

create table if not exists public.live_lounge_meeting_skips (
  meeting_id       uuid not null references public.live_lounge_meetings (id) on delete cascade,
  occurrence_start timestamptz not null,
  primary key (meeting_id, occurrence_start)
);
create table if not exists public.live_lounge_meeting_reminders (
  meeting_id       uuid not null references public.live_lounge_meetings (id) on delete cascade,
  occurrence_start timestamptz not null,
  sent_at          timestamptz not null default now(),
  primary key (meeting_id, occurrence_start)
);
-- someone who may schedule meetings on behalf of a host (the host agreed to it)
create table if not exists public.live_lounge_assistants (
  host_id      uuid not null references public.profiles (id) on delete cascade,
  assistant_id uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (host_id, assistant_id),
  check (host_id <> assistant_id)
);
create table if not exists public.live_lounge_personal_ids (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  code    text not null unique
);

do $$
declare t text;
begin
  foreach t in array array['live_lounge_meetings', 'live_lounge_meeting_invitees', 'live_lounge_meeting_registrations', 'live_lounge_meeting_skips',
                           'live_lounge_meeting_reminders', 'live_lounge_assistants', 'live_lounge_personal_ids'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);     -- only the functions below touch them
  end loop;
end
$$;

alter table public.live_lounge_rooms add column if not exists meeting_id uuid references public.live_lounge_meetings (id) on delete set null;
alter table public.live_lounge_rooms add column if not exists occurrence_start timestamptz;
alter table public.live_lounge_rooms add column if not exists locked boolean not null default false;
create index if not exists live_lounge_rooms_meeting_idx on public.live_lounge_rooms (meeting_id);

-- ============================================================================================================== helpers
-- The start times of a meeting between two moments (a one-off has one; a repeating one is worked out in the meeting's own time zone,
-- so "every Monday 5 pm" stays at 5 pm across summer/winter time). Skipped days are left out.
create or replace function public.live_lounge_meeting_occurrences(m public.live_lounge_meetings, p_from timestamptz, p_to timestamptz) returns setof timestamptz
language sql stable set search_path = public as $$
  select o.t from (
    select case m.recurrence
             when 'none'    then m.scheduled_for
             when 'daily'   then ((m.scheduled_for at time zone m.timezone) + (n * m.recurrence_interval) * interval '1 day') at time zone m.timezone
             when 'weekly'  then ((m.scheduled_for at time zone m.timezone) + (n * m.recurrence_interval) * interval '7 days') at time zone m.timezone
             else                ((m.scheduled_for at time zone m.timezone) + (n * m.recurrence_interval) * interval '1 month') at time zone m.timezone
           end as t, n
    from generate_series(0, case when m.recurrence = 'none' then 0 else 399 end) n
  ) o
  where (m.recurrence = 'none' or m.recurrence_count is null or o.n < m.recurrence_count)
    and (m.recurrence = 'none' or m.recurrence_end_date is null or (o.t at time zone m.timezone)::date <= m.recurrence_end_date)
    and o.t + make_interval(mins => m.duration_minutes) >= p_from
    and o.t <= p_to
    and not exists (select 1 from public.live_lounge_meeting_skips s where s.meeting_id = m.id and s.occurrence_start = o.t)
  order by o.t;
$$;
revoke execute on function public.live_lounge_meeting_occurrences(public.live_lounge_meetings, timestamptz, timestamptz) from public, anon, authenticated;

-- A 9-digit Meeting ID nobody else is using.
create or replace function public.live_lounge_new_meeting_code() returns text
language plpgsql volatile set search_path = public as $$
declare v text;
begin
  loop
    v := lpad((100000000 + floor(random() * 899999999))::bigint::text, 9, '0');
    exit when not exists (select 1 from public.live_lounge_meetings where meeting_code = v)
          and not exists (select 1 from public.live_lounge_personal_ids where code = v)
          and not exists (select 1 from public.live_lounge_rooms where room_code = v);
  end loop;
  return v;
end;
$$;
revoke execute on function public.live_lounge_new_meeting_code() from public, anon, authenticated;

create or replace function public.live_lounge_normalise_code(p text) returns text
language sql immutable set search_path = public as $$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'));
$$;
revoke execute on function public.live_lounge_normalise_code(text) from public, anon, authenticated;

-- My Personal Meeting ID: one fixed 10-digit number per person, made the first time it is asked for.
create or replace function public.live_lounge_my_personal_id() returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v text;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select code into v from public.live_lounge_personal_ids where user_id = me;
  if v is not null then return v; end if;
  loop
    v := lpad((1000000000 + floor(random() * 8999999999))::bigint::text, 10, '0');
    exit when not exists (select 1 from public.live_lounge_personal_ids where code = v)
          and not exists (select 1 from public.live_lounge_meetings where meeting_code = v)
          and not exists (select 1 from public.live_lounge_rooms where room_code = v);
  end loop;
  insert into public.live_lounge_personal_ids (user_id, code) values (me, v) on conflict (user_id) do nothing;
  select code into v from public.live_lounge_personal_ids where user_id = me;
  return v;
end;
$$;
revoke execute on function public.live_lounge_my_personal_id() from public, anon;
grant execute on function public.live_lounge_my_personal_id() to authenticated;

-- ======================================================================================================= meeting as JSON
-- What a person is allowed to see of a meeting. The host (and whoever scheduled it) sees everything; an invited person sees the plan
-- and the passcode (it is in their invitation); everyone else would see nothing (these functions refuse them).
create or replace function public.live_lounge_meeting_json(m public.live_lounge_meetings, p_full boolean, p_see_passcode boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', m.id, 'hostId', m.host_id, 'createdBy', m.created_by,
    'hostUsername', h.username, 'hostDisplayName', h.display_name, 'hostAvatar', h.avatar,
    'title', m.title, 'description', m.description, 'meetingType', m.meeting_type, 'instant', m.instant,
    'scheduledFor', m.scheduled_for, 'durationMinutes', m.duration_minutes, 'timezone', m.timezone,
    'recurrence', m.recurrence, 'recurrenceInterval', m.recurrence_interval, 'recurrenceEndDate', m.recurrence_end_date, 'recurrenceCount', m.recurrence_count,
    'meetingCode', m.meeting_code, 'usesPersonalId', m.uses_personal_id,
    'hasPasscode', m.passcode is not null,
    'passcode', case when p_see_passcode then m.passcode else null end,
    'waitingRoom', m.waiting_room, 'waitingRoomTitle', m.waiting_room_title, 'waitingRoomMessage', m.waiting_room_message,
    'joinBeforeHost', m.join_before_host, 'chatEnabled', m.chat_enabled, 'hostOnlyScreenShare', m.host_only_screen_share,
    'registrationRequired', m.registration_required, 'registrationApproval', m.registration_approval,
    'breakoutEnabled', m.breakout_enabled, 'interpretation', case when p_full then m.interpretation else '[]'::jsonb end,
    'breakoutRooms', case when p_full then m.breakout_rooms else '[]'::jsonb end,
    'restrictUsers', case when p_full then m.restrict_users else null end,
    'restrictDomains', case when p_full then m.restrict_domains else null end,
    'allowedDomains', case when p_full then to_jsonb(m.allowed_domains) else null end,
    'autoLock', case when p_full then m.auto_lock else null end,
    'reminderMinutes', m.reminder_minutes, 'includePasscodeInInvite', m.include_passcode_in_invite,
    'status', m.status, 'createdAt', m.created_at)
  from public.profiles h where h.id = m.host_id;
$$;
revoke execute on function public.live_lounge_meeting_json(public.live_lounge_meetings, boolean, boolean) from public, anon, authenticated;

-- ========================================================================================== schedule / change a meeting
-- p: the whole form. New meeting when p_id is null, otherwise changes that meeting (only its host or whoever scheduled it).
create or replace function public.save_live_lounge_meeting(p jsonb, p_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); m public.live_lounge_meetings; v_host uuid; v_instant boolean := coalesce((p->>'instant')::boolean, false);
  v_when timestamptz; v_tz text; v_rec text; v_pass text; v_title text; v_code text; v_personal boolean := coalesce((p->>'usesPersonalId')::boolean, false);
  v_domains text[]; v_waiting boolean; v_join_before boolean; v_count int; v_end date; v_type text; v_dur int; v_new boolean := p_id is null;
  v_invitee uuid; v_added uuid[] := '{}'; v_note text;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if not public.has_live_lounge_access(me) then raise exception 'NOOB Live Lounge is a members-only feature.'; end if;

  if v_new then
    v_host := coalesce(nullif(p->>'hostId', '')::uuid, me);
    if v_host <> me and not exists (select 1 from public.live_lounge_assistants a where a.host_id = v_host and a.assistant_id = me) then
      raise exception 'That person has not allowed you to schedule meetings for them.';
    end if;
  else
    select * into m from public.live_lounge_meetings where id = p_id for update;
    if not found then raise exception 'That meeting was not found.'; end if;
    if m.host_id <> me and m.created_by <> me then raise exception 'Only the host can change this meeting.'; end if;
    v_host := m.host_id;
  end if;

  v_title := left(btrim(coalesce(p->>'title', '')), 80);
  if v_title = '' then raise exception 'Give the meeting a title.'; end if;
  v_type := coalesce(nullif(p->>'meetingType', ''), 'meeting');
  if v_type not in ('meeting', 'class', 'webinar', 'interview', 'hangout') then raise exception 'Choose what kind of meeting this is.'; end if;
  v_dur := coalesce((p->>'durationMinutes')::int, 60);
  if v_dur < 5 or v_dur > 1440 then raise exception 'A meeting can last from 5 minutes up to 24 hours.'; end if;
  v_tz := coalesce(nullif(btrim(p->>'timezone'), ''), 'UTC');
  if not exists (select 1 from pg_timezone_names where name = v_tz) then raise exception 'That time zone is not known.'; end if;

  v_when := case when v_instant then now() else (p->>'scheduledFor')::timestamptz end;
  if v_when is null then raise exception 'Choose the date and time.'; end if;
  if not v_instant and v_new and v_when < now() - interval '5 minutes' then raise exception 'That time has already passed.'; end if;
  if not v_instant and v_when > now() + interval '2 years' then raise exception 'You can schedule up to 2 years ahead.'; end if;

  v_rec := coalesce(nullif(p->>'recurrence', ''), 'none');
  if v_rec not in ('none', 'daily', 'weekly', 'monthly') then raise exception 'Choose how the meeting repeats.'; end if;
  v_count := nullif(p->>'recurrenceCount', '')::int;
  v_end := nullif(p->>'recurrenceEndDate', '')::date;
  if v_rec <> 'none' then
    if v_count is null and v_end is null then raise exception 'Say when a repeating meeting ends (a date, or a number of times).'; end if;
    if v_end is not null and v_end <= (v_when at time zone v_tz)::date then raise exception 'The end date must be after the first meeting.'; end if;
    if v_end is not null and v_end > (v_when at time zone v_tz)::date + 730 then raise exception 'A repeating meeting can run for up to 2 years.'; end if;
  else
    v_count := null; v_end := null;
  end if;

  v_pass := nullif(btrim(coalesce(p->>'passcode', '')), '');
  if v_pass is not null and v_pass !~ '^[A-Za-z0-9]{4,10}$' then raise exception 'The passcode must be 4 to 10 letters or numbers.'; end if;

  v_waiting := coalesce((p->>'waitingRoom')::boolean, true);
  v_join_before := coalesce((p->>'joinBeforeHost')::boolean, false) and not v_waiting;     -- a waiting room means the host lets people in
  select coalesce(array_agg(distinct lower(btrim(d))) filter (where btrim(d) <> ''), '{}') into v_domains
  from jsonb_array_elements_text(coalesce(p->'allowedDomains', '[]'::jsonb)) d;
  if exists (select 1 from unnest(v_domains) d where d !~ '^[a-z0-9.-]+\.[a-z]{2,}$') then raise exception 'An e-mail domain looks like school.edu'; end if;
  if coalesce((p->>'restrictDomains')::boolean, false) and cardinality(v_domains) = 0 then raise exception 'Add at least one e-mail domain, or turn that restriction off.'; end if;

  if v_new then
    if v_personal and v_host <> me then raise exception 'A Personal Meeting ID can only be used for your own meetings.'; end if;
    if v_personal then
      v_code := public.live_lounge_my_personal_id();
    else
      v_code := public.live_lounge_new_meeting_code();
    end if;
    insert into public.live_lounge_meetings (host_id, created_by, title, description, meeting_type, instant, scheduled_for, duration_minutes, timezone,
      recurrence, recurrence_interval, recurrence_end_date, recurrence_count, meeting_code, uses_personal_id, passcode, waiting_room, waiting_room_title,
      waiting_room_message, join_before_host, restrict_users, restrict_domains, allowed_domains, auto_lock, chat_enabled, host_only_screen_share,
      registration_required, registration_approval, breakout_enabled, breakout_rooms, interpretation, reminder_minutes, include_passcode_in_invite)
    values (v_host, me, v_title, left(btrim(coalesce(p->>'description', '')), 1000), v_type, v_instant, v_when, v_dur, v_tz,
      v_rec, coalesce((p->>'recurrenceInterval')::int, 1), v_end, v_count, v_code, v_personal, v_pass, v_waiting,
      left(btrim(coalesce(p->>'waitingRoomTitle', '')), 80), left(btrim(coalesce(p->>'waitingRoomMessage', '')), 300), v_join_before,
      coalesce((p->>'restrictUsers')::boolean, false), coalesce((p->>'restrictDomains')::boolean, false), v_domains,
      coalesce((p->>'autoLock')::boolean, false), coalesce((p->>'chatEnabled')::boolean, true), coalesce((p->>'hostOnlyScreenShare')::boolean, false),
      coalesce((p->>'registrationRequired')::boolean, false), case when p->>'registrationApproval' = 'manual' then 'manual' else 'auto' end,
      coalesce((p->>'breakoutEnabled')::boolean, false), coalesce(p->'breakoutRooms', '[]'::jsonb), coalesce(p->'interpretation', '[]'::jsonb),
      coalesce((p->>'reminderMinutes')::int, 10), coalesce((p->>'includePasscodeInInvite')::boolean, true))
    returning * into m;
  else
    update public.live_lounge_meetings set
      title = v_title, description = left(btrim(coalesce(p->>'description', '')), 1000), meeting_type = v_type, scheduled_for = v_when,
      duration_minutes = v_dur, timezone = v_tz, recurrence = v_rec, recurrence_interval = coalesce((p->>'recurrenceInterval')::int, 1),
      recurrence_end_date = v_end, recurrence_count = v_count, passcode = v_pass, waiting_room = v_waiting,
      waiting_room_title = left(btrim(coalesce(p->>'waitingRoomTitle', '')), 80), waiting_room_message = left(btrim(coalesce(p->>'waitingRoomMessage', '')), 300),
      join_before_host = v_join_before, restrict_users = coalesce((p->>'restrictUsers')::boolean, false),
      restrict_domains = coalesce((p->>'restrictDomains')::boolean, false), allowed_domains = v_domains,
      auto_lock = coalesce((p->>'autoLock')::boolean, false), chat_enabled = coalesce((p->>'chatEnabled')::boolean, true),
      host_only_screen_share = coalesce((p->>'hostOnlyScreenShare')::boolean, false),
      registration_required = coalesce((p->>'registrationRequired')::boolean, false),
      registration_approval = case when p->>'registrationApproval' = 'manual' then 'manual' else 'auto' end,
      breakout_enabled = coalesce((p->>'breakoutEnabled')::boolean, false), breakout_rooms = coalesce(p->'breakoutRooms', '[]'::jsonb),
      interpretation = coalesce(p->'interpretation', '[]'::jsonb), reminder_minutes = coalesce((p->>'reminderMinutes')::int, 10),
      include_passcode_in_invite = coalesce((p->>'includePasscodeInInvite')::boolean, true), updated_at = now()
    where id = p_id returning * into m;
    -- a changed time starts the reminders again
    delete from public.live_lounge_meeting_reminders where meeting_id = m.id;
  end if;

  -- invited people: add the new ones and tell them (the ones already on the list are not told again)
  if p ? 'inviteeIds' then
    for v_invitee in select distinct (x)::uuid from jsonb_array_elements_text(coalesce(p->'inviteeIds', '[]'::jsonb)) x loop
      continue when v_invitee = m.host_id;
      continue when not exists (select 1 from public.profiles where id = v_invitee and not is_suspended);
      insert into public.live_lounge_meeting_invitees (meeting_id, user_id, invited_by) values (m.id, v_invitee, me) on conflict do nothing;
      if found then v_added := v_added || v_invitee; end if;
    end loop;
    if not v_new then
      -- people taken off the list in the form
      delete from public.live_lounge_meeting_invitees i
      where i.meeting_id = m.id and not exists (select 1 from jsonb_array_elements_text(coalesce(p->'inviteeIds', '[]'::jsonb)) x where x::uuid = i.user_id);
    end if;
  end if;
  if not m.instant and cardinality(v_added) > 0 then
    v_note := 'Invited you to "' || m.title || '" on ' || to_char(m.scheduled_for at time zone m.timezone, 'DD Mon YYYY, HH24:MI') || ' (' || m.timezone || '). Meeting ID ' || m.meeting_code || '.';
    foreach v_invitee in array v_added loop
      perform public.notify_user(v_invitee, 'live_lounge_meeting', m.host_id, m.id::text, v_note);
    end loop;
  end if;

  return public.live_lounge_meeting_json(m, true, true);
end;
$$;
revoke execute on function public.save_live_lounge_meeting(jsonb, uuid) from public, anon;
grant execute on function public.save_live_lounge_meeting(jsonb, uuid) to authenticated;

-- ============================================================================================ looking at meetings
-- Upcoming (and running) meetings I host, scheduled or am invited to / registered for: one row per occurrence, soonest first.
create or replace function public.my_live_lounge_meetings(p_days integer default 60) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); res jsonb;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select coalesce(jsonb_agg(x.j order by x.t), '[]'::jsonb) into res from (
    select o.t,
      public.live_lounge_meeting_json(m, m.host_id = me or m.created_by = me, m.host_id = me or m.created_by = me or m.include_passcode_in_invite)
        || jsonb_build_object('occurrenceStart', o.t, 'isHost', m.host_id = me, 'canManage', m.host_id = me or m.created_by = me,
             'liveRoomId', (select r.id from public.live_lounge_rooms r where r.meeting_id = m.id and r.status = 'active' order by r.created_at desc limit 1),
             'invitedCount', (select count(*) from public.live_lounge_meeting_invitees i where i.meeting_id = m.id)) as j
    from public.live_lounge_meetings m
    cross join lateral public.live_lounge_meeting_occurrences(m, now(), now() + make_interval(days => least(greatest(p_days, 1), 365))) o(t)
    where m.status = 'scheduled'
      and (m.host_id = me or m.created_by = me
           or exists (select 1 from public.live_lounge_meeting_invitees i where i.meeting_id = m.id and i.user_id = me)
           or exists (select 1 from public.live_lounge_meeting_registrations g where g.meeting_id = m.id and g.user_id = me and g.status = 'approved'))
      -- a one-off meeting that already ran is finished
      and not (m.recurrence = 'none' and exists (select 1 from public.live_lounge_rooms r where r.meeting_id = m.id and r.status = 'ended'))
      and not (m.instant and exists (select 1 from public.live_lounge_rooms r where r.meeting_id = m.id))
    order by o.t
    limit 100
  ) x;
  return res;
end;
$$;
revoke execute on function public.my_live_lounge_meetings(integer) from public, anon;
grant execute on function public.my_live_lounge_meetings(integer) to authenticated;

-- One meeting in full. The host sees everything (guest list, registrations); an invited person sees the plan and passcode.
create or replace function public.live_lounge_meeting_details(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); m public.live_lounge_meetings; manage boolean; invited boolean; reg public.live_lounge_meeting_registrations; nxt timestamptz;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into m from public.live_lounge_meetings where id = p_id;
  if not found then raise exception 'That meeting was not found.'; end if;
  manage := m.host_id = me or m.created_by = me;
  invited := exists (select 1 from public.live_lounge_meeting_invitees i where i.meeting_id = m.id and i.user_id = me);
  select * into reg from public.live_lounge_meeting_registrations where meeting_id = m.id and user_id = me;
  if not manage and not invited and reg.user_id is null then raise exception 'You are not invited to this meeting.'; end if;
  select min(o) into nxt from public.live_lounge_meeting_occurrences(m, now(), now() + interval '2 years') o;
  return public.live_lounge_meeting_json(m, manage, manage or m.include_passcode_in_invite)
    || jsonb_build_object(
      'canManage', manage, 'isHost', m.host_id = me, 'nextOccurrence', nxt,
      'myRegistration', case when reg.user_id is null then null else jsonb_build_object('status', reg.status, 'note', reg.note) end,
      'liveRoomId', (select r.id from public.live_lounge_rooms r where r.meeting_id = m.id and r.status = 'active' order by r.created_at desc limit 1),
      'invitees', case when manage then coalesce((
        select jsonb_agg(jsonb_build_object('userId', pr.id, 'username', pr.username, 'displayName', pr.display_name, 'avatar', pr.avatar,
          'registration', g.status,
          'joined', exists (select 1 from public.live_lounge_room_participants lp join public.live_lounge_rooms lr on lr.id = lp.room_id
                            where lr.meeting_id = m.id and lp.user_id = pr.id and lp.status = 'admitted')) order by i.invited_at)
        from public.live_lounge_meeting_invitees i join public.profiles pr on pr.id = i.user_id
        left join public.live_lounge_meeting_registrations g on g.meeting_id = m.id and g.user_id = pr.id
        where i.meeting_id = m.id), '[]'::jsonb) else null end,
      'registrations', case when manage and m.registration_required then coalesce((
        select jsonb_agg(jsonb_build_object('userId', pr.id, 'username', pr.username, 'displayName', pr.display_name, 'avatar', pr.avatar,
          'note', g.note, 'status', g.status, 'createdAt', g.created_at) order by g.created_at)
        from public.live_lounge_meeting_registrations g join public.profiles pr on pr.id = g.user_id where g.meeting_id = m.id), '[]'::jsonb) else null end);
end;
$$;
revoke execute on function public.live_lounge_meeting_details(uuid) from public, anon;
grant execute on function public.live_lounge_meeting_details(uuid) to authenticated;

-- ================================================================================== cancel, invite, register, assistants
create or replace function public.cancel_live_lounge_meeting(p_id uuid, p_occurrence timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); m public.live_lounge_meetings; i record;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into m from public.live_lounge_meetings where id = p_id for update;
  if not found or (m.host_id <> me and m.created_by <> me) then raise exception 'That meeting was not found.'; end if;
  if p_occurrence is not null and m.recurrence <> 'none' then
    insert into public.live_lounge_meeting_skips (meeting_id, occurrence_start) values (p_id, p_occurrence) on conflict do nothing;
  else
    update public.live_lounge_meetings set status = 'cancelled', updated_at = now() where id = p_id;
  end if;
  for i in select user_id from public.live_lounge_meeting_invitees where meeting_id = p_id loop
    perform public.notify_user(i.user_id, 'live_lounge_meeting', m.host_id, m.id::text,
      case when p_occurrence is not null and m.recurrence <> 'none' then 'Cancelled one meeting of "' || m.title || '" (' || to_char(p_occurrence at time zone m.timezone, 'DD Mon, HH24:MI') || ').'
           else 'Cancelled the meeting "' || m.title || '".' end);
  end loop;
  return jsonb_build_object('success', true);
end;
$$;
revoke execute on function public.cancel_live_lounge_meeting(uuid, timestamptz) from public, anon;
grant execute on function public.cancel_live_lounge_meeting(uuid, timestamptz) to authenticated;

-- Invite more people to an existing meeting (or, with p_resend, remind everyone already invited).
create or replace function public.invite_to_live_lounge_meeting(p_id uuid, p_user_ids uuid[], p_resend boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); m public.live_lounge_meetings; u uuid; n int := 0; v_note text; targets uuid[];
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into m from public.live_lounge_meetings where id = p_id;
  if not found or (m.host_id <> me and m.created_by <> me) then raise exception 'That meeting was not found.'; end if;
  if m.status <> 'scheduled' then raise exception 'That meeting was cancelled.'; end if;
  if cardinality(coalesce(p_user_ids, '{}')) > 100 then raise exception 'Invite up to 100 people at a time.'; end if;
  foreach u in array coalesce(p_user_ids, '{}') loop
    continue when u = m.host_id or not exists (select 1 from public.profiles where id = u and not is_suspended);
    insert into public.live_lounge_meeting_invitees (meeting_id, user_id, invited_by) values (p_id, u, me) on conflict do nothing;
  end loop;
  if p_resend then
    select array_agg(user_id) into targets from public.live_lounge_meeting_invitees where meeting_id = p_id;
  else
    targets := coalesce(p_user_ids, '{}');
  end if;
  v_note := 'Invited you to "' || m.title || '" on ' || to_char(m.scheduled_for at time zone m.timezone, 'DD Mon YYYY, HH24:MI') || ' (' || m.timezone || '). Meeting ID ' || m.meeting_code || '.';
  foreach u in array coalesce(targets, '{}') loop
    continue when u = m.host_id;
    continue when not exists (select 1 from public.live_lounge_meeting_invitees where meeting_id = p_id and user_id = u);
    perform public.notify_user(u, 'live_lounge_meeting', m.host_id, m.id::text, v_note);
    n := n + 1;
  end loop;
  return jsonb_build_object('success', true, 'sent', n);
end;
$$;
revoke execute on function public.invite_to_live_lounge_meeting(uuid, uuid[], boolean) from public, anon;
grant execute on function public.invite_to_live_lounge_meeting(uuid, uuid[], boolean) to authenticated;

-- Registering for a meeting that asks for it (by Meeting ID). With approval "auto" the person is in at once; with "manual" the host decides.
create or replace function public.register_for_live_lounge_meeting(p_code text, p_note text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); m public.live_lounge_meetings; v_status text;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into m from public.live_lounge_meetings where meeting_code = public.live_lounge_normalise_code(p_code) and status = 'scheduled' order by scheduled_for desc limit 1;
  if not found then raise exception 'That Meeting ID was not found.'; end if;
  if not m.registration_required then raise exception 'This meeting does not need registration.'; end if;
  v_status := case when m.registration_approval = 'auto' then 'approved' else 'pending' end;
  insert into public.live_lounge_meeting_registrations (meeting_id, user_id, note, status, decided_at)
  values (m.id, me, left(btrim(coalesce(p_note, '')), 300), v_status, case when v_status = 'approved' then now() end)
  on conflict (meeting_id, user_id) do nothing;
  select status into v_status from public.live_lounge_meeting_registrations where meeting_id = m.id and user_id = me;
  if v_status = 'pending' then
    perform public.notify_user(m.host_id, 'live_lounge_meeting', me, m.id::text, 'Asked to join "' || m.title || '". Open the meeting to approve or decline.');
  end if;
  return jsonb_build_object('success', true, 'status', v_status, 'meetingId', m.id);
end;
$$;
revoke execute on function public.register_for_live_lounge_meeting(text, text) from public, anon;
grant execute on function public.register_for_live_lounge_meeting(text, text) to authenticated;

create or replace function public.review_live_lounge_registration(p_meeting uuid, p_user uuid, p_approve boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); m public.live_lounge_meetings;
begin
  select * into m from public.live_lounge_meetings where id = p_meeting;
  if not found or (m.host_id <> me and m.created_by <> me) then raise exception 'That meeting was not found.'; end if;
  update public.live_lounge_meeting_registrations set status = case when p_approve then 'approved' else 'declined' end, decided_at = now()
  where meeting_id = p_meeting and user_id = p_user;
  if not found then raise exception 'That registration was not found.'; end if;
  perform public.notify_user(p_user, 'live_lounge_meeting', m.host_id, m.id::text,
    case when p_approve then 'Approved your registration for "' || m.title || '". You can join with Meeting ID ' || m.meeting_code || '.'
         else 'Declined your registration for "' || m.title || '".' end);
  return jsonb_build_object('success', true);
end;
$$;
revoke execute on function public.review_live_lounge_registration(uuid, uuid, boolean) from public, anon;
grant execute on function public.review_live_lounge_registration(uuid, uuid, boolean) to authenticated;

-- "Schedule meetings for me": the people a host allows to set up meetings in their name.
create or replace function public.set_live_lounge_assistant(p_user uuid, p_allowed boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if p_user is null or p_user = me then raise exception 'Choose someone else.'; end if;
  if p_allowed then
    if not exists (select 1 from public.profiles where id = p_user and not is_suspended) then raise exception 'That account was not found.'; end if;
    insert into public.live_lounge_assistants (host_id, assistant_id) values (me, p_user) on conflict do nothing;
  else
    delete from public.live_lounge_assistants where host_id = me and assistant_id = p_user;
  end if;
  return jsonb_build_object('success', true);
end;
$$;
revoke execute on function public.set_live_lounge_assistant(uuid, boolean) from public, anon;
grant execute on function public.set_live_lounge_assistant(uuid, boolean) to authenticated;

create or replace function public.my_live_lounge_assistants() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'allowed', coalesce((select jsonb_agg(jsonb_build_object('userId', p.id, 'username', p.username, 'avatar', p.avatar) order by a.created_at)
                         from public.live_lounge_assistants a join public.profiles p on p.id = a.assistant_id where a.host_id = auth.uid()), '[]'::jsonb),
    'hostsForMe', coalesce((select jsonb_agg(jsonb_build_object('userId', p.id, 'username', p.username, 'avatar', p.avatar) order by a.created_at)
                            from public.live_lounge_assistants a join public.profiles p on p.id = a.host_id where a.assistant_id = auth.uid()), '[]'::jsonb));
$$;
revoke execute on function public.my_live_lounge_assistants() from public, anon;
grant execute on function public.my_live_lounge_assistants() to authenticated;

-- ======================================================================================== starting and joining
create or replace function public.live_lounge_make_room(m public.live_lounge_meetings, p_occurrence timestamptz, p_host_present boolean) returns public.live_lounge_rooms
language plpgsql security definer set search_path = public as $$
declare r public.live_lounge_rooms;
begin
  -- the same Meeting ID may only be live once at a time
  if exists (select 1 from public.live_lounge_rooms where room_code = m.meeting_code and status = 'active') then
    raise exception 'A meeting with this ID is already running.';
  end if;
  insert into public.live_lounge_rooms (host_id, title, room_code, channel_name, meeting_id, occurrence_start)
  values (m.host_id, m.title, m.meeting_code, 'lounge_' || replace(gen_random_uuid()::text, '-', ''), m.id, p_occurrence)
  returning * into r;
  if p_host_present then
    insert into public.live_lounge_room_participants (room_id, user_id, role, status) values (r.id, m.host_id, 'host', 'admitted')
    on conflict (room_id, user_id) do nothing;
  end if;
  return r;
end;
$$;
revoke execute on function public.live_lounge_make_room(public.live_lounge_meetings, timestamptz, boolean) from public, anon, authenticated;

-- The host starts a meeting (any time, also early). Starting it again while it is live just takes the host back into it.
create or replace function public.start_live_lounge_meeting(p_id uuid, p_occurrence timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); m public.live_lounge_meetings; r public.live_lounge_rooms; occ timestamptz; locked boolean; msg text; i record;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into m from public.live_lounge_meetings where id = p_id;
  if not found or m.status <> 'scheduled' then raise exception 'That meeting was not found or was cancelled.'; end if;
  if m.host_id <> me then raise exception 'Only the host can start this meeting.'; end if;
  select live_lounge_maintenance, live_lounge_maintenance_message into locked, msg from public.platform_settings where id = true;
  if locked and not public.is_master_admin_user(me) then raise exception '%', msg; end if;

  select * into r from public.live_lounge_rooms where meeting_id = m.id and status = 'active' order by created_at desc limit 1;
  if not found then
    occ := coalesce(p_occurrence, (select min(o) from public.live_lounge_meeting_occurrences(m, now(), now() + interval '2 years') o), m.scheduled_for);
    r := public.live_lounge_make_room(m, occ, true);
    for i in select user_id from public.live_lounge_meeting_invitees where meeting_id = m.id loop
      perform public.notify_user(i.user_id, 'live_lounge_meeting', m.host_id, m.id::text, 'Started "' || m.title || '". Join now with Meeting ID ' || m.meeting_code || '.');
    end loop;
  else
    insert into public.live_lounge_room_participants (room_id, user_id, role, status) values (r.id, me, 'host', 'admitted')
    on conflict (room_id, user_id) do update set status = 'admitted', role = 'host', updated_at = now(), last_seen_at = now();
  end if;
  return jsonb_build_object('roomId', r.id, 'roomCode', r.room_code, 'channelName', r.channel_name, 'title', r.title, 'meetingId', m.id);
end;
$$;
revoke execute on function public.start_live_lounge_meeting(uuid, timestamptz) from public, anon;
grant execute on function public.start_live_lounge_meeting(uuid, timestamptz) to authenticated;

-- Everything a person must pass to enter a meeting's room (the host always may). Raises a plain-words error otherwise.
create or replace function public.live_lounge_check_meeting_entry(m public.live_lounge_meetings, r public.live_lounge_rooms, p_passcode text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_domain text; ok boolean; reg public.live_lounge_meeting_registrations; invited boolean;
begin
  if m.host_id = me or m.created_by = me then return; end if;
  if r.locked then raise exception 'The host has locked this meeting. Nobody can join right now.'; end if;
  if m.passcode is not null then
    if btrim(coalesce(p_passcode, '')) = '' then raise exception 'Enter the meeting passcode.'; end if;
    if lower(btrim(p_passcode)) <> lower(m.passcode) then raise exception 'That passcode is not right.'; end if;
  end if;
  invited := exists (select 1 from public.live_lounge_meeting_invitees i where i.meeting_id = m.id and i.user_id = me);
  select * into reg from public.live_lounge_meeting_registrations where meeting_id = m.id and user_id = me;
  if m.restrict_users or m.restrict_domains then
    ok := (m.restrict_users and (invited or reg.status = 'approved'));
    if not coalesce(ok, false) and m.restrict_domains then
      select lower(split_part(coalesce(pp.email, ''), '@', 2)) into v_domain from public.profile_private pp where pp.user_id = me;
      ok := coalesce(v_domain, '') <> '' and v_domain = any(m.allowed_domains);
    end if;
    if not coalesce(ok, false) then
      raise exception 'This meeting is only for the people the host chose.';
    end if;
  end if;
  if m.registration_required then
    if reg.user_id is null then raise exception 'Registration is required for this meeting. Register first, then join.'; end if;
    if reg.status = 'pending' then raise exception 'Your registration is waiting for the host to approve it.'; end if;
    if reg.status = 'declined' then raise exception 'The host declined your registration.'; end if;
  end if;
end;
$$;
revoke execute on function public.live_lounge_check_meeting_entry(public.live_lounge_meetings, public.live_lounge_rooms, text) from public, anon, authenticated;

-- Joining by code: the old room-code behaviour for ordinary rooms, plus every meeting rule for meetings (and a meeting that has not
-- been started yet can be entered early when the host allowed "join before host").
drop function if exists public.join_live_lounge_room_by_code(text);
create or replace function public.join_live_lounge_room_by_code(p_code text, p_passcode text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); v_code text := public.live_lounge_normalise_code(p_code); r public.live_lounge_rooms; m public.live_lounge_meetings;
  existing public.live_lounge_room_participants; locked boolean; msg text; is_host boolean; v_status text; nxt timestamptz;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if not public.has_live_lounge_access(me) then
    raise exception 'NOOB Live Lounge is a members-only feature. Unlock it to join a room.';
  end if;
  select live_lounge_maintenance, live_lounge_maintenance_message into locked, msg from public.platform_settings where id = true;
  if locked and not public.is_master_admin_user(me) then raise exception '%', msg; end if;

  select * into r from public.live_lounge_rooms where room_code = v_code and status = 'active' order by created_at desc limit 1;
  if not found then
    -- not live yet: is it a planned meeting?
    select * into m from public.live_lounge_meetings
    where meeting_code = v_code and status = 'scheduled'
    order by (select min(o) from public.live_lounge_meeting_occurrences(live_lounge_meetings, now(), now() + interval '2 years') o) nulls last limit 1;
    if not found then raise exception 'That room code is not valid, or the room has ended.'; end if;
    select min(o) into nxt from public.live_lounge_meeting_occurrences(m, now(), now() + interval '2 years') o;
    if nxt is null or (m.recurrence = 'none' and exists (select 1 from public.live_lounge_rooms x where x.meeting_id = m.id and x.status = 'ended')) then
      raise exception 'That room code is not valid, or the room has ended.';
    end if;
    if m.host_id = me then
      r := public.live_lounge_make_room(m, nxt, true);
    elsif m.join_before_host and not m.waiting_room and nxt <= now() + interval '15 minutes' then
      r := public.live_lounge_make_room(m, nxt, false);
    else
      raise exception 'This meeting has not started yet. It is planned for % (%). The host will start it.', to_char(nxt at time zone m.timezone, 'DD Mon YYYY, HH24:MI'), m.timezone;
    end if;
  end if;

  if r.meeting_id is not null then
    select * into m from public.live_lounge_meetings where id = r.meeting_id;
    perform public.live_lounge_check_meeting_entry(m, r, p_passcode);
  end if;
  is_host := r.host_id = me;
  -- no waiting room (a meeting that turned it off) lets people straight in
  v_status := case when is_host then 'admitted' when r.meeting_id is null then 'waiting' when not m.waiting_room then 'admitted' else 'waiting' end;

  select * into existing from public.live_lounge_room_participants where room_id = r.id and user_id = me;
  if found then
    if existing.status = 'removed' then raise exception 'The host removed you from this room.'; end if;
    if existing.status in ('left', 'waiting') or (v_status = 'admitted' and existing.status <> 'admitted') then
      update public.live_lounge_room_participants set status = v_status, updated_at = now(), last_seen_at = now() where room_id = r.id and user_id = me;
    end if;
  else
    insert into public.live_lounge_room_participants (room_id, user_id, role, status)
    values (r.id, me, case when is_host then 'host' else 'participant' end, v_status);
  end if;
  return jsonb_build_object('roomId', r.id, 'title', r.title, 'meetingId', r.meeting_id, 'status', v_status);
end;
$$;
revoke execute on function public.join_live_lounge_room_by_code(text, text) from public, anon;
grant execute on function public.join_live_lounge_room_by_code(text, text) to authenticated;

-- The host locks / unlocks the running meeting. (With "lock when everyone has arrived" it locks by itself once every invited person is in.)
create or replace function public.set_live_lounge_room_locked(p_room_id uuid, p_locked boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update public.live_lounge_rooms set locked = coalesce(p_locked, false) where id = p_room_id and host_id = auth.uid() and status = 'active';
  if not found then raise exception 'Only the host of a running meeting can do that.'; end if;
  return jsonb_build_object('success', true, 'locked', coalesce(p_locked, false));
end;
$$;
revoke execute on function public.set_live_lounge_room_locked(uuid, boolean) from public, anon;
grant execute on function public.set_live_lounge_room_locked(uuid, boolean) to authenticated;

create or replace function public.live_lounge_maybe_autolock(p_room_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.live_lounge_rooms; m public.live_lounge_meetings;
begin
  select * into r from public.live_lounge_rooms where id = p_room_id and status = 'active' and not locked and meeting_id is not null;
  if not found then return; end if;
  select * into m from public.live_lounge_meetings where id = r.meeting_id;
  if not m.auto_lock then return; end if;
  if exists (select 1 from public.live_lounge_meeting_invitees i where i.meeting_id = m.id)
     and not exists (select 1 from public.live_lounge_meeting_invitees i
                     where i.meeting_id = m.id and not exists (select 1 from public.live_lounge_room_participants p
                                                              where p.room_id = r.id and p.user_id = i.user_id and p.status = 'admitted')) then
    update public.live_lounge_rooms set locked = true where id = r.id;
  end if;
end;
$$;
revoke execute on function public.live_lounge_maybe_autolock(uuid) from public, anon, authenticated;

-- What a person in the room needs to know about the meeting's rules (and the waiting-room wording). Same fields as before, plus "settings".
create or replace function public.live_lounge_room_my_status(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); res jsonb; m public.live_lounge_meetings; rm public.live_lounge_rooms;
begin
  if me is null then return null; end if;
  update public.live_lounge_room_participants set last_seen_at = now()
  where room_id = p_room_id and user_id = me and status in ('waiting', 'admitted') and last_seen_at < now() - interval '20 seconds';
  select jsonb_build_object('status', p.status, 'role', p.role, 'roomStatus', r.status, 'title', r.title, 'roomCode', r.room_code, 'locked', r.locked)
  into res
  from public.live_lounge_room_participants p join public.live_lounge_rooms r on r.id = p.room_id
  where p.room_id = p_room_id and p.user_id = me;
  if res is null then return null; end if;
  select * into rm from public.live_lounge_rooms where id = p_room_id;
  if rm.meeting_id is not null then
    select * into m from public.live_lounge_meetings where id = rm.meeting_id;
    res := res || jsonb_build_object('meetingId', m.id, 'settings', jsonb_build_object(
      'chatEnabled', m.chat_enabled, 'hostOnlyScreenShare', m.host_only_screen_share,
      'waitingRoomTitle', m.waiting_room_title, 'waitingRoomMessage', m.waiting_room_message,
      'hasPasscode', m.passcode is not null,
      'passcode', case when rm.host_id = me or m.created_by = me then m.passcode else null end,
      'meetingCode', m.meeting_code, 'description', m.description, 'breakoutEnabled', m.breakout_enabled,
      'myBreakoutRoom', (select b->>'name' from jsonb_array_elements(m.breakout_rooms) b where (b->'members') ? me::text limit 1)));
  end if;
  return res;
end;
$$;
revoke execute on function public.live_lounge_room_my_status(uuid) from public;
grant execute on function public.live_lounge_room_my_status(uuid) to authenticated;

-- The list of people in the room (now volatile: it also locks a "lock when everyone has arrived" meeting).
create or replace function public.live_lounge_room_participants_list(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); am_host boolean;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  perform public.live_lounge_maybe_autolock(p_room_id);
  am_host := exists (select 1 from public.live_lounge_rooms where id = p_room_id and host_id = me);
  return jsonb_build_object(
    'admitted', coalesce((
      select jsonb_agg(jsonb_build_object('userId', pr.id, 'username', pr.username, 'displayName', pr.display_name,
                                          'avatar', pr.avatar, 'role', p.role) order by p.joined_at)
      from public.live_lounge_room_participants p join public.profiles pr on pr.id = p.user_id
      where p.room_id = p_room_id and p.status = 'admitted'
        and (p.role = 'host' or greatest(p.last_seen_at, p.updated_at) > now() - interval '45 seconds')), '[]'::jsonb),
    'waiting', case when am_host then coalesce((
      select jsonb_agg(jsonb_build_object('userId', pr.id, 'username', pr.username, 'displayName', pr.display_name, 'avatar', pr.avatar) order by p.joined_at)
      from public.live_lounge_room_participants p join public.profiles pr on pr.id = p.user_id
      where p.room_id = p_room_id and p.status = 'waiting'), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;
revoke execute on function public.live_lounge_room_participants_list(uuid) from public;
grant execute on function public.live_lounge_room_participants_list(uuid) to authenticated;

-- In-meeting chat can be switched off by the host when planning the meeting.
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
  if exists (select 1 from public.live_lounge_rooms r join public.live_lounge_meetings m on m.id = r.meeting_id where r.id = p_room_id and not m.chat_enabled) then
    raise exception 'The host turned chat off for this meeting.';
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

-- ================================================================================================== reminders
-- Every 5 minutes: tell the host and the invited people that a meeting starts soon (once per meeting time).
create or replace function public.send_live_lounge_meeting_reminders() returns integer
language plpgsql security definer set search_path = public as $$
declare m public.live_lounge_meetings; o timestamptz; n int := 0; u record;
begin
  for m in select * from public.live_lounge_meetings where status = 'scheduled' and reminder_minutes > 0 and not instant loop
    for o in select t from public.live_lounge_meeting_occurrences(m, now(), now() + make_interval(mins => m.reminder_minutes + 5)) t loop
      continue when o > now() + make_interval(mins => m.reminder_minutes);
      continue when o < now() - interval '1 minute';
      insert into public.live_lounge_meeting_reminders (meeting_id, occurrence_start) values (m.id, o) on conflict do nothing;
      continue when not found;
      for u in select m.host_id as user_id union select user_id from public.live_lounge_meeting_invitees where meeting_id = m.id loop
        perform public.notify_user(u.user_id, 'live_lounge_meeting', null, m.id::text,
          'Reminder: "' || m.title || '" starts at ' || to_char(o at time zone m.timezone, 'HH24:MI') || ' (' || m.timezone || ').');
        n := n + 1;
      end loop;
    end loop;
  end loop;
  return n;
end;
$$;
revoke execute on function public.send_live_lounge_meeting_reminders() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('noob-meeting-reminders', '*/5 * * * *', $job$ select public.send_live_lounge_meeting_reminders(); $job$);
  end if;
exception when others then
  raise notice 'Meeting reminders were not scheduled: %', sqlerrm;
end
$$;
