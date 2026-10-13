-- NOOB STUDY, part 1: the student's profile, subjects (one to six), tasks and homework, exams, planned study sessions, focus sessions, a small
-- activity log, and the dashboard that reads them. Everything is reached ONLY through the functions below (row level security on, no policies):
-- every function works for the signed-in person alone, so nobody can read or change another student's records by guessing an id.
--
-- Functions named study_int_* are internal helpers (nobody can call them from the app); the rest are what the app calls.

-- ---------------------------------------------------------------- helpers
create or replace function public.study_int_uid() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or (select is_suspended from public.profiles where id = me) is not false then raise exception 'Please log in.' using errcode = '28000'; end if;
  return me;
end;
$$;

-- Keeps only the listed keys of a small settings object, and only plain values (text, numbers, true/false, lists); refuses anything huge.
create or replace function public.study_int_pick(p_obj jsonb, p_keys text[]) returns jsonb
language plpgsql immutable set search_path = public as $$
declare out jsonb;
begin
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into out
  from jsonb_each(case when jsonb_typeof(p_obj) = 'object' then p_obj else '{}'::jsonb end) as e
  where e.key = any(p_keys) and jsonb_typeof(e.value) in ('string', 'number', 'boolean', 'array');
  if length(out::text) > 6000 then raise exception 'That is too much text for one section. Please shorten it.'; end if;
  return out;
end;
$$;

-- ---------------------------------------------------------------- tables
create table if not exists public.study_profiles (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  display_name     text not null default '',
  country          text not null default '',
  language         text not null default 'en',
  timezone         text not null default 'Asia/Kolkata',
  level            text,
  institution      text not null default '',
  board            text not null default '',
  class_year       text not null default '',
  stream           text not null default '',
  course           text not null default '',
  specialization   text not null default '',
  goals            jsonb not null default '{}'::jsonb,
  habits           jsonb not null default '{}'::jsonb,
  tutor            jsonb not null default '{}'::jsonb,
  privacy          jsonb not null default '{}'::jsonb,
  onboarding_step  integer not null default 0 check (onboarding_step between 0 and 20),
  onboarding_done  boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.study_profiles enable row level security;

create table if not exists public.study_subjects (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  kind         text not null default 'catalogue' check (kind in ('catalogue', 'custom')),
  position     integer not null default 0,
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);
create unique index if not exists study_subjects_active_name_uidx on public.study_subjects (user_id, lower(name)) where archived_at is null;
create index if not exists study_subjects_user_idx on public.study_subjects (user_id, archived_at);
alter table public.study_subjects enable row level security;

-- never more than six active subjects, whatever calls this (the functions also check, with a friendlier message)
create or replace function public.study_int_subjects_limit() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.archived_at is null and (select count(*) from public.study_subjects where user_id = new.user_id and archived_at is null and id is distinct from new.id) >= 6 then
    raise exception 'You can choose at most 6 subjects.';
  end if;
  return new;
end;
$$;
drop trigger if exists study_subjects_limit on public.study_subjects;
create trigger study_subjects_limit before insert or update of archived_at on public.study_subjects for each row execute function public.study_int_subjects_limit();

create table if not exists public.study_tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  client_ref    uuid,
  subject_id    uuid references public.study_subjects(id) on delete set null,
  title         text not null check (char_length(btrim(title)) between 1 and 140),
  description   text not null default '' check (char_length(description) <= 1000),
  kind          text not null default 'task' check (kind in ('task', 'homework', 'revision', 'practice', 'exam_prep')),
  due_at        timestamptz,
  priority      text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  est_minutes   integer check (est_minutes is null or est_minutes between 5 and 600),
  status        text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  completed_at  timestamptz,
  attachment    text check (attachment is null or (char_length(attachment) <= 400 and attachment not like 'data:%')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists study_tasks_client_ref_uidx on public.study_tasks (user_id, client_ref) where client_ref is not null;
create index if not exists study_tasks_user_idx on public.study_tasks (user_id, status, due_at);
alter table public.study_tasks enable row level security;

create table if not exists public.study_exams (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  client_ref  uuid,
  subject_id  uuid references public.study_subjects(id) on delete set null,
  title       text not null check (char_length(btrim(title)) between 1 and 140),
  exam_at     timestamptz not null,
  notes       text not null default '' check (char_length(notes) <= 600),
  created_at  timestamptz not null default now()
);
create unique index if not exists study_exams_client_ref_uidx on public.study_exams (user_id, client_ref) where client_ref is not null;
create index if not exists study_exams_user_idx on public.study_exams (user_id, exam_at);
alter table public.study_exams enable row level security;

create table if not exists public.study_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  client_ref    uuid,
  subject_id    uuid references public.study_subjects(id) on delete set null,
  topic         text not null default '' check (char_length(topic) <= 140),
  starts_at     timestamptz not null,
  duration_min  integer not null check (duration_min between 5 and 240),
  objective     text not null default '' check (char_length(objective) <= 300),
  activity      text not null default 'study' check (activity in ('study', 'revise', 'practice', 'homework', 'review_mistakes', 'read', 'flashcards')),
  priority      text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status        text not null default 'planned' check (status in ('planned', 'done', 'skipped')),
  source        text not null default 'manual' check (source in ('manual', 'ai')),
  why           text not null default '' check (char_length(why) <= 400),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists study_sessions_client_ref_uidx on public.study_sessions (user_id, client_ref) where client_ref is not null;
create index if not exists study_sessions_user_idx on public.study_sessions (user_id, starts_at);
alter table public.study_sessions enable row level security;

create table if not exists public.study_focus_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  subject_id     uuid references public.study_subjects(id) on delete set null,
  kind           text not null default 'focus' check (kind in ('focus', 'break')),
  planned_min    integer not null check (planned_min between 1 and 180),
  focus_seconds  integer not null default 0 check (focus_seconds >= 0),
  status         text not null default 'running' check (status in ('running', 'completed', 'interrupted')),
  started_at     timestamptz not null default now(),
  ended_at       timestamptz
);
create index if not exists study_focus_user_idx on public.study_focus_sessions (user_id, started_at desc);
alter table public.study_focus_sessions enable row level security;

-- What was actually done, kept small on purpose (no clicks, no typing, nothing else): the dashboard and the progress page read this.
create table if not exists public.study_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('focus_done', 'task_done', 'session_done', 'practice', 'review', 'material', 'plan_change')),
  subject_id  uuid references public.study_subjects(id) on delete set null,
  minutes     integer not null default 0 check (minutes between 0 and 600),
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists study_events_user_idx on public.study_events (user_id, created_at desc);
alter table public.study_events enable row level security;

