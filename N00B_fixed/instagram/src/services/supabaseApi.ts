// The Supabase-backed versions of the app's server calls (phase 1: accounts, profiles, follows,
// posts, likes, comments, notifications, settings, media upload).
//
// Every function keeps the exact name, arguments and return shape of the old Express version in
// api.ts, so no screen has to change. The old server's rules now live in the database (see
// supabase/migrations); this file only translates between the screens and those database functions.
import type { Post, User, StatusNote, AppSettings, AppNotification, Story, Reel, StoryHighlight, SavedCollection, MusicTrack, Message, ChatConversation, GameLeaderboardEntry, ShopItem, StoreProduct, StoreProductMedia, StoreProductInput, StoreOrder, ShopDetails, ShopAddress, ProfessionalInsights } from '../types';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { INITIAL_SETTINGS } from '../data/mockData';
import { compressMedia } from '../utils/mediaCompressor';
import { classifySession, type SessionStatus } from '../utils/sessionWatch';
import { recordDiag } from './authDiag';
import { cleanLanguageCode } from '../i18n/languages.ts';
import { settingsRefusedMessage } from '../components/Store/shopOpen';
import { getLanguage } from '../i18n/engine.ts';
import { supabase, resolveMedia, toStoredMedia, MEDIA_BUCKET } from './supabase';
import { createE2ee } from '../e2ee/service.ts';
import { bindMessages } from '../e2ee/messages.ts';
import { browserKeyStore } from '../e2ee/keyring.ts';

// ----------------------------------------------------------------------------- plumbing

class ApiError extends Error {
  code?: string;
  details?: string;
  constructor(message: string, code?: string, details?: string) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

async function rpc<T = any>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new ApiError(error.message, error.code, error.details);
  return data as T;
}

const errorText = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

function mapUser<U extends Partial<User> | null | undefined>(u: U): U {
  if (!u) return u;
  const out: any = { ...u, avatar: resolveMedia((u as any).avatar) };
  if (Array.isArray(out.followRequests)) {
    out.followRequests = out.followRequests.map((r: any) => ({ ...r, avatar: resolveMedia(r.avatar) }));
  }
  return out;
}

function mapPost(p: any): Post {
  return {
    ...p,
    userAvatar: resolveMedia(p.userAvatar),
    slides: (p.slides || []).map((s: any) => ({ ...s, mediaUrl: resolveMedia(s.mediaUrl) }))
  };
}

const mapPosts = (list: any[] | null | undefined): Post[] => (Array.isArray(list) ? list.map(mapPost) : []);

function mapComment(c: any) {
  return c ? { ...c, userAvatar: resolveMedia(c.userAvatar) } : c;
}

function mapNotification(n: any): AppNotification {
  return {
    ...n,
    senderAvatar: n.senderAvatar ? resolveMedia(n.senderAvatar) : n.senderAvatar,
    actorAvatar: n.actorAvatar ? resolveMedia(n.actorAvatar) : n.actorAvatar
  };
}

async function currentSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function fetchHealth(): Promise<{ status: string; usersCount?: number }> {
  try {
    const res = await fetch(`${(import.meta.env.VITE_SUPABASE_URL as string) || ''}/auth/v1/health`, {
      headers: { apikey: (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string) || '' }
    });
    return { status: res.ok ? 'ok' : 'offline' };
  } catch {
    return { status: 'offline' };
  }
}

// ----------------------------------------------------------------------------- authentication

// A photo chosen on the sign-up screen is picked BEFORE the account exists, so there is nobody to
// upload it as yet. It waits here and is uploaded the moment the account is created.
const pendingAvatarFiles = new Map<string, File>();

// A photo that came back as an inline "data:" string (the screens' fallback when an upload fails) is turned
// back into a real file, so it is uploaded properly instead of being stored inside the database.
function dataUriToFile(uri: string, name = 'photo'): File | null {
  const m = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(uri);
  if (!m) return null;
  try {
    const raw = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const ext = (m[1].split('/')[1] || 'bin').split('+')[0].replace('jpeg', 'jpg');
    return new File([bytes], `${name}.${ext}`, { type: m[1] });
  } catch {
    return null;
  }
}

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
  language?: string; // the preferred language chosen on the sign-up form (English when not given)
}): Promise<{ success: boolean; user?: User; error?: string; suspended?: boolean; message?: string }> {
  try {
    // Friendly, specific messages first (the old server's exact wording); Auth alone would just say "database error".
    const check = await rpc<{ ok?: boolean; error?: string; suspended?: boolean; message?: string }>('check_signup', { p: payload });
    if (!check?.ok) return { success: false, error: check?.error || 'Could not create the account.', suspended: check?.suspended, message: check?.message };

    let avatarInput = payload.avatar || '';
    if (avatarInput.startsWith('data:')) {
      const file = dataUriToFile(avatarInput, 'avatar');
      if (file) {
        avatarInput = `pending:${crypto.randomUUID()}`;
        pendingAvatarFiles.set(avatarInput, file);
      } else {
        avatarInput = '';
      }
    }
    const pendingKey = avatarInput.startsWith('pending:') ? avatarInput : '';
    const avatar = pendingKey ? '' : toStoredMedia(avatarInput);

    // Login addresses are private, random ones: the person's real email lives in their private profile
    // (so one email can be used on many accounts) and they log in by username or real email via a lookup.
    const { data, error } = await supabase.auth.signUp({
      email: `${crypto.randomUUID()}@users.nooob.xyz`,
      password: payload.password,
      options: {
        data: {
          username: payload.username,
          display_name: payload.displayName,
          first_name: payload.firstName,
          last_name: payload.lastName,
          email: payload.email,
          country_code: payload.countryCode,
          mobile_number: payload.mobileNumber,
          date_of_birth: payload.dateOfBirth,
          gender: payload.gender,
          avatar,
          bio: payload.bio,
          account_type: payload.accountType,
          business_category: payload.businessCategory,
          business_email: payload.businessEmail,
          business_phone: payload.businessPhone,
          business_address: payload.businessAddress,
          agreed_to_terms: payload.agreedToTerms,
          language: cleanLanguageCode(payload.language)
        }
      }
    });
    if (error) {
      const msg = /password/i.test(error.message) ? error.message : /database error/i.test(error.message)
        ? 'User ID is already taken. Please choose another.'
        : error.message;
      return { success: false, error: msg };
    }
    if (!data.session) {
      return { success: false, error: 'Your account was created but needs confirmation before you can log in. Please contact support.' };
    }

    if (pendingKey) {
      const file = pendingAvatarFiles.get(pendingKey);
      pendingAvatarFiles.delete(pendingKey);
      if (file) {
        try {
          const uploaded = await uploadToStorage(file, 'avatars');
          await rpc('update_my_profile', { p: { avatar: uploaded.objectKey } });
        } catch (err) {
          console.error('Profile photo upload after sign-up failed — the account keeps the default photo:', err);
        }
      }
    }
    const user = await rpc<User>('get_my_user');
    // Never awaited, never lets a slow or failed email hold up or fail the signup itself.
    void supabase.functions.invoke('recover-account', { body: { action: 'welcome' } }).catch(() => undefined);
    return { success: true, user: startChatKeys(mapUser(user), payload.password) as User };
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not create the account. Please try again.') };
  }
}

export async function loginUser(payload: {
  identifier: string;
  password?: string;
}): Promise<{ success: boolean; user?: User; error?: string }> {
  const identifier = (payload.identifier || '').trim();
  if (!identifier || !payload.password) return { success: false, error: 'Username/Email and password are required' };
  try {
    const email = await rpc<string>('resolve_login_email', { identifier });
    const { error } = await supabase.auth.signInWithPassword({ email, password: payload.password });
    if (error) {
      if (/rate|too many/i.test(error.message)) return { success: false, error: 'Too many attempts. Please wait a moment and try again.' };
      if (/banned/i.test(error.message)) return { success: false, error: 'This account has been suspended by NOOB Administrator.' };
      if (!identifier.includes('@') && !(await rpc<boolean>('username_taken', { candidate: identifier }))) {
        return { success: false, error: 'Account not found. Please click "Create Account" below.' };
      }
      return { success: false, error: 'Incorrect password. Please check your credentials.' };
    }
    const user = await rpc<any>('get_my_user');
    if (user?.isSuspended) {
      await supabase.auth.signOut({ scope: 'local' });
      return {
        success: false,
        error: `This account has been suspended by NOOB Administrator.${user.suspendedReason ? ' Reason: ' + user.suspendedReason : ''}`
      };
    }
    return { success: true, user: startChatKeys(mapUser(user), payload.password) as User };
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not log in. Please check your connection and try again.') };
  }
}

export async function verifyUsernameExists(username: string): Promise<{ exists: boolean; error?: string }> {
  if (!username || !username.trim()) return { exists: false, error: 'Please enter a username.' };
  try {
    return { exists: await rpc<boolean>('username_taken', { candidate: username }) };
  } catch (err) {
    return { exists: false, error: errorText(err, 'Could not check that username.') };
  }
}

// The message an Edge Function sent back with a failing status (its body is { error: "..." }).
async function functionError(error: any, fallback: string): Promise<string> {
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return String(body.error);
  } catch {
    // not JSON — use the fallback
  }
  return fallback;
}

// "Forgot password": the "recover-account" Edge Function checks mobile number + date of birth + email (with
// guess limits) and answers with a one-time sign-in token, which is exchanged here for a normal session.
export async function recoverAccountAccess(payload: {
  username: string;
  mobileNumber: string;
  dateOfBirth: string;
  email: string;
}): Promise<{ success: boolean; user?: User; error?: string }> {
  const unavailable = 'Recovery is unavailable right now. Please try again later.';
  try {
    const { data, error } = await supabase.functions.invoke('recover-account', { body: payload });
    if (error) return { success: false, error: await functionError(error, unavailable) };
    if (!data?.tokenHash) return { success: false, error: unavailable };
    const { error: signInError } = await supabase.auth.verifyOtp({ token_hash: data.tokenHash, type: 'magiclink' });
    if (signInError) return { success: false, error: 'Could not sign you in. Please try again.' };
    const user = await rpc<any>('get_my_user');
    return { success: true, user: mapUser(user) as User };
  } catch (err) {
    return { success: false, error: errorText(err, unavailable) };
  }
}

// "Forgot password", a second way in: a 6-digit code emailed to the address already on file. `notConfigured` is set when the
// site has not switched this on yet (no email-sending key set) — the screen should fall back to the security-question form.
export async function requestLoginOtp(username: string): Promise<{ success: boolean; maskedEmail?: string; error?: string; notConfigured?: boolean }> {
  const unavailable = 'Recovery is unavailable right now. Please try again later.';
  try {
    const { data, error } = await supabase.functions.invoke('recover-account', { body: { action: 'otp-request', username } });
    if (error) {
      let body: any = null;
      try { body = await (error as any)?.context?.json?.(); } catch { /* use the fallback below */ }
      return { success: false, error: body?.error || unavailable, notConfigured: body?.notConfigured === true };
    }
    if (!data?.maskedEmail) return { success: false, error: unavailable };
    return { success: true, maskedEmail: data.maskedEmail };
  } catch (err) {
    return { success: false, error: errorText(err, unavailable) };
  }
}

