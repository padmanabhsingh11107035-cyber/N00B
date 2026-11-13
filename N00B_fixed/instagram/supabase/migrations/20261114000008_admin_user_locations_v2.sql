-- Admin panel -> User's data, version 2: each place also carries the approximate coordinates of the connection (lat / lng, from site_visits, see 20261114000007), the IP address of
-- that same visit, and the platform / device. The IP is returned ONLY by this function, which only the NOOB administrator can call (same check as every other admin_* function; the admin
-- Visitors page already shows IPs). No non-admin function returns it. Run 20261114000007 first. Safe to run twice; changes no table and no data.
--
-- 'signup': the typed profile city (source 'profile', no coordinates: a typed city is not a connection), else the oldest site_visits row of the user (source 'visit', with its lat / lng / ip),
--           else only the phone-code country (source 'dialcode'). For source 'profile' / 'dialcode' the ip / platform / device of the oldest visit are still given when there is one.
-- 'last':   the newest non-bot site_visits row of the user.

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
               'lat', f.lat, 'lng', f.lng, 'ip', f.ip, 'platform', f.platform, 'device', f.device)
          when d.cc is not null then jsonb_build_object('city', null, 'region', null, 'country', d.cc, 'source', 'dialcode',
               'lat', null, 'lng', null, 'ip', f2.ip, 'platform', f2.platform, 'device', f2.device)
          else null end,
        'last', case
          when l.user_id is not null and coalesce(l.country, l.city, l.region, '') <> '' then jsonb_build_object('city', nullif(l.city, ''), 'region', nullif(l.region, ''), 'country', nullif(l.country, ''), 'at', l.last_seen,
               'lat', l.lat, 'lng', l.lng, 'ip', l.ip, 'platform', l.platform, 'device', l.device)
          else null end
      ) as j
    from public.profiles p
    left join lateral (select upper(substring(pp.country_code from '\(([A-Za-z]{2})\)')) as cc from public.profile_private pp where pp.user_id = p.id limit 1) d on true
    left join lateral (select v.user_id, v.country, v.region, v.city, v.last_seen, v.lat, v.lng, v.ip, v.platform, v.device from public.site_visits v
                        where v.user_id = p.id and not v.is_bot and coalesce(v.country, v.city, v.region, '') <> '' order by v.first_seen asc limit 1) f on true
    left join lateral (select v.ip, v.platform, v.device from public.site_visits v
                        where v.user_id = p.id and not v.is_bot order by v.first_seen asc limit 1) f2 on true
    left join lateral (select v.user_id, v.country, v.region, v.city, v.last_seen, v.lat, v.lng, v.ip, v.platform, v.device from public.site_visits v
                        where v.user_id = p.id and not v.is_bot order by v.last_seen desc limit 1) l on true
    order by l.last_seen desc nulls last, p.created_at desc
    limit v_lim
  ) x;
  return jsonb_build_object('rows', v_rows, 'total', v_total, 'generatedAt', now());
end;
$$;
revoke execute on function public.admin_user_locations(integer) from public, anon;
grant execute on function public.admin_user_locations(integer) to authenticated;
