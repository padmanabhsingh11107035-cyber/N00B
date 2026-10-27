import { SignupSourceCard } from './components/Common/SignupSourceCard';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Home,
  Compass,
  Film,
  MessageSquare,
  Gamepad2,
  Music,
  BarChart3,
  Bell,
  BellRing,
  Sparkles,
  Wallet as WalletIcon,
  Bot,
  Radio,
  CheckCircle2,
  ChevronRight,
  LogOut,
  Users,
  UserCheck,
  UserPlus,
  Plus,
  Youtube
} from 'lucide-react';
import { Post, Reel, Story, User, StatusNote, AppNotification } from './types';
import {
  checkSessionStatus,
  loadSignedInUser,
  fetchPosts,
  fetchPostById,
  fetchHomeStoryTray,
  fetchReels,
  fetchReelById,
  fetchUsers,
  pokeMediaCleanup,
  toggleFollowUser,
  endLiveStream,
  removeFollower,
  acceptFollowRequest,
  declineFollowRequest,
  respondToSuggestedUser,
  toggleLikePost,
  toggleSavePost,
  toggleArchivePost,
  toggleCommentsPost,
  toggleLikeCountPost,
  deletePost,
  deletePostSlide,
  createPost,
  createReel,
  createStory,
  addCommentToStory,
  deleteStory,
  updateUserBio,
  updateUserStatusNote,
  logoutUser,
  checkAndRegisterDevice,
  subscribeToDeviceRevoked,
  deleteMyAccount,
  setSessionUserId,
  fetchAppNotifications,
  subscribeToNotificationChanges,
  clearAllNotifications,
  markNotificationsAsRead,
  startPresenceHeartbeat,
  startLastSeenHeartbeat
} from './services/api';
import { FloatingNavBar, NavTab } from './components/Navigation/FloatingNavBar';
import { FeedView } from './components/Feed/FeedView';
// Statically imported before, which meant every single page load of the whole app (not just opening
// Chat) paid for its full weight upfront — E2EE crypto setup, the Instants camera/viewer, encryption
// modals, sticker/GIF panels, confetti, group management, all bundled into the one main chunk. Lazy
// just like every other heavy, occasional screen in this file.
const { View: ChatView, preload: preloadChat } = lazyTab(() => import('./components/Chat/ChatView').then((m) => m.ChatView));
import { IncomingCallModal } from './components/Chat/IncomingCallModal';
import { useIncomingCalls } from './components/Chat/useIncomingCalls';
import { useUnreadChatCount } from './components/Chat/useUnreadChatCount';
import { armNotificationSound, playNotificationSound } from './utils/notificationSound';
import { armSongPlayer } from './utils/songSound';
import { takeRestorePage } from './utils/pageResume';
import { predictFollowToggle, predictFollowersCount } from './utils/followPredict';
import { buildStoryTray, topUpSuggestions, loadOwnSeenStoryIds, saveOwnSeenStoryIds, type StoryTraySuggestion } from './utils/storyTray';
import { ErrorBoundary } from './components/ErrorBoundary';
import type { NotificationSettingsState } from './components/Modals/NotificationsModal';
import { AuthView } from './components/Auth/AuthView';
import { TermsAndConditions } from './components/Legal/TermsAndConditions';
import { PrivacyPolicy } from './components/Legal/PrivacyPolicy';
import { VerifiedBadge } from './components/Common/VerifiedBadge';
import { AvatarMedia } from './components/Common/AvatarMedia';
import { ALL_50_MINI_GAMES, MiniGameMeta } from './components/Games/types';
import { PushNotificationPrompt, shouldShowPushPrompt, resumePendingPush } from './components/Common/PushNotificationPrompt';
import { MiniToast } from './components/Common/MiniToast';
import { TimeReminder } from './components/Settings/TimeReminder';
import { NativeUpdateBanner } from './components/Common/NativeUpdateBanner';
import { AndroidAppPrompt } from './components/Common/AndroidAppPrompt';
import { RenditionStrip } from './components/Common/RenditionStrip';
import { hardReload } from './utils/reloadApp';
import { preloadStoryPictures } from './utils/preloadStoryMedia';
import { BurgerLoading, TabBurgerLoading } from './components/Common/BurgerLoading';
import { getSettings, isStoryMuted, loadFeedLists, loadSettings, resetFeedLists, resetSettingsStore, useFeedLists, useSetting } from './services/settingsApi';
import { useDevicePrefs } from './utils/devicePrefs';
import { InAppBrowserHost } from './components/Common/InAppBrowser';
import { NoobDrawHost } from './components/Draw/NoobDrawHost';
import { StudioHost } from './components/Studio/StudioHost';
import { closeStudio, openStudio } from './components/Studio/studioStore';
import { closeNoobDraw } from './components/Draw/drawStore';
import { TeamJoinHost } from './components/Team/TeamJoinHost';
import { StudyHost } from './components/Study/StudyHost';
import { isCoachingHost, openStudy } from './components/Study/studyStore';
import { openTeamJoin, rememberTeamJoin, hasRememberedTeamJoin, forgetTeamJoin } from './components/Team/teamJoinStore';
import { teamJoinRequested } from './utils/ourTeam';
import { installLinkInterceptor } from './utils/inAppBrowser';
import { sendLike } from './utils/likeSync';
import { lazyTab } from './utils/lazyTab';
import { usePageLayers, PageLayerSlot, KeepAliveTab, useTabScroll } from './utils/pageLayers';
import { LogoLightbox } from './components/Common/LogoLightbox';
import { parseFunPath, funPath, type FunLocation } from './utils/funRoutes';
import { FeatureFlagsContext } from './utils/featureFlags';
import { TAB_FEATURE, disabledFeatureSet, funFeatureKey } from './utils/features';
import { TAB_PATHS, cleanPath, contentPath, parseContentPath, parseContentQuery, tabFromPath, FEATURE_PAGES, type ContentRoute } from './utils/routes';
import { afterHistoryIdle } from './utils/historyGate';
import { showTabAddress, tabFromHistoryEntry } from './utils/addressBar';
import { useAnyFullPage } from './utils/fullPage';
import { setInAppLinkHandler } from './utils/inAppLinks';
import { isOwnHost } from './utils/siteUrl';
import { findPinnedPost, patchPinnedPost } from './services/pinnedFeed';
import { UpdateAvailableBanner } from './components/Common/UpdateAvailableBanner';
import { SystemPage } from './components/Common/SystemPage';
import { NoobStackLoader } from './components/Common/NoobStackLoader';
import { useUpdateAvailable } from './utils/appVersion';
import { isInstalled } from './utils/pwaInstall';
import { detectPlatform } from './utils/appPlatform';
import { startVisitTracking, noteVisit } from './services/visitTracker';
import { getDeviceId, getDeviceLabel } from './utils/deviceId';
import { initPushNotifications } from './services/pushNotifications';
import { Capacitor } from '@capacitor/core';
import { initialWatch, stepWatch, SESSION_ENDED_MESSAGE, type WatchState } from './utils/sessionWatch';
import { readDiag, explainSessionEnd } from './services/authDiag';
import { installContentProtection } from './utils/contentProtection';
import { applyAccountLanguage, setSignedIn } from './i18n/account.ts';
import { isMainAdmin } from './adminAccess';
import { fetchPublicPlatformSettings, type PlatformSettings } from './services/api';
import { setVisibleInterval } from './utils/visibleInterval';

// Lazy-loaded: each of these pulls a large, rarely-needed chunk out of the main bundle (the admin
// console alone is ~3000 lines nobody but the admin ever opens; Live Streaming/Lounge additionally
// drag in the Agora SDK) — loaded on first use instead of on every visit, no matter who's using the app.
const { View: ExploreView, preload: preloadExplore } = lazyTab(() => import('./components/Explore/ExploreView').then((m) => m.ExploreView));
const { View: ReelsView, preload: preloadReels } = lazyTab(() => import('./components/Reels/ReelsView').then((m) => m.ReelsView));
const { View: GamesView, preload: preloadGames } = lazyTab(() => import('./components/Games/GamesView').then((m) => m.GamesView));
const { View: MusicHubView, preload: preloadMusic } = lazyTab(() => import('./components/Music/MusicHubView').then((m) => m.MusicHubView));
const { View: ProfileView, preload: preloadProfile } = lazyTab(() => import('./components/Profile/ProfileView').then((m) => m.ProfileView));
const FunHub = React.lazy(() => import('./components/Fun/FunHub'));
const PublicContentPage = React.lazy(() => import('./components/Public/PublicContentPage').then((m) => ({ default: m.PublicContentPage })));
const AnonymousMessagesPage = React.lazy(() => import('./components/Anonymous/AnonymousMessagesPage').then((m) => ({ default: m.AnonymousMessagesPage })));
const StoryViewerModal = React.lazy(() => import('./components/Stories/StoryViewerModal').then((m) => ({ default: m.StoryViewerModal })));
const CreateStoryModal = React.lazy(() => import('./components/Stories/CreateStoryModal').then((m) => ({ default: m.CreateStoryModal })));
const PostCreationModal = React.lazy(() => import('./components/PostCreation/PostCreationModal').then((m) => ({ default: m.PostCreationModal })));
const CreateChooser = React.lazy(() => import('./components/PostCreation/CreateChooser').then((m) => ({ default: m.CreateChooser })));
const NotificationsModal = React.lazy(() => import('./components/Modals/NotificationsModal').then((m) => ({ default: m.NotificationsModal })));
const ScratchCardModal = React.lazy(() => import('./components/Modals/ScratchCardModal').then((m) => ({ default: m.ScratchCardModal })));
const StatusNoteModal = React.lazy(() => import('./components/Modals/StatusNoteModal').then((m) => ({ default: m.StatusNoteModal })));
const FindFriendsModal = React.lazy(() => import('./components/Modals/FindFriendsModal').then((m) => ({ default: m.FindFriendsModal })));
const AdminControlModal = React.lazy(() => import('./components/Modals/AdminControlModal').then((m) => ({ default: m.AdminControlModal })));
const CustomerSupportModal = React.lazy(() => import('./components/Support/CustomerSupportModal').then((m) => ({ default: m.CustomerSupportModal })));
const GamePlayModal = React.lazy(() => import('./components/Games/GamePlayModal').then((m) => ({ default: m.GamePlayModal })));
const ProfessionalDashboardModal = React.lazy(() => import('./components/Modals/ProfessionalDashboardModal').then((m) => ({ default: m.ProfessionalDashboardModal })));
const LiveStreamView = React.lazy(() => import('./components/LiveStream/LiveStreamView').then((m) => ({ default: m.LiveStreamView })));
const LiveLoungePage = React.lazy(() => import('./components/Profile/LiveLoungePage').then((m) => ({ default: m.LiveLoungePage })));
const NoobAiPage = React.lazy(() => import('./components/Profile/NoobAiPage').then((m) => ({ default: m.NoobAiPage })));
const AccountsStatisticsModal = React.lazy(() => import('./components/Profile/AccountsStatisticsModal').then((m) => ({ default: m.AccountsStatisticsModal })));
const ProFeaturesModal = React.lazy(() => import('./components/Profile/ProFeaturesModal').then((m) => ({ default: m.ProFeaturesModal })));
const { View: HomeVideoFeedView, preload: preloadVideos } = lazyTab(() => import('./components/Videos/HomeVideoFeedView').then((m) => m.HomeVideoFeedView));
// The bottom bar's pages, in the order they are fetched ahead of time (see the effect below) and by tab, so a tap can start the fetch early.
const TAB_PRELOADS: [NavTab, () => Promise<unknown>][] = [
  ['profile', preloadProfile], ['explore', preloadExplore], ['reels', preloadReels], ['videos', preloadVideos],
  ['music', preloadMusic], ['games', preloadGames], ['chat', preloadChat]
];
const KEEP_ALIVE_TABS: readonly NavTab[] = ['feed', 'explore'];
const UploadVideoModal = React.lazy(() => import('./components/Videos/UploadVideoModal').then((m) => ({ default: m.UploadVideoModal })));

// Shown for the moment it takes one of the above to load in — quick and unobtrusive rather than a
// full loading screen, since by the time it appears the user already tapped something and expects
// a response right away.
const LazyFallback: React.FC = () => <BurgerLoading />;

// While a profile's page is still arriving the person is shown straight away (their picture, name and @handle with the page's outline filling in), never an empty black screen.
const ProfileSkeleton: React.FC<{ user: User }> = ({ user }) => (
  <div className="w-full flex flex-col items-center px-4 pt-8 pb-24 gap-4" role="status" aria-label="Opening profile">
    <div className="w-24 h-24 rounded-full overflow-hidden ring-2 ring-zinc-50/70 bg-zinc-900">
      {user.avatar ? <img src={user.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : null}
    </div>
    <div className="text-center">
      <p className="text-lg font-extrabold text-white">{user.displayName || user.username}</p>
      <p className="text-xs text-zinc-400">@{user.username}</p>
    </div>
    <div className="flex gap-3 w-full max-w-sm">
      {[0, 1, 2].map((i) => <div key={i} className="flex-1 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 animate-pulse" />)}
    </div>
    <div className="grid grid-cols-3 gap-1 w-full max-w-sm">
      {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="aspect-square rounded-lg bg-zinc-900 border border-zinc-800 animate-pulse" />)}
    </div>
  </div>
);

const INITIAL_NOTIFICATIONS: AppNotification[] = [];

// On the coaching address NOOB STUDY is opened as soon as the person is signed in
const CoachingEntry: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  useEffect(() => { openStudy('home'); }, []);
  return <StudyHost currentUser={currentUser} />;
};

// What can be opened on top of the page that is showing: someone's profile, or the Fun pages of the three-line menu (This or That, Ask Me Anything, Mood Status, Public Polls).
type AppLayer =
  | { id: string; kind: 'profile'; user: User }
  | { id: 'fun'; kind: 'fun'; loc: FunLocation };

