import {
  Post,
  Story,
  Reel,
  ChatConversation,
  Message,
  SavedCollection,
  GameScore,
  GameLeaderboardEntry,
  User,
  AppSettings,
  ProfessionalInsights,
  StoryHighlight,
  StatusNote,
  ShopItem
} from '../types';
import { compressMedia } from '../utils/mediaCompressor';
import { safeJsonStringify } from '../utils/safeJson';

const API_BASE = '/api';

// The logged-in user id is cached in memory after its first read so that
// logging into a DIFFERENT account in another browser tab — which shares
// this same localStorage — can never silently hijack an already-open
// tab's identity mid-session (every request in that tab would otherwise
// start acting as whichever account most recently logged in anywhere in
// the browser: someone else's likes/saves, messages, even posts). Only an
// explicit login/logout inside THIS tab changes who we act as. A fresh
// tab or reload still correctly picks up whichever account is currently
// stored, which is the intended "stay logged in" behavior.
let cachedUserId: string | null | undefined = undefined;

function getSessionUserId(): string | null {
  if (cachedUserId === undefined) {
    cachedUserId = localStorage.getItem('ig_user_id');
  }
  return cachedUserId;
}

export function setSessionUserId(userId: string | null): void {
  cachedUserId = userId;
  if (userId) {
    localStorage.setItem('ig_user_id', userId);
  } else {
    localStorage.removeItem('ig_user_id');
  }
}

function getAuthHeaders(): HeadersInit {
  const userId = getSessionUserId() || '';
  return {
    'Content-Type': 'application/json',
    ...(userId ? { 'x-user-id': userId } : {})
  };
}

export async function fetchHealth(): Promise<{ status: string; usersCount?: number }> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return await res.json();
  } catch (err) {
    return { status: 'offline' };
  }
}

// --- AUTHENTICATION API ---
export async function signupUser(payload: {
  firstName: string;
  lastName?: string;
  username: string;
  displayName?: string;
  email: string;
  countryCode?: string;
  mobileNumber?: string;
  dateOfBirth?: string;
  gender?: string;
  password: string;
  avatar?: string;
  bio?: string;
  accountType?: 'public' | 'private' | 'business';
  businessCategory?: string;
  businessEmail?: string;
  businessPhone?: string;
  businessAddress?: string;
  agreedToTerms: boolean;
}): Promise<{ success: boolean; user?: User; error?: string }> {
  const res = await fetch(`${API_BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: safeJsonStringify(payload)
  });
  const data = await res.json();
  if (data.user && data.user.id) {
    setSessionUserId(data.user.id);
  }
  return data;
}

export async function loginUser(payload: {
  identifier: string;
  password?: string;
}): Promise<{ success: boolean; user?: User; error?: string }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: safeJsonStringify(payload)
  });
  const data = await res.json();
  if (data.user && data.user.id) {
    setSessionUserId(data.user.id);
  }
  return data;
}

export async function logoutUser(): Promise<{ success: boolean }> {
  setSessionUserId(null);
  const res = await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  return await res.json();
}

// Self-service account deletion (Google Play requires this: a logged-in
// user must be able to permanently delete their own account and content
// without needing an admin). Requires the account password to confirm.
export async function deleteMyAccount(password: string): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/users/me`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
    body: safeJsonStringify({ password })
  });
  const data = await res.json();
  if (data.success) {
    setSessionUserId(null);
  }
  return data;
}

export async function fetchCurrentUser(): Promise<User | null> {
  try {
    const res = await fetch(`${API_BASE}/users/me`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.user || null;
  } catch (err) {
    return null;
  }
}

export async function updateCurrentUser(userData: Partial<User>): Promise<User> {
  const res = await fetch(`${API_BASE}/users/me`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: safeJsonStringify(userData)
  });
  const data = await res.json();
  return data.user;
}

export async function updateUserBio(newBio: string): Promise<User> {
  return updateCurrentUser({ bio: newBio });
}

