import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Radio, Users, Heart, X, Trash2, Search, MoreHorizontal, MessageCircle, Share2, Bookmark, EyeOff, Eye, MessageSquareOff, Pencil, Copy, Check, Menu, Clock, ListVideo, ListPlus, Pin, TrendingUp, UserCheck, Video as VideoIcon, Flame, ThumbsUp, History as HistoryIcon } from 'lucide-react';
import { User, LongVideo, LongVideoPlaylist } from '../../types';
import { AvatarMedia } from '../Common/AvatarMedia';
import { formatRelativeTime } from '../../utils/formatTime';
import { formatNoobPoints } from '../../utils/formatPoints';
import { LikesViewsSheet } from '../Common/LikesViewsSheet';
import { SharePostSheet } from '../Common/SharePostSheet';
import { SharePostToChatModal } from '../Common/SharePostToChatModal';
import { VideoCommentsSheet } from './VideoCommentsSheet';
import { EditVideoDetailsModal } from './EditVideoDetailsModal';
import { LongVideoListPage } from './LongVideoListPage';
import { LongVideoPlaylistsView } from './LongVideoPlaylistsView';
import { can, isMainAdmin } from '../../adminAccess';
import {
  fetchLongVideos,
  fetchLongVideoById,
  fetchLiveStreams,
  toggleLikeLongVideo,
  recordLongVideoView,
  deleteLongVideo,
  toggleSaveLongVideo,
  toggleLongVideoComments,
  toggleLongVideoLikeCount,
  fetchLongVideoLikers,
  fetchLongVideoViewers,
  fetchUserById,
  endLiveStream,
  fetchLongVideoHistory,
  fetchLikedLongVideos,
  fetchPlaylistsForVideo,
  createLongVideoPlaylist,
  toggleVideoInPlaylist,
  type LiveStreamSummary
} from '../../services/api';
import { sendLike } from '../../utils/likeSync';
import { setVisibleInterval } from '../../utils/visibleInterval';
import { LazyVideo } from '../Common/LazyVideo';
import { usePinnedFeedItems, toggleFeedPin } from '../../services/pinnedFeed';
import { buildIndex, searchIndex, didYouMean, suggest, popularity, recentSearches, rememberSearch, forgetSearch, clearSearches } from '../../utils/searchEngine';

const LiveStreamView = React.lazy(() => import('../LiveStream/LiveStreamView').then((m) => ({ default: m.LiveStreamView })));

interface HomeVideoFeedViewProps {
  currentUser: User;
  onOpenUpload: () => void;
  onNavigateToProfile?: (user: User) => void;
  refreshKey?: number; // bumped by the parent right after a successful upload, to refetch
  initialOpenVideoId?: string; // a "?video=<id>" deep link or a shared-video chat card tap
  onInitialOpenVideoIdHandled?: () => void;
}

