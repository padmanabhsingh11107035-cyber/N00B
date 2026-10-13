-- NOOB STUDY, part 2: the AI tutor's conversations, the fair-use limits, and the private storage for photos and documents.
--
--   * A student's conversations and messages are reached ONLY through the functions below, and only their own (by login). The edge function
--     "study-ai" writes the tutor's answers with the study_svc_* functions, which only the server (service role) can call, and which always
--     check that the conversation belongs to the student the login belongs to.
--   * Pictures and documents live in a PRIVATE bucket "study", in a folder named after the student's account: nobody else can open them.
--   * Daily limits keep the free AI fair and the costs sane: they are numbers in a table (study_ai_limits) the administrator can change.

-- ---------------------------------------------------------------- conversations and messages
create table if not exists public.study_conversations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  subject_id       uuid references public.study_subjects(id) on delete set null,
  title            text not null default '' check (char_length(title) <= 120),
  mode             text not null default 'chat' check (mode in ('chat', 'teach', 'photo', 'voice', 'document')),
  topic            text not null default '' check (char_length(topic) <= 100),
  material_id      uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_message_at  timestamptz not null default now()
);
create index if not exists study_conversations_user_idx on public.study_conversations (user_id, last_message_at desc);
alter table public.study_conversations enable row level security;

create table if not exists public.study_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.study_conversations(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  role             text not null check (role in ('user', 'assistant')),
  content          text not null check (char_length(content) <= 12000),
  attachments      jsonb not null default '[]'::jsonb,
  meta             jsonb not null default '{}'::jsonb,
  client_ref       uuid,
  created_at       timestamptz not null default now()
);
create unique index if not exists study_messages_ref_uidx on public.study_messages (conversation_id, client_ref) where client_ref is not null;
create index if not exists study_messages_conv_idx on public.study_messages (conversation_id, created_at);
alter table public.study_messages enable row level security;

-- ---------------------------------------------------------------- fair-use limits (per student, per day, per kind of request)
create table if not exists public.study_ai_limits (
  kind     text primary key,
  per_day  integer not null check (per_day between 0 and 100000)
);
insert into public.study_ai_limits (kind, per_day) values ('chat', 150), ('vision', 30), ('transcribe', 60), ('generate', 40), ('research', 20)
on conflict (kind) do nothing;
alter table public.study_ai_limits enable row level security;

create table if not exists public.study_ai_usage (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  day      date not null,
  kind     text not null references public.study_ai_limits(kind) on update cascade on delete cascade,
  used     integer not null default 0 check (used >= 0),
  primary key (user_id, day, kind)
);
alter table public.study_ai_usage enable row level security;

create or replace function public.study_int_today(p_user uuid) returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce((select timezone from public.study_profiles where user_id = p_user), 'Asia/Kolkata'))::date;
$$;