// The code from that email, exchanged for a normal session exactly like the security-question path.
export async function verifyLoginOtp(payload: { username: string; code: string }): Promise<{ success: boolean; user?: User; error?: string }> {
  const unavailable = 'Recovery is unavailable right now. Please try again later.';
  try {
    const { data, error } = await supabase.functions.invoke('recover-account', { body: { action: 'otp-verify', username: payload.username, code: payload.code } });
    if (error) return { success: false, error: await functionError(error, unavailable) };
    if (!data?.tokenHash) return { success: false, error: unavailable };
    const { error: signInError } = await supabase.auth.verifyOtp({ token_hash: data.tokenHash, type: 'magiclink' });
    if (signInError) return { success: false, error: 'Could not sign you in. Please try again.' };
    const user = await rpc<any>('get_my_user');
    return { success: true, user: startChatKeys(mapUser(user)) as User };
  } catch (err) {
    return { success: false, error: errorText(err, unavailable) };
  }
}

// Log out of THIS device only. (The library's default, "global", also ends the same account's login on every other device: logging
// out on the phone used to sign the laptop out within the hour.) The note lets other tabs of this browser say why they were signed out.
export async function logoutUser(): Promise<{ success: boolean }> {
  recordDiag({ kind: 'explicit-logout' });
  await supabase.auth.signOut({ scope: 'local' });
  return { success: true };
}

export async function deleteMyAccount(password: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await rpc<{ success: boolean; message?: string }>('delete_my_account', { p_password: password });
    await supabase.auth.signOut({ scope: 'local' });
    return res;
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not delete the account.') };
  }
}

// Once a person is known to be signed in, this device gets its chat key ready in the background (so a chat is already locked for it before
// anybody writes to them). Never blocks anything, and never fails loudly. `password` is only ever passed right after this same sign-up
// or login call handed it to us — it lets a brand new device pick up the account's own existing key instead of making a separate one,
// so the account reads and sends as a single identity no matter how many devices are signed into it at once.
function startChatKeys<U extends { id?: string } | null | undefined>(user: U, password?: string): U {
  if (user?.id) void e2ee.ensure(user.id, password).catch(() => undefined);
  return user;
}

export async function fetchCurrentUser(): Promise<User | null> {
  try {
    if (!(await currentSession())) return null;
    const user = await rpc<User | null>('get_my_user');
    return user ? (startChatKeys(mapUser(user)) as User) : null;
  } catch {
    return null;
  }
}

// Is this person still logged in, and is the account OK? "suspended" is reported ONLY when the database says so;
// "signed-out" when this browser no longer holds a login; anything that could not be checked is "unknown"
// (and never ends a session). See utils/sessionWatch.ts.
// `expectedUserId` is whose account this tab is showing: if the browser's saved login now belongs to someone else (another tab signed in
// as a different account) the answer is "switched".
export async function checkSessionStatus(expectedUserId?: string): Promise<SessionStatus> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) return classifySession({ sessionCheckFailed: !!error, hasSession: false, profileCheckFailed: false, profileFound: false, isSuspended: false });
    const sessionUserId = data.session.user.id;
    if (expectedUserId && sessionUserId !== expectedUserId) {
      return classifySession({ sessionCheckFailed: false, hasSession: true, profileCheckFailed: false, profileFound: false, isSuspended: false, sessionUserId, expectedUserId });
    }
    const { data: row, error: qErr } = await supabase.from('profiles').select('is_suspended').eq('id', sessionUserId).maybeSingle();
    return classifySession({ sessionCheckFailed: false, hasSession: true, profileCheckFailed: !!qErr, profileFound: !!row, isSuspended: !!row?.is_suspended, sessionUserId, expectedUserId });
  } catch {
    return 'unknown';
  }
}

// For loading the app: like fetchCurrentUser, but a FAILED request is an error ("couldn't load, retry") instead of
// looking like "nobody is logged in", which would drop a signed-in person on the login screen after a connection hiccup.
// Returns null only when there really is no login saved in this browser.
export async function loadSignedInUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) return null;
  const user = await rpc<User | null>('get_my_user');
  return user ? (startChatKeys(mapUser(user)) as User) : null;
}

// The old PUT /users/me only ever accepted these fields; everything else goes through updateFullProfile.
const SELF_UPDATABLE_FIELDS = ['bio', 'statusNote', 'accountType', 'isBusiness', 'businessCategory', 'privacySettings'] as const;

export async function updateCurrentUser(userData: Partial<User>): Promise<User> {
  const patch: Record<string, unknown> = {};
  for (const field of SELF_UPDATABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(userData, field)) patch[field] = (userData as any)[field];
  }
  if (userData.password) {
    const { error } = await supabase.auth.updateUser({ password: userData.password });
    if (error) throw new Error(error.message);
  }
  if (Object.keys(patch).length === 0) {
    const current = await fetchCurrentUser();
    if (!current) throw new Error('Not authenticated');
    return current;
  }
  const user = await rpc<User>('update_my_profile', { p: patch });
  return mapUser(user) as User;
}

export async function updateUserBio(newBio: string): Promise<User> {
  return updateCurrentUser({ bio: newBio });
}

export async function updateUserStatusNote(note?: StatusNote): Promise<User> {
  return updateCurrentUser({ statusNote: note });
}

export async function updateFullProfile(profileData: Partial<User>): Promise<{ success: boolean; user: User; message?: string }> {
  try {
    const patch: Record<string, unknown> = { ...profileData };
    delete patch.password;
    if (typeof patch.avatar === 'string' && patch.avatar.startsWith('data:')) {
      const file = dataUriToFile(patch.avatar, 'avatar');
      if (file) patch.avatar = (await uploadToStorage(file, 'avatars')).objectKey;
    } else if (typeof patch.avatar === 'string') {
      patch.avatar = toStoredMedia(patch.avatar);
    }
    const user = await rpc<User>('update_my_profile', { p: patch });
    return { success: true, user: mapUser(user) as User, message: 'Profile successfully updated' };
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not update your profile.') } as any;
  }
}

// A post's or reel's author is only a small denormalized copy (username, avatar, display name) — this fetches their real, full profile
// for "view profile" from a post/reel/etc. `null` when they don't exist any more, or hid their profile from this viewer.
export async function fetchUserById(id: string): Promise<User | null> {
  try {
    const u = await rpc<any>('user_by_id', { p_id: id });
    return u ? (mapUser(u) as User) : null;
  } catch {
    return null;
  }
}

export async function fetchUsers(search?: string): Promise<User[]> {
  try {
    if (!(await currentSession())) return [];
    const list = await rpc<User[]>('search_users', { p_search: search || '' });
    return (list || []).map((u) => mapUser(u) as User);
  } catch {
    return [];
  }
}

export async function toggleFollowUser(userId: string): Promise<{ success: boolean; isFollowing: boolean; isFollowRequested?: boolean; followersCount: number; message?: string }> {
  try {
    return await rpc('toggle_follow', { p_target: userId });
  } catch (err) {
    return { success: false, isFollowing: false, isFollowRequested: false, followersCount: 0, message: errorText(err, 'Could not update follow.'), error: errorText(err, 'Could not update follow.') } as any;
  }
}

export async function acceptFollowRequest(requesterId: string): Promise<{ success: boolean; followersCount: number; followRequests: any[] }> {
  try {
    const res = await rpc<any>('accept_follow_request', { p_requester: requesterId });
    return { ...res, followRequests: (res.followRequests || []).map((r: any) => ({ ...r, avatar: resolveMedia(r.avatar) })) };
  } catch (err) {
    return { success: false, followersCount: 0, followRequests: [], error: errorText(err, 'Could not accept the request.') } as any;
  }
}

export async function declineFollowRequest(requesterId: string): Promise<{ success: boolean; followRequests: any[] }> {
  try {
    const res = await rpc<any>('decline_follow_request', { p_requester: requesterId });
    return { ...res, followRequests: (res.followRequests || []).map((r: any) => ({ ...r, avatar: resolveMedia(r.avatar) })) };
  } catch (err) {
    return { success: false, followRequests: [], error: errorText(err, 'Could not decline the request.') } as any;
  }
}

// ----------------------------------------------------------------------------- posts

export async function fetchPosts(_category?: string, _location?: string): Promise<Post[]> {
  // (The old server ignored both filters too — screens filter what they show.)
  try {
    if (!(await currentSession())) return []; // logged-out visitors see nothing (and we don't even ask)
    return mapPosts(await rpc<any[]>('feed_posts'));
  } catch {
    return [];
  }
}

export async function fetchLikedPosts(): Promise<Post[]> {
  try {
    if (!(await currentSession())) return [];
    return mapPosts(await rpc<any[]>('liked_posts'));
  } catch {
    return [];
  }
}

export async function fetchSavedPosts(): Promise<Post[]> {
  try {
    if (!(await currentSession())) return [];
    return mapPosts(await rpc<any[]>('saved_posts'));
  } catch {
    return [];
  }
}

export async function fetchArchivedPosts(): Promise<Post[]> {
  try {
    if (!(await currentSession())) return [];
    return mapPosts(await rpc<any[]>('archived_posts'));
  } catch {
    return [];
  }
}

export async function createPost(postData: Partial<Post>): Promise<Post> {
  try {
    const slides = (postData.slides || []).map((s) => {
      const key = toStoredMedia(s.objectKey || s.mediaUrl);
      return { ...s, mediaUrl: key, objectKey: key };
    });
    const post = await rpc<any>('create_post', {
      p_slides: slides,
      p_caption: postData.caption || '',
      p_category: postData.category || 'tech',
      p_hashtags: postData.hashtags || [],
      p_audio: postData.audioTrack ?? null,
      p_web_link: postData.webLink || null
    });
    return mapPost(post);
  } catch (err) {
    throw new Error(errorText(err, 'Failed to publish post.'));
  }
}

export async function toggleLikePost(postId: string): Promise<{ isLiked: boolean; likesCount: number }> {
  try { return await rpc('toggle_post_like', { p_post: postId }); } catch (err) { return { error: errorText(err, 'Could not update the like.') } as any; }
}

export async function fetchPostLikers(postId: string): Promise<{ users: User[] }> {
  try {
    const res = await rpc<{ users: User[] }>('post_likers', { p_post: postId });
    return { users: (res.users || []).map((u) => mapUser(u) as User) };
  } catch {
    return { users: [] };
  }
}

export async function recordPostView(postId: string) {
  try { return await rpc('record_post_view', { p_post: postId }); } catch { return { success: false }; }
}

// Owner-only — the database refuses anyone but the post's own author.
export async function fetchPostViewers(postId: string): Promise<{ users: User[]; error?: string }> {
  try {
    const res = await rpc<{ users: User[] }>('post_viewers', { p_post: postId });
    return { users: (res.users || []).map((u) => mapUser(u) as User) };
  } catch (err) {
    return { users: [], error: errorText(err, 'Only the post owner can see who viewed it.') };
  }
}

export async function toggleSavePost(postId: string): Promise<{ isSaved: boolean; savesCount: number }> {
  try { return await rpc('toggle_post_save', { p_post: postId }); } catch (err) { return { error: errorText(err, 'Could not update the save.') } as any; }
}

export async function toggleArchivePost(postId: string): Promise<{ isArchived: boolean }> {
  try { return await rpc('toggle_post_flag', { p_post: postId, p_flag: 'archive' }); } catch (err) { return { error: errorText(err, 'You can only modify your own posts.') } as any; }
}

