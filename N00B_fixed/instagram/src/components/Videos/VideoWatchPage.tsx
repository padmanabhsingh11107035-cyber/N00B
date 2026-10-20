import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, MoreHorizontal, Heart, MessageCircle, Share2, Bookmark, ChevronDown, ChevronUp } from 'lucide-react';
import { LongVideo } from '../../types';
import { AvatarMedia } from '../Common/AvatarMedia';
import { LazyVideo } from '../Common/LazyVideo';
import { VideoPlayer } from './VideoPlayer';
import { formatRelativeTime } from '../../utils/formatTime';
import { formatNoobPoints } from '../../utils/formatPoints';
import { formatClock } from '../../utils/videoPlayerMath';
import { suggestVideos } from '../../utils/suggestVideos';

// The page for one video, laid out like YouTube's:
//  * on a phone held upright: the video on top (it stays in view while you scroll), then the title, the channel, like / comments / share, the description, a comments bar
//    ("Add a comment…") and BELOW it the suggested videos;
//  * on a phone turned sideways: the video fills the whole screen; scroll down for the rest;
//  * on a computer: the video and its details on the left, the suggested videos on the right.
const useMedia = (query: string): boolean => {
  const get = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false);
  const [on, setOn] = useState(get);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const m = window.matchMedia(query);
    const h = () => setOn(m.matches);
    h();
    m.addEventListener?.('change', h);
    return () => m.removeEventListener?.('change', h);
  }, [query]);
  return on;
};

const AUTOPLAY_KEY = 'noob_autoplay_next';
const readAutoplay = () => { try { return localStorage.getItem(AUTOPLAY_KEY) !== '0'; } catch { return true; } };

export interface VideoWatchPageProps {
  video: LongVideo;
  allVideos: LongVideo[];
  followingIds: string[];
  currentUserAvatar?: string;
  canModerate: boolean;
  onClose: () => void;
  onMore: () => void;
  onToggleLike: () => void;
  onToggleSave: () => void;
  onShare: () => void;
  onOpenComments: () => void;
  onOpenLikers: () => void;
  onOpenProfile: () => void;
  onOpenVideo: (video: LongVideo) => void;
  /** The watch was counted: the new number of views. */
  onViewCounted: (viewsCount: number) => void;
  recordView: (videoId: string) => Promise<{ success?: boolean; viewsCount?: number }>;
}

