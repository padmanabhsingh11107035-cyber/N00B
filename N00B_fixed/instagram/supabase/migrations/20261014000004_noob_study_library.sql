-- NOOB STUDY, part 4: the library. A student's own notes, textbook pages and past papers, kept as searchable text (the original file is never stored).
-- The tutor can answer from them with numbered sources, and a student can search them. Everything is private to the student who added it.
-- Safe to run more than once.

-- ---------------------------------------------------------------- tables
create table if not exists public.study_materials (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.study_profiles(user_id) on delete cascade,
  client_ref   uuid,
  subject_id   uuid references public.study_subjects(id) on delete set null,
  title        text not null check (char_length(title) between 1 and 140),
  kind         text not null default 'notes' check (kind in ('notes', 'pdf', 'text', 'image', 'pyq', 'research')),
  source_name  text not null default '' check (char_length(source_name) <= 200),
  pages        integer check (pages is null or pages between 1 and 2000),
  char_count   integer not null default 0,
  chunk_count  integer not null default 0,
  status       text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  note         text not null default '' check (char_length(note) <= 300),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists study_materials_client_ref_uidx on public.study_materials (user_id, client_ref) where client_ref is not null;
create index if not exists study_materials_user_idx on public.study_materials (user_id, created_at desc);
alter table public.study_materials enable row level security;

create table if not exists public.study_chunks (
  id          bigint generated always as identity primary key,
  material_id uuid not null references public.study_materials(id) on delete cascade,
  user_id     uuid not null,
  idx         integer not null,
  page        integer check (page is null or page between 1 and 2000),
  text        text not null check (char_length(text) between 1 and 4000),
  tsv         tsvector generated always as (to_tsvector('simple', text)) stored
);
create unique index if not exists study_chunks_order_uidx on public.study_chunks (material_id, idx);
create index if not exists study_chunks_tsv_idx on public.study_chunks using gin (tsv);
create index if not exists study_chunks_user_idx on public.study_chunks (user_id);
alter table public.study_chunks enable row level security;

-- ---------------------------------------------------------------- helpers
create or replace function public.study_int_material_json(m public.study_materials) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object('id', m.id, 'title', m.title, 'kind', m.kind, 'subjectId', m.subject_id, 'sourceName', m.source_name, 'pages', m.pages,
    'charCount', m.char_count, 'chunkCount', m.chunk_count, 'status', m.status, 'note', m.note, 'createdAt', m.created_at);
$$;

create or replace function public.study_int_own_material(p_user uuid, p_id uuid) returns public.study_materials
language plpgsql stable security definer set search_path = public as $$
declare m public.study_materials;
begin
  select * into m from public.study_materials where id = p_id and user_id = p_user;
  if not found then raise exception 'That document no longer exists.'; end if;
  return m;
end;
$$;

-- The useful words of a question ("what is newton's second law?" -> newton, second, law): no common words, no punctuation of any script.
create or replace function public.study_int_terms(p_text text) returns text[]
language plpgsql immutable set search_path = public as $$
declare w text; out text[] := '{}';
  stop text[] := array['the','and','for','are','was','were','what','which','when','where','who','whom','why','how','this','that','these','those','with','from','into','about','does','did','can','could','would','should','have','has','had','not','but','you','your','its','their','there','then','than','also','any','some','explain','tell','give','please','write'];
begin
  for w in select distinct lower(t) from unnest(regexp_split_to_array(left(coalesce(p_text, ''), 400), '[\s!-/:-@\[-`{-~–—…“”‘’«»।]+')) t where char_length(t) >= 3 limit 60 loop
    if w = any (stop) then continue; end if;
    out := out || w;
    exit when cardinality(out) >= 24;
  end loop;
  return out;
end;
$$;

-- the same words as a search expression (used only to mark the matching words in a result)
create or replace function public.study_int_ortsquery(p_text text) returns tsquery
language plpgsql immutable set search_path = public as $$
declare t text[] := public.study_int_terms(p_text);
begin
  if cardinality(t) = 0 then return null; end if;
  return to_tsquery('simple', (select string_agg(quote_literal(x), ' | ') from unnest(t) x));
exception when others then return null;
end;
$$;

-- The pieces of the student's own documents that best answer a question. A piece scores for every question word it contains, and a word that is
-- found in few pieces counts for more than one found everywhere ("second" says more than "law"), so the page about the second law beats the first.
create or replace function public.study_int_find(p_user uuid, p_material uuid, p_subject uuid, p_query text, p_limit integer)
returns table (material_id uuid, title text, page integer, idx integer, text text, score numeric)
language plpgsql stable security definer set search_path = public as $$
declare terms text[] := public.study_int_terms(p_query); tot bigint;
begin
  if cardinality(terms) = 0 then return; end if;
  select count(*) into tot from public.study_chunks c join public.study_materials m on m.id = c.material_id
    where c.user_id = p_user and m.status = 'ready' and (p_material is null or c.material_id = p_material) and (p_subject is null or m.subject_id = p_subject);
  if tot = 0 then return; end if;
  return query
  with t as (select x as term, to_tsquery('simple', quote_literal(x)) as tq from unnest(terms) x),
       d as (select t.term, t.tq, (select count(*) from public.study_chunks c2 join public.study_materials m2 on m2.id = c2.material_id
               where c2.user_id = p_user and m2.status = 'ready' and (p_material is null or c2.material_id = p_material) and (p_subject is null or m2.subject_id = p_subject)
                 and c2.tsv @@ t.tq) as n from t)
  select c.material_id, m.title, c.page, c.idx, c.text, sum(ln(1 + tot::numeric / d.n))::numeric as score
  from public.study_chunks c join public.study_materials m on m.id = c.material_id join d on d.n > 0 and c.tsv @@ d.tq
  where c.user_id = p_user and m.status = 'ready' and (p_material is null or c.material_id = p_material) and (p_subject is null or m.subject_id = p_subject)
  group by c.id, c.material_id, m.title, c.page, c.idx, c.text
  order by score desc, c.material_id, c.idx
  limit greatest(1, least(coalesce(p_limit, 5), 25));
exception when others then return;
end;
$$;

-- ---------------------------------------------------------------- adding a document
create or replace function public.study_material_create(p_title text, p_subject uuid, p_kind text, p_source_name text, p_pages integer, p_ref uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); subj uuid := public.study_int_own_subject(me, p_subject); row public.study_materials; ttl text := left(btrim(coalesce(p_title, '')), 140);
begin
  if ttl = '' then raise exception 'Please give the document a name.'; end if;
  if coalesce(p_kind, 'notes') not in ('notes', 'pdf', 'text', 'image', 'pyq', 'research') then raise exception 'That kind of document is not known.'; end if;
  insert into public.study_profiles (user_id, display_name)
  select me, left(coalesce(nullif(btrim(display_name), ''), username), 60) from public.profiles where id = me
  on conflict (user_id) do nothing;
  perform 1 from public.study_profiles where user_id = me for update;
  if p_ref is not null then
    select * into row from public.study_materials where user_id = me and client_ref = p_ref;
    if found then return public.study_int_material_json(row); end if;
  end if;
  if (select count(*) from public.study_materials where user_id = me) >= 60 then raise exception 'Your library is full (60 documents). Please delete one you no longer need.'; end if;
  insert into public.study_materials (user_id, client_ref, subject_id, title, kind, source_name, pages)
  values (me, p_ref, subj, ttl, coalesce(p_kind, 'notes'), left(coalesce(p_source_name, ''), 200), case when p_pages between 1 and 2000 then p_pages else null end)
  returning * into row;
  return public.study_int_material_json(row);
end;
$$;

-- text in small pieces, in order; each piece may carry the page it came from
create or replace function public.study_material_add_chunks(p_id uuid, p_chunks jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); m public.study_materials; item jsonb; t text; pg integer; added integer := 0; chars integer := 0; nxt integer; total bigint;
begin
  m := public.study_int_own_material(me, p_id);
  if m.status <> 'processing' then raise exception 'This document is already finished. Please add a new one.'; end if;
  if jsonb_typeof(p_chunks) is distinct from 'array' then raise exception 'There is no text to add.'; end if;
  if jsonb_array_length(p_chunks) > 40 then raise exception 'Please send the text in smaller pieces.'; end if;
  select coalesce(max(idx) + 1, 0) into nxt from public.study_chunks where material_id = p_id;
  for item in select * from jsonb_array_elements(p_chunks) loop
    t := btrim(coalesce(item->>'text', ''));
    if t = '' then continue; end if;
    if char_length(t) > 4000 then raise exception 'One piece of text is too long. Please send smaller pieces.'; end if;
    pg := case when coalesce(item->>'page', '') ~ '^\d{1,4}$' and (item->>'page')::integer between 1 and 2000 then (item->>'page')::integer else null end;
    insert into public.study_chunks (material_id, user_id, idx, page, text) values (p_id, me, nxt + added, pg, t);
    added := added + 1; chars := chars + char_length(t);
  end loop;
  if m.char_count + chars > 800000 then raise exception 'This document is too long (about 800,000 letters is the most). Please add it in parts.'; end if;
  select coalesce(sum(char_count), 0) into total from public.study_materials where user_id = me and id <> p_id;
  if total + m.char_count + chars > 4000000 then raise exception 'Your library is full. Please delete a document you no longer need.'; end if;
  update public.study_materials set char_count = char_count + chars, chunk_count = chunk_count + added, updated_at = now() where id = p_id returning * into m;
  return jsonb_build_object('added', added, 'material', public.study_int_material_json(m));
end;
$$;

create or replace function public.study_material_finish(p_id uuid, p_note text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); m public.study_materials;
begin
  m := public.study_int_own_material(me, p_id);
  if m.status <> 'processing' then return public.study_int_material_json(m); end if;
  if m.chunk_count = 0 then
    update public.study_materials set status = 'failed', note = left(coalesce(nullif(btrim(p_note), ''), 'No readable text was found in this document.'), 300), updated_at = now() where id = p_id returning * into m;
  else
    update public.study_materials set status = 'ready', note = left(coalesce(btrim(p_note), ''), 300), updated_at = now() where id = p_id returning * into m;
  end if;
  return public.study_int_material_json(m);
end;
$$;

-- ---------------------------------------------------------------- reading, searching, changing, removing
create or replace function public.study_materials_list(p_subject uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.study_int_uid();
begin
  return jsonb_build_object('materials', coalesce((select jsonb_agg(public.study_int_material_json(m) order by m.created_at desc) from public.study_materials m
    where m.user_id = me and (p_subject is null or m.subject_id = p_subject)), '[]'::jsonb),
    'charsUsed', coalesce((select sum(char_count) from public.study_materials where user_id = me), 0), 'charsMax', 4000000, 'count', (select count(*) from public.study_materials where user_id = me), 'countMax', 60);
end;
$$;

create or replace function public.study_material_get(p_id uuid, p_after integer default -1, p_limit integer default 12) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); m public.study_materials; lim integer := greatest(1, least(coalesce(p_limit, 12), 40)); rows jsonb; n integer;
begin
  m := public.study_int_own_material(me, p_id);
  select coalesce(jsonb_agg(jsonb_build_object('idx', c.idx, 'page', c.page, 'text', c.text) order by c.idx), '[]'::jsonb) into rows
    from (select idx, page, text from public.study_chunks where material_id = p_id and idx > coalesce(p_after, -1) order by idx limit lim) c;
  select count(*) into n from public.study_chunks where material_id = p_id and idx > coalesce(p_after, -1);
  return jsonb_build_object('material', public.study_int_material_json(m), 'chunks', rows, 'more', n > lim);
end;
$$;

create or replace function public.study_material_update(p_id uuid, p_title text, p_subject uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); subj uuid := public.study_int_own_subject(me, p_subject); m public.study_materials; ttl text := left(btrim(coalesce(p_title, '')), 140);
begin
  m := public.study_int_own_material(me, p_id);
  if ttl = '' then raise exception 'Please give the document a name.'; end if;
  update public.study_materials set title = ttl, subject_id = subj, updated_at = now() where id = p_id returning * into m;
  return public.study_int_material_json(m);
end;
$$;

create or replace function public.study_material_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); n integer;
begin
  delete from public.study_materials where id = p_id and user_id = me;
  get diagnostics n = row_count;
  return jsonb_build_object('success', true, 'deleted', n > 0);
