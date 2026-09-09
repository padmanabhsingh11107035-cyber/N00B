export interface StatusNote {
  text: string;
  musicTrack?: string;
  location?: string;
  prompt?: string;
  createdAt: string;
  createdAtTimestamp?: number;
  expiresAt?: number;
}

export type AccountType = 'public' | 'private' | 'business';

export interface User {
  id: string;
  username: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  countryCode?: string;
  mobileNumber?: string;
  avatar: string;
  bio: string;
  accountType: AccountType;
  agreedToTerms?: boolean;
  website?: string;
  city?: string;
  gender?: string;
  pronouns?: string;
  socialLinks?: {
    instagram?: string;
    twitter?: string;
    discord?: string;
    youtube?: string;
    github?: string;
    spotify?: string;
    tiktok?: string;
  };
  interests?: string[];
  externalLinks?: { title: string; url: string }[];
  customLinks?: { title: string; url: string }[];
  businessEmail?: string;
  businessPhone?: string;
  businessAddress?: string;
  businessCategory?: string;
  businessAddresses?: string[];
  crossProfiles?: string[];
  isVerified: boolean;
  verificationTier?: 'standard' | 'plus' | 'premium' | 'max';
  proTier?: string;
  proBilling?: 'monthly' | 'yearly';
  followersCount: number;
  followingCount: number;
  postsCount: number;
  noobPoints?: number;
  noobTransactions?: NoobTransaction[];
  gamesWonCount?: number;
  gamesPlayedCount?: number;
  isAi?: boolean;
  isBusiness: boolean;
  isFollowing?: boolean;
  isFollower?: boolean;
  followingIds?: string[];
  followers?: string[];
  isFollowRequested?: boolean;
  followRequests?: {
    userId: string;
    username: string;
    displayName: string;
    avatar: string;
    requestedAt: string;
  }[];
  isCloseFriend?: boolean;
  isRestricted?: boolean;
  isBlocked?: boolean;
  blockedUserIds?: string[];
  hideStoryFrom?: boolean;
  highlights?: { id: string; title: string; coverUrl: string; storyIds: string[] }[];
  statusNote?: StatusNote;
  isAdmin?: boolean;
  isSuspended?: boolean;
  suspendedReason?: string;
  privacySettings: {
    hideTaggedPhotos: boolean;
    blockedWords: string[];
    hiddenStoryUsernames?: string[];
  };
}

export type NotificationType =
  | 'admin_broadcast'
  | 'admin_direct'
  | 'new_follower'
  | 'follow_request_accepted'
  | 'follow_request_received'
  | 'post_like'
  | 'post_comment'
  | 'mention'
  | 'music_share'
  | 'game_challenge'
  | 'system';

export interface AppNotification {
  id: string;
  type: NotificationType;
  actorId?: string;
  actorUsername?: string;
  actorDisplayName?: string;
  actorAvatar?: string;
  senderId?: string;
  senderUsername?: string;
  senderAvatar?: string;
  senderIsVerified?: boolean;
  targetUserId?: string; // 'all' or specific user id/username
  targetUsername?: string;
  title?: string;
  message?: string;
  text?: string;
  detail?: string;
  targetId?: string;
  time?: string;
  timestamp?: number;
  createdAt?: string;
  isRead?: boolean;
  actionStatus?: 'pending' | 'accepted' | 'declined';
}

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  genre: string;
  audioUrl: string;
  coverUrl: string;
  duration?: string;
  uploaderId: string;
  uploaderUsername: string;
  uploaderAvatar?: string;
  likesCount: number;
  playsCount: number;
  isLiked?: boolean;
  createdAt: string;
}

export interface GameInvite {
  id: string;
  gameId: string;
  gameTitle: string;
  fromUserId: string;
  fromUsername: string;
  fromAvatar: string;
  toUserId: string;
  toUsername: string;
  status: 'pending' | 'accepted' | 'declined' | 'completed';
  roomCode: string;
  createdAt: string;
}

export interface NoobTransaction {
  id: string;
  amount: number;
  reason: string;
  timestamp: string;
  balanceAfter: number;
}

export interface PostSlide {
  id: string;
  mediaUrl: string;
  objectKey?: string;
  mediaType: 'image' | 'video' | 'code';
  caption?: string;
  filter?: string;
  taggedUsers?: string[];
  productTags?: { id: string; name: string; price: string; link: string }[];
}

export interface PostComment {
  id: string;
  postId: string;
  userId: string;
  username: string;
  userAvatar: string;
  isVerified?: boolean;
  text: string;
  createdAt: string;
  likesCount: number;
  isLiked?: boolean;
  isPinned?: boolean;
}

export interface Post {
  id: string;
  userId: string;
  username: string;
  displayName?: string;
  userAvatar: string;
  isVerified: boolean;
  caption: string;
  location?: string;
  createdAt: string;
  slides: PostSlide[];
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  savesCount: number;
  isLiked: boolean;
  isSaved: boolean;
  isPinnedToProfile?: boolean;
  isArchived?: boolean;
  isCommentsDisabled?: boolean;
  isLikeCountHidden?: boolean;
  isSponsored?: boolean;
  isCollab?: boolean;
  collabUsername?: string;
  collabUserAvatar?: string;
  collabUserDisplayName?: string;
  taggedUsers?: { userId?: string; username: string; displayName?: string; avatar?: string }[];
  hasAiLabel?: boolean;
  hashtags: string[];
  audioTrack?: string;
  category?: 'robotics' | 'code' | 'cad' | 'gaming' | 'fashion' | 'art' | 'tech' | 'others';
  textBgStyle?: string;
  webLink?: string; // For verified links in posts
  scheduledFor?: string;
}

