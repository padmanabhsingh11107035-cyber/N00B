// Tests for supabase phase 7 (shop): product names, saved shop details, real orders (prices and stock always from the
// database, refusals, cancelling, the shop's side) — on a REAL Postgres (PGlite) holding the real backup, as real
// signed-in people including every way someone might overstep.
//
// Usage: node scripts/supabase/test-shop.mjs [backup-folder]
import fs from 'node:fs';
import path from 'node:path';
import { loadBackup, buildImportPlan } from './transform.mjs';
import { runImport } from './run-import.mjs';
import { createTestDb, makePgAdapter, asUser, asAnon } from './pg-test-env.mjs';

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
const [shopper, buyerA, buyerB, buyerC, staffShop, staffOther] = pool.slice(0, 6).map(idOf);
const call = (uid, sql, params = []) => asUser(db, uid, async () => (await db.query(sql, params)).rows);
const rpc = async (uid, fn, ...args) => (await call(uid, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args))[0].r;
const n = async (sql, params = []) => (await db.query(sql, params)).rows[0].n;
const media = [{ type: 'photo', url: 'products/a.jpg' }];
const mk = async (extra) => (await rpc(admin, 'create_store_product', { price: 100, description: 'A thing\nSecond line', media, ...extra })).product;
const shelf = async (id) => (await rpc(shopper, 'list_store_products')).find((p) => p.id === id);
const variantStock = async (id, key) => (await shelf(id)).variants.find((v) => v.key === key).stock;
const contact = { fullName: 'Asha Verma', phone: '+91 98765 43210' };
const address = { addressLine1: '12 MG Road', city: 'Pune', state: 'Maharashtra', pincode: '411001' };
const order = (uid, items, extra = {}) => rpc(uid, 'place_store_order', { items, deliveryMethod: 'pickup', contact, ...extra });

await rpc(admin, 'admin_set_permissions', staffShop, ['manage_store']);
await rpc(admin, 'admin_set_permissions', staffOther, ['suspend_accounts']);

section('1. Product names');
const named = await mk({ name: '  Man Hoodie  ', stock: 5 });
check(named.name === 'Man Hoodie' && named.title === 'Man Hoodie', 'a product has a name (spaces trimmed) and it is its title');
const unnamed = await mk({ stock: 5 });
check(unnamed.name === '' && unnamed.title === 'A thing', 'a product without a name uses the first line of its description as the title');
const legacy = (await db.query(`insert into store_products (price, description, media, in_stock) values (129, 'Old sticker sheet', '[{"type":"photo","url":"p.jpg"}]', true) returning id`)).rows[0].id;
check((await shelf(legacy)).title === 'Old sticker sheet' && (await shelf(legacy)).name === '', 'a product made before names existed shows a sensible title');
await expectFail(() => mk({ name: 'x'.repeat(81) }), /at most 80 characters/, 'a name longer than 80 characters is refused');
const renamed = (await rpc(admin, 'update_store_product', named.id, { name: 'Woman Hoodie', price: 100, description: 'd', media, stock: 5 })).product;
check(renamed.name === 'Woman Hoodie' && renamed.title === 'Woman Hoodie', 'the name can be edited');

section('2. Saved shop details (account details)');
check(JSON.stringify((await rpc(buyerA, 'get_shop_details')).details) === '{}', 'nothing is saved to begin with');
const saved = await rpc(buyerA, 'save_shop_details', { fullName: '  Asha Verma ', phone: '98765 43210', email: 'asha@example.com', ...address, landmark: 'Near the temple', deliveryNotes: 'Ring the bell twice\nAsk for Asha' });
check(saved.success && saved.details.fullName === 'Asha Verma' && saved.details.landmark === 'Near the temple' && saved.details.altPhone === '', 'details are saved, tidied, and missing ones are empty');
check((await rpc(buyerA, 'get_shop_details')).details.city === 'Pune', 'they can be read back');
check(JSON.stringify((await rpc(buyerB, 'get_shop_details')).details) === '{}', 'nobody else sees them');
check((await rpc(buyerA, 'save_shop_details', { fullName: 'Asha' })).details.city === '', 'saving again replaces them (a partly filled form is fine)');
await expectFail(() => rpc(buyerA, 'save_shop_details', { phone: '12' }), /valid phone number/, 'an invalid phone number is refused');
await expectFail(() => rpc(buyerA, 'save_shop_details', { altPhone: 'abc' }), /valid alternate phone/, '...and an invalid alternate number');
await expectFail(() => rpc(buyerA, 'save_shop_details', { email: 'not-an-email' }), /valid email/, '...an invalid email');
await expectFail(() => rpc(buyerA, 'save_shop_details', { pincode: '!!' }), /valid pincode/, '...an invalid pincode');
await expectFail(() => rpc(buyerA, 'save_shop_details', { fullName: 'x'.repeat(81) }), /Full name can be at most 80/, '...a very long name');
await expectFail(() => rpc(buyerA, 'save_shop_details', { deliveryNotes: 'x'.repeat(301) }), /Delivery notes can be at most 300/, '...very long notes');
await expectFail(() => asAnon(db, () => db.query('select public.get_shop_details()')), /permission denied/, 'a logged-out visitor can not use it');
await expectFail(() => call(buyerA, 'select * from shop_details'), /permission denied/, 'nobody can read the table directly');

