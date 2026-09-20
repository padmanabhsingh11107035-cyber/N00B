-- NOOB — Supabase phase 7:
--   1. Shop: every product gets a NAME (the description is only shown when the product is opened).
--   2. Shop: each person can save their contact details and address ("account details") and use them at checkout.
--   3. Shop: real orders. Pay when you pick up / on delivery (there is no online payment). Placing an order checks the
--      stock, takes it off the shelf in one step (two people can never buy the last one), and the shop can confirm,
--      hand over or cancel it (cancelling puts the stock back). Both sides get notifications.
--   4. Profiles: "hide my profile from this person" — that person can not see your profile, posts, reels, stories or
--      followers, can not find you in search and can not follow you. They are not told.
-- Existing products, accounts and content are not changed. Safe to run more than once.

-- ===========================================================================
-- 1. Product names
-- ===========================================================================
alter table public.store_products add column if not exists name text not null default '';

-- What to show as the product's title: its name, or (for products made before names existed) the first line of the description.
create or replace function public.store_product_title(p public.store_products) returns text
language sql stable set search_path = public as $$
  select coalesce(nullif(btrim(p.name), ''), nullif(left(btrim(split_part(btrim(p.description), E'\n', 1)), 60), ''), 'Product');
$$;

create or replace function public.store_product_json(p public.store_products) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('id', p.id, 'name', p.name, 'title', public.store_product_title(p), 'price', p.price, 'description', p.description, 'media', p.media,
    'inStock', case when jsonb_array_length(p.variants) > 0
                    then coalesce((select bool_or((v->>'stock')::integer > 0) from jsonb_array_elements(p.variants) v), false)
                    when p.stock is not null then p.stock > 0
                    else p.in_stock end,
    'stock', p.stock, 'options', p.options, 'variants', p.variants,
    'createdAt', p.created_at, 'updatedAt', p.updated_at);
$$;

