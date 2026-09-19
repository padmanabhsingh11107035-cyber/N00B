-- NOOB — Supabase phase 6: shop inventory, product versions (colour / size / model ...) and editing products.
--
--   * A product can track how many are in stock ("stock"). Left empty it behaves exactly as before (the plain In-Stock switch).
--   * A product can have up to 3 option types (for example Colour, Size, Model), each with up to 20 options. Every
--     combination (Red/S, Red/M, Blue/S ...) is a "version" with its own stock count. The database builds the full list of
--     combinations itself, so none can be forgotten, and keeps the stock of combinations you did not change.
--   * The admin (or a delegate with the "store" permission) can EDIT a product; every edit is written to the activity log.
-- Existing products are not changed. Safe to run more than once.

alter table public.store_products add column if not exists stock integer;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'store_products_stock_check') then
    alter table public.store_products add constraint store_products_stock_check check (stock is null or (stock >= 0 and stock <= 1000000));
  end if;
end $$;
alter table public.store_products add column if not exists options jsonb not null default '[]';
alter table public.store_products add column if not exists variants jsonb not null default '[]';
alter table public.store_products add column if not exists updated_at timestamptz;

-- Checks the option types and rebuilds the complete list of versions with their stock.
--   p_options:  [ { "name": "Colour", "values": ["Red", "Blue"] }, { "name": "Size", "values": ["S", "M"] } ]
--   p_variants: [ { "options": { "Colour": "Red", "Size": "S" }, "stock": 5 }, ... ]   (any combination left out gets stock 0)
-- Returns { options: [...], variants: [ { key, options: {...}, stock } ... ] }.
create or replace function public.normalize_store_variants(p_options jsonb, p_variants jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  groups jsonb := '[]'::jsonb; g jsonb; gname text; vals jsonb; v text; seen_names text[] := '{}'; seen_vals text[];
  combos jsonb := '[{}]'::jsonb; nxt jsonb; c jsonb; gv jsonb; provided jsonb := '{}'::jsonb; vr jsonb; k text; res jsonb := '[]'::jsonb;
  st integer; total integer;
begin
  if p_options is null or jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) = 0 then
    return jsonb_build_object('options', '[]'::jsonb, 'variants', '[]'::jsonb);
  end if;
  if jsonb_array_length(p_options) > 3 then
    raise exception 'A product can have at most 3 option types (for example Colour, Size and Model).';
  end if;

  for g in select value from jsonb_array_elements(p_options) loop
    gname := btrim(coalesce(g->>'name', ''));
    if gname = '' then raise exception 'Every option type needs a name (for example Colour).'; end if;
    if length(gname) > 30 then raise exception 'Option type names can be at most 30 characters.'; end if;
    if lower(gname) = any(seen_names) then raise exception 'Two option types are both called "%".', gname; end if;
    seen_names := seen_names || lower(gname);
    seen_vals := '{}'; vals := '[]'::jsonb;
    if jsonb_typeof(g->'values') = 'array' then
      for v in select btrim(x) from jsonb_array_elements_text(g->'values') x loop
        if v = '' then continue; end if;
        if length(v) > 30 then raise exception 'Each option can be at most 30 characters (under "%").', gname; end if;
        if lower(v) = any(seen_vals) then continue; end if;   -- the same option twice is kept once
        seen_vals := seen_vals || lower(v);
        vals := vals || to_jsonb(v);
      end loop;
    end if;
    if jsonb_array_length(vals) = 0 then raise exception 'Add at least one option under "%".', gname; end if;
    if jsonb_array_length(vals) > 20 then raise exception 'Under "%" there can be at most 20 options.', gname; end if;
    groups := groups || jsonb_build_array(jsonb_build_object('name', gname, 'values', vals));
  end loop;

  -- the stock the admin typed, looked up by combination (keys are built in the order of the option types)
  if p_variants is not null and jsonb_typeof(p_variants) = 'array' then
    for vr in select value from jsonb_array_elements(p_variants) loop
      k := null;
      for g in select value from jsonb_array_elements(groups) loop
        k := coalesce(k || '|', '') || (g->>'name') || '=' || coalesce(vr->'options'->>(g->>'name'), '');
      end loop;
      st := case when (vr->>'stock') ~ '^[0-9]{1,7}$' then least((vr->>'stock')::integer, 1000000) else 0 end;
      provided := provided || jsonb_build_object(k, st);
    end loop;
  end if;

  -- every combination, in a stable order
  for g in select value from jsonb_array_elements(groups) loop
    nxt := '[]'::jsonb;
    for c in select value from jsonb_array_elements(combos) loop
      for gv in select value from jsonb_array_elements(g->'values') loop
        nxt := nxt || jsonb_build_array(c || jsonb_build_object(g->>'name', gv #>> '{}'));
      end loop;
    end loop;
    combos := nxt;
    total := jsonb_array_length(combos);
    if total > 200 then raise exception 'That makes % versions — the most a product can have is 200. Remove some options.', total; end if;
  end loop;

  for c in select value from jsonb_array_elements(combos) loop
    k := null;
    for g in select value from jsonb_array_elements(groups) loop
      k := coalesce(k || '|', '') || (g->>'name') || '=' || (c->>(g->>'name'));
    end loop;
    res := res || jsonb_build_array(jsonb_build_object('key', k, 'options', c, 'stock', coalesce((provided->>k)::integer, 0)));
  end loop;
  return jsonb_build_object('options', groups, 'variants', res);
end;
$$;

-- What a product looks like to the app. "inStock" is worked out: any version with stock, or stock above 0, or the plain switch.
create or replace function public.store_product_json(p public.store_products) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('id', p.id, 'price', p.price, 'description', p.description, 'media', p.media,
    'inStock', case when jsonb_array_length(p.variants) > 0
                    then coalesce((select bool_or((v->>'stock')::integer > 0) from jsonb_array_elements(p.variants) v), false)
                    when p.stock is not null then p.stock > 0
                    else p.in_stock end,
    'stock', p.stock, 'options', p.options, 'variants', p.variants,
    'createdAt', p.created_at, 'updatedAt', p.updated_at);
$$;

create or replace function public.list_store_products() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.acting_user();
begin
  return coalesce((select jsonb_agg(public.store_product_json(p) order by p.created_at desc) from public.store_products p), '[]'::jsonb);
end;
$$;

-- Shared checks for create and edit; returns the cleaned-up pieces.
create or replace function public.clean_store_product(p jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare media jsonb; photos int; videos int; norm jsonb; stock_val integer := null; flag boolean;
begin
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
  return jsonb_build_object('price', (p->>'price')::numeric, 'description', btrim(p->>'description'), 'media', media,
    'stock', stock_val, 'options', norm->'options', 'variants', norm->'variants', 'inStock', flag);
end;
$$;

create or replace function public.create_store_product(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid; c jsonb; pr public.store_products;
begin
  me := public.require_permission('manage_store', 'Only the NOOB admin account can add products.');
  c := public.clean_store_product(p);
  insert into public.store_products (price, description, media, in_stock, stock, options, variants, created_by)
  values ((c->>'price')::numeric, c->>'description', c->'media', (c->>'inStock')::boolean,
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
    price = (c->>'price')::numeric, description = c->>'description', media = c->'media', in_stock = (c->>'inStock')::boolean,
    stock = nullif(c->>'stock', '')::integer, options = c->'options', variants = c->'variants', updated_at = now()
  where id = p_id returning * into pr;
  if not found then raise exception 'Product not found.'; end if;
  perform public.log_admin_action('product_updated', null, jsonb_build_object('productId', p_id));
  return jsonb_build_object('success', true, 'product', public.store_product_json(pr));
end;
$$;

-- A new function is executable by everyone until told otherwise, so: signed-in members only (the functions check the permission themselves).
revoke execute on function public.update_store_product(uuid, jsonb), public.list_store_products(), public.create_store_product(jsonb) from public, anon;
grant execute on function public.update_store_product(uuid, jsonb), public.list_store_products(), public.create_store_product(jsonb) to authenticated, service_role;
revoke execute on function public.normalize_store_variants(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.store_product_json(public.store_products) from public, anon, authenticated;
revoke execute on function public.clean_store_product(jsonb) from public, anon, authenticated;