section('3. Placing an order');
const plain = await mk({ name: 'Mug', price: 100, stock: 5 });
const tee = await mk({ name: 'Tee', price: 200, options: [{ name: 'Colour', values: ['Red', 'Blue'] }, { name: 'Size', values: ['S', 'M'] }], variants: [{ options: { Colour: 'Red', Size: 'S' }, stock: 3 }, { options: { Colour: 'Blue', Size: 'M' }, stock: 10 }] });
const loose = await mk({ name: 'Loose', price: 50, inStock: true });
const gone = await mk({ name: 'Gone', price: 50, inStock: false });
const RS = 'Colour=Red|Size=S', BM = 'Colour=Blue|Size=M', RM = 'Colour=Red|Size=M';
const r1 = await order(buyerA, [{ productId: plain.id, quantity: 2, unitPrice: 1 }, { productId: tee.id, variantKey: RS, quantity: 1, price: 1 }], { saveDetails: false });
const o1 = r1.order;
check(r1.success && o1.orderNo >= 1001 && o1.status === 'placed' && o1.deliveryMethod === 'pickup' && o1.paymentMethod === 'cash', 'an order is placed, with a number, "placed" and pay-at-pickup');
check(o1.subtotal === 400 && o1.total === 400 && o1.deliveryFee === 0, 'the total comes from the shop\'s prices (2 x 100 + 200), not from anything the app sent');
check(o1.items.length === 2 && o1.items[0].name === 'Mug' && o1.items[1].variantLabel === 'Red / S' && o1.items[1].unitPrice === 200 && o1.items[1].image === 'products/a.jpg', 'each item keeps its name, chosen version, price and picture as they were');
check(o1.contact.fullName === 'Asha Verma' && o1.contact.phone === '+91 98765 43210', 'the contact details are kept with the order');
check((await shelf(plain.id)).stock === 3 && (await variantStock(tee.id, RS)) === 2, 'the stock came off the shelf (5 -> 3 and Red/S 3 -> 2)');
check(JSON.stringify((await rpc(buyerA, 'get_shop_details')).details.city) === '""', 'details are NOT saved unless asked');
check((await n(`select count(*)::int n from notifications where target_user_id = $1 and type = 'store_order'`, [admin])) === 1, 'the shop owner is notified of the new order');

await db.query('update app_settings set store_delivery_fee = 40 where id = 1');
const d1 = (await order(buyerB, [{ productId: loose.id, quantity: 3 }], { deliveryMethod: 'delivery', contact: { ...contact, ...address }, saveDetails: true })).order;
check(d1.subtotal === 150 && d1.deliveryFee === 40 && d1.total === 190 && d1.deliveryMethod === 'delivery', 'delivery adds the shop\'s delivery charge (150 + 40)');
check((await rpc(buyerB, 'get_shop_details')).details.city === 'Pune', '"save my details" stores them for next time');
check((await shelf(loose.id)).stock === null && (await shelf(loose.id)).inStock === true, 'an uncounted product stays uncounted');
await expectFail(() => order(buyerB, [{ productId: loose.id, quantity: 1 }], { deliveryMethod: 'delivery' }), /delivery address/, 'delivery without an address is refused');
await expectFail(() => order(buyerB, [{ productId: loose.id, quantity: 1 }], { deliveryMethod: 'delivery', contact: { ...contact, addressLine1: '12 MG Road' } }), /Enter your city/, '...or without a city');
await expectFail(() => order(buyerB, [{ productId: loose.id, quantity: 1 }], { contact: { phone: '9876543210' } }), /full name/, 'no name is refused');
await expectFail(() => order(buyerB, [{ productId: loose.id, quantity: 1 }], { contact: { fullName: 'Asha' } }), /phone number/, 'no phone is refused');
await expectFail(() => order(buyerB, [{ productId: loose.id, quantity: 1 }], { deliveryMethod: 'courier' }), /pickup or delivery/, 'an unknown delivery method is refused');

