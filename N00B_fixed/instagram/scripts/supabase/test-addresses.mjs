// Tests the shop's address book: several saved addresses per person, exactly one default, the limit of 10, checks on what is
// saved, privacy (only the owner can ever read them), removing, the carry-over of addresses saved before the address book
// existed, and a real delivery order that uses a saved address — on a REAL Postgres (PGlite) holding the real backup, as
// real signed-in people including every way someone might overstep.
//
// Usage: node scripts/supabase/test-addresses.mjs [backup-folder]
import fs from 'node:fs';
import path from 'node:path';
import { loadBackup, buildImportPlan } from './transform.mjs';
import { runImport } from './run-import.mjs';
import { createTestDb, makePgAdapter, asUser, asAnon, MIGRATIONS_DIR } from './pg-test-env.mjs';

const backupsRoot = 'backups';
const dir = process.argv.slice(2).find((x) => !x.startsWith('--')) || path.join(backupsRoot, fs.readdirSync(backupsRoot).filter((d) => fs.existsSync(path.join(backupsRoot, d, 'users.json'))).sort().pop());
const raw = loadBackup(dir);

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};
const section = (t) => console.log(`\n${t}`);

const db = await createTestDb();
await runImport(buildImportPlan(raw, {}), makePgAdapter(db), { log: () => {} });
const profByLegacy = Object.fromEntries((await db.query('select * from profiles')).rows.map((p) => [p.legacy_id, p]));
const idOf = (u) => profByLegacy[u.id].id;
const adminRaw = raw.users.find((u) => u.isAdmin);
const pool = raw.users.filter((u) => !u.isAdmin && (u.password || '').length > 0);
const admin = idOf(adminRaw);
const [ann, bob, cy, dee] = pool.slice(0, 4).map(idOf);
const call = (uid, sql, params = []) => asUser(db, uid, async () => (await db.query(sql, params)).rows);
const rpc = async (uid, fn, ...args) => (await call(uid, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args))[0].r;
const n = async (sql, params = []) => (await db.query(sql, params)).rows[0].n;
const count = (uid) => n('select count(*)::int n from shop_addresses where user_id = $1', [uid]);
const defaults = (uid) => n('select count(*)::int n from shop_addresses where user_id = $1 and is_default', [uid]);
const list = async (uid) => (await rpc(uid, 'my_shop_addresses')).addresses;
const home = { label: 'Home', fullName: '  Asha Verma ', phone: '+91 98765 43210', altPhone: '99999 11111', addressLine1: '12 MG Road', addressLine2: 'Shivaji Nagar', landmark: 'Near the temple', city: 'Pune', state: 'Maharashtra', pincode: '411001', deliveryNotes: 'Ring twice' };
const work = { label: 'Work', fullName: 'Asha Verma', phone: '98765 43210', addressLine1: 'Tech Park, Tower B', city: 'Mumbai', state: 'Maharashtra', pincode: '400051' };
const save = (uid, p) => rpc(uid, 'save_shop_address', p);

section('1. The first address');
check((await list(ann)).length === 0, 'nobody has an address to begin with');
const a1 = await save(ann, home);
check(a1.success && a1.address.isDefault === true && a1.address.label === 'Home' && a1.addresses.length === 1, 'the first address is saved and becomes the default automatically');
check(a1.address.fullName === 'Asha Verma' && a1.address.city === 'Pune' && a1.address.landmark === 'Near the temple' && a1.address.deliveryNotes === 'Ring twice' && a1.address.id.length === 36, 'the details are kept and tidied (spaces trimmed)');
check(!('email' in a1.address), 'an address holds no email (that lives with the contact details)');
const withEmail = await save(dee, { ...work, email: 'not-an-email', label: '  ' });
check(withEmail.success && withEmail.address.label === '' && !('email' in withEmail.address), 'a stray email is ignored, and the name of the address is optional');