create or replace function public.clean_store_product(p jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare media jsonb; photos int; videos int; norm jsonb; stock_val integer := null; flag boolean; name_val text;
begin
  name_val := btrim(coalesce(p->>'name', ''));
  if length(name_val) > 80 then raise exception 'The product name can be at most 80 characters.'; end if;
  if coalesce(jsonb_typeof(p->'price'), '') <> 'number' or (p->>'price')::numeric <= 0 then raise exception 'Enter a valid price.'; end if;
  if btrim(coalesce(p->>'description', '')) = '' then raise exception 'A description is required.'; end if;
  if coalesce(jsonb_typeof(p->'media'), '') <> 'array' or jsonb_array_length(p->'media') = 0 then raise exception 'Add at least one photo or video.'; end if;
  select count(*) filter (where x->>'type' = 'photo'), count(*) filter (where x->>'type' = 'video')
    into photos, videos from jsonb_array_elements(p->'media') x;
  if photos > 10 then raise exception 'A product can have at most 10 photos.'; end if;
  if videos > 10 then raise exception 'A product can have at most 10 videos.'; end if;
  select jsonb_agg(jsonb_build_object('type', case when x->>'type' = 'video' then 'video' else 'photo' end, 'url', x->>'url'))
    into media from jsonb_array_elements(p->'media') x;

  norm := public.normalize_store_variants(p->'options', p->'variants');
  if jsonb_array_length(norm->'variants') = 0 and jsonb_typeof(p->'stock') = 'number' then
    if (p->>'stock')::numeric < 0 or (p->>'stock')::numeric > 1000000 or (p->>'stock')::numeric <> floor((p->>'stock')::numeric) then
      raise exception 'Stock must be a whole number from 0 to 1,000,000.';
    end if;
    stock_val := (p->>'stock')::integer;
  end if;
  flag := coalesce((p->>'inStock')::boolean, true);
  return jsonb_build_object('name', name_val, 'price', (p->>'price')::numeric, 'description', btrim(p->>'description'), 'media', media,
    'stock', stock_val, 'options', norm->'options', 'variants', norm->'variants', 'inStock', flag);
end;
$$;

create or replace function public.create_store_product(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid; c jsonb; pr public.store_products;
begin
  me := public.require_permission('manage_store', 'Only the NOOB admin account can add products.');
  c := public.clean_store_product(p);
  insert into public.store_products (name, price, description, media, in_stock, stock, options, variants, created_by)
  values (c->>'name', (c->>'price')::numeric, c->>'description', c->'media', (c->>'inStock')::boolean,
          nullif(c->>'stock', '')::integer, c->'options', c->'variants', me)
  returning * into pr;
  perform public.log_admin_action('product_added', null, jsonb_build_object('productId', pr.id));
  return jsonb_build_object('success', true, 'product', public.store_product_json(pr));
end;
$$;

create or replace function public.update_store_product(p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c jsonb; pr public.store_products;
begin
  perform public.require_permission('manage_store', 'Only the NOOB admin account can edit products.');
  c := public.clean_store_product(p);
  update public.store_products set
    name = c->>'name', price = (c->>'price')::numeric, description = c->>'description', media = c->'media', in_stock = (c->>'inStock')::boolean,
    stock = nullif(c->>'stock', '')::integer, options = c->'options', variants = c->'variants', updated_at = now()
  where id = p_id returning * into pr;
  if not found then raise exception 'Product not found.'; end if;
  perform public.log_admin_action('product_updated', null, jsonb_build_object('productId', p_id));
  return jsonb_build_object('success', true, 'product', public.store_product_json(pr));
end;
$$;

-- ===========================================================================
-- 2. Account details for the shop (contact details and address)
-- ===========================================================================
create table if not exists public.shop_details (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  details        jsonb not null default '{}',
  updated_at     timestamptz not null default now()
);
alter table public.shop_details enable row level security;

-- Checks and tidies contact details. Lenient when saving (fill in what you have), strict when placing an order.
--   fullName, phone, altPhone, email, addressLine1, addressLine2, landmark, city, state, pincode, deliveryNotes
create or replace function public.clean_shop_contact(c jsonb, p_strict boolean, p_delivery boolean) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  keys text[] := array['fullName', 'phone', 'altPhone', 'email', 'addressLine1', 'addressLine2', 'landmark', 'city', 'state', 'pincode', 'deliveryNotes'];
  maxlen integer[] := array[80, 20, 20, 120, 150, 150, 100, 80, 80, 10, 300];
  labels text[] := array['Full name', 'Phone number', 'Alternate phone', 'Email', 'Address line 1', 'Address line 2', 'Landmark', 'City', 'State', 'Pincode', 'Delivery notes'];
  out jsonb := '{}'::jsonb; i integer; v text; digits integer;
begin
  if c is null or jsonb_typeof(c) <> 'object' then c := '{}'::jsonb; end if;
  for i in 1 .. array_length(keys, 1) loop
    v := btrim(regexp_replace(coalesce(c->>keys[i], ''), '[\r\t]+', ' ', 'g'));
    if length(v) > maxlen[i] then raise exception '% can be at most % characters.', labels[i], maxlen[i]; end if;
    out := out || jsonb_build_object(keys[i], v);
  end loop;
  digits := length(regexp_replace(out->>'phone', '[^0-9]', '', 'g'));
  if out->>'phone' <> '' and (digits < 7 or digits > 15) then raise exception 'Enter a valid phone number.'; end if;
  digits := length(regexp_replace(out->>'altPhone', '[^0-9]', '', 'g'));
  if out->>'altPhone' <> '' and (digits < 7 or digits > 15) then raise exception 'Enter a valid alternate phone number.'; end if;
  if out->>'email' <> '' and out->>'email' !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Enter a valid email address.'; end if;
  if out->>'pincode' <> '' and out->>'pincode' !~ '^[A-Za-z0-9 -]{4,10}$' then raise exception 'Enter a valid pincode.'; end if;
  if p_strict then
    if length(out->>'fullName') < 2 then raise exception 'Enter your full name.'; end if;
    if out->>'phone' = '' then raise exception 'Enter a phone number the shop can reach you on.'; end if;
    if p_delivery then
      if length(out->>'addressLine1') < 3 then raise exception 'Enter your delivery address.'; end if;
      if out->>'city' = '' then raise exception 'Enter your city.'; end if;
      if out->>'state' = '' then raise exception 'Enter your state.'; end if;
      if out->>'pincode' = '' then raise exception 'Enter your pincode.'; end if;
    end if;
  end if;
  return out;
end;
$$;

create or replace function public.get_shop_details() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.acting_user(); d jsonb;
begin
  select details into d from public.shop_details where user_id = me;
  return jsonb_build_object('success', true, 'details', coalesce(d, '{}'::jsonb));
end;
$$;

create or replace function public.save_shop_details(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); d jsonb;
begin
  d := public.clean_shop_contact(p, false, false);
  insert into public.shop_details (user_id, details) values (me, d)
  on conflict (user_id) do update set details = excluded.details, updated_at = now();
  return jsonb_build_object('success', true, 'details', d);
end;
$$;

-- ===========================================================================
-- 3. Orders
-- ===========================================================================
create sequence if not exists public.store_order_seq start 1001;

create table if not exists public.store_orders (
  id              uuid primary key default gen_random_uuid(),
  order_no        bigint not null unique default nextval('public.store_order_seq'),
  user_id         uuid references public.profiles (id) on delete set null,   -- the order stays on the shop's books if the account is deleted
  status          text not null default 'placed' check (status in ('placed', 'confirmed', 'ready', 'completed', 'cancelled')),
  delivery_method text not null check (delivery_method in ('pickup', 'delivery')),
  payment_method  text not null default 'cash',
  contact         jsonb not null default '{}',
  subtotal        numeric not null check (subtotal >= 0),
  delivery_fee    numeric not null default 0 check (delivery_fee >= 0),
  total           numeric not null check (total >= 0),
  note            text not null default '',
  cancelled_by    text,
  cancel_reason   text,
  status_history  jsonb not null default '[]',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists store_orders_user_idx on public.store_orders (user_id, created_at desc);
create index if not exists store_orders_status_idx on public.store_orders (status, created_at desc);

create table if not exists public.store_order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.store_orders (id) on delete cascade,
  position      integer not null default 0,
  product_id    uuid references public.store_products (id) on delete set null,
  name          text not null,
  variant_key   text,
  variant_label text,
  unit_price    numeric not null check (unit_price >= 0),
  quantity      integer not null check (quantity between 1 and 1000),
  image         text
);
create index if not exists store_order_items_order_idx on public.store_order_items (order_id, position);
alter table public.store_orders enable row level security;
alter table public.store_order_items enable row level security;

create or replace function public.store_order_json(o public.store_orders, p_include_customer boolean default false) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', o.id, 'orderNo', o.order_no, 'status', o.status, 'deliveryMethod', o.delivery_method, 'paymentMethod', o.payment_method,
    'subtotal', o.subtotal, 'deliveryFee', o.delivery_fee, 'total', o.total, 'note', o.note, 'contact', o.contact,
    'cancelledBy', o.cancelled_by, 'cancelReason', o.cancel_reason, 'statusHistory', o.status_history,
    'createdAt', o.created_at, 'updatedAt', o.updated_at,
    'items', coalesce((select jsonb_agg(jsonb_build_object('productId', i.product_id, 'name', i.name, 'variantKey', i.variant_key,
                         'variantLabel', i.variant_label, 'unitPrice', i.unit_price, 'quantity', i.quantity, 'image', i.image) order by i.position)
                       from public.store_order_items i where i.order_id = o.id), '[]'::jsonb))
  || case when p_include_customer
          then jsonb_build_object('customer', (select jsonb_build_object('id', p.id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar)
                                               from public.profiles p where p.id = o.user_id))
          else '{}'::jsonb end;
$$;

-- Puts the items of an order back on the shelf (used when an order is cancelled).
create or replace function public.restore_store_order_stock(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare it record; pr public.store_products;
begin
  for it in select * from public.store_order_items where order_id = p_order and product_id is not null order by product_id, position loop
    select * into pr from public.store_products where id = it.product_id for update;
    if not found then continue; end if;
    if jsonb_array_length(pr.variants) > 0 then
      if it.variant_key is not null then
        update public.store_products set variants = (
          select jsonb_agg(case when v->>'key' = it.variant_key
                                then jsonb_set(v, '{stock}', to_jsonb(least(1000000, (v->>'stock')::integer + it.quantity)))
                                else v end order by ord)
          from jsonb_array_elements(pr.variants) with ordinality as t(v, ord))
        where id = pr.id;
      end if;
    elsif pr.stock is not null then
      update public.store_products set stock = least(1000000, pr.stock + it.quantity) where id = pr.id;
    end if;
  end loop;
end;
$$;

-- Place an order.  p = { items: [{ productId, variantKey, quantity }], deliveryMethod: 'pickup'|'delivery',
--                        contact: {...}, note, saveDetails }
-- Prices, stock and the delivery charge always come from the database — never from what the app sends.
create or replace function public.place_store_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.acting_user(); it record; pr public.store_products; var jsonb; have integer; enabled boolean;
  method text := coalesce(p->>'deliveryMethod', ''); contact jsonb; fee numeric := 0; sum_total numeric := 0; o public.store_orders; oid uuid := gen_random_uuid();
  lines integer := 0; label text; title text; admin_id uuid; note_text text := btrim(coalesce(p->>'note', ''));
begin
  select store_enabled, case when method = 'delivery' then store_delivery_fee else 0 end into enabled, fee from public.app_settings where id = 1;
  if enabled is false then raise exception 'Ordering is currently paused by NOOB.'; end if;
  if method not in ('pickup', 'delivery') then raise exception 'Choose pickup or delivery.'; end if;
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

  insert into public.store_orders (id, user_id, delivery_method, contact, subtotal, delivery_fee, total, note, status_history)
  values (oid, me, method, contact, 0, 0, 0, note_text,
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
    perform public.notify_user(admin_id, 'store_order', me, 'placed order #' || o.order_no || ' (₹' || trim(to_char(o.total, 'FM999999990.99')) || ').', '🛍️ New shop order');
  end if;
  return jsonb_build_object('success', true, 'order', public.store_order_json(o));
end;
$$;

create or replace function public.my_store_orders() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.acting_user();
begin
  return jsonb_build_object('success', true, 'orders', coalesce((
    select jsonb_agg(public.store_order_json(o) order by o.created_at desc)
    from (select * from public.store_orders where user_id = me order by created_at desc limit 100) o), '[]'::jsonb));
end;
$$;

-- A customer may cancel their own order until the shop has confirmed it.
create or replace function public.cancel_my_store_order(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); o public.store_orders; admin_id uuid;
begin
  select * into o from public.store_orders where id = p_id and user_id = me for update;
  if not found then raise exception 'Order not found.'; end if;
  if o.status = 'cancelled' then return jsonb_build_object('success', true, 'order', public.store_order_json(o)); end if;
  if o.status <> 'placed' then raise exception 'The shop has already confirmed this order. Please contact the shop to change it.'; end if;
  perform public.restore_store_order_stock(o.id);
  update public.store_orders set status = 'cancelled', cancelled_by = 'customer', updated_at = now(),
    status_history = status_history || jsonb_build_array(jsonb_build_object('status', 'cancelled', 'at', now(), 'by', 'customer'))
  where id = o.id returning * into o;
  admin_id := public.noob_admin_id();
  if admin_id is not null and admin_id <> me then
    perform public.notify_user(admin_id, 'store_order', me, 'cancelled order #' || o.order_no || '.', '🛍️ Order cancelled');
  end if;
  return jsonb_build_object('success', true, 'order', public.store_order_json(o));
end;
$$;

-- ---- the shop's side ("manage the shop" permission) ----------------------------------------
create or replace function public.admin_store_orders(p_status text default null, p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_permission('manage_store', 'Only the NOOB admin account can see shop orders.');
  return jsonb_build_object('success', true,
    'openCount', (select count(*) from public.store_orders where status in ('placed', 'confirmed', 'ready')),
    'orders', coalesce((
      select jsonb_agg(public.store_order_json(o, true) order by o.created_at desc)
      from (select * from public.store_orders where (p_status is null or p_status = '' or status = p_status)
            order by created_at desc limit least(greatest(coalesce(p_limit, 100), 1), 300)) o), '[]'::jsonb));
end;
$$;

-- placed -> confirmed -> ready (ready for pickup / out for delivery) -> completed; cancelling is possible until completed.
create or replace function public.admin_set_store_order_status(p_id uuid, p_status text, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.store_orders; ok boolean; reason text := nullif(btrim(coalesce(p_reason, '')), ''); msg text;
begin
  perform public.require_permission('manage_store', 'Only the NOOB admin account can manage shop orders.');
  select * into o from public.store_orders where id = p_id for update;
  if not found then raise exception 'Order not found.'; end if;
  if reason is not null and length(reason) > 200 then raise exception 'The reason can be at most 200 characters.'; end if;
  ok := (o.status = 'placed' and p_status in ('confirmed', 'cancelled'))
     or (o.status = 'confirmed' and p_status in ('ready', 'cancelled'))
     or (o.status = 'ready' and p_status in ('completed', 'cancelled'));
  if not ok then raise exception 'An order that is "%" can not be changed to "%".', o.status, p_status; end if;
  if p_status = 'cancelled' then perform public.restore_store_order_stock(o.id); end if;
  update public.store_orders set status = p_status, updated_at = now(),
    cancelled_by = case when p_status = 'cancelled' then 'shop' else cancelled_by end,
    cancel_reason = case when p_status = 'cancelled' then reason else cancel_reason end,
    status_history = status_history || jsonb_build_array(jsonb_build_object('status', p_status, 'at', now(), 'by', 'shop'))
  where id = o.id returning * into o;
  perform public.log_admin_action('order_' || p_status, o.user_id, jsonb_build_object('orderNo', o.order_no));
  if o.user_id is not null then
    msg := case p_status
      when 'confirmed' then 'Your order #' || o.order_no || ' was confirmed.'
      when 'ready' then case when o.delivery_method = 'pickup' then 'Your order #' || o.order_no || ' is ready for pickup.' else 'Your order #' || o.order_no || ' is out for delivery.' end
      when 'completed' then 'Your order #' || o.order_no || ' is complete. Thank you for shopping with NOOB!'
      else 'Your order #' || o.order_no || ' was cancelled by the shop.' || coalesce(' Reason: ' || reason, '') end;
    perform public.notify_user(o.user_id, 'store_order', auth.uid(), msg, '🛍️ Order update');
  end if;
  return jsonb_build_object('success', true, 'order', public.store_order_json(o, true));
end;
$$;

-- ===========================================================================
-- 4. Hide my profile from chosen people
-- ===========================================================================
create table if not exists public.profile_hides (
  owner_id        uuid not null references public.profiles (id) on delete cascade,
  hidden_from_id  uuid not null references public.profiles (id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (owner_id, hidden_from_id),
  check (owner_id <> hidden_from_id)
);
create index if not exists profile_hides_hidden_idx on public.profile_hides (hidden_from_id);
alter table public.profile_hides enable row level security;

-- Has this account hidden itself from the person who is signed in?
create or replace function public.is_hidden_from_me(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profile_hides h where h.owner_id = owner and h.hidden_from_id = auth.uid());
$$;

-- The ids you are hidden from, for your own record (get_my_user runs with your rights, which do not include the table itself).
create or replace function public.my_hidden_from_ids() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(hidden_from_id), '[]'::jsonb) from public.profile_hides where owner_id = auth.uid();
$$;

create or replace function public.hide_profile_from(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user();
begin
  if p_user is null or p_user = me then raise exception 'Choose someone other than yourself.'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'That account was not found.'; end if;
  insert into public.profile_hides (owner_id, hidden_from_id) values (me, p_user) on conflict do nothing;
  -- they can no longer follow you: remove what they had
  delete from public.follows where follower_id = p_user and followee_id = me;
  delete from public.follow_requests where requester_id = p_user and target_id = me;
  return jsonb_build_object('success', true, 'hiddenFromIds', coalesce((select jsonb_agg(hidden_from_id) from public.profile_hides where owner_id = me), '[]'::jsonb));
end;
$$;

create or replace function public.unhide_profile_from(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user();
begin
  delete from public.profile_hides where owner_id = me and hidden_from_id = p_user;
  return jsonb_build_object('success', true, 'hiddenFromIds', coalesce((select jsonb_agg(hidden_from_id) from public.profile_hides where owner_id = me), '[]'::jsonb));
end;
$$;

create or replace function public.my_hidden_from() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.acting_user();
begin
  return jsonb_build_object('success', true, 'users', coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar,
                                        'isVerified', p.is_verified, 'hiddenAt', h.created_at) order by h.created_at desc)
    from public.profile_hides h join public.profiles p on p.id = h.hidden_from_id where h.owner_id = me), '[]'::jsonb));
end;
$$;

-- Content (posts, reels, stories, likes, comments) follows this rule, so hiding a profile hides all of it.
create or replace function public.can_view_author(author uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    author = auth.uid()
    or public.is_admin()
    or (
      not exists (
        select 1 from public.blocks b
        where (b.blocker_id = author and b.blocked_id = auth.uid())
           or (b.blocker_id = auth.uid() and b.blocked_id = author)
      )
      and not exists (select 1 from public.profile_hides h where h.owner_id = author and h.hidden_from_id = auth.uid())
      and (
        (select p.account_type from public.profiles p where p.id = author) <> 'private'
        or exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = author)
        or exists (select 1 from public.follows f where f.follower_id = author and f.followee_id = auth.uid())
      )
    );
$$;

-- A hidden profile does not appear in search, suggestions or the people list.
create or replace function public.search_users(p_search text default '') returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(public.user_public_json(x.pr) order by (x.pr).created_at desc), '[]'::jsonb)
  from (
    select pr from public.profiles pr
    where (btrim(coalesce(p_search, '')) = ''
       or pr.username ilike '%' || btrim(p_search) || '%'
       or pr.display_name ilike '%' || btrim(p_search) || '%'
       or pr.bio ilike '%' || btrim(p_search) || '%')
      and not public.is_hidden_from_me(pr.id)
    order by pr.created_at desc limit 300
  ) x;
$$;

-- Nobody can see the follower / following connections of someone who hid from them.
drop policy if exists follows_select on public.follows;
create policy follows_select on public.follows for select to authenticated
  using (not public.is_hidden_from_me(follower_id) and not public.is_hidden_from_me(followee_id));

-- And nobody can follow (or request to follow) an account that hid from them, however the request is made.
create or replace function public.guard_follow_hidden() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid; viewer uuid;
begin
  if tg_table_name = 'follows' then owner := new.followee_id; viewer := new.follower_id;
  else owner := new.target_id; viewer := new.requester_id; end if;
  if exists (select 1 from public.profile_hides h where h.owner_id = owner and h.hidden_from_id = viewer) then
    raise exception 'You can''t follow this account.';
  end if;
  return new;
end;
$$;
drop trigger if exists follows_guard_hidden on public.follows;
create trigger follows_guard_hidden before insert on public.follows for each row execute function public.guard_follow_hidden();
drop trigger if exists follow_requests_guard_hidden on public.follow_requests;
create trigger follow_requests_guard_hidden before insert on public.follow_requests for each row execute function public.guard_follow_hidden();

-- Your own record now says who you have hidden from.
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
      from (select * from public.noob_transactions where user_id = p.id order by created_at desc limit 200) t), '[]'::jsonb)
  )
  from public.profiles p
  left join public.profile_private pp on pp.user_id = p.id
  where p.id = auth.uid();
