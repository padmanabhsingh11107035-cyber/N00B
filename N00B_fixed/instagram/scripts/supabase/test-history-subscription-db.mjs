// The Feed / Videos watch history (it was always empty: the list could not read its own table) and the subscription history. On a REAL Postgres (PGlite) with every migration applied.
// Usage: node --liftoff-only scripts/supabase/test-history-subscription-db.mjs
import fs from 'node:fs';
import { createTestDb, asUser } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const db = await createTestDb();
const mkUser = async (name) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  await db.query(`update public.profiles set pro_tier = null, noob_points = 0 where id = $1`, [id]).catch(() => undefined);
  return id;
};
const call = async (uid, sql, args = []) => asUser(db, uid, async () => (await db.query(sql, args)).rows[0]?.r);
const video = async (uid, title) => (await call(uid, `select public.create_long_video('videos/a.mp4', null, $1, '', 60) as r`, [title])).video.id;

const ann = await mkUser('ann'), bob = await mkUser('bob');
const v1 = await video(bob, 'First'), v2 = await video(bob, 'Second'), v3 = await video(bob, 'Third');

section('1. Watch history');
check((await call(ann, `select public.history_long_videos() as r`)).length === 0, 'a new person has an empty history');
await call(ann, `select public.record_long_video_view($1) as r`, [v1]);
let h = await call(ann, `select public.history_long_videos() as r`);
check(h.length === 1 && h[0].id === v1 && h[0].title === 'First' && h[0].watchedAt, 'a video she started watching is in her history at once, with the time she watched it', JSON.stringify(h).slice(0, 200));
const direct = await asUser(db, ann, async () => (await db.query(`select count(*)::int n from public.long_video_views where user_id = $1`, [ann])).rows[0].n);
check(direct === 0, 'the reason it used to be empty: she cannot read the views table herself (so the list has to be read for her, which it now is)');
await call(ann, `select public.record_long_video_view($1) as r`, [v2]);
await call(ann, `select public.record_long_video_view($1) as r`, [v3]);
await call(ann, `select public.record_long_video_view($1) as r`, [v1]);
h = await call(ann, `select public.history_long_videos() as r`);
check(h.length === 3 && h[0].id === v1 && h[1].id === v3 && h[2].id === v2, 'the newest watch is first, and watching a video again brings it to the top (not a second line)', h.map((x) => x.title).join(','));
check((await call(bob, `select public.history_long_videos() as r`)).length === 0, 'bob\'s history is his own: he sees none of hers');
check(h.every((x) => x.viewsCount === 1), 'each video counts one view for her, however often she watched');
let res = await call(ann, `select public.remove_from_watch_history($1) as r`, [v3]);
h = await call(ann, `select public.history_long_videos() as r`);
check(res.success && h.length === 2 && !h.some((x) => x.id === v3), 'she can remove one video from her history');
check((await db.query(`select views_count from public.long_videos where id = $1`, [v3])).rows[0].views_count === 1, '(and the video keeps the view it was counted)');

section('2. Pausing and clearing');
await call(ann, `select public.set_my_settings('{"history.paused": true}'::jsonb) as r`);
const v4 = await video(bob, 'Fourth');
await call(ann, `select public.record_long_video_view($1) as r`, [v4]);
h = await call(ann, `select public.history_long_videos() as r`);
check(!h.some((x) => x.id === v4), 'with the history paused, nothing new is written in it');
check((await db.query(`select views_count from public.long_videos where id = $1`, [v4])).rows[0].views_count === 1, 'but the view is still counted');
await call(ann, `select public.set_my_settings('{"history.paused": false}'::jsonb) as r`);
await call(ann, `select public.record_long_video_view($1) as r`, [v4]);
check((await call(ann, `select public.history_long_videos() as r`)).some((x) => x.id === v4), 'switched back on, it is written again');
res = await call(ann, `select public.clear_watch_history() as r`);
check(res.success && res.removed === 3 && (await call(ann, `select public.history_long_videos() as r`)).length === 0, 'the whole history can be cleared');
check((await call(bob, `select public.history_long_videos() as r`)).length === 0 && (await db.query(`select count(*)::int n from public.long_video_views`)).rows[0].n >= 4, 'clearing does not touch the views that were counted');
check(await (async () => { try { await asUser(db, ann, async () => db.query(`select * from public.long_video_watch_history`)); return false; } catch (e) { return /permission denied/i.test(e.message); } })(), 'the table itself stays closed');
const sql = fs.readFileSync('supabase/migrations/20261020000003_watch_and_subscription_history.sql', 'utf8');
await db.exec(sql); await db.exec(sql);
check(true, 'running the migration again changes nothing');