export async function updateUserStatusNote(note?: StatusNote): Promise<User> {
  return updateCurrentUser({ statusNote: note });
}

export async function fetchUsers(search?: string): Promise<User[]> {
  const url = search ? `${API_BASE}/users?search=${encodeURIComponent(search)}` : `${API_BASE}/users`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  const data = await res.json();
  return data.users || [];
}

// Matches a device's contact phone numbers against registered users
// server-side (native app "Find Friends" flow) — the numbers themselves are
// never sent back, only public profile fields for any matches found.
export async function matchContacts(phoneNumbers: string[]): Promise<User[]> {
  const res = await fetch(`${API_BASE}/users/match-contacts`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify({ phoneNumbers })
  });
  const data = await res.json();
  return data.users || [];
}

export async function toggleFollowUser(userId: string): Promise<{ success: boolean; isFollowing: boolean; isFollowRequested?: boolean; followersCount: number; message?: string }> {
  const res = await fetch(`${API_BASE}/users/${userId}/toggle-follow`, {
    method: 'POST',
    headers: getAuthHeaders()
  });
  return await res.json();
}

export async function acceptFollowRequest(requesterId: string): Promise<{ success: boolean; followersCount: number; followRequests: any[] }> {
  const res = await fetch(`${API_BASE}/users/follow-requests/${requesterId}/accept`, {
    method: 'POST',
    headers: getAuthHeaders()
  });
  return await res.json();
}

export async function declineFollowRequest(requesterId: string): Promise<{ success: boolean; followRequests: any[] }> {
  const res = await fetch(`${API_BASE}/users/follow-requests/${requesterId}/decline`, {
    method: 'POST',
    headers: getAuthHeaders()
  });
  return await res.json();
}

export async function fetchPosts(category?: string, location?: string): Promise<Post[]> {
  const params = new URLSearchParams();
  if (category) params.append('category', category);
  if (location) params.append('location', location);
  const res = await fetch(`${API_BASE}/posts?${params.toString()}`);
  const data = await res.json();
  return data.posts;
}

export async function fetchLikedPosts(): Promise<Post[]> {
  const res = await fetch(`${API_BASE}/posts/liked`);
  const data = await res.json();
  return data.posts;
}

export async function fetchSavedPosts(): Promise<Post[]> {
  const res = await fetch(`${API_BASE}/posts/saved`);
  const data = await res.json();
  return data.posts;
}

export async function fetchArchivedPosts(): Promise<Post[]> {
  const res = await fetch(`${API_BASE}/posts/archived`);
  const data = await res.json();
  return data.posts;
}

export async function createPost(postData: Partial<Post>): Promise<Post> {
  const res = await fetch(`${API_BASE}/posts`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify(postData)
  });
  const data = await res.json();
  return data.post;
}

export async function toggleLikePost(postId: string): Promise<{ isLiked: boolean; likesCount: number }> {
  const res = await fetch(`${API_BASE}/posts/${postId}/like`, { method: 'POST' });
  return await res.json();
}

export async function toggleSavePost(postId: string): Promise<{ isSaved: boolean; savesCount: number }> {
  const res = await fetch(`${API_BASE}/posts/${postId}/save`, { method: 'POST' });
  return await res.json();
}

export async function toggleArchivePost(postId: string): Promise<{ isArchived: boolean }> {
  const res = await fetch(`${API_BASE}/posts/${postId}/archive`, { method: 'POST' });
  return await res.json();
}

export async function toggleCommentsPost(postId: string): Promise<{ isCommentsDisabled: boolean }> {
  const res = await fetch(`${API_BASE}/posts/${postId}/toggle-comments`, { method: 'POST' });
  return await res.json();
}

export async function toggleLikeCountPost(postId: string): Promise<{ isLikeCountHidden: boolean }> {
  const res = await fetch(`${API_BASE}/posts/${postId}/toggle-like-count`, { method: 'POST' });
  return await res.json();
}

