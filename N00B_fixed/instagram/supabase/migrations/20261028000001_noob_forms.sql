-- NOOB Forms: forms people build in the app and send anywhere; anyone can fill a published form without an account.
--
-- What it adds (nothing that exists is changed, no row is touched):
--   public.forms           one row per form: the draft the owner edits, the published copy people fill, the status and the address (slug)
--   public.form_responses  one row per filled form; only the owner can read or delete them, people filling a form can only add through form_public_submit
--   form_public_get(slug)    what a person opening the link may see: the published copy, never the draft, never other people's answers
--   form_public_submit(...)  checks every answer on the server (required, type, options, limits, closed / dates / maximum), then saves it
--   form_publish(id)         owner only: checks the draft and makes it the published copy (version + 1)
-- Answers of other people are never readable by a person filling a form. Deleting an account deletes its forms and their answers.

create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'Untitled form' check (char_length(title) <= 200),
  description text not null default '' check (char_length(description) <= 2000),
  slug text unique check (slug is null or slug ~ '^[a-z0-9]{8,24}$'),
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  draft jsonb not null default '{"questions":[],"settings":{},"theme":{}}'::jsonb check (pg_column_size(draft) <= 400000),
  published jsonb check (published is null or pg_column_size(published) <= 400000),
  version int not null default 0,
  response_count int not null default 0,
  starred boolean not null default false,
  folder text check (folder is null or char_length(folder) <= 60),
  archived_at timestamptz,
  deleted_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists forms_owner_idx on public.forms (owner_id, updated_at desc);

create table if not exists public.form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  version int not null default 1,
  answers jsonb not null check (pg_column_size(answers) <= 100000),
  meta jsonb not null default '{}'::jsonb check (pg_column_size(meta) <= 4000),
  created_at timestamptz not null default now()
);
create index if not exists form_responses_form_idx on public.form_responses (form_id, created_at desc);

alter table public.forms enable row level security;
alter table public.form_responses enable row level security;
revoke all on public.forms, public.form_responses from public, anon, authenticated;
grant select, insert, update, delete on public.forms to authenticated;
grant select, delete on public.form_responses to authenticated;

drop policy if exists forms_owner on public.forms;
create policy forms_owner on public.forms for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists form_responses_owner_read on public.form_responses;
create policy form_responses_owner_read on public.form_responses for select to authenticated using (exists (select 1 from public.forms f where f.id = form_id and f.owner_id = auth.uid()));
drop policy if exists form_responses_owner_delete on public.form_responses;
create policy form_responses_owner_delete on public.form_responses for delete to authenticated using (exists (select 1 from public.forms f where f.id = form_id and f.owner_id = auth.uid()));

-- the number of answers on a form, kept by the database itself
create or replace function public.forms_count_responses() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then update public.forms set response_count = response_count + 1 where id = new.form_id;
  else update public.forms set response_count = greatest(0, response_count - 1) where id = old.form_id; end if;
  return null;
end $$;
revoke all on function public.forms_count_responses() from public, anon, authenticated;
drop trigger if exists forms_count_responses_trg on public.form_responses;
create trigger forms_count_responses_trg after insert or delete on public.form_responses for each row execute function public.forms_count_responses();

create or replace function public.forms_touch() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists forms_touch_trg on public.forms;
create trigger forms_touch_trg before update on public.forms for each row execute function public.forms_touch();

