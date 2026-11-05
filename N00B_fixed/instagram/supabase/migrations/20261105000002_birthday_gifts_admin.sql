-- Birthday gifts, managed by the administrator.
--   * The gifts were fixed inside a function (100-7,000 points, a few shop items, a few coupons): now they are a LIST the administrator can see, change, add to and remove from
--     (Admin panel -> Gifts). Each gift has a kind (points / shop item / coupon), a value, a name and a "weight" (how often it comes up compared with the others).
--   * ADD-ONS: extra rewards that come WITH the gift (for example +5,000,000 points, or a coupon), each with its own chance (1-100 %). Switch them on, off, add or remove them.
--   * HISTORY: who got which gift (and add-ons), on what date and time, and when they scratched it.
--   * The prizes are much bigger than before (points are in the millions now, like everything else in NOOB): 10 million up to a 1 billion jackpot.
-- Nothing already given is touched (every card keeps the gift it was made with). Safe to run more than once.

-- ---------------------------------------------------------------------------------------------------- the lists
create table if not exists public.birthday_gifts (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('points', 'shop_item', 'coupon')),
  value      text,                                   -- points: the amount; coupon: the percent off; shop item: the item's id (empty = a random item of the shop)
  label      text not null,
  weight     integer not null default 1 check (weight between 0 and 10000),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.birthday_addons (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('points', 'shop_item', 'coupon')),
  value          text,
  label          text not null,
  chance_percent integer not null default 100 check (chance_percent between 1 and 100),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.birthday_gifts enable row level security;
alter table public.birthday_addons enable row level security;
revoke all on public.birthday_gifts, public.birthday_addons from anon, authenticated;   -- only the functions below (run as the database) read or change them

-- The first list (only when there is none yet): much bigger than the old 100-7,000 points.
insert into public.birthday_gifts (kind, value, label, weight)
select v.kind, v.value, v.label, v.weight from (values
  ('points',    '10000000',   '10,000,000 NOOB Points',    30),
  ('points',    '25000000',   '25,000,000 NOOB Points',    25),
  ('points',    '50000000',   '50,000,000 NOOB Points',    18),
  ('points',    '100000000',  '100,000,000 NOOB Points',   10),
  ('points',    '250000000',  '250,000,000 NOOB Points',    5),
  ('points',    '500000000',  '500,000,000 NOOB Points',    2),
  ('points',    '1000000000', '🎉 JACKPOT: 1,000,000,000 NOOB Points', 1),
  ('shop_item', null,         'A free item from the Sticker Shop', 12),
  ('coupon',    '20',         '20% Off NOOB Pro / Verification',  6),
  ('coupon',    '30',         '30% Off NOOB Pro / Verification',  4),
  ('coupon',    '50',         '50% Off NOOB Pro / Verification',  3),
  ('coupon',    '70',         '70% Off NOOB Pro / Verification',  2),
  ('coupon',    '100',        '100% Off NOOB Pro / Verification', 1)
) as v(kind, value, label, weight)
where not exists (select 1 from public.birthday_gifts);

