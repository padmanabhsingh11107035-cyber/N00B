// The six filter buttons at the top of Notifications & Activity. Every kind of notification belongs to exactly one of the five groups after "All", and anything new
// that is added later (or not listed here) lands in the last one, so no notification can ever be missing from every button.
export type NotificationFilterId = 'all' | 'follows' | 'likes' | 'points' | 'games_music' | 'updates';

export const NOTIFICATION_FILTERS: { id: NotificationFilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'follows', label: '👥 Followers & Requests' },
  { id: 'likes', label: '❤️ Likes & Comments' },
  { id: 'points', label: '💰 Points & Rewards' },
  { id: 'games_music', label: '🎮 Games & Music' },
  { id: 'updates', label: '📣 Messages & Updates' }
];

const FOLLOWS = new Set(['new_follower', 'follow_request_received', 'follow_request_accepted', 'suggested_user']);
const LIKES = new Set(['post_like', 'reel_like', 'post_comment', 'comment_like', 'mention', 'instant_reaction']);
const POINTS = new Set(['points_transfer', 'points_earned', 'points_removed', 'payment_request', 'payment_request_approved', 'payment_request_declined', 'noob_draw_ready']);
const GAMES_MUSIC = new Set(['game_challenge', 'music_share']);

/** Which of the five groups a notification belongs to ('updates' for everything else: messages, calls, live rooms, the NOOB team, orders, birthdays ...). */
export function groupOf(type: string): Exclude<NotificationFilterId, 'all'> {
  if (FOLLOWS.has(type)) return 'follows';
  if (LIKES.has(type)) return 'likes';
  if (POINTS.has(type)) return 'points';
  if (GAMES_MUSIC.has(type)) return 'games_music';
  return 'updates';
}

export const matchesFilter = (type: string, filter: string): boolean => filter === 'all' || !NOTIFICATION_FILTERS.some((f) => f.id === filter) || groupOf(type) === filter;
