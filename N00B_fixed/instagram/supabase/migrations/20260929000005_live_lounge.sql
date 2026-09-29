-- NOOB Live Lounge: a one-time, forever unlock (20 billion NOOB Points, or an admin-generated coupon) that
-- gates two things — going live (start_live_stream) and hosting/joining a Live Lounge meeting room (the
-- meeting room's own migration comes next). The main NOOB admin account always has it for free, same as
-- every other admin-gated feature in this app.
--
-- Also: a generic "ask a friend to pay for this" system (payment_requests). Only 'live_lounge' is wired to
-- an actual grant today — purchase_type is deliberately a checked enum so adding pro_tier/shop_item later is
-- a small addition, and anything not yet wired raises a clear error instead of silently charging for nothing.

create table if not exists public.live_lounge_access (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  source     text not null check (source in ('purchase', 'coupon', 'gift')),
  granted_at timestamptz not null default now()
);
alter table public.live_lounge_access enable row level security;
drop policy if exists live_lounge_access_read_own on public.live_lounge_access;
create policy live_lounge_access_read_own on public.live_lounge_access for select using (user_id = auth.uid());

create or replace function public.has_live_lounge_access(p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user is not null and (
    public.is_master_admin_user(p_user) or exists (select 1 from public.live_lounge_access where user_id = p_user)
  );
$$;
revoke execute on function public.has_live_lounge_access(uuid) from public;
grant execute on function public.has_live_lounge_access(uuid) to authenticated;

-- Locked down like live_streams/live_stream_gifts: no direct client access at all, only through the
-- generate/list/redeem functions below.
create table if not exists public.live_lounge_coupons (
  code         text primary key,
  created_by   uuid references public.profiles(id) on delete set null,
  redeemed_by  uuid references public.profiles(id) on delete set null,
  redeemed_at  timestamptz,
  created_at   timestamptz not null default now()
);
alter table public.live_lounge_coupons enable row level security;
drop policy if exists live_lounge_coupons_no_direct_access on public.live_lounge_coupons;
create policy live_lounge_coupons_no_direct_access on public.live_lounge_coupons for all using (false);

create or replace function public.admin_generate_live_lounge_coupons(p_count int default 1) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid; i int; v_code text; codes text[] := '{}';
begin
  me := public.require_master_admin('Only the main NOOB administrator can generate Live Lounge coupons.');
  if p_count < 1 or p_count > 100 then raise exception 'Generate between 1 and 100 coupons at a time.'; end if;
  for i in 1..p_count loop
    loop
      v_code := 'LOUNGE-' || upper(substr(md5(random()::text || clock_timestamp()::text || i::text), 1, 8));
      exit when not exists (select 1 from public.live_lounge_coupons lc where lc.code = v_code);
    end loop;
    insert into public.live_lounge_coupons (code, created_by) values (v_code, me);
    codes := array_append(codes, v_code);
  end loop;
  perform public.log_admin_action('live_lounge_coupons_generated', null, jsonb_build_object('count', p_count));
  return jsonb_build_object('success', true, 'codes', to_jsonb(codes));
end;
$$;
revoke execute on function public.admin_generate_live_lounge_coupons(int) from public;
grant execute on function public.admin_generate_live_lounge_coupons(int) to authenticated;

create or replace function public.admin_live_lounge_coupons_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_master_admin('Only the main NOOB administrator can see Live Lounge coupons.');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'code', c.code, 'createdAt', c.created_at, 'redeemedAt', c.redeemed_at,
      'redeemedBy', (select username from public.profiles where id = c.redeemed_by)
    ) order by c.created_at desc)
    from public.live_lounge_coupons c
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.admin_live_lounge_coupons_list() from public;
grant execute on function public.admin_live_lounge_coupons_list() to authenticated;

