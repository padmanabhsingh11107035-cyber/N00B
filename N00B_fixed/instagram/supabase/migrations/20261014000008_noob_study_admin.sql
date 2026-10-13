-- NOOB STUDY, part 8: the administrator's control of the whole study space, the admission form, and what the administrator can see.
--  * one switch for the administrator: "on", "coming soon" or "off", and a switch for each part (tutor, weekly tests, rooms, library, practice, official sources, notepad);
--  * an admission form (name, class, board, school, city, optional phone and guardian, and a consent tick) with an admission number;
--  * for the administrator ONLY: counts and graphs, the list of admitted students, and one student's marks, study time and activity.
--    The administrator can NEVER read a student's tutor chats, pictures, notes, sketches or documents: no function here returns them.
-- Safe to run more than once.

-- ---------------------------------------------------------------- the switch
create table if not exists public.study_settings (
  id              boolean primary key default true check (id),
  mode            text not null default 'coming_soon' check (mode in ('off', 'coming_soon', 'on')),
  message         text not null default '' check (char_length(message) <= 200),
  admissions_open boolean not null default true,
  features        jsonb not null default '{"tutor":true,"tests":true,"rooms":true,"library":true,"practice":true,"research":true,"notepad":true}'::jsonb,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles(id) on delete set null
);
alter table public.study_settings enable row level security;
insert into public.study_settings (id) values (true) on conflict (id) do nothing;

-- what anybody (even before logging in) may know: is it open, coming soon, or off?
create or replace function public.study_public_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('mode', s.mode, 'message', s.message, 'admissionsOpen', s.admissions_open, 'features', s.features) from public.study_settings s where s.id;
$$;

create or replace function public.study_int_feature_on(p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (features->>p_key)::boolean from public.study_settings where id), true);
$$;

-- ---------------------------------------------------------------- admissions
create sequence if not exists public.study_admission_seq start 1000;

create table if not exists public.study_admissions (
  user_id       uuid primary key references public.study_profiles(user_id) on delete cascade,
  admission_no  text not null unique,
  full_name     text not null check (char_length(full_name) between 2 and 80),
  birth_year    smallint check (birth_year is null or birth_year between 1940 and 2100),
  level         text not null,
  class_year    text not null default '' check (char_length(class_year) <= 40),
  board         text not null default '' check (char_length(board) <= 80),
  institution   text not null default '' check (char_length(institution) <= 120),
  city          text not null default '' check (char_length(city) <= 80),
  state         text not null default '' check (char_length(state) <= 80),
  country       text not null default '' check (char_length(country) <= 80),
  phone         text not null default '' check (char_length(phone) <= 24),
  guardian_name text not null default '' check (char_length(guardian_name) <= 80),
  guardian_phone text not null default '' check (char_length(guardian_phone) <= 24),
  goal          text not null default '' check (char_length(goal) <= 200),
  heard_from    text not null default '' check (char_length(heard_from) <= 60),
  consent_at    timestamptz not null default now(),
  status        text not null default 'admitted' check (status in ('admitted', 'blocked')),
  admitted_at   timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists study_admissions_at_idx on public.study_admissions (admitted_at desc);
alter table public.study_admissions enable row level security;

create or replace function public.study_int_admission_json(a public.study_admissions) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object('admissionNo', a.admission_no, 'fullName', a.full_name, 'birthYear', a.birth_year, 'level', a.level, 'classYear', a.class_year, 'board', a.board,
    'institution', a.institution, 'city', a.city, 'state', a.state, 'country', a.country, 'phone', a.phone, 'guardianName', a.guardian_name, 'guardianPhone', a.guardian_phone,
    'goal', a.goal, 'heardFrom', a.heard_from, 'status', a.status, 'admittedAt', a.admitted_at);
$$;

-- Everything the study space needs to decide what to show first: its state, and this student's admission (if any).
-- (This one works even when the space is closed, so a student sees "coming soon" instead of an error.)
create or replace function public.study_gate_me() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); s public.study_settings; a public.study_admissions; adm boolean;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into s from public.study_settings where id;
  adm := public.is_master_admin_user(me);
  select * into a from public.study_admissions where user_id = me;
  return jsonb_build_object('mode', s.mode, 'message', s.message, 'admissionsOpen', s.admissions_open, 'features', s.features, 'isAdmin', adm,
    'admission', case when a.user_id is null then null else public.study_int_admission_json(a) end);
end;
$$;

