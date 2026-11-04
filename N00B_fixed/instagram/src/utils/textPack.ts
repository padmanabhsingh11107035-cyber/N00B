// Text compressor: lossless (every character comes back exactly, in every language, emoji and line break included), so quality can not change.
// Deflate at its strongest level, helped by a built-in dictionary of very common English, Hinglish and chat words so that even short messages shrink.
// It only ever makes text smaller: when the packed form would not be smaller, the text is kept as it is. Packed data starts with a four-byte mark that
// plain text can not start with, so old (never packed) text and packed text can live side by side and are told apart by the mark alone.
//
// Where it is used: inside src/e2ee/crypto.ts (before a message is locked and after it is opened). The server only ever sees locked bytes there, so it
// never needs to read the text. It is NOT applied to text the server reads itself (message previews, notifications, search, moderation): that text must stay
// readable on the server.
import { deflateRaw, inflateRaw } from 'pako';

const te = new TextEncoder();
const td = new TextDecoder();

// Words and short phrases that come up all the time (the compressor can point back into this list). Order matters a little: the most common last.
const DICTIONARY = te.encode(
  'because anything something everyone tomorrow tonight please thanks thank welcome sorry hello message photo video story reel comment follow ' +
  'friends friend people today would could should about there their they them then than when where which while with without from have been were what your ' +
  'this that just like love good nice great happy really very much more some will can not but and the you for are was ' +
  'kya hai hain nahi nhi haan han accha acha theek thik bhai yaar kaise kaisa kab kahan kyun kyu mera meri tera teri aap tum main hum ' +
  'bahut bohot abhi phir fir bas sab kuch kar karo karna ho hoga hogi tha thi the ki ke ka ko se me mein par pe aur ya ' +
  ' lol omg ok okay yes no hmm haha hehe :) :D <3 ... !!! ??? \n\n http https www .com @ # ' +
  'I\'m don\'t can\'t it\'s that\'s you\'re i\'ll i\'m ',
);

const MARK = [0x01, 0x4e, 0x50, 0x31]; // 0x01 'N' 'P' '1'
const STORED = 0x30; // the mark's last byte '0': "stored as it is" (only for text that itself begins with the mark)
const MIN_BYTES = 48; // shorter than this never gets smaller once the mark is added

/** Packs bytes when that makes them smaller; otherwise returns them untouched. */
export function packBytes(raw: Uint8Array): Uint8Array {
  const looksPacked = isPacked(raw) || (raw.length >= MARK.length && raw[0] === MARK[0] && raw[1] === MARK[1] && raw[2] === MARK[2] && raw[3] === STORED);
  if (raw.length < MIN_BYTES) return looksPacked ? stored(raw) : raw;
  try {
    const z = deflateRaw(raw, { level: 9, memLevel: 9, dictionary: DICTIONARY } as Parameters<typeof deflateRaw>[1]);
    if (z.length + MARK.length >= raw.length) return looksPacked ? stored(raw) : raw;
    const out = new Uint8Array(MARK.length + z.length);
    out.set(MARK, 0);
    out.set(z, MARK.length);
    return out;
  } catch {
    return looksPacked ? stored(raw) : raw; // never lose text because packing failed
  }
}

// Text that happens to begin with the mark itself gets the mark of "stored" in front, so it can never be mistaken for packed data.
function stored(raw: Uint8Array): Uint8Array {
  const out = new Uint8Array(MARK.length + raw.length);
  out.set([MARK[0], MARK[1], MARK[2], STORED], 0);
  out.set(raw, MARK.length);
  return out;
}

/** True when these bytes are packed text. */
export const isPacked = (b: Uint8Array): boolean => b.length > MARK.length && b[0] === MARK[0] && b[1] === MARK[1] && b[2] === MARK[2] && b[3] === MARK[3];

/** Gives back the original bytes of packed text; bytes that were never packed are returned as they are. Throws when packed data is damaged. */
export function unpackBytes(b: Uint8Array): Uint8Array {
  if (b.length >= MARK.length && b[0] === MARK[0] && b[1] === MARK[1] && b[2] === MARK[2] && b[3] === STORED) return b.subarray(MARK.length);
  if (!isPacked(b)) return b;
  return inflateRaw(b.subarray(MARK.length), { dictionary: DICTIONARY } as Parameters<typeof inflateRaw>[1]);
}

/** Text -> bytes ready to store (packed when smaller). */
export const packText = (text: string): Uint8Array => packBytes(te.encode(text));

/** Bytes from packText (or plain UTF-8 bytes of old text) -> the original text. */
export const unpackText = (b: Uint8Array): string => td.decode(unpackBytes(b));
