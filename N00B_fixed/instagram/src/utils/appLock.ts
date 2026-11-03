// NOOB App lock: Face ID, Touch ID, fingerprint or the phone's own screen lock, asked before the app (or some pages of it) opens.
//
// How it works, and what it honestly is:
//  * The phone does the checking. NOOB asks it, through WebAuthn (a "platform authenticator", user verification required), to prove that the person who is holding the phone is
//    the one who set it up; NOOB never sees a face, a fingerprint or any picture of one. It also checks the answer's signature with the public key kept at set-up, so a "yes" that
//    was not really given by the phone is not accepted.
//  * "Register 1 face": the browser can not look at faces itself, so the face (or finger) that counts is the one registered in the phone's own settings. NOOB registers THIS phone.
//  * The lock belongs to this phone (it is kept in this phone's storage, per account), it is set up inside the app after the account's password has been typed, and it is meant for
//    a phone that is picked up by somebody else. It is not protection against a person who can run developer tools on an unlocked, logged-in browser.
//  * "Can't unlock?": the account's password turns the lock off.

export type LockPage = 'feed' | 'explore' | 'reels' | 'videos' | 'chat' | 'games' | 'music' | 'profile' | 'settings' | 'family';
export const LOCK_PAGES: Array<{ id: LockPage; label: string }> = [
  { id: 'chat', label: 'Messages' },
  { id: 'profile', label: 'Profile' },
  { id: 'settings', label: 'Settings and activity' },
  { id: 'family', label: 'Family Map' },
  { id: 'feed', label: 'Home' },
  { id: 'explore', label: 'Explore' },
  { id: 'reels', label: 'Reels' },
  { id: 'videos', label: 'Videos' },
  { id: 'games', label: 'Games' },
  { id: 'music', label: 'Music' },
];

export interface LockConfig {
  v: 1;
  credId: string;          // base64url
  publicKey: string;       // base64url (SPKI)
  alg: number;             // COSE: -7 = ES256, -257 = RS256
  whole: boolean;          // lock the whole app, also when it is opened again from the background
  open: boolean;           // ask when NOOB is opened (a fresh start)
  pages: LockPage[];       // pages that ask on their own
  graceSeconds: number;    // how long the app may be away before it asks again (0 = always)
  createdAt: number;
}

const keyOf = (userId: string) => `noob_applock_v1:${userId}`;
const b64u = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64u = (s: string): Uint8Array => {
  const p = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(p);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export function loadLock(userId: string): LockConfig | null {
  try {
    const raw = localStorage.getItem(keyOf(userId));
    if (!raw) return null;
    const c = JSON.parse(raw) as LockConfig;
    return c && c.v === 1 && typeof c.credId === 'string' && typeof c.publicKey === 'string' ? { ...c, pages: Array.isArray(c.pages) ? c.pages : [] } : null;
  } catch { return null; }
}
function saveLock(userId: string, c: LockConfig | null): void {
  try { if (c) localStorage.setItem(keyOf(userId), JSON.stringify(c)); else localStorage.removeItem(keyOf(userId)); } catch { /* storage blocked: the lock simply is not kept */ }
  notify();
}
export function updateLock(userId: string, patch: Partial<Pick<LockConfig, 'whole' | 'open' | 'pages' | 'graceSeconds'>>): LockConfig | null {
  const c = loadLock(userId);
  if (!c) return null;
  const next = { ...c, ...patch };
  saveLock(userId, next);
  return next;
}
export function removeLock(userId: string): void { saveLock(userId, null); unlocked = true; notify(); }

/** Does this phone have Face ID / Touch ID / a fingerprint reader / a screen lock that a web page may ask? */
export async function lockSupported(): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !window.PublicKeyCredential || !navigator.credentials) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { return false; }
}

const rpId = () => window.location.hostname;

