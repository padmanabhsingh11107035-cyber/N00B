-- Admin panel -> User's data: where each user created their account and where they last used the app, as an APPROXIMATE place (city / region / country). Nothing new is collected:
-- it only reads what is already stored (site_visits, filled from the connection's place by record_visit; the city typed on the profile; the country of the phone code picked at sign-up).
-- The answer never contains an IP address, a phone number, an email or any other personal detail. Only the NOOB administrator can call it (same check as every other admin_* function).
-- Safe to run twice.
--
-- Where "signup" comes from (first match wins):
--   1. the city typed on the profile, with the country of the phone code picked at sign-up      -> source 'profile'
--   2. the oldest site_visits row of that user (the first place a logged-in visit was seen)    -> source 'visit'
--   3. only the country of the phone code picked at sign-up (the default is India)             -> source 'dialcode'
-- Where "last" comes from: the newest site_visits row of that user.  (login_history stores no place, so it cannot be used.)

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
          when nullif(btrim(p.city), '') is not null then jsonb_build_object('city', left(btrim(p.city), 80), 'region', null, 'country', d.cc, 'source', 'profile')
          when f.user_id is not null and coalesce(f.country, f.city, f.region, '') <> '' then jsonb_build_object('city', nullif(f.city, ''), 'region', nullif(f.region, ''), 'country', nullif(f.country, ''), 'source', 'visit')
          when d.cc is not null then jsonb_build_object('city', null, 'region', null, 'country', d.cc, 'source', 'dialcode')
          else null end,
        'last', case
          when l.user_id is not null and coalesce(l.country, l.city, l.region, '') <> '' then jsonb_build_object('city', nullif(l.city, ''), 'region', nullif(l.region, ''), 'country', nullif(l.country, ''), 'at', l.last_seen)
          else null end
      ) as j
    from public.profiles p
    left join lateral (select upper(substring(pp.country_code from '\(([A-Za-z]{2})\)')) as cc from public.profile_private pp where pp.user_id = p.id limit 1) d on true
    left join lateral (select v.user_id, v.country, v.region, v.city, v.last_seen from public.site_visits v
                        where v.user_id = p.id and not v.is_bot and coalesce(v.country, v.city, v.region, '') <> '' order by v.first_seen asc limit 1) f on true
    left join lateral (select v.user_id, v.country, v.region, v.city, v.last_seen from public.site_visits v
                        where v.user_id = p.id and not v.is_bot order by v.last_seen desc limit 1) l on true
    order by l.last_seen desc nulls last, p.created_at desc
    limit v_lim
  ) x;
  return jsonb_build_object('rows', v_rows, 'total', v_total, 'generatedAt', now());
end;
$$;
revoke execute on function public.admin_user_locations(integer) from public, anon;
grant execute on function public.admin_user_locations(integer) to authenticated;
