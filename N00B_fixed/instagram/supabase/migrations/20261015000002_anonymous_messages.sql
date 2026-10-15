-- Anonymous Messages: a public feed of plain-text messages that show NO author (an anonymous icon, the word "Anonymous", the date and time, and the text).
--
-- Privacy is enforced HERE, in the database, not in the app:
--   * the three tables below can not be read or written by the app at all (no direct access; every grant is removed and row security has no policy);
--   * the only way to read is anon_messages_feed(), which returns {id, body, createdAt} and nothing else - no author id, no username, no picture, no email;
--   * who wrote a message is kept in a private column (author_id), used only to stop abuse (post limits, blocking someone who abuses it); no function the app can call returns it,
--     not even the administrators' ones. If the account is deleted, the column is emptied and the message stays, with no author at all.
-- Honest limit: this hides the author from other people. It does not make a message untraceable to the service itself.
--
-- Posting needs an account (the existing login). Limits: 1000 characters, 1 message per 20 seconds, 5 per hour, 20 per day, no repeating the same message within a day,
-- at most 2 links. A message reported by 3 different people is hidden automatically until an administrator decides.
-- Safe to run more than once. No existing table or function is changed.

create table if not exists public.anon_messages (
  id uuid primary key default gen_random_uuid(),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  author_id uuid references auth.users (id) on delete set null,        -- PRIVATE: never returned by any function
  client_key text check (client_key is null or char_length(client_key) <= 64),   -- makes a double tap / a retry post only once
  hidden boolean not null default false,                                -- hidden automatically after 3 reports, until an administrator decides
  removed_at timestamptz,
  removed_by uuid
);

create table if not exists public.anon_message_reports (
  message_id uuid not null references public.anon_messages (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (message_id, reporter_id)
);

create table if not exists public.anon_message_bans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  banned_at timestamptz not null default now(),
  banned_by uuid,
  reason text
);

-- The feed: newest first, keyset-paged, only messages that are visible.
create index if not exists anon_messages_feed_idx on public.anon_messages (created_at desc, id desc) where removed_at is null and not hidden;
-- The post limits and the duplicate check look at one person's recent messages.
create index if not exists anon_messages_author_time_idx on public.anon_messages (author_id, created_at desc) where author_id is not null;
create unique index if not exists anon_messages_author_key_idx on public.anon_messages (author_id, client_key) where client_key is not null and author_id is not null;
-- The administrators' "reported" list, and the reporter's daily limit.
create index if not exists anon_message_reports_message_idx on public.anon_message_reports (message_id);
create index if not exists anon_message_reports_reporter_idx on public.anon_message_reports (reporter_id, created_at desc);

alter table public.anon_messages enable row level security;
alter table public.anon_message_reports enable row level security;
alter table public.anon_message_bans enable row level security;
revoke all on public.anon_messages, public.anon_message_reports, public.anon_message_bans from public, anon, authenticated;

-- Plain text only, tidied: line endings unified, control characters and the invisible direction-changing / zero-width characters removed (they can disguise text),
-- trailing spaces trimmed, more than one blank line squeezed to one. Nothing is HTML-escaped here: the app shows it as text, never as HTML.
create or replace function public.anon_clean_text(t text) returns text
language sql immutable set search_path = public as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          replace(replace(coalesce(t, ''), E'\r\n', E'\n'), E'\r', E'\n'),
          E'[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]', '', 'g'),
        E'[ \\t]+\n', E'\n', 'g'),
      E'\n{3,}', E'\n\n', 'g'),
    E' \n\t');
