// Chat pictures, videos and voice notes are not public any more: the website's Worker (worker/index.js, /m/chat/<file>) hands a file only to somebody who proves, with
// their sign-in token, that they are in the chat that has it (docs/PRIVATE-CHAT-MEDIA.md). A plain <img src> or <video src> can not send that token, so a chat file is
// downloaded here WITH the token and shown from an in-memory "blob" address.
//
// This file has no imports on purpose (it is tested on its own, see scripts/supabase/test-chat-media-client.mjs): the app gives it the way to get the token once, at start
// (configureAuthedMedia, called from services/supabaseApi.ts).
//
//   * a chat file is never fetched without the token, and when the Worker refuses (401 / 404) it is NEVER fetched from any public address instead;
//   * the downloaded bytes live only in memory (never localStorage, IndexedDB or a cache of the service worker), at most CHAT_MEDIA_CACHE_BYTES of them, and are
//     forgotten when the person signs out;
//   * a blob address is released by whoever asked for it (releaseChatMediaUrl) when the picture leaves the screen.

export const CHAT_MEDIA_CACHE_BYTES = 96 * 1024 * 1024;

export interface AuthedMediaDeps {
  /** the signed-in person's access token (null when nobody is signed in) */
  token: () => Promise<string | null>;
  /** the public (publishable) key of the project: sent as the "apikey" header, as for every other request of the app */
  apikey: string;
  /** '' on the website; the full site address inside the Android app */
  origin: string;
  /** replaceable in tests */
  fetchImpl?: typeof fetch;
  /** how long to wait before the one retry of a "not found" (a file sent a moment ago is indexed by the database a moment later) */
  retryDelayMs?: number;
}

export class ChatMediaError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.name = 'ChatMediaError'; this.status = status; }
}

let deps: AuthedMediaDeps = { token: async () => null, apikey: '', origin: '' };
export function configureAuthedMedia(next: AuthedMediaDeps): void { deps = next; }

const cache = new Map<string, Blob>();
const pending = new Map<string, Promise<Blob>>();
let cacheSize = 0;

/** "chat/123-abc.jpg" when this address (a bare key, /m/<key>, /media/<key>, a full address) is a plain chat file; null for anything else (locked files, posts, other folders). */
export function chatMediaKeyOf(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  if (/^(data|blob):/i.test(value)) return null;
  let v = value.split(/[?#]/)[0];
  v = v.replace(/^https?:\/\/[^/]+\//i, '/');
  v = v.replace(/^\/(?:storage\/v1\/object\/(?:public|authenticated)\/(?:media|chatmedia)|m|media)\//, '').replace(/^\/+/, '');
  try { v = decodeURIComponent(v); } catch { return null; }
  if (!/^chat\/[A-Za-z0-9._~@+=-]{1,160}$/.test(v)) return null;
  if (v.endsWith('.sealed')) return null;      // a locked file is ciphertext: opened by SealedAttachment, not here
  return v;
}

function putCache(key: string, blob: Blob): void {
  const before = cache.get(key);
  if (before) { cacheSize -= before.size; cache.delete(key); }
  cache.set(key, blob);
  cacheSize += blob.size;
  for (const [k, b] of cache) {          // oldest first
    if (cacheSize <= CHAT_MEDIA_CACHE_BYTES || cache.size <= 1) break;
    if (k === key) continue;
    cache.delete(k);
    cacheSize -= b.size;
  }
}

/** Forgets every downloaded chat file (signing out). */
export function clearChatMediaCache(): void { cache.clear(); pending.clear(); cacheSize = 0; }
export function hasChatMedia(key: string): boolean { return cache.has(key); }
export function chatMediaCacheStats(): { files: number; bytes: number } { return { files: cache.size, bytes: cacheSize }; }

/** What this phone just uploaded is shown from memory at once (the database has not indexed the new message yet, and downloading your own file again would be a waste). */
export function rememberChatMedia(key: string | null | undefined, blob: Blob): void {
  const k = chatMediaKeyOf(key || '');
  if (k) putCache(k, blob);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function download(key: string): Promise<Blob> {
  const f = deps.fetchImpl || ((...a: Parameters<typeof fetch>) => fetch(...a));
  const url = `${deps.origin}/m/${key.split('/').map(encodeURIComponent).join('/')}`;
  let lastStatus = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await deps.token();
    if (!token) throw new ChatMediaError('Please log in to see this.', 401);
    let res: Response;
    try { res = await f(url, { headers: { Authorization: `Bearer ${token}`, apikey: deps.apikey }, cache: 'no-store', credentials: 'omit' }); }
    catch { throw new ChatMediaError('Could not download this. Check your connection and try again.', 0); }
    if (res.ok) return res.blob();
    lastStatus = res.status;
    if (res.status === 404 || res.status === 401) { await sleep(deps.retryDelayMs ?? 1500); continue; }   // one more try: a new message, or a token that was just renewed
    break;
  }
  throw new ChatMediaError(lastStatus === 404 ? 'This is no longer available.' : lastStatus === 401 ? 'Please log in again to see this.' : 'Could not download this. Please try again.', lastStatus);
}

/** The downloaded file of a chat key (the same file asked twice is fetched once). */
export function loadChatMedia(key: string): Promise<Blob> {
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  let job = pending.get(key);
  if (!job) {
    job = download(key).then((blob) => { putCache(key, blob); return blob; }).finally(() => { pending.delete(key); });
    pending.set(key, job);
  }
  return job;
}

/**
 * A blob address that shows a chat file. `src` is whatever the message holds (a key or an address). The caller MUST give the address back with releaseChatMediaUrl when it is
 * done with it. Throws ChatMediaError when the file can not be opened; for an address that is not a plain chat file it throws too (callers check chatMediaKeyOf first).
 */
export async function fetchChatMediaBlob(src: string, opts: { signal?: AbortSignal } = {}): Promise<string> {
  const key = chatMediaKeyOf(src);
  if (!key) throw new ChatMediaError('Not a chat file.', 0);
  if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const job = loadChatMedia(key);
  const blob = await (opts.signal
    ? Promise.race([job, new Promise<never>((_, reject) => opts.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))])
    : job);
  if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  return URL.createObjectURL(blob);
}

export function releaseChatMediaUrl(url: string | null | undefined): void {
  if (url && url.startsWith('blob:')) { try { URL.revokeObjectURL(url); } catch { /* already gone */ } }
}
