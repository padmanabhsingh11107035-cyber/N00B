// Tests the MAP PIN on delivery addresses and orders: an address can carry the exact spot the customer pinned (two numbers, both or
// neither, a real place, tidied to six decimals), it is kept with the address and copied into the order (so the order screen can show
// the exact location, even if the address is changed later), and the plain-words helpers behind the Blinkit-style order screen
// (the steps of an order's journey, the headline, the map link, the bill). Real Postgres (PGlite) holding the real backup.
//
// Usage: node scripts/supabase/test-address-pin.mjs [backup-folder]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadBackup, buildImportPlan } from './transform.mjs';
import { runImport } from './run-import.mjs';
import { createTestDb, makePgAdapter, asUser } from './pg-test-env.mjs';

const backupsRoot = 'backups';
const dir = process.argv.slice(2).find((x) => !x.startsWith('--')) || path.join(backupsRoot, fs.readdirSync(backupsRoot).filter((d) => fs.existsSync(path.join(backupsRoot, d, 'users.json'))).sort().pop());
const raw = loadBackup(dir);
const load = (p) => import(pathToFileURL(path.resolve(p)).href);
const OT = await load('src/components/Store/orderTracking.ts');
const AB = await load('src/components/Store/addressBook.ts');

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
const adminRaw = raw.users.find((u) => u.isAdmin);
const pool = raw.users.filter((u) => !u.isAdmin && (u.password || '').length > 0);
const admin = profByLegacy[adminRaw.id].id;
const [ann, bob] = pool.slice(0, 2).map((u) => profByLegacy[u.id].id);
const rpc = async (uid, fn, ...args) => asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
const home = { label: 'Home', fullName: 'Asha Verma', phone: '98765 43210', addressLine1: '12 MG Road', city: 'Ahmedabad', state: 'Gujarat', pincode: '380001' };
const save = (uid, p) => rpc(uid, 'save_shop_address', p);

section('1. Saving an address with a pin');
let r = await save(ann, { ...home, lat: 23.0225, lng: 72.5714 });
check(r.success && r.address.lat === 23.0225 && r.address.lng === 72.5714, 'the pin is saved with the address');
check(OT.pinOf(r.address)?.lat === 23.0225, '...and the app reads it back');
r = await save(ann, { ...home, label: 'Precise', lat: 23.02251234567, lng: 72.57140987654 });
check(r.address.lat === 23.022512 && r.address.lng === 72.57141, 'it is tidied to six decimals (about a tenth of a metre)');
r = await save(ann, { ...home, label: 'Text numbers', lat: '23.5', lng: '-72.25' });
check(r.address.lat === 23.5 && r.address.lng === -72.25, 'numbers written as text are understood too');
r = await save(ann, { ...home, label: 'No pin' });
check(r.success && !('lat' in r.address) && !('lng' in r.address) && OT.pinOf(r.address) === null, 'an address without a pin works exactly as before (no numbers stored)');
r = await save(ann, { ...home, label: 'Edge', lat: 90, lng: -180 });
check(r.success && r.address.lat === 90 && r.address.lng === -180, 'the very edges of the Earth are still places');

section('2. Only real places');
const bad = [
  [{ lat: 23.02 }, 'a latitude without a longitude'], [{ lng: 72.57 }, 'a longitude without a latitude'],
  [{ lat: 91, lng: 10 }, 'a latitude above 90'], [{ lat: -90.1, lng: 10 }, 'a latitude below -90'], [{ lat: 10, lng: 180.5 }, 'a longitude above 180'], [{ lat: 10, lng: -181 }, 'a longitude below -180'],
  [{ lat: 'abc', lng: 10 }, 'a latitude that is not a number'], [{ lat: 1e5, lng: 1 }, 'a huge number'], [{ lat: '1; drop table x', lng: 1 }, 'text that is not a number'], [{ lat: '', lng: '5' }, 'an empty latitude']
];
for (const [pin, what] of bad) await expectFail(() => save(ann, { ...home, label: 'Bad', ...pin }), /map pin is not a valid location/, `${what} is refused`);
check(!(await rpc(ann, 'my_shop_addresses')).addresses.some((a) => a.label === 'Bad'), '(and nothing was saved by those attempts)');