section('2. More addresses, and exactly one default');
const a2 = await save(ann, work);
check(a2.address.isDefault === false && a2.addresses.length === 2 && a2.addresses[0].label === 'Home', 'a second address is saved, is NOT the default, and the default is listed first');
const a3 = await save(ann, { ...work, label: 'Parents', city: 'Nagpur', pincode: '440001', makeDefault: true });
check(a3.address.isDefault === true && a3.addresses[0].id === a3.address.id && a3.addresses.filter((a) => a.isDefault).length === 1, 'saving with "make default" moves the default to it');
check(await defaults(ann) === 1 && await count(ann) === 3, 'the database holds exactly one default out of three');
check(JSON.stringify((await list(ann)).map((a) => a.label)) === JSON.stringify(['Parents', 'Home', 'Work']), 'order: the default first, then in the order they were added');
await expectFail(() => db.query(`insert into shop_addresses (user_id, details, is_default) values ($1, '{}', true)`, [ann]), /duplicate key|unique/, 'even a direct write can not create a second default');

section('3. Changing an address');
const homeId = a1.address.id;
const e1 = await save(ann, { ...home, id: homeId, city: 'Pune West', label: 'Flat' });
check(e1.address.id === homeId && e1.address.city === 'Pune West' && e1.address.label === 'Flat' && e1.address.isDefault === false && await count(ann) === 3, 'editing changes that address only (no new one), and keeps it non-default');
const e2 = await save(ann, { ...home, id: homeId, makeDefault: true });
check(e2.address.isDefault === true && await defaults(ann) === 1 && (await list(ann))[0].id === homeId, 'editing with "make default" makes it the default');
const e3 = await save(ann, { ...home, id: homeId });
check(e3.address.isDefault === true, 'editing the default without ticking anything leaves it the default');
await expectFail(() => save(bob, { ...home, id: homeId }), /Address not found/, 'nobody can change someone else\'s address');
await expectFail(() => save(ann, { ...home, id: 'not-an-id' }), /Address not found/, 'a made-up id is refused');
await expectFail(() => save(ann, { ...home, id: '00000000-0000-0000-0000-000000000000' }), /Address not found/, '...and so is an id that does not exist');
check((await list(bob)).length === 0, '(and the refused attempts did nothing)');

section('4. What is refused');
const before = await count(cy);
const bad = [
  [{ ...home, fullName: '' }, /full name/i, 'no name'], [{ ...home, phone: '' }, /phone number/i, 'no phone'], [{ ...home, phone: '12' }, /valid phone/i, 'a bad phone'],
  [{ ...home, altPhone: 'abc' }, /alternate phone/i, 'a bad alternate phone'], [{ ...home, addressLine1: '' }, /delivery address/i, 'no street'],
  [{ ...home, city: '' }, /city/i, 'no city'], [{ ...home, state: '' }, /state/i, 'no state'], [{ ...home, pincode: '' }, /pincode/i, 'no pincode'],
  [{ ...home, pincode: '!!' }, /pincode/i, 'a bad pincode'], [{ ...home, label: 'x'.repeat(31) }, /at most 30/, 'a name of more than 30 characters'],
  [{ ...home, addressLine1: 'x'.repeat(151) }, /at most 150/, 'a street line of more than 150 characters'], [{ ...home, deliveryNotes: 'x'.repeat(301) }, /at most 300/, 'notes of more than 300 characters']
];
for (const [payload, pattern, what] of bad) await expectFail(() => save(cy, payload), pattern, `${what} is refused`);
await expectFail(() => rpc(cy, 'save_shop_address', 'nope'), /Enter the address details|invalid input|cannot/i, 'something that is not address details is refused');
check(await count(cy) === before, '...and none of the refusals saved anything');

section('5. At most 10 addresses');
for (let i = 1; i <= 10; i++) await save(cy, { ...work, label: 'A' + i, addressLine1: `${i} Long Street` });
check(await count(cy) === 10 && await defaults(cy) === 1, 'ten addresses can be saved, with one default');
await expectFail(() => save(cy, { ...work, label: 'One too many' }), /up to 10 addresses/, 'the eleventh is refused, and the message says why');
const cyList = await list(cy);
await rpc(cy, 'delete_shop_address', cyList[cyList.length - 1].id);
check((await save(cy, { ...work, label: 'Now it fits' })).success && await count(cy) === 10, 'removing one makes room for another');

