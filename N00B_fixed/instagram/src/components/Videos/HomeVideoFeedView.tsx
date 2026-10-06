import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Radio, Users, Heart, X, Trash2, Search, MoreHorizontal, MessageCircle, Share2, Bookmark, EyeOff, Eye, MessageSquareOff, Pencil } from 'lucide-react';
import { User, LongVideo } from '../../types';
import { AvatarMedia } from '../Common/AvatarMedia';
import { formatRelativeTime } from '../../utils/formatTime';
import { formatNoobPoints } from '../../utils/formatPoints';
import { LikesViewsSheet } from '../Common/LikesViewsSheet';
import { SharePostSheet } from '../Common/SharePostSheet';
import { SharePostToChatModal } from '../Common/SharePostToChatModal';
import { VideoCommentsSheet } from './VideoCommentsSheet';
import { EditVideoDetailsModal } from './EditVideoDetailsModal';
import { can } from '../../adminAccess';
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
  type LiveStreamSummary
} from '../../services/api';

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

type FilterChip = 'all' | 'live' | 'newest' | 'liked';

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
  const [videos, setVideos] = useState<LongVideo[]>([]);
  const [liveStreams, setLiveStreams] = useState<LiveStreamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [openVideo, setOpenVideo] = useState<LongVideo | null>(null);
  const [openLive, setOpenLive] = useState<LiveStreamSummary | null>(null);
  const [filter, setFilter] = useState<FilterChip>('all');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // The "⋮" options sheet — which video it's for (from a list card tap or the open player), shared
  // by both surfaces instead of two separate menu implementations.
  const [menuVideo, setMenuVideo] = useState<LongVideo | null>(null);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [showShareToChat, setShowShareToChat] = useState(false);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showLikesSheet, setShowLikesSheet] = useState(false);

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
    const interval = setInterval(load, 15000);
    return () => { alive = false; clearInterval(interval); };
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

  const displayedVideos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = videos;
    if (filter === 'newest') list = [...list].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    else if (filter === 'liked') list = [...list].sort((a, b) => b.likesCount - a.likesCount);
    else if (filter === 'live') list = [];
    if (q) list = list.filter((v) => v.title.toLowerCase().includes(q) || v.username.toLowerCase().includes(q));
    return list;
  }, [videos, filter, searchQuery]);

  const displayedLiveStreams = useMemo(() => {
    if (filter === 'newest' || filter === 'liked') return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return liveStreams;
    return liveStreams.filter((s) => s.host.username.toLowerCase().includes(q) || (s.title || '').toLowerCase().includes(q));
  }, [liveStreams, filter, searchQuery]);

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

  const patchVideo = (videoId: string, patch: Partial<LongVideo>) => {
    setVideos((prev) => prev.map((v) => (v.id === videoId ? { ...v, ...patch } : v)));
    setOpenVideo((cur) => (cur && cur.id === videoId ? { ...cur, ...patch } : cur));
    setMenuVideo((cur) => (cur && cur.id === videoId ? { ...cur, ...patch } : cur));
  };

  const handleToggleLike = async (video: LongVideo) => {
    const res = await toggleLikeLongVideo(video.id);
    if ('isLiked' in res) patchVideo(video.id, { isLiked: res.isLiked, likesCount: res.likesCount });
  };

  const handleToggleSave = async (video: LongVideo) => {
    const res = await toggleSaveLongVideo(video.id);
    if ('isSaved' in res) patchVideo(video.id, { isSaved: res.isSaved, savesCount: res.savesCount });
  };

  const handleToggleComments = async (video: LongVideo) => {
    const res = await toggleLongVideoComments(video.id);
    if ('isCommentsDisabled' in res) patchVideo(video.id, { isCommentsDisabled: res.isCommentsDisabled });
  };

  const handleToggleLikeCountHidden = async (video: LongVideo) => {
    const res = await toggleLongVideoLikeCount(video.id);
    if ('isLikeCountHidden' in res) patchVideo(video.id, { isLikeCountHidden: res.isLikeCountHidden });
  };

  const handleDelete = async (video: LongVideo) => {
    if (!confirm('Delete this video? This cannot be undone.')) return;
    const ok = await deleteLongVideo(video.id);
    if (ok) {
      setVideos((prev) => prev.filter((v) => v.id !== video.id));
      setOpenVideo(null);
      setMenuVideo(null);
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
          <video src={video.videoUrl} className="w-full h-full object-cover" muted preload="metadata" />
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
        <button onClick={() => setMenuVideo(video)} className="p-1.5 text-zinc-500 hover:text-white rounded-full hover:bg-zinc-900 cursor-pointer shrink-0" title="More">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  const LiveCard: React.FC<{ s: LiveStreamSummary }> = ({ s }) => (
    <button onClick={() => setOpenLive(s)} className="w-full flex flex-col gap-2 cursor-pointer group text-left">
      <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-gradient-to-br from-red-950 to-zinc-900 border border-red-500/30 flex items-center justify-center">
        <AvatarMedia src={s.host.avatar} alt={s.host.username} className="w-16 h-16 rounded-full object-cover border-2 border-red-500/50 opacity-90" />
        <span className="absolute top-2 left-2 bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full tracking-wide flex items-center gap-1">
          <Radio className="w-2.5 h-2.5" /> LIVE
        </span>
        <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 bg-black/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
          <Users className="w-2.5 h-2.5" /> {s.viewerCount}
        </span>
      </div>
      <div className="flex items-start gap-2.5 px-0.5">
        <AvatarMedia src={s.host.avatar} alt={s.host.username} className="w-9 h-9 rounded-full object-cover shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-white line-clamp-2 leading-snug">{s.title || `${s.host.username} is live`}</p>
          <p className="text-[11px] text-zinc-400 mt-0.5">@{s.host.username} • {s.viewerCount.toLocaleString()} watching</p>
        </div>
      </div>
    </button>
  );

  return (
    <div className="w-full flex flex-col items-center pb-24">
      <header className="sticky top-0 z-40 w-full bg-zinc-950/95 backdrop-blur-xl border-b border-zinc-800/80 px-3.5 py-2.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          {showSearch ? (
            <div className="flex-1 flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-3 py-1.5">
              <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search videos"
                className="flex-1 min-w-0 bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none"
              />
              <button onClick={() => { setShowSearch(false); setSearchQuery(''); }} className="text-zinc-400 hover:text-white cursor-pointer shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-lg font-black italic tracking-tighter text-white">Feed</h1>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setShowSearch(true)} className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-900 transition-colors cursor-pointer" title="Search videos">
                  <Search className="w-4 h-4" />
                </button>
                <button
                  onClick={onOpenUpload}
                  className="flex items-center gap-1 bg-[#00FF66] text-black rounded-full pl-2 pr-3 py-1.5 text-xs font-bold cursor-pointer hover:bg-[#00FF66]/90 transition-colors"
                  title="Upload a video"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" /> Create
                </button>
              </div>
            </>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {([
            ['all', 'All'],
            ['live', 'Live'],
            ['newest', 'Newest'],
            ['liked', 'Most liked']
          ] as [FilterChip, string][]).map(([key, label]) => (
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

      <div className="w-full max-w-2xl px-3 py-3">
        {loading ? (
          <div className="py-16 flex items-center justify-center text-zinc-500 text-xs">Loading videos…</div>
        ) : displayedVideos.length === 0 && displayedLiveStreams.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-2 text-center text-zinc-500">
            <Radio className="w-8 h-8 text-zinc-700" />
            <p className="text-xs">
              {searchQuery ? 'No videos match your search.' : filter === 'live' ? 'Nobody is live right now.' : 'No videos yet — be the first to upload one.'}
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
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-zinc-800/80 shrink-0">
            <button onClick={() => setOpenVideo(null)} className="p-1.5 text-white cursor-pointer"><X className="w-5 h-5" /></button>
            <button onClick={() => setMenuVideo(openVideo)} className="p-1.5 text-white cursor-pointer" title="More">
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

      {/* "⋮" options sheet — shared by a list card tap and the open player's own button */}
      {menuVideo && (
        <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center animate-in fade-in duration-150" onClick={() => setMenuVideo(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-xs bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
          >
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-sm font-bold text-white truncate pr-4">{menuVideo.title || 'Video options'}</h2>
              <button onClick={() => setMenuVideo(null)} className="p-1.5 rounded-full hover:bg-zinc-900 text-zinc-400 hover:text-white cursor-pointer shrink-0">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            <div className="p-2 space-y-0.5">
              <button
                onClick={() => { setShowShareSheet(true); setMenuVideo(null); }}
                className="w-full p-3 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors cursor-pointer"
              >
                <Share2 className="w-4.5 h-4.5 text-cyan-400 shrink-0" />
                <span className="text-xs font-bold text-white">Share</span>
              </button>
              <button
                onClick={() => { void handleToggleSave(menuVideo); setMenuVideo(null); }}
                className="w-full p-3 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors cursor-pointer"
              >
                <Bookmark className={`w-4.5 h-4.5 shrink-0 ${menuVideo.isSaved ? 'text-[#00FF66] fill-current' : 'text-zinc-400'}`} />
                <span className="text-xs font-bold text-white">{menuVideo.isSaved ? 'Saved' : 'Save'}</span>
              </button>

              {canModerate(menuVideo) && (
                <>
                  <div className="h-px bg-zinc-900 my-1" />
                  <button
                    onClick={() => { void handleToggleLikeCountHidden(menuVideo); setMenuVideo(null); }}
                    className="w-full p-3 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors cursor-pointer"
                  >
                    {menuVideo.isLikeCountHidden ? <Eye className="w-4.5 h-4.5 text-zinc-400 shrink-0" /> : <EyeOff className="w-4.5 h-4.5 text-zinc-400 shrink-0" />}
                    <span className="text-xs font-bold text-white">{menuVideo.isLikeCountHidden ? 'Show like count' : 'Hide like count'}</span>
                  </button>
                  <button
                    onClick={() => { void handleToggleComments(menuVideo); setMenuVideo(null); }}
                    className="w-full p-3 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors cursor-pointer"
                  >
                    <MessageSquareOff className="w-4.5 h-4.5 text-zinc-400 shrink-0" />
                    <span className="text-xs font-bold text-white">{menuVideo.isCommentsDisabled ? 'Turn on comments' : 'Turn off comments'}</span>
                  </button>
                  {isOwner(menuVideo) && (
                    <button
                      onClick={() => { setShowEditModal(true); setMenuVideo(null); }}
                      className="w-full p-3 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors cursor-pointer"
                    >
                      <Pencil className="w-4.5 h-4.5 text-zinc-400 shrink-0" />
                      <span className="text-xs font-bold text-white">Edit video details</span>
                    </button>
                  )}
                  <button
                    onClick={() => { const v = menuVideo; setMenuVideo(null); void handleDelete(v); }}
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

      {showShareSheet && openVideo && (
        <SharePostSheet
          type="video"
          linkCopied={shareLinkCopied}
          onCopyLink={() => copyVideoLink(openVideo.id)}
          onSendInChat={() => { setShowShareSheet(false); setShowShareToChat(true); }}
          onClose={() => setShowShareSheet(false)}
        />
      )}
      {showShareToChat && openVideo && (
        <SharePostToChatModal currentUser={currentUser} itemId={openVideo.id} itemType="video" onClose={() => setShowShareToChat(false)} />
      )}
      {showComments && openVideo && (
        <VideoCommentsSheet video={openVideo} currentUser={currentUser} isMasterAdmin={isMasterAdmin} onClose={() => setShowComments(false)} />
      )}
      {showEditModal && openVideo && (
        <EditVideoDetailsModal
          video={openVideo}
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
    </div>
  );
};
