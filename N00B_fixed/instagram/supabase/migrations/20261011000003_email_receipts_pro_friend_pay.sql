-- Emails about money and NOOB Pro, and "ask a friend to pay" for NOOB Pro.
--
--  1. An email outbox + the plumbing that sends it (the Edge Function "dynamic-handler" builds and sends each email; the database only
--     decides WHAT to send and to whom). An email never blocks the thing that caused it: if it cannot be sent it is retried later.
--  2. Receipts: when someone gets NOOB Pro (paid by themselves or by a friend), renews it, or buys the verification badge.
--  3. Warnings: NOOB Pro is about to end (3 days and 1 day before, only when it will NOT renew by itself), and the email that says why
--     it ended, with a button that opens the exact payment page for that plan.
--  4. A friend can pay for your NOOB Pro: either the whole price, or just the points you are missing. When the friend approves, the
--     plan starts at once, the friend's points and your own part are taken together.

-- ======================================================================================================== 1. outbox
create table if not exists public.email_outbox (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null,
  payload    jsonb not null default '{}'::jsonb,
  status     text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts   integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at    timestamptz
);
create index if not exists email_outbox_status_idx on public.email_outbox (status, created_at);
alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from anon, authenticated;       -- only the functions below touch it

-- Writes the email down and asks the Edge Function to send it. Swallows every problem: an email must never stop the real action.
create or replace function public.queue_email(p_user uuid, p_kind text, p_payload jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare eid uuid; u text; s text;
begin
  insert into public.email_outbox (user_id, kind, payload) values (p_user, p_kind, coalesce(p_payload, '{}'::jsonb)) returning id into eid;
  begin
    select value into u from public.internal_config where key = 'push_url';
    select value into s from public.internal_config where key = 'push_secret';
    if u is not null and s is not null then
      perform net.http_post(url := u,
                            body := jsonb_build_object('action', 'event_email', 'emailId', eid),
                            headers := jsonb_build_object('Content-Type', 'application/json', 'x-noob-push', s));
    end if;
  exception when others then
    null;
  end;
  return eid;
exception when others then
  return null;
end;
$$;
revoke execute on function public.queue_email(uuid, text, jsonb) from public, anon, authenticated;

-- The Edge Function asks for an email to send (it must know the private password). Marks it as being sent, so two callers can never
-- send the same one twice, and hands back what to write and to which address. An account without a real address is skipped.
create or replace function public.email_claim(p_secret text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare expected text; e public.email_outbox; addr text; v_name text; v_user text;
begin
  select value into expected from public.internal_config where key = 'push_secret';
  if expected is null or p_secret is distinct from expected then raise exception 'Unauthorized'; end if;
  update public.email_outbox set status = 'sending', attempts = attempts + 1, claimed_at = now()
  where id = p_id and attempts < 5 and (status = 'pending' or (status = 'sending' and claimed_at < now() - interval '10 minutes'))
  returning * into e;
  if not found then return jsonb_build_object('claimed', false); end if;

  select lower(btrim(coalesce(pp.email, ''))) into addr from public.profile_private pp where pp.user_id = e.user_id;
  select coalesce(nullif(pr.display_name, ''), pr.username), pr.username into v_name, v_user from public.profiles pr where pr.id = e.user_id;
  if addr is null or addr = '' or position('@' in addr) = 0 or addr like '%@users.nooob.xyz' then
    update public.email_outbox set status = 'skipped', last_error = 'no real email address on this account' where id = e.id;
    return jsonb_build_object('claimed', false, 'skipped', true);
  end if;
  return jsonb_build_object('claimed', true, 'id', e.id, 'kind', e.kind, 'payload', e.payload, 'email', addr, 'name', v_name, 'username', v_user);
end;
$$;
revoke execute on function public.email_claim(text, uuid) from public, anon, authenticated;
grant execute on function public.email_claim(text, uuid) to service_role;

create or replace function public.email_done(p_secret text, p_id uuid, p_ok boolean, p_error text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare expected text;
begin
  select value into expected from public.internal_config where key = 'push_secret';
  if expected is null or p_secret is distinct from expected then raise exception 'Unauthorized'; end if;
  if p_ok then
    update public.email_outbox set status = 'sent', sent_at = now(), last_error = null where id = p_id;
  else
    update public.email_outbox set status = case when attempts >= 5 then 'failed' else 'pending' end, last_error = left(coalesce(p_error, 'unknown'), 300) where id = p_id;
  end if;
  return true;
end;
$$;
revoke execute on function public.email_done(text, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.email_done(text, uuid, boolean, text) to service_role;

-- Anything that did not go out (the function was busy, the email service was down) is tried again, up to 5 times over a couple of days.
create or replace function public.retry_pending_emails() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; u text; s text; n integer := 0;
begin
  select value into u from public.internal_config where key = 'push_url';
  select value into s from public.internal_config where key = 'push_secret';
  if u is null or s is null then return 0; end if;
  for r in
    select id from public.email_outbox
    where attempts < 5 and created_at > now() - interval '2 days'
      and ((status = 'pending' and created_at < now() - interval '3 minutes') or (status = 'sending' and claimed_at < now() - interval '10 minutes'))
    order by created_at limit 50
  loop
    begin
      perform net.http_post(url := u, body := jsonb_build_object('action', 'event_email', 'emailId', r.id),
                            headers := jsonb_build_object('Content-Type', 'application/json', 'x-noob-push', s));
      n := n + 1;
    exception when others then null;
    end;
  end loop;
  return n;
end;
$$;
revoke execute on function public.retry_pending_emails() from public, anon, authenticated;

-- ============================================================================================ 2. plans and receipts
-- What each NOOB Pro plan includes. Every plan includes everything in the plans below it.
create or replace function public.pro_plan_info(p_tier text) returns jsonb
language sql immutable set search_path = public as $$
  with t(ord, id, nm, own) as (values
    (1, 'starter',  'Starter',  jsonb_build_array('Pro badge on your profile', 'Ad-free browsing', 'Priority in search results')),
    (2, 'plus',     'Plus',     jsonb_build_array('Exclusive profile themes', 'Early access to new mini-games')),
    (3, 'pro',      'Pro',      jsonb_build_array('Higher upload limits for posts & reels', 'Custom accent colour')),
    (4, 'elite',    'Elite',    jsonb_build_array('Priority customer support', 'Exclusive Elite-only badge')),
    (5, 'ultimate', 'Ultimate', jsonb_build_array('Animated profile frame', 'Early access to every future feature'))
  )
  select jsonb_build_object(
    'name', cur.nm,
    'perks', (select coalesce(jsonb_agg(x.v order by x.ord, x.n), '[]'::jsonb)
              from (select t2.ord, e.n, e.v from t t2, jsonb_array_elements_text(t2.own) with ordinality as e(v, n) where t2.ord <= cur.ord) x),
    'common', jsonb_build_array('Unlimited posting (free accounts: 1 post or reel a day)', 'Live profile pictures', 'More Chess Blitz rounds (4 a week instead of 1)'))
  from t cur where cur.id = p_tier;
$$;

-- Starts (or restarts) a NOOB Pro plan for someone. Does NOT take any points: the caller has already done that.
create or replace function public.activate_pro(p_user uuid, p_tier text, p_billing text, p_auto_renew boolean) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare bill text := case when p_billing = 'yearly' then 'yearly' else 'monthly' end; ends timestamptz;
begin
  ends := now() + case when bill = 'yearly' then interval '365 days' else interval '30 days' end;
  update public.profiles set pro_tier = p_tier, pro_billing = bill, pro_auto_renew = coalesce(p_auto_renew, true), pro_renews_at = ends where id = p_user;
  return ends;
end;
$$;
revoke execute on function public.activate_pro(uuid, text, text, boolean) from public, anon, authenticated;

-- The "you are now on NOOB Pro" receipt. Amounts are written as text (already formatted with commas) so no big number is ever rounded.
create or replace function public.queue_pro_receipt(
  p_user uuid, p_tier text, p_billing text, p_list_price bigint, p_paid bigint, p_coupon text, p_discount numeric,
  p_wallet_after bigint, p_ends timestamptz, p_auto_renew boolean, p_method text, p_paid_by jsonb default null, p_own_share bigint default null
) returns void
language plpgsql security definer set search_path = public as $$
declare info jsonb := public.pro_plan_info(p_tier);
begin
  perform public.queue_email(p_user, 'pro_upgraded', jsonb_build_object(
    'planName', info->>'name', 'tier', p_tier, 'billing', p_billing, 'perks', info->'perks', 'common', info->'common',
    'listPrice', public.fmt_points(p_list_price), 'pricePaid', public.fmt_points(p_paid),
    'couponCode', p_coupon, 'discountPercent', p_discount,
    'walletAfter', public.fmt_points(p_wallet_after), 'startedAt', now(), 'renewsAt', p_ends, 'autoRenew', coalesce(p_auto_renew, true),
    'renewalPrice', public.fmt_points(public.pro_renewal_price(p_tier, p_billing)),
    'method', p_method, 'paidBy', p_paid_by, 'ownShare', case when p_own_share is null then null else public.fmt_points(p_own_share) end));
end;
$$;
revoke execute on function public.queue_pro_receipt(uuid, text, text, bigint, bigint, text, numeric, bigint, timestamptz, boolean, text, jsonb, bigint) from public, anon, authenticated;

-- Buying NOOB Pro yourself: same as before, plus the receipt.
create or replace function public.upgrade_pro(
  p_tier text, p_billing text default 'monthly', p_coupon text default null, p_auto_renew boolean default true
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); base bigint; list_price bigint; price bigint; bill text; cpn public.coupons; bal bigint; ends timestamptz; after_bal bigint;
begin
  base := public.pro_tier_price(p_tier);
  if base is null then raise exception 'Unknown Pro tier.'; end if;
  bill := case when p_billing = 'yearly' then 'yearly' else 'monthly' end;
  list_price := public.pro_renewal_price(p_tier, bill);
  price := list_price;
  cpn := public.find_eligible_coupon(p_coupon, me);
  if cpn.id is not null then price := greatest(0, round(price * (1 - cpn.discount_percent / 100))::bigint); end if;

  select noob_points into bal from public.profiles where id = me for update;
  if bal < price then
    raise exception 'Insufficient NOOB Points. You have % points, but % points are required.', public.fmt_points(bal), public.fmt_points(price);
  end if;

  perform public.apply_points(me, -price,
    case when cpn.id is not null then format('NOOB Pro (%s, %s) — %s%% off: %s', p_tier, bill, round(cpn.discount_percent), cpn.code)
         else format('NOOB Pro (%s, %s)', p_tier, bill) end);
  ends := public.activate_pro(me, p_tier, bill, p_auto_renew);
  perform public.consume_coupon(cpn.id, me);
  select noob_points into after_bal from public.profiles where id = me;
  perform public.queue_pro_receipt(me, p_tier, bill, list_price, price, cpn.code, cpn.discount_percent, after_bal, ends, p_auto_renew, 'wallet');
  return jsonb_build_object('success', true, 'user', public.get_my_user());
end;
$$;

-- The verification badge: same as before, plus the receipt.
create or replace function public.verify_account(
  p_password text, p_method text, p_coupon_code text default null, p_discount_code text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  me uuid := public.acting_user(); enc text; prof public.profiles; disc public.coupons; vcoupon public.coupons;
  price bigint; label text; bal bigint; after_bal bigint;
begin
  if coalesce(p_password, '') = '' then
    raise exception 'Password is required to authenticate verification request.';
  end if;
  select encrypted_password into enc from auth.users where id = me;
  if enc is null or crypt(p_password, enc) <> enc then
    raise exception 'Invalid password. Please check your credentials.' using errcode = '28P01';
  end if;
  select * into prof from public.profiles where id = me for update;
  if prof.is_verified then raise exception 'Your account is already verified.'; end if;

  disc := public.find_eligible_coupon(p_discount_code, me);

  if p_method = 'coupon' then
    select c.* into vcoupon from public.coupons c
    where c.active and c.type = 'verification' and upper(c.code) = upper(btrim(coalesce(p_coupon_code, '')))
      and c.target_user_id = me
    limit 1;
    if not found then raise exception 'Invalid or expired verification coupon code.'; end if;
    label := 'Verification coupon';
  elsif p_method in ('points_permanent', 'points_monthly') then
    price := case when p_method = 'points_permanent' then 10000000000000 else 5000000000 end;
    label := case when p_method = 'points_permanent' then 'Permanent verification badge' else 'Monthly verification badge' end;
    if disc.id is not null then
      price := greatest(0, round(price * (1 - disc.discount_percent / 100))::bigint);
    end if;
    bal := prof.noob_points;
    if bal < price then
      raise exception 'Insufficient NOOB Points. You have %, but % points are required for % verification.',
        public.fmt_points(bal), public.fmt_points(price),
        case when p_method = 'points_permanent' then 'permanent' else 'monthly' end;
    end if;
    perform public.apply_points(me, -price,
      case when disc.id is not null then format('%s (%s%% off: %s)', label, round(disc.discount_percent), disc.code) else label end);
    perform public.consume_coupon(disc.id, me);
  else
    raise exception 'Invalid verification method specified.';
  end if;

  if vcoupon.id is not null then update public.coupons set active = false where id = vcoupon.id; end if;
  update public.profiles set is_verified = true, verification_tier = 'premium' where id = me;
  select noob_points into after_bal from public.profiles where id = me;
  perform public.queue_email(me, 'verified_badge', jsonb_build_object(
    'label', label, 'method', p_method, 'permanent', p_method in ('coupon', 'points_permanent'),
    'pricePaid', case when price is null then null else public.fmt_points(price) end,
    'couponCode', coalesce(disc.code, null), 'discountPercent', disc.discount_percent,
    'walletAfter', public.fmt_points(after_bal), 'at', now()));
  return jsonb_build_object('success', true,
    'message', 'Congratulations! Your account @' || prof.username || ' is now officially verified with the blue checkmark!',
    'user', public.get_my_user());
end;
$$;

-- ==================================================================================== 3. renewals, warnings, ending
-- Runs hourly: re-bills anyone whose period ended (auto-renew on and enough points), or ends their Pro. Always tells them (app + email).
create or replace function public.run_pro_renewals() returns integer
language plpgsql security definer set search_path = public as $$
declare pr record; price bigint; admin_id uuid := public.noob_admin_id(); n int := 0; bill text; ends timestamptz; after_bal bigint; reason text;
begin
  for pr in
    select id, pro_tier, pro_billing, pro_auto_renew, noob_points from public.profiles
    where pro_tier is not null and pro_renews_at is not null and pro_renews_at <= now()
    order by id for update
  loop
    bill := coalesce(pr.pro_billing, 'monthly');
    price := public.pro_renewal_price(pr.pro_tier, bill);
    if pr.pro_auto_renew and pr.noob_points >= price then
      perform public.apply_points(pr.id, -price, format('NOOB Pro renewal (%s, %s)', pr.pro_tier, bill));
      ends := now() + case when bill = 'yearly' then interval '365 days' else interval '30 days' end;
      update public.profiles set pro_renews_at = ends where id = pr.id;
      select noob_points into after_bal from public.profiles where id = pr.id;
      perform public.notify_user(pr.id, 'admin_direct', admin_id,
        format('Your NOOB Pro (%s) subscription renewed automatically — %s points were deducted from your Wallet.', pr.pro_tier, public.fmt_points(price)),
        '✅ NOOB Pro Renewed');
      perform public.queue_pro_receipt(pr.id, pr.pro_tier, bill, price, price, null, null, after_bal, ends, true, 'renewal');
    else
      update public.profiles set pro_tier = null, pro_billing = null, pro_renews_at = null, pro_auto_renew = false where id = pr.id;
      reason := case when pr.pro_auto_renew then 'insufficient_points' else 'auto_renew_off' end;
      perform public.notify_user(pr.id, 'admin_direct', admin_id,
        case when pr.pro_auto_renew
          then format('Your NOOB Pro (%s) subscription couldn''t renew — your Wallet balance was below the %s points required, so Pro has been discontinued. You can resubscribe any time.', pr.pro_tier, public.fmt_points(price))
          else format('Your NOOB Pro (%s) subscription has ended since Reload Monthly was turned off. You can resubscribe any time.', pr.pro_tier) end,
        case when pr.pro_auto_renew then '⚠️ NOOB Pro Discontinued' else '👋 NOOB Pro Ended' end);
      perform public.queue_email(pr.id, 'pro_ended', jsonb_build_object(
        'planName', public.pro_plan_info(pr.pro_tier)->>'name', 'tier', pr.pro_tier, 'billing', bill, 'reason', reason,
        'price', public.fmt_points(price), 'balance', public.fmt_points(pr.noob_points),
        'shortfall', public.fmt_points(greatest(0, price - pr.noob_points)), 'endedAt', now()));
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.run_pro_renewals() from authenticated;

-- "Your NOOB Pro is about to end": 3 days before and again 1 day before, but ONLY when it will not renew by itself (reloading is off, or
-- the balance is below the price). Each warning goes out once per billing period, and carries the live balance and what is missing.
create table if not exists public.pro_notice_log (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  renews_at  timestamptz not null,
  stage      text not null check (stage in ('day3', 'day1')),
  created_at timestamptz not null default now(),
  primary key (user_id, renews_at, stage)
);
alter table public.pro_notice_log enable row level security;
revoke all on public.pro_notice_log from anon, authenticated;

create or replace function public.run_pro_expiry_warnings() returns integer
language plpgsql security definer set search_path = public as $$
declare pr record; price bigint; admin_id uuid := public.noob_admin_id(); n int := 0; bill text; stg text; added int; short bigint; days_left int;
begin
  for pr in
    select id, pro_tier, pro_billing, pro_auto_renew, pro_renews_at, noob_points from public.profiles
    where pro_tier is not null and pro_renews_at is not null and pro_renews_at > now() and pro_renews_at <= now() + interval '3 days'
    order by id
  loop
    bill := coalesce(pr.pro_billing, 'monthly');
    price := public.pro_renewal_price(pr.pro_tier, bill);
    continue when pr.pro_auto_renew and pr.noob_points >= price;          -- it will renew by itself: nothing to warn about
    stg := case when pr.pro_renews_at <= now() + interval '1 day' then 'day1' else 'day3' end;
    insert into public.pro_notice_log (user_id, renews_at, stage) values (pr.id, pr.pro_renews_at, stg) on conflict do nothing;
    get diagnostics added = row_count;
    continue when added = 0;                                                -- already warned at this stage for this period
    short := greatest(0, price - pr.noob_points);
    days_left := greatest(0, ceil(extract(epoch from (pr.pro_renews_at - now())) / 86400)::int);
    perform public.notify_user(pr.id, 'admin_direct', admin_id,
      case when pr.pro_auto_renew
        then format('Your NOOB Pro (%s) renews in %s day(s) but your Wallet has %s points and %s are needed. Add %s more points to keep Pro.', pr.pro_tier, days_left, public.fmt_points(pr.noob_points), public.fmt_points(price), public.fmt_points(short))
        else format('Your NOOB Pro (%s) ends in %s day(s) because Reload Monthly is off. Pay again to keep it.', pr.pro_tier, days_left) end,
      '⏳ NOOB Pro is about to end');
    perform public.queue_email(pr.id, 'pro_expiring', jsonb_build_object(
      'planName', public.pro_plan_info(pr.pro_tier)->>'name', 'tier', pr.pro_tier, 'billing', bill, 'endsAt', pr.pro_renews_at, 'daysLeft', days_left,
      'autoRenew', pr.pro_auto_renew, 'price', public.fmt_points(price), 'balance', public.fmt_points(pr.noob_points), 'shortfall', public.fmt_points(short)));
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.run_pro_expiry_warnings() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('noob-pro-warnings', '35 * * * *', $job$ select public.run_pro_expiry_warnings(); $job$);
    perform cron.schedule('noob-email-retry', '*/10 * * * *', $job$ select public.retry_pending_emails(); $job$);
  end if;
exception when others then
  raise notice 'Email / Pro warning jobs were not scheduled: %', sqlerrm;
end
$$;

-- ============================================================================================= 4. friends paying for Pro
alter table public.payment_requests drop constraint if exists payment_requests_purchase_type_check;
alter table public.payment_requests add constraint payment_requests_purchase_type_check check (purchase_type in ('live_lounge', 'pro', 'pro_topup'));
alter table public.payment_requests add column if not exists plan_tier text;
alter table public.payment_requests add column if not exists plan_billing text;
alter table public.payment_requests add column if not exists plan_price bigint;
alter table public.payment_requests add column if not exists requester_pays bigint not null default 0;
alter table public.payment_requests add column if not exists auto_renew boolean not null default true;

-- p_mode 'full'  : the friend pays the whole price.
-- p_mode 'topup' : the friend pays only the points the requester is missing; the requester's own points are taken at the same moment.
create or replace function public.request_pro_payment(p_payer uuid, p_tier text, p_billing text, p_mode text, p_auto_renew boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); bill text; price bigint; bal bigint; amt bigint; mine bigint; rname text; req_id uuid; v_expires timestamptz := now() + interval '24 hours'; info jsonb;
begin
  if p_payer is null or p_payer = me then raise exception 'Choose a friend to ask.'; end if;
  if not exists (select 1 from public.profiles where id = p_payer and not is_suspended) then raise exception 'That account was not found.'; end if;
  if exists (select 1 from public.blocks b where (b.blocker_id = me and b.blocked_id = p_payer) or (b.blocker_id = p_payer and b.blocked_id = me)) then
    raise exception 'You can''t ask this person.';
  end if;
  if public.pro_tier_price(p_tier) is null then raise exception 'Unknown Pro plan.'; end if;
  if p_mode not in ('full', 'topup') then raise exception 'Choose what to ask your friend to pay.'; end if;
  bill := case when p_billing = 'yearly' then 'yearly' else 'monthly' end;
  price := public.pro_renewal_price(p_tier, bill);
  info := public.pro_plan_info(p_tier);

  if exists (select 1 from public.profiles where id = me and pro_tier = p_tier and coalesce(pro_billing, 'monthly') = bill and pro_renews_at > now()) then
    raise exception 'You already have this plan.';
  end if;

  update public.payment_requests set status = 'expired', resolved_at = now()
  where requester_id = me and purchase_type in ('pro', 'pro_topup') and status = 'pending' and expires_at <= now();
  if exists (select 1 from public.payment_requests where requester_id = me and purchase_type in ('pro', 'pro_topup') and status = 'pending') then
    raise exception 'You already have a pending NOOB Pro request. Cancel it first to ask for something else.';
  end if;

  if p_mode = 'full' then
    amt := price; mine := 0;
  else
    select noob_points into bal from public.profiles where id = me;
    if bal >= price then raise exception 'You already have enough points for this plan — you can buy it yourself.'; end if;
    amt := price - bal; mine := bal;
  end if;

  insert into public.payment_requests (requester_id, payer_id, purchase_type, amount, expires_at, plan_tier, plan_billing, plan_price, requester_pays, auto_renew)
  values (me, p_payer, case when p_mode = 'full' then 'pro' else 'pro_topup' end, amt, v_expires, p_tier, bill, price, mine, coalesce(p_auto_renew, true))
  returning id into req_id;
  select username into rname from public.profiles where id = me;
  perform public.notify_user(p_payer, 'payment_request', me,
    case when p_mode = 'full'
      then '@' || rname || ' asked you to pay ' || public.fmt_points(amt) || ' NOOB Points for NOOB Pro ' || (info->>'name') || ' (' || bill || ').'
      else '@' || rname || ' asked you to pay the ' || public.fmt_points(amt) || ' NOOB Points they are missing for NOOB Pro ' || (info->>'name') || ' (' || bill || '). They add ' || public.fmt_points(mine) || ' of their own.' end
    || ' The request stays open for 24 hours.', '🙏 Payment request');
  return jsonb_build_object('success', true, 'requestId', req_id, 'expiresAt', v_expires, 'amount', amt, 'ownPart', mine);
end;
$$;
revoke execute on function public.request_pro_payment(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.request_pro_payment(uuid, text, text, text, boolean) to authenticated;

-- Requests I was asked to pay (what the Wallet's "Payment Requests" list shows), now with the plan details.
create or replace function public.my_payment_requests() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'purchaseType', r.purchase_type, 'amount', r.amount, 'createdAt', r.created_at, 'expiresAt', r.expires_at,
    'planTier', r.plan_tier, 'planBilling', r.plan_billing, 'planName', (public.pro_plan_info(r.plan_tier))->>'name',
    'planPrice', r.plan_price, 'requesterPays', r.requester_pays,
    'requester', jsonb_build_object('id', p.id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar)
  ) order by r.created_at desc), '[]'::jsonb)
  from public.payment_requests r join public.profiles p on p.id = r.requester_id
  where r.payer_id = auth.uid() and r.status = 'pending' and r.expires_at > now();
$$;
revoke execute on function public.my_payment_requests() from public, anon;
grant execute on function public.my_payment_requests() to authenticated;

-- Requests I sent and that are still waiting (so I can see them and cancel one).
create or replace function public.my_sent_payment_requests() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'purchaseType', r.purchase_type, 'amount', r.amount, 'createdAt', r.created_at, 'expiresAt', r.expires_at,
    'planTier', r.plan_tier, 'planBilling', r.plan_billing, 'planName', (public.pro_plan_info(r.plan_tier))->>'name',
    'planPrice', r.plan_price, 'requesterPays', r.requester_pays,
    'payer', jsonb_build_object('id', p.id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar)
  ) order by r.created_at desc), '[]'::jsonb)
  from public.payment_requests r join public.profiles p on p.id = r.payer_id
  where r.requester_id = auth.uid() and r.status = 'pending' and r.expires_at > now();
$$;
revoke execute on function public.my_sent_payment_requests() from public, anon;
grant execute on function public.my_sent_payment_requests() to authenticated;

create or replace function public.cancel_payment_request(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user();
begin
  update public.payment_requests set status = 'cancelled', resolved_at = now()
  where id = p_request_id and requester_id = me and status = 'pending';
  if not found then raise exception 'That request was not found.'; end if;
  return jsonb_build_object('success', true);
end;
$$;
revoke execute on function public.cancel_payment_request(uuid) from public, anon;
grant execute on function public.cancel_payment_request(uuid) to authenticated;

-- Approving / declining. Live Lounge works exactly as before; the new NOOB Pro requests start the plan when the friend pays.
create or replace function public.respond_payment_request(p_request_id uuid, p_approve boolean, p_password text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  me uuid := auth.uid(); r public.payment_requests; enc text; bal bigint; pname text; rname text; req_bal bigint; ends timestamptz;
  price_now bigint; after_bal bigint; label text; info jsonb;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into r from public.payment_requests where id = p_request_id and payer_id = me and status = 'pending' for update;
  if not found then raise exception 'That request was not found.'; end if;
  select username into pname from public.profiles where id = me;
  select username into rname from public.profiles where id = r.requester_id;
  label := case when r.purchase_type = 'live_lounge' then 'NOOB Live Lounge'
                else 'NOOB Pro ' || coalesce((public.pro_plan_info(r.plan_tier))->>'name', '') end;

  if now() > r.expires_at then
    update public.payment_requests set status = 'expired', resolved_at = now() where id = p_request_id;
    raise exception 'This payment request has expired.';
  end if;

  if not p_approve then
    update public.payment_requests set status = 'declined', resolved_at = now() where id = p_request_id;
    perform public.notify_user(r.requester_id, 'payment_request_declined', me,
      '@' || pname || ' declined your ' || label || ' payment request.', '💳 Payment request declined');
    return jsonb_build_object('success', true, 'approved', false);
  end if;

  if r.purchase_type in ('pro', 'pro_topup') then
    -- nothing is taken until every check has passed
    price_now := public.pro_renewal_price(r.plan_tier, r.plan_billing);
    if price_now is distinct from r.plan_price then
      raise exception 'The price of this plan changed. Ask your friend to send a new request.';
    end if;
    if exists (select 1 from public.profiles where id = r.requester_id and pro_tier = r.plan_tier
               and coalesce(pro_billing, 'monthly') = r.plan_billing and pro_renews_at > now()) then
      raise exception 'They already have this plan.';
    end if;
    if r.requester_pays > 0 then
      select noob_points into req_bal from public.profiles where id = r.requester_id for update;
      if coalesce(req_bal, 0) < r.requester_pays then
        raise exception 'Their own balance changed and no longer covers their part. Ask them to send a new request.';
      end if;
    end if;
  end if;

  if not public.is_master_admin() then
    select encrypted_password into enc from auth.users where id = me;
    if coalesce(p_password, '') = '' or enc is null or crypt(p_password, enc) <> enc then
      raise exception 'Incorrect password. Please re-enter your password to confirm this payment.' using errcode = '28P01';
    end if;
    select noob_points into bal from public.profiles where id = me;
    if bal < r.amount then raise exception 'Insufficient NOOB Points. You have % points.', public.fmt_points(bal); end if;
    perform public.apply_points(me, -r.amount, 'Paid for @' || rname || '''s ' || label);
  end if;

  if r.purchase_type = 'live_lounge' then
    insert into public.live_lounge_access (user_id, source) values (r.requester_id, 'gift') on conflict (user_id) do nothing;
  else
    if r.requester_pays > 0 then
      perform public.apply_points(r.requester_id, -r.requester_pays, format('NOOB Pro (%s, %s) — your part, with @%s', r.plan_tier, r.plan_billing, pname));
    end if;
    ends := public.activate_pro(r.requester_id, r.plan_tier, r.plan_billing, r.auto_renew);
    select noob_points into after_bal from public.profiles where id = r.requester_id;
    info := public.pro_plan_info(r.plan_tier);
    perform public.queue_pro_receipt(r.requester_id, r.plan_tier, r.plan_billing, r.plan_price, r.plan_price, null, null, after_bal, ends, r.auto_renew,
      case when r.purchase_type = 'pro' then 'friend' else 'friend_topup' end,
      jsonb_build_object('username', pname, 'amount', public.fmt_points(r.amount)), r.requester_pays);
    perform public.queue_email(me, 'pro_gift_receipt', jsonb_build_object(
      'friend', rname, 'planName', info->>'name', 'billing', r.plan_billing, 'amount', public.fmt_points(r.amount),
      'planPrice', public.fmt_points(r.plan_price), 'partial', r.purchase_type = 'pro_topup', 'at', now(),
      'walletAfter', public.fmt_points((select noob_points from public.profiles where id = me))));
  end if;

  update public.payment_requests set status = 'approved', resolved_at = now() where id = p_request_id;
  perform public.notify_user(r.requester_id, 'payment_request_approved', me,
    case when r.purchase_type = 'live_lounge' then '@' || pname || ' paid for your NOOB Live Lounge — it''s active now!'
         else '@' || pname || ' paid ' || public.fmt_points(r.amount) || ' NOOB Points — your NOOB Pro ' || (info->>'name') || ' is active now!' end,
    '🎉 Payment approved');
  return jsonb_build_object('success', true, 'approved', true);
end;
$$;
revoke execute on function public.respond_payment_request(uuid, boolean, text) from public, anon;
grant execute on function public.respond_payment_request(uuid, boolean, text) to authenticated;
