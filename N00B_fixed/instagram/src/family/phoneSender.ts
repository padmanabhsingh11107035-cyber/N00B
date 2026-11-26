import { Capacitor, registerPlugin } from '@capacitor/core';
import type { Fix } from './geo.ts';
import type { FamilyApi } from './api.ts';
import type { Problem } from './locate.ts';

// NOOB Family Map in the Android app: the phone's OWN background sender (android-overrides/FamilyLocationService.java). Unlike a web page it keeps following the phone, locking the place
// (end-to-end, FamilySenderCore.java) and sending it, after NOOB has been swiped away from the recent apps. It signs in to the database with a "phone token" (family_phone_register) that can only
// do two things: list the rooms the person shares with, and hand in locked places for them. The token and this device's key are kept on the phone in the Android Keystore.
// Only apps that contain the plugin have it: an older Android app (or the browser) has no `FamilySender` and everything keeps working the old way (background.ts).
interface SenderStatus { running: boolean; configured: boolean; wanted: boolean; lastPushAt: number; lastError: string; location: boolean }
interface SenderPlugin {
  configure(o: { url: string; anonKey: string; token: string; kid: string; x: string; y: string; d: string; title: string; message: string }): Promise<{ ok: boolean }>;
  start(o: { requestPermissions: boolean }): Promise<{ ok: boolean }>;
  stop(): Promise<{ ok: boolean }>;
  clear(): Promise<{ ok: boolean }>;
  status(): Promise<SenderStatus>;
  openSettings(): Promise<void>;
  addListener(event: 'location', cb: (l: { latitude: number; longitude: number; accuracy?: number; speed?: number; bearing?: number; time?: number }) => void): Promise<{ remove: () => Promise<void> }>;
  addListener(event: 'problem', cb: (e: { code?: string }) => void): Promise<{ remove: () => Promise<void> }>;
}
const Native = registerPlugin<SenderPlugin>('FamilySender');

const REC = 'noob_family_phone_v1';
const TOKEN_DAYS = 20;   // a new token long before the database's 60 days run out

/** this app contains the phone sender (a newer Android app); never in a browser */
export function senderAvailable(): boolean {
  try { return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('FamilySender'); } catch { return false; }
}

interface Rec { uid: string; kid: string; at: number }
const readRec = (): Rec | null => { try { const j = JSON.parse(localStorage.getItem(REC) || 'null'); return j && typeof j.uid === 'string' && typeof j.kid === 'string' && typeof j.at === 'number' ? j : null; } catch { return null; } };
const writeRec = (r: Rec | null): void => { try { if (r) localStorage.setItem(REC, JSON.stringify(r)); else localStorage.removeItem(REC); } catch { /* the token is simply renewed next time */ } };

/** give the service a fresh token and this device's key when it has none, a different person's, an old one, or one the database refused */
async function ensureConfigured(api: FamilyApi): Promise<boolean> {
  if (!api.phoneSetup) return false;
  const uid = await api.userId();
  if (!uid) return false;
  const st = await Native.status().catch(() => null);
  const rec = readRec();
  const kid = api.phoneKid ? await api.phoneKid() : null;
  const fresh = rec && kid && rec.uid === uid && rec.kid === kid && Date.now() - rec.at < TOKEN_DAYS * 86_400_000 && st?.configured && st.lastError !== 'invalid_token';
  if (fresh) return true;
  const setup = await api.phoneSetup();
  if (!setup) return false;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined, anon = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!url || !anon) return false;
  await Native.configure({ url, anonKey: anon, token: setup.token, kid: setup.key.kid, x: setup.key.x, y: setup.key.y, d: setup.key.d, title: 'NOOB Family Map', message: 'Sharing your place with your rooms. Tap Stop sharing to pause.' });
  writeRec({ uid, kid: setup.key.kid, at: Date.now() });
  return true;
}

/** start the phone sender and listen to its places (for the pin of "you" and the day report); the returned function stops the sender. Throws when this app has no sender or it cannot start (the caller then uses the old way). */
export async function startPhoneSender(api: FamilyApi, onFix: (f: Fix) => void, onProblem: (p: Problem) => void, askPermission: boolean): Promise<() => void> {
  if (!senderAvailable()) throw new Error('no phone sender');
  if (!(await ensureConfigured(api))) throw new Error('not set up');
  const handles = await Promise.all([
    Native.addListener('location', (l) => onFix({ lat: l.latitude, lng: l.longitude, accuracy: l.accuracy ?? null, heading: l.bearing ?? null, speed: l.speed ?? null, at: Date.now() })),
    Native.addListener('problem', (e) => onProblem(e.code === 'denied' ? 'denied' : 'unavailable'))
  ]);
  try { await Native.start({ requestPermissions: askPermission }); }
  catch (e: any) {
    await Promise.all(handles.map((h) => h.remove().catch(() => undefined)));
    if (e?.code === 'NOT_AUTHORIZED') { onProblem('denied'); return () => undefined; }   // the person said no: say so (no fallback asks again)
    throw e;
  }
  return () => { handles.forEach((h) => void h.remove().catch(() => undefined)); void Native.stop().catch(() => undefined); };
}

// "is the phone sender already sending?": the web part then does not send the same place a second time (asked at most every 10 seconds)
let sendingAt = 0, sending = false;
export async function nativeIsSending(): Promise<boolean> {
  if (!senderAvailable()) return false;
  if (Date.now() - sendingAt < 10_000) return sending;
  sendingAt = Date.now();
  try { const s = await Native.status(); sending = s.running && Date.now() - s.lastPushAt < 60_000; } catch { sending = false; }
  return sending;
}

/** forget the token and key on this phone and stop the service (logout) */
export async function clearPhoneSender(): Promise<void> {
  writeRec(null); sending = false;
  if (senderAvailable()) await Native.clear().catch(() => undefined);
}
/** background sharing was switched off: stop, forget, and switch the token off in the database too */
export async function forgetPhoneSender(api: FamilyApi): Promise<void> {
  await clearPhoneSender();
  try { await api.phoneRevoke?.(); } catch { /* it expires by itself */ }
}
export const openSenderSettings = (): Promise<void> => (senderAvailable() ? Native.openSettings().catch(() => undefined) : Promise.resolve());
