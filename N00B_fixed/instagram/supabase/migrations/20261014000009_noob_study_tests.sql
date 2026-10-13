-- NOOB STUDY, part 9: weekly tests and the student's own progress graphs.
--  * A weekly test for each subject: 10 multiple-choice questions, written by the AI, ONLY on what the student has really studied in the app (topics marked
--    "learning" or "confident", finished sessions and tasks, tutor chat topics, quizzes, flashcards, notes). A fresh set every week; a question is never repeated.
--  * Only the marks, the test's name and the date and time are kept. The questions are removed as soon as the test is handed in (or the week ends).
-- Safe to run more than once.

create table if not exists public.study_test_hashes (
  user_id      uuid not null references public.study_profiles(user_id) on delete cascade,
  subject_name text not null,
  qhash        text not null,
  at           timestamptz not null default now(),
  primary key (user_id, subject_name, qhash)
);
alter table public.study_test_hashes enable row level security;

-- ---------------------------------------------------------------- helpers
create or replace function public.study_int_require_feature(p_user uuid, p_key text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_master_admin_user(p_user) and not public.study_int_feature_on(p_key) then raise exception 'This part of NOOB STUDY is switched off for now.' using errcode = 'P0001'; end if;
end;
$$;

-- "2026-W42": the student's own week (Monday to Sunday) on the student's own clock
create or replace function public.study_int_week_key(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select to_char((now() at time zone coalesce((select timezone from public.study_profiles where user_id = p_user), 'Asia/Kolkata'))::date, 'IYYY-"W"IW');
$$;

create or replace function public.study_int_week_title(p_week text) returns text
language sql immutable set search_path = public as $$
  select 'Week ' || ltrim(substr(p_week, 7, 2), '0') || ', ' || substr(p_week, 1, 4);
$$;

-- What a student has actually learned in this subject, in the app: their own topics marked learning or confident, sessions and tasks they finished,
-- the titles of their tutor chats, quizzes they did, flashcard decks they reviewed, and the names of their notes. Newest first, each once.
create or replace function public.study_int_covered(p_user uuid, p_subject uuid) returns table (title text, src text, at timestamptz)
language sql stable security definer set search_path = public as $$
  select x.title, x.src, x.at from (
    select distinct on (lower(btrim(u.title))) btrim(u.title) as title, u.src, u.at from (
      select t.title, 'topic'::text as src, t.updated_at as at from public.study_topics t where t.user_id = p_user and t.subject_id = p_subject and t.status in ('learning', 'confident')
      union all select s.topic, 'session', s.starts_at from public.study_sessions s where s.user_id = p_user and s.subject_id = p_subject and s.status = 'done' and btrim(s.topic) <> '' and s.starts_at > now() - interval '120 days'
      union all select k.title, 'task', coalesce(k.completed_at, k.updated_at) from public.study_tasks k where k.user_id = p_user and k.subject_id = p_subject and k.status = 'done' and coalesce(k.completed_at, k.updated_at) > now() - interval '120 days'
      union all select c.title, 'chat', c.last_message_at from public.study_conversations c where c.user_id = p_user and c.subject_id = p_subject and btrim(c.title) <> '' and c.last_message_at > now() - interval '120 days'
      union all select c.topic, 'chat', c.last_message_at from public.study_conversations c where c.user_id = p_user and c.subject_id = p_subject and btrim(c.topic) <> '' and c.last_message_at > now() - interval '120 days'
      union all select z.title, 'quiz', max(a.created_at) from public.study_quizzes z join public.study_quiz_attempts a on a.quiz_id = z.id where z.user_id = p_user and z.subject_id = p_subject and z.source <> 'mistakes' group by z.title
      union all select d.title, 'deck', max(c.last_reviewed_at) from public.study_decks d join public.study_cards c on c.deck_id = d.id where d.user_id = p_user and d.subject_id = p_subject and c.last_reviewed_at is not null group by d.title
      union all select m.title, 'notes', m.created_at from public.study_materials m where m.user_id = p_user and m.subject_id = p_subject and m.status = 'ready' and m.kind in ('notes', 'pdf', 'text', 'image')
    ) u where btrim(coalesce(u.title, '')) <> '' order by lower(btrim(u.title)), u.at desc
  ) x order by x.at desc limit 40;
$$;

-- a test whose week has ended can no longer be taken: it is closed and its questions are removed
create or replace function public.study_int_expire_tests(p_user uuid) returns void
language sql security definer set search_path = public as $$
  update public.study_tests set status = 'expired', questions = null where user_id = p_user and status = 'ready' and week_key < public.study_int_week_key(p_user);
$$;

-- ---------------------------------------------------------------- for the AI function (service role only)
create or replace function public.study_svc_test_context(p_user uuid, p_subject uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.study_subjects; wk text := public.study_int_week_key(p_user); ex public.study_tests; pf public.study_profiles; cov jsonb; rec jsonb;
begin
  select * into s from public.study_subjects where id = p_subject and user_id = p_user and archived_at is null;
  if not found then raise exception 'That subject is not yours.'; end if;
  perform public.study_int_expire_tests(p_user);
  select * into ex from public.study_tests where user_id = p_user and subject_name = s.name and week_key = wk;
  select * into pf from public.study_profiles where user_id = p_user;
  select coalesce(jsonb_agg(c.title order by c.at desc), '[]'::jsonb) into cov from public.study_int_covered(p_user, p_subject) c;
  select coalesce(jsonb_agg(qhash), '[]'::jsonb) into rec from (select qhash from public.study_test_hashes where user_id = p_user and subject_name = s.name order by at desc limit 300) h;
  return jsonb_build_object('subject', jsonb_build_object('id', s.id, 'name', s.name), 'weekKey', wk,
    'existing', case when ex.id is null then null else jsonb_build_object('id', ex.id, 'status', ex.status) end,
    'covered', cov, 'recent', rec,
    'profile', jsonb_build_object('level', pf.level, 'board', pf.board, 'classYear', pf.class_year, 'language', coalesce(pf.tutor->>'language', pf.language)));
end;
$$;

create or replace function public.study_svc_test_save(p_user uuid, p_subject uuid, p_questions jsonb, p_hashes jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.study_subjects; wk text := public.study_int_week_key(p_user); qs jsonb; mcq jsonb := '[]'::jsonb; q jsonb; t public.study_tests; h text;
begin
  select * into s from public.study_subjects where id = p_subject and user_id = p_user and archived_at is null;
  if not found then raise exception 'That subject is not yours.'; end if;
  perform 1 from public.study_profiles where user_id = p_user for update;
  select * into t from public.study_tests where user_id = p_user and subject_name = s.name and week_key = wk;
  if found then return jsonb_build_object('id', t.id, 'status', t.status, 'existing', true); end if;
  qs := public.study_int_clean_questions(p_questions);
  for q in select * from jsonb_array_elements(qs) loop if q->>'type' = 'mcq' then mcq := mcq || jsonb_build_array(q); end if; end loop;
  if jsonb_array_length(mcq) < 10 then raise exception 'The test did not come out right. Please try again.'; end if;
  mcq := (select jsonb_agg(x.item order by x.ord) from (select e.item, e.ord from jsonb_array_elements(mcq) with ordinality as e(item, ord) order by e.ord limit 10) x);
  insert into public.study_tests (user_id, subject_id, subject_name, week_key, name, status, questions)
  values (p_user, s.id, s.name, wk, 'Weekly test: ' || s.name || ', ' || public.study_int_week_title(wk), 'ready', mcq) returning * into t;
  if jsonb_typeof(p_hashes) = 'array' then
    for h in select * from jsonb_array_elements_text(p_hashes) loop
      insert into public.study_test_hashes (user_id, subject_name, qhash) values (p_user, s.name, left(h, 64)) on conflict do nothing;
    end loop;
  end if;
  delete from public.study_test_hashes where user_id = p_user and subject_name = s.name and qhash not in (select qhash from public.study_test_hashes where user_id = p_user and subject_name = s.name order by at desc limit 300);
  return jsonb_build_object('id', t.id, 'status', t.status, 'existing', false);
end;
$$;

-- ---------------------------------------------------------------- for the student
-- every active subject: can a test be made, is one waiting, is it done
create or replace function public.study_tests_status() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); wk text;
begin
  perform public.study_int_require_feature(me, 'tests');
  perform public.study_int_expire_tests(me);
  wk := public.study_int_week_key(me);
  return jsonb_build_object('weekKey', wk, 'weekTitle', public.study_int_week_title(wk), 'subjects', coalesce((
    select jsonb_agg(jsonb_build_object('subjectId', s.id, 'subject', s.name,
      'covered', (select count(*) from public.study_int_covered(me, s.id)),
      'testId', t.id, 'state', case when t.id is null then (case when exists (select 1 from public.study_int_covered(me, s.id)) then 'available' else 'locked' end) else t.status end,
      'score', t.score, 'max', t.max_score, 'takenAt', t.taken_at) order by s.position)
    from public.study_subjects s left join public.study_tests t on t.user_id = me and t.subject_name = s.name and t.week_key = wk
    where s.user_id = me and s.archived_at is null), '[]'::jsonb));
end;
$$;

-- a test to take: the questions and their choices, never the answers
create or replace function public.study_test_get(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); t public.study_tests;
begin
  perform public.study_int_require_feature(me, 'tests');
  perform public.study_int_expire_tests(me);
  select * into t from public.study_tests where id = p_id and user_id = me;
  if not found then raise exception 'That test no longer exists.'; end if;
  return jsonb_build_object('id', t.id, 'name', t.name, 'subject', t.subject_name, 'weekKey', t.week_key, 'status', t.status, 'score', t.score, 'max', t.max_score, 'takenAt', t.taken_at,
    'questions', case when t.status = 'ready' then (select coalesce(jsonb_agg(jsonb_build_object('question', q->>'question', 'options', q->'options')), '[]'::jsonb) from jsonb_array_elements(t.questions) q) else null end);
end;
$$;

-- Hand in. The marks are worked out here. The right answers and the reasons are shown ONCE, in this reply; after that only the marks, the name and the time exist.
create or replace function public.study_test_submit(p_id uuid, p_answers jsonb, p_duration integer default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); t public.study_tests; q jsonb; i integer := 0; a jsonb; sc integer := 0; review jsonb := '[]'::jsonb; ok boolean; n integer;
begin
  perform public.study_int_require_feature(me, 'tests');
  perform public.study_int_expire_tests(me);
  select * into t from public.study_tests where id = p_id and user_id = me for update;
  if not found then raise exception 'That test no longer exists.'; end if;
  if t.status = 'done' then return jsonb_build_object('score', t.score, 'max', t.max_score, 'percent', round(t.score::numeric / t.max_score * 100), 'already', true, 'review', '[]'::jsonb); end if;
  if t.status <> 'ready' then raise exception 'This week''s test has ended. A new one is ready next week.'; end if;
  n := jsonb_array_length(t.questions);
  if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers) > n then raise exception 'These answers do not belong to this test.'; end if;
  for q in select * from jsonb_array_elements(t.questions) loop
    a := case when i < jsonb_array_length(p_answers) then p_answers->i else null end;
    ok := a is not null and jsonb_typeof(a) = 'number' and (a#>>'{}') = (q->>'answer');
    if ok then sc := sc + 1; end if;
    review := review || jsonb_build_array(jsonb_build_object('i', i, 'question', q->>'question', 'options', q->'options', 'chosen', case when a is not null and jsonb_typeof(a) = 'number' then a else null end,
      'answer', (q->>'answer')::integer, 'correct', ok, 'explanation', q->>'explanation'));
    i := i + 1;
  end loop;
  update public.study_tests set status = 'done', score = sc, max_score = n, duration_sec = greatest(0, least(coalesce(p_duration, 0), 86400)), taken_at = now(), questions = null where id = p_id;
  perform public.study_int_log(me, 'practice', t.subject_id, ceil(greatest(0, coalesce(p_duration, 0)) / 60.0)::integer, jsonb_build_object('test', t.id, 'score', sc, 'max', n));
  return jsonb_build_object('score', sc, 'max', n, 'percent', round(sc::numeric / n * 100), 'already', false, 'review', review, 'name', t.name);
end;
$$;

-- the history: the name, the marks, and when it was taken. Nothing else.
create or replace function public.study_tests_history(p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.study_int_uid();
begin
  return jsonb_build_object('tests', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'subject', t.subject_name, 'score', t.score, 'max', t.max_score,
      'percent', round(t.score::numeric / t.max_score * 100), 'takenAt', t.taken_at) order by t.taken_at desc)
    from (select * from public.study_tests where user_id = me and status = 'done' order by taken_at desc limit greatest(1, least(coalesce(p_limit, 50), 200))) t), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------- progress (the student's own graphs)
create or replace function public.study_progress(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); d integer := greatest(7, least(coalesce(p_days, 30), 90)); tz text := coalesce((select timezone from public.study_profiles where user_id = me), 'Asia/Kolkata'); today date; since date;
begin
  today := (now() at time zone tz)::date; since := today - (d - 1);
  return jsonb_build_object('days', d,
    'totals', jsonb_build_object(
      'minutes', (select coalesce(sum(minutes), 0) from public.study_events where user_id = me and kind in ('focus_done', 'session_done') and (created_at at time zone tz)::date >= since),
      'activeDays', (select count(distinct (created_at at time zone tz)::date) from public.study_events where user_id = me and (created_at at time zone tz)::date >= since),
      'tasksDone', (select count(*) from public.study_events where user_id = me and kind = 'task_done' and (created_at at time zone tz)::date >= since),
      'quizzes', (select count(*) from public.study_events where user_id = me and kind = 'practice' and (created_at at time zone tz)::date >= since),
      'cards', (select coalesce(sum((meta->>'cards')::integer), 0) from public.study_events where user_id = me and kind = 'review' and (created_at at time zone tz)::date >= since),
      'openMistakes', (select count(*) from public.study_mistakes where user_id = me and not resolved)),
    'minutesByDay', (select coalesce(jsonb_agg(jsonb_build_object('d', g.d, 'n', coalesce(c.n, 0)) order by g.d), '[]'::jsonb)
      from generate_series(since, today, interval '1 day') gs(d), lateral (select gs.d::date as d) g
      left join (select (created_at at time zone tz)::date as dd, sum(minutes) as n from public.study_events where user_id = me and kind in ('focus_done', 'session_done') and (created_at at time zone tz)::date >= since group by 1) c on c.dd = g.d),
    'minutesBySubject', (select coalesce(jsonb_agg(jsonb_build_object('label', name, 'n', n) order by n desc), '[]'::jsonb)
      from (select s.name, sum(e.minutes) as n from public.study_events e join public.study_subjects s on s.id = e.subject_id
            where e.user_id = me and e.kind in ('focus_done', 'session_done') and (e.created_at at time zone tz)::date >= since group by s.name having sum(e.minutes) > 0) x),
    'mistakesBySubject', (select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(s.name, 'No subject'), 'n', n) order by n desc), '[]'::jsonb)
      from (select subject_id, count(*) as n from public.study_mistakes where user_id = me and not resolved group by subject_id) m left join public.study_subjects s on s.id = m.subject_id),
    'quizScores', (select coalesce(jsonb_agg(jsonb_build_object('at', at, 'title', title, 'percent', pc) order by at), '[]'::jsonb)
      from (select a.created_at as at, z.title, round(a.score / nullif(a.max_score, 0) * 100) as pc from public.study_quiz_attempts a join public.study_quizzes z on z.id = a.quiz_id
            where a.user_id = me order by a.created_at desc limit 20) x),
    'testScores', (select coalesce(jsonb_agg(jsonb_build_object('at', taken_at, 'name', name, 'subject', subject_name, 'percent', pc) order by taken_at), '[]'::jsonb)
      from (select taken_at, name, subject_name, round(score::numeric / max_score * 100) as pc from public.study_tests where user_id = me and status = 'done' order by taken_at desc limit 20) x),
    'topicStatus', (select coalesce(jsonb_agg(jsonb_build_object('label', status, 'n', n)), '[]'::jsonb) from (select status, count(*) as n from public.study_topics where user_id = me group by status) x));
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