-- one request counted, atomically: two requests at the same moment can never both squeeze through the last place
create or replace function public.study_svc_take(p_user uuid, p_kind text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare lim integer; got integer; d date := public.study_int_today(p_user);
begin
  select per_day into lim from public.study_ai_limits where kind = p_kind;
  if not found then raise exception 'That kind of request is not known.'; end if;
  insert into public.study_ai_usage (user_id, day, kind, used) values (p_user, d, p_kind, 0) on conflict do nothing;
  update public.study_ai_usage set used = used + 1 where user_id = p_user and day = d and kind = p_kind and used < lim returning used into got;
  if got is null then return jsonb_build_object('allowed', false, 'remaining', 0, 'limit', lim); end if;
  return jsonb_build_object('allowed', true, 'remaining', lim - got, 'limit', lim);
end;
$$;

create or replace function public.study_int_limits(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(l.kind, jsonb_build_object('limit', l.per_day, 'used', coalesce(u.used, 0), 'remaining', greatest(l.per_day - coalesce(u.used, 0), 0))), '{}'::jsonb)
  from public.study_ai_limits l left join public.study_ai_usage u on u.user_id = p_user and u.kind = l.kind and u.day = public.study_int_today(p_user);
$$;
create or replace function public.study_svc_limits(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$ select public.study_int_limits(p_user); $$;
-- what the student's own screen shows ("12 photo questions left today")
create or replace function public.study_ai_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin return public.study_int_limits(public.study_int_uid()); end;
$$;

-- ---------------------------------------------------------------- conversations (the student's own screens)
create or replace function public.study_int_conv_json(c public.study_conversations) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', c.id, 'title', c.title, 'subjectId', c.subject_id, 'mode', c.mode, 'topic', c.topic, 'materialId', c.material_id,
    'createdAt', c.created_at, 'lastMessageAt', c.last_message_at,
    'preview', coalesce((select left(m.content, 90) from public.study_messages m where m.conversation_id = c.id order by m.created_at desc limit 1), ''));
$$;

create or replace function public.study_conv_create(p_subject uuid default null, p_mode text default 'chat', p_title text default '', p_topic text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); row public.study_conversations;
begin
  if p_mode not in ('chat', 'teach', 'photo', 'voice', 'document') then raise exception 'That kind of chat is not known.'; end if;
  insert into public.study_conversations (user_id, subject_id, mode, title, topic)
  values (me, public.study_int_own_subject(me, p_subject), p_mode, left(btrim(coalesce(p_title, '')), 120), left(btrim(coalesce(p_topic, '')), 100)) returning * into row;
  return public.study_int_conv_json(row);
end;
$$;

create or replace function public.study_conv_list(p_subject uuid default null, p_limit integer default 30, p_before timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); lim integer := greatest(1, least(coalesce(p_limit, 30), 50)); ids uuid[];
begin
  select array_agg(id order by last_message_at desc) into ids from (
    select id, last_message_at from public.study_conversations
    where user_id = me and (p_subject is null or subject_id = p_subject) and (p_before is null or last_message_at < p_before)
    order by last_message_at desc limit lim + 1) x;
  return jsonb_build_object(
    'conversations', coalesce((select jsonb_agg(public.study_int_conv_json(c) order by c.last_message_at desc) from public.study_conversations c where c.id = any (coalesce(ids[1:lim], '{}'))), '[]'::jsonb),
    'more', coalesce(array_length(ids, 1), 0) > lim);
end;
$$;

-- the newest p_limit messages (oldest first); p_before gives the page before them
create or replace function public.study_conv_get(p_id uuid, p_limit integer default 40, p_before timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); c public.study_conversations; lim integer := greatest(1, least(coalesce(p_limit, 40), 100)); n integer;
begin
  select * into c from public.study_conversations where id = p_id and user_id = me;
  if not found then raise exception 'That conversation was not found.'; end if;
  select count(*) into n from public.study_messages where conversation_id = p_id and (p_before is null or created_at < p_before);
  return jsonb_build_object('conversation', public.study_int_conv_json(c), 'more', n > lim,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'role', m.role, 'content', m.content, 'attachments', m.attachments, 'meta', m.meta, 'createdAt', m.created_at) order by m.created_at)
      from (select * from public.study_messages where conversation_id = p_id and (p_before is null or created_at < p_before) order by created_at desc limit lim) m), '[]'::jsonb));
end;
$$;

create or replace function public.study_conv_rename(p_id uuid, p_title text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); row public.study_conversations; t text := left(btrim(coalesce(p_title, '')), 120);
begin
  if t = '' then raise exception 'Please write a name for the chat.'; end if;
  update public.study_conversations set title = t, updated_at = now() where id = p_id and user_id = me returning * into row;
  if row.id is null then raise exception 'That conversation was not found.'; end if;
  return public.study_int_conv_json(row);
end;
$$;

-- deleting a chat removes its messages, and hands back the pictures it had so the app can delete those files too
create or replace function public.study_conv_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); keys text[]; n integer;
begin
  select coalesce(array_agg(a->>'key'), '{}') into keys from public.study_messages m, jsonb_array_elements(m.attachments) a where m.conversation_id = p_id and m.user_id = me and a->>'key' is not null;
  delete from public.study_conversations where id = p_id and user_id = me;
  get diagnostics n = row_count;
  return jsonb_build_object('success', true, 'deleted', n > 0, 'files', to_jsonb(keys));
end;
$$;

