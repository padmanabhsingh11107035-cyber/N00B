-- NOOB admin panel, three new pages and one new box:
--   1. USER LOGS: who joined and when, who deleted their account and when, and whether the person did it themselves or the admin / team did (and who).
--   2. ACCOUNTS: every NOOB Points transaction of every user in one list, and a weekly automatic audit that checks the books (each balance against its ledger, each ledger line
--      against the one before it, every payment between two people against both its halves, no negative balances) and writes a report. A mistake found can be settled with one tap.
--      The same list for ONE user is shown inside that user's details in the admin panel.
--   3. VISITORS: everybody who opened the app or the website, even without an account: device, browser, where from, how often, and who they are if they logged in.
-- Safe to run more than once. Everything here is read by the main administrator through functions only (the tables themselves are closed).

-- ---------------------------------------------------------------------------------------------------------------- ledger order
-- A transaction has no running number, and several lines of one action share the same time, so "the line before this one" was a guess. A running number settles it.
alter table public.noob_transactions add column if not exists seq bigint generated always as identity;
create index if not exists noob_transactions_user_seq_idx on public.noob_transactions (user_id, seq);

-- ---------------------------------------------------------------------------------------------------------------- 1. user logs
create or replace function public.admin_user_logs(p_limit integer default 100, p_offset integer default 0, p_search text default null, p_kind text default 'all') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_q text := nullif(btrim(coalesce(p_search, '')), ''); v_lim integer := least(greatest(coalesce(p_limit, 100), 1), 500); v_off integer := greatest(coalesce(p_offset, 0), 0);
        v_kind text := case when p_kind in ('joined', 'deleted', 'unfinished') then p_kind else 'all' end; v_events jsonb; v_total bigint; v_summary jsonb;
begin
  perform public.require_master_admin();
  with ev as (
    select 'joined'::text as kind, p.created_at as at, p.id as user_id, p.username, p.display_name, p.avatar, pp.email as email, pp.signup_platform as detail,
           null::text as how, null::text as by_name, p.created_at as joined_at
      from public.profiles p left join public.profile_private pp on pp.user_id = p.id
    union all
    select 'deleted', d.deleted_at, d.user_id, d.username, d.display_name, null, d.email_hint, null, d.how, d.deleted_by_username, d.signed_up_at
      from public.account_deletions d
    union all
    select 'unfinished', u.created_at, u.id, null, coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'), null, u.email,
           coalesce(u.raw_app_meta_data->>'provider', ''), null, null, u.created_at
      from auth.users u where not exists (select 1 from public.profiles pr where pr.id = u.id)
  ), f as (
    select * from ev e where (v_kind = 'all' or e.kind = v_kind) and (v_q is null or concat_ws(' ', e.username, e.display_name, e.email) ilike '%' || v_q || '%')
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'at', x.at, 'userId', x.user_id, 'username', x.username, 'displayName', x.display_name, 'avatar', x.avatar,
        'email', x.email, 'detail', x.detail, 'how', x.how, 'by', x.by_name, 'joinedAt', x.joined_at) order by x.at desc), '[]'::jsonb)
       from (select * from f order by f.at desc limit v_lim offset v_off) x),
    (select count(*) from f),
    jsonb_build_object(
      'joined', (select count(*) from ev where ev.kind = 'joined'),
      'joinedLast7Days', (select count(*) from ev where ev.kind = 'joined' and ev.at > now() - interval '7 days'),
      'deleted', (select count(*) from ev where ev.kind = 'deleted'),
      'deletedBySelf', (select count(*) from ev where ev.kind = 'deleted' and ev.how = 'self'),
      'deletedByAdmin', (select count(*) from ev where ev.kind = 'deleted' and ev.how = 'admin'),
      'deletedBySystem', (select count(*) from ev where ev.kind = 'deleted' and ev.how = 'system'),
      'unfinished', (select count(*) from ev where ev.kind = 'unfinished'))
  into v_events, v_total, v_summary;
  return jsonb_build_object('events', v_events, 'total', v_total, 'summary', v_summary);
