-- NOOB Draw: weekly prize spins. Five spin designs ("packs"); every person can spin each pack once every 7 days. The prize is chosen
-- here in the database (never in the browser), so it can not be bent, and it is paid out in the same step as the spin:
--   points (millions), a NOOB Pro plan for some days, the verified tick, a live profile picture, exclusive animated stickers.
-- The odds live in the noob_draw_prizes table (weight out of 10,000 per pack) and can be tuned there at any time.

-- ============================================================================================ 1. tables
create table if not exists public.noob_draw_packs (
  id      text primary key,
  name    text not null,
  tagline text not null default '',
  sort    integer not null default 0
);

create table if not exists public.noob_draw_prizes (
  id              text primary key,
  pack            text not null references public.noob_draw_packs (id) on delete cascade,
  kind            text not null check (kind in ('points', 'pro', 'verified', 'live_avatar', 'stickers')),
  label           text not null,
  subtitle        text not null default '',
  rarity          text not null check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic')),
  weight          integer not null check (weight > 0),
  amount          bigint,                       -- points: how many
  tier            text,                         -- pro: starter / plus / pro / elite / ultimate
  days            integer,                      -- pro: for how many days
  ref             text,                         -- live_avatar: the preset id; stickers: comma separated sticker names
  fallback_points bigint not null default 0,    -- paid instead when the prize can not be given (already verified, already owned, ...)
  sort            integer not null default 0
);
create index if not exists noob_draw_prizes_pack_idx on public.noob_draw_prizes (pack, sort);

create table if not exists public.noob_draw_spins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  pack       text not null,
  prize_id   text not null,
  kind       text not null,
  label      text not null,
  rarity     text not null,
  result     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists noob_draw_spins_user_idx on public.noob_draw_spins (user_id, pack, created_at desc);
create index if not exists noob_draw_spins_big_idx on public.noob_draw_spins (created_at desc) where rarity in ('epic', 'legendary', 'mythic');

-- live profile pictures won in NOOB Draw: the person may wear them even without NOOB Pro
create table if not exists public.live_avatar_unlocks (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  preset_id  text not null references public.live_avatar_presets (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, preset_id)
);

alter table public.noob_draw_packs   enable row level security;
alter table public.noob_draw_prizes  enable row level security;
alter table public.noob_draw_spins   enable row level security;
alter table public.live_avatar_unlocks enable row level security;
drop policy if exists noob_draw_packs_read on public.noob_draw_packs;
create policy noob_draw_packs_read on public.noob_draw_packs for select using (true);
drop policy if exists noob_draw_prizes_read on public.noob_draw_prizes;
create policy noob_draw_prizes_read on public.noob_draw_prizes for select using (true);
drop policy if exists noob_draw_spins_read_own on public.noob_draw_spins;
create policy noob_draw_spins_read_own on public.noob_draw_spins for select using (user_id = auth.uid());
drop policy if exists live_avatar_unlocks_read_own on public.live_avatar_unlocks;
create policy live_avatar_unlocks_read_own on public.live_avatar_unlocks for select using (user_id = auth.uid());

-- ============================================================================================ 2. the five spins and their prizes
insert into public.noob_draw_packs (id, name, tagline, sort) values
  ('rookie', 'Rookie Spin',  'Free points, every week', 1),
  ('neon',   'Neon Spin',    'Stickers & live profiles', 2),
  ('royal',  'Royal Spin',   'NOOB Pro plans', 3),
  ('inferno','Inferno Spin', 'Millions of points', 4),
  ('galaxy', 'Galaxy Spin',  'Legendary prizes', 5)
on conflict (id) do nothing;

