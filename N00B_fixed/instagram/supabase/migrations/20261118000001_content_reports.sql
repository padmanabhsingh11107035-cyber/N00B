-- NOOB: "Report" on every post, reel, video and story.
-- A report names WHO reported (their id and username), WHAT was reported (post / reel / video / story, with its id and its link) and WHOSE content it is.
-- They land in the same admin list as the account reports (Admin > Safety Reports), so nothing new to look for.
-- Reporting content does NOT block its owner (an account report does); it only tells the team.

alter table public.reports add column if not exists content_type text check (content_type in ('post', 'reel', 'video', 'story'));
alter table public.reports add column if not exists content_id uuid;

-- what the admin sees for a report: the same as before, plus the content that was reported (type, id, address)
create or replace function public.report_json(r public.reports) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'reporterId', coalesce(r.reporter_id::text, 'anonymous'),
    'reporterUsername', coalesce(a.username, 'Anonymous'), 'reporterName', coalesce(nullif(a.display_name, ''), a.username, 'Anonymous'),
    'targetUserId', r.target_id, 'targetUsername', t.username, 'targetDisplayName', coalesce(nullif(t.display_name, ''), t.username),
    'targetAvatar', coalesce(nullif(t.avatar, ''), '/noob-logo.svg.jpeg'),
    'reason', r.reason, 'details', r.details, 'status', r.status, 'createdAt', r.created_at,
    'reviewedBy', (select username from public.profiles where id = r.reviewed_by), 'reviewedAt', r.reviewed_at,
    'evidence', r.evidence,
    'contentType', r.content_type, 'contentId', r.content_id,
    'contentPath', case r.content_type when 'post' then '/p/' when 'reel' then '/reel/' when 'video' then '/v/' else null end || r.content_id::text)
  from public.profiles t left join public.profiles a on a.id = r.reporter_id where t.id = r.target_id;
$$;
revoke execute on function public.report_json(public.reports) from public, anon, authenticated;

-- A person reports one piece of content. The owner is looked up here (never taken from the phone), you can not report your own, and the same
-- person reporting the same thing twice while it is still waiting just gets the first report back.
create or replace function public.report_content(p_type text, p_id uuid, p_reason text default null, p_details text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); owner uuid; rep public.reports; recent integer;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if p_type not in ('post', 'reel', 'video', 'story') or p_id is null then raise exception 'Nothing to report.'; end if;
  owner := case p_type
    when 'post'  then (select user_id from public.posts where id = p_id)
    when 'reel'  then (select user_id from public.reels where id = p_id)
    when 'video' then (select user_id from public.long_videos where id = p_id)
    else (select user_id from public.stories where id = p_id) end;
  if owner is null then raise exception 'This content is no longer available.'; end if;
  if owner = me then raise exception 'You can not report your own content.'; end if;
  select * into rep from public.reports where reporter_id = me and content_type = p_type and content_id = p_id and status = 'pending_review' limit 1;
  if found then
    return jsonb_build_object('success', true, 'reportId', rep.id, 'message', 'You already reported this. The NOOB team will look at it.');
  end if;
  select count(*) into recent from public.reports where reporter_id = me and created_at > now() - interval '1 hour';
  if recent >= 20 then raise exception 'You have sent many reports in a short time. Please try again later.'; end if;
  insert into public.reports (reporter_id, target_id, reason, details, content_type, content_id)
  values (me, owner, coalesce(nullif(btrim(left(p_reason, 120)), ''), 'Content report'), coalesce(nullif(btrim(left(p_details, 1000)), ''), 'Reported from the ' || p_type), p_type, p_id)
  returning * into rep;
  return jsonb_build_object('success', true, 'reportId', rep.id, 'message', 'Thank you. The NOOB team will look at this ' || p_type || '.');
end;
$$;
revoke execute on function public.report_content(text, uuid, text, text) from public, anon;
grant execute on function public.report_content(text, uuid, text, text) to authenticated, service_role;
