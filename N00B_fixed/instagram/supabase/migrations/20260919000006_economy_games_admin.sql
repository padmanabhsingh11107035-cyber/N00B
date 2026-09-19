-- NOOB — Supabase phase 3: the points economy, games, shop, coupons, Pro, verification, safety reports,
-- support ratings, contact matching, push registration and every admin tool.
--
-- Same rules as the earlier phases:
--   * nothing is written by the browser directly — every change goes through a function that checks who is
--     asking (points, Pro, verification and suspension can never be set from a client);
--   * each function that moves points locks the rows it touches, so two taps at once can't double-spend;
--   * every internal helper is locked away from browsers at the bottom of this file.
-- Safe to run more than once.

-- ===========================================================================
-- 1. Schema changes and new tables
-- ===========================================================================

-- Survival games pay up to 3,600 seconds x 1,000,000 = 3.6 billion, which does not fit an integer.
alter table public.game_scores alter column score type bigint;

-- Coupons: "once per account" limits, a list of terms, and who has already used one.
alter table public.coupons add column if not exists usage_limit text not null default 'unlimited';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'coupons_usage_limit_check') then
    alter table public.coupons add constraint coupons_usage_limit_check check (usage_limit in ('once', 'unlimited'));
  end if;
end $$;
alter table public.coupons alter column type set default 'discount';
do $$ begin
  if (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'coupons' and column_name = 'terms') = 'text' then
    alter table public.coupons alter column terms type text[]
      using case when terms is null or btrim(terms) in ('', '[]') then '{}'::text[] else string_to_array(terms, E'\n') end;
  end if;
end $$;
alter table public.coupons alter column terms set default '{}';
update public.coupons set terms = '{}' where terms is null;
alter table public.coupons alter column terms set not null;

