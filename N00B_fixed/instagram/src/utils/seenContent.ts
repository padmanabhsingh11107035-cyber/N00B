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

/** The seen ids in the order they were seen (oldest first, most recently seen last). A copy. */
export function getSeenList(userId: string, kind: Kind): string[] {
  return [...load(userId, kind)];
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

// ---- Home feed variety: a different order on every open / refresh --------------------------------
// Weighted random order WITHOUT replacement (Efraimidis-Spirakis): every item gets key = u^(1/w) with u random in (0,1], and the list is sorted by key,
// biggest first. A bigger weight w means "likely to land near the top", but never "always". All numbers below are the knobs to tune.
export const W_UNSEEN = 8;              // an unseen post from someone else, older than 3 days
export const W_UNSEEN_3D = 10;          // ...younger than 3 days
export const W_UNSEEN_24H = 12;         // ...younger than 24 hours (new content still mostly comes first, but not in a fixed order)
export const W_OWN = 0.3;               // the person's own posts: rarely at the top
export const W_SEEN_MIN = 0.01;         // a post seen most recently (~800x less likely than an unseen one to be early)
export const W_SEEN_RANGE = 0.6;        // how much weight a long-ago-seen post can win back (it tends to W_SEEN_MIN + W_SEEN_RANGE)
export const SEEN_DECAY_POSTS = 60;     // ...and how fast: after ~60 newer views it is back at about 63% of that range
const DAY_MS = 86400000;

export interface WeightedOpts {
  userId: string;
  seenList: readonly string[];          // seen ids, oldest first (see getSeenList)
  now?: number;
  rng?: () => number;
}

/** The weight of one item (see the constants above). rankOf: position from the END of the seen list, 0 = seen most recently. */
export function feedWeight(item: Orderable, userId: string, rankOf: Map<string, number>, now: number): number {
  if (item.userId === userId) return W_OWN;
  const rank = rankOf.get(item.id);
  if (rank === undefined) {
    const age = now - time(item);
    return age < DAY_MS ? W_UNSEEN_24H : age < 3 * DAY_MS ? W_UNSEEN_3D : W_UNSEEN;
  }
  return W_SEEN_MIN + W_SEEN_RANGE * (1 - Math.exp(-rank / SEEN_DECAY_POSTS));
}

/** A fresh weighted-random order of `items` (no duplicates), then one person's posts are spread apart. Pure: same rng, same answer. */
export function weightedFeedOrder<T extends Orderable>(items: T[], opts: WeightedOpts): T[] {
  const rng = opts.rng ?? Math.random, now = opts.now ?? Date.now();
  const rankOf = new Map<string, number>();
  const n = opts.seenList.length;
  opts.seenList.forEach((id, i) => rankOf.set(id, n - 1 - i));
  const done = new Set<string>();
  const keyed: { item: T; key: number }[] = [];
  for (const item of items) {
    if (done.has(item.id)) continue;
    done.add(item.id);
    const w = feedWeight(item, opts.userId, rankOf, now);
    const u = Math.max(rng(), 1e-12);
    keyed.push({ item, key: Math.log(u) / w });   // same order as u^(1/w), without underflow
  }
  keyed.sort((a, b) => b.key - a.key);
  return spreadAuthors(keyed.map((k) => k.item));
}

/**
 * Posts: a new weighted-random order every call (unseen posts mostly first, what was seen recently very unlikely to be early).
 * Reels: unseen items first, newest first; everything already seen (and own) shuffled behind them.
 */
export function orderUnseenFirst<T extends Orderable>(items: T[], userId: string, kind: Kind, rng?: () => number): T[] {
  if (kind === 'posts') return weightedFeedOrder(items, { userId, seenList: getSeenList(userId, kind), rng });
  const seen = getSeenSet(userId, kind);
  const fresh = items.filter((i) => isFresh(i, userId, seen)).sort((a, b) => time(b) - time(a));
  const rest = shuffled(items.filter((i) => !isFresh(i, userId, seen)));
  return spreadAuthors([...fresh, ...rest]);
}

/**
 * Keeps the order, but never lets one person's posts come one after another while somebody else's are waiting:
 * each place takes the first item (in the order given) whose author differs from the one just before it.
 * Someone who uploaded ten posts at once is spread through the feed instead of filling a whole screen.
 */
export function spreadAuthors<T extends { userId: string }>(items: T[]): T[] {
  const left = [...items];
  const out: T[] = [];
  let last = '';
  while (left.length > 0) {
    let at = 0;
    const look = Math.min(left.length, 60);   // look ahead a bit, so a long run by one person does not cost much time
    for (let i = 0; i < look; i++) { if (left[i].userId !== last) { at = i; break; } }
    const [pick] = left.splice(at, 1);
    out.push(pick);
    last = pick.userId;
  }
  return out;
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
  const top = spreadAuthors(added
    .filter((i) => i.userId === userId || !seen.has(i.id))
    .sort((a, b) => time(b) - time(a)))
    .map((i) => i.id);
  const topSet = new Set(top);
  const tail = spreadAuthors(shuffled(added.filter((i) => !topSet.has(i.id)))).map((i) => i.id);
  return [...new Set([...top, ...kept, ...tail])];
}
