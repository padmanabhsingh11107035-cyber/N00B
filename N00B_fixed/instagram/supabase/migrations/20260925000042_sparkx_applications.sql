-- SparkX (IIT Bombay Techfest) team registrations — a separate, purpose-built application form,
-- mirroring the existing "Apply to join the NOOB team" pattern (team_applications) but with its
-- own questions about AI knowledge and what the applicant can contribute to the competition team.

create table public.sparkx_applications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  full_name        text not null,
  grade            text not null,
  school_name      text not null,
  contribution     text not null,
  ai_knowledge     text not null,
  experience       text not null default '',
  availability     text not null default '',
  contact          text not null default '',
  status           text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at       timestamptz not null default now(),
  reviewed_by      uuid references public.profiles (id),
  reviewed_at      timestamptz
);
create index sparkx_applications_user_idx on public.sparkx_applications (user_id, created_at desc);
alter table public.sparkx_applications enable row level security;
-- No policies on purpose (same as public.team_applications) — every read and write goes through the
-- security-definer functions below, so RLS blocks any other access by default.

create or replace function public.sparkx_application_json(t public.sparkx_applications) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', t.id, 'userId', t.user_id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar,
    'fullName', t.full_name, 'grade', t.grade, 'schoolName', t.school_name, 'contribution', t.contribution,
    'aiKnowledge', t.ai_knowledge, 'experience', t.experience, 'availability', t.availability, 'contact', t.contact,
    'status', t.status, 'createdAt', t.created_at,
    'reviewedBy', (select username from public.profiles where id = t.reviewed_by), 'reviewedAt', t.reviewed_at)
  from public.profiles p where p.id = t.user_id;
$$;

create or replace function public.submit_sparkx_application(
  p_full_name text, p_grade text, p_school text, p_contribution text, p_ai_knowledge text,
  p_experience text default '', p_availability text default '', p_contact text default ''
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); app public.sparkx_applications;
begin
  if me is null or (select is_suspended from public.profiles where id = me) is not false then raise exception 'Please log in.' using errcode = '28000'; end if;
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

create or replace function public.admin_sparkx_applications() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_master_admin() then raise exception 'Access denied. Administrator privileges required.' using errcode = '42501'; end if;
  return jsonb_build_object('success', true,
    'applications', coalesce((select jsonb_agg(public.sparkx_application_json(t) order by t.created_at desc) from public.sparkx_applications t), '[]'::jsonb));
end;
$$;

create or replace function public.admin_review_sparkx_application(p_id uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid; app public.sparkx_applications; st text;
begin
  if not public.is_master_admin() then raise exception 'Access denied. Administrator privileges required.' using errcode = '42501'; end if;
  me := auth.uid();
  st := case when p_status in ('accepted', 'declined') then p_status else 'pending' end;
  update public.sparkx_applications set status = st, reviewed_by = me, reviewed_at = now() where id = p_id returning * into app;
  if not found then raise exception 'Application not found'; end if;
  return jsonb_build_object('success', true, 'application', public.sparkx_application_json(app));
end;
$$;
