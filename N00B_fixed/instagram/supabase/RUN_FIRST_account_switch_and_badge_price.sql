create or replace function public.verify_badge_price(p_method text) returns bigint
language sql immutable as $$
  select case p_method when 'points_permanent' then 500000000::bigint when 'points_monthly' then 50000000::bigint else null end;
$$;

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
    price := public.verify_badge_price(p_method);
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

create or replace function public.verify_badge_prices() returns jsonb
language sql stable as $$
  select jsonb_build_object('permanent', public.verify_badge_price('points_permanent'), 'monthly', public.verify_badge_price('points_monthly'));
$$;

create or replace function public.link_email_key(p text) returns text
language sql immutable as $$
  select case
    when position('@' in coalesce(p, '')) = 0 then ''
    when lower(split_part(btrim(p), '@', 2)) in ('gmail.com', 'googlemail.com')
      then replace(split_part(lower(split_part(btrim(p), '@', 1)), '+', 1), '.', '') || '@gmail.com'
    else split_part(lower(split_part(btrim(p), '@', 1)), '+', 1) || '@' || lower(split_part(btrim(p), '@', 2))
  end;
$$;

create or replace function public.my_linked_accounts() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.acting_user(); em text; ph text;
begin
  select public.link_email_key(pp.email),
         case when length(regexp_replace(coalesce(pp.mobile_number, ''), '\D', '', 'g')) >= 7
              then right(regexp_replace(coalesce(pp.mobile_number, ''), '\D', '', 'g'), 10) else '' end
    into em, ph
  from public.profile_private pp where pp.user_id = me;
  if coalesce(em, '') = '' and coalesce(ph, '') = '' then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar, 'isVerified', p.is_verified) order by p.username)
    from public.profiles p join public.profile_private pp on pp.user_id = p.id
    where p.id <> me and not p.is_suspended and not p.is_ai
      and ((em <> '' and public.link_email_key(pp.email) = em)
        or (ph <> '' and length(regexp_replace(coalesce(pp.mobile_number, ''), '\D', '', 'g')) >= 7
            and right(regexp_replace(coalesce(pp.mobile_number, ''), '\D', '', 'g'), 10) = ph))
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.link_email_key(text) from public, anon;
grant execute on function public.link_email_key(text) to authenticated;
revoke all on function public.verify_badge_price(text) from public, anon;
grant execute on function public.verify_badge_price(text) to authenticated;
revoke all on function public.verify_badge_prices() from public, anon;
grant execute on function public.verify_badge_prices() to authenticated;
revoke all on function public.my_linked_accounts() from public, anon;
grant execute on function public.my_linked_accounts() to authenticated;