export async function toggleCommentsPost(postId: string): Promise<{ isCommentsDisabled: boolean }> {
  try { return await rpc('toggle_post_flag', { p_post: postId, p_flag: 'comments' }); } catch (err) { return { error: errorText(err, 'You can only modify your own posts.') } as any; }
}

export async function toggleLikeCountPost(postId: string): Promise<{ isLikeCountHidden: boolean }> {
  try { return await rpc('toggle_post_flag', { p_post: postId, p_flag: 'like_count' }); } catch (err) { return { error: errorText(err, 'You can only modify your own posts.') } as any; }
}

export async function toggleCommentsReel(reelId: string): Promise<{ isCommentsDisabled: boolean }> {
  try { return await rpc('toggle_reel_flag', { p_reel: reelId, p_flag: 'comments' }); } catch (err) { return { error: errorText(err, 'You can only modify your own reels.') } as any; }
}

export async function toggleLikeCountReel(reelId: string): Promise<{ isLikeCountHidden: boolean }> {
  try { return await rpc('toggle_reel_flag', { p_reel: reelId, p_flag: 'like_count' }); } catch (err) { return { error: errorText(err, 'You can only modify your own reels.') } as any; }
}

export async function deletePost(postId: string): Promise<boolean> {
  const { data, error } = await supabase.from('posts').delete().eq('id', postId).select('id');
  return !error && Array.isArray(data) && data.length > 0;
}

export async function deletePostSlide(postId: string, slideId: string): Promise<{ success: boolean; post?: Post; error?: string }> {
  try {
    const res = await rpc<any>('delete_post_slide', { p_post: postId, p_slide: slideId });
    return { success: true, post: res.post ? mapPost(res.post) : undefined };
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not remove that picture.') };
  }
}

// ----------------------------------------------------------------------------- comments

export async function fetchComments(postId: string) {
  try {
    const res = await rpc<{ comments: any[] }>('post_comments', { p_post: postId });
    return Array.isArray(res.comments) ? res.comments.map(mapComment) : [];
  } catch (err) {
    console.error('Error fetching comments:', err);
    return [];
  }
}

export async function addComment(postId: string, text: string) {
  try {
    const res = await rpc<{ comment: any }>('add_comment', { p_post: postId, p_text: text });
    return mapComment(res.comment);
  } catch (err) {
    console.error('Could not post the comment:', err);
    return undefined;
  }
}

export async function deleteComment(_postId: string, commentId: string) {
  const { data, error } = await supabase.from('comments').delete().eq('id', commentId).select('id');
  if (error || !data || data.length === 0) return { success: false, error: 'You can only delete your own comments.' };
  return { success: true };
}

export async function togglePinComment(_postId: string, commentId: string) {
  try { return await rpc('toggle_pin_comment', { p_comment: commentId }); } catch (err) { return { success: false, isPinned: false, error: errorText(err, 'Could not pin the comment.') }; }
}

// ----------------------------------------------------------------------------- notifications

// `failed` is true when the list could not be loaded (network hiccup, session refreshing): callers keep what they
// already show instead of replacing it with an empty list.
export async function fetchAppNotifications(): Promise<{ notifications: AppNotification[]; failed?: boolean }> {
  try {
    if (!(await currentSession())) return { notifications: [] };
    const res = await rpc<{ notifications: any[] }>('my_notifications');
    return { notifications: (res.notifications || []).map(mapNotification) };
  } catch {
    return { notifications: [], failed: true };
  }
}

