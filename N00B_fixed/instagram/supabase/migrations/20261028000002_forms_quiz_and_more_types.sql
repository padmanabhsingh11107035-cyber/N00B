-- NOOB Forms, part 2: quiz mode (points, correct answers, explanations, a pass mark), more question types (image choice, ranking, grids, hearts, thumbs, hidden fields, signature),
-- "end the form here" rules, and the score kept with each answer.
--
-- Nothing is removed and no row is touched. The only change to a table is two new empty columns on form_responses. The two functions people use (form_public_get, form_public_submit)
-- are replaced by versions that know the new types. The correct answers are NEVER sent to a person filling the form: form_public_get strips them; they come back only inside the
-- result a person gets after sending, and only if the owner switched "show the right answers" on.

alter table public.form_responses add column if not exists score numeric;
alter table public.form_responses add column if not exists max_score numeric;

-- is this answer the right one? (quiz questions only: the owner writes the right answer into the question as "correct")
create or replace function public.form_q_correct(q jsonb, a jsonb) returns boolean language plpgsql immutable set search_path = public as $$
declare c jsonb := q -> 'correct'; t text := q ->> 'type'; txt text;
begin
  if c is null or a is null then return false; end if;
  if t in ('multiple_choice', 'dropdown', 'thumbs') or (t = 'image_choice' and not coalesce((q ->> 'multi')::boolean, false)) then return a = c; end if;
  if t = 'checkboxes' or t = 'image_choice' then return jsonb_typeof(a) = 'array' and jsonb_typeof(c) = 'array' and a @> c and c @> a; end if;
  if t = 'ranking' then return a = c; end if;
  if t in ('number', 'scale', 'rating', 'nps', 'heart') then return jsonb_typeof(a) = 'number' and jsonb_typeof(c) = 'number' and (a #>> '{}')::numeric = (c #>> '{}')::numeric; end if;
  if t in ('short', 'paragraph', 'email', 'phone', 'url') and jsonb_typeof(a) = 'string' then
    txt := lower(btrim(a #>> '{}'));
    if jsonb_typeof(c) = 'array' then return exists (select 1 from jsonb_array_elements_text(c) x where lower(btrim(x)) = txt); end if;
    return lower(btrim(c #>> '{}')) = txt;
  end if;
  return false;
end $$;

-- what a person who opened the link may see (the correct answers and explanations are cut out)
create or replace function public.form_public_get(p_slug text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare f public.forms; s jsonb; closed text := null; qs jsonb;
begin
  select * into f from public.forms where slug = lower(p_slug) and deleted_at is null and archived_at is null;
  if not found or f.published is null or f.status = 'draft' then return jsonb_build_object('state', 'notfound'); end if;
  s := coalesce(f.published -> 'settings', '{}'::jsonb);
  if f.status = 'closed' then closed := 'closed'; end if;
  if s ->> 'opensAt' is not null and (s ->> 'opensAt')::timestamptz > now() then closed := 'notopen'; end if;
  if s ->> 'closesAt' is not null and (s ->> 'closesAt')::timestamptz <= now() then closed := 'closed'; end if;
  if (s ->> 'maxResponses') ~ '^[0-9]+$' and f.response_count >= (s ->> 'maxResponses')::int then closed := 'closed'; end if;
  select coalesce(jsonb_agg(e - 'correct' - 'explanation'), '[]'::jsonb) into qs from jsonb_array_elements(coalesce(f.published -> 'questions', '[]'::jsonb)) e;
  return jsonb_build_object('state', coalesce(closed, 'open'), 'title', f.title, 'description', f.description, 'version', f.version,
    'questions', qs, 'theme', coalesce(f.published -> 'theme', '{}'::jsonb), 'settings', s);
end $$;

create or replace function public.form_public_submit(p_slug text, p_answers jsonb, p_meta jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare f public.forms; s jsonb; q jsonb; qid text; t text; a jsonb; clean jsonb := '{}'::jsonb; opts jsonb; item jsonb; n numeric; txt text; mn numeric; mx numeric; cnt int; ok boolean;
  new_id uuid; m jsonb; lim int; lo numeric; hi numeric; ended boolean := false; quiz boolean; pts numeric; score numeric := 0; maxs numeric := 0; is_right boolean; details jsonb := '[]'::jsonb;
  show_answers boolean; result jsonb := null; rows_ jsonb; cols_ jsonb; k text; v jsonb; seen text[]; cond jsonb;
begin
  select * into f from public.forms where slug = lower(p_slug) and deleted_at is null and archived_at is null for update;
  if not found or f.published is null or f.status = 'draft' then return jsonb_build_object('ok', false, 'error', 'notfound'); end if;
  s := coalesce(f.published -> 'settings', '{}'::jsonb);
  quiz := coalesce((s -> 'quiz' ->> 'enabled')::boolean, false);
  show_answers := coalesce((s -> 'quiz' ->> 'showAnswers')::boolean, false);
  if f.status = 'closed' then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  if s ->> 'opensAt' is not null and (s ->> 'opensAt')::timestamptz > now() then return jsonb_build_object('ok', false, 'error', 'notopen'); end if;
  if s ->> 'closesAt' is not null and (s ->> 'closesAt')::timestamptz <= now() then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  if (s ->> 'maxResponses') ~ '^[0-9]+$' and f.response_count >= (s ->> 'maxResponses')::int then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or pg_column_size(p_answers) > 100000 then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  select count(*) into cnt from public.form_responses where form_id = f.id and created_at > now() - interval '1 minute';
  if cnt >= 120 then return jsonb_build_object('ok', false, 'error', 'busy'); end if;

  for q in select * from jsonb_array_elements(coalesce(f.published -> 'questions', '[]'::jsonb)) loop
    qid := q ->> 'id'; t := q ->> 'type';
    if ended then exit; end if;
    if t in ('section', 'text_block') or qid is null then continue; end if;
    if not public.form_q_visible(q, clean) then continue; end if;
    a := p_answers -> qid;
    pts := case when quiz and (q ->> 'points') ~ '^[0-9]+(\.[0-9]+)?$' then (q ->> 'points')::numeric else 0 end;
    if pts > 0 then maxs := maxs + pts; end if;
    if a is null or a = 'null'::jsonb or a = '""'::jsonb or a = '[]'::jsonb or a = '{}'::jsonb or (a = 'false'::jsonb and t = 'consent') then
      if coalesce((q ->> 'required')::boolean, false) and t <> 'hidden' then return jsonb_build_object('ok', false, 'error', 'required', 'question', qid); end if;
      if pts > 0 then details := details || jsonb_build_array(jsonb_build_object('id', qid, 'correct', false, 'answered', false) || case when show_answers then jsonb_build_object('correctAnswer', q -> 'correct', 'explanation', q -> 'explanation') else '{}'::jsonb end); end if;
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
    elsif t = 'hidden' then
      if jsonb_typeof(a) <> 'string' or char_length(a #>> '{}') > 300 then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
      clean := clean || jsonb_build_object(qid, a);
    elsif t = 'number' then
      if jsonb_typeof(a) <> 'number' then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
      n := (a #>> '{}')::numeric;
      if (mn is not null and n < mn) or (mx is not null and n > mx) then return jsonb_build_object('ok', false, 'error', 'range', 'question', qid); end if;
      clean := clean || jsonb_build_object(qid, a);
    elsif t in ('multiple_choice', 'dropdown') or (t = 'image_choice' and not coalesce((q ->> 'multi')::boolean, false)) then
      if jsonb_typeof(a) <> 'string' then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
      txt := a #>> '{}'; ok := false;
      for item in select * from jsonb_array_elements(opts) loop if item ->> 'id' = txt then ok := true; end if; end loop;
      if not ok and left(txt, 6) = 'other:' and coalesce((q ->> 'allowOther')::boolean, false) and char_length(txt) <= 306 then ok := true; end if;
      if not ok then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
      clean := clean || jsonb_build_object(qid, a);
    elsif t = 'checkboxes' or t = 'image_choice' then
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
    elsif t = 'ranking' then
      if jsonb_typeof(a) <> 'array' or jsonb_array_length(a) > 50 then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
      seen := '{}';
      for item in select * from jsonb_array_elements(a) loop
        txt := item #>> '{}';
        if jsonb_typeof(item) <> 'string' or txt = any (seen) or not exists (select 1 from jsonb_array_elements(opts) o where o ->> 'id' = txt) then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
        seen := seen || txt;
      end loop;
      if not coalesce((q ->> 'partial')::boolean, false) and jsonb_array_length(a) <> jsonb_array_length(opts) then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
      clean := clean || jsonb_build_object(qid, a);
    elsif t = 'grid' then
      if jsonb_typeof(a) <> 'object' then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
      rows_ := coalesce(q -> 'rows', '[]'::jsonb); cols_ := coalesce(q -> 'cols', '[]'::jsonb);
      for k, v in select * from jsonb_each(a) loop
        if not exists (select 1 from jsonb_array_elements(rows_) r where r ->> 'id' = k) then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
        if coalesce((q ->> 'multi')::boolean, false) then
          if jsonb_typeof(v) <> 'array' then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
          for item in select * from jsonb_array_elements(v) loop
            if jsonb_typeof(item) <> 'string' or not exists (select 1 from jsonb_array_elements(cols_) c where c ->> 'id' = item #>> '{}') then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
          end loop;
        else
          if jsonb_typeof(v) <> 'string' or not exists (select 1 from jsonb_array_elements(cols_) c where c ->> 'id' = v #>> '{}') then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
        end if;
      end loop;
      if coalesce((q ->> 'required')::boolean, false) then
        for item in select * from jsonb_array_elements(rows_) loop
          if not (a ? (item ->> 'id')) or a -> (item ->> 'id') = '[]'::jsonb then return jsonb_build_object('ok', false, 'error', 'required', 'question', qid); end if;
        end loop;
      end if;
      clean := clean || jsonb_build_object(qid, a);
    elsif t in ('scale', 'rating', 'nps', 'heart') then
      if jsonb_typeof(a) <> 'number' then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
      n := (a #>> '{}')::numeric;
      lo := coalesce(mn, case when t = 'nps' then 0 else 1 end); hi := coalesce(mx, case when t = 'nps' then 10 else 5 end);
      if n <> trunc(n) or n < lo or n > hi then return jsonb_build_object('ok', false, 'error', 'range', 'question', qid); end if;
      clean := clean || jsonb_build_object(qid, a);
    elsif t = 'thumbs' then
      if a not in ('"up"'::jsonb, '"down"'::jsonb) then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
      clean := clean || jsonb_build_object(qid, a);
    elsif t = 'date' then
      if jsonb_typeof(a) <> 'string' or (a #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
      clean := clean || jsonb_build_object(qid, a);
    elsif t = 'time' then
      if jsonb_typeof(a) <> 'string' or (a #>> '{}') !~ '^\d{2}:\d{2}$' then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
      clean := clean || jsonb_build_object(qid, a);
    elsif t = 'signature' then
      if jsonb_typeof(a) <> 'string' or (a #>> '{}') !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' or char_length(a #>> '{}') > 60000 then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
      clean := clean || jsonb_build_object(qid, a);
    elsif t = 'consent' then
      if a <> 'true'::jsonb then return jsonb_build_object('ok', false, 'error', 'required', 'question', qid); end if;
      clean := clean || jsonb_build_object(qid, a);
    end if;

    if pts > 0 and clean ? qid then
      is_right := public.form_q_correct(q, clean -> qid);
      if is_right then score := score + pts; end if;
      details := details || jsonb_build_array(jsonb_build_object('id', qid, 'correct', is_right, 'answered', true) || case when show_answers then jsonb_build_object('correctAnswer', q -> 'correct', 'explanation', q -> 'explanation') else '{}'::jsonb end);
    end if;
    -- "end the form here": when this answer matches the rule, nothing after this question is asked or kept
    cond := q -> 'endIf';
    if cond is not null and jsonb_typeof(cond) = 'object' and clean ? qid then
      if public.form_q_visible(jsonb_build_object('showIf', cond || jsonb_build_object('q', qid)), clean) then ended := true; end if;
    end if;
  end loop;

  m := '{}'::jsonb;
  if p_meta is not null and jsonb_typeof(p_meta -> 'utm') = 'object' and coalesce((s ->> 'collectCampaign')::boolean, false) then
    m := jsonb_build_object('utm', (select coalesce(jsonb_object_agg(k2, left(v2 #>> '{}', 100)), '{}'::jsonb) from jsonb_each(p_meta -> 'utm') as e(k2, v2) where k2 in ('source', 'medium', 'campaign') and jsonb_typeof(v2) = 'string'));
  end if;
  insert into public.form_responses (form_id, version, answers, meta, score, max_score)
    values (f.id, f.version, clean, m, case when quiz then score else null end, case when quiz then maxs else null end) returning id into new_id;
  if quiz and coalesce(s -> 'quiz' ->> 'showScore', 'after') <> 'never' then
    result := jsonb_build_object('score', score, 'max', maxs, 'pct', case when maxs > 0 then round(score / maxs * 100) else 0 end,
      'passed', case when (s -> 'quiz' ->> 'passScore') ~ '^[0-9]+$' and maxs > 0 then (score / maxs * 100) >= (s -> 'quiz' ->> 'passScore')::numeric else null end,
      'answers', case when show_answers then details else '[]'::jsonb end);
  end if;
  return jsonb_build_object('ok', true, 'id', new_id, 'result', result);
end $$;

revoke all on function public.form_q_correct(jsonb, jsonb), public.form_public_get(text), public.form_public_submit(text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.form_public_get(text), public.form_public_submit(text, jsonb, jsonb) to anon, authenticated;
grant execute on function public.form_q_correct(jsonb, jsonb) to authenticated;
