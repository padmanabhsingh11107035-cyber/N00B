-- PRIVACY HARDENING (security re-test 2026-11-14, findings N11, N12, N13). Read docs/PRIVACY-HARDENING-2026-11-14.md first.
-- Run AFTER 20261114000006 (deleted accounts) and 20261114000007/8. Safe to run twice: every statement is create-or-replace / if-not-exists / a revoke-and-grant that ends in the same state.
-- Nothing is deleted or rewritten here except the old visitor coordinates/IP rows that the retention rule (part 3) clears later, a few at a time, on its own.
-- is_hidden_from_me() is NOT touched (the 000006 version, which also hides deleted accounts, stays).
--
-- PART 1 (N11)  what a logged-in person can read straight from the tables
--   1a. profiles: five more columns are closed to the API (they stay readable to the database's own functions, so every function gives the same answer as before):
--       city, privacy_settings, extra, noob_points, is_suspended.
--       Every other column stays readable exactly as today (the app reads only id, username, display_name, avatar, is_verified of the person's OWN row directly; see the list in the doc).
--   1b. my_suspension_status(): the one question the app asked the table directly (my own is_suspended), now a function.
--   1c. follows: rows of a PRIVATE account (its followers and who it follows) are visible only to the account itself, to people who follow it, and to the other person in the row.
--       Public accounts: as before. Hidden / deleted accounts: as before (is_hidden_from_me).
-- PART 2 (N12)  match_contacts: at most 500 numbers per call, 10 calls an hour and 30 a day per person, skips hidden and suspended accounts. Same answer shape.
-- PART 3 (N13)  record_visit: at most 30 NEW visitor rows per internet address per hour (beyond that the visit is ignored, never an error) and a retention rule: after 90 days the stored
--               IP address and coordinates of a visit are removed (row, country, city, counts stay), anonymous bot rows older than 30 days are deleted.

-- ====================================================================================================================================== shared: a small counter table
create table if not exists public.api_rate_limits (
  bucket        text        not null,
  window_start  timestamptz not null,
  n             integer     not null default 0,
  primary key (bucket, window_start)
);
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from public, anon, authenticated;
grant all on public.api_rate_limits to service_role;

-- adds one hit to (bucket, window) and returns how many there are now; only the database's own functions call it
create or replace function public._rate_limit_hit(p_bucket text, p_window timestamptz) returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  insert into public.api_rate_limits as r (bucket, window_start, n) values (p_bucket, p_window, 1)
    on conflict (bucket, window_start) do update set n = r.n + 1
    returning n into v_n;
  return v_n;
end;
$$;
revoke execute on function public._rate_limit_hit(text, timestamptz) from public, anon, authenticated;

-- ====================================================================================================================================== PART 1a. profiles columns
-- Same method as migration 20261022000005: table-level SELECT is removed and every column EXCEPT the closed ones is granted again, so the result is identical however often this runs.
-- (A NEW profiles column stays closed until it is granted on purpose; scripts/security-audit-db.mjs checks that.)
revoke select on public.profiles from authenticated;
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles'
     and column_name not in ('pro_billing', 'pro_auto_renew', 'pro_renews_at', 'purchased_item_ids',
                             'city', 'privacy_settings', 'extra', 'noob_points', 'is_suspended');
  execute 'grant select (' || cols || ') on public.profiles to authenticated';
end $$;

-- ====================================================================================================================================== PART 1b. my own suspension status
create or replace function public.my_suspension_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('found', true, 'suspended', coalesce(p.is_suspended, false)) from public.profiles p where p.id = auth.uid()),
    jsonb_build_object('found', false, 'suspended', false));
$$;
revoke execute on function public.my_suspension_status() from public, anon;
grant execute on function public.my_suspension_status() to authenticated;

