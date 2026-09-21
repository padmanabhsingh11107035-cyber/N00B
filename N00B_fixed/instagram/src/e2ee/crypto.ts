// End-to-end encryption for chats: the maths, and nothing else (no network, no storage), so it can be tested on its own.
// Everything uses the browser's built-in WebCrypto (also in Node), never home-made cryptography:
//   * every DEVICE has a key pair (ECDH on the P-256 curve); the public half is shared through the server, the private half never leaves the device;
//   * a message is locked with a fresh random 256-bit key (AES-GCM); that key is then locked once for EACH device of EACH person in the
//     chat (and for the sender's own devices), with a wrapping key made from two Diffie-Hellman results: one with a fresh throw-away key
//     (so the wrapping key is different every time) and one with the sender's own device key (so only the sender could have made it: a
//     message can not be forged in someone's name, not even by the server);
//   * the server keeps only the locked message and the locked keys: it can not read a message, and it can not change one without it
//     failing to open.
// What this does NOT give (and the app says so): a ratchet like Signal's ("forward secrecy" for a stolen device key), and it can not stop
// the server from handing out a wrong public key unless people compare their security codes (see securityCode).

const te = new TextEncoder();
const td = new TextDecoder();

export const VERSION = 1;
export const CURVE = 'P-256';
const INFO = 'noob-e2ee-v1';

// ------------------------------------------------------------------------------------------------ small helpers
export const b64 = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const unb64 = (s: string): Uint8Array => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const rand = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));
const hex = (b: Uint8Array): string => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};
// ArrayBuffer view for WebCrypto (the typings want a plain ArrayBuffer-backed array)
const buf = (b: Uint8Array): BufferSource => b as unknown as BufferSource;

export interface PublicJwk { kty: 'EC'; crv: 'P-256'; x: string; y: string }
export interface PrivateJwk extends PublicJwk { d: string }

// A device's key: its short id ("kid", the start of the fingerprint of the public key), the public key and the private key.
export interface DeviceKey { kid: string; publicJwk: PublicJwk; privateJwk: PrivateJwk; createdAt: string; label?: string }

const cleanPublic = (k: { x: string; y: string }): PublicJwk => ({ kty: 'EC', crv: 'P-256', x: k.x, y: k.y });

export const isPublicJwk = (k: any): k is PublicJwk =>
  !!k && k.kty === 'EC' && k.crv === 'P-256' && typeof k.x === 'string' && typeof k.y === 'string' && /^[A-Za-z0-9_-]{43}$/.test(k.x) && /^[A-Za-z0-9_-]{43}$/.test(k.y);

// The fingerprint of a public key: SHA-256 of "x.y". The key's short id is the first 16 hex characters.
export async function fingerprint(pub: PublicJwk): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', buf(te.encode(`${pub.x}.${pub.y}`))));
}
export const kidOf = async (pub: PublicJwk): Promise<string> => hex(await fingerprint(pub)).slice(0, 16);

const importPublic = (pub: PublicJwk) => crypto.subtle.importKey('jwk', cleanPublic(pub), { name: 'ECDH', namedCurve: CURVE }, false, []);
const importPrivate = (priv: PrivateJwk) => crypto.subtle.importKey('jwk', { ...priv, ext: true }, { name: 'ECDH', namedCurve: CURVE }, false, ['deriveBits']);
const dh = async (priv: CryptoKey, pub: CryptoKey): Promise<Uint8Array> => new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256));

async function wrapKey(z1: Uint8Array, z2: Uint8Array, salt: Uint8Array, recipientKid: string, senderKid: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', buf(concat(z1, z2)), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: buf(salt), info: buf(te.encode(`${INFO} wrap|${recipientKid}|${senderKid}`)) },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ------------------------------------------------------------------------------------------------ device keys
export async function generateDeviceKey(label = ''): Promise<DeviceKey> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: CURVE }, true, ['deriveBits']);
  const priv = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as any;
  const publicJwk = cleanPublic(priv);
  return { kid: await kidOf(publicJwk), publicJwk, privateJwk: { ...publicJwk, d: priv.d }, createdAt: new Date().toISOString(), label };
}

// ------------------------------------------------------------------------------------------------ locking and opening a message
export interface Envelope {
  v: number;
  skid: string; // the sender's device key
  epk: { x: string; y: string }; // the throw-away public key of this message
  iv: string;
  ct: string;
  keys: Record<string, { iv: string; w: string }>; // the message key, locked for each device
}

