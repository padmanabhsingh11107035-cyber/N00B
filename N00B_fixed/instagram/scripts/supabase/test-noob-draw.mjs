// Tests migration 20261012000005: NOOB Draw (weekly prize spins), on a REAL Postgres (PGlite) with every migration applied.
// The five spins, the odds, the once-a-week rule per spin, and every kind of prize being really paid out (points, NOOB Pro, the verified tick,
// live profile pictures, stickers), plus who may call what.
//
// Usage: node scripts/supabase/test-noob-draw.mjs
import fs from 'node:fs';
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};
const section = (t) => console.log(`\n${t}`);

const db = await createTestDb();
const mkUser = async (name, patch = {}) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  const has = (await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length;
  if (!has) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  for (const [col, val] of Object.entries(patch)) await db.query(`update public.profiles set ${col} = $2 where id = $1`, [id, val]);
  return id;
};
const call = (uid, sql, params = []) => asUser(db, uid, async () => (await db.query(sql, params)).rows);
const rpc = async (uid, fn, ...args) => (await call(uid, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args))[0].r;
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const profile = async (id) => (await q(`select * from public.profiles where id = $1`, [id]))[0];
const prizeRow = async (id) => (await q(`select * from public.noob_draw_prizes where id = $1`, [id]))[0];
// pays a named prize out to somebody, as the server does (internal function, so run as the database owner)
const grant = async (uid, prizeId) => (await q(`select public.noob_draw_grant($1, (select p from public.noob_draw_prizes p where p.id = $2), 'Test Spin') as r`, [uid, prizeId]))[0].r;

section('1. The five spins and their odds');
const packs = await q(`select * from public.noob_draw_packs order by sort`);
check(packs.length === 5 && packs.map((p) => p.id).join() === 'rookie,neon,royal,inferno,galaxy', 'five spins: Rookie, Neon, Royal, Inferno, Galaxy');
for (const p of packs) {
  const sum = (await q(`select sum(weight)::int as s, count(*)::int as n from public.noob_draw_prizes where pack = $1`, [p.id]))[0];
  check(sum.s === 10000 && sum.n >= 9, `${p.name}: ${sum.n} prizes, odds add up to exactly 100%`, `sum=${sum.s}`);
}
const badAvatars = await q(`select p.id from public.noob_draw_prizes p where p.kind = 'live_avatar' and not exists (select 1 from public.live_avatar_presets l where l.id = p.ref)`);
check(badAvatars.length === 0, 'every live profile prize is a live profile picture that exists', badAvatars.map((r) => r.id).join());
const stickerNames = new Set((await q(`select ref from public.noob_draw_prizes where kind = 'stickers'`)).flatMap((r) => r.ref.split(',')));
const missingFiles = [...stickerNames].filter((n) => !fs.existsSync(`public/draw-stickers/${n}.svg`));
check(stickerNames.size >= 10 && missingFiles.length === 0, `every sticker prize has its animated sticker file (${stickerNames.size} stickers)`, missingFiles.join());
const badTiers = await q(`select id from public.noob_draw_prizes where kind = 'pro' and (public.noob_draw_rank(tier) = 0 or days is null or days < 1)`);
check(badTiers.length === 0, 'every Pro prize names a real plan and a number of days');
const noFallback = await q(`select id from public.noob_draw_prizes where kind in ('pro', 'verified', 'live_avatar', 'stickers') and fallback_points <= 0`);
check(noFallback.length === 0, 'every prize that can be refused ("you already have it") pays points instead');
const kinds = new Set((await q(`select distinct kind from public.noob_draw_prizes`)).map((r) => r.kind));
check(['points', 'pro', 'verified', 'live_avatar', 'stickers'].every((k) => kinds.has(k)) && kinds.size === 5, 'all five kinds of prize are in the spins');

