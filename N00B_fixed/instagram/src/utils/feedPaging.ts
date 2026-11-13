// Home feed, one page at a time (only used when the build switch VITE_FEED_PAGING=1 is on; see docs/FEED-PAGING.md).
// Pure logic with no React and no network, so it is tested in plain node (scripts/supabase/test-feed-paging.mjs):
//   - the cursor (the last row of a page: created_at + id) and the pager that asks the server for the next page;
//   - merging a page into the posts already held (one entry per id, new rows only at the END);
//   - laying an appended page into the frozen Home order without moving what is already there.
import { isFresh, mergeIntoOrder, spreadAuthors } from './seenContent';

export const FIRST_PAGE = 40;          // the Home start-up call
export const NEXT_PAGE = 30;           // every later call
export const NEAR_END = 12;            // ask for more when this few posts are left below what is on screen
export const MIN_UNSEEN = 8;           // fewer unseen posts from others than this in what is loaded: keep fetching (see UNSEEN_FILL_MAX)
export const UNSEEN_FILL_MAX = 100;    // ...but never more than this many posts for that reason alone (a person who has seen everything must not download everything)
export const MAX_LOADED = 500;         // the most a scroll can ever load
export const FULL_LIST_CAP = 200;      // Profile / Explore: what Home loaded in one call before paging, so those screens never show fewer posts than they used to

export interface Cursor { at: string; id: string }
interface Row { id: string; userId: string; createdAt: string }

/** The cursor for "everything after this row" (the server orders by created_at, then id, newest first). */
export const cursorOf = (row: { id: string; createdAt: string } | null | undefined): Cursor | null => (row && row.createdAt && row.id ? { at: row.createdAt, id: row.id } : null);

/** Newest-first comparison used by the server: negative when `a` comes before `b`. Only used by the tests / sanity checks. */
export const compareRows = (a: Row, b: Row): number => {
  const ta = Date.parse(a.createdAt) || 0, tb = Date.parse(b.createdAt) || 0;
  if (ta !== tb) return tb - ta;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
};

/** Adds a page to the posts already held: nothing already held moves or is replaced, ids already held are skipped, new rows go to the end. */
export function mergePages<T extends { id: string }>(prev: readonly T[], page: readonly T[]): { posts: T[]; added: T[] } {
  const have = new Set(prev.map((p) => p.id));
  const added: T[] = [];
  for (const p of page) {
    if (have.has(p.id)) continue;
    have.add(p.id);
    added.push(p);
  }
  return { posts: added.length ? [...prev, ...added] : [...prev], added };
}

export interface LoadMoreInput {
  feedLength: number;      // posts in the list the person is scrolling (after the Home filters)
  visibleCount: number;    // how many of them are drawn
  unseenCount: number;     // unseen posts from other people among everything loaded
  loaded: number;          // how many rows came from the server so far
  ended: boolean;
  inflight: boolean;
}
/** Is it time to ask for the next page? (never while one is on its way, never after the end, never past the cap) */
export function shouldLoadMore(i: LoadMoreInput): boolean {
  if (i.ended || i.inflight || i.loaded >= MAX_LOADED) return false;
  if (i.feedLength - i.visibleCount <= NEAR_END) return true;
  return i.unseenCount < MIN_UNSEEN && i.loaded < UNSEEN_FILL_MAX;
}

/** How many of these are unseen posts of other people (the ones Home puts on top). */
export const countUnseen = (rows: readonly Row[], userId: string, seen: Set<string>): number => rows.filter((r) => isFresh(r, userId, seen)).length;

/**
 * Lays an appended page into the Home order. `appendedIds` are the ids that arrived as an older page; everything else is treated as
 * before (mergeIntoOrder: a new post on top, ...). What is in `prev` is never moved or removed (unless it left `items`), a later page only
 * ever goes AFTER it: its unseen posts first (newest first), then what was seen shuffled, authors spread. One entry per id.
 */
