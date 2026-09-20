// Shop shelf: search, sort (price low to high and back), price range, "in stock only" and option filters (colour, size...).
// Pure functions, no screens — so they can be tested on their own.
import type { StoreProduct } from '../../types';

export type SortKey = 'newest' | 'price-asc' | 'price-desc';

export interface ShopFilterState {
  search: string;
  sort: SortKey;
  minPrice: string;
  maxPrice: string;
  inStockOnly: boolean;
  // option name (lower case) -> the choices ticked for it (lower case)
  options: Record<string, string[]>;
}

export const emptyFilters: ShopFilterState = { search: '', sort: 'newest', minPrice: '', maxPrice: '', inStockOnly: false, options: {} };

export const SORT_LABELS: Record<SortKey, string> = {
  newest: 'Newest first',
  'price-asc': 'Price: Low to High',
  'price-desc': 'Price: High to Low'
};

const lc = (s: string) => s.trim().toLowerCase();

const parsePrice = (text: string): number | null => {
  const t = text.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// The filter groups to offer: every kind of option used by any product (products that call it "colour" and "Colour" share one group).
export function optionGroups(products: StoreProduct[]): { key: string; name: string; values: { key: string; label: string; count: number }[] }[] {
  const groups = new Map<string, { name: string; values: Map<string, { label: string; count: number }> }>();
  for (const p of products) {
    for (const o of p.options || []) {
      const gk = lc(o.name);
      if (!groups.has(gk)) groups.set(gk, { name: o.name, values: new Map() });
      const g = groups.get(gk)!;
      for (const v of o.values) {
        const vk = lc(v);
        const cur = g.values.get(vk);
        if (cur) cur.count++; else g.values.set(vk, { label: v, count: 1 });
      }
    }
  }
  return [...groups.entries()]
    .map(([key, g]) => ({
      key,
      name: g.name,
      values: [...g.values.entries()].map(([vk, v]) => ({ key: vk, label: v.label, count: v.count })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function matchesOption(p: StoreProduct, groupKey: string, picked: string[], inStockOnly: boolean): boolean {
  const o = (p.options || []).find((x) => lc(x.name) === groupKey);
  if (!o) return false;
  const hits = o.values.filter((v) => picked.includes(lc(v)));
  if (hits.length === 0) return false;
  if (inStockOnly && p.variants?.length) {
    return p.variants.some((v) => v.stock > 0 && picked.includes(lc(v.options[o.name] ?? '')));
  }
  return true;
}

export function applyShopFilters(products: StoreProduct[], f: ShopFilterState): StoreProduct[] {
  let lo = parsePrice(f.minPrice);
  let hi = parsePrice(f.maxPrice);
  if (lo !== null && hi !== null && lo > hi) [lo, hi] = [hi, lo];   // typed the wrong way round: just swap them
  const q = lc(f.search);
  const picks = Object.entries(f.options).filter(([, v]) => v.length > 0);

  const out = products.filter((p) => {
    if (q) {
      const hay = [p.title, p.name, p.description, ...(p.options || []).flatMap((o) => [o.name, ...o.values])].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (lo !== null && p.price < lo) return false;
    if (hi !== null && p.price > hi) return false;
    if (f.inStockOnly && !p.inStock) return false;
    for (const [gk, picked] of picks) if (!matchesOption(p, gk, picked, f.inStockOnly)) return false;
    return true;
  });

  const newest = (a: StoreProduct, b: StoreProduct) => (b.createdAt || '').localeCompare(a.createdAt || '');
  if (f.sort === 'price-asc') out.sort((a, b) => a.price - b.price || newest(a, b));
  else if (f.sort === 'price-desc') out.sort((a, b) => b.price - a.price || newest(a, b));
  else out.sort(newest);
  return out;
}

// How many filters are switched on (for the "Filters (2)" badge). Sorting by newest is the normal state, so it does not count.
export function activeFilterCount(f: ShopFilterState): number {
  return (f.search.trim() ? 1 : 0) + (f.sort !== 'newest' ? 1 : 0) + (parsePrice(f.minPrice) !== null ? 1 : 0) + (parsePrice(f.maxPrice) !== null ? 1 : 0)
    + (f.inStockOnly ? 1 : 0) + Object.values(f.options).reduce((n, v) => n + v.length, 0);
}
