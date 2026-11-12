// Reposts in the Home feed (Following tab). PURE: no network, no React.
// The feed list is shuffled "unseen first" and paged on the phone, so a repost has no exact place in it. Rules:
//   * a repost whose original is ALREADY in the list: the card stays where it is and only gets a "Reposted by" line;
//   * a repost whose original is not in the list: one extra card in the top section, newest repost first;
//   * the same original reposted by several people: one card, the most recent reposter's name;
//   * nothing is ever removed or reordered, and the list that came in is not changed.
export interface Reposter { id: string; username: string; displayName: string; avatar: string }
export interface FeedRepostLike<P> { kind: 'post' | 'reel'; repostedAt: string; reposter: Reposter; item: P }

export function mergeFeedReposts<P extends { id: string }>(
  list: readonly P[],
  reposts: ReadonlyArray<FeedRepostLike<P>>,
  options: { ownUserId?: string; isHidden?: (item: P, reposter: Reposter) => boolean } = {},
): { posts: P[]; repostedBy: Record<string, Reposter>; added: string[] } {
  const present = new Set(list.map((p) => p.id));
  const repostedBy: Record<string, Reposter> = {};
  const extras: Array<{ at: number; item: P }> = [];
  const seen = new Set<string>();
  const newestFirst = [...reposts].sort((a, b) => Date.parse(b.repostedAt) - Date.parse(a.repostedAt));
  for (const r of newestFirst) {
    if (r.kind !== 'post' || !r.item || seen.has(r.item.id)) continue;
    if (options.ownUserId && r.reposter.id === options.ownUserId) continue;
    if (options.isHidden && options.isHidden(r.item, r.reposter)) continue;
    seen.add(r.item.id);
    repostedBy[r.item.id] = r.reposter;
    if (!present.has(r.item.id)) extras.push({ at: Date.parse(r.repostedAt), item: r.item });
  }
  return { posts: [...extras.map((e) => e.item), ...list], repostedBy, added: extras.map((e) => e.item.id) };
}
