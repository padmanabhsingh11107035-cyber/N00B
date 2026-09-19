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
  ShopItem,
  StoreProduct,
  StoreProductMedia
} from '../types';
import { uploadMediaFile } from './supabaseApi';
import { safeJsonStringify } from '../utils/safeJson';

// Phase 1 (accounts, profiles, follows, posts, comments, notifications, settings, media upload) now runs
// on Supabase — same function names and return shapes as the old Express versions.
export {
  fetchHealth,
  signupUser,
  loginUser,
  verifyUsernameExists,
  recoverAccountAccess,
  logoutUser,
  deleteMyAccount,
  fetchCurrentUser,
  checkSessionStatus,
  updateCurrentUser,
  updateUserBio,
  updateUserStatusNote,
  fetchUsers,
  toggleFollowUser,
  acceptFollowRequest,
  declineFollowRequest,
  fetchPosts,
  fetchLikedPosts,
  fetchSavedPosts,
  fetchArchivedPosts,
  createPost,
  toggleLikePost,
  fetchPostLikers,
  recordPostView,
  fetchPostViewers,
  toggleSavePost,
  toggleArchivePost,
  toggleCommentsPost,
  toggleLikeCountPost,
  deletePost,
  deletePostSlide,
  fetchComments,
  addComment,
  deleteComment,
  togglePinComment,
  fetchAppNotifications,
  markNotificationsAsRead,
  clearAllNotifications,
  fetchSettings,
  updateSettings,
  updateUserSettings,
  uploadMediaFile,
  updateFullProfile,
  fetchStories,
  createStory,
  recordStoryView,
  fetchStoryViewers,
  addCommentToStory,
  deleteStory,
  fetchHighlights,
  createHighlight,
  fetchReels,
  createReel,
  toggleLikeReel,
  fetchReelLikers,
  fetchReelViewers,
  toggleSaveReel,
  fetchReelComments,
  addReelComment,
  recordReelView,
  fetchReelHistory,
  deleteReel,
  fetchMusicTracks,
  uploadMusicTrack,
  toggleLikeMusicTrack,
  renameMusicTrack,
  fetchMyStickers,
  uploadCustomSticker,
  deleteCustomSticker,
  fetchCollections,
  createCollection,
  addPostToCollection,
  fetchChats,
  createChat,
  deleteChat,
  fetchMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  sendTypingStatus,
  fetchTypingUsers,
  updateChatSettings,
  endChat,
  submitChatReview,
  createGroupChat,
  updateGroupDetails,
  manageGroupAdmin,
  removeGroupMember,
  addGroupMembers,
  blockUser,
  unblockUser,
  toggleChatPin,
  toggleChatMute,
  subscribeToChatChanges
} from './supabaseApi';

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

export interface LiveAvatarPreset {
  id: string;
  name: string;
  url: string;
}

export async function fetchLiveAvatarPresets(): Promise<{ presets: LiveAvatarPreset[] }> {
  const res = await fetch(`${API_BASE}/live-avatars/presets`);
  return await res.json();
}

// NOOB Pro only — the server 403s this for a free-tier account.
export async function applyLiveAvatar(payload: { presetId?: string; customUrl?: string }): Promise<{
  success: boolean;
  user?: User;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/users/me/live-avatar`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify(payload)
  });
  return await res.json();
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

export type ScreenshotContentType = 'profile' | 'post' | 'story' | 'reel' | 'chat';

// Best-effort only — see the server route's own comment for exactly what
// this can and can't actually detect. Deliberately swallows its own errors:
// a missed screenshot alert should never surface as a visible app error.
export async function sendScreenshotAlert(contentType: ScreenshotContentType, contentId: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/screenshot-alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ contentType, contentId })
    });
  } catch {
    // Best-effort — see above.
  }
}

export async function translateMessage(chatId: string, messageId: string): Promise<string> {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages/${messageId}/translate`, { 
    method: 'POST',
    headers: getAuthHeaders()
  });
  const data = await res.json();
  return data.translatedText;
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

// --- Real 2-player matches (friend invite rooms + random matchmaking) ---

export interface GameRoomPlayer {
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
}

export interface GameRoom {
  code: string;
  gameId: string;
  gameTitle: string;
  status: 'waiting' | 'ready' | 'finished';
  players: GameRoomPlayer[];
  resultsSubmittedBy: string[];
  outcome: { results: Record<string, 'win' | 'tie' | 'loss'>; points: Record<string, number> } | null;
  // Present only for games with true live-synced play (currently Tic Tac
  // Toe) — the two players move on this same shared board instead of each
  // playing their own round against a bot.
  board?: ('X' | 'O' | null)[] | null;
  turn?: string | null;
}

export async function joinGameRoom(
  code: string,
  gameId: string,
  gameTitle: string
): Promise<{ success: boolean; room?: GameRoom; error?: string }> {
  const res = await fetch(`${API_BASE}/games/rooms/join`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify({ code, gameId, gameTitle })
  });
  return await res.json();
}

