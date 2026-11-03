-- NOOB — the Grievance Officer's inbox: a complaint form that works WITHOUT logging in (noobsocials.com/grievance.html), a ticket number for every complaint, and a way to look a ticket up.
-- Promise made in the Terms and the Privacy Policy: acknowledged within 24 hours, resolved within 15 days.
--
-- Purely ADDITIVE: one new table and new functions. Nothing existing is changed or deleted.
-- Who can do what: the table can be read or written by nobody directly (not even by a signed-in person). The public can only call submit_grievance (send) and track_grievance (look up a ticket
-- with the ticket number AND the contact it was filed with). Only the NOOB administrator can list and update complaints.
-- Limits: a message of 10 to 4000 characters; 3 complaints per contact per day; 200 per hour in all (a flood guard).

create table if not exists public.grievances (
  id          uuid primary key default gen_random_uuid(),
  ticket      text not null unique,
  name        text,
  contact     text not null,
  username    text,
  topic       text not null default 'other' check (topic in ('content', 'account', 'data', 'purchase', 'safety', 'other')),
  message     text not null check (char_length(message) between 10 and 4000),
  user_id     uuid references public.profiles (id) on delete set null,
  status      text not null default 'open' check (status in ('open', 'acknowledged', 'resolved', 'rejected')),
  resolution  text,
  created_at  timestamptz not null default now(),
  ack_at      timestamptz,
  resolved_at timestamptz
);
create index if not exists grievances_created_idx on public.grievances (created_at desc);
create index if not exists grievances_contact_idx on public.grievances (lower(contact), created_at desc);
create index if not exists grievances_user_idx on public.grievances (user_id) where user_id is not null;
alter table public.grievances enable row level security;
revoke all on public.grievances from public, anon, authenticated;
grant all on public.grievances to service_role;

create or replace function public.submit_grievance(p_name text, p_contact text, p_username text, p_topic text, p_message text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_contact text := btrim(coalesce(p_contact, ''));
  v_message text := btrim(coalesce(p_message, ''));
  v_topic   text := case when p_topic in ('content', 'account', 'data', 'purchase', 'safety', 'other') then p_topic else 'other' end;
  v_ticket  text;
  v_n       integer;
begin
  if char_length(v_contact) < 5 or char_length(v_contact) > 200 then
    return jsonb_build_object('success', false, 'error', 'Please give an email address or phone number we can answer on.');
  end if;
  if char_length(v_message) < 10 or char_length(v_message) > 4000 then
    return jsonb_build_object('success', false, 'error', 'Please describe the complaint in 10 to 4000 characters.');
  end if;
  select count(*) into v_n from public.grievances where lower(contact) = lower(v_contact) and created_at > now() - interval '1 day';
  if v_n >= 3 then
    return jsonb_build_object('success', false, 'error', 'You have already sent 3 complaints today. We will answer them first.');
  end if;
  select count(*) into v_n from public.grievances where created_at > now() - interval '1 hour';
  if v_n >= 200 then
    return jsonb_build_object('success', false, 'error', 'Too many complaints at the moment. Please try again in an hour.');
  end if;
  loop
    v_ticket := 'GR-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));
    exit when not exists (select 1 from public.grievances where ticket = v_ticket);
  end loop;
  insert into public.grievances (ticket, name, contact, username, topic, message, user_id)
  values (v_ticket, nullif(left(btrim(coalesce(p_name, '')), 80), ''), v_contact, nullif(left(btrim(coalesce(p_username, '')), 40), ''), v_topic, v_message, auth.uid());
  return jsonb_build_object('success', true, 'ticket', v_ticket, 'acknowledgeWithin', '24 hours', 'resolveWithin', '15 days');
end;
$$;

create or replace function public.track_grievance(p_ticket text, p_contact text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare g public.grievances;
begin
  select * into g from public.grievances where ticket = upper(btrim(coalesce(p_ticket, ''))) and lower(contact) = lower(btrim(coalesce(p_contact, '')));
  if not found then return jsonb_build_object('found', false); end if;
  return jsonb_build_object('found', true, 'ticket', g.ticket, 'status', g.status, 'topic', g.topic, 'resolution', g.resolution,
    'filedAt', g.created_at, 'acknowledgedAt', g.ack_at, 'resolvedAt', g.resolved_at,
    'acknowledgeBy', g.created_at + interval '24 hours', 'resolveBy', g.created_at + interval '15 days');
end;
$$;

create or replace function public.admin_grievances(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_master_admin('Only the NOOB administrator can read complaints.');
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', g.id, 'ticket', g.ticket, 'name', g.name, 'contact', g.contact, 'username', g.username, 'topic', g.topic, 'message', g.message,
      'status', g.status, 'resolution', g.resolution, 'createdAt', g.created_at, 'ackAt', g.ack_at, 'resolvedAt', g.resolved_at,
      'ackLate', g.ack_at is null and g.created_at < now() - interval '24 hours', 'resolveLate', g.resolved_at is null and g.created_at < now() - interval '15 days') order by g.created_at desc)
    from (select * from public.grievances where p_status is null or status = p_status order by created_at desc limit 300) g
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_grievance_update(p_id uuid, p_status text, p_resolution text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_master_admin('Only the NOOB administrator can answer complaints.');
  if p_status not in ('acknowledged', 'resolved', 'rejected') then return jsonb_build_object('success', false, 'error', 'Unknown status.'); end if;
  update public.grievances set
    status = p_status,
    resolution = coalesce(nullif(left(btrim(coalesce(p_resolution, '')), 2000), ''), resolution),
    ack_at = coalesce(ack_at, now()),
    resolved_at = case when p_status in ('resolved', 'rejected') then now() else resolved_at end
  where id = p_id;
  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.submit_grievance(text, text, text, text, text), public.track_grievance(text, text), public.admin_grievances(text), public.admin_grievance_update(uuid, text, text) from public;
grant execute on function public.submit_grievance(text, text, text, text, text), public.track_grievance(text, text) to anon, authenticated;
grant execute on function public.admin_grievances(text), public.admin_grievance_update(uuid, text, text) to authenticated;
