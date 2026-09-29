-- Fix 1: Go Live is free for everyone again — only the Live Lounge MEETING ROOM
-- (start_live_lounge_room) needs the subscription, not broadcasting. Same signature as before, so
-- the grant it already has stays in place.
create or replace function public.start_live_stream(p_title text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); existing public.live_streams; s public.live_streams;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into existing from public.live_streams where host_id = me and status = 'live';
  if found then
    return jsonb_build_object('id', existing.id, 'channelName', existing.channel_name, 'title', existing.title, 'startedAt', existing.started_at);
  end if;
  insert into public.live_streams (host_id, channel_name, title)
  values (me, 'live_' || replace(gen_random_uuid()::text, '-', ''), left(btrim(coalesce(p_title, '')), 80))
  returning * into s;
  return jsonb_build_object('id', s.id, 'channelName', s.channel_name, 'title', s.title, 'startedAt', s.started_at);
end;
$$;
revoke execute on function public.start_live_stream(text) from public;
grant execute on function public.start_live_stream(text) to authenticated;

-- Cleanup: a client-side bug (now fixed) could leave a stream marked "live" forever if the actual
-- video connection failed after the database row was already created — this ends any such leftovers
-- so the discovery rail stops showing someone as live when nobody is actually broadcasting.
update public.live_streams set status = 'ended', ended_at = now() where status = 'live';

-- Fix 2: payment requests expire after 7 minutes. The payer can no longer approve an expired one
-- (it fails outright before anything is ever deducted — strictly safer than deducting first and
-- refunding after, since that would need a real charge to correct instead of just refusing it).
alter table public.payment_requests drop constraint if exists payment_requests_status_check;
alter table public.payment_requests add constraint payment_requests_status_check
  check (status in ('pending', 'approved', 'declined', 'cancelled', 'expired'));
alter table public.payment_requests add column if not exists expires_at timestamptz;
update public.payment_requests set expires_at = created_at + interval '7 minutes' where expires_at is null;
alter table public.payment_requests alter column expires_at set default (now() + interval '7 minutes');
alter table public.payment_requests alter column expires_at set not null;

create or replace function public.request_friend_payment(p_payer uuid, p_purchase_type text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); amt bigint; rname text; req_id uuid; v_expires timestamptz := now() + interval '7 minutes';
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if p_payer is null or p_payer = me then raise exception 'Choose a friend to ask.'; end if;
  if not exists (select 1 from public.profiles where id = p_payer) then raise exception 'That account was not found.'; end if;

  if p_purchase_type = 'live_lounge' then
    if public.has_live_lounge_access(me) then raise exception 'You already have NOOB Live Lounge.'; end if;
    amt := 20000000000;
  else
    raise exception 'Payment requests for that are coming soon.';
  end if;

  -- Sweep any of MY OWN stale requests for this same purchase first, so an old one that quietly
  -- expired never blocks me from asking again.
  update public.payment_requests set status = 'expired', resolved_at = now()
  where requester_id = me and purchase_type = p_purchase_type and status = 'pending' and expires_at <= now();

  if exists (select 1 from public.payment_requests where requester_id = me and purchase_type = p_purchase_type and status = 'pending') then
    raise exception 'You already have a pending request for this.';
  end if;

  insert into public.payment_requests (requester_id, payer_id, purchase_type, amount, expires_at)
  values (me, p_payer, p_purchase_type, amt, v_expires)
  returning id into req_id;
  select username into rname from public.profiles where id = me;
  perform public.notify_user(p_payer, 'payment_request', me,
    '@' || rname || ' asked you to pay ' || public.fmt_points(amt) || ' NOOB Points for NOOB Live Lounge — you have 7 minutes to approve it.', '🙏 Payment request');
  return jsonb_build_object('success', true, 'requestId', req_id, 'expiresAt', v_expires);
end;
$$;
revoke execute on function public.request_friend_payment(uuid, text) from public;
grant execute on function public.request_friend_payment(uuid, text) to authenticated;

-- Only ever hands back requests that are still actually approvable.
create or replace function public.my_payment_requests() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'purchaseType', r.purchase_type, 'amount', r.amount, 'createdAt', r.created_at, 'expiresAt', r.expires_at,
    'requester', jsonb_build_object('id', p.id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar)
  ) order by r.created_at desc), '[]'::jsonb)
  from public.payment_requests r join public.profiles p on p.id = r.requester_id
  where r.payer_id = auth.uid() and r.status = 'pending' and r.expires_at > now();
$$;
revoke execute on function public.my_payment_requests() from public;
grant execute on function public.my_payment_requests() to authenticated;

create or replace function public.respond_payment_request(p_request_id uuid, p_approve boolean, p_password text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me uuid := auth.uid(); r public.payment_requests; enc text; bal bigint; pname text;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into r from public.payment_requests where id = p_request_id and payer_id = me and status = 'pending' for update;
  if not found then raise exception 'That request was not found.'; end if;
  select username into pname from public.profiles where id = me;

  if now() > r.expires_at then
    update public.payment_requests set status = 'expired', resolved_at = now() where id = p_request_id;
    raise exception 'This payment request has expired.';
  end if;

  if not p_approve then
    update public.payment_requests set status = 'declined', resolved_at = now() where id = p_request_id;
    perform public.notify_user(r.requester_id, 'payment_request_declined', me,
      '@' || pname || ' declined your NOOB Live Lounge payment request.', '💳 Payment request declined');
    return jsonb_build_object('success', true, 'approved', false);
  end if;

  if not public.is_master_admin() then
    select encrypted_password into enc from auth.users where id = me;
    if coalesce(p_password, '') = '' or enc is null or crypt(p_password, enc) <> enc then
      raise exception 'Incorrect password. Please re-enter your password to confirm this payment.' using errcode = '28P01';
    end if;
    select noob_points into bal from public.profiles where id = me;
    if bal < r.amount then raise exception 'Insufficient NOOB Points. You have % points.', public.fmt_points(bal); end if;
    perform public.apply_points(me, -r.amount, 'Paid a friend''s NOOB Live Lounge request');
  end if;

  if r.purchase_type = 'live_lounge' then
    insert into public.live_lounge_access (user_id, source) values (r.requester_id, 'gift') on conflict (user_id) do nothing;
  end if;

  update public.payment_requests set status = 'approved', resolved_at = now() where id = p_request_id;
  perform public.notify_user(r.requester_id, 'payment_request_approved', me,
    '@' || pname || ' paid for your NOOB Live Lounge — it''s active now!', '🎉 Payment approved');
  return jsonb_build_object('success', true, 'approved', true);
end;
$$;
revoke execute on function public.respond_payment_request(uuid, boolean, text) from public;
grant execute on function public.respond_payment_request(uuid, boolean, text) to authenticated;
