import { useSyncExternalStore } from 'react';
import { supabase, resolveMedia } from './supabase';

// "Settings and activity" - the choices that belong to the ACCOUNT (so they follow the person to every device, and the server enforces them): who may comment or message,
// which notifications are sent, who is muted, restricted or a favourite... The choices of one device (text size, data saver...) are in utils/devicePrefs.ts.
//
// The server holds the real list of settings, their allowed values and their defaults (settings_defaults / settings_enums); this file mirrors the defaults so a page can
// draw before the answer arrives. A change is shown at once and sent to the server; if the server refuses, the page goes back to what the server says.

export interface QuietHours { on: boolean; from: string; to: string; tz: number }

export interface AccountSettings {
  'notif.pauseUntil': string | null;
  'notif.likes': boolean;
  'notif.comments': boolean;
  'notif.follows': boolean;
  'notif.messages': boolean;
  'notif.mentions': boolean;
  'notif.live': boolean;
  'notif.games': boolean;
  'notif.points': boolean;
  'notif.suggestions': boolean;
  'notif.birthdays': boolean;
  'notif.quiet': QuietHours;
  'msg.who': 'connected' | 'following' | 'nobody';
  'msg.storyReplies': 'everyone' | 'following' | 'off';
  'msg.readReceipts': boolean;
  'activity.status': boolean;
  'tags.who': 'everyone' | 'following' | 'nobody';
  'mentions.who': 'everyone' | 'following' | 'nobody';
  'comments.who': 'everyone' | 'followers' | 'following' | 'both' | 'off';
  'comments.hideOffensive': boolean;
  'share.toMessages': boolean;
  'limit.until': string | null;
  'limit.audience': 'non_followers' | 'recent_followers';
  'likes.hideOthers': boolean;
  'likes.hideMine': boolean;
  // Chats (see supabase/migrations/20261018000005_chat_settings_last_seen.sql)
  'chat.lastSeen': 'everyone' | 'contacts' | 'nobody';
  'chat.groupAdds': 'everyone' | 'contacts' | 'nobody';
  'chat.typing': boolean;
  'chat.fontSize': 'small' | 'medium' | 'large';
  'chat.wallpaper': 'doodle' | 'plain' | 'dark';
  'chat.timeFormat': '12h' | '24h';
  'chat.compactList': boolean;
  'chat.previewInList': boolean;
  'chat.listAvatars': boolean;
  'chat.pinnedOnTop': boolean;
  'chat.unreadBadges': boolean;
  'chat.sounds': boolean;
  'chat.vibrate': boolean;
  'chat.autoLoad': 'always' | 'wifi' | 'never';
  'chat.confirmDelete': boolean;
  'chat.encryptionNotice': boolean;
}

export type SettingKey = keyof AccountSettings;

export const SETTINGS_DEFAULTS: AccountSettings = {
  'notif.pauseUntil': null,
  'notif.likes': true,
  'notif.comments': true,
  'notif.follows': true,
  'notif.messages': true,
  'notif.mentions': true,
  'notif.live': true,
  'notif.games': true,
  'notif.points': true,
  'notif.suggestions': true,
  'notif.birthdays': true,
  'notif.quiet': { on: false, from: '23:00', to: '07:00', tz: 0 },
  'msg.who': 'connected',
  'msg.storyReplies': 'everyone',
  'msg.readReceipts': true,
  'activity.status': true,
  'tags.who': 'everyone',
  'mentions.who': 'everyone',
  'comments.who': 'everyone',
  'comments.hideOffensive': false,
  'share.toMessages': true,
  'limit.until': null,
  'limit.audience': 'non_followers',
  'likes.hideOthers': false,
  'likes.hideMine': false,
  'chat.lastSeen': 'everyone',
  'chat.groupAdds': 'everyone',
  'chat.typing': true,
  'chat.fontSize': 'medium',
  'chat.wallpaper': 'doodle',
  'chat.timeFormat': '12h',
  'chat.compactList': false,
  'chat.previewInList': true,
  'chat.listAvatars': true,
  'chat.pinnedOnTop': true,
  'chat.unreadBadges': true,
  'chat.sounds': true,
  'chat.vibrate': true,
  'chat.autoLoad': 'always',
  'chat.confirmDelete': true,
  'chat.encryptionNotice': true
};

