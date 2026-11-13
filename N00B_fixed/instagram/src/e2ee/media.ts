// Locks a picture, a video or a voice note ON THE SENDER'S DEVICE before it is uploaded, and opens it again on the receiver's device.
// Pure WebCrypto, no React and no network, so it is tested on its own (scripts/supabase/test-e2ee-media.mjs).
//
// The scheme (every part is tested):
//   * every file gets its OWN random 256-bit AES-GCM key and a random 64-bit nonce prefix. The key never leaves the device except inside the
//     already end-to-end encrypted chat payload (see Payload.s in service.ts); the server and the storage only ever see random-looking bytes.
//   * the file is cut into chunks of 1 MiB (the last one may be shorter). Each chunk is locked on its own with AES-GCM:
//       nonce  = 8 random bytes (per file) + the chunk number as 4 bytes  -> a nonce is never used twice with the same key
//       aad    = label + chunk number + number of chunks + total length + chunk size
//     so a chunk can not be moved, repeated, dropped or cut short (the total is bound into every chunk, and the total comes from the
//     authenticated chat payload, not from the file), and a changed bit anywhere makes opening fail. Nothing is ever shown from a file that
//     failed: openBlob() throws before anything is returned.
//   * the stored file is simply chunk 0 + chunk 1 + ..., each chunk being its ciphertext followed by the 16-byte GCM tag. An empty file is one
//     empty chunk (just a tag). So the stored size is always  size + 16 * chunks, which is checked first.
//   * memory: only one 1 MiB chunk is read / decrypted at a time from the source blob; the locked chunks are collected into a Blob (browsers
//     keep large blobs outside the JavaScript heap). The biggest file the app lets through is 48 MB, so a phone holds roughly the file twice
//     at the very peak (locked pieces + the opened result) - fine, and the reason a chunked scheme is used instead of one 48 MB AES-GCM call.
import { b64, unb64 } from './crypto.ts';

export const SEAL_CHUNK = 1024 * 1024;
export const SEAL_TAG = 16;
export const SEAL_MAX_BYTES = 256 * 1024 * 1024;   // refuses nonsense sizes from a damaged / forged descriptor
const LABEL = new TextEncoder().encode('noob-sealed-media-v1');

export type SealedCode = 'damaged' | 'bad-input';
export class SealedMediaError extends Error {
  code: SealedCode;
  constructor(code: SealedCode, message: string) { super(message); this.name = 'SealedMediaError'; this.code = code; }
}

/** Everything needed to open a stored file. Travels ONLY inside the encrypted chat payload. */
export interface SealedMedia {
  v: 1;
  k: string;      // the file's key, base64url, 32 bytes
  iv: string;     // nonce prefix, base64url, 8 bytes
  sz: number;     // size of the original file in bytes
  cs: number;     // chunk size used
  ct: string;     // the original mime type (image/jpeg, video/mp4, audio/webm ...)
  dur?: string;   // voice note length as shown ("0:07")
  w?: number;
  h?: number;
}

/** Where a locked file is kept: a normal object key in the media bucket, in the chat folder, ending in .sealed */
export const SEALED_KEY = /^chat\/[A-Za-z0-9._~@+=-]{1,160}\.sealed$/;
export const isSealedKey = (k: unknown): k is string => typeof k === 'string' && SEALED_KEY.test(k);

const MIME = /^(image|video|audio)\/[a-z0-9][a-z0-9.+-]{0,60}$/i;
export const isSafeMime = (m: unknown): m is string => typeof m === 'string' && MIME.test(m) && !/svg|html|xml|javascript/i.test(m);
export const kindOfMime = (m: string): 'image' | 'video' | 'audio' => (m.startsWith('video/') ? 'video' : m.startsWith('audio/') ? 'audio' : 'image');

const chunkCount = (sz: number, cs: number) => Math.max(1, Math.ceil(sz / cs));
export const sealedSize = (sz: number, cs: number = SEAL_CHUNK): number => sz + SEAL_TAG * chunkCount(sz, cs);

const buf = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

function parseInt0(x: unknown, lo: number, hi: number): number | null {
  return typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi ? x : null;
}