section('2. The prize that is drawn follows the odds exactly');
for (const p of packs) {
  const weights = Object.fromEntries((await q(`select id, weight from public.noob_draw_prizes where pack = $1`, [p.id])).map((r) => [r.id, r.weight]));
  const got = {};
  const rows = await q(`select (public.noob_draw_pick($1, (g + 0.5) / 10000.0)).id as id from generate_series(0, 9999) g`, [p.id]);
  for (const r of rows) got[r.id] = (got[r.id] || 0) + 1;
  check(Object.entries(weights).every(([id, w]) => got[id] === w) && rows.length === 10000, `${p.name}: walking the whole 0-100% range gives every prize exactly its share`);
}
const edge = (await q(`select (public.noob_draw_pick('rookie', 0)).id as a, (public.noob_draw_pick('rookie', 0.9999999999)).id as b, (public.noob_draw_pick('rookie', 5)).id as c, (public.noob_draw_pick('rookie', -3)).id as d`))[0];
check(edge.a === 'rk_1m' && edge.b === 'rk_100m' && edge.c === 'rk_100m' && edge.d === 'rk_1m', 'the very first / very last prize are reachable, and silly numbers are held inside the range');
const rnd = (await q(`select avg(public.noob_draw_random())::float as m, min(public.noob_draw_random())::float as lo, max(public.noob_draw_random())::float as hi from generate_series(1, 4000)`))[0];
check(rnd.lo >= 0 && rnd.hi < 1 && rnd.m > 0.46 && rnd.m < 0.54, 'the random number is spread evenly between 0 and 1', JSON.stringify(rnd));

section('3. One free spin of each pack, back every month');
const ann = await mkUser('ann', { noob_points: 0 });
const bob = await mkUser('bob', { noob_points: 0 });
const nextMonth = new Date((await q(`select ((date_trunc('month', now() at time zone 'Asia/Kolkata') + interval '1 month') at time zone 'Asia/Kolkata') as t`))[0].t);
const first = await rpc(ann, 'noob_draw_spin', 'rookie');
check(first.success === true && first.paid === false && first.cost === 0 && first.prize?.id && first.prize.label && first.prize.rarity && first.user?.username === 'ann', 'the first spin is free and brings back the prize and the updated account');
check(Math.abs(new Date(first.availableAt) - nextMonth) < 1000, 'it says when the free spin comes back: midnight on the 1st of next month, India time');
const again = await rpc(ann, 'noob_draw_spin', 'rookie');
check(again.success === false && /already used the free Rookie Spin this month/.test(again.error) && Math.abs(new Date(again.availableAt) - nextMonth) < 1000 && again.price === 100000000, 'the free spin again: refused, with the day it comes back and what a paid spin costs');
const others = [];
for (const id of ['neon', 'royal', 'inferno', 'galaxy']) others.push(await rpc(ann, 'noob_draw_spin', id));
check(others.every((r) => r.success === true), 'the other four packs still have their free spin: one free spin of EACH pack every month');
check((await q(`select count(*)::int as n from public.noob_draw_spins where user_id = $1`, [ann]))[0].n === 5, 'five spins are on record');
check((await rpc(bob, 'noob_draw_spin', 'rookie')).success === true, 'another person has their own free spin');
await db.query(`update public.noob_draw_spins set created_at = (date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata') + interval '1 second' where user_id = $1 and pack = 'rookie'`, [ann]);
check((await rpc(ann, 'noob_draw_spin', 'rookie')).success === false, 'a free spin used just after midnight on the 1st of this month is still used up');
await db.query(`update public.noob_draw_spins set created_at = (date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata') - interval '1 second' where user_id = $1 and pack = 'rookie'`, [ann]);
check((await rpc(ann, 'noob_draw_spin', 'rookie')).success === true, 'a free spin used in the last second of last month is back this month');
await db.query(`update public.noob_draw_config set value = 'week' where key = 'free_period'`);
await db.query(`update public.noob_draw_spins set created_at = now() - interval '6 days 23 hours' where user_id = $1 and pack = 'neon'`, [ann]);
const wk = await rpc(ann, 'noob_draw_spin', 'neon');
check(wk.success === false && /this week/.test(wk.error) && (new Date(wk.availableAt) - Date.now()) < 3700000, 'switched to weekly in the settings table: the 7-day rule is back, and one hour before it ends it is still closed');
await db.query(`update public.noob_draw_spins set created_at = now() - interval '7 days 1 minute' where user_id = $1 and pack = 'neon'`, [ann]);
check((await rpc(ann, 'noob_draw_spin', 'neon')).success === true, 'weekly mode: open again after 7 days');
await db.query(`update public.noob_draw_config set value = 'month' where key = 'free_period'`);
await expectFail(() => rpc(ann, 'noob_draw_spin', 'nope'), /does not exist/, 'a spin that does not exist is refused');
const sus = await mkUser('sus', { is_suspended: true });
await expectFail(() => rpc(sus, 'noob_draw_spin', 'rookie'), /Unauthorized/, 'a suspended account can not spin');

