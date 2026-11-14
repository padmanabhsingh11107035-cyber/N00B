-- Growth preparation (docs/GROWTH-PREPARATION.md, measure 10): old READ notifications are cleaned up, a little at a time.
-- What may be deleted (and nothing else, in no other table): a notification that is
--   * older than 90 days, and
--   * addressed to one person (not a shared announcement: those rows belong to everybody), and
--   * already marked read by that same person, and
--   * not waiting for an answer (a follow request that is still pending stays) and not a scratch-card reward.
-- Messages, chats, the points ledger, orders, posts, reels, accounts are never touched. Unread notifications never go, however old. At most 500 rows per run.
-- It runs by itself: record_visit (opening the app) calls it about once in 100 visits, exactly like the other clean-ups there; a failure is ignored.
-- record_visit below is the previous definition (20261114000009) plus that one line. Safe to run twice.

create index if not exists notifications_created_idx on public.notifications (created_at);

create or replace function public.purge_old_read_notifications() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer := 0;
begin
  with doomed as (
    select x.id from public.notifications x
    where x.created_at < now() - interval '90 days'
      and x.target_user_id is not null
      and coalesce(x.action_status, 'accepted') <> 'pending'
      and not (x.data ? 'scratchCardId')
      and exists (select 1 from public.notification_reads r where r.notification_id = x.id and r.user_id = x.target_user_id)
    order by x.created_at
    limit 500
  ), gone as (
    delete from public.notifications d using doomed where d.id = doomed.id returning 1
  )
  select count(*) into n from gone;
  return n;
end;
$$;
revoke all on function public.purge_old_read_notifications() from public, anon, authenticated;

create or replace function public.record_visit(p_visitor text, p_info jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_h jsonb; v_ip text; v_ua text; v_bot boolean; v_id text := btrim(coalesce(p_visitor, ''));
        v_info jsonb := case when jsonb_typeof(p_info) = 'object' then p_info else '{}'::jsonb end;
        v_lat numeric; v_lng numeric;
begin
  if v_id !~ '^[A-Za-z0-9-]{8,64}$' then return; end if;
  begin v_h := nullif(current_setting('request.headers', true), '')::jsonb; exception when others then v_h := null; end;
  v_ip := nullif(btrim(split_part(coalesce(v_h->>'cf-connecting-ip', v_h->>'x-forwarded-for', ''), ',', 1)), '');
  -- NEW (a): a flood limit for NEW visitor rows: at most 30 per internet address per hour (the address is only hashed into the counter). Over the limit the visit is ignored quietly.
  if v_ip is not null and not exists (select 1 from public.site_visits where visitor_id = v_id) then
    if public._rate_limit_hit('visit:' || md5(v_ip), date_trunc('hour', now())) > 30 then return; end if;
  end if;
  v_ua := left(coalesce(nullif(v_info->>'userAgent', ''), v_h->>'user-agent', ''), 400);
  v_bot := v_ua ~* '(bot|crawl|spider|slurp|headless|lighthouse|facebookexternalhit|preview|monitor|curl/|python-requests)';
  -- coordinates: only real numbers inside the valid ranges, anything else is ignored
  begin
    if jsonb_typeof(v_info->'lat') = 'number' and jsonb_typeof(v_info->'lng') = 'number' then
      v_lat := (v_info->>'lat')::numeric; v_lng := (v_info->>'lng')::numeric;
      if v_lat < -90 or v_lat > 90 or v_lng < -180 or v_lng > 180 then v_lat := null; v_lng := null; end if;
    end if;
  exception when others then v_lat := null; v_lng := null; end;
  insert into public.site_visits as sv (visitor_id, user_id, user_agent, browser, os, device, platform, language, timezone, screen, referrer, landing_path, last_path, country, region, city, ip, is_bot, lat, lng)
  values (v_id, v_me, v_ua, left(v_info->>'browser', 60), left(v_info->>'os', 60), left(v_info->>'device', 40),
          case when v_info->>'platform' in ('app', 'pwa', 'web') then v_info->>'platform' else 'web' end,
          left(v_info->>'language', 20), left(v_info->>'timezone', 60), left(v_info->>'screen', 20), left(v_info->>'referrer', 300), left(v_info->>'path', 300), left(v_info->>'path', 300),
          left(coalesce(v_h->>'cf-ipcountry', ''), 8), left(coalesce(v_h->>'cf-region', v_h->>'cf-ipregion', ''), 80), left(coalesce(v_h->>'cf-ipcity', ''), 80), left(v_ip, 64), v_bot, v_lat, v_lng)
  on conflict (visitor_id) do update set
    visits = sv.visits + case when sv.last_seen < now() - interval '30 minutes' then 1 else 0 end,
    last_seen = now(),
    user_id = coalesce(excluded.user_id, sv.user_id),
    last_path = coalesce(nullif(excluded.last_path, ''), sv.last_path),
    platform = excluded.platform, language = coalesce(nullif(excluded.language, ''), sv.language),
    country = coalesce(nullif(excluded.country, ''), sv.country), region = coalesce(nullif(excluded.region, ''), sv.region),
    city = coalesce(nullif(excluded.city, ''), sv.city), ip = coalesce(excluded.ip, sv.ip),
    browser = coalesce(nullif(excluded.browser, ''), sv.browser), os = coalesce(nullif(excluded.os, ''), sv.os),
    device = coalesce(nullif(excluded.device, ''), sv.device), screen = coalesce(nullif(excluded.screen, ''), sv.screen),
    lat = coalesce(excluded.lat, sv.lat), lng = coalesce(excluded.lng, sv.lng);
  -- NEW (b): retention, done by the visits themselves (one call in 100, at most 500 rows each time, a failure here is ignored):
  --   * a visit not seen for 90 days loses its IP address and coordinates (the row, country, city, user and counts stay);
  --   * an anonymous bot row not seen for 30 days is deleted.
  begin
    if random() < 0.01 then
      update public.site_visits set ip = null, lat = null, lng = null
       where id in (select id from public.site_visits where last_seen < now() - interval '90 days' and (ip is not null or lat is not null or lng is not null) order by last_seen limit 500);
      delete from public.site_visits
       where id in (select id from public.site_visits where user_id is null and is_bot and last_seen < now() - interval '30 days' order by last_seen limit 500);
      delete from public.api_rate_limits where ctid in (select ctid from public.api_rate_limits where window_start < now() - interval '3 days' limit 500);
      perform public.purge_old_read_notifications();   -- NEW (growth preparation, measure 10): read personal notifications older than 90 days, at most 500 rows
    end if;
  exception when others then null;
  end;
exception when others then
  null;   -- counting a visit must never get in the way of opening the app
end;
$$;
revoke execute on function public.record_visit(text, jsonb) from public;
grant execute on function public.record_visit(text, jsonb) to anon, authenticated;
