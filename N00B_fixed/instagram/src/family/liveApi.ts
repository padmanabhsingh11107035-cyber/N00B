import { supabase, resolveMedia } from '../services/supabase';
import { FamilyOffline, parseOutcome, parseRoom, parseRoomOutcome, parseStateOutcome, type FamilyApi } from './api';

// The Family Map on the real database: every call is one of the family_* functions (migration 20261031000001), which check who is asking. Nothing is read from a table directly.
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

export const liveApi: FamilyApi = {
  mode: 'live',
  async myRooms() { const j = await call('family_my_rooms'); return (Array.isArray(j) ? j : []).map(parseRoom); },
  createRoom: (name, emoji, share) => safe(async () => parseRoomOutcome(await call('family_create_room', { p_name: name, p_emoji: emoji, p_share: share })), { ok: false, error: 'failed' }),
  joinRoom: (code, share) => safe(async () => parseRoomOutcome(await call('family_join_room', { p_code: code, p_share: share })), { ok: false, error: 'failed' }),
  roomState: (id) => safe(async () => parseStateOutcome(await call('family_room_state', { p_room: id }), resolveMedia), { ok: false, error: 'failed' }),
  async pushLocation(fix) {
    // a missed update is not worth an error: the next one follows in a few seconds
    try { await call('family_push_location', { p_lat: fix.lat, p_lng: fix.lng, p_accuracy: fix.accuracy, p_heading: fix.heading, p_speed: fix.speed }); } catch { /* ignored */ }
  },
  setSharing: (id, on) => safe(async () => parseOutcome(await call('family_set_sharing', { p_room: id, p_on: on })), { ok: false, error: 'failed' }),
  leaveRoom: (id) => safe(async () => parseOutcome(await call('family_leave_room', { p_room: id })), { ok: false, error: 'failed' }),
  removeMember: (id, userId) => safe(async () => parseOutcome(await call('family_remove_member', { p_room: id, p_user: userId })), { ok: false, error: 'failed' }),
  rotateCode: (id) => safe(async () => {
    const j = await call('family_rotate_code', { p_room: id });
    return j && j.ok === true && typeof j.code === 'string' ? { ok: true as const, code: j.code } : (parseOutcome(j) as { ok: false; error: 'failed' });
  }, { ok: false, error: 'failed' }),
  deleteRoom: (id) => safe(async () => parseOutcome(await call('family_delete_room', { p_room: id })), { ok: false, error: 'failed' })
};

/** is somebody logged in? (the page opens without the app, so it asks the login itself) */
export async function hasLogin(): Promise<boolean> {
  try { const { data } = await supabase.auth.getSession(); return !!data.session; } catch { return false; }
}