end;
$$;
revoke execute on function public.admin_user_logs(integer, integer, text, text) from public, anon;
grant execute on function public.admin_user_logs(integer, integer, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------- 2. accounts: the ledger
create or replace function public.admin_accounts_ledger(
  p_limit integer default 100, p_offset integer default 0, p_search text default null, p_direction text default 'all', p_from timestamptz default null, p_to timestamptz default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_q text := nullif(btrim(coalesce(p_search, '')), ''); v_lim integer := least(greatest(coalesce(p_limit, 100), 1), 500); v_off integer := greatest(coalesce(p_offset, 0), 0);
        v_dir text := case when p_direction in ('in', 'out') then p_direction else 'all' end; v_rows jsonb; v_totals jsonb;
begin
  perform public.require_master_admin();
  with f as (
    select t.* from public.noob_transactions t
     where (v_dir = 'all' or (v_dir = 'in' and t.amount > 0) or (v_dir = 'out' and t.amount < 0))
       and (p_from is null or t.created_at >= p_from) and (p_to is null or t.created_at < p_to)
       and (v_q is null or t.reason ilike '%' || v_q || '%' or exists (select 1 from public.profiles pp where pp.id = t.user_id and (pp.username ilike '%' || v_q || '%' or pp.display_name ilike '%' || v_q || '%')))
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'at', t.created_at, 'userId', t.user_id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar,
        'amount', t.amount, 'reason', t.reason, 'balanceAfter', t.balance_after, 'transferId', t.transfer_id) order by t.seq desc), '[]'::jsonb)
       from (select * from f order by f.seq desc limit v_lim offset v_off) t left join public.profiles p on p.id = t.user_id),
    jsonb_build_object(
      'count', (select count(*) from f),
      'credited', (select coalesce(sum(amount) filter (where amount > 0), 0) from f),
      'debited', (select coalesce(-sum(amount) filter (where amount < 0), 0) from f),
      'circulation', (select coalesce(sum(noob_points), 0) from public.profiles),
      'users', (select count(*) from public.profiles))
  into v_rows, v_totals;
  return jsonb_build_object('rows', v_rows, 'totals', v_totals);
end;
$$;
revoke execute on function public.admin_accounts_ledger(integer, integer, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_accounts_ledger(integer, integer, text, text, timestamptz, timestamptz) to authenticated;

-- one user's transactions, for the box inside that user's details (anyone who may open the accounts list)
create or replace function public.admin_user_transactions(p_user uuid, p_limit integer default 200) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare lim integer := least(greatest(coalesce(p_limit, 200), 1), 1000);
begin
  if not (public.has_permission('view_accounts') or public.has_permission('suspend_accounts') or public.has_permission('delete_accounts')
          or public.has_permission('adjust_points') or public.has_permission('handle_reports')) then
    raise exception 'Access denied. Administrator privileges required.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'balance', (select noob_points from public.profiles where id = p_user),
    'count', (select count(*) from public.noob_transactions where user_id = p_user),
    'credited', (select coalesce(sum(amount) filter (where amount > 0), 0) from public.noob_transactions where user_id = p_user),
    'debited', (select coalesce(-sum(amount) filter (where amount < 0), 0) from public.noob_transactions where user_id = p_user),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'at', t.created_at, 'amount', t.amount, 'reason', t.reason, 'balanceAfter', t.balance_after, 'transferId', t.transfer_id) order by t.seq desc)
                        from (select * from public.noob_transactions where user_id = p_user order by seq desc limit lim) t), '[]'::jsonb));