section('6. Choosing the default');
const bl = (await save(bob, work)).address; const bl2 = (await save(bob, { ...work, label: 'B2', city: 'Delhi', pincode: '110001' })).address;
check(bl.isDefault && !bl2.isDefault, 'setup: the first is the default');
const sd = await rpc(bob, 'set_default_shop_address', bl2.id);
check(sd.addresses[0].id === bl2.id && sd.addresses[0].isDefault && sd.addresses.filter((a) => a.isDefault).length === 1, 'setting the default moves it');
check((await rpc(bob, 'set_default_shop_address', bl2.id)).addresses[0].id === bl2.id, 'setting the current default again changes nothing');
await expectFail(() => rpc(bob, 'set_default_shop_address', homeId), /Address not found/, 'nobody can set someone else\'s address as their default');
await expectFail(() => rpc(bob, 'set_default_shop_address', '00000000-0000-0000-0000-000000000000'), /Address not found/, '...or one that does not exist');

section('7. Removing addresses');
const dl = (await save(dee, { ...home, label: 'D2' })).addresses; // dee already has "work" (default) from section 1
check(dl.length === 2, 'setup: two addresses');
const dDefault = dl.find((a) => a.isDefault).id, dOther = dl.find((a) => !a.isDefault).id;
let r = await rpc(dee, 'delete_shop_address', dOther);
check(r.addresses.length === 1 && r.addresses[0].id === dDefault && r.addresses[0].isDefault, 'removing a non-default address keeps the default');
const d3 = (await save(dee, { ...work, label: 'D3' })).address; const d4 = (await save(dee, { ...work, label: 'D4' })).address;
r = await rpc(dee, 'delete_shop_address', dDefault);
check(r.addresses.length === 2 && r.addresses.filter((a) => a.isDefault).length === 1 && r.addresses[0].id === d4.id, 'removing the DEFAULT makes the most recently added one that is left the new default');
await rpc(dee, 'delete_shop_address', d3.id); r = await rpc(dee, 'delete_shop_address', d4.id);
check(r.addresses.length === 0 && await count(dee) === 0, 'removing the last one leaves none');
await expectFail(() => rpc(dee, 'delete_shop_address', d4.id), /Address not found/, 'removing the same address twice is refused');
await expectFail(() => rpc(bob, 'delete_shop_address', homeId), /Address not found/, 'nobody can remove someone else\'s address');
check((await list(ann)).some((a) => a.id === homeId), '(and it is still there)');
check((await save(dee, home)).address.isDefault === true, 'after removing everything, the next address is the default again');

section('8. Privacy');
check((await list(bob)).every((a) => a.id !== homeId && a.city !== 'Pune West'), 'nobody sees anybody else\'s addresses');
await expectFail(() => call(ann, 'select * from shop_addresses'), /permission denied/, 'a signed-in person can not read the table directly, not even their own rows');
await expectFail(() => call(ann, `insert into shop_addresses (user_id, details) values ($1, '{}')`, [ann]), /permission denied/, '...or write to it');
await expectFail(() => call(ann, 'delete from shop_addresses'), /permission denied/, '...or delete from it');
for (const fn of ['my_shop_addresses', 'save_shop_address', 'set_default_shop_address', 'delete_shop_address']) {
  const arg = fn === 'my_shop_addresses' ? '' : fn === 'save_shop_address' ? `'{}'::jsonb` : `'${homeId}'::uuid`;
  await expectFail(() => asAnon(db, () => db.query(`select public.${fn}(${arg})`)), /permission denied/, `a logged-out visitor can not use ${fn}`);
}
await expectFail(() => call(ann, `select public.shop_address_json(a) from shop_addresses a`), /permission denied/, 'the internal helper is not callable from a browser');
await db.query('update profiles set is_suspended = true where id = $1', [ann]);
await expectFail(() => list(ann), /Unauthorized/, 'a suspended account can not use them');
await db.query('update profiles set is_suspended = false where id = $1', [ann]);
check((await list(ann)).length === 3, '(and gets them back when restored)');