section('3b. Spinning again with NOOB Points');
const rich = await mkUser('rich', { noob_points: 1000000000 });
await rpc(rich, 'noob_draw_spin', 'inferno');
const balBefore = Number((await profile(rich)).noob_points);
const paid1 = await rpc(rich, 'noob_draw_spin', 'inferno', true);
const paidTx = await q(`select amount, reason from public.noob_transactions where user_id = $1 and reason like '%paid spin%'`, [rich]);
check(paid1.success === true && paid1.paid === true && paid1.cost === 100000000 && paidTx.length === 1 && Number(paidTx[0].amount) === -100000000, 'once the free spin is used, a spin costs 100,000,000 points: taken from the wallet with a clear line in its history');
const prize1 = (await q(`select amount from public.noob_draw_prizes where id = $1`, [paid1.prize.id]))[0].amount;
const expected = balBefore - 100000000 + (paid1.prize.kind === 'points' ? Number(prize1) : 0) + (paid1.prize.applied === 'fallback' ? Number(paid1.prize.fallbackPoints) : 0);
check(Number((await profile(rich)).noob_points) === expected, 'the balance is exactly: before, minus the price, plus whatever the prize paid');
const rec2 = (await q(`select paid, cost from public.noob_draw_spins where user_id = $1 and pack = 'inferno' order by created_at desc limit 1`, [rich]))[0];
check(rec2.paid === true && Number(rec2.cost) === 100000000, 'the spin is recorded as paid, with its cost');
const paid2 = await rpc(rich, 'noob_draw_spin', 'inferno', true);
check(paid2.success === true && (await q(`select count(*)::int as n from public.noob_draw_spins where user_id = $1 and pack = 'inferno' and paid`, [rich]))[0].n === 2, 'as many paid spins as they like');
check((await rpc(rich, 'noob_draw_spin', 'inferno')).success === false, 'but a paid spin does not bring the free one back');
const stRich = await rpc(rich, 'noob_draw_state');
check(stRich.freePeriod === 'month' && stRich.packs.every((p) => p.price === 100000000) && Math.abs(new Date(stRich.packs.find((p) => p.id === 'inferno').availableAt) - nextMonth) < 1000, 'the page data carries the price of each spin and when the free spin comes back');
check(stRich.history.filter((h) => h.paid).length === 2 && stRich.history.find((h) => h.paid).cost === 100000000, 'my wins show which spins were paid');
const poor = await mkUser('poor', { noob_points: 99999999 });
await rpc(poor, 'noob_draw_spin', 'rookie');
await db.query(`update public.profiles set noob_points = 99999999 where id = $1`, [poor]);
const poorBal = 99999999;
const tooPoor = await rpc(poor, 'noob_draw_spin', 'rookie', true);
check(tooPoor && tooPoor.success === false && tooPoor.needPoints === 100000000 && /costs 100,000,000 NOOB Points and you have /.test(tooPoor.error), 'short of the price: refused, and it says what it costs and what they have');
check(tooPoor && Number((await profile(poor)).noob_points) === poorBal && (await q(`select count(*)::int as n from public.noob_draw_spins where user_id = $1 and paid`, [poor]))[0].n === 0, 'and nothing was taken or recorded');
const fresh = await mkUser('fresh_pay', { noob_points: 500000000 });
const early = await rpc(fresh, 'noob_draw_spin', 'rookie', true);
check(early.success === false && early.freeReady === true && Number((await profile(fresh)).noob_points) === 500000000, 'a paid spin is refused while the free one is still waiting: nobody pays by mistake');
await db.query(`update public.noob_draw_packs set spin_price = 250000000 where id = 'royal'`);
await rpc(rich, 'noob_draw_spin', 'royal');
const royalPaid = await rpc(rich, 'noob_draw_spin', 'royal', true);
check(royalPaid.success && royalPaid.cost === 250000000, 'the price can be set per pack');
await db.query(`update public.noob_draw_packs set spin_price = 100000000 where id = 'royal'`);
await expectFail(() => call(rich, `update public.noob_draw_packs set spin_price = 1 where id = 'rookie'`), /permission denied|row-level security/, 'nobody can change a price from the app');
await expectFail(() => call(rich, `select value from public.noob_draw_config`), /permission denied|row-level security/, 'the settings are not readable from the app either');
await expectFail(() => asAnon(db, async () => db.query(`select public.noob_draw_spin('rookie', true)`)), /permission denied/, 'a visitor who is not signed in can not pay for a spin');

