import {
  Activity, AtSign, Archive, Ban, BarChart3, Bell, Bookmark, BadgeCheck, Briefcase, Calculator, Clock, Crown, Download, Eye, EyeOff, Globe, HeartOff,
  Hourglass, Image as ImageIcon, Info, Languages, LifeBuoy, Link2, Lock, LogOut, MessageCircle, MessageSquare, Package, Repeat2, ScanLine, ShieldCheck, ShieldAlert,
  RefreshCw, SlidersHorizontal, Smartphone, Sparkles, Star, UserCheck, UserCog, UserPlus, UserX, Video, Wallet, Accessibility, Share2, Users, VolumeX, Receipt, AudioLines
} from 'lucide-react';
import type React from 'react';
import type { SettingsActions, SettingsContext } from './types';
import { getListCount } from '../../services/settingsApi';

// What "Settings and activity" lists, section by section. A row either opens one of our own pages (`page`) or asks the profile page to do something (`action`: open one of
// the windows that already existed). The hub shows only the rows whose page really exists (pages/index.ts), and the search looks through label, text and keywords.

type Icon = React.ComponentType<{ className?: string }>;

export interface RowDef {
  id: string;
  section: string;
  label: string;
  sub?: string;
  icon: Icon;
  keywords?: string;
  page?: string;
  action?: keyof SettingsActions;
  danger?: boolean;
  /** a row that is a switch of its own instead of opening a page (the hub draws it) */
  toggle?: 'login-approval';
  show?: (ctx: SettingsContext) => boolean;
  value?: (ctx: SettingsContext) => string | undefined;
}

export const SECTIONS = [
  'Quick tools',
  'Your account', 'How you use NOOB', 'Your insights and tools', 'Subscriptions', 'Who can see your content', 'How others can interact with you', 'What you see',
  'Your app and media', 'Your orders and payments', 'More info and support', 'More from NOOB', 'Login'
] as const;

const countText = (kind: Parameters<typeof getListCount>[0]): string | undefined => { const n = getListCount(kind); return n > 0 ? String(n) : undefined; };
const tierName = (t?: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : undefined);

