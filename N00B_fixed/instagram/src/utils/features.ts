// Every page of the app that the administrator can switch off for users (Admin Control Panel -> "Pages"). A page that is switched off disappears from the bottom bar, the side menu,
// the menu on Home and the buttons that open it; the administrator still sees everything. Nothing is deleted: switching the page on again brings it back.
//
// The key of a page is a short word that is stored in the database (platform_settings.disabled_features), so a key is never renamed once it is in use.
export interface FeatureDef {
  key: string;
  label: string;
  blurb: string;
  group: 'Main pages' | 'Home menu' | 'Fun & community' | 'Help';
  /** the Music page already had its own switch (migration 20261015000001); the new row uses it, so both places always agree */
  legacy?: 'music';
}

export const FEATURES: ReadonlyArray<FeatureDef> = [
  { key: 'explore', label: 'Explore', blurb: 'Find people and posts', group: 'Main pages' },
  { key: 'reels', label: 'Reels', blurb: 'Short videos', group: 'Main pages' },
  { key: 'videos', label: 'Feed (long videos & live)', blurb: 'Long videos and live streams', group: 'Main pages' },
  { key: 'create', label: 'Create', blurb: 'The + button: a new post, reel or story', group: 'Main pages' },
  { key: 'chat', label: 'Chat', blurb: 'Direct messages', group: 'Main pages' },
  { key: 'games', label: 'Games', blurb: 'The mini-games arena and the big 3D games', group: 'Main pages' },
  { key: 'music', label: 'Music Hub', blurb: 'The music page and its button on Home', group: 'Main pages', legacy: 'music' },

  { key: 'draw', label: 'NOOB Draw', blurb: 'The weekly free prize spins', group: 'Home menu' },
  { key: 'studio', label: 'NOOB Studio', blurb: 'The photo and video editor', group: 'Home menu' },
  { key: 'team', label: 'Our Team', blurb: 'The people behind NOOB', group: 'Home menu' },
  { key: 'anonymous', label: 'Anonymous Messages', blurb: 'Messages with no author shown', group: 'Home menu' },
  { key: 'daily', label: 'Daily NOOB', blurb: 'Today\'s challenge and the podium', group: 'Home menu' },
  { key: 'rooms', label: 'NOOB Rooms', blurb: 'Live voice rooms', group: 'Home menu' },
  { key: 'song', label: 'Guess the Song', blurb: 'A clip plays, pick the title', group: 'Home menu' },
  { key: 'lounge', label: 'Live Lounge / Meetings', blurb: 'Private meeting rooms', group: 'Home menu' },
  { key: 'shop', label: 'Shop NOOB', blurb: 'Products and the cart', group: 'Home menu' },
  { key: 'ai', label: 'NOOB AI', blurb: 'The voice assistant', group: 'Home menu' },
  { key: 'drinks', label: 'NOOB Cold Drinks', blurb: 'The 3D cans page', group: 'Home menu' },
  { key: 'creations', label: 'More of our creations', blurb: 'Our other websites', group: 'Home menu' },

  { key: 'fun-this-or-that', label: 'This or That', blurb: 'Pick a side and see what everyone chose', group: 'Fun & community' },
  { key: 'fun-ask', label: 'Ask Me Anything', blurb: 'Anonymous questions from friends', group: 'Fun & community' },
  { key: 'fun-mood', label: 'Mood Status', blurb: 'Share how you feel', group: 'Fun & community' },
  { key: 'fun-polls', label: 'Public Polls', blurb: 'Ask the community', group: 'Fun & community' },

  { key: 'support', label: 'Customer Support', blurb: 'The round help button and the support chat', group: 'Help' },
  { key: 'suggestions', label: 'Suggestion Box', blurb: 'Ideas and problems from users', group: 'Help' }
];

export const FEATURE_GROUPS: ReadonlyArray<FeatureDef['group']> = ['Main pages', 'Home menu', 'Fun & community', 'Help'];

/** the page of the bottom bar / side menu that each tab belongs to (Home and Profile can not be switched off) */
export const TAB_FEATURE: Readonly<Record<string, string>> = { explore: 'explore', reels: 'reels', videos: 'videos', post: 'create', chat: 'chat', games: 'games' };

/** the name of the fun page (this-or-that, ask, mood, polls) as a page key */
export const funFeatureKey = (id: string): string => 'fun-' + id;

/** the list of switched-off pages out of the settings (an old server that does not know the list means: everything is on) */
export function disabledFeatureSet(list: unknown): ReadonlySet<string> {
  return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
}
