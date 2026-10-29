import { supabase, resolveMedia } from '../services/supabase';
import { browserKeyStore } from '../e2ee/keyring.ts';
import { deviceLabel } from '../e2ee/label.ts';
import { FamilyOffline, parseOutcome, parseRoom, parseRoomOutcome, parseStateOutcome, type FamilyApi, type FamilyRoom } from './api';
import { createPlaceCrypto } from './sealed.ts';

// The Family Map on the real database: every call is one of the family_* functions (migrations 20261031000001 and 20261031000002), which check who is asking. Nothing is read from a table directly,
// and a place never travels or rests unlocked: it is locked on this phone for the devices of the room (sealed.ts) and opened here again for the others.
async function call(fn: string, args?: Record<string, unknown>): Promise<any> {
  let res: { data: unknown; error: any; status?: number };
  try { res = await supabase.rpc(fn, args as any); } catch { throw new FamilyOffline('down'); }
  const { data, error, status } = res;
  if (error) {
    const text = String(error.message || '');
    // the functions are not installed yet (the SQL has not been run) -> a friendly "being set up" screen instead of an error
    if (error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(text)) throw new FamilyOffline('setup');
    // no login (any more): the database answers "permission denied" to a visitor
    if (error.code === '42501' || status === 401 || status === 403) throw new FamilyOffline('login');
    if (status === 0 || (status ?? 0) >= 500 || /failed to fetch|network|restricted|maintenance/i.test(text)) throw new FamilyOffline('down');
    throw new Error(text || 'failed');
  }
  return data;
}
// every call except the first one (myRooms) answers "failed" when the database cannot be reached: the screens show a short message and the next 5-second reading tries again
const safe = async <T>(run: () => Promise<T>, fallback: T): Promise<T> => { try { return await run(); } catch { return fallback; } };

const userId = async (): Promise<string | null> => { try { return (await supabase.auth.getSession()).data.session?.user.id ?? null; } catch { return null; } };
const seen = {
  get: (k: string): string | null => { try { return localStorage.getItem(`noob_e2ee_seen_v1_${k}`); } catch { return null; } },
  set: (k: string, v: string): void => { try { localStorage.setItem(`noob_e2ee_seen_v1_${k}`, v); } catch { /* remembered next time */ } }
};
const webLocks = typeof navigator !== 'undefined' ? (navigator as any).locks : undefined;
// the same device key as the chats use (one key per device and account), made and published on first use
const places = createPlaceCrypto({
  rpc: async (fn, args) => { const { data, error } = await supabase.rpc(fn, args as any); if (error) throw error; return data; },
  userId,
  storeFor: (id) => browserKeyStore(id),
  seen,
  lock: webLocks?.request ? <T,>(name: string, fn: () => Promise<T>) => webLocks.request(name, fn) as Promise<T> : undefined,
  deviceLabel
});

// the rooms this person shares with (asked at most every 45 seconds: a place is sent every few seconds)
let sharingRooms: { at: number; rooms: FamilyRoom[] } | null = null;
async function roomsToShareWith(): Promise<FamilyRoom[]> {
  if (sharingRooms && Date.now() - sharingRooms.at < 45_000) return sharingRooms.rooms;
  const list = await call('family_my_rooms');
  const rooms = (Array.isArray(list) ? list : []).map(parseRoom).filter((r) => r.sharing);
  sharingRooms = { at: Date.now(), rooms };
  return rooms;
}
const changed = (roomId?: string): void => { sharingRooms = null; places.forget(roomId); };

// an envelope opened once is not opened again every 5 seconds: it is kept by room, person and the envelope's own random number
const opened = new Map<string, Awaited<ReturnType<typeof places.open>>>();

