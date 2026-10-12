-- NOOB Draw: an email only for the grand prizes. Winning the verified tick or a NOOB Pro plan sends the winner an email; points, stickers and live
-- profile pictures do not (they show in the app and in the wallet history). A prize that could not be given and was paid in points instead
-- ("you already have this") sends nothing either. An email that can not be sent never stops the prize: queue_email never raises.

create or replace function public.noob_draw_mail(p_user uuid, p_prize public.noob_draw_prizes, p_pack_name text, p_message text, p_ends timestamptz default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.queue_email(p_user, 'draw_prize', jsonb_build_object(
    'prize', p_prize.kind, 'label', p_prize.label, 'subtitle', p_prize.subtitle, 'tier', p_prize.tier, 'days', p_prize.days,
    'packName', p_pack_name, 'message', p_message, 'endsAt', p_ends, 'at', now()));
end;
$$;
revoke execute on function public.noob_draw_mail(uuid, public.noob_draw_prizes, text, text, timestamptz) from public, anon, authenticated;

create or replace function public.noob_draw_grant(p_user uuid, p_prize public.noob_draw_prizes, p_pack_name text) returns jsonb
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
      perform public.noob_draw_mail(p_user, p_prize, p_pack_name, msg, ends);
      return jsonb_build_object('applied', 'ok', 'endsAt', ends, 'message', msg);
    elsif public.noob_draw_rank(p_prize.tier) <= public.noob_draw_rank(cur.pro_tier) then
      ends := cur.pro_renews_at + make_interval(days => p_prize.days);
      update public.profiles set pro_renews_at = ends where id = p_user;
      ends_txt := to_char(ends at time zone 'Asia/Kolkata', 'DD Mon YYYY');
      msg := format('%s days were added to your NOOB Pro plan. It now runs until %s.', p_prize.days, ends_txt);
      perform public.noob_draw_mail(p_user, p_prize, p_pack_name, msg, ends);
      return jsonb_build_object('applied', 'ok', 'endsAt', ends, 'message', msg);
    else
      ends := cur.pro_renews_at + make_interval(days => p_prize.days);
      update public.profiles set pro_tier = p_prize.tier, pro_auto_renew = false, pro_renews_at = ends where id = p_user;
      ends_txt := to_char(ends at time zone 'Asia/Kolkata', 'DD Mon YYYY');
      msg := format('You moved up to NOOB Pro %s until %s. Automatic renewal is switched off, so turn it on again if you want to keep paying.', initcap(p_prize.tier), ends_txt);
      perform public.noob_draw_mail(p_user, p_prize, p_pack_name, msg, ends);
      return jsonb_build_object('applied', 'ok', 'endsAt', ends, 'message', msg);
    end if;

  elsif p_prize.kind = 'verified' then
    select * into cur from public.profiles where id = p_user for update;
    if not cur.is_verified then
      update public.profiles set is_verified = true, verification_tier = 'premium' where id = p_user;
      perform public.notify_user(p_user, 'admin_direct', public.noob_admin_id(),
        'You won the Verified Tick in NOOB Draw. The blue tick now shows next to your name everywhere in NOOB.', '✅ You are verified!');
      msg := 'The blue verified tick now shows next to your name everywhere in NOOB.';
      perform public.noob_draw_mail(p_user, p_prize, p_pack_name, msg);
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