section('3b. What is refused, and nothing changes when it is');
const before = { mug: (await shelf(plain.id)).stock, rs: await variantStock(tee.id, RS), orders: await n('select count(*)::int n from store_orders') };
await expectFail(() => order(buyerA, [{ productId: plain.id, quantity: 4 }]), /Only 3 left of "Mug"/, 'asking for more than is left says how many are left');
await expectFail(() => order(buyerA, [{ productId: tee.id, variantKey: RS, quantity: 3 }]), /Only 2 left of "Tee" \(Red \/ S\)/, '...naming the version');
await expectFail(() => order(buyerA, [{ productId: tee.id, variantKey: RM, quantity: 1 }]), /"Tee" \(Red \/ M\) is out of stock/, 'a version at 0 is out of stock');
await expectFail(() => order(buyerA, [{ productId: tee.id, quantity: 1 }]), /Choose an option for "Tee"/, 'a product with versions needs one chosen');
await expectFail(() => order(buyerA, [{ productId: tee.id, variantKey: 'Colour=Green|Size=S', quantity: 1 }]), /option of "Tee" is no longer available/, 'a version that does not exist is refused');
await expectFail(() => order(buyerA, [{ productId: plain.id, variantKey: 'x', quantity: 1 }]), /no longer available/, 'a version for a product that has none is refused');
await expectFail(() => order(buyerA, [{ productId: gone.id, quantity: 1 }]), /"Gone" is out of stock/, 'a product marked out of stock is refused');
await expectFail(() => order(buyerA, [{ productId: '00000000-0000-0000-0000-000000000009', quantity: 1 }]), /no longer available/, 'a product that does not exist is refused');
await expectFail(() => order(buyerA, [{ productId: plain.id, quantity: 1 }, { productId: gone.id, quantity: 1 }]), /"Gone" is out of stock/, 'one bad line refuses the whole order');
check((await shelf(plain.id)).stock === before.mug && await variantStock(tee.id, RS) === before.rs && await n('select count(*)::int n from store_orders') === before.orders, '...and nothing was taken off the shelf or saved');
for (const bad of [0, 101, -1, 'abc', 1.5, null]) await expectFail(() => order(buyerA, [{ productId: plain.id, quantity: bad }]), /not valid/, `a quantity of ${JSON.stringify(bad)} is refused`);
await expectFail(() => order(buyerA, [{ productId: 'nope', quantity: 1 }]), /not valid/, 'a product id that is not an id is refused');
await expectFail(() => order(buyerA, []), /cart is empty/, 'an empty cart is refused');
await expectFail(() => rpc(buyerA, 'place_store_order', { deliveryMethod: 'pickup', contact }), /cart is empty/, '...and a missing cart');
await expectFail(() => order(buyerA, Array.from({ length: 41 }, () => ({ productId: plain.id, quantity: 1 }))), /Too many items/, 'more than 40 lines is refused');
await expectFail(() => order(buyerA, [{ productId: plain.id, quantity: 1 }], { note: 'x'.repeat(301) }), /at most 300/, 'a very long note is refused');
const dup = (await order(buyerC, [{ productId: plain.id, quantity: 1 }, { productId: plain.id, quantity: 1 }])).order;
check(dup.items.length === 1 && dup.items[0].quantity === 2 && (await shelf(plain.id)).stock === 1, 'the same product twice is one line of 2');
await expectFail(() => order(buyerC, [{ productId: plain.id, quantity: 2 }]), /Only 1 left/, 'the last unit can only be bought once');
check((await order(buyerC, [{ productId: plain.id, quantity: 1 }])).order.items[0].quantity === 1 && (await shelf(plain.id)).stock === 0 && (await shelf(plain.id)).inStock === false, 'buying the last one makes it Out of Stock');
await expectFail(() => order(buyerA, [{ productId: plain.id, quantity: 1 }]), /"Mug" is out of stock/, '...and a later buyer is told so');

