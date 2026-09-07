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
  Loader2
} from 'lucide-react';
import { Post, Reel, Story, User, AppNotification } from '../../types';
import { StoryTray } from '../Stories/StoryTray';
import { PostCard } from './PostCard';
import { CommentsSheet } from './CommentsSheet';

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
  onOpenStoryViewer: (index: number) => void;
  onOpenCreateStory: () => void;
  onOpenStatusNoteModal: () => void;
  onClearStatusNote?: () => void;
  onOpenNotifications: () => void;
  onNavigateToChat: () => void;
  onRefreshFeed: () => void;
  onNavigateToPost?: (postId: string) => void;
  onNavigateToReel?: (reelId: string) => void;
}

const POSTS_PER_PAGE = 4;
const categories = ['All', 'gaming', 'tech', 'code', 'robotics', 'cad', 'fashion', 'art', 'others'];

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
  onOpenStoryViewer,
  onOpenCreateStory,
  onOpenStatusNoteModal,
  onOpenNotifications,
  onNavigateToChat,
  onRefreshFeed,
  onNavigateToPost,
  onNavigateToReel
}) => {
  const [activeFeedFilter, setActiveFeedFilter] = useState<'foryou' | 'following' | 'favorites'>('foryou');
  const [selectedPostForComments, setSelectedPostForComments] = useState<Post | null>(null);
  const [hiddenAdIds, setHiddenAdIds] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTopBannerDismissed, setIsTopBannerDismissed] = useState(false);

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

  // Filter posts
  let filteredPosts = posts.filter((p) => !hiddenAdIds.includes(p.id));

  if (activeCategory !== 'All') {
    filteredPosts = filteredPosts.filter(
      (p) =>
        p.category?.toLowerCase() === activeCategory.toLowerCase() ||
        p.hashtags.some((h) => h.toLowerCase().includes(activeCategory.toLowerCase()))
    );
  }

  if (activeFeedFilter === 'following') {
    filteredPosts = filteredPosts.filter((p) => p.username !== 'antigravity_dev');
  } else if (activeFeedFilter === 'favorites') {
    filteredPosts = filteredPosts.filter((p) => p.isSaved || p.isLiked);
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
      <header className="sticky top-0 z-40 w-full bg-zinc-950/95 backdrop-blur-xl border-b border-zinc-800/80 px-3.5 py-2.5 flex items-center justify-between gap-2 shadow-sm">
        {/* Brand Wordmark & Feed Switcher */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1 cursor-pointer select-none shrink-0">
            <h1 className="text-lg font-black italic tracking-tighter text-white">
              NOOB
            </h1>
          </div>

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
            <button
              onClick={() => setActiveFeedFilter('favorites')}
              className={`px-2 py-0.5 rounded-full font-medium transition-all cursor-pointer hidden sm:inline ${
                activeFeedFilter === 'favorites'
                  ? 'bg-rose-600 text-white shadow-sm font-bold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Starred
            </button>
          </div>
        </div>

        {/* Action Icons (Notification Bar, Refresh, Chat) */}
        <div className="flex items-center gap-1.5 shrink-0">
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

          {/* Refresh simulated feed */}
          <button
            onClick={handleRefresh}
            className={`p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-900 transition-colors cursor-pointer ${
              isRefreshing ? 'animate-spin text-[#00FF66]' : ''
            }`}
            title="Refresh Feed"
          >
            <RefreshCw className="w-4 h-4" />
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
            <p className="text-xs text-zinc-400 mt-1">Try selecting another topic filter or refreshing.</p>
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
                onSharePost={() => onNavigateToChat()}
                onToggleArchive={onToggleArchive}
                onToggleComments={onToggleComments}
                onToggleLikeCount={onToggleLikeCount}
                onDeletePost={onDeletePost}
                onHideAd={handleHideAd}
                onSelectCategory={(cat) => setActiveCategory(cat)}
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
    </div>
  );
};