// Calls `onChange` (at most a few times a second) when a notification arrives, is removed, or the connection is
// (re)established — so the bell updates the moment something happens instead of on the next timer tick.
export function subscribeToNotificationChanges(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = () => {
    if (timer) return;
    timer = setTimeout(() => { timer = null; onChange(); }, 300);
  };
  const channel = supabase
    .channel(`notification-changes-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, fire)
    .subscribe((status) => { if (status === 'SUBSCRIBED') fire(); });
  return () => {
    if (timer) clearTimeout(timer);
    supabase.removeChannel(channel);
  };
}

export async function markNotificationsAsRead(): Promise<{ success: boolean }> {
  try { return await rpc('mark_notifications_read'); } catch { return { success: false }; }
}

export async function clearAllNotifications(): Promise<{ success: boolean }> {
  try { return await rpc('clear_notifications'); } catch { return { success: false }; }
}

// ----------------------------------------------------------------------------- settings

const LOCAL_SETTINGS_KEY = 'noob_settings_v1';

function readLocalSettings(): Partial<AppSettings> {
  try { return JSON.parse(localStorage.getItem(LOCAL_SETTINGS_KEY) || '{}'); } catch { return {}; }
}

// Personal preferences (dark mode, notification switches...) are stored on the device; the shop's
// on/off switch and delivery fee are shared and come from the database.
export async function fetchSettings(): Promise<AppSettings> {
  let shared: Partial<AppSettings> = {};
  try {
    if (await currentSession()) shared = await rpc<Partial<AppSettings>>('get_app_settings');
  } catch { /* fall back to defaults */ }
  return { ...INITIAL_SETTINGS, ...readLocalSettings(), storeEnabled: shared.storeEnabled ?? INITIAL_SETTINGS.storeEnabled, storeDeliveryFee: shared.storeDeliveryFee ?? INITIAL_SETTINGS.storeDeliveryFee } as AppSettings;
}

export async function updateSettings(newSettings: Partial<AppSettings>): Promise<AppSettings> {
  const { storeEnabled, storeDeliveryFee, ...personal } = newSettings;
  if (Object.keys(personal).length) {
    try { localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify({ ...readLocalSettings(), ...personal })); } catch { /* storage full/blocked */ }
  }
  if (storeEnabled !== undefined || storeDeliveryFee !== undefined) {
    // The database function checks who is asking, makes the change and writes it to the admin activity log; if it refuses, its
    // message names the account that is signed in.
    const viaFunction = await supabase.rpc('set_shop_settings', { p_enabled: storeEnabled ?? null, p_fee: storeDeliveryFee ?? null });
    if (viaFunction.error) {
      const notInstalled = viaFunction.error.code === 'PGRST202' || /could not find the function/i.test(viaFunction.error.message || '');
      if (!notInstalled) throw new Error(viaFunction.error.message);
      // (the function is not installed yet: change the settings table directly, as before)
      const shared: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (storeEnabled !== undefined) shared.store_enabled = storeEnabled;
      if (storeDeliveryFee !== undefined) shared.store_delivery_fee = storeDeliveryFee;
      // .select() so a change the database silently refused is noticed instead of looking saved
      const { data, error } = await supabase.from('app_settings').update(shared).eq('id', 1).select('id');
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        const who = await supabase.rpc('get_my_user');
        throw new Error(settingsRefusedMessage((who.data as any)?.username));
      }
    }
  }
  return fetchSettings();
}

export async function updateUserSettings(userConfig: Partial<User>): Promise<User> {
  return updateCurrentUser(userConfig);
}

// ----------------------------------------------------------------------------- media upload

type MediaFolder = 'posts' | 'reels' | 'stories' | 'avatars' | 'music' | 'covers' | 'stickers' | 'products';

const BLOCKED_EXTENSIONS = ['heic', 'heif', 'wma'];

async function uploadToStorage(file: File, folder: MediaFolder): Promise<{ success: boolean; objectKey: string; url: string }> {
  const ext = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'dat';
  const mime = (file.type || '').toLowerCase();
  if (BLOCKED_EXTENSIONS.includes(ext) || mime === 'image/heic' || mime === 'image/heif' || mime === 'audio/x-ms-wma') {
    throw new Error(
      ext === 'wma'
        ? "WMA audio isn't supported by web browsers. Please upload MP3, WAV, or M4A instead."
        : "HEIC/HEIF photos aren't supported by web browsers. On iPhone: Settings > Camera > Formats > select \"Most Compatible\" to save new photos as JPEG, or use \"Options\" when picking a photo to convert it first."
    );
  }
  if (!/^(image|video|audio)\//.test(mime)) throw new Error('Only image, video, and audio files can be uploaded.');

  const key = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
  // Straight from the browser to storage — the file never passes through any server of ours.
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(key, file, {
    contentType: mime || undefined,
    cacheControl: '31536000',
    upsert: false
  });
  if (error) throw new Error(error.message || 'Upload failed. Please try again.');
  return { success: true, objectKey: key, url: resolveMedia(key) };
}

export async function uploadMediaFile(
  file: File,
  folder: MediaFolder = 'posts'
): Promise<{ success: boolean; objectKey: string; url: string }> {
  // Invisibly compress images/videos to reduce latency and bandwidth
  const optimizedFile = await compressMedia(file);

  if (!(await currentSession())) {
    if (folder === 'avatars') {
      // Sign-up screen: no account yet — hold the photo and upload it right after the account is created.
      const id = `pending:${crypto.randomUUID()}`;
      pendingAvatarFiles.set(id, optimizedFile);
      return { success: true, objectKey: id, url: URL.createObjectURL(optimizedFile) };
    }
    throw new Error('Please log in to upload.');
  }
  return uploadToStorage(optimizedFile, folder);
}

// ----------------------------------------------------------------------------- stories & highlights

function mapStory(s: any): Story {
  return {
    ...s,
    mediaUrl: resolveMedia(s.mediaUrl),
    userAvatar: resolveMedia(s.userAvatar),
    comments: (s.comments || []).map(mapComment)
  };
}

export async function fetchStories(): Promise<Story[]> {
  try {
    if (!(await currentSession())) return [];
    return ((await rpc<any[]>('active_stories')) || []).map(mapStory);
  } catch {
    return [];
  }
}

export async function createStory(storyData: Partial<Story>): Promise<Story> {
  try {
    const story = await rpc<any>('create_story', {
      p_media_url: toStoredMedia(storyData.mediaUrl),
      p_media_type: storyData.mediaType || 'image',
      p_stickers: storyData.stickers || [],
      p_close_friends: !!storyData.isCloseFriendsOnly
    });
    return mapStory(story);
  } catch (err) {
    throw new Error(errorText(err, 'Could not post your story.'));
  }
}

export async function recordStoryView(storyId: string) {
  try { return await rpc('record_story_view', { p_story: storyId }); } catch { return { success: false }; }
}

// Owner-only — the database refuses anyone but the story's own author.
export async function fetchStoryViewers(storyId: string): Promise<{ users: User[]; error?: string }> {
  try {
    const res = await rpc<{ users: User[] }>('story_viewers', { p_story: storyId });
    return { users: (res.users || []).map((u) => mapUser(u) as User) };
  } catch (err) {
    return { users: [], error: errorText(err, 'Only the story owner can see who viewed it.') };
  }
}

export async function addCommentToStory(storyId: string, text: string) {
  try {
    const res = await rpc<{ comment: any }>('add_story_comment', { p_story: storyId, p_text: text });
    return mapComment(res.comment);
  } catch (err) {
    console.error('Could not post the story comment:', err);
    return undefined;
  }
}

// Deleting a story also has to strip its snapshot out of that day's highlight (and remove the
// whole day's highlight if that was its last page) — a plain `.from('stories').delete()` can't do
// that second part, so this goes through delete_story() instead. The database also now refuses a
// direct delete on `stories` from any client, so this RPC is the only way to remove one.
export async function deleteStory(storyId: string): Promise<boolean> {
  try {
    const res = await rpc<{ success: boolean }>('delete_story', { p_story: storyId });
    return !!res?.success;
  } catch {
    return false;
  }
}

function mapHighlight(h: any): StoryHighlight {
  return {
    id: h.id,
    title: h.title,
    coverUrl: resolveMedia(h.coverUrl),
    dayKey: h.dayKey,
    items: (h.items || []).map((it: any) => ({ ...it, mediaUrl: resolveMedia(it.mediaUrl) }))
  };
}

// Every story is automatically part of a highlight now (grouped by the day it was posted) — pass
// the profile being viewed; omit it to fetch your own. See the 22 Sep story/highlight redesign.
export async function fetchHighlights(userId?: string): Promise<StoryHighlight[]> {
  try {
    if (!(await currentSession())) return [];
    const list = userId
      ? (await rpc<any[]>('highlights_for_user', { p_user: userId })) || []
      : (await rpc<any[]>('my_highlights')) || [];
    return list.map(mapHighlight);
  } catch {
    return [];
  }
}

export async function deleteHighlight(highlightId: string): Promise<boolean> {
  const { data, error } = await supabase.from('highlights').delete().eq('id', highlightId).select('id');
  return !error && Array.isArray(data) && data.length > 0;
}

// ----------------------------------------------------------------------------- reels

function mapReel(r: any): Reel {
  return {
    ...r,
    userAvatar: resolveMedia(r.userAvatar),
    videoUrl: resolveMedia(r.videoUrl),
    thumbnailUrl: resolveMedia(r.thumbnailUrl),
    audioTrack: r.audioTrack
      ? { ...r.audioTrack, coverUrl: r.audioTrack.coverUrl ? resolveMedia(r.audioTrack.coverUrl) : r.audioTrack.coverUrl }
      : r.audioTrack
  };
}

export async function fetchReels(): Promise<Reel[]> {
  try {
    if (!(await currentSession())) return [];
    return ((await rpc<any[]>('feed_reels')) || []).map(mapReel);
  } catch {
    return [];
  }
}

export async function createReel(reelData: Partial<Reel>): Promise<Reel> {
  try {
    const reel = await rpc<any>('create_reel', {
      p_video_url: toStoredMedia(reelData.videoUrl),
      p_thumbnail_url: toStoredMedia(reelData.thumbnailUrl),
      p_caption: reelData.caption || '',
      p_audio: reelData.audioTrack ?? null,
      p_hashtags: reelData.hashtags || [],
      p_category: reelData.category || 'others'
    });
    return mapReel(reel);
  } catch (err) {
    throw new Error(errorText(err, 'Failed to publish reel.'));
  }
}

export async function toggleLikeReel(reelId: string): Promise<{ isLiked: boolean; likesCount: number }> {
  try { return await rpc('toggle_reel_like', { p_reel: reelId }); } catch (err) { return { error: errorText(err, 'Could not update the like.') } as any; }
}

export async function fetchReelLikers(reelId: string): Promise<{ users: User[] }> {
  try {
    const res = await rpc<{ users: User[] }>('reel_likers', { p_reel: reelId });
    return { users: (res.users || []).map((u) => mapUser(u) as User) };
  } catch {
    return { users: [] };
  }
}

// Owner-only — the database refuses anyone but the reel's own author.
export async function fetchReelViewers(reelId: string): Promise<{ users: User[]; error?: string }> {
  try {
    const res = await rpc<{ users: User[] }>('reel_viewers', { p_reel: reelId });
    return { users: (res.users || []).map((u) => mapUser(u) as User) };
  } catch (err) {
    return { users: [], error: errorText(err, 'Only the reel owner can see who viewed it.') };
  }
}

export async function toggleSaveReel(reelId: string): Promise<{ isSaved: boolean; savesCount: number }> {
  try { return await rpc('toggle_reel_save', { p_reel: reelId }); } catch (err) { return { error: errorText(err, 'Could not update the save.') } as any; }
}

export async function fetchReelComments(reelId: string) {
  try {
    const res = await rpc<{ comments: any[] }>('reel_comments', { p_reel: reelId });
    return Array.isArray(res.comments) ? res.comments.map(mapComment) : [];
  } catch (err) {
    console.error('Error fetching reel comments:', err);
    return [];
  }
}

export async function addReelComment(reelId: string, text: string) {
  try {
    const res = await rpc<{ comment: any }>('add_reel_comment', { p_reel: reelId, p_text: text });
    return mapComment(res.comment);
  } catch (err) {
    console.error('Could not post the comment:', err);
    return undefined;
  }
}

export async function recordReelView(reelId: string) {
  try { return await rpc('record_reel_view', { p_reel: reelId }); } catch { return { success: false }; }
}

export async function fetchReelHistory(): Promise<Reel[]> {
  try {
    if (!(await currentSession())) return [];
    return ((await rpc<any[]>('reel_history')) || []).map(mapReel);
  } catch {
    return [];
  }
}

export async function deleteReel(reelId: string): Promise<boolean> {
  const { data, error } = await supabase.from('reels').delete().eq('id', reelId).select('id');
  return !error && Array.isArray(data) && data.length > 0;
}

// ----------------------------------------------------------------------------- music

function mapTrack(t: any): MusicTrack {
  return { ...t, audioUrl: resolveMedia(t.audioUrl), coverUrl: resolveMedia(t.coverUrl), uploaderAvatar: resolveMedia(t.uploaderAvatar) };
}

export async function fetchMusicTracks(): Promise<MusicTrack[]> {
  try {
    if (!(await currentSession())) return [];
    return ((await rpc<any[]>('list_music_tracks')) || []).map(mapTrack);
  } catch {
    return [];
  }
}

export async function uploadMusicTrack(trackData: {
  title: string;
  artist?: string;
  genre?: string;
  audioUrl: string;
  coverUrl?: string;
  duration?: string;
}): Promise<{ success: boolean; track: MusicTrack }> {
  try {
    const res = await rpc<any>('upload_music_track', {
      p: { ...trackData, audioUrl: toStoredMedia(trackData.audioUrl), coverUrl: toStoredMedia(trackData.coverUrl) }
    });
    return { success: true, track: mapTrack(res.track) };
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not upload the track.') } as any;
  }
}

export async function toggleLikeMusicTrack(trackId: string): Promise<{ success: boolean; isLiked: boolean; likesCount: number }> {
  try { return await rpc('toggle_music_like', { p_track: trackId }); } catch (err) { return { success: false, error: errorText(err, 'Could not update the like.') } as any; }
}

// Renaming is restricted (in the database) to the account that uploaded the track.
export async function renameMusicTrack(trackId: string, title: string): Promise<{ success: boolean; track?: MusicTrack; error?: string }> {
  try {
    const res = await rpc<any>('rename_music_track', { p_track: trackId, p_title: title });
    return { success: true, track: mapTrack(res.track) };
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not rename the track.') };
  }
}

// ----------------------------------------------------------------------------- custom stickers

export interface MyCustomSticker {
  id: string;
  title: string;
  url: string;
}

export async function fetchMyStickers(): Promise<MyCustomSticker[]> {
  try {
    if (!(await currentSession())) return [];
    return ((await rpc<MyCustomSticker[]>('my_stickers')) || []).map((s) => ({ ...s, url: resolveMedia(s.url) }));
  } catch {
    return [];
  }
}

export async function uploadCustomSticker(file: File, title?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const uploaded = await uploadMediaFile(file, 'stickers');
    await rpc('add_sticker', { p_key: uploaded.objectKey, p_title: title || null });
    return { success: true };
  } catch (err) {
    return { success: false, error: errorText(err, 'Failed to upload sticker.') };
  }
}

export async function deleteCustomSticker(id: string): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.from('custom_stickers').delete().eq('id', id).select('id');
  if (error || !data || data.length === 0) return { success: false, error: 'You can only delete stickers from your own gallery.' };
  return { success: true };
}

// ----------------------------------------------------------------------------- saved collections

function mapCollection(c: any): SavedCollection {
  return { ...c, coverUrl: resolveMedia(c.coverUrl), coverImage: resolveMedia(c.coverUrl) };
}

export async function fetchCollections(): Promise<SavedCollection[]> {
  try {
    if (!(await currentSession())) return [];
    return ((await rpc<any[]>('my_collections')) || []).map(mapCollection);
  } catch {
    return [];
  }
}

export async function createCollection(payload: Partial<SavedCollection>): Promise<SavedCollection> {
  try {
    const res = await rpc<any>('create_collection', { p_name: payload.name || null, p_cover_url: toStoredMedia(payload.coverUrl || payload.coverImage) || null });
    return mapCollection(res.collection);
  } catch (err) {
    throw new Error(errorText(err, 'Could not create the collection.'));
  }
}

export async function addPostToCollection(collectionId: string, postId: string) {
  try {
    const res = await rpc<any>('add_post_to_collection', { p_collection: collectionId, p_post: postId });
    return { ...res, collection: res.collection ? mapCollection(res.collection) : res.collection };
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not add the post.') };
  }
}

// ----------------------------------------------------------------------------- chats & messages

// The database sends "no value" as null; the old server simply left the key out. Screens were written for that.
function dropNulls<T extends Record<string, any>>(o: T): T {
  const out: any = {};
  for (const [k, v] of Object.entries(o)) if (v !== null) out[k] = v;
  return out;
}

// A locked (end-to-end encrypted) message arrives with its envelope in "e2ee". Screens never see the envelope: the places that receive
// chat messages open it right after mapping (see unlockMessages); anywhere else it is shown as locked rather than as an empty message.
function mapMessage(m: any, keepLocked = false): Message {
  const out: any = dropNulls(m);
  if (out.e2ee && !keepLocked) { delete out.e2ee; out.encrypted = true; out.locked = 'no-key'; }
  if (m.senderAvatar) out.senderAvatar = resolveMedia(m.senderAvatar);
  if (m.mediaUrl) out.mediaUrl = resolveMedia(m.mediaUrl);
  if (m.sharedTrack) {
    out.sharedTrack = {
      ...m.sharedTrack,
      coverUrl: m.sharedTrack.coverUrl ? resolveMedia(m.sharedTrack.coverUrl) : m.sharedTrack.coverUrl,
      audioUrl: m.sharedTrack.audioUrl ? resolveMedia(m.sharedTrack.audioUrl) : m.sharedTrack.audioUrl
    };
  }
  return out as Message;
}

function mapChat(c: any, keepLocked = false): ChatConversation {
  const out: any = dropNulls(c);
  if (c.avatar) out.avatar = resolveMedia(c.avatar);
  out.participants = (c.participants || []).map((p: any) => ({ ...p, avatar: resolveMedia(p.avatar) }));
  if (c.lastMessage) out.lastMessage = mapMessage(c.lastMessage, keepLocked);
  return out as ChatConversation;
}

// A group photo picked on a screen may arrive as an inline "data:" string — upload it as a real file first.
async function storedAvatarFor(value?: string | null): Promise<string | null> {
  if (!value) return null;
  if (value.startsWith('data:')) {
    const file = dataUriToFile(value, 'group');
    return file ? (await uploadToStorage(file, 'avatars')).objectKey : null;
  }
  return toStoredMedia(value);
}

// ----------------------------------------------------------------------------- end-to-end encryption
// This device's chat keys, and locking / opening messages. See src/e2ee/service.ts for the rules it keeps.
const seenStore = {
  get: (k: string): string | null => { try { return localStorage.getItem(`noob_e2ee_seen_v1_${k}`); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(`noob_e2ee_seen_v1_${k}`, v); } catch { /* remembered next time */ } }
};

const deviceLabel = (): string => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iPhone/iPad' : /Windows/i.test(ua) ? 'Windows' : /Mac OS X/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'Device';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'browser';
  return `${os} · ${br}`;
};

const webLocks = typeof navigator !== 'undefined' ? (navigator as any).locks : undefined;

export const e2ee = createE2ee({
  rpc,
  userId: async () => (await currentSession())?.user?.id ?? null,
  storeFor: (id) => browserKeyStore(id),
  seen: seenStore,
  lock: webLocks?.request ? <T,>(name: string, fn: () => Promise<T>) => webLocks.request(name, fn) as Promise<T> : undefined,
  deviceLabel
});

const { unlockOne, unlockMessages, prepareSend, prepareEdit } = bindMessages(e2ee);

export async function fetchChats(): Promise<ChatConversation[]> {
  try {
    if (!(await currentSession())) return [];
    const chats = ((await rpc<any[]>('my_chats')) || []).map((c) => mapChat(c, true));
    await Promise.all(chats.map(async (c) => { if (c.lastMessage) c.lastMessage = await unlockOne(c.id, c.lastMessage); }));
    return chats;
  } catch {
    return [];
  }
}

export async function createChat(payload: {
  participantIds: string[];
  isGroup?: boolean;
  name?: string;
  avatar?: string;
  description?: string;
}): Promise<ChatConversation> {
  try {
    const res = await rpc<any>('create_chat', {
      p_participant_ids: payload.participantIds || [],
      p_is_group: !!payload.isGroup,
      p_name: payload.name || null,
      p_avatar: await storedAvatarFor(payload.avatar),
      p_description: payload.description || null
    });
    return mapChat(res.chat);
  } catch (err) {
    throw new Error(errorText(err, 'Failed to create chat'));
  }
}

export async function deleteChat(chatId: string): Promise<boolean> {
  try {
    const res = await rpc<{ success: boolean }>('delete_chat', { p_chat: chatId });
    return !!res?.success;
  } catch {
    return false;
  }
}

export async function fetchMessages(chatId: string): Promise<Message[]> {
  try {
    const res = await rpc<{ messages: any[] }>('chat_messages', { p_chat: chatId });
    return await unlockMessages(chatId, (res.messages || []).map((m) => mapMessage(m, true)));
  } catch {
    return [];
  }
}

export async function sendMessage(chatId: string, payload: Partial<Message>): Promise<Message & { aiResponse?: Message }> {
  try {
    let media = payload.mediaUrl || '';
    if (media.startsWith('data:')) {
      const file = dataUriToFile(media, 'chat');
      media = file ? (await uploadToStorage(file, 'posts')).objectKey : '';
    }
    // A text message (or a GIF / sticker, which is only a link to a picture) in a chat that CAN be locked is locked on this device. If it can
    // not be locked the message FAILS: it is never quietly sent readable instead. Pictures, video and voice notes are not locked yet.
    const storedMedia = toStoredMedia(media);
    const lockedPayload = await prepareSend(chatId, {
      text: payload.text, storedMedia, mediaType: payload.mediaType, sharedTrack: payload.sharedTrack, gameInvite: payload.gameInvite,
      audioDuration: payload.audioDuration, scheduledAt: payload.scheduledAt, replyToId: payload.replyTo?.messageId
    });
    if (lockedPayload) {
      const locked = await rpc<{ message: any }>('send_message', { p_chat: chatId, p: lockedPayload });
      return (await unlockMessages(chatId, [mapMessage(locked.message, true)]))[0];
    }
    const p: Record<string, unknown> = {
      text: payload.text || '',
      mediaUrl: storedMedia || undefined,
      mediaType: payload.mediaType,
      audioDuration: payload.audioDuration,
      scheduledAt: payload.scheduledAt,
      gameInvite: payload.gameInvite,
      // only the id of a quoted message is sent — the database rebuilds the quote from the real message
      replyTo: payload.replyTo?.messageId ? { messageId: payload.replyTo.messageId } : undefined,
      sharedTrack: payload.sharedTrack
        ? { ...payload.sharedTrack, coverUrl: toStoredMedia(payload.sharedTrack.coverUrl), audioUrl: toStoredMedia(payload.sharedTrack.audioUrl) }
        : undefined
    };
    const res = await rpc<{ message: any }>('send_message', { p_chat: chatId, p });
    return mapMessage(res.message);
  } catch (err) {
    throw new Error(errorText(err, 'Failed to send message'));
  }
}

// A locked message is edited by locking the new text again (a plain edit is refused by the database, so it can never overwrite one).
async function editLocked(chatId: string, messageId: string, text: string): Promise<Message> {
  const env = await prepareEdit(chatId, messageId, text);
  const res = await rpc<{ message: any }>('edit_message_e2ee', { p_chat: chatId, p_message: messageId, p_e2ee: env });
  return (await unlockMessages(chatId, [mapMessage(res.message, true)]))[0];
}

export async function editMessage(chatId: string, messageId: string, text: string): Promise<Message> {
  if (e2ee.payloadOf(messageId)) return editLocked(chatId, messageId, text);
  try {
    const res = await rpc<{ message: any }>('edit_message', { p_chat: chatId, p_message: messageId, p_text: text });
    return mapMessage(res.message);
  } catch (err) {
    if (/end-to-end encrypted/i.test(errorText(err, ''))) return editLocked(chatId, messageId, text);
    throw err;
  }
}

// Authors delete their own; group admins delete in their group; the site admin can moderate any message by id.
export async function deleteMessage(_chatId: string, messageId: string): Promise<boolean> {
  const { data, error } = await supabase.from('messages').delete().eq('id', messageId).select('id');
  if (!error && Array.isArray(data) && data.length > 0) return true;
  try {
    const res = await rpc<{ success: boolean }>('admin_delete_message', { p_message: messageId });
    return !!res?.success;
  } catch {
    return false;
  }
}

// "X is typing…" travels over a live Realtime channel per chat — no database writes, no polling of the server.
const TYPING_TTL_MS = 5000;
const typingRooms = new Map<string, { channel: RealtimeChannel; who: Map<string, { user: User; at: number }> }>();
let cachedCard: { id: string; card: Record<string, unknown> } | null = null;

async function myTypingCard() {
  const session = await currentSession();
  if (!session) return null;
  if (cachedCard?.id === session.user.id) return cachedCard.card;
  const { data } = await supabase.from('profiles').select('id, username, display_name, avatar, is_verified').eq('id', session.user.id).maybeSingle();
  if (!data) return null;
  const card = { id: data.id, username: data.username, displayName: data.display_name, avatar: data.avatar, isVerified: data.is_verified };
  cachedCard = { id: session.user.id, card };
  return card;
}

function typingRoom(chatId: string) {
  let room = typingRooms.get(chatId);
  if (room) return room;
  if (typingRooms.size >= 8) {
    const oldest = typingRooms.keys().next().value as string;
    const old = typingRooms.get(oldest);
    if (old) supabase.removeChannel(old.channel);
    typingRooms.delete(oldest);
  }
  const who = new Map<string, { user: User; at: number }>();
  const channel = supabase.channel(`typing:${chatId}`, { config: { broadcast: { self: false } } });
  channel
    .on('broadcast', { event: 'typing' }, ({ payload }) => {
      const user = payload?.user;
      if (!user?.id) return;
      if (payload.isTyping) who.set(user.id, { user: { ...user, avatar: resolveMedia(user.avatar) } as User, at: Date.now() });
      else who.delete(user.id);
    })
    .subscribe();
  room = { channel, who };
  typingRooms.set(chatId, room);
  return room;
}

export async function sendTypingStatus(chatId: string, isTyping: boolean): Promise<void> {
  try {
    const card = await myTypingCard();
    if (!card) return;
    await typingRoom(chatId).channel.send({ type: 'broadcast', event: 'typing', payload: { user: card, isTyping } });
  } catch {
    // Best-effort — a dropped typing ping isn't worth surfacing an error for.
  }
}

export async function fetchTypingUsers(chatId: string): Promise<User[]> {
  try {
    const now = Date.now();
    const me = (await currentSession())?.user.id;
    return [...typingRoom(chatId).who.values()].filter((e) => now - e.at < TYPING_TTL_MS && e.user.id !== me).map((e) => e.user);
  } catch {
    return [];
  }
}

// Calls `onChange` (at most a few times a second) whenever a message or chat membership changes anywhere
// this person can see — replaces asking the server for everything every 5 seconds.
export function subscribeToChatChanges(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = () => {
    if (timer) return;
    timer = setTimeout(() => { timer = null; onChange(); }, 250);
  };
  const channel = supabase
    .channel(`chat-changes-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, fire)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_members' }, fire)
    // Refresh once the connection is (re)established: anything that arrived while it was still opening
    // (or while it was down) would otherwise wait for the slow fallback refresh.
    .subscribe((status) => { if (status === 'SUBSCRIBED') fire(); });
  return () => {
    if (timer) clearTimeout(timer);
    supabase.removeChannel(channel);
  };
}