-- ---------------------------------------------------------------------------------------------------- picking a gift
-- One reward, as the scratch card stores it: { type, value, label }. A shop item without a fixed id is a random item; with none to give it becomes 10,000,000 points.
create or replace function public.birthday_item_json(p_kind text, p_value text, p_label text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare it public.shop_items; amt bigint;
begin
  if p_kind = 'points' then
    amt := coalesce(nullif(btrim(p_value), '')::bigint, 10000000);
    return jsonb_build_object('type', 'points', 'value', amt, 'label', coalesce(nullif(btrim(p_label), ''), public.fmt_points(amt) || ' NOOB Points'));
  elsif p_kind = 'coupon' then
    return jsonb_build_object('type', 'coupon', 'value', coalesce(nullif(btrim(p_value), '')::numeric, 20), 'label', coalesce(nullif(btrim(p_label), ''), p_value || '% Off NOOB Pro / Verification'));
  elsif p_kind = 'shop_item' then
    if nullif(btrim(p_value), '') is not null then select * into it from public.shop_items where id::text = btrim(p_value);
    else select * into it from public.shop_items order by random() limit 1; end if;
    if it.id is not null then return jsonb_build_object('type', 'shop_item', 'value', it.id, 'label', it.name); end if;
  end if;
  return jsonb_build_object('type', 'points', 'value', 10000000, 'label', public.fmt_points(10000000) || ' NOOB Points');
exception when others then
  return jsonb_build_object('type', 'points', 'value', 10000000, 'label', public.fmt_points(10000000) || ' NOOB Points');
end;
$$;
revoke execute on function public.birthday_item_json(text, text, text) from public, anon, authenticated;

-- The gift of one birthday: one of the active gifts (chosen by weight) plus the add-ons whose chance comes up. Nobody but the administrator sees the list.
create or replace function public.pick_birthday_gift() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare g public.birthday_gifts; total integer; r integer; acc integer := 0; res jsonb; a public.birthday_addons; adds jsonb := '[]'::jsonb;
begin
  select coalesce(sum(weight), 0) into total from public.birthday_gifts where active and weight > 0;
  if total = 0 then
    res := public.birthday_item_json('points', '10000000', null);
  else
    r := floor(random() * total)::integer;
    for g in select * from public.birthday_gifts where active and weight > 0 order by created_at, id loop
      acc := acc + g.weight;
      if r < acc then exit; end if;
    end loop;
    res := public.birthday_item_json(g.kind, g.value, g.label);
  end if;
  for a in select * from public.birthday_addons where active order by created_at, id loop
    if random() * 100 < a.chance_percent then adds := adds || jsonb_build_array(public.birthday_item_json(a.kind, a.value, a.label)); end if;
  end loop;
  if jsonb_array_length(adds) > 0 then res := res || jsonb_build_object('addons', adds); end if;
  return res;
end;
$$;
revoke execute on function public.pick_birthday_gift() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------- giving a gift
-- Gives one reward to a person (points, a shop item, a coupon).
create or replace function public.give_birthday_item(p_user uuid, p_item jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare owned text[]; code text; t text := p_item->>'type';
begin
  if t = 'points' then
    perform public.apply_points(p_user, (p_item->>'value')::bigint, '🎂 Birthday gift: ' || (p_item->>'label'));
  elsif t = 'shop_item' then
    select purchased_item_ids into owned from public.profiles where id = p_user for update;
    if (p_item->>'value') = any(coalesce(owned, '{}')) then
      perform public.apply_points(p_user, 2000, '🎂 Birthday gift (already owned "' || (p_item->>'label') || '", converted to points)');
    else
      update public.profiles set purchased_item_ids = array_append(purchased_item_ids, p_item->>'value') where id = p_user;
    end if;
  elsif t = 'coupon' then
    code := 'BDAY' || round((p_item->>'value')::numeric)::text || (100 + floor(random() * 900))::int::text;
    insert into public.coupons (code, title, type, discount_percent, terms, target_user_id, usage_limit, active)
    values (code, 'Birthday Gift: ' || (p_item->>'label'), 'discount', (p_item->>'value')::numeric,
            array['One-time use', 'Valid on NOOB Pro or verification purchase'], p_user, 'once', true);
  end if;
end;
$$;
revoke execute on function public.give_birthday_item(uuid, jsonb) from public, anon, authenticated;

-- Scratching the card gives the gift AND every add-on that came with it (same as before for a card with no add-ons).
create or replace function public.reveal_scratch_card(p_card uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); card public.scratch_cards; g jsonb; a jsonb;
begin
  select * into card from public.scratch_cards where id = p_card for update;
  if not found then raise exception 'Scratch card not found.'; end if;
  if card.user_id <> me then raise exception 'This scratch card is not yours.' using errcode = '42501'; end if;
  g := card.gift;
  if card.is_revealed then return jsonb_build_object('success', true, 'gift', g, 'alreadyRevealed', true); end if;
  perform public.give_birthday_item(me, g);
  if jsonb_typeof(g->'addons') = 'array' then
    for a in select * from jsonb_array_elements(g->'addons') loop perform public.give_birthday_item(me, a); end loop;
  end if;
  update public.scratch_cards set is_revealed = true, revealed_at = now() where id = p_card;
  return jsonb_build_object('success', true, 'gift', g, 'user', public.get_my_user());
end;
$$;

-- ---------------------------------------------------------------------------------------------------- the administrator's page
-- Everything the page shows: the gifts, the add-ons and the history (newest first).
create or replace function public.admin_birthday_overview(p_limit integer default 200) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare lim integer := greatest(1, least(coalesce(p_limit, 200), 1000));
begin
  if not public.is_master_admin() then raise exception 'Access denied. Administrator privileges required.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'gifts', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'kind', g.kind, 'value', g.value, 'label', g.label, 'weight', g.weight, 'active', g.active) order by g.created_at, g.id) from public.birthday_gifts g), '[]'::jsonb),
    'addons', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'value', a.value, 'label', a.label, 'chance', a.chance_percent, 'active', a.active) order by a.created_at, a.id) from public.birthday_addons a), '[]'::jsonb),
    'shopItems', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.sort) from public.shop_items s), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(h.j order by h.at desc) from (
        select c.created_at as at, jsonb_build_object('cardId', c.id, 'userId', c.user_id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar,
                                                      'gift', c.gift, 'givenAt', c.created_at, 'revealed', c.is_revealed, 'revealedAt', c.revealed_at) as j
        from public.scratch_cards c left join public.profiles p on p.id = c.user_id
        order by c.created_at desc limit lim) h), '[]'::jsonb),
    'totals', jsonb_build_object('given', (select count(*) from public.scratch_cards), 'revealed', (select count(*) from public.scratch_cards where is_revealed)));