section('9. A delivery order with a saved address');
const prod = (await rpc(admin, 'create_store_product', { price: 250, name: 'Address test', description: 'x', media: [{ type: 'photo', url: 'p.jpg' }], stock: 5 })).product;
await db.query('update app_settings set store_delivery_fee = 40, store_enabled = true where id = 1');
const chosen = (await list(ann))[1];   // not the default: the person picked another one at checkout
const { id: _i, label: _l, isDefault: _d, updatedAt: _u, ...contact } = chosen;
const o = (await rpc(ann, 'place_store_order', { items: [{ productId: prod.id, quantity: 2 }], deliveryMethod: 'delivery', contact })).order;
check(o.deliveryMethod === 'delivery' && o.contact.city === chosen.city && o.contact.addressLine1 === chosen.addressLine1 && o.contact.pincode === chosen.pincode && o.total === 540, 'an order delivered to a saved (non-default) address keeps that address, and the total includes the delivery charge');
await save(ann, { ...chosen, id: chosen.id, city: 'Changed later' });
check((await rpc(ann, 'my_store_orders')).orders[0].contact.city === chosen.city, 'changing an address later does not change orders already placed');
await rpc(ann, 'delete_shop_address', chosen.id);
check((await rpc(ann, 'my_store_orders')).orders[0].contact.addressLine1 === chosen.addressLine1, 'removing an address later does not change orders already placed');

section('10. Addresses saved before the address book existed');
const legacyOne = pool[4] ? idOf(pool[4]) : null, legacyTwo = pool[5] ? idOf(pool[5]) : null, legacyThree = pool[6] ? idOf(pool[6]) : null;
if (legacyOne && legacyTwo && legacyThree) {
  const det = (extra) => JSON.stringify({ fullName: 'Old Person', phone: '9876543210', ...extra });
  await db.query(`insert into shop_details (user_id, details) values ($1, $2::jsonb), ($3, $4::jsonb), ($5, $6::jsonb)`, [
    legacyOne, det({ addressLine1: '7 Old Lane', addressLine2: 'Ward 3', city: 'Surat', state: 'Gujarat', pincode: '395003', landmark: 'Near the bridge', deliveryNotes: 'Call first' }),
    legacyTwo, det({}),   // contact details only, no address
    legacyThree, det({ addressLine1: '9 Kept Lane', city: 'Rajkot', state: 'Gujarat', pincode: '360001' })
  ]);
  await save(legacyThree, { ...work, label: 'Already has one', addressLine1: 'Existing Address' });   // must not be touched
  const M11 = fs.readFileSync(path.join(MIGRATIONS_DIR, '20260920000011_shop_address_book.sql'), 'utf8');
  await db.exec(M11);
  const carried = await list(legacyOne);
  check(carried.length === 1 && carried[0].isDefault && carried[0].label === 'Home' && carried[0].addressLine1 === '7 Old Lane' && carried[0].city === 'Surat' && carried[0].landmark === 'Near the bridge' && carried[0].deliveryNotes === 'Call first', 'an address saved earlier becomes the person\'s default address, with everything it had');
  check((await list(legacyTwo)).length === 0, 'someone who only had contact details gets no address');
  check((await list(legacyThree)).length === 1 && (await list(legacyThree))[0].addressLine1 === 'Existing Address', 'someone who already had addresses is left exactly as they were');
  await db.exec(M11);
  check((await list(legacyOne)).length === 1 && await count(legacyThree) === 1, 'running it again adds nothing twice');
  check((await rpc(legacyOne, 'get_shop_details')).details.addressLine1 === '7 Old Lane', 'the saved shop details themselves are untouched');
} else console.log('  (not enough accounts in this data set for the carry-over checks — skipped)');

section('11. When an account is deleted');
const gone = idOf(pool[3]);
await save(gone, home);
check(await count(gone) >= 1, 'setup: the account has addresses');
await db.query('delete from profiles where id = $1', [gone]);
check(await count(gone) === 0, 'deleting the account deletes its addresses with it');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