-- does a question show for these answers? (the one rule: "show if <question> <op> <value>"; the browser uses the same rule, see src/utils/forms.ts)
create or replace function public.form_q_visible(q jsonb, answers jsonb) returns boolean language plpgsql immutable set search_path = public as $$
declare c jsonb := q -> 'showIf'; a jsonb; v jsonb; op text;
begin
  if c is null or jsonb_typeof(c) <> 'object' then return true; end if;
  a := answers -> (c ->> 'q'); v := c -> 'value'; op := c ->> 'op';
  if op = 'empty' then return a is null or a = '""'::jsonb or a = '[]'::jsonb; end if;
  if op = 'notEmpty' then return not (a is null or a = '""'::jsonb or a = '[]'::jsonb); end if;
  if a is null then return op = 'neq'; end if;
  if op = 'eq' then return a = v or (jsonb_typeof(a) = 'array' and a @> jsonb_build_array(v)); end if;
  if op = 'neq' then return not (a = v or (jsonb_typeof(a) = 'array' and a @> jsonb_build_array(v))); end if;
  if op = 'contains' then return jsonb_typeof(a) = 'array' and a @> jsonb_build_array(v) or (jsonb_typeof(a) = 'string' and position(lower(v #>> '{}') in lower(a #>> '{}')) > 0); end if;
  if op in ('gt', 'lt') and jsonb_typeof(a) = 'number' and jsonb_typeof(v) = 'number' then
    return case when op = 'gt' then (a #>> '{}')::numeric > (v #>> '{}')::numeric else (a #>> '{}')::numeric < (v #>> '{}')::numeric end;
  end if;
  return true;
end $$;

-- what a person who opened the link may see
create or replace function public.form_public_get(p_slug text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare f public.forms; s jsonb; closed text := null;
begin
  select * into f from public.forms where slug = lower(p_slug) and deleted_at is null and archived_at is null;
  if not found or f.published is null or f.status = 'draft' then return jsonb_build_object('state', 'notfound'); end if;
  s := coalesce(f.published -> 'settings', '{}'::jsonb);
  if f.status = 'closed' then closed := 'closed'; end if;
  if s ->> 'opensAt' is not null and (s ->> 'opensAt')::timestamptz > now() then closed := 'notopen'; end if;
  if s ->> 'closesAt' is not null and (s ->> 'closesAt')::timestamptz <= now() then closed := 'closed'; end if;
  if (s ->> 'maxResponses') ~ '^[0-9]+$' and f.response_count >= (s ->> 'maxResponses')::int then closed := 'closed'; end if;
  return jsonb_build_object('state', coalesce(closed, 'open'), 'title', f.title, 'description', f.description, 'version', f.version,
    'questions', coalesce(f.published -> 'questions', '[]'::jsonb), 'theme', coalesce(f.published -> 'theme', '{}'::jsonb), 'settings', s);
end $$;

-- a person fills a form: every answer is checked here, whatever the browser did
create or replace function public.form_public_submit(p_slug text, p_answers jsonb, p_meta jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare f public.forms; s jsonb; q jsonb; qid text; t text; a jsonb; clean jsonb := '{}'::jsonb; opts jsonb; item jsonb; n numeric; txt text; mn numeric; mx numeric; cnt int; ok boolean; new_id uuid; m jsonb; lim int; lo numeric; hi numeric;
begin
  select * into f from public.forms where slug = lower(p_slug) and deleted_at is null and archived_at is null for update;
  if not found or f.published is null or f.status = 'draft' then return jsonb_build_object('ok', false, 'error', 'notfound'); end if;
  s := coalesce(f.published -> 'settings', '{}'::jsonb);
  if f.status = 'closed' then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  if s ->> 'opensAt' is not null and (s ->> 'opensAt')::timestamptz > now() then return jsonb_build_object('ok', false, 'error', 'notopen'); end if;
  if s ->> 'closesAt' is not null and (s ->> 'closesAt')::timestamptz <= now() then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  if (s ->> 'maxResponses') ~ '^[0-9]+$' and f.response_count >= (s ->> 'maxResponses')::int then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 100000 then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  select count(*) into cnt from public.form_responses where form_id = f.id and created_at > now() - interval '1 minute';
  if cnt >= 120 then return jsonb_build_object('ok', false, 'error', 'busy'); end if;

  for q in select * from jsonb_array_elements(coalesce(f.published -> 'questions', '[]'::jsonb)) loop
    qid := q ->> 'id'; t := q ->> 'type';
    if t in ('section', 'text_block') or qid is null then continue; end if;
    if not public.form_q_visible(q, clean) then continue; end if;
    a := p_answers -> qid;
    if a is null or a = 'null'::jsonb or a = '""'::jsonb or a = '[]'::jsonb or a = 'false'::jsonb and t = 'consent' then
      if coalesce((q ->> 'required')::boolean, false) then return jsonb_build_object('ok', false, 'error', 'required', 'question', qid); end if;
      continue;
    end if;
    opts := coalesce(q -> 'options', '[]'::jsonb);
    mn := nullif(q ->> 'min', '')::numeric; mx := nullif(q ->> 'max', '')::numeric;
    if t in ('short', 'paragraph', 'email', 'phone', 'url') then
      if jsonb_typeof(a) <> 'string' then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
      txt := a #>> '{}';
      lim := case when t = 'paragraph' then 5000 else 500 end;
      if char_length(txt) > lim then return jsonb_build_object('ok', false, 'error', 'toolong', 'question', qid); end if;
      if t = 'email' and txt !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
      if t = 'url' and txt !~* '^https?://[^\s]+$' then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
      if t = 'phone' and txt !~ '^[0-9+()\-\s]{6,20}$' then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
      if mn is not null and char_length(txt) < mn and t in ('short', 'paragraph') then return jsonb_build_object('ok', false, 'error', 'tooshort', 'question', qid); end if;
      if mx is not null and char_length(txt) > mx and t in ('short', 'paragraph') then return jsonb_build_object('ok', false, 'error', 'toolong', 'question', qid); end if;
      clean := clean || jsonb_build_object(qid, to_jsonb(txt));
    elsif t = 'number' then
      if jsonb_typeof(a) <> 'number' then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
      n := (a #>> '{}')::numeric;
      if (mn is not null and n < mn) or (mx is not null and n > mx) then return jsonb_build_object('ok', false, 'error', 'range', 'question', qid); end if;
      clean := clean || jsonb_build_object(qid, a);
    elsif t in ('multiple_choice', 'dropdown') then
      if jsonb_typeof(a) <> 'string' then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
      txt := a #>> '{}'; ok := false;
      for item in select * from jsonb_array_elements(opts) loop if item ->> 'id' = txt then ok := true; end if; end loop;
      if not ok and left(txt, 6) = 'other:' and coalesce((q ->> 'allowOther')::boolean, false) and char_length(txt) <= 306 then ok := true; end if;
      if not ok then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
      clean := clean || jsonb_build_object(qid, a);
    elsif t = 'checkboxes' then
      if jsonb_typeof(a) <> 'array' or jsonb_array_length(a) > 50 then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
      for item in select * from jsonb_array_elements(a) loop
        txt := item #>> '{}'; ok := false;
        if jsonb_typeof(item) = 'string' then
          if exists (select 1 from jsonb_array_elements(opts) o where o ->> 'id' = txt) then ok := true; end if;
          if not ok and left(txt, 6) = 'other:' and coalesce((q ->> 'allowOther')::boolean, false) and char_length(txt) <= 306 then ok := true; end if;
        end if;
        if not ok then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
      end loop;
      if (mn is not null and jsonb_array_length(a) < mn) or (mx is not null and jsonb_array_length(a) > mx) then return jsonb_build_object('ok', false, 'error', 'range', 'question', qid); end if;
      clean := clean || jsonb_build_object(qid, a);
    elsif t in ('scale', 'rating', 'nps') then
      if jsonb_typeof(a) <> 'number' then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
      n := (a #>> '{}')::numeric;
      lo := coalesce(mn, case when t = 'nps' then 0 else 1 end); hi := coalesce(mx, case when t = 'nps' then 10 else 5 end);
      if n <> trunc(n) or n < lo or n > hi then return jsonb_build_object('ok', false, 'error', 'range', 'question', qid); end if;
      clean := clean || jsonb_build_object(qid, a);
    elsif t = 'date' then
      if jsonb_typeof(a) <> 'string' or (a #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
      clean := clean || jsonb_build_object(qid, a);
    elsif t = 'time' then
      if jsonb_typeof(a) <> 'string' or (a #>> '{}') !~ '^\d{2}:\d{2}$' then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
      clean := clean || jsonb_build_object(qid, a);
    elsif t = 'consent' then
      if a <> 'true'::jsonb then return jsonb_build_object('ok', false, 'error', 'required', 'question', qid); end if;
      clean := clean || jsonb_build_object(qid, a);
    end if;
  end loop;

  -- only a few harmless things are kept about the visit, and only what the form's own settings ask for (campaign tags from the link)
  m := '{}'::jsonb;
  if p_meta is not null and jsonb_typeof(p_meta -> 'utm') = 'object' and coalesce((s ->> 'collectCampaign')::boolean, false) then
    m := jsonb_build_object('utm', (select coalesce(jsonb_object_agg(k, left(v #>> '{}', 100)), '{}'::jsonb) from jsonb_each(p_meta -> 'utm') as e(k, v) where k in ('source', 'medium', 'campaign') and jsonb_typeof(v) = 'string'));
  end if;
  insert into public.form_responses (form_id, version, answers, meta) values (f.id, f.version, clean, m) returning id into new_id;
  return jsonb_build_object('ok', true, 'id', new_id);
end $$;

-- the owner publishes: the draft is checked and becomes the copy people fill
create or replace function public.form_publish(p_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare f public.forms; q jsonb; problems jsonb := '[]'::jsonb; ids text[] := '{}'; real_count int := 0; sl text; tries int := 0;
begin
  select * into f from public.forms where id = p_id and owner_id = auth.uid() and deleted_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'problems', jsonb_build_array('Form not found')); end if;
  if btrim(f.title) = '' then problems := problems || jsonb_build_array('The form needs a title'); end if;
  for q in select * from jsonb_array_elements(coalesce(f.draft -> 'questions', '[]'::jsonb)) loop
    if coalesce(q ->> 'type', '') = '' or coalesce(q ->> 'id', '') = '' then problems := problems || jsonb_build_array('A question is damaged'); continue; end if;
    if q ->> 'id' = any (ids) then problems := problems || jsonb_build_array('Two questions share an id'); end if;
    ids := ids || (q ->> 'id');
    if q ->> 'type' not in ('section', 'text_block') then
      real_count := real_count + 1;
      if btrim(coalesce(q ->> 'title', '')) = '' then problems := problems || jsonb_build_array('A question has no title'); end if;
      if q ->> 'type' in ('multiple_choice', 'dropdown', 'checkboxes') and jsonb_array_length(coalesce(q -> 'options', '[]'::jsonb)) < 1 then problems := problems || jsonb_build_array('"' || coalesce(q ->> 'title', '') || '" needs at least one option'); end if;
    end if;
  end loop;
  if real_count = 0 then problems := problems || jsonb_build_array('Add at least one question'); end if;
  if jsonb_array_length(problems) > 0 then return jsonb_build_object('ok', false, 'problems', problems); end if;
  sl := f.slug;
  while sl is null loop
    sl := substr(replace(gen_random_uuid()::text, '-', ''), 1, 14);
    if exists (select 1 from public.forms where slug = sl) then sl := null; tries := tries + 1; if tries > 20 then raise exception 'no free address'; end if; end if;
  end loop;
  update public.forms set published = draft, version = version + 1, status = 'published', slug = sl, published_at = now() where id = f.id;
  return jsonb_build_object('ok', true, 'slug', sl, 'version', f.version + 1);
end $$;

revoke all on function public.form_q_visible(jsonb, jsonb), public.form_public_get(text), public.form_public_submit(text, jsonb, jsonb), public.form_publish(uuid) from public, anon, authenticated;
grant execute on function public.form_public_get(text), public.form_public_submit(text, jsonb, jsonb) to anon, authenticated;
grant execute on function public.form_publish(uuid), public.form_q_visible(jsonb, jsonb) to authenticated;
