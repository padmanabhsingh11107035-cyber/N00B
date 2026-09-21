// The end-to-end encryption service of the app: keeps this device's key, finds who a chat is locked for, locks and opens messages, and
// looks after the passphrase backup. It talks to the server only through `deps.rpc` and stores keys only through `deps.storeFor`, so the whole
// thing is tested on its own (against the real database rules) without a browser.
//
// The rules it keeps (each one is tested):
//   * a chat that CAN be locked is never sent unlocked: if locking fails, the message fails (it is not silently sent readable);
//   * a chat that can not be locked (the public Lounge, the AI chat, very large groups, a member who has no key yet) is sent as before,
//     and the app says so;
//   * a device key is only ever created when the key store was really read and really empty, and saving only ever adds keys;
//   * everything fails safe: a message that can not be opened is shown as locked, never as garbage or as somebody else's words.
import * as C from './crypto.ts';
import type { DeviceKey, Envelope, PublicJwk, Recipient } from './crypto.ts';
import { mergeRings, type KeyStore, type StoredRing } from './keyring.ts';

export interface E2eeDeps {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<any>;
  userId: () => Promise<string | null>;
  storeFor: (userId: string) => KeyStore;
  // remembers, per pair of people, the last set of keys seen (so a change can be pointed out)
  seen: { get(key: string): string | null; set(key: string, value: string): void };
  lock?: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
  now?: () => number;
  deviceLabel?: () => string;
}

// What is inside a locked message. Text messages carry only "t"; a GIF or sticker (a link to a picture somewhere else) also carries "m" / "mt".
export interface Payload { t: string; m?: string; mt?: string }