end;
$$;

-- the student's search over their own library (one document, one subject, or all)
create or replace function public.study_material_search(p_query text, p_subject uuid default null, p_material uuid default null, p_limit integer default 10) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); hq tsquery := public.study_int_ortsquery(p_query); lim integer := greatest(1, least(coalesce(p_limit, 10), 25));
begin
  return jsonb_build_object('hits', coalesce((
    select jsonb_agg(jsonb_build_object('materialId', h.material_id, 'title', h.title, 'page', h.page, 'idx', h.idx, 'rank', round(h.score, 3),
             'snippet', case when hq is null then left(h.text, 240) else ts_headline('simple', h.text, hq, 'MaxFragments=1, MaxWords=34, MinWords=12, StartSel=⟦, StopSel=⟧') end) order by h.score desc, h.idx)
    from public.study_int_find(me, p_material, p_subject, p_query, lim) h), '[]'::jsonb));
end;
$$;

-- What the tutor reads for one question: the best-matching pieces of ONE chosen document of the student's (never anybody else's), with the numbers
-- that the answer's [1], [2] refer to. With no usable question words (or a request for a summary), the start of the document is used.
drop function if exists public.study_int_chunks(uuid, uuid, text);
create or replace function public.study_int_chunks(p_user uuid, p_material uuid, p_query text, p_limit integer default 5) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m public.study_materials; lim integer := greatest(1, least(coalesce(p_limit, 5), 12)); rows jsonb;
begin
  if p_material is null then return '[]'::jsonb; end if;
  select * into m from public.study_materials where id = p_material and user_id = p_user and status = 'ready';
  if not found then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('n', x.n, 'title', x.title, 'page', x.page, 'text', x.text) order by x.n), '[]'::jsonb) into rows
  from (select row_number() over (order by f.score desc, f.idx) as n, f.title, f.page, f.text from public.study_int_find(p_user, p_material, null, p_query, lim) f) x;
  if jsonb_array_length(rows) > 0 then return rows; end if;
  select coalesce(jsonb_agg(jsonb_build_object('n', x.n, 'title', m.title, 'page', x.page, 'text', x.text) order by x.n), '[]'::jsonb) into rows
  from (select row_number() over (order by c.idx) as n, c.page, c.text from (select page, text, idx from public.study_chunks where material_id = p_material order by idx limit least(lim, 4)) c) x;
  return rows;
end;
$$;

-- ---------------------------------------------------------------- erasing
-- (the same as before, plus the new choice "library"; "everything" removes the library too, because it is tied to the study profile)
create or replace function public.study_delete_my_data(p_scope text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); keys text[] := '{}'; k2 text[];
begin
  if p_scope not in ('activity', 'all', 'conversations', 'library') then raise exception 'That choice is not known.'; end if;
  if p_scope in ('conversations', 'all') then
    select coalesce(array_agg(a->>'key'), '{}') into k2 from public.study_messages m, jsonb_array_elements(m.attachments) a where m.user_id = me and a->>'key' is not null;
    keys := keys || k2;
    delete from public.study_conversations where user_id = me;
  end if;
  if p_scope in ('library', 'all') then
    delete from public.study_materials where user_id = me;
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
