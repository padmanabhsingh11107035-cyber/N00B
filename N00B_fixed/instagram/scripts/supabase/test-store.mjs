// Tests for supabase phase 6: shop inventory, product versions (colour / size / model ...), and editing products,
// on a REAL Postgres (PGlite) holding the real backup — as the main admin, a delegate and an ordinary member.
//
// Usage: node scripts/supabase/test-store.mjs [backup-folder]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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
const pool = raw.users.filter((u) => u.accountType !== 'private' && !u.isAdmin && (u.password || '').length > 0);
const admin = idOf(adminRaw), staff = idOf(pool[0]), member = idOf(pool[1]);
const call = (uid, sql, params = []) => asUser(db, uid, async () => (await db.query(sql, params)).rows);
const rpc = async (uid, fn, ...args) => (await call(uid, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args))[0].r;
const n = async (sql, params = []) => (await db.query(sql, params)).rows[0].n;
const media = [{ type: 'photo', url: 'products/a.jpg' }];
const base = { price: 499, description: '  A T-shirt  ', media };
const list = async () => rpc(member, 'list_store_products');

section('1. Products the old way still work');
const plain = (await rpc(admin, 'create_store_product', { ...base, inStock: true })).product;
check(plain.stock === null && plain.options.length === 0 && plain.variants.length === 0 && plain.inStock === true && plain.description === 'A T-shirt', 'a product with no stock number and no versions behaves exactly as before');
const off = (await rpc(admin, 'create_store_product', { ...base, inStock: false })).product;
check(off.inStock === false, 'the plain In-Stock switch still works');
// a product created BEFORE this feature existed (row written by the old function)
const legacy = (await db.query(`insert into store_products (price, description, media, in_stock) values (129, 'Old sticker sheet', '[{"type":"photo","url":"p.jpg"}]', false) returning id`)).rows[0].id;
const lp = (await list()).find((p) => p.id === legacy);
check(lp.inStock === false && lp.stock === null && lp.variants.length === 0 && lp.options.length === 0 && lp.updatedAt === null, 'a product from before this update is unchanged (still "out of stock", nothing tracked)');

section('2. Inventory (how many in stock)');
const tracked = (await rpc(admin, 'create_store_product', { ...base, stock: 7, inStock: false })).product;
check(tracked.stock === 7 && tracked.inStock === true, 'a stock number of 7 means In Stock (whatever the plain switch says)');
const zero = (await rpc(admin, 'create_store_product', { ...base, stock: 0, inStock: true })).product;
check(zero.stock === 0 && zero.inStock === false, 'a stock number of 0 means Out of Stock automatically');
for (const bad of [-1, 1000001, 2.5]) await expectFail(() => rpc(admin, 'create_store_product', { ...base, stock: bad }), /Stock must be a whole number/, `stock of ${bad} is refused`);
check((await rpc(admin, 'create_store_product', { ...base, stock: 'abc' })).product.stock === null, 'a stock value that is not a number is ignored (not tracked)');

