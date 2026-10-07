// The Supabase-backed versions of the app's server calls (phase 1: accounts, profiles, follows,
// posts, likes, comments, notifications, settings, media upload).
//
// Every function keeps the exact name, arguments and return shape of the old Express version in
// api.ts, so no screen has to change. The old server's rules now live in the database (see
// supabase/migrations); this file only translates between the screens and those database functions.
import type { Post, User, StatusNote, AppSettings, AppNotification, Story, Reel, LongVideo, LongVideoPlaylist, DailyChallenge, DailyChallengeEntry, DailyChampion, StoryHighlight, SavedCollection, MusicTrack, Message, ChatConversation, GameLeaderboardEntry, ShopItem, StoreProduct, StoreProductMedia, StoreProductInput, StoreOrder, ShopDetails, ShopAddress, ProfessionalInsights, NoobRoom, NoobRoomParticipant, NoobRoomChatMessage, SongGuessRound, SongGuessLeaderboardEntry } from '../types';
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

// Short in-memory cache for comment/likers/viewers lists: the dominant cost of reopening one of
// these (comments sheet, likes/views sheet) is the network round trip, not query time (confirmed
// directly against production: both execute server-side in single-digit milliseconds) — so the
// highest-leverage fix for "this takes a while to appear" is not repeating that round trip every
// time the same list is reopened a few seconds later. Every write that could change a cached list
// invalidates its entry immediately, so a reopen right after liking/commenting always sees the
// real, fresh state rather than a stale cached one.
const shortCache = new Map<string, { at: number; data: any }>();
const CACHE_MS = 20000;
function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = shortCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return Promise.resolve(hit.data);
  return fn().then((data) => {
    shortCache.set(key, { at: Date.now(), data });
    return data;
  });
}
function invalidateCache(key: string) {
  shortCache.delete(key);
}

function mapUser<U extends Partial<User> | null | undefined>(u: U): U {
  if (!u) return u;
  const out: any = { ...u, avatar: resolveMedia((u as any).avatar), liveAvatarVideoUrl: (u as any).liveAvatarVideoUrl ? resolveMedia((u as any).liveAvatarVideoUrl) : (u as any).liveAvatarVideoUrl };
  if (Array.isArray(out.followRequests)) {
    out.followRequests = out.followRequests.map((r: any) => ({ ...r, avatar: resolveMedia(r.avatar) }));
  }
  return out;
}

function mapPost(p: any): Post {
  return {
    ...p,
    userAvatar: resolveMedia(p.userAvatar),
    authorLiveAvatarVideoUrl: p.authorLiveAvatarVideoUrl ? resolveMedia(p.authorLiveAvatarVideoUrl) : p.authorLiveAvatarVideoUrl,
    slides: (p.slides || []).map((s: any) => ({ ...s, mediaUrl: resolveMedia(s.mediaUrl) }))
  };
}

const mapPosts = (list: any[] | null | undefined): Post[] => (Array.isArray(list) ? list.map(mapPost) : []);

