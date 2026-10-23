import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { orderUnseenFirst, mergeIntoOrder } from '../../utils/seenContent';
import {
  Bell,
  Video,
  Sparkles,
  RefreshCw,
  SlidersHorizontal,
  ChevronDown,
  Filter,
  CheckCircle2,
  Users,
  UserPlus,
  UserCheck,
  Heart,
  MessageCircle,
  X,
  ArrowDown,
  Loader2,
  Rocket,
  Handshake,
  Coins,
  Menu,
  Flame,
  Trophy,
  ShoppingBag,
  Music2,
  Lightbulb,
  Gift,
  GraduationCap,
  Youtube,
  Music
} from 'lucide-react';
import { openNoobDraw } from '../Draw/drawStore';
import { openStudio, useStudioState } from '../Studio/studioStore';
import { preloadStudio } from '../Studio/StudioHost';
import { Wand2 } from 'lucide-react';
import { VenetianMask } from 'lucide-react';
import { ScrollMoreHint, useScrollMore } from './ScrollMoreHint';
import { useFullPage } from '../../utils/fullPage';
import { captureScroll, restoreScroll, usePageHidden, LAYERS_BACK_EVENT, LAYERS_CLEARED_EVENT, type ScrollSnapshot } from '../../utils/pageLayers';
import { markMenuEntry, currentMenuEntry, scrollToMenuEntry } from '../../utils/menuReturn';
import { useNoobDrawOpen } from '../Draw/drawStore';
import { useStudyNav } from '../Study/studyStore';
import { Zap, MessageCircleQuestion, Smile, BarChart3 } from 'lucide-react';
import { FUN_FEATURES, type FunFeature, type FunLocation } from '../../utils/funRoutes';
import { openStudy } from '../Study/studyStore';
import { useStudyStatus } from '../Study/studyStatus';
import { preloadNoobStudy } from '../Study/StudyHost';
import { preloadNoobDraw } from '../Draw/NoobDrawHost';
import { Post, Reel, Story, User, AppNotification } from '../../types';
import { StoryTray } from '../Stories/StoryTray';
import { BurgerLoading } from '../Common/BurgerLoading';
import { favouriteCount, isFavourite, isPostMuted, useFeedLists } from '../../services/settingsApi';
import type { StoryTrayModel } from '../../utils/storyTray';
import { PinnedFeedSection } from './PinnedFeedSection';
import { usePinnedFeedItems, refreshPinnedFeed } from '../../services/pinnedFeed';
import { PostCard } from './PostCard';
import { holdSongs } from '../../utils/songSound';
import { useMusicPlayer } from '../../context/MusicPlayerContext';
import { CommentsSheet } from './CommentsSheet';
import { FeedVideoWatchView } from './FeedVideoWatchView';
import { SparkXApplicationModal } from './SparkXApplicationModal';
import { JoinUsModal } from '../Explore/JoinUsModal';
import { ErrorBoundary } from '../ErrorBoundary';
import { NoobAiPage } from '../Profile/NoobAiPage';
import { MenuBanner } from './MenuBanner';
import { AdBanner } from '../Ads/AdBanner';
import { MoreCreations } from './MoreCreations';
import { NoobAiLogo } from '../Profile/NoobAiLogo';
import { SuggestionBoxModal } from '../Support/SuggestionBoxModal';
import { takeRestorePage, setResumePage } from '../../utils/pageResume';
import { isMainAdmin } from '../../adminAccess';
import { requestPostBonusOffer, fetchSettings } from '../../services/api';
import { startsInsideOverlay } from '../../utils/pullToRefresh';

// The shop and the food stall (with the map and QR code libraries they use) are only fetched when somebody opens them.
const StorePage = React.lazy(() => import('../Store/StorePage').then((m) => ({ default: m.StorePage })));
const FoodStallView = React.lazy(() => import('../Store/FoodStallView').then((m) => ({ default: m.FoodStallView })));
const OurTeamPage = React.lazy(() => import('../Team/OurTeamPage'));
const loadAnonymousPage = () => import('../Anonymous/AnonymousMessagesPage');
const AnonymousMessagesPage = React.lazy(() => loadAnonymousPage().then((m) => ({ default: m.AnonymousMessagesPage })));
const preloadOurTeam = () => { void import('../Team/OurTeamPage'); };
const preloadFunHub = () => { void import('../Fun/FunHub'); };
// The four Fun pages in the menu, with the icon each one wears there.
const FUN_MENU_TONES: Record<FunFeature, 'pick' | 'ask' | 'mood' | 'polls'> = { 'this-or-that': 'pick', ask: 'ask', mood: 'mood', polls: 'polls' };
const FUN_MENU_ICONS: Record<FunFeature, React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = { 'this-or-that': Zap, ask: MessageCircleQuestion, mood: Smile, polls: BarChart3 };
const DailyNoobView = React.lazy(() => import('../Daily/DailyNoobView').then((m) => ({ default: m.DailyNoobView })));
const NoobRoomsLobbyView = React.lazy(() => import('../NoobRooms/NoobRoomsLobbyView').then((m) => ({ default: m.NoobRoomsLobbyView })));
const GuessTheSongView = React.lazy(() => import('../NoobRooms/GuessTheSongView').then((m) => ({ default: m.GuessTheSongView })));
const LiveLoungePage = React.lazy(() => import('../Profile/LiveLoungePage').then((m) => ({ default: m.LiveLoungePage })));
const CustomerSupportModal = React.lazy(() => import('../Support/CustomerSupportModal').then((m) => ({ default: m.CustomerSupportModal })));

// A visible spinner instead of a blank Suspense fallback — on a slow connection the first tap of any
// of these menu items could otherwise look like it did nothing for several seconds.
const LazyFallback: React.FC = () => <BurgerLoading />;

