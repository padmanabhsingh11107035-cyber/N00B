-- Emails with every detail: who the account is (name, User ID, account ID, address), where the money or the prize came from (a friend paid: their
-- name and User ID, the payment request; a NOOB Draw win: which spin, free or paid, what it cost, the plan you had before), and who granted a
-- verified tick. The details are looked up when the email is sent (email_claim), so every email, old or new, gets them.

-- ============================================================================================ 1. what the email function is handed
create or replace function public.email_claim(p_secret text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare expected text; e public.email_outbox; addr text; v_name text; v_user text; rel_user text; rel jsonb := null; rq record;
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

  -- the other person in this email (the friend who paid, the friend that was paid for, the admin who verified): name, User ID and account ID
  rel_user := nullif(lower(btrim(coalesce(e.payload->'paidBy'->>'username', e.payload->>'friend', e.payload->'by'->>'username', ''))), '');
  if rel_user is not null then
    select jsonb_build_object('id', p.id, 'username', p.username, 'name', coalesce(nullif(p.display_name, ''), p.username))
      into rel from public.profiles p where lower(p.username) = rel_user;
    if rel is not null and e.kind = 'pro_upgraded' and e.payload->'paidBy' is not null then
      select r.id, r.created_at into rq from public.payment_requests r
      where r.requester_id = e.user_id and r.payer_id = (rel->>'id')::uuid order by r.created_at desc limit 1;
      if found then rel := rel || jsonb_build_object('requestId', rq.id, 'requestedAt', rq.created_at); end if;
    end if;
  end if;

  return jsonb_build_object('claimed', true, 'id', e.id, 'kind', e.kind, 'payload', e.payload, 'email', addr, 'name', v_name, 'username', v_user,
                            'userId', e.user_id, 'related', rel);
end;
$$;
revoke execute on function public.email_claim(text, uuid) from public, anon, authenticated;
grant execute on function public.email_claim(text, uuid) to service_role;

-- ============================================================================================ 2. verified by the NOOB team: who granted it
create or replace function public.admin_set_verification(p_target uuid, p_verified boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.profiles; admin_id uuid; admin_user text;
begin
  perform public.require_master_admin('Only the main NOOB administrator can verify accounts.');
  select * into t from public.profiles where id = p_target for update;
  if not found then raise exception 'Account not found.'; end if;
  admin_id := public.noob_admin_id();
  select username into admin_user from public.profiles where id = admin_id;

  if coalesce(p_verified, true) then
    if t.is_verified then raise exception '@% is already verified.', t.username; end if;
    update public.profiles set is_verified = true, verification_tier = 'premium' where id = t.id;
    perform public.notify_user(t.id, 'admin_direct', admin_id,
      'The NOOB team has verified your account. The verified badge now shows next to your name everywhere in NOOB.', '✅ You are verified!');
    perform public.queue_email(t.id, 'verified_by_admin', jsonb_build_object('username', t.username, 'at', now(), 'by', jsonb_build_object('username', admin_user)));
    perform public.log_admin_action('verification_granted', t.id, jsonb_build_object('username', t.username));
    return jsonb_build_object('success', true, 'verified', true, 'message', '@' || t.username || ' is verified now. They have been told by notification and e-mail.');
  end if;

  if not t.is_verified then raise exception '@% is not verified.', t.username; end if;
  update public.profiles set is_verified = false, verification_tier = null where id = t.id;
  perform public.notify_user(t.id, 'admin_direct', admin_id, 'The NOOB team has removed the verified badge from your account.', 'Verification removed');
  perform public.log_admin_action('verification_removed', t.id, jsonb_build_object('username', t.username));
  return jsonb_build_object('success', true, 'verified', false, 'message', 'The verified badge was removed from @' || t.username || '.');
end;
$$;
revoke execute on function public.admin_set_verification(uuid, boolean) from public, anon;
grant execute on function public.admin_set_verification(uuid, boolean) to authenticated;

-- ============================================================================================ 3. NOOB Draw wins: free or paid, what it cost, what the plan was before
drop function if exists public.noob_draw_mail(uuid, public.noob_draw_prizes, text, text, timestamptz);
create or replace function public.noob_draw_mail(
  p_user uuid, p_prize public.noob_draw_prizes, p_pack_name text, p_message text, p_ends timestamptz default null,
  p_paid boolean default false, p_cost bigint default 0, p_prev_tier text default null, p_prev_ends timestamptz default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.queue_email(p_user, 'draw_prize', jsonb_build_object(
    'prize', p_prize.kind, 'label', p_prize.label, 'subtitle', p_prize.subtitle, 'tier', p_prize.tier, 'days', p_prize.days,
    'packName', p_pack_name, 'message', p_message, 'endsAt', p_ends, 'at', now(),
    'paid', coalesce(p_paid, false), 'cost', public.fmt_points(coalesce(p_cost, 0)), 'rarity', p_prize.rarity,
    'spinNo', (select count(*) + 1 from public.noob_draw_spins where user_id = p_user),
    'walletAfter', public.fmt_points((select noob_points from public.profiles where id = p_user)),
    'previousTier', p_prev_tier, 'previousEndsAt', p_prev_ends));
end;
$$;
revoke execute on function public.noob_draw_mail(uuid, public.noob_draw_prizes, text, text, timestamptz, boolean, bigint, text, timestamptz) from public, anon, authenticated;

drop function if exists public.noob_draw_grant(uuid, public.noob_draw_prizes, text);
create or replace function public.noob_draw_grant(p_user uuid, p_prize public.noob_draw_prizes, p_pack_name text, p_paid boolean default false, p_cost bigint default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cur public.profiles; ends timestamptz; msg text; pname text; added integer := 0; nm text; fb bigint := coalesce(p_prize.fallback_points, 0);
  reason text := format('NOOB Draw — %s: %s', p_pack_name, p_prize.label);
  ends_txt text;
begin
  if p_prize.kind = 'points' then
    perform public.apply_points(p_user, p_prize.amount, reason);
    return jsonb_build_object('applied', 'ok', 'message', format('%s NOOB Points were added to your wallet.', public.fmt_points(p_prize.amount)));
  end if;

  if p_prize.kind = 'pro' then
    select * into cur from public.profiles where id = p_user for update;
    if cur.pro_tier is not null and cur.pro_renews_at is null then
      null;
    elsif cur.pro_tier is null or cur.pro_renews_at <= now() then
      ends := now() + make_interval(days => p_prize.days);
      update public.profiles set pro_tier = p_prize.tier, pro_billing = 'monthly', pro_auto_renew = false, pro_renews_at = ends where id = p_user;
      ends_txt := to_char(ends at time zone 'Asia/Kolkata', 'DD Mon YYYY');
      msg := format('Your NOOB Pro plan is active until %s. It does not renew by itself.', ends_txt);
      perform public.noob_draw_mail(p_user, p_prize, p_pack_name, msg, ends, p_paid, p_cost, null, null);
      return jsonb_build_object('applied', 'ok', 'endsAt', ends, 'message', msg);
    elsif public.noob_draw_rank(p_prize.tier) <= public.noob_draw_rank(cur.pro_tier) then
      ends := cur.pro_renews_at + make_interval(days => p_prize.days);
      update public.profiles set pro_renews_at = ends where id = p_user;
      ends_txt := to_char(ends at time zone 'Asia/Kolkata', 'DD Mon YYYY');
      msg := format('%s days were added to your NOOB Pro plan. It now runs until %s.', p_prize.days, ends_txt);
      perform public.noob_draw_mail(p_user, p_prize, p_pack_name, msg, ends, p_paid, p_cost, cur.pro_tier, cur.pro_renews_at);
      return jsonb_build_object('applied', 'ok', 'endsAt', ends, 'message', msg);
    else
      ends := cur.pro_renews_at + make_interval(days => p_prize.days);
      update public.profiles set pro_tier = p_prize.tier, pro_auto_renew = false, pro_renews_at = ends where id = p_user;
      ends_txt := to_char(ends at time zone 'Asia/Kolkata', 'DD Mon YYYY');
      msg := format('You moved up to NOOB Pro %s until %s. Automatic renewal is switched off, so turn it on again if you want to keep paying.', initcap(p_prize.tier), ends_txt);
      perform public.noob_draw_mail(p_user, p_prize, p_pack_name, msg, ends, p_paid, p_cost, cur.pro_tier, cur.pro_renews_at);
      return jsonb_build_object('applied', 'ok', 'endsAt', ends, 'message', msg);
    end if;

  elsif p_prize.kind = 'verified' then
    select * into cur from public.profiles where id = p_user for update;
    if not cur.is_verified then
      update public.profiles set is_verified = true, verification_tier = 'premium' where id = p_user;
      perform public.notify_user(p_user, 'admin_direct', public.noob_admin_id(),
        'You won the Verified Tick in NOOB Draw. The blue tick now shows next to your name everywhere in NOOB.', '✅ You are verified!');
      msg := 'The blue verified tick now shows next to your name everywhere in NOOB.';
      perform public.noob_draw_mail(p_user, p_prize, p_pack_name, msg, null, p_paid, p_cost, null, null);
      return jsonb_build_object('applied', 'ok', 'message', msg);
    end if;

  elsif p_prize.kind = 'live_avatar' then
    select name into pname from public.live_avatar_presets where id = p_prize.ref;
    if pname is not null and not exists (select 1 from public.live_avatar_unlocks where user_id = p_user and preset_id = p_prize.ref) then
      insert into public.live_avatar_unlocks (user_id, preset_id) values (p_user, p_prize.ref);
      return jsonb_build_object('applied', 'ok', 'presetId', p_prize.ref,
        'message', format('%s is yours for good, even without NOOB Pro. Wear it as your profile picture any time.', pname));
    end if;

  elsif p_prize.kind = 'stickers' then
    foreach nm in array string_to_array(coalesce(p_prize.ref, ''), ',') loop
      nm := btrim(nm);
      continue when nm = '';
      if not exists (select 1 from public.custom_stickers where user_id = p_user and object_key = '/draw-stickers/' || nm || '.svg') then
        insert into public.custom_stickers (user_id, object_key, title) values (p_user, '/draw-stickers/' || nm || '.svg', 'NOOB Draw ' || initcap(replace(nm, '-', ' ')));
        added := added + 1;
      end if;
    end loop;
    if added > 0 then
      return jsonb_build_object('applied', 'ok', 'message', format('%s animated stickers were added to My stickers. Open a chat and tap the sticker button to send them.', added));
    end if;
  end if;

  if fb > 0 then
    perform public.apply_points(p_user, fb, reason || ' (already owned, paid in points)');
  end if;
  return jsonb_build_object('applied', 'fallback', 'fallbackPoints', fb,
    'message', format('You already have this, so %s NOOB Points were added to your wallet instead.', public.fmt_points(fb)));
end;
$$;
revoke execute on function public.noob_draw_grant(uuid, public.noob_draw_prizes, text, boolean, bigint) from public, anon, authenticated;

create or replace function public.noob_draw_spin(p_pack text, p_paid boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.acting_user(); pk public.noob_draw_packs; fw jsonb; per text; bal bigint; prize public.noob_draw_prizes; res jsonb;
  is_paid boolean := coalesce(p_paid, false); cost_pts bigint := 0;
begin
  select * into pk from public.noob_draw_packs where id = p_pack;
  if not found then raise exception 'This spin does not exist.'; end if;

  perform 1 from public.profiles where id = me for update;
  fw := public.noob_draw_free_window(me, p_pack);
  per := fw->>'period';

  if is_paid then
    if (fw->>'available')::boolean then
      return jsonb_build_object('success', false, 'freeReady', true, 'error', format('Your free %s is ready. Use it first: it costs nothing.', pk.name));
    end if;
    select noob_points into bal from public.profiles where id = me;
    if coalesce(bal, 0) < pk.spin_price then
      return jsonb_build_object('success', false, 'needPoints', pk.spin_price,
        'error', format('This spin costs %s NOOB Points and you have %s.', public.fmt_points(pk.spin_price), public.fmt_points(coalesce(bal, 0))));
    end if;
    perform public.apply_points(me, -pk.spin_price, format('NOOB Draw — %s: paid spin', pk.name));
    cost_pts := pk.spin_price;
  elsif not (fw->>'available')::boolean then
    return jsonb_build_object('success', false, 'availableAt', fw->'availableAt', 'price', pk.spin_price,
      'error', format('You already used the free %s this %s.', pk.name, per));
  end if;

  prize := public.noob_draw_pick(p_pack, public.noob_draw_random());
  res := public.noob_draw_grant(me, prize, pk.name, is_paid, cost_pts);
  insert into public.noob_draw_spins (user_id, pack, prize_id, kind, label, rarity, result, paid, cost)
  values (me, p_pack, prize.id, prize.kind, prize.label, prize.rarity, res, is_paid, cost_pts);
  fw := public.noob_draw_free_window(me, p_pack);

  return jsonb_build_object('success', true, 'availableAt', fw->'availableAt', 'paid', is_paid, 'cost', cost_pts,
    'prize', jsonb_build_object('id', prize.id, 'kind', prize.kind, 'label', prize.label, 'subtitle', prize.subtitle, 'rarity', prize.rarity,
                                'amount', prize.amount, 'ref', prize.ref) || res,
    'user', public.get_my_user());
end;
$$;
revoke execute on function public.noob_draw_spin(text, boolean) from public, anon;
grant execute on function public.noob_draw_spin(text, boolean) to authenticated;