export const liveApi: FamilyApi = {
  mode: 'live',
  userId,
  async myRooms() { const j = await call('family_my_rooms'); return (Array.isArray(j) ? j : []).map(parseRoom); },
  createRoom: (name, emoji, share) => safe(async () => { const r = parseRoomOutcome(await call('family_create_room', { p_name: name, p_emoji: emoji, p_share: share })); changed(); return r; }, { ok: false, error: 'failed' }),
  joinRoom: (code, share) => safe(async () => { const r = parseRoomOutcome(await call('family_join_room', { p_code: code, p_share: share })); changed(); return r; }, { ok: false, error: 'failed' }),
  roomState: (id) => safe(async () => {
    const j = await call('family_room_state', { p_room: id });
    if (j && j.ok === true && Array.isArray(j.members)) {
      await Promise.all(j.members.map(async (m: any) => {
        const env = m?.sealed;
        delete m.sealed;
        if (!env || typeof env.iv !== 'string') return;
        const slot = `${id}:${m.id}:${env.iv}`;
        let res = opened.get(slot);
        if (!res) {
          res = await places.open(id, String(m.id), env);
          if ('place' in res || res.code !== 'unverified-sender') { if (opened.size > 300) opened.delete(opened.keys().next().value as string); opened.set(slot, res); }
        }
        if (!res.ok) return; // not locked for this device (yet) or not provably from them: no place is shown rather than a doubtful one
        const p = res.place, server = Date.parse(String(m.updatedAt));
        m.lat = p.lat; m.lng = p.lng; m.accuracy = p.accuracy; m.heading = p.heading; m.speed = p.speed;
        // the time the server writes could be moved by the server; the time inside the lock can not: a place that says it is much older is shown as older
        if (Number.isFinite(server) && server - p.at > 10 * 60_000) m.updatedAt = new Date(p.at).toISOString();
      }));
    }
    return parseStateOutcome(j, resolveMedia);
  }, { ok: false, error: 'failed' }),
  async pushLocation(fix) {
    // a missed update is not worth an error: the next one follows in a few seconds
    try {
      const rooms = await roomsToShareWith();
      const items: { room: string; env: unknown }[] = [];
      for (const r of rooms.slice(0, 10)) { const env = await places.seal(r.id, fix); if (env) items.push({ room: r.id, env }); }
      if (items.length) await call('family_push_sealed', { p_items: items });
    } catch { /* ignored */ }
  },
  async getPrefs() { try { const j = await call('family_my_prefs'); return { shareDefault: j?.shareDefault !== false }; } catch { return { shareDefault: true }; } },
  setSharing: (id, on) => safe(async () => { const r = parseOutcome(await call('family_set_sharing', { p_room: id, p_on: on })); changed(); return r; }, { ok: false, error: 'failed' }),
  setSharingAll: (on) => safe(async () => { const r = parseOutcome(await call('family_set_sharing_all', { p_on: on })); changed(); return r; }, { ok: false, error: 'failed' }),
  setLocked: (id, on) => safe(async () => parseOutcome(await call('family_set_locked', { p_room: id, p_locked: on })), { ok: false, error: 'failed' }),
  leaveRoom: (id) => safe(async () => { const r = parseOutcome(await call('family_leave_room', { p_room: id })); changed(id); return r; }, { ok: false, error: 'failed' }),
  removeMember: (id, userId2) => safe(async () => { const r = parseOutcome(await call('family_remove_member', { p_room: id, p_user: userId2 })); changed(id); return r; }, { ok: false, error: 'failed' }),
  rotateCode: (id) => safe(async () => {
    const j = await call('family_rotate_code', { p_room: id });
    return j && j.ok === true && typeof j.code === 'string' ? { ok: true as const, code: j.code } : (parseOutcome(j) as { ok: false; error: 'failed' });
  }, { ok: false, error: 'failed' }),
  deleteRoom: (id) => safe(async () => { const r = parseOutcome(await call('family_delete_room', { p_room: id })); changed(id); return r; }, { ok: false, error: 'failed' })
};

/** is somebody logged in? (the page opens without the app, so it asks the login itself) */
export async function hasLogin(): Promise<boolean> {
  try { const { data } = await supabase.auth.getSession(); return !!data.session; } catch { return false; }
}
