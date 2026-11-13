-- Visits also keep the APPROXIMATE position of the connection (latitude / longitude as Cloudflare works it out from the internet address, usually the city; it is NOT a GPS reading and the app
-- asks for no location permission). Used only by the admin page "User's data" (administrator only). A visit without coordinates keeps the old ones. Safe to run twice; additive only.
alter table public.site_visits add column if not exists lat numeric(8,5), add column if not exists lng numeric(8,5);

create or replace function public.record_visit(p_visitor text, p_info jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_h jsonb; v_ip text; v_ua text; v_bot boolean; v_id text := btrim(coalesce(p_visitor, ''));
        v_info jsonb := case when jsonb_typeof(p_info) = 'object' then p_info else '{}'::jsonb end;
        v_lat numeric; v_lng numeric;
begin
  if v_id !~ '^[A-Za-z0-9-]{8,64}$' then return; end if;
  begin v_h := nullif(current_setting('request.headers', true), '')::jsonb; exception when others then v_h := null; end;
  v_ip := nullif(btrim(split_part(coalesce(v_h->>'cf-connecting-ip', v_h->>'x-forwarded-for', ''), ',', 1)), '');
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
exception when others then
  null;   -- counting a visit must never get in the way of opening the app
end;
$$;
revoke execute on function public.record_visit(text, jsonb) from public;
grant execute on function public.record_visit(text, jsonb) to anon, authenticated;