export const VideoWatchPage: React.FC<VideoWatchPageProps> = ({ video, allVideos, followingIds, currentUserAvatar, canModerate, onClose, onMore, onToggleLike, onToggleSave, onShare, onOpenComments, onOpenLikers, onOpenProfile, onOpenVideo, onViewCounted, recordView }) => {
  const scroller = useRef<HTMLDivElement>(null);
  const landscapePhone = useMedia('(orientation: landscape) and (max-height: 520px)');
  const wide = useMedia('(min-width: 1024px)');
  const [autoplay, setAutoplay] = useState(readAutoplay);
  const [moreText, setMoreText] = useState(false);
  const suggestions = useMemo(() => suggestVideos(video, allVideos, followingIds, 24), [video, allVideos, followingIds]);
  const next = suggestions[0] || null;

  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); setMoreText(false); }, [video.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.fullscreenElement) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const setAuto = (on: boolean) => { setAutoplay(on); try { localStorage.setItem(AUTOPLAY_KEY, on ? '1' : '0'); } catch { /* not remembered */ } };

  const player = (
    <div className={`relative bg-black ${landscapePhone ? 'h-[100dvh]' : ''}`}>
      <VideoPlayer
        key={video.id}
        src={video.videoUrl}
        renditions={video.renditions}
        poster={video.thumbnailUrl}
        durationSeconds={video.durationSeconds}
        className={landscapePhone ? '!aspect-auto h-full' : wide ? 'rounded-2xl overflow-hidden' : ''}
        onPlay={() => { void recordView(video.id).then((res) => { if (res?.success && typeof res.viewsCount === 'number') onViewCounted(res.viewsCount); }); }}
        upNext={autoplay && next ? { title: next.title || 'Untitled video' } : null}
        onPlayNext={next ? () => onOpenVideo(next) : undefined}
      />
      <button onClick={onClose} className="absolute top-2 left-2 z-40 p-2 rounded-full bg-black/55 text-white cursor-pointer" aria-label="Close" data-testid="watch-close"><X className="w-5 h-5" /></button>
      <button onClick={onMore} className="absolute top-2 right-2 z-40 p-2 rounded-full bg-black/55 text-white cursor-pointer" aria-label="More" title="More"><MoreHorizontal className="w-5 h-5" /></button>
    </div>
  );

  const details = (
    <div className="px-3.5 py-3 space-y-3">
      <h1 className="text-white text-[15px] font-bold leading-snug" data-testid="watch-title">{video.title || 'Untitled video'}</h1>
      <button onClick={() => { if (canModerate) onOpenLikers(); }} disabled={!canModerate} className="text-zinc-400 text-[11px] text-left cursor-pointer disabled:cursor-default" data-testid="watch-views">
        {video.viewsCount.toLocaleString()} views • {formatRelativeTime(video.createdAt)}
      </button>

      <div className="flex items-center justify-between gap-2 py-2 border-y border-zinc-800/80 flex-wrap">
        <button onClick={onOpenProfile} className="flex items-center gap-2 cursor-pointer min-w-0">
          <AvatarMedia src={video.userAvatar} alt={video.username} className="w-9 h-9 rounded-full object-cover shrink-0" />
          <span className="text-white text-xs font-semibold truncate">@{video.username}</span>
        </button>
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button onClick={onToggleLike} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer shrink-0 ${video.isLiked ? 'bg-red-500/15 text-red-400 border border-red-500/40' : 'bg-zinc-900 text-zinc-300 border border-zinc-800'}`} data-testid="watch-like">
            <Heart className={`w-3.5 h-3.5 ${video.isLiked ? 'fill-current' : ''}`} />{(!video.isLikeCountHidden || canModerate) && formatNoobPoints(video.likesCount)}
          </button>
          <button onClick={onShare} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer bg-zinc-900 text-zinc-300 border border-zinc-800 shrink-0" data-testid="watch-share"><Share2 className="w-3.5 h-3.5" /> Share</button>
          <button onClick={onToggleSave} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer border shrink-0 ${video.isSaved ? 'bg-noob/15 text-noob border-noob/40' : 'bg-zinc-900 text-zinc-300 border-zinc-800'}`} data-testid="watch-save"><Bookmark className={`w-3.5 h-3.5 ${video.isSaved ? 'fill-current' : ''}`} /> {video.isSaved ? 'Saved' : 'Save'}</button>
        </div>
      </div>

      {video.description && (
        <div className="rounded-2xl bg-zinc-900/70 p-3" data-testid="watch-description">
          <p className={`text-zinc-300 text-xs whitespace-pre-line leading-relaxed ${moreText ? '' : 'line-clamp-2'}`}>{video.description}</p>
          {video.description.length > 90 && (
            <button onClick={() => setMoreText((m) => !m)} className="mt-1 text-[11px] font-bold text-zinc-400 flex items-center gap-0.5 cursor-pointer">{moreText ? <>Show less <ChevronUp className="w-3 h-3" /></> : <>…more <ChevronDown className="w-3 h-3" /></>}</button>
          )}
        </div>
      )}

      {/* the comments bar: opens the comments; the suggested videos come BELOW it */}
      <button onClick={onOpenComments} className="w-full text-left rounded-2xl bg-zinc-900/70 p-3 cursor-pointer space-y-2" data-testid="watch-comments-bar">
        <span className="flex items-center gap-1.5 text-xs font-bold text-white"><MessageCircle className="w-3.5 h-3.5" /> Comments <span className="text-zinc-400 font-semibold">{video.commentsCount > 0 ? formatNoobPoints(video.commentsCount) : ''}</span></span>
        {video.isCommentsDisabled
          ? <span className="block text-[11px] text-zinc-500">Comments are turned off for this video.</span>
          : <span className="flex items-center gap-2">
              <AvatarMedia src={currentUserAvatar} alt="You" className="w-6 h-6 rounded-full object-cover shrink-0" />
              <span className="flex-1 rounded-full bg-zinc-800 px-3 py-1.5 text-[11px] text-zinc-400">Add a comment…</span>
            </span>}
      </button>
    </div>
  );

  const suggestedList = (
    <div className={wide ? 'space-y-3' : 'px-3.5 pb-28 space-y-3'} data-testid="suggested-videos">
      <div className="flex items-center justify-between pt-1">
        <h2 className="text-sm font-black text-white">Up next</h2>
        <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer select-none">
          Autoplay
          <button role="switch" aria-checked={autoplay} onClick={() => setAuto(!autoplay)} className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${autoplay ? 'bg-noob' : 'bg-zinc-700'}`} data-testid="autoplay-switch">
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${autoplay ? 'left-[18px]' : 'left-0.5'}`} />
          </button>
        </label>
      </div>
      {suggestions.length === 0 && <p className="text-xs text-zinc-500 py-6 text-center">No more videos yet.</p>}
      {suggestions.map((v) => (
        <button key={v.id} onClick={() => onOpenVideo(v)} className="w-full flex items-start gap-2.5 text-left cursor-pointer" data-testid="suggested-video">
          <div className="relative w-40 shrink-0 aspect-video rounded-xl overflow-hidden bg-zinc-900">
            {v.thumbnailUrl ? <img src={v.thumbnailUrl} alt={v.title} className="w-full h-full object-cover" /> : <LazyVideo src={v.videoUrl} className="w-full h-full object-cover" muted />}
            <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[9px] font-bold px-1 py-0.5 rounded">{formatClock(v.durationSeconds)}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-bold text-white line-clamp-2 leading-snug">{v.title || 'Untitled video'}</p>
            <p className="text-[11px] text-zinc-400 mt-0.5 truncate">@{v.username}</p>
            <p className="text-[11px] text-zinc-500">{v.viewsCount.toLocaleString()} views • {formatRelativeTime(v.createdAt)}</p>
          </div>
        </button>
      ))}
    </div>
  );

  return (
    <div ref={scroller} className="fixed inset-0 z-50 bg-black media-dark overflow-y-auto overscroll-contain" data-testid="watch-page" data-layout={landscapePhone ? 'landscape' : wide ? 'wide' : 'portrait'}>
      {wide ? (
        <div className="mx-auto max-w-[1500px] flex gap-6 px-6 pt-4 pb-10">
          <div className="flex-1 min-w-0">{player}{details}</div>
          <aside className="w-[390px] shrink-0">{suggestedList}</aside>
        </div>
      ) : (
        <>
          <div className={landscapePhone ? 'bg-black' : 'sticky top-0 z-30 bg-black'}>{player}</div>
          {details}
          {suggestedList}
        </>
      )}
    </div>
  );
};
