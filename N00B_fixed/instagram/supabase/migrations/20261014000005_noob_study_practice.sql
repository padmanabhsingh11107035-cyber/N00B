-- NOOB STUDY, part 5: practice. Saved quizzes with honest marking, a list of mistakes to learn from, flashcards that come back at the right time
-- (the SM-2 method), and the student's own topic list per subject. Everything belongs to the signed-in student alone.
-- Safe to run more than once.

create or replace function public.study_int_ensure_profile(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.study_profiles (user_id, display_name)
  select p_user, left(coalesce(nullif(btrim(display_name), ''), username), 60) from public.profiles where id = p_user
  on conflict (user_id) do nothing;
end;
$$;

-- ---------------------------------------------------------------- tables
create table if not exists public.study_quizzes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.study_profiles(user_id) on delete cascade,
  client_ref  uuid,
  subject_id  uuid references public.study_subjects(id) on delete set null,
  material_id uuid references public.study_materials(id) on delete set null,
  title       text not null check (char_length(title) between 1 and 140),
  topic       text not null default '' check (char_length(topic) <= 140),
  difficulty  text not null default 'mixed' check (difficulty in ('easy', 'medium', 'hard', 'mixed')),
  source      text not null default 'ai' check (source in ('ai', 'mistakes', 'manual')),
  questions   jsonb not null check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) between 1 and 40),
  created_at  timestamptz not null default now()
);
create unique index if not exists study_quizzes_client_ref_uidx on public.study_quizzes (user_id, client_ref) where client_ref is not null;
create index if not exists study_quizzes_user_idx on public.study_quizzes (user_id, created_at desc);
alter table public.study_quizzes enable row level security;

create table if not exists public.study_quiz_attempts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.study_profiles(user_id) on delete cascade,
  quiz_id      uuid not null references public.study_quizzes(id) on delete cascade,
  client_ref   uuid,
  score        numeric not null,
  max_score    numeric not null,
  duration_sec integer not null default 0 check (duration_sec between 0 and 86400),
  results      jsonb not null,
  created_at   timestamptz not null default now()
);
create unique index if not exists study_attempts_client_ref_uidx on public.study_quiz_attempts (user_id, client_ref) where client_ref is not null;
create index if not exists study_attempts_quiz_idx on public.study_quiz_attempts (quiz_id, created_at desc);
alter table public.study_quiz_attempts enable row level security;

create table if not exists public.study_mistakes (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.study_profiles(user_id) on delete cascade,
  subject_id     uuid references public.study_subjects(id) on delete set null,
  quiz_id        uuid references public.study_quizzes(id) on delete set null,
  qhash          text not null,
  question       text not null check (char_length(question) <= 700),
  question_json  jsonb not null,
  correct_answer text not null default '' check (char_length(correct_answer) <= 700),
  student_answer text not null default '' check (char_length(student_answer) <= 700),
  wrong_count    integer not null default 1,
  resolved       boolean not null default false,
  last_wrong_at  timestamptz not null default now(),
  resolved_at    timestamptz,
  created_at     timestamptz not null default now(),
  unique (user_id, qhash)
);
create index if not exists study_mistakes_user_idx on public.study_mistakes (user_id, resolved, last_wrong_at desc);
alter table public.study_mistakes enable row level security;

create table if not exists public.study_decks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.study_profiles(user_id) on delete cascade,
  client_ref  uuid,
  subject_id  uuid references public.study_subjects(id) on delete set null,
  material_id uuid references public.study_materials(id) on delete set null,
  title       text not null check (char_length(title) between 1 and 100),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists study_decks_client_ref_uidx on public.study_decks (user_id, client_ref) where client_ref is not null;
create index if not exists study_decks_user_idx on public.study_decks (user_id, created_at desc);
alter table public.study_decks enable row level security;

create table if not exists public.study_cards (
  id               uuid primary key default gen_random_uuid(),
  seq              bigint generated always as identity,
  deck_id          uuid not null references public.study_decks(id) on delete cascade,
  user_id          uuid not null references public.study_profiles(user_id) on delete cascade,
  front            text not null check (char_length(front) between 1 and 300),
  back             text not null check (char_length(back) between 1 and 600),
  ease             numeric not null default 2.5 check (ease between 1.3 and 4),
  interval_days    integer not null default 0 check (interval_days between 0 and 3650),
  reps             integer not null default 0,
  lapses           integer not null default 0,
  due_at           timestamptz not null default now(),
  last_reviewed_at timestamptz,
  created_at       timestamptz not null default now()
);
create unique index if not exists study_cards_front_uidx on public.study_cards (deck_id, lower(front));
create index if not exists study_cards_due_idx on public.study_cards (user_id, due_at);
alter table public.study_cards enable row level security;

