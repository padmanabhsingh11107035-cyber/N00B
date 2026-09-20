// Tests the shop shelf's search, sort (price low to high and back), price range, in-stock and option filters.
// Pure logic (src/components/Store/filterLogic.ts): no database or screens needed.
//
// Usage: node scripts/supabase/test-shop-filters.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);

const F = await import(pathToFileURL(path.resolve('src/components/Store/filterLogic.ts')).href);
const { applyShopFilters, activeFilterCount, optionGroups, emptyFilters } = F;

const variant = (options, stock) => ({ key: Object.entries(options).map(([k, v]) => `${k}=${v}`).join('|'), options, stock });
const product = (id, title, price, extra = {}) => ({ id, name: title, title, price, description: `About ${title}`, media: [], inStock: true, stock: 10, options: [], variants: [], createdAt: '2026-01-01T00:00:00Z', ...extra });
const hoodie = product('hoodie', 'Man Hoodie', 1799, { createdAt: '2026-03-01T00:00:00Z', stock: null, options: [{ name: 'Colour', values: ['Blue', 'White'] }, { name: 'Size', values: ['M', 'L'] }],
  variants: [variant({ Colour: 'Blue', Size: 'M' }, 4), variant({ Colour: 'Blue', Size: 'L' }, 0), variant({ Colour: 'White', Size: 'M' }, 0), variant({ Colour: 'White', Size: 'L' }, 0)] });
const tee = product('tee', 'Plain Tee', 499, { createdAt: '2026-02-01T00:00:00Z', stock: null, options: [{ name: 'colour', values: ['Blue', 'Red'] }],
  variants: [variant({ colour: 'Blue', }, 7), variant({ colour: 'Red' }, 3)] });
const mug = product('mug', 'Steel Mug', 299, { createdAt: '2026-04-01T00:00:00Z', description: 'Keeps coffee hot for hours' });
const cap = product('cap', 'Old Cap', 299, { createdAt: '2026-01-15T00:00:00Z', inStock: false, stock: 0 });
const poster = product('poster', 'Poster', 0.5, { createdAt: '2026-05-01T00:00:00Z' });
const all = [hoodie, tee, mug, cap, poster];
const ids = (list) => list.map((p) => p.id).join(',');
const run = (patch) => applyShopFilters(all, { ...emptyFilters, ...patch });

section('1. Sorting');
check(ids(run({})) === 'poster,mug,hoodie,tee,cap', 'newest first is the default');
check(ids(run({ sort: 'price-asc' })) === 'poster,mug,cap,tee,hoodie', 'price low to high (same price: newest first)');
check(ids(run({ sort: 'price-desc' })) === 'hoodie,tee,mug,cap,poster', 'price high to low (same price: newest first)');
check(ids(all) === 'hoodie,tee,mug,cap,poster', 'sorting never changes the list it was given');

section('2. Price range');
check(ids(run({ minPrice: '300' })) === 'hoodie,tee', 'a lowest price hides anything cheaper');
check(ids(run({ maxPrice: '499' })) === 'poster,mug,tee,cap', 'a highest price hides anything dearer (and includes that exact price)');
check(ids(run({ minPrice: '299', maxPrice: '499', sort: 'price-asc' })) === 'mug,cap,tee', 'both together give a range, with both ends included');
check(ids(run({ minPrice: '499', maxPrice: '299', sort: 'price-asc' })) === 'mug,cap,tee', 'typed the wrong way round: the two numbers are swapped');
check(run({ minPrice: '5000' }).length === 0, 'a range with nothing in it gives an empty shelf');
check(ids(run({ maxPrice: '0.5' })) === 'poster', 'decimal prices work');
check(ids(run({ minPrice: '', maxPrice: '  ' })) === ids(run({})), 'empty boxes mean no limit');
check(ids(run({ minPrice: 'abc', maxPrice: '-5' })) === ids(run({})), 'nonsense or negative numbers are ignored, not crashing');

