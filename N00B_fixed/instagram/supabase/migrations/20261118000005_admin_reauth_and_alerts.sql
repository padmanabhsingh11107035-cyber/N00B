-- Three protections in one file (all in the database, nothing to redeploy):
--   A. Dangerous admin actions need the admin's PASSWORD again, checked on the server: changing a balance, suspending an account, and a report that also suspends. A stolen, already-open admin
--      session can no longer do them without the password. Confirming opens a 10 minute window; 5 wrong tries lock the confirmation for 10 minutes. (Deleting an account already asked for the password.)
--   B. The admin account must always use "Is this you?" email approval at sign-in (it can not be switched off for admin accounts). Nobody is locked out: an account with no email is not asked.
--   C. A sign-in on a device this account has never used before sends the person an in-app notification (and a phone push where push is on).
-- Safe to run more than once.

create table if not exists public.admin_reauth (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  until        timestamptz not null default now(),
  fails        integer not null default 0,
  locked_until timestamptz
);
alter table public.admin_reauth enable row level security;
revoke all on public.admin_reauth from public, anon, authenticated;

-- Wrong passwords are RETURNED (not raised) so the counter is kept; a raise would roll the counter back.
create or replace function public.admin_reauth_confirm(p_password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me uuid := public.acting_user(); enc text; r public.admin_reauth;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into r from public.admin_reauth where user_id = me;
  if found and r.locked_until is not null and r.locked_until > now() then
    return jsonb_build_object('success', false, 'error', 'Too many wrong tries. Try again in a few minutes.');
  end if;
  select encrypted_password into enc from auth.users where id = me;
  if coalesce(p_password, '') = '' or enc is null or crypt(p_password, enc) <> enc then
    insert into public.admin_reauth (user_id, until, fails) values (me, now() - interval '1 second', 1)
      on conflict (user_id) do update set fails = case when public.admin_reauth.fails + 1 >= 5 then 0 else public.admin_reauth.fails + 1 end,
        locked_until = case when public.admin_reauth.fails + 1 >= 5 then now() + interval '10 minutes' else null end,
        until = now() - interval '1 second';
    return jsonb_build_object('success', false, 'error', 'That is not your password.');
  end if;
  insert into public.admin_reauth (user_id, until, fails) values (me, now() + interval '10 minutes', 0)
    on conflict (user_id) do update set until = now() + interval '10 minutes', fails = 0, locked_until = null;
  return jsonb_build_object('success', true, 'minutes', 10);
end;
$$;
revoke execute on function public.admin_reauth_confirm(text) from public, anon;
grant execute on function public.admin_reauth_confirm(text) to authenticated;

create or replace function public.require_recent_reauth() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user();
begin
  if me is null or not exists (select 1 from public.admin_reauth where user_id = me and until > now()) then
    raise exception 'REAUTH_REQUIRED: Please confirm your password to do this.' using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function public.require_recent_reauth() from public, anon, authenticated;

-- B. admin accounts always use email approval
create or replace function public.login_approval_needed(identifier text) returns boolean
language plpgsql security definer set search_path = public as $$
declare needed boolean;
begin
  select ((coalesce(s.enabled, false) or coalesce(pr.is_admin, false)) and coalesce(pp.email, '') <> '') into needed
  from auth.users u
  join public.profiles pr on pr.id = u.id
  left join public.login_approval_settings s on s.user_id = u.id
  left join public.profile_private pp on pp.user_id = u.id
  where u.email = public.resolve_login_email(identifier)
  limit 1;
  return coalesce(needed, false);
end;
$$;

create or replace function public.login_approval_check(p_ip text, p_identifier text, p_password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  ident text := btrim(coalesce(p_identifier, ''));
  v_ip  text := coalesce(nullif(btrim(p_ip), ''), 'unknown');
  login_email text; uid uuid; enc text; pr public.profiles; pp public.profile_private; uname text; req boolean;
begin
  delete from public.recovery_attempts where created_at < now() - interval '2 days';
  delete from public.login_challenges where created_at < now() - interval '2 days';
  if ident = '' or coalesce(p_password, '') = '' then return jsonb_build_object('status', 'missing'); end if;

  uname := lower(ident);
  if (select count(*) from public.recovery_attempts a where not a.ok and a.ip = v_ip and a.created_at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  login_email := public.resolve_login_email(ident);
  select u.id, u.encrypted_password into uid, enc from auth.users u where u.email = login_email;
  if uid is null then
    insert into public.recovery_attempts (ip, username, ok) values (v_ip, uname, false);
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into pr from public.profiles where id = uid;
  if not found then
    insert into public.recovery_attempts (ip, username, ok) values (v_ip, uname, false);
    return jsonb_build_object('status', 'not_found');
  end if;
  uname := lower(pr.username);
  if (select count(*) from public.recovery_attempts a where not a.ok and a.username = uname and a.created_at > now() - interval '1 hour') >= 8 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if pr.is_suspended then
    select * into pp from public.profile_private where user_id = uid;
    return jsonb_build_object('status', 'suspended', 'reason', pp.suspended_reason);
  end if;
  if enc is null or crypt(p_password, enc) <> enc then
    insert into public.recovery_attempts (ip, username, ok) values (v_ip, uname, false);
    return jsonb_build_object('status', 'bad_password');
  end if;
  insert into public.recovery_attempts (ip, username, ok) values (v_ip, uname, true);

  select * into pp from public.profile_private where user_id = uid;
  select (coalesce((select s.enabled from public.login_approval_settings s where s.user_id = uid), false) or coalesce(pr.is_admin, false)) and coalesce(pp.email, '') <> '' into req;
  return jsonb_build_object('status', 'ok', 'userId', uid, 'required', req);
end;
$$;

-- A. the protected admin actions
create or replace function public.admin_suspend_user(p_target text, p_reason text default null, p_suspend boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid; t public.profiles; existing uuid; act text := case when coalesce(p_suspend, true) then 'suspend' else 'unsuspend' end;
begin
  me := public.require_permission('suspend_accounts', 'Access denied. You do not have permission to suspend accounts.');
  if btrim(coalesce(p_target, '')) = '' then raise exception 'Target user ID or username is required.'; end if;
  select * into t from public.profiles where id::text = btrim(p_target) or lower(username) = lower(btrim(p_target)) limit 1;
  if not found then raise exception 'Target account not found.'; end if;
  if lower(t.username) = 'noob' then raise exception 'The primary NOOB administrator account cannot be suspended.'; end if;
  perform public.assert_can_act_on(t.id);

  if public.is_master_admin() then
    perform public.require_recent_reauth();
    return public._perform_suspend(t, p_reason, coalesce(p_suspend, true), me);
  end if;

  select id into existing from public.account_action_requests where target_user_id = t.id and action = act and status = 'pending';
  if existing is not null then
    raise exception 'A request to % @% is already waiting for the NOOB administrator''s approval.', act, t.username;
  end if;
  insert into public.account_action_requests (target_user_id, action, reason, requested_by)
  values (t.id, act, nullif(btrim(p_reason), ''), me);
  perform public.notify_user(public.noob_admin_id(), 'admin_direct', me,
    '@' || (select username from public.profiles where id = me) || ' asked to ' || act || ' @' || t.username || '. Open the admin panel to approve.',
    '🛡️ Approval needed');
  perform public.log_admin_action('action_requested', t.id, jsonb_build_object('action', act));
  return jsonb_build_object('success', true, 'pending', true,
    'message', 'Your request to ' || act || ' @' || t.username || ' has been sent to the NOOB administrator for approval.');
end;
$$;

create or replace function public.admin_adjust_points(p_target uuid, p_set_to numeric default null, p_delta numeric default null, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.profiles; before_pts bigint; after_pts bigint; admin_id uuid := public.noob_admin_id();
begin
  perform public.require_permission('adjust_points', 'Access denied. You do not have permission to adjust point balances.');
  perform public.require_recent_reauth();
  select * into t from public.profiles where id = p_target for update;
  if not found then raise exception 'Target account not found.'; end if;
  perform public.assert_can_act_on(t.id);
  before_pts := t.noob_points;
  if p_set_to is not null then after_pts := greatest(0, round(p_set_to))::bigint;
  elsif p_delta is not null then after_pts := greatest(0, before_pts + round(p_delta))::bigint;
  else raise exception 'Provide either setTo or delta as a finite number.';
  end if;
  perform public.apply_points(t.id, after_pts - before_pts,
    coalesce(nullif(btrim(p_reason), ''), 'Balance corrected by NOOB Admin (' || public.fmt_points(before_pts) || ' → ' || public.fmt_points(after_pts) || ')'));
  perform public.notify_user(t.id, 'admin_direct', admin_id,
    'Your NOOB Points balance was adjusted by an administrator: ' || public.fmt_points(before_pts) || ' → ' || public.fmt_points(after_pts) || '.',
    '⚠️ Balance Adjusted');
  perform public.log_admin_action('points_adjusted', t.id, jsonb_build_object('from', before_pts, 'to', after_pts, 'reason', nullif(btrim(p_reason), '')));
  return jsonb_build_object('success', true,
    'message', '@' || t.username || '''s balance updated to ' || public.fmt_points(after_pts) || ' points.',
    'user', (select public.admin_user_view(p) from public.profiles p where p.id = t.id));
end;
$$;

create or replace function public.admin_report_action(p_id uuid, p_action text default 'resolved', p_suspend boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid; rep public.reports; t public.profiles; st text; was text; what text;
begin
  me := public.require_permission('handle_reports', 'Access denied. Administrator privileges required.');
  if coalesce(p_suspend, false) and not public.has_permission('suspend_accounts') then
    raise exception 'You need the "suspend accounts" permission to suspend the reported account.' using errcode = '42501';
  end if;
  st := case when p_action in ('resolved', 'dismissed', 'banned') then p_action else 'resolved' end;
  if coalesce(p_suspend, false) then perform public.require_recent_reauth(); end if;
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

-- C. new-device notice
create or replace function public.record_login(p_device_id text, p_device_label text default null, p_device_model text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); isnew boolean := false;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if coalesce(btrim(p_device_id), '') = '' then raise exception 'Missing device id.'; end if;

  update public.login_history set logged_out_at = now(), end_reason = 'replaced'
    where user_id = me and device_id <> p_device_id and logged_out_at is null;

  if exists (select 1 from public.login_history where user_id = me and device_id = p_device_id and logged_out_at is null) then
    update public.login_history
      set device_label = coalesce(nullif(btrim(p_device_label), ''), device_label),
          device_model = coalesce(nullif(btrim(p_device_model), ''), device_model)
      where user_id = me and device_id = p_device_id and logged_out_at is null;
  else
    -- a device this account has never signed in on before (but the account HAS signed in before): tell the person, so a stranger's sign-in is noticed
    isnew := not exists (select 1 from public.login_history where user_id = me and device_id = p_device_id)
             and exists (select 1 from public.login_history where user_id = me);
    insert into public.login_history (user_id, device_id, device_label, device_model)
      values (me, p_device_id, nullif(btrim(p_device_label), ''), nullif(btrim(p_device_model), ''));
    if isnew then
      perform public.notify_user(me, 'admin_direct', null,
        'A new device signed in to your account: ' || coalesce(nullif(btrim(p_device_model), ''), nullif(btrim(p_device_label), ''), 'unknown device') || '. If this was you, nothing to do. If not, change your password now and sign that device out in Settings > Your devices.',
        '🔐 New sign-in');
    end if;
  end if;
  return jsonb_build_object('success', true);
end;
$$;
