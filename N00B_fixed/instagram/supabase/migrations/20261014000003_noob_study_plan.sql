-- NOOB STUDY, part 3: the timetable. The student's plan settings (days kept free, how far ahead to plan), adding a plan's sessions without replacing
-- anything (used for one exam's revision), and one honest rule: a session an earlier plan made becomes the student's own the moment they change it,
-- so planning again never undoes their edit.
-- Safe to run more than once. Everything here belongs to the signed-in student alone.

-- ---------------------------------------------------------------- plan settings
-- (tied to the student's study profile: erasing "everything in NOOB STUDY" erases this too, with no change to the delete function)
create table if not exists public.study_plan_prefs (
  user_id      uuid primary key references public.study_profiles(user_id) on delete cascade,
  rest_days    smallint[] not null default '{}',
  horizon_days integer not null default 7 check (horizon_days between 1 and 28),
  updated_at   timestamptz not null default now()
);
alter table public.study_plan_prefs enable row level security;

create or replace function public.study_plan_prefs_get() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); p public.study_plan_prefs;
begin
  select * into p from public.study_plan_prefs where user_id = me;
  if not found then return jsonb_build_object('saved', false, 'restDays', '[]'::jsonb, 'horizonDays', 7); end if;
  return jsonb_build_object('saved', true, 'restDays', to_jsonb(p.rest_days), 'horizonDays', p.horizon_days);
end;
$$;

create or replace function public.study_plan_prefs_save(p_rest jsonb, p_horizon integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); days smallint[];
begin
  if jsonb_typeof(p_rest) is distinct from 'array' then raise exception 'Please choose which days to keep free.'; end if;
  if jsonb_array_length(p_rest) > 7 then raise exception 'There are only seven days in a week.'; end if;
  begin
    select coalesce(array_agg(distinct v::smallint order by v::smallint), '{}') into days from jsonb_array_elements_text(p_rest) v;
  exception when others then raise exception 'Please choose which days to keep free.';
  end;
  if exists (select 1 from unnest(days) d where d < 0 or d > 6) then raise exception 'Please choose which days to keep free.'; end if;
  if p_horizon is null or p_horizon < 1 or p_horizon > 28 then raise exception 'A plan can cover between 1 and 28 days.'; end if;
  insert into public.study_profiles (user_id, display_name)
  select me, left(coalesce(nullif(btrim(display_name), ''), username), 60) from public.profiles where id = me
  on conflict (user_id) do nothing;
  insert into public.study_plan_prefs (user_id, rest_days, horizon_days) values (me, days, p_horizon)
  on conflict (user_id) do update set rest_days = excluded.rest_days, horizon_days = excluded.horizon_days, updated_at = now();
  return jsonb_build_object('saved', true, 'restDays', to_jsonb(days), 'horizonDays', p_horizon);
end;
$$;

-- ---------------------------------------------------------------- add a plan without replacing anything
-- Each session is added as a plan session ("ai") unless it would sit on top of a session that is already there (done or planned): then it is left out and counted.
create or replace function public.study_sessions_add_plan(p_plan jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.study_int_uid(); item jsonb; f record; made integer := 0; clashed integer := 0;
begin
  if jsonb_typeof(p_plan) is distinct from 'array' then raise exception 'There is no plan to save.'; end if;
  if jsonb_array_length(p_plan) > 60 then raise exception 'You can add at most 60 sessions at once.'; end if;
  perform 1 from public.study_profiles where user_id = me for update;
  for item in select * from jsonb_array_elements(p_plan) loop
    select * into f from public.study_int_session_fields(me, item);
    if exists (select 1 from public.study_sessions s where s.user_id = me and s.status <> 'skipped'
               and tstzrange(s.starts_at, s.starts_at + make_interval(mins => s.duration_min)) && tstzrange(f.o_starts, f.o_starts + make_interval(mins => f.o_dur))) then
      clashed := clashed + 1; continue;
    end if;
    insert into public.study_sessions (user_id, subject_id, topic, starts_at, duration_min, objective, activity, priority, why, source)
    values (me, f.o_subject, f.o_topic, f.o_starts, f.o_dur, f.o_obj, f.o_act, f.o_prio, f.o_why, 'ai');
    made := made + 1;
  end loop;
  if made > 0 then perform public.study_int_log(me, 'plan_change', null, 0, jsonb_build_object('made', made)); end if;
  return jsonb_build_object('success', true, 'made', made, 'clashed', clashed);
end;
$$;

-- ---------------------------------------------------------------- editing a plan session makes it the student's own
create or replace function public.study_session_save(p_session jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.study_int_uid();
  x jsonb := case when jsonb_typeof(p_session) = 'object' then p_session else '{}'::jsonb end;
  sid uuid := nullif(x->>'id', '')::uuid; cref uuid := nullif(x->>'clientRef', '')::uuid;
  f record; row public.study_sessions; cur public.study_sessions;
begin
  if sid is null then
    select * into f from public.study_int_session_fields(me, x);
    insert into public.study_sessions (user_id, client_ref, subject_id, topic, starts_at, duration_min, objective, activity, priority, why, source)
    values (me, cref, f.o_subject, f.o_topic, f.o_starts, f.o_dur, f.o_obj, f.o_act, f.o_prio, f.o_why, 'manual')
    on conflict (user_id, client_ref) where client_ref is not null do nothing returning * into row;
    if row.id is null then select * into row from public.study_sessions where user_id = me and client_ref = cref; end if;
    return public.study_int_session_json(row);
  end if;
  select * into cur from public.study_sessions where id = sid and user_id = me for update;
  if not found then raise exception 'That session no longer exists.'; end if;
  select * into f from public.study_int_session_fields(me, public.study_int_session_json(cur) || x);
  update public.study_sessions set subject_id = f.o_subject, topic = f.o_topic, starts_at = f.o_starts, duration_min = f.o_dur, objective = f.o_obj,
    activity = f.o_act, priority = f.o_prio, why = f.o_why, source = 'manual', updated_at = now() where id = sid returning * into row;
  return public.study_int_session_json(row);
end;
$$;

-- ---------------------------------------------------------------- who may call what
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig, p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'study\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    if r.proname like 'study\_svc\_%' then execute format('grant execute on function %s to service_role', r.sig);
    elsif r.proname not like 'study\_int\_%' then execute format('grant execute on function %s to authenticated', r.sig);
    end if;
  end loop;
end;
$$;