export async function deletePost(postId: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/posts/${postId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  const data = await res.json();
  return data.success;
}

export async function fetchComments(postId: string) {
  try {
    const res = await fetch(`${API_BASE}/posts/${postId}/comments`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.comments) ? data.comments : [];
  } catch (err) {
    console.error('Error fetching comments:', err);
    return [];
  }
}

export async function addComment(postId: string, text: string) {
  const res = await fetch(`${API_BASE}/posts/${postId}/comments`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify({ text })
  });
  const data = await res.json();
  return data.comment;
}

export async function deleteComment(postId: string, commentId: string) {
  const res = await fetch(`${API_BASE}/posts/${postId}/comments/${commentId}`, { 
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  return await res.json();
}

export async function togglePinComment(postId: string, commentId: string) {
  const res = await fetch(`${API_BASE}/posts/${postId}/comments/${commentId}/pin`, { 
    method: 'POST',
    headers: getAuthHeaders()
  });
  return await res.json();
}

// Stories & Highlights
export async function fetchStories(): Promise<Story[]> {
  const res = await fetch(`${API_BASE}/stories`, { headers: getAuthHeaders() });
  const data = await res.json();
  return data.stories;
}

export async function createStory(storyData: Partial<Story>): Promise<Story> {
  const res = await fetch(`${API_BASE}/stories`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify(storyData)
  });
  const data = await res.json();
  return data.story;
}

export async function addCommentToStory(storyId: string, text: string) {
  const res = await fetch(`${API_BASE}/stories/${storyId}/comment`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify({ text })
  });
  const data = await res.json();
  return data.comment;
}

export async function fetchHighlights(): Promise<StoryHighlight[]> {
  const res = await fetch(`${API_BASE}/highlights`, { headers: getAuthHeaders() });
  const data = await res.json();
  return data.highlights;
}

export async function createHighlight(title: string, coverUrl: string, storyIds: string[]) {
  const res = await fetch(`${API_BASE}/highlights`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify({ title, coverUrl, storyIds })
  });
  return await res.json();
}

// Reels
export async function fetchReels(): Promise<Reel[]> {
  const res = await fetch(`${API_BASE}/reels`, { headers: getAuthHeaders() });
  const data = await res.json();
  return data.reels;
}

export async function createReel(reelData: Partial<Reel>): Promise<Reel> {
  const res = await fetch(`${API_BASE}/reels`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify(reelData)
  });
  const data = await res.json();
  return data.reel;
}

export async function toggleLikeReel(reelId: string): Promise<{ isLiked: boolean; likesCount: number }> {
  const res = await fetch(`${API_BASE}/reels/${reelId}/like`, { method: 'POST', headers: getAuthHeaders() });
  return await res.json();
}

export async function toggleSaveReel(reelId: string): Promise<{ isSaved: boolean; savesCount: number }> {
  const res = await fetch(`${API_BASE}/reels/${reelId}/save`, { method: 'POST', headers: getAuthHeaders() });
  return await res.json();
}

export async function fetchReelComments(reelId: string) {
  try {
    const res = await fetch(`${API_BASE}/reels/${reelId}/comments`, { headers: getAuthHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.comments) ? data.comments : [];
  } catch (err) {
    console.error('Error fetching reel comments:', err);
    return [];
  }
}

export async function addReelComment(reelId: string, text: string) {
  const res = await fetch(`${API_BASE}/reels/${reelId}/comments`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify({ text })
  });
  const data = await res.json();
  return data.comment;
}

export async function recordReelView(reelId: string) {
  const res = await fetch(`${API_BASE}/reels/${reelId}/history`, { method: 'POST', headers: getAuthHeaders() });
  return await res.json();
}

export async function fetchReelHistory(): Promise<Reel[]> {
  const res = await fetch(`${API_BASE}/reels/history`, { headers: getAuthHeaders() });
  const data = await res.json();
  return data.reels;
}

