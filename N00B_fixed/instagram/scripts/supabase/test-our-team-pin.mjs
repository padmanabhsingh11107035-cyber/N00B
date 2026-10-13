// Tests migration 20261013000003: the main administrator pins team members to the top of the "Our Team" page. Pinned people come first (so they get the
// numbers 01, 02 …) for everybody, but only the administrator is told who is pinned. On a REAL Postgres (PGlite) with every migration applied.
//
// Usage: node scripts/supabase/test-our-team-pin.mjs
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
const rpc = (uid, fn, ...args) => asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const names = (team) => team.map((m) => m.name).join(',');
const places = (team) => team.map((m) => m.position).join(',');

const admin = await mkUser('noob', { is_admin: true });
const ann = await mkUser('ann');
const add = async (name) => (await rpc(admin, 'admin_team_save', null, name, 'Q', 'D', `team/${name.toLowerCase()}.jpg`, null)).team.find((m) => m.name === name).id;
const A = await add('Alpha'), B = await add('Bravo'), C = await add('Charlie'), D = await add('Delta');
const idOf = { Alpha: A, Bravo: B, Charlie: C, Delta: D };
const pin = (name, on = true) => rpc(admin, 'admin_team_pin', idOf[name], on);

section('1. Only the main administrator pins');
await expectFail(() => rpc(ann, 'admin_team_pin', C, true), /Only the main NOOB administrator/, 'an ordinary member cannot pin');
let denied = false;
try { await asAnon(db, async () => db.query(`select public.admin_team_pin($1, true)`, [C])); } catch (e) { denied = /permission denied/.test(e.message); }
check(denied, 'someone not signed in cannot either');
await expectFail(() => rpc(admin, 'admin_team_pin', '00000000-0000-0000-0000-000000000000', true), /no longer exists/, 'pinning someone who is gone');
check(names(await rpc(ann, 'team_list')) === 'Alpha,Bravo,Charlie,Delta' && (await rpc(ann, 'team_list')).every((m) => m.pinned === false), 'before any pin: the plain order, nobody pinned');

section('2. Pinned people come first, and only the administrator sees the pin');
let r = await pin('Charlie');
check(names(r.team) === 'Charlie,Alpha,Bravo,Delta' && places(r.team) === '1,2,3,4', 'Charlie is pinned: he is number 1, the rest follow as 2, 3, 4');
check(r.team[0].pinned === true && r.team.slice(1).every((m) => m.pinned === false), 'the administrator is told Charlie is pinned');
let seen = await rpc(ann, 'team_list');
check(names(seen) === 'Charlie,Alpha,Bravo,Delta', 'an ordinary member sees Charlie first too');
check(seen.every((m) => m.pinned === false) && !JSON.stringify(seen).includes('"pinned": true') && !JSON.stringify(seen).includes('"pinned":true'), 'but is told nobody is pinned: no pin mark anywhere');
check((await rpc(admin, 'team_list'))[0].pinned === true, 'the administrator sees the pin when reading the page too');

section('3. Pin order and the numbers');
r = await pin('Alpha');
check(names(r.team) === 'Charlie,Alpha,Bravo,Delta' && r.team[0].pinned && r.team[1].pinned && !r.team[2].pinned, 'a second pin goes behind the first: Charlie 1, Alpha 2');
r = await pin('Delta');
check(names(r.team) === 'Charlie,Alpha,Delta,Bravo' && places(r.team) === '1,2,3,4', 'a third pin: Delta is 3 and the unpinned Bravo is last; the numbers stay 1, 2, 3, 4');
r = await pin('Charlie');
check(names(r.team) === 'Charlie,Alpha,Delta,Bravo', 'pinning someone who is already pinned changes nothing');
check((await q(`select count(*)::int n from public.admin_audit_log where action = 'team_member_pinned'`))[0].n === 3, 'and is not logged again');