insert into public.noob_draw_prizes (id, pack, kind, label, subtitle, rarity, weight, amount, tier, days, ref, fallback_points, sort) values
  -- Rookie Spin
  ('rk_1m',   'rookie', 'points',  '1,000,000 Points',   'NOOB Points', 'common',    3200, 1000000,   null, null, null, 0, 1),
  ('rk_2m',   'rookie', 'points',  '2,000,000 Points',   'NOOB Points', 'common',    2600, 2000000,   null, null, null, 0, 2),
  ('rk_5m',   'rookie', 'points',  '5,000,000 Points',   'NOOB Points', 'uncommon',  1800, 5000000,   null, null, null, 0, 3),
  ('rk_10m',  'rookie', 'points',  '10,000,000 Points',  'NOOB Points', 'uncommon',  1000, 10000000,  null, null, null, 0, 4),
  ('rk_25m',  'rookie', 'points',  '25,000,000 Points',  'NOOB Points', 'rare',       600, 25000000,  null, null, null, 0, 5),
  ('rk_stk',  'rookie', 'stickers','Starter Stickers',   '3 exclusive animated stickers', 'rare', 400, null, null, null, 'spark,coin,clover', 10000000, 6),
  ('rk_50m',  'rookie', 'points',  '50,000,000 Points',  'NOOB Points', 'epic',       200, 50000000,  null, null, null, 0, 7),
  ('rk_pro',  'rookie', 'pro',     'NOOB Pro Starter',   '7 days of Pro', 'epic',     120, null, 'starter', 7, null, 25000000, 8),
  ('rk_100m', 'rookie', 'points',  '100,000,000 Points', 'NOOB Points', 'legendary',   80, 100000000, null, null, null, 0, 9),
  -- Neon Spin
  ('nn_2m',   'neon', 'points',  '2,000,000 Points',   'NOOB Points', 'common',    3000, 2000000,  null, null, null, 0, 1),
  ('nn_5m',   'neon', 'points',  '5,000,000 Points',   'NOOB Points', 'common',    2000, 5000000,  null, null, null, 0, 2),
  ('nn_stk1', 'neon', 'stickers','Neon Stickers',      '4 exclusive animated stickers', 'uncommon', 1800, null, null, null, 'bolt,neon-heart,ghost,eye', 10000000, 3),
  ('nn_10m',  'neon', 'points',  '10,000,000 Points',  'NOOB Points', 'uncommon',  1000, 10000000, null, null, null, 0, 4),
  ('nn_av1',  'neon', 'live_avatar','Neon Pulse',      'Live profile picture', 'rare', 500, null, null, null, 'neon_pulse', 25000000, 5),
  ('nn_av2',  'neon', 'live_avatar','Aurora Wave',     'Live profile picture', 'rare', 400, null, null, null, 'aurora_wave', 25000000, 6),
  ('nn_25m',  'neon', 'points',  '25,000,000 Points',  'NOOB Points', 'rare',       500, 25000000, null, null, null, 0, 7),
  ('nn_av3',  'neon', 'live_avatar','Cyber Grid',      'Live profile picture', 'epic', 300, null, null, null, 'cyber_grid', 40000000, 8),
  ('nn_stk2', 'neon', 'stickers','Golden Stickers',    '6 exclusive animated stickers', 'epic', 250, null, null, null, 'crown,gem,trophy,rocket,star,flame', 40000000, 9),
  ('nn_av4',  'neon', 'live_avatar','Holographic',     'Live profile picture', 'legendary', 150, null, null, null, 'holographic_foil', 80000000, 10),
  ('nn_av5',  'neon', 'live_avatar','Phoenix Flame',   'Live profile picture', 'legendary', 100, null, null, null, 'phoenix_flame', 80000000, 11),
  -- Royal Spin
  ('ry_5m',   'royal', 'points', '5,000,000 Points',   'NOOB Points', 'common',    3000, 5000000,  null, null, null, 0, 1),
  ('ry_10m',  'royal', 'points', '10,000,000 Points',  'NOOB Points', 'common',    2000, 10000000, null, null, null, 0, 2),
  ('ry_st7',  'royal', 'pro',    'NOOB Pro Starter',   '7 days of Pro', 'uncommon', 2000, null, 'starter',  7, null, 25000000, 3),
  ('ry_pl7',  'royal', 'pro',    'NOOB Pro Plus',      '7 days of Pro', 'rare',     1200, null, 'plus',     7, null, 40000000, 4),
  ('ry_pr7',  'royal', 'pro',    'NOOB Pro',           '7 days of Pro', 'rare',      800, null, 'pro',      7, null, 60000000, 5),
  ('ry_el7',  'royal', 'pro',    'NOOB Pro Elite',     '7 days of Pro', 'epic',      450, null, 'elite',    7, null, 80000000, 6),
  ('ry_ul7',  'royal', 'pro',    'NOOB Pro Ultimate',  '7 days of Pro', 'epic',      300, null, 'ultimate', 7, null, 100000000, 7),
  ('ry_pr30', 'royal', 'pro',    'NOOB Pro',           '30 days of Pro', 'legendary', 150, null, 'pro',     30, null, 250000000, 8),
  ('ry_ul30', 'royal', 'pro',    'NOOB Pro Ultimate',  '30 days of Pro', 'legendary', 100, null, 'ultimate', 30, null, 400000000, 9),
  -- Inferno Spin
  ('if_10m',  'inferno', 'points', '10,000,000 Points',  'NOOB Points', 'common',    3000, 10000000,  null, null, null, 0, 1),
  ('if_20m',  'inferno', 'points', '20,000,000 Points',  'NOOB Points', 'common',    2200, 20000000,  null, null, null, 0, 2),
  ('if_30m',  'inferno', 'points', '30,000,000 Points',  'NOOB Points', 'uncommon',  1800, 30000000,  null, null, null, 0, 3),
  ('if_50m',  'inferno', 'points', '50,000,000 Points',  'NOOB Points', 'uncommon',  1200, 50000000,  null, null, null, 0, 4),
  ('if_100m', 'inferno', 'points', '100,000,000 Points', 'NOOB Points', 'rare',       900, 100000000, null, null, null, 0, 5),
  ('if_200m', 'inferno', 'points', '200,000,000 Points', 'NOOB Points', 'rare',       500, 200000000, null, null, null, 0, 6),
  ('if_300m', 'inferno', 'points', '300,000,000 Points', 'NOOB Points', 'epic',       200, 300000000, null, null, null, 0, 7),
  ('if_500m', 'inferno', 'points', '500,000,000 Points', 'NOOB Points', 'epic',       100, 500000000, null, null, null, 0, 8),
  ('if_750m', 'inferno', 'points', '750,000,000 Points', 'NOOB Points', 'legendary', 70, 750000000, null, null, null, 0, 9),
  ('if_1b',   'inferno', 'points', '1,000,000,000 Points', 'NOOB Points', 'legendary', 30, 1000000000, null, null, null, 0, 10),
  -- Galaxy Spin
  ('gx_25m',  'galaxy', 'points', '25,000,000 Points',  'NOOB Points', 'common',    3000, 25000000,  null, null, null, 0, 1),
  ('gx_50m',  'galaxy', 'points', '50,000,000 Points',  'NOOB Points', 'common',    2500, 50000000,  null, null, null, 0, 2),
  ('gx_100m', 'galaxy', 'points', '100,000,000 Points', 'NOOB Points', 'uncommon',  1700, 100000000, null, null, null, 0, 3),
  ('gx_stk',  'galaxy', 'stickers','Golden Stickers',   '6 exclusive animated stickers', 'rare', 900, null, null, null, 'crown,gem,trophy,rocket,star,flame', 50000000, 4),
  ('gx_el7',  'galaxy', 'pro',    'NOOB Pro Elite',     '7 days of Pro', 'rare',      700, null, 'elite',   7, null, 80000000, 5),
  ('gx_ul30', 'galaxy', 'pro',    'NOOB Pro Ultimate',  '30 days of Pro', 'epic',     400, null, 'ultimate', 30, null, 400000000, 6),
  ('gx_av',   'galaxy', 'live_avatar','Royal Crown',    'Live profile picture', 'epic', 300, null, null, null, 'royal_crown', 100000000, 7),
  ('gx_500m', 'galaxy', 'points', '500,000,000 Points', 'NOOB Points', 'epic',       250, 500000000, null, null, null, 0, 8),
  ('gx_el30', 'galaxy', 'pro',    'NOOB Pro Elite',     '30 days of Pro', 'legendary', 120, null, 'elite', 30, null, 250000000, 9),
  ('gx_1b',   'galaxy', 'points', '1,000,000,000 Points', 'NOOB Points', 'legendary', 70, 1000000000, null, null, null, 0, 10),
  ('gx_ul90', 'galaxy', 'pro',    'NOOB Pro Ultimate',  '90 days of Pro', 'legendary', 40, null, 'ultimate', 90, null, 1000000000, 11),
  ('gx_vrf',  'galaxy', 'verified', 'Verified Tick',    'The blue tick, forever', 'mythic', 10, null, null, null, null, 1000000000, 12),
  ('gx_5b',   'galaxy', 'points', '5,000,000,000 Points', 'NOOB Points', 'mythic',   10, 5000000000, null, null, null, 0, 13)
