-- Food Stall: 5 products (Burger, Bhel, Fries, Manchurian, Coke in 3 cup sizes — modelled as 3
-- separate products since store_products has one price per product, not per-variant) added to the
-- existing Shop NOOB catalog under category='food_stall' so a dedicated storefront can show just
-- these. Also adds UPI as a second payment method alongside the existing Cash on
-- Pickup/Delivery — there is still no payment gateway: the shop owner's own UPI ID is shown to the
-- buyer (with the exact bill amount) so they pay it directly from their own UPI app (works for any
-- UPI app — GPay, PhonePe, Paytm, Amazon Pay, BHIM, etc. — since they all speak the same NPCI
-- intent), and the shop owner checks their own UPI app for the money before confirming the order
-- (see the "Confirm order" step already in admin_set_store_order_status).

-- ===========================================================================
-- 1. UPI ID setting + a product category column
-- ===========================================================================

alter table public.app_settings add column if not exists store_upi_id text;
alter table public.store_products add column if not exists category text;

create or replace function public.get_app_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(settings, '{}'::jsonb) || jsonb_build_object(
    'storeEnabled', store_enabled, 'storeDeliveryFee', store_delivery_fee, 'storeUpiId', coalesce(store_upi_id, '')
  )
  from public.app_settings where id = 1;
$$;

