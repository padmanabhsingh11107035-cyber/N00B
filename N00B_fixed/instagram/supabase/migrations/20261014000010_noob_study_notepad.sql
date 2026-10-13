-- NOOB STUDY, part 10: the notepad and the sketch board, kept small. Notes are text; a sketch is saved as the lines drawn (a few numbers), never as a picture.
-- Both belong to the student alone, and (like chats) the administrator can never read them.
-- Safe to run more than once.

create table if not exists public.study_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.study_profiles(user_id) on delete cascade,
  client_ref uuid,
  subject_id uuid references public.study_subjects(id) on delete set null,
  title      text not null default '' check (char_length(title) <= 140),
  body       text not null default '' check (char_length(body) <= 50000),
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists study_notes_client_ref_uidx on public.study_notes (user_id, client_ref) where client_ref is not null;
create index if not exists study_notes_user_idx on public.study_notes (user_id, pinned desc, updated_at desc);
alter table public.study_notes enable row level security;

create table if not exists public.study_sketches (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.study_profiles(user_id) on delete cascade,
  client_ref uuid,
  title      text not null default '' check (char_length(title) <= 100),
  strokes    jsonb not null default '[]'::jsonb check (jsonb_typeof(strokes) = 'array'),
  width      integer not null default 800 check (width between 200 and 4000),
  height     integer not null default 600 check (height between 200 and 4000),
  paper      text not null default 'dark' check (paper in ('dark', 'light', 'grid', 'lines')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists study_sketches_client_ref_uidx on public.study_sketches (user_id, client_ref) where client_ref is not null;
create index if not exists study_sketches_user_idx on public.study_sketches (user_id, updated_at desc);
alter table public.study_sketches enable row level security;

-- ---------------------------------------------------------------- notes
create or replace function public.study_notes_list(p_subject uuid default null, p_search text default '') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); q text := '%' || replace(replace(replace(lower(btrim(coalesce(p_search, ''))), chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') || '%';
begin
  perform public.study_int_require_feature(me, 'notepad');
  return jsonb_build_object('notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'subjectId', n.subject_id, 'pinned', n.pinned,
        'preview', left(regexp_replace(n.body, '\s+', ' ', 'g'), 140), 'updatedAt', n.updated_at) order by n.pinned desc, n.updated_at desc)
      from (select * from public.study_notes where user_id = me and (p_subject is null or subject_id = p_subject)
              and (btrim(coalesce(p_search, '')) = '' or lower(title) like q escape chr(92) or lower(body) like q escape chr(92)) order by pinned desc, updated_at desc limit 200) n), '[]'::jsonb),
    'count', (select count(*) from public.study_notes where user_id = me), 'countMax', 300);
end;
$$;

create or replace function public.study_note_get(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); n public.study_notes;
begin
  perform public.study_int_require_feature(me, 'notepad');
  select * into n from public.study_notes where id = p_id and user_id = me;
  if not found then raise exception 'That note no longer exists.'; end if;
  return jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body, 'subjectId', n.subject_id, 'pinned', n.pinned, 'updatedAt', n.updated_at);
end;
$$;

-- Add (clientRef) or change (id). Used by "saved a moment ago" autosave, so saving the same thing twice is harmless.
create or replace function public.study_note_save(p_note jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); x jsonb := case when jsonb_typeof(p_note) = 'object' then p_note else '{}'::jsonb end; nid uuid := nullif(x->>'id', '')::uuid; cref uuid := nullif(x->>'clientRef', '')::uuid;
  n public.study_notes; subj uuid; nbody text := coalesce(x->>'body', ''); used bigint;
begin
  perform public.study_int_require_feature(me, 'notepad');
  if char_length(nbody) > 50000 then raise exception 'A note can have up to 50,000 letters. Please split it into two notes.'; end if;
  subj := public.study_int_own_subject(me, nullif(x->>'subjectId', '')::uuid);
  perform public.study_int_ensure_profile(me);
  perform 1 from public.study_profiles where user_id = me for update;
  select coalesce(sum(char_length(body)), 0) into used from public.study_notes where user_id = me and id is distinct from nid;
  if used + char_length(nbody) > 2000000 then raise exception 'Your notepad is full. Please delete notes you no longer need.'; end if;
  if nid is not null then
    update public.study_notes set title = case when x ? 'title' then left(btrim(coalesce(x->>'title', '')), 140) else title end, body = case when x ? 'body' then nbody else public.study_notes.body end,
      subject_id = case when x ? 'subjectId' then subj else subject_id end, pinned = case when x ? 'pinned' then coalesce((x->>'pinned')::boolean, false) else pinned end, updated_at = now()
    where id = nid and user_id = me returning * into n;
    if not found then raise exception 'That note no longer exists.'; end if;
  else
    if cref is not null then
      select * into n from public.study_notes where user_id = me and client_ref = cref;
      if found then return jsonb_build_object('id', n.id, 'updatedAt', n.updated_at); end if;
    end if;
    if (select count(*) from public.study_notes where user_id = me) >= 300 then raise exception 'You have 300 notes. Please delete some you no longer need.'; end if;
    insert into public.study_notes (user_id, client_ref, subject_id, title, body, pinned) values (me, cref, subj, left(btrim(coalesce(x->>'title', '')), 140), nbody, coalesce((x->>'pinned')::boolean, false)) returning * into n;
  end if;
  return jsonb_build_object('id', n.id, 'updatedAt', n.updated_at);
end;
$$;

