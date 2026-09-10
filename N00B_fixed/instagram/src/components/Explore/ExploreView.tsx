import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Users,
  UserCheck,
  UserPlus,
  MessageSquare,
  Sparkles,
  Heart,
  MessageCircle,
  X,
  Smile,
  Globe,
  Film,
  Layers,
  CheckCircle2,
  Share2,
  Lock,
  Briefcase,
  Clock,
  Mail,
  Phone,
  Shuffle,
  RefreshCw,
  ArrowDown,
  ArrowRight,
  User as UserIcon,
  Loader2
} from 'lucide-react';
import { Post, Reel, User } from '../../types';
import { fetchUsers } from '../../services/api';
import { VerifiedBadge } from '../Common/VerifiedBadge';

interface ToggleFollowResult {
  success: boolean;
  isFollowing: boolean;
  isFollowRequested?: boolean;
  followersCount: number;
  message?: string;
}

interface ExploreViewProps {
  currentUser?: User | null;
  posts: Post[];
  reels: Reel[];
  onSelectPost: (post: Post) => void;
  onSelectReel: (reel: Reel) => void;
  onStartChat?: (user: User) => void;
  onNavigateToUserProfile?: (user: User) => void;
  // Owns the actual follow/unfollow API call and syncs app-wide user state —
  // ExploreView must not call the API itself, only reflect the result here.
  onToggleFollowUser?: (userId: string) => Promise<ToggleFollowResult | void>;
}

const CATEGORIES = ['All', 'Humor', 'Gaming', 'Music', 'Art & Design', 'Vibes', 'Tech', 'Lifestyle'];
const ITEMS_PER_PAGE = 6;

