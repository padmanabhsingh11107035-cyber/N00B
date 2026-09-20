-- NOOB — Supabase phase 8: the shop's ADDRESS BOOK.
-- Everyone can save several delivery addresses (up to 10), mark one as their default, edit or remove them, and pick one at
-- checkout. Addresses are personal: only their owner can ever read them (nobody, not even other signed-in users, can read the
-- table; the owner reaches it through the functions below). Any address already saved with the shop details is carried over as
-- the person's first (default) address. Safe to run more than once. Nothing else is changed.

create table if not exists public.shop_addresses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  label      text not null default '' check (char_length(label) <= 30),   -- "Home", "Work"... (optional)
  details    jsonb not null default '{}',                                  -- fullName, phone, altPhone, addressLine1/2, landmark, city, state, pincode, deliveryNotes
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shop_addresses_user_idx on public.shop_addresses (user_id, created_at);
-- at most ONE default address per person, enforced by the database itself
create unique index if not exists shop_addresses_one_default_idx on public.shop_addresses (user_id) where is_default;

alter table public.shop_addresses enable row level security;
revoke all on public.shop_addresses from anon, authenticated;
grant all on public.shop_addresses to service_role;

-- What the app receives for one address.
create or replace function public.shop_address_json(a public.shop_addresses) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('id', a.id, 'label', a.label, 'isDefault', a.is_default, 'updatedAt', a.updated_at) || a.details;
$$;

-- The signed-in person's addresses: the default first, then in the order they were added.
create or replace function public.my_shop_addresses() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.acting_user();
begin
  return jsonb_build_object('success', true, 'addresses', coalesce((
    select jsonb_agg(public.shop_address_json(a) order by a.is_default desc, a.created_at)
    from public.shop_addresses a where a.user_id = me), '[]'::jsonb));
end;
$$;

-- Add an address, or change one when p.id is given.
--   p = { id?, label?, makeDefault?, fullName, phone, altPhone?, addressLine1, addressLine2?, landmark?, city, state, pincode, deliveryNotes? }
-- The first address a person saves becomes their default automatically.
create or replace function public.save_shop_address(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.acting_user(); d jsonb; lab text; want_default boolean; addr public.shop_addresses; aid uuid; n integer;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Enter the address details.'; end if;
  lab := btrim(coalesce(p->>'label', ''));
  if length(lab) > 30 then raise exception 'The address name can be at most 30 characters.'; end if;
  -- name, phone, street, city, state and pincode are required (and checked) for a delivery address
  d := public.clean_shop_contact(p - 'email', true, true) - 'email';
  want_default := coalesce(p->>'makeDefault', '') = 'true';
  if coalesce(p->>'id', '') <> '' then
    if p->>'id' !~* '^[0-9a-f-]{36}$' then raise exception 'Address not found.'; end if;
    aid := (p->>'id')::uuid;
  end if;

  perform 1 from public.profiles where id = me for update;   -- one change at a time per person (keeps "one default" and "at most 10" exact)
  select count(*) into n from public.shop_addresses where user_id = me;

  if aid is null then
    if n >= 10 then raise exception 'You can save up to 10 addresses. Remove one to add another.'; end if;
    if want_default or n = 0 then update public.shop_addresses set is_default = false where user_id = me and is_default; end if;
    insert into public.shop_addresses (user_id, label, details, is_default) values (me, lab, d, want_default or n = 0) returning * into addr;
  else
    select * into addr from public.shop_addresses where id = aid and user_id = me for update;
    if not found then raise exception 'Address not found.'; end if;
    if want_default and not addr.is_default then update public.shop_addresses set is_default = false where user_id = me and is_default; end if;
    update public.shop_addresses set label = lab, details = d, is_default = (addr.is_default or want_default), updated_at = now()
    where id = aid returning * into addr;
  end if;

  return jsonb_build_object('success', true, 'address', public.shop_address_json(addr), 'addresses', coalesce((
    select jsonb_agg(public.shop_address_json(a) order by a.is_default desc, a.created_at) from public.shop_addresses a where a.user_id = me), '[]'::jsonb));
end;
$$;

create or replace function public.set_default_shop_address(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user();
begin
  perform 1 from public.profiles where id = me for update;
  if not exists (select 1 from public.shop_addresses where id = p_id and user_id = me) then raise exception 'Address not found.'; end if;
  update public.shop_addresses set is_default = false where user_id = me and is_default and id <> p_id;
  update public.shop_addresses set is_default = true, updated_at = now() where id = p_id and not is_default;
  return jsonb_build_object('success', true, 'addresses', coalesce((
    select jsonb_agg(public.shop_address_json(a) order by a.is_default desc, a.created_at) from public.shop_addresses a where a.user_id = me), '[]'::jsonb));
end;
$$;

-- Remove an address. If it was the default, the most recently added one that is left becomes the default.
create or replace function public.delete_shop_address(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); addr public.shop_addresses;
begin
  perform 1 from public.profiles where id = me for update;
  select * into addr from public.shop_addresses where id = p_id and user_id = me for update;
  if not found then raise exception 'Address not found.'; end if;
  delete from public.shop_addresses where id = p_id;
  if addr.is_default then
    update public.shop_addresses set is_default = true
    where id = (select id from public.shop_addresses where user_id = me order by created_at desc limit 1);
  end if;
  return jsonb_build_object('success', true, 'addresses', coalesce((
    select jsonb_agg(public.shop_address_json(a) order by a.is_default desc, a.created_at) from public.shop_addresses a where a.user_id = me), '[]'::jsonb));
end;
$$;

-- Carry over: an address already saved with the shop details becomes the person's first (default) address.
insert into public.shop_addresses (user_id, label, details, is_default)
select s.user_id, 'Home',
       jsonb_build_object(
         'fullName', coalesce(s.details->>'fullName', ''), 'phone', coalesce(s.details->>'phone', ''), 'altPhone', coalesce(s.details->>'altPhone', ''),
         'addressLine1', coalesce(s.details->>'addressLine1', ''), 'addressLine2', coalesce(s.details->>'addressLine2', ''),
         'landmark', coalesce(s.details->>'landmark', ''), 'city', coalesce(s.details->>'city', ''), 'state', coalesce(s.details->>'state', ''),
         'pincode', coalesce(s.details->>'pincode', ''), 'deliveryNotes', coalesce(s.details->>'deliveryNotes', '')),
       true
from public.shop_details s
where btrim(coalesce(s.details->>'addressLine1', '')) <> ''
  and not exists (select 1 from public.shop_addresses a where a.user_id = s.user_id);

-- Who may call what
revoke execute on function public.my_shop_addresses(), public.save_shop_address(jsonb), public.set_default_shop_address(uuid), public.delete_shop_address(uuid)
  from public, anon;
grant execute on function public.my_shop_addresses(), public.save_shop_address(jsonb), public.set_default_shop_address(uuid), public.delete_shop_address(uuid)
  to authenticated, service_role;
revoke execute on function public.shop_address_json(public.shop_addresses) from public, anon, authenticated;
