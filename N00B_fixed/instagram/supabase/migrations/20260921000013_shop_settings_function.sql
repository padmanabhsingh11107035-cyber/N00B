-- NOOB — Supabase phase 10: changing the SHOP SETTINGS (the "Orders ON/OFF" switch and the delivery charge) through a function.
-- Until now the app changed them by writing straight into the settings table, and the database silently changed NOTHING for anyone who
-- was not marked admin — so the switch looked broken with no explanation (for example when a different account was logged in
-- in another tab). This function does the same job for the main administrator (the account marked admin, or the NOOB account) and
-- for everyone else it says plainly which account is signed in and why it was refused. Every change is written to the admin
-- activity log. Safe to run more than once. Nothing else is changed.

create or replace function public.set_shop_settings(p_enabled boolean default null, p_fee numeric default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  who text;
begin
  if me is null then raise exception 'Please log in.'; end if;
  if not public.is_master_admin() then
    select username into who from public.profiles where id = me;
    raise exception 'You are signed in as @%, which is not the main NOOB administrator account. Log in as the NOOB account to change the shop settings.', coalesce(who, 'unknown');
  end if;
  if p_fee is not null and (p_fee < 0 or p_fee > 100000) then raise exception 'The delivery charge must be between 0 and 100000.'; end if;

  update public.app_settings
     set store_enabled      = coalesce(p_enabled, store_enabled),
         store_delivery_fee = coalesce(p_fee, store_delivery_fee),
         updated_at         = now()
   where id = 1;

  perform public.log_admin_action('shop_settings_changed', null, jsonb_build_object('ordersOn', p_enabled, 'deliveryCharge', p_fee));
  return public.get_app_settings();
end;
$$;

revoke execute on function public.set_shop_settings(boolean, numeric) from public, anon;
grant execute on function public.set_shop_settings(boolean, numeric) to authenticated, service_role;
