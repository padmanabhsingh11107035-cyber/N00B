// The shopping cart is remembered on this device, separately for every account, so it is still there when you leave the
// shop and come back (or close the app and open it again).
//
// What is stored is only "which product / version -> how many". Prices and stock always come from the database when the
// shop opens, and anything that is gone or no longer in stock is dropped then (see StorePage). Pure functions over a
// storage object, so they can be tested without a browser.

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export type CartMap = Record<string, number>;

const PREFIX = 'noob_shop_cart_';
const MAX_LINES = 40; // the same limit the database applies to one order
const MAX_QTY = 100;
const MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000; // a cart untouched for 60 days is forgotten

const browserStorage = (): StorageLike | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null; // storage blocked (private mode...)
  }
};

const keyFor = (userId: string) => `${PREFIX}${userId}`;

// Keep only well-formed lines: text keys, whole quantities from 1 to 100, at most 40 lines.
export function cleanCart(raw: unknown): CartMap {
  const out: CartMap = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, qty] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_LINES) break;
    if (typeof key !== 'string' || key.length === 0 || key.length > 400) continue;
    const n = typeof qty === 'number' ? qty : NaN;
    if (!Number.isInteger(n) || n < 1) continue;
    out[key] = Math.min(n, MAX_QTY);
  }
  return out;
}

export function loadCart(userId: string, storage: StorageLike | null = browserStorage(), now: number = Date.now()): CartMap {
  if (!userId || !storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(keyFor(userId)) || 'null');
    if (!parsed || typeof parsed !== 'object') return {};
    if (typeof parsed.savedAt === 'number' && now - parsed.savedAt > MAX_AGE_MS) return {};
    return cleanCart(parsed.items);
  } catch {
    return {};
  }
}

// An empty cart removes the entry instead of storing "{}".
export function saveCart(userId: string, cart: CartMap, storage: StorageLike | null = browserStorage(), now: number = Date.now()): void {
  if (!userId || !storage) return;
  try {
    const items = cleanCart(cart);
    if (Object.keys(items).length === 0) {
      if (storage.removeItem) storage.removeItem(keyFor(userId));
      else storage.setItem(keyFor(userId), JSON.stringify({ v: 1, items: {}, savedAt: now }));
      return;
    }
    storage.setItem(keyFor(userId), JSON.stringify({ v: 1, items, savedAt: now }));
  } catch {
    // a full or blocked storage must never break the shop
  }
}