-- ====================================================================================================================================== PART 1c. follows of private accounts
-- "may I see who follows / is followed by this account?": the account itself, anybody who follows it, or any account that is not private
create or replace function public.can_see_follow_edges_of(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_id = auth.uid()
      or not exists (select 1 from public.profiles pr where pr.id = p_id and pr.account_type = 'private')
      or exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p_id);
$$;
revoke execute on function public.can_see_follow_edges_of(uuid) from public, anon;
grant execute on function public.can_see_follow_edges_of(uuid) to authenticated;

drop policy if exists follows_select on public.follows;
create policy follows_select on public.follows for select to authenticated
  using (
    not public.is_hidden_from_me(follower_id) and not public.is_hidden_from_me(followee_id)
    and (
      follower_id = auth.uid() or followee_id = auth.uid()                                          -- the people in the row themselves
      or (public.can_see_follow_edges_of(follower_id) and public.can_see_follow_edges_of(followee_id)) -- otherwise neither side may be a private account the reader does not follow
    )
  );

-- ====================================================================================================================================== PART 2. match_contacts (N12)
-- It was `stable`; counting calls needs a normal (volatile) function. Same arguments, same JSON, same grants.
create or replace function public.match_contacts(p_numbers text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); wanted text[];
begin
  if p_numbers is null or coalesce(array_length(p_numbers, 1), 0) = 0 then return '[]'::jsonb; end if;
  -- limits per person: 10 searches an hour, 30 a day (a refused call is not counted, so waiting is enough)
  if coalesce((select n from public.api_rate_limits where bucket = 'match_contacts:' || me::text and window_start = date_trunc('hour', now())), 0) >= 10 then
    raise exception 'You have searched your contacts a lot just now. Please try again in an hour.' using errcode = 'P0001';
  end if;
  if coalesce((select n from public.api_rate_limits where bucket = 'match_contacts_day:' || me::text and window_start = date_trunc('day', now())), 0) >= 30 then
    raise exception 'You have searched your contacts many times today. Please try again tomorrow.' using errcode = 'P0001';
  end if;
  perform public._rate_limit_hit('match_contacts:' || me::text, date_trunc('hour', now()));
  perform public._rate_limit_hit('match_contacts_day:' || me::text, date_trunc('day', now()));
  -- opportunistic tidy-up of old counters (one call in 50, a bounded delete)
  if random() < 0.02 then
    delete from public.api_rate_limits where ctid in (select ctid from public.api_rate_limits where window_start < now() - interval '3 days' limit 500);
  end if;
  select coalesce(array_agg(distinct n), '{}') into wanted
  from (select right(regexp_replace(x, '\D', '', 'g'), 10) as n from unnest(p_numbers[1:500]) x) s where length(n) >= 7;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar,
             'bio', p.bio, 'isVerified', p.is_verified, 'accountType', p.account_type, 'isBusiness', p.is_business,
             'followersCount', p.followers_count, 'followingCount', p.following_count,
             'isFollowing', exists (select 1 from public.follows f where f.follower_id = me and f.followee_id = p.id))
             order by p.username)
    from public.profiles p join public.profile_private pp on pp.user_id = p.id
    where p.id <> me and length(right(regexp_replace(coalesce(pp.mobile_number, ''), '\D', '', 'g'), 10)) >= 7
      and right(regexp_replace(coalesce(pp.mobile_number, ''), '\D', '', 'g'), 10) = any(wanted)
      and not public.is_hidden_from_me(p.id) and not coalesce(p.is_suspended, false)
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.match_contacts(text[]) from public, anon;
grant execute on function public.match_contacts(text[]) to authenticated;

-- ====================================================================================================================================== PART 3. record_visit (N13)
-- Copy of the 20261114000007 version with two additions marked "NEW". Everything else is unchanged, and it still never raises.
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
    end if;
  exception when others then null;
  end;
exception when others then
  null;   -- counting a visit must never get in the way of opening the app
end;
$$;
revoke execute on function public.record_visit(text, jsonb) from public;
grant execute on function public.record_visit(text, jsonb) to anon, authenticated;