create table if not exists public.study_topics (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.study_profiles(user_id) on delete cascade,
  subject_id uuid not null references public.study_subjects(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 120),
  status     text not null default 'not_started' check (status in ('not_started', 'learning', 'confident')),
  note       text not null default '' check (char_length(note) <= 300),
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists study_topics_title_uidx on public.study_topics (subject_id, lower(title));
create index if not exists study_topics_subject_idx on public.study_topics (user_id, subject_id, position);
alter table public.study_topics enable row level security;

-- ---------------------------------------------------------------- questions
-- The shape of a question is checked here whoever made it (the AI, the app, or a person sending something odd): a question that is not sound is dropped.
create or replace function public.study_int_clean_questions(p jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare r jsonb; t text; q text; ex text; opts jsonb; o jsonb := '[]'::jsonb; o2 jsonb; n integer := 0; ans numeric; steps jsonb; s jsonb;
begin
  if jsonb_typeof(p) is distinct from 'array' then return '[]'::jsonb; end if;
  for r in select * from jsonb_array_elements(p) loop
    exit when n >= 40;
    continue when jsonb_typeof(r) is distinct from 'object';
    q := left(btrim(coalesce(r->>'question', '')), 700);
    ex := left(btrim(coalesce(r->>'explanation', '')), 900);
    continue when q = '' or ex = '';
    t := coalesce(r->>'type', '');
    if t = 'mcq' then
      continue when jsonb_typeof(r->'options') is distinct from 'array' or jsonb_array_length(r->'options') <> 4;
      opts := '[]'::jsonb;
      for s in select * from jsonb_array_elements(r->'options') loop opts := opts || to_jsonb(left(btrim(coalesce(s#>>'{}', '')), 200)); end loop;
      continue when exists (select 1 from jsonb_array_elements_text(opts) x where x = '')
        or (select count(distinct lower(x)) from jsonb_array_elements_text(opts) x) <> 4;
      continue when coalesce(r->>'answer', '') !~ '^[0-3]$';
      o2 := jsonb_build_object('type', 'mcq', 'question', q, 'options', opts, 'answer', (r->>'answer')::integer, 'explanation', ex);
    elsif t = 'tf' then
      continue when jsonb_typeof(r->'answer') is distinct from 'boolean';
      o2 := jsonb_build_object('type', 'tf', 'question', q, 'answer', r->'answer', 'explanation', ex);
    elsif t = 'numerical' then
      continue when coalesce(r#>>'{answer}', '') !~ '^-?\d+(\.\d+)?([eE][+-]?\d+)?$';
      ans := (r#>>'{answer}')::numeric;
      steps := '[]'::jsonb;
      if jsonb_typeof(r->'steps') = 'array' then
        for s in select * from jsonb_array_elements(r->'steps') limit 8 loop
          if btrim(coalesce(s#>>'{}', '')) <> '' then steps := steps || to_jsonb(left(btrim(s#>>'{}'), 300)); end if;
        end loop;
      end if;
      o2 := jsonb_build_object('type', 'numerical', 'question', q, 'answer', ans, 'explanation', ex, 'unit', left(btrim(coalesce(r->>'unit', '')), 20), 'steps', steps);
    elsif t in ('short', 'fill', 'case') then
      continue when btrim(coalesce(r->>'answer', '')) = '';
      o2 := jsonb_build_object('type', t, 'question', q, 'answer', left(btrim(r->>'answer'), 600), 'explanation', ex,
                               'marks', case when coalesce(r->>'marks', '') ~ '^\d+(\.\d+)?$' then greatest(1, least(10, (r->>'marks')::numeric)) else 1 end);
    else
      continue;
    end if;
    o := o || jsonb_build_array(o2);
    n := n + 1;
  end loop;
  return o;
end;
$$;

-- how a student's typed answer is compared with the right one: letters in either case, no punctuation, one space between words
create or replace function public.study_int_norm(p text) returns text
language sql immutable set search_path = public as $$
  select btrim(regexp_replace(regexp_replace(lower(coalesce(p, '')), '[!-/:-@\[-`{-~]', ' ', 'g'), '\s+', ' ', 'g'));
$$;

-- the right answer, written as text (for the list of mistakes)
create or replace function public.study_int_answer_text(q jsonb) returns text
language sql immutable set search_path = public as $$
  select left(case q->>'type'
    when 'mcq' then coalesce(q->'options'->>((q->>'answer')::integer), '')
    when 'tf' then case when (q->>'answer')::boolean then 'True' else 'False' end
    when 'numerical' then (q->>'answer') || case when coalesce(q->>'unit', '') <> '' then ' ' || (q->>'unit') else '' end
    else coalesce(q->>'answer', '') end, 700);
$$;

-- ---------------------------------------------------------------- quizzes
create or replace function public.study_int_quiz_json(z public.study_quizzes, p_full boolean) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('id', z.id, 'title', z.title, 'topic', z.topic, 'subjectId', z.subject_id, 'materialId', z.material_id, 'difficulty', z.difficulty, 'source', z.source,
    'count', jsonb_array_length(z.questions), 'createdAt', z.created_at,
    'attempts', (select count(*) from public.study_quiz_attempts a where a.quiz_id = z.id),
    'best', (select max(round(a.score / nullif(a.max_score, 0) * 100)) from public.study_quiz_attempts a where a.quiz_id = z.id),
    'lastAt', (select max(a.created_at) from public.study_quiz_attempts a where a.quiz_id = z.id))
    || case when p_full then jsonb_build_object('questions', z.questions) else '{}'::jsonb end;
$$;

create or replace function public.study_quiz_save(p_quiz jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); x jsonb := case when jsonb_typeof(p_quiz) = 'object' then p_quiz else '{}'::jsonb end;
  subj uuid; mat uuid; qs jsonb; ttl text; cref uuid := nullif(x->>'clientRef', '')::uuid; row public.study_quizzes; diff text; src text;
begin
  perform public.study_int_ensure_profile(me);
  perform 1 from public.study_profiles where user_id = me for update;
  if cref is not null then
    select * into row from public.study_quizzes where user_id = me and client_ref = cref;
    if found then return public.study_int_quiz_json(row, true); end if;
  end if;
  subj := public.study_int_own_subject(me, nullif(x->>'subjectId', '')::uuid);
  mat := nullif(x->>'materialId', '')::uuid;
  if mat is not null and not exists (select 1 from public.study_materials where id = mat and user_id = me) then mat := null; end if;
  qs := public.study_int_clean_questions(x->'questions');
  if jsonb_array_length(qs) = 0 then raise exception 'There are no usable questions in this quiz.'; end if;
  ttl := left(btrim(coalesce(nullif(x->>'title', ''), nullif(x->>'topic', ''), 'Practice quiz')), 140);
  diff := coalesce(nullif(x->>'difficulty', ''), 'mixed');
  if diff not in ('easy', 'medium', 'hard', 'mixed') then diff := 'mixed'; end if;
  src := coalesce(nullif(x->>'source', ''), 'ai');
  if src not in ('ai', 'mistakes', 'manual') then src := 'ai'; end if;
  if (select count(*) from public.study_quizzes where user_id = me) >= 100 then raise exception 'You have 100 saved quizzes. Please delete some you no longer need.'; end if;
  insert into public.study_quizzes (user_id, client_ref, subject_id, material_id, title, topic, difficulty, source, questions)
  values (me, cref, subj, mat, ttl, left(btrim(coalesce(x->>'topic', '')), 140), diff, src, qs) returning * into row;
  return public.study_int_quiz_json(row, true);
end;
$$;

create or replace function public.study_quizzes_list(p_subject uuid default null, p_limit integer default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); lim integer := greatest(1, least(coalesce(p_limit, 30), 100));
begin
  return jsonb_build_object('quizzes', coalesce((select jsonb_agg(public.study_int_quiz_json(z, false) order by z.created_at desc)
    from (select * from public.study_quizzes where user_id = me and (p_subject is null or subject_id = p_subject) order by created_at desc limit lim) z), '[]'::jsonb));
end;
$$;

create or replace function public.study_quiz_get(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); z public.study_quizzes;
begin
  select * into z from public.study_quizzes where id = p_id and user_id = me;
  if not found then raise exception 'That quiz no longer exists.'; end if;
  return public.study_int_quiz_json(z, true);
end;
$$;

create or replace function public.study_quiz_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); n integer;
begin
  delete from public.study_quizzes where id = p_id and user_id = me;
  get diagnostics n = row_count;
  return jsonb_build_object('success', true, 'deleted', n > 0);
end;
$$;

-- Marking. Questions with one right answer are marked here (the phone cannot give itself marks). Written answers (short, case, and a fill-in that
-- did not match word for word) are marked by the student against the model answer, honestly: 0, half, or full. Nothing is guessed for a question
-- that was left unanswered.
create or replace function public.study_quiz_attempt_save(p_quiz uuid, p_answers jsonb, p_marks jsonb, p_duration integer, p_ref uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); z public.study_quizzes; q jsonb; a jsonb; i integer := 0; n integer; typ text; mx numeric; sc numeric; ok boolean; is_open boolean; mk numeric;
  results jsonb := '[]'::jsonb; total numeric := 0; maxtotal numeric := 0; wrong integer := 0; att public.study_quiz_attempts; ex public.study_quiz_attempts; given text; sv numeric; ans numeric; qh text; right_ans text;
begin
  select * into z from public.study_quizzes where id = p_quiz and user_id = me;
  if not found then raise exception 'That quiz no longer exists.'; end if;
  if p_ref is not null then
    select * into ex from public.study_quiz_attempts where user_id = me and client_ref = p_ref;
    if found then return jsonb_build_object('id', ex.id, 'score', ex.score, 'max', ex.max_score, 'percent', round(ex.score / nullif(ex.max_score, 0) * 100), 'results', ex.results, 'duplicate', true); end if;
  end if;
  n := jsonb_array_length(z.questions);
  if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers) > n then raise exception 'These answers do not belong to this quiz.'; end if;
  for q in select * from jsonb_array_elements(z.questions) loop
    a := case when i < jsonb_array_length(p_answers) then p_answers->i else null end;
    typ := q->>'type';
    mk := case when jsonb_typeof(p_marks) = 'object' and coalesce(p_marks->>(i::text), '') ~ '^\d+(\.\d+)?$' then greatest(0, least(1, (p_marks->>(i::text))::numeric)) else null end;
    is_open := false; ok := null;
    given := case when a is null or jsonb_typeof(a) = 'null' then '' else left(btrim(a#>>'{}'), 700) end;
    if typ = 'short' or typ = 'case' then
      mx := coalesce((q->>'marks')::numeric, 1); is_open := true;
      sc := case when mk is null then 0 else round(mx * mk * 2) / 2 end;
      ok := case when mk is null then null else mk >= 0.5 end;
    else
      mx := 1;
      if a is null or jsonb_typeof(a) = 'null' or given = '' then ok := false;
      elsif typ = 'mcq' then ok := jsonb_typeof(a) = 'number' and (a#>>'{}') = (q->>'answer');
      elsif typ = 'tf' then ok := jsonb_typeof(a) = 'boolean' and (a#>>'{}') = (q->>'answer');
      elsif typ = 'numerical' then
        begin
          sv := substring(replace(replace(given, ',', ''), ' ', '') from '^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?')::numeric; ans := (q->>'answer')::numeric;
          ok := sv is not null and abs(sv - ans) <= greatest(0.000001, abs(ans) * 0.01);
        exception when others then ok := false;
        end;
      elsif typ = 'fill' then ok := public.study_int_norm(given) = public.study_int_norm(q->>'answer');
      else ok := false;
      end if;
      if typ = 'fill' and not coalesce(ok, false) and mk is not null then ok := mk >= 0.5; is_open := true; end if;
      sc := case when coalesce(ok, false) then mx else 0 end;
    end if;
    total := total + sc; maxtotal := maxtotal + mx;
    results := results || jsonb_build_array(jsonb_build_object('i', i, 'correct', ok, 'score', sc, 'max', mx, 'open', is_open, 'answered', given <> ''));
    -- a wrong answer goes on the list of mistakes; a right answer to a question that was a mistake clears it
    qh := md5(lower(btrim(q->>'question')));
    right_ans := public.study_int_answer_text(q);
    if ok is false then
      wrong := wrong + 1;
      insert into public.study_mistakes (user_id, subject_id, quiz_id, qhash, question, question_json, correct_answer, student_answer)
      values (me, z.subject_id, z.id, qh, left(q->>'question', 700), q, right_ans, left(given, 700))
      on conflict (user_id, qhash) do update set wrong_count = public.study_mistakes.wrong_count + 1, resolved = false, resolved_at = null, last_wrong_at = now(),
        student_answer = excluded.student_answer, quiz_id = excluded.quiz_id, question_json = excluded.question_json, correct_answer = excluded.correct_answer;
    elsif ok is true then
      update public.study_mistakes set resolved = true, resolved_at = now() where user_id = me and qhash = qh and resolved = false;
    end if;
    i := i + 1;
  end loop;
  insert into public.study_quiz_attempts (user_id, quiz_id, client_ref, score, max_score, duration_sec, results)
  values (me, z.id, p_ref, total, maxtotal, greatest(0, least(coalesce(p_duration, 0), 86400)), results) returning * into att;
  perform public.study_int_log(me, 'practice', z.subject_id, ceil(greatest(0, coalesce(p_duration, 0)) / 60.0)::integer, jsonb_build_object('quiz', z.id, 'score', total, 'max', maxtotal));
  return jsonb_build_object('id', att.id, 'score', total, 'max', maxtotal, 'percent', round(total / nullif(maxtotal, 0) * 100), 'results', results, 'newMistakes', wrong, 'duplicate', false);
end;
$$;

create or replace function public.study_quiz_attempts_list(p_quiz uuid, p_limit integer default 10) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.study_int_uid();
begin
  return jsonb_build_object('attempts', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'score', a.score, 'max', a.max_score, 'percent', round(a.score / nullif(a.max_score, 0) * 100),
      'durationSec', a.duration_sec, 'createdAt', a.created_at) order by a.created_at desc)
    from (select * from public.study_quiz_attempts where quiz_id = p_quiz and user_id = me order by created_at desc limit greatest(1, least(coalesce(p_limit, 10), 50))) a), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------- mistakes
create or replace function public.study_int_mistake_json(m public.study_mistakes) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object('id', m.id, 'subjectId', m.subject_id, 'question', m.question, 'correctAnswer', m.correct_answer, 'studentAnswer', m.student_answer,
    'explanation', m.question_json->>'explanation', 'type', m.question_json->>'type', 'wrongCount', m.wrong_count, 'resolved', m.resolved, 'lastWrongAt', m.last_wrong_at);
$$;

create or replace function public.study_mistakes_list(p_subject uuid default null, p_open_only boolean default true, p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); lim integer := greatest(1, least(coalesce(p_limit, 50), 100));
begin
  return jsonb_build_object('mistakes', coalesce((select jsonb_agg(public.study_int_mistake_json(m) order by m.last_wrong_at desc)
      from (select * from public.study_mistakes where user_id = me and (p_subject is null or subject_id = p_subject) and (not coalesce(p_open_only, true) or resolved = false)
            order by last_wrong_at desc limit lim) m), '[]'::jsonb),
    'open', (select count(*) from public.study_mistakes where user_id = me and resolved = false and (p_subject is null or subject_id = p_subject)));
end;
$$;

create or replace function public.study_mistake_resolve(p_id uuid, p_resolved boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); m public.study_mistakes;
begin
  update public.study_mistakes set resolved = coalesce(p_resolved, true), resolved_at = case when coalesce(p_resolved, true) then now() else null end
  where id = p_id and user_id = me returning * into m;
  if not found then raise exception 'That mistake no longer exists.'; end if;
  return public.study_int_mistake_json(m);
end;
$$;

create or replace function public.study_mistake_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); n integer;
begin
  delete from public.study_mistakes where id = p_id and user_id = me;
  get diagnostics n = row_count;
  return jsonb_build_object('success', true, 'deleted', n > 0);
end;
$$;

-- a new quiz made of the student's own open mistakes (the oldest first, so nothing is left too long)
create or replace function public.study_quiz_from_mistakes(p_subject uuid default null, p_limit integer default 10) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); qs jsonb; row public.study_quizzes; subj uuid := public.study_int_own_subject(me, p_subject);
begin
  select coalesce(jsonb_agg(m.question_json order by m.last_wrong_at), '[]'::jsonb) into qs
  from (select question_json, last_wrong_at from public.study_mistakes where user_id = me and resolved = false and (subj is null or subject_id = subj)
        order by last_wrong_at limit greatest(1, least(coalesce(p_limit, 10), 20))) m;
  if jsonb_array_length(qs) = 0 then raise exception 'You have no mistakes to practise right now. That is good news.'; end if;
  insert into public.study_quizzes (user_id, subject_id, title, topic, difficulty, source, questions)
  values (me, subj, 'My mistakes', '', 'mixed', 'mistakes', qs) returning * into row;
  return public.study_int_quiz_json(row, true);
end;
$$;

-- ---------------------------------------------------------------- flashcards
create or replace function public.study_int_deck_json(d public.study_decks) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('id', d.id, 'title', d.title, 'subjectId', d.subject_id, 'materialId', d.material_id, 'createdAt', d.created_at,
    'total', (select count(*) from public.study_cards c where c.deck_id = d.id),
    'due', (select count(*) from public.study_cards c where c.deck_id = d.id and c.due_at <= now()),
    'fresh', (select count(*) from public.study_cards c where c.deck_id = d.id and c.reps = 0 and c.last_reviewed_at is null));
$$;

create or replace function public.study_deck_save(p_deck jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); x jsonb := case when jsonb_typeof(p_deck) = 'object' then p_deck else '{}'::jsonb end;
  did uuid := nullif(x->>'id', '')::uuid; cref uuid := nullif(x->>'clientRef', '')::uuid; subj uuid; mat uuid; ttl text := left(btrim(coalesce(x->>'title', '')), 100); row public.study_decks;
begin
  perform public.study_int_ensure_profile(me);
  perform 1 from public.study_profiles where user_id = me for update;
  if ttl = '' then raise exception 'Please give the deck a name.'; end if;
  subj := public.study_int_own_subject(me, nullif(x->>'subjectId', '')::uuid);
  mat := nullif(x->>'materialId', '')::uuid;
  if mat is not null and not exists (select 1 from public.study_materials where id = mat and user_id = me) then mat := null; end if;
  if did is not null then
    update public.study_decks set title = ttl, subject_id = subj, updated_at = now() where id = did and user_id = me returning * into row;
    if not found then raise exception 'That deck no longer exists.'; end if;
    return public.study_int_deck_json(row);
  end if;
  if cref is not null then
    select * into row from public.study_decks where user_id = me and client_ref = cref;
    if found then return public.study_int_deck_json(row); end if;
  end if;
  if (select count(*) from public.study_decks where user_id = me) >= 100 then raise exception 'You have 100 decks. Please delete some you no longer need.'; end if;
  insert into public.study_decks (user_id, client_ref, subject_id, material_id, title) values (me, cref, subj, mat, ttl) returning * into row;
  return public.study_int_deck_json(row);
end;
$$;

create or replace function public.study_decks_list(p_subject uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.study_int_uid();
begin
  return jsonb_build_object('decks', coalesce((select jsonb_agg(public.study_int_deck_json(d) order by d.created_at desc) from public.study_decks d
      where d.user_id = me and (p_subject is null or d.subject_id = p_subject)), '[]'::jsonb),
    'dueTotal', (select count(*) from public.study_cards where user_id = me and due_at <= now()));
end;
$$;

create or replace function public.study_deck_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); n integer;
begin
  delete from public.study_decks where id = p_id and user_id = me;
  get diagnostics n = row_count;
  return jsonb_build_object('success', true, 'deleted', n > 0);
end;
$$;

create or replace function public.study_cards_add(p_deck uuid, p_cards jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); d public.study_decks; c jsonb; f text; b text; added integer := 0; skipped integer := 0; total bigint;
begin
  select * into d from public.study_decks where id = p_deck and user_id = me for update;
  if not found then raise exception 'That deck no longer exists.'; end if;
  if jsonb_typeof(p_cards) is distinct from 'array' then raise exception 'There are no cards to add.'; end if;
  if jsonb_array_length(p_cards) > 60 then raise exception 'You can add up to 60 cards at once.'; end if;
  select count(*) into total from public.study_cards where user_id = me;
  for c in select * from jsonb_array_elements(p_cards) loop
    f := left(btrim(coalesce(c->>'front', '')), 300); b := left(btrim(coalesce(c->>'back', '')), 600);
    if f = '' or b = '' then skipped := skipped + 1; continue; end if;
    if total + added >= 5000 then raise exception 'You have 5,000 cards. Please delete some you no longer need.'; end if;
    insert into public.study_cards (deck_id, user_id, front, back, created_at) values (p_deck, me, f, b, now()) on conflict (deck_id, lower(front)) do nothing;
    if found then added := added + 1; else skipped := skipped + 1; end if;
  end loop;
  update public.study_decks set updated_at = now() where id = p_deck;
  return jsonb_build_object('added', added, 'skipped', skipped, 'deck', public.study_int_deck_json((select dd from public.study_decks dd where dd.id = p_deck)));
end;
$$;

create or replace function public.study_int_card_json(c public.study_cards, p_deck_title text default null) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object('id', c.id, 'deckId', c.deck_id, 'deckTitle', p_deck_title, 'front', c.front, 'back', c.back, 'reps', c.reps, 'lapses', c.lapses,
    'intervalDays', c.interval_days, 'dueAt', c.due_at, 'ease', c.ease, 'fresh', c.reps = 0 and c.last_reviewed_at is null);
$$;

create or replace function public.study_cards_list(p_deck uuid, p_limit integer default 60, p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); d public.study_decks;
begin
  select * into d from public.study_decks where id = p_deck and user_id = me;
  if not found then raise exception 'That deck no longer exists.'; end if;
  return jsonb_build_object('deck', public.study_int_deck_json(d), 'cards', coalesce((select jsonb_agg(public.study_int_card_json(c, d.title) order by c.seq)
    from (select * from public.study_cards where deck_id = p_deck order by seq limit greatest(1, least(coalesce(p_limit, 60), 200)) offset greatest(0, coalesce(p_offset, 0))) c), '[]'::jsonb));
end;
$$;

create or replace function public.study_card_save(p_card jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); x jsonb := case when jsonb_typeof(p_card) = 'object' then p_card else '{}'::jsonb end; cid uuid := nullif(x->>'id', '')::uuid;
  f text := left(btrim(coalesce(x->>'front', '')), 300); b text := left(btrim(coalesce(x->>'back', '')), 600); c public.study_cards;
begin
  if f = '' or b = '' then raise exception 'A card needs a front and a back.'; end if;
  if cid is null then raise exception 'That card no longer exists.'; end if;
  begin
    update public.study_cards set front = f, back = b where id = cid and user_id = me returning * into c;
  exception when unique_violation then raise exception 'This deck already has a card with that front.';
  end;
  if not found then raise exception 'That card no longer exists.'; end if;
  return public.study_int_card_json(c);
end;
$$;

create or replace function public.study_card_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); n integer;
begin
  delete from public.study_cards where id = p_id and user_id = me;
  get diagnostics n = row_count;
  return jsonb_build_object('success', true, 'deleted', n > 0);
end;
$$;

-- the cards that are due, the longest-waiting first (in one deck, or all)
create or replace function public.study_cards_due(p_deck uuid default null, p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.study_int_uid();
begin
  return jsonb_build_object('cards', coalesce((select jsonb_agg(public.study_int_card_json(x.c, x.title) order by x.due_at, x.seq)
      from (select c as c, c.due_at, c.seq, d.title from public.study_cards c join public.study_decks d on d.id = c.deck_id
            where c.user_id = me and c.due_at <= now() and (p_deck is null or c.deck_id = p_deck) order by c.due_at, c.seq limit greatest(1, least(coalesce(p_limit, 20), 100))) x), '[]'::jsonb),
    'dueTotal', (select count(*) from public.study_cards where user_id = me and due_at <= now() and (p_deck is null or deck_id = p_deck)));
end;
$$;

-- SM-2: quality 1 = again, 2 = hard, 3 = good, 4 = easy. "Again" shows the card again in 10 minutes and starts its steps over; otherwise the wait grows:
-- 1 day, then 6 days, then (last wait x ease). Ease goes up for easy answers, down for hard ones, and never below 1.3.
create or replace function public.study_card_review(p_card uuid, p_quality integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); c public.study_cards; q integer; e numeric; iv integer; r integer; l integer; due timestamptz;
begin
  if p_quality is null or p_quality < 1 or p_quality > 4 then raise exception 'Please choose how it went: again, hard, good or easy.'; end if;
  select * into c from public.study_cards where id = p_card and user_id = me for update;
  if not found then raise exception 'That card no longer exists.'; end if;
  q := case p_quality when 1 then 1 when 2 then 3 when 3 then 4 else 5 end;
  if q < 3 then
    r := 0; iv := 0; l := c.lapses + 1; e := greatest(1.3, c.ease - 0.2); due := now() + interval '10 minutes';
  else
    r := c.reps + 1; l := c.lapses;
    e := least(4.0, greatest(1.3, c.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))));
    iv := case r when 1 then 1 when 2 then 6 else greatest(c.interval_days + 1, round(c.interval_days * e)::integer) end;
    iv := least(iv, 3650);
    due := now() + make_interval(days => iv);
  end if;
  update public.study_cards set ease = e, interval_days = iv, reps = r, lapses = l, due_at = due, last_reviewed_at = now() where id = p_card returning * into c;
  return public.study_int_card_json(c);
end;
$$;

-- one line in the student's history for a finished round of cards (one per round, not one per card)
create or replace function public.study_review_done(p_deck uuid, p_count integer, p_seconds integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); subj uuid;
begin
  if p_deck is not null then select subject_id into subj from public.study_decks where id = p_deck and user_id = me; end if;
  perform public.study_int_log(me, 'review', subj, ceil(greatest(0, coalesce(p_seconds, 0)) / 60.0)::integer, jsonb_build_object('cards', greatest(0, least(coalesce(p_count, 0), 1000))));
  return jsonb_build_object('success', true);
end;
$$;

-- ---------------------------------------------------------------- topics (the student's own list; nothing here is made up for them)
create or replace function public.study_int_topic_json(t public.study_topics) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object('id', t.id, 'subjectId', t.subject_id, 'title', t.title, 'status', t.status, 'note', t.note, 'position', t.position);
$$;

create or replace function public.study_topics_list(p_subject uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); subj uuid := public.study_int_own_subject(me, p_subject);
begin
  if subj is null then raise exception 'Please choose a subject.'; end if;
  return jsonb_build_object('topics', coalesce((select jsonb_agg(public.study_int_topic_json(t) order by t.position, t.created_at, t.id)
    from public.study_topics t where t.user_id = me and t.subject_id = subj), '[]'::jsonb));
end;
$$;

create or replace function public.study_topic_save(p_topic jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); x jsonb := case when jsonb_typeof(p_topic) = 'object' then p_topic else '{}'::jsonb end; tid uuid := nullif(x->>'id', '')::uuid;
  subj uuid; ttl text := left(btrim(coalesce(x->>'title', '')), 120); st text := coalesce(nullif(x->>'status', ''), 'not_started'); t public.study_topics; pos integer;
begin
  if st not in ('not_started', 'learning', 'confident') then raise exception 'That status is not known.'; end if;
  if tid is not null then
    select * into t from public.study_topics where id = tid and user_id = me for update;
    if not found then raise exception 'That topic no longer exists.'; end if;
    if x ? 'title' and ttl = '' then raise exception 'Please write the topic.'; end if;
    begin
      update public.study_topics set title = case when x ? 'title' then ttl else title end, status = case when x ? 'status' then st else status end,
        note = case when x ? 'note' then left(btrim(coalesce(x->>'note', '')), 300) else note end, updated_at = now() where id = tid returning * into t;
    exception when unique_violation then raise exception 'You already have that topic in this subject.';
    end;
    return public.study_int_topic_json(t);
  end if;
  subj := public.study_int_own_subject(me, nullif(x->>'subjectId', '')::uuid);
  if subj is null then raise exception 'Please choose a subject.'; end if;
  if ttl = '' then raise exception 'Please write the topic.'; end if;
  perform public.study_int_ensure_profile(me);
  if (select count(*) from public.study_topics where user_id = me and subject_id = subj) >= 150 then raise exception 'This subject has 150 topics already.'; end if;
  select coalesce(max(position) + 1, 0) into pos from public.study_topics where subject_id = subj;
  begin
    insert into public.study_topics (user_id, subject_id, title, status, note, position) values (me, subj, ttl, st, left(btrim(coalesce(x->>'note', '')), 300), pos) returning * into t;
  exception when unique_violation then raise exception 'You already have that topic in this subject.';
  end;
  return public.study_int_topic_json(t);
end;
$$;

-- a pasted list, one topic a line (a syllabus the student has in front of them)
create or replace function public.study_topics_add_many(p_subject uuid, p_titles jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); subj uuid := public.study_int_own_subject(me, p_subject); v text; added integer := 0; skipped integer := 0; pos integer; have bigint;
begin
  if subj is null then raise exception 'Please choose a subject.'; end if;
  if jsonb_typeof(p_titles) is distinct from 'array' or jsonb_array_length(p_titles) > 100 then raise exception 'Please add up to 100 topics at once.'; end if;
  perform public.study_int_ensure_profile(me);
  select coalesce(max(position) + 1, 0), count(*) into pos, have from public.study_topics where subject_id = subj;
  for v in select left(btrim(x), 120) from jsonb_array_elements_text(p_titles) x loop
    if v = '' then skipped := skipped + 1; continue; end if;
    if have + added >= 150 then raise exception 'This subject has 150 topics already.'; end if;
    insert into public.study_topics (user_id, subject_id, title, position) values (me, subj, v, pos + added) on conflict (subject_id, lower(title)) do nothing;
    if found then added := added + 1; else skipped := skipped + 1; end if;
  end loop;
  return jsonb_build_object('added', added, 'skipped', skipped);
end;
$$;

create or replace function public.study_topic_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); n integer;
begin
  delete from public.study_topics where id = p_id and user_id = me;
  get diagnostics n = row_count;
  return jsonb_build_object('success', true, 'deleted', n > 0);
end;
$$;

-- ---------------------------------------------------------------- erasing
-- (as before, plus the choice "practice": quizzes, marks, mistakes and flashcards. "Everything" removes them too, as they hang on the study profile.)
create or replace function public.study_delete_my_data(p_scope text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); keys text[] := '{}'; k2 text[];
begin
  if p_scope not in ('activity', 'all', 'conversations', 'library', 'practice') then raise exception 'That choice is not known.'; end if;
  if p_scope in ('conversations', 'all') then
    select coalesce(array_agg(a->>'key'), '{}') into k2 from public.study_messages m, jsonb_array_elements(m.attachments) a where m.user_id = me and a->>'key' is not null;
    keys := keys || k2;
    delete from public.study_conversations where user_id = me;
  end if;
  if p_scope in ('library', 'all') then
    delete from public.study_materials where user_id = me;
  end if;
  if p_scope in ('practice', 'all') then
    delete from public.study_quizzes where user_id = me;
    delete from public.study_mistakes where user_id = me;
    delete from public.study_decks where user_id = me;
  end if;
  if p_scope in ('activity', 'all') then
    delete from public.study_events where user_id = me;
    delete from public.study_focus_sessions where user_id = me;
    delete from public.study_ai_usage where user_id = me;
  end if;
  if p_scope = 'all' then
    select coalesce(array_agg(attachment), '{}') into k2 from public.study_tasks where user_id = me and attachment is not null;
    keys := keys || k2;
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
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig, p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'study\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    if r.proname like 'study\_svc\_%' then execute format('grant execute on function %s to service_role', r.sig);
    elsif r.proname not like 'study\_int\_%' then execute format('grant execute on function %s to authenticated', r.sig);
    end if;
  end loop;
end;
$$;
