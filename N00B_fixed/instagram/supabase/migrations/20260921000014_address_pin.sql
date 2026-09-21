-- NOOB — Supabase phase 11: the MAP PIN on a delivery address.
-- A delivery address (and the order it is used for) can now carry the exact spot on the map that the customer pinned: two numbers,
-- "lat" and "lng". They are optional (an address without a pin works exactly as before), and both must be given together and be a
-- real place on Earth. Nothing is stored in a new column: the numbers travel inside the address / order contact details, which
-- already keep everything else about the address, so nothing existing changes and only the person (and the shop, for their orders)
-- can ever see them. This only replaces the function that checks and tidies contact details. Safe to run more than once.

create or replace function public.clean_shop_contact(c jsonb, p_strict boolean, p_delivery boolean) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  keys text[] := array['fullName', 'phone', 'altPhone', 'email', 'addressLine1', 'addressLine2', 'landmark', 'city', 'state', 'pincode', 'deliveryNotes'];
  maxlen integer[] := array[80, 20, 20, 120, 150, 150, 100, 80, 80, 10, 300];
  labels text[] := array['Full name', 'Phone number', 'Alternate phone', 'Email', 'Address line 1', 'Address line 2', 'Landmark', 'City', 'State', 'Pincode', 'Delivery notes'];
  out jsonb := '{}'::jsonb; i integer; v text; digits integer; lat_text text; lng_text text; lat numeric; lng numeric;
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

  -- the pin on the map (optional): both numbers or neither, and a real place (rounded to about a tenth of a metre)
  lat_text := btrim(coalesce(c->>'lat', ''));
  lng_text := btrim(coalesce(c->>'lng', ''));
  if lat_text <> '' or lng_text <> '' then
    if lat_text !~ '^-?[0-9]{1,3}(\.[0-9]{1,15})?$' or lng_text !~ '^-?[0-9]{1,3}(\.[0-9]{1,15})?$' then
      raise exception 'The map pin is not a valid location.';
    end if;
    lat := lat_text::numeric;
    lng := lng_text::numeric;
    if lat < -90 or lat > 90 or lng < -180 or lng > 180 then raise exception 'The map pin is not a valid location.'; end if;
    out := out || jsonb_build_object('lat', round(lat, 6), 'lng', round(lng, 6));
  end if;

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