$$;
revoke execute on function public.anon_clean_text(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------- the public feed
create or replace function public.anon_messages_feed(p_limit int default 20, p_before timestamptz default null, p_before_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  lim int := least(greatest(coalesce(p_limit, 20), 1), 50);
  msgs jsonb;
  total int;
begin
  with page as (
    select m.id, m.body, m.created_at, row_number() over (order by m.created_at desc, m.id desc) as rn
    from public.anon_messages m
    where m.removed_at is null and not m.hidden
      and (p_before is null or (m.created_at, m.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by m.created_at desc, m.id desc
    limit lim + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'body', body, 'createdAt', created_at) order by rn) filter (where rn <= lim), '[]'::jsonb), count(*)
    into msgs, total
  from page;
  return jsonb_build_object('messages', msgs, 'hasMore', total > lim);
end;
$$;
grant execute on function public.anon_messages_feed(int, timestamptz, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------- posting (needs an account)
create or replace function public.anon_message_post(p_body text, p_client_key text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  clean text;
  found_row record;
  n int;
  new_id uuid;
  made timestamptz;
begin
  if me is null then raise exception 'Please log in to share a message.' using errcode = '28000'; end if;
  if coalesce((select is_suspended from public.profiles where id = me), true) then raise exception 'This account can not post right now.'; end if;
  if exists (select 1 from public.anon_message_bans where user_id = me) then raise exception 'You can no longer share anonymous messages.'; end if;

  clean := public.anon_clean_text(p_body);
  if clean = '' then raise exception 'Write a message first.'; end if;
  if char_length(clean) > 1000 then raise exception 'Messages can be at most 1000 characters.'; end if;
  if p_client_key is not null and char_length(p_client_key) > 64 then raise exception 'Invalid request.'; end if;

  -- one post at a time per person, so two quick taps can not both get past the limits below
  perform pg_advisory_xact_lock(hashtextextended('anon_message_post:' || me::text, 0));

  if p_client_key is not null then
    select m.id, m.body, m.created_at into found_row from public.anon_messages m where m.author_id = me and m.client_key = p_client_key;
    if found then
      return jsonb_build_object('id', found_row.id, 'body', found_row.body, 'createdAt', found_row.created_at, 'duplicate', true);
    end if;
  end if;

  if (char_length(clean) - char_length(replace(lower(clean), 'http', ''))) / 4 > 2 then raise exception 'Please do not post more than two links.'; end if;
  if exists (select 1 from public.anon_messages where author_id = me and created_at > now() - interval '20 seconds') then raise exception 'Please wait a moment before sharing again.'; end if;
  select count(*) into n from public.anon_messages where author_id = me and created_at > now() - interval '1 hour';
  if n >= 5 then raise exception 'You have shared a lot just now. Please try again a little later.'; end if;
  select count(*) into n from public.anon_messages where author_id = me and created_at > now() - interval '24 hours';
  if n >= 20 then raise exception 'You have reached today''s limit for anonymous messages. Please try again tomorrow.'; end if;
  if exists (select 1 from public.anon_messages where author_id = me and created_at > now() - interval '24 hours' and lower(body) = lower(clean)) then raise exception 'You already shared that message.'; end if;

  insert into public.anon_messages (body, author_id, client_key) values (clean, me, p_client_key) returning id, created_at into new_id, made;
  return jsonb_build_object('id', new_id, 'body', clean, 'createdAt', made);
end;
$$;
revoke execute on function public.anon_message_post(text, text) from public, anon;
grant execute on function public.anon_message_post(text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------- reporting (needs an account)
create or replace function public.anon_message_report(p_message uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  cnt int;
begin
  if me is null then raise exception 'Please log in to report a message.' using errcode = '28000'; end if;
  if not exists (select 1 from public.anon_messages where id = p_message and removed_at is null) then raise exception 'That message is no longer there.'; end if;
  select count(*) into cnt from public.anon_message_reports where reporter_id = me and created_at > now() - interval '24 hours';
  if cnt >= 30 then raise exception 'You have sent a lot of reports today. Thank you - please try again tomorrow.'; end if;
  insert into public.anon_message_reports (message_id, reporter_id, reason) values (p_message, me, left(btrim(coalesce(p_reason, '')), 200)) on conflict do nothing;
  select count(*) into cnt from public.anon_message_reports where message_id = p_message;
  if cnt >= 3 then update public.anon_messages set hidden = true where id = p_message and removed_at is null; end if;
  return jsonb_build_object('ok', true, 'hidden', cnt >= 3);
end;
$$;
revoke execute on function public.anon_message_report(uuid, text) from public, anon;
grant execute on function public.anon_message_report(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------- the main administrator
-- The administrator sees the message, how many people reported it and why - never who wrote it. Removing can also stop that person from sharing again, without anyone learning who it is.
create or replace function public.anon_messages_admin_feed(p_limit int default 30, p_before timestamptz default null, p_before_id uuid default null, p_only_reported boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  lim int := least(greatest(coalesce(p_limit, 30), 1), 100);
  msgs jsonb;
  total int;
begin
  if not public.is_master_admin() then raise exception 'Access denied. Administrator privileges required.' using errcode = '42501'; end if;
  with page as (
    select m.id, m.body, m.created_at, m.hidden,
           (select count(*) from public.anon_message_reports r where r.message_id = m.id) as reports,
           coalesce((select jsonb_agg(x.reason) from (select r.reason from public.anon_message_reports r where r.message_id = m.id and coalesce(r.reason, '') <> '' order by r.created_at limit 5) x), '[]'::jsonb) as reasons,
           row_number() over (order by m.created_at desc, m.id desc) as rn
    from public.anon_messages m
    where m.removed_at is null
      and (not p_only_reported or exists (select 1 from public.anon_message_reports r where r.message_id = m.id))
      and (p_before is null or (m.created_at, m.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by m.created_at desc, m.id desc
    limit lim + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'body', body, 'createdAt', created_at, 'hidden', hidden, 'reportCount', reports, 'reasons', reasons) order by rn) filter (where rn <= lim), '[]'::jsonb), count(*)
    into msgs, total
  from page;
  return jsonb_build_object('messages', msgs, 'hasMore', total > lim);
end;
$$;
revoke execute on function public.anon_messages_admin_feed(int, timestamptz, uuid, boolean) from public, anon;
grant execute on function public.anon_messages_admin_feed(int, timestamptz, uuid, boolean) to authenticated;

create or replace function public.admin_anon_message_remove(p_message uuid, p_block_author boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  who uuid;
  rc int := 0;
begin
  if not public.is_master_admin() then raise exception 'Access denied. Administrator privileges required.' using errcode = '42501'; end if;
  update public.anon_messages set removed_at = now(), removed_by = auth.uid() where id = p_message and removed_at is null returning author_id into who;
  get diagnostics rc = row_count;
  if rc = 0 then raise exception 'That message is no longer there.'; end if;
  if coalesce(p_block_author, false) and who is not null then
    insert into public.anon_message_bans (user_id, banned_by, reason) values (who, auth.uid(), 'An anonymous message was removed') on conflict do nothing;
  end if;
  perform public.log_admin_action('anon_message_removed', null, jsonb_build_object('messageId', p_message, 'authorBlocked', coalesce(p_block_author, false) and who is not null));
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.admin_anon_message_remove(uuid, boolean) from public, anon;
grant execute on function public.admin_anon_message_remove(uuid, boolean) to authenticated;

-- "This message is fine": the reports are cleared and a message that was hidden by them is shown again.
create or replace function public.admin_anon_message_dismiss(p_message uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_master_admin() then raise exception 'Access denied. Administrator privileges required.' using errcode = '42501'; end if;
  delete from public.anon_message_reports where message_id = p_message;
  update public.anon_messages set hidden = false where id = p_message and removed_at is null;
  perform public.log_admin_action('anon_message_dismissed', null, jsonb_build_object('messageId', p_message));
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.admin_anon_message_dismiss(uuid) from public, anon;
grant execute on function public.admin_anon_message_dismiss(uuid) to authenticated;