section('3. Versions: colour, size, model...');
const vp = (await rpc(admin, 'create_store_product', {
  ...base, stock: 99,
  options: [{ name: ' Colour ', values: ['Red', 'Blue', ' red ', ''] }, { name: 'Size', values: ['S', 'M'] }],
  variants: [{ options: { Colour: 'Red', Size: 'S' }, stock: 5 }, { options: { Colour: 'Blue', Size: 'M' }, stock: '3' }, { options: { Colour: 'Green', Size: 'S' }, stock: 50 }]
})).product;
check(vp.options.length === 2 && vp.options[0].name === 'Colour' && vp.options[0].values.join() === 'Red,Blue', 'option types and options are tidied (spaces removed; "red" twice is kept once; empty ones dropped)');
check(vp.variants.length === 4 && vp.variants.map((v) => v.key).join() === 'Colour=Red|Size=S,Colour=Red|Size=M,Colour=Blue|Size=S,Colour=Blue|Size=M', 'the database builds EVERY combination itself (2 colours x 2 sizes = 4), in a stable order');
const vs = Object.fromEntries(vp.variants.map((v) => [v.key, v.stock]));
check(vs['Colour=Red|Size=S'] === 5 && vs['Colour=Blue|Size=M'] === 3 && vs['Colour=Red|Size=M'] === 0 && vs['Colour=Blue|Size=S'] === 0, 'each version keeps its own stock; ones left out get 0; text numbers are understood');
check(!JSON.stringify(vp.variants).includes('Green') && vp.stock === null, 'a version for a colour that does not exist is ignored, and the product-level stock is dropped when versions exist');
check(vp.inStock === true, 'the product is In Stock because some version has stock');
const allZero = (await rpc(admin, 'create_store_product', { ...base, options: [{ name: 'Size', values: ['S'] }], variants: [{ options: { Size: 'S' }, stock: 0 }], inStock: true })).product;
check(allZero.inStock === false, 'and Out of Stock when every version is at 0 (even if the plain switch was on)');
const triple = (await rpc(admin, 'create_store_product', { ...base, options: [{ name: 'Colour', values: ['R', 'B'] }, { name: 'Size', values: ['S', 'M', 'L'] }, { name: 'Model', values: ['Pro', 'Lite'] }] })).product;
check(triple.variants.length === 12 && triple.variants[0].options.Model === 'Pro', 'three option types (2 x 3 x 2) make 12 versions');
check((await list()).find((p) => p.id === vp.id).variants.length === 4, 'everyone signed in sees the versions in the shop list');
await expectFail(() => rpc(admin, 'create_store_product', { ...base, options: [{ name: 'A', values: ['1'] }, { name: 'B', values: ['1'] }, { name: 'C', values: ['1'] }, { name: 'D', values: ['1'] }] }), /at most 3 option types/, 'a fourth option type is refused');
await expectFail(() => rpc(admin, 'create_store_product', { ...base, options: [{ name: 'Colour', values: ['R'] }, { name: 'colour', values: ['B'] }] }), /both called "colour"/, 'two option types with the same name are refused');
await expectFail(() => rpc(admin, 'create_store_product', { ...base, options: [{ name: '  ', values: ['R'] }] }), /needs a name/, 'an option type without a name is refused');
await expectFail(() => rpc(admin, 'create_store_product', { ...base, options: [{ name: 'Colour', values: [' ', ''] }] }), /Add at least one option under "Colour"/, 'an option type with no options is refused');
await expectFail(() => rpc(admin, 'create_store_product', { ...base, options: [{ name: 'Colour', values: Array.from({ length: 21 }, (_, i) => 'c' + i) }] }), /at most 20 options/, 'more than 20 options in one type is refused');
await expectFail(() => rpc(admin, 'create_store_product', { ...base, options: [{ name: 'x'.repeat(31), values: ['a'] }] }), /at most 30 characters/, 'a very long option type name is refused');
await expectFail(() => rpc(admin, 'create_store_product', { ...base, options: [{ name: 'Colour', values: ['x'.repeat(31)] }] }), /at most 30 characters/, 'a very long option is refused');
const six = (n) => Array.from({ length: n }, (_, i) => 'v' + i);
await expectFail(() => rpc(admin, 'create_store_product', { ...base, options: [{ name: 'A', values: six(6) }, { name: 'B', values: six(6) }, { name: 'C', values: six(6) }] }), /makes 216 versions — the most a product can have is 200/, 'more than 200 versions is refused, with the number');
check((await rpc(admin, 'create_store_product', { ...base, options: [{ name: 'A', values: six(6) }, { name: 'B', values: six(6) }, { name: 'C', values: six(5) }] })).product.variants.length === 180, '(180 versions is fine)');

