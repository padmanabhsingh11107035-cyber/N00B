// Tests migration 20261014000014: when the NOOB Draw free spin resets, each person who had used one gets ONE in-app notification (never an email), once per reset.
// On a REAL Postgres (PGlite) with every migration applied, plus the screen's wiring.
//
// Usage: node scripts/supabase/test-noob-draw-ready.mjs
import fs from 'node:fs';
import { createTestDb, asUser } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

const db = await createTestDb();
const mkUser = async (name, suspended = false) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  await db.query(`update public.profiles set is_suspended = $2 where id = $1`, [id, suspended]);
  return id;
};
const packs = (await db.query(`select id from public.noob_draw_packs order by sort`)).rows.map((r) => r.id);
const prize = (await db.query(`select id, kind, label, rarity from public.noob_draw_prizes where pack = $1 limit 1`, [packs[0]])).rows[0];
// a spin that happened `ago` (a postgres interval, e.g. '40 days')
const spin = (user, pack, ago, paid = false) => db.query(
  `insert into public.noob_draw_spins (user_id, pack, prize_id, kind, label, rarity, paid, created_at) values ($1, $2, $3, $4, $5, $6, $7, now() - $8::interval)`,
  [user, pack, prize.id, prize.kind, prize.label, prize.rarity, paid, ago]);
const run = async () => (await db.query(`select public.run_noob_draw_ready_notifications() as n`)).rows[0].n;
const mails = async (u) => (await db.query(`select type, title, message from public.notifications where target_user_id = $1 and type = 'noob_draw_ready' order by created_at`, [u])).rows;

await mkUser('noob');                // the NOOB account the notification comes from
const ann = await mkUser('ann');     // used one free spin last month: the 1st has just passed
const bo = await mkUser('bo');       // used two packs last month
const cy = await mkUser('cy');       // spun THIS month: still waiting
const di = await mkUser('di');       // only ever paid for spins
const ed = await mkUser('ed');       // never spun
const flo = await mkUser('flo', true);  // suspended
const gus = await mkUser('gus');     // reset was weeks ago

// "last month": a moment inside the previous month (India time) whose next reset has JUST passed.
// The 1st of this month, India time, is at least a few hours ago on most days; to keep this test independent of the date, the spin is placed in the month before
// and the reset is moved to "an hour ago" by also checking the arithmetic directly below.
const monthStartIst = (await db.query(`select (date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata') as t`)).rows[0].t;
const sinceReset = Date.now() - new Date(monthStartIst).getTime();      // how long ago this month's reset was
section('0. The calendar');
check(sinceReset >= 0 && sinceReset < 32 * 86_400_000, 'this month\'s reset (the 1st, India time) is in the past');

if (sinceReset > 2 * 86_400_000) {
  // the reset was more than two days ago: it is "old news" and must NOT notify; test with the weekly setting instead, where the window is easy to place
  console.log('  (it is not the first two days of the month: the monthly reset is old news, so the rules are tested with the weekly period)');
}
await db.query(`update public.noob_draw_config set value = 'week' where key = 'free_period'`);

section('1. Who is told, with the weekly period (a reset is 7 days after the last free spin)');
await spin(ann, packs[0], '7 days 1 hour');                       // came back an hour ago
await spin(bo, packs[0], '7 days 2 hours'); await spin(bo, packs[1], '7 days 3 hours');   // two packs came back
await spin(cy, packs[0], '3 days');                               // still waiting
await spin(di, packs[0], '30 days', true);                        // paid only: never a free window
await spin(flo, packs[0], '7 days 1 hour');                       // suspended
await spin(gus, packs[0], '20 days');                             // came back 13 days ago: old news
check(await run() === 2, 'two people are told: ann and bo');
const a = await mails(ann), b = await mails(bo);
check(a.length === 1 && a[0].title.includes('NOOB Draw is ready') && /free NOOB Draw spin is back/.test(a[0].message), 'ann gets one notification that says her spin is back', JSON.stringify(a));
check(b.length === 1 && /Your 2 free NOOB Draw spins are back/.test(b[0].message), 'bo, with two packs, gets ONE notification that says two', JSON.stringify(b));
for (const [who, name] of [[cy, 'cy (still waiting)'], [di, 'di (only paid spins)'], [ed, 'ed (never spun)'], [flo, 'flo (suspended)'], [gus, 'gus (the reset was weeks ago)']]) check((await mails(who)).length === 0, `${name} is not told`);

