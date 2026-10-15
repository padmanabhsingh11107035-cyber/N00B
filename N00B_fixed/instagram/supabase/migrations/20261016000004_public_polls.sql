-- Public Polls: anyone eligible can ask the community a question with 2 to 8 options and a time limit; people vote once; results show as numbers and percentages under the rule the
-- creator chose (always, after you vote, or only when the poll has ended). Polls can be reported (three reports hide one until an administrator decides), and the creator or an
-- administrator can remove one. Polls are public; WHO voted for what is never shown to anybody - only the totals.
--
-- The rules are kept HERE, in the database, not in the app:
--   * the tables can not be read or written by the app at all; everything goes through the functions below;
--   * one vote per person per poll: the primary key (poll, person) makes a second vote impossible, and a vote can only be for an option of THAT poll (a composite foreign key);
--   * the numbers are counted from the votes each time - there is no stored counter that could drift or be set from the app;
--   * the results of a poll are sent only when its rule allows: "always"; "after I voted" (only to people who voted); "when it ends" (to nobody before that, the creator included -
--     only the main administrator can look, to moderate); a poll that has ended shows its results to everyone;
--   * a vote after the end time, on a removed or hidden poll, or for an option of another poll is refused.
-- Eligibility to create: a signed-in, not suspended account that is at least an hour old, at most 3 new polls a day (administrators: no daily limit), one every 20 seconds, no repeating
-- the same question within a day, 5 to 200 characters for the question, 2 to 8 options of 1 to 80 characters, at most one link, and a time limit of 5 minutes to 30 days.
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

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  question text not null check (char_length(question) between 5 and 200),
  results_visibility text not null default 'after_vote' check (results_visibility in ('always', 'after_vote', 'after_end')),
  created_at timestamptz not null default now(),
  ends_at timestamptz not null,
  hidden boolean not null default false,                               -- hidden automatically after 3 reports, until an administrator decides
  removed_at timestamptz,
  removed_by uuid
);
create unique index if not exists polls_seq_idx on public.polls (seq);
create index if not exists polls_ends_idx on public.polls (ends_at desc, seq desc) where removed_at is null and not hidden;
create index if not exists polls_creator_idx on public.polls (creator_id, seq desc) where removed_at is null;
create index if not exists polls_creator_time_idx on public.polls (creator_id, created_at desc);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  position smallint not null check (position between 0 and 7),
  label text not null check (char_length(label) between 1 and 80),
  unique (poll_id, position),
  unique (poll_id, id)
);

create table if not exists public.poll_votes (
  poll_id uuid not null references public.polls (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  option_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id),                                      -- one vote per person per poll
  foreign key (poll_id, option_id) references public.poll_options (poll_id, id) on delete cascade   -- ... and only for an option of that poll
);
create index if not exists poll_votes_option_idx on public.poll_votes (poll_id, option_id);
create index if not exists poll_votes_user_idx on public.poll_votes (user_id, created_at desc);

