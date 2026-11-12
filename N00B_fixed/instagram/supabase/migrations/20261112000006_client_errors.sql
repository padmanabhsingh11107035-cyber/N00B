-- Automatic crash / error reports and the "Report a problem" button. Additive only: TWO new small tables, new functions, one cron job. Nothing that exists is changed.
-- Kept tiny on purpose (free 500 MB database): text is cut short, the same error inside 24 h is ONE row with a counter, at most 5000 rows are ever held, rows older than 30 days are purged daily.
-- Only the user id is stored about the person (taken from the login on the server, never from the app). No e-mail, no message text, no tokens.

create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid null,
  kind text check (kind in ('error','rejection','boundary','user_report')),
  message text,
  stack text,
  page text,
  app_version text,
  platform text,
  user_agent text,
  note text,
  fingerprint text,
  count integer not null default 1,
  last_seen timestamptz not null default now()
);
create index if not exists client_errors_fingerprint_idx on public.client_errors (fingerprint, last_seen desc);
create index if not exists client_errors_last_seen_idx on public.client_errors (last_seen desc);
alter table public.client_errors enable row level security;
-- no policies on purpose: nobody reads or writes this table directly, only the functions below (security definer)
revoke all on public.client_errors from public, anon, authenticated;

-- how many reports each caller sent in each hour (the rate limit); one row per caller per hour, purged with the rest
create table if not exists public.client_error_rate (
  bucket text not null,
  hour timestamptz not null,
  n integer not null default 0,
  primary key (bucket, hour)
);
alter table public.client_error_rate enable row level security;
revoke all on public.client_error_rate from public, anon, authenticated;

-- The app calls this (also before login: errors happen there too). Never raises: a failing reporter must not cause more errors.
-- Limits: 30 reports an hour per logged-in person; visitors who are not logged in share 300 an hour in total. Over the limit the report is dropped quietly.
create or replace function public.report_client_error(
  p_kind text, p_message text, p_stack text, p_page text, p_app_version text, p_platform text, p_user_agent text, p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_bucket text := coalesce(me::text, 'anon');
  v_limit integer := case when me is null then 300 else 30 end;
  v_hour timestamptz := date_trunc('hour', now());
  v_n integer;
  v_msg text := left(coalesce(p_message, ''), 500);
  v_stack text := left(p_stack, 4000);
  v_note text := left(p_note, 1000);
  v_fp text;
  v_id bigint;
begin
  if p_kind is null or p_kind not in ('error','rejection','boundary','user_report') then return; end if;

  insert into public.client_error_rate (bucket, hour, n) values (v_bucket, v_hour, 1)
    on conflict (bucket, hour) do update set n = public.client_error_rate.n + 1
    returning n into v_n;
  if v_n > v_limit then return; end if;

  v_fp := md5(p_kind || '|' || v_msg || '|' || coalesce(split_part(coalesce(v_stack, ''), E'\n', 1), '')
              || case when p_kind = 'user_report' then '|' || coalesce(v_note, '') else '' end);

  select id into v_id from public.client_errors
    where fingerprint = v_fp and last_seen > now() - interval '24 hours'
    order by last_seen desc limit 1;
  if v_id is not null then
    update public.client_errors set count = count + 1, last_seen = now() where id = v_id;
    return;
  end if;

  -- a hard ceiling so that nothing can ever fill the free database
  if (select count(*) from public.client_errors) >= 5000 then return; end if;

  insert into public.client_errors (user_id, kind, message, stack, page, app_version, platform, user_agent, note, fingerprint)
  values (me, p_kind, v_msg, v_stack, left(p_page, 300), left(p_app_version, 300), left(p_platform, 300), left(p_user_agent, 300), v_note, v_fp);
exception when others then
  return;
end;
$$;
revoke all on function public.report_client_error(text, text, text, text, text, text, text, text) from public;
grant execute on function public.report_client_error(text, text, text, text, text, text, text, text) to anon, authenticated;

-- Admin only (checked here, not just by hiding the tab). One row per distinct error, newest first.
create or replace function public.admin_client_errors(p_limit integer default 100, p_since interval default interval '7 days')
returns table (
  fingerprint text, kind text, total_count bigint, first_seen timestamptz, last_seen timestamptz, page text, app_version text, platform text,
  message text, stack text, note text, users bigint
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin only.' using errcode = '42501'; end if;
  return query
  with recent as (
    select e.* from public.client_errors e where e.last_seen > now() - coalesce(p_since, interval '7 days')
  ), latest as (
    select distinct on (r.fingerprint) r.fingerprint as fp, r.kind as k, r.page as pg, r.app_version as av, r.platform as pf, r.message as msg, r.stack as stk
    from recent r order by r.fingerprint, r.last_seen desc
  ), agg as (
    select r.fingerprint as fp, sum(r.count)::bigint as c, min(r.created_at) as f, max(r.last_seen) as l, count(distinct r.user_id)::bigint as u,
           (array_agg(r.note order by r.last_seen desc) filter (where r.note is not null))[1] as nt
    from recent r group by r.fingerprint
  )
  select a.fp, l.k, a.c, a.f, a.l, l.pg, l.av, l.pf, l.msg, l.stk, a.nt, a.u
  from agg a join latest l on l.fp = a.fp
  order by a.l desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;
revoke all on function public.admin_client_errors(integer, interval) from public, anon;
grant execute on function public.admin_client_errors(integer, interval) to authenticated;

create or replace function public.admin_clear_client_errors() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_admin() then raise exception 'Admin only.' using errcode = '42501'; end if;
  delete from public.client_errors where true;
  get diagnostics n = row_count;
  delete from public.client_error_rate where true;
  return n;
end;
$$;
revoke all on function public.admin_clear_client_errors() from public, anon;
grant execute on function public.admin_clear_client_errors() to authenticated;

-- Deletes reports older than 30 days (and old rate counters). Run by cron only: nobody can call it from the app.
create or replace function public.purge_client_errors() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.client_errors where last_seen < now() - interval '30 days';
  get diagnostics n = row_count;
  delete from public.client_error_rate where hour < now() - interval '2 days';
  return n;
end;
$$;
revoke all on function public.purge_client_errors() from public, anon, authenticated;

-- Every day at 03:20 (skipped with a notice when pg_cron is not installed; the admin can still press Clear).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('noob-purge-client-errors');
    exception when others then null;   -- not scheduled yet
    end;
    perform cron.schedule('noob-purge-client-errors', '20 3 * * *', $job$ select public.purge_client_errors(); $job$);
  else
    raise notice 'pg_cron is not installed: old error reports are only removed when the admin presses Clear.';
  end if;
exception when others then
  raise notice 'The error-report purge job was not scheduled: %', sqlerrm;
end $$;
