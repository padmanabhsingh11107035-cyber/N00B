// What the home-page story tray shows, worked out in one place so the row of circles and the full-screen story viewer always agree
// on who comes in which order.
//
//   Your story                     first, always
//   people with a story you have not seen   (rainbow ring)  - people you follow first, then the newest story first
//   suggested accounts with no story        (plus badge)    - in the random order the server gave
//   people with a story you have seen       (grey ring)     - same order as above
//
// The stories of the people in that order, one person after another and oldest-first within a person, are what the viewer plays.
import type { Story } from '../types';

export interface StoryTraySuggestion {
  id: string;
  username: string;
  displayName?: string;
  avatar: string;
  isVerified?: boolean;
  accountType?: 'public' | 'private' | 'business';
}

export type TrayRing = 'unseen' | 'seen' | 'none';

/** How many suggested circles the tray aims for (the server sends up to 10 public / business accounts; the rest is filled in from the app's own list of users). */
export const TRAY_SUGGESTION_TARGET = 18;

/** The part of a user the tray needs. */
export interface TrayPoolUser {
  id?: string;
  username?: string;
  displayName?: string;
  avatar?: string;
  isVerified?: boolean;
  accountType?: 'public' | 'private' | 'business';
  isAi?: boolean;
  isSuspended?: boolean;
  isBlocked?: boolean;
}

// A fixed "random" number for a person under one seed: the order is different on every visit (a new seed each time the feed loads or is refreshed) but does not
// jump around while the page is simply being redrawn.
const seededRank = (id: string, seed: number): number => {
  let h = 2166136261 ^ Math.floor(Math.abs(seed % 1) * 4294967295);
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
};

/**
 * Fills the suggested circles up to `target` with real people from the app's list of users: random, never the same person twice, never yourself, never
 * someone you blocked or who is hidden from you, never an AI or suspended account, and never someone already in the tray with a story. People you could
 * follow come first (public / business, then private ones - those get a follow request), people you already follow last, so the row is never nearly empty.
 */
export function topUpSuggestions(
  base: StoryTraySuggestion[],
  pool: ReadonlyArray<TrayPoolUser>,
  opts: { meId: string; followingIds?: ReadonlySet<string>; blockedIds?: ReadonlySet<string>; hiddenFromIds?: ReadonlySet<string>; takenIds?: ReadonlySet<string>; seed: number; target?: number }
): StoryTraySuggestion[] {
  const target = opts.target ?? TRAY_SUGGESTION_TARGET;
  const following = opts.followingIds ?? new Set<string>();
  const blocked = opts.blockedIds ?? new Set<string>();
  const hidden = opts.hiddenFromIds ?? new Set<string>();
  const taken = opts.takenIds ?? new Set<string>();
  const out: StoryTraySuggestion[] = [];
  const used = new Set<string>([opts.meId]);
  for (const sug of base) {
    if (!sug || !sug.id || used.has(sug.id)) continue;
    used.add(sug.id);
    out.push(sug);
  }
  if (out.length >= target) return out;
  const candidates = pool
    .filter((u): u is TrayPoolUser & { id: string; username: string } =>
      !!u && !!u.id && !!u.username && !used.has(u.id) && !taken.has(u.id) && !blocked.has(u.id) && !hidden.has(u.id) && !u.isAi && !u.isSuspended && !u.isBlocked)
    .map((u) => ({ u, tier: following.has(u.id) ? 2 : u.accountType === 'private' ? 1 : 0, r: seededRank(u.id, opts.seed) }))
    .sort((a, b) => a.tier - b.tier || a.r - b.r);
  for (const { u } of candidates) {
    if (out.length >= target) break;
    used.add(u.id);
    out.push({ id: u.id, username: u.username, displayName: u.displayName, avatar: u.avatar || '', isVerified: !!u.isVerified, accountType: u.accountType });
  }
  return out;
}

export interface TrayItem {
  kind: 'story' | 'suggestion';
  userId: string;
  username: string;
  avatar: string;
  isVerified: boolean;
  ring: TrayRing;
  closeFriends: boolean;
  /** Where this person's stories start in `viewerStories` (their first unseen one, else their first); -1 when they have none. */
  startIndex: number;
  suggestion?: StoryTraySuggestion;
}

