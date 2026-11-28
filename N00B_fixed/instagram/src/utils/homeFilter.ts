// The Home filter ("Filters" next to the topic pills): choose what Home shows, in groups like a shop's filter sheet (content, sort, your activity, time, from, extras).
// Pure functions only, so they are tested on their own (scripts/supabase/test-home-filter.mjs). Nothing here reads the network or the screen.
import type { Post } from '../types.ts';

export type HomeKind = 'photos' | 'videos' | 'text' | 'polls' | 'anon' | 'thoughts' | 'longvideos' | 'live';
export type HomeSort = 'default' | 'newest' | 'oldest' | 'viewed' | 'liked' | 'commented' | 'shared' | 'saved';
export type HomeTime = 'any' | 'today' | 'week' | 'month';
export type HomeActivity = 'liked' | 'saved' | 'viewed' | 'unviewed';
export type HomeFrom = 'following' | 'verified' | 'new';
export type HomeExtra = 'music' | 'location' | 'tagged' | 'hashtags' | 'ai';

export interface HomeFilter {
  kinds: HomeKind[];
  sort: HomeSort;
  time: HomeTime;
  activity: HomeActivity[];
  from: HomeFrom[];
  extras: HomeExtra[];
}

export const EMPTY_FILTER: HomeFilter = { kinds: [], sort: 'default', time: 'any', activity: [], from: [], extras: [] };

export interface FilterOption<T extends string> { id: T; label: string; hint?: string }
export const KIND_OPTIONS: FilterOption<HomeKind>[] = [
  { id: 'photos', label: 'Photos', hint: 'Posts with pictures' },
  { id: 'videos', label: 'Videos', hint: 'Posts with a video' },
  { id: 'text', label: 'Text posts' },
  { id: 'longvideos', label: 'Long videos' },
  { id: 'polls', label: 'Polls' },
  { id: 'anon', label: 'Anonymous posts', hint: 'With a picture' },
  { id: 'thoughts', label: 'Thoughts', hint: 'Anonymous, words only' },
  { id: 'live', label: 'Live now' }
];
export const SORT_OPTIONS: FilterOption<HomeSort>[] = [
  { id: 'default', label: 'For you', hint: 'The usual mix' },
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'viewed', label: 'Most viewed', hint: 'By different people' },
  { id: 'liked', label: 'Most liked' },
  { id: 'commented', label: 'Most commented' },
  { id: 'shared', label: 'Most shared' },
  { id: 'saved', label: 'Most saved' }
];
export const ACTIVITY_OPTIONS: FilterOption<HomeActivity>[] = [
  { id: 'liked', label: 'Liked by me' },
  { id: 'saved', label: 'Saved by me' },
  { id: 'viewed', label: 'Already viewed' },
  { id: 'unviewed', label: 'Not viewed yet' }
];
export const TIME_OPTIONS: FilterOption<HomeTime>[] = [
  { id: 'any', label: 'Any time' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' }
];
export const FROM_OPTIONS: FilterOption<HomeFrom>[] = [
  { id: 'following', label: 'People I follow' },
  { id: 'verified', label: 'Verified accounts' },
  { id: 'new', label: 'New people', hint: "Not followed yet" }
];
export const EXTRA_OPTIONS: FilterOption<HomeExtra>[] = [
  { id: 'music', label: 'With music' },
  { id: 'location', label: 'With a place' },
  { id: 'tagged', label: 'With tagged people' },
  { id: 'hashtags', label: 'With hashtags' },
  { id: 'ai', label: 'Made with AI' }
];

/** how many choices are switched on (the sort and the time count when they are not the plain ones) */
export function activeCount(f: HomeFilter): number {
  return f.kinds.length + f.activity.length + f.from.length + f.extras.length + (f.sort !== 'default' ? 1 : 0) + (f.time !== 'any' ? 1 : 0);
}
export const isFiltered = (f: HomeFilter): boolean => activeCount(f) > 0;

const oneOf = <T extends string>(list: T[], id: T): T[] => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
export const toggleKind = (f: HomeFilter, id: HomeKind): HomeFilter => ({ ...f, kinds: oneOf(f.kinds, id) });
export const toggleActivity = (f: HomeFilter, id: HomeActivity): HomeFilter => {
  // "already viewed" and "not viewed yet" can not both be true
  const next = oneOf(f.activity, id);
  return { ...f, activity: id === 'viewed' ? next.filter((x) => x !== 'unviewed') : id === 'unviewed' ? next.filter((x) => x !== 'viewed') : next };
};
export const toggleFrom = (f: HomeFilter, id: HomeFrom): HomeFilter => {
  // "people I follow" and "new people" can not both be true
  const next = oneOf(f.from, id);
  return { ...f, from: id === 'following' ? next.filter((x) => x !== 'new') : id === 'new' ? next.filter((x) => x !== 'following') : next };
};
export const toggleExtra = (f: HomeFilter, id: HomeExtra): HomeFilter => ({ ...f, extras: oneOf(f.extras, id) });

const KINDS: HomeKind[] = KIND_OPTIONS.map((o) => o.id);
const SORTS: HomeSort[] = SORT_OPTIONS.map((o) => o.id);
const TIMES: HomeTime[] = TIME_OPTIONS.map((o) => o.id);
const only = <T extends string>(v: unknown, ok: readonly T[]): T[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is T => ok.includes(x as T)))] : []);