end;
$$;
revoke execute on function public.admin_user_transactions(uuid, integer) from public, anon;
grant execute on function public.admin_user_transactions(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------- 2b. the weekly audit
create table if not exists public.accounting_audits (
  id                    uuid primary key default gen_random_uuid(),
  run_at                timestamptz not null default now(),
  kind                  text not null check (kind in ('weekly', 'manual')),
  run_by                uuid,
  users_checked         integer not null default 0,
  transactions_checked  bigint not null default 0,
  total_points          numeric not null default 0,
  errors_count          integer not null default 0,
  notes_count           integer not null default 0,
  status                text not null default 'clean' check (status in ('clean', 'issues'))
);
create index if not exists accounting_audits_run_idx on public.accounting_audits (run_at desc);
create table if not exists public.accounting_issues (
  id          uuid primary key default gen_random_uuid(),
  audit_id    uuid not null references public.accounting_audits (id) on delete cascade,
  user_id     uuid,
  username    text,
  kind        text not null,
  severity    text not null check (severity in ('error', 'info')),
  detail      jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution  text
);
create index if not exists accounting_issues_audit_idx on public.accounting_issues (audit_id);
alter table public.accounting_audits enable row level security;
alter table public.accounting_issues enable row level security;
revoke all on public.accounting_audits, public.accounting_issues from anon, authenticated;
grant all on public.accounting_audits, public.accounting_issues to service_role;

-- Where a person's ledger was last put right (a line "Accounting correction ..."): lines before it are history that was settled, lines after it are checked.
create or replace function public._accounting_baseline(p_user uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(max(seq), 0) from public.noob_transactions where user_id = p_user and reason like 'Accounting correction%';
$$;
revoke execute on function public._accounting_baseline(uuid) from public, anon, authenticated;

create or replace function public.run_accounting_audit(p_kind text default 'manual') returns uuid
language plpgsql security definer set search_path = public as $$
declare aid uuid := gen_random_uuid(); me uuid := auth.uid(); errs integer; notes integer;
begin
  if me is not null then perform public.require_master_admin(); end if;
  insert into public.accounting_audits (id, kind, run_by) values (aid, case when p_kind = 'weekly' then 'weekly' else 'manual' end, me);

  -- 1. every balance equals the last line of its ledger
  insert into public.accounting_issues (audit_id, user_id, username, kind, severity, detail)
    select aid, p.id, p.username, 'balance_mismatch', 'error',
           jsonb_build_object('balance', p.noob_points, 'ledgerBalance', l.balance_after, 'difference', p.noob_points - l.balance_after, 'lastEntryAt', l.created_at)
      from public.profiles p
      join lateral (select t.balance_after, t.created_at from public.noob_transactions t where t.user_id = p.id and t.balance_after is not null order by t.seq desc limit 1) l on true
     where p.noob_points is distinct from l.balance_after;

  -- 2. every ledger line follows from the one before it (balance before + amount = balance after)
  insert into public.accounting_issues (audit_id, user_id, username, kind, severity, detail)
    select aid, c.user_id, p.username, 'chain_break', 'error',
           jsonb_build_object('breaks', count(*), 'firstAt', min(c.created_at), 'lastAt', max(c.created_at), 'totalGap', sum(c.balance_after - (c.prev_bal + c.amount)),
                              'example', (array_agg(jsonb_build_object('at', c.created_at, 'reason', c.reason, 'amount', c.amount, 'expected', c.prev_bal + c.amount, 'recorded', c.balance_after) order by c.seq desc))[1])
      from (select t.*, lag(t.balance_after) over (partition by t.user_id order by t.seq) as prev_bal
              from public.noob_transactions t where t.balance_after is not null) c
      left join public.profiles p on p.id = c.user_id
     where c.prev_bal is not null and c.prev_bal + c.amount <> c.balance_after and c.seq > public._accounting_baseline(c.user_id)
     group by c.user_id, p.username;

  -- 3. nobody is below zero
  insert into public.accounting_issues (audit_id, user_id, username, kind, severity, detail)
    select aid, p.id, p.username, 'negative_balance', 'error', jsonb_build_object('balance', p.noob_points) from public.profiles p where p.noob_points < 0;

  -- 4. a payment between two people has two halves that cancel out
  insert into public.accounting_issues (audit_id, user_id, username, kind, severity, detail)
    select aid, null, null, 'transfer_mismatch', 'error', jsonb_build_object('transferId', t.transfer_id, 'lines', count(*), 'net', sum(t.amount), 'at', min(t.created_at))
      from public.noob_transactions t where t.transfer_id is not null
     group by t.transfer_id having count(*) <> 2 or sum(t.amount) <> 0;

  -- 5. (a note, not a mistake) points that were never written in a ledger, e.g. from before the ledger existed
  insert into public.accounting_issues (audit_id, user_id, username, kind, severity, detail)
    select aid, p.id, p.username, 'no_ledger', 'info', jsonb_build_object('balance', p.noob_points)
      from public.profiles p where p.noob_points <> 0 and not exists (select 1 from public.noob_transactions t where t.user_id = p.id);

  select count(*) filter (where severity = 'error'), count(*) filter (where severity = 'info') into errs, notes from public.accounting_issues where audit_id = aid;
  update public.accounting_audits a set
      users_checked = (select count(*) from public.profiles), transactions_checked = (select count(*) from public.noob_transactions),
      total_points = (select coalesce(sum(noob_points), 0) from public.profiles), errors_count = errs, notes_count = notes, status = case when errs > 0 then 'issues' else 'clean' end
    where a.id = aid;
  -- only the last year of reports is kept
  delete from public.accounting_audits where run_at < now() - interval '1 year';
  return aid;
end;
$$;
revoke execute on function public.run_accounting_audit(text) from public, anon;
grant execute on function public.run_accounting_audit(text) to authenticated;

create or replace function public.admin_accounting_overview(p_audit uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a public.accounting_audits;
begin
  perform public.require_master_admin();
  select * into a from public.accounting_audits where id = coalesce(p_audit, (select id from public.accounting_audits order by run_at desc limit 1));
  return jsonb_build_object(
    'circulation', (select coalesce(sum(noob_points), 0) from public.profiles),
    'users', (select count(*) from public.profiles),
    'transactions', (select count(*) from public.noob_transactions),
    'audit', case when a.id is null then null else jsonb_build_object('id', a.id, 'runAt', a.run_at, 'kind', a.kind, 'status', a.status, 'usersChecked', a.users_checked,
              'transactionsChecked', a.transactions_checked, 'totalPoints', a.total_points, 'errors', a.errors_count, 'notes', a.notes_count) end,
    'issues', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'userId', i.user_id, 'username', i.username, 'kind', i.kind, 'severity', i.severity, 'detail', i.detail,
                          'resolvedAt', i.resolved_at, 'resolution', i.resolution) order by (i.severity = 'error') desc, i.created_at)
                          from public.accounting_issues i where i.audit_id = a.id), '[]'::jsonb),
    'audits', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'runAt', x.run_at, 'kind', x.kind, 'status', x.status, 'errors', x.errors_count, 'notes', x.notes_count) order by x.run_at desc)
                          from (select * from public.accounting_audits order by run_at desc limit 12) x), '[]'::jsonb));