export async function toggleChatPin(chatId: string): Promise<{ success: boolean; isPinned?: boolean; error?: string }> {
  try { return await rpc('toggle_chat_flag', { p_chat: chatId, p_flag: 'pin' }); } catch (err) { return { success: false, error: errorText(err, 'Could not pin the chat.') }; }
}

export async function toggleChatMute(chatId: string): Promise<{ success: boolean; isMuted?: boolean; error?: string }> {
  try { return await rpc('toggle_chat_flag', { p_chat: chatId, p_flag: 'mute' }); } catch (err) { return { success: false, error: errorText(err, 'Could not mute the chat.') }; }
}

export async function updateChatSettings(chatId: string, settings: Partial<ChatConversation>) {
  try {
    const res = await rpc<any>('update_chat_settings', {
      p_chat: chatId,
      p: { themeColor: settings.themeColor, vanishMode: settings.vanishMode, readReceiptsEnabled: settings.readReceiptsEnabled, nickname: (settings as any).nickname ?? settings.customNickname }
    });
    return { ...res, chat: mapChat(res.chat) };
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not update the chat.') };
  }
}

export async function endChat(chatId: string): Promise<{ success: boolean; chat: ChatConversation; message: string }> {
  try {
    const res = await rpc<any>('end_chat', { p_chat: chatId });
    return { ...res, chat: mapChat(res.chat) };
  } catch (err) {
    return { success: false, message: errorText(err, 'Could not end the chat.') } as any;
  }
}

export async function submitChatReview(
  chatId: string,
  rating: number,
  feedback?: string
): Promise<{ success: boolean; review: any; message: string }> {
  try {
    return await rpc('submit_chat_review', { p_chat: chatId, p_rating: rating, p_feedback: feedback || '' });
  } catch (err) {
    return { success: false, message: errorText(err, 'Could not submit the review.') } as any;
  }
}

export async function createGroupChat(
  name: string,
  avatar?: string,
  participantIds?: string[],
  description?: string
): Promise<{ success: boolean; chat: ChatConversation }> {
  try {
    const chat = await createChat({ participantIds: participantIds || [], isGroup: true, name, avatar, description });
    return { success: true, chat };
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not create the group.') } as any;
  }
}

