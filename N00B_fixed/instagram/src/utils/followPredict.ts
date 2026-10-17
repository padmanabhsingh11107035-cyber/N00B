// What a Follow tap will most likely turn into, worked out on the phone so the button changes AT ONCE instead of after the server has answered
// (a follow / request used to look like nothing happened for as long as the round trip took). The server's answer still has the last word:
// every screen puts it in when it arrives, and puts the old state back if the follow failed.
//
//   not following, not requested -> a public account: Following; a private account: Requested
//   (a private account that accepts requests by itself turns the Requested into Following when the answer comes — never the other way round,
//    because "Requested" never promises more than is true)
//   following or requested       -> undone: Follow
export interface FollowSnapshot { isFollowing: boolean; isFollowRequested: boolean }

export function predictFollowToggle(
  current: FollowSnapshot,
  target: { accountType?: string; privacySettings?: { autoAcceptFollowRequests?: boolean } | null }
): FollowSnapshot {
  if (current.isFollowing || current.isFollowRequested) return { isFollowing: false, isFollowRequested: false };
  if (target.accountType === 'private') {
    return target.privacySettings?.autoAcceptFollowRequests === true
      ? { isFollowing: true, isFollowRequested: false }
      : { isFollowing: false, isFollowRequested: true };
  }
  return { isFollowing: true, isFollowRequested: false };
}

/** How many followers the account has after the tap, as far as the phone can tell (only an accepted follow changes the number). */
export function predictFollowersCount(count: number | undefined, before: FollowSnapshot, after: FollowSnapshot): number {
  return Math.max(0, (count || 0) + (after.isFollowing ? 1 : 0) - (before.isFollowing ? 1 : 0));
}