export function mergeIntoOrderPaged<T extends Row>(prev: string[], items: T[], userId: string, kind: 'posts' | 'reels', appendedIds: ReadonlySet<string>, seen: Set<string>, rand: () => number = Math.random): string[] {
  const inPrev = new Set(prev);
  const page = items.filter((i) => appendedIds.has(i.id) && !inPrev.has(i.id));
  const rest = page.length ? items.filter((i) => !(appendedIds.has(i.id) && !inPrev.has(i.id))) : items;
  const base = mergeIntoOrder(prev, rest, userId, kind);
  if (page.length === 0) return dedupe(base);
  const time = (x: Row) => Date.parse(x.createdAt) || 0;
  const fresh = page.filter((i) => isFresh(i, userId, seen)).sort((a, b) => time(b) - time(a));
  const old = page.filter((i) => !isFresh(i, userId, seen));
  for (let i = old.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [old[i], old[j]] = [old[j], old[i]]; }
  const tail = spreadAuthors([...fresh, ...old]).map((i) => i.id);
  return dedupe([...base, ...tail]);
}

export const dedupe = (ids: string[]): string[] => [...new Set(ids)];

export interface FeedPager<T extends Row> {
  /** Starts again from the newest page (start-up, pull-to-refresh, another account). Anything still on its way from before is thrown away. */
  first(): Promise<T[]>;
  /** The next older page; null when there is none / it is not needed / it failed / it was overtaken by first(). One request at a time: callers share it. */
  more(): Promise<T[] | null>;
  state(): { loaded: number; ended: boolean; inflight: boolean; cursor: Cursor | null };
  reset(): void;
}

/**
 * The paging state machine. `fetchPage(limit, cursor)` asks the server (cursor null = the newest page) and must THROW on a failed request.
 * The cursor is always taken from the last row the server sent, never from the screen's state, so a post that was added or removed locally
 * can never make a page skip or repeat rows.
 */
export function createFeedPager<T extends Row>(opts: { fetchPage: (limit: number, cursor: Cursor | null) => Promise<T[]>; firstSize?: number; moreSize?: number; maxLoaded?: number; retryAfterMs?: number; now?: () => number }): FeedPager<T> {
  const firstSize = opts.firstSize ?? FIRST_PAGE, moreSize = opts.moreSize ?? NEXT_PAGE, maxLoaded = opts.maxLoaded ?? MAX_LOADED;
  const retryAfterMs = opts.retryAfterMs ?? 3000, now = opts.now ?? (() => Date.now());
  let gen = 0, cursor: Cursor | null = null, loaded = 0, ended = false, inflight: Promise<T[] | null> | null = null, inflightIsFirst = false, failedAt = 0;
  const seenRows = new Set<string>();

  const run = (limit: number, myGen: number, isFirst: boolean): Promise<T[] | null> => {
    const p = (async () => {
      let rows: T[];
      try { rows = await opts.fetchPage(limit, cursor); } catch (e) { if (myGen === gen) failedAt = now(); if (isFirst) throw e; return null; }
      if (myGen !== gen) return null;                      // overtaken by first()/reset(): this page belongs to an older list
      failedAt = 0;
      loaded += rows.length;
      cursor = cursorOf(rows[rows.length - 1]) || cursor;
      if (rows.length < limit) ended = true;               // a short page is the end (a full last page costs one more, empty, request)
      const fresh = rows.filter((r) => !seenRows.has(r.id));
      for (const r of rows) seenRows.add(r.id);
      return fresh;
    })();
    inflight = p; inflightIsFirst = isFirst;
    const clear = () => { if (inflight === p) inflight = null; };
    p.then(clear, clear);
    return p;
  };

  return {
    first() {
      gen++; cursor = null; loaded = 0; ended = false; failedAt = 0; seenRows.clear(); inflight = null;
      return run(firstSize, gen, true).then((r) => r || []);
    },
    more() {
      if (inflight) return inflightIsFirst ? Promise.resolve(null) : inflight;   // one request at a time, shared (the start-up page is not a "next page")
      if (ended || loaded >= maxLoaded) return Promise.resolve(null);
      if (failedAt && now() - failedAt < retryAfterMs) return Promise.resolve(null);
      return run(Math.min(moreSize, maxLoaded - loaded), gen, false);
    },
    state: () => ({ loaded, ended, inflight: !!inflight, cursor }),
    reset() { gen++; cursor = null; loaded = 0; ended = false; failedAt = 0; seenRows.clear(); inflight = null; }
  };
}