/** Registers this phone: the phone asks for the person's face or finger once. The caller must already have checked the account's password. */
export async function registerLock(userId: string, username: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!(await lockSupported())) return { ok: false, error: 'This phone has no Face ID, fingerprint or screen lock that NOOB can use. Set one up in the phone\'s settings first.' };
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(32),
        rp: { id: rpId(), name: 'NOOB' },
        user: { id: new TextEncoder().encode(userId).slice(0, 64), name: username, displayName: username },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        timeout: 60000,
        attestation: 'none',
      },
    })) as PublicKeyCredential | null;
    if (!cred) return { ok: false, error: 'Nothing was registered.' };
    const res = cred.response as AuthenticatorAttestationResponse;
    const pk = res.getPublicKey?.();
    const alg = res.getPublicKeyAlgorithm?.();
    if (!pk || (alg !== -7 && alg !== -257)) return { ok: false, error: 'This phone did not hand over a key NOOB can check. Try again, or use another browser.' };
    saveLock(userId, { v: 1, credId: b64u(cred.rawId), publicKey: b64u(pk), alg, whole: false, open: true, pages: [], graceSeconds: 60, createdAt: Date.now() });
    unlocked = true; notify();
    return { ok: true };
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === 'NotAllowedError') return { ok: false, error: 'It was cancelled, or the face / finger was not recognised. Try again.' };
    return { ok: false, error: 'Could not register the lock on this phone.' };
  }
}

// ECDSA signatures come as DER; WebCrypto wants the two 32-byte numbers side by side.
function derToRaw(der: Uint8Array): Uint8Array {
  let i = 2;
  if (der[1] & 0x80) i += der[1] & 0x7f;
  const read = () => { i++; const len = der[i++]; let v = der.slice(i, i + len); i += len; while (v.length > 32 && v[0] === 0) v = v.slice(1); const out = new Uint8Array(32); out.set(v, 32 - v.length); return out; };
  const r = read(), s = read();
  const raw = new Uint8Array(64); raw.set(r, 0); raw.set(s, 32);
  return raw;
}

/** Asks the phone for the face / finger and checks the signed answer. */
export async function verifyFace(userId: string): Promise<boolean> {
  const c = loadLock(userId);
  if (!c) return true;
  try {
    const challenge = randomBytes(32);
    const got = (await navigator.credentials.get({
      publicKey: { challenge, rpId: rpId(), allowCredentials: [{ type: 'public-key', id: unb64u(c.credId), transports: ['internal'] }], userVerification: 'required', timeout: 60000 },
    })) as PublicKeyCredential | null;
    if (!got) return false;
    const r = got.response as AuthenticatorAssertionResponse;
    const client = JSON.parse(new TextDecoder().decode(r.clientDataJSON)) as { type: string; challenge: string; origin: string };
    if (client.type !== 'webauthn.get' || client.challenge !== b64u(challenge) || client.origin !== window.location.origin) return false;
    const auth = new Uint8Array(r.authenticatorData);
    if (!(auth[32] & 0x04)) return false;                       // the phone says the person was verified (face / finger / code)
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', r.clientDataJSON));
    const signed = new Uint8Array(auth.length + 32); signed.set(auth, 0); signed.set(hash, auth.length);
    const sig = new Uint8Array(r.signature);
    const spki = unb64u(c.publicKey);
    if (c.alg === -7) {
      const key = await crypto.subtle.importKey('spki', spki, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(sig), signed);
    }
    const key = await crypto.subtle.importKey('spki', spki, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, signed);
  } catch { return false; }
}

// ---- the lock state of this tab: everything is locked at start, one successful check opens it, going away for longer than the grace time locks it again
let unlocked = false;
let hiddenAt = 0;
let activeUser = '';
const listeners = new Set<() => void>();
function notify(): void { listeners.forEach((fn) => fn()); }
export function subscribeLock(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
export const isUnlocked = (): boolean => unlocked;

export function startLock(userId: string): void {
  if (activeUser === userId) return;
  activeUser = userId;
  unlocked = !loadLock(userId);
  notify();
}
export function markUnlocked(): void { unlocked = true; notify(); }
export function lockNow(): void { if (loadLock(activeUser)) { unlocked = false; notify(); } }

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    const c = activeUser ? loadLock(activeUser) : null;
    if (c && hiddenAt && (c.whole || c.pages.length > 0) && (Date.now() - hiddenAt) / 1000 >= c.graceSeconds) lockNow();
    hiddenAt = 0;
  });
}

/** What has to be covered right now: the whole app, one page, or nothing. */
export function lockNeeded(userId: string, page: LockPage | null): 'app' | 'page' | null {
  if (unlocked) return null;
  const c = loadLock(userId);
  if (!c) return null;
  if (c.whole || c.open) return 'app';
  return page && c.pages.includes(page) ? 'page' : null;
}
