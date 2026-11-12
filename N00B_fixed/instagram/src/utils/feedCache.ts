// The last Home feed and story tray, kept on this phone so the next start can show them at once while the fresh ones load (stale-while-revalidate).
//
// Rules (all tested in scripts/supabase/test-feed-cache.mjs):
//  - one snapshot per account (keyed by user id); reading another account's snapshot never returns anything
//  - a snapshot older than 24 hours, written by another version of this code, or corrupt is ignored (and removed)
//  - at most 30 posts and 20 stories are kept; stories already expired are dropped when read
//  - posts/stories of people the reader has since blocked are dropped when read
//  - everything is cleared on log out; only the current account's snapshot is kept when a new one is written
//  - IndexedDB is used when the browser has it; otherwise (or if it throws) a plain in-memory copy is used. Nothing here can throw to the caller.
// Nothing stored is "truth": the app always replaces it with what the server sends, and every like/comment/follow still goes to the server by id.

export const FEED_CACHE_VERSION = 1;
export const FEED_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const FEED_CACHE_MAX_POSTS = 30;
export const FEED_CACHE_MAX_STORIES = 20;
/** A snapshot bigger than this (as text) is shortened, never stored whole: a few inline pictures must not fill the phone. */
export const FEED_CACHE_MAX_CHARS = 2_000_000;

export interface FeedSnapshot<P = unknown, S = unknown> {
  v: number;
  userId: string;
  savedAt: number;
  posts: P[];
  stories: S[];
}

/** The tiny key-value store the cache sits on (IndexedDB in the app, a Map in tests and as the fallback). Values are strings. */
export interface KeyValueStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

const PREFIX = 'feed:';

export function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return {
    get: async (k) => m.get(k),
    set: async (k, v) => { m.set(k, v); },
    delete: async (k) => { m.delete(k); },
    keys: async () => [...m.keys()]
  };
}

/** IndexedDB-backed store; any failure rejects, and the cache then falls back to memory. */
export function indexedDbStore(dbName = 'noob-feed-cache'): KeyValueStore {
  let opened: Promise<IDBDatabase> | null = null;
  const open = () => {
    if (!opened) {
      opened = new Promise<IDBDatabase>((resolve, reject) => {
        try {
          const req = indexedDB.open(dbName, 1);
          req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv'); };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
          req.onblocked = () => reject(new Error('IndexedDB blocked'));
        } catch (e) { reject(e); }
      });
      opened.catch(() => { opened = null; });
    }
    return opened;
  };
  const run = async <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      try {
        const req = fn(db.transaction('kv', mode).objectStore('kv'));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
      } catch (e) { reject(e); }
    });
  };
  return {
    get: async (k) => { const v = await run('readonly', (s) => s.get(k)); return typeof v === 'string' ? v : undefined; },
    set: async (k, v) => { await run('readwrite', (s) => s.put(v, k)); },
    delete: async (k) => { await run('readwrite', (s) => s.delete(k)); },
    keys: async () => (await run('readonly', (s) => s.getAllKeys())).map(String)
  };
}

interface HasAuthor { userId?: string; expiresAt?: string }

/** Drop anything whose author is blocked by the reader. */
export function dropBlocked<T extends HasAuthor>(items: T[], blockedIds: Iterable<string> | undefined): T[] {
  const blocked = new Set(blockedIds || []);
  if (!blocked.size) return items;
  return items.filter((x) => !(x && x.userId && blocked.has(x.userId)));
}

/** Drop stories whose time is up. */
export function dropExpired<T extends HasAuthor>(items: T[], now: number): T[] {
  return items.filter((x) => {
    if (!x || !x.expiresAt) return true;
    const t = Date.parse(x.expiresAt);
    return !Number.isFinite(t) || t > now;
  });
}

/** What may be stored: at most the limits, plain objects only. */
export function trim<P, S>(posts: P[], stories: S[]): { posts: P[]; stories: S[] } {
  return {
    posts: (Array.isArray(posts) ? posts : []).filter((p) => p && typeof p === 'object').slice(0, FEED_CACHE_MAX_POSTS),
    stories: (Array.isArray(stories) ? stories : []).filter((s) => s && typeof s === 'object').slice(0, FEED_CACHE_MAX_STORIES)
  };
}

