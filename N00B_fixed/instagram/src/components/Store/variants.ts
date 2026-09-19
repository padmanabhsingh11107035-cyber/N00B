// Shop helpers for product versions (colour / size / model ...) and stock. Pure functions, no screens.
// The database is the authority: it rebuilds every combination itself and refuses bad input. These helpers build the
// SAME keys ("Colour=Red|Size=S") so what the screens show, and what goes into the cart, always matches what is stored.
import type { StoreProduct, StoreProductOption, StoreProductVariant } from '../../types';

export const MAX_OPTION_TYPES = 3;
export const MAX_OPTIONS_PER_TYPE = 20;
export const MAX_VERSIONS = 200;
export const MAX_STOCK = 1_000_000;
export const LOW_STOCK_AT = 5;

// ---- keys

export const variantKeyFor = (options: StoreProductOption[], selected: Record<string, string>): string =>
  options.map((o) => `${o.name}=${selected[o.name] ?? ''}`).join('|');

// Every combination of the given option types, in the same order the database uses.
export function allCombinations(options: Pick<StoreProductOption, 'name' | 'values'>[]): { key: string; options: Record<string, string> }[] {
  let combos: Record<string, string>[] = [{}];
  for (const o of options) {
    const next: Record<string, string>[] = [];
    for (const c of combos) for (const v of o.values) next.push({ ...c, [o.name]: v });
    combos = next;
  }
  if (options.length === 0) return [];
  return combos.map((c) => ({ key: variantKeyFor(options as StoreProductOption[], c), options: c }));
}

// How many versions these option types would make (without building them all).
export const versionCount = (options: Pick<StoreProductOption, 'values'>[]): number =>
  options.length === 0 ? 0 : options.reduce((n, o) => n * o.values.length, 1);

// ---- cart keys: a product, or one version of a product

const CART_SEP = '';
export const cartKey = (productId: string, variantKey?: string | null): string => (variantKey ? `${productId}${CART_SEP}${variantKey}` : productId);
export function splitCartKey(key: string): { productId: string; variantKey: string | null } {
  const i = key.indexOf(CART_SEP);
  return i < 0 ? { productId: key, variantKey: null } : { productId: key.slice(0, i), variantKey: key.slice(i + CART_SEP.length) };
}

// ---- stock

export const hasVariants = (p: Pick<StoreProduct, 'variants'>): boolean => (p.variants?.length ?? 0) > 0;
export const findVariant = (p: Pick<StoreProduct, 'variants'>, key?: string | null): StoreProductVariant | undefined =>
  key ? p.variants?.find((v) => v.key === key) : undefined;

// How many of this product (or this exact version) can be bought. null = not counted, so there is no limit.
export function availableStock(p: StoreProduct, variantKey?: string | null): number | null {
  if (hasVariants(p)) return findVariant(p, variantKey)?.stock ?? 0;
  return p.stock ?? null;
}

// Can it be bought right now?
export function isBuyable(p: StoreProduct, variantKey?: string | null): boolean {
  if (hasVariants(p)) return (findVariant(p, variantKey)?.stock ?? 0) > 0;
  return p.stock !== null && p.stock !== undefined ? p.stock > 0 : p.inStock;
}

// Total units across all versions (or the single count); null when not counted.
export function totalStock(p: StoreProduct): number | null {
  if (hasVariants(p)) return p.variants.reduce((n, v) => n + v.stock, 0);
  return p.stock ?? null;
}

// The short stock message shown to shoppers.
export function stockLabel(p: StoreProduct, variantKey?: string | null): { text: string; tone: 'ok' | 'low' | 'out' } {
  if (!isBuyable(p, variantKey)) return { text: 'Out of Stock', tone: 'out' };
  const n = availableStock(p, variantKey);
  if (n !== null && n <= LOW_STOCK_AT) return { text: `Only ${n} left`, tone: 'low' };
  return { text: 'In Stock', tone: 'ok' };
}

// "Red / Small" for a version key.
export function variantLabel(p: Pick<StoreProduct, 'variants' | 'options'>, key?: string | null): string {
  const v = findVariant(p, key);
  if (!v) return '';
  return p.options.map((o) => v.options[o.name]).filter(Boolean).join(' / ');
}

// The version to show first: the first one that is in stock (else the first one).
export function defaultSelection(p: Pick<StoreProduct, 'options' | 'variants'>): Record<string, string> {
  const v = p.variants.find((x) => x.stock > 0) || p.variants[0];
  if (v) return { ...v.options };
  return Object.fromEntries(p.options.map((o) => [o.name, o.values[0] ?? '']));
}

// Would choosing `value` for `optionName` (keeping the other choices) leave something in stock?
export function optionHasStock(p: Pick<StoreProduct, 'options' | 'variants'>, selected: Record<string, string>, optionName: string, value: string): boolean {
  return p.variants.some(
    (v) => v.stock > 0 && v.options[optionName] === value && p.options.every((o) => o.name === optionName || v.options[o.name] === selected[o.name])
  );
}
