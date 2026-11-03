// App lock (Face ID / fingerprint): the real utils/appLock.ts run against a pretend phone that signs like a real WebAuthn authenticator (ES256, signature in DER form, flags, counter),
// the lock rules (open / whole app / single pages / away time), the cover, the settings page and its wiring. Usage: node --liftoff-only scripts/supabase/test-app-lock.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { webcrypto } from 'node:crypto';

let passed = 0, failed = 0;
const check = (c, l, d = '') => { if (c) { passed++; console.log(`  ok   ${l}`); } else { failed++; console.log(`  FAIL ${l} ${d}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split('\r').join('');

// ---- a pretend browser and phone
const store = new Map();
const docListeners = {};
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const subtle = webcrypto.subtle;
let phone = { keys: null, uv: true, credId: webcrypto.getRandomValues(new Uint8Array(16)), counter: 1, refuse: false, tamper: false };
const derFromRaw = (raw) => { const enc = (v) => { let i = 0; while (i < v.length - 1 && v[i] === 0) i++; v = v.slice(i); if (v[0] & 0x80) v = Uint8Array.from([0, ...v]); return Uint8Array.from([2, v.length, ...v]); }; const r = enc(raw.slice(0, 32)), s = enc(raw.slice(32)); return Uint8Array.from([0x30, r.length + s.length, ...r, ...s]); };
const rpHash = async () => new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode('noobsocials.com')));
globalThis.window = globalThis;
globalThis.location = { hostname: 'noobsocials.com', origin: 'https://noobsocials.com' };
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.document = { hidden: false, addEventListener: (n, fn) => { docListeners[n] = fn; } };
globalThis.PublicKeyCredential = { isUserVerifyingPlatformAuthenticatorAvailable: async () => true };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { credentials: {
  create: async () => {
    phone.keys = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const spki = new Uint8Array(await subtle.exportKey('spki', phone.keys.publicKey));
    return { rawId: phone.credId.buffer, response: { getPublicKey: () => spki.buffer, getPublicKeyAlgorithm: () => -7 } };
  },
  get: async ({ publicKey }) => {
    if (phone.refuse) throw Object.assign(new Error('no'), { name: 'NotAllowedError' });
    const clientDataJSON = new TextEncoder().encode(JSON.stringify({ type: 'webauthn.get', challenge: b64u(publicKey.challenge), origin: 'https://noobsocials.com' }));
    const authenticatorData = new Uint8Array(37); authenticatorData.set(await rpHash(), 0); authenticatorData[32] = phone.uv ? 0x05 : 0x01; authenticatorData[36] = phone.counter++;
    const hash = new Uint8Array(await subtle.digest('SHA-256', clientDataJSON));
    const signed = new Uint8Array(37 + 32); signed.set(authenticatorData); signed.set(hash, 37);
    const raw = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, phone.tamper ? (await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])).privateKey : phone.keys.privateKey, signed));
    return { rawId: phone.credId.buffer, response: { clientDataJSON: clientDataJSON.buffer, authenticatorData: authenticatorData.buffer, signature: derFromRaw(raw).buffer } };
  } } } });
const L = await import(pathToFileURL(path.resolve('src/utils/appLock.ts')).href);

section('1. Setting it up');
check(await L.lockSupported() === true, 'a phone with Face ID / a fingerprint reader / a screen lock is recognised');
check(L.loadLock('u1') === null && L.lockNeeded('u1', 'chat') === null, 'before set-up nothing is locked');
const reg = await L.registerLock('u1', 'asha');
check(reg.ok === true, 'registering asks the phone and keeps the key it hands over');
const cfg = L.loadLock('u1');
check(cfg && cfg.alg === -7 && cfg.credId && cfg.publicKey && cfg.open === true && cfg.whole === false && cfg.graceSeconds === 60, 'the lock is saved for this account on this phone, asking at app start');
check(!/asha|password|face/i.test(JSON.stringify(cfg).replace(/"v":1/, '')), 'what is kept holds a key and ids only: no picture, no password');
check(L.loadLock('u2') === null, 'another account on the same phone has no lock');

section('2. Opening it (the phone signs, NOOB checks the signature)');
L.startLock('u1');
check(L.isUnlocked() === false && L.lockNeeded('u1', 'feed') === 'app', 'a fresh start is locked: the whole app is covered');
check(await L.verifyFace('u1') === true, 'a real signed answer from the phone is accepted (DER signature, challenge, origin, user-verified flag)');
phone.uv = false; check(await L.verifyFace('u1') === false, 'an answer where the phone did NOT verify the person is refused'); phone.uv = true;
phone.tamper = true; check(await L.verifyFace('u1') === false, 'an answer signed with some other key is refused'); phone.tamper = false;
phone.refuse = true; check(await L.verifyFace('u1') === false, 'a cancelled or not recognised face gives no entry'); phone.refuse = false;
L.markUnlocked();
check(L.lockNeeded('u1', 'chat') === null, 'once unlocked, nothing is covered');

section('3. The rules');
L.updateLock('u1', { open: true, whole: false, pages: ['chat'] });
L.lockNow();
check(L.lockNeeded('u1', 'feed') === 'app', 'ask-at-open covers everything while locked');
L.updateLock('u1', { open: false, whole: false, pages: ['chat', 'family'] });
check(L.lockNeeded('u1', 'feed') === null && L.lockNeeded('u1', 'chat') === 'page' && L.lockNeeded('u1', 'family') === 'page' && L.lockNeeded('u1', null) === null, 'with only page locks, only those pages are covered');
L.markUnlocked();
check(L.lockNeeded('u1', 'chat') === null, 'one check opens the pages');
L.updateLock('u1', { whole: true, graceSeconds: 60, pages: [] });
const t0 = Date.now(); const realNow = Date.now;
docListeners.visibilitychange?.call(null); // visible at start: nothing
globalThis.document.hidden = true; docListeners.visibilitychange(); // goes away
Date.now = () => t0 + 30_000; globalThis.document.hidden = false; docListeners.visibilitychange();
check(L.isUnlocked() === true, 'back after 30 s with a 60 s grace: still open');
globalThis.document.hidden = true; Date.now = () => t0 + 31_000; docListeners.visibilitychange();
Date.now = () => t0 + 31_000 + 120_000; globalThis.document.hidden = false; docListeners.visibilitychange();
check(L.isUnlocked() === false && L.lockNeeded('u1', 'feed') === 'app', 'back after 2 minutes: the whole app asks again');
Date.now = realNow;
L.updateLock('u1', { graceSeconds: 0 }); L.markUnlocked();
globalThis.document.hidden = true; docListeners.visibilitychange(); globalThis.document.hidden = false; docListeners.visibilitychange();
check(L.isUnlocked() === false, '"every time" asks at every return');
L.updateLock('u1', { whole: false, open: true, pages: [] }); L.markUnlocked();
globalThis.document.hidden = true; docListeners.visibilitychange(); globalThis.document.hidden = false; docListeners.visibilitychange();
check(L.isUnlocked() === true, 'ask-at-open alone does not ask again when coming back from another app');
let pings = 0; const off = L.subscribeLock(() => pings++); L.lockNow(); off();
check(pings > 0 && L.isUnlocked() === false, 'screens are told when the lock changes');
L.removeLock('u1');
check(L.loadLock('u1') === null && L.isUnlocked() === true && L.lockNeeded('u1', 'chat') === null, 'turning it off removes the lock and opens everything');

section('4. The cover, the settings page and the wiring');
const gate = read('src/components/Common/AppLockGate.tsx'), page = read('src/components/Settings/pages/lock.tsx'), app = read('src/App.tsx'), api = read('src/services/supabaseApi.ts');
check(/data-testid="app-lock-cover"/.test(gate) && /Unlock with Face ID/.test(gate) && /verifyMyPassword\(user\.username, password\)/.test(gate) && /export const PageLock/.test(gate) && /export const AppLockGate/.test(gate), 'the cover offers Face ID, and the password when Face ID cannot be used');
check(/<AppLockGate user=\{currentUser\} activeTab=\{activeTab\} onLeave=\{\(\) => setActiveTab\('feed'\)\}/.test(app) && /<FamilyHost lockUser=\{currentUser\}/.test(app), 'the app mounts the gate and passes the user to Family Map');
check(/<PageLock user=\{ctx\.currentUser\} page="settings"/.test(read('src/components/Settings/SettingsHub.tsx')) && /<PageLock user=\{lockUser\} page="family"/.test(read('src/components/Family/FamilyHost.tsx')), 'Settings and activity and Family Map cover themselves when they are locked pages');
check(/step === 'password'/.test(page) && /verifyMyPassword/.test(page) && /registerLock/.test(page) && /Register my face/.test(page) && page.indexOf("setStep('face')") > page.indexOf('checkPassword()'), 'the settings page asks for the password first and only then registers the face');
check(/turnOff[\s\S]{0,200}checkPassword\(\)[\s\S]{0,80}removeLock/.test(page) && /LOCK_PAGES\.map/.test(page) && /whole/.test(page) && /graceSeconds/.test(page), 'turning it off asks for the password; there are single-page locks, a whole-app lock and an away time');
check(/never sees or keeps your face/.test(page) && /not to stop a person with developer tools/.test(page), 'the page says plainly what the lock is and is not');
check(/id: 'app-lock'/.test(read('src/components/Settings/registry.ts')) && /'app-lock': AppLockPage/.test(read('src/components/Settings/pages/index.tsx')), 'it is a row in Settings and activity (profile, three dots)');
check(/export async function verifyMyPassword/.test(api) && /createIsolatedClient\(\)\.auth\.signInWithPassword/.test(api), 'the password is checked with a throw-away login that saves nothing');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