export type ListKind = 'restricted' | 'muted' | 'favourite' | 'comment_block' | 'story_hide';
export const LIST_LIMITS: Record<ListKind, number> = { restricted: 500, muted: 500, favourite: 100, comment_block: 500, story_hide: 500 };

export interface ListedPerson {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  isVerified: boolean;
  /** muted accounts only: what is muted */
  mutePosts?: boolean;
  muteStories?: boolean;
  since?: string;
}

const mapPerson = (p: any): ListedPerson => ({ ...p, avatar: resolveMedia(p.avatar) });

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message || 'Something went wrong.');
  return data as T;
}

const msg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

// ---- the store: one copy of the account's settings for the whole app

let settings: AccountSettings = SETTINGS_DEFAULTS;
let loaded = false;
let loading: Promise<void> | null = null;
let counts: Record<ListKind, number> = { restricted: 0, muted: 0, favourite: 0, comment_block: 0, story_hide: 0 };
const listeners = new Set<() => void>();
let version = 0;
const emit = () => { version++; listeners.forEach((l) => l()); };

const merge = (raw: unknown): AccountSettings => ({ ...SETTINGS_DEFAULTS, ...((raw && typeof raw === 'object' ? raw : {}) as Partial<AccountSettings>) });

/** Loads the account's settings (once; pass force to ask again). Never throws: until the answer comes the defaults are used. */
export function loadSettings(force = false): Promise<void> {
  if (loaded && !force) return Promise.resolve();
  if (loading && !force) return loading;
  loading = (async () => {
    try {
      const res = await call<{ settings: unknown; counts?: Partial<Record<ListKind, number>> }>('my_settings');
      settings = merge(res?.settings);
      counts = { ...counts, ...(res?.counts || {}) };
      loaded = true;
      emit();
    } catch {
      /* not signed in, offline, or the update has not been installed yet: the defaults stay */
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export const getSettings = (): AccountSettings => settings;
export const getListCount = (kind: ListKind): number => counts[kind] || 0;
export const settingsLoaded = (): boolean => loaded;

/** Forgets everything (after logging out or switching account). */
export function resetSettingsStore(): void {
  settings = SETTINGS_DEFAULTS;
  loaded = false;
  loading = null;
  counts = { restricted: 0, muted: 0, favourite: 0, comment_block: 0, story_hide: 0 };
  for (const k of Object.keys(listCache)) delete listCache[k as ListKind];
  emit();
}

const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

export function useAccountSettings(): AccountSettings {
  useSyncExternalStore(subscribe, () => version, () => 0);
  return settings;
}

/** One setting, for the places that draw a lot (the feed, the app shell): they redraw only when this value changes, not when any setting does. */
export function useSetting<K extends SettingKey>(key: K): AccountSettings[K] {
  return useSyncExternalStore(subscribe, () => settings[key], () => SETTINGS_DEFAULTS[key]);
}

/** Changes one or more settings: shown at once, sent to the server, and put back as the server says if it refuses. */
export async function updateSettings(patch: Partial<AccountSettings>): Promise<{ success: boolean; error?: string }> {
  const before = settings;
  settings = { ...settings, ...patch };
  emit();
  try {
    const res = await call<{ settings: unknown }>('set_my_settings', { p: patch });
    settings = merge(res?.settings);
    emit();
    return { success: true };
  } catch (e) {
    settings = before;
    emit();
    return { success: false, error: msg(e, 'Could not save that setting.') };
  }
}

// ---- lists of people (restricted, muted, favourites, blocked commenters, hidden from your story)

// the last list read from the server, per kind: a page shows it at once and refreshes it in the background
const listCache: Partial<Record<ListKind, ListedPerson[]>> = {};
export const getCachedList = (kind: ListKind): ListedPerson[] | null => listCache[kind] ?? null;

export async function fetchList(kind: ListKind): Promise<ListedPerson[]> {
  try {
    const rows = await call<any[]>('settings_list', { p_kind: kind });
    const list = (rows || []).map(mapPerson);
    listCache[kind] = list;
    counts = { ...counts, [kind]: list.length };
    emit();
    return list;
  } catch {
    return listCache[kind] ?? [];
  }
}

/** Reads the lists the pages show into memory ahead of time (quietly), so opening one of those pages does not wait for the server. */
export function warmLists(): void {
  (['restricted', 'comment_block', 'story_hide'] as ListKind[]).forEach((k) => { if (!listCache[k]) void fetchList(k); });
}

export async function addToList(kind: ListKind, userId: string, extra?: { posts?: boolean; stories?: boolean }): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await call<{ count?: number }>('settings_list_add', { p_kind: kind, p_user: userId, p_extra: extra || {} });
    if (typeof res?.count === 'number') { counts = { ...counts, [kind]: res.count }; emit(); }
    delete listCache[kind];
    return { success: true };
  } catch (e) {
    return { success: false, error: msg(e, 'Could not add that person.') };
  }
}

export async function removeFromList(kind: ListKind, userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await call<{ count?: number }>('settings_list_remove', { p_kind: kind, p_user: userId });
    if (typeof res?.count === 'number') { counts = { ...counts, [kind]: res.count }; emit(); }
    if (listCache[kind]) listCache[kind] = listCache[kind]!.filter((p) => p.id !== userId);
    return { success: true };
  } catch (e) {
    return { success: false, error: msg(e, 'Could not remove that person.') };
  }
}

/** Changes what is muted for someone who is already muted. */
export async function updateMute(userId: string, extra: { posts?: boolean; stories?: boolean }): Promise<{ success: boolean; error?: string }> {
  return addToList('muted', userId, extra);
}

// ---- the lists the rest of the app reads while it draws (feed, story tray, comments)

let mutedPosts = new Set<string>();
let mutedStories = new Set<string>();
let favouriteIds = new Set<string>();
const subs = new Set<() => void>();
let listsVersion = 0;
const emitLists = () => { listsVersion++; subs.forEach((l) => l()); };

/** Reads muted accounts and favourites into memory, for filtering the feed and the story tray. Quiet on failure. */
export async function loadFeedLists(): Promise<void> {
  const [muted, favs] = await Promise.all([fetchList('muted'), fetchList('favourite')]);
  mutedPosts = new Set(muted.filter((m) => m.mutePosts !== false).map((m) => m.id));
  mutedStories = new Set(muted.filter((m) => m.muteStories !== false).map((m) => m.id));
  favouriteIds = new Set(favs.map((f) => f.id));
  emitLists();
}

export const isPostMuted = (userId: string): boolean => mutedPosts.has(userId);
export const isStoryMuted = (userId: string): boolean => mutedStories.has(userId);
export const isFavourite = (userId: string): boolean => favouriteIds.has(userId);
export const favouriteCount = (): number => favouriteIds.size;

export function useFeedLists(): number {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => listsVersion, () => 0);
}