export async function deleteReel(reelId: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/reels/${reelId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  const data = await res.json();
  return data.success;
}

// Chats & Messages
export async function fetchChats(): Promise<ChatConversation[]> {
  const res = await fetch(`${API_BASE}/chats`, { headers: getAuthHeaders() });
  const data = await res.json();
  return data.chats || [];
}

export async function createChat(payload: {
  participantIds: string[];
  isGroup?: boolean;
  name?: string;
  avatar?: string;
  description?: string;
}): Promise<ChatConversation> {
  const res = await fetch(`${API_BASE}/chats`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify(payload)
  });
  const data = await res.json();
  if (!res.ok || !data.chat) {
    throw new Error(data.error || 'Failed to create chat');
  }
  return data.chat;
}

export async function deleteChat(chatId: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/chats/${chatId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  const data = await res.json();
  return data.success;
}

export async function fetchMessages(chatId: string): Promise<Message[]> {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages`, { headers: getAuthHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return data.messages || [];
}

export async function sendMessage(chatId: string, payload: Partial<Message>): Promise<Message & { aiResponse?: Message }> {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify(payload)
  });
  const data = await res.json();
  if (!res.ok || !data.message) {
    throw new Error(data.error || 'Failed to send message');
  }
  if (data.aiResponse) {
    return { ...data.message, aiResponse: data.aiResponse };
  }
  return data.message;
}

export async function editMessage(chatId: string, messageId: string, text: string): Promise<Message> {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages/${messageId}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: safeJsonStringify({ text })
  });
  const data = await res.json();
  return data.message;
}

export async function deleteMessage(chatId: string, messageId: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages/${messageId}`, { 
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  const data = await res.json();
  return data.success;
}

export async function translateMessage(chatId: string, messageId: string): Promise<string> {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages/${messageId}/translate`, { 
    method: 'POST',
    headers: getAuthHeaders()
  });
  const data = await res.json();
  return data.translatedText;
}

export async function updateChatSettings(chatId: string, settings: Partial<ChatConversation>) {
  const res = await fetch(`${API_BASE}/chats/${chatId}/settings`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: safeJsonStringify(settings)
  });
  return await res.json();
}

export async function endChat(chatId: string): Promise<{ success: boolean; chat: ChatConversation; message: string }> {
  const res = await fetch(`${API_BASE}/chats/${chatId}/end`, {
    method: 'POST',
    headers: getAuthHeaders()
  });
  return await res.json();
}

export async function submitChatReview(
  chatId: string,
  rating: number,
  feedback?: string
): Promise<{ success: boolean; review: any; message: string }> {
  const res = await fetch(`${API_BASE}/chats/${chatId}/review`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify({ rating, feedback })
  });
  return await res.json();
}

export async function createGroupChat(
  name: string,
  avatar?: string,
  participantIds?: string[],
  description?: string
): Promise<{ success: boolean; chat: ChatConversation }> {
  const res = await fetch(`${API_BASE}/chats`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify({
      name,
      avatar,
      participantIds,
      isGroup: true,
      description
    })
  });
  return await res.json();
}

export async function updateGroupDetails(
  chatId: string,
  data: { name?: string; avatar?: string; description?: string }
): Promise<{ success: boolean; chat: ChatConversation }> {
  const res = await fetch(`${API_BASE}/chats/${chatId}/group`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: safeJsonStringify(data)
  });
  return await res.json();
}

export async function manageGroupAdmin(
  chatId: string,
  targetUserId: string,
  action: 'make_admin' | 'remove_admin'
): Promise<{ success: boolean; chat: ChatConversation; adminIds: string[] }> {
  const res = await fetch(`${API_BASE}/chats/${chatId}/admins`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify({ targetUserId, action })
  });
  return await res.json();
}

export async function removeGroupMember(
  chatId: string,
  targetUserId: string
): Promise<{ success: boolean; chat: ChatConversation; participants: User[] }> {
  const res = await fetch(`${API_BASE}/chats/${chatId}/members/remove`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify({ targetUserId })
  });
  return await res.json();
}

export async function addGroupMembers(
  chatId: string,
  userIds: string[]
): Promise<{ success: boolean; chat: ChatConversation; participants: User[] }> {
  const res = await fetch(`${API_BASE}/chats/${chatId}/members/add`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify({ userIds })
  });
  return await res.json();
}

export async function blockUser(userId: string): Promise<{ success: boolean; message: string; blockedUserIds: string[] }> {
  const res = await fetch(`${API_BASE}/users/${userId}/block`, {
    method: 'POST',
    headers: getAuthHeaders()
  });
  return await res.json();
}

export async function unblockUser(userId: string): Promise<{ success: boolean; message: string; blockedUserIds: string[] }> {
  const res = await fetch(`${API_BASE}/users/${userId}/unblock`, {
    method: 'POST',
    headers: getAuthHeaders()
  });
  return await res.json();
}

export async function submitSafetyReport(
  targetOrPayload: string | { targetUserId: string; reason: string; details?: string },
  reason?: string,
  details?: string
): Promise<{ success: boolean; reportId?: string; report?: any; message: string; error?: string }> {
  let targetUserId = '';
  let reportReason = 'Cyber Bullying & Harassment';
  let reportDetails = '';

  if (typeof targetOrPayload === 'string') {
    targetUserId = targetOrPayload;
    reportReason = reason || 'Cyber Bullying & Harassment';
    reportDetails = details || '';
  } else {
    targetUserId = targetOrPayload.targetUserId;
    reportReason = targetOrPayload.reason;
    reportDetails = targetOrPayload.details || '';
  }

  const res = await fetch(`${API_BASE}/report-user`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify({ targetUserId, reason: reportReason, details: reportDetails })
  });
  return await res.json();
}

// Support Reviews — real aggregate rating, not cosmetic
export async function submitSupportReview(
  rating: number,
  feedback?: string
): Promise<{ success: boolean; average: number; count: number }> {
  const res = await fetch(`${API_BASE}/support/review`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify({ rating, feedback })
  });
  return await res.json();
}

export async function fetchSupportRatingSummary(): Promise<{ average: number | null; count: number }> {
  const res = await fetch(`${API_BASE}/support/rating-summary`);
  return await res.json();
}

// Saved Collections
export async function fetchCollections(): Promise<SavedCollection[]> {
  const res = await fetch(`${API_BASE}/collections`, { headers: getAuthHeaders() });
  const data = await res.json();
  return data.collections;
}

export async function createCollection(payload: Partial<SavedCollection>): Promise<SavedCollection> {
  const res = await fetch(`${API_BASE}/collections`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify(payload)
  });
  const data = await res.json();
  return data.collection;
}

export async function addPostToCollection(collectionId: string, postId: string) {
  const res = await fetch(`${API_BASE}/collections/${collectionId}/add-post`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify({ postId })
  });
  return await res.json();
}

// Media Upload via Backblaze B2 (S3-compatible) with invisible client-side compression
export async function uploadMediaFile(
  file: File,
  folder: 'posts' | 'reels' | 'stories' | 'avatars' | 'music' | 'covers' | 'stickers' = 'posts'
): Promise<{ success: boolean; objectKey: string; url: string }> {
  // Invisibly compress images/videos to reduce latency and bandwidth
  const optimizedFile = await compressMedia(file);
  const formData = new FormData();
  formData.append('file', optimizedFile);
  formData.append('folder', folder);

  const userId = getSessionUserId() || '';
  const res = await fetch(`${API_BASE}/upload/media`, {
    method: 'POST',
    headers: {
      ...(userId ? { 'x-user-id': userId } : {})
    },
    body: formData
  });

  return await res.json();
}

// Full detailed Profile Update
export async function updateFullProfile(profileData: Partial<User>): Promise<{ success: boolean; user: User; message?: string }> {
  const res = await fetch(`${API_BASE}/users/profile/update`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify(profileData)
  });
  return await res.json();
}

// Music Hub APIs
export async function fetchMusicTracks(): Promise<import('../types').MusicTrack[]> {
  const res = await fetch(`${API_BASE}/music/tracks`, { headers: getAuthHeaders() });
  const data = await res.json();
  return data.tracks || [];
}

export async function uploadMusicTrack(trackData: {
  title: string;
  artist?: string;
  genre?: string;
  audioUrl: string;
  coverUrl?: string;
  duration?: string;
}): Promise<{ success: boolean; track: import('../types').MusicTrack }> {
  const res = await fetch(`${API_BASE}/music/tracks`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify(trackData)
  });
  return await res.json();
}

export async function toggleLikeMusicTrack(trackId: string): Promise<{ success: boolean; isLiked: boolean; likesCount: number }> {
  const res = await fetch(`${API_BASE}/music/tracks/${trackId}/like`, {
    method: 'POST',
    headers: getAuthHeaders()
  });
  return await res.json();
}

// Games & NOOB Points APIs
export async function fetchGameLeaderboard(): Promise<{
  leaderboard: GameLeaderboardEntry[];
  currentUserPoints: number;
  currentUserRank: number;
}> {
  const res = await fetch(`${API_BASE}/games/leaderboard`, { headers: getAuthHeaders() });
  return await res.json();
}

export async function recordGameMatch(
  gameId: string,
  gameTitle: string,
  result: 'win' | 'tie' | 'loss',
  opponentName?: string,
  vsBot?: boolean
): Promise<{
  success: boolean;
  earnedPoints: number;
  totalNoobPoints: number;
  result: string;
  user?: User;
}> {
  const res = await fetch(`${API_BASE}/games/record-match`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify({ gameId, gameTitle, result, opponentName, vsBot })
  });
  return await res.json();
}

export async function submitSurvivalScore(
  gameId: string,
  gameTitle: string,
  survivalSeconds: number
): Promise<{
  success: boolean;
  earnedPoints: number;
  survivalSeconds: number;
  totalNoobPoints: number;
  user?: User;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/games/survival-score`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify({ gameId, gameTitle, survivalSeconds })
  });
  return await res.json();
}