export interface Recipient { kid: string; publicJwk: PublicJwk }

export type E2eeCode = 'no-key' | 'unverified-sender' | 'damaged' | 'bad-input';

export class E2eeError extends Error {
  code: E2eeCode;
  constructor(code: E2eeCode, message: string) {
    super(message);
    this.code = code;
  }
}

export const MAX_RECIPIENT_KEYS = 200;

// Lock a message (any text or JSON) for every device in `recipients` (this must include the sender's own devices).
export async function seal(plaintext: string, opts: { chatId: string; sender: DeviceKey; recipients: Recipient[] }): Promise<Envelope> {
  const { chatId, sender } = opts;
  const recipients = [...new Map(opts.recipients.map((r) => [r.kid, r])).values()];
  if (!recipients.length || recipients.length > MAX_RECIPIENT_KEYS) throw new E2eeError('bad-input', 'Nobody to lock this message for.');
  if (!recipients.some((r) => r.kid === sender.kid)) throw new E2eeError('bad-input', 'The sender\'s own device must be able to read the message.');
  for (const r of recipients) if (!isPublicJwk(r.publicJwk) || r.kid !== (await kidOf(r.publicJwk))) throw new E2eeError('bad-input', 'A public key does not match its id.');

  const K = rand(32);
  const iv = rand(12);
  const aad = te.encode(`${INFO}|${chatId}|${sender.kid}`);
  const aesKey = await crypto.subtle.importKey('raw', buf(K), 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(iv), additionalData: buf(aad) }, aesKey, buf(te.encode(plaintext))));

  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: CURVE }, true, ['deriveBits']);
  const ephPub = cleanPublic((await crypto.subtle.exportKey('jwk', eph.publicKey)) as any);
  const senderPriv = await importPrivate(sender.privateJwk);
  const keys: Envelope['keys'] = {};
  for (const r of recipients) {
    const rpub = await importPublic(r.publicJwk);
    const wk = await wrapKey(await dh(eph.privateKey, rpub), await dh(senderPriv, rpub), iv, r.kid, sender.kid);
    const ivW = rand(12);
    const w = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(ivW), additionalData: buf(te.encode(r.kid)) }, wk, buf(K)));
    keys[r.kid] = { iv: b64(ivW), w: b64(w) };
  }
  return { v: VERSION, skid: sender.kid, epk: { x: ephPub.x, y: ephPub.y }, iv: b64(iv), ct: b64(ct), keys };
}

export const isEnvelope = (e: any): e is Envelope =>
  !!e && typeof e === 'object' && e.v === VERSION && typeof e.skid === 'string' && typeof e.iv === 'string' && typeof e.ct === 'string' &&
  !!e.epk && typeof e.epk.x === 'string' && typeof e.epk.y === 'string' && !!e.keys && typeof e.keys === 'object' && !Array.isArray(e.keys);

// Open a message with any of this device's keys. `senderPublic` finds the sender's public key for the key id in the envelope (from the
// server's key directory, remembered the first time); when it can not, the message is not opened: it can not be trusted to be theirs.
export async function open(env: unknown, opts: { chatId: string; ring: DeviceKey[]; senderPublic: (skid: string) => Promise<PublicJwk | null> }): Promise<string> {
  if (!isEnvelope(env)) throw new E2eeError('damaged', 'This is not an encrypted message.');
  const mine = opts.ring.find((k) => env.keys[k.kid]);
  if (!mine) throw new E2eeError('no-key', 'This message was not locked for this device.');
  const spub = await opts.senderPublic(env.skid);
  if (!spub || !isPublicJwk(spub) || env.skid !== (await kidOf(spub))) throw new E2eeError('unverified-sender', 'The sender\'s key could not be checked.');
  try {
    const priv = await importPrivate(mine.privateJwk);
    const ephPub = await importPublic(cleanPublic(env.epk));
    const iv = unb64(env.iv);
    const wk = await wrapKey(await dh(priv, ephPub), await dh(priv, await importPublic(spub)), iv, mine.kid, env.skid);
    const entry = env.keys[mine.kid];
    const K = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf(unb64(entry.iv)), additionalData: buf(te.encode(mine.kid)) }, wk, buf(unb64(entry.w))));
    const aesKey = await crypto.subtle.importKey('raw', buf(K), 'AES-GCM', false, ['decrypt']);
    const aad = te.encode(`${INFO}|${opts.chatId}|${env.skid}`);
    return td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf(iv), additionalData: buf(aad) }, aesKey, buf(unb64(env.ct))));
  } catch {
    // wrong chat, a changed message, a forged sender, a damaged envelope: all look the same and all fail closed
    throw new E2eeError('damaged', 'This message could not be opened (it was changed, or it is not from who it says).');
  }
}

