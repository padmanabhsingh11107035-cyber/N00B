// The "Share" sheet of a post, reel or video (like Instagram's): friends to send it to, and the other apps. Pure rules, tested on their own (scripts/supabase/test-share-sheet.mjs).
import type { ChatConversation, User } from '../types';

export interface ShareContent { url: string; text: string }
const enc = encodeURIComponent;

export const whatsappLink = ({ url, text }: ShareContent) => `https://wa.me/?text=${enc(`${text} ${url}`.trim())}`;
export const telegramLink = ({ url, text }: ShareContent) => `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`;
export const xLink = ({ url, text }: ShareContent) => `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`;
export const facebookLink = ({ url }: ShareContent) => `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`;
export const smsLink = ({ url, text }: ShareContent) => `sms:?&body=${enc(`${text} ${url}`.trim())}`;
export const emailLink = ({ url, text }: ShareContent) => `mailto:?subject=${enc(text)}&body=${enc(`${text}\n${url}`)}`;

export type ShareApp = 'whatsapp' | 'instagram' | 'x' | 'facebook' | 'telegram' | 'messages' | 'email';
export const SHARE_APPS: Array<{ id: ShareApp; label: string }> = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'x', label: 'X' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'messages', label: 'Messages' },
  { id: 'email', label: 'Email' }
];

/** The link a "share to app" button opens; null for Instagram, which has no link for sharing (it goes through the phone's own share sheet, see ShareSheet). */
export function appLink(app: ShareApp, content: ShareContent): string | null {
  switch (app) {
    case 'whatsapp': return whatsappLink(content);
    case 'x': return xLink(content);
    case 'facebook': return facebookLink(content);
    case 'telegram': return telegramLink(content);
    case 'messages': return smsLink(content);
    case 'email': return emailLink(content);
    default: return null;
  }
}

export interface Friend { chatId: string; user: User; lastAt: number }

/** The people there is a direct chat with, the one talked to most recently first. Groups, the AI and the Global chat are not people. */
export function friendsFromChats(chats: ChatConversation[], myId: string): Friend[] {
  const out: Friend[] = [];
  const seen = new Set<string>();
  for (const c of chats) {
    if (!c || c.isGroup || c.isAi || c.isGlobalDefault) continue;
    const user = (c.participants || []).find((p) => p.id !== myId);
    if (!user || seen.has(user.id)) continue;
    seen.add(user.id);
    const at = c.lastMessage?.createdAt ? Date.parse(c.lastMessage.createdAt) : 0;
    out.push({ chatId: c.id, user, lastAt: Number.isFinite(at) ? at : 0 });
  }
  return out.sort((a, b) => b.lastAt - a.lastAt);
}

/** Search by name or username (letters in any case, a leading @ ignored). */
export function filterFriends(friends: Friend[], query: string): Friend[] {
  const q = (query || '').trim().toLowerCase().replace(/^@/, '');
  if (!q) return friends;
  return friends.filter((f) => `${f.user.displayName || ''} ${f.user.username || ''}`.toLowerCase().includes(q));
}

export const MAX_FRIENDS_AT_ONCE = 5;

/** Picks or unpicks one friend (up to MAX_FRIENDS_AT_ONCE at a time). */
export function toggleFriend(selected: ReadonlySet<string>, chatId: string): Set<string> {
  const next = new Set(selected);
  if (next.has(chatId)) next.delete(chatId);
  else if (next.size < MAX_FRIENDS_AT_ONCE) next.add(chatId);
  return next;
}

/** The first few friends, for the row of faces at the top of Reels. */
export const topFriends = (friends: Friend[], n = 4): Friend[] => friends.slice(0, Math.max(0, n));

export const shareText = (type: 'post' | 'reel' | 'video', ownerUsername?: string): string =>
  ownerUsername ? `Watch ${type === 'post' ? 'this post' : type === 'reel' ? 'this reel' : 'this video'} by @${ownerUsername} on NOOB` : `Have a look at this ${type} on NOOB`;