function mapComment(c: any) {
  return c
    ? {
        ...c,
        userAvatar: resolveMedia(c.userAvatar),
        authorLiveAvatarVideoUrl: c.authorLiveAvatarVideoUrl ? resolveMedia(c.authorLiveAvatarVideoUrl) : c.authorLiveAvatarVideoUrl,
        // gif/sticker URLs are already absolute (Giphy/Noto CDN); resolveMedia passes those through unchanged.
        mediaUrl: c.mediaUrl ? resolveMedia(c.mediaUrl) : c.mediaUrl
      }
    : c;
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

// Before an account is created: a 6-digit code emailed to the address just typed in, proving it's
// really theirs and really reachable. Verifying does not sign anyone in by itself — check_signup /
// handle_new_user on the database side refuse to create the account at all unless this specific
// email was verified in the last 30 minutes, so this can't be skipped by calling signupUser directly.
export async function requestSignupOtp(email: string): Promise<{ success: boolean; error?: string; notConfigured?: boolean }> {
  const unavailable = 'Could not send a verification code right now. Please try again later.';
  try {
    const { data, error } = await supabase.functions.invoke('recover-account', { body: { action: 'signup-otp-request', email } });
    if (error) {
      let body: any = null;
      try { body = await (error as any)?.context?.json?.(); } catch { /* use the fallback below */ }
      return { success: false, error: body?.error || unavailable, notConfigured: body?.notConfigured === true };
    }
    return { success: !!data?.success, error: data?.success ? undefined : unavailable };
  } catch (err) {
    return { success: false, error: errorText(err, unavailable) };
  }
}

export interface SignupPayload {
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
}

// Verifying the code and creating the account used to be two separate round trips (verify, then
// signupUser's own check_signup + auth.signUp) — now the edge function does both once the code is
// right, in the same request, cutting one full network hop off what used to feel like a long
// "Creating account…" wait. The avatar's pending-upload handling (see signupUser below) stays
// client-side either way, since the file itself only ever lives in this tab's memory pre-login.
export async function verifySignupOtp(code: string, payload: SignupPayload): Promise<{ success: boolean; user?: User; error?: string; suspended?: boolean; message?: string; stage?: 'code' | 'form' }> {
  const unavailable = 'Could not verify that code right now. Please try again later.';
  try {
    const { avatar, pendingKey } = prepareSignupAvatar(payload.avatar);
    const { data, error } = await supabase.functions.invoke('recover-account', {
      body: { action: 'signup-otp-verify', email: payload.email, code, signup: { ...payload, avatar, language: cleanLanguageCode(payload.language) } }
    });
    if (error) {
      let body: any = null;
      try { body = await (error as any)?.context?.json?.(); } catch { /* use the fallback below */ }
      return { success: false, error: body?.error || unavailable, suspended: body?.suspended, message: body?.message, stage: body?.stage };
    }
    if (!data?.success) return { success: false, error: data?.error || unavailable, suspended: data?.suspended, message: data?.message, stage: data?.stage };
    if (!data.tokenHash) return { success: false, error: unavailable };
    const { error: signInError } = await supabase.auth.verifyOtp({ token_hash: data.tokenHash, type: 'magiclink' });
    if (signInError) return { success: false, error: 'Could not sign you in. Please try again.' };

    await uploadPendingSignupAvatar(pendingKey);
    const user = await rpc<any>('get_my_user');
    void supabase.functions.invoke('recover-account', { body: { action: 'welcome' } }).catch(() => undefined);
    return { success: true, user: startChatKeys(mapUser(user), payload.password) as User };
  } catch (err) {
    return { success: false, error: errorText(err, unavailable) };
  }
}

// Shared by signupUser and verifySignupOtp: a data: URI (the upload-failed fallback) can't be sent
// to the account-creation step directly, so it's stashed in memory under a "pending:" key and
// swapped for a real upload once a session exists (see uploadPendingSignupAvatar).
function prepareSignupAvatar(avatarInput: string | undefined): { avatar: string; pendingKey: string } {
  let input = avatarInput || '';
  if (input.startsWith('data:')) {
    const file = dataUriToFile(input, 'avatar');
    if (file) {
      input = `pending:${crypto.randomUUID()}`;
      pendingAvatarFiles.set(input, file);
    } else {
      input = '';
    }
  }
  const pendingKey = input.startsWith('pending:') ? input : '';
  // The database requires a non-empty avatar to create an account — the placeholder key itself is
  // harmless and self-explanatory (overwritten within moments by the real upload below); if that
  // upload ever fails, the account still exists with this as a visibly broken avatar instead of the
  // account never having been created at all.
  return { avatar: pendingKey || toStoredMedia(input), pendingKey };
}

async function uploadPendingSignupAvatar(pendingKey: string): Promise<void> {
  if (!pendingKey) return;
  const file = pendingAvatarFiles.get(pendingKey);
  pendingAvatarFiles.delete(pendingKey);
  if (!file) return;
  try {
    const uploaded = await uploadToStorage(file, 'avatars');
    await rpc('update_my_profile', { p: { avatar: uploaded.objectKey } });
  } catch (err) {
    console.error('Profile photo upload after sign-up failed — the account keeps the default photo:', err);
  }
}

export async function signupUser(payload: SignupPayload): Promise<{ success: boolean; user?: User; error?: string; suspended?: boolean; message?: string }> {
  try {
    // Friendly, specific messages first (the old server's exact wording); Auth alone would just say "database error".
    const check = await rpc<{ ok?: boolean; error?: string; suspended?: boolean; message?: string }>('check_signup', { p: payload });
    if (!check?.ok) return { success: false, error: check?.error || 'Could not create the account.', suspended: check?.suspended, message: check?.message };

    const { avatar, pendingKey } = prepareSignupAvatar(payload.avatar);

    // Login addresses are private, random ones: the person's real email lives in their private profile
    // (so one email can be used on many accounts) and they log in by username or real email via a lookup.
    const signUpOnce = () => supabase.auth.signUp({
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
    let { data, error } = await signUpOnce();
    // A generic "Database error ..." from Supabase Auth wraps ANY failure inside our sign-up trigger — it is
    // NOT necessarily a username clash (check_signup, just above, already confirmed the username was free a
    // moment ago). It's most often just a transient hiccup, so retry the exact same sign-up once — a failure
    // here rolls the whole insert back, so retrying never creates a duplicate or double-charges anything.
    if (error && !/password/i.test(error.message) && /database error/i.test(error.message)) {
      ({ data, error } = await signUpOnce());
    }
    if (error) {
      const msg = /password/i.test(error.message)
        ? error.message
        : /database error/i.test(error.message)
          ? await (async () => {
              // Only claim "already taken" if a fresh check says it actually is — never guess that from a
              // generic error string, which could just as easily be an unrelated, transient failure.
              const recheck = await rpc<{ error?: string }>('check_signup', { p: payload }).catch(() => null);
              return recheck?.error || 'Something went wrong creating your account. Please try again in a moment.';
            })()
          : error.message;
      return { success: false, error: msg };
    }
    if (!data.session) {
      return { success: false, error: 'Your account was created but needs confirmation before you can log in. Please contact support.' };
    }

    await uploadPendingSignupAvatar(pendingKey);
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

// Rolls (or re-rolls) this account's post-bonus offer — the server remembers the exact amount and
// credits it the moment a post/reel/video actually gets published, so the client never gets to pick
// the number itself (that only ever happens by calling a claim RPC with a self-chosen amount).
export async function requestPostBonusOffer(): Promise<{ available: boolean; amount?: number }> {
  try {
    const res = await rpc<{ available: boolean; amount?: number }>('request_post_bonus_offer');
    return { available: !!res.available, amount: res.amount };
  } catch {
    return { available: false };
  }
}

// ----------------------------------------------------------------------------- single-device login
export interface ActiveDeviceSession {
  deviceId: string;
  label: string;
  lastSeenAt: string;
  createdAt: string;
}

// Called right after a successful login/signup, AND once at app boot for an already-open session, so
// a session from before this feature shipped is checked too. Registers this device as the active one
// unless another of this account's devices already is, in which case it reports that list instead so
// the UI can offer to log one of them out before letting this device in.
export async function checkAndRegisterDevice(deviceId: string, deviceLabel: string): Promise<{ conflict: boolean; devices: ActiveDeviceSession[] }> {
  try {
    const res = await rpc<{ conflict: boolean; devices?: ActiveDeviceSession[] }>('upsert_device_session', { p_device_id: deviceId, p_device_label: deviceLabel });
    return { conflict: !!res.conflict, devices: res.devices || [] };
  } catch {
    // Can't reach the device check — fail OPEN (let the person in) rather than locking everyone out
    // over a network hiccup; the realtime/poll-based remote-logout check still applies once in.
    return { conflict: false, devices: [] };
  }
}

// Self-service: revoke one of THIS account's own other devices — never anyone else's.
export async function revokeDeviceSession(deviceId: string): Promise<{ success: boolean }> {
  try {
    return await rpc('revoke_device_session', { p_device_id: deviceId });
  } catch {
    return { success: false };
  }
}

// Watches this device's own device_sessions row and fires the moment someone logs it out remotely
// (by resolving a conflict on another device) — same "watch one row, react when a column flips"
// pattern as subscribeToLiveStreamEnded.
// userId is this tab's own signed-in account — every tab in the same browser shares one device id,
// so the channel name alone isn't enough to keep two tabs on two different accounts from ever
// colliding; folding userId into the channel name AND re-checking it on every event (RLS already
// restricts which rows reach this client at all, this is a second, cheap belt-and-suspenders check
// against acting on the wrong account's row) means this tab only ever reacts to its OWN account
// being logged out, never another account's row that happens to share this browser's device id.
export function subscribeToDeviceRevoked(deviceId: string, userId: string, onRevoked: () => void): () => void {
  const channel = supabase
    .channel(`device-revoked-${userId}-${deviceId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'device_sessions', filter: `device_id=eq.${deviceId}` },
      (payload) => {
        const row = payload.new as any;
        if (row?.revoked_at && row?.user_id === userId) onRevoked();
      })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

// Routed through the Edge Function (not called as a plain RPC) so it can email a deletion receipt
// to whatever address was on the account, grabbed from delete_my_account's own return value before
// the row is gone — see recover-account's "delete-account" action. Invoked BEFORE signing out
// locally: supabase-js attaches the current session's token automatically, and that token is what
// lets the function run the RPC as this account in the first place.
export async function deleteMyAccount(password: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('recover-account', { body: { action: 'delete-account', password } });
    await supabase.auth.signOut({ scope: 'local' });
    if (error) return { success: false, error: await functionError(error, 'Could not delete the account.') };
    return { success: !!data?.success, message: data?.message, error: data?.success ? undefined : (data?.error || 'Could not delete the account.') };
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

// Removes someone from MY OWN followers list — the reverse of toggleFollowUser, which only ever
// changes whether *I* follow someone else.
export async function removeFollower(followerId: string): Promise<{ success: boolean; followersCount?: number; error?: string }> {
  try {
    return await rpc('remove_follower', { p_follower: followerId });
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not remove this follower.') };
  }
}

// "Followed by ..." on someone else's profile: accounts *I* follow who also follow them. Only ever
// computed from my following list, never my followers.
export interface MutualFollower { id: string; username: string; displayName?: string; avatar?: string }
export async function fetchMutualFollowers(targetUserId: string): Promise<MutualFollower[]> {
  try {
    const list = await rpc<any[]>('mutual_followers', { p_target: targetUserId });
    return (list || []).map((u) => ({ id: u.id, username: u.username, displayName: u.displayName, avatar: resolveMedia(u.avatar) }));
  } catch {
    return [];
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

export async function respondToSuggestedUser(notifId: string, accept: boolean): Promise<{ success: boolean; isFollowing?: boolean; isFollowRequested?: boolean; followersCount?: number }> {
  try {
    const res = await rpc<any>('respond_suggested_user', { p_notif_id: notifId, p_accept: accept });
    return { success: !!res.success, ...(res.follow || {}) };
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not do that right now.') } as any;
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

// Used for a "?post=<id>" deep link or a shared-post chat card — the post may not be in whatever
// feed page happens to already be loaded, so this fetches it directly. Returns null for a post
// that doesn't exist, is archived, or the viewer isn't allowed to see (treated the same either way).
export async function fetchPostById(postId: string): Promise<Post | null> {
  try {
    const res = await rpc<any>('post_by_id', { p_post: postId });
    return res ? mapPost(res) : null;
  } catch {
    return null;
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
    return await cached(`post-likers:${postId}`, async () => {
      const res = await rpc<{ users: User[] }>('post_likers', { p_post: postId });
      return { users: (res.users || []).map((u) => mapUser(u) as User) };
    });
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
    return await cached(`post-viewers:${postId}`, async () => {
      const res = await rpc<{ users: User[] }>('post_viewers', { p_post: postId });
      return { users: (res.users || []).map((u) => mapUser(u) as User) };
    });
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
    return await cached(`comments:${postId}`, async () => {
      const res = await rpc<{ comments: any[] }>('post_comments', { p_post: postId });
      return Array.isArray(res.comments) ? res.comments.map(mapComment) : [];
    });
  } catch (err) {
    console.error('Error fetching comments:', err);
    return [];
  }
}

export interface CommentMediaInput {
  url: string;
  type: 'image' | 'video' | 'voice' | 'gif' | 'sticker';
  duration?: string;
}

export async function addComment(postId: string, text: string, parentCommentId?: string, media?: CommentMediaInput) {
  try {
    const res = await rpc<{ comment: any }>('add_comment', {
      p_post: postId,
      p_text: text || null,
      p_parent_comment: parentCommentId || null,
      p_media_url: media?.url || null,
      p_media_type: media?.type || null,
      p_media_duration: media?.duration || null
    });
    invalidateCache(`comments:${postId}`);
    return mapComment(res.comment);
  } catch (err) {
    // Thrown (not swallowed): a caller that clears its input / shows a success animation only on a
    // real success needs to actually find out when this failed, instead of a silent `undefined`.
    throw new Error(errorText(err, 'Could not post the comment.'));
  }
}

export async function deleteComment(postId: string, commentId: string) {
  const { data, error } = await supabase.from('comments').delete().eq('id', commentId).select('id');
  invalidateCache(`comments:${postId}`);
  if (error || !data || data.length === 0) return { success: false, error: 'You can only delete your own comments.' };
  return { success: true };
}

export async function togglePinComment(postId: string, commentId: string) {
  try {
    const res = await rpc('toggle_pin_comment', { p_comment: commentId });
    invalidateCache(`comments:${postId}`);
    return res;
  } catch (err) {
    return { success: false, isPinned: false, error: errorText(err, 'Could not pin the comment.') };
  }
}

// Real, persisted comment likes — see migration 20260923000034: this used to be pure client-side
// state in CommentsSheet.tsx (no backend call at all), so a like never survived closing and
// reopening the comment sheet, a reload, or being visible to anyone else.
export async function toggleCommentLike(postId: string, commentId: string) {
  try {
    const res = await rpc<{ success: boolean; isLiked: boolean; likesCount: number }>('toggle_comment_like', { p_comment: commentId });
    invalidateCache(`comments:${postId}`);
    return res;
  } catch (err) {
    return { success: false, isLiked: false, likesCount: 0, error: errorText(err, 'Could not update the like.') };
  }
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

type MediaFolder = 'posts' | 'reels' | 'stories' | 'avatars' | 'music' | 'covers' | 'stickers' | 'products' | 'chat' | 'instants' | 'comments' | 'videos' | 'daily' | 'songs';

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
    authorLiveAvatarVideoUrl: s.authorLiveAvatarVideoUrl ? resolveMedia(s.authorLiveAvatarVideoUrl) : s.authorLiveAvatarVideoUrl,
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

export async function toggleStoryLike(storyId: string): Promise<{ success: boolean; isLiked?: boolean; likesCount?: number; error?: string }> {
  try { return await rpc('toggle_story_like', { p_story: storyId }); } catch (err) { return { success: false, error: errorText(err, 'Could not like this story.') }; }
}

// Story polls (migration 20260927000001): one real vote per person per poll, keyed by the poll
// sticker's position in the story. `voters` is filled only for the story's own owner.
export interface StoryPollResult {
  counts: number[];
  total: number;
  myVote: number | null;
  voters: { username: string; option: number }[];
}

export async function fetchStoryPollResults(storyId: string): Promise<Record<string, StoryPollResult>> {
  try { return (await rpc<Record<string, StoryPollResult>>('story_poll_results', { p_story: storyId })) || {}; } catch { return {}; }
}

export async function voteStoryPoll(storyId: string, stickerIndex: number, option: number): Promise<{ success: boolean; poll?: StoryPollResult; error?: string }> {
  try {
    return await rpc('vote_story_poll', { p_story: storyId, p_sticker: stickerIndex, p_option: option });
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not save your vote. Please try again.') };
  }
}

// Story Questions sticker (migration 20260930000001): free-text answers, private to the story's
// owner — never shown to other viewers, unlike poll results which everyone sees aggregated.
export interface StoryQuestionAnswer {
  id: string;
  username: string;
  avatar: string;
  answer: string;
  createdAt: string;
}

export async function answerStoryQuestion(storyId: string, stickerIndex: number, answer: string): Promise<{ success: boolean; error?: string }> {
  try {
    return await rpc('answer_story_question', { p_story: storyId, p_sticker: stickerIndex, p_answer: answer });
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not send your answer. Please try again.') };
  }
}

export async function fetchStoryQuestionResults(storyId: string): Promise<Record<string, StoryQuestionAnswer[]>> {
  try { return (await rpc<Record<string, StoryQuestionAnswer[]>>('story_question_results', { p_story: storyId })) || {}; } catch { return {}; }
}

// Today's real comments/likes for one story, by id, regardless of whether it's still in the live
// 24h tray — this is what a highlight page calls to layer live data on top of its fixed snapshot.
export async function fetchStoryById(storyId: string): Promise<Story | null> {
  try {
    const s = await rpc<any>('story_by_id', { p_story: storyId });
    return s ? mapStory(s) : null;
  } catch {
    return null;
  }
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
    isManual: !!h.isManual,
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

// A highlight made directly from the profile — separate from the automatic per-day ones stories
// create, and never becomes (or is made from) a 24-hour story. See the manual-highlights migration.
export async function createManualHighlight(
  title: string,
  items: { mediaUrl: string; mediaType: 'image' | 'video' }[]
): Promise<{ success: boolean; highlightId?: string; error?: string }> {
  try {
    const res = await rpc<{ success: boolean; highlightId: string }>('create_manual_highlight', {
      p_title: title,
      p_items: items.map((it) => ({ mediaUrl: toStoredMedia(it.mediaUrl), mediaType: it.mediaType }))
    });
    return res;
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not create the highlight.') };
  }
}

// Any highlight you own can be renamed, including one made automatically from your stories.
export async function renameHighlight(highlightId: string, title: string): Promise<{ success: boolean; error?: string }> {
  try {
    return await rpc('rename_highlight', { p_highlight: highlightId, p_title: title });
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not rename the highlight.') };
  }
}

export async function addToHighlight(
  highlightId: string,
  items: { mediaUrl: string; mediaType: 'image' | 'video' }[]
): Promise<{ success: boolean; error?: string }> {
  try {
    return await rpc('add_to_highlight', {
      p_highlight: highlightId,
      p_items: items.map((it) => ({ mediaUrl: toStoredMedia(it.mediaUrl), mediaType: it.mediaType }))
    });
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not add to the highlight.') };
  }
}

export async function removeHighlightItem(highlightId: string, itemId: string): Promise<{ success: boolean; error?: string }> {
  try {
    return await rpc('remove_highlight_item', { p_highlight: highlightId, p_item_id: itemId });
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not remove that item.') };
  }
}

// ----------------------------------------------------------------------------- reels

function mapReel(r: any): Reel {
  return {
    ...r,
    userAvatar: resolveMedia(r.userAvatar),
    authorLiveAvatarVideoUrl: r.authorLiveAvatarVideoUrl ? resolveMedia(r.authorLiveAvatarVideoUrl) : r.authorLiveAvatarVideoUrl,
    videoUrl: resolveMedia(r.videoUrl),
    thumbnailUrl: resolveMedia(r.thumbnailUrl),
    audioTrack: r.audioTrack
      ? { ...r.audioTrack, coverUrl: r.audioTrack.coverUrl ? resolveMedia(r.audioTrack.coverUrl) : r.audioTrack.coverUrl }
      : r.audioTrack
  };
}

// A smaller initial batch than the server's own default (100) — feed_reels() runs 3 EXISTS subqueries
// per reel (isLiked/isSaved/isFollowing) plus a join, so requesting 100 up front on every app load
// paid for 100 rows of that even though most viewers never get through them all in one sitting.
// ReelsView already reshuffles the same loaded set once a pass finishes (see shuffleReels there), so
// it doesn't need a deep pool to begin with.
export async function fetchReels(): Promise<Reel[]> {
  try {
    if (!(await currentSession())) return [];
    return ((await rpc<any[]>('feed_reels', { p_limit: 20 })) || []).map(mapReel);
  } catch {
    return [];
  }
}

// ----------------------------------------------------------------------------- long-form videos (Home)

function mapLongVideo(v: any): LongVideo {
  return { ...v, userAvatar: resolveMedia(v.userAvatar), videoUrl: resolveMedia(v.videoUrl), thumbnailUrl: v.thumbnailUrl ? resolveMedia(v.thumbnailUrl) : v.thumbnailUrl };
}

export async function fetchLongVideos(): Promise<LongVideo[]> {
  try {
    if (!(await currentSession())) return [];
    return ((await rpc<any[]>('feed_long_videos')) || []).map(mapLongVideo);
  } catch {
    return [];
  }
}

export async function createLongVideo(data: {
  videoUrl: string; thumbnailUrl?: string; title?: string; description?: string; durationSeconds: number;
}): Promise<LongVideo> {
  const res = await rpc<{ video: any }>('create_long_video', {
    p_video_url: toStoredMedia(data.videoUrl),
    p_thumbnail_url: data.thumbnailUrl ? toStoredMedia(data.thumbnailUrl) : null,
    p_title: data.title || '',
    p_description: data.description || '',
    p_duration_seconds: Math.round(data.durationSeconds)
  });
  return mapLongVideo(res.video);
}

export async function toggleLikeLongVideo(videoId: string): Promise<{ isLiked: boolean; likesCount: number }> {
  try { return await rpc('toggle_long_video_like', { p_video: videoId }); } catch (err) { return { error: errorText(err, 'Could not update the like.') } as any; }
}

export async function recordLongVideoView(videoId: string) {
  try { return await rpc('record_long_video_view', { p_video: videoId }); } catch { return { success: false }; }
}

export async function deleteLongVideo(videoId: string): Promise<boolean> {
  try { await rpc('delete_long_video', { p_video: videoId }); return true; } catch { return false; }
}

// Used for a "?video=<id>" deep link or a shared-video chat card.
export async function fetchLongVideoById(videoId: string): Promise<LongVideo | null> {
  try {
    const video = await rpc<any>('get_long_video', { p_video: videoId });
    return video ? mapLongVideo(video) : null;
  } catch {
    return null;
  }
}

export async function fetchLongVideoComments(videoId: string) {
  try {
    return await cached(`video-comments:${videoId}`, async () => {
      const res = await rpc<{ comments: any[] }>('long_video_comments', { p_video: videoId });
      return Array.isArray(res.comments) ? res.comments.map(mapComment) : [];
    });
  } catch (err) {
    console.error('Error fetching video comments:', err);
    return [];
  }
}

export async function addLongVideoComment(videoId: string, text: string, parentCommentId?: string, media?: CommentMediaInput) {
  try {
    const res = await rpc<{ comment: any }>('add_long_video_comment', {
      p_video: videoId,
      p_text: text || null,
      p_parent_comment: parentCommentId || null,
      p_media_url: media?.url || null,
      p_media_type: media?.type || null,
      p_media_duration: media?.duration || null
    });
    invalidateCache(`video-comments:${videoId}`);
    return mapComment(res.comment);
  } catch (err) {
    console.error('Could not post the comment:', err);
    throw new Error(errorText(err, 'Could not post the comment. Please try again.'));
  }
}

export async function deleteLongVideoComment(videoId: string, commentId: string) {
  const { data, error } = await supabase.from('comments').delete().eq('id', commentId).select('id');
  invalidateCache(`video-comments:${videoId}`);
  if (error || !data || data.length === 0) return { success: false, error: 'You can only delete your own comments.' };
  return { success: true };
}

export async function toggleLongVideoPinComment(videoId: string, commentId: string) {
  try {
    const res = await rpc('toggle_pin_comment', { p_comment: commentId });
    invalidateCache(`video-comments:${videoId}`);
    return res;
  } catch (err) {
    return { success: false, isPinned: false, error: errorText(err, 'Could not pin the comment.') };
  }
}

export async function toggleLongVideoCommentLike(videoId: string, commentId: string) {
  try {
    const res = await rpc<{ success: boolean; isLiked: boolean; likesCount: number }>('toggle_comment_like', { p_comment: commentId });
    invalidateCache(`video-comments:${videoId}`);
    return res;
  } catch (err) {
    return { success: false, isLiked: false, likesCount: 0, error: errorText(err, 'Could not update the like.') };
  }
}

export async function toggleSaveLongVideo(videoId: string): Promise<{ isSaved: boolean; savesCount: number }> {
  try { return await rpc('toggle_save_long_video', { p_video: videoId }); } catch (err) { return { error: errorText(err, 'Could not update the save.') } as any; }
}

export async function fetchSavedLongVideos(): Promise<LongVideo[]> {
  try {
    if (!(await currentSession())) return [];
    return ((await rpc<any[]>('saved_long_videos')) || []).map(mapLongVideo);
  } catch {
    return [];
  }
}

export async function fetchLikedLongVideos(): Promise<LongVideo[]> {
  try {
    if (!(await currentSession())) return [];
    return ((await rpc<any[]>('liked_long_videos')) || []).map(mapLongVideo);
  } catch {
    return [];
  }
}

export async function fetchLongVideoHistory(): Promise<LongVideo[]> {
  try {
    if (!(await currentSession())) return [];
    return ((await rpc<any[]>('history_long_videos')) || []).map(mapLongVideo);
  } catch {
    return [];
  }
}

export async function fetchMyLongVideoPlaylists(): Promise<LongVideoPlaylist[]> {
  try {
    if (!(await currentSession())) return [];
    const res = (await rpc<any[]>('fetch_my_long_video_playlists')) || [];
    return res.map((p) => ({ ...p, coverThumbnail: p.coverThumbnail ? resolveMedia(p.coverThumbnail) : p.coverThumbnail }));
  } catch {
    return [];
  }
}

export async function fetchPlaylistsForVideo(videoId: string): Promise<(LongVideoPlaylist & { hasVideo: boolean })[]> {
  try {
    if (!(await currentSession())) return [];
    return (await rpc<any[]>('fetch_my_long_video_playlists_with_membership', { p_video_id: videoId })) || [];
  } catch {
    return [];
  }
}

export async function createLongVideoPlaylist(name: string): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    return await rpc('create_long_video_playlist', { p_name: name });
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not create the playlist.') };
  }
}

export async function renameLongVideoPlaylist(playlistId: string, name: string): Promise<{ success: boolean; error?: string }> {
  try {
    return await rpc('rename_long_video_playlist', { p_id: playlistId, p_name: name });
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not rename the playlist.') };
  }
}

export async function deleteLongVideoPlaylist(playlistId: string): Promise<{ success: boolean; error?: string }> {
  try {
    return await rpc('delete_long_video_playlist', { p_id: playlistId });
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not delete the playlist.') };
  }
}

export async function fetchLongVideoPlaylistItems(playlistId: string): Promise<LongVideo[]> {
  try {
    return ((await rpc<any[]>('fetch_long_video_playlist_items', { p_playlist_id: playlistId })) || []).map(mapLongVideo);
  } catch {
    return [];
  }
}

export async function toggleVideoInPlaylist(playlistId: string, videoId: string): Promise<{ success: boolean; inPlaylist?: boolean; error?: string }> {
  try {
    return await rpc('toggle_video_in_playlist', { p_playlist_id: playlistId, p_video_id: videoId });
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not update the playlist.') };
  }
}

export async function toggleLongVideoComments(videoId: string): Promise<{ isCommentsDisabled: boolean }> {
  try { return await rpc('toggle_long_video_flag', { p_video: videoId, p_flag: 'comments' }); } catch (err) { return { error: errorText(err, 'You can only modify your own videos.') } as any; }
}

export async function toggleLongVideoLikeCount(videoId: string): Promise<{ isLikeCountHidden: boolean }> {
  try { return await rpc('toggle_long_video_flag', { p_video: videoId, p_flag: 'like_count' }); } catch (err) { return { error: errorText(err, 'You can only modify your own videos.') } as any; }
}

export async function updateLongVideo(videoId: string, data: { title?: string; description?: string; thumbnailUrl?: string }): Promise<LongVideo> {
  const res = await rpc<{ video: any }>('update_long_video', {
    p_video: videoId,
    p_title: data.title ?? null,
    p_description: data.description ?? null,
    p_thumbnail_url: data.thumbnailUrl ? toStoredMedia(data.thumbnailUrl) : null
  });
  return mapLongVideo(res.video);
}

export async function fetchLongVideoLikers(videoId: string): Promise<{ users: User[]; error?: string }> {
  try {
    return await cached(`video-likers:${videoId}`, async () => {
      const res = await rpc<{ users: User[] }>('long_video_likers', { p_video: videoId });
      return { users: (res.users || []).map((u) => mapUser(u) as User) };
    });
  } catch (err) {
    return { users: [], error: errorText(err, 'Only the publisher can see who liked this.') };
  }
}

export async function fetchLongVideoViewers(videoId: string): Promise<{ users: User[]; error?: string }> {
  try {
    return await cached(`video-viewers:${videoId}`, async () => {
      const res = await rpc<{ users: User[] }>('long_video_viewers', { p_video: videoId });
      return { users: (res.users || []).map((u) => mapUser(u) as User) };
    });
  } catch (err) {
    return { users: [], error: errorText(err, 'Only the publisher can see who viewed it.') };
  }
}

// ----------------------------------------------------------------------------- Daily NOOB challenge
function mapDailyEntry(e: any): DailyChallengeEntry {
  return { ...e, userAvatar: resolveMedia(e.userAvatar), mediaUrl: resolveMedia(e.mediaUrl) };
}

export async function fetchDailyChallenge(): Promise<DailyChallenge | null> {
  try {
    const res = await rpc<any>('get_daily_challenge');
    const purged: string[] = Array.isArray(res?.purgedMediaKeys)
      ? res.purgedMediaKeys.filter((k: unknown): k is string => typeof k === 'string' && k.length > 0)
      : [];
    if (purged.length > 0) void supabase.storage.from(MEDIA_BUCKET).remove(purged);
    return res as DailyChallenge;
  } catch {
    return null;
  }
}

export async function submitDailyChallengeEntry(data: { mediaUrl: string; mediaType: 'image' | 'video'; caption?: string }): Promise<{ success: boolean; error?: string }> {
  try {
    return await rpc('submit_daily_challenge_entry', {
      p_media_url: toStoredMedia(data.mediaUrl),
      p_media_type: data.mediaType,
      p_caption: data.caption || ''
    });
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not submit your entry.') };
  }
}

export async function voteDailyChallengeEntry(entryId: string): Promise<{ success: boolean; error?: string }> {
  try {
    return await rpc('vote_daily_challenge_entry', { p_entry_id: entryId });
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not cast your vote.') };
  }
}

export async function fetchDailyChallengeEntries(date?: string): Promise<DailyChallengeEntry[]> {
  try {
    const res = await rpc<any[]>('fetch_daily_challenge_entries', date ? { p_date: date } : {});
    return (res || []).map(mapDailyEntry);
  } catch {
    return [];
  }
}

export async function fetchDailyChampions(limit = 20): Promise<DailyChampion[]> {
  try {
    const res = await rpc<any[]>('fetch_daily_champions', { p_limit: limit });
    return (res || []).map((c: any) => ({ ...c, userAvatar: resolveMedia(c.userAvatar) }));
  } catch {
    return [];
  }
}

export async function deleteDailyChallengeEntry(entryId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await rpc<any>('delete_daily_challenge_entry', { p_entry_id: entryId });
    if (res?.success && res?.mediaKey) {
      void supabase.storage.from(MEDIA_BUCKET).remove([res.mediaKey]);
    }
    return { success: !!res?.success };
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not delete your entry.') };
  }
}

// Admin only — directly assigns 1st/2nd/3rd (and pays out their points) for a day's challenge from
// among that day's real entrants, instead of relying on vote counts. Refuses once that day's already
// settled (automatically or manually) so points can never be paid out twice for the same day.
export async function adminAssignDailyChallengeWinners(date: string, firstUserId: string, secondUserId?: string | null, thirdUserId?: string | null): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await rpc<any>('admin_assign_daily_challenge_winners', {
      p_date: date, p_first: firstUserId, p_second: secondUserId || null, p_third: thirdUserId || null
    });
    if (res?.success && Array.isArray(res.purgedMediaKeys) && res.purgedMediaKeys.length > 0) {
      void supabase.storage.from(MEDIA_BUCKET).remove(res.purgedMediaKeys);
    }
    return { success: !!res?.success };
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not assign winners for that day.') };
  }
}

// Admin only — sets (or schedules ahead) the task shown on Daily NOOB for a given day, overriding
// the auto-rotating prompt pool for that day.
export async function adminSetDailyChallenge(date: string, prompt: string): Promise<{ success: boolean; error?: string }> {
  try {
    return await rpc('admin_set_daily_challenge', { p_date: date, p_prompt: prompt });
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not save that task.') };
  }
}

// Used for a "?reel=<id>" deep link or a shared-reel chat card — see fetchPostById's comment.
export async function fetchReelById(reelId: string): Promise<Reel | null> {
  try {
    const res = await rpc<any>('reel_by_id', { p_reel: reelId });
    return res ? mapReel(res) : null;
  } catch {
    return null;
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
    return await cached(`reel-likers:${reelId}`, async () => {
      const res = await rpc<{ users: User[] }>('reel_likers', { p_reel: reelId });
      return { users: (res.users || []).map((u) => mapUser(u) as User) };
    });
  } catch {
    return { users: [] };
  }
}

// Owner-only — the database refuses anyone but the reel's own author.
export async function fetchReelViewers(reelId: string): Promise<{ users: User[]; error?: string }> {
  try {
    return await cached(`reel-viewers:${reelId}`, async () => {
      const res = await rpc<{ users: User[] }>('reel_viewers', { p_reel: reelId });
      return { users: (res.users || []).map((u) => mapUser(u) as User) };
    });
  } catch (err) {
    return { users: [], error: errorText(err, 'Only the reel owner can see who viewed it.') };
  }
}

export async function toggleSaveReel(reelId: string): Promise<{ isSaved: boolean; savesCount: number }> {
  try { return await rpc('toggle_reel_save', { p_reel: reelId }); } catch (err) { return { error: errorText(err, 'Could not update the save.') } as any; }
}

export async function fetchReelComments(reelId: string) {
  try {
    return await cached(`reel-comments:${reelId}`, async () => {
      const res = await rpc<{ comments: any[] }>('reel_comments', { p_reel: reelId });
      return Array.isArray(res.comments) ? res.comments.map(mapComment) : [];
    });
  } catch (err) {
    console.error('Error fetching reel comments:', err);
    return [];
  }
}

export async function addReelComment(reelId: string, text: string, parentCommentId?: string, media?: CommentMediaInput) {
  try {
    const res = await rpc<{ comment: any }>('add_reel_comment', {
      p_reel: reelId,
      p_text: text || null,
      p_parent_comment: parentCommentId || null,
      p_media_url: media?.url || null,
      p_media_type: media?.type || null,
      p_media_duration: media?.duration || null
    });
    invalidateCache(`reel-comments:${reelId}`);
    return mapComment(res.comment);
  } catch (err) {
    throw new Error(errorText(err, 'Could not post the comment.'));
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

// Changing a track's cover is uploader-only, same as renaming — and permanently deletes the
// previous cover file from storage right after the new one is saved (the RPC hands back the old
// cover_url; skipped if it isn't a real bucket key, e.g. an older track still on its original
// external placeholder image from before covers were required).
export async function updateMusicTrackCover(trackId: string, newCoverUrl: string): Promise<{ success: boolean; track?: MusicTrack; error?: string }> {
  try {
    const res = await rpc<{ success: boolean; track: any; oldCoverUrl?: string }>('update_music_track_cover', {
      p_track: trackId,
      p_cover_url: toStoredMedia(newCoverUrl)
    });
    const oldKey = toStoredMedia(res.oldCoverUrl);
    if (oldKey && !/^https?:\/\//i.test(oldKey)) {
      await supabase.storage.from(MEDIA_BUCKET).remove([oldKey]);
    }
    return { success: true, track: mapTrack(res.track) };
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not update the cover image.') };
  }
}

// Admin-only, permanent: removes the row (delete_music_track, which also verifies admin rights
// server-side — the client-side check gating the button is not real security on its own) and
// then the actual audio/cover files from storage. The RPC hands back which storage keys to
// remove; a track uploaded without its own cover just falls back to an external placeholder URL
// (never a real bucket key), so that's skipped rather than mistakenly asked to delete someone
// else's URL. The row is already gone by the time storage cleanup runs, so a storage failure
// here is surfaced but doesn't leave the track resurrected — same trade-off already accepted
// everywhere else in this app that deletes content (nothing else cleans up storage at all today).
export async function deleteMusicTrack(trackId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await rpc<{ success: boolean; audioUrl?: string; coverUrl?: string }>('delete_music_track', { p_track: trackId });
    const keys = [toStoredMedia(res.audioUrl), toStoredMedia(res.coverUrl)].filter(
      (k) => k && !/^https?:\/\//i.test(k)
    ) as string[];
    if (keys.length > 0) {
      const { error } = await supabase.storage.from(MEDIA_BUCKET).remove(keys);
      if (error) return { success: true, error: 'Track deleted, but its file could not be cleared from storage.' };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not delete this track.') };
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
  if (m.sharedProfile) out.sharedProfile = { ...m.sharedProfile, avatar: resolveMedia(m.sharedProfile.avatar) };
  if (m.sharedPost) {
    out.sharedPost = {
      ...m.sharedPost,
      authorAvatar: resolveMedia(m.sharedPost.authorAvatar),
      thumbnailUrl: m.sharedPost.thumbnailUrl ? resolveMedia(m.sharedPost.thumbnailUrl) : m.sharedPost.thumbnailUrl
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

// `after` (an already-held message's createdAt) switches this to an incremental fetch — only
// messages that are new, or have changed (edited, reacted to, etc.) since then — instead of
// re-downloading the whole recent history on every poll/realtime tick. Omit it for a fresh/full load.
export async function fetchMessages(chatId: string, after?: string): Promise<Message[]> {
  try {
    const res = await rpc<{ messages: any[] }>('chat_messages', { p_chat: chatId, p_after: after || null });
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
      sharedProfileUserId: payload.sharedProfileUserId, sharedPostId: payload.sharedPostId,
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
      sharedProfileUserId: payload.sharedProfileUserId,
      sharedPostId: payload.sharedPostId,
      sharedPostType: payload.sharedPostType,
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

// One reaction per person per message (WhatsApp/iMessage style): reacting with a new emoji replaces
// your old one on that message, tapping the same emoji again removes it. Persisted on the message
// row itself, so it survives reload and reaches every participant the same way any other message
// edit does (they already poll on any `messages` table change).
export async function toggleMessageReaction(messageId: string, emoji: string): Promise<{ success: boolean; reactions?: Message['reactions']; error?: string }> {
  try {
    return await rpc('toggle_message_reaction', { p_message: messageId, p_emoji: emoji });
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not react to that message.') };
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

// ----------------------------------------------------------------------------- live online/offline presence

const PRESENCE_CHANNEL = 'presence:online-users';
export type PresencePlatform = 'app' | 'web';
export interface PresenceEntry { platform: PresencePlatform; online_at: string }

type PresenceHandle = {
  channel: ReturnType<typeof supabase.channel>;
  ready: Promise<void>;
  listeners: Set<(state: Record<string, PresenceEntry[]>) => void>;
};
let presenceHandle: PresenceHandle | null = null;

// `supabase.channel(topic)` dedupes by topic name — a second call with the same topic string
// returns the SAME channel object rather than a fresh one, and that object throws if you try to
// add an `.on()` listener after `.subscribe()` has already been called on it. An admin account is
// also a normal signed-in user, so both startPresenceHeartbeat (App.tsx, every session) and
// subscribeToOnlinePresence (the admin panel) used to each create their own channel on this same
// topic — the second one collided with the first and crashed the whole app. This single shared
// handle, created at most once per tab, is now the only place either side ever touches the channel.
function getPresenceChannel(selfKey?: string): PresenceHandle {
  if (presenceHandle) return presenceHandle;
  const listeners = new Set<(state: Record<string, PresenceEntry[]>) => void>();
  const channel = supabase.channel(PRESENCE_CHANNEL, { config: { presence: { key: selfKey || crypto.randomUUID() } } });
  let resolveReady: () => void = () => {};
  const ready = new Promise<void>((res) => { resolveReady = res; });
  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState() as unknown as Record<string, PresenceEntry[]>;
    listeners.forEach((fn) => {
      try { fn(state); } catch { /* one bad listener must not break the rest */ }
    });
  });
  channel.subscribe((status) => { if (status === 'SUBSCRIBED') resolveReady(); });
  presenceHandle = { channel, ready, listeners };
  return presenceHandle;
}

// Call once per signed-in session (App.tsx) to announce "I'm online, here's how" to everyone
// watching the admin panel. Supabase Presence is ephemeral and per-connection — nothing is written
// to the database, and the entry disappears the moment this tab closes or the socket drops, so
// "online" here always reflects a real live connection rather than a stale timestamp.
export function startPresenceHeartbeat(userId: string, platform: PresencePlatform): () => void {
  try {
    const { channel, ready } = getPresenceChannel(userId);
    let cancelled = false;
    ready.then(() => {
      if (!cancelled) channel.track({ platform, online_at: new Date().toISOString() }).catch(() => {});
    });
    return () => {
      cancelled = true;
      ready.then(() => channel.untrack().catch(() => {}));
    };
  } catch {
    return () => {};
  }
}

const LAST_SEEN_EVERY_MS = 3 * 60 * 1000;

// Persisted complement to the live Presence above — call once per signed-in session (App.tsx). Writes
// immediately, then every few minutes for as long as the tab stays open, so the admin panel's "last
// seen" for this account keeps advancing while they're active and simply stops once they leave.
export function startLastSeenHeartbeat(platform: PresencePlatform): () => void {
  const touch = () => { rpc('touch_last_seen', { p_platform: platform }).catch(() => {}); };
  touch();
  const interval = window.setInterval(touch, LAST_SEEN_EVERY_MS);
  return () => window.clearInterval(interval);
}

// Admin-only read side: calls `onChange` with the full live map (userId -> one entry per open tab/
// device) every time anyone connects or disconnects anywhere in the app. Shares the one channel
// above rather than opening its own — see getPresenceChannel for why that matters.
export function subscribeToOnlinePresence(onChange: (state: Record<string, PresenceEntry[]>) => void): () => void {
  try {
    const { channel, listeners } = getPresenceChannel();
    listeners.add(onChange);
    try { onChange(channel.presenceState() as unknown as Record<string, PresenceEntry[]>); } catch { /* not synced yet */ }
    return () => { listeners.delete(onChange); };
  } catch {
    return () => {};
  }
}

// Calls `onChange` (at most a few times a second) whenever a message or chat membership changes anywhere
// this person can see — replaces asking the server for everything every 5 seconds.
// `onMessageDeleted` is optional and fires immediately (not debounced) with just the deleted
// message's id — messages are hard-deleted, so the incremental sync in fetchMessages/chat_messages
// (which only ever SELECTs rows) has no way to notice one is gone; this is the one case that still
// needs the raw realtime event instead of a follow-up fetch.
export function subscribeToChatChanges(onChange: () => void, onMessageDeleted?: (messageId: string) => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = () => {
    if (timer) return;
    timer = setTimeout(() => { timer = null; onChange(); }, 250);
  };
  const channel = supabase
    .channel(`chat-changes-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
      if (payload.eventType === 'DELETE' && (payload.old as any)?.id) onMessageDeleted?.((payload.old as any).id);
      fire();
    })
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

// NOOB Pro only — the database refuses this for a free account. A custom upload's own video (not a
// curated preset) also carries customVideoUrl — the poster (customUrl) is what every existing "just
// show <img avatar>" spot keeps rendering; the video is what AvatarMedia plays instead, where it's wired in.
export async function applyLiveAvatar(payload: { presetId?: string; customUrl?: string; customVideoUrl?: string }): Promise<{
  success: boolean;
  user?: User;
  error?: string;
}> {
  try {
    const res = await rpc<{ user: User }>('apply_live_avatar', {
      p_preset: payload.presetId || null,
      p_custom_url: payload.customUrl ? toStoredMedia(payload.customUrl) : null,
      p_custom_video_url: payload.customVideoUrl ? toStoredMedia(payload.customVideoUrl) : null
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

// Unlike the ring:<calleeId> broadcast (only reaches an already-open app), this writes a real
// notification row so the existing Web Push pipeline can reach a fully closed one too.
export async function notifyIncomingRing(chatId: string, calleeId: string): Promise<void> {
  try {
    await rpc('notify_incoming_ring', { p_chat: chatId, p_callee: calleeId });
  } catch {
    // Best-effort — the in-app ring broadcast is the primary path; this is the closed-app backup.
  }
}

// Writes a plain "call ended / missed / declined" line into the chat's own message history.
// Only ever logs a missed call now — a call that actually connected, or one that was declined,
// writes nothing to the chat at all.
export async function logCallEvent(chatId: string, kind: 'missed'): Promise<void> {
  try {
    await rpc('log_call_event', { p_chat: chatId, p_kind: kind });
  } catch {
    // Best-effort — never let a logging failure disrupt the call itself.
  }
}

// Translation (and the AI support assistant) run in one small Edge Function that holds the AI key.
// (It was deployed from the dashboard under the name 'dynamic-handler'; the code is supabase/functions/ai.)
const AI_FUNCTION = 'dynamic-handler';

export interface GifItem { id: string; title: string; url: string; preview?: string }

// Searches the online GIF library through our server (which holds the library's key). When the library is not switched on for the app
// (or anything goes wrong) the answer is simply "not configured" and the chat shows its built-in GIFs.
// Best-effort, fire-and-forget, called once right after a successful sign-up: stamps this account's
// profile_private row with the real IP/OS platform the edge function's own request arrived from
// (never trusted from the client). Never blocks or fails a sign-up over this.
export async function recordSignupDevice(): Promise<void> {
  try {
    await supabase.functions.invoke(AI_FUNCTION, { body: { action: 'record_signup_device' } });
  } catch {
    // best-effort only
  }
}

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

// UPI-style: the sender's own password confirms every transfer, on top of everything else already
// checked (balance, recipient, amount). Every payment gets its own transferId (its "Payment ID").
export async function transferNoobPoints(payload: {
  recipientId: string;
  amount: number;
  password: string;
  note?: string;
}): Promise<{ success: boolean; user?: User; message?: string; transferId?: string; error?: string }> {
  try {
    const res = await rpc<any>('wallet_transfer', {
      p_recipient: payload.recipientId, p_amount: payload.amount, p_password: payload.password, p_note: payload.note || null
    });
    return { ...res, user: mapUser(res.user) };
  } catch (err) {
    return failWith(err, 'Could not send the points.');
  }
}

export interface WalletTransferSummary {
  transferId: string;
  direction: 'sent' | 'received';
  amount: number;
  createdAt: string;
  otherParty: { id: string; username: string; displayName?: string; avatar?: string };
}

export interface WalletTransferDetail extends WalletTransferSummary {
  reason: string;
}

// The account's own NOOB Points payment history — what the support chat's "Payment Issue" flow lists.
export async function fetchMyWalletTransfers(limit = 30): Promise<{ success: boolean; transfers: WalletTransferSummary[]; error?: string }> {
  try {
    const list = (await rpc<any[]>('my_wallet_transfers', { p_limit: limit })) || [];
    return { success: true, transfers: list.map((t) => ({ ...t, otherParty: { ...t.otherParty, avatar: resolveMedia(t.otherParty?.avatar) } })) };
  } catch (err) {
    return { success: false, transfers: [], error: errorText(err, 'Could not load your payments.') };
  }
}

export async function fetchWalletTransferDetail(transferId: string): Promise<{ success: boolean; transfer?: WalletTransferDetail; error?: string }> {
  try {
    const t = await rpc<any>('wallet_transfer_detail', { p_transfer_id: transferId });
    return { success: true, transfer: { ...t, otherParty: { ...t.otherParty, avatar: resolveMedia(t.otherParty?.avatar) } } };
  } catch (err) {
    return failWith(err, 'Could not load that payment.');
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
  conversationHistory?: Array<{ sender: 'user' | 'bot'; text: string }>,
  channel?: 'text' | 'call'
): Promise<{ success: boolean; reply: string; model?: string; user?: any; error?: string; action?: string }> {
  try {
    // lang: the language the person chose for the app, so the assistant answers in it.
    // channel: 'call' tells the assistant this is a spoken voice conversation, not a text chat —
    // no markdown/emojis/bullet points, since those get read out loud as stray symbols.
    const { data, error } = await supabase.functions.invoke(AI_FUNCTION, { body: { action: 'support', message, conversationHistory, lang: getLanguage(), channel: channel || 'text' } });
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

// The main admin's own delete needs their NOOB account password; a delegate's tap files a request instead
// (see AccountActionRequest below) and never needs one, since they never actually delete anything themselves.
export async function deleteUserAccount(targetUserId: string, password?: string): Promise<{ success: boolean; pending?: boolean; message?: string; error?: string }> {
  try { return await rpc('admin_delete_user', { p_target: targetUserId, p_password: password || null }); } catch (err) { return failWith(err, 'Could not delete the account.'); }
}

// Select as many accounts as you like and delete them together — one password prompt either way.
export async function bulkDeleteUserAccounts(targetUserIds: string[], password: string): Promise<{
  success: boolean; deletedCount?: number; deleted?: string[]; skipped?: { username: string; reason: string }[]; message?: string; error?: string;
}> {
  try { return await rpc('admin_bulk_delete_users', { p_targets: targetUserIds, p_password: password }); }
  catch (err) { return failWith(err, 'Could not delete the selected accounts.'); }
}

// ---- suspend/delete requests from a delegate, waiting on the main administrator ----

export interface AccountActionRequest {
  id: string;
  action: 'suspend' | 'unsuspend' | 'delete';
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  resolvedAt?: string;
  target: { id: string; username: string; displayName?: string; avatar?: string; isVerified?: boolean };
  requestedBy: { id: string; username: string; displayName?: string; avatar?: string };
}

const mapAccountActionRequest = (r: any): AccountActionRequest => ({
  ...r,
  target: { ...r.target, avatar: resolveMedia(r.target?.avatar) },
  requestedBy: { ...r.requestedBy, avatar: resolveMedia(r.requestedBy?.avatar) }
});

// Main admin only — nobody else, even with every other permission ticked, can see this.
export async function fetchAdminActionRequests(): Promise<{ success: boolean; requests: AccountActionRequest[]; error?: string }> {
  try {
    const res = await rpc<any>('admin_action_requests_list');
    return { success: true, requests: (res.requests || []).map(mapAccountActionRequest) };
  } catch (err) {
    return { success: false, requests: [], error: errorText(err, 'Could not load the approval queue.') };
  }
}

export async function resolveAdminActionRequest(
  id: string,
  approve: boolean,
  password?: string
): Promise<{ success: boolean; message?: string; user?: User; error?: string }> {
  try {
    const res = await rpc<any>('admin_resolve_action_request', { p_id: id, p_approve: approve, p_password: password || null });
    return { ...res, user: res.user ? mapUser(res.user) : undefined };
  } catch (err) {
    return failWith(err, 'Could not resolve this request.');
  }
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

// ---- NOOB AI feedback (reports/suggestions submitted from inside NOOB AI) ----

export interface NoobAiFeedbackItem {
  id: string;
  userId: string;
  username: string;
  displayName?: string;
  avatar?: string;
  category: 'issue' | 'suggestion';
  message: string;
  status: 'open' | 'replied' | 'closed';
  adminReply?: string;
  repliedAt?: string;
  createdAt: string;
}

export async function fetchNoobAiFeedback(status?: 'open' | 'replied' | 'closed'): Promise<{ success: boolean; items: NoobAiFeedbackItem[]; error?: string }> {
  try {
    const items = await rpc<any[]>('admin_noob_ai_feedback_list', { p_status: status ?? null });
    return { success: true, items: (items || []).map((f) => ({ ...f, avatar: resolveMedia(f.avatar) })) };
  } catch (err) {
    return { success: false, items: [], error: errorText(err, 'Could not load NOOB AI feedback.') };
  }
}

export async function replyNoobAiFeedback(feedbackId: string, reply: string): Promise<{ success: boolean; error?: string }> {
  try { return await rpc('admin_reply_noob_ai_feedback', { p_feedback_id: feedbackId, p_reply: reply }); } catch (err) { return failWith(err, 'Could not send that reply.'); }
}

export async function closeNoobAiFeedback(feedbackId: string): Promise<{ success: boolean; error?: string }> {
  try { return await rpc('admin_close_noob_ai_feedback', { p_feedback_id: feedbackId }); } catch (err) { return failWith(err, 'Could not close that.'); }
}

// ---- "Apply to join us" (team_applications) ----

export interface TeamApplication {
  id: string;
  userId: string;
  username: string;
  displayName?: string;
  avatar?: string;
  fullName: string;
  roleInterested: string;
  whyJoin: string;
  experience?: string;
  availability?: string;
  contact?: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

const mapTeamApplication = (a: any): TeamApplication => ({ ...a, avatar: resolveMedia(a.avatar) });

export async function submitTeamApplication(payload: {
  fullName: string;
  role: string;
  why: string;
  experience?: string;
  availability?: string;
  contact?: string;
}): Promise<{ success: boolean; application?: TeamApplication; error?: string }> {
  try {
    const res = await rpc<any>('submit_team_application', {
      p_full_name: payload.fullName,
      p_role: payload.role,
      p_why: payload.why,
      p_experience: payload.experience || '',
      p_availability: payload.availability || '',
      p_contact: payload.contact || ''
    });
    return { success: true, application: mapTeamApplication(res.application) };
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not submit your application.') };
  }
}

export async function fetchAdminTeamApplications(): Promise<{ success: boolean; applications: TeamApplication[]; error?: string }> {
  try {
    const res = await rpc<any>('admin_team_applications');
    return { success: true, applications: (res.applications || []).map(mapTeamApplication) };
  } catch (err) {
    return { success: false, applications: [], error: errorText(err, 'Could not load applications.') };
  }
}

export async function adminReviewTeamApplication(id: string, status: 'accepted' | 'declined'): Promise<{ success: boolean; application?: TeamApplication; error?: string }> {
  try {
    const res = await rpc<any>('admin_review_team_application', { p_id: id, p_status: status });
    return { success: true, application: mapTeamApplication(res.application) };
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not update this application.') };
  }
}

// ---- SparkX (IIT Bombay Techfest) team registrations ----

export interface SparkXApplication {
  id: string;
  userId: string;
  username: string;
  displayName?: string;
  avatar?: string;
  fullName: string;
  grade: string;
  schoolName: string;
  contribution: string;
  aiKnowledge: string;
  experience?: string;
  availability?: string;
  contact?: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  meetingInvitedAt?: string;
}

const mapSparkXApplication = (a: any): SparkXApplication => ({ ...a, avatar: resolveMedia(a.avatar) });

export async function submitSparkXApplication(payload: {
  fullName: string;
  grade: string;
  schoolName: string;
  contribution: string;
  aiKnowledge: string;
  experience?: string;
  availability?: string;
  contact?: string;
}): Promise<{ success: boolean; application?: SparkXApplication; error?: string }> {
  try {
    const res = await rpc<any>('submit_sparkx_application', {
      p_full_name: payload.fullName,
      p_grade: payload.grade,
      p_school: payload.schoolName,
      p_contribution: payload.contribution,
      p_ai_knowledge: payload.aiKnowledge,
      p_experience: payload.experience || '',
      p_availability: payload.availability || '',
      p_contact: payload.contact || ''
    });
    return { success: true, application: mapSparkXApplication(res.application) };
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not submit your application.') };
  }
}

export async function fetchAdminSparkXApplications(): Promise<{ success: boolean; applications: SparkXApplication[]; error?: string }> {
  try {
    const res = await rpc<any>('admin_sparkx_applications');
    return { success: true, applications: (res.applications || []).map(mapSparkXApplication) };
  } catch (err) {
    return { success: false, applications: [], error: errorText(err, 'Could not load applications.') };
  }
}

export async function adminReviewSparkXApplication(id: string, status: 'accepted' | 'declined'): Promise<{ success: boolean; application?: SparkXApplication; error?: string }> {
  try {
    const res = await rpc<any>('admin_review_sparkx_application', { p_id: id, p_status: status });
    return { success: true, application: mapSparkXApplication(res.application) };
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not update this application.') };
  }
}

// Best-effort emails — never block or fail the caller's real action just because one couldn't be sent.
export async function notifySparkxRegistered(applicationId: string): Promise<void> {
  try {
    await supabase.functions.invoke(AI_FUNCTION, { body: { action: 'sparkx_registered_email', applicationId } });
  } catch {
    // best-effort only
  }
}

export async function notifySparkxReview(applicationId: string, status: 'accepted' | 'declined'): Promise<void> {
  try {
    await supabase.functions.invoke(AI_FUNCTION, { body: { action: 'sparkx_review_email', applicationId, status } });
  } catch {
    // best-effort only
  }
}

export async function sendSparkxMeetingInvite(payload: {
  applicationIds: string[];
  topic: string;
  time: string;
  zoomLink: string;
  meetingId?: string;
  passcode?: string;
}): Promise<{ success: boolean; sent?: number; failed?: number; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke(AI_FUNCTION, { body: { action: 'sparkx_meeting_email', ...payload } });
    if (error) throw error;
    if (data?.error) return { success: false, error: data.error };
    return { success: true, sent: data?.sent, failed: data?.failed };
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not send the meeting invite.') };
  }
}

// ---- Platform settings (sign-ups pause, whole-app maintenance lock) ----

export interface PlatformSettings {
  signupsEnabled: boolean;
  maintenanceEnabled: boolean;
  maintenanceMessage: string;
  // NOOB AI (the voice assistant) maintenance lock — migration 20260927000002
  noobAiMaintenance?: boolean;
  // SparkX registration and "join the NOOB team" applications — migration 20260927000003
  sparkxOpen?: boolean;
  joinTeamOpen?: boolean;
  // Live Lounge (the meeting room, not Live Streaming) maintenance lock — migration 20260929000009
  liveLoungeMaintenance?: boolean;
  liveLoungeMaintenanceMessage?: string;
  // NOOB Rooms on/off toggle, for cutting the lobby/room polling's Supabase egress on demand —
  // migration 20261007000002
  noobRoomsEnabled?: boolean;
  noobRoomsDisabledMessage?: string;
}

export async function fetchPublicPlatformSettings(): Promise<PlatformSettings> {
  try {
    return await rpc<PlatformSettings>('public_platform_settings');
  } catch {
    return {
      signupsEnabled: true, maintenanceEnabled: false, maintenanceMessage: '', noobAiMaintenance: false, sparkxOpen: true, joinTeamOpen: true,
      liveLoungeMaintenance: false, liveLoungeMaintenanceMessage: '', noobRoomsEnabled: true, noobRoomsDisabledMessage: ''
    };
  }
}

export async function adminSetPlatformSettings(payload: {
  signupsEnabled?: boolean;
  maintenanceEnabled?: boolean;
  maintenanceMessage?: string;
  noobAiMaintenance?: boolean;
  sparkxOpen?: boolean;
  joinTeamOpen?: boolean;
  liveLoungeMaintenance?: boolean;
  liveLoungeMaintenanceMessage?: string;
  noobRoomsEnabled?: boolean;
  noobRoomsDisabledMessage?: string;
}): Promise<{ success: boolean; settings?: PlatformSettings; error?: string }> {
  try {
    const settings = await rpc<PlatformSettings>('admin_set_platform_settings', {
      p_signups_enabled: payload.signupsEnabled ?? null,
      p_maintenance_enabled: payload.maintenanceEnabled ?? null,
      p_maintenance_message: payload.maintenanceMessage ?? null,
      ...(payload.noobAiMaintenance !== undefined ? { p_noob_ai_maintenance: payload.noobAiMaintenance } : {}),
      ...(payload.sparkxOpen !== undefined ? { p_sparkx_open: payload.sparkxOpen } : {}),
      ...(payload.joinTeamOpen !== undefined ? { p_join_team_open: payload.joinTeamOpen } : {}),
      ...(payload.liveLoungeMaintenance !== undefined ? { p_live_lounge_maintenance: payload.liveLoungeMaintenance } : {}),
      ...(payload.liveLoungeMaintenanceMessage !== undefined ? { p_live_lounge_maintenance_message: payload.liveLoungeMaintenanceMessage } : {}),
      ...(payload.noobRoomsEnabled !== undefined ? { p_noob_rooms_enabled: payload.noobRoomsEnabled } : {}),
      ...(payload.noobRoomsDisabledMessage !== undefined ? { p_noob_rooms_disabled_message: payload.noobRoomsDisabledMessage } : {})
    });
    return { success: true, settings };
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not save platform settings.') };
  }
}

// ---- "Wake up NOOB": anyone signed in can ask the NOOB AI computer to start NOOB AI (migration 20260927000004) ----

export async function requestNoobAiWake(): Promise<{ success: boolean; error?: string }> {
  try {
    await rpc('request_noob_ai_wake');
    return { success: true };
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not wake NOOB right now.') };
  }
}

// ---- Explore pins (main admin): pinned accounts come first in Explore's people list, newest pin on top ----

export async function fetchAdminExplorePins(): Promise<{ userId: string; pinnedAt: string }[]> {
  try { return (await rpc<{ userId: string; pinnedAt: string }[]>('admin_explore_pins')) || []; } catch { return []; }
}

export async function adminSetExplorePin(userId: string, pinned: boolean): Promise<{ success: boolean; pins?: { userId: string; pinnedAt: string }[]; error?: string }> {
  try {
    const pins = await rpc<{ userId: string; pinnedAt: string }[]>('admin_set_explore_pin', { p_user: userId, p_pinned: pinned });
    return { success: true, pins: pins || [] };
  } catch (err) {
    return { success: false, error: errorText(err, 'Could not update the pin.') };
  }
}

// ---- Admin content browser (every post/reel/story, not scoped to who the admin follows) ----

export async function fetchAdminContentFeed(type: 'posts' | 'reels' | 'stories', limit = 60): Promise<{ success: boolean; items: any[]; error?: string }> {
  try {
    const res = await rpc<any>('admin_content_feed', { p_type: type, p_limit: limit });
    const map = type === 'reels' ? mapReel : type === 'stories' ? mapStory : mapPost;
    return { success: true, items: (res.items || []).map(map) };
  } catch (err) {
    return { success: false, items: [], error: errorText(err, 'Could not load content.') };
  }
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

// ---- Instants: camera-only photos shared from the Chat page with Friends (people you follow who follow you
// back) or Close Friends. Each friend can open one once; unopened ones expire after 24h. ----

export interface CloseFriend {
  id: string;
  username: string;
  displayName?: string;
  avatar?: string;
  isVerified?: boolean;
  isCloseFriend: boolean;
}

export async function fetchCloseFriends(): Promise<{ success: boolean; friends: CloseFriend[]; error?: string }> {
  try {
    const list = (await rpc<any[]>('my_close_friends')) || [];
    return { success: true, friends: list.map((f) => ({ ...f, avatar: resolveMedia(f.avatar) })) };
  } catch (err) {
    return { success: false, friends: [], error: errorText(err, 'Could not load your friends.') };
  }
}

export async function setCloseFriend(userId: string, on: boolean): Promise<{ success: boolean; count?: number; error?: string }> {
  try { return await rpc('set_close_friend', { p_user: userId, p_on: on }); } catch (err) { return failWith(err, 'Could not update your Close Friends.'); }
}

export interface InstantSender {
  userId: string;
  username: string;
  displayName?: string;
  avatar?: string;
  isVerified?: boolean;
}

export interface InstantInboxItem {
  id: string;
  caption: string;
  createdAt: string;
  sender: InstantSender;
}

export interface OpenedInstant {
  id: string;
  mediaUrl: string;
  caption: string;
  createdAt: string;
  sender: InstantSender;
}

export interface InstantArchiveItem {
  id: string;
  mediaUrl: string;
  caption: string;
  audience: 'friends' | 'close_friends';
  createdAt: string;
  expiresAt: string;
  sentTo: number;
  reactions: { username: string; emoji: string }[];
}

const mapInstantSender = (s: any): InstantSender => ({ ...s, avatar: resolveMedia(s?.avatar) });

// Takes a photo just captured with the camera (never the gallery) and shares it with Friends or Close Friends.
export async function sendInstant(file: File, caption: string, audience: 'friends' | 'close_friends'): Promise<{
  success: boolean; id?: string; recipients?: number; createdAt?: string; error?: string;
}> {
  try {
    const uploaded = await uploadMediaFile(file, 'instants');
    return await rpc('send_instant', { p_media_url: uploaded.objectKey, p_caption: caption, p_audience: audience });
  } catch (err) {
    return failWith(err, 'Could not send your instant.');
  }
}

// The "undo" — deletes it from your own archive and takes it back from anyone who has not opened it yet.
export async function deleteInstant(id: string): Promise<{ success: boolean; error?: string }> {
  try { return await rpc('delete_instant', { p_id: id }); } catch (err) { return failWith(err, 'Could not remove this instant.'); }
}

// Instants waiting for me — no photo yet, that only comes from openInstant() (each can be opened once).
export async function fetchInstantInbox(): Promise<{ success: boolean; instants: InstantInboxItem[]; error?: string }> {
  try {
    const list = (await rpc<any[]>('my_instant_inbox')) || [];
    return { success: true, instants: list.map((i) => ({ ...i, sender: mapInstantSender(i.sender) })) };
  } catch (err) {
    return { success: false, instants: [], error: errorText(err, 'Could not load your instants.') };
  }
}

export async function openInstant(id: string): Promise<{ success: boolean; instant?: OpenedInstant; error?: string }> {
  try {
    const res = await rpc<{ success: boolean; instant: any }>('open_instant', { p_id: id });
    const instant = res.instant;
    return { success: true, instant: { ...instant, mediaUrl: resolveMedia(instant.mediaUrl), sender: mapInstantSender(instant.sender) } };
  } catch (err) {
    return failWith(err, 'This instant is no longer available.');
  }
}

export async function reactToInstant(id: string, emoji: string): Promise<{ success: boolean; reaction?: string; error?: string }> {
  try { return await rpc('react_instant', { p_id: id, p_emoji: emoji }); } catch (err) { return failWith(err, 'Could not send your reaction.'); }
}

// Your own private archive ("Your Instants") — nobody else can see this.
export async function fetchInstantsArchive(): Promise<{ success: boolean; instants: InstantArchiveItem[]; error?: string }> {
  try {
    const list = (await rpc<any[]>('my_instants_archive')) || [];
    return { success: true, instants: list.map((i) => ({ ...i, mediaUrl: resolveMedia(i.mediaUrl) })) };
  } catch (err) {
    return { success: false, instants: [], error: errorText(err, 'Could not load your instants.') };
  }
}

// ----------------------------------------------------------------------------- live streaming

export interface LiveStreamSummary {
  id: string;
  title: string;
  viewerCount: number;
  startedAt: string;
  host: { id: string; username: string; displayName?: string; avatar?: string };
}

export interface LiveStreamComment {
  id: string;
  streamId: string;
  text: string;
  giftAmount?: number | null;
  createdAt: string;
  sender: { id: string; username: string; displayName?: string; avatar?: string };
}

function mapLiveStream(s: any): LiveStreamSummary {
  return { ...s, host: { ...s.host, avatar: resolveMedia(s.host?.avatar) } };
}

function mapLiveStreamComment(c: any): LiveStreamComment {
  return { ...c, sender: { ...c.sender, avatar: resolveMedia(c.sender?.avatar) } };
}

export async function fetchLiveStreams(): Promise<{ success: boolean; streams: LiveStreamSummary[]; error?: string }> {
  try {
    const list = (await rpc<any[]>('list_live_streams')) || [];
    return { success: true, streams: list.map(mapLiveStream) };
  } catch (err) {
    return { success: false, streams: [], error: errorText(err, 'Could not load live streams.') };
  }
}

export async function startLiveStream(title?: string): Promise<{ success: boolean; id?: string; channelName?: string; title?: string; startedAt?: string; error?: string }> {
  try {
    const res = await rpc<any>('start_live_stream', { p_title: title || '' });
    return { success: true, ...res };
  } catch (err) {
    return failWith(err, 'Could not go live.');
  }
}

export async function endLiveStream(streamId: string): Promise<{ success: boolean; error?: string }> {
  try { return await rpc('end_live_stream', { p_stream_id: streamId }); } catch (err) { return failWith(err, 'Could not end the stream.'); }
}

export async function leaveLiveStream(streamId: string): Promise<void> {
  try { await rpc('live_stream_leave', { p_id: streamId }); } catch { /* best-effort — the viewer is leaving anyway */ }
}

// Mints an Agora RTC token via the "agora-token" Edge Function, which itself calls live_stream_join()
// so privacy and viewer-counting happen in exactly one place (the database), never duplicated here.
export async function joinLiveStream(streamId: string): Promise<{ success: boolean; token?: string; channelName?: string; appId?: string; isHost?: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('agora-token', { body: { streamId } });
    if (error) return { success: false, error: await functionError(error, 'Could not join this stream.') };
    if (!data?.token) return { success: false, error: data?.error || 'Could not join this stream.' };
    return { success: true, ...data };
  } catch (err) {
    return failWith(err, 'Could not join this stream.');
  }
}

export async function sendLiveStreamComment(streamId: string, text: string): Promise<{ success: boolean; comment?: LiveStreamComment; error?: string }> {
  try {
    const res = await rpc<any>('live_stream_comment', { p_stream_id: streamId, p_text: text });
    return { success: true, comment: mapLiveStreamComment(res) };
  } catch (err) {
    return failWith(err, 'Could not send that message.');
  }
}

export async function fetchLiveStreamComments(streamId: string, limit = 50): Promise<{ success: boolean; comments: LiveStreamComment[]; error?: string }> {
  try {
    const list = (await rpc<any[]>('live_stream_comments_recent', { p_stream_id: streamId, p_limit: limit })) || [];
    return { success: true, comments: list.map(mapLiveStreamComment) };
  } catch (err) {
    return { success: false, comments: [], error: errorText(err, 'Could not load chat.') };
  }
}

export async function likeLiveStream(streamId: string): Promise<{ success: boolean; totalLikes?: number; error?: string }> {
  try { return await rpc('live_stream_like', { p_stream_id: streamId }); } catch (err) { return failWith(err, 'Could not like this stream.'); }
}

export async function giftLiveStream(streamId: string, amount: number): Promise<{ success: boolean; transferId?: string; error?: string }> {
  try { return await rpc('live_stream_gift', { p_stream_id: streamId, p_amount: amount }); } catch (err) { return failWith(err, 'Could not send that gift.'); }
}

// New chat messages as they arrive — appended directly (each row is add-only, so there's nothing to
// merge or dedupe against, unlike notifications where a debounce-then-refetch is safer).
export function subscribeToLiveStreamComments(streamId: string, onInsert: (comment: LiveStreamComment) => void): () => void {
  const channel = supabase
    .channel(`live-comments-${streamId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_stream_comments', filter: `stream_id=eq.${streamId}` },
      async (payload) => {
        const row = payload.new as any;
        onInsert(mapLiveStreamComment({
          id: row.id, streamId: row.stream_id, text: row.text, giftAmount: row.gift_amount, createdAt: row.created_at,
          sender: await fetchLiveStreamCommentSender(row.sender_id)
        }));
      })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

// Realtime only hands back the raw row (no join), so the sender's display name/avatar is looked up once per
// message here — cached briefly since the same person tends to send several messages in a row.
const liveSenderCache = new Map<string, { id: string; username: string; displayName?: string; avatar?: string }>();
async function fetchLiveStreamCommentSender(userId: string) {
  const hit = liveSenderCache.get(userId);
  if (hit) return hit;
  try {
    const u = await fetchUserById(userId);
    const sender = { id: userId, username: u?.username || '', displayName: u?.displayName, avatar: u?.avatar };
    liveSenderCache.set(userId, sender);
    return sender;
  } catch {
    return { id: userId, username: '' };
  }
}

// Purely ephemeral — every viewer's heart-tap animation, decoupled from the durable total_likes counter
// (likeLiveStream() above already persists the count; this is only "make the heart fly for everyone now").
// Fires when this stream's own row flips to 'ended' without the host doing it themselves — the
// signal a host's own view listens for to learn an admin force-ended their broadcast, since
// end_live_stream only updates the database and has no way to reach into the host's Agora session.
export function subscribeToLiveStreamEnded(streamId: string, onEnded: () => void): () => void {
  const channel = supabase
    .channel(`live-ended-${streamId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_streams', filter: `id=eq.${streamId}` },
      (payload) => {
        if ((payload.new as any)?.status === 'ended') onEnded();
      })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

export function subscribeToLiveStreamHearts(streamId: string, onHeart: () => void): () => void {
  const channel = supabase
    .channel(`live-hearts-${streamId}`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'heart' }, onHeart)
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

export function broadcastLiveStreamHeart(streamId: string): void {
  supabase.channel(`live-hearts-${streamId}`, { config: { broadcast: { self: false } } }).send({ type: 'broadcast', event: 'heart', payload: {} });
}

// ----------------------------------------------------------------------------- NOOB Live Lounge

export const LIVE_LOUNGE_PRICE = 20_000_000_000;

export async function purchaseLiveLounge(password: string): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    const res = await rpc<any>('purchase_live_lounge', { p_password: password });
    return { ...res, user: mapUser(res.user) };
  } catch (err) {
    return failWith(err, 'Could not complete the purchase.');
  }
}

export async function redeemLiveLoungeCoupon(code: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    const res = await rpc<any>('redeem_live_lounge_coupon', { p_code: code, p_password: password });
    return { ...res, user: mapUser(res.user) };
  } catch (err) {
    return failWith(err, 'Could not redeem that coupon.');
  }
}

export interface LiveLoungeCoupon {
  code: string;
  createdAt: string;
  redeemedAt?: string | null;
  redeemedBy?: string | null;
}

export async function adminGenerateLiveLoungeCoupons(count: number): Promise<{ success: boolean; codes: string[]; error?: string }> {
  try {
    const res = await rpc<any>('admin_generate_live_lounge_coupons', { p_count: count });
    return { success: true, codes: res.codes || [] };
  } catch (err) {
    return { success: false, codes: [], error: errorText(err, 'Could not generate coupons.') };
  }
}

export async function adminFetchLiveLoungeCoupons(): Promise<{ success: boolean; coupons: LiveLoungeCoupon[]; error?: string }> {
  try {
    const coupons = (await rpc<any[]>('admin_live_lounge_coupons_list')) || [];
    return { success: true, coupons };
  } catch (err) {
    return { success: false, coupons: [], error: errorText(err, 'Could not load coupons.') };
  }
}

// "Ask a friend to pay" — purchaseType currently only supports 'live_lounge'; more will be added here
// as they're wired up server-side.
export async function requestFriendPayment(payerId: string, purchaseType: 'live_lounge'): Promise<{ success: boolean; requestId?: string; error?: string }> {
  try { return await rpc('request_friend_payment', { p_payer: payerId, p_purchase_type: purchaseType }); } catch (err) { return failWith(err, 'Could not send that request.'); }
}

export interface PaymentRequestSummary {
  id: string;
  purchaseType: 'live_lounge';
  amount: number;
  createdAt: string;
  expiresAt: string;
  requester: { id: string; username: string; displayName?: string; avatar?: string };
}

export async function fetchMyPaymentRequests(): Promise<{ success: boolean; requests: PaymentRequestSummary[]; error?: string }> {
  try {
    const list = (await rpc<any[]>('my_payment_requests')) || [];
    return { success: true, requests: list.map((r) => ({ ...r, requester: { ...r.requester, avatar: resolveMedia(r.requester?.avatar) } })) };
  } catch (err) {
    return { success: false, requests: [], error: errorText(err, 'Could not load payment requests.') };
  }
}

export async function respondPaymentRequest(requestId: string, approve: boolean, password?: string): Promise<{ success: boolean; approved?: boolean; error?: string }> {
  try { return await rpc('respond_payment_request', { p_request_id: requestId, p_approve: approve, p_password: password || null }); } catch (err) { return failWith(err, 'Could not respond to that request.'); }
}

// ----------------------------------------------------------------------------- NOOB Live Lounge room (Zoom-style)

export interface LiveLoungeParticipant {
  userId: string;
  username: string;
  displayName?: string;
  avatar?: string;
  role?: 'host' | 'participant';
}

export interface LiveLoungeRoomChatMessage {
  id: string;
  roomId: string;
  text: string;
  createdAt: string;
  sender: { id: string; username: string; displayName?: string; avatar?: string };
}

export async function startLiveLoungeRoom(title?: string): Promise<{ success: boolean; roomId?: string; roomCode?: string; channelName?: string; title?: string; error?: string }> {
  try {
    const res = await rpc<any>('start_live_lounge_room', { p_title: title || '' });
    return { success: true, ...res };
  } catch (err) {
    return failWith(err, 'Could not start the room.');
  }
}

export async function inviteToLiveLoungeRoom(roomId: string, targetUserId: string): Promise<{ success: boolean; error?: string }> {
  try { return await rpc('invite_to_live_lounge_room', { p_room_id: roomId, p_target_user_id: targetUserId }); } catch (err) { return failWith(err, 'Could not send that invite.'); }
}

export interface LiveLoungePendingInvite {
  roomId: string;
  title: string;
  roomCode: string;
  hostUsername: string;
  hostAvatar?: string;
  joinedAt: string;
}

export async function fetchPendingLiveLoungeInvites(): Promise<LiveLoungePendingInvite[]> {
  try {
    const list = (await rpc<any[]>('my_pending_live_lounge_invites')) || [];
    return list.map((i) => ({ ...i, hostAvatar: resolveMedia(i.hostAvatar) }));
  } catch {
    return [];
  }
}

export interface LiveLoungeHistoryEntry {
  roomId: string;
  title: string;
  roomCode: string;
  role: 'host' | 'participant';
  roomStatus: 'active' | 'ended';
  joinedAt: string;
  endedAt?: string;
}

export async function fetchLiveLoungeHistory(limit = 30): Promise<LiveLoungeHistoryEntry[]> {
  try {
    return (await rpc<LiveLoungeHistoryEntry[]>('my_live_lounge_history', { p_limit: limit })) || [];
  } catch {
    return [];
  }
}

export async function joinLiveLoungeRoomByCode(code: string): Promise<{ success: boolean; roomId?: string; title?: string; error?: string }> {
  try {
    const res = await rpc<any>('join_live_lounge_room_by_code', { p_code: code });
    return { success: true, ...res };
  } catch (err) {
    return failWith(err, 'Could not join that room.');
  }
}

export async function fetchLiveLoungeRoomMyStatus(roomId: string): Promise<{ status?: string; role?: string; roomStatus?: string; title?: string; roomCode?: string } | null> {
  try { return await rpc('live_lounge_room_my_status', { p_room_id: roomId }); } catch { return null; }
}

export async function fetchLiveLoungeRoomParticipants(roomId: string): Promise<{ admitted: LiveLoungeParticipant[]; waiting: LiveLoungeParticipant[] }> {
  try {
    const res = await rpc<any>('live_lounge_room_participants_list', { p_room_id: roomId });
    const map = (u: any): LiveLoungeParticipant => ({ ...u, avatar: resolveMedia(u.avatar) });
    return { admitted: (res.admitted || []).map(map), waiting: (res.waiting || []).map(map) };
  } catch (err) {
    // Never surfaced to the host as an error (the panel just shows nobody waiting instead), which
    // previously made a real failure here indistinguishable from "no one has joined yet" — at least
    // log it so a silent break like that shows up in the console instead of looking like normal quiet.
    console.error('fetchLiveLoungeRoomParticipants failed:', err);
    return { admitted: [], waiting: [] };
  }
}

export async function admitLiveLoungeParticipant(roomId: string, userId: string, admit: boolean): Promise<{ success: boolean; error?: string }> {
  try { return await rpc('live_lounge_room_admit', { p_room_id: roomId, p_user_id: userId, p_admit: admit }); } catch (err) { return failWith(err, 'Could not update that person.'); }
}

// Mints an Agora RTC token via the same "agora-token" Edge Function as Live Streaming, passing roomId
// instead of streamId — live_lounge_room_join() is the one place that checks admission.
export async function joinLiveLoungeRoom(roomId: string): Promise<{ success: boolean; token?: string; channelName?: string; appId?: string; isHost?: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('agora-token', { body: { roomId } });
    if (error) return { success: false, error: await functionError(error, 'Could not join this room.') };
    if (!data?.token) return { success: false, error: data?.error || 'Could not join this room.' };
    return { success: true, ...data };
  } catch (err) {
    return failWith(err, 'Could not join this room.');
  }
}

export async function endLiveLoungeRoom(roomId: string): Promise<{ success: boolean; error?: string }> {
  try { return await rpc('end_live_lounge_room', { p_room_id: roomId }); } catch (err) { return failWith(err, 'Could not end the room.'); }
}

export async function leaveLiveLoungeRoom(roomId: string): Promise<void> {
  try { await rpc('leave_live_lounge_room', { p_room_id: roomId }); } catch { /* best-effort — leaving anyway */ }
}

export async function sendLiveLoungeRoomChat(roomId: string, text: string): Promise<{ success: boolean; message?: LiveLoungeRoomChatMessage; error?: string }> {
  try {
    const res = await rpc<any>('live_lounge_room_chat_send', { p_room_id: roomId, p_text: text });
    return { success: true, message: { ...res, sender: { ...res.sender, avatar: resolveMedia(res.sender?.avatar) } } };
  } catch (err) {
    return failWith(err, 'Could not send that message.');
  }
}

export async function fetchLiveLoungeRoomChat(roomId: string, limit = 50): Promise<{ success: boolean; messages: LiveLoungeRoomChatMessage[]; error?: string }> {
  try {
    const list = (await rpc<any[]>('live_lounge_room_chat_recent', { p_room_id: roomId, p_limit: limit })) || [];
    return { success: true, messages: list.map((m) => ({ ...m, sender: { ...m.sender, avatar: resolveMedia(m.sender?.avatar) } })) };
  } catch (err) {
    return { success: false, messages: [], error: errorText(err, 'Could not load chat.') };
  }
}

export function subscribeToLiveLoungeRoomChat(roomId: string, onInsert: (message: LiveLoungeRoomChatMessage) => void): () => void {
  const channel = supabase
    .channel(`lounge-chat-${roomId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_lounge_room_chat', filter: `room_id=eq.${roomId}` },
      async (payload) => {
        const row = payload.new as any;
        const sender = await fetchLiveStreamCommentSender(row.sender_id);
        onInsert({ id: row.id, roomId: row.room_id, text: row.text, createdAt: row.created_at, sender });
      })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

// Participant/waiting-room changes (someone joins the waiting room, gets admitted, or leaves) — the
// caller re-fetches the participants list on every change rather than trying to patch it in place.
export function subscribeToLiveLoungeRoomParticipants(roomId: string, onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = () => {
    if (timer) return;
    timer = setTimeout(() => { timer = null; onChange(); }, 300);
  };
  const channel = supabase
    .channel(`lounge-participants-${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'live_lounge_room_participants', filter: `room_id=eq.${roomId}` }, fire)
    .subscribe((status) => { if (status === 'SUBSCRIBED') fire(); });
  return () => {
    if (timer) clearTimeout(timer);
    supabase.removeChannel(channel);
  };
}

// ----------------------------------------------------------------------------- NOOB Rooms (public voice rooms)

function mapNoobRoom(r: any): NoobRoom {
  return { ...r, host: r.host ? { ...r.host, avatar: resolveMedia(r.host.avatar) } : null };
}

export async function listNoobRooms(): Promise<NoobRoom[]> {
  try {
    if (!(await currentSession())) return [];
    return ((await rpc<any[]>('list_noob_rooms')) || []).map(mapNoobRoom);
  } catch {
    return [];
  }
}

export async function startNoobRoom(name: string, category: string, description: string): Promise<{ success: boolean; roomId?: string; error?: string }> {
  try {
    return await rpc('start_noob_room', { p_name: name, p_category: category, p_description: description });
  } catch (err) {
    return failWith(err, 'Could not start the room.');
  }
}

// Mints an Agora RTC token via the same "agora-token" Edge Function as Live Streaming/Live Lounge,
// passing noobRoomId — noob_room_join() is the one place that authorizes and records the join.
export async function joinNoobRoom(roomId: string): Promise<{ success: boolean; token?: string; channelName?: string; appId?: string; isHost?: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('agora-token', { body: { noobRoomId: roomId } });
    if (error) return { success: false, error: await functionError(error, 'Could not join this room.') };
    if (!data?.token) return { success: false, error: data?.error || 'Could not join this room.' };
    return { success: true, ...data };
  } catch (err) {
    return failWith(err, 'Could not join this room.');
  }
}

export async function leaveNoobRoom(roomId: string): Promise<void> {
  try { await rpc('leave_noob_room', { p_room_id: roomId }); } catch { /* best-effort — leaving anyway */ }
}

export async function endNoobRoom(roomId: string): Promise<{ success: boolean; error?: string }> {
  try { return await rpc('end_noob_room', { p_room_id: roomId }); } catch (err) { return failWith(err, 'Could not end the room.'); }
}

export async function fetchNoobRoomParticipants(roomId: string): Promise<NoobRoomParticipant[]> {
  try {
    const list = (await rpc<any[]>('noob_room_participants_list', { p_room_id: roomId })) || [];
    return list.map((p) => ({ ...p, avatar: resolveMedia(p.avatar) }));
  } catch {
    return [];
  }
}

export function subscribeToNoobRoomParticipants(roomId: string, onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = () => {
    if (timer) return;
    timer = setTimeout(() => { timer = null; onChange(); }, 300);
  };
  const channel = supabase
    .channel(`noobroom-participants-${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'noob_room_participants', filter: `room_id=eq.${roomId}` }, fire)
    .subscribe((status) => { if (status === 'SUBSCRIBED') fire(); });
  return () => {
    if (timer) clearTimeout(timer);
    supabase.removeChannel(channel);
  };
}

function mapNoobRoomChatMessage(m: any): NoobRoomChatMessage {
  return { ...m, sender: { ...m.sender, avatar: resolveMedia(m.sender?.avatar) }, mediaUrl: m.mediaUrl ? resolveMedia(m.mediaUrl) : m.mediaUrl };
}

export async function sendNoobRoomChat(roomId: string, text: string, mediaUrl?: string, mediaType?: string): Promise<{ success: boolean; message?: NoobRoomChatMessage; error?: string }> {
  try {
    const res = await rpc<any>('noob_room_chat_send', { p_room_id: roomId, p_text: text, p_media_url: mediaUrl || null, p_media_type: mediaType || null });
    return { success: true, message: mapNoobRoomChatMessage(res) };
  } catch (err) {
    return failWith(err, 'Could not send that message.');
  }
}

export async function fetchNoobRoomChat(roomId: string, limit = 50): Promise<{ success: boolean; messages: NoobRoomChatMessage[]; error?: string }> {
  try {
    const list = (await rpc<any[]>('noob_room_chat_recent', { p_room_id: roomId, p_limit: limit })) || [];
    return { success: true, messages: list.map(mapNoobRoomChatMessage) };
  } catch (err) {
    return { success: false, messages: [], error: errorText(err, 'Could not load chat.') };
  }
}

export function subscribeToNoobRoomChat(roomId: string, onInsert: (message: NoobRoomChatMessage) => void): () => void {
  const channel = supabase
    .channel(`noobroom-chat-${roomId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'noob_room_chat', filter: `room_id=eq.${roomId}` },
      async (payload) => {
        const row = payload.new as any;
        const sender = await fetchLiveStreamCommentSender(row.sender_id);
        onInsert(mapNoobRoomChatMessage({ id: row.id, roomId: row.room_id, text: row.text, mediaUrl: row.media_url, mediaType: row.media_type, createdAt: row.created_at, sender }));
      })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

// ----------------------------------------------------------------------------- Guess the Song

function mapSongGuessRound(r: any): SongGuessRound {
  return { ...r, clipUrl: r.clipUrl ? resolveMedia(r.clipUrl) : r.clipUrl };
}

export async function fetchSongGuessRound(): Promise<SongGuessRound | null> {
  try {
    if (!(await currentSession())) return null;
    return mapSongGuessRound(await rpc<any>('get_song_guess_round'));
  } catch {
    return null;
  }
}

export async function submitSongGuess(roundNumber: number, chosenIndex: number): Promise<{ success: boolean; isCorrect?: boolean; error?: string }> {
  try {
    return await rpc('submit_song_guess', { p_round_number: roundNumber, p_chosen_index: chosenIndex });
  } catch (err) {
    return failWith(err, 'Could not submit your guess.');
  }
}

export async function fetchSongGuessLeaderboard(limit = 3): Promise<SongGuessLeaderboardEntry[]> {
  try {
    const list = (await rpc<any[]>('fetch_song_guess_leaderboard', { p_limit: limit })) || [];
    return list.map((e) => ({ ...e, avatar: resolveMedia(e.avatar) }));
  } catch {
    return [];
  }
}

export function subscribeToSongGuessRound(onChange: () => void): () => void {
  const channel = supabase
    .channel('song-guess-round')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'song_guess_round', filter: 'id=eq.1' }, onChange)
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

export interface SongGuessPresenceEntry { userId: string; username: string; avatar: string; isVerified?: boolean }

// "Who else is playing right now" — a plain Supabase Presence channel, same ephemeral/nothing-ever-
// written-to-a-table idea as the voice-call and NOOB Rooms presence: tracked only while this screen
// is open, gone the instant it closes.
export function joinSongGuessPresence(
  me: { id: string; username: string; avatar: string; isVerified?: boolean },
  onChange: (state: Record<string, SongGuessPresenceEntry>) => void
): () => void {
  const channel = supabase.channel('song-guess-presence', { config: { presence: { key: me.id } } });
  channel.on('presence', { event: 'sync' }, () => {
    const raw = channel.presenceState<SongGuessPresenceEntry>();
    const out: Record<string, SongGuessPresenceEntry> = {};
    for (const key of Object.keys(raw)) {
      const entry = raw[key]?.[0] as unknown as SongGuessPresenceEntry | undefined;
      if (entry) out[key] = entry;
    }
    onChange(out);
  });
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      void channel.track({ userId: me.id, username: me.username, avatar: me.avatar, isVerified: me.isVerified }).catch(() => {});
    }
  });
  return () => {
    void channel.untrack().catch(() => {});
    void supabase.removeChannel(channel);
  };
}

export async function adminAddSongGuessTrack(title: string, artist: string, youtubeVideoId: string, clipStartSeconds = 0, clipLengthSeconds = 5): Promise<{ success: boolean; error?: string }> {
  try {
    return await rpc('admin_add_song_guess_track', {
      p_title: title, p_artist: artist, p_audio_url: '', p_clip_start_seconds: clipStartSeconds, p_clip_length_seconds: clipLengthSeconds, p_youtube_video_id: youtubeVideoId
    });
  } catch (err) {
    return failWith(err, 'Could not add that song.');
  }
}

export interface AdminSongGuessTrack {
  id: string;
  title: string;
  artist: string;
  youtubeVideoId: string | null;
  clipStartSeconds: number;
  clipLengthSeconds: number;
  createdAt: string;
}

export async function adminListSongGuessTracks(): Promise<AdminSongGuessTrack[]> {
  try {
    return (await rpc<any[]>('admin_list_song_guess_tracks')) || [];
  } catch {
    return [];
  }
}

export async function adminDeleteSongGuessTrack(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    return await rpc('admin_delete_song_guess_track', { p_id: id });
  } catch (err) {
    return failWith(err, 'Could not delete that song.');
  }
}

// The DIY whiteboard is purely ephemeral (broadcast, never stored) — a fresh join just sees a blank
// board, same as walking up to a real whiteboard mid-meeting.
// One channel instance handles both directions: a broadcast message sent on a channel that was never
// itself subscribed/joined can be silently dropped by Realtime, which is exactly what made strokes
// visible to the person drawing (drawn locally, synchronously) but invisible to everyone else.
// Opening the whiteboard broadcasts to everyone in the room so it appears full-screen for all of
// them, not just the person who clicked it — mirrors the screen-share full-screen/query pattern
// below. A fresh joiner sends 'query' once on connecting; whoever already has it open answers with
// their own 'toggle' broadcast so late joiners see it without polling.
export function connectLiveLoungeWhiteboard(
  roomId: string,
  onDraw: (payload: any) => void,
  onToggle: (open: boolean) => void,
  onQuery: () => void
): { send: (payload: any) => void; toggle: (open: boolean) => void; query: () => void; disconnect: () => void } {
  const channel = supabase
    .channel(`lounge-whiteboard-${roomId}`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'draw' }, ({ payload }) => onDraw(payload))
    .on('broadcast', { event: 'toggle' }, ({ payload }) => onToggle(!!payload?.open))
    .on('broadcast', { event: 'query' }, () => onQuery())
    .subscribe();
  return {
    send: (payload: any) => { void channel.send({ type: 'broadcast', event: 'draw', payload }); },
    toggle: (open: boolean) => { void channel.send({ type: 'broadcast', event: 'toggle', payload: { open } }); },
    query: () => { void channel.send({ type: 'broadcast', event: 'query', payload: {} }); },
    disconnect: () => { supabase.removeChannel(channel); }
  };
}

// Lets everyone's screen auto-switch to full-screen the moment anyone starts sharing theirs — Agora
// itself has no "this track is a screen share" flag a remote viewer can read, so this is announced
// explicitly. A fresh joiner sends 'query' once on connecting and the current sharer (if any) answers
// with their own 'share' broadcast, so late joiners still see it full-screen without polling.
// Two lightweight, ephemeral host/participant signals sharing one channel: the host muting someone
// (or everyone) and a participant raising their hand. Neither is persisted — same trust model as the
// whiteboard/screen-share broadcasts above (no server-side enforcement; the mute button is only
// exposed to the host in the UI, not blocked at the channel level).
export function connectLiveLoungeControls(
  roomId: string,
  onMute: (payload: { targetUid: number | 'all' }) => void,
  onHand: (payload: { uid: number; raised: boolean }) => void
): { mute: (targetUid: number | 'all') => void; hand: (uid: number, raised: boolean) => void; disconnect: () => void } {
  const channel = supabase
    .channel(`lounge-controls-${roomId}`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'mute' }, ({ payload }) => onMute(payload))
    .on('broadcast', { event: 'hand' }, ({ payload }) => onHand(payload))
    .subscribe();
  return {
    mute: (targetUid) => { void channel.send({ type: 'broadcast', event: 'mute', payload: { targetUid } }); },
    hand: (uid, raised) => { void channel.send({ type: 'broadcast', event: 'hand', payload: { uid, raised } }); },
    disconnect: () => { supabase.removeChannel(channel); }
  };
}

export function connectLiveLoungeScreenShare(
  roomId: string,
  onShare: (payload: { uid: number; sharing: boolean }) => void,
  onQuery: () => void
): { send: (payload: { uid: number; sharing: boolean }) => void; query: () => void; disconnect: () => void } {
  const channel = supabase
    .channel(`lounge-screenshare-${roomId}`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'share' }, ({ payload }) => onShare(payload))
    .on('broadcast', { event: 'query' }, () => onQuery())
    .subscribe();
  return {
    send: (payload) => { void channel.send({ type: 'broadcast', event: 'share', payload }); },
    query: () => { void channel.send({ type: 'broadcast', event: 'query', payload: {} }); },
    disconnect: () => { supabase.removeChannel(channel); }
  };
}
