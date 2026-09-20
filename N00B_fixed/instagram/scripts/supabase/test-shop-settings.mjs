// Tests changing the shop settings (the "Orders ON/OFF" switch and the delivery charge) through the database function
// set_shop_settings: the main administrator can, everybody else is refused WITH the name of the account that was signed in, the
// charge is checked, every change is written to the admin activity log, and the plain-words message the app shows.
// On a REAL Postgres (PGlite) holding the real backup.
//
// Usage: node scripts/supabase/test-shop-settings.mjs [backup-folder]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadBackup, buildImportPlan } from './transform.mjs';
import { runImport } from './run-import.mjs';
import { createTestDb, makePgAdapter, asUser, asAnon } from './pg-test-env.mjs';

const backupsRoot = 'backups';
const dir = process.argv.slice(2).find((x) => !x.startsWith('--')) || path.join(backupsRoot, fs.readdirSync(backupsRoot).filter((d) => fs.existsSync(path.join(backupsRoot, d, 'users.json'))).sort().pop());
const raw = loadBackup(dir);
const Open = await import(pathToFileURL(path.resolve('src/components/Store/shopOpen.ts')).href);

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);

const db = await createTestDb();
await runImport(buildImportPlan(raw, {}), makePgAdapter(db), { log: () => {} });
const profByLegacy = Object.fromEntries((await db.query('select * from profiles')).rows.map((p) => [p.legacy_id, p]));
const adminRaw = raw.users.find((u) => u.isAdmin);
const pool = raw.users.filter((u) => !u.isAdmin && (u.password || '').length > 0);
const admin = profByLegacy[adminRaw.id].id;
const [ann, bob] = pool.slice(0, 2).map((u) => profByLegacy[u.id]);
const rpc = async (uid, fn, ...args) => asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
const refused = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };
const settings = async () => (await db.query('select store_enabled, store_delivery_fee::float8 as fee from app_settings where id = 1')).rows[0];
const audit = async () => (await rpc(admin, 'admin_audit_log', 100)).entries.filter((e) => e.action === 'shop_settings_changed');

section('1. The main administrator');
await db.query('update app_settings set store_enabled = true, store_delivery_fee = 40 where id = 1');
const off = await rpc(admin, 'set_shop_settings', false, null);
check(off.storeEnabled === false && off.storeDeliveryFee === 40 && (await settings()).store_enabled === false, 'turning orders OFF works, and the delivery charge is left alone');
const on = await rpc(admin, 'set_shop_settings', true, null);
check(on.storeEnabled === true && on.storeDeliveryFee === 40, 'turning orders ON works');
const fee = await rpc(admin, 'set_shop_settings', null, 55.5);
check(fee.storeEnabled === true && fee.storeDeliveryFee === 55.5, 'changing only the delivery charge leaves the switch alone');
const both = await rpc(admin, 'set_shop_settings', false, 0);
check(both.storeEnabled === false && both.storeDeliveryFee === 0, 'both at once (the settings window): switch off and a free delivery');
check((await rpc(admin, 'set_shop_settings', null, null)).storeEnabled === false && (await settings()).store_enabled === false, 'a call with nothing to change changes nothing');
check(JSON.stringify(await rpc(ann.id, 'get_app_settings')) === JSON.stringify(await rpc(admin, 'get_app_settings')) && (await rpc(ann.id, 'get_app_settings')).storeEnabled === false, 'and everybody sees the new state straight away');
await rpc(admin, 'set_shop_settings', true, 40);

section('2. The charge is checked');
check(/between 0 and 100000/.test(await refused(() => rpc(admin, 'set_shop_settings', null, -1)) || '') && /between 0 and 100000/.test(await refused(() => rpc(admin, 'set_shop_settings', null, 100001)) || ''), 'a negative or absurd charge is refused');
check((await rpc(admin, 'set_shop_settings', null, 100000)).storeDeliveryFee === 100000 && (await rpc(admin, 'set_shop_settings', null, 0)).storeDeliveryFee === 0, 'the limits themselves (0 and 100000) are fine');
await rpc(admin, 'set_shop_settings', null, 40);
check((await settings()).fee === 40, '(a refused change changed nothing)');