create or replace function public.purchase_live_lounge(p_password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me uuid := auth.uid(); enc text; bal bigint; price constant bigint := 20000000000;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if public.has_live_lounge_access(me) then raise exception 'You already have NOOB Live Lounge.'; end if;

  select encrypted_password into enc from auth.users where id = me;
  if coalesce(p_password, '') = '' or enc is null or crypt(p_password, enc) <> enc then
    raise exception 'Incorrect password. Please re-enter your password to confirm this purchase.' using errcode = '28P01';
  end if;

  select noob_points into bal from public.profiles where id = me;
  if bal < price then
    raise exception 'Insufficient NOOB Points. You have % points; NOOB Live Lounge costs % points.', public.fmt_points(bal), public.fmt_points(price);
  end if;

  perform public.apply_points(me, -price, 'NOOB Live Lounge — one-time purchase');
  insert into public.live_lounge_access (user_id, source) values (me, 'purchase') on conflict (user_id) do nothing;
  return jsonb_build_object('success', true, 'user', public.get_my_user());
end;
$$;
revoke execute on function public.purchase_live_lounge(text) from public;
grant execute on function public.purchase_live_lounge(text) to authenticated;

create or replace function public.redeem_live_lounge_coupon(p_code text, p_password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me uuid := auth.uid(); enc text; v_code text := upper(btrim(coalesce(p_code, ''))); c public.live_lounge_coupons;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if public.has_live_lounge_access(me) then raise exception 'You already have NOOB Live Lounge.'; end if;
  if v_code = '' then raise exception 'Enter a coupon code.'; end if;

  select encrypted_password into enc from auth.users where id = me;
  if coalesce(p_password, '') = '' or enc is null or crypt(p_password, enc) <> enc then
    raise exception 'Incorrect password. Please re-enter your password to confirm.' using errcode = '28P01';
  end if;

  select * into c from public.live_lounge_coupons where code = v_code for update;
  if not found then raise exception 'That coupon code is not valid.'; end if;
  if c.redeemed_by is not null then raise exception 'That coupon has already been used.'; end if;

  update public.live_lounge_coupons set redeemed_by = me, redeemed_at = now() where code = v_code;
  insert into public.live_lounge_access (user_id, source) values (me, 'coupon') on conflict (user_id) do nothing;
  return jsonb_build_object('success', true, 'user', public.get_my_user());
end;
$$;
revoke execute on function public.redeem_live_lounge_coupon(text, text) from public;
grant execute on function public.redeem_live_lounge_coupon(text, text) to authenticated;

-- ----------------------------------------------------------------------------- friend-pays-for-you

create table if not exists public.payment_requests (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references public.profiles(id) on delete cascade,
  payer_id      uuid not null references public.profiles(id) on delete cascade,
  purchase_type text not null check (purchase_type in ('live_lounge')),
  amount        bigint not null,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);
create index if not exists payment_requests_payer_idx on public.payment_requests (payer_id, status);
alter table public.payment_requests enable row level security;
drop policy if exists payment_requests_read on public.payment_requests;
create policy payment_requests_read on public.payment_requests for select using (payer_id = auth.uid() or requester_id = auth.uid());

create or replace function public.request_friend_payment(p_payer uuid, p_purchase_type text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); amt bigint; rname text; req_id uuid;
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

  if exists (select 1 from public.payment_requests where requester_id = me and purchase_type = p_purchase_type and status = 'pending') then
    raise exception 'You already have a pending request for this.';
  end if;

  insert into public.payment_requests (requester_id, payer_id, purchase_type, amount) values (me, p_payer, p_purchase_type, amt)
  returning id into req_id;
  select username into rname from public.profiles where id = me;
  perform public.notify_user(p_payer, 'payment_request', me,
    '@' || rname || ' asked you to pay ' || public.fmt_points(amt) || ' NOOB Points for NOOB Live Lounge.', '🙏 Payment request');
  return jsonb_build_object('success', true, 'requestId', req_id);
end;
$$;
revoke execute on function public.request_friend_payment(uuid, text) from public;
grant execute on function public.request_friend_payment(uuid, text) to authenticated;

-- Pending requests where I'm the one being asked to pay — what the Wallet page's "Payment Requests" list shows.
create or replace function public.my_payment_requests() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'purchaseType', r.purchase_type, 'amount', r.amount, 'createdAt', r.created_at,
    'requester', jsonb_build_object('id', p.id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar)
  ) order by r.created_at desc), '[]'::jsonb)
  from public.payment_requests r join public.profiles p on p.id = r.requester_id
  where r.payer_id = auth.uid() and r.status = 'pending';
$$;
revoke execute on function public.my_payment_requests() from public;
grant execute on function public.my_payment_requests() to authenticated;

