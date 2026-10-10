// Which posts/reels this account has already seen — drives "new things first, then everything else
// shuffled" ordering in the Feed and Reels. The server's own view records are the source of truth
// (merged in by mergeSeen when the feed loads); this keeps a per-account copy on the device so the
// answer is instant, survives a failed/slow request, and updates the moment something is viewed.

type Kind = 'posts' | 'reels';

const MAX_REMEMBERED = 3000; // per kind — oldest views fall off first
const cache = new Map<string, string[]>();

const storageKey = (userId: string, kind: Kind) => `noob_seen_${kind}:${userId}`;

function load(userId: string, kind: Kind): string[] {
  const k = storageKey(userId, kind);
  let list = cache.get(k);
  if (list) return list;
  list = [];
  try {
    const raw = localStorage.getItem(k);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) list = parsed.filter((x) => typeof x === 'string');
  } catch {
    // storage unavailable or corrupt — start empty, the server's copy fills it back in
  }
  cache.set(k, list);
  return list;
}

function save(userId: string, kind: Kind, list: string[]) {
  try {
    localStorage.setItem(storageKey(userId, kind), JSON.stringify(list));
  } catch {
    // storage full/blocked: the in-memory copy still serves this session
  }
}

export function getSeenSet(userId: string, kind: Kind): Set<string> {
  return new Set(load(userId, kind));
}

/** Adds ids to this account's seen list (skipping ones already there). */
export function mergeSeen(userId: string, kind: Kind, ids: string[]) {
  if (!userId || ids.length === 0) return;
  const list = load(userId, kind);
  const have = new Set(list);
  let changed = false;
  for (const id of ids) {
    if (typeof id === 'string' && !have.has(id)) {
      have.add(id);
      list.push(id);
      changed = true;
    }
  }
  if (!changed) return;
  if (list.length > MAX_REMEMBERED) list.splice(0, list.length - MAX_REMEMBERED);
  save(userId, kind, list);
}

export function markSeen(userId: string, kind: Kind, id: string) {
  mergeSeen(userId, kind, [id]);
}

const shuffled = <T,>(arr: T[]): T[] => {
  const next = [...arr];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

interface Orderable {
  id: string;
  userId: string;
  createdAt: string;
}

const time = (x: Orderable) => Date.parse(x.createdAt) || 0;

/** Things this person hasn't seen yet and didn't publish themselves — the ones that go on top. */
export const isFresh = (item: Orderable, userId: string, seen: Set<string>) => item.userId !== userId && !seen.has(item.id);

/**
 * Unseen items first, newest first; everything already seen (and the person's own posts) shuffled
 * behind them.
 */
export function orderUnseenFirst<T extends Orderable>(items: T[], userId: string, kind: Kind): T[] {
  const seen = getSeenSet(userId, kind);
  const fresh = items.filter((i) => isFresh(i, userId, seen)).sort((a, b) => time(b) - time(a));
  const rest = shuffled(items.filter((i) => !isFresh(i, userId, seen)));
  return [...fresh, ...rest];
}

/**
 * Re-lay an already-ordered list after the set of items changed (a new post arrived, one was
 * removed) without moving what's already there: new unseen items — and anything the person just
 * published themselves — go on top, newest first; new already-seen items are shuffled in at the end.
 */
export function mergeIntoOrder<T extends Orderable>(prevIds: string[], items: T[], userId: string, kind: Kind): string[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const kept = prevIds.filter((id) => byId.has(id));
  const keptSet = new Set(kept);
  const added = items.filter((i) => !keptSet.has(i.id));
  if (added.length === 0) return kept;
  const seen = getSeenSet(userId, kind);
  const top = added
    .filter((i) => i.userId === userId || !seen.has(i.id))
    .sort((a, b) => time(b) - time(a))
    .map((i) => i.id);
  const topSet = new Set(top);
  const tail = shuffled(added.filter((i) => !topSet.has(i.id))).map((i) => i.id);
  return [...top, ...kept, ...tail];
}