// ------------------------------------------------------------------------------------------------ security codes
// A number two people can compare (in person, or over a call) to be sure nobody is in the middle: 12 groups of 5 digits made from all the
// keys of both people. Both see the same number.
export async function securityCode(mineKids: string[], theirsKids: string[]): Promise<string> {
  const a = [...mineKids].sort().join(',');
  const b = [...theirsKids].sort().join(',');
  const [x, y] = a < b ? [a, b] : [b, a];
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-512', buf(te.encode(`${INFO} code|${x}|${y}`))));
  const groups: string[] = [];
  for (let i = 0; i < 12; i++) {
    const n = ((digest[i * 4] << 24) | (digest[i * 4 + 1] << 16) | (digest[i * 4 + 2] << 8) | digest[i * 4 + 3]) >>> 0;
    groups.push(String(n % 100000).padStart(5, '0'));
  }
  return groups.join(' ');
}

// A short summary of a person's set of keys, so "their keys changed" can be noticed.
export async function keySetFingerprint(kids: string[]): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf(te.encode([...kids].sort().join(',')))));
  return hex(d).slice(0, 16);
}

// ------------------------------------------------------------------------------------------------ the passphrase backup of a device's keys
export const BACKUP_ITERATIONS = 600_000;

export interface Backup { v: number; salt: string; iterations: number; iv: string; ct: string }

// How good a backup passphrase is (the backup is only as strong as this: whoever gets the backup can try passphrases offline).
export function passphraseProblem(pass: string): string | null {
  const p = pass ?? '';
  if (p.length < 10) return 'Use at least 10 characters (a few words together is ideal).';
  if (new Set(p.toLowerCase()).size < 5) return 'That passphrase is too repetitive.';
  if (/^(1234567890|0123456789|qwertyuiop|password\d*|passphrase|iloveyou\d*|abcdefghij)/i.test(p)) return 'That passphrase is too easy to guess.';
  if (/^\d+$/.test(p)) return 'Add letters: a passphrase of only digits is easy to guess.';
  return null;
}

const passKey = async (pass: string, salt: Uint8Array, iterations: number) => {
  const base = await crypto.subtle.importKey('raw', buf(te.encode(pass.normalize('NFKC'))), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: buf(salt), iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
};

export async function makeBackup(ring: DeviceKey[], pass: string, iterations = BACKUP_ITERATIONS): Promise<Backup> {
  const problem = passphraseProblem(pass);
  if (problem) throw new E2eeError('bad-input', problem);
  const salt = rand(16);
  const iv = rand(12);
  const key = await passKey(pass, salt, iterations);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(iv), additionalData: buf(te.encode(`${INFO} backup`)) }, key, buf(te.encode(JSON.stringify(ring)))));
  return { v: VERSION, salt: b64(salt), iterations, iv: b64(iv), ct: b64(ct) };
}

export const isBackup = (b: any): b is Backup =>
  !!b && b.v === VERSION && typeof b.salt === 'string' && typeof b.iv === 'string' && typeof b.ct === 'string' && Number.isInteger(b.iterations) && b.iterations >= 100_000 && b.iterations <= 5_000_000;

export async function readBackup(backup: unknown, pass: string): Promise<DeviceKey[]> {
  if (!isBackup(backup)) throw new E2eeError('damaged', 'The backup is not valid.');
  try {
    const key = await passKey(pass, unb64(backup.salt), backup.iterations);
    const plain = td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf(unb64(backup.iv)), additionalData: buf(te.encode(`${INFO} backup`)) }, key, buf(unb64(backup.ct))));
    const ring = JSON.parse(plain) as DeviceKey[];
    if (!Array.isArray(ring) || !ring.every((k) => k && typeof k.kid === 'string' && isPublicJwk(k.publicJwk) && k.privateJwk && typeof k.privateJwk.d === 'string')) throw new Error('shape');
    for (const k of ring) if (k.kid !== (await kidOf(k.publicJwk))) throw new Error('kid');
    return ring;
  } catch {
    throw new E2eeError('damaged', 'Wrong passphrase, or the backup is damaged.');
  }
}
