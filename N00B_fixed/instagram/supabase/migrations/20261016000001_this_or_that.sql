-- This or That: a daily "pick a side" question with two big choices. Everyone sees today's question; after voting you see how everyone voted (the percentage and the number of
-- votes for both choices); earlier questions stay in a list.
--
-- The rules are kept HERE, in the database, not in the app:
--   * the tables can not be read or written by the app at all (no direct access); everything goes through the functions below;
--   * one vote per person per question: the primary key (question, person) makes a second vote impossible, and the function says so in plain words;
--   * the numbers are counted from the votes themselves each time - there is no stored counter that could drift or be set from the app;
--   * the results of a question are sent only to someone who has voted on it (or to an administrator), so nobody can read the numbers first and then follow the crowd;
--   * only an administrator (or a helper with the "moderate content" permission) can add or remove a question; a question for a future day stays hidden until that day.
-- "Today" is the day in India (the community's day), so the question changes at midnight there.
-- Safe to run more than once. No existing table or function is changed.

-- the day a question belongs to: today in India
create or replace function public.fun_today() returns date
language sql stable set search_path = public as $$
  select (now() at time zone 'Asia/Kolkata')::date;
$$;

-- Plain text only, tidied (shared by the Fun features): line endings unified, control characters and the invisible direction-changing / zero-width characters removed,
-- spaces trimmed, a run of blank lines squeezed to one. Nothing is HTML-escaped here: the app shows text as text, never as HTML.
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

-- May this person add and remove questions, polls... (the main administrator, or a helper who was given "moderate content")?
create or replace function public.fun_can_manage() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.can_moderate_content(), false);
$$;
revoke execute on function public.fun_can_manage() from public, anon;
grant execute on function public.fun_can_manage() to authenticated;

create table if not exists public.tot_questions (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,                             -- order of creation: the newest question of a day is the one shown
  option_a text not null check (char_length(option_a) between 1 and 40),
  option_b text not null check (char_length(option_b) between 1 and 40),
  emoji_a text not null default '' check (char_length(emoji_a) <= 8),
  emoji_b text not null default '' check (char_length(emoji_b) <= 8),
  publish_on date not null,                                            -- the day it becomes "today's question"
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid
);
create unique index if not exists tot_questions_seq_idx on public.tot_questions (seq);
create index if not exists tot_questions_day_idx on public.tot_questions (publish_on desc, seq desc) where removed_at is null;

create table if not exists public.tot_votes (
  question_id uuid not null references public.tot_questions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  choice text not null check (choice in ('a', 'b')),
  created_at timestamptz not null default now(),
  primary key (question_id, user_id)                                   -- one vote per person per question
);
create index if not exists tot_votes_question_idx on public.tot_votes (question_id, choice);
create index if not exists tot_votes_user_idx on public.tot_votes (user_id, created_at desc);

alter table public.tot_questions enable row level security;
alter table public.tot_votes enable row level security;
revoke all on public.tot_questions, public.tot_votes from public, anon, authenticated;

-- One question as the app gets it. `show` = whether the numbers go with it.
create or replace function public.tot_json(q public.tot_questions, show boolean) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  mine text;
  na int := 0;
  nb int := 0;
begin
  if me is not null then select v.choice into mine from public.tot_votes v where v.question_id = q.id and v.user_id = me; end if;
  if show or mine is not null then
    select count(*) filter (where v.choice = 'a'), count(*) filter (where v.choice = 'b') into na, nb from public.tot_votes v where v.question_id = q.id;
  end if;
  return jsonb_build_object(
    'id', q.id, 'seq', q.seq, 'optionA', q.option_a, 'optionB', q.option_b, 'emojiA', q.emoji_a, 'emojiB', q.emoji_b,
    'day', q.publish_on, 'isToday', q.publish_on = public.fun_today(), 'myVote', mine,
    'results', case when show or mine is not null then jsonb_build_object('a', na, 'b', nb, 'total', na + nb) else null end
  );
end;
$$;
revoke execute on function public.tot_json(public.tot_questions, boolean) from public, anon, authenticated;

-- Today's question: the newest one whose day has come (so there is always one to show). Anyone can read it; the numbers only after voting.
create or replace function public.tot_today() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare q public.tot_questions;
begin
  select * into q from public.tot_questions where removed_at is null and publish_on <= public.fun_today() order by publish_on desc, seq desc limit 1;
  if not found then return null; end if;
  return public.tot_json(q, false);