-- The gate every student function passes through: closed or coming soon means closed for students (the administrator can always come in), and a student the
-- administrator has paused is told so.
create or replace function public.study_int_uid() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); m text;
begin
  if me is null or (select is_suspended from public.profiles where id = me) is not false then raise exception 'Please log in.' using errcode = '28000'; end if;
  select mode into m from public.study_settings where id;
  if coalesce(m, 'on') <> 'on' and not public.is_master_admin_user(me) then
    raise exception '%', case when m = 'off' then 'NOOB STUDY is switched off right now.' else 'NOOB STUDY is coming soon.' end using errcode = 'P0001';
  end if;
  if exists (select 1 from public.study_admissions where user_id = me and status = 'blocked') and not public.is_master_admin_user(me) then
    raise exception 'Your access to NOOB STUDY is paused. Please contact NOOB support.' using errcode = 'P0001';
  end if;
  return me;
end;
$$;

create or replace function public.study_admission_save(p_form jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.study_int_uid(); x jsonb := case when jsonb_typeof(p_form) = 'object' then p_form else '{}'::jsonb end;
  s public.study_settings; cur public.study_admissions; row public.study_admissions;
  nm text := left(btrim(coalesce(x->>'fullName', '')), 80); lvl text := btrim(coalesce(x->>'level', ''));
  ph text := left(btrim(coalesce(x->>'phone', '')), 24); gph text := left(btrim(coalesce(x->>'guardianPhone', '')), 24);
  byear smallint := case when coalesce(x->>'birthYear', '') ~ '^\d{4}$' then (x->>'birthYear')::smallint else null end;
begin
  select * into s from public.study_settings where id;
  select * into cur from public.study_admissions where user_id = me;
  if cur.user_id is null and not s.admissions_open then raise exception 'Admissions are closed for now. Please check back soon.'; end if;
  if char_length(nm) < 2 then raise exception 'Please write your full name.'; end if;
  if lvl not in ('class_6_8', 'class_9_10', 'class_11', 'class_12', 'diploma', 'undergraduate', 'postgraduate', 'other') then raise exception 'Please choose your class or level.'; end if;
  if ph <> '' and ph !~ '^[0-9+() -]{6,24}$' then raise exception 'Please check the phone number.'; end if;
  if gph <> '' and gph !~ '^[0-9+() -]{6,24}$' then raise exception 'Please check the guardian''s phone number.'; end if;
  if byear is not null and (byear < 1940 or byear > extract(year from now())::integer) then raise exception 'Please check the year of birth.'; end if;
  if cur.user_id is null and coalesce((x->>'consent')::boolean, false) is not true then raise exception 'Please tick the box to say you agree, to continue.'; end if;
  perform public.study_int_ensure_profile(me);
  perform 1 from public.study_profiles where user_id = me for update;
  if cur.user_id is null then
    insert into public.study_admissions (user_id, admission_no, full_name, birth_year, level, class_year, board, institution, city, state, country, phone, guardian_name, guardian_phone, goal, heard_from)
    values (me, 'NS' || to_char(now(), 'YY') || lpad(nextval('public.study_admission_seq')::text, 5, '0'), nm, byear, lvl, left(btrim(coalesce(x->>'classYear', '')), 40), left(btrim(coalesce(x->>'board', '')), 80),
            left(btrim(coalesce(x->>'institution', '')), 120), left(btrim(coalesce(x->>'city', '')), 80), left(btrim(coalesce(x->>'state', '')), 80), left(btrim(coalesce(x->>'country', '')), 80),
            ph, left(btrim(coalesce(x->>'guardianName', '')), 80), gph, left(btrim(coalesce(x->>'goal', '')), 200), left(btrim(coalesce(x->>'heardFrom', '')), 60))
    returning * into row;
  else
    update public.study_admissions set full_name = nm, birth_year = byear, level = lvl, class_year = left(btrim(coalesce(x->>'classYear', '')), 40), board = left(btrim(coalesce(x->>'board', '')), 80),
      institution = left(btrim(coalesce(x->>'institution', '')), 120), city = left(btrim(coalesce(x->>'city', '')), 80), state = left(btrim(coalesce(x->>'state', '')), 80),
      country = left(btrim(coalesce(x->>'country', '')), 80), phone = ph, guardian_name = left(btrim(coalesce(x->>'guardianName', '')), 80), guardian_phone = gph,
      goal = left(btrim(coalesce(x->>'goal', '')), 200), heard_from = left(btrim(coalesce(x->>'heardFrom', '')), 60), updated_at = now()
    where user_id = me returning * into row;
  end if;
  -- the study profile starts from what the form says (the student can change it later in their settings)
  update public.study_profiles set display_name = left(nm, 60), level = lvl, board = row.board, institution = row.institution, class_year = row.class_year,
    country = case when row.country <> '' then row.country else country end, updated_at = now() where user_id = me;
  return public.study_int_admission_json(row);
end;
$$;

-- ---------------------------------------------------------------- what the AI function asks before it spends anything
create or replace function public.study_svc_gate(p_user uuid, p_feature text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.study_settings; adm boolean := public.is_master_admin_user(p_user); a public.study_admissions;
begin
  if adm then return jsonb_build_object('allowed', true); end if;
  select * into s from public.study_settings where id;
  if s.mode <> 'on' then return jsonb_build_object('allowed', false, 'reason', s.mode, 'message', case when s.mode = 'off' then 'NOOB STUDY is switched off right now.' else 'NOOB STUDY is coming soon.' end); end if;
  if p_feature is not null and coalesce((s.features->>p_feature)::boolean, true) is not true then
    return jsonb_build_object('allowed', false, 'reason', 'feature_off', 'message', 'This part of NOOB STUDY is switched off for now.');
  end if;
  select * into a from public.study_admissions where user_id = p_user;
  if a.user_id is null then return jsonb_build_object('allowed', false, 'reason', 'no_admission', 'message', 'Please complete your admission form first.'); end if;
  if a.status = 'blocked' then return jsonb_build_object('allowed', false, 'reason', 'blocked', 'message', 'Your access to NOOB STUDY is paused. Please contact NOOB support.'); end if;
  return jsonb_build_object('allowed', true);
end;
$$;

-- ---------------------------------------------------------------- weekly tests (their functions are in the next part; the table is here so the administrator's counts can read it)
-- Only the marks, the name and the time are kept once a test is taken: the questions are removed when it is handed in (or when the week ends).
create table if not exists public.study_tests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.study_profiles(user_id) on delete cascade,
  subject_id   uuid references public.study_subjects(id) on delete set null,
  subject_name text not null check (char_length(subject_name) between 1 and 60),
  week_key     text not null check (week_key ~ '^[0-9]{4}-W[0-9]{2}$'),
  name         text not null check (char_length(name) between 1 and 140),
  status       text not null default 'ready' check (status in ('ready', 'done', 'expired')),
  questions    jsonb,
  score        integer check (score is null or score >= 0),
  max_score    integer check (max_score is null or max_score > 0),
  duration_sec integer not null default 0 check (duration_sec between 0 and 86400),
  created_at   timestamptz not null default now(),
  taken_at     timestamptz,
  unique (user_id, subject_name, week_key)
);
create index if not exists study_tests_user_idx on public.study_tests (user_id, taken_at desc);
alter table public.study_tests enable row level security;

-- ---------------------------------------------------------------- the administrator
create or replace function public.admin_study_settings_get() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.study_settings;
begin
  perform public.require_master_admin('Only the main NOOB administrator can see this.');
  select * into s from public.study_settings where id;
  return jsonb_build_object('mode', s.mode, 'message', s.message, 'admissionsOpen', s.admissions_open, 'features', s.features, 'updatedAt', s.updated_at,
    'updatedBy', (select username from public.profiles where id = s.updated_by));
end;
$$;

create or replace function public.admin_study_settings_save(p_mode text, p_message text, p_admissions_open boolean, p_features jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid; f jsonb := '{}'::jsonb; k text; keys text[] := array['tutor', 'tests', 'rooms', 'library', 'practice', 'research', 'notepad'];
begin
  me := public.require_master_admin('Only the main NOOB administrator can change this.');
  if p_mode not in ('off', 'coming_soon', 'on') then raise exception 'Please choose on, coming soon or off.'; end if;
  foreach k in array keys loop f := f || jsonb_build_object(k, coalesce((p_features->>k)::boolean, true)); end loop;
  update public.study_settings set mode = p_mode, message = left(btrim(coalesce(p_message, '')), 200), admissions_open = coalesce(p_admissions_open, true), features = f, updated_at = now(), updated_by = me where id;
  perform public.log_admin_action('study_settings_changed', null, jsonb_build_object('mode', p_mode, 'admissionsOpen', coalesce(p_admissions_open, true)));
  return public.admin_study_settings_get();
end;
$$;

-- counts and the graphs' data. No chats, pictures or notes are read to make any of it.
create or replace function public.admin_study_overview(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d integer := greatest(7, least(coalesce(p_days, 30), 90)); since timestamptz;
begin
  perform public.require_master_admin('Only the main NOOB administrator can see this.');
  since := date_trunc('day', now()) - (d - 1) * interval '1 day';
  return jsonb_build_object(
    'days', d,
    'totals', jsonb_build_object(
      'admissions', (select count(*) from public.study_admissions),
      'blocked', (select count(*) from public.study_admissions where status = 'blocked'),
      'admissionsToday', (select count(*) from public.study_admissions where admitted_at >= date_trunc('day', now())),
      'admissions7', (select count(*) from public.study_admissions where admitted_at >= now() - interval '7 days'),
      'onboarded', (select count(*) from public.study_profiles where onboarding_done),
      'active7', (select count(distinct user_id) from public.study_events where created_at >= now() - interval '7 days'),
      'minutes7', (select coalesce(sum(minutes), 0) from public.study_events where kind in ('focus_done', 'session_done') and created_at >= now() - interval '7 days'),
      'minutes30', (select coalesce(sum(minutes), 0) from public.study_events where kind in ('focus_done', 'session_done') and created_at >= now() - interval '30 days'),
      'tasksDone7', (select count(*) from public.study_events where kind = 'task_done' and created_at >= now() - interval '7 days'),
      'quizzes7', (select count(*) from public.study_events where kind = 'practice' and created_at >= now() - interval '7 days'),
      'tutorQuestions7', (select coalesce(sum(used), 0) from public.study_ai_usage where kind in ('chat', 'vision') and day >= current_date - 6),
      'testsTaken', (select count(*) from public.study_tests where status = 'done'),
      'testsAvg', (select round(avg(score::numeric / nullif(max_score, 0) * 100)) from public.study_tests where status = 'done'),
      'rooms', (select count(*) from public.study_rooms),
      'documents', (select count(*) from public.study_materials),
      'decks', (select count(*) from public.study_decks),
      'openMistakes', (select count(*) from public.study_mistakes where not resolved)),
    'series', jsonb_build_object(
      'admissions', (select coalesce(jsonb_agg(jsonb_build_object('d', g.d::date, 'n', coalesce(c.n, 0)) order by g.d), '[]'::jsonb)
        from generate_series(since, date_trunc('day', now()), interval '1 day') g(d)
        left join (select date_trunc('day', admitted_at) as dd, count(*) as n from public.study_admissions where admitted_at >= since group by 1) c on c.dd = g.d),
      'active', (select coalesce(jsonb_agg(jsonb_build_object('d', g.d::date, 'n', coalesce(c.n, 0)) order by g.d), '[]'::jsonb)
        from generate_series(since, date_trunc('day', now()), interval '1 day') g(d)
        left join (select date_trunc('day', created_at) as dd, count(distinct user_id) as n from public.study_events where created_at >= since group by 1) c on c.dd = g.d),
      'minutes', (select coalesce(jsonb_agg(jsonb_build_object('d', g.d::date, 'n', coalesce(c.n, 0)) order by g.d), '[]'::jsonb)
        from generate_series(since, date_trunc('day', now()), interval '1 day') g(d)
        left join (select date_trunc('day', created_at) as dd, sum(minutes) as n from public.study_events where kind in ('focus_done', 'session_done') and created_at >= since group by 1) c on c.dd = g.d),
      'questions', (select coalesce(jsonb_agg(jsonb_build_object('d', g.d::date, 'n', coalesce(c.n, 0)) order by g.d), '[]'::jsonb)
        from generate_series(since::date, current_date, interval '1 day') g(d)
        left join (select day as dd, sum(used) as n from public.study_ai_usage where kind in ('chat', 'vision') and day >= since::date group by 1) c on c.dd = g.d::date)),
    'tests', (select coalesce(jsonb_agg(jsonb_build_object('d', g.d::date, 'n', coalesce(c.n, 0)) order by g.d), '[]'::jsonb)
        from generate_series(since, date_trunc('day', now()), interval '1 day') g(d)
        left join (select date_trunc('day', taken_at) as dd, count(*) as n from public.study_tests where status = 'done' and taken_at >= since group by 1) c on c.dd = g.d),
    'scoreHistogram', (select coalesce(jsonb_agg(jsonb_build_object('label', (b * 10) || '-' || (case when b = 9 then 100 else b * 10 + 9 end), 'n', coalesce(c.n, 0)) order by b), '[]'::jsonb)
        from generate_series(0, 9) b left join (select least(9, floor(score::numeric / nullif(max_score, 0) * 10)::integer) as bin, count(*) as n from public.study_tests where status = 'done' group by 1) c on c.bin = b),
    'byLevel', (select coalesce(jsonb_agg(jsonb_build_object('label', level, 'n', n) order by n desc), '[]'::jsonb) from (select level, count(*) as n from public.study_admissions group by 1) x),
    'byBoard', (select coalesce(jsonb_agg(jsonb_build_object('label', board, 'n', n) order by n desc), '[]'::jsonb) from (select board, count(*) as n from public.study_admissions where board <> '' group by 1 order by 2 desc limit 8) x),
    'bySubject', (select coalesce(jsonb_agg(jsonb_build_object('label', name, 'n', n) order by n desc), '[]'::jsonb)
      from (select s.name, sum(e.minutes) as n from public.study_events e join public.study_subjects s on s.id = e.subject_id
            where e.kind in ('focus_done', 'session_done') and e.created_at >= since and s.kind = 'catalogue' group by s.name order by 2 desc limit 10) x),
    'aiByKind', (select coalesce(jsonb_agg(jsonb_build_object('label', kind, 'n', n) order by n desc), '[]'::jsonb) from (select kind, sum(used) as n from public.study_ai_usage where day >= since::date group by 1) x)
  );
end;
$$;

create or replace function public.admin_study_students(p_search text default '', p_limit integer default 30, p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare q text := '%' || lower(btrim(coalesce(p_search, ''))) || '%'; lim integer := greatest(1, least(coalesce(p_limit, 30), 100)); off integer := greatest(0, coalesce(p_offset, 0)); total bigint;
begin
  perform public.require_master_admin('Only the main NOOB administrator can see this.');
  select count(*) into total from public.study_admissions a join public.profiles p on p.id = a.user_id
    where lower(btrim(coalesce(p_search, ''))) = '' or lower(a.full_name) like q or lower(p.username) like q or lower(a.admission_no) like q or lower(a.institution) like q or lower(a.city) like q;
  return jsonb_build_object('total', total, 'students', coalesce((
    select jsonb_agg(row order by (row->>'admittedAt') desc) from (
      select jsonb_build_object('userId', a.user_id, 'username', p.username, 'admissionNo', a.admission_no, 'fullName', a.full_name, 'level', a.level, 'board', a.board, 'institution', a.institution,
        'city', a.city, 'status', a.status, 'admittedAt', a.admitted_at, 'onboardingDone', coalesce(sp.onboarding_done, false),
        'minutes7', (select coalesce(sum(e.minutes), 0) from public.study_events e where e.user_id = a.user_id and e.kind in ('focus_done', 'session_done') and e.created_at >= now() - interval '7 days'),
        'lastActive', (select max(e.created_at) from public.study_events e where e.user_id = a.user_id),
        'testsTaken', (select count(*) from public.study_tests t where t.user_id = a.user_id and t.status = 'done'),
        'avgScore', (select round(avg(t.score::numeric / nullif(t.max_score, 0) * 100)) from public.study_tests t where t.user_id = a.user_id and t.status = 'done')) as row
      from public.study_admissions a join public.profiles p on p.id = a.user_id left join public.study_profiles sp on sp.user_id = a.user_id
      where lower(btrim(coalesce(p_search, ''))) = '' or lower(a.full_name) like q or lower(p.username) like q or lower(a.admission_no) like q or lower(a.institution) like q or lower(a.city) like q
      order by a.admitted_at desc limit lim offset off) r), '[]'::jsonb));
end;
$$;

create or replace function public.admin_study_student(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.study_admissions; sp public.study_profiles; since timestamptz := date_trunc('day', now()) - interval '29 days';
begin
  perform public.require_master_admin('Only the main NOOB administrator can see this.');
  select * into a from public.study_admissions where user_id = p_user;
  if not found then raise exception 'That student has no admission.'; end if;
  select * into sp from public.study_profiles where user_id = p_user;
  perform public.log_admin_action('study_student_viewed', p_user, '{}'::jsonb);
  return jsonb_build_object(
    'admission', public.study_int_admission_json(a),
    'user', (select jsonb_build_object('userId', p.id, 'username', p.username, 'displayName', p.display_name, 'email', (select email from public.profile_private where user_id = p.id)) from public.profiles p where p.id = p_user),
    'profile', jsonb_build_object('language', sp.language, 'timezone', sp.timezone, 'stream', sp.stream, 'onboardingDone', sp.onboarding_done, 'goals', sp.goals, 'habits', sp.habits),
    'subjects', (select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'kind', s.kind) order by s.position), '[]'::jsonb) from public.study_subjects s where s.user_id = p_user and s.archived_at is null),
    'counts', jsonb_build_object(
      'tasksOpen', (select count(*) from public.study_tasks where user_id = p_user and status <> 'done'),
      'tasksDone', (select count(*) from public.study_tasks where user_id = p_user and status = 'done'),
      'examsUpcoming', (select count(*) from public.study_exams where user_id = p_user and exam_at >= now()),
      'sessionsDone', (select count(*) from public.study_sessions where user_id = p_user and status = 'done'),
      'documents', (select count(*) from public.study_materials where user_id = p_user),
      'decks', (select count(*) from public.study_decks where user_id = p_user),
      'quizzes', (select count(*) from public.study_quizzes where user_id = p_user),
      'openMistakes', (select count(*) from public.study_mistakes where user_id = p_user and not resolved),
      'rooms', (select count(*) from public.study_room_members where user_id = p_user),
      'aiQuestions30', (select coalesce(sum(used), 0) from public.study_ai_usage where user_id = p_user and kind in ('chat', 'vision') and day >= current_date - 29)),
    'minutesByDay', (select coalesce(jsonb_agg(jsonb_build_object('d', g.d::date, 'n', coalesce(c.n, 0)) order by g.d), '[]'::jsonb)
      from generate_series(since, date_trunc('day', now()), interval '1 day') g(d)
      left join (select date_trunc('day', created_at) as dd, sum(minutes) as n from public.study_events where user_id = p_user and kind in ('focus_done', 'session_done') and created_at >= since group by 1) c on c.dd = g.d),
    'minutesBySubject', (select coalesce(jsonb_agg(jsonb_build_object('label', name, 'n', n) order by n desc), '[]'::jsonb)
      from (select s.name, sum(e.minutes) as n from public.study_events e join public.study_subjects s on s.id = e.subject_id
            where e.user_id = p_user and e.kind in ('focus_done', 'session_done') and e.created_at >= since group by s.name order by 2 desc limit 8) x),
    'tests', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'subject', subject_name, 'score', score, 'max', max_score, 'at', taken_at) order by taken_at desc), '[]'::jsonb) from (select * from public.study_tests where user_id = p_user and status = 'done' order by taken_at desc limit 30) t),
    'quizzes', (select coalesce(jsonb_agg(jsonb_build_object('title', z.title, 'percent', round(t.score / nullif(t.max_score, 0) * 100), 'at', t.created_at) order by t.created_at desc), '[]'::jsonb)
      from (select * from public.study_quiz_attempts where user_id = p_user order by created_at desc limit 20) t join public.study_quizzes z on z.id = t.quiz_id),
    'activity', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'minutes', minutes, 'at', created_at) order by created_at desc), '[]'::jsonb)
      from (select kind, minutes, created_at from public.study_events where user_id = p_user order by created_at desc limit 40) x)
  );
end;
$$;

create or replace function public.admin_study_set_student_status(p_user uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_master_admin('Only the main NOOB administrator can change this.');
  if p_status not in ('admitted', 'blocked') then raise exception 'Please choose admitted or blocked.'; end if;
  update public.study_admissions set status = p_status, updated_at = now() where user_id = p_user;
  if not found then raise exception 'That student has no admission.'; end if;
  perform public.log_admin_action(case when p_status = 'blocked' then 'study_student_blocked' else 'study_student_restored' end, p_user, '{}'::jsonb);
  return jsonb_build_object('success', true, 'status', p_status);
end;
$$;

-- ---------------------------------------------------------------- who may call what
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig, p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'study\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    if r.proname like 'study\_svc\_%' then execute format('grant execute on function %s to service_role', r.sig);
    elsif r.proname = 'study_public_status' then execute format('grant execute on function %s to anon, authenticated', r.sig);
    elsif r.proname not like 'study\_int\_%' then execute format('grant execute on function %s to authenticated', r.sig);
    end if;
  end loop;
  for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'admin\_study\_%' loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end;
$$;