section('2. Once per reset');
check(await run() === 0 && (await mails(ann)).length === 1 && (await mails(bo)).length === 1, 'running it again tells nobody twice');
await spin(ann, packs[0], '0 seconds');                           // ann spins again: a new wait starts
check(await run() === 0 && (await mails(ann)).length === 1, 'after she spins, nothing more until the next reset');
await db.query(`update public.noob_draw_spins set created_at = now() - interval '7 days 1 hour' where user_id = $1 and created_at > now() - interval '1 minute'`, [ann]);
check(await run() === 1 && (await mails(ann)).length === 2, 'and when that reset comes, she is told again');

section('3. What the notification is');
const row = (await db.query(`select type, title, actor_id, target_user_id from public.notifications where target_user_id = $1 order by created_at desc limit 1`, [ann])).rows[0];
check(row.type === 'noob_draw_ready' && row.actor_id !== null, 'its own type, sent from the NOOB account');
check((await db.query(`select count(*)::int n from public.email_outbox where user_id = $1 and kind = 'noob_draw_ready'`, [ann]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n === 0, 'no email is queued');
await expectFail(() => asUser(db, ann, async () => db.query(`select public.run_noob_draw_ready_notifications()`)), /permission|denied/i, 'a browser can not run the job');

section('4. The monthly period (the default)');
await db.query(`update public.noob_draw_config set value = 'month' where key = 'free_period'`);
const june = await mkUser('june');
// a free spin in the middle of LAST month: its reset was the 1st of this month
await spin(june, packs[0], `${Math.ceil(sinceReset / 86_400_000) + 10} days`);
const wasFresh = sinceReset <= 2 * 86_400_000;
check((await run()) === (wasFresh ? 1 : 0) && (await mails(june)).length === (wasFresh ? 1 : 0), wasFresh ? 'in the first two days of the month, a spin from last month is told "ready"' : 'later in the month, last month\'s reset is old news: nobody is woken up');
const rows = (await db.query(`select count(*)::int n from public.noob_draw_ready_sent`)).rows[0].n;
check(rows >= 3, 'each notice is recorded (person, pack, reset) so it is never repeated', String(rows));

section('5. The pages');
const modal = read('src/components/Modals/NotificationsModal.tsx');
check(/case 'noob_draw_ready':/.test(modal) && /Gift/.test(modal), 'the notification has its own gift icon');
check(/notif\.type === 'noob_draw_ready'/.test(modal) && /openNoobDraw\(\)/.test(modal), 'tapping it opens NOOB Draw');
const types = read('src/types.ts');
check(/'noob_draw_ready'/.test(types), 'the app knows the new type');
const prof = read('src/components/Profile/ProfileView.tsx');
check(!/openNoobDraw/.test(prof) && !/NOOB Draw/.test(prof.split('Universal: Appearance')[0].split('Dropdown Menu')[1] || ''), 'NOOB Draw is gone from the Profile three-dots menu');
const settingsRegistry = read('src/components/Settings/registry.ts');
check(/Profile finder using QR/.test(settingsRegistry) && !/label: 'QR Scanner'/.test(settingsRegistry) && /Profile finder using QR/.test(read('src/components/Profile/QrScannerPage.tsx')), 'the QR scanner is now called "Profile finder using QR" (Settings and activity, and the page)');
const feed = read('src/components/Feed/FeedView.tsx');
check(/openNoobDraw\(\)/.test(feed), 'NOOB Draw is still reachable from the Home page menu');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
