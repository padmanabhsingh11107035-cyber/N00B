-- NOOB — two more Platform switches for the main admin, and pinned accounts on Explore.
--   1. SparkX registration on/off: while off, the rocket shows "Registration closed" and no application is accepted.
--   2. "Join the NOOB team" applications on/off: while off, the join button is hidden and no application is accepted.
--   3. Explore pins: the admin pins accounts from the Admin Control Panel; pinned accounts come first in Explore's
--      people list (the newest pin on top). Nothing tells people an account is pinned; the pin list itself is
--      readable only by the admin.

-- ---------------------------------------------------------------------------------------------------------------
-- 1 + 2. Switches
-- ---------------------------------------------------------------------------------------------------------------
alter table public.platform_settings add column if not exists sparkx_open boolean not null default true;
alter table public.platform_settings add column if not exists join_team_open boolean not null default true;

create or replace function public.public_platform_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'signupsEnabled', s.signups_enabled, 'maintenanceEnabled', s.maintenance_enabled, 'maintenanceMessage', s.maintenance_message,
    'noobAiMaintenance', s.noob_ai_maintenance, 'sparkxOpen', s.sparkx_open, 'joinTeamOpen', s.join_team_open)
  from public.platform_settings s where s.id = true;
$$;
grant execute on function public.public_platform_settings() to anon, authenticated;

