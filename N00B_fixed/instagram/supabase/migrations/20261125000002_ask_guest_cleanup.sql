-- Questions sent by people WITHOUT an account are permanently deleted 24 hours after they were sent.
-- Kept on purpose: a question the owner PUBLISHED an answer for (the owner chose to show it), and a question reported by the owner that no administrator has looked at yet (evidence).
-- Reads stop showing an expired guest question at once (so the 24 hours are exact); the hourly clean-up then removes the rows for good. Safe to run more than once.
-- Run AFTER 20261125000001_ask_guests.sql.

create or replace function public.ask_purge_guest() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.ask_questions q
   where q.sender_id is null and q.device_key is not null
     and q.created_at < now() - interval '24 hours'
     and not q.answer_public
     and not (q.reported_at is not null and q.removed_at is null);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.ask_purge_guest() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin perform cron.unschedule('noob-ask-guest-purge'); exception when others then null; end;
    perform cron.schedule('noob-ask-guest-purge', '25 * * * *', $job$ select public.ask_purge_guest(); $job$);
  end if;
end $$;

-- The owner's inbox no longer shows an expired guest question, even in the minutes before the clean-up runs.
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
    from public.ask_questions q where q.recipient_id = me and q.deleted_at is null and q.removed_at is null
      and not (q.sender_id is null and q.device_key is not null and q.created_at < now() - interval '24 hours' and not q.answer_public);
  with page as (
    select q.*, row_number() over (order by q.created_at desc, q.id desc) as rn
    from public.ask_questions q
    where q.recipient_id = me and q.deleted_at is null and q.removed_at is null
      and not (q.sender_id is null and q.device_key is not null and q.created_at < now() - interval '24 hours' and not q.answer_public)
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