export async function updateGroupDetails(
  chatId: string,
  data: { name?: string; avatar?: string; description?: string }
): Promise<{ success: boolean; chat: ChatConversation }> {
  try {
    const res = await rpc<any>('update_group_details', {
      p_chat: chatId, p_name: data.name ?? null, p_avatar: await storedAvatarFor(data.avatar), p_description: data.description ?? null
    });
    return { ...res, chat: mapChat(res.chat) };
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not update the group.') } as any;
  }
}

export async function manageGroupAdmin(
  chatId: string,
  targetUserId: string,
  action: 'make_admin' | 'remove_admin'
): Promise<{ success: boolean; chat: ChatConversation; adminIds: string[] }> {
  try {
    const res = await rpc<any>('manage_group_admin', { p_chat: chatId, p_target: targetUserId, p_action: action });
    return { ...res, chat: mapChat(res.chat) };
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not change admin roles.') } as any;
  }
}

// Group admins only: when on, nobody but the group's admins can send messages (members see a notice instead of the message box).
export async function setGroupSendPolicy(
  chatId: string,
  onlyAdmins: boolean
): Promise<{ success: boolean; chat?: ChatConversation; error?: string }> {
  try {
    const res = await rpc<any>('set_group_send_policy', { p_chat: chatId, p_only_admins: onlyAdmins });
    return { ...res, chat: res.chat ? mapChat(res.chat) : undefined };
  } catch (err) {
    return failWith(err, 'Could not change this setting.');
  }
}

export async function removeGroupMember(
  chatId: string,
  targetUserId: string
): Promise<{ success: boolean; chat: ChatConversation; participants: User[] }> {
  try {
    const res = await rpc<any>('remove_group_member', { p_chat: chatId, p_target: targetUserId });
    return { ...res, chat: res.chat ? mapChat(res.chat) : res.chat, participants: (res.participants || []).map((p: any) => ({ ...p, avatar: resolveMedia(p.avatar) })) };
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not remove that member.') } as any;
  }
}

export async function addGroupMembers(
  chatId: string,
  userIds: string[]
): Promise<{ success: boolean; chat: ChatConversation; participants: User[] }> {
  try {
    const res = await rpc<any>('add_group_members', { p_chat: chatId, p_user_ids: userIds });
    return { ...res, chat: mapChat(res.chat), participants: (res.participants || []).map((p: any) => ({ ...p, avatar: resolveMedia(p.avatar) })) };
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not add members.') } as any;
  }
}

export async function blockUser(userId: string): Promise<{ success: boolean; message: string; blockedUserIds: string[] }> {
  try { return await rpc('block_user', { p_user: userId }); } catch (err) { return { success: false, message: errorText(err, 'Could not block this user.'), blockedUserIds: [] }; }
}

export async function unblockUser(userId: string): Promise<{ success: boolean; message: string; blockedUserIds: string[] }> {
  try { return await rpc('unblock_user', { p_user: userId }); } catch (err) { return { success: false, message: errorText(err, 'Could not unblock this user.'), blockedUserIds: [] }; }
}

// ----------------------------------------------------------------------------- phase 3: points, games, shop, coupons, Pro, admin

export interface LiveAvatarPreset {
  id: string;
  name: string;
  url: string;
}

export type ScreenshotContentType = 'profile' | 'post' | 'story' | 'reel' | 'chat';

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
  // Present only for games with true live-synced play (currently Tic Tac Toe) — the two players
  // move on this same shared board instead of each playing their own round against a bot.
  board?: ('X' | 'O' | null)[] | null;
  turn?: string | null;
}

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

const failWith = (err: unknown, fallback: string) => ({ success: false as const, error: errorText(err, fallback) });

function mapRoom(room: any): GameRoom | undefined {
  if (!room) return undefined;
  return { ...room, players: (room.players || []).map((p: any) => ({ ...p, avatar: resolveMedia(p.avatar) })) };
}

// A room call answers { success, room } — only the picture links inside the room need translating.
async function roomCall(fn: string, args: Record<string, unknown>, fallback: string) {
  try {
    const res = await rpc<any>(fn, args);
    return { ...res, room: mapRoom(res.room) };
  } catch (err) {
    return failWith(err, fallback);
  }
}

// ---- live profile pictures, contacts, alerts

export async function fetchLiveAvatarPresets(): Promise<{ presets: LiveAvatarPreset[] }> {
  try { return await rpc('live_avatar_presets_list'); } catch { return { presets: [] }; }
}

// NOOB Pro only — the database refuses this for a free account.
export async function applyLiveAvatar(payload: { presetId?: string; customUrl?: string }): Promise<{
  success: boolean;
  user?: User;
  error?: string;
}> {
  try {
    const res = await rpc<{ user: User }>('apply_live_avatar', {
      p_preset: payload.presetId || null,
      p_custom_url: payload.customUrl ? toStoredMedia(payload.customUrl) : null
    });
    return { success: true, user: mapUser(res.user) };
  } catch (err) {
    return failWith(err, 'Could not apply that picture.');
  }
}

// Matches a device's contact phone numbers against registered users (native app "Find Friends") —
// the numbers themselves are never sent back, only public profile fields for any matches found.
export async function matchContacts(phoneNumbers: string[]): Promise<User[]> {
  try {
    const list = await rpc<any[]>('match_contacts', { p_numbers: phoneNumbers });
    return (list || []).map((u) => mapUser(u) as User);
  } catch {
    return [];
  }
}

// Best-effort only. Deliberately swallows its own errors: a missed screenshot alert should never
// surface as a visible app error.
export async function sendScreenshotAlert(contentType: ScreenshotContentType, contentId: string): Promise<void> {
  try {
    await rpc('screenshot_alert', { p_type: contentType, p_id: contentId });
  } catch {
    // Best-effort — see above.
  }
}

// Tells the rest of a group that a call just went live. Best-effort: a call that failed to notify
// people is still a perfectly working call.
export async function notifyCallStarted(chatId: string): Promise<void> {
  try {
    await rpc('notify_call_started', { p_chat: chatId });
  } catch {
    // Best-effort — see above.
  }
}

// Translation (and the AI support assistant) run in one small Edge Function that holds the AI key.
// (It was deployed from the dashboard under the name 'dynamic-handler'; the code is supabase/functions/ai.)
const AI_FUNCTION = 'dynamic-handler';

export interface GifItem { id: string; title: string; url: string; preview?: string }

