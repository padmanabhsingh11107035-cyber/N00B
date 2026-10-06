import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  BellRing,
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
  Plus,
  Coins,
  Menu,
  Flame,
  Trophy,
  ShoppingBag
} from 'lucide-react';
import { Post, Reel, Story, User, AppNotification } from '../../types';
import { StoryTray } from '../Stories/StoryTray';
import { PostCard } from './PostCard';
import { CommentsSheet } from './CommentsSheet';
import { SparkXApplicationModal } from './SparkXApplicationModal';
import { JoinUsModal } from '../Explore/JoinUsModal';
import { StorePage } from '../Store/StorePage';
import { requestPostBonusOffer } from '../../services/api';

const DailyNoobView = React.lazy(() => import('../Daily/DailyNoobView').then((m) => ({ default: m.DailyNoobView })));
const NoobRoomsLobbyView = React.lazy(() => import('../NoobRooms/NoobRoomsLobbyView').then((m) => ({ default: m.NoobRoomsLobbyView })));
const LiveLoungePage = React.lazy(() => import('../Profile/LiveLoungePage').then((m) => ({ default: m.LiveLoungePage })));

interface FeedViewProps {
  currentUser: User;
  posts: Post[];
  stories: Story[];
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
  onOpenStoryViewer: (index: number) => void;
  onOpenCreateStory: () => void;
  // Create moved to this header (used to be a bottom-nav tab) — opens the post/reel picker.
  onOpenPostCreation?: () => void;
  onOpenStatusNoteModal: () => void;
  onClearStatusNote?: () => void;
  onOpenNotifications: () => void;
  onRefreshFeed: () => void;
  onNavigateToPost?: (postId: string) => void;
  onNavigateToReel?: (reelId: string) => void;
  onNavigateToProfile?: (user: User) => void;
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

const shuffle = <T,>(arr: T[]): T[] => {
  const next = [...arr];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

// Every post, new or old, mixed into one random order — not sorted by recency at all.
const buildFeedOrder = (posts: Post[]): string[] => shuffle(posts).map((p) => p.id);

export const FeedView: React.FC<FeedViewProps> = ({
  currentUser,
  posts,
  stories,
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
  onNavigateToProfile,
  onToggleFollowUser,
  sparkxOpen = true,
  joinTeamOpen = true,
  allUsers = [],
  onUserUpdated
}) => {
  const [activeFeedFilter, setActiveFeedFilter] = useState<'foryou' | 'following'>('foryou');
  const [showJoinUsModal, setShowJoinUsModal] = useState(false);
  const [selectedPostForComments, setSelectedPostForComments] = useState<Post | null>(null);
  const [hiddenAdIds, setHiddenAdIds] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTopBannerDismissed, setIsTopBannerDismissed] = useState(false);
  const [isEarnPointsBannerDismissed, setIsEarnPointsBannerDismissed] = useState(false);
  const [bonusOfferAmount, setBonusOfferAmount] = useState<number | null>(null);
  const [showNoobMenu, setShowNoobMenu] = useState(false);
  const [showDailyNoob, setShowDailyNoob] = useState(false);
  const [showNoobRooms, setShowNoobRooms] = useState(false);
  const [showLiveLoungePage, setShowLiveLoungePage] = useState(false);
  const [showStorePage, setShowStorePage] = useState(false);
  const [showSparkXModal, setShowSparkXModal] = useState(false);

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
  // thumb) and only rebuilt when the actual set of posts changes — a genuinely new post, one
  // removed, or a pull-to-refresh that brought back different content.
  const [feedOrder, setFeedOrder] = useState<string[]>(() => buildFeedOrder(posts));
  const postIdsKey = posts.map((p) => p.id).join(',');
  useEffect(() => {
    setFeedOrder(buildFeedOrder(posts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postIdsKey]);

  // Infinite Scroll State
  const [visibleCount, setVisibleCount] = useState(POSTS_PER_PAGE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

  // Pull-to-refresh Touch State
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    onRefreshFeed();
    setVisibleCount(POSTS_PER_PAGE);
    setTimeout(() => {
      setIsRefreshing(false);
      setPullDistance(0);
    }, 700);
  };

  const handleHideAd = (postId: string) => {
    setHiddenAdIds([...hiddenAdIds, postId]);
  };

  // Display order follows feedOrder (new-once-then-shuffled-rotation), not the raw posts array.
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

  // Following: only posts from the accounts you follow.
  if (activeFeedFilter === 'following') {
    const following = new Set(currentUser.followingIds || []);
    filteredPosts = filteredPosts.filter((p) => following.has(p.userId));
  }

  const paginatedPosts = filteredPosts.slice(0, visibleCount);
  const hasMore = visibleCount < filteredPosts.length;

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
      className="w-full flex flex-col items-center pb-24 relative select-none"
    >
      {/* Pull To Refresh Visual Indicator */}
      <div
        className="w-full flex flex-col items-center justify-center overflow-hidden transition-all duration-200"
        style={{
          height: isRefreshing ? '50px' : `${pullDistance}px`,
          opacity: pullDistance > 10 || isRefreshing ? 1 : 0
        }}
      >
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-[#00FF66]/40 text-white text-xs font-bold shadow-lg shadow-[#00FF66]/10">
          {isRefreshing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 text-[#00FF66] animate-spin" />
              <span className="text-[#00FF66]">Updating Feed...</span>
            </>
          ) : pullDistance > 55 ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 text-[#00FF66] animate-spin" />
              <span className="text-[#00FF66]">Release to refresh</span>
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
      <header className="sticky top-0 z-40 w-full bg-zinc-950/95 backdrop-blur-xl border-b border-zinc-800/80 px-3 py-2.5 flex items-center gap-1 shadow-sm">
        {/* Brand Wordmark + menu — the hamburger opens NOOB's extra features (Daily NOOB, Rooms) */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setShowNoobMenu(true)}
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
              className="p-1 text-zinc-400 hover:text-violet-300 rounded-lg hover:bg-zinc-900 transition-colors cursor-pointer shrink-0"
              title="Join the NOOB team"
              aria-label="Join the NOOB team"
            >
              <Handshake className="w-4 h-4" />
            </button>
          )}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-full p-0.5 text-[11px] shrink-0">
            <button
              onClick={() => setActiveFeedFilter('foryou')}
              className={`px-2.5 py-0.5 rounded-full font-medium transition-all cursor-pointer ${
                activeFeedFilter === 'foryou'
                  ? 'bg-rose-600 text-white shadow-sm font-bold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              For You
            </button>
            <button
              onClick={() => setActiveFeedFilter('following')}
              className={`px-2.5 py-0.5 rounded-full font-medium transition-all cursor-pointer ${
                activeFeedFilter === 'following'
                  ? 'bg-rose-600 text-white shadow-sm font-bold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Following
            </button>
          </div>
        </div>

        {/* Action Icons (Notification Bar, Refresh, Chat) */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Apply to join the SparkX team */}
          <button
            onClick={() => setShowSparkXModal(true)}
            className="p-1.5 text-zinc-400 hover:text-orange-300 rounded-lg hover:bg-zinc-900 transition-colors cursor-pointer"
            title="Join our SparkX team (IIT Bombay Techfest)"
          >
            <Rocket className="w-4 h-4" />
          </button>

          {/* Create — moved here from the bottom nav bar, which now carries the Home video tab instead */}
          {onOpenPostCreation && (
            <button
              onClick={onOpenPostCreation}
              className="p-1.5 bg-[#00FF66] text-black rounded-lg hover:bg-[#00FF66]/90 transition-colors cursor-pointer"
              title="Create a post, reel or story"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
            </button>
          )}

          {/* Notifications Bar Trigger */}
          <button
            id="notifications-bar-trigger"
            onClick={onOpenNotifications}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              unreadNotificationCount > 0
                ? 'bg-[#00FF66]/20 border border-[#00FF66] text-[#00FF66] shadow-[0_0_10px_rgba(0,255,102,0.3)]'
                : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white'
            }`}
            title="Activity & Notifications Bar"
          >
            <BellRing className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Alerts</span>
            {unreadNotificationCount > 0 && (
              <span className="px-1.5 py-0.2 bg-[#00FF66] text-black font-extrabold text-[9px] rounded-full min-w-[16px] text-center">
                {unreadNotificationCount}
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
          <div className="p-2.5 rounded-2xl bg-gradient-to-r from-zinc-900 via-zinc-900/90 to-zinc-950 border border-[#00FF66]/40 flex items-center justify-between gap-2 shadow-lg shadow-[#00FF66]/5 group-hover:border-[#00FF66] transition-all">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-xl bg-[#00FF66]/20 border border-[#00FF66]/30 flex items-center justify-center shrink-0">
                {latestNotification.type === 'follow_request_accepted' ? (
                  <UserCheck className="w-3.5 h-3.5 text-[#00FF66]" />
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
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#00FF66] text-black font-extrabold">
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

      {/* Random post-bonus offer — posts, reels and long videos normally award a flat 25 NOOB
          Points on publish; the server rolls a one-off 5,000,000–30,000,000 bonus instead when
          this offer is accepted, credited the moment anything actually gets published. Rejecting
          just dismisses it; it quietly expires server-side and that next post earns the normal 25.
          Deliberately left out of the story/instant creation flows, which don't earn points. */}
      {onOpenPostCreation && !isEarnPointsBannerDismissed && bonusOfferAmount !== null && (
        <div className="w-full max-w-[480px] px-3 pt-2">
          <div className="w-full p-3.5 rounded-2xl bg-gradient-to-r from-[#00FF66]/15 via-zinc-900/90 to-zinc-950 border border-[#00FF66]/40 shadow-lg shadow-[#00FF66]/10">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#00FF66]/20 border border-[#00FF66]/30 flex items-center justify-center shrink-0">
                <Coins className="w-4.5 h-4.5 text-[#00FF66]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-zinc-400 font-semibold">You've been offered</p>
                <p className="text-lg font-black text-[#00FF66] leading-tight tracking-tight">
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
                className="flex-1 py-2 rounded-xl bg-[#00FF66] text-black text-xs font-extrabold cursor-pointer hover:bg-[#00FF66]/90 transition-colors"
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

      {/* 2. Stories Tray */}
      <StoryTray
        currentUser={currentUser}
        stories={stories}
        posts={posts}
        reels={reels}
        onOpenStoryViewer={onOpenStoryViewer}
        onOpenCreateStory={onOpenCreateStory}
        onOpenStatusNoteModal={onOpenStatusNoteModal}
        onNavigateToPost={onNavigateToPost}
        onNavigateToReel={onNavigateToReel}
      />

      {/* 3. Category Topic Filter Pills */}
      <div className="w-full max-w-[480px] px-3 py-2.5 flex items-center gap-2 overflow-x-auto no-scrollbar">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activeCategory === cat
                ? 'bg-[#00FF66] text-black shadow-[0_0_12px_rgba(0,255,102,0.35)] font-bold'
                : 'bg-zinc-900/80 text-zinc-400 hover:text-white border border-white/5'
            }`}
          >
            {cat === 'All' ? '⚡ All Updates' : `#${cat}`}
          </button>
        ))}
      </div>

      {/* 4. Feed Posts Stack */}
      <main className="w-full max-w-[480px] px-2 sm:px-3 mt-1 space-y-4">
        {filteredPosts.length === 0 ? (
          <div className="text-center py-16 px-4 bg-zinc-900/40 rounded-2xl border border-white/5">
            <Sparkles className="w-10 h-10 text-[#00FF66] mx-auto mb-2 opacity-60" />
            <h3 className="text-sm font-bold text-white">No Posts in this feed</h3>
            <p className="text-xs text-zinc-400 mt-1">
              {activeFeedFilter === 'following'
                ? (currentUser.followingIds || []).length === 0
                  ? 'Follow people to see their posts here.'
                  : 'The people you follow haven’t posted anything here yet.'
                : 'Try selecting another topic filter or refreshing.'}
            </p>
          </div>
        ) : (
          <>
            {paginatedPosts.map((post) => (
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
                onToggleFollowUser={onToggleFollowUser}
              />
            ))}

            {/* Infinite Scroll Load More Sentinel */}
            <div ref={loadMoreSentinelRef} className="w-full py-4 flex items-center justify-center">
              {isLoadingMore ? (
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <Loader2 className="w-4 h-4 text-[#00FF66] animate-spin" />
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

      {/* 5. Comments Sheet Modal */}
      {selectedPostForComments && (
        <CommentsSheet
          post={selectedPostForComments}
          currentUser={currentUser}
          onClose={() => setSelectedPostForComments(null)}
        />
      )}

      {showSparkXModal && <SparkXApplicationModal closed={!sparkxOpen} onClose={() => setShowSparkXModal(false)} />}
      {showJoinUsModal && <JoinUsModal closed={!joinTeamOpen} onClose={() => setShowJoinUsModal(false)} />}

      {/* NOOB's extra-features menu — the hamburger next to the wordmark */}
      {showNoobMenu && (
        <div className="fixed inset-0 z-[95] bg-black/70 backdrop-blur-sm flex items-start" onClick={() => setShowNoobMenu(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-72 max-w-[85vw] h-full bg-zinc-950 border-r border-zinc-800 shadow-2xl p-4 animate-in slide-in-from-left duration-200 flex flex-col"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-black italic tracking-tighter text-white">NOOB</h2>
              <button onClick={() => setShowNoobMenu(false)} className="p-1.5 rounded-full hover:bg-zinc-900 text-zinc-400 hover:text-white cursor-pointer">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            <div className="space-y-1">
              <button
                onClick={() => { setShowNoobMenu(false); setShowDailyNoob(true); }}
                className="w-full p-3 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-[#00FF66]/15 border border-[#00FF66]/30 flex items-center justify-center shrink-0">
                  <Flame className="w-4.5 h-4.5 text-[#00FF66]" />
                </div>
                <div>
                  <span className="text-xs font-bold text-white block">Daily NOOB</span>
                  <span className="text-[10px] text-zinc-400">Today's challenge — win real points</span>
                </div>
              </button>
              <button
                onClick={() => { setShowNoobMenu(false); setShowNoobRooms(true); }}
                className="w-full p-3 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
                  <Trophy className="w-4.5 h-4.5 text-red-400" />
                </div>
                <div>
                  <span className="text-xs font-bold text-white block">NOOB Rooms</span>
                  <span className="text-[10px] text-zinc-400">Live voice rooms — join, talk, play</span>
                </div>
              </button>
              <button
                onClick={() => { setShowNoobMenu(false); setShowLiveLoungePage(true); }}
                className="w-full p-3 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4.5 h-4.5 text-purple-400" />
                </div>
                <div>
                  <span className="text-xs font-bold text-white block">NOOB Live Lounge{currentUser.hasLiveLounge ? ' — Unlocked' : ''}</span>
                  <span className="text-[10px] text-zinc-400">Private meeting rooms — screen share, whiteboard & chat</span>
                </div>
              </button>
              <button
                onClick={() => { setShowNoobMenu(false); setShowStorePage(true); }}
                className="w-full p-3 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center shrink-0">
                  <ShoppingBag className="w-4.5 h-4.5 text-orange-400" />
                </div>
                <div>
                  <span className="shop-wordmark text-base leading-none text-white block">Shop NOOB</span>
                  <span className="text-[10px] text-zinc-400">Browse products & your cart</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
      {showDailyNoob && (
        <React.Suspense fallback={null}>
          <DailyNoobView currentUser={currentUser} onNavigateToProfile={onNavigateToProfile} onClose={() => setShowDailyNoob(false)} />
        </React.Suspense>
      )}
      {showNoobRooms && (
        <React.Suspense fallback={null}>
          <NoobRoomsLobbyView currentUser={currentUser} onClose={() => setShowNoobRooms(false)} />
        </React.Suspense>
      )}
      {showLiveLoungePage && (
        <React.Suspense fallback={null}>
          <LiveLoungePage currentUser={currentUser} allUsers={allUsers} onClose={() => setShowLiveLoungePage(false)} onUserUpdated={onUserUpdated} />
        </React.Suspense>
      )}
      {showStorePage && <StorePage currentUser={currentUser} onClose={() => setShowStorePage(false)} />}
    </div>
  );
};