section('3. Search');
check(ids(run({ search: 'hoodie' })) === 'hoodie', 'finds by name');
check(ids(run({ search: '  MUG ' })) === 'mug', 'ignores capital letters and spaces around');
check(ids(run({ search: 'coffee' })) === 'mug', 'also looks in the description');
check(ids(run({ search: 'red' })) === 'tee', 'also looks in the option choices');
check(ids(run({ search: 'colour' })) === 'hoodie,tee', 'also looks in the option names');
check(run({ search: 'zzz' }).length === 0, 'no match gives an empty shelf');

section('4. In stock only');
check(ids(run({ inStockOnly: true })) === 'poster,mug,hoodie,tee', 'hides sold-out products');
check(ids(run({ inStockOnly: false })).includes('cap'), '...but shows them when the box is off');

section('5. Colour, size and other options');
const groups = optionGroups(all);
check(groups.map((g) => g.name).join(',') === 'Colour,Size', 'the filter groups are the option kinds the products use');
check(groups.length === 2 && groups.find((g) => g.key === 'colour').values.map((v) => v.label).join(',') === 'Blue,Red,White', '"Colour" and "colour" are one group with all the choices, in order');
check(groups.find((g) => g.key === 'colour').values.find((v) => v.key === 'blue').count === 2, 'each choice says how many products have it');
check(ids(run({ options: { colour: ['blue'] } })) === 'hoodie,tee', 'ticking Blue shows products that come in Blue');
check(ids(run({ options: { colour: ['red'] } })) === 'tee', 'ticking Red shows only the tee');
check(ids(run({ options: { colour: ['red', 'white'] } })) === 'hoodie,tee', 'ticking two choices shows products with either one');
check(ids(run({ options: { colour: ['blue'], size: ['l'] } })) === 'hoodie', 'ticking Blue and Large needs products with both kinds of choice');
check(run({ options: { size: ['m'], colour: ['red'] } }).length === 0, 'no product has both: empty shelf');
check(ids(run({ options: { colour: [] } })) === ids(run({})), 'a group with nothing ticked does not filter');
check(ids(run({ options: { colour: ['blue'] }, inStockOnly: true })) === 'hoodie,tee', 'Blue + in stock: the hoodie counts because Blue/M is in stock');
check(ids(run({ options: { colour: ['white'] }, inStockOnly: true })) === '', 'White + in stock: the hoodie is out of stock in White, so it is hidden');
check(ids(run({ options: { colour: ['white'] } })) === 'hoodie', '...but White alone still finds it');
check(ids(run({ options: { size: ['l'] }, inStockOnly: true })) === '', 'Large + in stock: every Large is sold out');

section('6. Everything together');
check(ids(run({ options: { colour: ['blue'] }, minPrice: '1000', sort: 'price-desc', inStockOnly: true })) === 'hoodie', 'colour + price + in stock + sort');
check(ids(run({ search: 'blue', maxPrice: '600', sort: 'price-asc' })) === 'tee', 'search + price');

section('7. The "Filters (n)" counter');
check(activeFilterCount(emptyFilters) === 0, 'nothing on: 0');
check(activeFilterCount({ ...emptyFilters, sort: 'price-asc' }) === 1, 'a sort counts as one');
check(activeFilterCount({ ...emptyFilters, minPrice: '100', maxPrice: '900' }) === 2, 'each price box counts');
check(activeFilterCount({ ...emptyFilters, minPrice: 'abc' }) === 0, 'a nonsense price does not count');
check(activeFilterCount({ ...emptyFilters, search: ' ', inStockOnly: true, options: { colour: ['blue', 'red'], size: [] } }) === 3, 'search (blank does not count), in stock, and each ticked choice');
check(activeFilterCount({ ...emptyFilters, search: 'x', sort: 'price-desc', minPrice: '1', maxPrice: '2', inStockOnly: true, options: { colour: ['blue'] } }) === 6, 'the badge adds them all up');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
