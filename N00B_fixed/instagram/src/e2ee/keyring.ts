// Where a device keeps its private chat keys: on the device only, never sent anywhere (except, if the person chooses, inside a backup that
// is locked with their own passphrase, see crypto.makeBackup).
//
// The keys are written to BOTH the browser's IndexedDB and localStorage and read back from both, so clearing one of them (browsers do this
// on their own to sites that are not opened for a while) does not lose the keys. A key that can not be read for some technical reason is
// never treated as "no key": a new key is made only when both stores answered and both were really empty.
import { isPublicJwk, type DeviceKey } from './crypto.ts';

export interface StoredRing {
  v: 1;
  current: string | null; // the key that belongs to THIS device (the others were restored from a backup and only open old messages)
  keys: DeviceKey[];
}

export interface KeyStore {
  load(): Promise<StoredRing>;
  save(ring: StoredRing): Promise<void>;
}

export const emptyRing = (): StoredRing => ({ v: 1, current: null, keys: [] });

const validKey = (k: any): k is DeviceKey =>
  !!k && typeof k.kid === 'string' && /^[0-9a-f]{16}$/.test(k.kid) && isPublicJwk(k.publicJwk) && !!k.privateJwk && typeof k.privateJwk.d === 'string' && typeof k.createdAt === 'string';

export function cleanRing(x: any): StoredRing {
  const keys: DeviceKey[] = Array.isArray(x?.keys) ? x.keys.filter(validKey) : [];
  const current = typeof x?.current === 'string' && keys.some((k) => k.kid === x.current) ? x.current : null;
  return { v: 1, current, keys };
}

// Two copies of the same ring become one that has every key of both.
export function mergeRings(a: StoredRing, b: StoredRing): StoredRing {
  const byKid = new Map<string, DeviceKey>();
  for (const k of [...b.keys, ...a.keys]) byKid.set(k.kid, k);
  const keys = [...byKid.values()].sort((x, y) => x.createdAt.localeCompare(y.createdAt));
  const current = a.current && byKid.has(a.current) ? a.current : b.current && byKid.has(b.current) ? b.current : null;
  return { v: 1, current, keys };
}

// ------------------------------------------------------------------------------------------------ memory (tests, and a last resort)
export function memoryKeyStore(initial?: StoredRing): KeyStore {
  let ring: StoredRing = initial ? cleanRing(initial) : emptyRing();
  return {
    async load() { return cleanRing(JSON.parse(JSON.stringify(ring))); },
    async save(next) { ring = cleanRing(JSON.parse(JSON.stringify(next))); }
  };
}

// ------------------------------------------------------------------------------------------------ the browser
const DB_NAME = 'noob-e2ee';
const STORE = 'rings';
const lsKey = (userId: string) => `noob_e2ee_ring_v1_${userId}`;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no indexedDB'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('indexedDB failed'));
    req.onblocked = () => reject(new Error('indexedDB blocked'));
  });
}

async function idbGet(userId: string): Promise<any> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(userId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('indexedDB read failed'));
    });
  } finally { db.close(); }
}

async function idbPut(userId: string, value: unknown): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, userId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('indexedDB write failed'));
      tx.onabort = () => reject(tx.error || new Error('indexedDB write aborted'));
    });
  } finally { db.close(); }
}

const readIdb = async (userId: string): Promise<StoredRing | null> => {
  try { const v = await idbGet(userId); return v ? cleanRing(v) : emptyRing(); } catch { return null; }
};
const readLs = (userId: string): StoredRing | null => {
  try { const raw = localStorage.getItem(lsKey(userId)); return raw ? cleanRing(JSON.parse(raw)) : emptyRing(); } catch { return null; }
};

export function browserKeyStore(userId: string): KeyStore {
  return {
    // Every store that answers is merged. Only when NEITHER answers is the ring unknown (and nothing is generated or overwritten then).
    async load() {
      const a = await readIdb(userId);
      const b = readLs(userId);
      if (a && b) return mergeRings(a, b);
      const one = a || b;
      if (one) return one;
      throw new Error('The key store could not be read.');
    },
    // Saving only ever ADDS keys: what is already stored is read and merged first, so an old key can never be overwritten by a shorter list.
    async save(ring) {
      let ok = 0;
      const inIdb = await readIdb(userId);
      try { await idbPut(userId, inIdb ? mergeRings(ring, inIdb) : ring); ok++; } catch { /* the other copy still counts */ }
      const inLs = readLs(userId);
      try { localStorage.setItem(lsKey(userId), JSON.stringify(inLs ? mergeRings(ring, inLs) : ring)); ok++; } catch { /* likewise */ }
      if (!ok) throw new Error('The keys could not be saved on this device.');
    }
  };
}