-- One function with every switch (each one optional: "leave as it is" when not given). The 4-argument version
-- from 20260927000002 is removed first so calls are never ambiguous.
drop function if exists public.admin_set_platform_settings(boolean, boolean, text, boolean);
create function public.admin_set_platform_settings(
  p_signups_enabled boolean default null, p_maintenance_enabled boolean default null, p_maintenance_message text default null,
  p_noob_ai_maintenance boolean default null, p_sparkx_open boolean default null, p_join_team_open boolean default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid;
begin
  if not public.is_master_admin() then raise exception 'Access denied. Administrator privileges required.' using errcode = '42501'; end if;
  me := auth.uid();
  update public.platform_settings set
    signups_enabled = coalesce(p_signups_enabled, signups_enabled),
    maintenance_enabled = coalesce(p_maintenance_enabled, maintenance_enabled),
    maintenance_message = coalesce(nullif(btrim(p_maintenance_message), ''), maintenance_message),
    noob_ai_maintenance = coalesce(p_noob_ai_maintenance, noob_ai_maintenance),
    sparkx_open = coalesce(p_sparkx_open, sparkx_open),
    join_team_open = coalesce(p_join_team_open, join_team_open),
    updated_by = me, updated_at = now()
  where id = true;
  perform public.log_admin_action('platform_settings_changed', null,
    jsonb_build_object('signupsEnabled', p_signups_enabled, 'maintenanceEnabled', p_maintenance_enabled,
                       'noobAiMaintenance', p_noob_ai_maintenance, 'sparkxOpen', p_sparkx_open, 'joinTeamOpen', p_join_team_open));
  return public.public_platform_settings();
end;
$$;
revoke execute on function public.admin_set_platform_settings(boolean, boolean, text, boolean, boolean, boolean) from public, anon;
grant execute on function public.admin_set_platform_settings(boolean, boolean, text, boolean, boolean, boolean) to authenticated;

-- The two application forms refuse new applications while their switch is off (same as 20260924000038 and
-- 20260925000042 otherwise).
create or replace function public.submit_team_application(
  p_full_name text, p_role text, p_why text, p_experience text default '', p_availability text default '', p_contact text default ''
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); app public.team_applications;
begin
  if me is null or (select is_suspended from public.profiles where id = me) is not false then raise exception 'Please log in.' using errcode = '28000'; end if;
  if not coalesce((select join_team_open from public.platform_settings where id = true), true) then
    raise exception 'Applications to join the NOOB team are closed right now.';
  end if;
  if coalesce(btrim(p_full_name), '') = '' then raise exception 'Please tell us your name.'; end if;
  if coalesce(btrim(p_role), '') = '' then raise exception 'Please tell us what role you are interested in.'; end if;
  if coalesce(btrim(p_why), '') = '' then raise exception 'Please tell us why you want to join.'; end if;
  if exists (select 1 from public.team_applications where user_id = me and status = 'pending') then
    raise exception 'You already have an application awaiting review.';
  end if;
  insert into public.team_applications (user_id, full_name, role_interested, why_join, experience, availability, contact)
  values (me, btrim(p_full_name), btrim(p_role), btrim(p_why), coalesce(btrim(p_experience), ''), coalesce(btrim(p_availability), ''), coalesce(btrim(p_contact), ''))
  returning * into app;
  return jsonb_build_object('success', true, 'application', public.team_application_json(app));
end;
$$;

create or replace function public.submit_sparkx_application(
  p_full_name text, p_grade text, p_school text, p_contribution text, p_ai_knowledge text,
  p_experience text default '', p_availability text default '', p_contact text default ''
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); app public.sparkx_applications;
begin
  if me is null or (select is_suspended from public.profiles where id = me) is not false then raise exception 'Please log in.' using errcode = '28000'; end if;
  if not coalesce((select sparkx_open from public.platform_settings where id = true), true) then
    raise exception 'SparkX registration is closed.';
  end if;
  if coalesce(btrim(p_full_name), '') = '' then raise exception 'Please tell us your name.'; end if;
  if coalesce(btrim(p_grade), '') = '' then raise exception 'Please tell us your grade.'; end if;
  if coalesce(btrim(p_school), '') = '' then raise exception 'Please tell us your school name.'; end if;
  if coalesce(btrim(p_contribution), '') = '' then raise exception 'Please tell us what you can contribute to the team.'; end if;
  if coalesce(btrim(p_ai_knowledge), '') = '' then raise exception 'Please tell us what you know about AI.'; end if;
  if exists (select 1 from public.sparkx_applications where user_id = me and status = 'pending') then
    raise exception 'You already have a SparkX application awaiting review.';
  end if;
  insert into public.sparkx_applications (user_id, full_name, grade, school_name, contribution, ai_knowledge, experience, availability, contact)
  values (me, btrim(p_full_name), btrim(p_grade), btrim(p_school), btrim(p_contribution), btrim(p_ai_knowledge), coalesce(btrim(p_experience), ''), coalesce(btrim(p_availability), ''), coalesce(btrim(p_contact), ''))
  returning * into app;
  return jsonb_build_object('success', true, 'application', public.sparkx_application_json(app));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Explore pins
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.explore_pins (
  user_id   uuid primary key references public.profiles (id) on delete cascade,
  pinned_at timestamptz not null default now(),
  pinned_by uuid references public.profiles (id) on delete set null
);
alter table public.explore_pins enable row level security;
revoke all on public.explore_pins from anon, authenticated;       -- read and written only through the functions below

-- When an account was pinned (null = not pinned), for ordering Explore's list. (search_users runs with the
-- caller's own rights, so the people list still follows every privacy rule; only this one lookup reads the pins.)
create or replace function public.explore_pinned_at(p_user uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select pinned_at from public.explore_pins where user_id = p_user;
$$;
revoke execute on function public.explore_pinned_at(uuid) from public, anon;
grant execute on function public.explore_pinned_at(uuid) to authenticated;

-- Explore's people list: pinned accounts first (newest pin on top), then everyone else newest first — otherwise the
-- same as 20260920000010. Pinned entries carry "pinned": true only so the app can keep them on top when the list is
-- shuffled; the app never shows it.
create or replace function public.search_users(p_search text default '') returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(
           case when x.pin is not null then public.user_public_json(x.pr) || jsonb_build_object('pinned', true)
                else public.user_public_json(x.pr) end
           order by x.pin desc nulls last, (x.pr).created_at desc), '[]'::jsonb)
  from (
    select pr, public.explore_pinned_at(pr.id) as pin from public.profiles pr
    where (btrim(coalesce(p_search, '')) = ''
       or pr.username ilike '%' || btrim(p_search) || '%'
       or pr.display_name ilike '%' || btrim(p_search) || '%'
       or pr.bio ilike '%' || btrim(p_search) || '%')
      and not public.is_hidden_from_me(pr.id)
    order by public.explore_pinned_at(pr.id) desc nulls last, pr.created_at desc limit 300
  ) x;
$$;

create or replace function public.admin_set_explore_pin(p_user uuid, p_pinned boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_master_admin() then raise exception 'Access denied. Administrator privileges required.' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'That account was not found.'; end if;
  if p_pinned then
    -- pinning again moves it back to the top
    insert into public.explore_pins (user_id, pinned_at, pinned_by) values (p_user, now(), auth.uid())
    on conflict (user_id) do update set pinned_at = now(), pinned_by = auth.uid();
  else
    delete from public.explore_pins where user_id = p_user;
  end if;
  perform public.log_admin_action(case when p_pinned then 'explore_pin' else 'explore_unpin' end, p_user, '{}'::jsonb);
  return public.admin_explore_pins();
end;
$$;

-- The pinned accounts, newest pin first: [{"userId", "pinnedAt"}] (admin only).
create or replace function public.admin_explore_pins() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_master_admin() then raise exception 'Access denied. Administrator privileges required.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('userId', user_id, 'pinnedAt', pinned_at) order by pinned_at desc)
                   from public.explore_pins), '[]'::jsonb);
end;
$$;

revoke execute on function public.admin_set_explore_pin(uuid, boolean), public.admin_explore_pins() from public, anon;
grant execute on function public.admin_set_explore_pin(uuid, boolean), public.admin_explore_pins(), public.search_users(text) to authenticated;