const formatDuration = (totalSeconds: number): string => {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

// Fisher-Yates — a fresh random order every time the feed loads, not a stable sort.
const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

type FilterChip = 'all' | 'live' | 'trending' | 'following' | 'newest' | 'liked' | 'saved' | 'mine';

// topics offered in the left menu: tapping one searches for it (the search finds related words too, so "Music" also finds songs)
const TOPICS: [string, string][] = [['🎵', 'Music'], ['😂', 'Comedy'], ['🎮', 'Gaming'], ['📚', 'Learning'], ['🍳', 'Food'], ['✈️', 'Travel'], ['🏏', 'Sports'], ['📱', 'Tech'], ['🎬', 'Movies'], ['💪', 'Fitness'], ['💡', 'Motivation'], ['💃', 'Dance']];
const FILTER_LABEL: Record<FilterChip, string> = { all: 'All', live: 'Live', trending: 'Trending', following: 'Following', newest: 'Newest', liked: 'Most liked', saved: 'Saved', mine: 'Your videos' };
const EMPTY_TEXT: Record<FilterChip, string> = {
  all: 'No videos yet — be the first to upload one.', live: 'Nobody is live right now.', trending: 'Nothing is trending yet.',
  following: 'Videos from the people you follow will show up here.', newest: 'No videos yet.', liked: 'No videos yet.',
  saved: 'Videos you save will show up here.', mine: 'You have not uploaded a video yet. Tap Create to upload one.'
};

// The "Feed" tab (named to match YouTube's own naming for this kind of page) — a YouTube-style feed
// of long-form uploads plus whoever is live right now, rendered as one list of equally-sized cards
// (a live stream just carries a LIVE badge instead of a duration badge). Reels never appear here
// (separate table, separate feed function — see long_videos in the migrations), and this page never
// appears inside Reels either; each content type has exactly one home.
export const HomeVideoFeedView: React.FC<HomeVideoFeedViewProps> = ({
  currentUser,
  onOpenUpload,
  onNavigateToProfile,
  refreshKey,
  initialOpenVideoId,
  onInitialOpenVideoIdHandled
}) => {
  const isMasterAdmin = can(currentUser, 'moderate_content');
  const pinnedItems = usePinnedFeedItems();
  const [videos, setVideos] = useState<LongVideo[]>([]);
  const [liveStreams, setLiveStreams] = useState<LiveStreamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [openVideo, setOpenVideo] = useState<LongVideo | null>(null);
  const [openLive, setOpenLive] = useState<LiveStreamSummary | null>(null);
  const [filter, setFilter] = useState<FilterChip>('all');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);          // the list of suggestions under the box
  const [recents, setRecents] = useState<string[]>(() => recentSearches());

  // The "⋮" options sheet — actionVideo is which video it's for (from a list card tap or the open
  // player, shared by both surfaces instead of two separate menu implementations) and stays set
  // after the sheet itself closes, since Share/Edit open a FOLLOW-UP modal that still needs it.
  const [actionVideo, setActionVideo] = useState<LongVideo | null>(null);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [showShareToChat, setShowShareToChat] = useState(false);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showLikesSheet, setShowLikesSheet] = useState(false);

  // Same idea for a live stream's own small "⋮" menu — just Copy Link for everyone and Stop Live
  // for a moderator, so it doesn't need the full video sheet's extra states.
  const [menuLive, setMenuLive] = useState<LiveStreamSummary | null>(null);
  const [liveLinkCopied, setLiveLinkCopied] = useState(false);

  // Hamburger menu -> History / Playlist / Liked Videos, same pattern as the Home feed's own "NOOB" menu.
  const [showFeedMenu, setShowFeedMenu] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showLikedVideos, setShowLikedVideos] = useState(false);
  const [showPlaylists, setShowPlaylists] = useState(false);

  // "Add to playlist" picker, opened from the "⋮" options sheet.
  const [showAddToPlaylist, setShowAddToPlaylist] = useState(false);
  const [addToPlaylistList, setAddToPlaylistList] = useState<(LongVideoPlaylist & { hasVideo: boolean })[]>([]);
  const [addToPlaylistLoading, setAddToPlaylistLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    // Reshuffled on every load/refresh — the "All" chip is a random order each time, not a feed rank.
    fetchLongVideos().then((list) => { if (alive) { setVideos(shuffle(list)); setLoading(false); } });
    return () => { alive = false; };
  }, [refreshKey]);

  useEffect(() => {
    let alive = true;
    const load = () => fetchLiveStreams().then((res) => { if (alive && res.success) setLiveStreams(res.streams); });
    load();
    const stopInterval = setVisibleInterval(load, 15000);   // rests while the page is hidden
    return () => { alive = false; stopInterval(); };
  }, []);

  // A deep link / shared-chat-card tap for a video that may not be in the freshly-loaded list yet.
  useEffect(() => {
    if (!initialOpenVideoId) return;
    const existing = videos.find((v) => v.id === initialOpenVideoId);
    if (existing) {
      setOpenVideo(existing);
      onInitialOpenVideoIdHandled?.();
      return;
    }
    if (loading) return; // wait for the first load to resolve before deciding it's not in the list
    fetchLongVideoById(initialOpenVideoId).then((v) => { if (v) setOpenVideo(v); });
    onInitialOpenVideoIdHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpenVideoId, loading]);

  // The search works like YouTube's: every word on its own, in the title, the uploader's name and the description, typing mistakes and word endings
  // forgiven, related words found (music ~ songs), best matches first (see utils/searchEngine.ts).
  const videoIndex = useMemo(() => buildIndex<LongVideo>(videos.map((v) => ({
    item: v,
    boost: popularity({ views: v.viewsCount, likes: v.likesCount, comments: v.commentsCount, createdAt: v.createdAt }),
    fields: [{ text: v.title, weight: 5 }, { text: v.username, weight: 3 }, { text: v.description, weight: 1.5 }]
  }))), [videos]);
  const liveIndex = useMemo(() => buildIndex<LiveStreamSummary>(liveStreams.map((s) => ({
    item: s, boost: 0.5,
    fields: [{ text: s.title || '', weight: 5 }, { text: s.host.username, weight: 3 }, { text: s.host.displayName || '', weight: 3 }]
  }))), [liveStreams]);
  const query = searchQuery.trim();
  // if what was typed holds a misspelt word, the corrected search (shown as "Showing results for ...")
  const corrected = useMemo(() => (query ? didYouMean(query, videoIndex.vocab) : null), [query, videoIndex]);
  const followingSet = useMemo(() => new Set(currentUser.followingIds || []), [currentUser.followingIds]);
  const trendingScore = (v: LongVideo) => v.viewsCount + 3 * v.likesCount + 5 * v.commentsCount;

  const displayedVideos = useMemo(() => {
    let list = videos;
    if (filter === 'live') return [];
    if (filter === 'mine') list = list.filter((v) => v.userId === currentUser.id);
    else if (filter === 'saved') list = list.filter((v) => v.isSaved);
    else if (filter === 'following') list = list.filter((v) => followingSet.has(v.userId));
    else if (filter === 'trending') {
      const recent = list.filter((v) => Date.now() - +new Date(v.createdAt) < 14 * 86_400_000);
      list = [...(recent.length >= 3 ? recent : list)].sort((a, b) => trendingScore(b) - trendingScore(a));
    }
    if (query) {
      // best match first; "Newest" / "Most liked" re-order the matches the way they say
      const allowed = new Set(list.map((v) => v.id));
      const run = (q: string) => searchIndex<LongVideo>(q, videoIndex).map((h) => h.item).filter((v) => allowed.has(v.id));
      let found = run(corrected || query);
      if (found.length === 0 && corrected) found = run(query);
      if (filter === 'newest') found = [...found].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
      else if (filter === 'liked') found = [...found].sort((a, b) => b.likesCount - a.likesCount);
      return found;
    }
    if (filter === 'newest') list = [...list].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    else if (filter === 'liked') list = [...list].sort((a, b) => b.likesCount - a.likesCount);
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos, filter, query, corrected, videoIndex, followingSet, currentUser.id]);

  const displayedLiveStreams = useMemo(() => {
    if (filter !== 'all' && filter !== 'live') return [];
    if (!query) return liveStreams;
    const found = searchIndex(corrected || query, liveIndex).map((h) => h.item);
    return found.length || !corrected ? found : searchIndex(query, liveIndex).map((h) => h.item);
  }, [liveStreams, filter, query, corrected, liveIndex]);

  // what to offer under the search box: matching titles and names while typing, the last searches when the box is empty
  const suggestions = useMemo(() => {
    if (!query) return [];
    const names = [...videos.map((v) => v.title), ...videos.map((v) => v.username), ...liveStreams.map((s) => s.title || ''), ...liveStreams.map((s) => s.host.username)];
    return suggest(query, names, 6);
  }, [query, videos, liveStreams]);
  const runSearch = (text: string) => {
    setSearchQuery(text);
    setShowSearch(true);
    setSearchOpen(false);
    setRecents(rememberSearch(text));
  };
  const pickFilter = (f: FilterChip) => { setFilter(f); setShowFeedMenu(false); };

  const copyVideoLink = async (videoId: string) => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?video=${encodeURIComponent(videoId)}`;
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = shareUrl;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* best effort */ }
      document.body.removeChild(ta);
    }
    setShareLinkCopied(true);
    setTimeout(() => setShareLinkCopied(false), 1800);
  };

  const copyLiveLink = async (streamId: string) => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?live=${encodeURIComponent(streamId)}`;
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = shareUrl;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* best effort */ }
      document.body.removeChild(ta);
    }
    setLiveLinkCopied(true);
    setTimeout(() => setLiveLinkCopied(false), 1800);
  };

  const handleStopLive = async (stream: LiveStreamSummary) => {
    if (!confirm(`Stop ${stream.host.username}'s live stream for everyone?`)) return;
    await endLiveStream(stream.id);
    setLiveStreams((prev) => prev.filter((s) => s.id !== stream.id));
    setMenuLive(null);
  };

  const patchVideo = (videoId: string, patch: Partial<LongVideo>) => {
    setVideos((prev) => prev.map((v) => (v.id === videoId ? { ...v, ...patch } : v)));
    setOpenVideo((cur) => (cur && cur.id === videoId ? { ...cur, ...patch } : cur));
    setActionVideo((cur) => (cur && cur.id === videoId ? { ...cur, ...patch } : cur));
  };

  const handleToggleLike = (video: LongVideo) => {
    const want = !video.isLiked;
    patchVideo(video.id, { isLiked: want, likesCount: Math.max(0, video.likesCount + (want ? 1 : -1)) });
    sendLike(
      `video:${video.id}`, want, () => toggleLikeLongVideo(video.id),
      (r) => patchVideo(video.id, { isLiked: r.isLiked, likesCount: r.likesCount }),
      () => patchVideo(video.id, { isLiked: video.isLiked, likesCount: video.likesCount })
    );
  };

  const handleToggleSave = async (video: LongVideo) => {
    const res: any = await toggleSaveLongVideo(video.id);
    if ('isSaved' in res) patchVideo(video.id, { isSaved: res.isSaved, savesCount: res.savesCount });
    else if (res.error) alert(res.error);
  };

  const openAddToPlaylist = async (video: LongVideo) => {
    setActionVideo(video);
    setShowOptionsMenu(false);
    setShowAddToPlaylist(true);
    setAddToPlaylistLoading(true);
    setAddToPlaylistList(await fetchPlaylistsForVideo(video.id));
    setAddToPlaylistLoading(false);
  };

  const handleToggleVideoInPlaylist = async (playlistId: string) => {
    if (!actionVideo) return;
    const res = await toggleVideoInPlaylist(playlistId, actionVideo.id);
    if (res.success) {
      setAddToPlaylistList((prev) => prev.map((p) => (p.id === playlistId ? { ...p, hasVideo: !!res.inPlaylist, videosCount: p.videosCount + (res.inPlaylist ? 1 : -1) } : p)));
    } else if (res.error) {
      alert(res.error);
    }
  };

  const handleCreatePlaylistForVideo = async () => {
    const name = prompt('Name your playlist:');
    if (!name || !name.trim() || !actionVideo) return;
    const res = await createLongVideoPlaylist(name.trim());
    if (res.success && res.id) {
      await toggleVideoInPlaylist(res.id, actionVideo.id);
      setAddToPlaylistList(await fetchPlaylistsForVideo(actionVideo.id));
    } else {
      alert(res.error || 'Could not create the playlist.');
    }
  };

  const handleToggleComments = async (video: LongVideo) => {
    const res: any = await toggleLongVideoComments(video.id);
    if ('isCommentsDisabled' in res) patchVideo(video.id, { isCommentsDisabled: res.isCommentsDisabled });
    else if (res.error) alert(res.error);
  };

  const handleToggleLikeCountHidden = async (video: LongVideo) => {
    const res: any = await toggleLongVideoLikeCount(video.id);
    if ('isLikeCountHidden' in res) patchVideo(video.id, { isLikeCountHidden: res.isLikeCountHidden });
    else if (res.error) alert(res.error);
  };

  const handleDelete = async (video: LongVideo) => {
    if (!confirm('Delete this video? This cannot be undone.')) return;
    const ok = await deleteLongVideo(video.id);
    if (ok) {
      setVideos((prev) => prev.filter((v) => v.id !== video.id));
      setOpenVideo(null);
      setActionVideo(null);
    } else {
      alert('Could not delete this video. Please try again.');
    }
  };

  const canModerate = (video: LongVideo) => video.userId === currentUser.id || isMasterAdmin;
  const isOwner = (video: LongVideo) => video.userId === currentUser.id;

  const VideoCard: React.FC<{ video: LongVideo }> = ({ video }) => (
    <div className="w-full flex flex-col gap-2 group">
      <button onClick={() => setOpenVideo(video)} className="relative w-full aspect-video rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 cursor-pointer text-left">
        {video.thumbnailUrl ? (
          <img src={video.thumbnailUrl} alt={video.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
        ) : (
          <LazyVideo src={video.videoUrl} className="w-full h-full object-cover" muted />
        )}
        <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">{formatDuration(video.durationSeconds)}</span>
      </button>
      <div className="flex items-start gap-2.5 px-0.5">
        <button onClick={() => setOpenVideo(video)} className="flex items-start gap-2.5 flex-1 min-w-0 cursor-pointer text-left">
          <AvatarMedia src={video.userAvatar} alt={video.username} className="w-9 h-9 rounded-full object-cover shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-white line-clamp-2 leading-snug">{video.title || 'Untitled video'}</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              @{video.username} • {video.viewsCount.toLocaleString()} views • {formatRelativeTime(video.createdAt)}
            </p>
          </div>
        </button>
        <button
          onClick={() => { setActionVideo(video); setShowOptionsMenu(true); }}
          className="p-1.5 text-zinc-500 hover:text-white rounded-full hover:bg-zinc-900 cursor-pointer shrink-0"
          title="More"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  const LiveCard: React.FC<{ s: LiveStreamSummary }> = ({ s }) => (
    <div className="w-full flex flex-col gap-2 group">
      <button onClick={() => setOpenLive(s)} className="relative w-full aspect-video rounded-2xl overflow-hidden bg-gradient-to-br from-red-950 to-zinc-900 border border-red-500/30 flex items-center justify-center cursor-pointer text-left">
        <AvatarMedia src={s.host.avatar} alt={s.host.username} className="w-16 h-16 rounded-full object-cover border-2 border-red-500/50 opacity-90" />
        <span className="absolute top-2 left-2 bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full tracking-wide flex items-center gap-1">
          <Radio className="w-2.5 h-2.5" /> LIVE
        </span>
        <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 bg-black/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
          <Users className="w-2.5 h-2.5" /> {s.viewerCount}
        </span>
      </button>
      <div className="flex items-start gap-2.5 px-0.5">
        <button onClick={() => setOpenLive(s)} className="flex items-start gap-2.5 flex-1 min-w-0 cursor-pointer text-left">
          <AvatarMedia src={s.host.avatar} alt={s.host.username} className="w-9 h-9 rounded-full object-cover shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-white line-clamp-2 leading-snug">{s.title || `${s.host.username} is live`}</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">@{s.host.username} • {s.viewerCount.toLocaleString()} watching</p>
          </div>
        </button>
        <button onClick={() => setMenuLive(s)} className="p-1.5 text-zinc-500 hover:text-white rounded-full hover:bg-zinc-900 cursor-pointer shrink-0" title="More">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="w-full flex flex-col items-center pb-24">
      <header className="sticky top-0 z-40 w-full bg-zinc-950/95 backdrop-blur-xl border-b border-zinc-800/80 px-3.5 py-2.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          {showSearch ? (
            <div className="flex-1 relative">
            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-3 py-1.5">
              <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={(e) => { if (e.key === 'Enter') runSearch(searchQuery); else if (e.key === 'Escape') setSearchOpen(false); }}
                enterKeyHint="search"
                autoComplete="off"
                placeholder="Search videos, people, topics"
                className="flex-1 min-w-0 bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none"
                data-testid="feed-search-input"
              />
              <button onClick={() => { if (searchQuery) { setSearchQuery(''); setSearchOpen(true); } else { setShowSearch(false); setSearchOpen(false); } }} className="text-zinc-400 hover:text-white cursor-pointer shrink-0" aria-label={searchQuery ? 'Clear search' : 'Close search'}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {searchOpen && (suggestions.length > 0 || (!query && recents.length > 0)) && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden" data-testid="feed-search-suggestions">
                {!query && (
                  <div className="flex items-center justify-between px-3.5 pt-2.5 pb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Recent searches</span>
                    <button onClick={() => { clearSearches(); setRecents([]); }} className="text-[10px] font-bold text-zinc-400 hover:text-white cursor-pointer">Clear</button>
                  </div>
                )}
                {(query ? suggestions : recents).map((text) => (
                  <div key={text} className="flex items-center hover:bg-zinc-900">
                    <button onClick={() => runSearch(text)} className="flex-1 min-w-0 flex items-center gap-2.5 px-3.5 py-2.5 text-left cursor-pointer">
                      {query ? <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" /> : <HistoryIcon className="w-3.5 h-3.5 text-zinc-500 shrink-0" />}
                      <span className="text-xs text-white truncate">{text}</span>
                    </button>
                    {!query && (
                      <button onClick={() => setRecents(forgetSearch(text))} className="px-3 py-2.5 text-zinc-600 hover:text-white cursor-pointer" aria-label={`Remove ${text} from recent searches`}>
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setShowFeedMenu(true)}
                  className="p-1 -ml-1 text-zinc-300 hover:text-white rounded-lg hover:bg-zinc-900 transition-colors cursor-pointer"
                  title="History, Playlist & Liked Videos"
                >
                  <Menu className="w-4.5 h-4.5" />
                </button>
                <h1 className="text-lg font-black italic tracking-tighter text-white">Feed</h1>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setShowSearch(true)} className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-900 transition-colors cursor-pointer" title="Search videos">
                  <Search className="w-4 h-4" />
                </button>
                <button
                  onClick={onOpenUpload}
                  className="flex items-center gap-1 bg-noob text-black rounded-full pl-2 pr-3 py-1.5 text-xs font-bold cursor-pointer hover:bg-noob/90 transition-colors"
                  title="Upload a video"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" /> Create
                </button>
              </div>
            </>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {(['all', 'live', 'trending', 'following', 'newest', 'liked', 'saved', 'mine'] as FilterChip[]).map((key) => [key, FILTER_LABEL[key]] as [FilterChip, string]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors cursor-pointer ${
                filter === key ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="w-full max-w-2xl px-3 py-3" onClick={() => setSearchOpen(false)}>
        {query && !loading && (
          <p className="text-[11px] text-zinc-400 mb-2.5 px-0.5" data-testid="feed-search-note">
            {corrected && displayedVideos.length + displayedLiveStreams.length > 0
              ? <>Showing results for <button onClick={() => runSearch(corrected)} className="text-white font-bold underline underline-offset-2 cursor-pointer">{corrected}</button> <span className="text-zinc-500">(you typed “{query}”)</span></>
              : <>{displayedVideos.length + displayedLiveStreams.length} result{displayedVideos.length + displayedLiveStreams.length === 1 ? '' : 's'} for “{query}”, best match first</>}
          </p>
        )}
        {loading ? (
          <div className="py-16 flex items-center justify-center text-zinc-500 text-xs">Loading videos…</div>
        ) : displayedVideos.length === 0 && displayedLiveStreams.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-2 text-center text-zinc-500">
            <Radio className="w-8 h-8 text-zinc-700" />
            <p className="text-xs">
              {query ? `No videos found for “${query}”. Try fewer words, or a topic like music, comedy or gaming.` : EMPTY_TEXT[filter]}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayedLiveStreams.map((s) => <LiveCard key={s.id} s={s} />)}
            {displayedVideos.map((video) => <VideoCard key={video.id} video={video} />)}
          </div>
        )}
      </div>

      {openVideo && (
        <div className="fixed inset-0 z-50 bg-black media-dark flex flex-col">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-zinc-800/80 shrink-0">
            <button onClick={() => setOpenVideo(null)} className="p-1.5 text-white cursor-pointer"><X className="w-5 h-5" /></button>
            <button onClick={() => { setActionVideo(openVideo); setShowOptionsMenu(true); }} className="p-1.5 text-white cursor-pointer" title="More">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>
          <div className="w-full bg-black shrink-0">
            <video
              src={openVideo.videoUrl}
              controls
              autoPlay
              className="w-full max-h-[45vh] bg-black"
              onPlay={() => { void recordLongVideoView(openVideo.id).then((res) => { if (res.success && typeof res.viewsCount === 'number') patchVideo(openVideo.id, { viewsCount: res.viewsCount }); }); }}
            />
          </div>
          <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3">
            <h2 className="text-white text-sm font-bold leading-snug">{openVideo.title || 'Untitled video'}</h2>
            <button
              onClick={() => { if (canModerate(openVideo)) setShowLikesSheet(true); }}
              disabled={!canModerate(openVideo)}
              className="text-zinc-400 text-[11px] text-left cursor-pointer disabled:cursor-default"
            >
              {openVideo.viewsCount.toLocaleString()} views • {formatRelativeTime(openVideo.createdAt)}
            </button>

            <div className="flex items-center justify-between py-2 border-y border-zinc-800/80">
              <button
                onClick={() => { void fetchUserById(openVideo.userId).then((u) => u && onNavigateToProfile?.(u)); }}
                className="flex items-center gap-2 cursor-pointer"
              >
                <AvatarMedia src={openVideo.userAvatar} alt={openVideo.username} className="w-9 h-9 rounded-full object-cover" />
                <span className="text-white text-xs font-semibold">@{openVideo.username}</span>
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleLike(openVideo)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer ${
                    openVideo.isLiked ? 'bg-red-500/15 text-red-400 border border-red-500/40' : 'bg-zinc-900 text-zinc-300 border border-zinc-800'
                  }`}
                >
                  <Heart className={`w-3.5 h-3.5 ${openVideo.isLiked ? 'fill-current' : ''}`} />
                  {(!openVideo.isLikeCountHidden || canModerate(openVideo)) && formatNoobPoints(openVideo.likesCount)}
                </button>
                <button
                  onClick={() => setShowComments(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer bg-zinc-900 text-zinc-300 border border-zinc-800"
                >
                  <MessageCircle className="w-3.5 h-3.5" /> {openVideo.commentsCount > 0 ? formatNoobPoints(openVideo.commentsCount) : ''}
                </button>
              </div>
            </div>
            {openVideo.description && <p className="text-zinc-300 text-xs whitespace-pre-line leading-relaxed">{openVideo.description}</p>}
          </div>
        </div>
      )}

      {openLive && (
        <React.Suspense fallback={null}>
          <LiveStreamView currentUser={currentUser} mode="view" stream={openLive} onClose={() => setOpenLive(null)} />
        </React.Suspense>
      )}

      {/* "⋮" options sheet — shared by a list card tap and the open player's own button. Share and
          Edit open a follow-up modal, so this closes itself (showOptionsMenu) without clearing
          actionVideo — those modals render off actionVideo, not off whatever's currently open. */}
      {showOptionsMenu && actionVideo && (
        <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center animate-in fade-in duration-150" onClick={() => setShowOptionsMenu(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-xs bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
          >
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-sm font-bold text-white truncate pr-4">{actionVideo.title || 'Video options'}</h2>
              <button onClick={() => setShowOptionsMenu(false)} className="p-1.5 rounded-full hover:bg-zinc-900 text-zinc-400 hover:text-white cursor-pointer shrink-0">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            <div className="p-2 space-y-0.5">
              <button
                onClick={() => { setShowOptionsMenu(false); setShowShareSheet(true); }}
                className="w-full p-3 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors cursor-pointer"
              >
                <Share2 className="w-4.5 h-4.5 text-cyan-400 shrink-0" />
                <span className="text-xs font-bold text-white">Share</span>
              </button>
              <button
                onClick={() => { void handleToggleSave(actionVideo); setShowOptionsMenu(false); }}
                className="w-full p-3 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors cursor-pointer"
              >
                <Bookmark className={`w-4.5 h-4.5 shrink-0 ${actionVideo.isSaved ? 'text-noob fill-current' : 'text-zinc-400'}`} />
                <span className="text-xs font-bold text-white">{actionVideo.isSaved ? 'Saved' : 'Save'}</span>
              </button>
              <button
                onClick={() => void openAddToPlaylist(actionVideo)}
                className="w-full p-3 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors cursor-pointer"
              >
                <ListPlus className="w-4.5 h-4.5 text-zinc-400 shrink-0" />
                <span className="text-xs font-bold text-white">Add to playlist</span>
              </button>

              {isMainAdmin(currentUser) && (
                <button
                  onClick={async () => {
                    setShowOptionsMenu(false);
                    const res = await toggleFeedPin('video', actionVideo.id);
                    if (!res.success) alert(res.error || 'Could not change the pin.');
                  }}
                  className="w-full p-3 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors cursor-pointer"
                >
                  <Pin className="w-4.5 h-4.5 text-noob shrink-0" />
                  <span className="text-xs font-bold text-white">{pinnedItems.some((p) => p.kind === 'video' && p.itemId === actionVideo.id) ? 'Unpin from Feed' : 'Pin to Feed'}</span>
                </button>
              )}

              {canModerate(actionVideo) && (
                <>
                  <div className="h-px bg-zinc-900 my-1" />
                  <button
                    onClick={() => { void handleToggleLikeCountHidden(actionVideo); setShowOptionsMenu(false); }}
                    className="w-full p-3 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors cursor-pointer"
                  >
                    {actionVideo.isLikeCountHidden ? <Eye className="w-4.5 h-4.5 text-zinc-400 shrink-0" /> : <EyeOff className="w-4.5 h-4.5 text-zinc-400 shrink-0" />}
                    <span className="text-xs font-bold text-white">{actionVideo.isLikeCountHidden ? 'Show like count' : 'Hide like count'}</span>
                  </button>
                  <button
                    onClick={() => { void handleToggleComments(actionVideo); setShowOptionsMenu(false); }}
                    className="w-full p-3 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors cursor-pointer"
                  >
                    <MessageSquareOff className="w-4.5 h-4.5 text-zinc-400 shrink-0" />
                    <span className="text-xs font-bold text-white">{actionVideo.isCommentsDisabled ? 'Turn on comments' : 'Turn off comments'}</span>
                  </button>
                  {isOwner(actionVideo) && (
                    <button
                      onClick={() => { setShowOptionsMenu(false); setShowEditModal(true); }}
                      className="w-full p-3 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors cursor-pointer"
                    >
                      <Pencil className="w-4.5 h-4.5 text-zinc-400 shrink-0" />
                      <span className="text-xs font-bold text-white">Edit video details</span>
                    </button>
                  )}
                  <button
                    onClick={() => { setShowOptionsMenu(false); void handleDelete(actionVideo); }}
                    className="w-full p-3 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4.5 h-4.5 text-red-400 shrink-0" />
                    <span className="text-xs font-bold text-red-400">Delete video</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Live stream's own small "⋮" menu — Copy Link for everyone, Stop Live for a moderator */}
      {menuLive && (
        <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center animate-in fade-in duration-150" onClick={() => setMenuLive(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-xs bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
          >
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-sm font-bold text-white truncate pr-4">{menuLive.title || `${menuLive.host.username} is live`}</h2>
              <button onClick={() => setMenuLive(null)} className="p-1.5 rounded-full hover:bg-zinc-900 text-zinc-400 hover:text-white cursor-pointer shrink-0">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            <div className="p-2 space-y-0.5">
              <button
                onClick={() => copyLiveLink(menuLive.id)}
                className="w-full p-3 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors cursor-pointer"
              >
                {liveLinkCopied ? <Check className="w-4.5 h-4.5 text-noob shrink-0" /> : <Copy className="w-4.5 h-4.5 text-cyan-400 shrink-0" />}
                <span className="text-xs font-bold text-white">{liveLinkCopied ? 'Link copied!' : 'Copy link'}</span>
              </button>
              {(isMasterAdmin || menuLive.host.id === currentUser.id) && (
                <>
                  <div className="h-px bg-zinc-900 my-1" />
                  <button
                    onClick={() => void handleStopLive(menuLive)}
                    className="w-full p-3 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors cursor-pointer"
                  >
                    <X className="w-4.5 h-4.5 text-red-400 shrink-0" />
                    <span className="text-xs font-bold text-red-400">Stop live</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showShareSheet && actionVideo && (
        <SharePostSheet
          type="video"
          linkCopied={shareLinkCopied}
          onCopyLink={() => copyVideoLink(actionVideo.id)}
          onSendInChat={() => { setShowShareSheet(false); setShowShareToChat(true); }}
          onClose={() => setShowShareSheet(false)}
        />
      )}
      {showShareToChat && actionVideo && (
        <SharePostToChatModal currentUser={currentUser} itemId={actionVideo.id} itemType="video" onClose={() => setShowShareToChat(false)} />
      )}
      {showComments && openVideo && (
        <VideoCommentsSheet video={openVideo} currentUser={currentUser} isMasterAdmin={isMasterAdmin} onClose={() => setShowComments(false)} />
      )}
      {showEditModal && actionVideo && (
        <EditVideoDetailsModal
          video={actionVideo}
          onClose={() => setShowEditModal(false)}
          onSaved={(updated) => {
            patchVideo(updated.id, updated);
            setShowEditModal(false);
          }}
        />
      )}
      {showLikesSheet && openVideo && (
        <LikesViewsSheet
          likes={{ label: 'Likes', fetchUsers: () => fetchLongVideoLikers(openVideo.id) }}
          views={{ label: 'Views', fetchUsers: () => fetchLongVideoViewers(openVideo.id) }}
          ownerUsername={openVideo.username}
          currentUserId={currentUser.id}
          onNavigateToUser={onNavigateToProfile}
          onClose={() => setShowLikesSheet(false)}
        />
      )}

      {showFeedMenu && (
        <div className="fixed inset-0 z-[95] bg-black/70 backdrop-blur-sm flex items-start" onClick={() => setShowFeedMenu(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-80 max-w-[88vw] h-full bg-zinc-950 border-r border-zinc-800 shadow-2xl animate-in slide-in-from-left duration-200 flex flex-col"
            data-testid="feed-menu"
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
              <h2 className="text-sm font-black italic tracking-tighter text-white">Feed</h2>
              <button onClick={() => setShowFeedMenu(false)} className="p-1.5 rounded-full hover:bg-zinc-900 text-zinc-400 hover:text-white cursor-pointer" aria-label="Close menu">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-4">
              {/* the person's own things */}
              <section className="space-y-0.5">
                <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Your library</p>
                {([
                  [<Clock key="i" className="w-4.5 h-4.5 text-zinc-300" />, 'bg-zinc-900 border-zinc-800', 'History', "Videos you've watched", () => { setShowFeedMenu(false); setShowHistory(true); }, null],
                  [<ListVideo key="i" className="w-4.5 h-4.5 text-zinc-300" />, 'bg-zinc-900 border-zinc-800', 'Playlist', 'Saved videos & your playlists', () => { setShowFeedMenu(false); setShowPlaylists(true); }, null],
                  [<Heart key="i" className="w-4.5 h-4.5 text-red-400" />, 'bg-red-500/15 border-red-500/30', 'Liked Videos', "Videos you've liked", () => { setShowFeedMenu(false); setShowLikedVideos(true); }, null],
                  [<Bookmark key="i" className="w-4.5 h-4.5 text-amber-300" />, 'bg-amber-500/10 border-amber-500/30', 'Saved videos', 'Watch these later', () => pickFilter('saved'), videos.filter((v) => v.isSaved).length],
                  [<VideoIcon key="i" className="w-4.5 h-4.5 text-sky-300" />, 'bg-sky-500/10 border-sky-500/30', 'Your videos', 'Everything you uploaded', () => pickFilter('mine'), videos.filter((v) => v.userId === currentUser.id).length]
                ] as [React.ReactNode, string, string, string, () => void, number | null][]).map(([icon, tint, title, sub, onClick, count]) => (
                  <button key={title} onClick={onClick} className="w-full p-2.5 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors cursor-pointer">
                    <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${tint}`}>{icon}</div>
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold text-white block">{title}</span>
                      <span className="text-[10px] text-zinc-400 block truncate">{sub}</span>
                    </div>
                    {count !== null && count > 0 && <span className="text-[10px] font-bold text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-full px-2 py-0.5 shrink-0">{count}</span>}
                  </button>
                ))}
              </section>

              {/* ways to find something to watch */}
              <section className="space-y-0.5">
                <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Discover</p>
                {([
                  [<Flame key="i" className="w-4.5 h-4.5 text-orange-400" />, 'bg-orange-500/10 border-orange-500/30', 'Trending now', 'Most watched and liked lately', () => pickFilter('trending'), null],
                  [<UserCheck key="i" className="w-4.5 h-4.5 text-emerald-300" />, 'bg-emerald-500/10 border-emerald-500/30', 'From people you follow', 'Their newest uploads', () => pickFilter('following'), videos.filter((v) => followingSet.has(v.userId)).length],
                  [<Radio key="i" className="w-4.5 h-4.5 text-red-400" />, 'bg-red-500/10 border-red-500/30', 'Live now', liveStreams.length ? `${liveStreams.length} live right now` : 'Nobody is live right now', () => pickFilter('live'), liveStreams.length],
                  [<TrendingUp key="i" className="w-4.5 h-4.5 text-violet-300" />, 'bg-violet-500/10 border-violet-500/30', 'Newest uploads', 'Fresh from the community', () => pickFilter('newest'), null],
                  [<ThumbsUp key="i" className="w-4.5 h-4.5 text-pink-300" />, 'bg-pink-500/10 border-pink-500/30', 'Most liked', 'The crowd favourites', () => pickFilter('liked'), null]
                ] as [React.ReactNode, string, string, string, () => void, number | null][]).map(([icon, tint, title, sub, onClick, count]) => (
                  <button key={title} onClick={onClick} className="w-full p-2.5 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors cursor-pointer">
                    <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${tint}`}>{icon}</div>
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold text-white block">{title}</span>
                      <span className="text-[10px] text-zinc-400 block truncate">{sub}</span>
                    </div>
                    {count !== null && count > 0 && <span className="text-[10px] font-bold text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-full px-2 py-0.5 shrink-0">{count}</span>}
                  </button>
                ))}
              </section>

              {/* topics: one tap searches (and the search also finds related words) */}
              <section>
                <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Explore topics</p>
                <div className="flex flex-wrap gap-1.5 px-1" data-testid="feed-topics">
                  {TOPICS.map(([emoji, name]) => (
                    <button
                      key={name}
                      onClick={() => { setShowFeedMenu(false); setFilter('all'); runSearch(name); }}
                      className="px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] font-bold text-zinc-200 hover:bg-zinc-800 hover:text-white cursor-pointer"
                    >
                      <span className="mr-1">{emoji}</span>{name}
                    </button>
                  ))}
                </div>
              </section>

              {recents.length > 0 && (
                <section>
                  <div className="flex items-center justify-between px-2 pb-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Recent searches</p>
                    <button onClick={() => { clearSearches(); setRecents([]); }} className="text-[10px] font-bold text-zinc-400 hover:text-white cursor-pointer">Clear</button>
                  </div>
                  {recents.slice(0, 5).map((text) => (
                    <button key={text} onClick={() => { setShowFeedMenu(false); setFilter('all'); runSearch(text); }} className="w-full px-2.5 py-2 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left cursor-pointer">
                      <HistoryIcon className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      <span className="text-xs text-zinc-200 truncate">{text}</span>
                    </button>
                  ))}
                </section>
              )}
            </div>

            <div className="px-3 py-3 border-t border-zinc-800 shrink-0">
              <button
                onClick={() => { setShowFeedMenu(false); onOpenUpload(); }}
                className="w-full flex items-center justify-center gap-2 bg-noob text-black rounded-xl py-2.5 text-xs font-black cursor-pointer hover:bg-noob/90 transition-colors"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" /> Upload a video
              </button>
              <p className="text-center text-[10px] text-zinc-500 mt-2">{videos.length.toLocaleString()} video{videos.length === 1 ? '' : 's'} on NOOB</p>
            </div>
          </div>
        </div>
      )}

      {showHistory && (
        <LongVideoListPage
          title="History"
          icon={<Clock className="w-4.5 h-4.5" />}
          emptyIcon={<Clock className="w-8 h-8 text-zinc-700" />}
          emptyText="Videos you watch will show up here."
          loadingText="Loading your watch history…"
          fetcher={fetchLongVideoHistory}
          onClose={() => setShowHistory(false)}
          onOpenVideo={(v) => { setShowHistory(false); setOpenVideo(v); }}
        />
      )}
      {showLikedVideos && (
        <LongVideoListPage
          title="Liked Videos"
          icon={<Heart className="w-4.5 h-4.5" />}
          emptyIcon={<Heart className="w-8 h-8 text-zinc-700" />}
          emptyText="Videos you like will show up here."
          loadingText="Loading your liked videos…"
          fetcher={fetchLikedLongVideos}
          onClose={() => setShowLikedVideos(false)}
          onOpenVideo={(v) => { setShowLikedVideos(false); setOpenVideo(v); }}
        />
      )}
      {showPlaylists && (
        <LongVideoPlaylistsView
          onClose={() => setShowPlaylists(false)}
          onOpenVideo={(v) => { setShowPlaylists(false); setOpenVideo(v); }}
        />
      )}

      {showAddToPlaylist && actionVideo && (
        <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center animate-in fade-in duration-150" onClick={() => setShowAddToPlaylist(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-xs bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 max-h-[70vh] flex flex-col"
          >
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
              <h2 className="text-sm font-bold text-white truncate pr-4">Add to playlist</h2>
              <button onClick={() => setShowAddToPlaylist(false)} className="p-1.5 rounded-full hover:bg-zinc-900 text-zinc-400 hover:text-white cursor-pointer shrink-0">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            <div className="p-2 space-y-0.5 overflow-y-auto">
              <button
                onClick={() => void handleCreatePlaylistForVideo()}
                className="w-full p-3 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors cursor-pointer"
              >
                <Plus className="w-4.5 h-4.5 text-noob shrink-0" />
                <span className="text-xs font-bold text-white">New playlist</span>
              </button>
              {addToPlaylistLoading ? (
                <div className="py-8 flex items-center justify-center text-zinc-500 text-xs">Loading…</div>
              ) : addToPlaylistList.length === 0 ? (
                <p className="px-3 py-2 text-xs text-zinc-500">No playlists yet — create one above.</p>
              ) : (
                addToPlaylistList.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => void handleToggleVideoInPlaylist(p.id)}
                    className="w-full p-3 rounded-xl hover:bg-zinc-900 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                  >
                    <span className="text-xs font-bold text-white truncate">{p.name}</span>
                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${p.hasVideo ? 'bg-noob border-noob' : 'border-zinc-700'}`}>
                      {p.hasVideo && <Check className="w-3 h-3 text-black" />}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