interface FeedViewProps {
  currentUser: User;
  posts: Post[];
  stories: Story[];
  // Who is in the home-page story tray and in which order (utils/storyTray.ts); `stories` is kept for callers that only need the raw list.
  storyTray: StoryTrayModel;
  reels?: Reel[];
  unreadNotificationCount?: number;
  unreadChatCount?: number;
  latestNotification?: AppNotification | null;
  notificationSettingsEnabled?: boolean;
  onToggleLike: (postId: string) => void;
  onToggleSave: (postId: string) => void;
  onToggleArchive: (postId: string) => void;
  onToggleComments: (postId: string) => void;
  onToggleLikeCount: (postId: string) => void;
  onDeletePost: (postId: string) => void;
  onDeleteSlide?: (postId: string, slideId: string) => void;
  onOpenStoryViewer: (index: number) => void;   // an index into storyTray.viewerStories
  onOpenCreateStory: () => void;
  // Create moved to this header (used to be a bottom-nav tab) — opens the post/reel picker.
  onOpenPostCreation?: () => void;
  onOpenStatusNoteModal: () => void;
  onClearStatusNote?: () => void;
  onOpenNotifications: () => void;
  onRefreshFeed: () => void;
  onNavigateToPost?: (postId: string) => void;
  onNavigateToReel?: (reelId: string) => void;
  onNavigateToVideo?: (videoId: string) => void;
  // A specific post to scroll to and highlight (e.g. tapped from a profile grid or Explore) — the
  // feed is shuffled and paginated, so without this the target post may not even be rendered yet.
  initialPostId?: string;
  onInitialPostIdHandled?: () => void;
  onNavigateToProfile?: (user: User) => void;
  // The Fun pages of the three-line menu (This or That, Ask Me Anything, Mood Status, Public Polls): they open on top of this page.
  onOpenFunPage?: (loc: FunLocation) => void;
  // The pages that do not fit on the bottom bar (the Videos feed and Music) open from the menu here.
  onOpenTab?: (tab: 'videos' | 'music') => void;   // Music has its own button at the top of this page, so the menu lists only Videos
  musicHidden?: boolean;
  onToggleFollowUser?: (userId: string) => Promise<{ success: boolean; isFollowing: boolean; isFollowRequested?: boolean } | void>;
  // Admin Control Panel → Platform switches (both open unless switched off)
  sparkxOpen?: boolean;
  joinTeamOpen?: boolean;
  // For the hamburger menu's Live Lounge entry (LiveLoungePage needs the full user list to invite people).
  allUsers?: User[];
  onUserUpdated?: (user: User) => void;
}

const POSTS_PER_PAGE = 4;
const categories = ['All', 'gaming', 'tech', 'code', 'robotics', 'cad', 'fashion', 'art', 'others'];

// Posts this person hasn't seen yet (newest first) go on top; everything they've already seen, and
// their own posts, is shuffled in behind them.
const buildFeedOrder = (posts: Post[], userId: string): string[] => orderUnseenFirst(posts, userId, 'posts').map((p) => p.id);

