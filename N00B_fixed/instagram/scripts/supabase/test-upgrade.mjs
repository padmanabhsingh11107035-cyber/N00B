// Upgrade test: your LIVE database already holds real data and migrations 1-5. This builds exactly that
// (migrations 1-5 + the real backup imported the way it was imported live, coupons stored in their old
// text form), applies migration 6 on top, and proves nothing is lost or changed — then applies it a second
// time to prove it is safe to re-run.
//
// Usage: node scripts/supabase/test-upgrade.mjs [backup-folder]
import fs from 'node:fs';
import path from 'node:path';
import { loadBackup, buildImportPlan } from './transform.mjs';
import { runImport } from './run-import.mjs';
import { createTestDb, makePgAdapter, MIGRATIONS_DIR } from './pg-test-env.mjs';

const backupsRoot = 'backups';
const dir = process.argv.slice(2).find((x) => !x.startsWith('--')) || path.join(backupsRoot, fs.readdirSync(backupsRoot).filter((d) => fs.existsSync(path.join(backupsRoot, d, 'users.json'))).sort().pop());
const raw = loadBackup(dir);

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);

const MIG6 = '20260919000006_economy_games_admin.sql';
section('Building the live situation (migrations 1-5 + real data)');
const db = await createTestDb({ upTo: '20260919000005_chat.sql' });
const plan = buildImportPlan(raw, {});
// how the coupons were stored live: terms as one text value, no usage limit yet
plan.tables.coupons = plan.tables.coupons.map(({ usage_limit, terms, ...rest }) => ({ ...rest, terms: terms.join('\n') }));
plan.tables.coupon_uses = []; plan.tables.store_products = []; plan.tables.scratch_cards = []; plan.tables.reports = [];
await runImport(plan, makePgAdapter(db), { log: () => {} });
// one coupon with several terms, one with none, and one suspended account
await db.query(`insert into coupons (code, title, type, discount_percent, terms) values ('OLDMULTI', 'x', 'discount', 5, E'line one\nline two'), ('OLDNULL', 'x', 'discount', 5, null)`);
const susp = (await db.query(`select id from profiles where not is_admin order by created_at limit 1`)).rows[0].id;
await db.query('update profiles set is_suspended = true where id = $1', [susp]);
await db.query(`insert into auth.users (id, email) select $1, 'x' where not exists (select 1 from auth.users where id = $1)`, [susp]);

const snap = async () => {
  const q = async (sql) => (await db.query(sql)).rows[0].n;
  return {
    profiles: await q('select count(*)::int n from profiles'), posts: await q('select count(*)::int n from posts'),
    post_likes: await q('select count(*)::int n from post_likes'), follows: await q('select count(*)::int n from follows'),
    tx: await q('select count(*)::int n from noob_transactions'), scores: await q('select count(*)::int n from game_scores'),
    notifs: await q('select count(*)::int n from notifications'), coupons: await q('select count(*)::int n from coupons'),
    points: await q('select coalesce(sum(noob_points), 0)::text n from profiles'), scoreSum: await q('select coalesce(sum(score), 0)::text n from game_scores'),
    reviews: await q('select count(*)::int n from support_reviews'), chats: await q('select count(*)::int n from chats'), msgs: await q('select count(*)::int n from messages')
  };
};
const before = await snap();
const couponBefore = (await db.query('select code, discount_percent::text dp, active from coupons order by code')).rows;
console.log('  live counts before:', JSON.stringify(before));

section('Applying migration 6 on top of the data');
await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, MIG6), 'utf8'));
const after = await snap();
check(JSON.stringify(before) === JSON.stringify(after), 'every count and the total of all points/scores are exactly unchanged', JSON.stringify(after));
const couponAfter = (await db.query('select code, discount_percent::text dp, active from coupons order by code')).rows;
check(JSON.stringify(couponBefore) === JSON.stringify(couponAfter), 'every coupon keeps its code, percentage and on/off state');
const cp = Object.fromEntries((await db.query('select code, terms, usage_limit, type from coupons')).rows.map((r) => [r.code, r]));
check(Array.isArray(cp.OLDMULTI.terms) && cp.OLDMULTI.terms.join('|') === 'line one|line two', 'coupon terms written on several lines become a proper list');
check(cp.OLDNULL.terms.length === 0 && Object.values(cp).every((c) => Array.isArray(c.terms)), 'coupons with no terms get an empty list (never null)');
check(Object.values(cp).every((c) => c.usage_limit === 'unlimited'), 'existing coupons stay "unlimited" exactly like before');
check((await db.query(`select data_type from information_schema.columns where table_name = 'game_scores' and column_name = 'score'`)).rows[0].data_type === 'bigint', 'the score column can now hold values over 2 billion');
const bu = (await db.query('select banned_until from auth.users where id = $1', [susp])).rows[0].banned_until;
check(bu && new Date(bu) > new Date(Date.now() + 50 * 365 * 86400000), 'an account that was already suspended is now also blocked from signing in');
check((await db.query(`select count(*)::int n from shop_items`)).rows[0].n === 24 && (await db.query(`select count(*)::int n from live_avatar_presets`)).rows[0].n === 34, 'the shop and live-picture lists are filled in');

section('Applying it a second time (must be harmless)');
await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, MIG6), 'utf8'));
const again = await snap();
check(JSON.stringify(after) === JSON.stringify(again), 'nothing changed on the second run');
check((await db.query(`select count(*)::int n from shop_items`)).rows[0].n === 24, 'and no duplicate shop items appeared');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
