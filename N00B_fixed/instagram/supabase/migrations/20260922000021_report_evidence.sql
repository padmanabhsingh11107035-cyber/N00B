-- NOOB — Reported-chat evidence.
-- Person-to-person chats are end-to-end encrypted (migration 15): the server stores only locked
-- envelopes and can never read them on its own, for anyone, ever — "not even NOOB". The one
-- deliberate exception the app now supports mirrors how real E2E apps (Signal, WhatsApp) actually
-- handle abuse reports: when someone FILES A REPORT against another user, their own device — the
-- only place that ever holds the decrypted text of that ONE conversation — may attach a copy of it
-- to the report, exactly as if they had forwarded those messages to NOOB Admin by hand. This never
-- creates a standing way for admin (or anyone) to read a conversation that was never reported; a
-- chat nobody has reported stays unreadable by anyone but its own members, forever.
alter table public.reports add column if not exists evidence jsonb;

-- Adds 'evidence' to what admin sees for a report; unchanged signature, so the existing grants
-- (revoked from authenticated, used only from inside admin_reports / admin_report_action) still apply.
create or replace function public.report_json(r public.reports) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'reporterId', coalesce(r.reporter_id::text, 'anonymous'),
    'reporterUsername', coalesce(a.username, 'Anonymous'), 'reporterName', coalesce(nullif(a.display_name, ''), a.username, 'Anonymous'),
    'targetUserId', r.target_id, 'targetUsername', t.username, 'targetDisplayName', coalesce(nullif(t.display_name, ''), t.username),
    'targetAvatar', coalesce(nullif(t.avatar, ''), '/noob-logo.svg.jpeg'),
    'reason', r.reason, 'details', r.details, 'status', r.status, 'createdAt', r.created_at,
    'reviewedBy', (select username from public.profiles where id = r.reviewed_by), 'reviewedAt', r.reviewed_at,
    'evidence', r.evidence)
  from public.profiles t left join public.profiles a on a.id = r.reporter_id where t.id = r.target_id;
$$;

-- Adding a 4th parameter changes this function's identity (Postgres treats it as a different
-- overload, not a replacement) — the old 3-parameter one must be dropped explicitly, or PostgREST
-- would end up with two candidates and refuse every call as ambiguous.
drop function if exists public.submit_report(text, text, text);

-- Reporting someone also blocks them for you. p_evidence, when present, must be a small array (the
-- reporter's own device already decrypted these messages to show them on screen — nothing new is
-- decrypted or read here); anything else shaped is simply dropped rather than failing the report.
create or replace function public.submit_report(p_target text, p_reason text default null, p_details text default null, p_evidence jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); clean text; t public.profiles; rep public.reports; ev jsonb;
begin
  if btrim(coalesce(p_target, '')) = '' then raise exception 'User ID or @username is required.'; end if;
  clean := lower(regexp_replace(btrim(p_target), '^@', ''));
  select * into t from public.profiles where lower(username) = clean or id::text = clean limit 1;
  if not found then raise exception 'Account not found. Please verify the User ID or @username.'; end if;
  if t.id = me then raise exception 'You cannot report or block your own account!'; end if;
  ev := case when jsonb_typeof(p_evidence) = 'array' and jsonb_array_length(p_evidence) between 1 and 100
             and length(p_evidence::text) <= 40000 then p_evidence end;
  perform public.block_user(t.id);
  insert into public.reports (reporter_id, target_id, reason, details, evidence)
  values (me, t.id, coalesce(nullif(btrim(p_reason), ''), 'Cyber Bullying & Harassment'),
          coalesce(nullif(btrim(p_details), ''), 'Report submitted via Trust & Safety'), ev)
  returning * into rep;
  return jsonb_build_object('success', true, 'reportId', rep.id, 'report', public.report_json(rep),
    'message', 'Report successfully filed against @' || t.username || '. The account has been blocked and flagged for NOOB Admin review.');
end;
$$;

revoke execute on function public.submit_report(text, text, text, jsonb) from public, anon;
grant execute on function public.submit_report(text, text, text, jsonb) to authenticated, service_role;

-- Read-only: is there already a direct chat between me and this person? Used only so the app knows
-- whether there is anything it could offer to attach as evidence when filing a report — it never
-- creates a chat, and the other person is never told this was asked.
create or replace function public.find_direct_chat(p_user uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  return (select c.id from public.chats c
    where not c.is_group and not c.is_global_default
      and exists (select 1 from public.chat_members m where m.chat_id = c.id and m.user_id = me)
      and exists (select 1 from public.chat_members m where m.chat_id = c.id and m.user_id = p_user)
    limit 1);
end;
$$;

revoke execute on function public.find_direct_chat(uuid) from public, anon;
grant execute on function public.find_direct_chat(uuid) to authenticated, service_role;