/** a filter read back from storage: anything unknown is dropped, never trusted */
export function readFilter(raw: unknown): HomeFilter {
  const j = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    kinds: only(j.kinds, KINDS),
    sort: SORTS.includes(j.sort as HomeSort) ? (j.sort as HomeSort) : 'default',
    time: TIMES.includes(j.time as HomeTime) ? (j.time as HomeTime) : 'any',
    activity: only(j.activity, ['liked', 'saved', 'viewed', 'unviewed'] as const),
    from: only(j.from, ['following', 'verified', 'new'] as const),
    extras: only(j.extras, ['music', 'location', 'tagged', 'hashtags', 'ai'] as const)
  };
}

// ---- posts
export interface FilterContext { userId: string; following: ReadonlySet<string>; seen: ReadonlySet<string>; now: number; /** how many different people viewed each post (asked from the database when "Most viewed" is chosen) */ views?: Readonly<Record<string, number>> }

/** which of the post kinds this post is (a post can be several: pictures and a video) */
export function postKinds(p: Pick<Post, 'slides' | 'textBgStyle'>): HomeKind[] {
  const out: HomeKind[] = [];
  const slides = p.slides || [];
  if (slides.some((s) => s.mediaType === 'image')) out.push('photos');
  if (slides.some((s) => s.mediaType === 'video')) out.push('videos');
  if (p.textBgStyle || slides.length === 0) out.push('text');
  return out;
}

const WINDOW_MS: Record<HomeTime, number> = { any: Infinity, today: 24 * 3600_000, week: 7 * 24 * 3600_000, month: 30 * 24 * 3600_000 };
const within = (iso: string | undefined, time: HomeTime, now: number): boolean => {
  if (time === 'any') return true;
  const t = Date.parse(String(iso || ''));
  return Number.isFinite(t) && now - t <= WINDOW_MS[time] && t <= now + 5 * 60_000;
};

const POST_KINDS: HomeKind[] = ['photos', 'videos', 'text'];

