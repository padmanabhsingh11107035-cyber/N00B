// Tests for migration 20260927000003 (part 3): the admin pins accounts to the top of Explore's people list,
// against a real Postgres (PGlite) holding the real backup.
import fs from 'node:fs';
import path from 'node:path';
import { loadBackup, buildImportPlan } from './transform.mjs';
import { runImport } from './run-import.mjs';
import { createTestDb, makePgAdapter, asUser, asAnon } from './pg-test-env.mjs';

const backupsRoot = 'backups';
const dir = process.argv.slice(2).find((a) => !a.startsWith('--')) || path.join(backupsRoot, fs.readdirSync(backupsRoot).filter((d) => fs.existsSync(path.join(backupsRoot, d, 'users.json'))).sort().pop());
const raw = loadBackup(dir);

let passed = 0;
let failed = 0;
const check = (cond, label, detail = '') => {
  if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); }
};
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};

const db = await createTestDb();
await runImport(buildImportPlan(raw, {}), makePgAdapter(db), { log: () => {} });
const profByLegacy = Object.fromEntries((await db.query('select * from profiles')).rows.map((p) => [p.legacy_id, p]));
const idOf = (u) => profByLegacy[u.id].id;
const admin = idOf(raw.users.find((u) => u.isAdmin));
const publicUsers = raw.users.filter((u) => u.accountType !== 'private' && !u.isAdmin).map(idOf);
const [viewer, x, y, z] = publicUsers;

const call = (uid, sql, params = []) => asUser(db, uid, async () => (await db.query(sql, params)).rows);
const rpc = async (uid, fn, ...args) => (await call(uid, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args))[0].r;
const rpcAnon = async (fn, ...args) => (await asAnon(db, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows))[0].r;
const list = async () => (await rpc(viewer, 'search_users', ''));

const before = await list();
check(before.length > 3 && before.every((u) => !u.pinned), 'no one is pinned at first');
const newestFirst = before.map((u) => u.id);

// pin x, then y: y (the newest pin) first, x second, then everyone else in the usual order
await rpc(admin, 'admin_set_explore_pin', x, true);
await new Promise((r) => setTimeout(r, 20));
await rpc(admin, 'admin_set_explore_pin', y, true);
let after = await list();
check(after[0].id === y && after[1].id === x, 'the newest pin is first, the earlier one second', JSON.stringify(after.slice(0, 3).map((u) => u.username)));
check(after[0].pinned === true && after[1].pinned === true && !after[2].pinned, 'only pinned entries are marked (the app never shows it)');
check(JSON.stringify(after.slice(2).map((u) => u.id)) === JSON.stringify(newestFirst.filter((id) => id !== x && id !== y)), 'everyone else keeps the usual order');
check(after.length === before.length, 'nobody is added or lost');

// pinning x again moves it back to the top
await new Promise((r) => setTimeout(r, 20));
await rpc(admin, 'admin_set_explore_pin', x, true);
after = await list();
check(after[0].id === x && after[1].id === y, 'pinning again brings an account back to the top');

// pins also lead a search that matches them
const q = (await db.query('select username from profiles where id = $1', [y])).rows[0].username;
const found = await rpc(viewer, 'search_users', q);
check(found[0].id === y, 'a matching search also shows the pinned account first');

// the admin's list of pins
const pins = await rpc(admin, 'admin_explore_pins');
check(pins.length === 2 && pins[0].userId === x && pins[1].userId === y, 'the admin sees the pins, newest first');

// unpin
await rpc(admin, 'admin_set_explore_pin', x, false);
after = await list();
check(after[0].id === y && !after.slice(1).some((u) => u.pinned), 'unpinning puts the account back in its normal place');

// only the main admin
await expectFail(() => rpc(viewer, 'admin_set_explore_pin', z, true), /Access denied/, 'a normal account can not pin');
await expectFail(() => rpc(viewer, 'admin_explore_pins'), /Access denied/, 'a normal account can not list the pins');
await expectFail(() => call(viewer, 'select * from public.explore_pins'), /permission denied/, 'nobody can read the pins table directly');
await expectFail(() => rpcAnon('admin_explore_pins'), /permission denied|Access denied/, 'logged-out visitors can not list the pins');

// a pinned account that hid itself from the viewer still stays hidden from them
await db.query('insert into profile_hides (owner_id, hidden_from_id) values ($1, $2)', [y, viewer]);
after = await list();
check(!after.some((u) => u.id === y), 'pinning never shows an account to someone it is hidden from');
await db.query('delete from profile_hides where owner_id = $1 and hidden_from_id = $2', [y, viewer]);

// deleting a pinned account removes its pin
await rpc(admin, 'admin_set_explore_pin', z, true);
await db.query('delete from profiles where id = $1', [z]).catch(() => {});
const left = (await db.query('select count(*)::int as n from explore_pins where user_id = $1', [z])).rows[0].n;
check(left === 0, 'no pin is left behind when an account is deleted');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