section('3. Everybody else is refused, and told who they are signed in as');
const msgAnn = await refused(() => rpc(ann.id, 'set_shop_settings', false, null));
check(!!msgAnn && msgAnn.includes(`@${ann.username}`) && /not the main NOOB administrator/.test(msgAnn) && /Log in as the NOOB account/.test(msgAnn), 'an ordinary member: refused, with their own name in the message', msgAnn || '');
check((await settings()).store_enabled === true, '...and the shop is untouched');
check(!!(await refused(() => rpc(bob.id, 'set_shop_settings', null, 999))) && (await settings()).fee === 40, 'nor can they change the charge');
await db.query('insert into admin_grants (user_id, permissions) values ($1, array[$2]) on conflict (user_id) do update set permissions = excluded.permissions', [bob.id, 'manage_store']);
const msgStaff = await refused(() => rpc(bob.id, 'set_shop_settings', false, null));
check(!!msgStaff && msgStaff.includes(`@${bob.username}`) && (await settings()).store_enabled === true, 'a helper who only has "manage the shop" is refused too (the switch belongs to the main admin)');
check(!!(await asAnon(db, () => refused(() => db.query('select public.set_shop_settings(false, null)')))), 'a visitor who is not logged in can not call it');
const direct = await asUser(db, ann.id, async () => { try { return (await db.query('update app_settings set store_enabled = false where id = 1 returning id')).rows.length; } catch { return 0; } });
check(direct === 0 && (await settings()).store_enabled === true, 'and writing straight into the settings table still changes nothing for them');

section('4. Who counts as the main administrator');
await db.query('update profiles set is_admin = false where id = $1', [admin]);
const adminName = (await db.query('select username from profiles where id = $1', [admin])).rows[0].username;
check(adminName.toLowerCase() === 'noob' && (await rpc(admin, 'set_shop_settings', false, null)).storeEnabled === false, 'the account named NOOB works even without the admin flag (as everywhere else in the app)');
await db.query('update profiles set is_admin = true where id = $1', [admin]);
await db.query('update profiles set is_suspended = true where id = $1', [admin]);
check(!!(await refused(() => rpc(admin, 'set_shop_settings', true, null))) && (await settings()).store_enabled === false, 'a suspended administrator is refused');
await db.query('update profiles set is_suspended = false where id = $1', [admin]);
await db.query('update profiles set username = $2, is_admin = true where id = $1', [ann.id, ann.username]);
await db.query('update profiles set is_admin = true where id = $1', [ann.id]);
check((await rpc(ann.id, 'set_shop_settings', true, null)).storeEnabled === true, 'a member marked admin in the database works');
await db.query('update profiles set is_admin = false where id = $1', [ann.id]);

section('5. The activity log');
const log = await audit();
check(log.length >= 8 && log.every((e) => e.actor && e.action === 'shop_settings_changed'), 'every change is written to the admin activity log with who made it');
const offEntry = log.find((e) => e.details.ordersOn === false && e.details.deliveryCharge === 0);
check(!!offEntry && offEntry.actor.toLowerCase() === adminName.toLowerCase(), 'with what was changed (switch off, charge 0)');
check(log.every((e) => !e.details || !JSON.stringify(e.details).includes('password')), 'nothing private is written into it');
const before = log.length;
await refused(() => rpc(bob.id, 'set_shop_settings', false, null));
check((await audit()).length === before, 'a refused attempt writes no "changed" entry');

section('6. The message the app shows');
check(Open.settingsRefusedMessage('padmanabh').includes('@padmanabh') && /NOOB account/.test(Open.settingsRefusedMessage('padmanabh')), 'the app says which account is signed in');
check(/main NOOB administrator/.test(Open.settingsRefusedMessage()) && !/@/.test(Open.settingsRefusedMessage(null)), 'and falls back to a plain sentence when it can not tell');

console.log(`\n${passed} passed, ${failed} failed`);
await db.close?.();
process.exitCode = failed ? 1 : 0;