create table if not exists public.poll_reports (
  poll_id uuid not null references public.polls (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (poll_id, reporter_id)
);
create index if not exists poll_reports_reporter_idx on public.poll_reports (reporter_id, created_at desc);

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
alter table public.poll_reports enable row level security;
revoke all on public.polls, public.poll_options, public.poll_votes, public.poll_reports from public, anon, authenticated;

-- One poll as the app gets it, with the numbers only when the poll's rule lets this person have them.
create or replace function public.poll_json(p public.polls) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  mine uuid;
  ended boolean := p.ends_at <= now();
  total int;
  show boolean;
  opts jsonb;
  who public.profiles;
  status text;
begin
  if me is not null then select v.option_id into mine from public.poll_votes v where v.poll_id = p.id and v.user_id = me; end if;
  select count(*) into total from public.poll_votes v where v.poll_id = p.id;
  show := p.results_visibility = 'always' or (p.results_visibility = 'after_vote' and mine is not null) or ended or public.fun_can_manage();
  select jsonb_agg(jsonb_build_object('id', o.id, 'position', o.position, 'label', o.label,
                                      'votes', case when show then (select count(*) from public.poll_votes v where v.option_id = o.id) else null end) order by o.position)
    into opts from public.poll_options o where o.poll_id = p.id;
  select * into who from public.profiles where id = p.creator_id;
  status := case when p.removed_at is not null then 'removed' when p.hidden then 'hidden' when not ended then 'active' when total > 0 then 'completed' else 'expired' end;
  return jsonb_build_object(
    'id', p.id, 'seq', p.seq, 'question', p.question, 'options', coalesce(opts, '[]'::jsonb),
    'creator', jsonb_build_object('userId', who.id, 'username', who.username, 'displayName', coalesce(nullif(who.display_name, ''), who.username), 'avatar', who.avatar, 'isVerified', who.is_verified),
    'createdAt', p.created_at, 'endsAt', p.ends_at, 'ended', ended, 'status', status,
    'resultsVisibility', p.results_visibility, 'resultsShown', show, 'totalVotes', case when show then total else null end,
    'myVote', mine, 'isMine', me is not distinct from p.creator_id);
end;
$$;
revoke execute on function public.poll_json(public.polls) from public, anon, authenticated;

-- May this person see this poll at all? (Removed ones: only managers. Hidden ones: only the creator and managers.)
create or replace function public.poll_can_see(p public.polls) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.fun_can_manage() then true
    when p.removed_at is not null then false
    when p.hidden then p.creator_id is not distinct from auth.uid()
    else true end;
$$;
revoke execute on function public.poll_can_see(public.polls) from public, anon, authenticated;

create or replace function public.poll_get(p_poll uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p public.polls;
begin
  select * into p from public.polls where id = p_poll;
  if not found or not public.poll_can_see(p) then return null; end if;
  return public.poll_json(p);
end;
$$;
grant execute on function public.poll_get(uuid) to anon, authenticated;

-- Polls, a page at a time. 'active': still open, newest first. 'ended': finished (completed or expired), most recently ended first. 'mine': the ones I made.
create or replace function public.poll_list(p_tab text default 'active', p_limit int default 10, p_before_time timestamptz default null, p_before_seq bigint default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  lim int := least(greatest(coalesce(p_limit, 10), 1), 30);
  tab text := case when p_tab in ('active', 'ended', 'mine') then p_tab else 'active' end;
  rows jsonb := '[]'::jsonb;
  n int := 0;
  r public.polls;
begin
  if tab = 'mine' and me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  for r in
    select * from public.polls q
    where case
            when tab = 'mine' then q.creator_id = me and q.removed_at is null
            else q.removed_at is null and not q.hidden and (case when tab = 'active' then q.ends_at > now() else q.ends_at <= now() end)
          end
      and (p_before_seq is null or case
            when tab = 'ended' then (q.ends_at, q.seq) < (coalesce(p_before_time, 'infinity'::timestamptz), p_before_seq)
            else q.seq < p_before_seq end)
    order by case when tab = 'ended' then q.ends_at end desc nulls last, q.seq desc
    limit lim + 1
  loop
    n := n + 1;
    if n <= lim then rows := rows || jsonb_build_array(public.poll_json(r)); end if;
  end loop;
  return jsonb_build_object('polls', rows, 'hasMore', n > lim);
end;
$$;
grant execute on function public.poll_list(text, int, timestamptz, bigint) to anon, authenticated;

-- Make a poll.
create or replace function public.poll_create(p_question text, p_options text[], p_duration_minutes int, p_results text default 'after_vote') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  q text := regexp_replace(public.fun_clean_text(p_question), E'\\s+', ' ', 'g');
  opts text[] := '{}';
  raw text;
  o text;
  n int;
  p public.polls;
  i int := 0;
  links int;
begin
  if me is null then raise exception 'Please log in to create a poll.' using errcode = '28000'; end if;
  if coalesce((select is_suspended from public.profiles where id = me), true) then raise exception 'This account can not create polls right now.'; end if;
  if not public.fun_can_manage() and coalesce((select created_at from public.profiles where id = me), now()) > now() - interval '1 hour' then
    raise exception 'New accounts can create polls after their first hour.';
  end if;
  if char_length(q) < 5 then raise exception 'Write your question first (at least 5 characters).'; end if;
  if char_length(q) > 200 then raise exception 'The question can be at most 200 characters.'; end if;
  if p_options is null or cardinality(p_options) < 2 then raise exception 'A poll needs at least 2 options.'; end if;
  if cardinality(p_options) > 8 then raise exception 'A poll can have at most 8 options.'; end if;
  foreach raw in array p_options loop
    o := regexp_replace(public.fun_clean_text(raw), E'\\s+', ' ', 'g');
    if o = '' then raise exception 'Every option needs some text.'; end if;
    if char_length(o) > 80 then raise exception 'An option can be at most 80 characters.'; end if;
    if lower(o) = any (select lower(x) from unnest(opts) x) then raise exception 'The options must all be different.'; end if;
    opts := opts || o;
  end loop;
  if p_duration_minutes is null or p_duration_minutes < 5 or p_duration_minutes > 43200 then raise exception 'A poll can last from 5 minutes to 30 days.'; end if;
  if coalesce(p_results, 'after_vote') not in ('always', 'after_vote', 'after_end') then raise exception 'Choose when the results are shown.'; end if;
  links := (char_length(q || ' ' || array_to_string(opts, ' ')) - char_length(replace(lower(q || ' ' || array_to_string(opts, ' ')), 'http', ''))) / 4;
  if links > 1 then raise exception 'Please do not include more than one link.'; end if;

  perform pg_advisory_xact_lock(hashtextextended('poll_create:' || me::text, 0));
  if exists (select 1 from public.polls where creator_id = me and created_at > now() - interval '20 seconds') then raise exception 'Please wait a moment before creating another poll.'; end if;
  if not public.fun_can_manage() then
    select count(*) into n from public.polls where creator_id = me and created_at > now() - interval '24 hours';
    if n >= 3 then raise exception 'You can create up to 3 polls a day. Please try again tomorrow.'; end if;
  end if;
  if exists (select 1 from public.polls where creator_id = me and created_at > now() - interval '24 hours' and lower(question) = lower(q)) then raise exception 'You already asked that today.'; end if;

  insert into public.polls (creator_id, question, results_visibility, ends_at) values (me, q, coalesce(p_results, 'after_vote'), now() + make_interval(mins => p_duration_minutes)) returning * into p;
  foreach o in array opts loop
    insert into public.poll_options (poll_id, position, label) values (p.id, i, o);
    i := i + 1;
  end loop;
  return public.poll_json(p);
end;
$$;
revoke execute on function public.poll_create(text, text[], int, text) from public, anon;
grant execute on function public.poll_create(text, text[], int, text) to authenticated;

-- Vote.
create or replace function public.poll_vote(p_poll uuid, p_option uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  p public.polls;
  rc int := 0;
  n int;
begin
  if me is null then raise exception 'Please log in to vote.' using errcode = '28000'; end if;
  if coalesce((select is_suspended from public.profiles where id = me), true) then raise exception 'This account can not vote right now.'; end if;
  select * into p from public.polls where id = p_poll and removed_at is null and not hidden;
  if not found then raise exception 'That poll is not available.'; end if;
  if p.ends_at <= now() then raise exception 'This poll has ended.'; end if;
  if not exists (select 1 from public.poll_options o where o.id = p_option and o.poll_id = p.id) then raise exception 'Pick one of the options of this poll.'; end if;
  select count(*) into n from public.poll_votes where user_id = me and created_at > now() - interval '1 hour';
  if n >= 120 then raise exception 'You are voting very fast. Please slow down a little.'; end if;
  insert into public.poll_votes (poll_id, user_id, option_id) values (p.id, me, p_option) on conflict (poll_id, user_id) do nothing;
  get diagnostics rc = row_count;
  if rc = 0 then raise exception 'You have already voted in this poll.'; end if;
  return public.poll_json(p);
end;
$$;
revoke execute on function public.poll_vote(uuid, uuid) from public, anon;
grant execute on function public.poll_vote(uuid, uuid) to authenticated;

-- Remove a poll: its creator, or an administrator.
create or replace function public.poll_remove(p_poll uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  p public.polls;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into p from public.polls where id = p_poll and removed_at is null;
  if not found then raise exception 'That poll is no longer there.'; end if;
  if p.creator_id is distinct from me and not public.fun_can_manage() then raise exception 'You can only remove your own polls.' using errcode = '42501'; end if;
  update public.polls set removed_at = now(), removed_by = me where id = p.id;
  if p.creator_id is distinct from me then perform public.log_admin_action('poll_removed', p.creator_id, jsonb_build_object('pollId', p.id)); end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.poll_remove(uuid) from public, anon;
grant execute on function public.poll_remove(uuid) to authenticated;

-- Report a poll. Three different people reporting it hide it until an administrator decides.
create or replace function public.poll_report(p_poll uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  p public.polls;
  cnt int;
begin
  if me is null then raise exception 'Please log in to report a poll.' using errcode = '28000'; end if;
  select * into p from public.polls where id = p_poll and removed_at is null;
  if not found then raise exception 'That poll is no longer there.'; end if;
  if p.creator_id = me then raise exception 'You can not report your own poll. You can remove it instead.'; end if;
  select count(*) into cnt from public.poll_reports where reporter_id = me and created_at > now() - interval '24 hours';
  if cnt >= 30 then raise exception 'You have sent a lot of reports today. Thank you - please try again tomorrow.'; end if;
  insert into public.poll_reports (poll_id, reporter_id, reason) values (p.id, me, left(btrim(coalesce(p_reason, '')), 200)) on conflict do nothing;
  select count(*) into cnt from public.poll_reports where poll_id = p.id;
  if cnt >= 3 then update public.polls set hidden = true where id = p.id; end if;
  return jsonb_build_object('ok', true, 'hidden', cnt >= 3);
end;
$$;
revoke execute on function public.poll_report(uuid, text) from public, anon;
grant execute on function public.poll_report(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------- the people who handle reports
create or replace function public.poll_admin_reports(p_limit int default 20) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare lim int := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  if not public.fun_can_manage() then raise exception 'Access denied. You do not have permission for this.' using errcode = '42501'; end if;
  return jsonb_build_object('reports', coalesce((
    select jsonb_agg(jsonb_build_object('poll', public.poll_json(pl), 'reportCount', x.cnt, 'reasons', x.reasons) order by x.last_at desc)
    from (
      select r.poll_id, count(r.reporter_id)::int as cnt, max(r.created_at) as last_at,
             coalesce((select jsonb_agg(z.reason) from (select r2.reason from public.poll_reports r2 where r2.poll_id = r.poll_id and coalesce(r2.reason, '') <> '' order by r2.created_at limit 5) z), '[]'::jsonb) as reasons
      from public.poll_reports r join public.polls p on p.id = r.poll_id and p.removed_at is null
      group by r.poll_id order by max(r.created_at) desc limit lim
    ) x join public.polls pl on pl.id = x.poll_id), '[]'::jsonb));
end;
$$;
revoke execute on function public.poll_admin_reports(int) from public, anon;
grant execute on function public.poll_admin_reports(int) to authenticated;

-- "This poll is fine": the reports are cleared and a poll that was hidden by them is shown again.
create or replace function public.poll_admin_dismiss(p_poll uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.fun_can_manage() then raise exception 'Access denied. You do not have permission for this.' using errcode = '42501'; end if;
  delete from public.poll_reports where poll_id = p_poll;
  update public.polls set hidden = false where id = p_poll and removed_at is null;
  perform public.log_admin_action('poll_report_dismissed', null, jsonb_build_object('pollId', p_poll));
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.poll_admin_dismiss(uuid) from public, anon;
grant execute on function public.poll_admin_dismiss(uuid) to authenticated;