section('3. Changing and removing the pin');
const first = (await rpc(ann, 'my_shop_addresses')).addresses.find((a) => a.label === 'Home');
r = await save(ann, { ...home, id: first.id, lat: 23.1, lng: 72.6 });
check(r.address.id === first.id && r.address.lat === 23.1, 'the pin can be moved (dragged) and saved again');
r = await save(ann, { ...home, id: first.id });
check(!('lat' in r.address) && !('lng' in r.address), 'saving without a pin removes it');

section('4. The order keeps the exact location');
const prod = (await rpc(admin, 'create_store_product', { price: 250, name: 'Pin test', description: 'x', media: [{ type: 'photo', url: 'p.jpg' }], stock: 5 })).product;
await db.query('update app_settings set store_delivery_fee = 40, store_enabled = true where id = 1');
const pinned = (await save(ann, { ...home, label: 'Pinned', lat: 23.0301, lng: 72.5501 })).address;
const { id: _i, label: _l, isDefault: _d, updatedAt: _u, ...contact } = pinned;
const order = (await rpc(ann, 'place_store_order', { items: [{ productId: prod.id, quantity: 1 }], deliveryMethod: 'delivery', contact })).order;
check(order.contact.lat === 23.0301 && order.contact.lng === 72.5501 && OT.pinOf(order.contact)?.lng === 72.5501, 'a delivery order carries the exact pinned location');
await save(ann, { ...pinned, id: pinned.id, lat: 23.9, lng: 72.9 });
const later = (await rpc(ann, 'my_store_orders')).orders.find((o) => o.id === order.id);
check(later.contact.lat === 23.0301 && later.contact.lng === 72.5501, 'moving the pin (or the address) later does not change the order already placed');
await rpc(ann, 'delete_shop_address', pinned.id);
check((await rpc(ann, 'my_store_orders')).orders.find((o) => o.id === order.id).contact.lat === 23.0301, 'removing the address later does not either');
await expectFail(() => rpc(ann, 'place_store_order', { items: [{ productId: prod.id, quantity: 1 }], deliveryMethod: 'delivery', contact: { ...contact, lat: 500, lng: 1 } }), /map pin is not a valid location/, 'an order with a made-up pin is refused');
const noPin = (await rpc(ann, 'place_store_order', { items: [{ productId: prod.id, quantity: 1 }], deliveryMethod: 'delivery', contact: { ...contact, lat: undefined, lng: undefined } })).order;
check(!('lat' in noPin.contact) && OT.pinOf(noPin.contact) === null, 'an order without a pin is fine and has none');
const shopSees = (await rpc(admin, 'admin_store_orders')).orders.find((o) => o.id === order.id);
check(shopSees.contact.lat === 23.0301 && shopSees.customer.username.length > 0, 'the shop owner sees the exact location on that order');
check(!(await rpc(bob, 'my_store_orders')).orders.some((o) => o.id === order.id), 'nobody else can see it');

section('5. The order screen: steps of the journey');
const hist = (list) => list.map(([status, at]) => ({ status, at, by: 'shop' }));
const steps = (status, method, h) => OT.trackSteps({ status, deliveryMethod: method, statusHistory: hist(h) });
let s = steps('placed', 'delivery', [['placed', '2026-09-21T10:00:00Z']]);
check(s.map((x) => x.state).join() === 'current,todo,todo,todo' && s[0].at === '2026-09-21T10:00:00Z' && s[0].label === 'Order placed', 'just placed: the first step is the current one, with its time');
s = steps('confirmed', 'delivery', [['placed', 'a'], ['confirmed', 'b']]);
check(s.map((x) => x.state).join() === 'done,current,todo,todo' && s[1].at === 'b', 'confirmed: the first is done, the second is current');
s = steps('ready', 'delivery', [['placed', 'a'], ['confirmed', 'b'], ['ready', 'c']]);
check(s.map((x) => x.state).join() === 'done,done,current,todo' && s[2].label === 'Out for delivery', 'a delivery that is ready is "Out for delivery"');
check(steps('ready', 'pickup', []).find((x) => x.key === 'ready').label === 'Ready for pickup' && steps('completed', 'pickup', []).at(-1).label === 'Picked up', 'a pickup order says "Ready for pickup" and "Picked up"');
s = steps('completed', 'delivery', [['placed', 'a'], ['confirmed', 'b'], ['ready', 'c'], ['completed', 'd']]);
check(s.every((x) => x.state === 'done') && s[3].label === 'Delivered', 'delivered: every step is done');
s = steps('cancelled', 'delivery', [['placed', 'a'], ['confirmed', 'b'], ['cancelled', 'c']]);
check(s.map((x) => x.state).join() === 'done,done,todo,todo', 'a cancelled order shows the steps it reached and stops');
s = steps('cancelled', 'delivery', [['placed', 'a'], ['cancelled', 'b']]);
check(s.map((x) => x.state).join() === 'done,todo,todo,todo', '...also when it was cancelled at once');

