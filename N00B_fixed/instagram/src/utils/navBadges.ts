import { useEffect, useMemo, useState } from 'react';

// The red numbers on the bottom bar: how many NEW things are waiting on a page since the person last had it open (new posts from people they follow on Home, new reels on Reels,
// unread messages on Chat ...). "New" is measured against the newest thing the person has already seen, taken from the content's own time, never from the phone's clock, so a
// phone with the wrong time still counts right. Opening the page (and staying on it while more arrives) clears it.
const KEY = (uid: string, name: string) => `noob.seen.${uid}.${name}`;

function readSeen(uid: string, name: string): number | null {
  try { const v = localStorage.getItem(KEY(uid, name)); const n = v ? Number(v) : NaN; return Number.isFinite(n) ? n : null; } catch { return null; }
}
function writeSeen(uid: string, name: string, at: number): void {
  try { localStorage.setItem(KEY(uid, name), String(at)); } catch { /* the number just starts again next time */ }
}

export interface Dated { userId: string; createdAt?: string }
const at = (i: Dated): number => { const t = Date.parse(i.createdAt || ''); return Number.isFinite(t) ? t : 0; };

/** Pure part: how many of `items` are newer than `since`, not made by `uid`, and pass `only`. */
export function countNewSince<T extends Dated>(items: readonly T[], since: number, uid: string, only?: (i: T) => boolean): number {
  let n = 0;
  for (const i of items) if (i.userId !== uid && at(i) > since && (!only || only(i))) n++;
  return n;
}

/** The newest time among the items (0 when there are none). */
export const newestOf = (items: readonly Dated[]): number => items.reduce((m, i) => Math.max(m, at(i)), 0);

/** How many new items are waiting on a page. `active` = the person is on that page right now (nothing is waiting there). */
export function useNewSince<T extends Dated>(items: readonly T[], opts: { uid: string; name: string; active: boolean; only?: (i: T) => boolean }): number {
  const { uid, name, active, only } = opts;
  const [seen, setSeen] = useState<number | null>(() => (uid ? readSeen(uid, name) : null));
  const newest = useMemo(() => newestOf(items), [items]);
  // another account, or the first time ever: start from what is there now (nothing is "new" on the very first look)
  useEffect(() => { if (uid) setSeen(readSeen(uid, name)); }, [uid, name]);
  useEffect(() => {
    if (!uid || newest === 0) return;
    const stored = readSeen(uid, name);
    if (stored === null || (active && newest > stored)) { writeSeen(uid, name, newest); setSeen(newest); }
  }, [uid, name, active, newest]);
  return useMemo(() => (uid && seen !== null && !active ? countNewSince(items, seen, uid, only) : 0), [items, seen, uid, active, only]);
}