section('4. Editing a product');
const ed = await rpc(admin, 'update_store_product', vp.id, {
  price: 599, description: 'Now with more colours', media: [{ type: 'photo', url: 'products/b.jpg' }, { type: 'video', url: 'products/c.mp4' }],
  options: [{ name: 'Colour', values: ['Red', 'Blue', 'Green'] }, { name: 'Size', values: ['S', 'M'] }],
  variants: vp.variants.map((v) => (v.key === 'Colour=Red|Size=S' ? { ...v, stock: 8 } : v))
});
const ep = ed.product;
check(ed.success && ep.price === 599 && ep.description === 'Now with more colours' && ep.media.length === 2 && ep.updatedAt !== null && ep.id === vp.id && ep.createdAt === vp.createdAt, 'price, description and pictures are updated (creation date kept, "updated" stamped)');
check(ep.variants.length === 6 && ep.variants.find((v) => v.key === 'Colour=Red|Size=S').stock === 8 && ep.variants.find((v) => v.key === 'Colour=Blue|Size=M').stock === 3 && ep.variants.find((v) => v.key === 'Colour=Green|Size=S').stock === 0, 'adding a colour adds its versions (at 0); the versions you kept keep their stock; the stock you changed is saved');
const shrunk = (await rpc(admin, 'update_store_product', vp.id, { ...base, options: [{ name: 'Colour', values: ['Red'] }, { name: 'Size', values: ['S', 'M'] }], variants: ep.variants })).product;
check(shrunk.variants.length === 2 && shrunk.variants.find((v) => v.key === 'Colour=Red|Size=S').stock === 8, 'removing a colour removes its versions');
const toPlain = (await rpc(admin, 'update_store_product', vp.id, { ...base, stock: 12 })).product;
check(toPlain.options.length === 0 && toPlain.variants.length === 0 && toPlain.stock === 12 && toPlain.inStock === true, 'versions can be removed again, going back to a single stock number');
const untrack = (await rpc(admin, 'update_store_product', vp.id, { ...base, inStock: false })).product;
check(untrack.stock === null && untrack.inStock === false, '...or back to the plain In-Stock switch');
await expectFail(() => rpc(admin, 'update_store_product', vp.id, { ...base, price: 0 }), /Enter a valid price/, 'an edit is checked just like a new product (price)');
await expectFail(() => rpc(admin, 'update_store_product', vp.id, { ...base, media: [] }), /at least one photo or video/, '...pictures');
check((await n('select price::int n from store_products where id = $1', [vp.id])) === base.price, 'a refused edit changes nothing');
await expectFail(() => rpc(admin, 'update_store_product', '00000000-0000-0000-0000-000000000001', base), /Product not found/, 'editing a product that does not exist is refused');
const legacyEdit = (await rpc(admin, 'update_store_product', legacy, { price: 149, description: 'Old sticker sheet (edited)', media: [{ type: 'photo', url: 'p.jpg' }], stock: 25 })).product;
check(legacyEdit.price === 149 && legacyEdit.stock === 25 && legacyEdit.inStock === true, 'a product from before this update can be edited and given a stock count');

section('5. Who may do this');
await rpc(admin, 'admin_set_permissions', staff, ['suspend_accounts']);   // a delegate, but not for the shop
for (const [who, uid] of [['an ordinary member', member], ['a delegate without the store permission', staff]]) {
  await expectFail(() => rpc(uid, 'create_store_product', base), /Only the NOOB admin account can add products/, `${who} can not add products`);
  await expectFail(() => rpc(uid, 'update_store_product', plain.id, base), /Only the NOOB admin account can edit products/, `${who} can not edit products`);
  await expectFail(() => rpc(uid, 'delete_store_product', plain.id), /Only the NOOB admin account can manage products/, `${who} can not delete products`);
}
check((await n('select count(*)::int n from store_products where id = $1', [plain.id])) === 1, 'and the product is still there after those attempts');
await rpc(admin, 'admin_set_permissions', staff, ['manage_store']);
check((await rpc(staff, 'update_store_product', plain.id, { ...base, price: 555, stock: 3 })).product.price === 555, 'a delegate WITH the store permission can edit');
await rpc(admin, 'admin_set_permissions', staff, ['suspend_accounts']);
await expectFail(() => rpc(staff, 'update_store_product', plain.id, base), /Only the NOOB admin account can edit products/, 'and loses that the moment the permission is taken away');
await expectFail(() => asAnon(db, () => db.query('select public.update_store_product($1, $2)', [plain.id, base])), /permission denied/, 'a logged-out visitor can not edit');
await expectFail(() => call(member, `update store_products set price = 1 where id = $1`, [plain.id]), /permission denied/, 'nobody can edit the table directly');
await expectFail(() => call(member, `update store_products set stock = 1000000 where id = $1`, [plain.id]), /permission denied/, '...including the stock');
for (const fn of ['normalize_store_variants', 'clean_store_product']) {
  await expectFail(() => call(member, `select public.${fn}('{}'::jsonb${fn === 'normalize_store_variants' ? ", '[]'::jsonb" : ''})`), /permission denied/, `the internal helper ${fn}() is not callable from a browser`);
}
const log = (await rpc(admin, 'admin_audit_log', 200)).entries;
check(log.some((e) => e.action === 'product_updated' && e.actor !== null) && log.some((e) => e.action === 'product_added'), 'edits and additions are written to the admin activity log');