$$;

-- ===========================================================================
-- Who may call what
-- ===========================================================================
revoke all on public.shop_details, public.store_orders, public.store_order_items, public.profile_hides from anon, authenticated;
grant all on public.shop_details, public.store_orders, public.store_order_items, public.profile_hides to service_role;
grant usage, select on all sequences in schema public to service_role;

revoke execute on function
  public.place_store_order(jsonb), public.my_store_orders(), public.cancel_my_store_order(uuid),
  public.get_shop_details(), public.save_shop_details(jsonb),
  public.admin_store_orders(text, integer), public.admin_set_store_order_status(uuid, text, text),
  public.hide_profile_from(uuid), public.unhide_profile_from(uuid), public.my_hidden_from(), public.is_hidden_from_me(uuid), public.my_hidden_from_ids()
  from public, anon;
grant execute on function
  public.place_store_order(jsonb), public.my_store_orders(), public.cancel_my_store_order(uuid),
  public.get_shop_details(), public.save_shop_details(jsonb),
  public.admin_store_orders(text, integer), public.admin_set_store_order_status(uuid, text, text),
  public.hide_profile_from(uuid), public.unhide_profile_from(uuid), public.my_hidden_from(), public.is_hidden_from_me(uuid), public.my_hidden_from_ids()
  to authenticated, service_role;

-- helpers used only by other database functions
revoke execute on function
  public.store_product_title(public.store_products), public.store_product_json(public.store_products), public.clean_store_product(jsonb),
  public.clean_shop_contact(jsonb, boolean, boolean), public.store_order_json(public.store_orders, boolean),
  public.restore_store_order_stock(uuid), public.guard_follow_hidden()
  from public, anon, authenticated;