/** After a change in a page: refresh what the feed filters on. */
export const refreshFeedLists = (): Promise<void> => loadFeedLists();

export function resetFeedLists(): void {
  mutedPosts = new Set(); mutedStories = new Set(); favouriteIds = new Set();
  emitLists();
}

// ---- small things that are asked of the server on demand

export async function fetchAccountStatus(): Promise<{ standing: 'good' | 'suspended'; reason?: string; reportsAgainstHandled: number; memberSince?: string; lastLogin?: string }> {
  try {
    return await call('my_account_status');
  } catch {
    return { standing: 'good', reportsAgainstHandled: 0 };
  }
}

export interface MyComment { id: string; kind: 'post' | 'reel' | 'video'; targetId: string; text: string; createdAt: string; targetPreview?: string }
export async function fetchMyComments(): Promise<MyComment[]> {
  try { return (await call<MyComment[]>('my_comments')) || []; } catch { return []; }
}

export interface ArchivedStory { id: string; mediaUrl: string; mediaType: 'image' | 'video'; createdAt: string; viewsCount: number }
export async function fetchStoriesArchive(): Promise<ArchivedStory[]> {
  try {
    const rows = await call<any[]>('my_stories_archive');
    return (rows || []).map((s) => ({ ...s, mediaUrl: resolveMedia(s.mediaUrl) }));
  } catch { return []; }
}

/** Is the like count of this post / reel to be left out for me? Yes if its owner hid it, or if I chose to hide the counts on other people's posts. */
export const likeCountHiddenFor = (ownerHid: boolean | undefined, ownerId: string | undefined, myId: string | undefined, hideOthers: boolean): boolean =>
  !!ownerHid || (hideOthers && !!ownerId && ownerId !== myId);
