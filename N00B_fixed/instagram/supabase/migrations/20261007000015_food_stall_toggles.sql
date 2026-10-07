-- Food Stall gets its own two switches, independent of the general Shop NOOB "Accept orders" flag
-- (which the Food Stall wrongly shared until now — turning one off would have silently turned the
-- other off too):
--   food_stall_visible — whether the Food Stall banner/menu entry even shows up for anyone. Starts
--                        OFF: nothing changes for existing users until the admin explicitly turns it on.
--   food_stall_enabled — whether Food Stall checkout itself is accepting orders (separate from the
--                        general Shop's store_enabled). Also starts OFF for the same reason.

alter table public.app_settings add column if not exists food_stall_visible boolean not null default false;
alter table public.app_settings add column if not exists food_stall_enabled boolean not null default false;

create or replace function public.get_app_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(settings, '{}'::jsonb) || jsonb_build_object(
    'storeEnabled', store_enabled, 'storeDeliveryFee', store_delivery_fee, 'storeUpiId', coalesce(store_upi_id, ''),
    'foodStallVisible', food_stall_visible, 'foodStallEnabled', food_stall_enabled
  )
  from public.app_settings where id = 1;
$$;

create or replace function public.set_food_stall_settings(p_visible boolean default null, p_enabled boolean default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); who text;
begin
  if me is null then raise exception 'Please log in.'; end if;
  if not public.is_master_admin() then
    select username into who from public.profiles where id = me;
    raise exception 'You are signed in as @%, which is not the main NOOB administrator account. Log in as the NOOB account to change the Food Stall settings.', coalesce(who, 'unknown');
  end if;

  update public.app_settings
     set food_stall_visible = coalesce(p_visible, food_stall_visible),
         food_stall_enabled = coalesce(p_enabled, food_stall_enabled),
         updated_at         = now()
   where id = 1;

  perform public.log_admin_action('food_stall_settings_changed', null, jsonb_build_object('visible', p_visible, 'ordersOn', p_enabled));
  return public.get_app_settings();
end;
$$;
revoke execute on function public.set_food_stall_settings(boolean, boolean) from public, anon;
grant execute on function public.set_food_stall_settings(boolean, boolean) to authenticated, service_role;

-- An order gates on food_stall_enabled when every item in it is a Food Stall product, and on the
-- general store_enabled otherwise — the two carts (Shop NOOB vs the Food Stall) never mix items in
-- practice, so this cleanly tells which switch should apply without needing a column on the order
-- itself.
create or replace function public.place_store_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.acting_user(); it record; pr public.store_products; var jsonb; have integer;
  enabled boolean; is_food boolean := false;
  method text := coalesce(p->>'deliveryMethod', ''); pay text; contact jsonb; fee numeric := 0; sum_total numeric := 0; o public.store_orders; oid uuid := gen_random_uuid();
  lines integer := 0; label text; title text; admin_id uuid; note_text text := btrim(coalesce(p->>'note', ''));
begin
  begin
    select not exists (
      select 1 from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) x
      left join public.store_products sp on sp.id = (x->>'productId')::uuid
      where sp.category is distinct from 'food_stall'
    ) and jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) > 0 into is_food;
  exception when others then
    is_food := false;
  end;

  select case when is_food then food_stall_enabled else store_enabled end,
         case when method = 'delivery' then store_delivery_fee else 0 end
    into enabled, fee
    from public.app_settings where id = 1;
  if enabled is false then
    raise exception '%', case when is_food then 'The Food Stall is not accepting orders right now.' else 'Ordering is currently paused by NOOB.' end;
  end if;
  if method not in ('pickup', 'delivery') then raise exception 'Choose pickup or delivery.'; end if;
  pay := case when lower(coalesce(p->>'paymentMethod', 'cash')) = 'upi' then 'upi' else 'cash' end;
  if pay = 'upi' and coalesce((select store_upi_id from public.app_settings where id = 1), '') = '' then
    raise exception 'UPI is not set up yet — please choose Cash instead.';
  end if;
  if length(note_text) > 300 then raise exception 'The order note can be at most 300 characters.'; end if;
  if coalesce(jsonb_typeof(p->'items'), '') <> 'array' or jsonb_array_length(p->'items') = 0 then raise exception 'Your cart is empty.'; end if;
  if jsonb_array_length(p->'items') > 40 then raise exception 'Too many items in one order.'; end if;
  if exists (select 1 from jsonb_array_elements(p->'items') x
             where coalesce(x->>'productId', '') !~* '^[0-9a-f-]{36}$'
                or case when coalesce(x->>'quantity', '') ~ '^[0-9]{1,3}$' then (x->>'quantity')::int else 0 end not between 1 and 100) then
    raise exception 'Your cart has an item that is not valid.';
  end if;
  if (select count(*) from public.store_orders where user_id = me and status in ('placed', 'confirmed', 'ready')) >= 5 then
    raise exception 'You already have 5 open orders. Please wait for one to be completed, or cancel one first.';
  end if;
  contact := public.clean_shop_contact(p->'contact', true, method = 'delivery');

  insert into public.store_orders (id, user_id, delivery_method, payment_method, contact, subtotal, delivery_fee, total, note, status_history)
  values (oid, me, method, pay, contact, 0, 0, 0, note_text,
          jsonb_build_array(jsonb_build_object('status', 'placed', 'at', now(), 'by', 'customer')))
  returning * into o;

  for it in
    -- locked in product order (so two orders can never wait on each other), shown in the order they were in the cart
    select (x->>'productId')::uuid as pid, nullif(x->>'variantKey', '') as vk, sum((x->>'quantity')::int)::int as qty, min(ord)::int as cart_pos
    from jsonb_array_elements(p->'items') with ordinality as t(x, ord) group by 1, 2 order by 1, 2
  loop
    select * into pr from public.store_products where id = it.pid for update;
    if not found then raise exception 'One of the products in your cart is no longer available.'; end if;
    title := public.store_product_title(pr);
    label := null;
    if jsonb_array_length(pr.variants) > 0 then
      if it.vk is null then raise exception 'Choose an option for "%".', title; end if;
      select v into var from jsonb_array_elements(pr.variants) v where v->>'key' = it.vk;
      if var is null then raise exception 'That option of "%" is no longer available.', title; end if;
      label := (select string_agg(var->'options'->>(op->>'name'), ' / ' order by ord)
                from jsonb_array_elements(pr.options) with ordinality as t(op, ord));
      have := (var->>'stock')::integer;
      if have < it.qty then
        if have <= 0 then raise exception '"%" (%) is out of stock.', title, label; end if;
        raise exception 'Only % left of "%" (%).', have, title, label;
      end if;
      update public.store_products set variants = (
        select jsonb_agg(case when v->>'key' = it.vk then jsonb_set(v, '{stock}', to_jsonb(have - it.qty)) else v end order by ord)
        from jsonb_array_elements(pr.variants) with ordinality as t(v, ord)) where id = pr.id;
    else
      if it.vk is not null then raise exception 'That option of "%" is no longer available.', title; end if;
      if pr.stock is not null then
        if pr.stock < it.qty then
          if pr.stock <= 0 then raise exception '"%" is out of stock.', title; end if;
          raise exception 'Only % left of "%".', pr.stock, title;
        end if;
        update public.store_products set stock = stock - it.qty where id = pr.id;
      elsif not pr.in_stock then
        raise exception '"%" is out of stock.', title;
      end if;
    end if;
    sum_total := sum_total + pr.price * it.qty;
    insert into public.store_order_items (order_id, position, product_id, name, variant_key, variant_label, unit_price, quantity, image)
    values (oid, it.cart_pos, pr.id, title, it.vk, label, pr.price, it.qty, pr.media->0->>'url');
  end loop;

  update public.store_orders set subtotal = sum_total, delivery_fee = fee, total = sum_total + fee where id = oid returning * into o;

  if coalesce(p->>'saveDetails', '') = 'true' then
    insert into public.shop_details (user_id, details) values (me, contact)
    on conflict (user_id) do update set details = excluded.details, updated_at = now();
  end if;
  admin_id := public.noob_admin_id();
  if admin_id is not null and admin_id <> me then
    perform public.notify_user(admin_id, 'store_order', me, 'placed order #' || o.order_no || ' (₹' || trim(to_char(o.total, 'FM999999990.99')) || ', ' || upper(pay) || ').', '🛍️ New shop order');
  end if;
  return jsonb_build_object('success', true, 'order', public.store_order_json(o));
end;
$$;