create or replace function public.study_note_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); c integer;
begin
  delete from public.study_notes where id = p_id and user_id = me;
  get diagnostics c = row_count;
  return jsonb_build_object('success', true, 'deleted', c > 0);
end;
$$;

-- ---------------------------------------------------------------- sketches
create or replace function public.study_sketches_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.study_int_uid();
begin
  perform public.study_int_require_feature(me, 'notepad');
  return jsonb_build_object('sketches', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'paper', s.paper, 'strokes', jsonb_array_length(s.strokes), 'updatedAt', s.updated_at) order by s.updated_at desc)
      from (select * from public.study_sketches where user_id = me order by updated_at desc limit 100) s), '[]'::jsonb), 'count', (select count(*) from public.study_sketches where user_id = me), 'countMax', 100);
end;
$$;

create or replace function public.study_sketch_get(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); s public.study_sketches;
begin
  perform public.study_int_require_feature(me, 'notepad');
  select * into s from public.study_sketches where id = p_id and user_id = me;
  if not found then raise exception 'That sketch no longer exists.'; end if;
  return jsonb_build_object('id', s.id, 'title', s.title, 'strokes', s.strokes, 'width', s.width, 'height', s.height, 'paper', s.paper, 'updatedAt', s.updated_at);
end;
$$;

-- Lines only: each stroke is {t: pen or eraser, c: colour, w: width, p: [[x, y], ...]}. At most 3,000 strokes and about 300 KB, so a sketch stays tiny.
create or replace function public.study_sketch_save(p_sketch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); x jsonb := case when jsonb_typeof(p_sketch) = 'object' then p_sketch else '{}'::jsonb end; sid uuid := nullif(x->>'id', '')::uuid; cref uuid := nullif(x->>'clientRef', '')::uuid;
  st jsonb := coalesce(x->'strokes', '[]'::jsonb); s public.study_sketches; w integer := coalesce(nullif(x->>'width', '')::integer, 800); h integer := coalesce(nullif(x->>'height', '')::integer, 600); pp text := coalesce(nullif(x->>'paper', ''), 'dark'); k jsonb;
begin
  perform public.study_int_require_feature(me, 'notepad');
  if jsonb_typeof(st) <> 'array' or jsonb_array_length(st) > 3000 then raise exception 'This sketch has too many lines. Please clear some, or start a new sketch.'; end if;
  if octet_length(st::text) > 300000 then raise exception 'This sketch is too big. Please clear some, or start a new sketch.'; end if;
  for k in select * from jsonb_array_elements(st) loop
    if jsonb_typeof(k) <> 'object' or jsonb_typeof(k->'p') is distinct from 'array' or coalesce(k->>'t', 'pen') not in ('pen', 'eraser') then raise exception 'This sketch could not be saved. Please try again.'; end if;
  end loop;
  if w not between 200 and 4000 or h not between 200 and 4000 then raise exception 'This sketch could not be saved. Please try again.'; end if;
  if pp not in ('dark', 'light', 'grid', 'lines') then pp := 'dark'; end if;
  perform public.study_int_ensure_profile(me);
  perform 1 from public.study_profiles where user_id = me for update;
  if sid is not null then
    update public.study_sketches set title = case when x ? 'title' then left(btrim(coalesce(x->>'title', '')), 100) else title end, strokes = st, width = w, height = h, paper = pp, updated_at = now()
    where id = sid and user_id = me returning * into s;
    if not found then raise exception 'That sketch no longer exists.'; end if;
  else
    if cref is not null then
      select * into s from public.study_sketches where user_id = me and client_ref = cref;
      if found then return jsonb_build_object('id', s.id, 'updatedAt', s.updated_at); end if;
    end if;
    if (select count(*) from public.study_sketches where user_id = me) >= 100 then raise exception 'You have 100 sketches. Please delete some you no longer need.'; end if;
    insert into public.study_sketches (user_id, client_ref, title, strokes, width, height, paper) values (me, cref, left(btrim(coalesce(x->>'title', '')), 100), st, w, h, pp) returning * into s;
  end if;
  return jsonb_build_object('id', s.id, 'updatedAt', s.updated_at);
end;
$$;

create or replace function public.study_sketch_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); c integer;
begin
  delete from public.study_sketches where id = p_id and user_id = me;
  get diagnostics c = row_count;
  return jsonb_build_object('success', true, 'deleted', c > 0);
end;
$$;

-- ---------------------------------------------------------------- erasing (the last, complete version)
create or replace function public.study_delete_my_data(p_scope text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); keys text[] := '{}'; k2 text[];
begin
  if p_scope not in ('activity', 'all', 'conversations', 'library', 'practice', 'notepad') then raise exception 'That choice is not known.'; end if;
  if p_scope in ('conversations', 'all') then
    select coalesce(array_agg(a->>'key'), '{}') into k2 from public.study_messages m, jsonb_array_elements(m.attachments) a where m.user_id = me and a->>'key' is not null;
    keys := keys || k2;
    delete from public.study_conversations where user_id = me;
  end if;
  if p_scope in ('library', 'all') then delete from public.study_materials where user_id = me; end if;
  if p_scope in ('practice', 'all') then
    delete from public.study_quizzes where user_id = me;
    delete from public.study_mistakes where user_id = me;
    delete from public.study_decks where user_id = me;
    delete from public.study_tests where user_id = me;
    delete from public.study_test_hashes where user_id = me;
  end if;
  if p_scope in ('notepad', 'all') then
    delete from public.study_notes where user_id = me;
    delete from public.study_sketches where user_id = me;
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