end;
$$;
revoke execute on function public.admin_birthday_overview(integer) from public, anon;
grant execute on function public.admin_birthday_overview(integer) to authenticated;

-- Checks one gift / add-on and returns the clean values (raises a plain sentence when something is wrong).
create or replace function public.birthday_check_item(p_kind text, p_value text, p_label text, out o_value text, out o_label text)
language plpgsql stable security definer set search_path = public as $$
declare k text := lower(btrim(coalesce(p_kind, ''))); v text := nullif(btrim(coalesce(p_value, '')), ''); amt numeric; it public.shop_items;
begin
  if k not in ('points', 'shop_item', 'coupon') then raise exception 'Choose what the gift is: points, a shop item or a coupon.'; end if;
  if k = 'points' then
    begin amt := replace(v, ',', '')::numeric; exception when others then amt := null; end;
    if amt is null or amt < 1 or amt > 100000000000 or amt <> trunc(amt) then raise exception 'Points must be a whole number from 1 to 100,000,000,000.'; end if;
    o_value := trunc(amt)::text; o_label := coalesce(nullif(btrim(p_label), ''), public.fmt_points(trunc(amt)::bigint) || ' NOOB Points');
  elsif k = 'coupon' then
    begin amt := v::numeric; exception when others then amt := null; end;
    if amt is null or amt < 1 or amt > 100 then raise exception 'A coupon is 1 to 100 percent off.'; end if;
    o_value := trunc(amt)::text; o_label := coalesce(nullif(btrim(p_label), ''), trunc(amt)::text || '% Off NOOB Pro / Verification');
  else
    if v is not null then
      select * into it from public.shop_items where id::text = v;
      if it.id is null then raise exception 'That shop item does not exist.'; end if;
      o_value := it.id::text; o_label := coalesce(nullif(btrim(p_label), ''), it.name);
    else
      o_value := null; o_label := coalesce(nullif(btrim(p_label), ''), 'A free item from the Sticker Shop');
    end if;
  end if;
  if length(o_label) > 80 then raise exception 'The name is too long (80 letters at most).'; end if;
end;
$$;
revoke execute on function public.birthday_check_item(text, text, text) from public, anon, authenticated;