export async function sendGameInvite(
  targetUserId: string,
  gameId: string,
  gameTitle: string,
  roomCode?: string
): Promise<{ success: boolean; message: string; chatId: string; invite: any }> {
  const res = await fetch(`${API_BASE}/games/send-invite`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify({ targetUserId, gameId, gameTitle, roomCode })
  });
  return await res.json();
}

// --- Discount Coupons (Wallet > My Coupons) ---

export interface Coupon {
  id: string;
  code: string;
  title: string;
  discountPercent: number;
  terms: string[];
  targetUsername: string | null;
  createdAt: string;
  active: boolean;
}

export async function fetchMyCoupons(manage = false): Promise<Coupon[]> {
  const res = await fetch(`${API_BASE}/coupons${manage ? '?manage=1' : ''}`, {
    headers: getAuthHeaders()
  });
  const data = await res.json();
  return data.coupons || [];
}

export async function createCoupon(payload: {
  title: string;
  discountPercent: number;
  terms: string;
  targetUsername?: string;
}): Promise<{ success: boolean; coupon?: Coupon; error?: string }> {
  const res = await fetch(`${API_BASE}/coupons`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify(payload)
  });
  const data = await res.json();
  return { success: res.ok && data.success, coupon: data.coupon, error: data.error };
}