// Searches the online GIF library through our server (which holds the library's key). When the library is not switched on for the app
// (or anything goes wrong) the answer is simply "not configured" and the chat shows its built-in GIFs.
export async function searchGifs(query: string): Promise<{ configured: boolean; gifs: GifItem[] }> {
  try {
    const { data, error } = await supabase.functions.invoke(AI_FUNCTION, { body: { action: 'gifs', q: query, lang: getLanguage() } });
    if (error || !data?.configured) return { configured: false, gifs: [] };
    const gifs = (Array.isArray(data.gifs) ? data.gifs : []).filter((g: any) => g && typeof g.url === 'string' && /^https:\/\//.test(g.url)).map((g: any) => ({ id: String(g.id), title: String(g.title || 'GIF'), url: g.url, preview: typeof g.preview === 'string' ? g.preview : undefined }));
    return { configured: true, gifs };
  } catch {
    return { configured: false, gifs: [] };
  }
}

export async function translateMessage(chatId: string, messageId: string): Promise<string> {
  try {
    // a locked message is opened on this device and only that one text is sent to the translator (the server can not read it itself)
    const opened = e2ee.payloadOf(messageId);
    const body = opened ? { action: 'translate-text', text: opened.t, lang: getLanguage() } : { action: 'translate', chatId, messageId, lang: getLanguage() };
    const { data, error } = await supabase.functions.invoke(AI_FUNCTION, { body });
    if (error) return '';
    return (data as any)?.translatedText || '';
  } catch {
    return '';
  }
}

// Chats are end-to-end encrypted — the server never holds readable text, and nobody but the two
// people in a chat can ever open it. The ONE deliberate exception: when a person FILES A REPORT
// against someone they have a direct chat with, their own device (the only place that ever decrypted
// that one conversation to show it on screen) may attach a copy of it, exactly like forwarding those
// messages to NOOB Admin by hand. This never gives admin a standing way to read a chat that was never
// reported — that stays unreadable by anyone but its own members, forever.
async function gatherReportEvidence(targetUserId: string): Promise<Array<{ senderUsername: string; text: string; mediaType?: string; createdAt: string }> | undefined> {
  try {
    const chatId = await rpc<string | null>('find_direct_chat', { p_user: targetUserId });
    if (!chatId) return undefined;
    const messages = await fetchMessages(chatId);
    const evidence = messages
      .filter((m) => !m.locked && (m.text || m.mediaUrl))
      .slice(-30)
      .map((m) => ({
        senderUsername: m.senderUsername || 'unknown',
        text: (m.text || '').slice(0, 500),
        ...(m.mediaUrl ? { mediaType: m.mediaType || 'image' } : {}),
        createdAt: m.createdAt
      }));
    return evidence.length > 0 ? evidence : undefined;
  } catch {
    return undefined; // evidence is a bonus, never a reason to fail the report itself
  }
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

  try {
    const evidence = await gatherReportEvidence(targetUserId);
    return await rpc('submit_report', { p_target: targetUserId, p_reason: reportReason, p_details: reportDetails, p_evidence: evidence });
  } catch (err) {
    const message = errorText(err, 'Could not file the report.');
    return { success: false, message, error: message };
  }
}

// ---- support ratings

export async function submitSupportReview(
  rating: number,
  feedback?: string
): Promise<{ success: boolean; average: number; count: number }> {
  try {
    return await rpc('submit_support_review', { p_rating: rating, p_feedback: feedback || '' });
  } catch {
    return { success: false, average: 0, count: 0 };
  }
}

export async function fetchSupportRatingSummary(): Promise<{ average: number | null; count: number }> {
  try { return await rpc('support_rating_summary'); } catch { return { average: null, count: 0 }; }
}

// ---- games & NOOB Points

export async function fetchGameLeaderboard(): Promise<{
  leaderboard: GameLeaderboardEntry[];
  currentUserPoints: number;
  currentUserRank: number;
}> {
  try {
    const res = await rpc<any>('game_leaderboard');
    return { ...res, leaderboard: (res.leaderboard || []).map((e: any) => ({ ...e, avatar: resolveMedia(e.avatar) })) };
  } catch {
    return { leaderboard: [], currentUserPoints: 0, currentUserRank: 1 };
  }
}

export async function fetchLeaderboard(_gameId?: string): Promise<GameLeaderboardEntry[]> {
  return (await fetchGameLeaderboard()).leaderboard || [];
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
  error?: string;
}> {
  try {
    const res = await rpc<any>('record_match', {
      p_game_id: gameId, p_title: gameTitle, p_result: result, p_opponent: opponentName || null, p_vs_bot: !!vsBot
    });
    return { ...res, user: mapUser(res.user) };
  } catch (err) {
    return { success: false, earnedPoints: 0, totalNoobPoints: 0, result, error: errorText(err, 'Could not record the match.') };
  }
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
  try {
    const res = await rpc<any>('submit_survival_score', { p_game_id: gameId, p_title: gameTitle, p_seconds: survivalSeconds });
    return { ...res, user: mapUser(res.user) };
  } catch (err) {
    return { success: false, earnedPoints: 0, survivalSeconds: 0, totalNoobPoints: 0, error: errorText(err, 'Could not save your score.') };
  }
}

export async function sendGameInvite(
  targetUserId: string,
  gameId: string,
  gameTitle: string,
  roomCode?: string
): Promise<{ success: boolean; message: string; chatId: string; invite: any }> {
  try {
    const res = await rpc<any>('send_game_invite', { p_target: targetUserId, p_game_id: gameId, p_title: gameTitle, p_room_code: roomCode || null });
    return { ...res, invite: res.invite ? mapMessage(res.invite) : res.invite };
  } catch (err) {
    return { success: false, message: errorText(err, 'Could not send the invite.'), chatId: '', invite: null };
  }
}

// Real 2-player matches (friend invite rooms + random matchmaking)

export async function joinGameRoom(
  code: string,
  gameId: string,
  gameTitle: string
): Promise<{ success: boolean; room?: GameRoom; error?: string }> {
  return roomCall('join_game_room', { p_code: code, p_game_id: gameId, p_title: gameTitle }, 'Could not join the match.');
}

export async function getGameRoom(code: string): Promise<{ success: boolean; room?: GameRoom; error?: string }> {
  return roomCall('get_game_room', { p_code: code }, 'Match not found or has expired.');
}

export async function submitGameRoomResult(
  code: string,
  result: 'win' | 'tie' | 'loss'
): Promise<{ success: boolean; room?: GameRoom; yourTotalPoints?: number; error?: string }> {
  return roomCall('submit_game_room_result', { p_code: code, p_result: result }, 'Could not save the result.');
}

// One live move into a synced-board match (currently Tic Tac Toe) — the database is authoritative on
// turn order and win detection, and returns the updated shared board for both players.
export async function submitGameRoomMove(
  code: string,
  index: number
): Promise<{ success: boolean; room?: GameRoom; error?: string }> {
  return roomCall('submit_game_room_move', { p_code: code, p_index: index }, 'Could not make that move.');
}

export async function joinMatchmaking(
  gameId: string,
  gameTitle: string
): Promise<{ success: boolean; matched: boolean; room?: GameRoom; error?: string }> {
  const res: any = await roomCall('join_matchmaking', { p_game_id: gameId, p_title: gameTitle }, 'Could not start matchmaking.');
  return res.success === false ? { success: false, matched: false, error: res.error } : res;
}

export async function getMatchmakingStatus(): Promise<{ success: boolean; matched: boolean; room?: GameRoom }> {
  const res: any = await roomCall('matchmaking_status', {}, 'Could not check matchmaking.');
  return res.success === false ? { success: false, matched: false } : res;
}

// Chess Blitz is capped at one round a week for free accounts (four on Pro) — call this once, right before
// letting the player enter any mode. The database answers with { success: false, error, nextAvailableAt } when capped.
export async function startChessRound(): Promise<{ success: boolean; isPro?: boolean; error?: string; nextAvailableAt?: string }> {
  try { return await rpc('start_chess_round'); } catch (err) { return failWith(err, 'Could not start Chess Blitz.'); }
}

export async function cancelMatchmaking(): Promise<{ success: boolean }> {
  try { return await rpc('cancel_matchmaking'); } catch { return { success: false }; }
}

// ---- coupons

export async function fetchMyCoupons(manage = false): Promise<Coupon[]> {
  try { return (await rpc<Coupon[]>('my_coupons', { p_manage: manage })) || []; } catch { return []; }
}

export async function createCoupon(payload: {
  title: string;
  discountPercent: number;
  terms: string;
  targetUsername?: string;
  type?: 'discount' | 'verification';
  usageLimit?: 'once' | 'unlimited';
}): Promise<{ success: boolean; coupon?: Coupon; error?: string }> {
  try { return await rpc('create_coupon', { p: payload }); } catch (err) { return failWith(err, 'Could not create the coupon.'); }
}

export async function deleteCoupon(id: string): Promise<{ success: boolean; error?: string }> {
  try { return await rpc('delete_coupon', { p_id: id }); } catch (err) { return failWith(err, 'Could not remove the coupon.'); }
}

export async function redeemCouponCode(code: string): Promise<{ success: boolean; coupon?: Coupon; error?: string }> {
  try { return await rpc('redeem_coupon_code', { p_code: code }); } catch (err) { return failWith(err, 'That coupon code is invalid.'); }
}

// ---- Pro, verification, wallet, shop

export async function verifyAccount(payload: {
  password: string;
  method: 'coupon' | 'points_permanent' | 'points_monthly';
  couponCode?: string;
  discountCouponCode?: string;
}): Promise<{ success: boolean; message?: string; user?: User; error?: string }> {
  try {
    const res = await rpc<any>('verify_account', {
      p_password: payload.password, p_method: payload.method,
      p_coupon_code: payload.couponCode || null, p_discount_code: payload.discountCouponCode || null
    });
    return { ...res, user: mapUser(res.user) };
  } catch (err) {
    return failWith(err, 'Verification failed. Please check your credentials.');
  }
}

export async function upgradeProTier(payload: {
  tierId: string;
  billing: 'monthly' | 'yearly';
  couponCode?: string;
  autoRenew?: boolean;
}): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    const res = await rpc<any>('upgrade_pro', {
      p_tier: payload.tierId, p_billing: payload.billing, p_coupon: payload.couponCode || null, p_auto_renew: payload.autoRenew !== false
    });
    return { success: true, user: mapUser(res.user) };
  } catch (err) {
    return failWith(err, 'Could not upgrade.');
  }
}

export async function toggleProAutoRenew(enabled: boolean): Promise<{ success: boolean; proAutoRenew?: boolean; error?: string }> {
  try { return await rpc('toggle_pro_auto_renew', { p_enabled: enabled }); } catch (err) { return failWith(err, 'Could not change auto-renew.'); }
}

export async function transferNoobPoints(payload: {
  recipientId: string;
  amount: number;
  note?: string;
}): Promise<{ success: boolean; user?: User; message?: string; error?: string }> {
  try {
    const res = await rpc<any>('wallet_transfer', { p_recipient: payload.recipientId, p_amount: payload.amount, p_note: payload.note || null });
    return { ...res, user: mapUser(res.user) };
  } catch (err) {
    return failWith(err, 'Could not send the points.');
  }
}

export async function fetchShopCatalog(): Promise<{ catalog: ShopItem[]; ownedItemIds: string[] }> {
  try {
    const res = await rpc<any>('shop_catalog');
    return { catalog: res.catalog || [], ownedItemIds: res.ownedItemIds || [] };
  } catch {
    return { catalog: [], ownedItemIds: [] };
  }
}

export async function purchaseShopItem(itemId: string): Promise<{ success: boolean; item?: ShopItem; user?: User; error?: string }> {
  try {
    const res = await rpc<any>('purchase_shop_item', { p_item: itemId });
    return { ...res, user: mapUser(res.user) };
  } catch (err) {
    return failWith(err, 'Could not buy that item.');
  }
}

export async function revealScratchCard(
  scratchCardId: string
): Promise<{ success: boolean; gift?: { type: string; value: number | string; label: string }; user?: User; alreadyRevealed?: boolean; error?: string }> {
  try {
    const res = await rpc<any>('reveal_scratch_card', { p_card: scratchCardId });
    return { ...res, user: res.user ? mapUser(res.user) : undefined };
  } catch (err) {
    return failWith(err, 'Could not open the scratch card.');
  }
}

// ---- NOOB Shop (physical-goods store) — distinct from the points-redemption catalogue above

const mapProduct = (p: any): StoreProduct => ({
  ...p,
  name: p.name || '',
  title: p.title || p.name || String(p.description || '').split(String.fromCharCode(10))[0].slice(0, 60) || 'Product',
  stock: p.stock ?? null,
  options: p.options || [],
  variants: p.variants || [],
  media: (p.media || []).map((m: StoreProductMedia) => ({ ...m, url: resolveMedia(m.url) }))
});

export async function fetchStoreProducts(): Promise<StoreProduct[]> {
  try { return ((await rpc<any[]>('list_store_products')) || []).map(mapProduct); } catch { return []; }
}

const productForDatabase = (payload: StoreProductInput) => ({
  ...payload,
  media: payload.media.map((m: StoreProductMedia) => ({ ...m, url: toStoredMedia(m.url) }))
});

export async function createStoreProduct(payload: StoreProductInput): Promise<{ success: boolean; product?: StoreProduct; error?: string }> {
  try {
    const res = await rpc<any>('create_store_product', { p: productForDatabase(payload) });
    return { ...res, product: res.product ? mapProduct(res.product) : undefined };
  } catch (err) {
    return failWith(err, 'Could not add the product.');
  }
}

// Edit an existing product: price, description, pictures, how many are in stock, and its versions (colour / size / model ...).
export async function updateStoreProduct(productId: string, payload: StoreProductInput): Promise<{ success: boolean; product?: StoreProduct; error?: string }> {
  try {
    const res = await rpc<any>('update_store_product', { p_id: productId, p: productForDatabase(payload) });
    return { ...res, product: res.product ? mapProduct(res.product) : undefined };
  } catch (err) {
    return failWith(err, 'Could not save the product.');
  }
}

export async function deleteStoreProduct(productId: string): Promise<{ success: boolean; error?: string }> {
  try { return await rpc('delete_store_product', { p_id: productId }); } catch (err) { return failWith(err, 'Could not remove the product.'); }
}

// ---- shop account details (contact details + address saved for checkout) and orders

export async function getShopDetails(): Promise<{ success: boolean; details: Partial<ShopDetails>; error?: string }> {
  try {
    const res = await rpc<any>('get_shop_details');
    return { success: true, details: res.details || {} };
  } catch (err) {
    return { success: false, details: {}, error: errorText(err, 'Could not load your details.') };
  }
}

export async function saveShopDetails(details: Partial<ShopDetails>): Promise<{ success: boolean; details?: Partial<ShopDetails>; error?: string }> {
  try { return await rpc('save_shop_details', { p: details }); } catch (err) { return failWith(err, 'Could not save your details.'); }
}

// ---- the address book (several saved delivery addresses, one of them the default)

type AddressResult = { success: boolean; addresses: ShopAddress[]; address?: ShopAddress; error?: string };
const addressResult = (res: any): AddressResult => ({ success: true, addresses: res?.addresses || [], address: res?.address });

export async function fetchShopAddresses(): Promise<AddressResult> {
  try { return addressResult(await rpc('my_shop_addresses')); } catch (err) { return { success: false, addresses: [], error: errorText(err, 'Could not load your addresses.') }; }
}

// Adds an address, or changes one when `address.id` is set. The first address saved becomes the default.
export async function saveShopAddress(address: Partial<ShopAddress> & { makeDefault?: boolean }): Promise<AddressResult> {
  try { return addressResult(await rpc('save_shop_address', { p: address })); } catch (err) { return { success: false, addresses: [], error: errorText(err, 'Could not save the address.') }; }
}

export async function setDefaultShopAddress(id: string): Promise<AddressResult> {
  try { return addressResult(await rpc('set_default_shop_address', { p_id: id })); } catch (err) { return { success: false, addresses: [], error: errorText(err, 'Could not change the default address.') }; }
}

export async function deleteShopAddress(id: string): Promise<AddressResult> {
  try { return addressResult(await rpc('delete_shop_address', { p_id: id })); } catch (err) { return { success: false, addresses: [], error: errorText(err, 'Could not remove the address.') }; }
}