export default function App() {
  // The page the address bar names (/explore, /reels ...) is the page that opens; anything else (/, a shared reel or profile link) opens Home.
  const [activeTab, setActiveTabState] = useState<NavTab>(() => { const t = typeof window !== 'undefined' && !isCoachingHost() ? tabFromPath(window.location.pathname) : null; return t && t !== 'post' ? t : 'feed'; });   // ('post' is the Create button, a window over a page, never a page of its own)
  // "Go to previous page": a profile opens as a LAYER on top of the page that is showing (Home, Explore, Reels, Chat, another profile...) instead of replacing it, so the page
  // underneath stays exactly as it was (same posts in the same order, same scroll) and the "Go to previous page" button, or the phone's back button, brings it back (utils/pageLayers.tsx).
  const pageLayers = usePageLayers<AppLayer>(activeTab);
  const clearPageLayers = pageLayers.clear;
  // Any jump to a page (a bottom-bar tab, "open this post", "message this person"...) closes the profile layers first.
  const setActiveTab = useCallback((tab: NavTab) => { clearPageLayers({ restore: false }); setActiveTabState(tab); }, [clearPageLayers]);
  // Only the Home page can be refreshed (pull down there). Everywhere else - every other tab, a profile, any page of the three-line menu - pulling down does nothing: the app has no
  // pull-down refresh there, and the browser's own one (Android Chrome) is switched off too (see index.css, html[data-refresh="off"]). Anyone who wants a refresh goes Home.
  const fullPageOpen = useAnyFullPage();
  const refreshableHere = activeTab === 'feed' && pageLayers.layers.length === 0 && !fullPageOpen;
  // Home and Explore, once opened, stay alive (hidden) while another tab shows: going back to them is instant, with nothing rebuilt or fetched again, at the place they were left.
  const visitedTabs = useRef<{ uid?: string; tabs: Set<NavTab> }>({ tabs: new Set<NavTab>() });
  useTabScroll(activeTab, KEEP_ALIVE_TABS, pageLayers.layers.length === 0 && !fullPageOpen);
  useEffect(() => { document.documentElement.setAttribute('data-refresh', refreshableHere ? 'on' : 'off'); }, [refreshableHere]);
  // Tracks the tab the user was on immediately before the current one, so
  // the Reels page's back arrow can return them to wherever they actually
  // came from (feed, explore, profile, etc.) instead of a hardcoded tab.
  const activeTabRef = useRef<NavTab>(activeTab);
  const previousTabRef = useRef<NavTab>(activeTab);
  useEffect(() => {
    previousTabRef.current = activeTabRef.current;
    activeTabRef.current = activeTab;
  }, [activeTab]);
  const [chatConversationOpenOnMobile, setChatConversationOpenOnMobile] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  // Refresh / reopened app while on the Games page: go straight back to it (with the game that was open, see utils/pageResume.ts).
  // Decided once, as soon as the account is known and before the home screen is ever drawn.
  const restoredTabRef = useRef(false);
  if (currentUser && !restoredTabRef.current) {
    restoredTabRef.current = true;
    if (takeRestorePage(currentUser.id) === 'games') setActiveTab('games');
  }
  // Mounted app-wide (not inside ChatView) so an incoming call reaches someone no matter which tab
  // they're currently on — a hook, so it must be called unconditionally, before any early return
  // below. It internally no-ops until currentUser is actually set.
  const { incoming: incomingCall, decline: declineIncomingCall, clearAfterAccept: clearIncomingCallAfterAccept } = useIncomingCalls(currentUser);
  // Defined up here (not just before the main return) so it's available to the IncomingCallModal
  // rendered inside the main-admin early-return below too — the admin needs to be able to accept a
  // call while looking at the admin console, same as anywhere else in the app.
  const acceptIncomingCall = () => {
    if (!incomingCall) return;
    const chatId = incomingCall.chatId;
    clearIncomingCallAfterAccept();
    // The main admin normally sees the admin console instead of the real app (see the isMainAdmin
    // early-return below) — accepting a call has to step them out into it, or there's nowhere for
    // the call screen to actually show.
    setViewAsUser(true);
    setActiveTab('chat');
    setPendingCallChatId(chatId);
  };
  // The main NOOB admin normally opens straight into the admin console (see the isMainAdmin gate
  // below) — this lets them step into the app exactly as any other member sees it, then step back
  // out via the computer icon on their own profile page. Resets to the admin console on every fresh
  // login/reload on purpose, so the account never gets "stuck" outside it by accident.
  const [viewAsUser, setViewAsUser] = useState(false);
  // A short sound when a chat message arrives while the app is open and the person is not already in the chat tab.
  const unreadChatCount = useUnreadChatCount(currentUser, () => {
    if (activeTabRef.current !== 'chat') playNotificationSound('message');
  });

  // The admin console's "whole-app maintenance lock" (see AdminControlModal's Platform tab) — checked
  // once someone is signed in so a non-admin mid-lockdown sees the block screen below instead of the
  // app; the main admin always gets through regardless, so they can switch it back off.
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings | null>(null);
  useEffect(() => {
    if (!currentUser) return;
    let alive = true;
    let last = Date.now();
    const load = () => { last = Date.now(); fetchPublicPlatformSettings().then((s) => { if (alive) setPlatformSettings(s); }); };
    load();
    // An administrator's change (the Music page hidden or shown, a lock...) reaches everyone without logging in again: whenever the app comes back to the front, at most
    // every two minutes. (It is a tiny answer, a few hundred bytes.)
    const onBack = () => { if (document.visibilityState === 'visible' && Date.now() - last > 120_000) load(); };
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('focus', onBack);
    return () => { alive = false; document.removeEventListener('visibilitychange', onBack); window.removeEventListener('focus', onBack); };
  }, [currentUser?.id, viewAsUser]);
  // The Music page can be hidden by the administrator (Admin Control Panel -> Platform): it leaves the bottom bar and the side menu, and anyone who was on it goes Home.
  const musicHidden = platformSettings?.musicPageHidden === true;
  useEffect(() => {
    if (musicHidden && activeTab === 'music') setActiveTab('feed');
  }, [musicHidden, activeTab]);
  // The pages the administrator has switched OFF for users (Admin Control Panel -> Pages). The administrator always sees everything; for everyone else a page that is off leaves the
  // bottom bar, the side menu, the menu on Home and every button that opens it, and anyone who is on it when it goes off is taken Home.
  const adminSeesAll = isMainAdmin(currentUser);
  const offList = platformSettings?.disabledFeatures?.join(',') ?? '';
  const featuresOff = useMemo<ReadonlySet<string>>(() => (adminSeesAll ? new Set<string>() : disabledFeatureSet(offList ? offList.split(',') : [])), [adminSeesAll, offList]);
  const featOn = (key: string) => !featuresOff.has(key);
  useEffect(() => {
    const key = TAB_FEATURE[activeTab];
    if (key && featuresOff.has(key)) setActiveTab('feed');
  }, [featuresOff, activeTab]);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const isUpdateAvailable = useUpdateAvailable();
  const [posts, setPosts] = useState<Post[]>([]);
  // the same list object until the posts really change, so drawing the app again (e.g. when a profile opens) never makes Home or Explore start over
  const visiblePosts = useMemo(() => posts.filter((p) => !p.isArchived), [posts]);
  const postsRef = useRef<Post[]>([]);
  postsRef.current = posts;
  const [stories, setStories] = useState<Story[]>([]);
  // The home-page story tray: the stories this person may see plus random accounts to follow (reshuffled each time the
  // feed loads or is refreshed), worked out in utils/storyTray.ts. The full-screen viewer plays the same list in the same order;
  // that order is fixed when the viewer opens, so a ring turning grey while you watch can't shuffle the stories under you.
  const [homeSuggestions, setHomeSuggestions] = useState<StoryTraySuggestion[]>([]);
  const [ownSeenStoryIds, setOwnSeenStoryIds] = useState<Set<string>>(() => loadOwnSeenStoryIds());
  const [storyViewerOrder, setStoryViewerOrder] = useState<string[]>([]);
  const storyViewerStories = useMemo(() => {
    const byId = new Map(stories.map((s) => [s.id, s] as const));
    return storyViewerOrder.map((id) => byId.get(id)).filter((s): s is Story => !!s);
  }, [stories, storyViewerOrder]);
  const [reels, setReels] = useState<Reel[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<User[]>([]);
  // The tray's circles: the server's suggestions topped up with random people from the app's own list of users (a new random order each time the feed loads or
  // is refreshed, steady in between), then ordered with the stories (utils/storyTray.ts).
  const [traySeed, setTraySeed] = useState(() => Math.random());
  // Muted accounts (Settings and activity) have no circle and their stories are not played; "Suggested accounts" off removes the plus-badge circles.
  const feedListsVersion = useFeedLists();
  const { suggestedAccounts } = useDevicePrefs();
  const trayStories = useMemo(
    () => stories.filter((st) => !st.userId || st.userId === currentUser?.id || !isStoryMuted(st.userId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stories, currentUser?.id, feedListsVersion]
  );
  const traySuggestions = useMemo(
    () => (!suggestedAccounts ? [] : topUpSuggestions(homeSuggestions, registeredUsers, {
      meId: currentUser?.id ?? '',
      followingIds: new Set(currentUser?.followingIds ?? []),
      blockedIds: new Set(currentUser?.blockedUserIds ?? []),
      hiddenFromIds: new Set(currentUser?.hiddenFromIds ?? []),
      takenIds: new Set(stories.map((st) => st.userId).filter((x): x is string => !!x)),
      seed: traySeed
    }).filter((sg) => !isStoryMuted(sg.id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [homeSuggestions, registeredUsers, currentUser?.id, currentUser?.followingIds, currentUser?.blockedUserIds, currentUser?.hiddenFromIds, stories, traySeed, suggestedAccounts, feedListsVersion]
  );
  const storyTray = useMemo(
    () => buildStoryTray(trayStories, traySuggestions, currentUser?.id ?? '', new Set(currentUser?.followingIds ?? []), ownSeenStoryIds),
    [trayStories, traySuggestions, currentUser?.id, currentUser?.followingIds, ownSeenStoryIds]
  );
  // A hashtag story sticker tap sets this, then switches to Explore — consumed once and cleared,
  // mirroring the existing autoOpenJoinTeam "arrive with a pending action" pattern below.
  const [pendingExploreSearch, setPendingExploreSearch] = useState<string | null>(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>(INITIAL_NOTIFICATIONS);
  // New notifications make a sound (see utils/notificationSound.ts): the ids already known are remembered, so only ones that
  // arrive after the first load count as new, and nothing sounds for a notification the person has already seen.
  const seenNotificationIdsRef = useRef<Set<string> | null>(null);
  const announceNotifications = (list: any[], silent = false) => {
    const known = seenNotificationIdsRef.current;
    seenNotificationIdsRef.current = new Set<string>([...(known || []), ...list.map((n) => String(n.id))]);
    if (silent || !known) return;
    const fresh = list.some((n) => !n.isRead && !known.has(String(n.id)));
    if (fresh && notificationSettingsRef.current.masterEnabled) playNotificationSound('notification');
  };
  useEffect(() => { armNotificationSound(); armSongPlayer(); }, []);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettingsState>({
    masterEnabled: true,
    followRequests: true,
    newFollowers: true,
    likesComments: true,
    gamesLeaderboard: true,
    musicHub: true,
    soundAlerts: true
  });
  const notificationSettingsRef = useRef(notificationSettings);
  notificationSettingsRef.current = notificationSettings;
  const [loading, setLoading] = useState(true);
  // The loading screen (the burger, NoobStackLoader) shows only while the app is really loading: when the app is opened, the opening animation (public/opening) plays and the app opens straight out of it.
  // /anonymous: the Anonymous Messages feed can be read by anyone, before logging in (it asks them to log in only to share or report).
  const [anonPublic, setAnonPublic] = useState(() => window.location.pathname.replace(/\/+$/, '') === '/anonymous');
  // A Fun page opened from its own address (/polls/<id>, /ask/<username>, /mood ...): shown to a visitor who is not logged in (they can look; the page asks them to log in for the
  // rest) and opened on top of Home once someone is logged in. `bootFun` is that address until it has been opened.
  const [bootFun, setBootFun] = useState<FunLocation | null>(() => parseFunPath(window.location.pathname));
  // A post / reel / video / profile opened from its own address (/reel/<id>, /u/<name>, or the older ?reel=<id>): anyone can look at it without an account (PublicContentPage);
  // once someone is logged in it opens inside the app. `bootRoute` is that address until the person leaves the public page.
  const [bootRoute] = useState<ContentRoute | null>(() => (typeof window !== 'undefined' ? parseContentPath(window.location.pathname) || parseContentQuery(window.location.search) : null));
  const [publicRouteOpen, setPublicRouteOpen] = useState(true);
  // Opened from the address of a page (/reels ...) while logged out: the sign-in page says which page the person asked for, and the page opens after they log in.
  const [bootNotice] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const path = cleanPath(window.location.pathname);
    const feature = FEATURE_PAGES.find((f) => f.path === path && path !== '/');
    return feature ? `Log in to open ${feature.title}.` : null;
  });
  const [publicFunOpen, setPublicFunOpen] = useState(true);
  // A single failed/rejected call in the initial Promise.all (a network
  // blip, a transient 5xx, the brief boot gap right after a deploy) used to
  // silently drop straight through to the logged-out screen with only a
  // console.error — a logged-in user would see it as being signed out "for
  // no reason" and have no way to recover except guessing to reload.
  const [initialLoadFailed, setInitialLoadFailed] = useState(false);

  // Active Modals & Selected items
  const [activeStoryViewerIndex, setActiveStoryViewerIndex] = useState<number | null>(null);
  const [activeScratchCardId, setActiveScratchCardId] = useState<string | null>(null);
  const [showCreateStoryModal, setShowCreateStoryModal] = useState(false);
  // "+" opens the Create chooser (Post / Reel / Story / Video / Live / Thought); a Post, Reel or Thought then opens the creator
  const [showPostCreationModal, setShowPostCreationModal] = useState(false);
  const [createKind, setCreateKind] = useState<null | 'post' | 'reel' | 'thought'>(null);
  // A picture or video finished in NOOB Studio: the Post / Reel / Story creator opens with it (it is only published when the person does that there)
  const [studioFile, setStudioFile] = useState<File | null>(null);
  const [studioStoryFile, setStudioStoryFile] = useState<File | null>(null);
  // the address /studio opens NOOB Studio
  useEffect(() => { try { if (/^\/studio\/?$/i.test(window.location.pathname)) openStudio(); } catch { /* the app opens as usual */ } }, []);
  // (the settings arrive a moment after the address opens it: if Studio or Draw is switched off for this person it closes again)
  useEffect(() => { if (featuresOff.has('studio')) closeStudio(); if (featuresOff.has('draw')) closeNoobDraw(); }, [featuresOff]);
  const [createSound, setCreateSound] = useState<null | { title: string; artist?: string; coverUrl?: string; audioUrl?: string; trackId?: string }>(null);   // "Use this sound" on a reel
  const [showUploadVideoModal, setShowUploadVideoModal] = useState(false);
  // Bumped after a successful long-video upload so HomeVideoFeedView refetches — simpler than
  // threading the new video through app-level state for a tab that's lazy-loaded anyway.
  const [videosRefreshKey, setVideosRefreshKey] = useState(0);
  const [showGoLiveHost, setShowGoLiveHost] = useState(false);
  // A host can step out of the full-screen live without ending it: the picture hides, the broadcast goes on, and "You are live" shows on the Create sheet
  // and in a small bar, each with a way back and a button that turns the live off.
  const [liveMinimized, setLiveMinimized] = useState(false);
  const [liveInfo, setLiveInfo] = useState<{ phase: string; id?: string }>({ phase: 'setup' });
  const [endingLive, setEndingLive] = useState(false);
  const hostIsLive = showGoLiveHost && liveInfo.phase === 'live';
  const [showLiveLoungeUpsell, setShowLiveLoungeUpsell] = useState(false);
  // Desktop/tablet sidebar shortcuts straight to pages that otherwise only open from inside the
  // Profile ⋮ menu — same underlying modals, just a second entry point for a wider screen.
  const [showNoobAiPage, setShowNoobAiPage] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showSubscriptionsModal, setShowSubscriptionsModal] = useState(false);
  const [liveLoungeInviteRoomId, setLiveLoungeInviteRoomId] = useState<string | null>(null);
  const [showProfessionalDashboardModal, setShowProfessionalDashboardModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showStatusNoteModal, setShowStatusNoteModal] = useState(false);
  const [showCustomerSupportModal, setShowCustomerSupportModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [selectedReelId, setSelectedReelId] = useState<string | undefined>(undefined);
  const [selectedVideoId, setSelectedVideoId] = useState<string | undefined>(undefined);
  const [selectedPostId, setSelectedPostId] = useState<string | undefined>(undefined);
  const [pendingChatUser, setPendingChatUser] = useState<User | null>(null);
  const [pendingChatId, setPendingChatId] = useState<string | null>(null);
  const [pendingCallChatId, setPendingCallChatId] = useState<string | null>(null);
  const [gameToPlay, setGameToPlay] = useState<{
    game: MiniGameMeta;
    challenger?: string;
    roomCode?: string;
  } | null>(null);
  const [sharedProfileUsername, setSharedProfileUsername] = useState<string | null>(null);
  const [sharedLiveLoungeCode, setSharedLiveLoungeCode] = useState<string | null>(null);
  const [sharedLiveLoungePasscode, setSharedLiveLoungePasscode] = useState<string | null>(null);
  const [liveLoungeMeetingId, setLiveLoungeMeetingId] = useState<string | null>(null);   // a planned meeting opened from a notification
  const [sharedPostId, setSharedPostId] = useState<string | null>(null);
  const [sharedReelId, setSharedReelId] = useState<string | null>(null);
  const [sharedVideoId, setSharedVideoId] = useState<string | null>(null);
  // "Pay with NOOB Points" link from an email (?pro=<plan>&billing=<monthly|yearly>): opens that plan's payment page once signed in
  const [proLink, setProLink] = useState<{ tier: string; billing: 'monthly' | 'yearly' } | null>(null);
  const [pendingJoinTeam, setPendingJoinTeam] = useState(false);
  // The shared "join the Our Team page" link (?team=join): opens the form once someone is signed in (it is remembered for a day, in case sign-in leaves the page and comes back)
  const [pendingTeamPageJoin, setPendingTeamPageJoin] = useState(false);
  const [showFindFriendsModal, setShowFindFriendsModal] = useState(false);
  const [sessionEndedNotice, setSessionEndedNotice] = useState<string | null>(null);

  useEffect(() => {
    loadInitialData();

    // Check URL parameters for direct game invite / shared profile links
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        const gameParam = params.get('playGame');
        const challengerParam = params.get('challenger');
        const roomParam = params.get('room');
        const profileParam = params.get('profile');
        const joinParam = params.get('join');
        const postParam = params.get('post');
        const reelParam = params.get('reel');
        const videoParam = params.get('video');
        const liveLoungeParam = params.get('liveLounge');
        const proParam = params.get('pro');
        const proBillingParam = params.get('billing');

        if (proParam && ['starter', 'plus', 'pro', 'elite', 'ultimate'].includes(proParam)) {
          setProLink({ tier: proParam, billing: proBillingParam === 'yearly' ? 'yearly' : 'monthly' });
        }

        if (gameParam) {
          const matched = ALL_50_MINI_GAMES.find(
            (g) => g.id === gameParam || g.id.toLowerCase() === gameParam.toLowerCase()
          );
          if (matched) {
            setGameToPlay({
              game: matched,
              challenger: challengerParam || undefined,
              roomCode: roomParam || undefined
            });
            setActiveTab('games');
          }
        }

        if (profileParam) {
          setSharedProfileUsername(profileParam);
        }

        if (joinParam === 'team') {
          setPendingJoinTeam(true);
        }

        if (teamJoinRequested(window.location.search)) {
          rememberTeamJoin();
          setPendingTeamPageJoin(true);
        } else if (hasRememberedTeamJoin()) {
          setPendingTeamPageJoin(true);
        }

        const route = parseContentPath(window.location.pathname);
        if (route?.kind === 'profile') setSharedProfileUsername(route.id);
        else if (route?.kind === 'post') setSharedPostId(route.id);
        else if (route?.kind === 'reel') setSharedReelId(route.id);
        else if (route?.kind === 'video') setSharedVideoId(route.id);

        if (postParam) {
          setSharedPostId(postParam);
        }

        if (reelParam) {
          setSharedReelId(reelParam);
        }

        if (videoParam) {
          setSharedVideoId(videoParam);
        }

        if (liveLoungeParam) {
          setSharedLiveLoungeCode(liveLoungeParam);
          const pwdParam = params.get('pwd');
          if (pwdParam) setSharedLiveLoungePasscode(pwdParam);
        }
      } catch (err) {
        console.error('URL param parse error:', err);
      }
    }
  }, []);

  // Resolve a shared-profile link once the viewer is logged in and the user
  // directory has loaded — a login/signup can happen in between, so this
  // can't just run once on mount alongside the URL parsing above.
  useEffect(() => {
    if (!sharedProfileUsername || !currentUser || registeredUsers.length === 0) return;

    const target = registeredUsers.find(
      (u) => u.username.toLowerCase() === sharedProfileUsername.toLowerCase()
    );
    if (target) {
      if (target.id === currentUser.id) setActiveTab('profile');
      else pageLayers.push({ id: 'p:' + target.id, kind: 'profile', user: target });
    }
    setSharedProfileUsername(null);

    const url = new URL(window.location.href);
    url.searchParams.delete('profile');
    window.history.replaceState({}, '', url.toString());
  }, [sharedProfileUsername, currentUser, registeredUsers]);

  // Same deep-link pattern as the shared-profile one above.
  useEffect(() => {
    if (!sharedLiveLoungeCode || !currentUser) return;
    setLiveLoungeInviteRoomId(null); // this is a code join, not a targeted invite — don't let a stale one race it
    setShowLiveLoungeUpsell(true);
    const url = new URL(window.location.href);
    url.searchParams.delete('liveLounge');
    url.searchParams.delete('pwd');   // the passcode is not left sitting in the address bar
    window.history.replaceState({}, '', url.toString());
    // sharedLiveLoungeCode itself is left set — LiveLoungePage reads it as initialJoinCode below.
  }, [sharedLiveLoungeCode, currentUser]);

  useEffect(() => {
    if (!sharedPostId || !currentUser) return;
    handleNavigateToPost(sharedPostId);
    setSharedPostId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('post');
    window.history.replaceState({}, '', url.toString());
  }, [sharedPostId, currentUser]);

  useEffect(() => {
    if (!sharedReelId || !currentUser) return;
    handleNavigateToReel(sharedReelId);
    setSharedReelId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('reel');
    window.history.replaceState({}, '', url.toString());
  }, [sharedReelId, currentUser]);

  // Only resolved once someone is signed in (the link may arrive before login), then the link is removed from the address bar.
  useEffect(() => {
    if (!proLink || !currentUser) return;
    setShowSubscriptionsModal(true);
    const url = new URL(window.location.href);
    url.searchParams.delete('pro');
    url.searchParams.delete('billing');
    window.history.replaceState({}, '', url.toString());
  }, [proLink, currentUser]);

  useEffect(() => {
    if (!sharedVideoId || !currentUser) return;
    handleNavigateToVideo(sharedVideoId);
    setSharedVideoId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('video');
    window.history.replaceState({}, '', url.toString());
  }, [sharedVideoId, currentUser]);

  // Same deep-link pattern as the shared-profile one above: only resolved once someone is actually
  // logged in (a login/signup can happen first), lands on Explore with the "apply to join us" form
  // already open.
  useEffect(() => {
    if (!pendingTeamPageJoin || !currentUser) return;
    setPendingTeamPageJoin(false);
    forgetTeamJoin();
    openTeamJoin();
    const url = new URL(window.location.href);
    url.searchParams.delete('team');
    window.history.replaceState({}, '', url.toString());
  }, [pendingTeamPageJoin, currentUser]);

  useEffect(() => {
    if (!pendingJoinTeam || !currentUser) return;
    setActiveTab('explore');

    const url = new URL(window.location.href);
    url.searchParams.delete('join');
    window.history.replaceState({}, '', url.toString());
  }, [pendingJoinTeam, currentUser]);

  // the admin panel's Visitors page: this device opened NOOB (also with no account), and again once the person logs in so the visit is linked to them
  useEffect(() => { startVisitTracking(); }, []);
  useEffect(() => { if (currentUser?.id) void noteVisit(true); }, [currentUser?.id]);

  useEffect(() => {
    if (currentUser) {
      initPushNotifications();
      resumePendingPush();   // a "turn on notifications" that was cut short (phone offline, app closed) finishes by itself now
    }
  }, [currentUser?.id]);

  // A new account's profile photo is saved in the background right after sign-up; when it is, the copy shown meanwhile is swapped for the saved one.
  useEffect(() => {
    const onOwnAvatar = (e: Event) => {
      const d = (e as CustomEvent<{ userId: string; avatar: string }>).detail;
      if (d?.userId && d.avatar) setCurrentUser((u) => (u && u.id === d.userId ? { ...u, avatar: d.avatar } : u));
    };
    window.addEventListener('noob:own-avatar', onOwnAvatar);
    return () => window.removeEventListener('noob:own-avatar', onOwnAvatar);
  }, []);

  // Suspending an account only stops it dead on its NEXT request — there's
  // no push channel to end an already-open session instantly. Polling
  // /api/users/me (which the server now returns 200+null once suspended)
  // is what makes that show up as "logged out" within moments instead of
  // only on the next full page reload.
  //
  // checkSessionStatus distinguishes "the server said you're logged out"
  // from "the request didn't work" (a network blip, a 502/503 during a
  // deploy, a timeout) — collapsing those together was a real bug: any
  // routine deploy hiccup landing on this poll logged the user out with a
  // scary "your account was suspended" message even though nothing had
  // actually happened to their account. `unknown` is now ignored outright,
  // and even a real `invalid` needs to repeat on the very next poll before
  // acting, so one fluky response can't end a session by itself.
  //
  // What it says matters: "suspended" only when the database really says the account is suspended. A login that simply
  // ended (the saved login was removed after a failed renewal, another tab signed out...) is reported as "you were
  // signed out", and a check that could not be completed does nothing (see utils/sessionWatch.ts).
  //
  // Each tab uses its own account (services/tabSessions.ts), so another tab logging in as someone else no longer affects this one.
  // The check still compares whose login this tab reads with whose account it shows ("switched" is only a safety net now), and it
  // runs again the moment you come back to the tab, which is when another tab may have logged this account out.
  const watchRef = useRef<WatchState>(initialWatch);
  useEffect(() => {
    if (!currentUser) return;
    const myId = currentUser.id;
    watchRef.current = initialWatch;
    let checking = false;
    let ended = false;
    let lastAt = 0;
    const check = async () => {
      // never two checks at once, and never counted closer than 5 seconds apart (the "twice in a row" rule needs real time between)
      if (checking || ended || Date.now() - lastAt < 5000) return;
      checking = true;
      try {
        const step = stepWatch(watchRef.current, await checkSessionStatus(myId));
        lastAt = Date.now();
        watchRef.current = step.state;
        if (!step.end) return;
        ended = true;
        // say WHY in plain words (from what the login recorder saw) instead of guessing
        const why = step.end === 'signed-out' ? ` (Reason: ${explainSessionEnd(readDiag())}.)` : '';
        setSessionEndedNotice(SESSION_ENDED_MESSAGE[step.end] + why);
        setSessionUserId(null);
        setCurrentUser(null);
      } finally {
        checking = false;
      }
    };
    const stopInterval = setVisibleInterval(check, 30000);   // rests while the page is hidden
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);
    return () => {
      stopInterval();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
    };
  }, [currentUser?.id]);

  // Single-device login: the moment this device's own device_sessions row is revoked (someone logged
  // it out from the picker shown on another device), sign out locally right away instead of waiting
  // for the 30s poll above to eventually notice via checkSessionStatus.
  useEffect(() => {
    if (!currentUser) return;
    const deviceId = getDeviceId();
    const unsubscribe = subscribeToDeviceRevoked(deviceId, currentUser.id, () => {
      void logoutUser();
      setSessionUserId(null);
      setSessionEndedNotice('Your account is signed in on another device. Log in again to continue here.');
      setCurrentUser(null);
    });
    return unsubscribe;
  }, [currentUser?.id]);

  // The big screens are loaded on demand (smaller first download). Right after sign-in every page of the bottom bar is fetched quietly in the
  // background (two at a time), so that opening one for the first time shows the page at once instead of waiting.
  // Skipped when the phone is set to save data (a tap still fetches just that page).
  useEffect(() => {
    if (!currentUser) return;
    if ((navigator as any).connection?.saveData) return;
    let stopped = false;
    // Two files at a time (the pages people open most first), starting a moment after sign-in; Settings and activity (small) comes along at the end.
    const queue: Array<() => Promise<unknown>> = [...TAB_PRELOADS.map(([, preload]) => preload), () => import('./components/Settings/SettingsHub')];
    const worker = async () => {
      while (!stopped) {
        const next = queue.shift();
        if (!next) return;
        try { await next(); } catch { /* the page loads when opened instead */ }
      }
    };
    const timer = window.setTimeout(() => { void worker(); void worker(); }, 600);
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [currentUser?.id]);

  // Tapping a circle in the tray shows the story at once: the story screen itself and the first picture of each of the first circles are fetched quietly beforehand
  // (the viewer then also fetches what comes next). Skipped when the phone is set to save data.
  useEffect(() => {
    if (!currentUser || (navigator as any).connection?.saveData) return;
    const timer = window.setTimeout(() => { void import('./components/Stories/StoryViewerModal').catch(() => undefined); }, 1500);
    return () => window.clearTimeout(timer);
  }, [currentUser?.id]);
  useEffect(() => {
    if (!currentUser || (navigator as any).connection?.saveData) return;
    const list = storyTray.viewerStories;
    const starts = [storyTray.own.hasStory ? storyTray.own.startIndex : -1, ...storyTray.items.slice(0, 10).map((it) => it.startIndex)].filter((i) => i >= 0);
    if (!starts.length) return;
    const timer = window.setTimeout(() => preloadStoryPictures(starts.flatMap((i) => [list[i]?.mediaUrl, list[i + 1]?.mediaUrl])), 700);
    return () => window.clearTimeout(timer);
  }, [storyTray, currentUser?.id]);

  // Links to other websites open inside NOOB, under a bar that says NOOB (utils/inAppBrowser.ts), like Instagram does.
  useEffect(() => installLinkInterceptor(), []);

  // Content protection (see utils/contentProtection.ts): no saving of pictures or videos, and the screen goes black for screenshot
  // shortcuts and when the tab is hidden. The main administrator is exempt (needs their own screenshots to look after the app).
  useEffect(() => {
    if (!currentUser || isMainAdmin(currentUser)) return;
    return installContentProtection();
  }, [currentUser?.id]);

  // Language: a logged-in person gets the language saved on their account (or their account takes the one this device is showing),
  // and the translator quietly prepares the rest of the app while they use it.
  useEffect(() => {
    setSignedIn(!!currentUser);
    if (currentUser) void applyAccountLanguage();
  }, [currentUser?.id]);

  // Notifications arrive LIVE: the database tells this screen the moment one is created (Realtime), and it also
  // refreshes when the connection comes back, when the tab is opened again, and once a minute as a safety net.
  // A failed refresh (bad connection, session renewing) keeps the list already on screen rather than emptying it.
  useEffect(() => {
    if (!currentUser) return;
    let stopped = false;
    const refresh = async () => {
      try {
        const notifRes = await fetchAppNotifications();
        if (stopped || notifRes.failed || !Array.isArray(notifRes.notifications)) return;
        announceNotifications(notifRes.notifications);
        setNotifications(notifRes.notifications);
        setUnreadNotificationCount(notifRes.notifications.filter((n: any) => !n.isRead).length);
      } catch (err) {
        console.error(err);
      }
    };
    const unsubscribe = subscribeToNotificationChanges(refresh);
    const stopInterval = setVisibleInterval(refresh, 60000);   // rests while the page is hidden
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      unsubscribe();
      stopInterval();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [currentUser?.id]);

  // Soft-ask for push notification permission a few seconds after login — only on the website (the
  // Push API isn't reliably available inside the Capacitor native-app WebView, which has its own
  // native push path this doesn't cover), only for someone who installed it (shouldShowPushPrompt
  // checks it's running standalone — Home Screen on iOS, "Install app" on Android/desktop — never an
  // ordinary browser tab), and only once per browser (it also checks actual Notification.permission
  // and a localStorage "already asked" flag, so this never nags someone who already answered).
  useEffect(() => {
    if (!currentUser || Capacitor.isNativePlatform()) return;
    if (!shouldShowPushPrompt()) return;
    const timer = setTimeout(() => setShowPushPrompt(true), 1500);
    return () => clearTimeout(timer);
  }, [currentUser?.id]);

  // The account's own settings and its muted / favourite lists belong to whoever is signed in: forget them when the account changes, read them for the new one.
  useEffect(() => {
    resetSettingsStore();
    resetFeedLists();
    if (!currentUser?.id) return;
    void loadSettings(true);
    void loadFeedLists();
  }, [currentUser?.id]);

  // Keeps this account's "last seen" moving while the tab/app stays open (the admin panel's last-seen column).
  useEffect(() => {
    if (!currentUser) return;
    // 'app' is the real Android app only; the website put on the home screen is 'pwa' (still the website, so no "has the app" tick in the admin panel); a browser tab is 'web'.
    const platform = detectPlatform(Capacitor.isNativePlatform(), isInstalled());
    const stopLastSeen = startLastSeenHeartbeat(platform);
    return () => stopLastSeen();
  }, [currentUser?.id]);

  // Shows this session as online (the live status in chats and the admin panel) for as long as this tab/app stays open - Presence is per-connection, so it disappears on its
  // own when the tab closes or the socket drops. When the person turned Activity status off (Settings and activity) it is sent as hidden. The choice is read first, so a hidden account is
  // never shown for even a moment. If it cannot be read (offline, update not installed yet) the usual behaviour applies.
  const activityStatusOn = useSetting('activity.status');
  useEffect(() => {
    if (!currentUser) return;
    const platform = detectPlatform(Capacitor.isNativePlatform(), isInstalled());
    let cancelled = false;
    let stopPresence = () => {};
    void loadSettings().then(() => {
      if (!cancelled) stopPresence = startPresenceHeartbeat(currentUser.id, platform, !getSettings()['activity.status']);
    });
    return () => { cancelled = true; stopPresence(); };
  }, [currentUser?.id, activityStatusOn]);

  // Prompt for contacts access (to suggest friends already on NOOB) once per
  // install, and only on the native app — there is no contacts permission to
  // request on the website, so this must never fire there.
  useEffect(() => {
    if (!currentUser || !Capacitor.isNativePlatform()) return;
    if (localStorage.getItem('noob_find_friends_prompted')) return;

    localStorage.setItem('noob_find_friends_prompted', '1');
    setShowFindFriendsModal(true);
  }, [currentUser?.id]);

  // Once someone is signed in, nudge the server's cleanup (finished Daily NOOB days, files nothing uses any more). The server ignores it if it ran in the last 10 minutes.
  useEffect(() => { if (currentUser?.id) pokeMediaCleanup(); }, [currentUser?.id]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      setInitialLoadFailed(false);
      const [user, pList, trayData, rList, notifRes] = await Promise.all([
        loadSignedInUser(), // a failed request is an error (Retry screen), not "logged out"
        fetchPosts(),
        fetchHomeStoryTray(),
        fetchReels(),
        fetchAppNotifications().catch(() => ({ notifications: [] as AppNotification[], failed: true }))
      ]);
      // Best-effort only: keeps this device's last-seen time fresh for the device list, but never
      // forces a logout from here. This used to also sign a conflicting session out on every app
      // load/refresh — but every tab in a browser shares the same device id (see utils/deviceId.ts),
      // so two DIFFERENT accounts open in two tabs (an already-supported, unrelated feature — see
      // services/tabSessions.ts) could trip this and knock one of them out on a refresh. Single-device
      // enforcement now only ever acts at the moment of an explicit login/signup (AuthView.tsx), the
      // one place it's unambiguous which account is actually trying to sign in.
      if (user) void checkAndRegisterDevice(getDeviceId(), getDeviceLabel());
      setCurrentUser(user);
      setPosts(pList);
      setStories(trayData.stories);
      setHomeSuggestions(trayData.suggestions);
      setTraySeed(Math.random());
      setReels(rList);
      // The people list is the heaviest request there is and nothing on the first screen needs it: it loads after Home is up (and Explore, opened meanwhile, shares the same request).
      if (user) void fetchUsers().then((list) => { if (list.length) setRegisteredUsers(list); });
      if (notifRes && !notifRes.failed && Array.isArray(notifRes.notifications)) {
        announceNotifications(notifRes.notifications, true);   // the first load: everything here is already known
        setNotifications(notifRes.notifications);
        setUnreadNotificationCount(notifRes.notifications.filter((n: any) => !n.isRead).length);
      }
    } catch (err) {
      console.error('Failed to load initial data:', err);
      setInitialLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  // Both handlers only ever searched whatever was ALREADY loaded (the current reels/feed page) —
  // a reel or post from outside that locally-loaded set silently opened the generic reels/feed
  // screen instead of the real thing. Fetching it directly and injecting it into local state first
  // (so ReelsView's own "put the deep-linked reel first" logic, and PostCard's real DOM element,
  // both have something to find) is what actually fixes that — used by both the "?post=/?reel="
  // URL deep link and tapping a shared post/reel card in chat.
  const handleNavigateToReel = async (reelId: string) => {
    if (!reels.some((r) => r.id === reelId)) {
      const reel = await fetchReelById(reelId);
      if (!reel) return; // not found, or not allowed to view — nothing to open
      setReels((prev) => (prev.some((r) => r.id === reelId) ? prev : [reel, ...prev]));
    }
    setSelectedReelId(reelId);
    setActiveTab('reels');
  };

  const handleReelsGoBack = () => {
    setActiveTab(previousTabRef.current);
  };

  const handleNavigateToVideo = async (videoId: string) => {
    setSelectedVideoId(videoId);
    setActiveTab('videos');
  };

  const handleNavigateToPost = async (postId: string) => {
    if (!posts.some((p) => p.id === postId)) {
      const post = await fetchPostById(postId);
      if (!post) return;
      setPosts((prev) => (prev.some((p) => p.id === postId) ? prev : [post, ...prev]));
    }
    setActiveTab('feed');
    // FeedView paginates and shuffles its own order, so a post could easily sit outside whatever's
    // currently rendered — handing it the id (like initialReelId for Reels) lets it guarantee the
    // post is actually loaded/visible before trying to scroll, instead of this just hoping the DOM
    // node already exists.
    setSelectedPostId(postId);
  };

  const handleNavigateToUserProfile = (user: User, isUpdate = false) => {
    // isUpdate: the same profile, with newer details, arriving after it was already opened (nothing else changes: not the page, not the scroll)
    if (isUpdate) {
      pageLayers.update({ id: 'p:' + user.id, kind: 'profile', user });
      return;
    }
    preloadProfile().catch(() => undefined);
    if (user.id === currentUser?.id || user.username?.toLowerCase() === currentUser?.username?.toLowerCase()) {
      // my own profile is the Profile tab
      setActiveTab('profile');
    } else {
      // someone else's profile opens on top of the page that is showing; the page stays where it is, and "Go to previous page" comes back to it
      pageLayers.push({ id: 'p:' + user.id, kind: 'profile', user });
    }
  };

  // The Fun pages of the three-line menu open on top of the page that is showing, like a profile: closing them (or the phone's back button) returns to that page exactly as it was.
  const openFun = (loc: FunLocation) => {
    if (featuresOff.has(funFeatureKey(loc.feature))) return;   // that fun page is switched off for users
    const top = pageLayers.layers[pageLayers.layers.length - 1]?.data;
    if (top && top.kind === 'fun') pageLayers.update({ id: 'fun', kind: 'fun', loc });   // already on a Fun page: move within it
    else pageLayers.push({ id: 'fun', kind: 'fun', loc });
  };

  // A link that leads to one of NOOB's own Fun pages (the button on a Story: /ask/<name>, /polls/<id>...) opens inside the app, with the way back, instead of in the phone's browser.
  useEffect(() => {
    setInAppLinkHandler((url) => {
      try {
        const u = new URL(url, window.location.origin);
        if (!isOwnHost(u.hostname)) return false;
        const loc = parseFunPath(u.pathname);
        if (!loc) return false;
        setActiveStoryViewerIndex(null);   // the Story is left behind; "Back" returns to the page that was under it
        openFun(loc);
        return true;
      } catch { return false; }
    });
    return () => setInAppLinkHandler(null);
  });

  // A Fun page opened from its own address: once someone is logged in it opens on top of Home.
  useEffect(() => {
    if (!currentUser || !bootFun) return;
    if (featuresOff.has(funFeatureKey(bootFun.feature))) { setBootFun(null); return; }
    pageLayers.push({ id: 'fun', kind: 'fun', loc: bootFun });
    setBootFun(null);
  }, [currentUser?.id, bootFun]);

  // The address follows the page that is showing, so it can be copied, shared, refreshed and gone back to (like chatgpt.com/c/<id>):
  //  * a Fun page or someone's profile opened on top of a page shows its own address (/polls/<id>, /u/<name>); closing it brings the page's own address back (the browser
  //    restores the address of the history entry that Back returns to);
  //  * a bottom-bar page shows /explore, /reels ... : every move to another page adds a history entry, so the browser's Back (and the phone's) returns to the page before.
  const topLayerData = pageLayers.layers[pageLayers.layers.length - 1]?.data;
  const layerCount = pageLayers.layers.length;
  const layerCountRef = useRef(layerCount);
  layerCountRef.current = layerCount;
  useEffect(() => {
    if (!currentUser || bootFun) return;   // the address of a page that is still waiting to be opened is left alone
    try {
      const here = window.location.pathname;
      if (topLayerData && topLayerData.kind === 'fun') {
        const want = funPath(topLayerData.loc);
        if (here !== want) window.history.replaceState(window.history.state, '', want + window.location.search);
      } else if (topLayerData && topLayerData.kind === 'profile') {
        const want = contentPath('profile', topLayerData.user.username);
        if (here !== want) window.history.replaceState(window.history.state, '', want);
      } else if (parseFunPath(here) || parseContentPath(here)) {
        window.history.replaceState(window.history.state, '', TAB_PATHS[activeTabRef.current] + window.location.search);
      }
    } catch { /* the page works without it */ }
  }, [topLayerData, currentUser?.id, bootFun]);

  const addressFirst = useRef(true);
  const cameByHistory = useRef(false);
  useEffect(() => {
    if (!currentUser || bootFun || isCoachingHost()) return;
    const tab = activeTab;
    afterHistoryIdle(() => {
      if (layerCountRef.current > 0) return;   // a page opened on top of this one has its own address
      try { showTabAddress(tab, addressFirst.current || cameByHistory.current); } catch { /* the page works without it */ }
      addressFirst.current = false;
      cameByHistory.current = false;
    });
  }, [activeTab, currentUser?.id, bootFun, layerCount]);
  // The browser's Back / Forward (or the phone's back button) landing on a page of the bottom bar: show that page
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      if (isCoachingHost()) return;
      const tab = tabFromHistoryEntry(e.state, window.location.pathname);
      if (!tab || tab === activeTabRef.current) return;
      cameByHistory.current = true;
      setActiveTabState(tab);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);


  // --- SMART POST OR REEL ACTIONS ---
  // Deliberately doesn't catch its own errors — PostCreationModal awaits
  // this and needs the rejection to know a post/reel actually failed (e.g.
  // hitting the daily free-tier limit) instead of showing success anyway.
  const handleCreatePostOrReel = async (data: {
    isReel?: boolean;
    reelData?: Partial<Reel>;
    postData?: Partial<Post>;
  }) => {
    if (data.isReel && data.reelData) {
      const newReel = await createReel(data.reelData);
      setReels((prev) => [newReel, ...prev]);
      setSelectedReelId(newReel.id);
      setActiveTab('reels');
    } else if (data.postData) {
      const newPost = await createPost(data.postData);
      setPosts((prev) => [newPost, ...prev]);
      setActiveTab('feed');
    }
  };

  // --- POST ACTIONS ---
  // The heart changes at once; the server is told in the background (see utils/likeSync.ts).
  const handleToggleLike = (postId: string) => {
    const before = postsRef.current.find((p) => p.id === postId) ?? findPinnedPost(postId);   // a pinned post may not be in the loaded feed
    if (!before) return;
    const want = !before.isLiked;
    const show = (isLiked: boolean, likesCount: number) => {
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, isLiked, likesCount } : p)));
      patchPinnedPost(postId, { isLiked, likesCount });
    };
    show(want, Math.max(0, before.likesCount + (want ? 1 : -1)));
    sendLike(`post:${postId}`, want, () => toggleLikePost(postId), (r) => show(r.isLiked, r.likesCount), () => show(before.isLiked, before.likesCount));
  };

  const handleToggleSave = async (postId: string) => {
    try {
      const res = await toggleSavePost(postId);
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, isSaved: res.isSaved } : p))
      );
      patchPinnedPost(postId, { isSaved: res.isSaved });
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleArchive = async (postId: string) => {
    try {
      const res = await toggleArchivePost(postId);
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, isArchived: res.isArchived } : p))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleComments = async (postId: string) => {
    try {
      const res = await toggleCommentsPost(postId);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, isCommentsDisabled: res.isCommentsDisabled } : p
        )
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleLikeCount = async (postId: string) => {
    try {
      const res = await toggleLikeCountPost(postId);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, isLikeCountHidden: res.isLikeCountHidden } : p
        )
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeletePost = async (postId: string) => {
    try {
      await deletePost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteSlide = async (postId: string, slideId: string) => {
    try {
      const res = await deletePostSlide(postId, slideId);
      if (res.success && res.post) {
        setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, slides: res.post!.slides } : p)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreatePost = async (postData: Partial<Post>) => {
    try {
      const newPost = await createPost(postData);
      setPosts([newPost, ...posts]);
      setActiveTab('feed');
    } catch (err) {
      console.error(err);
    }
  };

  // --- STORY ACTIONS ---
  // Takes an array because a poll turns into a second story "page" (see CreateStoryModal) that must
  // be posted right after the main one — sequential, not parallel, so they land in the right order.
  const handleCreateStory = async (storyDataList: Partial<Story>[]) => {
    try {
      const newStories: Story[] = [];
      for (const storyData of storyDataList) {
        newStories.push(await createStory(storyData));
      }
      setStories([...newStories.reverse(), ...stories]);
    } catch (err) {
      console.error(err);
    }
  };

  // Tapping a circle in the tray: play from that person's first unseen story. The order is frozen for as long as the viewer is open.
  const handleOpenStoryViewer = (index: number) => {
    const list = storyTray.viewerStories;
    if (!list[index]) return;
    setStoryViewerOrder(list.map((s) => s.id));
    setActiveStoryViewerIndex(index);
    if (list[index].userId === currentUser?.id) {
      // the server never counts the owner as a viewer, so "I have looked at my own story" is remembered on this device
      const next = new Set<string>(ownSeenStoryIds);
      storyTray.own.storyIds.forEach((id) => next.add(id));
      setOwnSeenStoryIds(next);
      saveOwnSeenStoryIds(next);
    }
  };

  // The viewer reports each story the moment it is shown, so the ring in the tray turns grey as soon as it is closed.
  const handleStoryViewed = (storyId: string) => {
    setStories((prev) => prev.map((s) => (s.id === storyId && !s.isViewed ? { ...s, isViewed: true } : s)));
  };

  const handleAddStoryComment = async (storyId: string, text: string) => {
    try {
      const newComment = await addCommentToStory(storyId, text);
      // A malformed/failed response must never be pushed into the list —
      // a single undefined/null entry there crashes the whole app the next
      // time this story's comments render (this is exactly what used to
      // happen when the server endpoint didn't exist yet).
      if (!newComment || !newComment.id) return;
      setStories((prev) =>
        prev.map((s) =>
          s.id === storyId ? { ...s, comments: [...(s.comments || []), newComment] } : s
        )
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteStory = async (storyId: string) => {
    try {
      await deleteStory(storyId);
      setStories((prev) => prev.filter((s) => s.id !== storyId));
    } catch (err) {
      console.error(err);
    }
  };

  // The server call itself happens inside StoryViewerModal (it needs the optimistic update right
  // where the tap happened); this just keeps this top-level `stories` state in sync with the
  // confirmed result, so a like survives the viewer being closed and reopened — without this, the
  // viewer re-seeds its liked state from this same (until now never-updated) array every time it
  // mounts fresh, making an already-saved like look like it never saved.
  const handleToggleStoryLike = (storyId: string, isLiked: boolean, likesCount: number) => {
    setStories((prev) => prev.map((s) => (s.id === storyId ? { ...s, isLiked, likesCount } : s)));
  };

  // --- PROFILE ACTIONS ---
  const handleUpdateBio = async (newBio: string) => {
    try {
      const updatedUser = await updateUserBio(newBio);
      setCurrentUser(updatedUser);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateStatusNote = async (note: StatusNote | undefined) => {
    try {
      const updatedUser = await updateUserStatusNote(note);
      setCurrentUser(updatedUser);
    } catch (err) {
      console.error(err);
    }
  };

  // Every Follow / Requested button goes through here. The button changes AT ONCE (what the tap will most likely turn into, see utils/followPredict.ts)
  // and the server's answer is put in when it arrives; if the follow failed, the old state comes back. A second tap while the first is still
  // travelling joins it instead of sending another.
  const followInFlight = useRef(new Map<string, Promise<any>>());
  const handleToggleFollowUser = (userId: string): Promise<any> => {
    const running = followInFlight.current.get(userId);
    if (running) return running;
    const job = (async () => {
      const target = registeredUsers.find((u) => u.id === userId) || pageLayers.layers.map((l) => (l.data.kind === 'profile' ? l.data.user : null)).find((u) => u && u.id === userId) || undefined;
      const before = {
        isFollowing: !!target?.isFollowing || (currentUser?.followingIds || []).includes(userId),
        isFollowRequested: !!target?.isFollowRequested
      };
      const apply = (st: { isFollowing: boolean; isFollowRequested: boolean }, followers: number | undefined) => {
        setRegisteredUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, isFollowing: st.isFollowing, isFollowRequested: st.isFollowRequested, ...(followers !== undefined ? { followersCount: followers } : {}) } : u))
        );
        setCurrentUser((cur) => {
          if (!cur) return cur;
          const list = cur.followingIds || [];
          const next = st.isFollowing ? [...list.filter((id) => id !== userId), userId] : list.filter((id) => id !== userId);
          return next.length === list.length && next.every((id, i) => id === list[i]) ? cur : { ...cur, followingIds: next, followingCount: next.length };
        });
        pageLayers.patch('p:' + userId, (l) => (l.kind === 'profile'
          ? { ...l, user: { ...l.user, isFollowing: st.isFollowing, isFollowRequested: st.isFollowRequested, ...(followers !== undefined ? { followersCount: followers } : {}) } }
          : l));
      };
      if (target) {
        const guess = predictFollowToggle(before, target);
        apply(guess, predictFollowersCount(target.followersCount, before, guess));
      }
      try {
        const res = await toggleFollowUser(userId);
        if (res && res.success === false) {
          if (target) apply(before, target.followersCount);   // it did not go through: back to how it was
          return res;
        }
        apply({ isFollowing: !!res.isFollowing, isFollowRequested: !!res.isFollowRequested }, res.followersCount);
        return res;
      } catch (err) {
        console.error(err);
        if (target) apply(before, target.followersCount);
      }
    })().finally(() => { followInFlight.current.delete(userId); });
    followInFlight.current.set(userId, job);
    return job;
  };

  // Removes someone from MY OWN followers list — updates their followingIds (what the followers
  // list is derived from), not mine, since this never changes who I follow.
  const handleRemoveFollower = async (followerId: string) => {
    try {
      const res = await removeFollower(followerId);
      if (!res.success) return res;
      setRegisteredUsers((prev) =>
        prev.map((u) =>
          u.id === followerId
            ? { ...u, followingIds: (u.followingIds || []).filter((id) => id !== currentUser?.id) }
            : u
        )
      );
      if (currentUser) {
        setCurrentUser({ ...currentUser, followersCount: res.followersCount ?? Math.max(0, (currentUser.followersCount || 0) - 1) });
      }
      return res;
    } catch (err) {
      console.error(err);
      return { success: false };
    }
  };

  const handleOpenNotifications = () => {
    setShowNotificationsModal(true);
    setUnreadNotificationCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    // Persist "read" server-side too — otherwise this resets back to
    // unread on the very next login/page load, since the server never
    // actually remembered which notifications had been seen.
    markNotificationsAsRead().catch((err) => console.error('Failed to mark notifications as read:', err));
  };

  const handleClearAllNotifications = async () => {
    try {
      await clearAllNotifications();
    } catch (err) {
      console.error('Failed to clear notifications:', err);
    }
    // Clear locally regardless — these are permanently dismissed for this
    // user server-side too, so they won't come back on the next fetch.
    setNotifications([]);
    setUnreadNotificationCount(0);
  };

  const handleAcceptFollowRequest = async (notifId: string, actorId: string) => {
    try {
      const res = await acceptFollowRequest(actorId);
      if (!res.success) return;
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notifId
            ? { ...n, actionStatus: 'accepted', text: 'You accepted their noob request.' }
            : n
        )
      );
      // The requester is the one who now follows US — from our side that
      // shows up as them being a follower, not us following them.
      setRegisteredUsers((prev) =>
        prev.map((u) => (u.id === actorId ? { ...u, followingIds: [...(u.followingIds || []), currentUser?.id || ''] } : u))
      );
      setCurrentUser((prev) => (prev ? { ...prev, followersCount: res.followersCount } : null));
    } catch (err) {
      console.error('Failed to accept follow request:', err);
    }
  };

  const handleDeclineFollowRequest = async (notifId: string, actorId: string) => {
    try {
      const res = await declineFollowRequest(actorId);
      if (!res.success) return;
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notifId
            ? { ...n, actionStatus: 'declined', text: 'Noob request dismissed.' }
            : n
        )
      );
    } catch (err) {
      console.error('Failed to decline follow request:', err);
    }
  };

  const handleRespondSuggestedUser = async (notifId: string, actorId: string, accept: boolean) => {
    try {
      const res = await respondToSuggestedUser(notifId, accept);
      if (!res.success) return;
      setNotifications((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, actionStatus: accept ? 'accepted' : 'declined' } : n))
      );
      if (accept) {
        setRegisteredUsers((prev) =>
          prev.map((u) => (u.id === actorId ? { ...u, isFollowing: !!res.isFollowing, isFollowRequested: !!res.isFollowRequested } : u))
        );
        if (currentUser && res.isFollowing) {
          const curFollowing = currentUser.followingIds || [];
          if (!curFollowing.includes(actorId)) {
            setCurrentUser({ ...currentUser, followingIds: [...curFollowing, actorId], followingCount: curFollowing.length + 1 });
          }
        }
      }
    } catch (err) {
      console.error('Failed to respond to suggested user:', err);
    }
  };

  const handleGoLiveTap = () => {
    setShowPostCreationModal(false);
    if (hostIsLive) { setLiveMinimized(false); return; }   // already live: back to it
    if (currentUser.hasLiveLounge) setShowGoLiveHost(true);
    else setShowLiveLoungeUpsell(true);
  };

  useEffect(() => { if (showPostCreationModal) void import('./components/LiveStream/LiveStreamView'); }, [showPostCreationModal]);   // the live screen's file is fetched while the Create sheet is open

  const closeHostLive = () => { setShowGoLiveHost(false); setLiveMinimized(false); setLiveInfo({ phase: 'setup' }); };
  // "Turn off live": ends the stream for everyone, then the live screen goes (which also lets go of the camera and the microphone)
  const endHostLive = async () => {
    if (endingLive) return;
    setEndingLive(true);
    try {
      if (liveInfo.id) await endLiveStream(liveInfo.id);
    } catch (err) {
      console.error('Could not end the live:', err);
    } finally {
      setEndingLive(false);
      closeHostLive();
      setShowPostCreationModal(false);
    }
  };

  const handleSelectNavTab = (tab: NavTab) => {
    const offKey = TAB_FEATURE[tab];
    if (offKey && featuresOff.has(offKey)) return;   // the page is switched off for users
    if (tab === 'post') {
      setShowPostCreationModal(true);
    } else if (pageLayers.layers.length > 0 && tab === activeTab) {
      // the tab you are already on: back to that page, exactly where you left it (the profile opened over it closes)
      pageLayers.clear({ restore: true });
    } else {
      setActiveTab(tab);
    }
  };

  const handleAuthSuccess = (user: User) => {
    if (user && user.id) {
      setSessionUserId(user.id);
    }
    setSessionEndedNotice(null);
    setCurrentUser(user);
    loadInitialData();
  };

  const handleLogout = async () => {
    // sessionEndedNotice only gets set by the false-suspension detector
    // above and is never cleared afterward — once it fires even once, it's
    // stuck in this component's state for the rest of the tab's life and
    // resurfaces on the login screen every subsequent time the user logs
    // out, voluntarily or not, even long after the account was confirmed
    // fine. A deliberate logout right here is definitionally not a
    // suspension, so it must always clear it.
    setSessionEndedNotice(null);
    try {
      setSessionUserId(null);
      await logoutUser();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setSessionUserId(null);
      setCurrentUser(null);
      setViewAsUser(false);
    }
  };

  // Self-service account deletion — permanently deletes only the calling
  // user's own account (Google Play requires this for any app with account
  // creation). Returns the server result so the Settings UI can show an
  // error inline instead of silently logging out on a wrong password.
  const handleDeleteMyAccount = async (password: string) => {
    const res = await deleteMyAccount(password);
    if (res.success) {
      setCurrentUser(null);
    }
    return res;
  };

  if (loading) {
    return (
      <>
        {isUpdateAvailable && <UpdateAvailableBanner />}
        <div className="doodle-wallpaper-feed w-full h-screen flex flex-col items-center justify-center text-white">
          <NoobStackLoader mode="quick" />
        </div>
      </>
    );
  }

  if (initialLoadFailed) {
    // NOOB could not reach its servers: only the "short break" page is shown, and it tries again by itself
    return <SystemPage kind="down" onRetry={loadInitialData} />;
  }

  // If no user is logged in, present the main Login / Sign Up Page
  if (!currentUser) {
    if (bootRoute && publicRouteOpen) {
      // a post / reel / video / profile opened from its link: anyone can look at it first; "Log in" leaves this page (the address stays, so it opens inside the app afterwards)
      return (
        <>
          {isUpdateAvailable && <UpdateAvailableBanner />}
          <ErrorBoundary showErrorDetails>
            <React.Suspense fallback={<LazyFallback />}>
              <PublicContentPage route={bootRoute} onLogin={() => setPublicRouteOpen(false)} />
            </React.Suspense>
          </ErrorBoundary>
        </>
      );
    }
    if (bootFun && publicFunOpen) {
      // asking someone a question or looking at a poll from a shared link: look first, log in when it is time to send or vote
      const leaveFunPublic = () => setPublicFunOpen(false);   // (the address is kept: it opens as soon as someone has logged in)
      return (
        <>
          {isUpdateAvailable && <UpdateAvailableBanner />}
          <ErrorBoundary showErrorDetails>
            <React.Suspense fallback={<LazyFallback />}>
              <FunHub currentUser={null} location={bootFun} onNavigate={setBootFun} onBack={leaveFunPublic} onHome={leaveFunPublic} onLogin={leaveFunPublic} />
            </React.Suspense>
          </ErrorBoundary>
        </>
      );
    }
    if (anonPublic) {
      const leaveAnonymous = () => { try { window.history.replaceState(null, '', '/' + window.location.search); } catch { /* nothing to undo */ } setAnonPublic(false); };
      return (
        <>
          {isUpdateAvailable && <UpdateAvailableBanner />}
          <ErrorBoundary showErrorDetails>
            <React.Suspense fallback={<LazyFallback />}>
              <AnonymousMessagesPage currentUser={null} onClose={leaveAnonymous} onLogin={leaveAnonymous} />
            </React.Suspense>
          </ErrorBoundary>
        </>
      );
    }
    return (
      <>
        {isUpdateAvailable && <UpdateAvailableBanner />}
        <AuthView onAuthSuccess={handleAuthSuccess} notice={sessionEndedNotice || undefined} hint={bootNotice || undefined} />
      </>
    );
  }

  // coaching.nooob.xyz: the whole page is NOOB STUDY (the logo, then the admission form for a new student, or the study space for a member)
  if (isCoachingHost()) {
    return (
      <>
        {isUpdateAvailable && <UpdateAvailableBanner />}
        <CoachingEntry currentUser={currentUser} />
      </>
    );
  }

  // The NOOB account opens straight into the admin console instead of the normal app — see
  // AdminControlModal's fullPage mode, which is exactly this same panel with its dialog chrome
  // swapped for a whole-screen layout and a Log Out button in place of a close button. "Use as
  // User" (viewAsUser) steps out of this gate entirely so the admin can browse the real app; the
  // computer icon on their own profile page (ProfileView) flips it back.
  if (isMainAdmin(currentUser) && !viewAsUser) {
    return (
      <>
        {isUpdateAvailable && <UpdateAvailableBanner />}
        {incomingCall && (
          <IncomingCallModal ring={incomingCall} onAccept={acceptIncomingCall} onDecline={declineIncomingCall} />
        )}
        <React.Suspense fallback={<LazyFallback />}>
          <AdminControlModal
            currentUser={currentUser}
            fullPage
            onClose={() => {}}
            onLogout={handleLogout}
            onUseAsUser={() => setViewAsUser(true)}
          />
        </React.Suspense>
      </>
    );
  }

  // Whole-app maintenance lock (Admin Control Panel → Platform) — the main admin already returned
  // above regardless of this, so only a real visitor ever sees this screen.
  if (platformSettings?.maintenanceEnabled) {
    return (
      <>
        {isUpdateAvailable && <UpdateAvailableBanner />}
        <div className="w-full h-screen bg-black flex flex-col items-center justify-center text-white p-6 text-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-2xl">
            🛠️
          </div>
          <div>
            <h2 className="text-base font-bold text-white">NOOB is under maintenance</h2>
            <p className="text-xs text-zinc-400 mt-1.5 max-w-xs">{platformSettings.maintenanceMessage}</p>
          </div>
        </div>
      </>
    );
  }

  const otherUsers = registeredUsers.filter((u) => u.id !== currentUser.id && u.username !== currentUser.username);
  if (visitedTabs.current.uid !== currentUser.id) visitedTabs.current = { uid: currentUser.id, tabs: new Set<NavTab>() };   // another account: nothing of the last one is kept
  if (KEEP_ALIVE_TABS.includes(activeTab)) visitedTabs.current.tabs.add(activeTab);
  const kept = visitedTabs.current.tabs;
  // the page that is really showing: a profile layer counts as the Profile page for the layout
  const pageTab: NavTab = pageLayers.layers.length > 0 ? 'profile' : activeTab;

  // The profile page: my own (the Profile tab) or someone else's (a layer on top of the page that was showing, with "Go to previous page")
  const renderProfileView = (viewing: User | null) => (
    <React.Suspense fallback={<ProfileSkeleton user={viewing || currentUser} />}><ProfileView
      currentUser={currentUser}
      viewingUser={viewing}
      allUsers={registeredUsers}
      posts={posts}
      reels={reels}
      onSelectPost={(post) => {
        handleNavigateToPost(post.id);
      }}
      onUpdateBio={handleUpdateBio}
      onOpenProfessionalDashboard={() => setShowProfessionalDashboardModal(true)}
      onLogout={handleLogout}
      onDeleteMyAccount={handleDeleteMyAccount}
      onUserUpdated={(u) => setCurrentUser(u)}
      onToggleFollowUser={handleToggleFollowUser}
      onRemoveFollower={handleRemoveFollower}
      onGoBack={pageLayers.back}
      onOpenFunPage={openFun}
      onNavigateToChatWithUser={(targetUser) => {
        setPendingChatUser(targetUser);
        setActiveTab('chat');
      }}
      onNavigateToUserProfile={handleNavigateToUserProfile}
      onOpenLongVideo={handleNavigateToVideo}
      onSwitchToAdminPanel={isMainAdmin(currentUser) ? () => setViewAsUser(false) : undefined}
    /></React.Suspense>
  );

  return (
    <FeatureFlagsContext.Provider value={featuresOff}>
    <div className={`min-h-screen bg-page text-white selection:bg-red-500 selection:text-white font-sans antialiased flex flex-row items-start justify-center p-0 lg:p-6 lg:gap-8 xl:justify-start xl:pl-0 ${pageTab === 'feed' ? 'xl:pr-4' : ''} overflow-x-hidden`}>
      {isUpdateAvailable && <UpdateAvailableBanner />}
      <SignupSourceCard userId={currentUser.id} />
      {incomingCall && (
        <IncomingCallModal ring={incomingCall} onAccept={acceptIncomingCall} onDecline={declineIncomingCall} />
      )}
      {/* 1. Left Desktop Sidebar (shown on xl: screens) */}
      <aside className="hidden xl:flex flex-col w-[240px] 2xl:w-[272px] h-[92vh] sticky top-6 justify-between pb-4 shrink-0 select-none xl:h-screen xl:top-0 xl:-my-6 xl:py-6 xl:px-3 xl:border-r xl:border-white/5 xl:overflow-hidden" data-testid="desktop-side-menu">
        {/* The menu scrolls inside itself on a short screen, the profile box under it never gets pushed out of sight */}
        <div className="space-y-7 min-h-0 flex-1 overflow-y-auto no-scrollbar pb-3" data-testid="desktop-side-menu-scroll">
          {/* Logo & Brand Header */}
          <div className="flex items-center gap-3 px-2">
            <LogoLightbox className="w-10 h-10 rounded-[24%] overflow-hidden border border-white/15 shadow-[0_0_20px_rgba(255,255,255,0.12)] cursor-pointer hover:border-white/50 transition-colors" />
            <div>
              <span className="text-lg font-black tracking-tight text-white flex items-center gap-1.5">
                NOOB <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-bold border border-red-500/30">APP</span>
              </span>
              <span className="text-[10px] text-zinc-500 block -mt-0.5">Fun & Connect</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            <button
              onClick={() => handleSelectNavTab('feed')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'feed'
                  ? 'bg-zinc-900/90 text-white border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.15)] font-bold'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900/40'
              }`}
            >
              <Home className={`w-4 h-4 ${activeTab === 'feed' ? 'stroke-red-500' : 'stroke-current'}`} />
              <span>Home</span>
            </button>

            {featOn('explore') && (
              <button
                onClick={() => handleSelectNavTab('explore')}
                className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'explore'
                    ? 'bg-zinc-900/90 text-white border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.15)] font-bold'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900/40'
                }`}
              >
                <Compass className={`w-4 h-4 ${activeTab === 'explore' ? 'stroke-red-500' : 'stroke-current'}`} />
                <span>Explore People</span>
              </button>
            )}

            {featOn('reels') && (
              <button
                onClick={() => handleSelectNavTab('reels')}
                className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'reels'
                    ? 'bg-zinc-900/90 text-white border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.15)] font-bold'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900/40'
                }`}
              >
                <Film className={`w-4 h-4 ${activeTab === 'reels' ? 'stroke-red-500' : 'stroke-current'}`} />
                <span>Reels</span>
              </button>
            )}

            {featOn('videos') && (
              <button
                onClick={() => handleSelectNavTab('videos')}
                className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'videos'
                    ? 'bg-zinc-900/90 text-white border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.15)] font-bold'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900/40'
                }`}
              >
                <Youtube className={`w-4 h-4 ${activeTab === 'videos' ? 'stroke-red-500' : 'stroke-current'}`} />
                <span>Feed</span>
              </button>
            )}

            {featOn('create') && (
              <button
                onClick={() => handleSelectNavTab('post')}
                className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-semibold text-black bg-noob hover:bg-noob/90 transition-all cursor-pointer shadow-[0_0_15px_rgba(255,255,255,0.25)]"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Create</span>
              </button>
            )}

            <button
              onClick={handleOpenNotifications}
              className="w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-900/40 transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3.5">
                <Bell className="w-4 h-4 text-emerald-400 group-hover:rotate-12 transition-transform" />
                <span>Activity & Alerts</span>
              </div>
              {unreadNotificationCount > 0 ? (
                <span className="px-2 py-0.5 text-[9px] font-black rounded-full bg-noob text-black animate-pulse">
                  {unreadNotificationCount}
                </span>
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
              )}
            </button>

            {featOn('chat') && (
              <button
                onClick={() => handleSelectNavTab('chat')}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'chat'
                    ? 'bg-zinc-900/90 text-white border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.15)] font-bold'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900/40'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <MessageSquare className={`w-4 h-4 ${activeTab === 'chat' ? 'stroke-red-500' : 'stroke-current'}`} />
                  <span>Direct Chat</span>
                </div>
                {unreadChatCount > 0 && (
                  <span className="px-2 py-0.5 text-[9px] font-black rounded-full bg-red-600 text-white animate-bounce">
                    {unreadChatCount}
                  </span>
                )}
              </button>
            )}

            {featOn('games') && (
              <button
                onClick={() => handleSelectNavTab('games')}
                className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'games'
                    ? 'bg-zinc-900/90 text-noob border border-noob/30 shadow-[0_0_15px_rgba(255,255,255,0.15)] font-bold'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900/40'
                }`}
              >
                <Gamepad2 className={`w-4 h-4 ${activeTab === 'games' ? 'stroke-noob' : 'stroke-current'}`} />
                <span>Mini-Games</span>
              </button>
            )}

            {!musicHidden && (
              <button
                onClick={() => handleSelectNavTab('music')}
                className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'music'
                    ? 'bg-zinc-900/90 text-noob border border-noob/30 shadow-[0_0_15px_rgba(255,255,255,0.15)] font-bold'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900/40'
                }`}
              >
                <Music className={`w-4 h-4 ${activeTab === 'music' ? 'stroke-noob' : 'stroke-current'}`} />
                <span>Music Hub</span>
              </button>
            )}

            {/* Desktop/tablet-only shortcuts (this whole sidebar is hidden below the xl breakpoint) —
                same destinations the Profile ⋮ menu already opens, just reachable directly here too. */}
            {featOn('lounge') && (
              <button
                onClick={() => setShowLiveLoungeUpsell(true)}
                className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-900/40 transition-all cursor-pointer"
              >
                <Radio className="w-4 h-4 stroke-current" />
                <span>Meetings</span>
              </button>
            )}

            {featOn('ai') && (
              <button
                onClick={() => setShowNoobAiPage(true)}
                className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-900/40 transition-all cursor-pointer"
              >
                <Bot className="w-4 h-4 stroke-current" />
                <span>NOOB AI</span>
              </button>
            )}

            <button
              onClick={() => setShowWalletModal(true)}
              className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-900/40 transition-all cursor-pointer"
            >
              <WalletIcon className="w-4 h-4 stroke-current" />
              <span>Wallet</span>
            </button>

            <button
              onClick={() => setShowSubscriptionsModal(true)}
              className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-900/40 transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4 stroke-current" />
              <span>Subscriptions</span>
            </button>

            {/* Insights are for business accounts only. (Customer support is the round button at the bottom right.) */}
            {currentUser.isBusiness && (
              <button
                onClick={() => setShowProfessionalDashboardModal(true)}
                className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-900/40 transition-all cursor-pointer"
              >
                <BarChart3 className="w-4 h-4 text-purple-400" />
                <span>Account Insights</span>
              </button>
            )}
          </nav>
        </div>

        {/* Profile Desk Widget */}
        <div className="shrink-0 bg-zinc-900/60 hover:bg-zinc-900/90 border border-white/5 p-3 rounded-2xl transition-all shadow-lg" data-testid="desktop-side-profile">
          <div className="flex items-center gap-3">
            <div
              onClick={() => handleSelectNavTab('profile')}
              className="relative cursor-pointer"
            >
              <AvatarMedia
                src={currentUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                isLiveAvatar={currentUser.isLiveAvatar}
                liveAvatarVideoUrl={currentUser.liveAvatarVideoUrl}
                alt={currentUser.username}
                className="w-9 h-9 rounded-full object-cover ring-2 ring-red-500/60"
              />
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-black" />
            </div>
            <div
              onClick={() => handleSelectNavTab('profile')}
              className="min-w-0 flex-1 cursor-pointer"
            >
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold text-white truncate">{currentUser.displayName || currentUser.username}</span>
                {currentUser.isVerified ? <VerifiedBadge size="xs" /> : <CheckCircle2 className="w-3 h-3 text-red-500 shrink-0" />}
              </div>
              <span className="text-[10px] text-zinc-400 font-medium block truncate">@{currentUser.username}</span>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
              title="Log Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* 2. Center View / Main App Screen Container */}
      <main
        className={`relative w-full max-w-[480px] ${
          pageTab === 'chat' ? 'md:max-w-4xl 2xl:max-w-5xl' : pageTab === 'feed' ? 'md:max-w-2xl' : 'md:max-w-2xl 2xl:max-w-[800px] 3xl:max-w-[880px]'
        } ${pageTab === 'feed' ? 'xl:flex-1 xl:min-w-0 xl:max-w-[1200px] xl:mx-auto' : 'xl:ml-auto'} bg-page doodle-wallpaper lg:rounded-[40px] lg:border lg:border-zinc-800/80 shadow-2xl flex flex-col min-h-screen lg:min-h-[92vh] ${
          // The chat tab reserves its own bottom-nav clearance internally (its container's height
          // is already calc(100vh-80px)) — adding this pb-24 on top of that double-reserved the
          // same space, pushing the whole page taller than one viewport and creating a second,
          // unwanted page-level scroll on top of the chat list's own internal scroll.
          pageTab === 'chat' ? '' : 'pb-24'
        } overflow-hidden shrink-0`}
      >
        {/* the page that is showing; it stays alive (hidden) while a profile is open on top of it */}
        <PageLayerSlot layerId={0} hidden={pageLayers.layers.length > 0} register={pageLayers.register}>
        {kept.has('feed') && (
          <KeepAliveTab hidden={activeTab !== 'feed'}>
          <FeedView
            currentUser={currentUser}
            posts={visiblePosts}
            stories={stories}
            storyTray={storyTray}
            reels={reels}
            unreadNotificationCount={unreadNotificationCount}
            unreadChatCount={unreadChatCount}
            latestNotification={notifications.find((n) => !n.isRead) || notifications[0]}
            onToggleLike={handleToggleLike}
            onToggleSave={handleToggleSave}
            onToggleArchive={handleToggleArchive}
            onToggleComments={handleToggleComments}
            onToggleLikeCount={handleToggleLikeCount}
            onDeletePost={handleDeletePost}
            onDeleteSlide={handleDeleteSlide}
            onOpenStoryViewer={handleOpenStoryViewer}
            onOpenCreateStory={() => setShowCreateStoryModal(true)}
            onOpenPostCreation={() => setShowPostCreationModal(true)}
            onOpenStatusNoteModal={() => setShowStatusNoteModal(true)}
            onOpenNotifications={handleOpenNotifications}
            onRefreshFeed={loadInitialData}
            onNavigateToPost={handleNavigateToPost}
            onNavigateToReel={handleNavigateToReel}
            onNavigateToVideo={handleNavigateToVideo}
            onNavigateToProfile={handleNavigateToUserProfile}
            onOpenFunPage={openFun}
            onOpenTab={handleSelectNavTab}
            musicHidden={musicHidden}
            onToggleFollowUser={handleToggleFollowUser}
            allUsers={registeredUsers}
            onUserUpdated={(u) => setCurrentUser(u)}
            sparkxOpen={platformSettings?.sparkxOpen !== false}
            joinTeamOpen={platformSettings?.joinTeamOpen !== false}
            initialPostId={selectedPostId}
            onInitialPostIdHandled={() => setSelectedPostId(undefined)}
          />
          </KeepAliveTab>
        )}

        {kept.has('explore') && (
          <KeepAliveTab hidden={activeTab !== 'explore'}>
          <React.Suspense fallback={<TabBurgerLoading />}><ExploreView
            currentUser={currentUser}
            posts={visiblePosts}
            reels={reels}
            onSelectPost={(post) => {
              handleNavigateToPost(post.id);
            }}
            onSelectReel={(reel) => {
              handleNavigateToReel(reel.id);
            }}
            onStartChat={(user) => {
              setActiveTab('chat');
            }}
            onNavigateToUserProfile={handleNavigateToUserProfile}
            onToggleFollowUser={handleToggleFollowUser}
            autoOpenJoinTeam={pendingJoinTeam}
            onAutoOpenJoinTeamHandled={() => setPendingJoinTeam(false)}
            joinTeamOpen={platformSettings?.joinTeamOpen !== false}
            initialSearchQuery={pendingExploreSearch || undefined}
            onInitialSearchQueryHandled={() => setPendingExploreSearch(null)}
          /></React.Suspense>
          </KeepAliveTab>
        )}

        {activeTab === 'reels' && (
          <div className="py-2 px-2">
            <React.Suspense fallback={<TabBurgerLoading />}><ReelsView
              reels={reels}
              currentUser={currentUser}
              initialReelId={selectedReelId}
              onToggleFollowUser={handleToggleFollowUser}
              onGoBack={handleReelsGoBack}
              onNavigateToProfile={handleNavigateToUserProfile}
              onUseSound={(sound) => { setCreateSound(sound); setCreateKind('reel'); }}
            /></React.Suspense>
          </div>
        )}

        {activeTab === 'videos' && (
          <React.Suspense fallback={<TabBurgerLoading />}>
            <HomeVideoFeedView
              currentUser={currentUser}
              onOpenUpload={() => setShowUploadVideoModal(true)}
              onNavigateToProfile={handleNavigateToUserProfile}
              refreshKey={videosRefreshKey}
              initialOpenVideoId={selectedVideoId}
              onInitialOpenVideoIdHandled={() => setSelectedVideoId(undefined)}
            />
          </React.Suspense>
        )}

        {activeTab === 'chat' && (
          <div className="py-2 px-2">
            <ErrorBoundary
              fallback={
                <div className="w-full max-w-6xl mx-auto h-[calc(100vh-var(--nav-h))] min-h-[580px] max-h-[880px] rounded-2xl border border-zinc-800/80 bg-zinc-950 flex items-center justify-center p-6">
                  <div className="max-w-sm w-full text-center space-y-4">
                    <div className="text-4xl">😬</div>
                    <h2 className="text-white text-base font-bold">This chat ran into a problem</h2>
                    <p className="text-zinc-400 text-sm">
                      The rest of NOOB is unaffected — your account and messages are safe. Reloading usually fixes it.
                    </p>
                    <button
                      onClick={hardReload}
                      className="w-full py-3 bg-noob text-black font-bold rounded-xl hover:scale-[1.02] transition-transform cursor-pointer"
                    >
                      Reload NOOB
                    </button>
                  </div>
                </div>
              }
            >
              <React.Suspense fallback={<TabBurgerLoading />}>
                <ChatView
                  currentUser={currentUser}
                  pendingChatUser={pendingChatUser}
                  onPendingChatUserHandled={() => setPendingChatUser(null)}
                  pendingChatId={pendingChatId}
                  onPendingChatIdHandled={() => setPendingChatId(null)}
                  pendingCallChatId={pendingCallChatId}
                  onPendingCallChatIdHandled={() => setPendingCallChatId(null)}
                  onMobileViewChange={(view) => setChatConversationOpenOnMobile(view === 'chat')}
                  onUserUpdated={(u) => setCurrentUser(u)}
                  onNavigateToProfile={handleNavigateToUserProfile}
                  onNavigateToPost={handleNavigateToPost}
                  onNavigateToReel={handleNavigateToReel}
                  onNavigateToVideo={handleNavigateToVideo}
                  onPlayGame={(gameId, challengerUsername, roomCode) => {
                    const matched = ALL_50_MINI_GAMES.find(
                      (g) => g.id === gameId || g.id.toLowerCase() === gameId.toLowerCase()
                    );
                    if (matched) {
                      setGameToPlay({
                        game: matched,
                        challenger: challengerUsername,
                        roomCode
                      });
                    }
                  }}
                />
              </React.Suspense>
            </ErrorBoundary>
          </div>
        )}

        {activeTab === 'games' && (
          <React.Suspense fallback={<TabBurgerLoading />}><GamesView
            currentUser={currentUser}
            allUsers={registeredUsers}
            onUserUpdated={(u) => setCurrentUser(u)}
            onNavigateToUserProfile={handleNavigateToUserProfile}
          /></React.Suspense>
        )}

        {activeTab === 'music' && !musicHidden && (
          <React.Suspense fallback={<TabBurgerLoading />}><MusicHubView currentUser={currentUser} /></React.Suspense>
        )}

        {activeTab === 'profile' && renderProfileView(null)}
        </PageLayerSlot>

        {/* profiles opened from the page above: each is its own page, the one on top shows, the ones under it wait exactly as they were */}
        {pageLayers.layers.map((layer, i) => (
          <PageLayerSlot key={layer.id} layerId={layer.id} hidden={i !== pageLayers.layers.length - 1} register={pageLayers.register}>
            {layer.data.kind === 'profile' ? renderProfileView(layer.data.user) : (
              <ErrorBoundary showErrorDetails>
                <React.Suspense fallback={<LazyFallback />}>
                  <FunHub
                    currentUser={currentUser}
                    location={layer.data.loc}
                    onNavigate={openFun}
                    onBack={pageLayers.back}
                    onHome={() => setActiveTab('feed')}
                    onOpenProfile={handleNavigateToUserProfile}
                  />
                </React.Suspense>
              </ErrorBoundary>
            )}
          </PageLayerSlot>
        ))}
      </main>

      {/* 3. Right Desktop Sidebar (Registered People & Community) */}
      <aside className={`hidden lg:flex flex-col w-[280px] 2xl:w-[340px] 3xl:w-[380px] h-[92vh] sticky top-6 space-y-6 shrink-0 select-none ${pageTab === 'feed' ? '' : 'xl:mr-auto'}`} data-testid="desktop-people-panel">
        {/* Community People Directory: fills the sidebar from the top down to the footer links, and scrolls when there are more people */}
        <div className="bg-zinc-900/40 p-5 rounded-[28px] border border-white/5 shadow-xl backdrop-blur-md flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-between mb-3.5 shrink-0">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-red-500" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">NOOB Members</h3>
            </div>
            {featOn('explore') && (
              <button
                onClick={() => setActiveTab('explore')}
                className="text-[10px] font-semibold text-red-400 hover:underline cursor-pointer"
              >
                Explore all
              </button>
            )}
          </div>

          <div className="space-y-3.5 flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar pr-1">
            {otherUsers.length === 0 ? (
              <div className="text-center py-4 text-xs text-zinc-500">
                You are the first member! Invite friends to sign up.
              </div>
            ) : (
              otherUsers.slice(0, 60).map((user) => (
                <div key={user.id} className="flex items-center justify-between gap-2">
                  <div
                    onClick={() => handleNavigateToUserProfile(user)}
                    className="flex items-center gap-2.5 min-w-0 cursor-pointer group"
                    title={`View @${user.username}'s profile`}
                  >
                    <img
                      src={user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                      alt={user.username}
                      className="w-8 h-8 rounded-full object-cover ring-1 ring-white/10 group-hover:ring-red-500"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-xs font-bold text-white truncate block group-hover:text-red-400">
                          {user.displayName || user.username}
                        </span>
                        {user.isVerified && <VerifiedBadge size="xs" />}
                      </div>
                      <span className="text-[10px] text-zinc-500 truncate block">
                        @{user.username}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggleFollowUser(user.id)}
                    className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all cursor-pointer shrink-0 ${
                      user.isFollowing
                        ? 'bg-zinc-800 text-zinc-300 hover:text-pink-400'
                        : user.isFollowRequested
                        ? 'bg-purple-950 text-purple-300 border border-purple-500/40'
                        : 'bg-gradient-to-r from-[#ff4e6a] to-[#ff758c] text-white hover:opacity-90 shadow-sm'
                    }`}
                  >
                    {user.isFollowing ? 'Noobed' : user.isFollowRequested ? 'Requested' : user.accountType === 'private' ? 'Request' : 'Noob'}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Minimal Sophisticated Footer Links */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-zinc-500 text-[10px] px-2 shrink-0">
          <button onClick={() => setShowPrivacyModal(true)} className="hover:underline cursor-pointer">
            Privacy Policy
          </button>
          <span>•</span>
          <button onClick={() => setShowTermsModal(true)} className="hover:underline cursor-pointer">
            Terms & Conditions
          </button>
          {featOn('explore') && (
            <>
              <span>•</span>
              <span onClick={() => setActiveTab('explore')} className="hover:underline cursor-pointer">
                Explore People
              </span>
            </>
          )}
          <div className="w-full text-zinc-600 text-[9px] mt-1">
            © 2026 NOOB • Fun & Connecting People
          </div>
        </div>
      </aside>

      {/* Bottom navigation bar (phones and tablets; computers have the side menu) */}
      <FloatingNavBar
        activeTab={activeTab}
        onSelectTab={handleSelectNavTab}
        onPressTab={(tab) => { const hit = TAB_PRELOADS.find(([t]) => t === tab); if (hit) void hit[1]().catch(() => {}); }}
        userAvatar={currentUser.avatar}
        unreadChatCount={unreadChatCount}
        hideOnMobile={activeTab === 'chat' && chatConversationOpenOnMobile && pageLayers.layers.length === 0}
      />

      {/* Floating AI Customer Support Quick-Trigger Button (Bottom Right - hidden in Chat to prevent input overlap, hidden in Reels since it sits right on top of the mute/sound toggle there) */}
      {activeTab !== 'chat' && activeTab !== 'reels' && featOn('support') && (
        <button
          onClick={() => setShowCustomerSupportModal(true)}
          className="fixed bottom-24 lg:bottom-8 right-4 sm:right-8 z-40 w-14 h-14 hover:scale-105 transition-all cursor-pointer group"
          title="Open NOOB AI Assistant"
        >
          <img
            src="/noob-support-logo.png"
            alt="NOOB AI Support"
            className="w-full h-full object-contain group-hover:rotate-12 transition-transform drop-shadow-[0_4px_16px_rgba(0,0,0,0.5)]"
          />
          <span className="absolute top-0 right-0 w-3 h-3 bg-noob rounded-full ring-2 ring-black animate-pulse" />
        </button>
      )}

      {/* --- MODALS --- */}
      {/* 0. AI Customer Support Modal */}
      {showCustomerSupportModal && (
        <React.Suspense fallback={<LazyFallback />}>
          <CustomerSupportModal
            currentUser={currentUser}
            onClose={() => setShowCustomerSupportModal(false)}
          />
        </React.Suspense>
      )}

      {/* 0.5 Find Friends from Contacts (native app only, shown once per install) */}
      {showFindFriendsModal && currentUser && (
        <React.Suspense fallback={null}><FindFriendsModal
          currentUser={currentUser}
          registeredUsers={registeredUsers}
          onClose={() => setShowFindFriendsModal(false)}
          onToggleFollowUser={handleToggleFollowUser}
        /></React.Suspense>
      )}

      {/* 0.6 Push notification soft-ask (website only, shown once per browser) */}
      {showPushPrompt && <PushNotificationPrompt onDone={() => setShowPushPrompt(false)} />}
      <MiniToast />
      {currentUser && <TimeReminder />}
      {currentUser && <NativeUpdateBanner />}
      {currentUser && <AndroidAppPrompt />}
      {currentUser && <RenditionStrip />}
      <InAppBrowserHost />
      <NoobDrawHost currentUser={currentUser} onUserUpdated={(u) => setCurrentUser(u)} />
      <StudioHost onUse={(file, target) => {
        closeStudio();
        if (target === 'story') { setStudioStoryFile(file); setShowCreateStoryModal(true); }
        else { setStudioFile(file); setCreateKind(target); }
      }} />
      <TeamJoinHost currentUser={currentUser} />
      <StudyHost currentUser={currentUser} />

      {/* 1. Fullscreen Story Viewer */}
      {activeStoryViewerIndex !== null && storyViewerStories[activeStoryViewerIndex] && (
        <React.Suspense fallback={null}><StoryViewerModal
          stories={storyViewerStories}
          initialIndex={activeStoryViewerIndex}
          onClose={() => setActiveStoryViewerIndex(null)}
          currentUser={currentUser}
          onStoryViewed={handleStoryViewed}
          onAddComment={handleAddStoryComment}
          onToggleLike={handleToggleStoryLike}
          onDeleteStory={handleDeleteStory}
          onNavigateToProfile={handleNavigateToUserProfile}
          onNavigateToHashtag={(tag) => {
            setActiveStoryViewerIndex(null);
            setPendingExploreSearch(tag);
            setActiveTab('explore');
          }}
        /></React.Suspense>
      )}

      {/* 2. Story Creation Modal */}
      {showCreateStoryModal && (
        <React.Suspense fallback={null}><CreateStoryModal
          initialFile={studioStoryFile}
          onClose={() => { setShowCreateStoryModal(false); setStudioStoryFile(null); }}
          onSubmitStory={handleCreateStory}
          allUsers={registeredUsers}
        /></React.Suspense>
      )}

      {/* 3. Create: what to make (like Instagram's Create sheet) ... */}
      {showPostCreationModal && (
        <React.Suspense fallback={null}><CreateChooser
          live={hostIsLive ? { onReturn: () => { setShowPostCreationModal(false); setLiveMinimized(false); }, onEnd: () => void endHostLive(), ending: endingLive } : undefined}
          onClose={() => setShowPostCreationModal(false)}
          onPick={(kind) => {
            setShowPostCreationModal(false);
            if (kind === 'post' || kind === 'reel' || kind === 'thought') setCreateKind(kind);
            else if (kind === 'story') setShowCreateStoryModal(true);
            else if (kind === 'studio') { if (featOn('studio')) openStudio(); }
            else if (kind === 'video') setShowUploadVideoModal(true);
            else if (kind === 'live') handleGoLiveTap();
          }}
        /></React.Suspense>
      )}

      {/* ... and the Post / Reel / Thought creator: pick, edit, details */}
      {createKind && (
        <React.Suspense fallback={null}><PostCreationModal
          key={createKind}
          initialType={createKind}
          initialAudio={createSound}
          initialFile={studioFile}
          currentUser={currentUser}
          allUsers={registeredUsers}
          onClose={() => { setCreateKind(null); setCreateSound(null); setStudioFile(null); }}
          onSubmitPost={handleCreatePostOrReel}
        /></React.Suspense>
      )}

      {/* 3b. Long-form Video Upload Modal (Home tab's "+") */}
      {showUploadVideoModal && (
        <React.Suspense fallback={<LazyFallback />}>
          <UploadVideoModal
            onClose={() => setShowUploadVideoModal(false)}
            onUploaded={() => {
              setShowUploadVideoModal(false);
              setVideosRefreshKey((k) => k + 1);
            }}
          />
        </React.Suspense>
      )}

      {showGoLiveHost && (
        <React.Suspense fallback={<LazyFallback />}>
          <LiveStreamView
            currentUser={currentUser}
            mode="host"
            minimized={liveMinimized}
            onMinimize={() => setLiveMinimized(true)}
            onStateChange={(phase, id) => setLiveInfo({ phase, id })}
            onClose={closeHostLive}
          />
        </React.Suspense>
      )}

      {/* While the live is minimized: you are still live — a way back and a button to turn it off */}
      {hostIsLive && liveMinimized && (
        <div
          data-testid="live-bar"
          className="fixed left-1/2 -translate-x-1/2 bottom-[calc(var(--nav-h)+0.75rem)] z-40 w-[92%] max-w-[420px] flex items-center gap-2 rounded-2xl bg-zinc-950/95 border border-red-500/50 shadow-2xl backdrop-blur-xl pl-3 pr-2 py-2"
        >
          <span className="relative flex w-2.5 h-2.5 shrink-0"><span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-70" /><span className="relative w-2.5 h-2.5 rounded-full bg-red-500" /></span>
          <span className="flex-1 min-w-0 text-sm font-bold text-white truncate">You are live</span>
          <button onClick={() => setLiveMinimized(false)} className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold cursor-pointer">Return</button>
          <button onClick={() => void endHostLive()} disabled={endingLive} className="px-3 py-1.5 rounded-full bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-xs font-bold cursor-pointer">
            {endingLive ? 'Ending…' : 'Turn off live'}
          </button>
        </div>
      )}

      {showLiveLoungeUpsell && (
        <React.Suspense fallback={<LazyFallback />}>
          <LiveLoungePage
            currentUser={currentUser}
            allUsers={registeredUsers}
            initialRoomId={liveLoungeInviteRoomId || undefined}
            initialJoinCode={sharedLiveLoungeCode || undefined}
            initialJoinPasscode={sharedLiveLoungePasscode || undefined}
            initialMeetingId={liveLoungeMeetingId || undefined}
            onClose={() => { setShowLiveLoungeUpsell(false); setLiveLoungeInviteRoomId(null); setSharedLiveLoungeCode(null); setSharedLiveLoungePasscode(null); setLiveLoungeMeetingId(null); }}
            onUserUpdated={(u) => setCurrentUser(u)}
          />
        </React.Suspense>
      )}

      {showNoobAiPage && (
        <React.Suspense fallback={<LazyFallback />}>
          <NoobAiPage onClose={() => setShowNoobAiPage(false)} isMainAdmin={isMainAdmin(currentUser)} />
        </React.Suspense>
      )}

      {showWalletModal && (
        <React.Suspense fallback={<LazyFallback />}>
          <AccountsStatisticsModal
            currentUser={currentUser}
            allUsers={registeredUsers}
            onClose={() => setShowWalletModal(false)}
            onUserUpdated={(u) => setCurrentUser(u)}
          />
        </React.Suspense>
      )}

      {showSubscriptionsModal && (
        <React.Suspense fallback={<LazyFallback />}>
          <ProFeaturesModal
            currentUser={currentUser}
            onClose={() => { setShowSubscriptionsModal(false); setProLink(null); }}
            onUserUpdated={(u) => setCurrentUser(u)}
            allUsers={registeredUsers}
            focusTier={proLink?.tier}
            focusBilling={proLink?.billing}
          />
        </React.Suspense>
      )}

      {/* 4. Professional Dashboard Modal */}
      {showProfessionalDashboardModal && (
        <React.Suspense fallback={<LazyFallback />}>
          <ProfessionalDashboardModal
            currentUser={currentUser}
            onClose={() => setShowProfessionalDashboardModal(false)}
            onUserUpdated={(u) => setCurrentUser(u)}
          />
        </React.Suspense>
      )}

      {/* 6. Notifications & Following Activity Modal */}
      {showNotificationsModal && (
        <React.Suspense fallback={null}><NotificationsModal
          currentUser={currentUser}
          notifications={notifications}
          notificationSettings={notificationSettings}
          onUpdateSettings={setNotificationSettings}
          onAcceptFollowRequest={handleAcceptFollowRequest}
          onDeclineFollowRequest={handleDeclineFollowRequest}
          onFollowBack={handleToggleFollowUser}
          onRespondSuggestedUser={handleRespondSuggestedUser}
          onClearAll={handleClearAllNotifications}
          onClose={() => setShowNotificationsModal(false)}
          onOpenScratchCard={(id) => setActiveScratchCardId(id)}
          onOpenChat={(chatId) => {
            setPendingChatId(chatId);
            setActiveTab('chat');
            setShowNotificationsModal(false);
          }}
          onOpenLiveLoungeInvite={(roomId) => {
            setLiveLoungeInviteRoomId(roomId);
            setLiveLoungeMeetingId(null);
            setShowLiveLoungeUpsell(true);
            setShowNotificationsModal(false);
          }}
          onOpenLiveLoungeMeeting={(meetingId) => {
            setLiveLoungeInviteRoomId(null);
            setSharedLiveLoungeCode(null);
            setLiveLoungeMeetingId(meetingId);
            setShowLiveLoungeUpsell(true);
            setShowNotificationsModal(false);
          }}
        /></React.Suspense>
      )}

      {activeScratchCardId && (
        <React.Suspense fallback={null}><ScratchCardModal
          scratchCardId={activeScratchCardId}
          onClose={() => setActiveScratchCardId(null)}
          onUserUpdated={(u) => setCurrentUser(u)}
        /></React.Suspense>
      )}

      {/* 7. Status Note & Music Snippet Modal */}
      {showStatusNoteModal && (
        <React.Suspense fallback={null}><StatusNoteModal
          currentUser={currentUser}
          onClose={() => setShowStatusNoteModal(false)}
          onSaveNote={handleUpdateStatusNote}
        /></React.Suspense>
      )}

      {/* 8. Legal Modals */}
      {showTermsModal && (
        <TermsAndConditions onClose={() => setShowTermsModal(false)} />
      )}
      {showPrivacyModal && (
        <PrivacyPolicy onClose={() => setShowPrivacyModal(false)} />
      )}

      {/* 9. Direct 1v1 Game Play Modal */}
      {gameToPlay && (
        <React.Suspense fallback={<LazyFallback />}>
          <GamePlayModal
            game={gameToPlay.game}
            currentUser={currentUser}
            allUsers={registeredUsers}
            initialChallenger={gameToPlay.challenger}
            initialRoomCode={gameToPlay.roomCode}
            onClose={() => setGameToPlay(null)}
            onPointsUpdated={(_pointsEarned, totalPoints) => {
              setCurrentUser((prev) => (prev ? { ...prev, noobPoints: totalPoints } : prev));
            }}
          />
        </React.Suspense>
      )}
    </div>
    </FeatureFlagsContext.Provider>
  );
}
