// "Up next" and the list of suggested videos under the one that is playing: more from the same person first, then videos about the same things, then what is popular and new.
export interface SuggestInput { id: string; userId: string; title: string; description?: string; viewsCount: number; likesCount: number; commentsCount: number; createdAt: string }

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'it', 'this', 'that', 'my', 'me', 'you', 'i', 'new', 'video', 'ka', 'ki', 'ke', 'ko', 'hai']);
const words = (s: string | undefined) => new Set((s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));

export function suggestVideos<T extends SuggestInput>(current: T, all: T[], followingIds: ReadonlySet<string> | string[] = [], limit = 20, now = Date.now()): T[] {
  const following = followingIds instanceof Set ? followingIds : new Set(followingIds);
  const mine = words(`${current.title} ${current.description || ''}`);
  const scored = all.filter((v) => v.id !== current.id).map((v) => {
    const theirs = words(`${v.title} ${v.description || ''}`);
    let shared = 0;
    mine.forEach((w) => { if (theirs.has(w)) shared++; });
    const ageDays = Math.max(0, (now - Date.parse(v.createdAt)) / 86_400_000) || 0;
    const popular = Math.log10(1 + v.viewsCount + 3 * v.likesCount + 5 * v.commentsCount);
    const score = (v.userId === current.userId ? 6 : 0) + Math.min(shared, 4) * 1.5 + (following.has(v.userId) ? 1.5 : 0) + popular * 0.8 + Math.max(0, 3 - ageDays / 10);
    return { v, score };
  });
  scored.sort((a, b) => b.score - a.score || Date.parse(b.v.createdAt) - Date.parse(a.v.createdAt));
  return scored.slice(0, limit).map((x) => x.v);
}
