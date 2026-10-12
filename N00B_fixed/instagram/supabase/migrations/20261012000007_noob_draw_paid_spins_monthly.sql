-- NOOB Draw: (1) the FREE spin of each pack now comes back every MONTH (on the 1st, India time) instead of every 7 days, and (2) anybody can
-- spin again, as often as they like, by paying NOOB Points (100,000,000 per spin to start with, set per pack in noob_draw_packs.spin_price).
-- The free period can be switched back to weekly at any time:  update public.noob_draw_config set value = 'week' where key = 'free_period';

-- ============================================================================================ 1. settings and columns
create table if not exists public.noob_draw_config (
  key   text primary key,
  value text not null
);
alter table public.noob_draw_config enable row level security;       -- no policy: only the functions below read it
insert into public.noob_draw_config (key, value) values ('free_period', 'month') on conflict (key) do nothing;

alter table public.noob_draw_packs add column if not exists spin_price bigint not null default 100000000;
alter table public.noob_draw_packs drop constraint if exists noob_draw_packs_price_check;
alter table public.noob_draw_packs add constraint noob_draw_packs_price_check check (spin_price > 0);

alter table public.noob_draw_spins add column if not exists paid boolean not null default false;
alter table public.noob_draw_spins add column if not exists cost bigint not null default 0;

-- ============================================================================================ 2. when is the free spin of a pack open?
-- Only FREE spins count: a paid spin never uses up (or brings back) the free one.
create or replace function public.noob_draw_free_window(p_user uuid, p_pack text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare per text; last_at timestamptz; next_at timestamptz;
begin
  select coalesce((select value from public.noob_draw_config where key = 'free_period'), 'month') into per;
  select max(created_at) into last_at from public.noob_draw_spins where user_id = p_user and pack = p_pack and not paid;
  if last_at is null then
    return jsonb_build_object('available', true, 'availableAt', null, 'lastAt', null, 'period', per);
  end if;
  if per = 'week' then
    next_at := last_at + interval '7 days';
  else
    next_at := (date_trunc('month', last_at at time zone 'Asia/Kolkata') + interval '1 month') at time zone 'Asia/Kolkata';
  end if;
  return jsonb_build_object('available', next_at <= now(), 'availableAt', case when next_at > now() then next_at end, 'lastAt', last_at, 'period', per);
end;
$$;
revoke execute on function public.noob_draw_free_window(uuid, text) from public, anon, authenticated;

-- ============================================================================================ 3. what the page shows
create or replace function public.noob_draw_state() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.acting_user();
begin
  return jsonb_build_object(
    'now', now(),
    'freePeriod', coalesce((select value from public.noob_draw_config where key = 'free_period'), 'month'),
    'packs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pk.id, 'name', pk.name, 'tagline', pk.tagline, 'price', pk.spin_price,
        'availableAt', ls.fw->'availableAt',
        'lastSpinAt', ls.fw->'lastAt',
        'prizes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', z.id, 'kind', z.kind, 'label', z.label, 'subtitle', z.subtitle, 'rarity', z.rarity,
            'odds', round(z.weight * 100.0 / z.total, 2), 'amount', z.amount, 'ref', z.ref) order by z.sort, z.id)
          from (select p.*, sum(p.weight) over () as total from public.noob_draw_prizes p where p.pack = pk.id) z), '[]'::jsonb)
      ) order by pk.sort)
      from public.noob_draw_packs pk
      left join lateral (select public.noob_draw_free_window(me, pk.id) as fw) ls on true), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('pack', h.pack, 'packName', h.pack_name, 'label', h.label, 'rarity', h.rarity, 'kind', h.kind,
                                          'message', h.result->>'message', 'paid', h.paid, 'cost', h.cost, 'at', h.created_at) order by h.created_at desc)
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

-- ============================================================================================ 4. the spin: free, or paid with NOOB Points
drop function if exists public.noob_draw_spin(text);
create or replace function public.noob_draw_spin(p_pack text, p_paid boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.acting_user(); pk public.noob_draw_packs; fw jsonb; per text; bal bigint; prize public.noob_draw_prizes; res jsonb;
  is_paid boolean := coalesce(p_paid, false); cost_pts bigint := 0;
begin
  select * into pk from public.noob_draw_packs where id = p_pack;
  if not found then raise exception 'This spin does not exist.'; end if;

  perform 1 from public.profiles where id = me for update;     -- one spin at a time per person, so a double tap can never pay or take twice
  fw := public.noob_draw_free_window(me, p_pack);
  per := fw->>'period';

  if is_paid then
    if (fw->>'available')::boolean then
      return jsonb_build_object('success', false, 'freeReady', true, 'error', format('Your free %s is ready. Use it first: it costs nothing.', pk.name));
    end if;
    select noob_points into bal from public.profiles where id = me;
    if coalesce(bal, 0) < pk.spin_price then
      return jsonb_build_object('success', false, 'needPoints', pk.spin_price,
        'error', format('This spin costs %s NOOB Points and you have %s.', public.fmt_points(pk.spin_price), public.fmt_points(coalesce(bal, 0))));
    end if;
    perform public.apply_points(me, -pk.spin_price, format('NOOB Draw — %s: paid spin', pk.name));
    cost_pts := pk.spin_price;
  elsif not (fw->>'available')::boolean then
    return jsonb_build_object('success', false, 'availableAt', fw->'availableAt', 'price', pk.spin_price,
      'error', format('You already used the free %s this %s.', pk.name, per));
  end if;

  prize := public.noob_draw_pick(p_pack, public.noob_draw_random());
  res := public.noob_draw_grant(me, prize, pk.name);
  insert into public.noob_draw_spins (user_id, pack, prize_id, kind, label, rarity, result, paid, cost)
  values (me, p_pack, prize.id, prize.kind, prize.label, prize.rarity, res, is_paid, cost_pts);
  fw := public.noob_draw_free_window(me, p_pack);

  return jsonb_build_object('success', true, 'availableAt', fw->'availableAt', 'paid', is_paid, 'cost', cost_pts,
    'prize', jsonb_build_object('id', prize.id, 'kind', prize.kind, 'label', prize.label, 'subtitle', prize.subtitle, 'rarity', prize.rarity,
                                'amount', prize.amount, 'ref', prize.ref) || res,
    'user', public.get_my_user());
end;
$$;
revoke execute on function public.noob_draw_spin(text, boolean) from public, anon;
grant execute on function public.noob_draw_spin(text, boolean) to authenticated;
