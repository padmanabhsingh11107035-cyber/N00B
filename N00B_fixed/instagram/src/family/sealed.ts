import * as C from '../e2ee/crypto.ts';
import { createE2ee, type E2eeDeps } from '../e2ee/service.ts';
import type { Fix } from './geo.ts';

// NOOB Family Map: a place is LOCKED on the phone before it leaves it (end-to-end encryption, the same locking as NOOB chats, see src/e2ee/crypto.ts): it is locked for every device of every
// person in the room, so the database keeps only the locked envelope and can not read where anybody is. A phone opens the envelopes of the others with its own device key, which never leaves it.
// The locking proves WHO made a place (nobody, not even the server, can put a place in somebody's name) and the room it belongs to (a place copied into another room does not open).
// What it does not give, and the app says so: the server decides who is a member and hands out the public keys, so a server that is itself the attacker could add itself (people can
// compare their security codes in a chat); and there is no "ratchet", so a stolen unlocked phone can read what is on it.
export interface Place { lat: number; lng: number; accuracy: number | null; heading: number | null; speed: number | null; at: number }
interface Wire { v: 1; lat: number; lng: number; acc: number | null; hdg: number | null; spd: number | null; at: number }

const KEYS_TTL_MS = 30_000;
const DIRECTORY_TTL_MS = 15_000;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** a place read back from a locked envelope, checked again (an envelope is only as good as the phone that made it) */
export function readPlace(text: string, nowMs: number): Place | null {
  let j: any;
  try { j = JSON.parse(text); } catch { return null; }
  if (!j || j.v !== 1) return null;
  const lat = num(j.lat), lng = num(j.lng), at = num(j.at);
  if (lat === null || lng === null || at === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, accuracy: num(j.acc), heading: num(j.hdg), speed: num(j.spd), at: Math.min(at, nowMs + 120_000) };
}

export type Opened = { ok: true; place: Place } | { ok: false; code: 'no-key' | 'unverified-sender' | 'damaged' };

export function createPlaceCrypto(deps: E2eeDeps) {
  const e2ee = createE2ee(deps);
  const now = deps.now ?? Date.now;
  const recipients = new Map<string, { at: number; list: C.Recipient[] }>();
  const directory = new Map<string, { at: number; keys: Map<string, C.PublicJwk> }>();

  // this device's key (made and published on first use, exactly as for chats) -> who I am and the key I lock with
  async function ready(): Promise<{ me: string; key: C.DeviceKey; ring: C.DeviceKey[] } | null> {
    const me = await deps.userId();
    if (!me) return null;
    const res = await e2ee.ensure(me);
    if (!res.ok) return null;
    const ring = await deps.storeFor(me).load();
    const key = ring.keys.find((k) => k.kid === ring.current);
    return key ? { me, key, ring: ring.keys } : null;
  }

  async function recipientsOf(roomId: string): Promise<C.Recipient[]> {
    const hit = recipients.get(roomId);
    if (hit && now() - hit.at < KEYS_TTL_MS) return hit.list;
    const res = await deps.rpc('family_room_keys', { p_room: roomId });
    if (!res || res.ok !== true) throw new C.E2eeError('bad-input', 'Not a member of this room.');
    const list: C.Recipient[] = [];
    for (const m of Array.isArray(res.members) ? res.members : []) {
      for (const k of Array.isArray(m?.keys) ? m.keys : []) if (typeof k?.kid === 'string' && C.isPublicJwk(k.key)) list.push({ kid: k.kid, publicJwk: k.key });
    }
    recipients.set(roomId, { at: now(), list });
    return list;
  }

  /** the place locked for the room, or null when this device has no key (yet) */
  async function seal(roomId: string, fix: Fix): Promise<C.Envelope | null> {
    const r = await ready();
    if (!r) return null;
    const list = await recipientsOf(roomId);
    // the sender's own device must be able to read it too (it is always in the room's key list once registered; this keeps a very fresh key working)
    const all = list.some((x) => x.kid === r.key.kid) ? list : [...list, { kid: r.key.kid, publicJwk: r.key.publicJwk }];
    const wire: Wire = { v: 1, lat: fix.lat, lng: fix.lng, acc: fix.accuracy, hdg: fix.heading, spd: fix.speed, at: fix.at };
    return C.seal(JSON.stringify(wire), { chatId: roomId, sender: r.key, recipients: all.slice(0, C.MAX_RECIPIENT_KEYS) });
  }

  async function keyOf(userId: string, kid: string): Promise<C.PublicJwk | null> {
    const hit = directory.get(userId);
    const known = hit?.keys.get(kid);
    if (known) return known;
    if (hit && now() - hit.at < DIRECTORY_TTL_MS) return null;
    const list = await deps.rpc('chat_keys_of', { p_user: userId });
    const keys = new Map<string, C.PublicJwk>();
    for (const k of Array.isArray(list) ? list : []) if (k && typeof k.kid === 'string' && C.isPublicJwk(k.key)) keys.set(k.kid, k.key);
    directory.set(userId, { at: now(), keys });
    return keys.get(kid) ?? null;
  }

  /** open the locked place of `senderId` in this room */
  async function open(roomId: string, senderId: string, envelope: unknown): Promise<Opened> {
    const r = await ready();
    if (!r || !C.isEnvelope(envelope)) return { ok: false, code: r ? 'damaged' : 'no-key' };
    try {
      const senderPublic = async (skid: string): Promise<C.PublicJwk | null> => (senderId === r.me ? r.ring.find((k) => k.kid === skid)?.publicJwk : undefined) ?? keyOf(senderId, skid);
      const text = await C.open(envelope, { chatId: roomId, ring: r.ring, senderPublic });
      const place = readPlace(text, now());
      return place ? { ok: true, place } : { ok: false, code: 'damaged' };
    } catch (e: any) {
      return { ok: false, code: e instanceof C.E2eeError && e.code !== 'bad-input' ? e.code : 'unverified-sender' };
    }
  }

  return { ready, seal, open, forget: (roomId?: string) => { if (roomId) recipients.delete(roomId); else recipients.clear(); } };
}
export type PlaceCrypto = ReturnType<typeof createPlaceCrypto>;