const mapOrder = (o: any): StoreOrder => ({
  ...o,
  items: (o.items || []).map((i: any) => ({ ...i, image: i.image ? resolveMedia(i.image) : null })),
  customer: o.customer ? { ...o.customer, avatar: resolveMedia(o.customer.avatar) } : o.customer
});

// Payment is on pickup / on delivery (there is no online payment). Prices and stock are always taken from the database.
export async function placeStoreOrder(payload: {
  items: { productId: string; variantKey?: string | null; quantity: number }[];
  deliveryMethod: 'pickup' | 'delivery';
  contact: Partial<ShopDetails>;
  note?: string;
  saveDetails?: boolean;
}): Promise<{ success: boolean; order?: StoreOrder; error?: string }> {
  try {
    const res = await rpc<any>('place_store_order', { p: payload });
    return { ...res, order: res.order ? mapOrder(res.order) : undefined };
  } catch (err) {
    return failWith(err, 'Could not place your order.');
  }
}

export async function fetchMyStoreOrders(): Promise<{ success: boolean; orders: StoreOrder[]; error?: string }> {
  try {
    const res = await rpc<any>('my_store_orders');
    return { success: true, orders: (res.orders || []).map(mapOrder) };
  } catch (err) {
    return { success: false, orders: [], error: errorText(err, 'Could not load your orders.') };
  }
}

export async function cancelMyStoreOrder(orderId: string): Promise<{ success: boolean; order?: StoreOrder; error?: string }> {
  try {
    const res = await rpc<any>('cancel_my_store_order', { p_id: orderId });
    return { ...res, order: res.order ? mapOrder(res.order) : undefined };
  } catch (err) {
    return failWith(err, 'Could not cancel the order.');
  }
}

// The shop's side: everyone's orders, and moving an order along (needs the "manage the shop" permission).
export async function fetchAdminStoreOrders(status?: string): Promise<{ success: boolean; orders: StoreOrder[]; openCount: number; error?: string }> {
  try {
    const res = await rpc<any>('admin_store_orders', { p_status: status || null });
    return { success: true, orders: (res.orders || []).map(mapOrder), openCount: res.openCount || 0 };
  } catch (err) {
    return { success: false, orders: [], openCount: 0, error: errorText(err, 'Could not load the orders.') };
  }
}

export async function setStoreOrderStatus(orderId: string, status: string, reason?: string): Promise<{ success: boolean; order?: StoreOrder; error?: string }> {
  try {
    const res = await rpc<any>('admin_set_store_order_status', { p_id: orderId, p_status: status, p_reason: reason || null });
    return { ...res, order: res.order ? mapOrder(res.order) : undefined };
  } catch (err) {
    return failWith(err, 'Could not update the order.');
  }
}

// ---- hide my profile from chosen people (they can not see it, and are not told)

export interface HiddenFromUser { id: string; username: string; displayName?: string; avatar?: string; isVerified?: boolean; hiddenAt?: string }

export async function hideProfileFrom(userId: string): Promise<{ success: boolean; hiddenFromIds?: string[]; error?: string }> {
  try { return await rpc('hide_profile_from', { p_user: userId }); } catch (err) { return failWith(err, 'Could not hide your profile.'); }
}

export async function unhideProfileFrom(userId: string): Promise<{ success: boolean; hiddenFromIds?: string[]; error?: string }> {
  try { return await rpc('unhide_profile_from', { p_user: userId }); } catch (err) { return failWith(err, 'Could not show your profile again.'); }
}

export async function fetchHiddenFrom(): Promise<{ success: boolean; users: HiddenFromUser[]; error?: string }> {
  try {
    const res = await rpc<any>('my_hidden_from');
    return { success: true, users: (res.users || []).map((u: any) => ({ ...u, avatar: resolveMedia(u.avatar) })) };
  } catch (err) {
    return { success: false, users: [], error: errorText(err, 'Could not load the list.') };
  }
}

// ---- insights (a creator's own numbers)

export async function fetchInsights(): Promise<ProfessionalInsights> {
  return (await rpc<{ insights: ProfessionalInsights }>('my_insights')).insights;
}

// ---- AI customer support (runs in the "ai" Edge Function, which holds the AI key)

export async function askAiSupportAssistant(
  message: string,
  conversationHistory?: Array<{ sender: 'user' | 'bot'; text: string }>
): Promise<{ success: boolean; reply: string; model?: string; user?: any; error?: string; action?: string }> {
  try {
    // lang: the language the person chose for the app, so the assistant answers in it
    const { data, error } = await supabase.functions.invoke(AI_FUNCTION, { body: { action: 'support', message, conversationHistory, lang: getLanguage() } });
    if (error) throw error;
    return data as any;
  } catch (err) {
    return {
      success: false,
      reply: 'Our assistant is taking a short break right now. Please try again in a little while.',
      error: errorText(err, 'The assistant is unavailable.')
    };
  }
}

// ---- admin tools (the database refuses everyone except the NOOB administrator)

export async function sendAdminNotification(payload: {
  target?: string;
  title: string;
  message: string;
}): Promise<{ success: boolean; message: string; notification?: any; error?: string }> {
  try {
    return await rpc('admin_send_notification', { p_target: payload.target || 'all', p_title: payload.title, p_message: payload.message });
  } catch (err) {
    const message = errorText(err, 'Could not send the notification.');
    return { success: false, message, error: message };
  }
}

export async function suspendUserAccount(payload: {
  targetUserId: string;
  reason?: string;
  suspend?: boolean;
}): Promise<{ success: boolean; message: string; user?: User; error?: string }> {
  try {
    const res = await rpc<any>('admin_suspend_user', { p_target: payload.targetUserId, p_reason: payload.reason || null, p_suspend: payload.suspend !== false });
    return { ...res, user: mapUser(res.user) };
  } catch (err) {
    const message = errorText(err, 'Could not change the account status.');
    return { success: false, message, error: message };
  }
}

export async function adjustUserPoints(
  targetUserId: string,
  payload: { setTo?: number; delta?: number; reason?: string }
): Promise<{ success: boolean; message?: string; user?: User; error?: string }> {
  try {
    const res = await rpc<any>('admin_adjust_points', {
      p_target: targetUserId, p_set_to: payload.setTo ?? null, p_delta: payload.delta ?? null, p_reason: payload.reason || null
    });
    return { ...res, user: mapUser(res.user) };
  } catch (err) {
    return failWith(err, 'Could not adjust the balance.');
  }
}

export async function deleteUserAccount(targetUserId: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try { return await rpc('admin_delete_user', { p_target: targetUserId }); } catch (err) { return failWith(err, 'Could not delete the account.'); }
}

export async function fetchAdminUsersList(): Promise<{ success: boolean; users: User[]; error?: string }> {
  try {
    const res = await rpc<any>('admin_users_list');
    return { success: true, users: (res.users || []).map((u: any) => mapUser(u) as User) };
  } catch (err) {
    return { success: false, users: [], error: errorText(err, 'Could not load the accounts.') };
  }
}

// ---- giving other people admin powers (main administrator only) and the activity log

export interface AdminStaffMember {
  userId: string;
  username: string;
  displayName: string;
  avatar?: string;
  isVerified?: boolean;
  permissions: string[];
  grantedAt?: string;
  updatedAt?: string;
  grantedBy?: string | null;
}

export interface AdminAuditEntry {
  id: number;
  at: string;
  actor: string | null;
  action: string;
  target: string | null;
  details: Record<string, any>;
}

const mapStaff = (s: any): AdminStaffMember => ({ ...s, avatar: resolveMedia(s.avatar), permissions: s.permissions || [] });

export async function fetchAdminStaff(): Promise<{ success: boolean; staff: AdminStaffMember[]; error?: string }> {
  try {
    const res = await rpc<any>('admin_staff_list');
    return { success: true, staff: (res.staff || []).map(mapStaff) };
  } catch (err) {
    return { success: false, staff: [], error: errorText(err, 'Could not load the admin team.') };
  }
}

// Replaces everything this person is allowed to do (an empty list removes their admin access completely).
export async function setAdminPermissions(
  userId: string,
  permissions: string[]
): Promise<{ success: boolean; message?: string; staff?: AdminStaffMember | null; error?: string }> {
  try {
    const res = await rpc<any>('admin_set_permissions', { p_user: userId, p_permissions: permissions });
    return { ...res, staff: res.staff ? mapStaff(res.staff) : null };
  } catch (err) {
    return failWith(err, 'Could not change admin access.');
  }
}

export async function fetchAdminAudit(limit = 100): Promise<{ success: boolean; entries: AdminAuditEntry[]; error?: string }> {
  try {
    const res = await rpc<any>('admin_audit_log', { p_limit: limit });
    return { success: true, entries: res.entries || [] };
  } catch (err) {
    return { success: false, entries: [], error: errorText(err, 'Could not load the activity log.') };
  }
}

export async function fetchAdminReports(): Promise<{ success: boolean; reports: any[]; error?: string }> {
  try {
    const res = await rpc<any>('admin_reports');
    return { success: true, reports: (res.reports || []).map((r: any) => ({ ...r, targetAvatar: resolveMedia(r.targetAvatar) })) };
  } catch (err) {
    return { success: false, reports: [], error: errorText(err, 'Could not load the reports.') };
  }
}

export async function takeAdminReportAction(
  reportId: string,
  action: 'resolved' | 'dismissed' | 'banned',
  suspendTarget: boolean = false
): Promise<{ success: boolean; message?: string; report?: any; error?: string }> {
  try { return await rpc('admin_report_action', { p_id: reportId, p_action: action, p_suspend: suspendTarget }); } catch (err) { return failWith(err, 'Could not update the report.'); }
}

// Admin removal of any chat message (a person deleting their own uses deleteMessage).
export async function deleteChatMessage(
  _chatId: string,
  messageId: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try { return await rpc('admin_delete_message', { p_message: messageId }); } catch (err) { return failWith(err, 'Could not delete the message.'); }
}

// ---- push notifications (delivery happens in an Edge Function; this only registers the device/browser)

export async function registerPushToken(token: string): Promise<{ success: boolean }> {
  try { return await rpc('register_push_token', { p_token: token }); } catch { return { success: false }; }
}

export async function fetchVapidPublicKey(): Promise<string | null> {
  try { return (await rpc<string | null>('get_vapid_public_key')) || null; } catch { return null; }
}

export async function subscribeToPush(subscription: PushSubscription): Promise<boolean> {
  try {
    const res = await rpc<{ success: boolean }>('save_push_subscription', { p_subscription: JSON.parse(JSON.stringify(subscription)) });
    return !!res?.success;
  } catch {
    return false;
  }
}

// Notifications go to ONE device per account. This is the address of the saved subscription (null = none), so a screen can tell
// whether THIS device is the one that gets them. (Read straight from the person's own row; nobody else's is visible.)
export async function fetchMyPushEndpoint(): Promise<string | null> {
  try {
    if (!(await currentSession())) return null;
    const { data, error } = await supabase.from('push_subscriptions').select('subscription').maybeSingle();
    if (error) return null;
    const endpoint = (data as any)?.subscription?.endpoint;
    return typeof endpoint === 'string' ? endpoint : null;
  } catch {
    return null;
  }
}

export async function unsubscribeFromPush(): Promise<boolean> {
  try { return !!(await rpc<{ success: boolean }>('remove_push_subscription'))?.success; } catch { return false; }
}