export const ROWS: RowDef[] = [
  // ---------------------------------------------------------------- Your account
  { id: 'account', section: 'Your account', label: 'Your NOOB account', sub: 'Personal details, password and security, ownership and control', icon: UserCog, page: 'account', keywords: 'profile name email phone password security delete download data verified username' },

  // ---------------------------------------------------------------- How you use NOOB
  { id: 'saved', section: 'How you use NOOB', label: 'Saved', icon: Bookmark, action: 'showProfileTab', keywords: 'bookmarks collections saved posts' },
  { id: 'archive', section: 'How you use NOOB', label: 'Archive', icon: Archive, page: 'archive', keywords: 'archived posts stories old' },
  { id: 'activity', section: 'How you use NOOB', label: 'Your activity', icon: Activity, page: 'activity', keywords: 'likes comments time spent history interactions' },
  { id: 'notifications', section: 'How you use NOOB', label: 'Notifications', icon: Bell, page: 'notifications', keywords: 'push alerts pause quiet mute likes comments follows messages' },
  { id: 'time', section: 'How you use NOOB', label: 'Time management', icon: Clock, page: 'time', keywords: 'daily limit sleep mode reminder screen time minutes' },

  // ---------------------------------------------------------------- Your insights and tools
  { id: 'dashboard', section: 'Your insights and tools', label: 'Professional dashboard', icon: BarChart3, action: 'openProfessionalDashboard', keywords: 'insights business analytics creator', show: (c) => c.currentUser.accountType === 'business' || !!c.currentUser.isBusiness },
  { id: 'account-type', section: 'Your insights and tools', label: 'Account type and tools', icon: Briefcase, page: 'account-type', keywords: 'business creator personal professional category', value: (c) => (c.currentUser.accountType === 'business' || c.currentUser.isBusiness ? 'Business' : 'Personal') },

  // ---------------------------------------------------------------- Subscriptions
  { id: 'subscription-history', section: 'Subscriptions', label: 'Subscription history', sub: 'Your plan, when it ends, what renewing costs, and every plan you had', icon: Receipt, page: 'subscription-history', keywords: 'pro plan purchase renew billing ends receipts history' },
  { id: 'pro', section: 'Subscriptions', label: 'NOOB Pro', icon: Crown, action: 'openPro', keywords: 'subscription premium plan upgrade', value: (c) => tierName(c.currentUser.proTier) || 'Not subscribed' },

  // ---------------------------------------------------------------- Who can see your content
  { id: 'privacy', section: 'Who can see your content', label: 'Account privacy', icon: Lock, page: 'privacy', keywords: 'private public follow requests approve hide profile', value: (c) => (c.currentUser.accountType === 'private' ? 'Private' : 'Public') },
  { id: 'close-friends', section: 'Who can see your content', label: 'Close Friends', icon: Star, page: 'close-friends', keywords: 'close friends list stories green' },
  { id: 'linked', section: 'Who can see your content', label: 'Linked profiles', sub: 'Instagram, YouTube and other links on your profile', icon: Link2, action: 'editProfile', keywords: 'crossposting social links instagram youtube twitter discord github spotify tiktok' },
  { id: 'blocked', section: 'Who can see your content', label: 'Blocked', icon: Ban, page: 'blocked', keywords: 'block unblock accounts', value: (c) => String((c.currentUser.blockedUserIds || []).length) },
  { id: 'story-privacy', section: 'Who can see your content', label: 'Story privacy', icon: EyeOff, page: 'story-privacy', keywords: 'hide story from replies close friends' },
  { id: 'activity-status', section: 'Who can see your content', label: 'Activity status', icon: Eye, page: 'activity-status', keywords: 'online active now last seen presence' },

  // ---------------------------------------------------------------- How others can interact with you
  { id: 'chats', section: 'How others can interact with you', label: 'Chats', sub: 'Last seen, privacy, text size, background, sounds and more', icon: MessageSquare, page: 'chats', keywords: 'chat last seen online typing read receipts groups add font text size wallpaper background sounds vibrate media download compact pinned preview time 24 hour' },
  { id: 'messages', section: 'How others can interact with you', label: 'Messages and story replies', icon: MessageCircle, page: 'messages', keywords: 'dm chat who can message read receipts seen replies' },
  { id: 'tags', section: 'How others can interact with you', label: 'Tags and mentions', icon: AtSign, page: 'tags', keywords: 'tag mention collaborator @' },
  { id: 'comments', section: 'How others can interact with you', label: 'Comments', icon: MessageSquare, page: 'comments', keywords: 'who can comment block commenters offensive filter' },
  { id: 'sharing', section: 'How others can interact with you', label: 'Sharing and reuse', icon: Repeat2, page: 'sharing', keywords: 'share messages send posts' },
  { id: 'restricted', section: 'How others can interact with you', label: 'Restricted', icon: UserX, page: 'restricted', keywords: 'restrict accounts bullying hide comments', value: () => countText('restricted') },
  { id: 'limit', section: 'How others can interact with you', label: 'Limit interactions', icon: Hourglass, page: 'limit', keywords: 'temporarily limit comments messages spam raid' },
  { id: 'hidden-words', section: 'How others can interact with you', label: 'Hidden words', icon: EyeOff, page: 'hidden-words', keywords: 'filter words offensive custom block comments' },
  { id: 'invite', section: 'How others can interact with you', label: 'Follow and invite friends', icon: UserPlus, page: 'invite', keywords: 'invite link share qr contacts find friends suggested follow' },

  // ---------------------------------------------------------------- What you see
  { id: 'favourites', section: 'What you see', label: 'Favourites', icon: Star, page: 'favourites', keywords: 'favorites see more posts feed', value: () => countText('favourite') },
  { id: 'muted', section: 'What you see', label: 'Muted accounts', icon: VolumeX, page: 'muted', keywords: 'mute posts stories hide from feed', value: () => countText('muted') },
  { id: 'content', section: 'What you see', label: 'Content preferences', icon: SlidersHorizontal, page: 'content', keywords: 'suggested accounts translate feed recommendations' },
  { id: 'like-counts', section: 'What you see', label: 'Like and share counts', icon: HeartOff, page: 'like-counts', keywords: 'hide likes counts numbers' },

  // ---------------------------------------------------------------- Your app and media
  { id: 'device-permissions', section: 'Your app and media', label: 'Device permissions', icon: Smartphone, page: 'device-permissions', keywords: 'camera microphone location notifications contacts allow' },
  { id: 'archiving', section: 'Your app and media', label: 'Archiving and downloading', icon: Download, page: 'archiving', keywords: 'save download export data stories archive' },
  { id: 'accessibility', section: 'Your app and media', label: 'Accessibility', icon: Accessibility, page: 'accessibility', keywords: 'text size bold contrast motion dark light theme appearance' },
  { id: 'language', section: 'Your app and media', label: 'Language and translations', icon: Languages, page: 'language', keywords: 'language translate translator hindi gujarati english' },
  { id: 'media-quality', section: 'Your app and media', label: 'Media quality', icon: ImageIcon, page: 'media-quality', keywords: 'data saver upload quality autoplay video wifi' },
  { id: 'app-websites', section: 'Your app and media', label: 'App and website permissions', icon: Globe, page: 'app-websites', keywords: 'links browser cache clear storage cookies' },

  // ---------------------------------------------------------------- Your orders and payments
  { id: 'orders', section: 'Your orders and payments', label: 'Orders and payments', icon: Package, page: 'orders', keywords: 'shop orders wallet payment requests coupons points' },

  // ---------------------------------------------------------------- More info and support
  { id: 'update', section: 'More info and support', label: 'Update NOOB', sub: 'Get the newest version', icon: RefreshCw, page: 'update', keywords: 'update upgrade new version latest refresh reload download apk android app install' },
  { id: 'help', section: 'More info and support', label: 'Help', icon: LifeBuoy, page: 'help', keywords: 'support faq questions contact report problem' },
  { id: 'assistant', section: 'More info and support', label: 'NOOB support assistant', sub: 'Ask the AI helper', icon: Sparkles, action: 'openSupport', keywords: 'ai support chat bot help' },
  { id: 'privacy-centre', section: 'More info and support', label: 'Privacy Centre', icon: ShieldCheck, page: 'privacy-centre', keywords: 'privacy policy terms encryption data checkup' },
  { id: 'account-status', section: 'More info and support', label: 'Account Status', icon: UserCheck, page: 'account-status', keywords: 'standing violations suspended reports' },
  { id: 'about', section: 'More info and support', label: 'About', icon: Info, page: 'about', keywords: 'version terms privacy team students noobsocials' },

  // ---------------------------------------------------------------- More from NOOB (what this app has that Instagram does not)
  { id: 'search-song', section: 'Quick tools', label: 'Search song', sub: 'Play a song on another device and find its name', icon: AudioLines, page: 'search-song', keywords: 'shazam song music identify listen tune name find' },
  { id: 'wallet', section: 'More from NOOB', label: 'Wallet', sub: 'NOOB Points and transactions', icon: Wallet, action: 'openWallet', keywords: 'points money transactions balance' },
  { id: 'qr', section: 'More from NOOB', label: 'Profile finder using QR', icon: ScanLine, action: 'openQrScanner', keywords: 'scan qr code profile' },
  { id: 'my-qr', section: 'More from NOOB', label: 'My QR code', icon: ScanLine, action: 'openProfileQr', keywords: 'share profile qr' },
  { id: 'live-avatar', section: 'More from NOOB', label: 'Live profile picture', sub: 'A moving picture (NOOB Pro)', icon: Video, action: 'openLiveAvatar', keywords: 'animated avatar video gif' },
  { id: 'verified', section: 'More from NOOB', label: 'Get verified', icon: BadgeCheck, action: 'openGetVerified', keywords: 'verification badge blue tick' },
  { id: 'calculator', section: 'More from NOOB', label: 'Calculator', icon: Calculator, action: 'openCalculator', keywords: 'math' },
  { id: 'follow-us', section: 'More from NOOB', label: 'Follow us on', icon: Share2, action: 'openFollowUs', keywords: 'instagram youtube social official' },
  { id: 'admin', section: 'More from NOOB', label: 'Admin Control Panel', icon: ShieldAlert, action: 'openAdmin', keywords: 'admin staff moderation', show: (c) => c.isStaff },

  // ---------------------------------------------------------------- Login
  { id: 'add-profile', section: 'Login', label: 'Add profile', sub: 'Use another NOOB account on this device', icon: Users, action: 'openSwitchAccount', keywords: 'switch account add another login' },
  { id: 'login-approval', section: 'Login', label: 'Login approval by email', sub: 'After your password, an email asks “Is this you?” with two buttons', icon: ShieldCheck, toggle: 'login-approval', keywords: '2fa two factor two-factor two step 2 step login approval email confirm verify security protect hacked password it is me not me' },
  { id: 'logout', section: 'Login', label: 'Log out', icon: LogOut, action: 'logout', danger: true, keywords: 'sign out', show: (c) => c.canLogout }
];

export function rowText(r: RowDef): string {
  return `${r.label} ${r.sub || ''} ${r.keywords || ''}`.toLowerCase();
}

/** The rows that match what was typed in the search box (every word must be found). */
export function searchRows(rows: RowDef[], query: string): RowDef[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return rows;
  return rows.filter((r) => { const t = rowText(r); return words.every((w) => t.includes(w)); });
}