end;
$$;
revoke execute on function public.admin_accounting_overview(uuid) from public, anon;
grant execute on function public.admin_accounting_overview(uuid) to authenticated;

create or replace function public.admin_run_accounting_audit() returns jsonb
language plpgsql security definer set search_path = public as $$
declare aid uuid;
begin
  perform public.require_master_admin();
  aid := public.run_accounting_audit('manual');
  return public.admin_accounting_overview(aid);
end;
$$;
revoke execute on function public.admin_run_accounting_audit() from public, anon;
grant execute on function public.admin_run_accounting_audit() to authenticated;

-- Settling a mistake: a clearly marked line is added to that person's ledger so the books agree with the balance again. The balance itself is NOT changed.
create or replace function public.admin_fix_accounting_issue(p_issue uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid; i public.accounting_issues; bal bigint; last_bal bigint; gap bigint; why text; note text := left(btrim(coalesce(p_note, '')), 200);
begin
  me := public.require_master_admin();
  select * into i from public.accounting_issues where id = p_issue;
  if not found then raise exception 'That item was not found.'; end if;
  if i.resolved_at is not null then return jsonb_build_object('success', true, 'already', true); end if;
  if i.kind in ('balance_mismatch', 'chain_break', 'no_ledger') and i.user_id is not null then
    select noob_points into bal from public.profiles where id = i.user_id for update;
    if not found then raise exception 'That account no longer exists.'; end if;
    select balance_after into last_bal from public.noob_transactions where user_id = i.user_id and balance_after is not null order by seq desc limit 1;
    gap := bal - coalesce(last_bal, 0);
    why := 'Accounting correction (' || to_char(now() at time zone 'utc', 'YYYY-MM-DD') || '): the ledger did not agree with the balance' || case when note <> '' then ' - ' || note else '' end;
    insert into public.noob_transactions (user_id, amount, reason, balance_after) values (i.user_id, gap, why, bal);
  elsif i.kind = 'negative_balance' and i.user_id is not null then
    raise exception 'A negative balance needs a decision: use Adjust points on that account.';
  end if;
  update public.accounting_issues set resolved_at = now(), resolved_by = me, resolution = coalesce(nullif(note, ''), 'Settled') where id = p_issue;
  perform public.log_admin_action('accounting_fix', i.user_id, jsonb_build_object('kind', i.kind, 'note', note));
  return jsonb_build_object('success', true);
end;
$$;
revoke execute on function public.admin_fix_accounting_issue(uuid, text) from public, anon;
grant execute on function public.admin_fix_accounting_issue(uuid, text) to authenticated;

-- every Sunday at 03:00 (UTC), where the database has the scheduler
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('noob-weekly-audit', '0 3 * * 0', $job$ select public.run_accounting_audit('weekly'); $job$);
  end if;
exception when others then
  raise notice 'The weekly audit was not scheduled: %', sqlerrm;
end
$$;

-- ---------------------------------------------------------------------------------------------------------------- 3. visitors
create table if not exists public.site_visits (
  id             uuid primary key default gen_random_uuid(),
  visitor_id     text not null unique,
  first_seen     timestamptz not null default now(),
  last_seen      timestamptz not null default now(),
  visits         integer not null default 1,
  user_id        uuid,
  user_agent     text,
  browser        text,
  os             text,
  device         text,
  platform       text,
  language       text,
  timezone       text,
  screen         text,
  referrer       text,
  landing_path   text,
  last_path      text,
  country        text,
  region         text,
  city           text,
  ip             text,
  is_bot         boolean not null default false
);
create index if not exists site_visits_last_seen_idx on public.site_visits (last_seen desc);
create index if not exists site_visits_user_idx on public.site_visits (user_id) where user_id is not null;
alter table public.site_visits enable row level security;
revoke all on public.site_visits from anon, authenticated;
grant all on public.site_visits to service_role;

-- Called by the app / website every time it is opened, with or without an account. A new "visit" is counted when the same device comes back after 30 minutes.
create or replace function public.record_visit(p_visitor text, p_info jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_h jsonb; v_ip text; v_ua text; v_bot boolean; v_id text := btrim(coalesce(p_visitor, ''));
        v_info jsonb := case when jsonb_typeof(p_info) = 'object' then p_info else '{}'::jsonb end;
begin
  if v_id !~ '^[A-Za-z0-9-]{8,64}$' then return; end if;
  begin v_h := nullif(current_setting('request.headers', true), '')::jsonb; exception when others then v_h := null; end;
  v_ip := nullif(btrim(split_part(coalesce(v_h->>'cf-connecting-ip', v_h->>'x-forwarded-for', ''), ',', 1)), '');
  v_ua := left(coalesce(nullif(v_info->>'userAgent', ''), v_h->>'user-agent', ''), 400);
  v_bot := v_ua ~* '(bot|crawl|spider|slurp|headless|lighthouse|facebookexternalhit|preview|monitor|curl/|python-requests)';
  insert into public.site_visits as sv (visitor_id, user_id, user_agent, browser, os, device, platform, language, timezone, screen, referrer, landing_path, last_path, country, region, city, ip, is_bot)
  values (v_id, v_me, v_ua, left(v_info->>'browser', 60), left(v_info->>'os', 60), left(v_info->>'device', 40),
          case when v_info->>'platform' in ('app', 'pwa', 'web') then v_info->>'platform' else 'web' end,
          left(v_info->>'language', 20), left(v_info->>'timezone', 60), left(v_info->>'screen', 20), left(v_info->>'referrer', 300), left(v_info->>'path', 300), left(v_info->>'path', 300),
          left(coalesce(v_h->>'cf-ipcountry', ''), 8), left(coalesce(v_h->>'cf-region', v_h->>'cf-ipregion', ''), 80), left(coalesce(v_h->>'cf-ipcity', ''), 80), left(v_ip, 64), v_bot)
  on conflict (visitor_id) do update set
    visits = sv.visits + case when sv.last_seen < now() - interval '30 minutes' then 1 else 0 end,
    last_seen = now(),
    user_id = coalesce(excluded.user_id, sv.user_id),
    last_path = coalesce(nullif(excluded.last_path, ''), sv.last_path),
    platform = excluded.platform, language = coalesce(nullif(excluded.language, ''), sv.language),
    country = coalesce(nullif(excluded.country, ''), sv.country), region = coalesce(nullif(excluded.region, ''), sv.region),
    city = coalesce(nullif(excluded.city, ''), sv.city), ip = coalesce(excluded.ip, sv.ip),
    browser = coalesce(nullif(excluded.browser, ''), sv.browser), os = coalesce(nullif(excluded.os, ''), sv.os),
    device = coalesce(nullif(excluded.device, ''), sv.device), screen = coalesce(nullif(excluded.screen, ''), sv.screen);
exception when others then
  null;   -- counting a visit must never get in the way of opening the app
end;
$$;
revoke execute on function public.record_visit(text, jsonb) from public;
grant execute on function public.record_visit(text, jsonb) to anon, authenticated;

create or replace function public.admin_site_visits(p_limit integer default 100, p_offset integer default 0, p_search text default null, p_who text default 'people') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_q text := nullif(btrim(coalesce(p_search, '')), ''); v_lim integer := least(greatest(coalesce(p_limit, 100), 1), 500); v_off integer := greatest(coalesce(p_offset, 0), 0);
        v_who text := case when p_who in ('all', 'guests', 'members', 'bots') then p_who else 'people' end; v_rows jsonb; v_total bigint;
begin
  perform public.require_master_admin();
  with f as (
    select v.* from public.site_visits v left join public.profiles p on p.id = v.user_id
     where (v_who = 'all' or (v_who = 'people' and not v.is_bot) or (v_who = 'guests' and not v.is_bot and v.user_id is null) or (v_who = 'members' and v.user_id is not null) or (v_who = 'bots' and v.is_bot))
       and (v_q is null or concat_ws(' ', p.username, p.display_name, v.browser, v.os, v.device, v.country, v.city, v.ip, v.referrer, v.landing_path) ilike '%' || v_q || '%')
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object(
        'visitorId', x.visitor_id, 'firstSeen', x.first_seen, 'lastSeen', x.last_seen, 'visits', x.visits, 'userId', x.user_id, 'username', p.username, 'displayName', p.display_name,
        'avatar', p.avatar, 'email', pp.email, 'browser', x.browser, 'os', x.os, 'device', x.device, 'platform', x.platform, 'language', x.language, 'timezone', x.timezone,
        'screen', x.screen, 'referrer', x.referrer, 'landingPath', x.landing_path, 'lastPath', x.last_path, 'country', x.country, 'region', x.region, 'city', x.city, 'ip', x.ip,
        'isBot', x.is_bot) order by x.last_seen desc), '[]'::jsonb)
       from (select * from f order by f.last_seen desc limit v_lim offset v_off) x
       left join public.profiles p on p.id = x.user_id left join public.profile_private pp on pp.user_id = x.user_id),
    (select count(*) from f)
  into v_rows, v_total;
  return jsonb_build_object('rows', v_rows, 'total', v_total, 'summary', jsonb_build_object(
      'devices', (select count(*) from public.site_visits where not is_bot),
      'today', (select count(*) from public.site_visits where not is_bot and last_seen > now() - interval '24 hours'),
      'members', (select count(*) from public.site_visits where not is_bot and user_id is not null),
      'guests', (select count(*) from public.site_visits where not is_bot and user_id is null),
      'bots', (select count(*) from public.site_visits where is_bot),
      'visits', (select coalesce(sum(visits), 0) from public.site_visits where not is_bot),
      'countries', coalesce((select jsonb_agg(jsonb_build_object('country', c.country, 'devices', c.n) order by c.n desc)
                               from (select country, count(*) n from public.site_visits where not is_bot and coalesce(country, '') <> '' group by country order by n desc limit 8) c), '[]'::jsonb)));
end;
$$;
revoke execute on function public.admin_site_visits(integer, integer, text, text) from public, anon;
grant execute on function public.admin_site_visits(integer, integer, text, text) to authenticated;
