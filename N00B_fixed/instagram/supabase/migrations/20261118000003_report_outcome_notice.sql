-- The person who sent a report now hears back: when the NOOB team handles it, a notification says what happened.
--   resolved / banned -> "We looked at your report and took action."
--   dismissed         -> "We looked at your report. It does not break our rules."
-- Only the first decision on a report sends a message (changing it later stays quiet), and anonymous reports (no reporter) send nothing.
-- Nothing else about admin_report_action changes. Safe to run more than once.

create or replace function public.admin_report_action(p_id uuid, p_action text default 'resolved', p_suspend boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid; rep public.reports; t public.profiles; st text; was text; what text;
begin
  me := public.require_permission('handle_reports', 'Access denied. Administrator privileges required.');
  if coalesce(p_suspend, false) and not public.has_permission('suspend_accounts') then
    raise exception 'You need the "suspend accounts" permission to suspend the reported account.' using errcode = '42501';
  end if;
  st := case when p_action in ('resolved', 'dismissed', 'banned') then p_action else 'resolved' end;
  select status into was from public.reports where id = p_id;
  update public.reports set status = st, reviewed_by = me, reviewed_at = now() where id = p_id returning * into rep;
  if not found then raise exception 'Report not found'; end if;
  if coalesce(p_suspend, false) then
    select * into t from public.profiles where id = rep.target_id;
    if found and lower(t.username) <> 'noob' then
      perform public.assert_can_act_on(t.id);
      perform public.set_suspension(t.id, true, 'Account suspended following safety report: ' || rep.reason);
    end if;
  end if;
  if was = 'pending_review' and rep.reporter_id is not null then
    what := case rep.content_type when 'post' then 'post' when 'reel' then 'reel' when 'video' then 'video' when 'story' then 'story' else 'account' end;
    insert into public.notifications (target_user_id, actor_id, type, title, message, data)
    values (rep.reporter_id, null, 'admin_direct', 'Your report',
            case when st = 'dismissed'
                 then 'We looked at the ' || what || ' you reported. It does not break our rules, so no action was taken. Thank you for telling us.'
                 else 'We looked at the ' || what || ' you reported and took action. Thank you for helping keep NOOB safe.' end,
            jsonb_build_object('reportId', rep.id, 'outcome', st));
  end if;
  perform public.log_admin_action('report_' || st, rep.target_id, jsonb_build_object('reportId', rep.id, 'suspended', coalesce(p_suspend, false)));
  return jsonb_build_object('success', true, 'report', public.report_json(rep), 'message', 'Report ' || p_id || ' marked as ' || st || '.');
end;
$$;
