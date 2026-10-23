// Tests for migration 20261023000001: the administrator's on / off switch for every page, on a REAL Postgres (PGlite) with every migration applied.
// Usage: node --liftoff-only scripts/supabase/test-feature-switches-db.mjs
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
const rpc = async (uid, fn, ...args) => asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
const rpcAnon = async (fn, ...args) => asAnon(db, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);

const admin = await mkUser('noob');
const member = await mkUser('someone');
const suspendedAdmin = await mkUser('susp_admin', { is_admin: true, is_suspended: true });

section('1. Every page is on until the administrator switches it off');
let s = await rpcAnon('public_platform_settings');
check(Array.isArray(s.disabledFeatures) && s.disabledFeatures.length === 0, 'a visitor sees an empty list of switched-off pages', JSON.stringify(s.disabledFeatures));
check('musicPageHidden' in s && 'noobRoomsEnabled' in s && 'maintenanceEnabled' in s && 'signupsEnabled' in s, 'every older setting is still in the same answer');
check((await rpc(member, 'public_platform_settings')).disabledFeatures.length === 0, 'a member sees the same');

section('2. Only the main administrator can change it');
await expectFail(() => rpc(member, 'admin_set_feature', 'reels', false), /Access denied/, 'a member can not switch a page off');
await expectFail(() => rpcAnon('admin_set_feature', 'reels', false), /permission denied|Access denied/, 'a visitor can not either');
await expectFail(() => rpc(suspendedAdmin, 'admin_set_feature', 'reels', false), /Access denied/, 'nor a suspended administrator');
await expectFail(() => rpc(admin, 'admin_set_feature', 'reels', null), /on or off/, 'a missing yes / no is refused');
await expectFail(() => rpc(admin, 'admin_set_feature', 'Not A Page!', false), /not the name of a page/, 'a name that is not a page name is refused');
await expectFail(() => rpc(admin, 'admin_set_feature', '', false), /not the name of a page/, 'an empty name is refused');
await expectFail(() => rpc(admin, 'admin_set_feature', 'x'.repeat(41), false), /not the name of a page/, 'a very long name is refused');
check((await rpcAnon('public_platform_settings')).disabledFeatures.length === 0, 'and none of those attempts changed anything');

section('3. Switching a page off and on');
let res = await rpc(admin, 'admin_set_feature', 'reels', false);
check(JSON.stringify(res.disabledFeatures) === '["reels"]', 'the administrator switches Reels off and gets the new settings back', JSON.stringify(res.disabledFeatures));
check((await rpcAnon('public_platform_settings')).disabledFeatures.includes('reels'), 'a visitor now sees it in the list');
check((await rpc(member, 'public_platform_settings')).disabledFeatures.includes('reels'), 'so does every member');
res = await rpc(admin, 'admin_set_feature', 'reels', false);
check(JSON.stringify(res.disabledFeatures) === '["reels"]', 'switching it off twice does not list it twice');
res = await rpc(admin, 'admin_set_feature', 'daily', false);
res = await rpc(admin, 'admin_set_feature', 'Fun-Polls', false);
check(JSON.stringify([...res.disabledFeatures].sort()) === '["daily","fun-polls","reels"]', 'several pages can be off at once (the name is made lower case)', JSON.stringify(res.disabledFeatures));
res = await rpc(admin, 'admin_set_feature', 'reels', true);
check(JSON.stringify([...res.disabledFeatures].sort()) === '["daily","fun-polls"]', 'switching one on takes only that one out of the list');
res = await rpc(admin, 'admin_set_feature', 'reels', true);
check(res.disabledFeatures.length === 2, 'switching on a page that is already on is harmless');
await rpc(admin, 'admin_set_feature', 'daily', true); res = await rpc(admin, 'admin_set_feature', 'fun-polls', true);
check(res.disabledFeatures.length === 0 && (await rpcAnon('public_platform_settings')).disabledFeatures.length === 0, 'turning everything back on leaves an empty list');

section('4. Nothing else is touched');
const before = await rpc(admin, 'public_platform_settings');
await rpc(admin, 'admin_set_feature', 'chat', false);
const after = await rpc(admin, 'public_platform_settings');
const { disabledFeatures: _a, ...restBefore } = before; const { disabledFeatures: _b, ...restAfter } = after;
check(JSON.stringify(restBefore) === JSON.stringify(restAfter), 'the sign-ups pause, maintenance lock, Music switch and every other setting keep their values');
await rpc(admin, 'admin_set_platform_settings', null, true, 'Back soon!');
let kept = await rpc(admin, 'public_platform_settings');
check(kept.maintenanceEnabled === true && kept.disabledFeatures.includes('chat'), 'changing another setting later leaves the list of switched-off pages where it was');
await rpc(admin, 'admin_set_platform_settings', null, false, null);
await rpc(admin, 'admin_set_music_page_hidden', true);
kept = await rpc(admin, 'public_platform_settings');
check(kept.musicPageHidden === true && kept.disabledFeatures.includes('chat'), 'the Music switch and the page switches work side by side');
await rpc(admin, 'admin_set_music_page_hidden', false); await rpc(admin, 'admin_set_feature', 'chat', true);

section('5. Written to the administrators\' activity log');
const log = (await db.query(`select action, details from public.admin_audit_log where action = 'feature_switch_changed' order by created_at`)).rows;
check(log.length >= 8 && log.every((r) => typeof r.details.feature === 'string' && typeof r.details.on === 'boolean'), 'each change is in the log with the page and whether it was switched on or off', String(log.length));
check(log.some((r) => r.details.feature === 'fun-polls' && r.details.on === false), 'the name is logged as it was stored');

section('6. The list can not grow without end');
for (let i = 0; i < 105; i++) await rpc(admin, 'admin_set_feature', `page-${i}`, false);
check((await rpc(admin, 'public_platform_settings')).disabledFeatures.length <= 100, 'at most 100 pages can be listed');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