-- the student changes what a chat is about (its subject and topic): the tutor uses it from the next answer
create or replace function public.study_conv_set_context(p_id uuid, p_subject uuid default null, p_topic text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); row public.study_conversations;
begin
  update public.study_conversations set subject_id = public.study_int_own_subject(me, p_subject), topic = left(btrim(coalesce(p_topic, '')), 100), updated_at = now()
  where id = p_id and user_id = me returning * into row;
  if row.id is null then raise exception 'That conversation was not found.'; end if;
  return public.study_int_conv_json(row);
end;
$$;

-- ---------------------------------------------------------------- the server's side (only the edge function can call these)
create or replace function public.study_int_owned_conv(p_user uuid, p_conv uuid) returns public.study_conversations
language plpgsql stable security definer set search_path = public as $$
declare c public.study_conversations;
begin
  select * into c from public.study_conversations where id = p_conv and user_id = p_user;
  if not found then raise exception 'That conversation was not found.'; end if;
  return c;
end;
$$;

create or replace function public.study_svc_conv_create(p_user uuid, p_subject uuid, p_mode text, p_topic text, p_title text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare row public.study_conversations;
begin
  if p_mode not in ('chat', 'teach', 'photo', 'voice', 'document') then raise exception 'That kind of chat is not known.'; end if;
  insert into public.study_conversations (user_id, subject_id, mode, title, topic)
  values (p_user, public.study_int_own_subject(p_user, p_subject), p_mode, left(btrim(coalesce(p_title, '')), 120), left(btrim(coalesce(p_topic, '')), 100)) returning * into row;
  return public.study_int_conv_json(row);
end;
$$;

-- Notes from the student's own material, found for a question. (Part 3 brings the real search; until then a chat simply has no document.)
create or replace function public.study_int_chunks(p_user uuid, p_material uuid, p_query text) returns jsonb
language sql stable security definer set search_path = public as $$ select '[]'::jsonb; $$;

-- Everything the tutor may know for one question, in one call: the student's saved profile, the chat's subject, the recent turns (bounded), and
-- (when the student allows it) only the TITLES of their recent chats. Nothing from anybody else, ever.
create or replace function public.study_svc_context(p_user uuid, p_conv uuid, p_material uuid, p_query text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c public.study_conversations; pf public.study_profiles; subj public.study_subjects; hist jsonb; recent jsonb := '[]'::jsonb;
begin
  select * into pf from public.study_profiles where user_id = p_user;
  if p_conv is not null then c := public.study_int_owned_conv(p_user, p_conv); end if;
  if c.subject_id is not null then select * into subj from public.study_subjects where id = c.subject_id and user_id = p_user; end if;
  if p_conv is not null then
    select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'role', x.role, 'content', x.content) order by x.created_at), '[]'::jsonb) into hist
    from (select id, role, content, created_at from public.study_messages where conversation_id = p_conv order by created_at desc limit 16) x;
  else hist := '[]'::jsonb; end if;
  if coalesce((pf.privacy->>'useHistory')::boolean, true) is not false and p_conv is not null then
    select coalesce(jsonb_agg(t.title), '[]'::jsonb) into recent from (
      select title from public.study_conversations where user_id = p_user and id <> p_conv and title <> '' and last_message_at > now() - interval '30 days'
        and (c.subject_id is null or subject_id = c.subject_id) order by last_message_at desc limit 5) t;
  end if;
  return jsonb_build_object(
    'profile', case when pf.user_id is null then null else jsonb_build_object('displayName', pf.display_name, 'language', pf.language, 'level', pf.level, 'board', pf.board, 'classYear', pf.class_year,
      'stream', pf.stream, 'course', pf.course, 'specialization', pf.specialization, 'goals', pf.goals, 'habits', pf.habits, 'tutor', pf.tutor) end,
    'subject', case when subj.id is null then null else jsonb_build_object('id', subj.id, 'name', subj.name, 'kind', subj.kind) end,
    'conversation', case when c.id is null then null else jsonb_build_object('id', c.id, 'title', c.title, 'mode', c.mode, 'topic', c.topic) end,
    'history', hist, 'recentTopics', recent,
    'chunks', public.study_int_chunks(p_user, p_material, p_query));
end;
$$;