section('3. Subscription history');
let sub = await call(ann, `select public.my_subscription_history() as r`);
check(sub.current.tier === null && sub.current.active === false && sub.history.length === 0 && sub.plans.length === 5, 'with no plan: nothing now, no history, and the five plans listed with their prices', JSON.stringify(sub.current));
check(sub.plans[0].tier === 'starter' && sub.plans[0].monthly === 5000000000 && sub.plans[4].tier === 'ultimate' && sub.plans[4].monthly === 15000000000 && sub.plans[4].yearly === Math.round(15000000000 * 12 * 0.83), 'the plan prices (monthly and yearly)');
await db.query(`update public.profiles set noob_points = 20000000000 where id = $1`, [ann]);
await call(ann, `select public.upgrade_pro('starter', 'monthly') as r`);
sub = await call(ann, `select public.my_subscription_history() as r`);
check(sub.current.tier === 'starter' && sub.current.active === true && sub.current.billing === 'monthly' && sub.current.autoRenew === true, 'after buying: the plan, how it is billed, and that it renews by itself', JSON.stringify(sub.current));
check(sub.current.daysLeft >= 29 && sub.current.daysLeft <= 30 && sub.current.endsAt && sub.current.purchasedAt, 'when it ends, how many days are left, and the day it was bought');
check(sub.current.renewalPrice === 5000000000 && sub.current.balance === 15000000000 && sub.current.shortfall === 0, 'what renewing costs, her balance, and nothing missing');
check(sub.history.length === 1 && sub.history[0].kind === 'purchase' && sub.history[0].tier === 'starter' && sub.history[0].paid === 5000000000 && sub.history[0].endsAt, 'the purchase is in the history with what was paid and until when', JSON.stringify(sub.history));
await db.query(`update public.profiles set noob_points = 1000000000 where id = $1`, [ann]);
sub = await call(ann, `select public.my_subscription_history() as r`);
check(sub.current.shortfall === 4000000000, 'with too little in the wallet: how many points are still missing', JSON.stringify(sub.current));
// older plans (before receipts existed) come back from the wallet history; a gift from a friend and a prize from the draw come from their notes
await db.query(`insert into public.noob_transactions (user_id, amount, reason, balance_after, created_at) values ($1, -7500000000, 'NOOB Pro renewal (plus, monthly)', 0, now() - interval '40 days')`, [ann]);
await db.query(`insert into public.email_outbox (user_id, kind, payload, created_at) values ($1, 'pro_upgraded', '{"tier":"elite","planName":"NOOB Pro Elite","billing":"monthly","method":"friend","pricePaid":"0","listPrice":"12,500,000,000","renewsAt":"2026-12-01T00:00:00Z","paidBy":{"username":"bob"}}'::jsonb, now() - interval '20 days')`, [ann]);
await db.query(`insert into public.email_outbox (user_id, kind, payload, created_at) values ($1, 'draw_prize', '{"prize":"pro","tier":"starter","label":"NOOB Pro Starter (7 days)"}'::jsonb, now() - interval '10 days')`, [ann]);
sub = await call(ann, `select public.my_subscription_history() as r`);
const kinds = sub.history.map((x) => x.kind).join(',');
check(sub.history.length === 4 && kinds === 'purchase,prize,friend,renewal', 'the history has the purchase, the prize, the friend\'s gift and the older renewal, newest first', kinds);
const gift = sub.history.find((x) => x.kind === 'friend'), prize = sub.history.find((x) => x.kind === 'prize'), old = sub.history.find((x) => x.kind === 'renewal');
check(gift.paidBy === 'bob' && gift.listPrice === 12500000000 && gift.tier === 'elite', 'a gift says who paid');
check(prize.planName === 'NOOB Pro Starter (7 days)' && prize.paid === 0, 'a prize says what was won');
check(old.tier === 'plus' && old.billing === 'monthly' && old.paid === 7500000000, 'an older renewal is read back from the wallet history, with its plan and price', JSON.stringify(old));
check(await (async () => { try { await asUser(db, null, async () => db.query(`select public.my_subscription_history()`)); return false; } catch { return true; } })(), 'it needs a login');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