export async function deleteCoupon(id: string): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/coupons/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  const data = await res.json();
  return { success: res.ok && data.success, error: data.error };
}

export async function redeemCouponCode(code: string): Promise<{ success: boolean; coupon?: Coupon; error?: string }> {
  const res = await fetch(`${API_BASE}/coupons/redeem`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify({ code })
  });
  const data = await res.json();
  return { success: res.ok && data.success, coupon: data.coupon, error: data.error };
}

// --- Personal Sticker Gallery (Chat > Stickers > My Stickers) ---
// Turns any photo into a sticker. Every read/write here is scoped
// server-side to the logged-in user; no other account can ever see or use
// stickers made from someone else's gallery.

export interface MyCustomSticker {
  id: string;
  title: string;
  url: string;
}

export async function fetchMyStickers(): Promise<MyCustomSticker[]> {
  const res = await fetch(`${API_BASE}/stickers`, { headers: getAuthHeaders() });
  const data = await res.json();
  return data.stickers || [];
}

export async function uploadCustomSticker(file: File, title?: string): Promise<{ success: boolean; error?: string }> {
  const uploadResult = await uploadMediaFile(file, 'stickers');
  if (!uploadResult.success) {
    return { success: false, error: 'Failed to upload sticker.' };
  }
  // Without B2 credentials configured (e.g. local dev), uploadMediaFile falls back
  // to a data: URI that only exists in this one response — store that directly
  // instead of a short object key that would resolve to nothing on the next
  // fetch. signMediaKey already passes a data: URI through unchanged either way.
  const reference = uploadResult.url?.startsWith('data:') ? uploadResult.url : uploadResult.objectKey;
  const res = await fetch(`${API_BASE}/stickers`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify({ objectKey: reference, title })
  });
  const data = await res.json();
  return { success: res.ok && data.success, error: data.error };
}

