import React, { lazy } from 'react';
import type { PageComponent, PageProps } from '../types';

// Every page of "Settings and activity", by name. A page is loaded the first time it is opened, so opening the hub itself stays light.
// The hub shows a row only when its page is in this list (registry.ts), and `go('name')` ignores names that are not here.

type Loader = () => Promise<{ default: PageComponent }>;
const page = (load: Loader) => lazy(load);

const list = (kind: 'restricted' | 'comment_block' | 'story_hide' | 'favourite', text: { title: string; note: string; emptyTitle: string; emptyText: string; addLabel: string; removeLabel: string; max?: number }): Loader =>
  async () => {
    const { ListPage } = await import('./account');
    const Wrapped: React.FC<PageProps> = (props) => <ListPage {...props} kind={kind} {...text} />;
    return { default: Wrapped };
  };

export const PAGES: Record<string, React.LazyExoticComponent<PageComponent>> = {
  // your account
  account: page(() => import('./account').then((m) => ({ default: m.AccountPage }))),
  password: page(() => import('./account').then((m) => ({ default: m.PasswordPage }))),
  'account-type': page(() => import('./account').then((m) => ({ default: m.AccountTypePage }))),
  // how you use NOOB
  archive: page(() => import('./activity').then((m) => ({ default: m.ArchivePage }))),
  'stories-archive': page(() => import('./activity').then((m) => ({ default: m.StoriesArchivePage }))),
  'instants-archive': page(() => import('./activity').then((m) => ({ default: m.InstantsArchivePage }))),
  activity: page(() => import('./activity').then((m) => ({ default: m.ActivityPage }))),
  'activity-comments': page(() => import('./activity').then((m) => ({ default: m.MyCommentsPage }))),
  time: page(() => import('./activity').then((m) => ({ default: m.TimePage }))),
  notifications: page(() => import('./interact').then((m) => ({ default: m.NotificationsPage }))),
  // who can see your content
  privacy: page(() => import('./account').then((m) => ({ default: m.PrivacyPage }))),
  'close-friends': page(() => import('./account').then((m) => ({ default: m.CloseFriendsPage }))),
  blocked: page(() => import('./account').then((m) => ({ default: m.BlockedPage }))),
  'story-privacy': page(() => import('./account').then((m) => ({ default: m.StoryPrivacyPage }))),
  'story-hide': page(list('story_hide', {
    title: 'Hide story from', note: 'People on this list do not see your stories. They are not told, and they can still see your profile and posts.',
    emptyTitle: 'Nobody is hidden', emptyText: 'Search for someone above to hide your story from them.', addLabel: 'Hide', removeLabel: 'Show again', max: 500
  })),
  'activity-status': page(() => import('./account').then((m) => ({ default: m.ActivityStatusPage }))),
  // how others can interact with you
  messages: page(() => import('./interact').then((m) => ({ default: m.MessagesPage }))),
  tags: page(() => import('./interact').then((m) => ({ default: m.TagsPage }))),
  comments: page(() => import('./interact').then((m) => ({ default: m.CommentsPage }))),
  'comment-block': page(list('comment_block', {
    title: 'Block comments from', note: 'Comments from these people on your posts, reels and videos are hidden from everyone but them. They are not told, and they can still see your content.',
    emptyTitle: 'Nobody is blocked from commenting', emptyText: 'Search for someone above to stop their comments appearing.', addLabel: 'Block comments', removeLabel: 'Allow again', max: 500
  })),
  sharing: page(() => import('./interact').then((m) => ({ default: m.SharingPage }))),
  restricted: page(list('restricted', {
    title: 'Restricted accounts', note: 'Restrict someone who is bothering you without blocking them. Their comments on your content are hidden from everyone else, and a new chat from them is not allowed. They are not told.',
    emptyTitle: 'No restricted accounts', emptyText: 'Search for someone above to restrict them.', addLabel: 'Restrict', removeLabel: 'Unrestrict', max: 500
  })),
  limit: page(() => import('./interact').then((m) => ({ default: m.LimitPage }))),
  'hidden-words': page(() => import('./interact').then((m) => ({ default: m.HiddenWordsPage }))),
  invite: page(() => import('./interact').then((m) => ({ default: m.InvitePage }))),
  // what you see
  favourites: page(list('favourite', {
    title: 'Favourites', note: 'Posts from your favourites can be seen on their own in your feed. You can have up to 100.',
    emptyTitle: 'No favourites yet', emptyText: 'Search for someone above to add them.', addLabel: 'Add', removeLabel: 'Remove', max: 100
  })),
  muted: page(() => import('./see').then((m) => ({ default: m.MutedPage }))),
  content: page(() => import('./see').then((m) => ({ default: m.ContentPage }))),
  'like-counts': page(() => import('./see').then((m) => ({ default: m.LikeCountsPage }))),
  // your app and media
  'device-permissions': page(() => import('./app').then((m) => ({ default: m.DevicePermissionsPage }))),
  archiving: page(() => import('./app').then((m) => ({ default: m.ArchivingPage }))),
  accessibility: page(() => import('./app').then((m) => ({ default: m.AccessibilityPage }))),
  language: page(() => import('./app').then((m) => ({ default: m.LanguagePage }))),
  'media-quality': page(() => import('./app').then((m) => ({ default: m.MediaQualityPage }))),
  'app-websites': page(() => import('./app').then((m) => ({ default: m.AppWebsitesPage }))),
  // orders, help, about
  orders: page(() => import('./support').then((m) => ({ default: m.OrdersPage }))),
  help: page(() => import('./support').then((m) => ({ default: m.HelpPage }))),
  'privacy-centre': page(() => import('./support').then((m) => ({ default: m.PrivacyCentrePage }))),
  'account-status': page(() => import('./support').then((m) => ({ default: m.AccountStatusPage }))),
  about: page(() => import('./support').then((m) => ({ default: m.AboutPage })))
};
