import { User, Post, Story, Reel, ChatConversation, Message, SavedCollection, GameScore, StoryHighlight, PostComment } from '../types';

export const NOOB_LOGO = '/noob-logo.svg.jpeg';
export const DEFAULT_AVATAR = '/noob-logo.svg.jpeg';
export const DEFAULT_MEDIA = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80';

export const NOOB_ADMIN_USER: User = {
  id: 'u_noob_admin',
  username: 'NOOB',
  displayName: 'NOOB',
  avatar: NOOB_LOGO,
  bio: '⚡ Official Administrator & Platform Overseer of NOOB. Connect, stream, compete and explore.',
  accountType: 'public',
  isVerified: true,
  isAdmin: true,
  followersCount: 0,
  followingCount: 0,
  postsCount: 0,
  noobPoints: 99999,
  isBusiness: false,
  privacySettings: {
    hideTaggedPhotos: false,
    blockedWords: [],
    hiddenStoryUsernames: []
  }
};

export const CURRENT_USER: User = {
  id: '',
  username: '',
  displayName: '',
  avatar: DEFAULT_AVATAR,
  bio: '',
  accountType: 'public',
  isVerified: false,
  followersCount: 0,
  followingCount: 0,
  postsCount: 0,
  isBusiness: false,
  privacySettings: {
    hideTaggedPhotos: false,
    blockedWords: [],
    hiddenStoryUsernames: []
  }
};

export const MOCK_USERS: User[] = [
  NOOB_ADMIN_USER
];

export const MOCK_STORIES: Story[] = [];

export const MOCK_POSTS: Post[] = [];

export const MOCK_COMMENTS: Record<string, PostComment[]> = {};

export const MOCK_REELS: Reel[] = [];

export const MOCK_CHATS: ChatConversation[] = [];
export const MOCK_MESSAGES: Record<string, Message[]> = {};
export const MOCK_HIGHLIGHTS: StoryHighlight[] = [];
export const MOCK_COLLECTIONS: SavedCollection[] = [];
export const MOCK_GAME_SCORES: GameScore[] = [];

export const INITIAL_SETTINGS = {
  darkMode: true,
  biometricLockEnabled: false,
  biometricLocked: false,
  e2eEncryptionEnabled: true,
  offlineMode: false,
  hideLikeCountsGlobal: false,
  pushNotifications: {
    messages: true,
    postsFromFriends: true,
    storyUpdates: true,
    liveRooms: true
  },
  teenAccountSafety: {
    enabled: false,
    dailyLimitMinutes: 120,
    nightModeBlockActive: false
  },
  hiddenWords: ['spam', 'buy followers', 'scam', 'crypto free'],
  sensitiveContentFilter: 'standard' as const,
  syncStatus: {
    lastSynced: 'Just now',
    syncedDevicesCount: 1,
    activeSessions: []
  }
};
