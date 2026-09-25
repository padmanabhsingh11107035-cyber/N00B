-- SparkX email notifications: adds a place to record when an applicant was sent a meeting/interview
-- invite (the actual sending happens in the dynamic-handler edge function, via Resend — this migration
-- only adds the bookkeeping column + the admin-only function that marks applicants as invited).

alter table public.sparkx_applications add column if not exists meeting_invited_at timestamptz;

-- Same as the original (20260925000042) except for the added 'meetingInvitedAt' field.
create or replace function public.sparkx_application_json(t public.sparkx_applications) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', t.id, 'userId', t.user_id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar,
    'fullName', t.full_name, 'grade', t.grade, 'schoolName', t.school_name, 'contribution', t.contribution,
    'aiKnowledge', t.ai_knowledge, 'experience', t.experience, 'availability', t.availability, 'contact', t.contact,
    'status', t.status, 'createdAt', t.created_at, 'meetingInvitedAt', t.meeting_invited_at,
    'reviewedBy', (select username from public.profiles where id = t.reviewed_by), 'reviewedAt', t.reviewed_at)
  from public.profiles p where p.id = t.user_id;
$$;

create or replace function public.admin_mark_sparkx_meeting_invited(p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_master_admin() then raise exception 'Access denied. Administrator privileges required.' using errcode = '42501'; end if;
  update public.sparkx_applications set meeting_invited_at = now() where id = any(p_ids);
  return jsonb_build_object('success', true);
end;
$$;