export const encodePayload = (p: Payload): string => JSON.stringify(p.m ? { t: p.t, m: p.m, mt: p.mt } : { t: p.t });
export function decodePayload(s: string): Payload {
  try {
    const j = JSON.parse(s);
    if (j && typeof j === 'object' && typeof j.t === 'string') {
      return { t: j.t, ...(typeof j.m === 'string' && /^https:\/\//.test(j.m) ? { m: j.m, mt: typeof j.mt === 'string' ? j.mt : 'image' } : {}) };
    }
  } catch { /* not JSON: treated as plain text below */ }
  return { t: s };
}

export type ChatReason = 'ok' | 'public' | 'large' | 'missing' | 'off' | 'blocked';

export interface ChatCrypto {
  encryptable: boolean;
  // true when this chat is one that should be locked but THIS device can not do it right now (no usable key store): the message must fail, not go out readable
  mustLock: boolean;
  reason: ChatReason;
  isGroup: boolean;
  missing: string[]; // usernames of members with no key yet
  members: { userId: string; username: string; keys: Recipient[] }[];
  // for a chat with one other person: their security code and whether their keys changed since you last looked
  peer?: { userId: string; username: string; code: string; changed: boolean; fingerprint: string };
}

// ("ok" true: payload is set; "ok" false: code says why it stayed locked)
export interface Opened { ok: boolean; payload?: Payload; code?: 'no-key' | 'unverified-sender' | 'damaged' }

export interface KeyStatus {
  available: boolean;
  thisDevice: string | null;
  devices: { kid: string; label: string; active: boolean; createdAt: string; thisDevice: boolean }[];
  hasBackup: boolean;
  backupAt: string | null;
}

const RETRY_MS = 60_000;
const MEMBER_TTL_MS = 30_000;
const DIRECTORY_TTL_MS = 15_000;
const CACHE_MAX = 3000;

export const isMissingFunction = (e: any): boolean =>
  !!e && (e.code === 'PGRST202' || e.code === '42883' || /could not find the function|schema cache|does not exist/i.test(String(e.message || '')));

export function createE2ee(deps: E2eeDeps) {
  const lock = deps.lock ?? (async <T>(_n: string, fn: () => Promise<T>) => fn());
  const now = deps.now ?? (() => Date.now());

  type Ready = { ok: boolean; reason?: 'off' | 'blocked' };
  const states = new Map<string, { ring: StoredRing | null; ready: Ready | null; at: number; pending: Promise<Ready> | null }>();
  const state = (userId: string) => {
    let s = states.get(userId);
    if (!s) { s = { ring: null, ready: null, at: 0, pending: null }; states.set(userId, s); }
    return s;
  };

  // ------------------------------------------------------------------------------------------ this device's keys
  async function loadRing(userId: string): Promise<StoredRing> {
    const s = state(userId);
    if (s.ring) return s.ring;
    s.ring = await deps.storeFor(userId).load();
    return s.ring;
  }

  const currentKey = (ring: StoredRing): DeviceKey | null => ring.keys.find((k) => k.kid === ring.current) ?? null;

  // Make sure this device has a key and that the server knows its PUBLIC half. Cheap after the first time (cached), retried after a minute on failure.
  async function ensure(userId: string): Promise<Ready> {
    const s = state(userId);
    if (s.ready && (s.ready.ok || now() - s.at < RETRY_MS)) return s.ready;
    if (s.pending) return s.pending; // several calls at once share one set-up (never two keys)
    s.pending = setUp(userId);
    try { return await s.pending; } finally { s.pending = null; }
  }

  async function setUp(userId: string): Promise<Ready> {
    const s = state(userId);
    const result = await lock(`noob-e2ee-${userId}`, async (): Promise<Ready> => {
      let ring: StoredRing;
      const store = deps.storeFor(userId);
      try {
        ring = await store.load();
        if (!currentKey(ring)) {
          const key = await C.generateDeviceKey(deps.deviceLabel?.() || '');
          ring = mergeRings(ring, { v: 1, current: key.kid, keys: [key] });
          ring.current = key.kid;
          await store.save(ring);
          ring = await store.load();
        }
      } catch { return { ok: false, reason: 'blocked' }; }
      s.ring = ring;
      const key = currentKey(ring);
      if (!key) return { ok: false, reason: 'blocked' };
      try {
        await deps.rpc('register_chat_key', { p_kid: key.kid, p_key: key.publicJwk, p_label: key.label || '' });
      } catch (e: any) {
        return { ok: false, reason: isMissingFunction(e) ? 'off' : 'blocked' };
      }
      return { ok: true };
    });
    s.ready = result;
    s.at = now();
    if (result.ok) chatCache.clear(); // what was learned about chats before this device had a key is out of date
    return result;
  }

  // ------------------------------------------------------------------------------------------ who a chat is locked for
  const chatCache = new Map<string, { at: number; data: any }>();

  async function memberKeys(chatId: string): Promise<any> {
    const hit = chatCache.get(chatId);
    if (hit && now() - hit.at < MEMBER_TTL_MS) return hit.data;
    const data = await deps.rpc('chat_member_keys', { p_chat: chatId });
    chatCache.set(chatId, { at: now(), data });
    return data;
  }

  const offState = (reason: ChatReason): ChatCrypto => ({ encryptable: false, mustLock: false, reason, isGroup: false, missing: [], members: [] });

  async function chatCrypto(chatId: string, force = false): Promise<ChatCrypto> {
    const me = await deps.userId();
    if (!me) return offState('off');
    const ready = await ensure(me);
    if (!ready.ok && ready.reason === 'off') return offState('off');
    if (force) chatCache.delete(chatId);
    let raw: any;
    try { raw = await memberKeys(chatId); } catch (e: any) {
      if (isMissingFunction(e)) return offState('off');
      throw e; // the server could not be asked: the caller must not guess "not locked"
    }
    const members = (Array.isArray(raw?.members) ? raw.members : []).map((m: any) => ({
      userId: String(m.userId),
      username: String(m.username || ''),
      keys: (Array.isArray(m.keys) ? m.keys : []).map((k: any) => ({ kid: String(k.kid), publicJwk: k.key as PublicJwk }))
    }));
    const reason: ChatReason = raw?.reason === 'ok' || raw?.reason === 'public' || raw?.reason === 'large' || raw?.reason === 'missing' ? raw.reason : 'off';
    const out: ChatCrypto = {
      encryptable: !!raw?.encryptable && reason === 'ok',
      mustLock: false,
      reason,
      isGroup: !!raw?.isGroup,
      missing: members.filter((m: any) => !m.keys.length).map((m: any) => m.username),
      members
    };
    if (!ready.ok) {
      // this device could not set itself up (its key store is unusable): the server is still asked, so that a chat which should be locked
      // is refused instead of being sent readable. (If only this device lacks a key, the chat is one that is locked for everybody else.)
      const onlyMeMissing = members.filter((m: any) => !m.keys.length).every((m: any) => m.userId === me);
      return { ...out, encryptable: false, mustLock: (reason === 'ok' || reason === 'missing') && onlyMeMissing && members.length > 0, reason: 'blocked' };
    }
    if (out.encryptable && !out.isGroup) {
      const mine = members.find((m: any) => m.userId === me);
      const other = members.find((m: any) => m.userId !== me);
      if (mine && other && other.keys.length) {
        const theirKids = other.keys.map((k: Recipient) => k.kid);
        const fingerprint = await C.keySetFingerprint(theirKids);
        const seenKey = `${me}:${other.userId}`;
        const before = deps.seen.get(seenKey);
        if (before === null) deps.seen.set(seenKey, fingerprint);
        out.peer = {
          userId: other.userId,
          username: other.username,
          code: await C.securityCode(mine.keys.map((k: Recipient) => k.kid), theirKids),
          changed: before !== null && before !== fingerprint,
          fingerprint
        };
      }
    }
    return out;
  }

  // For SENDING: who the chat is locked for is asked afresh each time (a device that joined a moment ago, or was switched off, must count at once);
  // only the public Lounge, which never changes, is remembered.
  async function chatCryptoForSend(chatId: string): Promise<ChatCrypto> {
    const hit = chatCache.get(chatId);
    return chatCrypto(chatId, !(hit && hit.data?.reason === 'public'));
  }

  // "I have looked at their new code": stops the change notice for this person.
  async function acknowledge(peerUserId: string, fingerprint: string): Promise<void> {
    const me = await deps.userId();
    if (me) deps.seen.set(`${me}:${peerUserId}`, fingerprint);
  }

  // ------------------------------------------------------------------------------------------ locking a message
  // `known`: the answer of chatCryptoForSend when the caller has just asked (so a message costs one question to the server, not two)
  async function encrypt(chatId: string, payload: Payload, known?: ChatCrypto): Promise<Envelope> {
    const me = await deps.userId();
    if (!me) throw new C.E2eeError('bad-input', 'Please log in.');
    const info = known ?? (await chatCryptoForSend(chatId));
    if (!info.encryptable) throw new C.E2eeError('bad-input', info.mustLock ? 'This device can not keep chat keys (private browsing?), so it can not send private messages. Use a normal browser window.' : 'This chat is not end-to-end encrypted.');
    const ring = await loadRing(me);
    const key = currentKey(ring);
    if (!key) throw new C.E2eeError('no-key', 'This device has no chat key.');
    const recipients = info.members.flatMap((m) => m.keys);
    return C.seal(encodePayload(payload), { chatId, sender: key, recipients });
  }

  // ------------------------------------------------------------------------------------------ opening a message
  const directory = new Map<string, { at: number; keys: Map<string, PublicJwk> }>();

  const asking = new Map<string, Promise<Map<string, PublicJwk>>>();

  async function senderKey(userId: string, kid: string): Promise<PublicJwk | null> {
    const entry = directory.get(userId);
    const known = entry?.keys.get(kid);
    if (known) return known;
    if (entry && now() - entry.at < DIRECTORY_TTL_MS) return null;
    // many messages of one sender open at once: they share one question to the server
    let pending = asking.get(userId);
    if (!pending) {
      pending = deps.rpc('chat_keys_of', { p_user: userId }).then((list: any) => {
        const keys = new Map<string, PublicJwk>();
        for (const k of Array.isArray(list) ? list : []) if (k && typeof k.kid === 'string' && C.isPublicJwk(k.key)) keys.set(k.kid, k.key);
        directory.set(userId, { at: now(), keys });
        return keys;
      }).finally(() => { asking.delete(userId); });
      asking.set(userId, pending);
    }
    return (await pending).get(kid) ?? null;
  }

  const opened = new Map<string, { iv: string; result: Opened }>();
  const remember = (id: string, iv: string, result: Opened) => {
    if (opened.size >= CACHE_MAX) opened.delete(opened.keys().next().value as string);
    opened.set(id, { iv, result });
  };

  async function open(chatId: string, messageId: string, senderId: string, envelope: unknown): Promise<Opened> {
    if (!C.isEnvelope(envelope)) return { ok: false, code: 'damaged' };
    const hit = opened.get(messageId);
    if (hit && hit.iv === envelope.iv) return hit.result;
    const me = await deps.userId();
    if (!me) return { ok: false, code: 'no-key' };
    let ring: StoredRing;
    try { ring = await loadRing(me); } catch { return { ok: false, code: 'no-key' }; }
    try {
      // (a message from one of my own devices is checked against the keys held right here; anyone else's against the server's key directory)
      const senderPublic = async (skid: string) => (senderId === me ? ring.keys.find((k) => k.kid === skid)?.publicJwk : undefined) ?? senderKey(senderId, skid);
      const text = await C.open(envelope, { chatId, ring: ring.keys, senderPublic });
      const result: Opened = { ok: true, payload: decodePayload(text) };
      remember(messageId, envelope.iv, result);
      return result;
    } catch (e: any) {
      const code = e instanceof C.E2eeError && e.code !== 'bad-input' ? e.code : 'unverified-sender';
      const result: Opened = { ok: false, code };
      // a sender key that could not be fetched (offline) is tried again next time; the others will never change
      if (code !== 'unverified-sender') remember(messageId, envelope.iv, result);
      return result;
    }
  }

  // The plain content of a message this device has already opened (for editing and for translating).
  const payloadOf = (messageId: string): Payload | null => {
    const hit = opened.get(messageId);
    return hit && hit.result.ok ? hit.result.payload : null;
  };

  // ------------------------------------------------------------------------------------------ devices and the backup
  async function status(): Promise<KeyStatus> {
    const me = await deps.userId();
    const none: KeyStatus = { available: false, thisDevice: null, devices: [], hasBackup: false, backupAt: null };
    if (!me) return none;
    const ready = await ensure(me);
    if (!ready.ok) return none;
    const ring = await loadRing(me);
    let res: any;
    try { res = await deps.rpc('my_chat_keys'); } catch { return none; }
    const cur = ring.current;
    return {
      available: true,
      thisDevice: cur,
      devices: (Array.isArray(res?.keys) ? res.keys : []).map((k: any) => ({
        kid: String(k.kid), label: String(k.label || ''), active: !!k.active, createdAt: String(k.createdAt || ''), thisDevice: k.kid === cur
      })),
      hasBackup: !!res?.hasBackup,
      backupAt: res?.backupAt || null
    };
  }

  async function removeDevice(kid: string): Promise<void> {
    const me = await deps.userId();
    if (!me) return;
    const ring = await loadRing(me);
    if (ring.current === kid) throw new C.E2eeError('bad-input', 'That is this device: it can not be switched off from here.');
    await deps.rpc('remove_chat_key', { p_kid: kid });
    chatCache.clear();
  }

  // Lock every key of this device's ring with a passphrase only the person knows and keep the locked copy on the server.
  async function saveBackup(passphrase: string): Promise<void> {
    const me = await deps.userId();
    if (!me) throw new C.E2eeError('bad-input', 'Please log in.');
    const ready = await ensure(me);
    if (!ready.ok) throw new C.E2eeError('bad-input', 'Chat encryption is not available on this device.');
    const ring = await loadRing(me);
    const blob = await C.makeBackup(ring.keys, passphrase);
    await deps.rpc('save_chat_key_backup', { p_blob: blob });
  }

  // Bring the keys of the backup onto this device (so older messages open here too). Returns how many keys were new to this device.
  async function restoreBackup(passphrase: string): Promise<number> {
    const me = await deps.userId();
    if (!me) throw new C.E2eeError('bad-input', 'Please log in.');
    const res = await deps.rpc('get_chat_key_backup');
    if (!res?.backup) throw new C.E2eeError('bad-input', 'There is no key backup for this account.');
    const restored = await C.readBackup(res.backup, passphrase);
    const store = deps.storeFor(me);
    const before = await store.load();
    const merged = mergeRings(before, { v: 1, current: null, keys: restored });
    merged.current = before.current;
    await store.save(merged);
    const s = state(me);
    s.ring = await store.load();
    opened.clear();
    return s.ring.keys.length - before.keys.length;
  }

  async function deleteBackup(): Promise<void> {
    await deps.rpc('delete_chat_key_backup');
  }

  return {
    ensure, chatCrypto, chatCryptoForSend, acknowledge, encrypt, open, payloadOf, status, removeDevice, saveBackup, restoreBackup, deleteBackup,
    invalidate: (chatId?: string) => { if (chatId) chatCache.delete(chatId); else chatCache.clear(); },
    // for tests
    _peek: () => ({ opened: opened.size, chats: chatCache.size })
  };
}

export type E2ee = ReturnType<typeof createE2ee>;