export interface Story {
  id: string;
  userId: string;
  username: string;
  userAvatar: string;
  isVerified: boolean;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  durationSeconds: number;
  createdAt: string;
  expiresAt: string;
  isCloseFriendsOnly: boolean;
  isViewed: boolean;
  filter?: string;
  stickers?: {
    type: 'poll' | 'quiz' | 'slider' | 'countdown' | 'add_yours' | 'location' | 'weather' | 'mention' | 'music';
    data: any;
    x: number; // percentage
    y: number;
  }[];
  comments?: {
    id: string;
    username: string;
    userAvatar: string;
    text: string;
    createdAt: string;
  }[];
}

export interface StoryHighlight {
  id: string;
  title: string;
  coverUrl: string;
  storyIds: string[];
}

export interface Reel {
  id: string;
  userId: string;
  username: string;
  userAvatar: string;
  thumbnailUrl?: string;
  isVerified: boolean;
  videoUrl: string;
  caption: string;
  audioTrack: {
    title: string;
    artist: string;
    coverUrl?: string;
  };
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  savesCount: number;
  viewsCount: number;
  isLiked: boolean;
  isSaved: boolean;
  isFollowing: boolean;
  hashtags: string[];
  createdAt: string;
  durationSeconds: number;
  webLink?: string;
  isTrialReel?: boolean;
  aiTranslationAvailable?: boolean;
  isCollab?: boolean;
  collabUsername?: string;
  collabUserAvatar?: string;
  collabUserDisplayName?: string;
  taggedUsers?: { userId?: string; username: string; displayName?: string; avatar?: string }[];
  category?: string;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderUsername?: string;
  senderDisplayName?: string;
  senderAvatar?: string;
  text: string;
  translatedText?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'code' | 'game_invite';
  audioDuration?: string;
  createdAt: string;
  isEdited?: boolean;
  isPinned?: boolean;
  isDisappearing?: boolean;
  isViewed?: boolean;
  reactions?: { emoji: string; count: number; users: string[] }[];
  sharedTrack?: { title: string; artist: string; coverUrl?: string; audioUrl?: string };
  gameInvite?: {
    gameId: string;
    gameTitle: string;
    fromUsername: string;
    fromAvatar: string;
    roomCode: string;
  };
  status?: 'sent' | 'delivered' | 'read';
  scheduledAt?: string;
}

export interface ChatConversation {
  id: string;
  participants: User[];
  isGroup: boolean;
  groupName?: string;
  name?: string;
  avatar?: string;
  creatorId?: string;
  adminIds?: string[];
  isGlobalDefault?: boolean;
  description?: string;
  isAi?: boolean;
  isEnded?: boolean;
  endedAt?: string;
  review?: {
    rating: number;
    feedback?: string;
    createdAt: string;
  };
  lastMessage?: Message;
  unreadCount: number;
  isPinned: boolean;
  isMuted: boolean;
  themeColor: string;
  vanishMode: boolean;
  customNickname?: string;
  readReceiptsEnabled: boolean;
  createdAt: string;
}

export interface SavedCollection {
  id: string;
  name: string;
  coverImage?: string;
  coverUrl?: string;
  postIds?: string[];
  posts?: Post[];
  postsCount?: number;
  isCollaborative: boolean;
  collaboratorUsernames?: string[];
  isPrivate?: boolean;
}

export interface GameLeaderboardEntry {
  id?: string;
  userId?: string;
  username: string;
  avatar: string;
  score: number;
  noobsPoints?: number;
  date?: string;
}

export interface GameScore {
  id: string;
  gameId: string;
  gameTitle: string;
  username: string;
  userAvatar: string;
  score: number;
  noobsPoints: number;
  date: string;
}

export interface ProfessionalInsights {
  accountsReached: number;
  accountsEngaged: number;
  totalFollowers: number;
  profileActivity: number;
  skipRate: number;
  shareRate: number;
  likeRate: number;
  saveRate: number;
  repostRate: number;
  commentRate: number;
  reachHistory: { date: string; value: number }[];
  audienceDemographics: { category: string; percentage: number }[];
}

export interface AppSettings {
  darkMode: boolean;
  biometricLockEnabled: boolean;
  biometricLocked: boolean;
  e2eEncryptionEnabled: boolean;
  offlineMode: boolean;
  hideLikeCountsGlobal: boolean;
  pushNotifications: {
    messages: boolean;
    postsFromFriends: boolean;
    storyUpdates: boolean;
    liveRooms: boolean;
  };
  teenAccountSafety: {
    enabled: boolean;
    dailyLimitMinutes: number;
    nightModeBlockActive: boolean;
  };
  hiddenWords: string[];
  sensitiveContentFilter: 'standard' | 'less' | 'more';
  syncStatus: {
    lastSynced: string;
    syncedDevicesCount: number;
    activeSessions: { id: string; device: string; location: string; lastActive: string }[];
  };
}

