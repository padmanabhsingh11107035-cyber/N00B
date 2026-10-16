import React from 'react';
import type { PageComponent, PageProps } from '../types';
import { AccountPage, PasswordPage, AccountTypePage, PrivacyPage, CloseFriendsPage, BlockedPage, StoryPrivacyPage, ActivityStatusPage, ListPage } from './account';
import { ArchivePage, StoriesArchivePage, ActivityPage, MyCommentsPage, TimePage, SearchesPage } from './activity';
import { NotificationsPage, MessagesPage, TagsPage, CommentsPage, SharingPage, LimitPage, HiddenWordsPage, InvitePage } from './interact';
import { MutedPage, ContentPage, LikeCountsPage } from './see';
import { DevicePermissionsPage, ArchivingPage, AccessibilityPage, LanguagePage, MediaQualityPage, AppWebsitesPage } from './app';
import { OrdersPage, HelpPage, PrivacyCentrePage, AccountStatusPage, AboutPage, AboutNoobPage } from './support';

// Every page of "Settings and activity", by name. All of them come in the same file as the hub, so tapping a row opens its page at once (nothing is fetched first); the
// hub itself is loaded in the background while the profile is on screen (ProfileView). The hub shows a row only when its page is in this list (registry.ts), and
// `go('name')` ignores names that are not here.

type ListText = { title: string; note: string; emptyTitle: string; emptyText: string; addLabel: string; removeLabel: string; max?: number };
const list = (kind: 'restricted' | 'comment_block' | 'story_hide' | 'favourite', text: ListText): PageComponent => {
  const Wrapped: React.FC<PageProps> = (props) => <ListPage {...props} kind={kind} {...text} />;
  return Wrapped;
};

export const PAGES: Record<string, PageComponent> = {
  // your account
  account: AccountPage,
  password: PasswordPage,
  'account-type': AccountTypePage,
  // how you use NOOB
  archive: ArchivePage,
  'stories-archive': StoriesArchivePage,
  activity: ActivityPage,
  'activity-comments': MyCommentsPage,
  time: TimePage,
  searches: SearchesPage,
  notifications: NotificationsPage,
  // who can see your content
  privacy: PrivacyPage,
  'close-friends': CloseFriendsPage,
  blocked: BlockedPage,
  'story-privacy': StoryPrivacyPage,
  'story-hide': list('story_hide', {
    title: 'Hide story from', note: 'People on this list do not see your stories. They are not told, and they can still see your profile and posts.',
    emptyTitle: 'Nobody is hidden', emptyText: 'Search for someone above to hide your story from them.', addLabel: 'Hide', removeLabel: 'Show again', max: 500
  }),
  'activity-status': ActivityStatusPage,
  // how others can interact with you
  messages: MessagesPage,
  tags: TagsPage,
  comments: CommentsPage,
  'comment-block': list('comment_block', {
    title: 'Block comments from', note: 'Comments from these people on your posts, reels and videos are hidden from everyone but them. They are not told, and they can still see your content.',
    emptyTitle: 'Nobody is blocked from commenting', emptyText: 'Search for someone above to stop their comments appearing.', addLabel: 'Block comments', removeLabel: 'Allow again', max: 500
  }),
  sharing: SharingPage,
  restricted: list('restricted', {
    title: 'Restricted accounts', note: 'Restrict someone who is bothering you without blocking them. Their comments on your content are hidden from everyone else, and a new chat from them is not allowed. They are not told.',
    emptyTitle: 'No restricted accounts', emptyText: 'Search for someone above to restrict them.', addLabel: 'Restrict', removeLabel: 'Unrestrict', max: 500
  }),
  limit: LimitPage,
  'hidden-words': HiddenWordsPage,
  invite: InvitePage,
  // what you see
  favourites: list('favourite', {
    title: 'Favourites', note: 'Posts from your favourites can be seen on their own in your feed. You can have up to 100.',
    emptyTitle: 'No favourites yet', emptyText: 'Search for someone above to add them.', addLabel: 'Add', removeLabel: 'Remove', max: 100
  }),
  muted: MutedPage,
  content: ContentPage,
  'like-counts': LikeCountsPage,
  // your app and media
  'device-permissions': DevicePermissionsPage,
  archiving: ArchivingPage,
  accessibility: AccessibilityPage,
  language: LanguagePage,
  'media-quality': MediaQualityPage,
  'app-websites': AppWebsitesPage,
  // orders, help, about
  orders: OrdersPage,
  help: HelpPage,
  'privacy-centre': PrivacyCentrePage,
  'account-status': AccountStatusPage,
  about: AboutPage,
  'about-noob': AboutNoobPage
};