await db.query('update app_settings set store_enabled = false where id = 1');
await expectFail(() => order(buyerA, [{ productId: loose.id, quantity: 1 }]), /paused by NOOB/, 'when the shop switch is off, ordering is paused');
await db.query('update app_settings set store_enabled = true where id = 1');
await db.query('update profiles set is_suspended = true where id = $1', [buyerC]);
await expectFail(() => order(buyerC, [{ productId: loose.id, quantity: 1 }]), /Unauthorized/, 'a suspended account can not order');
await db.query('update profiles set is_suspended = false where id = $1', [buyerC]);
await expectFail(() => asAnon(db, () => db.query(`select public.place_store_order('{}')`)), /permission denied/, 'a logged-out visitor can not order');
await expectFail(() => call(buyerA, `insert into store_orders (delivery_method, subtotal, total) values ('pickup', 0, 0)`), /permission denied/, 'nobody can write orders directly');
await expectFail(() => call(buyerA, `update store_products set stock = 999 where id = $1`, [loose.id]), /permission denied/, '...or change stock directly');

section('3c. Open-order limit');
const spam = await mk({ name: 'Spam', price: 10, stock: 50 });
for (let i = 0; i < 5; i++) await order(shopper, [{ productId: spam.id, quantity: 1 }]);
await expectFail(() => order(shopper, [{ productId: spam.id, quantity: 1 }]), /already have 5 open orders/, 'nobody can hold more than 5 open orders (no hoarding the shelf)');
check((await shelf(spam.id)).stock === 45, '(and the refused one took nothing)');
const shopperOrders = (await rpc(shopper, 'my_store_orders')).orders;
check(shopperOrders.length === 5 && shopperOrders.every((o) => o.status === 'placed'), 'my orders lists my five');
await rpc(shopper, 'cancel_my_store_order', shopperOrders[0].id);
check((await order(shopper, [{ productId: spam.id, quantity: 1 }])).success, 'cancelling one makes room for another');

section('4. Seeing and cancelling my orders');
const mine = (await rpc(buyerA, 'my_store_orders')).orders;
check(mine.length === 1 && mine[0].id === o1.id && mine[0].items.length === 2, 'I see only my own orders');
check((await rpc(buyerB, 'my_store_orders')).orders.every((o) => o.id !== o1.id), 'and other people do not see mine');
await expectFail(() => rpc(buyerB, 'cancel_my_store_order', o1.id), /Order not found/, 'nobody can cancel someone else\'s order');
const c1 = (await rpc(buyerA, 'cancel_my_store_order', o1.id)).order;
check(c1.status === 'cancelled' && c1.cancelledBy === 'customer' && c1.statusHistory.length === 2, 'I can cancel an order the shop has not confirmed yet');
check((await shelf(plain.id)).stock === 2 && (await variantStock(tee.id, RS)) === 3, 'cancelling puts the stock back (2 Mugs and the Red/S)');
check((await rpc(buyerA, 'cancel_my_store_order', o1.id)).order.status === 'cancelled' && (await variantStock(tee.id, RS)) === 3 && (await shelf(plain.id)).stock === 2, 'cancelling twice does not put it back twice');
check((await n(`select count(*)::int n from notifications where target_user_id = $1 and type = 'store_order' and message = $2`, [admin, `cancelled order #${o1.orderNo}.`])) === 1, 'the shop owner is told about the cancellation');