export const ExploreView: React.FC<ExploreViewProps> = ({
  currentUser,
  posts,
  reels,
  onSelectPost,
  onSelectReel,
  onStartChat,
  onNavigateToUserProfile,
  onToggleFollowUser
}) => {
  const [activeTab, setActiveTab] = useState<'users' | 'posts' | 'reels'>('users');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [usersList, setUsersList] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [followLoadingId, setFollowLoadingId] = useState<string | null>(null);

  // Pagination & Infinite Scroll
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

  // Pull to refresh & shuffle
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const [shuffledPosts, setShuffledPosts] = useState<Post[]>(posts);
  const [shuffledReels, setShuffledReels] = useState<Reel[]>(reels);

  // Sync shuffled items when props update
  useEffect(() => {
    setShuffledPosts(posts);
  }, [posts]);

  useEffect(() => {
    setShuffledReels(reels);
  }, [reels]);

  // Load all registered users from backend (filtering out any fake AI accounts)
  const loadUsers = async (query?: string, shouldShuffle = false) => {
    try {
      setLoadingUsers(true);
      const rawRes = await fetchUsers(query);
      const res = (rawRes || []).filter((u: any) => !u.isAi && u.username !== 'noob_ai' && u.id !== 'u_noob_ai');
      if (shouldShuffle) {
        setUsersList([...res].sort(() => Math.random() - 0.5));
      } else {
        setUsersList(res);
      }
    } catch (err) {
      console.error('Error fetching registered users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    loadUsers(searchQuery);
    setVisibleCount(ITEMS_PER_PAGE);
  }, [searchQuery]);

  const handleShuffleAndRefresh = async () => {
    setIsRefreshing(true);
    setShuffledPosts([...posts].sort(() => Math.random() - 0.5));
    setShuffledReels([...reels].sort(() => Math.random() - 0.5));
    await loadUsers(searchQuery, true);
    setVisibleCount(ITEMS_PER_PAGE);
    setTimeout(() => {
      setIsRefreshing(false);
      setPullDistance(0);
    }, 600);
  };

  // Handle follow / follow-request toggle — the actual API call lives in
  // onToggleFollowUser (App.tsx), which also syncs app-wide user state;
  // this just reflects the result back into this view's own local list.
  const handleToggleFollow = async (userId: string) => {
    try {
      setFollowLoadingId(userId);
      const res = await onToggleFollowUser?.(userId);
      if (res && res.success) {
        setUsersList((prev) =>
          prev.map((u) =>
            u.id === userId
              ? {
                  ...u,
                  isFollowing: res.isFollowing,
                  isFollowRequested: res.isFollowRequested,
                  followersCount: res.followersCount
                }
              : u
          )
        );
      }
    } catch (err) {
      console.error('Follow error:', err);
    } finally {
      setFollowLoadingId(null);
    }
  };

  // Filter posts
  const filteredPosts = shuffledPosts.filter((p) => {
    const matchesSearch =
      !searchQuery ||
      (p.caption && p.caption.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.username && p.username.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.hashtags && p.hashtags.some((h) => h.toLowerCase().includes(searchQuery.toLowerCase())));

    const matchesCategory =
      selectedCategory === 'All' ||
      p.category?.toLowerCase() === selectedCategory.toLowerCase() ||
      (p.hashtags && p.hashtags.some((h) => h.toLowerCase().includes(selectedCategory.toLowerCase())));

    return matchesSearch && matchesCategory;
  });

  // Filter reels
  const filteredReels = shuffledReels.filter((r) => {
    if (!searchQuery) return true;
    return (
      (r.caption && r.caption.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (r.username && r.username.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (r.audioTrackTitle && r.audioTrackTitle.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (r.audioTrack?.title && r.audioTrack.title.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  });

  // Active items count for pagination depending on tab
  const totalItemsCount =
    activeTab === 'users'
      ? usersList.length
      : activeTab === 'posts'
      ? filteredPosts.length
      : filteredReels.length;

  const hasMore = visibleCount < totalItemsCount;

  // IntersectionObserver for Infinite Scrolling
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || !hasMore || isLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          setIsLoadingMore(true);
          setTimeout(() => {
            setVisibleCount((prev) => prev + ITEMS_PER_PAGE);
            setIsLoadingMore(false);
          }, 300);
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, totalItemsCount, visibleCount, activeTab]);

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
      const elastic = Math.min(diff * 0.45, 90);
      setPullDistance(elastic);
    }
  };

  const handleTouchEnd = () => {
    if (pullDistance > 55) {
      handleShuffleAndRefresh();
    } else {
      setPullDistance(0);
    }
    touchStartY.current = null;
    setIsPulling(false);
  };

  const paginatedUsers = usersList.slice(0, visibleCount);
  const paginatedPosts = filteredPosts.slice(0, visibleCount);
  const paginatedReels = filteredReels.slice(0, visibleCount);

  return (
    <div
      id="explore-view-container"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="w-full max-w-4xl mx-auto px-3 sm:px-4 pt-3 pb-24 space-y-4 select-none relative"
    >
      {/* Pull To Refresh / Shuffle Indicator */}
      <div
        className="w-full flex flex-col items-center justify-center overflow-hidden transition-all duration-200"
        style={{
          height: isRefreshing ? '50px' : `${pullDistance}px`,
          opacity: pullDistance > 10 || isRefreshing ? 1 : 0
        }}
      >
        <div className="flex items-center gap-2 px-3.5 py-1 rounded-full bg-zinc-900 border border-[#00FF66]/40 text-white text-xs font-bold shadow-lg shadow-[#00FF66]/10">
          {isRefreshing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 text-[#00FF66] animate-spin" />
              <span className="text-[#00FF66]">Shuffling &amp; Refreshing Explore...</span>
            </>
          ) : pullDistance > 55 ? (
            <>
              <Shuffle className="w-3.5 h-3.5 text-[#00FF66] animate-spin" />
              <span className="text-[#00FF66]">Release to Shuffle Everything</span>
            </>
          ) : (
            <>
              <ArrowDown className="w-3.5 h-3.5 text-zinc-400 animate-bounce" />
              <span className="text-zinc-400">Pull down to Shuffle &amp; Refresh</span>
            </>
          )}
        </div>
      </div>

      {/* 1. Explore Search Bar & Shuffle Trigger */}
      <div className="flex items-center gap-2 w-full">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search registered people, handles, bios, posts & reels..."
            className="w-full bg-zinc-900/90 text-sm text-white pl-10 pr-9 py-3 rounded-2xl border border-white/10 focus:border-[#00FF66] focus:ring-1 focus:ring-[#00FF66] outline-none transition-all placeholder:text-zinc-500 shadow-inner"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Quick Shuffle Button */}
        <button
          onClick={handleShuffleAndRefresh}
          className={`p-3 rounded-2xl bg-zinc-900 border border-white/10 hover:border-[#00FF66]/50 text-zinc-300 hover:text-[#00FF66] transition-all cursor-pointer flex items-center gap-1.5 shadow-sm ${
            isRefreshing ? 'animate-spin text-[#00FF66]' : ''
          }`}
          title="Shuffle all users, posts and reels"
        >
          <Shuffle className="w-4 h-4" />
        </button>
      </div>

      {/* 2. Category & Section Switcher */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 scrollbar-none">
        <div className="flex items-center gap-1.5 p-1 bg-zinc-900/80 rounded-2xl border border-white/5 shrink-0">
          <button
            onClick={() => {
              setActiveTab('users');
              setVisibleCount(ITEMS_PER_PAGE);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'users'
                ? 'bg-[#00FF66] text-black shadow-md shadow-[#00FF66]/20'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>People ({usersList.length})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('posts');
              setVisibleCount(ITEMS_PER_PAGE);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'posts'
                ? 'bg-[#00FF66] text-black shadow-md shadow-[#00FF66]/20'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Posts ({filteredPosts.length})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('reels');
              setVisibleCount(ITEMS_PER_PAGE);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'reels'
                ? 'bg-[#00FF66] text-black shadow-md shadow-[#00FF66]/20'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Reels ({filteredReels.length})</span>
          </button>
        </div>
      </div>

      {/* ================= TAB 1: REGISTERED USERS DIRECTORY ================= */}
      {activeTab === 'users' && (
        <div className="space-y-3">
          {loadingUsers ? (
            <div className="text-center py-12 text-zinc-400 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-[#00FF66] animate-spin" />
              <p className="text-xs">Fetching active members...</p>
            </div>
          ) : usersList.length === 0 ? (
            <div className="text-center py-12 bg-zinc-900/40 rounded-3xl border border-white/5 p-6">
              <Users className="w-10 h-10 text-zinc-500 mx-auto mb-2 opacity-50" />
              <h3 className="text-sm font-bold text-white">No registered people found</h3>
              <p className="text-xs text-zinc-400 mt-1">Try another search keyword.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {paginatedUsers.map((user) => {
                const isMe = user.id === currentUser?.id || user.username === currentUser?.username;
                const isBusiness = user.accountType === 'business' || user.isBusiness;
                const isPrivate = user.accountType === 'private';

                return (
                  <div
                    key={user.id}
                    className="bg-zinc-950 border border-zinc-800/80 hover:border-[#00FF66]/40 transition-all rounded-3xl p-4 flex flex-col justify-between gap-3 shadow-md group"
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar (Click to visit profile) */}
                      <div
                        onClick={() => onNavigateToUserProfile?.(user)}
                        className="relative shrink-0 cursor-pointer group/avatar"
                        title={`View @${user.username}'s profile`}
                      >
                        <img
                          src={user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                          alt={user.username}
                          className="w-12 h-12 rounded-2xl object-cover border border-white/10 group-hover/avatar:scale-105 transition-transform"
                          referrerPolicy="no-referrer"
                        />
                        <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-black" />
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4
                            onClick={() => onNavigateToUserProfile?.(user)}
                            className="text-sm font-bold text-white truncate cursor-pointer hover:text-[#00FF66] transition-colors"
                            title={`View @${user.username}'s profile`}
                          >
                            {user.displayName || user.username}
                          </h4>
                          {user.isVerified && <VerifiedBadge size="sm" />}
                          {isMe && (
                            <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-[9px] font-bold text-zinc-400">
                              You
                            </span>
                          )}

                          {/* Account Type Badge */}
                          {isBusiness ? (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-[#00FF66]/20 text-[#00FF66] font-bold border border-[#00FF66]/30 flex items-center gap-0.5">
                              <Briefcase className="w-2.5 h-2.5" /> Business
                            </span>
                          ) : isPrivate ? (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30 flex items-center gap-0.5">
                              <Lock className="w-2.5 h-2.5" /> Private
                            </span>
                          ) : (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30 flex items-center gap-0.5">
                              <Globe className="w-2.5 h-2.5" /> Public
                            </span>
                          )}
                        </div>

                        {/* Distinct Prominent User ID Badge + Username */}
                        <div className="flex items-center gap-2 flex-wrap mt-1">
                          <button
                            type="button"
                            onClick={() => onNavigateToUserProfile?.(user)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-zinc-900/90 hover:bg-emerald-950/60 border border-zinc-700/80 hover:border-emerald-500/60 text-zinc-300 hover:text-emerald-400 transition-all text-xs font-mono font-semibold cursor-pointer group/uid shadow-sm"
                            title={`Click to view @${user.username}'s profile (ID: ${user.id})`}
                          >
                            <span className="text-[10px] text-[#00FF66] font-extrabold uppercase tracking-wide">ID:</span>
                            <span className="font-bold text-white group-hover/uid:text-[#00FF66]">{user.id}</span>
                            <ArrowRight className="w-3 h-3 text-[#00FF66] opacity-70 group-hover/uid:opacity-100 group-hover/uid:translate-x-0.5 transition-all" />
                          </button>

                          <button
                            type="button"
                            onClick={() => onNavigateToUserProfile?.(user)}
                            className="text-xs text-pink-400 hover:text-pink-300 font-mono font-medium hover:underline cursor-pointer"
                          >
                            @{user.username}
                          </button>

                          {user.countryCode && (
                            <span className="text-[9px] text-zinc-500 font-mono">
                              {user.countryCode}
                            </span>
                          )}
                        </div>

                        {user.businessCategory && isBusiness && (
                          <span className="text-[10px] text-[#00FF66] font-semibold block mt-0.5">
                            {user.businessCategory}
                          </span>
                        )}

                        <p className="text-xs text-zinc-400 line-clamp-2 mt-1 leading-relaxed">
                          {user.bio || 'Connecting on NOOB!'}
                        </p>
                      </div>
                    </div>

                    {/* Stats & Actions */}
                    <div className="pt-2.5 border-t border-white/5 flex items-center justify-between gap-2 w-full min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] text-zinc-400 font-medium min-w-0 truncate">
                        <span className="truncate">
                          <strong className="text-white font-bold">{Intl.NumberFormat('en', { notation: 'compact' }).format(user.followersCount || 0)}</strong> followers
                        </span>
                        <span className="text-zinc-600 shrink-0">•</span>
                        <span className="truncate">
                          <strong className="text-white font-bold">{Intl.NumberFormat('en', { notation: 'compact' }).format(user.followingCount || 0)}</strong> following
                        </span>
                      </div>

                      {!isMe ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Visit Profile Button */}
                          <button
                            onClick={() => onNavigateToUserProfile?.(user)}
                            className="px-2.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-[#00FF66] border border-white/10 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                            title={`Visit @${user.username}'s profile`}
                          >
                            <UserIcon className="w-3.5 h-3.5" />
                            <span>Profile</span>
                          </button>

                          {onStartChat && (
                            <button
                              onClick={() => onStartChat(user)}
                              className="p-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/10 transition-colors cursor-pointer shrink-0"
                              title={`Message @${user.username}`}
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Follow / Unfollow Button */}
                          <button
                            onClick={() => handleToggleFollow(user.id)}
                            disabled={followLoadingId === user.id}
                            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shrink-0 disabled:opacity-50 whitespace-nowrap group/fbtn ${
                              user.isFollowing
                                ? 'bg-zinc-900 hover:bg-red-950/60 text-zinc-200 hover:text-red-400 border border-white/10 hover:border-red-500/40'
                                : user.isFollowRequested
                                ? 'bg-purple-950 text-purple-300 border border-purple-500/40'
                                : 'bg-gradient-to-r from-[#ff4e6a] to-[#ff758c] text-white shadow-md shadow-pink-500/20 hover:opacity-95'
                            }`}
                          >
                            {user.isFollowing ? (
                              <>
                                <UserCheck className="w-3.5 h-3.5 text-emerald-400 group-hover/fbtn:hidden" />
                                <X className="w-3.5 h-3.5 text-red-400 hidden group-hover/fbtn:inline" />
                                <span className="group-hover/fbtn:hidden">Following</span>
                                <span className="hidden group-hover/fbtn:inline">Unfollow</span>
                              </>
                            ) : user.isFollowRequested ? (
                              <>
                                <Clock className="w-3.5 h-3.5 text-purple-300" />
                                <span>Requested</span>
                              </>
                            ) : isPrivate ? (
                              <>
                                <Lock className="w-3.5 h-3.5" />
                                <span>Request</span>
                              </>
                            ) : (
                              <>
                                <UserPlus className="w-3.5 h-3.5" />
                                <span>Follow</span>
                              </>
                            )}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => onNavigateToUserProfile?.(user)}
                          className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-[#00FF66] border border-white/10 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                        >
                          <UserIcon className="w-3.5 h-3.5" />
                          <span>My Profile</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 2: POSTS ================= */}
      {activeTab === 'posts' && (
        <div className="space-y-4">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  setSelectedCategory(cat);
                  setVisibleCount(ITEMS_PER_PAGE);
                }}
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-[#00FF66] text-black font-bold shadow-md shadow-[#00FF66]/20'
                    : 'bg-zinc-900 text-zinc-400 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            {paginatedPosts.map((post) => (
              <div
                key={post.id}
                onClick={() => onSelectPost(post)}
                className="group relative aspect-square bg-zinc-900 rounded-2xl overflow-hidden border border-white/5 cursor-pointer"
              >
                <img
                  src={post.slides?.[0]?.mediaUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80'}
                  alt={post.caption}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 text-white font-bold text-xs">
                  <span className="flex items-center gap-1">
                    <Heart className="w-4 h-4 fill-white" /> {post.likesCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle className="w-4 h-4 fill-white" /> {post.commentsCount}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================= TAB 3: REELS ================= */}
      {activeTab === 'reels' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
          {paginatedReels.map((reel) => (
            <div
              key={reel.id}
              onClick={() => onSelectReel(reel)}
              className="group relative aspect-[9/16] bg-zinc-900 rounded-2xl overflow-hidden border border-white/5 cursor-pointer"
            >
              <img
                src={reel.thumbnailUrl || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80'}
                alt={reel.caption}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-white text-[11px] font-bold">
                <span className="truncate">@{reel.username}</span>
                <span className="flex items-center gap-1 bg-black/60 px-1.5 py-0.5 rounded-md">
                  <Film className="w-3 h-3 text-[#00FF66]" /> {reel.viewsCount}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Infinite Scroll Load More Sentinel */}
      <div ref={loadMoreSentinelRef} className="w-full py-4 flex items-center justify-center">
        {isLoadingMore ? (
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Loader2 className="w-4 h-4 text-[#00FF66] animate-spin" />
            <span>Loading more Explore items...</span>
          </div>
        ) : hasMore ? (
          <div className="h-4" />
        ) : totalItemsCount > ITEMS_PER_PAGE ? (
          <div className="text-center py-2 text-[11px] text-zinc-500 font-medium">
            ✓ End of Explore
          </div>
        ) : null}
      </div>
    </div>
  );
};
