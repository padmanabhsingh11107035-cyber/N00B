import React, { useEffect, useState } from 'react';
import { X, Loader2, Send } from 'lucide-react';
import { InstantInboxItem, OpenedInstant } from '../../services/api';
import { openInstant, reactToInstant } from '../../services/api';
import { VerifiedBadge } from '../Common/VerifiedBadge';

const QUICK_REACTIONS = ['❤️', '😂', '😮', '👀', '🔥'];

interface InstantViewerProps {
  queue: InstantInboxItem[];
  onDone: () => void; // called once every instant in the queue has been opened (or the viewer is closed)
}

// Opens each instant in the queue one at a time — exactly once each, Instagram-style. Closing early still
// keeps whichever ones were already opened as opened (their photo is gone from the inbox either way).
export const InstantViewer: React.FC<InstantViewerProps> = ({ queue, onDone }) => {
  const [index, setIndex] = useState(0);
  const [opened, setOpened] = useState<OpenedInstant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reacted, setReacted] = useState<string | null>(null);

  const current = queue[index];

  useEffect(() => {
    if (!current) { onDone(); return; }
    setLoading(true);
    setError('');
    setOpened(null);
    setReacted(null);
    openInstant(current.id).then((res) => {
      setLoading(false);
      if (res.success && res.instant) setOpened(res.instant);
      else setError(res.error || 'This instant is no longer available.');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, current?.id]);

  if (!current) return null;

  const goNext = () => {
    if (index + 1 >= queue.length) onDone();
    else setIndex((i) => i + 1);
  };

  const handleReact = async (emoji: string) => {
    setReacted(emoji);
    await reactToInstant(current.id, emoji);
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black flex flex-col">
      <div className="flex items-center gap-2 p-4 shrink-0">
        <div className="flex-1 flex gap-1">
          {queue.map((_, i) => (
            <div key={i} className={`h-0.5 flex-1 rounded-full ${i <= index ? 'bg-white' : 'bg-white/25'}`} />
          ))}
        </div>
        <button onClick={onDone} className="p-1.5 rounded-full text-white cursor-pointer">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex items-center gap-2.5 px-4 pb-3 shrink-0">
        <img src={current.sender.avatar || '/noob-logo.svg.jpeg'} alt="" className="w-9 h-9 rounded-full object-cover border border-zinc-700" referrerPolicy="no-referrer" />
        <div className="flex items-center gap-1.5">
          <span className="text-white text-xs font-bold">{current.sender.displayName || current.sender.username}</span>
          {current.sender.isVerified && <VerifiedBadge size="xs" />}
        </div>
      </div>

      <div className="flex-1 relative flex items-center justify-center px-4" onClick={goNext}>
        {loading ? (
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        ) : error ? (
          <p className="text-zinc-400 text-xs text-center">{error}</p>
        ) : opened ? (
          <img src={opened.mediaUrl} alt="" className="max-h-full max-w-full object-contain rounded-2xl" referrerPolicy="no-referrer" />
        ) : null}
        {opened?.caption && (
          <p className="absolute bottom-4 left-4 right-4 text-center text-white text-xs bg-black/40 rounded-xl px-3 py-2">{opened.caption}</p>
        )}
      </div>

      {opened && !error && (
        <div className="flex items-center justify-center gap-3 p-4 shrink-0" onClick={(e) => e.stopPropagation()}>
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleReact(emoji)}
              className={`w-10 h-10 rounded-full flex items-center justify-center text-lg cursor-pointer transition-transform ${
                reacted === emoji ? 'bg-white/20 scale-110' : 'bg-white/5 hover:bg-white/10'
              }`}
            >
              {emoji}
            </button>
          ))}
          <button onClick={goNext} className="ml-1 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-2xl text-xs font-bold flex items-center gap-1.5 cursor-pointer">
            {index + 1 < queue.length ? 'Next' : 'Done'} <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