on conflict (id) do nothing;

-- ============================================================================================ 3. helpers (internal)
create or replace function public.noob_draw_rank(p_tier text) returns integer
language sql immutable set search_path = public as $$
  select case p_tier when 'starter' then 1 when 'plus' then 2 when 'pro' then 3 when 'elite' then 4 when 'ultimate' then 5 else 0 end;
$$;

-- a fair random number in [0, 1): 48 random bits from the database's secure random source
create or replace function public.noob_draw_random() returns double precision
language sql volatile set search_path = public as $$
  select (('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))::bit(48)::bigint)::double precision / 281474976710656.0;
$$;

-- The prize that sits at the random number p_r (0 to 1) of the pack's odds. Public callers never choose p_r: only noob_draw_spin calls this.
create or replace function public.noob_draw_pick(p_pack text, p_r double precision) returns public.noob_draw_prizes
language plpgsql stable set search_path = public as $$
declare total bigint; target bigint; pid text;
begin
  select coalesce(sum(weight), 0) into total from public.noob_draw_prizes where pack = p_pack;
  if total = 0 then raise exception 'This spin has no prizes yet.'; end if;
  target := least(total - 1, floor(greatest(0, least(coalesce(p_r, 0), 0.9999999999)) * total))::bigint;
  select x.id into pid from (
    select p.id, sum(p.weight) over (order by p.sort, p.id) as cum from public.noob_draw_prizes p where p.pack = p_pack
  ) x where x.cum > target order by x.cum limit 1;
  return (select p from public.noob_draw_prizes p where p.id = pid);
end;
$$;

-- Pays the prize out. Returns what happened: {applied: 'ok' | 'fallback', message, ...}. When a prize can not be given (the tick is already
-- there, the item is already owned) the person gets its fallback points instead, so a spin is never wasted.
create or replace function public.noob_draw_grant(p_user uuid, p_prize public.noob_draw_prizes, p_pack_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cur public.profiles; ends timestamptz; msg text; pname text; added integer := 0; nm text; fb bigint := coalesce(p_prize.fallback_points, 0);
  reason text := format('NOOB Draw — %s: %s', p_pack_name, p_prize.label);
  ends_txt text;
begin
  if p_prize.kind = 'points' then
    perform public.apply_points(p_user, p_prize.amount, reason);
    return jsonb_build_object('applied', 'ok', 'message', format('%s NOOB Points were added to your wallet.', public.fmt_points(p_prize.amount)));
  end if;

  if p_prize.kind = 'pro' then
    select * into cur from public.profiles where id = p_user for update;
    if cur.pro_tier is not null and cur.pro_renews_at is null then
      null;                                                     -- a plan with no end date: nothing to add to
    elsif cur.pro_tier is null or cur.pro_renews_at <= now() then
      ends := now() + make_interval(days => p_prize.days);
      update public.profiles set pro_tier = p_prize.tier, pro_billing = 'monthly', pro_auto_renew = false, pro_renews_at = ends where id = p_user;
      ends_txt := to_char(ends at time zone 'Asia/Kolkata', 'DD Mon YYYY');
      return jsonb_build_object('applied', 'ok', 'endsAt', ends, 'message', format('Your NOOB Pro plan is active until %s. It does not renew by itself.', ends_txt));
    elsif public.noob_draw_rank(p_prize.tier) <= public.noob_draw_rank(cur.pro_tier) then
      ends := cur.pro_renews_at + make_interval(days => p_prize.days);
      update public.profiles set pro_renews_at = ends where id = p_user;
      ends_txt := to_char(ends at time zone 'Asia/Kolkata', 'DD Mon YYYY');
      return jsonb_build_object('applied', 'ok', 'endsAt', ends, 'message', format('%s days were added to your NOOB Pro plan. It now runs until %s.', p_prize.days, ends_txt));
    else
      ends := cur.pro_renews_at + make_interval(days => p_prize.days);
      update public.profiles set pro_tier = p_prize.tier, pro_auto_renew = false, pro_renews_at = ends where id = p_user;
      ends_txt := to_char(ends at time zone 'Asia/Kolkata', 'DD Mon YYYY');
      return jsonb_build_object('applied', 'ok', 'endsAt', ends, 'message', format('You moved up to NOOB Pro %s until %s. Automatic renewal is switched off, so turn it on again if you want to keep paying.', initcap(p_prize.tier), ends_txt));
    end if;

  elsif p_prize.kind = 'verified' then
    select * into cur from public.profiles where id = p_user for update;
    if not cur.is_verified then
      update public.profiles set is_verified = true, verification_tier = 'premium' where id = p_user;
      perform public.notify_user(p_user, 'admin_direct', public.noob_admin_id(),
        'You won the Verified Tick in NOOB Draw. The blue tick now shows next to your name everywhere in NOOB.', '✅ You are verified!');
      return jsonb_build_object('applied', 'ok', 'message', 'The blue verified tick now shows next to your name everywhere in NOOB.');
    end if;

  elsif p_prize.kind = 'live_avatar' then
    select name into pname from public.live_avatar_presets where id = p_prize.ref;
    if pname is not null and not exists (select 1 from public.live_avatar_unlocks where user_id = p_user and preset_id = p_prize.ref) then
      insert into public.live_avatar_unlocks (user_id, preset_id) values (p_user, p_prize.ref);
      return jsonb_build_object('applied', 'ok', 'presetId', p_prize.ref,
        'message', format('%s is yours for good, even without NOOB Pro. Wear it as your profile picture any time.', pname));
    end if;

  elsif p_prize.kind = 'stickers' then
    foreach nm in array string_to_array(coalesce(p_prize.ref, ''), ',') loop
      nm := btrim(nm);
      continue when nm = '';
      if not exists (select 1 from public.custom_stickers where user_id = p_user and object_key = '/draw-stickers/' || nm || '.svg') then
        insert into public.custom_stickers (user_id, object_key, title) values (p_user, '/draw-stickers/' || nm || '.svg', 'NOOB Draw ' || initcap(replace(nm, '-', ' ')));
        added := added + 1;
      end if;
    end loop;
    if added > 0 then
      return jsonb_build_object('applied', 'ok', 'message', format('%s animated stickers were added to My stickers. Open a chat and tap the sticker button to send them.', added));
    end if;
  end if;

  -- could not be given: pay the fallback instead
  if fb > 0 then
    perform public.apply_points(p_user, fb, reason || ' (already owned, paid in points)');
  end if;
  return jsonb_build_object('applied', 'fallback', 'fallbackPoints', fb,
    'message', format('You already have this, so %s NOOB Points were added to your wallet instead.', public.fmt_points(fb)));
end;
$$;

-- ============================================================================================ 4. what the page shows
create or replace function public.noob_draw_state() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.acting_user();
begin
  return jsonb_build_object(
    'now', now(),
    'packs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pk.id, 'name', pk.name, 'tagline', pk.tagline,
        'availableAt', case when ls.last_at is not null and ls.last_at > now() - interval '7 days' then ls.last_at + interval '7 days' end,
        'lastSpinAt', ls.last_at,
        'prizes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', z.id, 'kind', z.kind, 'label', z.label, 'subtitle', z.subtitle, 'rarity', z.rarity,
            'odds', round(z.weight * 100.0 / z.total, 2), 'amount', z.amount, 'ref', z.ref) order by z.sort, z.id)
          from (select p.*, sum(p.weight) over () as total from public.noob_draw_prizes p where p.pack = pk.id) z), '[]'::jsonb)
      ) order by pk.sort)
      from public.noob_draw_packs pk
      left join lateral (select max(s.created_at) as last_at from public.noob_draw_spins s where s.user_id = me and s.pack = pk.id) ls on true), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('pack', h.pack, 'packName', h.pack_name, 'label', h.label, 'rarity', h.rarity, 'kind', h.kind,
                                          'message', h.result->>'message', 'at', h.created_at) order by h.created_at desc)
      from (select s.*, pk.name as pack_name from public.noob_draw_spins s left join public.noob_draw_packs pk on pk.id = s.pack
            where s.user_id = me order by s.created_at desc limit 30) h), '[]'::jsonb),
    'ticker', coalesce((
      select jsonb_agg(jsonb_build_object('username', t.username, 'label', t.label, 'rarity', t.rarity, 'packName', t.pack_name, 'at', t.created_at) order by t.created_at desc)
      from (select s.created_at, s.label, s.rarity, p.username, pk.name as pack_name
            from public.noob_draw_spins s join public.profiles p on p.id = s.user_id left join public.noob_draw_packs pk on pk.id = s.pack
            where s.rarity in ('epic', 'legendary', 'mythic') and p.account_type <> 'private' and not p.is_ai
            order by s.created_at desc limit 14) t), '[]'::jsonb),
    'unlockedAvatars', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'url', l.url) order by u.created_at desc)
      from public.live_avatar_unlocks u join public.live_avatar_presets l on l.id = u.preset_id where u.user_id = me), '[]'::jsonb)
  );
