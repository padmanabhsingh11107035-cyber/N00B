-- Accurate places in the admin panel. The place of a visit used to come only from the internet address, which on mobile data is often the carrier's gateway (a person in Ajmer showed as Vadodara).
-- When the person allowed location on their phone, the app now sends the device's own position (rounded to about 1 km) and the nearest listed city; this function stores those in place of the
-- address-based city / region / country. Visits without that permission behave exactly as before. record_visit below is the previous definition (20261114000014) plus that change.
-- It also keeps the area / road the device gave (new column site_visits.address) and shows country, state, city and that area in the Visitors page and the User's data map.
-- Safe to run twice.

alter table public.site_visits add column if not exists address text;


create or replace function public.record_visit(p_visitor text, p_info jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_h jsonb; v_ip text; v_ua text; v_bot boolean; v_id text := btrim(coalesce(p_visitor, ''));
        v_info jsonb := case when jsonb_typeof(p_info) = 'object' then p_info else '{}'::jsonb end;
        v_lat numeric; v_lng numeric; v_gps boolean := false;
        v_country text; v_region text; v_city text; v_address text := '';
begin
  if v_id !~ '^[A-Za-z0-9-]{8,64}$' then return; end if;
  begin v_h := nullif(current_setting('request.headers', true), '')::jsonb; exception when others then v_h := null; end;
  v_ip := nullif(btrim(split_part(coalesce(v_h->>'cf-connecting-ip', v_h->>'x-forwarded-for', ''), ',', 1)), '');
  if v_ip is not null and not exists (select 1 from public.site_visits where visitor_id = v_id) then
    if public._rate_limit_hit('visit:' || md5(v_ip), date_trunc('hour', now())) > 30 then return; end if;
  end if;
  v_ua := left(coalesce(nullif(v_info->>'userAgent', ''), v_h->>'user-agent', ''), 400);
  v_bot := v_ua ~* '(bot|crawl|spider|slurp|headless|lighthouse|facebookexternalhit|preview|monitor|curl/|python-requests)';
  begin
    if jsonb_typeof(v_info->'lat') = 'number' and jsonb_typeof(v_info->'lng') = 'number' then
      v_lat := (v_info->>'lat')::numeric; v_lng := (v_info->>'lng')::numeric;
      if v_lat < -90 or v_lat > 90 or v_lng < -180 or v_lng > 180 then v_lat := null; v_lng := null; end if;
    end if;
  exception when others then v_lat := null; v_lng := null; end;
  v_country := left(coalesce(v_h->>'cf-ipcountry', ''), 8);
  v_region := left(coalesce(v_h->>'cf-region', v_h->>'cf-ipregion', ''), 80);
  v_city := left(coalesce(v_h->>'cf-ipcity', ''), 80);
  -- the device's own position: the app says so (gps) and gives the nearest city; it replaces the address-based place (which can be a different city)
  if v_lat is not null and v_info->>'gps' = 'true' and coalesce(v_info->>'gpsCity', '') <> '' then
    v_gps := true;
    v_city := left(regexp_replace(v_info->>'gpsCity', '[<>]', '', 'g'), 80);
    v_country := left(upper(regexp_replace(coalesce(v_info->>'gpsCountry', ''), '[^A-Za-z]', '', 'g')), 8);
    v_region := left(regexp_replace(coalesce(v_info->>'gpsRegion', ''), '[<>]', '', 'g'), 80);
    v_address := left(regexp_replace(coalesce(v_info->>'gpsAddress', ''), '[<>]', '', 'g'), 120);
  end if;
  insert into public.site_visits as sv (visitor_id, user_id, user_agent, browser, os, device, platform, language, timezone, screen, referrer, landing_path, last_path, country, region, city, address, ip, is_bot, lat, lng)
  values (v_id, v_me, v_ua, left(v_info->>'browser', 60), left(v_info->>'os', 60), left(v_info->>'device', 40),
          case when v_info->>'platform' in ('app', 'pwa', 'web') then v_info->>'platform' else 'web' end,
          left(v_info->>'language', 20), left(v_info->>'timezone', 60), left(v_info->>'screen', 20), left(v_info->>'referrer', 300), left(v_info->>'path', 300), left(v_info->>'path', 300),
          v_country, v_region, v_city, nullif(v_address, ''), left(v_ip, 64), v_bot, v_lat, v_lng)
  on conflict (visitor_id) do update set
    visits = sv.visits + case when sv.last_seen < now() - interval '30 minutes' then 1 else 0 end,
    last_seen = now(),
    user_id = coalesce(excluded.user_id, sv.user_id),
    last_path = coalesce(nullif(excluded.last_path, ''), sv.last_path),
    platform = excluded.platform, language = coalesce(nullif(excluded.language, ''), sv.language),
    country = case when v_gps then excluded.country else coalesce(nullif(excluded.country, ''), sv.country) end,
    region = case when v_gps then excluded.region else coalesce(nullif(excluded.region, ''), sv.region) end,
    city = case when v_gps then excluded.city else coalesce(nullif(excluded.city, ''), sv.city) end,
    address = case when v_gps then excluded.address else sv.address end,
    ip = coalesce(excluded.ip, sv.ip),
    browser = coalesce(nullif(excluded.browser, ''), sv.browser), os = coalesce(nullif(excluded.os, ''), sv.os),
    device = coalesce(nullif(excluded.device, ''), sv.device), screen = coalesce(nullif(excluded.screen, ''), sv.screen),
    lat = coalesce(excluded.lat, sv.lat), lng = coalesce(excluded.lng, sv.lng);
  begin
    if random() < 0.01 then
      update public.site_visits set ip = null, lat = null, lng = null
       where id in (select id from public.site_visits where last_seen < now() - interval '90 days' and (ip is not null or lat is not null or lng is not null) order by last_seen limit 500);
      delete from public.site_visits
       where id in (select id from public.site_visits where user_id is null and is_bot and last_seen < now() - interval '30 days' order by last_seen limit 500);
      delete from public.api_rate_limits where ctid in (select ctid from public.api_rate_limits where window_start < now() - interval '3 days' limit 500);
      perform public.purge_old_read_notifications();
    end if;
  exception when others then null;
  end;
exception when others then
  null;   -- counting a visit must never get in the way of opening the app
end;
$$;
revoke execute on function public.record_visit(text, jsonb) from public;
grant execute on function public.record_visit(text, jsonb) to anon, authenticated;

-- Visitors page: each row also carries the area
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
        'screen', x.screen, 'referrer', x.referrer, 'landingPath', x.landing_path, 'lastPath', x.last_path, 'country', x.country, 'region', x.region, 'city', x.city, 'address', x.address, 'ip', x.ip,
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

-- User's data map and list: the same
create or replace function public.admin_user_locations(p_limit integer default 2000) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_lim integer := least(greatest(coalesce(p_limit, 2000), 1), 5000);
  v_rows jsonb;
  v_total bigint;
begin
  perform public.require_master_admin();
  select count(*) into v_total from public.profiles;
  select coalesce(jsonb_agg(x.j order by x.sort_at desc nulls last, x.made_at desc), '[]'::jsonb) into v_rows from (
    select
      l.last_seen as sort_at, p.created_at as made_at,
      jsonb_build_object(
        'id', p.id, 'username', p.username, 'displayName', p.display_name, 'createdAt', p.created_at,
        'signup', case
          when nullif(btrim(p.city), '') is not null then jsonb_build_object('city', left(btrim(p.city), 80), 'region', null, 'country', d.cc, 'source', 'profile',
               'lat', null, 'lng', null, 'ip', f2.ip, 'platform', f2.platform, 'device', f2.device)
          when f.user_id is not null and coalesce(f.country, f.city, f.region, '') <> '' then jsonb_build_object('city', nullif(f.city, ''), 'region', nullif(f.region, ''), 'country', nullif(f.country, ''), 'source', 'visit',
               'address', f.address, 'lat', f.lat, 'lng', f.lng, 'ip', f.ip, 'platform', f.platform, 'device', f.device)
          when d.cc is not null then jsonb_build_object('city', null, 'region', null, 'country', d.cc, 'source', 'dialcode',
               'lat', null, 'lng', null, 'ip', f2.ip, 'platform', f2.platform, 'device', f2.device)
          else null end,
        'last', case
          when l.user_id is not null and coalesce(l.country, l.city, l.region, '') <> '' then jsonb_build_object('city', nullif(l.city, ''), 'region', nullif(l.region, ''), 'country', nullif(l.country, ''), 'at', l.last_seen,
               'address', l.address, 'lat', l.lat, 'lng', l.lng, 'ip', l.ip, 'platform', l.platform, 'device', l.device)
          else null end
      ) as j
    from public.profiles p
    left join lateral (select upper(substring(pp.country_code from '\(([A-Za-z]{2})\)')) as cc from public.profile_private pp where pp.user_id = p.id limit 1) d on true
    left join lateral (select v.user_id, v.country, v.region, v.city, v.address, v.last_seen, v.lat, v.lng, v.ip, v.platform, v.device from public.site_visits v
                        where v.user_id = p.id and not v.is_bot and coalesce(v.country, v.city, v.region, '') <> '' order by v.first_seen asc limit 1) f on true
    left join lateral (select v.ip, v.platform, v.device from public.site_visits v
                        where v.user_id = p.id and not v.is_bot order by v.first_seen asc limit 1) f2 on true
    left join lateral (select v.user_id, v.country, v.region, v.city, v.address, v.last_seen, v.lat, v.lng, v.ip, v.platform, v.device from public.site_visits v
                        where v.user_id = p.id and not v.is_bot order by v.last_seen desc limit 1) l on true
    order by l.last_seen desc nulls last, p.created_at desc
    limit v_lim
  ) x;
  return jsonb_build_object('rows', v_rows, 'total', v_total, 'generatedAt', now());
end;
$$;
revoke execute on function public.admin_user_locations(integer) from public, anon;
grant execute on function public.admin_user_locations(integer) to authenticated;