/** Text to store for a snapshot, shortened (stories first, then posts) until it fits. Empty string when nothing can be stored. */
export function serialize<P, S>(userId: string, posts: P[], stories: S[], now: number): string {
  let { posts: p, stories: s } = trim(posts, stories);
  for (let guard = 0; guard < 12; guard++) {
    let text = '';
    try { text = JSON.stringify({ v: FEED_CACHE_VERSION, userId, savedAt: now, posts: p, stories: s } satisfies FeedSnapshot<P, S>); } catch { return ''; }
    if (text.length <= FEED_CACHE_MAX_CHARS) return text;
    if (s.length > 5) s = s.slice(0, Math.ceil(s.length / 2));
    else if (p.length > 3) p = p.slice(0, Math.ceil(p.length / 2));
    else return '';
  }
  return '';
}

/** Parse and check a stored text for this account at this time. Returns null for anything that should not be shown. */
export function parseSnapshot<P = unknown, S = unknown>(text: string | undefined, userId: string, now: number): FeedSnapshot<P, S> | null {
  if (!text || typeof text !== 'string') return null;
  let raw: any;
  try { raw = JSON.parse(text); } catch { return null; }
  if (!raw || typeof raw !== 'object') return null;
  if (raw.v !== FEED_CACHE_VERSION) return null;
  if (!userId || raw.userId !== userId) return null;
  if (typeof raw.savedAt !== 'number' || !Number.isFinite(raw.savedAt)) return null;
  const age = now - raw.savedAt;
  if (age < 0 || age > FEED_CACHE_MAX_AGE_MS) return null;
  if (!Array.isArray(raw.posts) || !Array.isArray(raw.stories)) return null;
  const t = trim<P, S>(raw.posts, raw.stories);
  return { v: raw.v, userId, savedAt: raw.savedAt, posts: t.posts, stories: t.stories };
}

export interface FeedCache {
  read<P = unknown, S = unknown>(userId: string, opts?: { blockedIds?: Iterable<string>; now?: number }): Promise<FeedSnapshot<P, S> | null>;
  write<P = unknown, S = unknown>(userId: string, posts: P[], stories: S[], now?: number): Promise<void>;
  /** Everything (log out), or one account's snapshot. */
  clear(userId?: string): Promise<void>;
}

/** `primary` is tried first; if it throws, the in-memory copy is used for that call (and the primary is left alone). */
export function createFeedCache(primary: KeyValueStore | null, fallback: KeyValueStore = memoryStore()): FeedCache {
  const keyOf = (userId: string) => PREFIX + userId;
  const both = async <T,>(fn: (s: KeyValueStore) => Promise<T>): Promise<T | undefined> => {
    if (primary) {
      try { return await fn(primary); } catch { /* fall through to memory */ }
    }
    try { return await fn(fallback); } catch { return undefined; }
  };
  return {
    async read(userId, opts = {}) {
      if (!userId) return null;
      const now = opts.now ?? Date.now();
      const text = await both((s) => s.get(keyOf(userId)));
      const snap = parseSnapshot<any, any>(text, userId, now);
      if (!snap) {
        if (text !== undefined) void both((s) => s.delete(keyOf(userId)));   // expired, old version or corrupt: remove it
        return null;
      }
      return {
        ...snap,
        posts: dropBlocked(snap.posts, opts.blockedIds),
        stories: dropBlocked(dropExpired(snap.stories, now), opts.blockedIds)
      } as FeedSnapshot<any, any>;
    },
    async write(userId, posts, stories, now = Date.now()) {
      if (!userId) return;
      const text = serialize(userId, posts, stories, now);
      if (!text) return;
      await both(async (s) => {
        // only this account's snapshot is kept on the phone
        for (const k of await s.keys()) if (k.startsWith(PREFIX) && k !== keyOf(userId)) await s.delete(k);
        await s.set(keyOf(userId), text);
      });
    },
    async clear(userId) {
      for (const store of [primary, fallback]) {
        if (!store) continue;
        try {
          if (userId) await store.delete(keyOf(userId));
          else for (const k of await store.keys()) if (k.startsWith(PREFIX)) await store.delete(k);
        } catch { /* nothing to clear or storage unavailable */ }
      }
    }
  };
}

// The app's own cache: IndexedDB when this browser has it, memory otherwise.
let shared: FeedCache | null = null;
export function feedCache(): FeedCache {
  if (!shared) {
    let primary: KeyValueStore | null = null;
    try { if (typeof indexedDB !== 'undefined') primary = indexedDbStore(); } catch { primary = null; }
    shared = createFeedCache(primary);
  }
  return shared;
}

/** Fire and forget: used by log out and account switches. */
export function clearFeedCache(): void {
  try { void feedCache().clear().catch(() => undefined); } catch { /* nothing to clear */ }
}
