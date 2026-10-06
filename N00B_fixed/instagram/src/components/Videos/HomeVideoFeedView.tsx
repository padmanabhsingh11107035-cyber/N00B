import React, { useEffect, useState } from 'react';
import { Plus, Radio, Users, Heart, X, Trash2 } from 'lucide-react';
import { User, LongVideo } from '../../types';
import { AvatarMedia } from '../Common/AvatarMedia';
import { formatRelativeTime } from '../../utils/formatTime';
import { formatNoobPoints } from '../../utils/formatPoints';
import {
  fetchLongVideos,
  fetchLiveStreams,
  toggleLikeLongVideo,
  recordLongVideoView,
  deleteLongVideo,
  fetchUserById,
  type LiveStreamSummary
} from '../../services/api';

const LiveStreamView = React.lazy(() => import('../LiveStream/LiveStreamView').then((m) => ({ default: m.LiveStreamView })));

interface HomeVideoFeedViewProps {
  currentUser: User;
  onOpenUpload: () => void;
  onNavigateToProfile?: (user: User) => void;
  refreshKey?: number; // bumped by the parent right after a successful upload, to refetch
}

const formatDuration = (totalSeconds: number): string => {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

// The "Home" tab — a YouTube-style feed of long-form uploads plus whoever is live right now. Reels
// never appear here (separate table, separate feed function — see long_videos in the migrations),
// and this page never appears inside Reels either; each content type has exactly one home.
export const HomeVideoFeedView: React.FC<HomeVideoFeedViewProps> = ({ currentUser, onOpenUpload, onNavigateToProfile, refreshKey }) => {
  const [videos, setVideos] = useState<LongVideo[]>([]);
  const [liveStreams, setLiveStreams] = useState<LiveStreamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [openVideo, setOpenVideo] = useState<LongVideo | null>(null);
  const [openLive, setOpenLive] = useState<LiveStreamSummary | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchLongVideos().then((list) => { if (alive) { setVideos(list); setLoading(false); } });
    return () => { alive = false; };
  }, [refreshKey]);

  useEffect(() => {
    let alive = true;
    const load = () => fetchLiveStreams().then((res) => { if (alive && res.success) setLiveStreams(res.streams); });
    load();
    const interval = setInterval(load, 15000);
    return () => { alive = false; clearInterval(interval); };
  }, []);

  const handleToggleLike = async (video: LongVideo) => {
    const res = await toggleLikeLongVideo(video.id);
    if ('isLiked' in res) {
      setVideos((prev) => prev.map((v) => (v.id === video.id ? { ...v, isLiked: res.isLiked, likesCount: res.likesCount } : v)));
      setOpenVideo((cur) => (cur && cur.id === video.id ? { ...cur, isLiked: res.isLiked, likesCount: res.likesCount } : cur));
    }
  };

  const handleDelete = async (video: LongVideo) => {
    if (!confirm('Delete this video? This cannot be undone.')) return;
    const ok = await deleteLongVideo(video.id);
    if (ok) {
      setVideos((prev) => prev.filter((v) => v.id !== video.id));
      setOpenVideo(null);
    }
  };

  return (
    <div className="w-full flex flex-col items-center pb-24">
      <header className="sticky top-0 z-40 w-full bg-zinc-950/95 backdrop-blur-xl border-b border-zinc-800/80 px-3.5 py-2.5 flex items-center justify-between gap-2">
        <h1 className="text-lg font-black italic tracking-tighter text-white">Home</h1>
        <button
          onClick={onOpenUpload}
          className="flex items-center gap-1 bg-[#00FF66] text-black rounded-full pl-2 pr-3 py-1.5 text-xs font-bold cursor-pointer hover:bg-[#00FF66]/90 transition-colors"
          title="Upload a video"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" /> Create
        </button>
      </header>

      <div className="w-full max-w-2xl px-3 py-3 space-y-5">
        {liveStreams.length > 0 && (
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-red-400 tracking-wider uppercase flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5" /> Live now
            </span>
            <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
              {liveStreams.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setOpenLive(s)}
                  className="relative shrink-0 w-40 h-24 rounded-2xl overflow-hidden bg-gradient-to-br from-red-900/40 to-zinc-900 border border-red-500/30 flex flex-col justify-end p-2 cursor-pointer active:scale-[0.98] transition-transform"
                >
                  <span className="absolute top-2 left-2 bg-red-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full tracking-wide">LIVE</span>
                  <span className="absolute top-2 right-2 flex items-center gap-1 bg-black/50 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                    <Users className="w-2.5 h-2.5" /> {s.viewerCount}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <AvatarMedia src={s.host.avatar} alt={s.host.username} className="w-6 h-6 rounded-full object-cover border border-white/30 shrink-0" />
                    <span className="text-[10px] text-white font-semibold truncate">{s.title || s.host.username}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-16 flex items-center justify-center text-zinc-500 text-xs">Loading videos…</div>
        ) : videos.length === 0 && liveStreams.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-2 text-center text-zinc-500">
            <Radio className="w-8 h-8 text-zinc-700" />
            <p className="text-xs">No videos yet — be the first to upload one.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {videos.map((video) => (
              <button
                key={video.id}
                onClick={() => setOpenVideo(video)}
                className="w-full text-left flex flex-col gap-2 cursor-pointer group"
              >
                <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800">
                  {video.thumbnailUrl ? (
                    <img src={video.thumbnailUrl} alt={video.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  ) : (
                    <video src={video.videoUrl} className="w-full h-full object-cover" muted preload="metadata" />
                  )}
                  <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                    {formatDuration(video.durationSeconds)}
                  </span>
                </div>
                <div className="flex items-start gap-2.5 px-0.5">
                  <AvatarMedia src={video.userAvatar} alt={video.username} className="w-9 h-9 rounded-full object-cover shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-white line-clamp-2 leading-snug">{video.title || 'Untitled video'}</p>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      @{video.username} • {video.viewsCount.toLocaleString()} views • {formatRelativeTime(video.createdAt)}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {openVideo && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-zinc-800/80 shrink-0">
            <button onClick={() => setOpenVideo(null)} className="p-1.5 text-white cursor-pointer"><X className="w-5 h-5" /></button>
            {(openVideo.userId === currentUser.id) && (
              <button onClick={() => handleDelete(openVideo)} className="p-1.5 text-red-400 cursor-pointer" title="Delete video">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="w-full bg-black shrink-0">
            <video
              src={openVideo.videoUrl}
              controls
              autoPlay
              className="w-full max-h-[45vh] bg-black"
              onPlay={() => { void recordLongVideoView(openVideo.id); }}
            />
          </div>
          <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3">
            <h2 className="text-white text-sm font-bold leading-snug">{openVideo.title || 'Untitled video'}</h2>
            <p className="text-zinc-400 text-[11px]">{openVideo.viewsCount.toLocaleString()} views • {formatRelativeTime(openVideo.createdAt)}</p>
            <div className="flex items-center justify-between py-2 border-y border-zinc-800/80">
              <button
                onClick={() => { void fetchUserById(openVideo.userId).then((u) => u && onNavigateToProfile?.(u)); }}
                className="flex items-center gap-2 cursor-pointer"
              >
                <AvatarMedia src={openVideo.userAvatar} alt={openVideo.username} className="w-9 h-9 rounded-full object-cover" />
                <span className="text-white text-xs font-semibold">@{openVideo.username}</span>
              </button>
              <button
                onClick={() => handleToggleLike(openVideo)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer ${
                  openVideo.isLiked ? 'bg-red-500/15 text-red-400 border border-red-500/40' : 'bg-zinc-900 text-zinc-300 border border-zinc-800'
                }`}
              >
                <Heart className={`w-3.5 h-3.5 ${openVideo.isLiked ? 'fill-current' : ''}`} /> {formatNoobPoints(openVideo.likesCount)}
              </button>
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
    </div>
  );
};
