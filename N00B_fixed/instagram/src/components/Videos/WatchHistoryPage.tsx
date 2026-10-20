import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, Trash2, Clock, PauseCircle, PlayCircle, Loader2 } from 'lucide-react';
import { LongVideo } from '../../types';
import { LazyVideo } from '../Common/LazyVideo';
import { fetchLongVideoHistory, removeFromWatchHistory, clearWatchHistory } from '../../services/api';
import { updateSettings, useAccountSettings } from '../../services/settingsApi';
import { groupByDay } from '../../utils/dateGroups';

// History, laid out like YouTube's: the videos you started watching (even for a moment), newest first, under the day you watched them. Each one can be removed; the whole history can be
// cleared or paused. Only the day is shown with each video, not the time.
const formatDuration = (totalSeconds: number): string => {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

export const WatchHistoryPage: React.FC<{ onClose: () => void; onOpenVideo: (video: LongVideo) => void }> = ({ onClose, onOpenVideo }) => {
  const [videos, setVideos] = useState<LongVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const settings = useAccountSettings();
  const paused = !!settings['history.paused'];

  useEffect(() => {
    let alive = true;
    void fetchLongVideoHistory().then((list) => { if (alive) { setVideos(list); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? videos.filter((v) => `${v.title} ${v.username} ${v.description || ''}`.toLowerCase().includes(q)) : videos;
  }, [videos, query]);
  const groups = useMemo(() => groupByDay<LongVideo>(shown, (v) => v.watchedAt), [shown]);

  const remove = async (id: string) => {
    const before = videos;
    setVideos((list) => list.filter((v) => v.id !== id));
    if (!(await removeFromWatchHistory(id))) setVideos(before);
  };
  const clearAll = async () => {
    setBusy(true);
    const ok = await clearWatchHistory();
    setBusy(false);
    setConfirmClear(false);
    if (ok) setVideos([]);
  };
  const togglePause = () => { void updateSettings({ 'history.paused': !paused }); };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col" data-testid="watch-history">
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-xl">
        <h1 className="text-base font-black tracking-tight text-white flex items-center gap-2"><Clock className="w-4.5 h-4.5" /> Watch history</h1>
        <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-900 cursor-pointer" aria-label="Close"><X className="w-5 h-5" /></button>
      </div>

      <div className="shrink-0 px-4 pt-3 pb-2 space-y-2.5 max-w-2xl w-full mx-auto">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search watch history" className="w-full bg-zinc-900 border border-zinc-800 rounded-full pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600" data-testid="history-search" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setConfirmClear(true)} disabled={videos.length === 0} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] font-bold text-zinc-200 hover:bg-zinc-800 cursor-pointer disabled:opacity-40" data-testid="history-clear">
            <Trash2 className="w-3.5 h-3.5" /> Clear all watch history
          </button>
          <button onClick={togglePause} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-bold cursor-pointer ${paused ? 'bg-amber-400 text-black border-amber-400' : 'bg-zinc-900 border-zinc-800 text-zinc-200 hover:bg-zinc-800'}`} data-testid="history-pause">
            {paused ? <PlayCircle className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5" />} {paused ? 'Turn on watch history' : 'Pause watch history'}
          </button>
        </div>
        {paused && <p className="text-[11px] text-amber-300/90" data-testid="history-paused-note">Watch history is paused: videos you watch now are not added to it.</p>}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {loading ? (
          <div className="py-16 flex items-center justify-center text-zinc-500 text-xs gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading your watch history…</div>
        ) : groups.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-2 text-center text-zinc-500">
            <Clock className="w-8 h-8 text-zinc-700" />
            <p className="text-xs">{query ? 'Nothing in your history matches that.' : 'Videos you watch will show up here, even if you only watch a little.'}</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-5 pt-1">
            {groups.map((g) => (
              <section key={g.label} data-testid="history-day">
                <h2 className="text-sm font-black text-white mb-2" data-testid="history-day-label">{g.label}</h2>
                <div className="space-y-3">
                  {g.items.map((v) => (
                    <div key={v.id} className="flex items-start gap-3" data-testid="history-item">
                      <button onClick={() => onOpenVideo(v)} className="flex items-start gap-3 text-left cursor-pointer min-w-0 flex-1">
                        <div className="relative w-36 aspect-video rounded-lg overflow-hidden bg-black shrink-0">
                          {v.thumbnailUrl ? <img src={v.thumbnailUrl} alt={v.title} className="w-full h-full object-cover" /> : <LazyVideo src={v.videoUrl} className="w-full h-full object-cover" muted />}
                          <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[9px] font-bold px-1 py-0.5 rounded">{formatDuration(v.durationSeconds)}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-bold text-white line-clamp-2 leading-snug">{v.title || 'Untitled video'}</p>
                          <p className="text-[11px] text-zinc-400 mt-0.5">@{v.username}</p>
                          <p className="text-[11px] text-zinc-500">{v.viewsCount.toLocaleString()} views</p>
                        </div>
                      </button>
                      <button onClick={() => void remove(v.id)} className="p-1.5 text-zinc-500 hover:text-white rounded-full hover:bg-zinc-900 cursor-pointer shrink-0" aria-label="Remove from watch history" title="Remove from watch history" data-testid="history-remove">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {confirmClear && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-6" onClick={() => setConfirmClear(false)}>
          <div className="w-full max-w-xs bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Clear watch history">
            <h3 className="text-sm font-black text-white">Clear watch history?</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">Every video will be taken out of your watch history. The videos themselves are not deleted.</p>
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setConfirmClear(false)} className="px-3.5 py-2 rounded-full text-xs font-bold text-zinc-300 hover:bg-zinc-800 cursor-pointer">Cancel</button>
              <button onClick={() => void clearAll()} disabled={busy} className="px-3.5 py-2 rounded-full text-xs font-bold bg-white text-black cursor-pointer disabled:opacity-60" data-testid="history-clear-confirm">{busy ? 'Clearing…' : 'Clear history'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