/** A descriptor read from a decrypted payload, or null when it is not a well-formed one (nothing is trusted from it before this). */
export function parseDescriptor(x: unknown): SealedMedia | null {
  if (!x || typeof x !== 'object') return null;
  const d = x as Record<string, unknown>;
  if (d.v !== 1 || typeof d.k !== 'string' || typeof d.iv !== 'string' || !isSafeMime(d.ct)) return null;
  const sz = parseInt0(d.sz, 0, SEAL_MAX_BYTES);
  const cs = parseInt0(d.cs, 4096, 16 * 1024 * 1024);
  if (sz === null || cs === null) return null;
  try { if (unb64(d.k).length !== 32 || unb64(d.iv).length !== 8) return null; } catch { return null; }
  const out: SealedMedia = { v: 1, k: d.k, iv: d.iv, sz, cs, ct: d.ct };
  if (typeof d.dur === 'string' && d.dur.length <= 16) out.dur = d.dur;
  const w = parseInt0(d.w, 1, 20000), h = parseInt0(d.h, 1, 20000);
  if (w !== null && h !== null) { out.w = w; out.h = h; }
  return out;
}

const u32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
function nonce(prefix: Uint8Array, index: number): Uint8Array {
  const out = new Uint8Array(12);
  out.set(prefix, 0);
  out.set(u32(index), 8);
  return out;
}
function aad(index: number, count: number, sz: number, cs: number): Uint8Array {
  const hi = Math.floor(sz / 0x100000000), lo = sz >>> 0;
  const out = new Uint8Array(LABEL.length + 4 + 4 + 8 + 4);
  let o = 0;
  out.set(LABEL, o); o += LABEL.length;
  out.set(u32(index), o); o += 4;
  out.set(u32(count), o); o += 4;
  out.set(u32(hi), o); o += 4;
  out.set(u32(lo), o); o += 4;
  out.set(u32(cs), o);
  return out;
}

export interface SealMeta { ct?: string; dur?: string; w?: number; h?: number }

/** Locks a file. Returns the opaque bytes to upload and the descriptor that goes (only) into the encrypted chat payload. */
export async function sealBlob(file: Blob, meta: SealMeta = {}, onProgress?: (fraction: number) => void): Promise<{ blob: Blob; desc: SealedMedia }> {
  const mime = (meta.ct || file.type || '').toLowerCase();
  if (!isSafeMime(mime)) throw new SealedMediaError('bad-input', 'Only pictures, videos and voice notes can be sent.');
  const sz = file.size;
  if (sz > SEAL_MAX_BYTES) throw new SealedMediaError('bad-input', 'That file is too large.');
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const prefix = crypto.getRandomValues(new Uint8Array(8));
  const key = await crypto.subtle.importKey('raw', buf(rawKey), 'AES-GCM', false, ['encrypt']);
  const count = chunkCount(sz, SEAL_CHUNK);
  const parts: ArrayBuffer[] = [];
  for (let i = 0; i < count; i++) {
    const plain = await file.slice(i * SEAL_CHUNK, Math.min(sz, (i + 1) * SEAL_CHUNK)).arrayBuffer();
    parts.push(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(nonce(prefix, i)), additionalData: buf(aad(i, count, sz, SEAL_CHUNK)), tagLength: 128 }, key, plain));
    onProgress?.((i + 1) / count);
  }
  const desc: SealedMedia = { v: 1, k: b64(rawKey), iv: b64(prefix), sz, cs: SEAL_CHUNK, ct: mime };
  if (meta.dur) desc.dur = meta.dur;
  if (meta.w && meta.h) { desc.w = meta.w; desc.h = meta.h; }
  return { blob: new Blob(parts, { type: 'application/octet-stream' }), desc };
}

/** Opens a stored file. Throws SealedMediaError('damaged') if anything about it is not exactly as it was locked: nothing partial is returned. */
export async function openBlob(stored: Blob, descIn: unknown): Promise<Blob> {
  const desc = parseDescriptor(descIn);
  if (!desc) throw new SealedMediaError('bad-input', 'This attachment cannot be opened.');
  const { sz, cs } = desc;
  const count = chunkCount(sz, cs);
  if (stored.size !== sealedSize(sz, cs)) throw new SealedMediaError('damaged', 'This attachment is damaged, so it is not shown.');
  const key = await crypto.subtle.importKey('raw', buf(unb64(desc.k)), 'AES-GCM', false, ['decrypt']);
  const prefix = unb64(desc.iv);
  const out: ArrayBuffer[] = [];
  try {
    for (let i = 0; i < count; i++) {
      const plainLen = i === count - 1 ? sz - i * cs : cs;
      const start = i * (cs + SEAL_TAG);
      const piece = await stored.slice(start, start + plainLen + SEAL_TAG).arrayBuffer();
      out.push(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf(nonce(prefix, i)), additionalData: buf(aad(i, count, sz, cs)), tagLength: 128 }, key, piece));
    }
  } catch {
    throw new SealedMediaError('damaged', 'This attachment is damaged, so it is not shown.');
  }
  return new Blob(out, { type: desc.ct });
}
