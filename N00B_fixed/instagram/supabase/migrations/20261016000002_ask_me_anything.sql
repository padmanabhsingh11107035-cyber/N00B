-- Ask Me Anything: every person has a link; people who open it can send a question that the owner reads WITHOUT seeing who asked. The owner can answer (privately, or publish the
-- answer on their profile), delete a question, report abuse, block the sender (without learning who it is) and switch the whole thing off.
--
-- Privacy is kept HERE, in the database, not in the app:
--   * the tables can not be read or written by the app at all; everything goes through the functions below;
--   * who asked is kept in a private column (sender_id), used only to stop abuse (limits, "block this sender", a ban by an administrator). No function the app can call
--     returns it - not to the owner, not in a published answer, not to an administrator. If the sender's account is deleted, the column is emptied and the question stays.
--   * a published answer carries the question's text and the answer, nothing about the sender;
--   * the new-question alert tells the owner that "someone" asked; it names nobody.
-- Honest limit: this hides the sender from the person who receives the question. It does not make a question untraceable to the service itself, which keeps a private record to
-- stop abuse and may act on reports.
--
-- Asking needs an account (the existing login), so limits and blocks can work. Limits: 500 characters, at most 1 link, 1 question per 15 seconds, 10 per hour, 40 per day, 5 per day
-- to the same person, no repeating the same question to the same person within a day, and a person who is receiving a flood of questions is protected for a while.
-- Safe to run more than once. No existing table or function is changed.

create or replace function public.fun_clean_text(t text) returns text
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
revoke execute on function public.fun_clean_text(text) from public, anon, authenticated;

create or replace function public.fun_can_manage() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.can_moderate_content(), false);
$$;
revoke execute on function public.fun_can_manage() from public, anon;
grant execute on function public.fun_can_manage() to authenticated;

-- Does this person take questions? (No row = yes.)
create table if not exists public.ask_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.ask_questions (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,   -- PRIVATE: never returned by any function
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  client_key text check (client_key is null or char_length(client_key) <= 64),   -- makes a double tap / a retry send once
  answer text check (answer is null or char_length(answer) between 1 and 1000),
  answered_at timestamptz,
  answer_public boolean not null default false,                        -- shown on the owner's profile
  deleted_at timestamptz,                                              -- deleted by the owner
  reported_at timestamptz,                                             -- reported by the owner, waiting for an administrator
  report_reason text,
  removed_at timestamptz,                                              -- removed by an administrator
  removed_by uuid
);
create index if not exists ask_questions_inbox_idx on public.ask_questions (recipient_id, created_at desc, id desc) where deleted_at is null and removed_at is null;
create index if not exists ask_questions_public_idx on public.ask_questions (recipient_id, answered_at desc, id desc) where answer_public and deleted_at is null and removed_at is null;
create index if not exists ask_questions_sender_time_idx on public.ask_questions (sender_id, created_at desc) where sender_id is not null;
create index if not exists ask_questions_pair_idx on public.ask_questions (sender_id, recipient_id, created_at desc) where sender_id is not null;
create index if not exists ask_questions_recent_idx on public.ask_questions (recipient_id, created_at desc);
create unique index if not exists ask_questions_sender_key_idx on public.ask_questions (sender_id, client_key) where client_key is not null and sender_id is not null;
create index if not exists ask_questions_reported_idx on public.ask_questions (reported_at desc) where reported_at is not null and removed_at is null;

-- "Block this sender": that person can no longer ask THIS owner anything. The owner never learns who it is.
create table if not exists public.ask_blocks (
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (recipient_id, sender_id)
);
-- An administrator stopped this person from asking anyone (after a reported question), also without learning who it is.
create table if not exists public.ask_bans (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  banned_at timestamptz not null default now(),
  banned_by uuid,
  reason text
);

alter table public.ask_settings enable row level security;
alter table public.ask_questions enable row level security;
alter table public.ask_blocks enable row level security;
alter table public.ask_bans enable row level security;
revoke all on public.ask_settings, public.ask_questions, public.ask_blocks, public.ask_bans from public, anon, authenticated;