export async function getGameRoom(code: string): Promise<{ success: boolean; room?: GameRoom; error?: string }> {
  const res = await fetch(`${API_BASE}/games/rooms/${code}`, { headers: getAuthHeaders() });
  return await res.json();
}

export async function submitGameRoomResult(
  code: string,
  result: 'win' | 'tie' | 'loss'
): Promise<{ success: boolean; room?: GameRoom; yourTotalPoints?: number; error?: string }> {
  const res = await fetch(`${API_BASE}/games/rooms/${code}/result`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify({ result })
  });
  return await res.json();
}

// Submit one live move into a synced-board match (currently Tic Tac Toe) —
// the server is authoritative on turn order and win detection, and returns
// the updated shared board for both players to poll/render.
export async function submitGameRoomMove(
  code: string,
  index: number
): Promise<{ success: boolean; room?: GameRoom; error?: string }> {
  const res = await fetch(`${API_BASE}/games/rooms/${code}/move`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify({ index })
  });
  return await res.json();
}

export async function joinMatchmaking(
  gameId: string,
  gameTitle: string
): Promise<{ success: boolean; matched: boolean; room?: GameRoom; error?: string }> {
  const res = await fetch(`${API_BASE}/games/matchmaking/join`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify({ gameId, gameTitle })
  });
  return await res.json();
}

export async function getMatchmakingStatus(): Promise<{ success: boolean; matched: boolean; room?: GameRoom }> {
  const res = await fetch(`${API_BASE}/games/matchmaking/status`, { headers: getAuthHeaders() });
  return await res.json();
}

// Chess Blitz is capped at one round a week for free accounts — call this
// once, right before letting the player enter any mode (bot, pass & play,
// friend invite, matchmaking) for that game. NOOB Pro accounts always
// succeed without consuming anything.
export async function startChessRound(): Promise<{ success: boolean; isPro?: boolean; error?: string; nextAvailableAt?: string }> {
  const res = await fetch(`${API_BASE}/games/chess/start`, {
    method: 'POST',
    headers: getAuthHeaders()
  });
  return await res.json();
}

export async function cancelMatchmaking(): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/games/matchmaking/cancel`, {
    method: 'POST',
    headers: getAuthHeaders()
  });
  return await res.json();
}

// --- Discount Coupons (Wallet > My Coupons) ---

export interface Coupon {
  id: string;
  code: string;
  title: string;
  type: 'discount' | 'verification';
  discountPercent: number;
  terms: string[];
  targetUsername: string | null;
  usageLimit: 'once' | 'unlimited';
  usedCount: number;
  usedByMe: boolean;
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
  type?: 'discount' | 'verification';
  usageLimit?: 'once' | 'unlimited';
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

export async function upgradeProTier(payload: {
  tierId: string;
  billing: 'monthly' | 'yearly';
  couponCode?: string;
  autoRenew?: boolean;
}): Promise<{ success: boolean; user?: User; error?: string }> {
  const res = await fetch(`${API_BASE}/users/upgrade-pro`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify(payload)
  });
  const data = await res.json();
  return { success: res.ok && data.success, user: data.user, error: data.error };
}

export async function toggleProAutoRenew(enabled: boolean): Promise<{ success: boolean; proAutoRenew?: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/users/me/pro-auto-renew`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ enabled })
  });
  return await res.json();
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

// --- NOOB Shop (physical-goods store) — distinct from the ShopItem
// points-redemption catalog above. ---
export async function fetchStoreProducts(): Promise<StoreProduct[]> {
  const res = await fetch(`${API_BASE}/store/products`, { headers: getAuthHeaders() });
  const data = await res.json();
  return data.products || [];
}

export async function createStoreProduct(payload: {
  price: number;
  description: string;
  media: StoreProductMedia[];
  inStock: boolean;
}): Promise<{ success: boolean; product?: StoreProduct; error?: string }> {
  const res = await fetch(`${API_BASE}/store/products`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: safeJsonStringify(payload)
  });
  return await res.json();
}

export async function deleteStoreProduct(productId: string): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/store/products/${productId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  return await res.json();
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

export async function adjustUserPoints(
  targetUserId: string,
  payload: { setTo?: number; delta?: number; reason?: string }
): Promise<{ success: boolean; message?: string; user?: User; error?: string }> {
  const res = await fetch(`${API_BASE}/admin/users/${targetUserId}/adjust-points`, {
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

// --- Web Push (real OS/browser notifications) ---
export async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/push/vapid-public-key`);
    const data = await res.json();
    return data.publicKey || null;
  } catch {
    return null;
  }
}

export async function subscribeToPush(subscription: PushSubscription): Promise<boolean> {
  const res = await fetch(`${API_BASE}/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ subscription })
  });
  const data = await res.json();
  return !!data.success;
}

export async function unsubscribeFromPush(): Promise<boolean> {
  const res = await fetch(`${API_BASE}/push/unsubscribe`, {
    method: 'POST',
    headers: getAuthHeaders()
  });
  const data = await res.json();
  return !!data.success;
}
