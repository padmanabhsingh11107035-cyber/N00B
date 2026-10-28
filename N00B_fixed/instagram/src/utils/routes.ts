// The addresses of the NOOB website, so a page can be copied, shared, refreshed and gone back to (like chatgpt.com/c/<id>): every page of the app has a path, a post / reel / video /
// profile has its own, and anything that is not one of them is a "page not found". Pure rules only (no React) so they can be tested on their own.
import type { NavTab } from '../components/Navigation/FloatingNavBar';

import { siteOrigin } from './siteUrl.ts';
/** The path each bottom-bar page shows in the address bar. */
export const TAB_PATHS: Record<NavTab, string> = {
  feed: '/',
  explore: '/explore',
  post: '/create',
  reels: '/reels',
  chat: '/chat',
  games: '/games',
  music: '/music',
  profile: '/me',
  videos: '/videos'
};

const TAB_BY_PATH = new Map<string, NavTab>((Object.entries(TAB_PATHS) as Array<[NavTab, string]>).map(([tab, path]) => [path, tab]));
// older / alternative spellings people may have typed or been given
TAB_BY_PATH.set('/home', 'feed');
TAB_BY_PATH.set('/feed', 'feed');
TAB_BY_PATH.set('/profile', 'profile');
TAB_BY_PATH.set('/profile/me', 'profile');
TAB_BY_PATH.set('/chats', 'chat');
TAB_BY_PATH.set('/messages', 'chat');
TAB_BY_PATH.set('/post', 'post');

/** "/Explore/" -> "/explore" ; "" -> "/" */
export function cleanPath(path: string): string {
  const p = (path || '/').split(/[?#]/)[0].replace(/\/{2,}/g, '/').replace(/\/+$/, '').toLowerCase();
  return p === '' ? '/' : p;
}

export function tabFromPath(path: string): NavTab | null {
  return TAB_BY_PATH.get(cleanPath(path)) || null;
}

export type ContentKind = 'post' | 'reel' | 'video' | 'profile';
export interface ContentRoute { kind: ContentKind; id: string }

const PREFIX: Record<ContentKind, string> = { post: '/p/', reel: '/reel/', video: '/v/', profile: '/u/' };
const ID = /^[A-Za-z0-9_-]{3,80}$/;
const USERNAME = /^[A-Za-z0-9._]{1,40}$/;

/** The address of one post / reel / video / profile. */
export const contentPath = (kind: ContentKind, id: string): string => `${PREFIX[kind]}${encodeURIComponent(id)}`;

/** "/reel/abc" -> { kind: 'reel', id: 'abc' }; null when the path is not one of these. (Ids are case-sensitive, so the path is not lower-cased.) */
export function parseContentPath(path: string): ContentRoute | null {
  const clean = (path || '').split(/[?#]/)[0].replace(/\/+$/, '');
  const m = clean.match(/^\/(p|post|reel|reels|v|video|videos|u|user|@)\/([^/]+)$/i);
  if (!m) return null;
  let id = m[2];
  try { id = decodeURIComponent(id); } catch { return null; }
  const head = m[1].toLowerCase();
  const kind: ContentKind = head === 'p' || head === 'post' ? 'post' : head === 'reel' || head === 'reels' ? 'reel' : head === 'v' || head === 'video' || head === 'videos' ? 'video' : 'profile';
  if (kind === 'profile') { id = id.replace(/^@/, ''); return USERNAME.test(id) ? { kind, id } : null; }
  return ID.test(id) ? { kind, id } : null;
}

/** "https://noobsocials.com/reel/abc": always NOOB's own address (never the phone's internal one inside the Android app, never the old address) */
export const contentUrl = (kind: ContentKind, id: string, origin = siteOrigin()): string => origin + contentPath(kind, id);

/** The old links that carry the thing as "?reel=<id>" (still opened, so links that were already shared keep working). */
export function parseContentQuery(search: string): ContentRoute | null {
  const q = new URLSearchParams(search || '');
  for (const [key, kind] of [['post', 'post'], ['reel', 'reel'], ['video', 'video'], ['profile', 'profile']] as Array<[string, ContentKind]>) {
    const v = q.get(key);
    if (v) return { kind, id: v };
  }
  return null;
}

// Pages that are their own files on the website (not part of the app): they are served by the host, never by the app.
export const STATIC_PAGES = ['/about', '/screenshots', '/privacy', '/terms', '/data-deletion', '/offline', '/app-down', '/404'];

// Feature pages (one for each thing NOOB does): a search engine can list them, and anyone who opens one without an account is asked to log in first, then lands on the real page.
export interface FeaturePage { slug: string; title: string; description: string; tab?: NavTab; path: string }
export const FEATURE_PAGES: FeaturePage[] = [
  { slug: 'reels', title: 'NOOB Reels', description: 'Short videos from people you follow and from all of NOOB, with likes, comments and sharing.', tab: 'reels', path: '/reels' },
  { slug: 'videos', title: 'NOOB Videos', description: 'Long videos in portrait or landscape, with quality choices, suggestions and a watch history.', tab: 'videos', path: '/videos' },
  { slug: 'chat', title: 'NOOB Chat', description: 'Private and group chats with voice messages, photos, videos, reactions and calls.', tab: 'chat', path: '/chat' },
  { slug: 'explore', title: 'NOOB Explore', description: 'Find people, posts and communities across NOOB.', tab: 'explore', path: '/explore' },
  { slug: 'games', title: 'NOOB Games', description: 'Mini games to play alone or against friends, with a leaderboard.', tab: 'games', path: '/games' },
  { slug: 'music', title: 'NOOB Music', description: 'Listen to songs and share them on your posts and stories.', tab: 'music', path: '/music' },
  { slug: 'stories', title: 'NOOB Stories', description: 'Share a moment for 24 hours with pictures, videos, songs and polls.', tab: 'feed', path: '/' },
  { slug: 'points', title: 'NOOB Points', description: 'Earn points for posting and commenting, and use them for NOOB Pro.', tab: 'profile', path: '/me' }
];

/** Every address that opens something real. Anything else is "page not found". */
export function isKnownPath(path: string, extra: ReadonlyArray<(clean: string) => boolean> = []): boolean {
  const clean = cleanPath(path);
  if (tabFromPath(clean)) return true;
  if (parseContentPath(path)) return true;
  if (STATIC_PAGES.includes(clean)) return true;
  if (clean === '/studio' || clean === '/login-approval' || clean === '/anonymous' || clean === '/login' || clean === '/signup' || clean === '/join' || clean === '/index.html') return true;
  if (FEATURE_PAGES.some((f) => clean === `/features/${f.slug}`) || clean === '/features') return true;
  return extra.some((fn) => fn(clean));
}

/** Where to go after logging in: only addresses of this site are ever followed (never another website). */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || typeof next !== 'string') return null;
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\') || /[\u0000-\u001f]/.test(next)) return null;
  return next.slice(0, 300);
}