export function postPasses(p: Post, f: HomeFilter, c: FilterContext): boolean {
  // the content kinds: when only extra kinds (polls, thoughts...) are chosen, no post shows; when post kinds are chosen, a post must be one of them
  if (f.kinds.length) {
    const wanted = f.kinds.filter((k) => POST_KINDS.includes(k));
    if (!wanted.length) return false;
    const mine = postKinds(p);
    if (!wanted.some((k) => mine.includes(k))) return false;
  }
  if (!within(p.createdAt, f.time, c.now)) return false;
  for (const a of f.activity) {
    if (a === 'liked' && !p.isLiked) return false;
    if (a === 'saved' && !p.isSaved) return false;
    if (a === 'viewed' && !c.seen.has(p.id)) return false;
    if (a === 'unviewed' && c.seen.has(p.id)) return false;
  }
  const mineOwn = p.userId === c.userId;
  for (const fr of f.from) {
    if (fr === 'following' && !(c.following.has(p.userId) || mineOwn)) return false;
    if (fr === 'verified' && !p.isVerified) return false;
    if (fr === 'new' && (c.following.has(p.userId) || mineOwn)) return false;
  }
  for (const x of f.extras) {
    if (x === 'music' && !p.audioTrack?.title) return false;
    if (x === 'location' && !p.location) return false;
    if (x === 'tagged' && !((p.taggedUsers && p.taggedUsers.length) || p.isCollab)) return false;
    if (x === 'hashtags' && !(p.hashtags && p.hashtags.length)) return false;
    if (x === 'ai' && !p.hasAiLabel) return false;
  }
  return true;
}

const SORT_KEY: Record<Exclude<HomeSort, 'default' | 'newest' | 'oldest'>, (p: Post, c: FilterContext) => number> = {
  viewed: (p, c) => c.views?.[p.id] || 0,
  liked: (p) => p.likesCount || 0,
  commented: (p) => p.commentsCount || 0,
  shared: (p) => p.sharesCount || 0,
  saved: (p) => p.savesCount || 0
};
const when = (p: Post): number => { const t = Date.parse(p.createdAt); return Number.isFinite(t) ? t : 0; };

/** the posts that pass the filter, in the chosen order (a stable sort: equal ones keep their place; "For you" keeps the feed's own order) */
export function applyHomeFilter(posts: Post[], f: HomeFilter, c: FilterContext): Post[] {
  if (!isFiltered(f)) return posts;
  const kept = posts.filter((p) => postPasses(p, f, c));
  if (f.sort === 'default') return kept;
  const idx = new Map(kept.map((p, i) => [p.id, i] as const));
  const by = (a: Post, b: Post): number => {
    if (f.sort === 'newest') return when(b) - when(a);
    if (f.sort === 'oldest') return when(a) - when(b);
    const key = SORT_KEY[f.sort];
    return key(b, c) - key(a, c);
  };
  return [...kept].sort((a, b) => by(a, b) || (idx.get(a.id)! - idx.get(b.id)!));
}

// ---- the anonymous thoughts, polls, long videos and live streams that sit between the posts
export type MixLike = { kind: 'anon'; at: string; anon: { mediaKey?: string | null; mediaKeys?: string[] | null } } | { kind: 'poll'; at: string } | { kind: 'video'; at: string } | { kind: 'live'; at: string } | { kind: 'featured'; at: string };

export function mixKindOf(item: MixLike): HomeKind {
  if (item.kind === 'anon') return item.anon.mediaKey || (item.anon.mediaKeys && item.anon.mediaKeys.length) ? 'anon' : 'thoughts';
  if (item.kind === 'featured') return 'photos';   // (never used: a featured item passes only when no kind is chosen, see mixPasses)
  return item.kind === 'poll' ? 'polls' : item.kind === 'video' ? 'longvideos' : 'live';
}

/** a thought, poll, video or stream passes when its kind is chosen (or none is) and the time fits; choices that only posts have (activity, from, extras) hide them */
export function mixPasses(item: MixLike, f: HomeFilter, now: number): boolean {
  if (f.activity.length || f.from.length || f.extras.length) return false;
  if (item.kind === 'featured' && f.kinds.length) return false;
  if (f.kinds.length && !f.kinds.includes(mixKindOf(item))) return false;
  return within(item.at, f.time, now);
}
