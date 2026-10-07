-- A third Food Stall switch: "Coming Soon" — shown as visible but with its menu/price/ordering
-- details hidden behind a plain "Coming Soon" badge (no tap target at all), distinct from
-- food_stall_visible (hidden completely) and food_stall_enabled (visible+browsable, checkout paused).

alter table public.app_settings add column if not exists food_stall_coming_soon boolean not null default false;

create or replace function public.get_app_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(settings, '{}'::jsonb) || jsonb_build_object(
    'storeEnabled', store_enabled, 'storeDeliveryFee', store_delivery_fee, 'storeUpiId', coalesce(store_upi_id, ''),
    'foodStallVisible', food_stall_visible, 'foodStallEnabled', food_stall_enabled, 'foodStallComingSoon', food_stall_coming_soon
  )
  from public.app_settings where id = 1;
$$;

create or replace function public.set_food_stall_settings(p_visible boolean default null, p_enabled boolean default null, p_coming_soon boolean default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); who text;
begin
  if me is null then raise exception 'Please log in.'; end if;
  if not public.is_master_admin() then
    select username into who from public.profiles where id = me;
    raise exception 'You are signed in as @%, which is not the main NOOB administrator account. Log in as the NOOB account to change the Food Stall settings.', coalesce(who, 'unknown');
  end if;

  update public.app_settings
     set food_stall_visible     = coalesce(p_visible, food_stall_visible),
         food_stall_enabled     = coalesce(p_enabled, food_stall_enabled),
         food_stall_coming_soon = coalesce(p_coming_soon, food_stall_coming_soon),
         updated_at             = now()
   where id = 1;

  perform public.log_admin_action('food_stall_settings_changed', null, jsonb_build_object('visible', p_visible, 'ordersOn', p_enabled, 'comingSoon', p_coming_soon));
  return public.get_app_settings();
end;
$$;
revoke execute on function public.set_food_stall_settings(boolean, boolean, boolean) from public, anon;
grant execute on function public.set_food_stall_settings(boolean, boolean, boolean) to authenticated, service_role;