section('4. A spin pays out in the same step');
await db.query(`insert into public.noob_draw_packs (id, name, tagline, sort) values ('t_points', 'Test Points', '', 90), ('t_stick', 'Test Stickers', '', 91)`);
await db.query(`insert into public.noob_draw_prizes (id, pack, kind, label, rarity, weight, amount) values ('t_p', 't_points', 'points', '7,000,000 Points', 'epic', 1, 7000000)`);
await db.query(`insert into public.noob_draw_prizes (id, pack, kind, label, rarity, weight, ref, fallback_points) values ('t_s', 't_stick', 'stickers', 'Test Stickers', 'rare', 1, 'crown,gem', 1000)`);
const cat = await mkUser('cat', { noob_points: 100 });
const r1 = await rpc(cat, 'noob_draw_spin', 't_points');
const cp = await profile(cat);
check(r1.success && r1.prize.id === 't_p' && r1.prize.applied === 'ok' && Number(cp.noob_points) === 7000100 && Number(r1.user.noobPoints) === 7000100, 'a points prize: the balance goes up by exactly the prize, and the app gets the new balance');
const tx = await q(`select amount, reason, balance_after from public.noob_transactions where user_id = $1 order by created_at desc limit 1`, [cat]);
check(Number(tx[0].amount) === 7000000 && /NOOB Draw — Test Points: 7,000,000 Points/.test(tx[0].reason) && Number(tx[0].balance_after) === 7000100, 'it shows in the wallet history with a clear reason');
const r2 = await rpc(cat, 'noob_draw_spin', 't_stick');
const st = await q(`select object_key, title from public.custom_stickers where user_id = $1 order by object_key`, [cat]);
check(r2.success && st.length === 2 && st[0].object_key === '/draw-stickers/crown.svg' && st[1].object_key === '/draw-stickers/gem.svg' && /2 animated stickers/.test(r2.prize.message), 'a sticker prize: the stickers are in My stickers');
check((await rpc(cat, 'my_stickers')).length === 2, 'and the chat sticker list (my_stickers) shows them');
const rec = (await q(`select kind, rarity, label, result->>'message' as m from public.noob_draw_spins where user_id = $1 and pack = 't_points'`, [cat]))[0];
check(rec.kind === 'points' && rec.rarity === 'epic' && /added to your wallet/.test(rec.m), 'every spin is recorded with what it paid');