export interface StoryTrayModel {
  own: { hasStory: boolean; ring: TrayRing; startIndex: number; storyIds: string[] };
  items: TrayItem[];
  viewerStories: Story[];
}

const time = (s: Story): number => {
  const t = Date.parse(s.createdAt);
  return Number.isFinite(t) ? t : 0;
};

export function buildStoryTray(
  stories: Story[],
  suggestions: StoryTraySuggestion[],
  meId: string,
  followingIds: ReadonlySet<string> = new Set(),
  ownSeenIds: ReadonlySet<string> = new Set()
): StoryTrayModel {
  // one entry per story id, grouped by person
  const byUser = new Map<string, Story[]>();
  const seenIds = new Set<string>();
  for (const s of stories) {
    if (!s || !s.id || seenIds.has(s.id)) continue;
    seenIds.add(s.id);
    const key = s.userId || s.username;
    const list = byUser.get(key);
    if (list) list.push(s); else byUser.set(key, [s]);
  }
  for (const list of byUser.values()) list.sort((a, b) => time(a) - time(b));   // oldest first, the order they were posted

  const newest = (list: Story[]) => Math.max(...list.map(time));
  const groups = [...byUser.entries()]
    .filter(([userId]) => userId !== meId)
    .map(([userId, list]) => ({ userId, list, unseen: list.some((s) => !s.isViewed), followed: followingIds.has(userId), newest: newest(list) }));
  const rank = (a: (typeof groups)[number], b: (typeof groups)[number]) =>
    (Number(b.followed) - Number(a.followed)) || (b.newest - a.newest);
  const unseenGroups = groups.filter((g) => g.unseen).sort(rank);
  const seenGroups = groups.filter((g) => !g.unseen).sort(rank);

  const viewerStories: Story[] = [];
  const startOf = (list: Story[]) => {
    const first = list.findIndex((s) => !s.isViewed);
    return viewerStories.length + (first === -1 ? 0 : first);
  };

  // ---- you
  const mine = byUser.get(meId) || [];
  const ownStart = mine.length ? viewerStories.length + Math.max(0, mine.findIndex((s) => !ownSeenIds.has(s.id))) : -1;
  viewerStories.push(...mine);
  const own: StoryTrayModel['own'] = {
    hasStory: mine.length > 0,
    ring: mine.length === 0 ? 'none' : mine.some((s) => !ownSeenIds.has(s.id)) ? 'unseen' : 'seen',
    startIndex: ownStart,
    storyIds: mine.map((s) => s.id)
  };

  const storyItem = (g: (typeof groups)[number]): TrayItem => {
    const startIndex = startOf(g.list);
    viewerStories.push(...g.list);
    const rep = g.list[g.list.length - 1];
    return {
      kind: 'story',
      userId: g.userId,
      username: rep.username,
      avatar: rep.userAvatar,
      isVerified: !!rep.isVerified,
      ring: g.unseen ? 'unseen' : 'seen',
      closeFriends: g.list.some((s) => s.isCloseFriendsOnly),
      startIndex
    };
  };

  const items: TrayItem[] = [];
  for (const g of unseenGroups) items.push(storyItem(g));

  // suggested accounts that have no story of their own in the list (an account with a story is already shown above)
  const shown = new Set<string>([meId, ...byUser.keys()]);
  for (const sug of suggestions) {
    if (!sug || !sug.id || shown.has(sug.id)) continue;
    shown.add(sug.id);
    items.push({ kind: 'suggestion', userId: sug.id, username: sug.username, avatar: sug.avatar, isVerified: !!sug.isVerified, ring: 'none', closeFriends: false, startIndex: -1, suggestion: sug });
  }

  for (const g of seenGroups) items.push(storyItem(g));
  return { own, items, viewerStories };
}

// ---- "I have looked at my own story" is only known on this device: the server never records the owner as a viewer
const OWN_SEEN_KEY = 'noob.ownStoriesSeen.v1';
export function loadOwnSeenStoryIds(): Set<string> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(OWN_SEEN_KEY) : null;
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((x: unknown): x is string => typeof x === 'string') : []);
  } catch { return new Set(); }
}
export function saveOwnSeenStoryIds(ids: Set<string>): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(OWN_SEEN_KEY, JSON.stringify([...ids].slice(-200)));   // a story lives 24 h, so a short list is plenty
  } catch { /* storage unavailable: the ring just stays coloured */ }
}