section('5. The shop\'s side');
const t1 = (await order(buyerA, [{ productId: tee.id, variantKey: BM, quantity: 2 }], { deliveryMethod: 'delivery', contact: { ...contact, ...address } })).order;
const t2 = (await order(buyerB, [{ productId: tee.id, variantKey: BM, quantity: 1 }])).order;
for (const [who, uid] of [['an ordinary member', buyerA], ['a delegate without the shop permission', staffOther]]) {
  await expectFail(() => rpc(uid, 'admin_store_orders'), /Only the NOOB admin account can see shop orders/, `${who} can not see the shop's orders`);
  await expectFail(() => rpc(uid, 'admin_set_store_order_status', t1.id, 'confirmed'), /Only the NOOB admin account can manage shop orders/, `${who} can not change an order`);
}
await expectFail(() => asAnon(db, () => db.query(`select public.admin_store_orders()`)), /permission denied/, 'a logged-out visitor can not see them either');
const all = await rpc(admin, 'admin_store_orders');
check(all.success && all.orders.length >= 3 && all.orders.some((o) => o.id === t1.id && o.customer.id === buyerA && o.contact.fullName === 'Asha Verma' && o.contact.addressLine1 === '12 MG Road'), 'the shop owner sees every order with the customer and their contact details');
check(all.openCount === all.orders.filter((o) => ['placed', 'confirmed', 'ready'].includes(o.status)).length, 'and how many are still open');
check((await rpc(admin, 'admin_store_orders', 'cancelled')).orders.every((o) => o.status === 'cancelled') && (await rpc(staffShop, 'admin_store_orders', 'placed')).orders.length > 0, 'they can be filtered by status, and a delegate with the shop permission sees them too');
await expectFail(() => rpc(admin, 'admin_set_store_order_status', t1.id, 'completed'), /"placed" can not be changed to "completed"/, 'an order can not skip steps');
await expectFail(() => rpc(admin, 'admin_set_store_order_status', t1.id, 'banana'), /can not be changed/, 'or take an unknown status');
await expectFail(() => rpc(admin, 'admin_set_store_order_status', '00000000-0000-0000-0000-000000000009', 'confirmed'), /Order not found/, 'or be one that does not exist');
const s1 = (await rpc(staffShop, 'admin_set_store_order_status', t1.id, 'confirmed')).order;
check(s1.status === 'confirmed' && s1.statusHistory.length === 2 && s1.statusHistory[1].by === 'shop', 'the shop confirms an order');
const notes = async (uid) => (await db.query(`select message from notifications where target_user_id = $1 and type = 'store_order' order by created_at desc, id desc`, [uid])).rows.map((r) => r.message);
check((await notes(buyerA))[0] === `Your order #${t1.orderNo} was confirmed.`, 'and the customer is notified');
await expectFail(() => rpc(buyerA, 'cancel_my_store_order', t1.id), /already confirmed this order/, 'once confirmed, the customer can no longer cancel it');
await rpc(admin, 'admin_set_store_order_status', t1.id, 'ready');
check((await notes(buyerA))[0] === `Your order #${t1.orderNo} is out for delivery.`, 'a delivery order that is "ready" says it is out for delivery');
await rpc(admin, 'admin_set_store_order_status', t2.id, 'confirmed');
await rpc(admin, 'admin_set_store_order_status', t2.id, 'ready');
check((await notes(buyerB))[0] === `Your order #${t2.orderNo} is ready for pickup.`, '...and a pickup order says it is ready for pickup');
await rpc(admin, 'admin_set_store_order_status', t1.id, 'completed');
check((await notes(buyerA))[0].includes('is complete'), 'completing tells the customer thank you');
await expectFail(() => rpc(admin, 'admin_set_store_order_status', t1.id, 'cancelled'), /"completed" can not be changed to "cancelled"/, 'a completed order can not be cancelled');
const stockBefore = await variantStock(tee.id, BM);
const x2 = (await rpc(admin, 'admin_set_store_order_status', t2.id, 'cancelled', '  Out of the colour you wanted  ')).order;
check(x2.status === 'cancelled' && x2.cancelledBy === 'shop' && x2.cancelReason === 'Out of the colour you wanted', 'the shop can cancel an order that is not completed, with a reason');
check((await variantStock(tee.id, BM)) === stockBefore + 1 && (await notes(buyerB))[0].includes('cancelled by the shop') && (await notes(buyerB))[0].includes('Out of the colour you wanted'), 'the stock goes back and the customer is told why');
await expectFail(() => rpc(admin, 'admin_set_store_order_status', t2.id, 'confirmed'), /"cancelled" can not be changed/, 'a cancelled order stays cancelled');
await expectFail(() => rpc(admin, 'admin_set_store_order_status', t1.id, 'cancelled', 'x'.repeat(201)), /at most 200/, 'a very long reason is refused');
const log = (await rpc(admin, 'admin_audit_log', 200)).entries;
check(log.some((e) => e.action === 'order_confirmed') && log.some((e) => e.action === 'order_completed') && log.some((e) => e.action === 'order_cancelled'), 'every change is written to the admin activity log');

section('6. Removing a product keeps the orders');
const kept = (await order(buyerC, [{ productId: loose.id, quantity: 1 }])).order;
await rpc(admin, 'delete_store_product', loose.id);
const after = (await rpc(buyerC, 'my_store_orders')).orders.find((o) => o.id === kept.id);
check(after && after.items[0].name === 'Loose' && after.items[0].unitPrice === 50 && after.items[0].productId === null, 'an order still shows what was bought after the product is removed');
check((await rpc(buyerC, 'cancel_my_store_order', kept.id)).order.status === 'cancelled', '...and can still be cancelled (nothing to put back)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