create table if not exists public.coupon_uses (
  coupon_id uuid not null references public.coupons (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  used_at   timestamptz not null default now(),
  primary key (coupon_id, user_id)
);

-- The points-redemption catalogue (stickers / GIFs / emoji packs).
create table if not exists public.shop_items (
  id        text primary key,
  name      text not null,
  type      text not null check (type in ('sticker', 'gif', 'emoji')),
  content   text not null,
  asset_url text,
  price     bigint not null check (price > 0),
  category  text not null,
  sort      integer not null
);
insert into public.shop_items (id, name, type, content, asset_url, price, category, sort) values
  ('shop_fire_king', 'Fire King', 'sticker', '🔥👑', null, 1000, 'Reactions', 1),
  ('shop_gg_ez', 'GG EZ', 'sticker', '🎮🏆', null, 1000, 'Reactions', 2),
  ('shop_mind_blown_gold', 'Golden Mind Blown', 'sticker', '🤯✨', null, 1200, 'Reactions', 3),
  ('shop_savage_laugh', 'Savage Laugh', 'sticker', '😹🔥', null, 1200, 'Reactions', 4),
  ('shop_heart_eyes_royal', 'Royal Heart Eyes', 'sticker', '😍👑', null, 1500, 'Reactions', 5),
  ('shop_shadow_wink', 'Shadow Wink', 'sticker', '😏🖤', null, 1500, 'Reactions', 6),
  ('shop_cool_swag', 'Ultra Swag', 'sticker', '😎💫', null, 1800, 'Reactions', 7),
  ('shop_clap_gold', 'Golden Applause', 'sticker', '👏🏅', null, 2000, 'Reactions', 8),
  ('shop_gif_confetti_rain', 'Confetti Rain', 'gif', '🎊🎉🎊', 'https://i.giphy.com/media/BPJmthQ3YRwD6QqcVD/giphy.gif', 2500, 'GIF Packs', 9),
  ('shop_gif_neon_pulse', 'Neon Pulse', 'gif', '💚⚡💚', 'https://i.giphy.com/media/xUPGcguWZHRC2HyBRS/giphy.gif', 2800, 'GIF Packs', 10),
  ('shop_gif_fireworks', 'Fireworks Show', 'gif', '🎆🎇🎆', 'https://i.giphy.com/media/xT5LMHxhOfscxPfIfm/giphy.gif', 3200, 'GIF Packs', 11),
  ('shop_gif_money_rain', 'Money Rain', 'gif', '💸💰💸', 'https://i.giphy.com/media/xT0xezQGU5xCDJuCPe/giphy.gif', 3500, 'GIF Packs', 12),
  ('shop_gif_disco_ball', 'Disco Night', 'gif', '🪩✨🪩', 'https://i.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif', 3800, 'GIF Packs', 13),
  ('shop_gif_flame_trail', 'Flame Trail', 'gif', '🔥💨🔥', 'https://i.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif', 4000, 'GIF Packs', 14),
  ('shop_gif_galaxy_spin', 'Galaxy Spin', 'gif', '🌌🌀🌌', 'https://i.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif', 4500, 'GIF Packs', 15),
  ('shop_gif_trophy_shine', 'Trophy Shine', 'gif', '🏆✨🏆', 'https://i.giphy.com/media/26u4cqiYI30juCOGY/giphy.gif', 5000, 'GIF Packs', 16),
  ('shop_legend_crown_diamond', 'Legendary Crown', 'emoji', '👑💎', null, 6000, 'Legendary', 17),
  ('shop_legend_dragon', 'Dragon''s Roar', 'emoji', '🐉🔥', null, 6500, 'Legendary', 18),
  ('shop_legend_phoenix', 'Rising Phoenix', 'emoji', '🦅🔥', null, 7000, 'Legendary', 19),
  ('shop_legend_lightning_god', 'Storm God', 'emoji', '⚡👁️', null, 7500, 'Legendary', 20),
  ('shop_legend_galaxy_king', 'Galaxy King', 'emoji', '👑🌌', null, 8000, 'Legendary', 21),
  ('shop_legend_diamond_hands', 'Diamond Hands', 'emoji', '💎🙌', null, 8500, 'Legendary', 22),
  ('shop_legend_infinity', 'Infinity Champion', 'emoji', '♾️🏆', null, 9000, 'Legendary', 23),
  ('shop_legend_noob_god', 'NOOB God Mode', 'emoji', '👑⚡👑', null, 10000, 'Legendary', 24)
on conflict (id) do nothing;

-- Animated profile pictures (a NOOB Pro perk); the .svg files ship with the website.
create table if not exists public.live_avatar_presets (
  id   text primary key,
  name text not null,
  url  text not null,
  sort integer not null
);
insert into public.live_avatar_presets (id, name, url, sort) values
  ('neon_pulse', 'Neon Pulse', '/live-avatars/neon-pulse.svg', 1),
  ('orbit_glow', 'Orbit Glow', '/live-avatars/orbit-glow.svg', 2),
  ('aurora_wave', 'Aurora Wave', '/live-avatars/aurora-wave.svg', 3),
  ('heartbeat_pulse', 'Heartbeat', '/live-avatars/heartbeat-pulse.svg', 4),
  ('starfield', 'Starfield', '/live-avatars/starfield.svg', 5),
  ('fire_ring', 'Fire Ring', '/live-avatars/fire-ring.svg', 6),
  ('ripple_effect', 'Ripple', '/live-avatars/ripple-effect.svg', 7),
  ('electric_spark', 'Electric Spark', '/live-avatars/electric-spark.svg', 8),
  ('galaxy_spiral', 'Galaxy Spiral', '/live-avatars/galaxy-spiral.svg', 9),
  ('rainbow_ring', 'Rainbow Ring', '/live-avatars/rainbow-ring.svg', 10),
  ('diamond_shine', 'Diamond Shine', '/live-avatars/diamond-shine.svg', 11),
  ('sound_wave', 'Sound Wave', '/live-avatars/sound-wave.svg', 12),
  ('frost_crystal', 'Frost Crystal', '/live-avatars/frost-crystal.svg', 13),
  ('gold_coin_spin', 'Gold Coin', '/live-avatars/gold-coin-spin.svg', 14),
  ('diamond_prism', 'Diamond Prism', '/live-avatars/diamond-prism.svg', 15),
  ('holographic_foil', 'Holographic', '/live-avatars/holographic-foil.svg', 16),
  ('chrome_liquid', 'Chrome Liquid', '/live-avatars/chrome-liquid.svg', 17),
  ('royal_crown', 'Royal Crown', '/live-avatars/royal-crown.svg', 18),
  ('platinum_ring', 'Platinum Ring', '/live-avatars/platinum-ring.svg', 19),
  ('emerald_cut', 'Emerald Cut', '/live-avatars/emerald-cut.svg', 20),
  ('ruby_heart', 'Ruby Heart', '/live-avatars/ruby-heart.svg', 21),
  ('sapphire_swirl', 'Sapphire Swirl', '/live-avatars/sapphire-swirl.svg', 22),
  ('amethyst_bloom', 'Amethyst Bloom', '/live-avatars/amethyst-bloom.svg', 23),
  ('rose_gold_shimmer', 'Rose Gold', '/live-avatars/rose-gold-shimmer.svg', 24),
  ('peacock_feather', 'Peacock Feather', '/live-avatars/peacock-feather.svg', 25),
  ('butterfly_wings', 'Butterfly Wings', '/live-avatars/butterfly-wings.svg', 26),
  ('phoenix_flame', 'Phoenix Flame', '/live-avatars/phoenix-flame.svg', 27),
  ('cosmic_nebula', 'Cosmic Nebula', '/live-avatars/cosmic-nebula.svg', 28),
  ('crystal_ball', 'Crystal Ball', '/live-avatars/crystal-ball.svg', 29),
  ('prism_burst', 'Prism Burst', '/live-avatars/prism-burst.svg', 30),
  ('champagne_bubbles', 'Champagne', '/live-avatars/champagne-bubbles.svg', 31),
  ('opal_glow', 'Opal Glow', '/live-avatars/opal-glow.svg', 32),
  ('velvet_royale', 'Velvet Royale', '/live-avatars/velvet-royale.svg', 33),
  ('infinity_gold', 'Infinity Gold', '/live-avatars/infinity-gold.svg', 34)
on conflict (id) do nothing;

-- The physical-goods store (admin-added products).
create table if not exists public.store_products (
  id          uuid primary key default gen_random_uuid(),
  legacy_id   text unique,
  price       numeric not null check (price > 0),
  description text not null,
  media       jsonb not null default '[]',
  in_stock    boolean not null default true,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Birthday gifts waiting to be scratched.
create table if not exists public.scratch_cards (
  id          uuid primary key default gen_random_uuid(),
  legacy_id   text unique,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  gift        jsonb not null,
  is_revealed boolean not null default false,
  revealed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists scratch_cards_user_idx on public.scratch_cards (user_id);

-- Safety reports (readable only through admin functions).
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  legacy_id   text unique,
  reporter_id uuid references public.profiles (id) on delete set null,
  target_id   uuid not null references public.profiles (id) on delete cascade,
  reason      text not null default 'Cyber Bullying & Harassment',
  details     text not null default '',
  status      text not null default 'pending_review',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists reports_created_idx on public.reports (created_at desc);

-- Live two-player matches and the matchmaking queue (short-lived; cleaned up automatically).
create table if not exists public.game_rooms (
  code       text primary key,
  game_id    text not null,
  game_title text not null,
  status     text not null default 'waiting' check (status in ('waiting', 'ready', 'finished')),
  players    jsonb not null default '[]',
  results    jsonb not null default '{}',
  outcome    jsonb,
  board      jsonb,
  turn       uuid,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.matchmaking_queue (
  user_id           uuid primary key references public.profiles (id) on delete cascade,
  game_id           text not null,
  matched_room_code text,
  joined_at         timestamptz not null default now()
);

-- Chess Blitz weekly limits (kept away from the profile so a browser can't touch them).
create table if not exists public.user_game_state (
  user_id               uuid primary key references public.profiles (id) on delete cascade,
  last_chess_blitz_at   timestamptz,
  chess_blitz_timestamps timestamptz[] not null default '{}',
  chess_round_ready     boolean not null default false
);

alter table public.coupon_uses         enable row level security;
alter table public.shop_items          enable row level security;
alter table public.live_avatar_presets enable row level security;
alter table public.store_products      enable row level security;
alter table public.scratch_cards       enable row level security;
alter table public.reports             enable row level security;
alter table public.game_rooms          enable row level security;
alter table public.matchmaking_queue   enable row level security;
alter table public.user_game_state     enable row level security;

drop policy if exists shop_items_select on public.shop_items;
create policy shop_items_select on public.shop_items for select to authenticated using (true);
drop policy if exists live_avatar_presets_select on public.live_avatar_presets;
create policy live_avatar_presets_select on public.live_avatar_presets for select to authenticated using (true);
drop policy if exists store_products_select on public.store_products;
create policy store_products_select on public.store_products for select to authenticated using (true);
drop policy if exists scratch_cards_select on public.scratch_cards;
create policy scratch_cards_select on public.scratch_cards for select to authenticated using (user_id = auth.uid());

-- ===========================================================================
-- 2. Helpers (internal ones are locked away from browsers at the bottom)
-- ===========================================================================

create or replace function public.fmt_points(n bigint) returns text
language sql immutable set search_path = public as $$
  select to_char(coalesce(n, 0), 'FM999,999,999,999,999,999,999');
$$;

-- The signed-in, non-suspended person making this call.
create or replace function public.acting_user() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if exists (select 1 from public.profiles where id = me and is_suspended) then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;
  return me;
end;
$$;

-- The NOOB administrator (the old "master admin": any admin, or the account named NOOB).
create or replace function public.require_master_admin(p_msg text default 'Access denied. Administrator privileges required.') returns uuid
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or not exists (
    select 1 from public.profiles where id = me and (is_admin or lower(username) = 'noob') and not is_suspended
  ) then
    raise exception '%', p_msg using errcode = '42501';
  end if;
  return me;
end;
$$;

create or replace function public.noob_admin_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.profiles where lower(username) = 'noob' or is_admin order by (lower(username) = 'noob') desc, created_at limit 1;
$$;

-- Adds (or removes) points and writes the wallet history line. Never lets a balance go below zero.
-- Returns the change that was actually applied.
create or replace function public.apply_points(p_user uuid, p_delta bigint, p_reason text) returns bigint
language plpgsql security definer set search_path = public as $$
declare before_pts bigint; after_pts bigint;
begin
  select noob_points into before_pts from public.profiles where id = p_user for update;
  if not found then return 0; end if;
  after_pts := greatest(0, before_pts + p_delta);
  if after_pts = before_pts then return 0; end if;
  update public.profiles set noob_points = after_pts where id = p_user;
  insert into public.noob_transactions (user_id, amount, reason, balance_after)
  values (p_user, after_pts - before_pts, p_reason, after_pts);
  return after_pts - before_pts;
end;
$$;

-- Everything a game needs to show about a player.
create or replace function public.game_player_json(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('userId', p.id, 'username', p.username,
    'displayName', coalesce(nullif(p.display_name, ''), p.username),
    'avatar', coalesce(nullif(p.avatar, ''), '/noob-logo.svg.jpeg'))
  from public.profiles p where p.id = p_user;
$$;

-- ===========================================================================
-- 3. Coupons
-- ===========================================================================

create or replace function public.coupon_json(c public.coupons, viewer uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', c.id, 'code', c.code, 'title', coalesce(c.title, ''), 'type', coalesce(c.type, 'discount'),
    'discountPercent', coalesce(c.discount_percent, 0), 'terms', to_jsonb(coalesce(c.terms, '{}'::text[])),
    'targetUsername', (select p.username from public.profiles p where p.id = c.target_user_id),
    'usageLimit', c.usage_limit,
    'usedCount', (select count(*) from public.coupon_uses u where u.coupon_id = c.id),
    'usedByMe', exists (select 1 from public.coupon_uses u where u.coupon_id = c.id and u.user_id = viewer),
    'createdAt', c.created_at, 'active', c.active);
$$;

-- An active discount coupon this person may use right now (global, or made for them; not already spent if single-use).
create or replace function public.find_eligible_coupon(p_code text, p_user uuid) returns public.coupons
language plpgsql stable security definer set search_path = public as $$
declare r public.coupons;
begin
  if btrim(coalesce(p_code, '')) = '' then return null; end if;
  select c.* into r from public.coupons c
  where c.active and c.type is distinct from 'verification'
    and upper(c.code) = upper(btrim(p_code))
    and (c.target_user_id is null or c.target_user_id = p_user)
    and not (c.usage_limit = 'once' and exists (select 1 from public.coupon_uses u where u.coupon_id = c.id and u.user_id = p_user))
  limit 1;
  if not found then return null; end if;
  return r;
end;
$$;

create or replace function public.consume_coupon(p_coupon uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_coupon is not null and exists (select 1 from public.coupons where id = p_coupon and usage_limit = 'once') then
    insert into public.coupon_uses (coupon_id, user_id) values (p_coupon, p_user) on conflict do nothing;
  end if;
end;
$$;

-- What the wallet shows: coupons for everyone plus the ones made for you (the admin can list every coupon).
create or replace function public.my_coupons(p_manage boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.acting_user(); master boolean;
begin
  master := exists (select 1 from public.profiles where id = me and (is_admin or lower(username) = 'noob'));
  return coalesce((
    select jsonb_agg(public.coupon_json(c, me) order by c.created_at desc)
    from public.coupons c
    where (coalesce(p_manage, false) and master)
       or (c.active and (c.target_user_id is null or c.target_user_id = me))
  ), '[]'::jsonb);
end;
$$;

create or replace function public.create_coupon(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid; ctype text; lim text; pct numeric := 100; target uuid; tname text; base text; suffix text;
  new_code text; guard int := 0; termsarr text[]; cid uuid; raw_target text;
begin
  me := public.require_master_admin('Only the NOOB admin account can create coupons.');
  ctype := case when p->>'type' = 'verification' then 'verification' else 'discount' end;
  lim := case when ctype = 'verification' or p->>'usageLimit' = 'once' then 'once' else 'unlimited' end;
  raw_target := btrim(coalesce(p->>'targetUsername', ''));

  if btrim(coalesce(p->>'title', '')) = '' then raise exception 'A coupon title is required.'; end if;
  if ctype = 'verification' and raw_target = '' then
    raise exception 'A verification coupon must target one specific user.';
  end if;
  if ctype = 'discount' then
    begin pct := (p->>'discountPercent')::numeric; exception when others then pct := null; end;
    if pct is null or pct <= 0 or pct > 100 then raise exception 'Discount must be a percentage between 1 and 100.'; end if;
  end if;

  if raw_target <> '' then
    tname := regexp_replace(raw_target, '^@', '');
    select id, username into target, tname from public.profiles where lower(username) = lower(tname);
    if target is null then raise exception 'No account found for @%.', regexp_replace(raw_target, '^@', ''); end if;
  end if;

  base := left(regexp_replace(upper(p->>'title'), '[^A-Z0-9]', '', 'g'), 10);
  if base = '' then base := 'NOOB'; end if;
  suffix := case when ctype = 'verification' then 'VERIFY' else round(pct)::text end;
  new_code := base || suffix;
  while exists (select 1 from public.coupons c where lower(c.code) = lower(new_code)) and guard < 20 loop
    new_code := base || suffix || (10 + floor(random() * 90))::int::text;
    guard := guard + 1;
  end loop;

  select coalesce(array_agg(t), '{}'::text[]) into termsarr
  from (select btrim(x, E' \t\r') as t from unnest(string_to_array(coalesce(p->>'terms', ''), E'\n')) x) s where t <> '';

  insert into public.coupons (code, title, type, discount_percent, terms, target_user_id, created_by, usage_limit, active)
  values (new_code, btrim(p->>'title'), ctype, round(pct), termsarr, target, me, lim, true)
  returning id into cid;
  return jsonb_build_object('success', true, 'coupon', (select public.coupon_json(c, me) from public.coupons c where c.id = cid));
end;
$$;

create or replace function public.delete_coupon(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_master_admin('Only the NOOB admin account can manage coupons.');
  update public.coupons set active = false where id = p_id;
  if not found then raise exception 'Coupon not found.'; end if;
  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.redeem_coupon_code(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); c public.coupons;
begin
  c := public.find_eligible_coupon(p_code, me);
  if c.id is null then raise exception 'That coupon code is invalid, expired, or not available for your account.'; end if;
  return jsonb_build_object('success', true, 'coupon', public.coupon_json(c, me));
end;
$$;

-- ===========================================================================
-- 4. Verification badge, wallet transfers, the sticker shop, scratch cards, NOOB Pro, live pictures
-- ===========================================================================

create or replace function public.verify_account(
  p_password text, p_method text, p_coupon_code text default null, p_discount_code text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  me uuid := public.acting_user(); enc text; prof public.profiles; disc public.coupons; vcoupon public.coupons;
  price bigint; label text; bal bigint;
begin
  if coalesce(p_password, '') = '' then
    raise exception 'Password is required to authenticate verification request.';
  end if;
  select encrypted_password into enc from auth.users where id = me;
  if enc is null or crypt(p_password, enc) <> enc then
    raise exception 'Invalid password. Please check your credentials.' using errcode = '28P01';
  end if;
  select * into prof from public.profiles where id = me for update;
  if prof.is_verified then raise exception 'Your account is already verified.'; end if;

  disc := public.find_eligible_coupon(p_discount_code, me);

  if p_method = 'coupon' then
    select c.* into vcoupon from public.coupons c
    where c.active and c.type = 'verification' and upper(c.code) = upper(btrim(coalesce(p_coupon_code, '')))
      and c.target_user_id = me
    limit 1;
    if not found then raise exception 'Invalid or expired verification coupon code.'; end if;
  elsif p_method in ('points_permanent', 'points_monthly') then
    price := case when p_method = 'points_permanent' then 10000000000000 else 5000000000 end;
    label := case when p_method = 'points_permanent' then 'Permanent verification badge' else 'Monthly verification badge' end;
    if disc.id is not null then
      price := greatest(0, round(price * (1 - disc.discount_percent / 100))::bigint);
    end if;
    bal := prof.noob_points;
    if bal < price then
      raise exception 'Insufficient NOOB Points. You have %, but % points are required for % verification.',
        public.fmt_points(bal), public.fmt_points(price),
        case when p_method = 'points_permanent' then 'permanent' else 'monthly' end;
    end if;
    perform public.apply_points(me, -price,
      case when disc.id is not null then format('%s (%s%% off: %s)', label, round(disc.discount_percent), disc.code) else label end);
    perform public.consume_coupon(disc.id, me);
  else
    raise exception 'Invalid verification method specified.';
  end if;

  if vcoupon.id is not null then update public.coupons set active = false where id = vcoupon.id; end if;
  update public.profiles set is_verified = true, verification_tier = 'premium' where id = me;
  return jsonb_build_object('success', true,
    'message', 'Congratulations! Your account @' || prof.username || ' is now officially verified with the blue checkmark!',
    'user', public.get_my_user());
end;
$$;

create or replace function public.wallet_transfer(p_recipient uuid, p_amount numeric, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.acting_user(); amt bigint; rname text; sname text; note text; bal bigint;
begin
  if p_recipient is null then raise exception 'Choose someone to send points to.'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 9000000000000000000 then
    raise exception 'Enter a valid whole number of points to send.';
  end if;
  amt := floor(p_amount)::bigint;
  if p_recipient = me then raise exception 'You cannot send points to yourself.'; end if;
  if not exists (select 1 from public.profiles where id = p_recipient) then raise exception 'Recipient account not found.'; end if;

  perform 1 from public.profiles where id in (me, p_recipient) order by id for update;
  select noob_points, username into bal, sname from public.profiles where id = me;
  if bal < amt then raise exception 'Insufficient NOOB Points. You have % points.', public.fmt_points(bal); end if;
  select username into rname from public.profiles where id = p_recipient;

  note := left(btrim(coalesce(p_note, '')), 140);
  perform public.apply_points(me, -amt, 'Sent to @' || rname || case when note <> '' then ': ' || note else '' end);
  perform public.apply_points(p_recipient, amt, 'Received from @' || sname || case when note <> '' then ': ' || note else '' end);
  perform public.notify_user(p_recipient, 'points_transfer', me,
    '@' || sname || ' sent you ' || public.fmt_points(amt) || ' NOOB Points' || case when note <> '' then ': "' || note || '"' else '.' end,
    '💰 NOOB Points Received');
  return jsonb_build_object('success', true,
    'message', 'Sent ' || public.fmt_points(amt) || ' points to @' || rname || '.', 'user', public.get_my_user());
end;
$$;

-- ---- sticker / GIF / emoji shop
create or replace function public.shop_catalog() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  return jsonb_build_object(
    'catalog', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', s.id, 'name', s.name, 'type', s.type, 'content', s.content,
        'assetUrl', s.asset_url, 'price', s.price, 'category', s.category)) order by s.sort)
      from public.shop_items s), '[]'::jsonb),
    'ownedItemIds', coalesce((select to_jsonb(purchased_item_ids) from public.profiles where id = me), '[]'::jsonb));
end;
$$;

create or replace function public.purchase_shop_item(p_item text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); it public.shop_items; owned text[]; bal bigint;
begin
  select * into it from public.shop_items where id = p_item;
  if not found then raise exception 'Item not found.'; end if;
  select purchased_item_ids, noob_points into owned, bal from public.profiles where id = me for update;
  if it.id = any(owned) then raise exception 'You already own this item.'; end if;
  if bal < it.price then
    raise exception 'Insufficient NOOB Points. You have %, but % costs %.', public.fmt_points(bal), it.name, public.fmt_points(it.price);
  end if;
  perform public.apply_points(me, -it.price, 'Bought "' || it.name || '" from the Sticker Shop');
  update public.profiles set purchased_item_ids = array_append(purchased_item_ids, it.id) where id = me;
  return jsonb_build_object('success', true,
    'item', jsonb_strip_nulls(jsonb_build_object('id', it.id, 'name', it.name, 'type', it.type, 'content', it.content,
      'assetUrl', it.asset_url, 'price', it.price, 'category', it.category)),
    'user', public.get_my_user());
end;
$$;

-- ---- birthday scratch cards (100 possible gifts; nobody ever sees the list)
create or replace function public.pick_birthday_gift() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare n int := floor(random() * 100)::int; amt bigint; it public.shop_items; pct int;
begin
  if n < 70 then
    amt := (n + 1) * 100;
    return jsonb_build_object('type', 'points', 'value', amt, 'label', public.fmt_points(amt) || ' NOOB Points');
  elsif n < 94 then
    select * into it from public.shop_items order by sort offset (n - 70) limit 1;
    return jsonb_build_object('type', 'shop_item', 'value', it.id, 'label', it.name);
  elsif n < 99 then
    pct := (n - 94 + 1) * 10;
    return jsonb_build_object('type', 'coupon', 'value', pct, 'label', pct || '% Off NOOB Pro / Verification');
  end if;
  return jsonb_build_object('type', 'points', 'value', 100000, 'label', '🎉 JACKPOT — 100,000 NOOB Points');
end;
$$;

create or replace function public.reveal_scratch_card(p_card uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); card public.scratch_cards; g jsonb; owned text[]; gift_code text;
begin
  select * into card from public.scratch_cards where id = p_card for update;
  if not found then raise exception 'Scratch card not found.'; end if;
  if card.user_id <> me then raise exception 'This scratch card is not yours.' using errcode = '42501'; end if;
  g := card.gift;
  if card.is_revealed then return jsonb_build_object('success', true, 'gift', g, 'alreadyRevealed', true); end if;

  if g->>'type' = 'points' then
    perform public.apply_points(me, (g->>'value')::bigint, '🎂 Birthday gift: ' || (g->>'label'));
  elsif g->>'type' = 'shop_item' then
    select purchased_item_ids into owned from public.profiles where id = me for update;
    if (g->>'value') = any(owned) then
      perform public.apply_points(me, 2000, '🎂 Birthday gift (already owned "' || (g->>'label') || '", converted to points)');
    else
      update public.profiles set purchased_item_ids = array_append(purchased_item_ids, g->>'value') where id = me;
    end if;
  elsif g->>'type' = 'coupon' then
    gift_code := 'BDAY' || round((g->>'value')::numeric)::text || (100 + floor(random() * 900))::int::text;
    insert into public.coupons (code, title, type, discount_percent, terms, target_user_id, usage_limit, active)
    values (gift_code, 'Birthday Gift: ' || (g->>'label'), 'discount', (g->>'value')::numeric,
            array['One-time use', 'Valid on NOOB Pro or verification purchase'], me, 'once', true);
  end if;

  update public.scratch_cards set is_revealed = true, revealed_at = now() where id = p_card;
  return jsonb_build_object('success', true, 'gift', g, 'user', public.get_my_user());
end;
$$;

-- Runs hourly: gives each person their birthday gift once a year and tells their followers.
create or replace function public.run_birthday_check() returns integer
language plpgsql security definer set search_path = public as $$
declare
  pr record; f record; gift jsonb; card uuid; admin_id uuid := public.noob_admin_id(); n int := 0;
  yr int := extract(year from current_date)::int;
begin
  for pr in
    select p.id, p.username from public.profiles p
    join public.profile_private pp on pp.user_id = p.id
    where pp.date_of_birth is not null
      and extract(month from pp.date_of_birth) = extract(month from current_date)
      and extract(day from pp.date_of_birth) = extract(day from current_date)
      and coalesce((p.extra->>'lastBirthdayWishedYear')::int, 0) <> yr
  loop
    update public.profiles set extra = extra || jsonb_build_object('lastBirthdayWishedYear', yr) where id = pr.id;
    gift := public.pick_birthday_gift();
    insert into public.scratch_cards (user_id, gift) values (pr.id, gift) returning id into card;
    insert into public.notifications (target_user_id, actor_id, type, title, message, data)
    values (pr.id, admin_id, 'birthday_wish', '🎂 Happy Birthday!',
            'Happy Birthday, @' || pr.username || '! We''ve got a scratch card gift waiting for you — tap to scratch and reveal your surprise.',
            jsonb_build_object('scratchCardId', card));
    for f in select follower_id from public.follows where followee_id = pr.id loop
      perform public.notify_user(f.follower_id, 'birthday_follower_alert', pr.id,
        'It''s @' || pr.username || '''s birthday today! Send them a message to wish them well.', '🎈 Birthday Alert');
    end loop;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ---- NOOB Pro
create or replace function public.pro_tier_price(p_tier text) returns bigint
language sql immutable set search_path = public as $$
  select case p_tier when 'starter' then 5000000000::bigint when 'plus' then 7500000000::bigint
                     when 'pro' then 10000000000::bigint when 'elite' then 12500000000::bigint
                     when 'ultimate' then 15000000000::bigint else null end;
$$;

create or replace function public.pro_renewal_price(p_tier text, p_billing text) returns bigint
language sql immutable set search_path = public as $$
  select case when p_billing = 'yearly' then round(coalesce(public.pro_tier_price(p_tier), 0)::numeric * 12 * 0.83)::bigint
              else coalesce(public.pro_tier_price(p_tier), 0) end;
$$;

create or replace function public.upgrade_pro(
  p_tier text, p_billing text default 'monthly', p_coupon text default null, p_auto_renew boolean default true
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); base bigint; price bigint; bill text; cpn public.coupons; bal bigint; period interval;
begin
  base := public.pro_tier_price(p_tier);
  if base is null then raise exception 'Unknown Pro tier.'; end if;
  bill := case when p_billing = 'yearly' then 'yearly' else 'monthly' end;
  price := public.pro_renewal_price(p_tier, bill);
  cpn := public.find_eligible_coupon(p_coupon, me);
  if cpn.id is not null then price := greatest(0, round(price * (1 - cpn.discount_percent / 100))::bigint); end if;

  select noob_points into bal from public.profiles where id = me for update;
  if bal < price then
    raise exception 'Insufficient NOOB Points. You have % points, but % points are required.', public.fmt_points(bal), public.fmt_points(price);
  end if;
  period := case when bill = 'yearly' then interval '365 days' else interval '30 days' end;

  perform public.apply_points(me, -price,
    case when cpn.id is not null then format('NOOB Pro (%s, %s) — %s%% off: %s', p_tier, bill, round(cpn.discount_percent), cpn.code)
         else format('NOOB Pro (%s, %s)', p_tier, bill) end);
  update public.profiles set pro_tier = p_tier, pro_billing = bill, pro_auto_renew = coalesce(p_auto_renew, true),
                             pro_renews_at = now() + period where id = me;
  perform public.consume_coupon(cpn.id, me);
  return jsonb_build_object('success', true, 'user', public.get_my_user());
end;
$$;

create or replace function public.toggle_pro_auto_renew(p_enabled boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user();
begin
  if (select pro_tier from public.profiles where id = me) is null then
    raise exception 'You do not have an active NOOB Pro subscription.';
  end if;
  update public.profiles set pro_auto_renew = coalesce(p_enabled, false) where id = me;
  return jsonb_build_object('success', true, 'proAutoRenew', coalesce(p_enabled, false));
end;
$$;

-- Runs hourly: re-bills anyone whose period ended (auto-renew on and enough points), or ends their Pro. Always tells them.
create or replace function public.run_pro_renewals() returns integer
language plpgsql security definer set search_path = public as $$
declare pr record; price bigint; admin_id uuid := public.noob_admin_id(); n int := 0; bill text;
begin
  for pr in
    select id, pro_tier, pro_billing, pro_auto_renew, noob_points from public.profiles
    where pro_tier is not null and pro_renews_at is not null and pro_renews_at <= now()
    order by id for update
  loop
    bill := coalesce(pr.pro_billing, 'monthly');
    price := public.pro_renewal_price(pr.pro_tier, bill);
    if pr.pro_auto_renew and pr.noob_points >= price then
      perform public.apply_points(pr.id, -price, format('NOOB Pro renewal (%s, %s)', pr.pro_tier, bill));
      update public.profiles set pro_renews_at = now() + case when bill = 'yearly' then interval '365 days' else interval '30 days' end where id = pr.id;
      perform public.notify_user(pr.id, 'admin_direct', admin_id,
        format('Your NOOB Pro (%s) subscription renewed automatically — %s points were deducted from your Wallet.', pr.pro_tier, public.fmt_points(price)),
        '✅ NOOB Pro Renewed');
    else
      update public.profiles set pro_tier = null, pro_billing = null, pro_renews_at = null, pro_auto_renew = false where id = pr.id;
      perform public.notify_user(pr.id, 'admin_direct', admin_id,
        case when pr.pro_auto_renew
          then format('Your NOOB Pro (%s) subscription couldn''t renew — your Wallet balance was below the %s points required, so Pro has been discontinued. You can resubscribe any time.', pr.pro_tier, public.fmt_points(price))
          else format('Your NOOB Pro (%s) subscription has ended since Reload Monthly was turned off. You can resubscribe any time.', pr.pro_tier) end,
        case when pr.pro_auto_renew then '⚠️ NOOB Pro Discontinued' else '👋 NOOB Pro Ended' end);
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ---- live (animated) profile pictures — a NOOB Pro perk
create or replace function public.live_avatar_presets_list() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('presets', coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'url', url) order by sort), '[]'::jsonb))
  from public.live_avatar_presets;
$$;

create or replace function public.apply_live_avatar(p_preset text default null, p_custom_url text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); url text;
begin
  if (select pro_tier from public.profiles where id = me) is null then
    raise exception 'Live Profile Pictures are a NOOB Pro feature. Upgrade to unlock them.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_preset, '')) <> '' then
    select l.url into url from public.live_avatar_presets l where l.id = p_preset;
    if url is null then raise exception 'Unknown preset.'; end if;
  elsif btrim(coalesce(p_custom_url, '')) <> '' then
    url := btrim(p_custom_url);
  else
    raise exception 'Choose a preset or upload a custom live picture.';
  end if;
  update public.profiles set avatar = url, is_live_avatar = true where id = me;
  return jsonb_build_object('success', true, 'user', public.get_my_user());
end;
$$;

-- ===========================================================================
-- 5. Games: scores, leaderboard, Chess Blitz limits, live rooms, matchmaking, invites
-- ===========================================================================

create or replace function public.game_leaderboard() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); mine bigint; rk int;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select noob_points into mine from public.profiles where id = me;
  select count(*) + 1 into rk from public.profiles where not is_ai and noob_points > coalesce(mine, 0);
  return jsonb_build_object(
    'leaderboard', coalesce((
      select jsonb_agg(t.entry order by t.rn) from (
        select jsonb_build_object('rank', x.rn, 'userId', x.id, 'username', x.username,
                 'displayName', coalesce(nullif(x.display_name, ''), x.username), 'avatar', x.avatar,
                 'noobPoints', x.noob_points, 'gamesWon', x.games_won_count, 'gamesPlayed', x.games_played_count,
                 'isVerified', x.is_verified) as entry, x.rn
        from (select p.*, row_number() over (order by p.noob_points desc, p.created_at asc) as rn
              from public.profiles p where not p.is_ai) x
        where x.rn <= 10) t), '[]'::jsonb),
    'currentUserPoints', coalesce(mine, 0),
    'currentUserRank', rk);
end;
$$;

-- Chess Blitz: 1 round a week on the free plan, 4 on NOOB Pro. Starting a round arms the payout for exactly one result.
create or replace function public.start_chess_round() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); st public.user_game_state; recent timestamptz[]; is_pro boolean; oldest timestamptz;
begin
  is_pro := (select pro_tier from public.profiles where id = me) is not null;
  insert into public.user_game_state (user_id) values (me) on conflict (user_id) do nothing;
  select * into st from public.user_game_state where user_id = me for update;

  if is_pro then
    select coalesce(array_agg(t), '{}') into recent from unnest(st.chess_blitz_timestamps) t where t > now() - interval '7 days';
    if coalesce(array_length(recent, 1), 0) >= 4 then
      select min(t) into oldest from unnest(recent) t;
      return jsonb_build_object('success', false, 'error', 'Chess Blitz is limited to 4 rounds a week, even on NOOB Pro.',
                                'nextAvailableAt', oldest + interval '7 days');
    end if;
    update public.user_game_state set chess_blitz_timestamps = array_append(recent, now()), chess_round_ready = true where user_id = me;
    return jsonb_build_object('success', true, 'isPro', true);
  end if;

  if st.last_chess_blitz_at is not null and now() - st.last_chess_blitz_at < interval '7 days' then
    return jsonb_build_object('success', false,
      'error', 'Chess Blitz is limited to once a week on the free plan. Upgrade to NOOB Pro for up to 4 rounds a week.',
      'nextAvailableAt', st.last_chess_blitz_at + interval '7 days');
  end if;
  update public.user_game_state set last_chess_blitz_at = now(), chess_round_ready = true where user_id = me;
  return jsonb_build_object('success', true);
end;
$$;

-- Win = 10M points, tie = 5M, loss = 0. Chess Blitz against a bot has real stakes: 50M for a win, the whole balance for a loss.
create or replace function public.record_match(
  p_game_id text, p_title text, p_result text, p_opponent text default null, p_vs_bot boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); earned bigint; bal bigint; high boolean; st public.user_game_state; title text; total bigint;
begin
  if btrim(coalesce(p_game_id, '')) = '' then raise exception 'gameId is required.'; end if;
  if p_result is null or p_result not in ('win', 'tie', 'loss') then raise exception 'Invalid result.'; end if;
  if (select count(*) from public.game_scores where user_id = me and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Too many requests. Please slow down.';
  end if;
  title := coalesce(nullif(btrim(p_title), ''), p_game_id);
  high := p_game_id = 'chess_blitz' and coalesce(p_vs_bot, false);
  select noob_points into bal from public.profiles where id = me for update;

  if high then
    select * into st from public.user_game_state where user_id = me for update;
    if not found or not st.chess_round_ready then
      raise exception 'No active Chess Blitz round to record a result for.' using errcode = '42501';
    end if;
    update public.user_game_state set chess_round_ready = false where user_id = me;
    earned := case p_result when 'win' then 50000000 when 'loss' then -bal else 5000000 end;
  else
    earned := case p_result when 'win' then 10000000 when 'tie' then 5000000 else 0 end;
  end if;

  if earned > 0 then
    perform public.apply_points(me, earned, (case when p_result = 'win' then 'Won ' else 'Tied ' end) || title || ' match');
  elsif earned < 0 then
    perform public.apply_points(me, earned, 'Lost ' || title || ' — balance wiped');
  end if;
  update public.profiles set games_played_count = games_played_count + 1,
                             games_won_count = games_won_count + (case when p_result = 'win' then 1 else 0 end) where id = me;
  insert into public.game_scores (user_id, game_id, game_title, score, points_awarded, result, opponent)
  values (me, p_game_id, title, earned, earned, p_result, coalesce(nullif(btrim(p_opponent), ''), 'Bot'));
  select noob_points into total from public.profiles where id = me;
  return jsonb_build_object('success', true, 'earnedPoints', earned, 'totalNoobPoints', total, 'result', p_result,
                            'user', public.get_my_user());
end;
$$;

-- Endless-runner style games pay 1,000,000 points per second survived (at most one hour per run).
create or replace function public.submit_survival_score(p_game_id text, p_title text, p_seconds numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); secs int; earned bigint; title text; total bigint;
begin
  if p_seconds is null or p_seconds < 1 then raise exception 'Invalid survival time.'; end if;
  if (select count(*) from public.game_scores where user_id = me and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Too many requests. Please slow down.';
  end if;
  secs := least(floor(p_seconds), 3600)::int;
  earned := secs::bigint * 1000000;
  title := coalesce(nullif(btrim(p_title), ''), p_game_id);
  perform public.apply_points(me, earned, title || ': survived ' || secs || 's');
  update public.profiles set games_played_count = games_played_count + 1 where id = me;
  insert into public.game_scores (user_id, game_id, game_title, score, points_awarded, result, opponent)
  values (me, p_game_id, title, earned, earned, 'win', 'Solo');
  select noob_points into total from public.profiles where id = me;
  return jsonb_build_object('success', true, 'earnedPoints', earned, 'survivalSeconds', secs, 'totalNoobPoints', total,
                            'user', public.get_my_user());
end;
$$;

create or replace function public.room_json(r public.game_rooms) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('code', r.code, 'gameId', r.game_id, 'gameTitle', r.game_title, 'status', r.status,
    'players', r.players,
    'resultsSubmittedBy', coalesce((select jsonb_agg(k) from jsonb_object_keys(r.results) k), '[]'::jsonb),
    'outcome', r.outcome, 'board', r.board, 'turn', r.turn);
$$;

create or replace function public.cleanup_stale_games() returns integer
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.game_rooms where created_at < now() - interval '30 minutes';
  get diagnostics n = row_count;
  delete from public.matchmaking_queue where joined_at < now() - interval '60 seconds';
  return n;
end;
$$;

-- Tic Tac Toe is played on ONE shared board; everything else is "each plays their round, results are compared".
create or replace function public.finalize_room_outcome(p_code text, p_outcomes jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.game_rooms; pl jsonb; uid uuid; outcome text; earned bigint; st public.user_game_state; opp text;
  pts jsonb := '{}'::jsonb; high boolean;
begin
  select * into r from public.game_rooms where code = p_code for update;
  high := r.game_id = 'chess_blitz';
  for pl in select value from jsonb_array_elements(r.players) loop
    uid := (pl->>'userId')::uuid;
    outcome := p_outcomes->>(pl->>'userId');
    select value->>'username' into opp from jsonb_array_elements(r.players) where (value->>'userId') <> (pl->>'userId') limit 1;
    opp := coalesce(opp, 'opponent');
    select * into st from public.user_game_state where user_id = uid for update;
    if high and found and st.chess_round_ready then
      update public.user_game_state set chess_round_ready = false where user_id = uid;
      earned := case outcome when 'win' then 50000000 when 'tie' then 5000000 else -(select noob_points from public.profiles where id = uid) end;
    else
      earned := case outcome when 'win' then 10000000 when 'tie' then 5000000 else 0 end;
    end if;
    pts := pts || jsonb_build_object(uid::text, earned);
    if earned > 0 then
      perform public.apply_points(uid, earned, (case when outcome = 'win' then 'Won ' else 'Tied ' end) || r.game_title || ' vs @' || opp);
    elsif earned < 0 then
      perform public.apply_points(uid, earned, 'Lost ' || r.game_title || ' vs @' || opp || ' — balance wiped');
    end if;
    update public.profiles set games_played_count = games_played_count + 1,
           games_won_count = games_won_count + (case when outcome = 'win' then 1 else 0 end) where id = uid;
    insert into public.game_scores (user_id, game_id, game_title, score, points_awarded, result, opponent)
    values (uid, r.game_id, r.game_title, earned, earned, outcome, opp);
  end loop;
  update public.game_rooms set status = 'finished', outcome = jsonb_build_object('results', p_outcomes, 'points', pts) where code = p_code;
end;
$$;

create or replace function public.join_game_room(p_code text, p_game_id text, p_title text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); r public.game_rooms; info jsonb;
begin
  perform public.cleanup_stale_games();
  if btrim(coalesce(p_code, '')) = '' or btrim(coalesce(p_game_id, '')) = '' then raise exception 'Room code and gameId are required.'; end if;
  info := public.game_player_json(me);
  select * into r from public.game_rooms where code = p_code for update;
  if not found then
    if (select count(*) from public.game_rooms where created_by = me and created_at > now() - interval '1 minute') >= 30 then
      raise exception 'Too many requests. Please slow down.';
    end if;
    insert into public.game_rooms (code, game_id, game_title, players, created_by)
    values (p_code, p_game_id, coalesce(nullif(btrim(p_title), ''), p_game_id), jsonb_build_array(info), me)
    returning * into r;
    return jsonb_build_object('success', true, 'room', public.room_json(r));
  end if;
  if exists (select 1 from jsonb_array_elements(r.players) x where (x->>'userId')::uuid = me) then
    return jsonb_build_object('success', true, 'room', public.room_json(r));
  end if;
  if jsonb_array_length(r.players) >= 2 then raise exception 'This match is already full.'; end if;
  update public.game_rooms set players = players || jsonb_build_array(info), status = 'ready',
    board = case when game_id = 'tictactoe' then to_jsonb(array_fill(null::text, array[9])) else board end,
    turn = case when game_id = 'tictactoe' then (players->0->>'userId')::uuid else turn end
  where code = p_code returning * into r;
  return jsonb_build_object('success', true, 'room', public.room_json(r));
end;
$$;

create or replace function public.get_game_room(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.acting_user(); r public.game_rooms;
begin
  select * into r from public.game_rooms where code = p_code;
  if not found then raise exception 'Match not found or has expired.'; end if;
  if not exists (select 1 from jsonb_array_elements(r.players) x where (x->>'userId')::uuid = me) then
    raise exception 'You are not part of this match.' using errcode = '42501';
  end if;
  return jsonb_build_object('success', true, 'room', public.room_json(r));
end;
$$;

create or replace function public.submit_game_room_result(p_code text, p_result text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.acting_user(); r public.game_rooms; p1 text; p2 text; r1 int; r2 int; outcomes jsonb; total bigint;
begin
  select * into r from public.game_rooms where code = p_code for update;
  if not found then raise exception 'Match not found or has expired.'; end if;
  if not exists (select 1 from jsonb_array_elements(r.players) x where (x->>'userId')::uuid = me) then
    raise exception 'You are not part of this match.' using errcode = '42501';
  end if;
  if r.game_id = 'tictactoe' then raise exception 'This game uses live moves — submit via the move endpoint instead.'; end if;
  if p_result is null or p_result not in ('win', 'tie', 'loss') then raise exception 'Invalid result.'; end if;

  if not (r.results ? me::text) then
    update public.game_rooms set results = results || jsonb_build_object(me::text, p_result) where code = p_code returning * into r;
  end if;
  if r.status <> 'finished' and (select count(*) from jsonb_object_keys(r.results)) >= 2 and jsonb_array_length(r.players) = 2 then
    p1 := r.players->0->>'userId'; p2 := r.players->1->>'userId';
    r1 := case r.results->>p1 when 'win' then 2 when 'tie' then 1 else 0 end;
    r2 := case r.results->>p2 when 'win' then 2 when 'tie' then 1 else 0 end;
    outcomes := case when r1 = r2 then jsonb_build_object(p1, 'tie', p2, 'tie')
                     when r1 > r2 then jsonb_build_object(p1, 'win', p2, 'loss')
                     else jsonb_build_object(p1, 'loss', p2, 'win') end;
    perform public.finalize_room_outcome(p_code, outcomes);
    select * into r from public.game_rooms where code = p_code;
  end if;
  select noob_points into total from public.profiles where id = me;
  return jsonb_build_object('success', true, 'room', public.room_json(r), 'yourTotalPoints', total);
end;
$$;

-- One move on the shared Tic Tac Toe board. The database decides whose turn it is and who has won.
create or replace function public.submit_game_room_move(p_code text, p_index integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.acting_user(); r public.game_rooms; pidx int; sym text; b jsonb; win text; p1 text; p2 text;
  lines int[] := array[0,1,2, 3,4,5, 6,7,8, 0,3,6, 1,4,7, 2,5,8, 0,4,8, 2,4,6]; i int; a int; bb int; c int; outcomes jsonb; total bigint;
begin
  select * into r from public.game_rooms where code = p_code for update;
  if not found then raise exception 'Match not found or has expired.'; end if;
  if r.game_id <> 'tictactoe' then raise exception 'This game does not support live sync.'; end if;
  select (ord - 1)::int into pidx from jsonb_array_elements(r.players) with ordinality as t(x, ord) where (x->>'userId')::uuid = me;
  if pidx is null then raise exception 'You are not part of this match.' using errcode = '42501'; end if;
  if jsonb_array_length(r.players) < 2 then raise exception 'Waiting for an opponent to join.'; end if;
  if r.status = 'finished' then raise exception 'This match has already ended.'; end if;
  b := coalesce(r.board, to_jsonb(array_fill(null::text, array[9])));
  if p_index is null or p_index < 0 or p_index > 8 then raise exception 'Invalid move.'; end if;
  if r.turn is distinct from me then raise exception 'It''s not your turn.'; end if;
  if jsonb_typeof(b->p_index) <> 'null' then raise exception 'That cell is already taken.'; end if;

  sym := case when pidx = 0 then 'X' else 'O' end;
  b := jsonb_set(b, array[p_index::text], to_jsonb(sym));
  win := null;
  for i in 0..7 loop
    a := lines[i * 3 + 1]; bb := lines[i * 3 + 2]; c := lines[i * 3 + 3];
    if b->>a is not null and b->>a = b->>bb and b->>a = b->>c then win := b->>a; exit; end if;
  end loop;
  if win is null and not exists (select 1 from jsonb_array_elements(b) x where jsonb_typeof(x) = 'null') then win := 'Tie'; end if;

  update public.game_rooms set board = b where code = p_code;
  p1 := r.players->0->>'userId'; p2 := r.players->1->>'userId';
  if win is not null then
    outcomes := case win when 'Tie' then jsonb_build_object(p1, 'tie', p2, 'tie')
                         when 'X' then jsonb_build_object(p1, 'win', p2, 'loss')
                         else jsonb_build_object(p1, 'loss', p2, 'win') end;
    perform public.finalize_room_outcome(p_code, outcomes);
  else
    update public.game_rooms set turn = (r.players->(case when pidx = 0 then 1 else 0 end)->>'userId')::uuid where code = p_code;
  end if;
  select * into r from public.game_rooms where code = p_code;
  select noob_points into total from public.profiles where id = me;
  return jsonb_build_object('success', true, 'room', public.room_json(r), 'yourTotalPoints', total);
end;
$$;

create or replace function public.join_matchmaking(p_game_id text, p_title text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); opp record; room_code text; r public.game_rooms;
begin
  perform public.cleanup_stale_games();
  if btrim(coalesce(p_game_id, '')) = '' then raise exception 'gameId is required.'; end if;
  delete from public.matchmaking_queue where user_id = me;
  select q.user_id into opp from public.matchmaking_queue q
  where q.game_id = p_game_id and q.matched_room_code is null and q.user_id <> me
  order by q.joined_at for update skip locked limit 1;
  if found then
    room_code := upper('MM-' || to_hex((extract(epoch from clock_timestamp()) * 1000)::bigint) || '-' || substr(md5(random()::text), 1, 4));
    insert into public.game_rooms (code, game_id, game_title, status, players, created_by,
                                   board, turn)
    values (room_code, p_game_id, coalesce(nullif(btrim(p_title), ''), p_game_id), 'ready',
            jsonb_build_array(public.game_player_json(opp.user_id), public.game_player_json(me)), me,
            case when p_game_id = 'tictactoe' then to_jsonb(array_fill(null::text, array[9])) end,
            case when p_game_id = 'tictactoe' then opp.user_id end)
    returning * into r;
    update public.matchmaking_queue set matched_room_code = room_code where user_id = opp.user_id;
    return jsonb_build_object('success', true, 'matched', true, 'room', public.room_json(r));
  end if;
  insert into public.matchmaking_queue (user_id, game_id) values (me, p_game_id);
  return jsonb_build_object('success', true, 'matched', false);
end;
$$;

create or replace function public.matchmaking_status() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); q public.matchmaking_queue; r public.game_rooms; room_exists boolean;
begin
  select * into q from public.matchmaking_queue where user_id = me;
  if not found then return jsonb_build_object('success', true, 'matched', false); end if;
  if q.matched_room_code is not null then
    select * into r from public.game_rooms where code = q.matched_room_code;
    room_exists := found;
    delete from public.matchmaking_queue where user_id = me;
    if room_exists then return jsonb_build_object('success', true, 'matched', true, 'room', public.room_json(r)); end if;
  end if;
  return jsonb_build_object('success', true, 'matched', false);
end;
$$;

create or replace function public.cancel_matchmaking() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user();
begin
  delete from public.matchmaking_queue where user_id = me;
  return jsonb_build_object('success', true);
end;
$$;

-- "Play with a friend": drops an invite card into the 1:1 chat (creating the chat if needed).
create or replace function public.send_game_invite(p_target uuid, p_game_id text, p_title text, p_room_code text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); prof public.profiles; cid uuid; dup public.messages; rc text; msg jsonb;
begin
  if not exists (select 1 from public.profiles where id = p_target) then raise exception 'Target user not found'; end if;
  select * into prof from public.profiles where id = me;
  rc := coalesce(nullif(btrim(p_room_code), ''), 'room_' || p_game_id || '_' || (extract(epoch from clock_timestamp()) * 1000)::bigint);
  -- a double-tap must not post the same invite twice
  select m.* into dup from public.messages m
  where m.sender_id = me and m.game_invite->>'gameId' = p_game_id and m.game_invite->>'roomCode' = rc
    and m.created_at > now() - interval '3 seconds'
  order by m.created_at desc limit 1;
  if found then
    return jsonb_build_object('success', true, 'message', 'Invite already sent', 'chatId', dup.chat_id, 'invite', public.message_json(dup));
  end if;
  cid := (public.create_chat(array[p_target], false)->'chat'->>'id')::uuid;
  msg := public.send_message(cid, jsonb_build_object('mediaType', 'game_invite', 'text', '',
           'gameInvite', jsonb_build_object('gameId', p_game_id, 'gameTitle', p_title, 'fromUsername', prof.username,
                                            'fromAvatar', prof.avatar, 'roomCode', rc)))->'message';
  return jsonb_build_object('success', true, 'message', 'Invite sent to chat!', 'chatId', cid, 'invite', msg);
end;
$$;

-- ===========================================================================
-- 6. Safety reports, support ratings, contacts, screenshots, push, the physical store
-- ===========================================================================

create or replace function public.report_json(r public.reports) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'reporterId', coalesce(r.reporter_id::text, 'anonymous'),
    'reporterUsername', coalesce(a.username, 'Anonymous'), 'reporterName', coalesce(nullif(a.display_name, ''), a.username, 'Anonymous'),
    'targetUserId', r.target_id, 'targetUsername', t.username, 'targetDisplayName', coalesce(nullif(t.display_name, ''), t.username),
    'targetAvatar', coalesce(nullif(t.avatar, ''), '/noob-logo.svg.jpeg'),
    'reason', r.reason, 'details', r.details, 'status', r.status, 'createdAt', r.created_at,
    'reviewedBy', (select username from public.profiles where id = r.reviewed_by), 'reviewedAt', r.reviewed_at)
  from public.profiles t left join public.profiles a on a.id = r.reporter_id where t.id = r.target_id;
$$;

-- Reporting someone also blocks them for you.
create or replace function public.submit_report(p_target text, p_reason text default null, p_details text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); clean text; t public.profiles; rep public.reports;
begin
  if btrim(coalesce(p_target, '')) = '' then raise exception 'User ID or @username is required.'; end if;
  clean := lower(regexp_replace(btrim(p_target), '^@', ''));
  select * into t from public.profiles where lower(username) = clean or id::text = clean limit 1;
  if not found then raise exception 'Account not found. Please verify the User ID or @username.'; end if;
  if t.id = me then raise exception 'You cannot report or block your own account!'; end if;
  perform public.block_user(t.id);
  insert into public.reports (reporter_id, target_id, reason, details)
  values (me, t.id, coalesce(nullif(btrim(p_reason), ''), 'Cyber Bullying & Harassment'),
          coalesce(nullif(btrim(p_details), ''), 'Report submitted via Trust & Safety'))
  returning * into rep;
  return jsonb_build_object('success', true, 'reportId', rep.id, 'report', public.report_json(rep),
    'message', 'Report successfully filed against @' || t.username || '. The account has been blocked and flagged for NOOB Admin review.');
end;
$$;

create or replace function public.submit_support_review(p_rating numeric, p_feedback text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); avg_r numeric; cnt int;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'rating must be a number from 1 to 5'; end if;
  insert into public.support_reviews (user_id, rating, feedback) values (me, round(p_rating)::int, coalesce(p_feedback, ''));
  select avg(rating), count(*) into avg_r, cnt from public.support_reviews;
  return jsonb_build_object('success', true, 'average', round(avg_r, 1), 'count', cnt);
end;
$$;

create or replace function public.support_rating_summary() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('average', case when count(*) = 0 then null else round(avg(rating), 1) end, 'count', count(*))
  from public.support_reviews;
$$;

-- "Find friends": which of these phone numbers belong to NOOB members (last 10 digits). The numbers are never returned.
create or replace function public.match_contacts(p_numbers text[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.acting_user(); wanted text[];
begin
  if p_numbers is null or coalesce(array_length(p_numbers, 1), 0) = 0 then return '[]'::jsonb; end if;
  select coalesce(array_agg(distinct n), '{}') into wanted
  from (select right(regexp_replace(x, '\D', '', 'g'), 10) as n from unnest(p_numbers[1:2000]) x) s where length(n) >= 7;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar,
             'bio', p.bio, 'isVerified', p.is_verified, 'accountType', p.account_type, 'isBusiness', p.is_business,
             'followersCount', p.followers_count, 'followingCount', p.following_count,
             'isFollowing', exists (select 1 from public.follows f where f.follower_id = me and f.followee_id = p.id))
             order by p.username)
    from public.profiles p join public.profile_private pp on pp.user_id = p.id
    where p.id <> me and length(right(regexp_replace(coalesce(pp.mobile_number, ''), '\D', '', 'g'), 10)) >= 7
      and right(regexp_replace(coalesce(pp.mobile_number, ''), '\D', '', 'g'), 10) = any(wanted)
  ), '[]'::jsonb);
end;
$$;

-- Tells the owner someone screenshotted their profile / post / story / reel / chat (best effort — see the app).
create or replace function public.screenshot_alert(p_type text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); uname text; owner_id uuid; what text; m record; ch public.chats;
begin
  select username into uname from public.profiles where id = me;
  if p_type = 'chat' then
    select * into ch from public.chats where id = p_id;
    if not found then raise exception 'Chat not found.'; end if;
    if not exists (select 1 from public.chat_members where chat_id = p_id and user_id = me) and not ch.is_global_default then
      raise exception 'You are not a participant in this chat.' using errcode = '42501';
    end if;
    if not ch.is_global_default then
      for m in select user_id from public.chat_members where chat_id = p_id and user_id <> me loop
        perform public.notify_user(m.user_id, 'screenshot_alert', me, '@' || uname || ' took a screenshot of your chat.', '📸 Screenshot Detected');
      end loop;
    end if;
    return jsonb_build_object('success', true);
  end if;

  if p_type = 'profile' then select id into owner_id from public.profiles where id = p_id; what := 'profile';
  elsif p_type = 'post' then select user_id into owner_id from public.posts where id = p_id; what := 'post';
  elsif p_type = 'story' then select user_id into owner_id from public.stories where id = p_id; what := 'story';
  elsif p_type = 'reel' then select user_id into owner_id from public.reels where id = p_id; what := 'reel';
  else raise exception 'Unknown contentType.';
  end if;
  if owner_id is null then raise exception '% not found.', initcap(what); end if;
  if owner_id <> me then
    perform public.notify_user(owner_id, 'screenshot_alert', me, '@' || uname || ' took a screenshot of your ' || what || '.', '📸 Screenshot Detected');
  end if;
  return jsonb_build_object('success', true);
end;
$$;

-- ---- push notification registration (sending happens in an Edge Function)
create or replace function public.register_push_token(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user();
begin
  if btrim(coalesce(p_token, '')) = '' then raise exception 'Push token is required.'; end if;
  insert into public.profile_private (user_id, push_tokens) values (me, array[p_token])
  on conflict (user_id) do update set push_tokens = (
    select array_agg(distinct t) from unnest(array_append(public.profile_private.push_tokens, p_token)) t);
  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.save_push_subscription(p_subscription jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user();
begin
  if p_subscription is null or coalesce(p_subscription->>'endpoint', '') = '' then
    raise exception 'A valid push subscription is required.';
  end if;
  insert into public.push_subscriptions (user_id, subscription) values (me, p_subscription)
  on conflict (user_id) do update set subscription = excluded.subscription, updated_at = now();
  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.remove_push_subscription() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user();
begin
  delete from public.push_subscriptions where user_id = me;
  return jsonb_build_object('success', true);
end;
$$;

-- The website's public push key (not a secret) is kept in the app settings by the admin.
create or replace function public.get_vapid_public_key() returns text
language sql stable security definer set search_path = public as $$
  select nullif(settings->>'vapidPublicKey', '') from public.app_settings where id = 1;
$$;

-- ---- the physical-goods store
create or replace function public.list_store_products() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.acting_user();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'price', p.price, 'description', p.description, 'media', p.media,
                                        'inStock', p.in_stock, 'createdAt', p.created_at) order by p.created_at desc)
    from public.store_products p), '[]'::jsonb);
end;
$$;

create or replace function public.create_store_product(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid; media jsonb; photos int; videos int; pid uuid; pr public.store_products;
begin
  me := public.require_master_admin('Only the NOOB admin account can add products.');
  if coalesce(jsonb_typeof(p->'price'), '') <> 'number' or (p->>'price')::numeric <= 0 then raise exception 'Enter a valid price.'; end if;
  if btrim(coalesce(p->>'description', '')) = '' then raise exception 'A description is required.'; end if;
  if coalesce(jsonb_typeof(p->'media'), '') <> 'array' or jsonb_array_length(p->'media') = 0 then raise exception 'Add at least one photo or video.'; end if;
  select count(*) filter (where x->>'type' = 'photo'), count(*) filter (where x->>'type' = 'video')
    into photos, videos from jsonb_array_elements(p->'media') x;
  if photos > 10 then raise exception 'A product can have at most 10 photos.'; end if;
  if videos > 10 then raise exception 'A product can have at most 10 videos.'; end if;
  select jsonb_agg(jsonb_build_object('type', case when x->>'type' = 'video' then 'video' else 'photo' end, 'url', x->>'url'))
    into media from jsonb_array_elements(p->'media') x;
  insert into public.store_products (price, description, media, in_stock, created_by)
  values ((p->>'price')::numeric, btrim(p->>'description'), media, coalesce((p->>'inStock')::boolean, true), me)
  returning * into pr;
  return jsonb_build_object('success', true, 'product', jsonb_build_object('id', pr.id, 'price', pr.price,
    'description', pr.description, 'media', pr.media, 'inStock', pr.in_stock, 'createdAt', pr.created_at));
end;
$$;

create or replace function public.delete_store_product(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_master_admin('Only the NOOB admin account can manage products.');
  delete from public.store_products where id = p_id;
  if not found then raise exception 'Product not found.'; end if;
  return jsonb_build_object('success', true);
end;
$$;

-- ---- a creator's own numbers (real counts from their posts and reels)
create or replace function public.my_insights() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := public.acting_user(); reached int; engaged int; v_likes int; v_saves int; v_comments int; v_shares int; followers int; recent_follows int;
begin
  select count(distinct v.user_id) into reached from (
    select pv.user_id from public.post_views pv join public.posts p on p.id = pv.post_id where p.user_id = me
    union all
    select rv.user_id from public.reel_views rv join public.reels r on r.id = rv.reel_id where r.user_id = me) v
  where v.user_id <> me;
  select count(distinct e.user_id) into engaged from (
    select l.user_id from public.post_likes l join public.posts p on p.id = l.post_id where p.user_id = me
    union all select s.user_id from public.post_saves s join public.posts p on p.id = s.post_id where p.user_id = me
    union all select c.user_id from public.comments c join public.posts p on p.id = c.post_id where p.user_id = me
    union all select l.user_id from public.reel_likes l join public.reels r on r.id = l.reel_id where r.user_id = me
    union all select c.user_id from public.comments c join public.reels r on r.id = c.reel_id where r.user_id = me) e
  where e.user_id <> me;
  select coalesce(sum(likes_count), 0), coalesce(sum(saves_count), 0), coalesce(sum(comments_count), 0), coalesce(sum(shares_count), 0)
    into v_likes, v_saves, v_comments, v_shares from public.posts where user_id = me;
  select followers_count into followers from public.profiles where id = me;
  select count(*) into recent_follows from public.follows where followee_id = me and created_at > now() - interval '30 days';
  return jsonb_build_object('insights', jsonb_build_object(
    'accountsReached', reached, 'accountsEngaged', engaged, 'totalFollowers', coalesce(followers, 0),
    'profileActivity', recent_follows,
    'skipRate', 0, 'repostRate', 0,
    'shareRate', case when reached > 0 then round(v_shares * 100.0 / reached, 1) else 0 end,
    'likeRate', case when reached > 0 then round(v_likes * 100.0 / reached, 1) else 0 end,
    'saveRate', case when reached > 0 then round(v_saves * 100.0 / reached, 1) else 0 end,
    'commentRate', case when reached > 0 then round(v_comments * 100.0 / reached, 1) else 0 end,
    'reachHistory', coalesce((
      select jsonb_agg(jsonb_build_object('date', to_char(d, 'Mon DD'), 'value', coalesce((
        select count(distinct v.user_id) from (
          select pv.user_id, pv.created_at from public.post_views pv join public.posts p on p.id = pv.post_id where p.user_id = me
          union all
          select rv.user_id, rv.created_at from public.reel_views rv join public.reels r on r.id = rv.reel_id where r.user_id = me) v
        where v.user_id <> me and v.created_at::date = d::date), 0)) order by d)
      from generate_series(current_date - 6, current_date, interval '1 day') d), '[]'::jsonb),
    'audienceDemographics', coalesce((
      select jsonb_agg(jsonb_build_object('category', g.cat, 'percentage', round(g.n * 100.0 / g.total, 1)) order by g.n desc)
      from (select coalesce(nullif(initcap(pp.gender), ''), 'Not specified') as cat, count(*) as n, sum(count(*)) over () as total
            from public.follows f left join public.profile_private pp on pp.user_id = f.follower_id
            where f.followee_id = me group by 1) g), '[]'::jsonb)));
end;
$$;

-- ===========================================================================
-- 7. Admin tools (all refuse anyone who is not the NOOB administrator)
-- ===========================================================================

create or replace function public.admin_user_json(p public.profiles) returns jsonb
language sql stable security definer set search_path = public as $$
  select public.user_public_json(p) || jsonb_build_object(
    'email', pp.email, 'firstName', pp.first_name, 'lastName', pp.last_name, 'countryCode', pp.country_code,
    'mobileNumber', pp.mobile_number, 'dateOfBirth', pp.date_of_birth, 'gender', pp.gender,
    'businessEmail', pp.business_email, 'businessPhone', pp.business_phone, 'businessAddress', pp.business_address,
    'isSuspended', p.is_suspended, 'suspendedReason', pp.suspended_reason,
    'proBilling', p.pro_billing, 'proRenewsAt', p.pro_renews_at)
  from (select 1) one left join public.profile_private pp on pp.user_id = p.id;
$$;

create or replace function public.admin_users_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_master_admin();
  return jsonb_build_object('success', true,
    'users', coalesce((select jsonb_agg(public.admin_user_json(p) order by p.created_at) from public.profiles p), '[]'::jsonb));
end;
$$;

-- Suspending also stops the account from signing in or refreshing its session (Auth "ban").
create or replace function public.set_suspension(p_target uuid, p_suspend boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set is_suspended = p_suspend where id = p_target;
  insert into public.profile_private (user_id, suspended_reason) values (p_target, case when p_suspend then p_reason end)
  on conflict (user_id) do update set suspended_reason = excluded.suspended_reason;
  update auth.users set banned_until = case when p_suspend then now() + interval '100 years' else null end where id = p_target;
end;
$$;

create or replace function public.admin_suspend_user(p_target text, p_reason text default null, p_suspend boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid; t public.profiles; reason text; admin_id uuid := public.noob_admin_id();
begin
  me := public.require_master_admin('Access denied. Only the NOOB administrator can suspend accounts.');
  if btrim(coalesce(p_target, '')) = '' then raise exception 'Target user ID or username is required.'; end if;
  select * into t from public.profiles where id::text = btrim(p_target) or lower(username) = lower(btrim(p_target)) limit 1;
  if not found then raise exception 'Target account not found.'; end if;
  if lower(t.username) = 'noob' then raise exception 'The primary NOOB administrator account cannot be suspended.'; end if;
  reason := coalesce(nullif(btrim(p_reason), ''), 'Account suspended by NOOB Admin for policy violation');
  perform public.set_suspension(t.id, coalesce(p_suspend, true), reason);
  perform public.notify_user(t.id, 'admin_direct', admin_id,
    case when coalesce(p_suspend, true) then 'Your account @' || t.username || ' has been suspended by NOOB Admin. Reason: ' || reason
         else 'Your account access has been restored by NOOB Administrator. You may now continue using all features.' end,
    case when coalesce(p_suspend, true) then '⚠️ Account Suspended' else '✅ Account Restored' end);
  return jsonb_build_object('success', true,
    'message', 'Account @' || t.username || ' has been ' || case when coalesce(p_suspend, true) then 'suspended' else 'unsuspended' end || ' successfully.',
    'user', (select public.admin_user_json(p) from public.profiles p where p.id = t.id));
end;
$$;

create or replace function public.admin_delete_user(p_target text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.profiles;
begin
  perform public.require_master_admin('Access denied. Only the NOOB administrator can delete accounts.');
  if btrim(coalesce(p_target, '')) = '' then raise exception 'Target user ID or username is required.'; end if;
  select * into t from public.profiles where id::text = btrim(p_target) or lower(username) = lower(btrim(p_target)) limit 1;
  if not found then raise exception 'Target account not found.'; end if;
  if lower(t.username) = 'noob' or t.is_admin then raise exception 'The primary NOOB administrator account cannot be deleted.'; end if;
  delete from auth.users where id = t.id;   -- cascades to the profile and everything they made
  return jsonb_build_object('success', true, 'message', 'Account @' || t.username || ' and their content have been permanently deleted.');
end;
$$;

create or replace function public.admin_adjust_points(p_target uuid, p_set_to numeric default null, p_delta numeric default null, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.profiles; before_pts bigint; after_pts bigint; admin_id uuid := public.noob_admin_id();
begin
  perform public.require_master_admin('Access denied. Only the NOOB administrator can adjust point balances.');
  select * into t from public.profiles where id = p_target for update;
  if not found then raise exception 'Target account not found.'; end if;
  before_pts := t.noob_points;
  if p_set_to is not null then after_pts := greatest(0, round(p_set_to))::bigint;
  elsif p_delta is not null then after_pts := greatest(0, before_pts + round(p_delta))::bigint;
  else raise exception 'Provide either setTo or delta as a finite number.';
  end if;
  perform public.apply_points(t.id, after_pts - before_pts,
    coalesce(nullif(btrim(p_reason), ''), 'Balance corrected by NOOB Admin (' || public.fmt_points(before_pts) || ' → ' || public.fmt_points(after_pts) || ')'));
  perform public.notify_user(t.id, 'admin_direct', admin_id,
    'Your NOOB Points balance was adjusted by an administrator: ' || public.fmt_points(before_pts) || ' → ' || public.fmt_points(after_pts) || '.',
    '⚠️ Balance Adjusted');
  return jsonb_build_object('success', true,
    'message', '@' || t.username || '''s balance updated to ' || public.fmt_points(after_pts) || ' points.',
    'user', (select public.admin_user_json(p) from public.profiles p where p.id = t.id));
end;
$$;

-- Send a notice to one person, or "all" for a broadcast everyone sees.
create or replace function public.admin_send_notification(p_target text default 'all', p_title text default null, p_message text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.profiles; admin_id uuid := public.noob_admin_id(); nid uuid; clean text; label text; broadcast boolean;
begin
  perform public.require_master_admin('Access denied. Only the NOOB administrator can dispatch notifications.');
  if btrim(coalesce(p_title, '')) = '' or btrim(coalesce(p_message, '')) = '' then
    raise exception 'Notification title and message are required.';
  end if;
  clean := regexp_replace(btrim(coalesce(p_target, 'all')), '^@', '');
  broadcast := clean = '' or lower(clean) = 'all';
  if not broadcast then
    select * into t from public.profiles where id::text = clean or lower(username) = lower(clean) limit 1;
    if not found then raise exception 'User "@%" was not found.', clean; end if;
  end if;
  insert into public.notifications (target_user_id, actor_id, type, title, message)
  values (case when broadcast then null else t.id end, admin_id, case when broadcast then 'admin_broadcast' else 'admin_direct' end,
          btrim(p_title), btrim(p_message))
  returning id into nid;
  label := case when broadcast then 'All Users' else '@' || t.username end;
  return jsonb_build_object('success', true, 'message', 'Custom notification successfully dispatched to ' || label || '.', 'notification', jsonb_build_object('id', nid));
end;
$$;

create or replace function public.admin_reports() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_master_admin();
  return jsonb_build_object('success', true,
    'reports', coalesce((select jsonb_agg(public.report_json(r) order by r.created_at desc) from public.reports r), '[]'::jsonb));
end;
$$;

create or replace function public.admin_report_action(p_id uuid, p_action text default 'resolved', p_suspend boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid; rep public.reports; t public.profiles; st text;
begin
  me := public.require_master_admin();
  st := case when p_action in ('resolved', 'dismissed', 'banned') then p_action else 'resolved' end;
  update public.reports set status = st, reviewed_by = me, reviewed_at = now() where id = p_id returning * into rep;
  if not found then raise exception 'Report not found'; end if;
  if coalesce(p_suspend, false) then
    select * into t from public.profiles where id = rep.target_id;
    if found and lower(t.username) <> 'noob' then
      perform public.set_suspension(t.id, true, 'Account suspended following safety report: ' || rep.reason);
    end if;
  end if;
  return jsonb_build_object('success', true, 'report', public.report_json(rep), 'message', 'Report ' || p_id || ' marked as ' || st || '.');
end;
$$;

-- ===========================================================================
-- 8. Notifications now carry the scratch-card link (birthday gifts open from the bell)
-- ===========================================================================
create or replace function public.my_notifications() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('notifications', coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id, 'type', n.type, 'title', n.title, 'message', n.message, 'createdAt', n.created_at,
    'targetUserId', coalesce(n.target_user_id::text, 'all'),
    'actorId', n.actor_id, 'actorUsername', a.username, 'actorDisplayName', a.display_name, 'actorAvatar', a.avatar,
    'senderId', n.actor_id, 'senderUsername', a.username, 'senderDisplayName', a.display_name, 'senderAvatar', a.avatar,
    'senderIsVerified', coalesce(a.is_verified, false),
    'postId', n.post_id, 'reelId', n.reel_id, 'chatId', n.chat_id, 'actionStatus', n.action_status,
    'scratchCardId', n.data->>'scratchCardId',
    'isRead', exists (select 1 from public.notification_reads r where r.notification_id = n.id and r.user_id = auth.uid())
  ) order by n.created_at desc), '[]'::jsonb))
  from public.notifications n
  left join public.profiles a on a.id = n.actor_id
  where auth.uid() is not null
    and (n.target_user_id = auth.uid() or n.target_user_id is null)
    and not exists (select 1 from public.notification_clears c where c.notification_id = n.id and c.user_id = auth.uid());
$$;

-- Accounts that were already suspended in the old app can't sign in either.
update auth.users set banned_until = now() + interval '100 years'
where id in (select id from public.profiles where is_suspended) and banned_until is null;

-- ===========================================================================
-- 9. Hourly jobs (only where the pg_cron extension is available; otherwise skipped without failing)
-- ===========================================================================
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('noob-hourly', '5 * * * *',
      $job$ select public.run_birthday_check(); select public.run_pro_renewals(); select public.cleanup_stale_games(); $job$);
    perform cron.schedule('noob-story-cleanup', '15 3 * * *', $job$ select public.cleanup_expired_stories(); $job$);
  end if;
exception when others then
  raise notice 'Hourly jobs were not scheduled: %', sqlerrm;
end
$$;

-- ===========================================================================
-- 10. Who may call what
-- ===========================================================================
revoke all on public.coupon_uses, public.shop_items, public.live_avatar_presets, public.store_products,
              public.scratch_cards, public.reports, public.game_rooms, public.matchmaking_queue, public.user_game_state
  from anon, authenticated;
grant select on public.shop_items, public.live_avatar_presets, public.store_products, public.scratch_cards to authenticated;
grant all on public.coupon_uses, public.shop_items, public.live_avatar_presets, public.store_products, public.scratch_cards,
             public.reports, public.game_rooms, public.matchmaking_queue, public.user_game_state to service_role;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.resolve_login_email(text), public.username_taken(text), public.check_signup(jsonb) to anon;

-- Internal helpers: only other database functions may call these — never a browser.
revoke execute on function public.award_points(uuid, bigint, text) from authenticated;
revoke execute on function public.notify_user(uuid, text, uuid, text, text, uuid, uuid, uuid, text) from authenticated;
revoke execute on function public.system_message(uuid, text) from authenticated;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.notify_post_like() from authenticated;
revoke execute on function public.notify_reel_like() from authenticated;
revoke execute on function public.touch_chat_on_message() from authenticated;
revoke execute on function public.bump_counter() from authenticated;
revoke execute on function public.guard_inline_media() from authenticated;
revoke execute on function public.cleanup_expired_stories() from authenticated;
revoke execute on function public.apply_points(uuid, bigint, text) from authenticated;
revoke execute on function public.find_eligible_coupon(text, uuid) from authenticated;
revoke execute on function public.consume_coupon(uuid, uuid) from authenticated;
revoke execute on function public.pick_birthday_gift() from authenticated;
revoke execute on function public.run_birthday_check() from authenticated;
revoke execute on function public.run_pro_renewals() from authenticated;
revoke execute on function public.cleanup_stale_games() from authenticated;
revoke execute on function public.finalize_room_outcome(text, jsonb) from authenticated;
revoke execute on function public.set_suspension(uuid, boolean, text) from authenticated;
revoke execute on function public.game_player_json(uuid) from authenticated;
revoke execute on function public.noob_admin_id() from authenticated;
revoke execute on function public.require_master_admin(text) from authenticated;
revoke execute on function public.acting_user() from authenticated;
revoke execute on function public.report_json(public.reports) from authenticated;
revoke execute on function public.admin_user_json(public.profiles) from authenticated;
