// Tests migration 20261014000011: the platform-wide analytics the main NOOB administrator sees in the admin panel (day-by-day series and breakdowns for the whole
// app). Only the administrator may call it, it returns counts and never any private text, and the internal helper can not be called from outside.
// On a REAL Postgres (PGlite) with every migration applied.
//
// Usage: node scripts/supabase/test-noob-admin-analytics.mjs
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};
const section = (t) => console.log(`\n${t}`);

const db = await createTestDb();
const mkUser = async (name, admin = false) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  if (admin) await db.query(`update public.profiles set is_admin = true where id = $1`, [id]);
  return id;
};
const rpc = (uid, fn, ...args) => asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
const sum = (arr) => arr.reduce((a, x) => a + x.n, 0);

const boss = await mkUser('boss', true);
const ann = await mkUser('ann');
const raj = await mkUser('raj');

section('1. Who may see it');
await expectFail(() => rpc(ann, 'admin_analytics_overview', 30), /administrator/i, 'an ordinary user is refused');
await expectFail(() => asAnon(db, async () => db.query(`select public.admin_analytics_overview(30)`)), /permission|denied|not authenticated|administrator/i, 'a visitor who is not signed in is refused');
await expectFail(() => rpc(boss, 'admin_int_daily', 'select 1 as dd, 1 as n', new Date().toISOString()), /permission|denied/i, 'the internal helper can not be called from outside');

section('2. What the administrator gets');
const empty = await rpc(boss, 'admin_analytics_overview', 30);
check(empty.days === 30 && empty.series.users.length === 30 && empty.series.posts.length === 30, 'a series has one entry for each of the 30 days, even when nothing happened');
check(empty.series.users.every((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.d) && typeof p.n === 'number'), 'each entry is a day and a count');
check(empty.totals.users >= 3 && empty.totals.newUsers >= 3 && empty.totals.newToday >= 3, 'the people just created are counted as new', JSON.stringify(empty.totals));
check(sum(empty.series.users) === empty.totals.newUsers, 'the daily new-people series adds up to the total of new people');
check((await rpc(boss, 'admin_analytics_overview', 1)).days === 7 && (await rpc(boss, 'admin_analytics_overview', 500)).days === 90 && (await rpc(boss, 'admin_analytics_overview', null)).days === 30, 'the period is held between 7 and 90 days');
check(Object.keys(empty.breakdowns).sort().join() === 'accountTypes,messageTypes,ordersByStatus,postsByCategory,reportsByStatus,topGames', 'all the breakdowns are present');

section('3. It counts what really happened');
await db.query(`insert into public.posts (user_id, caption, category) values ($1, 'a secret caption', 'Travel'), ($1, 'another one', 'Travel'), ($2, 'third', 'Food')`, [ann, raj]);
await db.query(`insert into public.reels (user_id, video_url) values ($1, 'x.mp4')`, [ann]);
const chat = (await db.query(`insert into public.chats (name, is_group, creator_id) values ('c', false, $1) returning id`, [ann])).rows[0].id;
await db.query(`insert into public.messages (chat_id, sender_id, text) values ($1, $2, 'a private message about my day'), ($1, $3, 'and my reply')`, [chat, ann, raj]);
await db.query(`insert into public.comments (user_id, text) select $1, 'nice' from (select 1) x`, [raj]).catch(() => null);
const ov = await rpc(boss, 'admin_analytics_overview', 30);
check(ov.totals.posts === 3 && ov.totals.postsPeriod === 3, 'three posts counted', JSON.stringify(ov.totals));
check(ov.totals.reels === 1 && sum(ov.series.reels) === 1, 'one reel counted, and it is in the series');
check(ov.totals.messagesPeriod === 2 && sum(ov.series.messages) === 2, 'two messages counted');
check(ov.series.posts[ov.series.posts.length - 1].n === 3, 'today is the last entry and holds today\'s posts');
check(ov.series.active[ov.series.active.length - 1].n === 2, 'two different people were active today (the two who posted or wrote)', JSON.stringify(ov.series.active.slice(-1)));
check(ov.breakdowns.postsByCategory[0].label === 'Travel' && ov.breakdowns.postsByCategory[0].n === 2, 'posts are grouped by category, the biggest first');
check(ov.breakdowns.messageTypes.some((m) => m.label === 'text' && m.n === 2), 'messages are grouped by type (plain text)');
check(ov.breakdowns.accountTypes.reduce((a, x) => a + x.n, 0) === ov.totals.users, 'account types add up to the number of people');

section('4. Counts only, never private words');
const text = JSON.stringify(ov);
check(!text.includes('secret caption') && !text.includes('private message') && !text.includes('my reply'), 'no caption or message text appears anywhere in the answer');
check(!text.includes(ann) && !text.includes(raj), 'no individual person appears in it either');

section('5. A suspended person and an old record');
await db.query(`update public.profiles set is_suspended = true where id = $1`, [raj]);
await db.query(`insert into public.posts (user_id, caption, created_at) values ($1, 'old', now() - interval '200 days')`, [ann]);
const ov2 = await rpc(boss, 'admin_analytics_overview', 30);
check(ov2.totals.suspended === 1, 'a suspended person is counted');
check(ov2.totals.posts === 4 && ov2.totals.postsPeriod === 3, 'an old post is in the total but not in the period');

console.log(`\n${passed} passed, ${failed} failed`);
await db.close?.();
process.exit(failed ? 1 : 0);