await db.query(`delete from public.noob_draw_packs where id in ('t_points', 't_stick')`);

section('5. Points');
const pt = await mkUser('pt', { noob_points: 5 });
const g1 = await grant(pt, 'if_1b');
check(g1.applied === 'ok' && Number((await profile(pt)).noob_points) === 1000000005, 'one billion points are added exactly');
const g2 = await grant(pt, 'gx_5b');
check(Number((await profile(pt)).noob_points) === 6000000005 && /5,000,000,000/.test(g2.message), '5 billion: no rounding anywhere');

section('6. NOOB Pro plans');
const days = (iso) => (new Date(iso) - Date.now()) / 864e5;
const pa = await mkUser('pro_new');
const a1 = await grant(pa, 'ry_pl7');
let pr = await profile(pa);
check(pr.pro_tier === 'plus' && pr.pro_auto_renew === false && days(pr.pro_renews_at) > 6.9 && days(pr.pro_renews_at) < 7.1 && /active until/.test(a1.message), 'someone with no plan gets it for the days of the prize, with automatic renewal OFF (no surprise charge)');
const a2 = await grant(pa, 'ry_st7');
pr = await profile(pa);
check(pr.pro_tier === 'plus' && days(pr.pro_renews_at) > 13.9 && days(pr.pro_renews_at) < 14.1 && /7 days were added/.test(a2.message), 'a smaller or equal plan only ADDS its days to the plan they have');
const a3 = await grant(pa, 'ry_ul30');
pr = await profile(pa);
check(pr.pro_tier === 'ultimate' && pr.pro_auto_renew === false && days(pr.pro_renews_at) > 43.9 && days(pr.pro_renews_at) < 44.1 && /moved up to NOOB Pro Ultimate/.test(a3.message), 'a bigger plan lifts them up and keeps the days they already had, on top of the new ones');
const pb = await mkUser('pro_paid', { pro_tier: 'starter', pro_billing: 'monthly', pro_auto_renew: true });
await db.query(`update public.profiles set pro_renews_at = now() + interval '10 days' where id = $1`, [pb]);
const b1 = await grant(pb, 'ry_el7');
pr = await profile(pb);
check(pr.pro_tier === 'elite' && pr.pro_auto_renew === false && days(pr.pro_renews_at) > 16.9 && /Automatic renewal is switched off/.test(b1.message), 'a paying Starter member who wins Elite: moved up, and told that automatic renewal is now off');
const pc = await mkUser('pro_forever', { pro_tier: 'elite' });
await db.query(`update public.profiles set pro_renews_at = null where id = $1`, [pc]);
const c1 = await grant(pc, 'ry_ul30');
pr = await profile(pc);
check(c1.applied === 'fallback' && pr.pro_tier === 'elite' && pr.pro_renews_at === null && Number(pr.noob_points) === 400000000, 'a plan with no end date is never cut short: they get the prize in points instead');
const pd = await mkUser('pro_old', { pro_tier: 'pro', pro_billing: 'yearly', pro_auto_renew: true });
await db.query(`update public.profiles set pro_renews_at = now() - interval '1 day' where id = $1`, [pd]);
await grant(pd, 'ry_st7');
pr = await profile(pd);
check(pr.pro_tier === 'starter' && pr.pro_billing === 'monthly' && pr.pro_auto_renew === false && days(pr.pro_renews_at) > 6.9, 'a plan that has already run out starts fresh from today');

section('7. The verified tick');
const vt = await mkUser('vt');
const v1 = await grant(vt, 'gx_vrf');
check(v1.applied === 'ok' && (await profile(vt)).is_verified === true && (await profile(vt)).verification_tier === 'premium', 'the tick is on the account');
check((await q(`select count(*)::int as n from public.notifications where target_user_id = $1 and message like '%Verified Tick%'`, [vt]))[0].n === 1, 'they are told by a notification');
const v2 = await grant(vt, 'gx_vrf');
check(v2.applied === 'fallback' && Number((await profile(vt)).noob_points) === 1000000000, 'already verified: one billion points instead');