create or replace function public.set_shop_settings(p_enabled boolean default null, p_fee numeric default null, p_upi_id text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  who text;
  upi text;
begin
  if me is null then raise exception 'Please log in.'; end if;
  if not public.is_master_admin() then
    select username into who from public.profiles where id = me;
    raise exception 'You are signed in as @%, which is not the main NOOB administrator account. Log in as the NOOB account to change the shop settings.', coalesce(who, 'unknown');
  end if;
  if p_fee is not null and (p_fee < 0 or p_fee > 100000) then raise exception 'The delivery charge must be between 0 and 100000.'; end if;
  if p_upi_id is not null then
    upi := btrim(p_upi_id);
    if length(upi) > 100 then raise exception 'That UPI ID looks too long.'; end if;
  end if;

  update public.app_settings
     set store_enabled      = coalesce(p_enabled, store_enabled),
         store_delivery_fee = coalesce(p_fee, store_delivery_fee),
         store_upi_id       = case when p_upi_id is null then store_upi_id else nullif(upi, '') end,
         updated_at         = now()
   where id = 1;

  perform public.log_admin_action('shop_settings_changed', null, jsonb_build_object('ordersOn', p_enabled, 'deliveryCharge', p_fee, 'upiIdChanged', p_upi_id is not null));
  return public.get_app_settings();
end;
$$;
revoke execute on function public.set_shop_settings(boolean, numeric, text) from public, anon;
grant execute on function public.set_shop_settings(boolean, numeric, text) to authenticated, service_role;

create or replace function public.store_product_json(p public.store_products) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('id', p.id, 'name', p.name, 'title', public.store_product_title(p), 'price', p.price, 'description', p.description, 'media', p.media,
    'inStock', case when jsonb_array_length(p.variants) > 0
                    then coalesce((select bool_or((v->>'stock')::integer > 0) from jsonb_array_elements(p.variants) v), false)
                    when p.stock is not null then p.stock > 0
                    else p.in_stock end,
    'stock', p.stock, 'options', p.options, 'variants', p.variants, 'category', p.category,
    'createdAt', p.created_at, 'updatedAt', p.updated_at);
$$;

-- ===========================================================================
-- 2. Payment method on an order — was always hard-coded 'cash'; now takes what the buyer picked.
-- ===========================================================================

create or replace function public.place_store_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.acting_user(); it record; pr public.store_products; var jsonb; have integer; enabled boolean;
  method text := coalesce(p->>'deliveryMethod', ''); pay text; contact jsonb; fee numeric := 0; sum_total numeric := 0; o public.store_orders; oid uuid := gen_random_uuid();
  lines integer := 0; label text; title text; admin_id uuid; note_text text := btrim(coalesce(p->>'note', ''));
begin
  select store_enabled, case when method = 'delivery' then store_delivery_fee else 0 end into enabled, fee from public.app_settings where id = 1;
  if enabled is false then raise exception 'Ordering is currently paused by NOOB.'; end if;
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

-- ===========================================================================
-- 3. Seed the 5 Food Stall products (Coke's 3 sizes as 3 products, since price lives on the
--    product, not the variant). Placeholder photos (live-checked Unsplash stock photos) and
--    prices — edit freely any time from Shop NOOB's own admin product editor.
-- ===========================================================================

insert into public.store_products (name, price, description, media, in_stock, category)
select v.name, v.price, v.description,
  jsonb_build_array(
    jsonb_build_object('type', 'photo', 'url', v.img1),
    jsonb_build_object('type', 'photo', 'url', v.img2),
    jsonb_build_object('type', 'photo', 'url', v.img3)
  ),
  true, 'food_stall'
from (values
  ('Burger', 89,
   'A juicy grilled patty burger with fresh veggies, cheese and our special sauce, served hot.',
   'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=900&q=80&auto=format&fit=crop',
   'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=900&q=80&auto=format&fit=crop',
   'https://images.unsplash.com/photo-1550547660-d9450f859349?w=900&q=80&auto=format&fit=crop'),
  ('Bhel', 49,
   'Classic Mumbai-style bhel puri — puffed rice tossed with tangy chutneys, onion, tomato and sev.',
   'https://images.unsplash.com/photo-1777732785406-f18022cbac1d?w=900&q=80&auto=format&fit=crop',
   'https://images.unsplash.com/photo-1788618817416-77683bd32819?w=900&q=80&auto=format&fit=crop',
   'https://images.unsplash.com/photo-1788620644939-6f3158c6fb01?w=900&q=80&auto=format&fit=crop'),
  ('Fries', 69,
   'Crispy golden French fries, salted and served hot — the perfect crunchy side.',
   'https://images.unsplash.com/photo-1598679253544-2c97992403ea?w=900&q=80&auto=format&fit=crop',
   'https://images.unsplash.com/photo-1630431341973-02e1b662ec35?w=900&q=80&auto=format&fit=crop',
   'https://images.unsplash.com/photo-1606755456206-b25206cde27e?w=900&q=80&auto=format&fit=crop'),
  ('Manchurian', 99,
   'Indo-Chinese veg Manchurian — crispy fried veggie balls tossed in a spicy, tangy sauce.',
   'https://images.unsplash.com/photo-1682622110433-65513a55d7da?w=900&q=80&auto=format&fit=crop',
   'https://images.unsplash.com/photo-1648739690224-55731cd2c131?w=900&q=80&auto=format&fit=crop',
   'https://images.unsplash.com/photo-1643268972535-a2b100ff3632?w=900&q=80&auto=format&fit=crop'),
  ('Coke (Small Cup)', 20,
   'Chilled Coca-Cola, served in a small 200ml cup.',
   'https://images.unsplash.com/photo-1533007716222-4b465613a984?w=900&q=80&auto=format&fit=crop',
   'https://images.unsplash.com/photo-1544241907-f3f1f5ded15a?w=900&q=80&auto=format&fit=crop',
   'https://images.unsplash.com/photo-1573624658129-3f7856192f19?w=900&q=80&auto=format&fit=crop'),
  ('Coke (Medium Cup)', 35,
   'Chilled Coca-Cola, served in a medium 300ml cup.',
   'https://images.unsplash.com/photo-1533007716222-4b465613a984?w=900&q=80&auto=format&fit=crop',
   'https://images.unsplash.com/photo-1544241907-f3f1f5ded15a?w=900&q=80&auto=format&fit=crop',
   'https://images.unsplash.com/photo-1573624658129-3f7856192f19?w=900&q=80&auto=format&fit=crop'),
  ('Coke (Large Cup)', 50,
   'Chilled Coca-Cola, served in a large 500ml cup.',
   'https://images.unsplash.com/photo-1533007716222-4b465613a984?w=900&q=80&auto=format&fit=crop',
   'https://images.unsplash.com/photo-1544241907-f3f1f5ded15a?w=900&q=80&auto=format&fit=crop',
   'https://images.unsplash.com/photo-1573624658129-3f7856192f19?w=900&q=80&auto=format&fit=crop')
) as v(name, price, description, img1, img2, img3)
where not exists (select 1 from public.store_products sp where sp.name = v.name and sp.category = 'food_stall');
