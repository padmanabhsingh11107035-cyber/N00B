import React, { useEffect, useState } from 'react';
import { AvatarMedia } from '../Common/AvatarMedia';
import { fetchLiveStreams, LiveStreamSummary } from '../../services/api';

interface LiveStreamBarProps {
  onOpenLive: (stream: LiveStreamSummary) => void;
}

// A thin overlay rail across the top of the Reels screen — whoever is live right now (going live
// itself lives on the "+" create page). Polls rather than subscribing to Realtime: a stream starting
// or ending a few seconds late here costs nothing, and this avoids yet another open socket on a
// screen that's already carrying two preloaded videos.
export const LiveStreamBar: React.FC<LiveStreamBarProps> = ({ onOpenLive }) => {
  const [streams, setStreams] = useState<LiveStreamSummary[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () => fetchLiveStreams().then((res) => { if (alive && res.success) setStreams(res.streams); });
    load();
    const interval = setInterval(load, 15000);
    return () => { alive = false; clearInterval(interval); };
  }, []);

  if (streams.length === 0) return null;

  return (
    // top-14: Reels' own back-button/title bar already sits at top-3, so this rail is placed
    // just below it instead of overlapping the same row.
    <div className="absolute top-14 left-0 right-0 z-20 flex items-center gap-3 px-3 overflow-x-auto no-scrollbar">
      {streams.map((s) => (
        <button key={s.id} onClick={() => onOpenLive(s)} className="flex flex-col items-center gap-1 shrink-0 active:scale-95 transition">
          <div className="relative w-12 h-12 rounded-full p-[2px] bg-gradient-to-tr from-red-600 via-red-500 to-orange-400">
            <AvatarMedia src={s.host.avatar} alt={s.host.username} className="w-full h-full rounded-full object-cover border-2 border-black" />
            <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[8px] font-bold px-1.5 py-px rounded-full tracking-wide">LIVE</span>
          </div>
          <span className="text-[10px] text-white/90 max-w-[52px] truncate drop-shadow">{s.host.username}</span>
        </button>
      ))}
    </div>
  );
};