section('6. The shop screens agree with the database');
const V = await import(pathToFileURL(path.resolve('src/components/Store/variants.ts')).href);
const fresh = async (id) => (await list()).find((x) => x.id === id);
const t12 = await fresh(triple.id);
check(JSON.stringify(V.allCombinations(t12.options).map((c) => c.key)) === JSON.stringify(t12.variants.map((v) => v.key)), 'the screen builds every version key in exactly the same order as the database (2 x 3 x 2 = 12)');
check(t12.variants.every((v) => V.variantKeyFor(t12.options, v.options) === v.key), 'and the key for a chosen combination matches the stored one');
check(V.versionCount(t12.options) === 12 && V.versionCount([]) === 0 && V.versionCount([{ values: ['a', 'b'] }]) === 2, 'the version count matches');
check(V.allCombinations([]).length === 0, 'no options means no versions');
const odd = 'Colour=Red: dark|Size=S=M';
check(V.splitCartKey(V.cartKey('abc', odd)).variantKey === odd && V.splitCartKey(V.cartKey('abc', odd)).productId === 'abc', 'a cart key survives colons, equals signs and bars in option names');
check(V.splitCartKey(V.cartKey('abc')).variantKey === null && V.splitCartKey('abc').productId === 'abc', 'a plain product keeps its own id as the cart key');

const plainIn = await fresh((await rpc(admin, 'create_store_product', { ...base, inStock: true })).product.id), plainOut = await fresh(off.id), counted = await fresh(tracked.id), zeroed = await fresh(zero.id);
const lowP = (await rpc(admin, 'create_store_product', { ...base, stock: 3 })).product;
const bigV = (await rpc(admin, 'create_store_product', { ...base, options: [{ name: 'Colour', values: ['Red', 'Blue'] }, { name: 'Size', values: ['S', 'M'] }], variants: [{ options: { Colour: 'Red', Size: 'S' }, stock: 2 }, { options: { Colour: 'Blue', Size: 'M' }, stock: 40 }] })).product;
const bigP = await fresh(bigV.id), lowProduct = await fresh(lowP.id);
check(V.isBuyable(plainOut) === false && V.stockLabel(plainOut).text === 'Out of Stock', 'a product marked Out of Stock can not be bought');
check(V.availableStock(counted) === 7 && V.isBuyable(counted) && V.stockLabel(counted).text === 'In Stock', 'a counted product with 7 left is buyable, up to 7');
check(V.stockLabel(lowProduct).text === 'Only 3 left' && V.stockLabel(lowProduct).tone === 'low', 'with 5 or fewer left the shopper is told how many');
check(!V.isBuyable(zeroed) && V.stockLabel(zeroed).tone === 'out', 'a count of 0 is Out of Stock');
check(V.availableStock(plainIn) === null && V.isBuyable(plainIn) === true, 'an uncounted product has no limit');
const k = (c, sz) => V.variantKeyFor(bigP.options, { Colour: c, Size: sz });
check(V.availableStock(bigP, k('Red', 'S')) === 2 && V.availableStock(bigP, k('Blue', 'M')) === 40 && V.availableStock(bigP, k('Red', 'M')) === 0, 'each version has its own limit');
check(V.isBuyable(bigP, k('Red', 'S')) && !V.isBuyable(bigP, k('Red', 'M')) && !V.isBuyable(bigP, 'Colour=Green|Size=S') && !V.isBuyable(bigP, null), 'a version at 0, one that does not exist, or no choice made, can not be bought');
check(V.stockLabel(bigP, k('Red', 'S')).text === 'Only 2 left' && V.stockLabel(bigP, k('Blue', 'M')).text === 'In Stock' && V.stockLabel(bigP, k('Blue', 'S')).text === 'Out of Stock', 'the message follows the chosen version');
check(V.totalStock(bigP) === 42 && V.totalStock(counted) === 7 && V.totalStock(plainIn) === null, 'the total across versions is 42');
check(V.variantLabel(bigP, k('Red', 'S')) === 'Red / S' && V.variantLabel(bigP, 'nope') === '', 'a version is named "Red / S"');
const pre = V.defaultSelection(bigP);
check(pre.Colour === 'Red' && pre.Size === 'S' && Object.keys(pre).length === 2, 'the first version in stock is pre-selected');
const noneInStock = await fresh(allZero.id);
check(JSON.stringify(V.defaultSelection(noneInStock)) === JSON.stringify({ Size: 'S' }), '...or the first one when nothing is in stock');
check(V.optionHasStock(bigP, { Colour: 'Red', Size: 'S' }, 'Colour', 'Blue') === false && V.optionHasStock(bigP, { Colour: 'Red', Size: 'M' }, 'Colour', 'Blue') === true && V.optionHasStock(bigP, { Colour: 'Red', Size: 'S' }, 'Size', 'S') === true, 'a choice is shown as sold out when it would leave nothing in stock with the other choices kept');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