export async function deleteCustomSticker(id: string): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/stickers/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  const data = await res.json();
  return { success: res.ok && data.success, error: data.error };
}

export async function upgradeProTier(payload: {
  tierId: string;
  billing: 'monthly' | 'yearly';
  couponCode?: string;
}): Promise<{ success: boolean; user?: User; error?: string }> {
  const res = await fetch(`${API_BASE}/users/upgrade-pro`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify(payload)
  });
  const data = await res.json();
  return { success: res.ok && data.success, user: data.user, error: data.error };
}

export async function transferNoobPoints(payload: {
  recipientId: string;
  amount: number;
  note?: string;
}): Promise<{ success: boolean; user?: User; message?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/wallet/transfer`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify(payload)
  });
  const data = await res.json();
  return { success: res.ok && data.success, user: data.user, message: data.message, error: data.error };
}

export async function fetchShopCatalog(): Promise<{ catalog: ShopItem[]; ownedItemIds: string[] }> {
  const res = await fetch(`${API_BASE}/shop/catalog`, { headers: getAuthHeaders() });
  const data = await res.json();
  return { catalog: data.catalog || [], ownedItemIds: data.ownedItemIds || [] };
}

export async function purchaseShopItem(itemId: string): Promise<{ success: boolean; item?: ShopItem; user?: User; error?: string }> {
  const res = await fetch(`${API_BASE}/shop/purchase`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify({ itemId })
  });
  const data = await res.json();
  return { success: res.ok && data.success, item: data.item, user: data.user, error: data.error };
}

export async function revealScratchCard(
  scratchCardId: string
): Promise<{ success: boolean; gift?: { type: string; value: number | string; label: string }; user?: User; alreadyRevealed?: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/scratch-cards/${scratchCardId}/reveal`, {
    method: 'POST',
    headers: getAuthHeaders()
  });
  const data = await res.json();
  return { success: res.ok && data.success, gift: data.gift, user: data.user, alreadyRevealed: data.alreadyRevealed, error: data.error };
}

// Legacy Games
export async function fetchLeaderboard(gameId?: string): Promise<GameLeaderboardEntry[]> {
  const data = await fetchGameLeaderboard();
  return data.leaderboard || [];
}