section('8. Live profile pictures');
const la = await mkUser('la');
const l1 = await grant(la, 'nn_av1');
check(l1.applied === 'ok' && l1.presetId === 'neon_pulse' && (await q(`select 1 from public.live_avatar_unlocks where user_id = $1 and preset_id = 'neon_pulse'`, [la])).length === 1, 'the picture is unlocked for good');
const wear = await rpc(la, 'apply_live_avatar', 'neon_pulse');
const lp = await profile(la);
check(wear.success && lp.is_live_avatar === true && lp.avatar.endsWith('neon-pulse.svg'), 'and can be worn WITHOUT NOOB Pro');
await expectFail(() => rpc(la, 'apply_live_avatar', 'aurora_wave'), /NOOB Pro feature/, 'a live picture that was not won is still a Pro feature');
await expectFail(() => rpc(la, 'apply_live_avatar', null, 'https://example.com/x.gif'), /NOOB Pro feature/, 'so is a custom one');
const l2 = await grant(la, 'nn_av1');
check(l2.applied === 'fallback' && Number((await profile(la)).noob_points) === 25000000, 'the same picture twice: points instead');
const lpro = await mkUser('lpro', { pro_tier: 'plus' });
await db.query(`update public.profiles set pro_renews_at = now() + interval '5 days' where id = $1`, [lpro]);
check((await rpc(lpro, 'apply_live_avatar', 'dragon_eye')).success === true, 'a NOOB Pro member still wears any picture, as before');
const state0 = await rpc(la, 'noob_draw_state');
check(state0.unlockedAvatars.length === 1 && state0.unlockedAvatars[0].id === 'neon_pulse' && state0.unlockedAvatars[0].url.endsWith('.svg'), 'the page can list the pictures won');

section('9. Stickers');
const sk = await mkUser('sk');
const s1 = await grant(sk, 'nn_stk2');
check(s1.applied === 'ok' && (await q(`select count(*)::int as n from public.custom_stickers where user_id = $1`, [sk]))[0].n === 6 && /6 animated stickers/.test(s1.message), 'six golden stickers added');
const s2 = await grant(sk, 'gx_stk');
check(s2.applied === 'fallback' && (await q(`select count(*)::int as n from public.custom_stickers where user_id = $1`, [sk]))[0].n === 6, 'the same set again: no duplicates, points instead');
const s3 = await grant(sk, 'nn_stk1');
check(s3.applied === 'ok' && (await q(`select count(*)::int as n from public.custom_stickers where user_id = $1`, [sk]))[0].n === 10, 'a different set adds its own stickers');

section('10. What the page shows');
const st1 = await rpc(ann, 'noob_draw_state');
check(st1.packs.length === 5 && st1.packs.every((p) => p.availableAt && p.prizes.length >= 9), 'five spins, each with its prizes; ann has used all five this week so all show when they open');
check(st1.packs.every((p) => Math.abs(p.prizes.reduce((s, x) => s + x.odds, 0) - 100) < 0.011), 'the odds shown add up to 100% for every spin');
const stBob = await rpc(bob, 'noob_draw_state');
check(stBob.packs.find((p) => p.id === 'rookie').availableAt && stBob.packs.find((p) => p.id === 'neon').availableAt === null, 'bob used Rookie only: Rookie shows its opening time, Neon is open');
check(st1.history.length === 7 && st1.history[0].packName && st1.history[0].label, 'my wins, newest first, with the spin name');
check(JSON.stringify(st1).indexOf(bob) === -1 && st1.history.every((h) => h.pack), "nobody else's wins show in my history");
const prv = await mkUser('priv_user', { account_type: 'private' });
const pub = await mkUser('pub_user');
const small = await mkUser('small_user');
await db.query(`insert into public.noob_draw_spins (user_id, pack, prize_id, kind, label, rarity) values ($1, 'galaxy', 'gx_1b', 'points', '1,000,000,000 Points', 'legendary'), ($2, 'galaxy', 'gx_1b', 'points', '1,000,000,000 Points', 'legendary'), ($3, 'rookie', 'rk_1m', 'points', '1,000,000 Points', 'common')`, [prv, pub, small]);
const tick = (await rpc(bob, 'noob_draw_state')).ticker;
check(tick.some((t) => t.username === 'pub_user' && t.rarity === 'legendary') && !tick.some((t) => t.username === 'priv_user') && !tick.some((t) => t.username === 'small_user'), 'the live wins list shows big wins of public accounts only (no private accounts, no small wins)');
check(tick.every((t) => !('avatar' in t) && !('userId' in t)), 'it carries no pictures and no ids');