section('4. The arrows stay inside the group');
r = await rpc(admin, 'admin_team_move', idOf.Alpha, 'up');
check(names(r.team) === 'Alpha,Charlie,Delta,Bravo', 'among the pinned, Alpha moves up');
r = await rpc(admin, 'admin_team_move', idOf.Delta, 'down');
check(names(r.team) === 'Alpha,Charlie,Delta,Bravo', 'the last pinned one cannot be moved down across the line');
r = await rpc(admin, 'admin_team_move', idOf.Bravo, 'up');
check(names(r.team) === 'Alpha,Charlie,Delta,Bravo', 'nor the first of the rest moved up across it');
check(places(r.team) === '1,2,3,4', 'the numbers stay 1, 2, 3, 4');

section('5. Unpinning');
r = await pin('Alpha', false);
check(names(r.team) === 'Charlie,Delta,Alpha,Bravo' && places(r.team) === '1,2,3,4', 'Alpha is unpinned: she goes to the top of the rest, right behind the pinned ones');
check(r.team.map((m) => m.pinned).join() === 'true,true,false,false', 'the administrator sees who is still pinned');
r = await pin('Charlie', false);
r = await pin('Delta', false);
check(names(r.team) === 'Delta,Charlie,Alpha,Bravo' && r.team.every((m) => m.pinned === false), 'unpin everyone: nobody pinned; each one goes to the top of the rest as unpinned, so the last unpinned (Delta) is first');
check((await q(`select count(*)::int n from public.admin_audit_log where action = 'team_member_unpinned'`))[0].n === 3, 'unpinning is logged');

section('6. New people, edits and removals');
await pin('Bravo');
r = await rpc(admin, 'admin_team_save', null, 'Echo', 'Q', 'D', 'team/echo.jpg', null);
check(names(r.team) === 'Bravo,Delta,Charlie,Alpha,Echo' && places(r.team) === '1,2,3,4,5', 'a new person goes to the end, behind the pinned one');
r = await rpc(admin, 'admin_team_save', idOf.Bravo, 'Bravo B.', 'Q2', 'D2', 'team/bravo.jpg', null);
check(r.team[0].name === 'Bravo B.' && r.team[0].pinned === true, 'editing a pinned person keeps the pin');
const removed = await rpc(admin, 'admin_team_delete', idOf.Charlie);
check(names(removed.team) === 'Bravo B.,Delta,Alpha,Echo' && places(removed.team) === '1,2,3,4', 'removing someone closes the gap in the numbers');
const removedPinned = await rpc(admin, 'admin_team_delete', idOf.Bravo);
check(names(removedPinned.team) === 'Delta,Alpha,Echo' && places(removedPinned.team) === '1,2,3', 'and removing the pinned one too');

section('7. People who join through the form');
const zed = await mkUser('zed');
await rpc(admin, 'admin_team_settings', null, true);
await rpc(zed, 'team_apply', 'Zed Zo', 'BCA', 'Hi', 'team/zed.jpg');
await rpc(admin, 'admin_team_pin', (await rpc(ann, 'team_list')).find((m) => m.name === 'Zed Zo').id, true);
seen = await rpc(ann, 'team_list');
check(names(seen) === 'Zed Zo,Delta,Alpha,Echo', 'someone who joined through the form can be pinned like anyone');
check(seen.every((m) => m.pinned === false), 'and still nobody but the administrator is told');

section('8. Nothing leaks');
const sql = (await import('node:fs')).default.readFileSync('supabase/migrations/20261013000003_team_pin.sql', 'utf8');
check(/'pinned', t\.pinned and me\.is_main/.test(sql), 'the database only sends the pin flag to the main administrator');
check(!/pinned/.test((await q(`select pg_get_functiondef('public.team_list()'::regprocedure) as d`))[0].d), 'the public list function itself knows nothing about pins');
const mine = await rpc(zed, 'team_list');
check(mine.every((m) => m.pinned === false), 'not even the pinned person is told they are pinned');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