section('6. The order screen: words, link and bill');
check(OT.headline({ status: 'placed', deliveryMethod: 'delivery' }).title === 'Order placed' && OT.headline({ status: 'ready', deliveryMethod: 'delivery' }).title === 'Out for delivery' && OT.headline({ status: 'completed', deliveryMethod: 'delivery' }).title === 'Delivered', 'the headline follows the order');
check(OT.headline({ status: 'ready', deliveryMethod: 'pickup' }).subtitle.includes('collect it from the shop'), 'a pickup order tells the person to collect it');
const c = OT.headline({ status: 'cancelled', deliveryMethod: 'delivery', cancelledBy: 'shop', cancelReason: 'Out of stock' });
check(c.title === 'Order cancelled' && c.subtitle === 'Cancelled by the shop: Out of stock' && OT.headline({ status: 'cancelled', deliveryMethod: 'pickup', cancelledBy: 'customer' }).subtitle === 'Cancelled by the customer.', 'a cancelled order says who cancelled it and why');
check(OT.mapsLink({ lat: 23.0301, lng: 72.5501 }) === 'https://www.google.com/maps?q=23.030100,72.550100', 'the map link opens the exact spot');
check(OT.pinOf(null) === null && OT.pinOf({}) === null && OT.pinOf({ lat: 'x', lng: 1 }) === null && OT.pinOf({ lat: 100, lng: 1 }) === null && OT.pinOf({ lat: 1, lng: 200 }) === null && OT.pinOf({ lat: NaN, lng: 1 }) === null && OT.pinOf({ lat: 0, lng: 0 })?.lat === 0, 'only a real place counts as a pin (0,0 is a place)');
const b = OT.bill({ items: [{ quantity: 2, unitPrice: 250 }, { quantity: 1, unitPrice: 99 }], subtotal: 599, deliveryFee: 40, total: 639, deliveryMethod: 'delivery' });
check(b.itemCount === 3 && b.itemsTotal === 599 && b.delivery === 40 && b.grandTotal === 639, 'the bill: item count, item total, delivery charge, grand total');
check(OT.bill({ items: [{ quantity: 1, unitPrice: 5 }], subtotal: 5, deliveryFee: 40, total: 5, deliveryMethod: 'pickup' }).delivery === 0, 'a pickup order has no delivery charge');
check(OT.itemsLabel(1) === '1 item' && OT.itemsLabel(3) === '3 items' && OT.itemsLabel(0) === '0 items', '"1 item", "3 items"');

section('7. The address form');
const form = { ...AB.emptyAddressForm(), fullName: 'Asha', phone: '9876543210', addressLine1: '12 MG Road', city: 'Pune', state: 'MH', pincode: '411001' };
check(form.lat === null && form.lng === null && AB.validateAddress(form) === null, 'a form without a pin is fine');
check(AB.validateAddress({ ...form, lat: 18.5, lng: 73.8 }) === null, 'a form with a proper pin is fine');
check(AB.validateAddress({ ...form, lat: 18.5, lng: null }) === 'The map pin is not a valid location.' && AB.validateAddress({ ...form, lat: 95, lng: 73 }) === 'The map pin is not a valid location.' && AB.validateAddress({ ...form, lat: NaN, lng: 1 }) !== null, 'half a pin, or one off the Earth, is caught before it is sent');
check(AB.roundPin(23.02251234567) === 23.022512 && AB.roundPin(-72.5) === -72.5, 'a pin is rounded to six decimals');
check(AB.addressToContact({ id: 'x', isDefault: false, label: '', fullName: 'A', phone: '9876543210', altPhone: '', addressLine1: 'x', addressLine2: '', landmark: '', city: 'c', state: 's', pincode: '123456', deliveryNotes: '', lat: 1.5, lng: 2.5 }).lat === 1.5, 'a chosen address hands its pin to the order');

console.log(`\n${passed} passed, ${failed} failed`);
await db.close?.();
process.exitCode = failed ? 1 : 0;