end;
$$;

-- ============================================================================================ 5. the spin
create or replace function public.noob_draw_spin(p_pack text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); pk public.noob_draw_packs; last_at timestamptz; prize public.noob_draw_prizes; res jsonb; next_at timestamptz;
begin
  select * into pk from public.noob_draw_packs where id = p_pack;
  if not found then raise exception 'This spin does not exist.'; end if;

  perform 1 from public.profiles where id = me for update;     -- one spin at a time per person, so a double tap can never pay twice
  select max(created_at) into last_at from public.noob_draw_spins where user_id = me and pack = p_pack;
  if last_at is not null and last_at > now() - interval '7 days' then
    return jsonb_build_object('success', false, 'error', format('You already used the %s this week.', pk.name), 'availableAt', last_at + interval '7 days');
  end if;

  prize := public.noob_draw_pick(p_pack, public.noob_draw_random());
  res := public.noob_draw_grant(me, prize, pk.name);
  insert into public.noob_draw_spins (user_id, pack, prize_id, kind, label, rarity, result) values (me, p_pack, prize.id, prize.kind, prize.label, prize.rarity, res);
  next_at := now() + interval '7 days';

  return jsonb_build_object('success', true, 'availableAt', next_at,
    'prize', jsonb_build_object('id', prize.id, 'kind', prize.kind, 'label', prize.label, 'subtitle', prize.subtitle, 'rarity', prize.rarity,
                                'amount', prize.amount, 'ref', prize.ref) || res,
    'user', public.get_my_user());