-- Saves the student's message (so it is never lost if the AI is busy). Sending the same message twice (same ref) saves it once and says so.
create or replace function public.study_svc_msg_user(p_user uuid, p_conv uuid, p_content text, p_attachments jsonb, p_ref uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.study_conversations; row public.study_messages; ex public.study_messages; att jsonb := '[]'::jsonb; a jsonb; k text; reply public.study_messages; txt text := btrim(coalesce(p_content, ''));
begin
  c := public.study_int_owned_conv(p_user, p_conv);
  if char_length(txt) > 4000 then raise exception 'Please keep a message under 4000 characters.'; end if;
  if jsonb_typeof(coalesce(p_attachments, '[]'::jsonb)) = 'array' then
    for a in select * from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) loop
      k := a->>'key';
      if k is null or k not like (p_user::text || '/%') or k like '%..%' or char_length(k) > 240 then raise exception 'That picture is not yours.'; end if;
      att := att || jsonb_build_array(jsonb_build_object('key', k, 'kind', 'image'));
    end loop;
  end if;
  if jsonb_array_length(att) > 4 then raise exception 'You can send up to 4 pictures at once.'; end if;
  if txt = '' and jsonb_array_length(att) = 0 then raise exception 'Please write your question or send a picture.'; end if;

  insert into public.study_messages (conversation_id, user_id, role, content, attachments, client_ref)
  values (p_conv, p_user, 'user', coalesce(nullif(txt, ''), 'Picture'), att, p_ref)
  on conflict (conversation_id, client_ref) where client_ref is not null do nothing returning * into row;
  if row.id is null then
    select * into ex from public.study_messages where conversation_id = p_conv and client_ref = p_ref;
    select * into reply from public.study_messages where conversation_id = p_conv and role = 'assistant' and created_at >= ex.created_at order by created_at limit 1;
    return jsonb_build_object('id', ex.id, 'duplicate', true, 'assistant', case when reply.id is null then null else jsonb_build_object('id', reply.id, 'content', reply.content) end);
  end if;
  update public.study_conversations set last_message_at = now(), updated_at = now(),
    title = case when title = '' then left(coalesce(nullif(txt, ''), 'Photo question'), 60) else title end
  where id = p_conv;
  return jsonb_build_object('id', row.id, 'duplicate', false, 'assistant', null);
end;
$$;

create or replace function public.study_svc_msg_assistant(p_user uuid, p_conv uuid, p_content text, p_meta jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare row public.study_messages;
begin
  perform public.study_int_owned_conv(p_user, p_conv);
  insert into public.study_messages (conversation_id, user_id, role, content, meta)
  values (p_conv, p_user, 'assistant', left(btrim(coalesce(p_content, '')), 12000), public.study_int_pick(coalesce(p_meta, '{}'::jsonb), array['provider', 'model', 'mode', 'sources', 'citations'])) returning * into row;
  update public.study_conversations set last_message_at = now(), updated_at = now() where id = p_conv;
  return jsonb_build_object('id', row.id);
end;
$$;

-- ---------------------------------------------------------------- private storage for pictures and documents
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('study', 'study', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain', 'text/markdown'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain', 'text/markdown'];

drop policy if exists study_files_insert on storage.objects;
drop policy if exists study_files_select on storage.objects;
drop policy if exists study_files_delete on storage.objects;
create policy study_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'study' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy study_files_select on storage.objects for select to authenticated
  using (bucket_id = 'study' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy study_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'study' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------- deleting one's own data now covers the chats too
create or replace function public.study_delete_my_data(p_scope text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); keys text[] := '{}'; k2 text[];
begin
  if p_scope not in ('activity', 'all', 'conversations') then raise exception 'That choice is not known.'; end if;
  if p_scope in ('conversations', 'all') then
    select coalesce(array_agg(a->>'key'), '{}') into k2 from public.study_messages m, jsonb_array_elements(m.attachments) a where m.user_id = me and a->>'key' is not null;
    keys := keys || k2;
    delete from public.study_conversations where user_id = me;
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
-- study_int_* helpers: nobody from outside. study_svc_*: the server only (service role). Everything else study_*: signed-in students.
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
