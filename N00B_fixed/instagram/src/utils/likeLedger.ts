import { useSyncExternalStore } from 'react';

// ONE place that remembers every like the person has made or taken back (post, reel, video, story, comment ...), so no screen can show an older answer than another.
//
// Why: the heart on the Reels page changed the reel inside the Reels page only. The lists that Explore, the profile and the feed open from were never told, so a like that WAS
// saved looked lost as soon as the person left and came back (and the same hole existed for every kind of content that keeps its own copy). Now every like goes through sendLike
// (utils/likeSync.ts), which writes it here, and every list the app shows is passed through applyLikes before it is drawn.
//
// An entry is kept for 15 minutes (long enough for any list to be fetched again after the server has the like; after that the server's own answer is used) and kept in
// sessionStorage, so a page refresh does not lose it either. An entry whose like was refused by the server is removed.
export type LikeKind = 'post' | 'reel' | 'video' | 'story' | 'comment' | 'track';
interface Entry { isLiked: boolean; likesCount?: number; at: number }

const TTL = 15 * 60 * 1000;
const STORE = 'noob.likeLedger.v1';
const entries = new Map<string, Entry>();
let version = 0;
const listeners = new Set<() => void>();

function load(): void {
  try {
    const raw = sessionStorage.getItem(STORE);
    if (!raw) return;
    const obj = JSON.parse(raw) as Record<string, Entry>;
    const now = Date.now();
    for (const [k, v] of Object.entries(obj)) if (v && typeof v.isLiked === 'boolean' && now - v.at < TTL) entries.set(k, v);
  } catch { /* an unreadable memory is simply empty */ }
}
function save(): void {
  try { sessionStorage.setItem(STORE, JSON.stringify(Object.fromEntries(entries))); } catch { /* not remembered across a refresh */ }
}
if (typeof sessionStorage !== 'undefined') load();

const emit = () => { version++; listeners.forEach((l) => l()); };

/** The person liked (true) or took back (false) something. `likesCount` is the server's number when it is known. */
export function recordLike(key: string, isLiked: boolean, likesCount?: number): void {
  entries.set(key, { isLiked, likesCount, at: Date.now() });
  save();
  emit();
}
/** The server refused: forget it, the lists show what the server says again. */
export function forgetLike(key: string): void {
  if (entries.delete(key)) { save(); emit(); }
}

/** Pure part: the item as it must be shown (the person's own like / unlike wins over an older copy of the item). */
export function withLike<T extends { isLiked?: boolean; likesCount?: number }>(item: T, e: Entry | undefined, now = Date.now()): T {
  if (!e || now - e.at >= TTL) return item;
  const was = !!item.isLiked;
  if (was === e.isLiked && (e.likesCount === undefined || e.likesCount === item.likesCount)) return item;
  const count = e.likesCount !== undefined ? e.likesCount : Math.max(0, (item.likesCount || 0) + (e.isLiked === was ? 0 : e.isLiked ? 1 : -1));
  return { ...item, isLiked: e.isLiked, likesCount: count };
}

/** A list passed through the ledger. Returns the SAME array when nothing changes (so nothing is drawn again for nothing). */
export function applyLikes<T extends { id: string; isLiked?: boolean; likesCount?: number }>(items: readonly T[], kind: LikeKind): T[] {
  if (entries.size === 0) return items as T[];
  let changed = false;
  const out = items.map((i) => { const next = withLike(i, entries.get(`${kind}:${i.id}`)); if (next !== i) changed = true; return next; });
  return changed ? out : (items as T[]);
}
export const applyLike = <T extends { id: string; isLiked?: boolean; likesCount?: number }>(item: T, kind: LikeKind): T => withLike(item, entries.get(`${kind}:${item.id}`));

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
/** Changes every time a like is recorded: a screen that draws a list reads this, so it is drawn again with the new answer. */
export const useLikeLedgerVersion = (): number => useSyncExternalStore(subscribe, () => version, () => version);

/** For tests. */
export function _resetLedger(): void { entries.clear(); version = 0; }
