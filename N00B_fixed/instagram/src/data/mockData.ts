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
  },
  storeEnabled: true,
  storeDeliveryFee: 0
};

// Shared between the post/reel creation form (the picker) and every place a
// post/reel is displayed (to render the chosen filter) — a single source so
// the two can never drift out of sync with each other.
export const POST_FILTERS = [
  { id: 'normal', name: 'Normal', style: '' },
  { id: 'emerald', name: 'Emerald Glow', style: 'hue-rotate-60 contrast-125 saturate-150' },
  { id: 'cyber', name: 'Cyber Neon', style: 'hue-rotate-180 contrast-150 brightness-110' },
  { id: 'gala', name: 'GALA Preset', style: 'contrast-110 sepia-25 brightness-105' },
  { id: 'monochrome', name: 'Monochrome', style: 'grayscale contrast-125' },
  { id: 'clarendon', name: 'Clarendon', style: 'contrast-125 saturate-125' },
  { id: 'juno', name: 'Juno', style: 'contrast-115 saturate-140' }
];

// Content categories offered when creating a post or reel — one shared list
// for both, so a reel gets the same breadth of streams a post does.
export const CONTENT_CATEGORIES = [
  { id: 'gaming', label: '🎮 Gaming & Esports' },
  { id: 'tech', label: '🤖 Tech & Artificial Intelligence' },
  { id: 'code', label: '💻 Code, Dev & Software Engineering' },
  { id: 'robotics', label: '🦾 Robotics & Automation' },
  { id: 'cad', label: '📐 CAD, 3D Printing & Hardware' },
  { id: 'cybersecurity', label: '🛡️ Cybersecurity & Ethical Hacking' },
  { id: 'web3', label: '⚡ Web3, Crypto & Decentralized Tech' },
  { id: 'mobile', label: '📱 Mobile Apps & UI/UX Design' },
  { id: 'science', label: '🔭 Science, Space & Astronomy' },
  { id: 'art', label: '🎨 Digital Art, CGI & VFX' },
  { id: 'music', label: '🎵 Music, Beats & Audio Production' },
  { id: 'anime', label: '✨ Anime, Manga & Cyber Culture' },
  { id: 'fashion', label: '👟 Fashion, Streetwear & Aesthetics' },
  { id: 'tutorials', label: '📚 Education & Skill Tutorials' },
  { id: 'memes', label: '😂 Memes & Community Humor' },
  { id: 'food', label: '🍔 Food, Cooking & Recipes' },
  { id: 'travel', label: '✈️ Travel & Adventure' },
  { id: 'fitness', label: '💪 Fitness & Gym' },
  { id: 'sports', label: '⚽ Sports & Athletics' },
  { id: 'beauty', label: '💄 Beauty, Skincare & Makeup' },
  { id: 'comedy', label: '🤣 Comedy & Entertainment' },
  { id: 'movies', label: '🎬 Movies, TV & Streaming' },
  { id: 'business', label: '💼 Business, Finance & Investing' },
  { id: 'pets', label: '🐾 Pets & Animals' },
  { id: 'nature', label: '🌿 Nature & Outdoors' },
  { id: 'photography', label: '📸 Photography & Cinematography' },
  { id: 'vlog', label: '🎥 Vlogs & Daily Lifestyle' },
  { id: 'health', label: '🧘 Health & Wellness' },
  { id: 'automobile', label: '🏎️ Cars, Bikes & Motorsport' },
  { id: 'books', label: '📖 Books & Literature' },
  { id: 'family', label: '👨‍👩‍👧 Parenting & Family' },
  { id: 'news', label: '📰 News & Current Affairs' },
  { id: 'motivation', label: '🌟 Motivation & Self-Growth' },
  { id: 'diy', label: '🛠️ DIY, Crafts & Home Projects' },
  { id: 'realestate', label: '🏡 Real Estate & Interior Design' },
  { id: 'dance', label: '💃 Dance & Performing Arts' },
  { id: 'others', label: '🌐 Others / General Community' }
];