-- Honours the student's choice: with "Remember what I study" switched off, nothing is recorded.
create or replace function public.study_int_log(p_user uuid, p_kind text, p_subject uuid, p_minutes integer default 0, p_meta jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce((select (privacy->>'trackActivity')::boolean from public.study_profiles where user_id = p_user), true) is false then return; end if;
  insert into public.study_events (user_id, kind, subject_id, minutes, meta) values (p_user, p_kind, p_subject, greatest(0, least(coalesce(p_minutes, 0), 600)), coalesce(p_meta, '{}'::jsonb));
end;
$$;

-- a subject id must belong to the person (or be empty)
create or replace function public.study_int_own_subject(p_user uuid, p_subject uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if p_subject is null then return null; end if;
  if not exists (select 1 from public.study_subjects where id = p_subject and user_id = p_user) then raise exception 'That subject is not yours.'; end if;
  return p_subject;
end;
$$;

-- ---------------------------------------------------------------- profile and subjects
create or replace function public.study_int_subject_json(s public.study_subjects) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object('id', s.id, 'name', s.name, 'kind', s.kind, 'position', s.position);
$$;

create or replace function public.study_int_me(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pf public.study_profiles;
begin
  select * into pf from public.study_profiles where user_id = p_user;
  return jsonb_build_object(
    'profile', case when pf.user_id is null then null else jsonb_build_object(
      'displayName', pf.display_name, 'country', pf.country, 'language', pf.language, 'timezone', pf.timezone, 'level', pf.level,
      'institution', pf.institution, 'board', pf.board, 'classYear', pf.class_year, 'stream', pf.stream, 'course', pf.course, 'specialization', pf.specialization,
      'goals', pf.goals, 'habits', pf.habits, 'tutor', pf.tutor, 'privacy', pf.privacy,
      'onboardingStep', pf.onboarding_step, 'onboardingDone', pf.onboarding_done) end,
    'subjects', coalesce((select jsonb_agg(public.study_int_subject_json(s) order by s.position, s.created_at) from public.study_subjects s where s.user_id = p_user and s.archived_at is null), '[]'::jsonb)
  );
end;
$$;

create or replace function public.study_me() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  return public.study_int_me(public.study_int_uid());
end;
$$;

-- Saves what the person has filled in so far (any part of it), and which step they are on: a half-finished form can be resumed later.
create or replace function public.study_save_profile(p_patch jsonb, p_step integer default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.study_int_uid();
  patch jsonb := case when jsonb_typeof(p_patch) = 'object' then p_patch else '{}'::jsonb end;
  tz text;
  lang text;
  lvl text;
begin
  insert into public.study_profiles (user_id, display_name)
  select me, left(coalesce(nullif(btrim(display_name), ''), username), 60) from public.profiles where id = me
  on conflict (user_id) do nothing;
  perform 1 from public.study_profiles where user_id = me for update;

  if patch ? 'timezone' then
    tz := btrim(coalesce(patch->>'timezone', ''));
    if not exists (select 1 from pg_timezone_names where name = tz) then raise exception 'That time zone is not recognised.'; end if;
  end if;
  if patch ? 'language' then
    lang := lower(btrim(coalesce(patch->>'language', '')));
    if lang !~ '^[a-z]{2,3}(-[a-z]{2,4})?$' then raise exception 'That language is not recognised.'; end if;
  end if;
  if patch ? 'level' then
    lvl := btrim(coalesce(patch->>'level', ''));
    if lvl not in ('class_6_8', 'class_9_10', 'class_11', 'class_12', 'diploma', 'undergraduate', 'postgraduate', 'other') then raise exception 'Please choose a valid education level.'; end if;
  end if;

  update public.study_profiles set
    display_name   = case when patch ? 'displayName'    then left(btrim(coalesce(patch->>'displayName', '')), 60) else display_name end,
    country        = case when patch ? 'country'        then left(btrim(coalesce(patch->>'country', '')), 80) else country end,
    language       = case when patch ? 'language'       then lang else language end,
    timezone       = case when patch ? 'timezone'       then tz else timezone end,
    level          = case when patch ? 'level'          then lvl else level end,
    institution    = case when patch ? 'institution'    then left(btrim(coalesce(patch->>'institution', '')), 120) else institution end,
    board          = case when patch ? 'board'          then left(btrim(coalesce(patch->>'board', '')), 80) else board end,
    class_year     = case when patch ? 'classYear'      then left(btrim(coalesce(patch->>'classYear', '')), 40) else class_year end,
    stream         = case when patch ? 'stream'         then left(btrim(coalesce(patch->>'stream', '')), 60) else stream end,
    course         = case when patch ? 'course'         then left(btrim(coalesce(patch->>'course', '')), 120) else course end,
    specialization = case when patch ? 'specialization' then left(btrim(coalesce(patch->>'specialization', '')), 120) else specialization end,
    goals   = case when patch ? 'goals'   then public.study_int_pick(patch->'goals',   array['mainGoals','career','exam','targets','difficultTopics','strongSubjects','beyondSyllabus','skills','biggestProblem']) else goals end,
    habits  = case when patch ? 'habits'  then public.study_int_pick(patch->'habits',  array['studyTimes','dailyMinutes','daysPerWeek','sessionMinutes','partOfDay','learningStyles','commitments','examNote']) else habits end,
    tutor   = case when patch ? 'tutor'   then public.study_int_pick(patch->'tutor',   array['name','language','style','length','level','examples','mode','accessibility','reminders','voice','teachMode']) else tutor end,
    privacy = case when patch ? 'privacy' then public.study_int_pick(patch->'privacy', array['recommendations','trackActivity','useHistory']) else privacy end,
    onboarding_step = coalesce(greatest(0, least(p_step, 20)), onboarding_step),
    updated_at = now()
  where user_id = me;
  return public.study_int_me(me);
end;
$$;

-- Replaces the person's subjects with exactly this list (one to six). A subject taken out is archived, not erased, so their tasks, notes and
-- history stay; choosing it again brings it back.
create or replace function public.study_set_subjects(p_subjects jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.study_int_uid();
  item jsonb; nm text; kd text; pos integer := 0;
  names text[] := '{}'; kinds text[] := '{}';
  existing public.study_subjects;
begin
  if jsonb_typeof(p_subjects) is distinct from 'array' then raise exception 'Please choose your subjects.'; end if;
  for item in select * from jsonb_array_elements(p_subjects) loop
    nm := btrim(coalesce(case when jsonb_typeof(item) = 'string' then item #>> '{}' else item->>'name' end, ''));
    kd := case when jsonb_typeof(item) = 'object' and item->>'kind' = 'custom' then 'custom' else 'catalogue' end;
    if nm = '' then continue; end if;
    if char_length(nm) > 60 then raise exception 'A subject name can be at most 60 characters.'; end if;
    if lower(nm) = any (select lower(x) from unnest(names) as x) then continue; end if;
    names := names || nm; kinds := kinds || kd;
  end loop;
  if coalesce(array_length(names, 1), 0) < 1 then raise exception 'Please choose at least 1 subject.'; end if;
  if array_length(names, 1) > 6 then raise exception 'You can choose at most 6 subjects.'; end if;

  insert into public.study_profiles (user_id, display_name)
  select me, left(coalesce(nullif(btrim(display_name), ''), username), 60) from public.profiles where id = me
  on conflict (user_id) do nothing;
  perform 1 from public.study_profiles where user_id = me for update;   -- one change at a time per person

  update public.study_subjects set archived_at = now()
  where user_id = me and archived_at is null and lower(name) <> all (select lower(x) from unnest(names) as x);

  for i in 1..array_length(names, 1) loop
    pos := i;
    select * into existing from public.study_subjects where user_id = me and lower(name) = lower(names[i]) order by (archived_at is null) desc, created_at limit 1;
    if existing.id is null then
      insert into public.study_subjects (user_id, name, kind, position) values (me, names[i], kinds[i], pos);
    else
      update public.study_subjects set archived_at = null, position = pos, name = names[i], kind = kinds[i] where id = existing.id;
    end if;
  end loop;
  return public.study_int_me(me);
end;
$$;

create or replace function public.study_complete_onboarding() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); pf public.study_profiles;
begin
  select * into pf from public.study_profiles where user_id = me for update;
  if not found then raise exception 'Please fill in the first steps first.'; end if;
  if pf.level is null then raise exception 'Please choose your education level.'; end if;
  if (select count(*) from public.study_subjects where user_id = me and archived_at is null) < 1 then raise exception 'Please choose at least 1 subject.'; end if;
  update public.study_profiles set onboarding_done = true, onboarding_step = 7, updated_at = now() where user_id = me;
  return public.study_int_me(me);
end;
$$;

-- ---------------------------------------------------------------- tasks and homework
create or replace function public.study_int_task_json(t public.study_tasks) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object('id', t.id, 'subjectId', t.subject_id, 'title', t.title, 'description', t.description, 'kind', t.kind, 'dueAt', t.due_at,
    'priority', t.priority, 'estMinutes', t.est_minutes, 'status', t.status, 'completedAt', t.completed_at, 'attachment', t.attachment,
    'createdAt', t.created_at, 'updatedAt', t.updated_at);
$$;

-- Adds a task (with "clientRef": the same tap twice never makes two) or changes one (with "id").
create or replace function public.study_task_save(p_task jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.study_int_uid();
  t jsonb := case when jsonb_typeof(p_task) = 'object' then p_task else '{}'::jsonb end;
  tid uuid; cref uuid; row public.study_tasks;
  ttl text; subj uuid; est integer; prio text; kd text; due timestamptz; st text;
begin
  tid := nullif(t->>'id', '')::uuid;
  cref := nullif(t->>'clientRef', '')::uuid;
  if t ? 'title' then
    ttl := btrim(coalesce(t->>'title', ''));
    if ttl = '' then raise exception 'Please write what the task is.'; end if;
    if char_length(ttl) > 140 then raise exception 'The title can be at most 140 characters.'; end if;
  elsif tid is null then
    raise exception 'Please write what the task is.';
  end if;
  if t ? 'subjectId' then subj := public.study_int_own_subject(me, nullif(t->>'subjectId', '')::uuid); end if;
  if t ? 'estMinutes' and nullif(t->>'estMinutes', '') is not null then
    est := (t->>'estMinutes')::integer;
    if est < 5 or est > 600 then raise exception 'The time needed must be between 5 and 600 minutes.'; end if;
  end if;
  if t ? 'priority' then prio := t->>'priority'; if prio not in ('low', 'normal', 'high') then raise exception 'Priority must be low, normal or high.'; end if; end if;
  if t ? 'kind' then kd := t->>'kind'; if kd not in ('task', 'homework', 'revision', 'practice', 'exam_prep') then raise exception 'That kind of task is not known.'; end if; end if;
  if t ? 'dueAt' and nullif(t->>'dueAt', '') is not null then due := (t->>'dueAt')::timestamptz; end if;
  if t ? 'description' and char_length(coalesce(t->>'description', '')) > 1000 then raise exception 'The description can be at most 1000 characters.'; end if;
  if t ? 'status' then st := t->>'status'; if st not in ('todo', 'doing', 'done') then raise exception 'That status is not known.'; end if; end if;

  if tid is null then
    insert into public.study_tasks (user_id, client_ref, subject_id, title, description, kind, due_at, priority, est_minutes, status, attachment)
    values (me, cref, subj, ttl, left(btrim(coalesce(t->>'description', '')), 1000), coalesce(kd, 'task'), due, coalesce(prio, 'normal'), est, coalesce(st, 'todo'), nullif(btrim(coalesce(t->>'attachment', '')), ''))
    on conflict (user_id, client_ref) where client_ref is not null do nothing
    returning * into row;
    if row.id is null then select * into row from public.study_tasks where user_id = me and client_ref = cref; end if;
    return public.study_int_task_json(row);
  end if;

  update public.study_tasks set
    title = coalesce(ttl, title),
    description = case when t ? 'description' then left(btrim(coalesce(t->>'description', '')), 1000) else description end,
    subject_id = case when t ? 'subjectId' then subj else subject_id end,
    kind = coalesce(kd, kind),
    due_at = case when t ? 'dueAt' then due else due_at end,
    priority = coalesce(prio, priority),
    est_minutes = case when t ? 'estMinutes' then est else est_minutes end,
    attachment = case when t ? 'attachment' then nullif(btrim(coalesce(t->>'attachment', '')), '') else attachment end,
    updated_at = now()
  where id = tid and user_id = me
  returning * into row;
  if row.id is null then raise exception 'That task no longer exists.'; end if;
  if st is not null and st is distinct from row.status then return public.study_task_status(tid, st); end if;
  return public.study_int_task_json(row);
end;
$$;

-- Not started / in progress / completed. Completing it twice is harmless (it counts once).
create or replace function public.study_task_status(p_id uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); cur public.study_tasks; row public.study_tasks;
begin
  if p_status not in ('todo', 'doing', 'done') then raise exception 'That status is not known.'; end if;
  select * into cur from public.study_tasks where id = p_id and user_id = me for update;
  if not found then raise exception 'That task no longer exists.'; end if;
  if cur.status = p_status then return public.study_int_task_json(cur); end if;
  update public.study_tasks set status = p_status, completed_at = case when p_status = 'done' then now() else null end, updated_at = now() where id = p_id returning * into row;
  if p_status = 'done' then perform public.study_int_log(me, 'task_done', row.subject_id, coalesce(row.est_minutes, 0)); end if;
  return public.study_int_task_json(row);
end;
$$;

create or replace function public.study_task_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); gone public.study_tasks;
begin
  delete from public.study_tasks where id = p_id and user_id = me returning * into gone;
  return jsonb_build_object('success', true, 'deleted', gone.id is not null, 'attachment', gone.attachment);
end;
$$;

-- filter: open (not finished), upcoming, overdue, done, all. Paged.
create or replace function public.study_tasks_list(p_filter text default 'open', p_subject uuid default null, p_limit integer default 60, p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); lim integer := greatest(1, least(coalesce(p_limit, 60), 100)); off integer := greatest(0, coalesce(p_offset, 0));
begin
  if p_filter not in ('open', 'upcoming', 'overdue', 'done', 'all') then raise exception 'That filter is not known.'; end if;
  return jsonb_build_object('tasks', coalesce((
    select jsonb_agg(public.study_int_task_json(t) order by (t.status = 'done'), coalesce(t.due_at, 'infinity'::timestamptz), t.created_at)
    from public.study_tasks t
    where t.id in (
      select k.id from public.study_tasks k
      where k.user_id = me
        and (p_subject is null or k.subject_id = p_subject)
        and case p_filter
              when 'open' then k.status <> 'done'
              when 'upcoming' then k.status <> 'done' and (k.due_at is null or k.due_at >= now())
              when 'overdue' then k.status <> 'done' and k.due_at < now()
              when 'done' then k.status = 'done'
              else true end
      order by (k.status = 'done'), coalesce(k.due_at, 'infinity'::timestamptz), k.created_at
      limit lim offset off)
  ), '[]'::jsonb), 'limit', lim, 'offset', off);
end;
$$;

-- ---------------------------------------------------------------- exams
create or replace function public.study_int_exam_json(e public.study_exams) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object('id', e.id, 'subjectId', e.subject_id, 'title', e.title, 'examAt', e.exam_at, 'notes', e.notes);
$$;

create or replace function public.study_exam_save(p_exam jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.study_int_uid();
  x jsonb := case when jsonb_typeof(p_exam) = 'object' then p_exam else '{}'::jsonb end;
  eid uuid := nullif(x->>'id', '')::uuid; cref uuid := nullif(x->>'clientRef', '')::uuid;
  ttl text; subj uuid; at timestamptz; row public.study_exams;
begin
  if x ? 'title' then
    ttl := btrim(coalesce(x->>'title', ''));
    if ttl = '' then raise exception 'Please write the name of the exam.'; end if;
    if char_length(ttl) > 140 then raise exception 'The name can be at most 140 characters.'; end if;
  elsif eid is null then raise exception 'Please write the name of the exam.'; end if;
  if x ? 'subjectId' then subj := public.study_int_own_subject(me, nullif(x->>'subjectId', '')::uuid); end if;
  if x ? 'examAt' then at := (x->>'examAt')::timestamptz; elsif eid is null then raise exception 'Please choose the date of the exam.'; end if;
  if x ? 'notes' and char_length(coalesce(x->>'notes', '')) > 600 then raise exception 'The note can be at most 600 characters.'; end if;

  if eid is null then
    insert into public.study_exams (user_id, client_ref, subject_id, title, exam_at, notes)
    values (me, cref, subj, ttl, at, left(btrim(coalesce(x->>'notes', '')), 600))
    on conflict (user_id, client_ref) where client_ref is not null do nothing returning * into row;
    if row.id is null then select * into row from public.study_exams where user_id = me and client_ref = cref; end if;
    return public.study_int_exam_json(row);
  end if;
  update public.study_exams set title = coalesce(ttl, title), subject_id = case when x ? 'subjectId' then subj else subject_id end,
    exam_at = coalesce(at, exam_at), notes = case when x ? 'notes' then left(btrim(coalesce(x->>'notes', '')), 600) else notes end
  where id = eid and user_id = me returning * into row;
  if row.id is null then raise exception 'That exam no longer exists.'; end if;
  return public.study_int_exam_json(row);
end;
$$;

create or replace function public.study_exam_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); n integer;
begin
  delete from public.study_exams where id = p_id and user_id = me;
  get diagnostics n = row_count;
  return jsonb_build_object('success', true, 'deleted', n > 0);
end;
$$;

create or replace function public.study_exams_list(p_include_past boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.study_int_uid();
begin
  return jsonb_build_object('exams', coalesce((
    select jsonb_agg(public.study_int_exam_json(e) order by e.exam_at) from public.study_exams e
    where e.user_id = me and (coalesce(p_include_past, false) or e.exam_at >= now() - interval '1 day')), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------- planned study sessions (the timetable)
create or replace function public.study_int_session_json(s public.study_sessions) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object('id', s.id, 'subjectId', s.subject_id, 'topic', s.topic, 'startsAt', s.starts_at, 'durationMin', s.duration_min,
    'objective', s.objective, 'activity', s.activity, 'priority', s.priority, 'status', s.status, 'source', s.source, 'why', s.why);
$$;

create or replace function public.study_int_session_fields(p_user uuid, x jsonb, out o_subject uuid, out o_topic text, out o_starts timestamptz, out o_dur integer, out o_obj text, out o_act text, out o_prio text, out o_why text)
language plpgsql stable security definer set search_path = public as $$
begin
  o_subject := public.study_int_own_subject(p_user, nullif(x->>'subjectId', '')::uuid);
  o_topic := left(btrim(coalesce(x->>'topic', '')), 140);
  o_starts := (x->>'startsAt')::timestamptz;
  o_dur := (x->>'durationMin')::integer;
  if o_starts is null then raise exception 'Please choose when the session starts.'; end if;
  if o_dur is null or o_dur < 5 or o_dur > 240 then raise exception 'A session can be between 5 and 240 minutes long.'; end if;
  o_obj := left(btrim(coalesce(x->>'objective', '')), 300);
  o_act := coalesce(nullif(x->>'activity', ''), 'study');
  if o_act not in ('study', 'revise', 'practice', 'homework', 'review_mistakes', 'read', 'flashcards') then raise exception 'That kind of session is not known.'; end if;
  o_prio := coalesce(nullif(x->>'priority', ''), 'normal');
  if o_prio not in ('low', 'normal', 'high') then raise exception 'Priority must be low, normal or high.'; end if;
  o_why := left(btrim(coalesce(x->>'why', '')), 400);
end;
$$;

-- Adds (clientRef) or changes (id) one session.
create or replace function public.study_session_save(p_session jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.study_int_uid();
  x jsonb := case when jsonb_typeof(p_session) = 'object' then p_session else '{}'::jsonb end;
  sid uuid := nullif(x->>'id', '')::uuid; cref uuid := nullif(x->>'clientRef', '')::uuid;
  f record; row public.study_sessions; cur public.study_sessions;
begin
  if sid is null then
    select * into f from public.study_int_session_fields(me, x);
    insert into public.study_sessions (user_id, client_ref, subject_id, topic, starts_at, duration_min, objective, activity, priority, why, source)
    values (me, cref, f.o_subject, f.o_topic, f.o_starts, f.o_dur, f.o_obj, f.o_act, f.o_prio, f.o_why, 'manual')
    on conflict (user_id, client_ref) where client_ref is not null do nothing returning * into row;
    if row.id is null then select * into row from public.study_sessions where user_id = me and client_ref = cref; end if;
    return public.study_int_session_json(row);
  end if;
  select * into cur from public.study_sessions where id = sid and user_id = me for update;
  if not found then raise exception 'That session no longer exists.'; end if;
  select * into f from public.study_int_session_fields(me, public.study_int_session_json(cur) || x);
  update public.study_sessions set subject_id = f.o_subject, topic = f.o_topic, starts_at = f.o_starts, duration_min = f.o_dur, objective = f.o_obj,
    activity = f.o_act, priority = f.o_prio, why = f.o_why, updated_at = now() where id = sid returning * into row;
  return public.study_int_session_json(row);
end;
$$;

create or replace function public.study_session_status(p_id uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); cur public.study_sessions; row public.study_sessions;
begin
  if p_status not in ('planned', 'done', 'skipped') then raise exception 'That status is not known.'; end if;
  select * into cur from public.study_sessions where id = p_id and user_id = me for update;
  if not found then raise exception 'That session no longer exists.'; end if;
  if cur.status = p_status then return public.study_int_session_json(cur); end if;
  update public.study_sessions set status = p_status, updated_at = now() where id = p_id returning * into row;
  if p_status = 'done' then perform public.study_int_log(me, 'session_done', row.subject_id, row.duration_min); end if;
  return public.study_int_session_json(row);
end;
$$;

create or replace function public.study_session_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); n integer;
begin
  delete from public.study_sessions where id = p_id and user_id = me;
  get diagnostics n = row_count;
  return jsonb_build_object('success', true, 'deleted', n > 0);
end;
$$;

create or replace function public.study_sessions_list(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.study_int_uid();
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > interval '100 days' then raise exception 'Please choose a period of up to 100 days.'; end if;
  return jsonb_build_object('sessions', coalesce((
    select jsonb_agg(public.study_int_session_json(s) order by s.starts_at) from public.study_sessions s
    where s.user_id = me and s.starts_at >= p_from and s.starts_at < p_to), '[]'::jsonb));
end;
$$;

-- Puts a freshly made plan into [from, to): only the not-yet-done sessions that an earlier plan made are replaced. Sessions that are done or
-- skipped, and everything the student scheduled by hand, stay exactly as they are.
create or replace function public.study_sessions_replace_plan(p_plan jsonb, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); item jsonb; f record; kept integer := 0; made integer := 0;
begin
  if jsonb_typeof(p_plan) is distinct from 'array' then raise exception 'There is no plan to save.'; end if;
  if jsonb_array_length(p_plan) > 200 then raise exception 'A plan can have at most 200 sessions.'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > interval '100 days' then raise exception 'Please choose a period of up to 100 days.'; end if;
  perform 1 from public.study_profiles where user_id = me for update;
  select count(*) into kept from public.study_sessions where user_id = me and starts_at >= p_from and starts_at < p_to and not (status = 'planned' and source = 'ai');
  delete from public.study_sessions where user_id = me and starts_at >= p_from and starts_at < p_to and status = 'planned' and source = 'ai';
  for item in select * from jsonb_array_elements(p_plan) loop
    select * into f from public.study_int_session_fields(me, item);
    if f.o_starts < p_from or f.o_starts >= p_to then continue; end if;
    insert into public.study_sessions (user_id, subject_id, topic, starts_at, duration_min, objective, activity, priority, why, source)
    values (me, f.o_subject, f.o_topic, f.o_starts, f.o_dur, f.o_obj, f.o_act, f.o_prio, f.o_why, 'ai');
    made := made + 1;
  end loop;
  perform public.study_int_log(me, 'plan_change', null, 0, jsonb_build_object('made', made));
  return jsonb_build_object('success', true, 'made', made, 'kept', kept,
    'sessions', coalesce((select jsonb_agg(public.study_int_session_json(s) order by s.starts_at) from public.study_sessions s where s.user_id = me and s.starts_at >= p_from and s.starts_at < p_to), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------- focus sessions
-- Starting one while another is "running" closes the old one as interrupted (so there is never a ghost timer, and it never counts as done).
create or replace function public.study_focus_start(p_subject uuid default null, p_planned integer default 25, p_kind text default 'focus') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); subj uuid := public.study_int_own_subject(me, p_subject); row public.study_focus_sessions;
begin
  if p_kind not in ('focus', 'break') then raise exception 'That kind of session is not known.'; end if;
  if p_planned is null or p_planned < 1 or p_planned > 180 then raise exception 'A focus session can be between 1 and 180 minutes.'; end if;
  update public.study_focus_sessions set status = 'interrupted', ended_at = now(),
    focus_seconds = least(greatest(0, extract(epoch from (now() - started_at))::integer), planned_min * 60)
  where user_id = me and status = 'running';
  insert into public.study_focus_sessions (user_id, subject_id, kind, planned_min) values (me, subj, p_kind, p_planned) returning * into row;
  return jsonb_build_object('id', row.id, 'startedAt', row.started_at, 'plannedMin', row.planned_min, 'kind', row.kind);
end;
$$;

-- The seconds the student really focused are reported by the phone but can never exceed the time that really went by; it counts as completed
-- only when they say so AND (nearly) the whole planned time was focused. Anything else is recorded honestly as interrupted.
create or replace function public.study_focus_finish(p_id uuid, p_focus_seconds integer, p_completed boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); cur public.study_focus_sessions; wall integer; secs integer; ok boolean; row public.study_focus_sessions;
begin
  select * into cur from public.study_focus_sessions where id = p_id and user_id = me for update;
  if not found then raise exception 'That session no longer exists.'; end if;
  if cur.status <> 'running' then
    return jsonb_build_object('id', cur.id, 'status', cur.status, 'focusSeconds', cur.focus_seconds, 'already', true);
  end if;
  wall := greatest(0, extract(epoch from (now() - cur.started_at))::integer);
  secs := greatest(0, least(coalesce(p_focus_seconds, 0), wall + 2, cur.planned_min * 60));
  ok := coalesce(p_completed, false) and secs >= cur.planned_min * 60 * 0.9;
  update public.study_focus_sessions set status = case when ok then 'completed' else 'interrupted' end, focus_seconds = secs, ended_at = now()
  where id = p_id returning * into row;
  if ok and row.kind = 'focus' then perform public.study_int_log(me, 'focus_done', row.subject_id, round(secs / 60.0)::integer); end if;
  return jsonb_build_object('id', row.id, 'status', row.status, 'focusSeconds', row.focus_seconds, 'already', false);
end;
$$;

-- ---------------------------------------------------------------- the dashboard
-- Everything the home page shows, in one call, from what was really recorded. "Today" is in the student's own time zone.
create or replace function public.study_dashboard() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := public.study_int_uid();
  tz text := coalesce((select timezone from public.study_profiles where user_id = me), 'Asia/Kolkata');
  day0 timestamptz; day1 timestamptz;
  streak integer := 0; d date; today date;
  active7 integer;
  mins7 integer; tasks7 integer;
begin
  today := (now() at time zone tz)::date;
  day0 := today::timestamp at time zone tz;
  day1 := (today + 1)::timestamp at time zone tz;

  -- days in a row with something done (today may still be empty)
  d := today;
  if not exists (select 1 from public.study_events where user_id = me and created_at >= day0 and created_at < day1) then d := today - 1; end if;
  loop
    exit when not exists (select 1 from public.study_events where user_id = me and created_at >= (d::timestamp at time zone tz) and created_at < ((d + 1)::timestamp at time zone tz));
    streak := streak + 1; d := d - 1;
    exit when streak >= 365;
  end loop;

  select count(distinct (created_at at time zone tz)::date), coalesce(sum(minutes) filter (where kind in ('focus_done', 'session_done')), 0), count(*) filter (where kind = 'task_done')
    into active7, mins7, tasks7
  from public.study_events where user_id = me and created_at >= day1 - interval '7 days';

  return jsonb_build_object(
    'today', today,
    'timezone', tz,
    'tasksToday', coalesce((select jsonb_agg(public.study_int_task_json(t) order by t.status = 'done', t.due_at) from public.study_tasks t
                 where t.user_id = me and ((t.due_at >= day0 and t.due_at < day1) or (t.status = 'doing')) ), '[]'::jsonb),
    'overdue', coalesce((select jsonb_agg(public.study_int_task_json(t) order by t.due_at) from public.study_tasks t
                 where t.id in (select k.id from public.study_tasks k where k.user_id = me and k.status <> 'done' and k.due_at < day0 order by k.due_at limit 10)), '[]'::jsonb),
    'upcoming', coalesce((select jsonb_agg(public.study_int_task_json(t) order by t.due_at) from public.study_tasks t
                 where t.id in (select k.id from public.study_tasks k where k.user_id = me and k.status <> 'done' and k.due_at >= day1 order by k.due_at limit 8)), '[]'::jsonb),
    'sessionsToday', coalesce((select jsonb_agg(public.study_int_session_json(s) order by s.starts_at) from public.study_sessions s where s.user_id = me and s.starts_at >= day0 and s.starts_at < day1), '[]'::jsonb),
    'exams', coalesce((select jsonb_agg(public.study_int_exam_json(e) order by e.exam_at) from public.study_exams e
                 where e.id in (select k.id from public.study_exams k where k.user_id = me and k.exam_at >= now() order by k.exam_at limit 5)), '[]'::jsonb),
    'week', coalesce((
      select jsonb_agg(jsonb_build_object('date', g.d::date, 'minutes', coalesce(m.mins, 0)) order by g.d)
      from generate_series(today - 6, today, interval '1 day') as g(d)
      left join (select (created_at at time zone tz)::date as dd, sum(minutes) as mins from public.study_events
                 where user_id = me and kind in ('focus_done', 'session_done') and created_at >= (today - 6)::timestamp at time zone tz group by 1) m on m.dd = g.d::date), '[]'::jsonb),
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'kind', s.kind,
        'pendingTasks', (select count(*) from public.study_tasks t where t.user_id = me and t.subject_id = s.id and t.status <> 'done'),
        'minutes7', coalesce((select sum(e.minutes) from public.study_events e where e.user_id = me and e.subject_id = s.id and e.kind in ('focus_done', 'session_done') and e.created_at >= day1 - interval '7 days'), 0),
        'lastActivity', (select max(e.created_at) from public.study_events e where e.user_id = me and e.subject_id = s.id),
        'nextSession', (select jsonb_build_object('topic', x.topic, 'startsAt', x.starts_at) from public.study_sessions x where x.user_id = me and x.subject_id = s.id and x.status = 'planned' and x.starts_at >= now() order by x.starts_at limit 1)
      ) order by s.position) from public.study_subjects s where s.user_id = me and s.archived_at is null), '[]'::jsonb),
    'stats', jsonb_build_object('activeDays7', active7, 'minutes7', mins7, 'tasksDone7', tasks7, 'streak', streak)
  );
end;
$$;

-- ---------------------------------------------------------------- deleting what the student wants gone
-- scope 'activity': the focus history and the activity log. scope 'all': everything of NOOB STUDY for this person (their NOOB account is untouched).
-- Returns the stored files to delete (the app removes them through the Storage API).
create or replace function public.study_delete_my_data(p_scope text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); keys text[] := '{}';
begin
  if p_scope not in ('activity', 'all') then raise exception 'That choice is not known.'; end if;
  delete from public.study_events where user_id = me;
  delete from public.study_focus_sessions where user_id = me;
  if p_scope = 'all' then
    select coalesce(array_agg(attachment), '{}') into keys from public.study_tasks where user_id = me and attachment is not null;
    delete from public.study_tasks where user_id = me;
    delete from public.study_exams where user_id = me;
    delete from public.study_sessions where user_id = me;
    delete from public.study_subjects where user_id = me;
    delete from public.study_profiles where user_id = me;
  end if;
  return jsonb_build_object('success', true, 'removedFiles', to_jsonb(keys));
end;
$$;

-- ---------------------------------------------------------------- who may call what
-- Everything named study_* is for signed-in people only; the study_int_* helpers are for the database itself.
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig, p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'study\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    if r.proname not like 'study\_int\_%' then execute format('grant execute on function %s to authenticated', r.sig); end if;
  end loop;
end;
$$;