-- Add a gift (no id) or change one (with its id).
create or replace function public.admin_birthday_save_gift(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare gid uuid := nullif(p->>'id', '')::uuid; k text := lower(btrim(coalesce(p->>'kind', ''))); chk record; w integer; act boolean;
begin
  if not public.is_master_admin() then raise exception 'Access denied. Administrator privileges required.' using errcode = '42501'; end if;
  select * into chk from public.birthday_check_item(k, p->>'value', p->>'label');
  w := coalesce(nullif(p->>'weight', '')::integer, 1);
  if w < 0 or w > 10000 then raise exception 'How often (weight) must be from 0 to 10000.'; end if;
  act := coalesce((p->>'active')::boolean, true);
  if gid is null then
    insert into public.birthday_gifts (kind, value, label, weight, active) values (k, chk.o_value, chk.o_label, w, act) returning id into gid;
  else
    update public.birthday_gifts set kind = k, value = chk.o_value, label = chk.o_label, weight = w, active = act, updated_at = now() where id = gid;
    if not found then raise exception 'That gift no longer exists.'; end if;
  end if;
  perform public.log_admin_action('birthday_gift_saved', null, jsonb_build_object('giftId', gid, 'kind', k, 'value', chk.o_value, 'weight', w, 'active', act));
  return public.admin_birthday_overview(1);
end;
$$;
revoke execute on function public.admin_birthday_save_gift(jsonb) from public, anon;
grant execute on function public.admin_birthday_save_gift(jsonb) to authenticated;

create or replace function public.admin_birthday_delete_gift(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_master_admin() then raise exception 'Access denied. Administrator privileges required.' using errcode = '42501'; end if;
  delete from public.birthday_gifts where id = p_id;
  perform public.log_admin_action('birthday_gift_removed', null, jsonb_build_object('giftId', p_id));
  return public.admin_birthday_overview(1);
end;
$$;
revoke execute on function public.admin_birthday_delete_gift(uuid) from public, anon;
grant execute on function public.admin_birthday_delete_gift(uuid) to authenticated;

-- Add-ons: same, with a chance instead of a weight.
create or replace function public.admin_birthday_save_addon(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare aid uuid := nullif(p->>'id', '')::uuid; k text := lower(btrim(coalesce(p->>'kind', ''))); chk record; ch integer; act boolean;
begin
  if not public.is_master_admin() then raise exception 'Access denied. Administrator privileges required.' using errcode = '42501'; end if;
  select * into chk from public.birthday_check_item(k, p->>'value', p->>'label');
  ch := coalesce(nullif(p->>'chance', '')::integer, 100);
  if ch < 1 or ch > 100 then raise exception 'The chance must be from 1 to 100 percent.'; end if;
  act := coalesce((p->>'active')::boolean, true);
  if aid is null then
    insert into public.birthday_addons (kind, value, label, chance_percent, active) values (k, chk.o_value, chk.o_label, ch, act) returning id into aid;
  else
    update public.birthday_addons set kind = k, value = chk.o_value, label = chk.o_label, chance_percent = ch, active = act, updated_at = now() where id = aid;
    if not found then raise exception 'That add-on no longer exists.'; end if;
  end if;
  perform public.log_admin_action('birthday_addon_saved', null, jsonb_build_object('addonId', aid, 'kind', k, 'value', chk.o_value, 'chance', ch, 'active', act));
  return public.admin_birthday_overview(1);
end;
$$;
revoke execute on function public.admin_birthday_save_addon(jsonb) from public, anon;
grant execute on function public.admin_birthday_save_addon(jsonb) to authenticated;

create or replace function public.admin_birthday_delete_addon(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_master_admin() then raise exception 'Access denied. Administrator privileges required.' using errcode = '42501'; end if;
  delete from public.birthday_addons where id = p_id;
  perform public.log_admin_action('birthday_addon_removed', null, jsonb_build_object('addonId', p_id));
  return public.admin_birthday_overview(1);
end;
$$;
revoke execute on function public.admin_birthday_delete_addon(uuid) from public, anon;
grant execute on function public.admin_birthday_delete_addon(uuid) to authenticated;
