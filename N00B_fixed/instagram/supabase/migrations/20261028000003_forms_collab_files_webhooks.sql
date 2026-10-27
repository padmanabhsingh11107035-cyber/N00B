-- NOOB Forms, part 3: people who work on a form together (editor / viewer), file uploads, a note to the owner when answers arrive, and web hooks.
--
-- Nothing is removed and no row is touched. What is new:
--   form_collaborators      who else may open a form: "editor" changes the questions and design and can publish; "viewer" only reads the answers. Only the owner adds or removes people.
--   storage bucket form-uploads   files that people attach to a form (private; anyone can ADD a file to a published form that asks for one, only the owner and the people
--                           he shared the form with can read them; the form's own checks refuse a file that is too big, the wrong kind, or not in the right folder)
--   a note to the owner      one in-app note (and one email) an hour at most per form when answers arrive, and a note when the maximum is reached
--   form_webhooks / form_webhook_deliveries   a web address that is told about every new answer (signed, retried, logged); the sending is done by the function forms-webhook-run

-- ---------------------------------------------------------------- who may do what
create table if not exists public.form_collaborators (
  form_id uuid not null references public.forms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (form_id, user_id)
);
create index if not exists form_collaborators_user_idx on public.form_collaborators (user_id);
create index if not exists form_collaborators_invited_by_fk_idx on public.form_collaborators (invited_by);
alter table public.form_collaborators enable row level security;
revoke all on public.form_collaborators from public, anon, authenticated;
grant select on public.form_collaborators to authenticated;

-- 'owner', 'editor', 'viewer' or null for the person asking (security definer, so the policies below never look at each other)
create or replace function public.form_role(p_form uuid) returns text language sql stable security definer set search_path = public as $$
  select case when f.owner_id = auth.uid() then 'owner' else (select c.role from public.form_collaborators c where c.form_id = f.id and c.user_id = auth.uid()) end
  from public.forms f where f.id = p_form;
$$;
revoke all on function public.form_role(uuid) from public, anon;
grant execute on function public.form_role(uuid) to authenticated;

drop policy if exists form_collaborators_read on public.form_collaborators;
create policy form_collaborators_read on public.form_collaborators for select to authenticated using (user_id = auth.uid() or public.form_role(form_id) = 'owner');

drop policy if exists forms_owner on public.forms;
drop policy if exists forms_select on public.forms;
drop policy if exists forms_insert on public.forms;
drop policy if exists forms_update on public.forms;
drop policy if exists forms_delete on public.forms;
create policy forms_select on public.forms for select to authenticated using (owner_id = auth.uid() or public.form_role(id) is not null);
create policy forms_insert on public.forms for insert to authenticated with check (owner_id = auth.uid());
create policy forms_update on public.forms for update to authenticated using (owner_id = auth.uid() or public.form_role(id) = 'editor') with check (owner_id = auth.uid() or public.form_role(id) = 'editor');
create policy forms_delete on public.forms for delete to authenticated using (owner_id = auth.uid());

drop policy if exists form_responses_owner_read on public.form_responses;
create policy form_responses_owner_read on public.form_responses for select to authenticated using (public.form_role(form_id) is not null);

-- an editor changes the questions, the design and the settings, nothing else: the owner's own things (address, status, published copy, trash, archive, stars, folder, the person it belongs to) stay the owner's
create or replace function public.forms_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or auth.uid() = old.owner_id or coalesce(current_setting('noob.forms_internal', true), '') = '1' then return new; end if;
  if new.owner_id is distinct from old.owner_id or new.slug is distinct from old.slug or new.status is distinct from old.status or new.published is distinct from old.published
     or new.version is distinct from old.version or new.response_count is distinct from old.response_count or new.deleted_at is distinct from old.deleted_at
     or new.archived_at is distinct from old.archived_at or new.starred is distinct from old.starred or new.folder is distinct from old.folder or new.published_at is distinct from old.published_at then
    raise exception 'Only the owner of a form can change that.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists forms_guard_trg on public.forms;
create trigger forms_guard_trg before update on public.forms for each row execute function public.forms_guard();

create or replace function public.forms_count_responses() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('noob.forms_internal', '1', true);
  if tg_op = 'INSERT' then update public.forms set response_count = response_count + 1 where id = new.form_id;
  else update public.forms set response_count = greatest(0, response_count - 1) where id = old.form_id; end if;
  perform set_config('noob.forms_internal', '', true);
  return null;
end $$;

-- publishing: the owner or an editor
create or replace function public.form_publish(p_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare f public.forms; q jsonb; problems jsonb := '[]'::jsonb; ids text[] := '{}'; real_count int := 0; sl text; tries int := 0;
begin
  select * into f from public.forms where id = p_id and deleted_at is null for update;
  if not found or coalesce(public.form_role(p_id), '') not in ('owner', 'editor') then return jsonb_build_object('ok', false, 'problems', jsonb_build_array('Form not found')); end if;
  if btrim(f.title) = '' then problems := problems || jsonb_build_array('The form needs a title'); end if;
  for q in select * from jsonb_array_elements(coalesce(f.draft -> 'questions', '[]'::jsonb)) loop
    if coalesce(q ->> 'type', '') = '' or coalesce(q ->> 'id', '') = '' then problems := problems || jsonb_build_array('A question is damaged'); continue; end if;
    if q ->> 'id' = any (ids) then problems := problems || jsonb_build_array('Two questions share an id'); end if;
    ids := ids || (q ->> 'id');
    if q ->> 'type' not in ('section', 'text_block', 'calculated', 'hidden') then
      real_count := real_count + 1;
      if btrim(coalesce(q ->> 'title', '')) = '' then problems := problems || jsonb_build_array('A question has no title'); end if;
      if q ->> 'type' in ('multiple_choice', 'dropdown', 'checkboxes', 'image_choice', 'ranking') and jsonb_array_length(coalesce(q -> 'options', '[]'::jsonb)) < 1 then problems := problems || jsonb_build_array('"' || coalesce(q ->> 'title', '') || '" needs at least one option'); end if;
      if q ->> 'type' = 'grid' and (jsonb_array_length(coalesce(q -> 'rows', '[]'::jsonb)) < 1 or jsonb_array_length(coalesce(q -> 'cols', '[]'::jsonb)) < 1) then problems := problems || jsonb_build_array('"' || coalesce(q ->> 'title', '') || '" needs rows and columns'); end if;
    end if;
  end loop;
  if real_count = 0 then problems := problems || jsonb_build_array('Add at least one question'); end if;
  if jsonb_array_length(problems) > 0 then return jsonb_build_object('ok', false, 'problems', problems); end if;
  sl := f.slug;
  while sl is null loop
    sl := substr(replace(gen_random_uuid()::text, '-', ''), 1, 14);
    if exists (select 1 from public.forms where slug = sl) then sl := null; tries := tries + 1; if tries > 20 then raise exception 'no free address'; end if; end if;
  end loop;
  perform set_config('noob.forms_internal', '1', true);
  update public.forms set published = draft, version = version + 1, status = 'published', slug = sl, published_at = now() where id = f.id;
  perform set_config('noob.forms_internal', '', true);
  return jsonb_build_object('ok', true, 'slug', sl, 'version', f.version + 1);
end $$;
revoke all on function public.form_publish(uuid) from public, anon;
grant execute on function public.form_publish(uuid) to authenticated;

-- the owner adds, lists and removes people (by their User ID)
create or replace function public.form_collab_add(p_form uuid, p_username text, p_role text) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid; f public.forms;
begin
  select * into f from public.forms where id = p_form and owner_id = auth.uid() and deleted_at is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'notowner'); end if;
  if p_role not in ('editor', 'viewer') then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  select id into uid from public.profiles where lower(username) = lower(btrim(p_username, ' @'));
  if uid is null then return jsonb_build_object('ok', false, 'error', 'nouser'); end if;
  if uid = auth.uid() then return jsonb_build_object('ok', false, 'error', 'self'); end if;
  if (select count(*) from public.form_collaborators where form_id = p_form) >= 20 and not exists (select 1 from public.form_collaborators where form_id = p_form and user_id = uid) then return jsonb_build_object('ok', false, 'error', 'toomany'); end if;
  insert into public.form_collaborators (form_id, user_id, role, invited_by) values (p_form, uid, p_role, auth.uid()) on conflict (form_id, user_id) do update set role = excluded.role;
  insert into public.notifications (target_user_id, actor_id, type, title, message, data)
    values (uid, auth.uid(), 'form_shared', 'A form was shared with you', 'You can now ' || case when p_role = 'editor' then 'edit' else 'see the answers of' end || ' "' || left(f.title, 80) || '" in NOOB Forms.', jsonb_build_object('form', p_form));
  begin perform public.queue_email(uid, 'form_shared', jsonb_build_object('title', f.title, 'role', p_role)); exception when others then null; end;
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.form_collab_remove(p_form uuid, p_user uuid) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if public.form_role(p_form) = 'owner' or p_user = auth.uid() then delete from public.form_collaborators where form_id = p_form and user_id = p_user; return jsonb_build_object('ok', true); end if;
  return jsonb_build_object('ok', false, 'error', 'notowner');
end $$;
create or replace function public.form_collab_list(p_form uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.form_role(p_form) is null then '[]'::jsonb else coalesce(jsonb_agg(jsonb_build_object('user_id', c.user_id, 'username', p.username, 'role', c.role) order by c.created_at), '[]'::jsonb) end
  from public.form_collaborators c join public.profiles p on p.id = c.user_id where c.form_id = p_form;
$$;
revoke all on function public.form_collab_add(uuid, text, text), public.form_collab_remove(uuid, uuid), public.form_collab_list(uuid) from public, anon;
grant execute on function public.form_collab_add(uuid, text, text), public.form_collab_remove(uuid, uuid), public.form_collab_list(uuid) to authenticated;

-- ---------------------------------------------------------------- files
insert into storage.buckets (id, name, public, file_size_limit)
values ('form-uploads', 'form-uploads', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

-- may a file be added under this name? (a published form that asks for files, a name made of the form's id, a short random name and an extension)
create or replace function public.form_upload_ok(p_name text) returns boolean language plpgsql stable security definer set search_path = public as $$
declare fid uuid;
begin
  if p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]{8,60}\.[A-Za-z0-9]{1,8}$' then return false; end if;
  fid := split_part(p_name, '/', 1)::uuid;
  return exists (select 1 from public.forms f where f.id = fid and f.status = 'published' and f.deleted_at is null and f.archived_at is null and f.published is not null
    and exists (select 1 from jsonb_array_elements(f.published -> 'questions') q where q ->> 'type' = 'file_upload'));
end $$;
create or replace function public.form_can_read_files(p_name text) returns boolean language sql stable security definer set search_path = public as $$
  select p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' and public.form_role(split_part(p_name, '/', 1)::uuid) is not null;
$$;
create or replace function public.form_can_delete_files(p_name text) returns boolean language sql stable security definer set search_path = public as $$
  select p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' and public.form_role(split_part(p_name, '/', 1)::uuid) = 'owner';
$$;
revoke all on function public.form_upload_ok(text), public.form_can_read_files(text), public.form_can_delete_files(text) from public;
grant execute on function public.form_upload_ok(text) to anon, authenticated;
grant execute on function public.form_can_read_files(text), public.form_can_delete_files(text) to authenticated;

drop policy if exists form_uploads_insert on storage.objects;
create policy form_uploads_insert on storage.objects for insert to anon, authenticated with check (bucket_id = 'form-uploads' and public.form_upload_ok(name));
drop policy if exists form_uploads_select on storage.objects;
create policy form_uploads_select on storage.objects for select to authenticated using (bucket_id = 'form-uploads' and public.form_can_read_files(name));
drop policy if exists form_uploads_delete on storage.objects;
create policy form_uploads_delete on storage.objects for delete to authenticated using (bucket_id = 'form-uploads' and public.form_can_delete_files(name));

-- files that were uploaded but never sent with an answer (somebody left the form) and are older than two days
create or replace function public.form_uploads_orphans() returns table (name text) language sql stable security definer set search_path = public as $$
  select o.name from storage.objects o where o.bucket_id = 'form-uploads' and o.created_at < now() - interval '2 days'
    and not exists (select 1 from public.form_responses r where r.answers::text like '%' || o.name || '%');
$$;
revoke all on function public.form_uploads_orphans() from public, anon, authenticated;

-- ---------------------------------------------------------------- a note to the owner (and a first mail an hour) when answers arrive
create or replace function public.forms_notify() returns trigger language plpgsql security definer set search_path = public as $$
declare f public.forms; mx int; cnt int;
begin
  select * into f from public.forms where id = new.form_id;
  if not found then return null; end if;
  cnt := f.response_count;
  if not exists (select 1 from public.notifications n where n.target_user_id = f.owner_id and n.type = 'form_response' and n.data ->> 'form' = f.id::text and n.created_at > now() - interval '1 hour') then
    insert into public.notifications (target_user_id, actor_id, type, title, message, data)
      values (f.owner_id, null, 'form_response', 'New answer on your form', '"' || left(f.title, 80) || '" has ' || cnt || (case when cnt = 1 then ' answer.' else ' answers.' end), jsonb_build_object('form', f.id));
    begin perform public.queue_email(f.owner_id, 'form_response', jsonb_build_object('title', f.title, 'count', cnt, 'form', f.id)); exception when others then null; end;
  end if;
  mx := case when (f.published -> 'settings' ->> 'maxResponses') ~ '^[0-9]+$' then (f.published -> 'settings' ->> 'maxResponses')::int else null end;
  if mx is not null and cnt >= mx and not exists (select 1 from public.notifications n where n.target_user_id = f.owner_id and n.type = 'form_limit' and n.data ->> 'form' = f.id::text) then
    insert into public.notifications (target_user_id, actor_id, type, title, message, data)
      values (f.owner_id, null, 'form_limit', 'Your form is full', '"' || left(f.title, 80) || '" reached its limit of ' || mx || ' answers and stopped taking more.', jsonb_build_object('form', f.id));
  end if;
  -- the web hooks of the form
  insert into public.form_webhook_deliveries (webhook_id, response_id) select w.id, new.id from public.form_webhooks w where w.form_id = new.form_id and w.active;
  return null;
exception when others then
  return null;   -- a note must never stop an answer from being saved
end $$;

-- ---------------------------------------------------------------- web hooks
create table if not exists public.form_webhooks (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  url text not null check (url ~* '^https://[^\s]+$' and char_length(url) <= 500),
  secret text not null default encode(sha256(convert_to(gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'hex'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists form_webhooks_form_idx on public.form_webhooks (form_id);
create table if not exists public.form_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references public.form_webhooks(id) on delete cascade,
  response_id uuid references public.form_responses(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts int not null default 0,
  http_status int,
  last_error text,
  next_try timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists form_webhook_deliveries_webhook_idx on public.form_webhook_deliveries (webhook_id, created_at desc);
create index if not exists form_webhook_deliveries_response_fk_idx on public.form_webhook_deliveries (response_id);
create index if not exists form_webhook_deliveries_due_idx on public.form_webhook_deliveries (status, next_try);
alter table public.form_webhooks enable row level security;
alter table public.form_webhook_deliveries enable row level security;
revoke all on public.form_webhooks, public.form_webhook_deliveries from public, anon, authenticated;
grant select, insert, update, delete on public.form_webhooks to authenticated;
grant select on public.form_webhook_deliveries to authenticated;
drop policy if exists form_webhooks_owner on public.form_webhooks;
create policy form_webhooks_owner on public.form_webhooks for all to authenticated using (public.form_role(form_id) = 'owner') with check (public.form_role(form_id) = 'owner');
drop policy if exists form_webhook_deliveries_owner on public.form_webhook_deliveries;
create policy form_webhook_deliveries_owner on public.form_webhook_deliveries for select to authenticated using (exists (select 1 from public.form_webhooks w where w.id = webhook_id and public.form_role(w.form_id) = 'owner'));

drop trigger if exists forms_notify_trg on public.form_responses;
create trigger forms_notify_trg after insert on public.form_responses for each row execute function public.forms_notify();
revoke all on function public.forms_notify() from public, anon, authenticated;

-- ---------------------------------------------------------------- the submit function again, now knowing file uploads
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
  return jsonb_build_object('state', coalesce(closed, 'open'), 'id', f.id, 'title', f.title, 'description', f.description, 'version', f.version,
    'questions', qs, 'theme', coalesce(f.published -> 'theme', '{}'::jsonb), 'settings', s);
end $$;

create or replace function public.form_public_submit(p_slug text, p_answers jsonb, p_meta jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare f public.forms; s jsonb; q jsonb; qid text; t text; a jsonb; clean jsonb := '{}'::jsonb; opts jsonb; item jsonb; n numeric; txt text; mn numeric; mx numeric; cnt int; ok boolean;
  new_id uuid; m jsonb; lim int; lo numeric; hi numeric; ended boolean := false; quiz boolean; pts numeric; score numeric := 0; maxs numeric := 0; is_right boolean; details jsonb := '[]'::jsonb;
  show_answers boolean; result jsonb := null; rows_ jsonb; cols_ jsonb; k text; v jsonb; seen text[]; cond jsonb; ext text; fsize bigint; fmax numeric; files jsonb;
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
    elsif t = 'file_upload' then
      if jsonb_typeof(a) <> 'array' or jsonb_array_length(a) > coalesce(mx, 5)::int then return jsonb_build_object('ok', false, 'error', 'range', 'question', qid); end if;
      fmax := coalesce(nullif(q ->> 'maxSizeMb', '')::numeric, 10);
      files := '[]'::jsonb;
      for item in select * from jsonb_array_elements(a) loop
        txt := item ->> 'path';
        if jsonb_typeof(item) <> 'object' or txt is null or txt !~ ('^' || f.id::text || '/[A-Za-z0-9_-]{8,60}\.[A-Za-z0-9]{1,8}$') then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
        select (o.metadata ->> 'size')::bigint into fsize from storage.objects o where o.bucket_id = 'form-uploads' and o.name = txt;
        if not found then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
        ext := lower(split_part(txt, '.', 2));
        if coalesce(q ->> 'accept', '') <> '' and not (ext = any (string_to_array(lower(replace(q ->> 'accept', ' ', '')), ','))) then return jsonb_build_object('ok', false, 'error', 'invalid', 'question', qid); end if;
        if fsize is not null and fsize > fmax * 1048576 then return jsonb_build_object('ok', false, 'error', 'toolong', 'question', qid); end if;
        files := files || jsonb_build_array(jsonb_build_object('path', txt, 'name', left(coalesce(item ->> 'name', ''), 200), 'size', fsize, 'type', left(coalesce(item ->> 'type', ''), 100)));
      end loop;
      clean := clean || jsonb_build_object(qid, files);
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

revoke all on function public.form_public_submit(text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.form_public_submit(text, jsonb, jsonb) to anon, authenticated;
revoke all on function public.form_public_get(text) from public, anon, authenticated;
grant execute on function public.form_public_get(text) to anon, authenticated;
