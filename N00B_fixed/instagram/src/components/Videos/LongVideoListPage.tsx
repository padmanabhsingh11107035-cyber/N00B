import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { LongVideo } from '../../types';

interface LongVideoListPageProps {
  title: string;
  icon: React.ReactNode;
  emptyIcon: React.ReactNode;
  emptyText: string;
  loadingText: string;
  fetcher: () => Promise<LongVideo[]>;
  onClose: () => void;
  onOpenVideo: (video: LongVideo) => void;
}

const formatDuration = (totalSeconds: number): string => {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

// Shared read-only list layout for History and Liked Videos — both are "fetch my videos, tap one to
// watch it" pages with no editing of their own, so they share this and differ only by copy + fetcher.
// Playlist needs its own component since it also manages creating/renaming/deleting playlists.
export const LongVideoListPage: React.FC<LongVideoListPageProps> = ({ title, icon, emptyIcon, emptyText, loadingText, fetcher, onClose, onOpenVideo }) => {
  const [videos, setVideos] = useState<LongVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetcher().then((list) => { if (alive) { setVideos(list); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col">
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-xl">
        <h1 className="text-base font-black italic tracking-tighter text-white flex items-center gap-2">{icon} {title}</h1>
        <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-900 cursor-pointer">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="py-16 flex items-center justify-center text-zinc-500 text-xs">{loadingText}</div>
        ) : videos.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-2 text-center text-zinc-500">
            {emptyIcon}
            <p className="text-xs">{emptyText}</p>
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl mx-auto">
            {videos.map((v) => (
              <button key={v.id} onClick={() => onOpenVideo(v)} className="w-full flex items-center gap-3 text-left cursor-pointer">
                <div className="relative w-28 aspect-video rounded-lg overflow-hidden bg-black shrink-0">
                  {v.thumbnailUrl ? (
                    <img src={v.thumbnailUrl} alt={v.title} className="w-full h-full object-cover" />
                  ) : (
                    <video src={v.videoUrl} className="w-full h-full object-cover" muted preload="metadata" />
                  )}
                  <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[9px] font-bold px-1 py-0.5 rounded">{formatDuration(v.durationSeconds)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-white line-clamp-2 leading-snug">{v.title || 'Untitled video'}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">@{v.username} • {v.viewsCount.toLocaleString()} views</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