section('11. Who may do what');
await expectFail(() => asAnon(db, async () => db.query(`select public.noob_draw_spin('rookie')`)), /permission denied/, 'a visitor who is not signed in can not spin');
await expectFail(() => asAnon(db, async () => db.query(`select public.noob_draw_state()`)), /permission denied/, 'nor look at the page data');
for (const [fn, args] of [['noob_draw_grant', `$1, (select p from public.noob_draw_prizes p where p.id = 'gx_5b'), 'x'`], ['noob_draw_pick', `'galaxy', 0.5`], ['noob_draw_random', ``], ['noob_draw_rank', `'pro'`]]) {
  await expectFail(() => call(ann, `select public.${fn}(${args})`, args.includes('$1') ? [ann] : []), /permission denied/, `a signed-in person can not call ${fn} directly (no choosing your own prize)`);
}
await expectFail(() => call(ann, `insert into public.noob_draw_spins (user_id, pack, prize_id, kind, label, rarity) values ($1, 'x', 'x', 'points', 'x', 'common')`, [ann]), /row-level security|permission denied/, 'nobody can write a spin record themselves');
await expectFail(() => call(ann, `insert into public.live_avatar_unlocks (user_id, preset_id) values ($1, 'dragon_eye')`, [ann]), /row-level security|permission denied/, 'nobody can unlock a live picture themselves');
await expectFail(() => call(ann, `update public.noob_draw_prizes set weight = 9999 where id = 'gx_5b' returning id`), /permission denied|row-level security/, 'nobody can change the odds from the app');
await expectFail(() => call(ann, `select id from public.noob_draw_spins`), /permission denied/, 'the spin records are not readable directly: only through the page function, which shows a person only their own');
check((await rpc(ann, 'noob_draw_state')).history.every((h) => h.pack) && (await rpc(bob, 'noob_draw_state')).history.length === 1, 'and that shows each person only their own wins (bob has 1, ann has more)');

section('12. Two taps at the same moment pay once');
const dd = await mkUser('dd', { noob_points: 0 });
const results = await Promise.all([rpc(dd, 'noob_draw_spin', 'inferno'), rpc(dd, 'noob_draw_spin', 'inferno')]);
check(results.filter((r) => r.success).length === 1 && (await q(`select count(*)::int as n from public.noob_draw_spins where user_id = $1`, [dd]))[0].n === 1, 'a double tap: one spin only');

