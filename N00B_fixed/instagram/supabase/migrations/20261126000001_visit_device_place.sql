-- Accurate places in the admin panel. The place of a visit used to come only from the internet address, which on mobile data is often the carrier's gateway (a person in Ajmer showed as Vadodara).
-- When the person allowed location on their phone, the app now sends the device's own position (rounded to about 1 km) and the nearest listed city; this function stores those in place of the
-- address-based city / region / country. Visits without that permission behave exactly as before. record_visit below is the previous definition (20261114000014) plus that change.
-- Safe to run twice; changes no table.

create or replace function public.record_visit(p_visitor text, p_info jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_h jsonb; v_ip text; v_ua text; v_bot boolean; v_id text := btrim(coalesce(p_visitor, ''));
        v_info jsonb := case when jsonb_typeof(p_info) = 'object' then p_info else '{}'::jsonb end;
        v_lat numeric; v_lng numeric; v_gps boolean := false;
        v_country text; v_region text; v_city text;
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
    v_region := '';
  end if;
  insert into public.site_visits as sv (visitor_id, user_id, user_agent, browser, os, device, platform, language, timezone, screen, referrer, landing_path, last_path, country, region, city, ip, is_bot, lat, lng)
  values (v_id, v_me, v_ua, left(v_info->>'browser', 60), left(v_info->>'os', 60), left(v_info->>'device', 40),
          case when v_info->>'platform' in ('app', 'pwa', 'web') then v_info->>'platform' else 'web' end,
          left(v_info->>'language', 20), left(v_info->>'timezone', 60), left(v_info->>'screen', 20), left(v_info->>'referrer', 300), left(v_info->>'path', 300), left(v_info->>'path', 300),
          v_country, v_region, v_city, left(v_ip, 64), v_bot, v_lat, v_lng)
  on conflict (visitor_id) do update set
    visits = sv.visits + case when sv.last_seen < now() - interval '30 minutes' then 1 else 0 end,
    last_seen = now(),
    user_id = coalesce(excluded.user_id, sv.user_id),
    last_path = coalesce(nullif(excluded.last_path, ''), sv.last_path),
    platform = excluded.platform, language = coalesce(nullif(excluded.language, ''), sv.language),
    country = case when v_gps then excluded.country else coalesce(nullif(excluded.country, ''), sv.country) end,
    region = case when v_gps then excluded.region else coalesce(nullif(excluded.region, ''), sv.region) end,
    city = case when v_gps then excluded.city else coalesce(nullif(excluded.city, ''), sv.city) end,
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
