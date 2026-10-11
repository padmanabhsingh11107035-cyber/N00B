import React from 'react';
import { Pin, Film, PlayCircle } from 'lucide-react';
import type { PinnedFeedItem, Post } from '../../types';
import { AvatarMedia } from '../Common/AvatarMedia';
import { LazyVideo } from '../Common/LazyVideo';

// The things the NOOB admin pinned to the top of the Feed page. Posts are the normal post cards (drawn by the feed itself, so likes,
// comments and the menus all behave exactly as everywhere else); reels and videos are compact cards that open the real thing.
interface PinnedFeedSectionProps {
  items: PinnedFeedItem[];
  renderPost: (post: Post) => React.ReactNode;
  onOpenReel?: (reelId: string) => void;
  onOpenVideo?: (videoId: string) => void;
}

const Ribbon: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex items-center gap-1.5 px-1 pb-1 text-[10px] font-extrabold tracking-wider uppercase text-noob">
    <Pin className="w-3 h-3 fill-current" /> {label}
  </div>
);

export const PinnedFeedSection: React.FC<PinnedFeedSectionProps> = ({ items, renderPost, onOpenReel, onOpenVideo }) => {
  if (items.length === 0) return null;
  return (
    <div className="space-y-4" aria-label="Pinned by NOOB">
      {items.map((item) => {
        if (item.kind === 'post' && item.post) {
          return (
            <div key={`pin-post-${item.itemId}`}>
              <Ribbon label="Pinned by NOOB" />
              {renderPost(item.post)}
            </div>
          );
        }
        if (item.kind === 'reel' && item.reel) {
          const reel = item.reel;
          return (
            <div key={`pin-reel-${item.itemId}`}>
              <Ribbon label="Pinned reel" />
              <button
                type="button"
                onClick={() => onOpenReel?.(reel.id)}
                className="w-full text-left rounded-3xl overflow-hidden border border-noob/30 bg-zinc-900/50 cursor-pointer group"
              >
                <div className="relative w-full aspect-[4/5] bg-black">
                  {reel.thumbnailUrl ? (
                    <img src={reel.thumbnailUrl} alt={reel.caption} loading="lazy" decoding="async" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <LazyVideo src={reel.videoUrl} muted playsInline className="w-full h-full object-cover" />
                  )}
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="w-14 h-14 rounded-full bg-black/55 backdrop-blur-md border border-white/25 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Film className="w-6 h-6 text-white" />
                    </span>
                  </span>
                </div>
                <div className="p-3 flex items-center gap-2.5">
                  <AvatarMedia src={reel.userAvatar} isLiveAvatar={reel.authorIsLiveAvatar} liveAvatarVideoUrl={reel.authorLiveAvatarVideoUrl} alt={reel.username} className="w-8 h-8 rounded-full object-cover shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">@{reel.username}</p>
                    {reel.caption && <p className="text-[11px] text-zinc-400 line-clamp-2 break-words">{reel.caption}</p>}
                  </div>
                </div>
              </button>
            </div>
          );
        }
        if (item.kind === 'video' && item.video) {
          const video = item.video;
          return (
            <div key={`pin-video-${item.itemId}`}>
              <Ribbon label="Pinned video" />
              <button
                type="button"
                onClick={() => onOpenVideo?.(video.id)}
                className="w-full text-left rounded-3xl overflow-hidden border border-noob/30 bg-zinc-900/50 cursor-pointer group"
              >
                <div className="relative w-full aspect-video bg-black">
                  {video.thumbnailUrl ? (
                    <img src={video.thumbnailUrl} alt={video.title} loading="lazy" decoding="async" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <LazyVideo src={video.videoUrl} muted playsInline className="w-full h-full object-cover" />
                  )}
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="w-14 h-14 rounded-full bg-black/55 backdrop-blur-md border border-white/25 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <PlayCircle className="w-7 h-7 text-white" />
                    </span>
                  </span>
                </div>
                <div className="p-3">
                  <p className="text-sm font-bold text-white line-clamp-2 break-words">{video.title || 'Untitled video'}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">@{video.username}</p>
                </div>
              </button>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
};
