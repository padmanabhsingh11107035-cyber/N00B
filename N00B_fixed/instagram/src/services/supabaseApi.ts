// The Supabase-backed versions of the app's server calls (phase 1: accounts, profiles, follows,
// posts, likes, comments, notifications, settings, media upload).
//
// Every function keeps the exact name, arguments and return shape of the old Express version in
// api.ts, so no screen has to change. The old server's rules now live in the database (see
// supabase/migrations); this file only translates between the screens and those database functions.
import type { Post, User, StatusNote, AppSettings, AppNotification } from '../types';
import { INITIAL_SETTINGS } from '../data/mockData';
import { compressMedia } from '../utils/mediaCompressor';
import { supabase, resolveMedia, toStoredMedia, MEDIA_BUCKET } from './supabase';

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
          agreed_to_terms: payload.agreedToTerms
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
    return { success: true, user: mapUser(user) as User };
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
      if (!identifier.includes('@') && !(await rpc<boolean>('username_taken', { candidate: identifier }))) {
        return { success: false, error: 'Account not found. Please click "Create Account" below.' };
      }
      return { success: false, error: 'Incorrect password. Please check your credentials.' };
    }
    const user = await rpc<any>('get_my_user');
    if (user?.isSuspended) {
      await supabase.auth.signOut();
      return {
        success: false,
        error: `This account has been suspended by NOOB Administrator.${user.suspendedReason ? ' Reason: ' + user.suspendedReason : ''}`
      };
    }
    return { success: true, user: mapUser(user) as User };
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

// Recovery needs a small server-side function (it must sign someone in without their password after
// checking three personal details). Until that function is deployed the screen shows this message.
export async function recoverAccountAccess(_payload: {
  username: string;
  mobileNumber: string;
  dateOfBirth: string;
  email: string;
}): Promise<{ success: boolean; user?: User; error?: string }> {
  return { success: false, error: 'Account recovery is being set up. Please contact NOOB support to regain access.' };
}

export async function logoutUser(): Promise<{ success: boolean }> {
  await supabase.auth.signOut();
  return { success: true };
}

export async function deleteMyAccount(password: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await rpc<{ success: boolean; message?: string }>('delete_my_account', { p_password: password });
    await supabase.auth.signOut();
    return res;
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not delete the account.') };
  }
}

export async function fetchCurrentUser(): Promise<User | null> {
  try {
    if (!(await currentSession())) return null;
    const user = await rpc<User | null>('get_my_user');
    return user ? (mapUser(user) as User) : null;
  } catch {
    return null;
  }
}

// Only "you are definitely logged out / suspended" counts as invalid; a network blip is "unknown".
export async function checkSessionStatus(): Promise<'valid' | 'invalid' | 'unknown'> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return 'unknown';
    if (!data.session) return 'invalid';
    const { data: row, error: qErr } = await supabase.from('profiles').select('is_suspended').eq('id', data.session.user.id).maybeSingle();
    if (qErr) return 'unknown';
    if (!row || row.is_suspended) return 'invalid';
    return 'valid';
  } catch {
    return 'unknown';
  }
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

export async function fetchAppNotifications(): Promise<{ notifications: AppNotification[] }> {
  try {
    if (!(await currentSession())) return { notifications: [] };
    const res = await rpc<{ notifications: any[] }>('my_notifications');
    return { notifications: (res.notifications || []).map(mapNotification) };
  } catch {
    return { notifications: [] };
  }
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
    const shared: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (storeEnabled !== undefined) shared.store_enabled = storeEnabled;
    if (storeDeliveryFee !== undefined) shared.store_delivery_fee = storeDeliveryFee;
    const { error } = await supabase.from('app_settings').update(shared).eq('id', 1);
    if (error) console.error('Could not save the shop settings (admin only):', error.message);
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
