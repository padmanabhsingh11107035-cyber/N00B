// Tests that the shopping cart is remembered (per account, on this device) and that damaged or hostile stored data can
// not break the shop. Pure logic (src/components/Store/cartStorage.ts): no database or browser needed.
//
// Usage: node scripts/supabase/test-cart.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const { loadCart, saveCart, cleanCart } = await import(pathToFileURL(path.resolve('src/components/Store/cartStorage.ts')).href);

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m }; };
const SEP = String.fromCharCode(1);
const line = (product, version) => (version ? `${product}${SEP}${version}` : product);

section('1. Leaving the shop and coming back');
let st = mem();
const cart = { [line('mug')]: 2, [line('tee', 'Colour=Red|Size=S')]: 1 };
saveCart('asha', cart, st);
check(JSON.stringify(loadCart('asha', st)) === JSON.stringify(cart), 'what was in the cart comes back exactly (products and chosen versions, with their quantities)');
saveCart('asha', { ...cart, [line('cap')]: 3 }, st);
check(Object.keys(loadCart('asha', st)).length === 3 && loadCart('asha', st)[line('cap')] === 3, 'adding more is remembered');
saveCart('asha', { [line('mug')]: 1 }, st);
check(JSON.stringify(loadCart('asha', st)) === JSON.stringify({ [line('mug')]: 1 }), 'removing items is remembered too');
saveCart('asha', {}, st);
check(Object.keys(loadCart('asha', st)).length === 0 && st.m.size === 0, 'an emptied cart (for example after placing an order) leaves nothing stored');

section('2. Each account has its own cart');
st = mem();
saveCart('asha', { [line('mug')]: 2 }, st);
saveCart('rohan', { [line('cap')]: 1 }, st);
check(loadCart('asha', st)[line('mug')] === 2 && loadCart('rohan', st)[line('cap')] === 1 && !loadCart('asha', st)[line('cap')], 'two accounts on one device never see each other\'s cart');
check(Object.keys(loadCart('nobody', st)).length === 0 && Object.keys(loadCart('', st)).length === 0, 'an account with no cart (or no account) gets an empty one');
saveCart('', { [line('mug')]: 1 }, st);
check(st.m.size === 2, 'nothing is ever saved without an account');

section('3. Damaged or hostile stored data can not break the shop');
st = mem();
st.setItem('noob_shop_cart_asha', 'not json{');
check(Object.keys(loadCart('asha', st)).length === 0, 'unreadable data gives an empty cart, not a crash');
for (const bad of ['null', '[]', '"text"', '42', '{"items":"x"}', '{"items":[1,2]}', '{}']) {
  st.setItem('noob_shop_cart_asha', bad);
  check(Object.keys(loadCart('asha', st)).length === 0, `stored ${bad} gives an empty cart`);
}
const cleaned = cleanCart({ good: 2, zero: 0, negative: -1, fraction: 1.5, text: '3', big: 5000, nan: NaN, inf: Infinity, nullish: null, [''] : 4 });
check(JSON.stringify(cleaned) === JSON.stringify({ good: 2, big: 100 }), 'only whole quantities from 1 to 100 are kept (5000 becomes 100; 0, negative, fractions, text and empty names are dropped)');
const many = {}; for (let i = 0; i < 80; i++) many['p' + i] = 1;
check(Object.keys(cleanCart(many)).length === 40, 'a cart never holds more than 40 lines (the most one order can have)');
check(Object.keys(cleanCart({ ['x'.repeat(401)]: 1, ok: 1 })).join() === 'ok', 'absurdly long names are dropped');
check(Object.keys(cleanCart(['a', 'b'])).length === 0 && Object.keys(cleanCart(null)).length === 0 && Object.keys(cleanCart('x')).length === 0, 'a list, nothing or text is not a cart');

section('4. Old carts and blocked storage');
st = mem();
const T = 1_000_000_000_000;
saveCart('asha', { [line('mug')]: 1 }, st, T);
check(loadCart('asha', st, T + 59 * 86400000)[line('mug')] === 1, 'a cart untouched for 59 days is still there');
check(Object.keys(loadCart('asha', st, T + 61 * 86400000)).length === 0, '...but one untouched for over 60 days is forgotten');
const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
let threw = false;
try { saveCart('asha', { [line('mug')]: 1 }, blocked); loadCart('asha', blocked); } catch { threw = true; }
check(!threw && Object.keys(loadCart('asha', blocked)).length === 0, 'a browser that blocks storage just gets no remembered cart, and no error');
check(Object.keys(loadCart('asha', null)).length === 0, 'no storage at all: empty cart');
const noRemove = { m: new Map(), getItem(k) { return this.m.get(k) ?? null; }, setItem(k, v) { this.m.set(k, v); } };
saveCart('asha', { [line('mug')]: 1 }, noRemove); saveCart('asha', {}, noRemove);
check(Object.keys(loadCart('asha', noRemove)).length === 0, 'emptying the cart works even on storage that can not delete');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