section('13. An email only for the grand prizes');
const mails = async (uid) => q(`select kind, payload from public.email_outbox where user_id = $1 order by created_at`, [uid]);
const em = await mkUser('em');
await grant(em, 'rk_5m'); await grant(em, 'rk_stk'); await grant(em, 'nn_av1');
check((await mails(em)).length === 0, 'points, stickers and a live profile picture send no email');
await grant(em, 'ry_pl7');
let ml = await mails(em);
check(ml.length === 1 && ml[0].kind === 'draw_prize' && ml[0].payload.prize === 'pro' && ml[0].payload.label === 'NOOB Pro Plus' && ml[0].payload.days === 7 && ml[0].payload.tier === 'plus' && ml[0].payload.packName === 'Test Spin' && !!ml[0].payload.endsAt && /active until/.test(ml[0].payload.message), 'a NOOB Pro plan sends one email: the plan, the days, the end date');
await grant(em, 'ry_st7');
check((await mails(em)).length === 2, 'days added to a plan they have are a Pro win too');
await grant(em, 'ry_ul7');
check((await mails(em)).length === 3, 'so is moving up to a bigger plan');
await grant(em, 'gx_vrf');
ml = await mails(em);
check(ml.length === 4 && ml[3].payload.prize === 'verified' && ml[3].payload.label === 'Verified Tick' && !ml[3].payload.endsAt, 'the verified tick sends an email');
await grant(em, 'gx_vrf');
check((await mails(em)).length === 4, 'a prize that was already owned (paid in points instead) sends nothing');
const lf = await mkUser('lf', { pro_tier: 'elite' });
await db.query(`update public.profiles set pro_renews_at = null where id = $1`, [lf]);
await grant(lf, 'ry_ul30');
check((await mails(lf)).length === 0, 'a Pro prize turned into points (plan with no end date) sends nothing');
await db.query(`insert into public.noob_draw_packs (id, name, tagline, sort) values ('t_mail', 'Test Mail', '', 92)`);
await db.query(`insert into public.noob_draw_prizes (id, pack, kind, label, rarity, weight, tier, days, fallback_points) values ('t_m', 't_mail', 'pro', 'NOOB Pro Elite', 'epic', 1, 'elite', 7, 1000)`);
const sp = await mkUser('sp');
const spun = await rpc(sp, 'noob_draw_spin', 't_mail');
const spm = await mails(sp);
check(spun.success && spm.length === 1 && spm[0].kind === 'draw_prize' && spm[0].payload.prize === 'pro', 'a real spin that lands on a Pro plan queues the email in the same step');
const secret = (await q(`select value from public.internal_config where key = 'push_secret'`))[0].value;
await db.query(`insert into public.profile_private (user_id, email) values ($1, 'sp@example.com') on conflict (user_id) do update set email = excluded.email`, [sp]);
await db.query(`update public.profiles set noob_points = 500000000 where id = $1`, [sp]);
const spPaid = await rpc(sp, 'noob_draw_spin', 't_mail', true);
const spMails = await mails(sp);
check(spPaid.success && spMails.length === 2, 'a paid spin that wins a plan sends its email too');
const claimFree = (await q(`select public.email_claim($1, $2) as r`, [secret, (await q(`select id from public.email_outbox where user_id = $1 order by created_at limit 1`, [sp]))[0].id]))[0].r;
check(claimFree.claimed && claimFree.userId === sp && claimFree.payload.paid === false && claimFree.payload.cost === '0' && claimFree.payload.spinNo === 1 && claimFree.payload.packName === 'Test Mail' && claimFree.payload.rarity === 'epic' && claimFree.payload.previousTier === null && /^[\d,]+$/.test(claimFree.payload.walletAfter), 'the first email says: free spin, no cost, spin number 1, which spin, how rare, and no plan before');
const claimPaid = (await q(`select public.email_claim($1, $2) as r`, [secret, (await q(`select id from public.email_outbox where user_id = $1 order by created_at desc limit 1`, [sp]))[0].id]))[0].r;
check(claimPaid.payload.paid === true && claimPaid.payload.cost === '100,000,000' && claimPaid.payload.spinNo === 2 && claimPaid.payload.previousTier === 'elite' && !!claimPaid.payload.previousEndsAt && claimPaid.payload.walletAfter === '400,000,000', 'the second says: paid spin, cost 100,000,000 points, spin number 2, the plan before (Elite, until when) and the balance after paying');
await db.query(`delete from public.noob_draw_packs where id = 't_mail'`);
await expectFail(() => call(sp, `select public.noob_draw_mail($1, (select p from public.noob_draw_prizes p limit 1), 'x', 'x')`, [sp]), /permission denied/, 'nobody can queue these emails themselves');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