export async function submitGameScore(gameId: string, score: number) {
  const res = await fetch(`${API_BASE}/games/score`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify({
      gameId,
      gameTitle: gameId === 'cyber_drone' ? 'Cyber Drone' : 'Neon Snake',
      score,
      noobsPoints: score * 10
    })
  });
  return await res.json();
}

// Insights & Settings
export async function fetchInsights(): Promise<ProfessionalInsights> {
  const res = await fetch(`${API_BASE}/insights`);
  const data = await res.json();
  return data.insights;
}

export async function fetchSettings(): Promise<AppSettings> {
  const res = await fetch(`${API_BASE}/settings`);
  const data = await res.json();
  return data.settings;
}

export async function updateUserSettings(userConfig: Partial<User>): Promise<User> {
  return updateCurrentUser(userConfig);
}

export async function updateSettings(newSettings: Partial<AppSettings>): Promise<AppSettings> {
  const res = await fetch(`${API_BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: safeJsonStringify(newSettings)
  });
  const data = await res.json();
  return data.settings;
}

// AI Customer Support Assistant
export async function askAiSupportAssistant(
  message: string,
  conversationHistory?: Array<{ sender: 'user' | 'bot'; text: string }>
): Promise<{ success: boolean; reply: string; model?: string; user?: any; error?: string }> {
  const res = await fetch(`${API_BASE}/support/ai-chat`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify({ message, conversationHistory })
  });
  return await res.json();
}

// NOOB Admin & Notifications APIs
export async function fetchAppNotifications(): Promise<{ notifications: import('../types').AppNotification[] }> {
  const res = await fetch(`${API_BASE}/notifications`, { headers: getAuthHeaders() });
  return await res.json();
}

export async function markNotificationsAsRead(): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/notifications/mark-read`, {
    method: 'POST',
    headers: getAuthHeaders()
  });
  return await res.json();
}

export async function clearAllNotifications(): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/notifications/clear`, {
    method: 'POST',
    headers: getAuthHeaders()
  });
  return await res.json();
}

export async function sendAdminNotification(payload: {
  target?: string;
  title: string;
  message: string;
}): Promise<{ success: boolean; message: string; notification?: any; error?: string }> {
  const res = await fetch(`${API_BASE}/admin/send-notification`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify(payload)
  });
  return await res.json();
}

export async function suspendUserAccount(payload: {
  targetUserId: string;
  reason?: string;
  suspend?: boolean;
}): Promise<{ success: boolean; message: string; user?: User; error?: string }> {
  const res = await fetch(`${API_BASE}/admin/suspend-user`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify(payload)
  });
  return await res.json();
}

export async function registerPushToken(token: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/users/push-token`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify({ token })
  });
  return await res.json();
}

export async function deleteUserAccount(targetUserId: string): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/admin/delete-user`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify({ targetUserId })
  });
  return await res.json();
}

export async function fetchAdminUsersList(): Promise<{ success: boolean; users: User[]; error?: string }> {
  const res = await fetch(`${API_BASE}/admin/users`, { headers: getAuthHeaders() });
  return await res.json();
}

// Admin Safety Reporting APIs
export async function fetchAdminReports(): Promise<{ success: boolean; reports: any[]; error?: string }> {
  const res = await fetch(`${API_BASE}/admin/reports`, { headers: getAuthHeaders() });
  return await res.json();
}

export async function takeAdminReportAction(
  reportId: string,
  action: 'resolved' | 'dismissed' | 'banned',
  suspendTarget: boolean = false
): Promise<{ success: boolean; message?: string; report?: any; error?: string }> {
  const res = await fetch(`${API_BASE}/admin/reports/${reportId}/action`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify({ action, suspendTarget })
  });
  return await res.json();
}

// Chat message deletion API
export async function deleteChatMessage(
  chatId: string,
  messageId: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages/${messageId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  return await res.json();
}