-- Approving pays with the SAME confirm-with-password pattern as every other real spend in this app — except
-- for the main NOOB admin, whose points are never actually spent (see comment on is_master_admin() checks
-- below): they can approve without a password and without a balance check, "infinite points" as requested.
create or replace function public.respond_payment_request(p_request_id uuid, p_approve boolean, p_password text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me uuid := auth.uid(); r public.payment_requests; enc text; bal bigint; pname text;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into r from public.payment_requests where id = p_request_id and payer_id = me and status = 'pending' for update;
  if not found then raise exception 'That request was not found.'; end if;
  select username into pname from public.profiles where id = me;

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

-- ----------------------------------------------------------------------------- gating + admin economy

-- Same signature as the start_live_stream() created in the live_streams migration, so this only adds the
-- access check to its body — the grant it already has stays in place. Watching/chatting/gifting on someone
-- ELSE's stream stays free for everyone; only going live yourself needs Live Lounge.
create or replace function public.start_live_stream(p_title text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); existing public.live_streams; s public.live_streams;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if not public.has_live_lounge_access(me) then
    raise exception 'Going live is a NOOB Live Lounge feature. Unlock NOOB Live Lounge to start streaming.';
  end if;
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

-- The literal @noob account only (not delegate admins) never runs out of points and never shows up on the
-- leaderboard — it isn't a real player, so it shouldn't occupy a rank or ever be blocked by its own balance.
create or replace function public.game_leaderboard() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); mine bigint; rk int;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select noob_points into mine from public.profiles where id = me;
  select count(*) + 1 into rk from public.profiles where not is_ai and lower(username) <> 'noob' and noob_points > coalesce(mine, 0);
  return jsonb_build_object(
    'leaderboard', coalesce((
      select jsonb_agg(t.entry order by t.rn) from (
        select jsonb_build_object('rank', x.rn, 'userId', x.id, 'username', x.username,
                 'displayName', coalesce(nullif(x.display_name, ''), x.username), 'avatar', x.avatar,
                 'noobPoints', x.noob_points, 'gamesWon', x.games_won_count, 'gamesPlayed', x.games_played_count,
                 'isVerified', x.is_verified) as entry, x.rn
        from (select p.*, row_number() over (order by p.noob_points desc, p.created_at asc) as rn
              from public.profiles p where not p.is_ai and lower(p.username) <> 'noob') x
        where x.rn <= 10) t), '[]'::jsonb),
    'currentUserPoints', coalesce(mine, 0),
    'currentUserRank', rk);
end;
$$;
revoke execute on function public.game_leaderboard() from public;
grant execute on function public.game_leaderboard() to authenticated;

-- Same signature/grants as before (shop_orders_profile_hide.sql) — only adds hasLiveLounge, so every screen
-- reading currentUser can gate "Go Live" / the Live Lounge tab without a separate round trip.
create or replace function public.get_my_user() returns jsonb
language sql stable set search_path = public as $$
  select public.user_public_json(p) || jsonb_build_object(
    'email', pp.email, 'firstName', pp.first_name, 'lastName', pp.last_name,
    'countryCode', pp.country_code, 'mobileNumber', pp.mobile_number, 'dateOfBirth', pp.date_of_birth,
    'gender', pp.gender, 'businessEmail', pp.business_email, 'businessPhone', pp.business_phone,
    'businessAddress', pp.business_address, 'businessAddresses', to_jsonb(coalesce(pp.business_addresses, '{}')),
    'agreedToTerms', pp.agreed_to_terms, 'suspendedReason', pp.suspended_reason,
    'isSuspended', p.is_suspended, 'privacySettings', p.privacy_settings,
    'proBilling', p.pro_billing, 'proAutoRenew', p.pro_auto_renew, 'proRenewsAt', p.pro_renews_at,
    'purchasedItemIds', to_jsonb(p.purchased_item_ids),
    'adminPermissions', coalesce((select to_jsonb(g.permissions) from public.admin_grants g where g.user_id = p.id), '[]'::jsonb),
    'blockedUserIds', coalesce((select jsonb_agg(b.blocked_id) from public.blocks b where b.blocker_id = p.id), '[]'::jsonb),
    'hiddenFromIds', public.my_hidden_from_ids(),
    'followRequests', coalesce((
      select jsonb_agg(jsonb_build_object('userId', r.requester_id, 'username', q.username, 'displayName', q.display_name,
                                          'avatar', q.avatar, 'requestedAt', r.created_at) order by r.created_at desc)
      from public.follow_requests r join public.profiles q on q.id = r.requester_id where r.target_id = p.id), '[]'::jsonb),
    'pendingSentRequests', coalesce((select jsonb_agg(r.target_id) from public.follow_requests r where r.requester_id = p.id), '[]'::jsonb),
    'noobTransactions', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'amount', t.amount, 'reason', t.reason, 'timestamp', t.created_at, 'balanceAfter', t.balance_after)
                       order by t.created_at desc)
      from (select * from public.noob_transactions where user_id = p.id order by created_at desc limit 200) t), '[]'::jsonb),
    'hasLiveLounge', public.has_live_lounge_access(p.id)
  )
  from public.profiles p
  left join public.profile_private pp on pp.user_id = p.id
  where p.id = auth.uid();
$$;