end;
$$;

-- ============================================================================================ 6. wearing a live profile picture that was won
-- Same as before, but a preset the person won in NOOB Draw may be worn without NOOB Pro.
create or replace function public.apply_live_avatar(p_preset text default null, p_custom_url text default null, p_custom_video_url text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); url text; video text;
begin
  if (select pro_tier from public.profiles where id = me) is null
     and not (btrim(coalesce(p_preset, '')) <> '' and exists (select 1 from public.live_avatar_unlocks where user_id = me and preset_id = p_preset)) then
    raise exception 'Live Profile Pictures are a NOOB Pro feature. Upgrade to unlock them.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_preset, '')) <> '' then
    select l.url into url from public.live_avatar_presets l where l.id = p_preset;
    if url is null then raise exception 'Unknown preset.'; end if;
    video := null;   -- presets are curated animated images (GIF/WebP), not a separate video file
  elsif btrim(coalesce(p_custom_url, '')) <> '' then
    url := btrim(p_custom_url);
    video := nullif(btrim(coalesce(p_custom_video_url, '')), '');
  else
    raise exception 'Choose a preset or upload a custom live picture.';
  end if;
  update public.profiles set avatar = url, is_live_avatar = true, live_avatar_video_url = video where id = me;
  return jsonb_build_object('success', true, 'user', public.get_my_user());
end;
$$;

-- ============================================================================================ 7. who may call what
revoke execute on function public.noob_draw_rank(text) from public, anon, authenticated;
revoke execute on function public.noob_draw_random() from public, anon, authenticated;
revoke execute on function public.noob_draw_pick(text, double precision) from public, anon, authenticated;
revoke execute on function public.noob_draw_grant(uuid, public.noob_draw_prizes, text) from public, anon, authenticated;
revoke execute on function public.noob_draw_state() from public, anon;
grant execute on function public.noob_draw_state() to authenticated;
revoke execute on function public.noob_draw_spin(text) from public, anon;
grant execute on function public.noob_draw_spin(text) to authenticated;
revoke execute on function public.apply_live_avatar(text, text, text) from public, anon;
grant execute on function public.apply_live_avatar(text, text, text) to authenticated;
