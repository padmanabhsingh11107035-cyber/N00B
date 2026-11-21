-- The main NOOB administrator can start (or end) a NOOB Pro subscription for any account, like the verified badge: no points are taken, the person is told by notification.
-- p_tier: starter | plus | pro | elite | ultimate. p_days: how long it lasts (1-3650). p_tier null = end the subscription now.
create or replace function public.admin_set_pro(p_target uuid, p_tier text default null, p_days integer default 30) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.profiles; admin_id uuid; ends timestamptz; info jsonb; nm text; d integer := greatest(1, least(coalesce(p_days, 30), 3650));
begin
  perform public.require_master_admin('Only the main NOOB administrator can give or end a NOOB Pro subscription.');
  select * into t from public.profiles where id = p_target for update;
  if not found then raise exception 'Account not found.'; end if;
  admin_id := public.noob_admin_id();

  if p_tier is null or p_tier = '' then
    if t.pro_tier is null then raise exception '@% has no NOOB Pro subscription.', t.username; end if;
    update public.profiles set pro_tier = null, pro_billing = null, pro_renews_at = null, pro_auto_renew = false where id = t.id;
    perform public.notify_user(t.id, 'admin_direct', admin_id, 'The NOOB team has ended your NOOB Pro subscription.', 'NOOB Pro ended');
    perform public.log_admin_action('pro_removed', t.id, jsonb_build_object('username', t.username));
    return jsonb_build_object('success', true, 'proTier', null, 'message', 'The NOOB Pro subscription of @' || t.username || ' was ended.');
  end if;

  info := public.pro_plan_info(p_tier);
  if info is null then raise exception 'Unknown Pro plan.'; end if;
  nm := info->>'name';
  ends := now() + make_interval(days => d);
  update public.profiles set pro_tier = p_tier, pro_billing = 'monthly', pro_auto_renew = false, pro_renews_at = ends where id = t.id;
  perform public.notify_user(t.id, 'admin_direct', admin_id,
    'The NOOB team has given you NOOB ' || nm || ' for ' || d || ' days, free. Enjoy!', '⭐ You have NOOB ' || nm || '!');
  perform public.log_admin_action('pro_granted', t.id, jsonb_build_object('username', t.username, 'tier', p_tier, 'days', d));
  return jsonb_build_object('success', true, 'proTier', p_tier, 'proRenewsAt', ends, 'message', '@' || t.username || ' now has NOOB ' || nm || ' for ' || d || ' days (no points taken, no automatic renewal).');
end;
$$;
revoke execute on function public.admin_set_pro(uuid, text, integer) from public, anon;
grant execute on function public.admin_set_pro(uuid, text, integer) to authenticated;