end;
$$;
grant execute on function public.tot_today() to anon, authenticated;

-- Earlier questions, newest first, a page at a time (keyset: the day and number of the last one seen). Today's question is not repeated in it.
create or replace function public.tot_previous(p_limit int default 10, p_before_day date default null, p_before_seq bigint default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  lim int := least(greatest(coalesce(p_limit, 10), 1), 30);
  cur uuid;
  rows jsonb := '[]'::jsonb;
  n int := 0;
  r public.tot_questions;
begin
  select id into cur from public.tot_questions where removed_at is null and publish_on <= public.fun_today() order by publish_on desc, seq desc limit 1;
  for r in
    select * from public.tot_questions q
    where q.removed_at is null and q.publish_on <= public.fun_today() and q.id is distinct from cur
      and (p_before_day is null or (q.publish_on, q.seq) < (p_before_day, coalesce(p_before_seq, 9223372036854775807)))
    order by q.publish_on desc, q.seq desc
    limit lim + 1
  loop
    n := n + 1;
    if n <= lim then rows := rows || jsonb_build_array(public.tot_json(r, false)); end if;
  end loop;
  return jsonb_build_object('questions', rows, 'hasMore', n > lim);
end;
$$;
grant execute on function public.tot_previous(int, date, bigint) to anon, authenticated;

-- Voting: needs an account; one vote per question; the answer carries the numbers.
create or replace function public.tot_vote(p_question uuid, p_choice text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  q public.tot_questions;
  rc int := 0;
  n int;
begin
  if me is null then raise exception 'Please log in to vote.' using errcode = '28000'; end if;
  if coalesce((select is_suspended from public.profiles where id = me), true) then raise exception 'This account can not vote right now.'; end if;
  if p_choice is null or p_choice not in ('a', 'b') then raise exception 'Pick one of the two choices.'; end if;
  select * into q from public.tot_questions where id = p_question and removed_at is null and publish_on <= public.fun_today();
  if not found then raise exception 'That question is not available.'; end if;
  select count(*) into n from public.tot_votes where user_id = me and created_at > now() - interval '1 hour';
  if n >= 60 then raise exception 'You are voting very fast. Please slow down a little.'; end if;
  insert into public.tot_votes (question_id, user_id, choice) values (q.id, me, p_choice) on conflict (question_id, user_id) do nothing;
  get diagnostics rc = row_count;
  if rc = 0 then raise exception 'You have already voted on this question.'; end if;
  return public.tot_json(q, true);
end;
$$;
revoke execute on function public.tot_vote(uuid, text) from public, anon;
grant execute on function public.tot_vote(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------- the people who manage questions
-- Every question, including those scheduled for later days, with the numbers.
create or replace function public.tot_admin_list(p_limit int default 20, p_before_day date default null, p_before_seq bigint default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  lim int := least(greatest(coalesce(p_limit, 20), 1), 60);
  rows jsonb := '[]'::jsonb;
  n int := 0;
  r public.tot_questions;
begin
  if not public.fun_can_manage() then raise exception 'Access denied. You do not have permission for this.' using errcode = '42501'; end if;
  for r in
    select * from public.tot_questions q
    where q.removed_at is null
      and (p_before_day is null or (q.publish_on, q.seq) < (p_before_day, coalesce(p_before_seq, 9223372036854775807)))
    order by q.publish_on desc, q.seq desc
    limit lim + 1
  loop
    n := n + 1;
    if n <= lim then rows := rows || jsonb_build_array(public.tot_json(r, true)); end if;
  end loop;
  return jsonb_build_object('questions', rows, 'hasMore', n > lim);
end;
$$;
revoke execute on function public.tot_admin_list(int, date, bigint) from public, anon;
grant execute on function public.tot_admin_list(int, date, bigint) to authenticated;

create or replace function public.tot_admin_create(p_a text, p_b text, p_emoji_a text default '', p_emoji_b text default '', p_publish_on date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a text := public.fun_clean_text(p_a);
  b text := public.fun_clean_text(p_b);
  ea text := btrim(coalesce(p_emoji_a, ''));
  eb text := btrim(coalesce(p_emoji_b, ''));
  day date := coalesce(p_publish_on, public.fun_today());
  q public.tot_questions;
begin
  if not public.fun_can_manage() then raise exception 'Access denied. You do not have permission for this.' using errcode = '42501'; end if;
  if a = '' or b = '' then raise exception 'Both choices need some text.'; end if;
  if char_length(a) > 40 or char_length(b) > 40 then raise exception 'Each choice can be at most 40 characters.'; end if;
  if lower(a) = lower(b) then raise exception 'The two choices must be different.'; end if;
  if char_length(ea) > 8 or char_length(eb) > 8 then raise exception 'An emoji is too long.'; end if;
  if day > public.fun_today() + 365 then raise exception 'That day is too far ahead.'; end if;
  if day < public.fun_today() - 3650 then raise exception 'That day is too long ago.'; end if;
  insert into public.tot_questions (option_a, option_b, emoji_a, emoji_b, publish_on, created_by) values (a, b, ea, eb, day, auth.uid()) returning * into q;
  perform public.log_admin_action('this_or_that_created', null, jsonb_build_object('questionId', q.id, 'day', day));
  return public.tot_json(q, true);
end;
$$;
revoke execute on function public.tot_admin_create(text, text, text, text, date) from public, anon;
grant execute on function public.tot_admin_create(text, text, text, text, date) to authenticated;

create or replace function public.tot_admin_remove(p_question uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rc int := 0;
begin
  if not public.fun_can_manage() then raise exception 'Access denied. You do not have permission for this.' using errcode = '42501'; end if;
  update public.tot_questions set removed_at = now(), removed_by = auth.uid() where id = p_question and removed_at is null;
  get diagnostics rc = row_count;
  if rc = 0 then raise exception 'That question is no longer there.'; end if;
  perform public.log_admin_action('this_or_that_removed', null, jsonb_build_object('questionId', p_question));
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.tot_admin_remove(uuid) from public, anon;
grant execute on function public.tot_admin_remove(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------- the first questions
-- Four from the past (so the list is not empty), today's, and 19 for the coming days: a new one appears by itself each day.
do $$
begin
  if not exists (select 1 from public.tot_questions) then
    insert into public.tot_questions (option_a, option_b, emoji_a, emoji_b, publish_on)
    select v.a, v.b, v.ea, v.eb, public.fun_today() + v.d
    from (values
      (-4, 'Introvert', 'Extrovert', E'\U0001F92B', E'\U0001F5E3\uFE0F'),
      (-3, 'Gaming', 'Movies', E'\U0001F3AE', E'\U0001F3AC'),
      (-2, 'Android', 'iPhone', E'\U0001F4F1', E'\U0001F34E'),
      (-1, 'Night', 'Day', E'\U0001F319', E'\u2600\uFE0F'),
      (0, 'Love', 'Money', E'\u2764\uFE0F', E'\U0001F4B0'),
      (1, 'Pizza', 'Burger', E'\U0001F355', E'\U0001F354'),
      (2, 'Beach', 'Mountains', E'\U0001F3D6\uFE0F', E'\u26F0\uFE0F'),
      (3, 'Cats', 'Dogs', E'\U0001F431', E'\U0001F436'),
      (4, 'Tea', 'Coffee', E'\U0001F375', E'\u2615'),
      (5, 'Books', 'Podcasts', E'\U0001F4DA', E'\U0001F3A7'),
      (6, 'Summer', 'Winter', E'\U0001F31E', E'\u2744\uFE0F'),
      (7, 'Text', 'Call', E'\U0001F4AC', E'\U0001F4DE'),
      (8, 'Early bird', 'Night owl', E'\U0001F305', E'\U0001F989'),
      (9, 'Sweet', 'Spicy', E'\U0001F370', E'\U0001F336\uFE0F'),
      (10, 'Cricket', 'Football', E'\U0001F3CF', E'\u26BD'),
      (11, 'Travel', 'Stay home', E'\u2708\uFE0F', E'\U0001F3E0'),
      (12, 'Music', 'Silence', E'\U0001F3B5', E'\U0001F910'),
      (13, 'Photos', 'Videos', E'\U0001F4F7', E'\U0001F4F9'),
      (14, 'Rain', 'Sunshine', E'\U0001F327\uFE0F', E'\U0001F324\uFE0F'),
      (15, 'Dance', 'Sing', E'\U0001F483', E'\U0001F3A4'),
      (16, 'Laptop', 'Phone', E'\U0001F4BB', E'\U0001F4F1'),
      (17, 'Past', 'Future', E'\u23EA', E'\u23E9'),
      (18, 'Chocolate', 'Ice cream', E'\U0001F36B', E'\U0001F366'),
      (19, 'Selfie', 'Group photo', E'\U0001F933', E'\U0001F46F')
    ) as v(d, a, b, ea, eb);
  end if;
end $$;
