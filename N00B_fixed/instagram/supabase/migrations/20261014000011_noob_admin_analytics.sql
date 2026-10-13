-- NOOB admin panel: platform-wide analytics. One function the main administrator calls to draw the graphs for the WHOLE app (people, posts, reels, stories,
-- messages, comments, orders, games, reports, sign-ins and who is active). It returns only COUNTS: no message text, no caption, no private content of any kind.
-- Safe to run more than once.

-- one day-by-day series from a counting query (the query is written in this file, never taken from a caller; the helper itself cannot be called from outside)
create or replace function public.admin_int_daily(p_sql text, p_since timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  execute format($f$select coalesce(jsonb_agg(jsonb_build_object('d', g.d::date, 'n', coalesce(c.n, 0)) order by g.d), '[]'::jsonb)
      from generate_series($1, date_trunc('day', now()), interval '1 day') g(d)
      left join (%s) c on c.dd = g.d$f$, p_sql) into out using p_since;
  return out;
end;
$$;

create or replace function public.admin_analytics_overview(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d integer := greatest(7, least(coalesce(p_days, 30), 90)); since timestamptz;
begin
  perform public.require_master_admin('Only the main NOOB administrator can see this.');
  since := date_trunc('day', now()) - (d - 1) * interval '1 day';
  return jsonb_build_object(
    'days', d,
    'generatedAt', now(),
    'totals', jsonb_build_object(
      'users', (select count(*) from public.profiles where not is_ai),
      'newUsers', (select count(*) from public.profiles where not is_ai and created_at >= since),
      'newToday', (select count(*) from public.profiles where not is_ai and created_at >= date_trunc('day', now())),
      'suspended', (select count(*) from public.profiles where is_suspended),
      'verified', (select count(*) from public.profiles where is_verified),
      'business', (select count(*) from public.profiles where is_business),
      'activeNow', (select count(distinct user_id) from public.device_sessions where revoked_at is null and last_seen_at >= now() - interval '15 minutes'),
      'active7', (select count(distinct user_id) from public.device_sessions where revoked_at is null and last_seen_at >= now() - interval '7 days'),
      'posts', (select count(*) from public.posts),
      'postsPeriod', (select count(*) from public.posts where created_at >= since),
      'reels', (select count(*) from public.reels),
      'reelsPeriod', (select count(*) from public.reels where created_at >= since),
      'storiesLive', (select count(*) from public.stories where expires_at > now()),
      'messagesPeriod', (select count(*) from public.messages where created_at >= since),
      'commentsPeriod', (select count(*) from public.comments where created_at >= since),
      'follows', (select count(*) from public.follows),
      'orders', (select count(*) from public.store_orders),
      'ordersPeriod', (select count(*) from public.store_orders where created_at >= since),
      'revenuePeriod', (select coalesce(sum(total), 0) from public.store_orders where created_at >= since and status not in ('cancelled', 'canceled')),
      'gamePlaysPeriod', (select count(*) from public.game_scores where created_at >= since),
      'reports', (select count(*) from public.reports),
      'reportsPeriod', (select count(*) from public.reports where created_at >= since),
      'signInsPeriod', (select count(*) from public.login_history where logged_in_at >= since)),
    'series', jsonb_build_object(
      'users', public.admin_int_daily($q$select date_trunc('day', created_at) as dd, count(*) as n from public.profiles where not is_ai and created_at >= $1 group by 1$q$, since),
      'posts', public.admin_int_daily($q$select date_trunc('day', created_at) as dd, count(*) as n from public.posts where created_at >= $1 group by 1$q$, since),
      'reels', public.admin_int_daily($q$select date_trunc('day', created_at) as dd, count(*) as n from public.reels where created_at >= $1 group by 1$q$, since),
      'stories', public.admin_int_daily($q$select date_trunc('day', created_at) as dd, count(*) as n from public.stories where created_at >= $1 group by 1$q$, since),
      'messages', public.admin_int_daily($q$select date_trunc('day', created_at) as dd, count(*) as n from public.messages where created_at >= $1 group by 1$q$, since),
      'comments', public.admin_int_daily($q$select date_trunc('day', created_at) as dd, count(*) as n from public.comments where created_at >= $1 group by 1$q$, since),
      'orders', public.admin_int_daily($q$select date_trunc('day', created_at) as dd, count(*) as n from public.store_orders where created_at >= $1 group by 1$q$, since),
      'games', public.admin_int_daily($q$select date_trunc('day', created_at) as dd, count(*) as n from public.game_scores where created_at >= $1 group by 1$q$, since),
      'reports', public.admin_int_daily($q$select date_trunc('day', created_at) as dd, count(*) as n from public.reports where created_at >= $1 group by 1$q$, since),
      'signIns', public.admin_int_daily($q$select date_trunc('day', logged_in_at) as dd, count(*) as n from public.login_history where logged_in_at >= $1 group by 1$q$, since),
      -- people who did something that day: posted, commented, sent a message or signed in
      'active', public.admin_int_daily($q$select dd, count(distinct u) as n from (
          select date_trunc('day', created_at) as dd, user_id as u from public.posts where created_at >= $1
          union all select date_trunc('day', created_at), user_id from public.comments where created_at >= $1
          union all select date_trunc('day', created_at), sender_id from public.messages where created_at >= $1
          union all select date_trunc('day', logged_in_at), user_id from public.login_history where logged_in_at >= $1) x group by dd$q$, since)),
    'breakdowns', jsonb_build_object(
      'accountTypes', (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'n', n) order by n desc), '[]'::jsonb)
        from (select coalesce(nullif(btrim(account_type), ''), 'personal') as label, count(*) as n from public.profiles where not is_ai group by 1) x),
      'ordersByStatus', (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'n', n) order by n desc), '[]'::jsonb)
        from (select coalesce(nullif(btrim(status), ''), 'unknown') as label, count(*) as n from public.store_orders group by 1) x),
      'reportsByStatus', (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'n', n) order by n desc), '[]'::jsonb)
        from (select coalesce(nullif(btrim(status), ''), 'unknown') as label, count(*) as n from public.reports group by 1) x),
      'postsByCategory', (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'n', n) order by n desc), '[]'::jsonb)
        from (select coalesce(nullif(btrim(category), ''), 'No category') as label, count(*) as n from public.posts where created_at >= since group by 1 order by 2 desc limit 8) x),
      'messageTypes', (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'n', n) order by n desc), '[]'::jsonb)
        from (select coalesce(nullif(btrim(media_type), ''), 'text') as label, count(*) as n from public.messages where created_at >= since group by 1 order by 2 desc limit 8) x),
      'topGames', (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'n', n) order by n desc), '[]'::jsonb)
        from (select coalesce(nullif(btrim(game_title), ''), 'Game') as label, count(*) as n from public.game_scores where created_at >= since group by 1 order by 2 desc limit 8) x)));
end;
$$;

-- who may call what: the helper is internal; the overview is for signed-in users but answers only the main administrator
revoke all on function public.admin_int_daily(text, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_analytics_overview(integer) from public, anon;
grant execute on function public.admin_analytics_overview(integer) to authenticated;