-- A question as the OWNER gets it: no sender, ever.
create or replace function public.ask_q_json(q public.ask_questions) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('id', q.id, 'body', q.body, 'createdAt', q.created_at, 'answer', q.answer, 'answeredAt', q.answered_at, 'answerPublic', q.answer_public, 'reported', q.reported_at is not null);
$$;
revoke execute on function public.ask_q_json(public.ask_questions) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------- the page of one person (public)
-- What a visitor needs to see a person's question page: the public bits of their profile and whether they take questions. Nothing else.
create or replace function public.ask_profile_public(p_username text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where lower(username) = lower(btrim(coalesce(p_username, ''))) and not is_suspended and not is_ai;
  if not found then return null; end if;
  return jsonb_build_object('userId', p.id, 'username', p.username, 'displayName', coalesce(nullif(p.display_name, ''), p.username), 'avatar', p.avatar, 'isVerified', p.is_verified,
    'enabled', coalesce((select s.enabled from public.ask_settings s where s.user_id = p.id), true));
end;
$$;
grant execute on function public.ask_profile_public(text) to anon, authenticated;

-- The answers a person chose to publish, newest first, a page at a time. Hidden from anyone who may not see that person's content (blocked, hidden, a private account they do not follow).
create or replace function public.ask_public_answers(p_username text, p_limit int default 10, p_before timestamptz default null, p_before_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  lim int := least(greatest(coalesce(p_limit, 10), 1), 30);
  owner uuid;
  msgs jsonb;
  total int;
begin
  select id into owner from public.profiles where lower(username) = lower(btrim(coalesce(p_username, ''))) and not is_suspended and not is_ai;
  if owner is null or not public.can_view_author(owner) then return jsonb_build_object('answers', '[]'::jsonb, 'hasMore', false); end if;
  with page as (
    select q.id, q.body, q.answer, q.answered_at, row_number() over (order by q.answered_at desc, q.id desc) as rn
    from public.ask_questions q
    where q.recipient_id = owner and q.answer_public and q.answer is not null and q.deleted_at is null and q.removed_at is null
      and (p_before is null or (q.answered_at, q.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by q.answered_at desc, q.id desc
    limit lim + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'question', body, 'answer', answer, 'answeredAt', answered_at) order by rn) filter (where rn <= lim), '[]'::jsonb), count(*)
    into msgs, total
  from page;
  return jsonb_build_object('answers', msgs, 'hasMore', total > lim);
end;
$$;
grant execute on function public.ask_public_answers(text, int, timestamptz, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------- asking (needs an account)
create or replace function public.ask_send(p_username text, p_body text, p_client_key text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  recip uuid;
  clean text;
  n int;
  qid uuid;
begin
  if me is null then raise exception 'Please log in to send a question.' using errcode = '28000'; end if;
  if coalesce((select is_suspended from public.profiles where id = me), true) then raise exception 'This account can not send questions right now.'; end if;
  if exists (select 1 from public.ask_bans where user_id = me) then raise exception 'You can no longer send anonymous questions.'; end if;

  select id into recip from public.profiles where lower(username) = lower(btrim(coalesce(p_username, ''))) and not is_suspended and not is_ai;
  if recip is null then raise exception 'That person was not found.'; end if;
  if recip = me then raise exception 'You can not ask yourself a question.'; end if;
  if not coalesce((select s.enabled from public.ask_settings s where s.user_id = recip), true) then raise exception 'This person is not taking questions right now.'; end if;
  -- blocked (either way), hidden from, or blocked from asking: the same plain answer for all, so nothing is given away
  if exists (select 1 from public.blocks b where (b.blocker_id = recip and b.blocked_id = me) or (b.blocker_id = me and b.blocked_id = recip))
     or exists (select 1 from public.profile_hides h where h.owner_id = recip and h.hidden_from_id = me)
     or exists (select 1 from public.ask_blocks k where k.recipient_id = recip and k.sender_id = me) then
    raise exception 'Questions to this person are not available.';
  end if;

  clean := public.fun_clean_text(p_body);
  if char_length(clean) < 2 then raise exception 'Write your question first.'; end if;
  if char_length(clean) > 500 then raise exception 'Questions can be at most 500 characters.'; end if;
  if p_client_key is not null and char_length(p_client_key) > 64 then raise exception 'Invalid request.'; end if;
  if (char_length(clean) - char_length(replace(lower(clean), 'http', ''))) / 4 > 1 then raise exception 'Please do not include more than one link.'; end if;

  perform pg_advisory_xact_lock(hashtextextended('ask_send:' || me::text, 0));

  if p_client_key is not null and exists (select 1 from public.ask_questions where sender_id = me and client_key = p_client_key) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  if exists (select 1 from public.ask_questions where sender_id = me and created_at > now() - interval '15 seconds') then raise exception 'Please wait a moment before sending another question.'; end if;
  select count(*) into n from public.ask_questions where sender_id = me and created_at > now() - interval '1 hour';
  if n >= 10 then raise exception 'You have sent a lot of questions just now. Please try again a little later.'; end if;
  select count(*) into n from public.ask_questions where sender_id = me and created_at > now() - interval '24 hours';
  if n >= 40 then raise exception 'You have reached today''s limit for questions. Please try again tomorrow.'; end if;
  select count(*) into n from public.ask_questions where sender_id = me and recipient_id = recip and created_at > now() - interval '24 hours';
  if n >= 5 then raise exception 'You have asked this person a lot today. Please give them time to answer.'; end if;
  if exists (select 1 from public.ask_questions where sender_id = me and recipient_id = recip and created_at > now() - interval '24 hours' and lower(body) = lower(clean)) then raise exception 'You already asked this person that.'; end if;
  select count(*) into n from public.ask_questions where recipient_id = recip and created_at > now() - interval '1 hour';
  if n >= 200 then raise exception 'This person is getting a lot of questions right now. Please try again later.'; end if;

  insert into public.ask_questions (recipient_id, sender_id, body, client_key) values (recip, me, clean, p_client_key) returning id into qid;

  -- one alert at a time (not one per question), and it names nobody
  if not exists (select 1 from public.notifications nt where nt.target_user_id = recip and nt.type = 'ask_question' and nt.created_at > now() - interval '10 minutes') then
    insert into public.notifications (target_user_id, actor_id, type, title, message)
    values (recip, null, 'ask_question', 'New anonymous question', 'Someone asked you a question. Open Ask Me Anything to read it.');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.ask_send(text, text, text) from public, anon;
grant execute on function public.ask_send(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------- the owner's inbox
create or replace function public.ask_inbox(p_filter text default 'new', p_limit int default 20, p_before timestamptz default null, p_before_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  lim int := least(greatest(coalesce(p_limit, 20), 1), 50);
  f text := case when p_filter in ('new', 'answered', 'all') then p_filter else 'new' end;
  msgs jsonb;
  total int;
  n_new int;
  n_answered int;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select count(*) filter (where q.answered_at is null), count(*) filter (where q.answered_at is not null) into n_new, n_answered
    from public.ask_questions q where q.recipient_id = me and q.deleted_at is null and q.removed_at is null;
  with page as (
    select q.*, row_number() over (order by q.created_at desc, q.id desc) as rn
    from public.ask_questions q
    where q.recipient_id = me and q.deleted_at is null and q.removed_at is null
      and (f = 'all' or (f = 'new' and q.answered_at is null) or (f = 'answered' and q.answered_at is not null))
      and (p_before is null or (q.created_at, q.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by q.created_at desc, q.id desc
    limit lim + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'body', body, 'createdAt', created_at, 'answer', answer, 'answeredAt', answered_at, 'answerPublic', answer_public, 'reported', reported_at is not null) order by rn) filter (where rn <= lim), '[]'::jsonb), count(*)
    into msgs, total
  from page;
  return jsonb_build_object('questions', msgs, 'hasMore', total > lim, 'counts', jsonb_build_object('new', n_new, 'answered', n_answered));
end;
$$;
revoke execute on function public.ask_inbox(text, int, timestamptz, uuid) from public, anon;
grant execute on function public.ask_inbox(text, int, timestamptz, uuid) to authenticated;

-- Answer a question (privately, or published on the profile). Answering again edits the answer.
create or replace function public.ask_answer(p_question uuid, p_answer text, p_public boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  clean text := public.fun_clean_text(p_answer);
  q public.ask_questions;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if clean = '' then raise exception 'Write your answer first.'; end if;
  if char_length(clean) > 1000 then raise exception 'Answers can be at most 1000 characters.'; end if;
  update public.ask_questions set answer = clean, answered_at = coalesce(answered_at, now()), answer_public = coalesce(p_public, false)
    where id = p_question and recipient_id = me and deleted_at is null and removed_at is null returning * into q;
  if not found then raise exception 'That question is no longer there.'; end if;
  return public.ask_q_json(q);
end;
$$;
revoke execute on function public.ask_answer(uuid, text, boolean) from public, anon;
grant execute on function public.ask_answer(uuid, text, boolean) to authenticated;

-- Publish an answer on the profile, or take it off again.
create or replace function public.ask_set_public(p_question uuid, p_public boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  q public.ask_questions;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  update public.ask_questions set answer_public = coalesce(p_public, false)
    where id = p_question and recipient_id = me and answer is not null and deleted_at is null and removed_at is null returning * into q;
  if not found then raise exception 'Answer the question first.'; end if;
  return public.ask_q_json(q);
end;
$$;
revoke execute on function public.ask_set_public(uuid, boolean) from public, anon;
grant execute on function public.ask_set_public(uuid, boolean) to authenticated;

create or replace function public.ask_delete(p_question uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); rc int := 0;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  update public.ask_questions set deleted_at = now(), answer_public = false where id = p_question and recipient_id = me and deleted_at is null;
  get diagnostics rc = row_count;
  if rc = 0 then raise exception 'That question is no longer there.'; end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.ask_delete(uuid) from public, anon;
grant execute on function public.ask_delete(uuid) to authenticated;

-- Report an abusive question to the administrators (the question text is what they get; it does not name the sender).
create or replace function public.ask_report(p_question uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); rc int := 0;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  update public.ask_questions set reported_at = coalesce(reported_at, now()), report_reason = left(btrim(coalesce(p_reason, '')), 200)
    where id = p_question and recipient_id = me and deleted_at is null and removed_at is null;
  get diagnostics rc = row_count;
  if rc = 0 then raise exception 'That question is no longer there.'; end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.ask_report(uuid, text) from public, anon;
grant execute on function public.ask_report(uuid, text) to authenticated;

-- "Block this sender": deletes the question and stops that person from asking this owner again. Returns only whether it worked.
create or replace function public.ask_block_sender(p_question uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  who uuid;
  found_q boolean := false;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select q.sender_id, true into who, found_q from public.ask_questions q where q.id = p_question and q.recipient_id = me and q.deleted_at is null;
  if not coalesce(found_q, false) then raise exception 'That question is no longer there.'; end if;
  if who is not null then insert into public.ask_blocks (recipient_id, sender_id) values (me, who) on conflict do nothing; end if;
  update public.ask_questions set deleted_at = now(), answer_public = false where id = p_question;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.ask_block_sender(uuid) from public, anon;
grant execute on function public.ask_block_sender(uuid) to authenticated;

create or replace function public.ask_my_settings() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  return jsonb_build_object('enabled', coalesce((select s.enabled from public.ask_settings s where s.user_id = me), true), 'username', (select username from public.profiles where id = me));
end;
$$;
revoke execute on function public.ask_my_settings() from public, anon;
grant execute on function public.ask_my_settings() to authenticated;

create or replace function public.ask_set_enabled(p_enabled boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  insert into public.ask_settings (user_id, enabled, updated_at) values (me, coalesce(p_enabled, true), now())
    on conflict (user_id) do update set enabled = excluded.enabled, updated_at = now();
  return jsonb_build_object('enabled', coalesce(p_enabled, true));
end;
$$;
revoke execute on function public.ask_set_enabled(boolean) from public, anon;
grant execute on function public.ask_set_enabled(boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------- the people who handle reports
-- A reported question: its text, the reason and who it was addressed to - never who sent it.
create or replace function public.ask_admin_reports(p_limit int default 20) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare lim int := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  if not public.fun_can_manage() then raise exception 'Access denied. You do not have permission for this.' using errcode = '42501'; end if;
  return jsonb_build_object('reports', coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'body', x.body, 'createdAt', x.created_at, 'reportedAt', x.reported_at, 'reason', x.report_reason,
                                        'toUsername', (select username from public.profiles where id = x.recipient_id)) order by x.reported_at desc)
    from (select * from public.ask_questions q where q.reported_at is not null and q.removed_at is null order by q.reported_at desc limit lim) x), '[]'::jsonb));
end;
$$;
revoke execute on function public.ask_admin_reports(int) from public, anon;
grant execute on function public.ask_admin_reports(int) to authenticated;

create or replace function public.ask_admin_dismiss(p_question uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rc int := 0;
begin
  if not public.fun_can_manage() then raise exception 'Access denied. You do not have permission for this.' using errcode = '42501'; end if;
  update public.ask_questions set reported_at = null, report_reason = null where id = p_question and reported_at is not null;
  get diagnostics rc = row_count;
  if rc = 0 then raise exception 'That report is no longer there.'; end if;
  perform public.log_admin_action('ask_report_dismissed', null, jsonb_build_object('questionId', p_question));
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.ask_admin_dismiss(uuid) from public, anon;
grant execute on function public.ask_admin_dismiss(uuid) to authenticated;

-- Remove the question; optionally stop its sender from asking anyone (without anyone learning who it is).
create or replace function public.ask_admin_remove(p_question uuid, p_ban_sender boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  who uuid;
  to_user uuid;
  rc int := 0;
begin
  if not public.fun_can_manage() then raise exception 'Access denied. You do not have permission for this.' using errcode = '42501'; end if;
  update public.ask_questions set removed_at = now(), removed_by = auth.uid(), answer_public = false where id = p_question and removed_at is null
    returning sender_id, recipient_id into who, to_user;
  get diagnostics rc = row_count;
  if rc = 0 then raise exception 'That question is no longer there.'; end if;
  if coalesce(p_ban_sender, false) and who is not null then
    insert into public.ask_bans (user_id, banned_by, reason) values (who, auth.uid(), 'A reported anonymous question was removed') on conflict do nothing;
  end if;
  perform public.log_admin_action('ask_question_removed', to_user, jsonb_build_object('questionId', p_question, 'senderBanned', coalesce(p_ban_sender, false) and who is not null));
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.ask_admin_remove(uuid, boolean) from public, anon;
grant execute on function public.ask_admin_remove(uuid, boolean) to authenticated;
