// Tests for migration 20261015000001: the admin's "Hide the Music page" switch, on a REAL Postgres (PGlite) with every migration applied.
// Usage: node scripts/supabase/test-music-page-toggle.mjs
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

const admin = await mkUser('noob');               // the main administrator is the account called noob (or any admin)
const member = await mkUser('someone');
const suspendedAdmin = await mkUser('susp_admin', { is_admin: true, is_suspended: true });

section('1. The page is visible until the administrator hides it');
let s = await rpcAnon('public_platform_settings');
check(s.musicPageHidden === false, 'a visitor who is not logged in sees it as not hidden by default', JSON.stringify(s));
check('signupsEnabled' in s && 'maintenanceEnabled' in s && 'noobRoomsEnabled' in s && 'liveLoungeMaintenance' in s, 'every older setting is still in the same answer');
s = await rpc(member, 'public_platform_settings');
check(s.musicPageHidden === false, 'a member sees it as not hidden');

section('2. Only the main administrator can change it');
await expectFail(() => rpc(member, 'admin_set_music_page_hidden', true), /Access denied/, 'a member can not hide the page');
await expectFail(() => rpcAnon('admin_set_music_page_hidden', true), /permission denied|Access denied/, 'a visitor can not either');
await expectFail(() => rpc(suspendedAdmin, 'admin_set_music_page_hidden', true), /Access denied/, 'nor a suspended administrator');
await expectFail(() => rpc(admin, 'admin_set_music_page_hidden', null), /Say whether/, 'a missing yes / no is refused');
check((await rpcAnon('public_platform_settings')).musicPageHidden === false, 'and none of those attempts changed anything');

section('3. Hiding and showing');
let res = await rpc(admin, 'admin_set_music_page_hidden', true);
check(res.musicPageHidden === true, 'the administrator hides it and gets the new settings back');
check((await rpcAnon('public_platform_settings')).musicPageHidden === true, 'a visitor now sees it hidden');
check((await rpc(member, 'public_platform_settings')).musicPageHidden === true, 'so does every member');
res = await rpc(admin, 'admin_set_music_page_hidden', true);
check(res.musicPageHidden === true, 'hiding it twice is harmless');
res = await rpc(admin, 'admin_set_music_page_hidden', false);
check(res.musicPageHidden === false && (await rpcAnon('public_platform_settings')).musicPageHidden === false, 'turning the switch off brings the page back');

section('4. Nothing else is touched');
const before = await rpc(admin, 'public_platform_settings');
await rpc(admin, 'admin_set_music_page_hidden', true);
const after = await rpc(admin, 'public_platform_settings');
const { musicPageHidden: _a, ...restBefore } = before; const { musicPageHidden: _b, ...restAfter } = after;
check(JSON.stringify(restBefore) === JSON.stringify(restAfter), 'the sign-ups pause, maintenance lock and every other switch keep their values');
const other = await rpc(admin, 'admin_set_platform_settings', null, true, 'Back soon!');
check(other.musicPageHidden === true && other.maintenanceEnabled === true, 'changing another setting later leaves the music switch where it was');
await rpc(admin, 'admin_set_platform_settings', null, false, null);
const log = (await db.query(`select action, details from public.admin_audit_log where action = 'music_page_hidden_changed' order by created_at`)).rows;
check(log.length >= 3 && log.every((r) => typeof r.details.musicPageHidden === 'boolean'), 'each change is written to the administrators\' activity log', String(log.length));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