export const FeedView: React.FC<FeedViewProps> = ({
  currentUser,
  posts,
  stories,
  storyTray,
  reels = [],
  unreadNotificationCount = 0,
  unreadChatCount = 0,
  latestNotification,
  notificationSettingsEnabled = true,
  onToggleLike,
  onToggleSave,
  onToggleArchive,
  onToggleComments,
  onToggleLikeCount,
  onDeletePost,
  onDeleteSlide,
  onOpenStoryViewer,
  onOpenCreateStory,
  onOpenPostCreation,
  onOpenStatusNoteModal,
  onOpenNotifications,
  onRefreshFeed,
  onNavigateToPost,
  onNavigateToReel,
  onNavigateToVideo,
  onNavigateToProfile,
  onOpenFunPage,
  onOpenTab,
  musicHidden = false,
  onToggleFollowUser,
  sparkxOpen = true,
  joinTeamOpen = true,
  allUsers = [],
  onUserUpdated,
  initialPostId,
  onInitialPostIdHandled
}) => {
  const [activeFeedFilter, setActiveFeedFilter] = useState<'foryou' | 'following' | 'favourites'>('foryou');
  const [showJoinUsModal, setShowJoinUsModal] = useState(false);
  const [selectedPostForComments, setSelectedPostForComments] = useState<Post | null>(null);
  const [watchVideoPost, setWatchVideoPost] = useState<Post | null>(null);
  // the songs on posts stay quiet while the full video page or the Music player makes its own sound
  const { isPlaying: musicPlaying } = useMusicPlayer();
  useEffect(() => (watchVideoPost || musicPlaying ? holdSongs() : undefined), [watchVideoPost, musicPlaying]);
  const [hiddenAdIds, setHiddenAdIds] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTopBannerDismissed, setIsTopBannerDismissed] = useState(false);
  const [isEarnPointsBannerDismissed, setIsEarnPointsBannerDismissed] = useState(false);
  const [bonusOfferAmount, setBonusOfferAmount] = useState<number | null>(null);
  const [showNoobMenu, setShowNoobMenu] = useState(false);
  // the "Scroll for more" doodle at the bottom of the three-line menu, while the list is cut off
  const menuScroll = useScrollMore(showNoobMenu);
  const studyStatus = useStudyStatus();
  // The menu page that was open when the app was closed / refreshed opens again (see utils/pageResume.ts).
  const [restoredPage] = useState(() => takeRestorePage(currentUser.id));
  const [showSuggestionBox, setShowSuggestionBox] = useState(restoredPage === 'suggestions');
  const [showDailyNoob, setShowDailyNoob] = useState(restoredPage === 'daily');
  const [showOurTeam, setShowOurTeam] = useState(false);
  // Anonymous Messages has its own address (/anonymous) so it can be opened and shared directly; the menu entry opens it, closing goes back to the home address.
  const [showAnonymous, setShowAnonymous] = useState(() => typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '') === '/anonymous');
  const openAnonymous = () => {
    try { window.history.replaceState(null, '', '/anonymous' + window.location.search); } catch { /* the page still opens */ }
    setShowAnonymous(true);
  };
  const closeAnonymous = () => {
    try { window.history.replaceState(null, '', '/' + window.location.search); } catch { /* nothing to undo */ }
    setShowAnonymous(false);
  };

  const [showNoobRooms, setShowNoobRooms] = useState(restoredPage === 'rooms');
  const [showGuessTheSong, setShowGuessTheSong] = useState(restoredPage === 'song');
  const [showLiveLoungePage, setShowLiveLoungePage] = useState(restoredPage === 'lounge');
  const [showStorePage, setShowStorePage] = useState(restoredPage === 'store');
  const [showFoodStall, setShowFoodStall] = useState(restoredPage === 'food');
  const [foodStallVisible, setFoodStallVisible] = useState(false);
  const [foodStallComingSoon, setFoodStallComingSoon] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchSettings().then((s) => {
      if (!alive) return;
      setFoodStallVisible(!!s.foodStallVisible);
      setFoodStallComingSoon(!!s.foodStallComingSoon);
    });
    return () => {
      alive = false;
    };
  }, []);
  const [showNoobAi, setShowNoobAi] = useState(restoredPage === 'ai');
  const [showSupportModal, setShowSupportModal] = useState(restoredPage === 'support');
  const [showSparkXModal, setShowSparkXModal] = useState(false);

  // Keeps note of which menu page is open (null once it is closed). A layout effect, so it is noted before the page's own effects
  // start saving their progress.
  const openPage = showDailyNoob ? 'daily' : showNoobRooms ? 'rooms' : showGuessTheSong ? 'song' : showLiveLoungePage ? 'lounge'
    : showStorePage ? 'store' : showFoodStall ? 'food' : showNoobAi ? 'ai' : showSupportModal ? 'support' : showSuggestionBox ? 'suggestions' : null;
  useLayoutEffect(() => { setResumePage(currentUser.id, openPage); }, [currentUser.id, openPage]);

  // Rolled once per mount, not re-rolled on every render — the amount has to stay the same between
  // when it's shown and when "Accept" is tapped, otherwise the number on screen would lie.
  useEffect(() => {
    if (!onOpenPostCreation) return;
    let alive = true;
    requestPostBonusOffer().then((res) => {
      if (alive && res.available && typeof res.amount === 'number') setBonusOfferAmount(res.amount);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Feed order: frozen between re-renders (so scrolling never reshuffles content under someone's
  // thumb). Built when the feed opens: anything new to this person on top, newest first, then what
  // they've already seen shuffled. When the set of posts later changes (a new post arrives, one is
  // removed) the existing order is kept and new unseen posts are added on top; only an explicit
  // pull-to-refresh rebuilds it from scratch, which is also what moves just-viewed posts back into the mix.
  const [feedOrder, setFeedOrder] = useState<string[]>(() => buildFeedOrder(posts, currentUser.id));
  const [refreshNonce, setRefreshNonce] = useState(0);
  const lastRefreshNonceRef = useRef(0);
  const postIdsKey = posts.map((p) => p.id).join(',');
  useEffect(() => {
    const refreshed = lastRefreshNonceRef.current !== refreshNonce;
    lastRefreshNonceRef.current = refreshNonce;
    setFeedOrder((prev) => (refreshed ? buildFeedOrder(posts, currentUser.id) : mergeIntoOrder(prev, posts, currentUser.id, 'posts')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postIdsKey, refreshNonce]);

  // Infinite Scroll State
  const [visibleCount, setVisibleCount] = useState(POSTS_PER_PAGE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

  // Pull-to-refresh Touch State
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // The pages of the three-line menu are separate pages. While one is open the Home page behind it is HIDDEN (not just covered): nothing of it can show through when the keyboard
  // pushes the screen up or a finger drags past the end of the page, its videos and songs stop, and the app knows this is not the place to refresh. When the page is closed Home
  // comes back exactly as it was: same posts, same place (the scroll is noted when the menu is opened, which is always before any of its pages).
  const drawOpen = useNoobDrawOpen();
  const studyOpen = useStudyNav().open;
  const menuPageOpen = !!(showAnonymous || showOurTeam || openPage || drawOpen || studyOpen);
  useFullPage(menuPageOpen);
  const homeSnapshot = useRef<ScrollSnapshot | null>(null);
  useEffect(() => { if (showNoobMenu) homeSnapshot.current = captureScroll(containerRef.current, 'feed'); }, [showNoobMenu]);
  const menuPageWasOpen = useRef(false);
  useLayoutEffect(() => {
    if (menuPageWasOpen.current && !menuPageOpen && homeSnapshot.current) { restoreScroll(homeSnapshot.current); homeSnapshot.current = null; }
    menuPageWasOpen.current = menuPageOpen;
  }, [menuPageOpen]);

  // Back to the three-line menu: a page that was opened from the menu drops the person back in the menu, at the button they pressed, when it is closed (utils/menuReturn.ts).
  // The pages of this file, Draw, Study and Studio are seen closing right here; the Fun pages are layers of the app (utils/pageLayers.tsx), which says so with an event when the
  // person goes back from the last layer. Nothing happens when Home is not on screen (another tab was opened meanwhile) or when the page was not opened from the menu.
  const pageHidden = usePageHidden();
  const pageHiddenRef = useRef(pageHidden);
  pageHiddenRef.current = pageHidden;
  const studioOpen = useStudioState().open;
  const entryPageOpen = !!(menuPageOpen || showJoinUsModal || showSparkXModal || studioOpen);
  const entryPageWasOpen = useRef(false);
  const backToMenu = () => {
    const id = currentMenuEntry();
    if (!id) return;
    markMenuEntry(null);
    setShowNoobMenu(true);
    scrollToMenuEntry(id);
  };
  useLayoutEffect(() => {
    if (entryPageWasOpen.current && !entryPageOpen) { if (pageHiddenRef.current) markMenuEntry(null); else backToMenu(); }
    entryPageWasOpen.current = entryPageOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryPageOpen]);
  useEffect(() => {
    const onBack = () => { const id = currentMenuEntry(); if (id && id.startsWith('fun-') && !pageHiddenRef.current) backToMenu(); };
    const onCleared = () => { const id = currentMenuEntry(); if (id && id.startsWith('fun-')) markMenuEntry(null); };
    window.addEventListener(LAYERS_BACK_EVENT, onBack);
    window.addEventListener(LAYERS_CLEARED_EVENT, onCleared);
    return () => { window.removeEventListener(LAYERS_BACK_EVENT, onBack); window.removeEventListener(LAYERS_CLEARED_EVENT, onCleared); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    onRefreshFeed();
    void refreshPinnedFeed(true);
    setVisibleCount(POSTS_PER_PAGE);
    setTimeout(() => {
      setIsRefreshing(false);
      setPullDistance(0);
      setRefreshNonce((n) => n + 1);
    }, 700);
  };

  const handleHideAd = (postId: string) => {
    setHiddenAdIds([...hiddenAdIds, postId]);
  };

  // Display order follows feedOrder (unseen first, then shuffled), not the raw posts array.
  const postsById = new Map(posts.map((p) => [p.id, p]));
  const orderedPosts = feedOrder.map((id) => postsById.get(id)).filter((p): p is Post => !!p);
  // A post that arrived after the last rebuild (e.g. between renders, before the effect above has
  // run) has no spot in feedOrder yet — tack it on at the front rather than hiding it.
  const knownIds = new Set(feedOrder);
  const notYetOrdered = posts.filter((p) => !knownIds.has(p.id));

  // Filter posts
  let filteredPosts = [...notYetOrdered, ...orderedPosts].filter((p) => !hiddenAdIds.includes(p.id));

  if (activeCategory !== 'All') {
    filteredPosts = filteredPosts.filter(
      (p) =>
        p.category?.toLowerCase() === activeCategory.toLowerCase() ||
        p.hashtags.some((h) => h.toLowerCase().includes(activeCategory.toLowerCase()))
    );
  }

  // Muted accounts (Settings and activity): their posts and reels do not show up here. Your own posts always do.
  const listsVersion = useFeedLists();     // redraw when the muted / favourite lists change
  // the Favourites tab only exists while there are favourites: if the last one is removed, go back to For You
  useEffect(() => { if (activeFeedFilter === 'favourites' && favouriteCount() === 0) setActiveFeedFilter('foryou'); }, [listsVersion, activeFeedFilter]);
  filteredPosts = filteredPosts.filter((p) => p.userId === currentUser.id || !isPostMuted(p.userId));

  // Favourites: only posts from the accounts you marked as favourites.
  if (activeFeedFilter === 'favourites') filteredPosts = filteredPosts.filter((p) => isFavourite(p.userId));

  // Following: only posts from the accounts you follow.
  if (activeFeedFilter === 'following') {
    const following = new Set(currentUser.followingIds || []);
    filteredPosts = filteredPosts.filter((p) => following.has(p.userId));
  }

  // What the admin pinned to the top of the Feed: shown above everything in the plain "For You / All" view, and a pinned post is not
  // repeated further down the list.
  const pinnedItems = usePinnedFeedItems();
  const showPinned = activeCategory === 'All' && activeFeedFilter === 'foryou' && pinnedItems.length > 0;
  const pinnedPostIds = new Set(showPinned ? pinnedItems.filter((i) => i.kind === 'post' && i.post).map((i) => i.itemId) : []);
  if (pinnedPostIds.size > 0) filteredPosts = filteredPosts.filter((p) => !pinnedPostIds.has(p.id));
  useEffect(() => { void refreshPinnedFeed(true); }, [currentUser.id]);

  const renderPostCard = (post: Post) => (
    <PostCard
      key={post.id}
      post={post}
      currentUser={currentUser}
      onToggleLike={onToggleLike}
      onToggleSave={onToggleSave}
      onOpenComments={(p) => setSelectedPostForComments(p)}
      onToggleArchive={onToggleArchive}
      onToggleComments={onToggleComments}
      onToggleLikeCount={onToggleLikeCount}
      onDeletePost={onDeletePost}
      onDeleteSlide={onDeleteSlide}
      onHideAd={handleHideAd}
      onSelectCategory={(cat) => setActiveCategory(cat)}
      onNavigateToProfile={onNavigateToProfile}
      allUsers={allUsers}
      onToggleFollowUser={onToggleFollowUser}
      onOpenVideoWatch={(p) => setWatchVideoPost(p)}
    />
  );

  const paginatedPosts = filteredPosts.slice(0, visibleCount);
  const hasMore = visibleCount < filteredPosts.length;

  const headerRef = useRef<HTMLElement | null>(null);
  const postListRef = useRef<HTMLElement | null>(null);
  const alignSessionRef = useRef<{ id: string; stop: (notify: boolean) => void } | null>(null);
  useEffect(() => () => alignSessionRef.current?.stop(true), []);   // leaving the feed early still clears the pending jump
  const startAlignToPost = (postId: string) => {
    alignSessionRef.current?.stop(false);
    let done = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let observer: ResizeObserver | null = null;
    const userEvents = ['wheel', 'touchstart', 'mousedown', 'keydown'] as const;
    const align = () => {
      if (done) return;
      const el = document.getElementById(`post-card-${postId}`);
      if (!el) return;
      const headerHeight = headerRef.current?.getBoundingClientRect().height ?? 0;
      const target = Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY - headerHeight - 8));
      if (Math.abs(window.scrollY - target) > 1) window.scrollTo({ top: target, behavior: 'instant' as ScrollBehavior });
    };
    const stop = (notify: boolean) => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      observer?.disconnect();
      userEvents.forEach((ev) => window.removeEventListener(ev, onUser));
      if (alignSessionRef.current?.id === postId) alignSessionRef.current = null;
      if (notify) onInitialPostIdHandled?.();
    };
    const onUser = () => stop(true);
    userEvents.forEach((ev) => window.addEventListener(ev, onUser, { passive: true }));
    if (typeof ResizeObserver !== 'undefined' && postListRef.current) {
      observer = new ResizeObserver(align);
      observer.observe(postListRef.current);
    }
    [0, 60, 160, 320, 600, 1000, 1600, 2400].forEach((ms) => timers.push(setTimeout(align, ms)));
    timers.push(setTimeout(() => stop(true), 3000));
    alignSessionRef.current = { id: postId, stop };
    align();
  };

  // Deep-linking to one specific post (from a profile grid, Explore, etc.): the feed is shuffled and
  // paginated, so the target post may not be in filteredPosts at all yet (wrong filter/tab) or may
  // sit past the currently-rendered page — in either case scrollIntoView would silently find nothing
  // and leave the view wherever it already was, which is exactly the "always lands on the top post"
  // bug this fixes. Widening visibleCount to include it guarantees its DOM node exists before the
  // scroll attempt below.
  useEffect(() => {
    if (!initialPostId) return;
    // a pinned post is drawn in the pinned section at the top: it is already on the page
    if (pinnedPostIds.has(initialPostId)) {
      if (alignSessionRef.current?.id !== initialPostId) startAlignToPost(initialPostId);
      return;
    }
    const idx = filteredPosts.findIndex((p) => p.id === initialPostId);
    if (idx === -1) {
      if (activeFeedFilter !== 'foryou') setActiveFeedFilter('foryou');
      if (activeCategory !== 'All') setActiveCategory('All');
      return;
    }
    // Show the post and a few after it: a post at the very bottom of what is rendered cannot be scrolled up to the top of the screen.
    const needed = Math.min(filteredPosts.length, idx + 1 + POSTS_PER_PAGE);
    if (visibleCount < needed) {
      setVisibleCount(needed);
      return;
    }
    // The post is on the page: take it to the top of the screen and KEEP it there while the pictures and videos above it finish
    // loading (they change the page's height after the first scroll, which used to leave the post 2-3 posts away from where the
    // person had tapped). Stops the moment they scroll or touch the screen themselves.
    if (alignSessionRef.current?.id !== initialPostId) startAlignToPost(initialPostId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPostId, filteredPosts.length, visibleCount, activeFeedFilter, activeCategory]);

  // IntersectionObserver for lag-free infinite scrolling
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || !hasMore || isLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          setIsLoadingMore(true);
          setTimeout(() => {
            setVisibleCount((prev) => Math.min(prev + POSTS_PER_PAGE, filteredPosts.length));
            setIsLoadingMore(false);
          }, 350);
        }
      },
      { rootMargin: '250px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, filteredPosts.length, visibleCount]);

  // Touch handlers for Pull-to-Refresh
  const handleTouchStart = (e: React.TouchEvent) => {
    // a finger that lands on a menu / sheet / pop-up drawn over the page is scrolling that, never pulling the page
    if (startsInsideOverlay(e.target, e.currentTarget)) return;
    if (window.scrollY <= 5) {
      touchStartY.current = e.touches[0].clientY;
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null || window.scrollY > 10) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartY.current;
    if (diff > 0) {
      // Apply elastic resistance
      const elastic = Math.min(diff * 0.45, 90);
      setPullDistance(elastic);
    }
  };

  const handleTouchEnd = () => {
    if (pullDistance > 55) {
      handleRefresh();
    } else {
      setPullDistance(0);
    }
    touchStartY.current = null;
    setIsPulling(false);
  };

  const categories = ['All', 'Fun & Humor', 'Gaming', 'Music', 'Vibes', 'Lifestyle', 'Tech'];

  return (
    <div
      id="feed-view-page"
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="doodle-wallpaper-feed w-full flex flex-col items-center pb-24 relative select-none"
    >
      {/* the Home page itself: hidden while a page of the three-line menu is open (see above) */}
      <div data-home-content style={{ display: menuPageOpen ? 'none' : 'contents' }}>
      {/* Pull To Refresh Visual Indicator */}
      <div
        className="w-full flex flex-col items-center justify-center overflow-hidden transition-all duration-200"
        style={{
          height: isRefreshing ? '50px' : `${pullDistance}px`,
          opacity: pullDistance > 10 || isRefreshing ? 1 : 0
        }}
      >
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-noob/40 text-white text-xs font-bold shadow-lg shadow-noob/10">
          {isRefreshing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 text-noob animate-spin" />
              <span className="text-noob">Updating Feed...</span>
            </>
          ) : pullDistance > 55 ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 text-noob animate-spin" />
              <span className="text-noob">Release to refresh</span>
            </>
          ) : (
            <>
              <ArrowDown className="w-3.5 h-3.5 text-zinc-400 animate-bounce" />
              <span className="text-zinc-400">Pull down to refresh</span>
            </>
          )}
        </div>
      </div>
      {/* 1. Minimalist Top Header */}
      <header ref={headerRef} className="sticky top-0 z-40 w-full bg-zinc-950/95 backdrop-blur-xl border-b border-zinc-800/80 px-2.5 py-2.5 flex items-center gap-1 shadow-sm">
        {/* Brand Wordmark + menu — the hamburger opens NOOB's extra features (Daily NOOB, Rooms) */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => { markMenuEntry(null); setShowNoobMenu(true); }}
            className="p-1 -ml-1 text-zinc-300 hover:text-white rounded-lg hover:bg-zinc-900 transition-colors cursor-pointer"
            title="More from NOOB"
          >
            <Menu className="w-4.5 h-4.5" />
          </button>
          <h1 className="text-lg font-black italic tracking-tighter text-white select-none">
            NOOB
          </h1>
        </div>

        {/* Feed Switcher — centered in the remaining space between the left and right zones, in
            normal flex flow (not absolutely positioned) so it can never overlap either of them,
            no matter how wide they get as more icons are added either side. */}
        <div className="flex-1 min-w-0 flex items-center justify-center gap-1">
          {/* Apply to join the NOOB team — a normal flex sibling now, not absolutely placed */}
          {joinTeamOpen && (
            <button
              onClick={() => setShowJoinUsModal(true)}
              className="p-1 text-zinc-400 hover:text-violet-300 rounded-lg hover:bg-zinc-900 transition-colors cursor-pointer shrink-0 max-[560px]:hidden"
              title="Join the NOOB team"
              aria-label="Join the NOOB team"
            >
              <Handshake className="w-4 h-4" />
            </button>
          )}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-full p-0.5 text-[11px] min-w-0 max-w-full">
            <button
              onClick={() => setActiveFeedFilter('foryou')}
              className={`px-2 min-[400px]:px-2.5 py-0.5 rounded-full font-medium whitespace-nowrap transition-all cursor-pointer ${
                activeFeedFilter === 'foryou'
                  ? 'bg-rose-600 text-white shadow-sm font-bold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              For You
            </button>
            <button
              onClick={() => setActiveFeedFilter('following')}
              className={`px-2 min-[400px]:px-2.5 py-0.5 rounded-full font-medium whitespace-nowrap transition-all cursor-pointer ${
                activeFeedFilter === 'following'
                  ? 'bg-rose-600 text-white shadow-sm font-bold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Following
            </button>
            {favouriteCount() > 0 && (
              <button
                onClick={() => setActiveFeedFilter('favourites')}
                data-testid="feed-favourites"
                className={`px-2 min-[400px]:px-2.5 py-0.5 rounded-full font-medium whitespace-nowrap transition-all cursor-pointer ${
                  activeFeedFilter === 'favourites'
                    ? 'bg-rose-600 text-white shadow-sm font-bold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Favourites
              </button>
            )}
          </div>
        </div>

        {/* Action Icons (Notification Bar, Refresh, Chat) */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Apply to join the SparkX team */}
          <button
            onClick={() => setShowSparkXModal(true)}
            className="p-1.5 text-zinc-400 hover:text-orange-300 rounded-lg hover:bg-zinc-900 transition-colors cursor-pointer max-[560px]:hidden"
            title="Join our SparkX team (IIT Bombay Techfest)"
          >
            <Rocket className="w-4 h-4" />
          </button>

          {/* The Music page (Create is the circled plus in the middle of the bottom bar); not drawn while the administrator has the page hidden */}
          {onOpenTab && !musicHidden && (
            <button
              onClick={() => onOpenTab('music')}
              data-testid="feed-music-button"
              className="p-1.5 bg-noob text-black rounded-lg hover:bg-noob/90 transition-colors cursor-pointer"
              title="Music"
              aria-label="Music"
            >
              <Music className="w-4 h-4 stroke-[2.5]" />
            </button>
          )}

          {/* Notifications Bar Trigger: a solid bell in the accent colour (white in the dark modes, black in Light) that never changes size; a new
              notification only puts a small red number on its corner. */}
          <button
            id="notifications-bar-trigger"
            onClick={onOpenNotifications}
            className="relative w-9 h-9 shrink-0 flex items-center justify-center text-noob cursor-pointer active:scale-90 transition-transform"
            title="Activity & Notifications Bar"
            aria-label={unreadNotificationCount > 0 ? `Notifications, ${unreadNotificationCount} new` : 'Notifications'}
          >
            <Bell className="w-6 h-6" fill="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
            {unreadNotificationCount > 0 && (
              <span
                data-testid="notification-badge"
                className="absolute top-0 right-0 min-w-[17px] h-[17px] px-1 rounded-full bg-red-500 text-white text-[10px] leading-none font-extrabold flex items-center justify-center ring-2 ring-[var(--page)]"
              >
                {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
              </span>
            )}
          </button>

        </div>
      </header>

      {/* Dynamic Notification Bar Banner (Appears when there are unread updates or latest event) */}
      {unreadNotificationCount > 0 && !isTopBannerDismissed && latestNotification && (
        <div
          onClick={onOpenNotifications}
          className="w-full max-w-[480px] px-3 pt-2 cursor-pointer group"
        >
          <div className="p-2.5 rounded-2xl bg-gradient-to-r from-zinc-900 via-zinc-900/90 to-zinc-950 border border-noob/40 flex items-center justify-between gap-2 shadow-lg shadow-noob/5 group-hover:border-noob transition-all">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-xl bg-noob/20 border border-noob/30 flex items-center justify-center shrink-0">
                {latestNotification.type === 'follow_request_accepted' ? (
                  <UserCheck className="w-3.5 h-3.5 text-noob" />
                ) : latestNotification.type === 'follow_request_received' ? (
                  <UserPlus className="w-3.5 h-3.5 text-purple-400" />
                ) : latestNotification.type === 'new_follower' ? (
                  <UserPlus className="w-3.5 h-3.5 text-cyan-400" />
                ) : (
                  <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
                )}
              </div>

              <div className="truncate text-xs text-zinc-300">
                <span className="font-bold text-white mr-1">
                  @{latestNotification.actorUsername}
                </span>
                <span className="text-zinc-300">{latestNotification.text}</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-noob text-black font-extrabold">
                {unreadNotificationCount} New
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsTopBannerDismissed(true);
                }}
                className="text-zinc-500 hover:text-zinc-300 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Random post-bonus offer — posts, reels and long videos normally award a flat 10,000,000 NOOB
          Points on publish; the server rolls a one-off 5,000,000–30,000,000 bonus instead when
          this offer is accepted, credited the moment anything actually gets published. Rejecting
          just dismisses it; it quietly expires server-side and that next post earns the normal 25.
          Deliberately left out of the story/instant creation flows, which don't earn points. */}
      {onOpenPostCreation && !isEarnPointsBannerDismissed && bonusOfferAmount !== null && (
        <div className="w-full max-w-[480px] px-3 pt-2">
          <div className="w-full p-3.5 rounded-2xl bg-gradient-to-r from-noob/15 via-zinc-900/90 to-zinc-950 border border-noob/40 shadow-lg shadow-noob/10">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-noob/20 border border-noob/30 flex items-center justify-center shrink-0">
                <Coins className="w-4.5 h-4.5 text-noob" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-zinc-400 font-semibold">You've been offered</p>
                <p className="text-lg font-black text-noob leading-tight tracking-tight">
                  {bonusOfferAmount.toLocaleString()} <span className="text-xs font-bold text-zinc-300">NOOB Points</span>
                </p>
              </div>
            </div>
            <p className="text-[11px] text-zinc-400 mt-2">Post a Post, Reel or Video now and it's credited instantly.</p>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => {
                  setIsEarnPointsBannerDismissed(true);
                  onOpenPostCreation();
                }}
                className="flex-1 py-2 rounded-xl bg-noob text-black text-xs font-extrabold cursor-pointer hover:bg-noob/90 transition-colors"
              >
                Accept &amp; Post
              </button>
              <button
                onClick={() => setIsEarnPointsBannerDismissed(true)}
                className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-bold cursor-pointer hover:text-white transition-colors"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* An ad at the top of Home (NOOB Ads), when one is running here */}
      <AdBanner page="home" className="mx-3 mt-3" />

      {/* 2. Stories Tray */}
      <StoryTray
        currentUser={currentUser}
        model={storyTray}
        onOpenStoryViewer={onOpenStoryViewer}
        onOpenCreateStory={onOpenCreateStory}
        onOpenStatusNoteModal={onOpenStatusNoteModal}
        onNavigateToProfile={onNavigateToProfile}
        onToggleFollowUser={onToggleFollowUser}
        allUsers={allUsers}
      />

      {/* 3. Category Topic Filter Pills */}
      <div className="w-full max-w-[480px] px-3 py-2.5 flex items-center gap-2 overflow-x-auto no-scrollbar">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activeCategory === cat
                ? 'bg-noob text-black shadow-[0_0_12px_rgba(255,255,255,0.35)] font-bold'
                : 'bg-zinc-900/80 text-zinc-400 hover:text-white border border-white/5'
            }`}
          >
            {cat === 'All' ? '⚡ All Updates' : `#${cat}`}
          </button>
        ))}
      </div>

      {/* 4. Feed Posts Stack */}
      <main ref={postListRef} className="w-full max-w-[480px] px-2 sm:px-3 mt-1 space-y-4">
        {filteredPosts.length === 0 ? (
          <div className="text-center py-16 px-4 bg-zinc-900/40 rounded-2xl border border-white/5">
            <Sparkles className="w-10 h-10 text-noob mx-auto mb-2 opacity-60" />
            <h3 className="text-sm font-bold text-white">No Posts in this feed</h3>
            <p className="text-xs text-zinc-400 mt-1">
              {activeFeedFilter === 'favourites'
                ? 'Your favourites have not posted anything here yet.'
                : activeFeedFilter === 'following'
                ? (currentUser.followingIds || []).length === 0
                  ? 'Noob people to see their posts here.'
                  : 'The people you noob haven’t posted anything here yet.'
                : 'Try selecting another topic filter or refreshing.'}
            </p>
          </div>
        ) : (
          <>
            {showPinned && <PinnedFeedSection items={pinnedItems} renderPost={(p) => renderPostCard(postsById.get(p.id) ?? p)} onOpenReel={onNavigateToReel} onOpenVideo={onNavigateToVideo} />}
            {paginatedPosts.map((post) => renderPostCard(post))}

            {/* Infinite Scroll Load More Sentinel */}
            <div ref={loadMoreSentinelRef} className="w-full py-4 flex items-center justify-center">
              {isLoadingMore ? (
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <Loader2 className="w-4 h-4 text-noob animate-spin" />
                  <span>Loading more posts...</span>
                </div>
              ) : hasMore ? (
                <div className="h-4" />
              ) : filteredPosts.length > POSTS_PER_PAGE ? (
                <div className="text-center py-3 text-[11px] text-zinc-500 font-medium">
                  ✓ You're all caught up!
                </div>
              ) : null}
            </div>
          </>
        )}
      </main>

      {/* The last thing on Home: the other things we have made (links to their websites) */}
      <MoreCreations className="mt-6 mb-6" />

      {/* 5. Comments Sheet Modal */}
      {selectedPostForComments && (
        <CommentsSheet
          post={selectedPostForComments}
          currentUser={currentUser}
          onClose={() => setSelectedPostForComments(null)}
          onNavigateToProfile={onNavigateToProfile}
        />
      )}

      {watchVideoPost && (
        <FeedVideoWatchView
          post={watchVideoPost}
          currentUser={currentUser}
          onClose={() => setWatchVideoPost(null)}
          onNavigateToProfile={onNavigateToProfile}
        />
      )}

      {showSparkXModal && <SparkXApplicationModal closed={!sparkxOpen} onClose={() => setShowSparkXModal(false)} />}
      {showJoinUsModal && <JoinUsModal closed={!joinTeamOpen} onClose={() => setShowJoinUsModal(false)} />}

      {/* NOOB's extra-features menu — the hamburger next to the wordmark */}
      {showNoobMenu && (
        <div className="fixed inset-0 z-[95] bg-black/70 backdrop-blur-sm flex items-start overscroll-contain" onClick={() => setShowNoobMenu(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="doodle-panel w-72 max-w-[85vw] h-full bg-zinc-950 border-r border-zinc-800 shadow-2xl p-4 animate-in slide-in-from-left duration-200 flex flex-col"
          >
            <div className="shrink-0 flex items-center justify-between mb-4">
              <h2 className="text-sm font-black italic tracking-tighter text-white">NOOB</h2>
              <button onClick={() => setShowNoobMenu(false)} className="p-1.5 rounded-full hover:bg-zinc-900 text-zinc-400 hover:text-white cursor-pointer">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            {/* every page button of the menu: it scrolls when they do not all fit (short phones, many pages) */}
            <div className="relative flex-1 min-h-0">
            <div ref={menuScroll.ref} className="space-y-1 h-full overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))] no-scrollbar">
              {/* The pages that are not on the bottom bar (computers have them all in the side menu) */}
              {onOpenTab && (
                <div className="pb-1 xl:hidden" role="group" aria-label="More pages" data-testid="noob-menu-more-pages">
                  <p className="px-1 pb-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-zinc-400">More pages</p>
                  <MenuBanner tone="videos" icon={<Youtube className="w-[18px] h-[18px]" aria-hidden="true" />} title="Feed" blurb="Long videos and live streams" ariaLabel="Feed" onClick={() => { setShowNoobMenu(false); onOpenTab('videos'); }} />
                </div>
              )}
              {/* NOOB Draw: the weekly free prize spins, at the very top of the menu */}
              <button
                onClick={() => { markMenuEntry('draw'); setShowNoobMenu(false); openNoobDraw(); }}
                data-menu-entry="draw"
                onPointerDown={preloadNoobDraw}
                className="force-dark draw-banner draw-shine relative w-full p-3 mb-1 rounded-2xl flex items-center gap-3 text-left cursor-pointer border border-[#9e9cff]/40 active:scale-[0.99] transition-transform"
                style={{ background: 'linear-gradient(120deg, rgba(158,156,255,0.30), rgba(236,72,153,0.22) 60%, rgba(251,191,36,0.2))' }}
              >
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#c9c6ff] to-[#f0abfc] flex items-center justify-center shrink-0 shadow-[0_0_18px_rgba(201,198,255,0.6)]">
                  <Gift className="w-[18px] h-[18px] text-black" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-black text-white flex items-center gap-1.5">NOOB Draw <span className="px-1.5 py-0.5 rounded-full bg-white text-black text-[8px] font-black tracking-wider">NEW</span></span>
                  <span className="text-[10px] text-zinc-300 block truncate">Free weekly spins: win Pro, the tick and millions</span>
                </div>
              </button>
              {/* NOOB Studio: the photo and video editor (everything is edited on the device, nothing is uploaded) */}
              <button
                onClick={() => { markMenuEntry('studio'); setShowNoobMenu(false); openStudio(); }}
                data-menu-entry="studio"
                onPointerDown={preloadStudio}
                data-testid="menu-studio"
                className="force-dark studio-banner draw-shine relative w-full p-3 mb-1 rounded-2xl flex items-center gap-3 text-left cursor-pointer border border-fuchsia-400/40 active:scale-[0.99] transition-transform"
                style={{ background: 'linear-gradient(120deg, rgba(217,70,239,0.28), rgba(56,189,248,0.2) 60%, rgba(251,191,36,0.14))' }}
              >
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-fuchsia-300 to-sky-300 flex items-center justify-center shrink-0 shadow-[0_0_18px_rgba(217,70,239,0.5)]">
                  <Wand2 className="w-[18px] h-[18px] text-black" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-black text-white flex items-center gap-1.5">NOOB Studio <span className="px-1.5 py-0.5 rounded-full bg-white text-black text-[8px] font-black tracking-wider">NEW</span></span>
                  <span className="text-[10px] text-zinc-300 block truncate">Edit photos and videos: filters, text, music, export</span>
                </div>
              </button>
              {/* NOOB STUDY: the student's personal learning space (for everyone once it is switched on; until then for the main administrator) */}
              {(isMainAdmin(currentUser) || studyStatus?.mode === 'on' || studyStatus?.mode === 'coming_soon') && (
                <button
                  onClick={() => { markMenuEntry('study'); setShowNoobMenu(false); openStudy('home'); }}
                  data-menu-entry="study"
                  onPointerDown={preloadNoobStudy}
                  className="force-dark study-banner draw-shine relative w-full p-3 mb-1 rounded-2xl flex items-center gap-3 text-left cursor-pointer border border-[#e38b69]/40 active:scale-[0.99] transition-transform"
                  style={{ background: 'linear-gradient(120deg, rgba(227,139,105,0.26), rgba(185,168,242,0.2) 60%, rgba(127,209,172,0.16))' }}
                >
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#f2b79c] to-[#b9a8f2] flex items-center justify-center shrink-0 shadow-[0_0_18px_rgba(227,139,105,0.5)]">
                    <GraduationCap className="w-[18px] h-[18px] text-black" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-black text-white flex items-center gap-1.5">NOOB Study <span className="px-1.5 py-0.5 rounded-full bg-white text-black text-[8px] font-black tracking-wider">{studyStatus?.mode === 'on' ? 'NEW' : isMainAdmin(currentUser) ? 'ADMIN ONLY' : 'COMING SOON'}</span></span>
                    <span className="text-[10px] text-zinc-300 block truncate">Your AI tutor, plan and study space</span>
                  </div>
                </button>
              )}
              {/* Our Team: the people behind NOOB */}
              <button
                onClick={() => { markMenuEntry('team'); setShowNoobMenu(false); setShowOurTeam(true); }}
                data-menu-entry="team"
                onPointerDown={preloadOurTeam}
                className="force-dark team-banner draw-shine relative w-full p-3 mb-1 rounded-2xl flex items-center gap-3 text-left cursor-pointer border border-amber-300/35 active:scale-[0.99] transition-transform"
                style={{ background: 'linear-gradient(120deg, rgba(251,191,36,0.24), rgba(244,114,182,0.18) 62%, rgba(167,139,250,0.2))' }}
              >
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-300 to-pink-400 flex items-center justify-center shrink-0 shadow-[0_0_18px_rgba(251,191,36,0.5)]">
                  <Users className="w-[18px] h-[18px] text-black" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-black text-white block">Our Team</span>
                  <span className="text-[10px] text-zinc-300 block truncate">Meet the people behind NOOB</span>
                </div>
              </button>
              {/* The two "join us" forms; on a wide screen they are also icons in the top bar */}
              {joinTeamOpen && (
                <MenuBanner tone="join" entryId="join" icon={<Handshake className="w-[18px] h-[18px]" aria-hidden="true" />} title="Join the NOOB team" blurb="Apply to help build NOOB" onClick={() => { markMenuEntry('join'); setShowNoobMenu(false); setShowJoinUsModal(true); }} />
              )}
              <MenuBanner tone="spark" entryId="spark" icon={<Rocket className="w-[18px] h-[18px]" aria-hidden="true" />} title="Join our SparkX team" blurb="IIT Bombay Techfest" onClick={() => { markMenuEntry('spark'); setShowNoobMenu(false); setShowSparkXModal(true); }} />
              {/* Anonymous Messages: a public feed of messages with no author shown */}
              <MenuBanner tone="mask" entryId="anonymous" icon={<VenetianMask className="w-[18px] h-[18px]" aria-hidden="true" />} title="Anonymous Messages" blurb="Your words, without your name" ariaLabel="Anonymous Messages" onPointerDown={() => { void loadAnonymousPage(); }} onClick={() => { markMenuEntry('anonymous'); setShowNoobMenu(false); openAnonymous(); }} />
              {/* The Fun pages: This or That, Ask Me Anything, Mood Status, Public Polls */}
              {onOpenFunPage && (
                <div className="pt-2 pb-1" role="group" aria-label="Fun and community">
                  <p className="px-1 pb-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-zinc-400">Fun &amp; community</p>
                  {FUN_FEATURES.map((f) => {
                    const Icon = FUN_MENU_ICONS[f.id];
                    return (
                      <MenuBanner
                        key={f.id}
                        tone={FUN_MENU_TONES[f.id]}
                        entryId={'fun-' + f.id}
                        icon={<Icon className="w-[18px] h-[18px]" aria-hidden={true} />}
                        title={f.label}
                        blurb={f.blurb}
                        ariaLabel={f.label}
                        onPointerDown={preloadFunHub}
                        onClick={() => { markMenuEntry('fun-' + f.id); setShowNoobMenu(false); onOpenFunPage({ feature: f.id }); }}
                      />
                    );
                  })}
                </div>
              )}
              {/* The rest of the menu, dressed like the banners above (see MenuBanner.tsx), under a heading of its own */}
              <div className="pt-2 pb-1" role="group" aria-label="More from NOOB">
              <p className="px-1 pb-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-zinc-400">More from NOOB</p>
              <MenuBanner tone="daily" entryId="daily" icon={<Flame className="w-[18px] h-[18px]" />} title="Daily NOOB" blurb="Today's challenge — win real points" onClick={() => { markMenuEntry('daily'); setShowNoobMenu(false); setShowDailyNoob(true); }} />
              <MenuBanner tone="rooms" entryId="rooms" icon={<Trophy className="w-[18px] h-[18px]" />} title="NOOB Rooms" blurb="Live voice rooms — join, talk, play" onClick={() => { markMenuEntry('rooms'); setShowNoobMenu(false); setShowNoobRooms(true); }} />
              <MenuBanner tone="song" entryId="song" icon={<Music2 className="w-[18px] h-[18px]" />} title="Guess the Song" blurb="A clip plays — pick the right title, score points" onClick={() => { markMenuEntry('song'); setShowNoobMenu(false); setShowGuessTheSong(true); }} />
              <MenuBanner tone="lounge" entryId="lounge" icon={<Sparkles className="w-[18px] h-[18px]" />} title={`NOOB Live Lounge${currentUser.hasLiveLounge ? ' — Unlocked' : ''}`} blurb="Private meeting rooms — screen share, whiteboard & chat" onClick={() => { markMenuEntry('lounge'); setShowNoobMenu(false); setShowLiveLoungePage(true); }} />
              <MenuBanner tone="shop" entryId="shop" icon={<ShoppingBag className="w-[18px] h-[18px]" />} title={<span className="shop-wordmark text-base leading-none font-normal">Shop NOOB</span>} blurb="Browse products & your cart" onClick={() => { markMenuEntry('shop'); setShowNoobMenu(false); setShowStorePage(true); }} />
              {foodStallVisible && (
                foodStallComingSoon ? (
                  <MenuBanner tone="food" entryId="food" icon={<span className="text-base">🍔</span>} title="NOOB Food Stall" badge="Coming Soon" />
                ) : (
                  <MenuBanner tone="food" entryId="food" icon={<span className="text-base">🍔</span>} title="NOOB Food Stall" blurb="Burgers, bhel, fries, manchurian & coke" onClick={() => { markMenuEntry('food'); setShowNoobMenu(false); setShowFoodStall(true); }} />
                )
              )}
              <MenuBanner tone="ai" entryId="ai" bareIcon icon={<NoobAiLogo className="w-9 h-9 shrink-0" />} title="NOOB AI" blurb="Talk to your AI friend by voice" onClick={() => { markMenuEntry('ai'); setShowNoobMenu(false); setShowNoobAi(true); }} />
              <MenuBanner tone="support" entryId="support" icon={<MessageCircle className="w-[18px] h-[18px]" />} title="Customer Support" blurb="Chat with the NOOB support team" onClick={() => { markMenuEntry('support'); setShowNoobMenu(false); setShowSupportModal(true); }} />
              <MenuBanner tone="idea" entryId="idea" icon={<Lightbulb className="w-[18px] h-[18px]" />} title="Suggestion Box" blurb="Share ideas, improvements or problems" onClick={() => { markMenuEntry('idea'); setShowNoobMenu(false); setShowSuggestionBox(true); }} />
              </div>
            </div>
            {menuScroll.more && <ScrollMoreHint onClick={menuScroll.scrollDown} />}
            </div>
          </div>
        </div>
      )}
      </div>
      {showAnonymous && (
        <ErrorBoundary showErrorDetails>
          <React.Suspense fallback={<LazyFallback />}>
            <AnonymousMessagesPage currentUser={currentUser} onClose={closeAnonymous} />
          </React.Suspense>
        </ErrorBoundary>
      )}
      {showOurTeam && (
        <React.Suspense fallback={<LazyFallback />}>
          <OurTeamPage
            currentUser={currentUser}
            onClose={() => setShowOurTeam(false)}
            onOpenProfile={(m) => {
              if (!m.userId || !onNavigateToProfile) return;
              const known = allUsers.find((u) => u.id === m.userId);
              setShowOurTeam(false);
              onNavigateToProfile(known || ({ id: m.userId, username: m.username || '', displayName: m.name, avatar: m.avatar || '' } as unknown as User));
            }}
          />
        </React.Suspense>
      )}
      {showDailyNoob && (
        <React.Suspense fallback={<LazyFallback />}>
          <DailyNoobView currentUser={currentUser} onNavigateToProfile={onNavigateToProfile} onClose={() => setShowDailyNoob(false)} />
        </React.Suspense>
      )}
      {showNoobRooms && (
        <ErrorBoundary showErrorDetails>
          <React.Suspense fallback={<LazyFallback />}>
            <NoobRoomsLobbyView currentUser={currentUser} onClose={() => setShowNoobRooms(false)} />
          </React.Suspense>
        </ErrorBoundary>
      )}
      {showGuessTheSong && (
        <ErrorBoundary showErrorDetails>
          <React.Suspense fallback={<LazyFallback />}>
            <GuessTheSongView currentUser={currentUser} onClose={() => setShowGuessTheSong(false)} />
          </React.Suspense>
        </ErrorBoundary>
      )}
      {showLiveLoungePage && (
        <ErrorBoundary showErrorDetails>
          <React.Suspense fallback={<LazyFallback />}>
            <LiveLoungePage currentUser={currentUser} allUsers={allUsers} onClose={() => setShowLiveLoungePage(false)} onUserUpdated={onUserUpdated} />
          </React.Suspense>
        </ErrorBoundary>
      )}
      {showStorePage && (
        <React.Suspense fallback={<LazyFallback />}>
          <StorePage currentUser={currentUser} onClose={() => setShowStorePage(false)} />
        </React.Suspense>
      )}
      {showFoodStall && (
        <React.Suspense fallback={<LazyFallback />}>
          <FoodStallView currentUser={currentUser} onClose={() => setShowFoodStall(false)} />
        </React.Suspense>
      )}
      {showNoobAi && <NoobAiPage onClose={() => setShowNoobAi(false)} isMainAdmin={isMainAdmin(currentUser)} onBye={() => setShowNoobAi(false)} />}
      {showSuggestionBox && <SuggestionBoxModal userId={currentUser.id} onClose={() => setShowSuggestionBox(false)} />}
      {showSupportModal && (
        <React.Suspense fallback={<LazyFallback />}>
          <CustomerSupportModal currentUser={currentUser} onClose={() => setShowSupportModal(false)} />
        </React.Suspense>
      )}
    </div>
  );
};

