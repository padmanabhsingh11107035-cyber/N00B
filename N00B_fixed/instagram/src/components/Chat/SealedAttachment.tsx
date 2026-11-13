import { useEffect, useState } from 'react';
import { Lock, Mic } from 'lucide-react';
import { openSealedAttachment, hasSealedAttachment } from '../../services/api';
import type { Message } from '../../types';

// A picture, video or voice note that was locked on the sender's device. It is downloaded and opened only when the person asks (or when their
// "Photos and videos" setting says to load by itself, or it is their own); the opened file exists only as a blob address in this component's
// memory and is released the moment the message leaves the screen. Nothing readable is ever saved.
export function SealedAttachment({ message, allowed, onAsk }: { message: Message; allowed: boolean; onAsk: () => void }) {
  const sealed = message.sealed;
  const kind = message.mediaType === 'audio' ? 'audio' : message.mediaType === 'video' ? 'video' : 'image';
  const [url, setUrl] = useState('');
  const [state, setState] = useState<'idle' | 'opening' | 'ready' | 'failed'>('idle');
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  const key = sealed?.key;

  useEffect(() => {
    if (!sealed || (!allowed && !hasSealedAttachment(sealed.key))) { setState('idle'); return; }
    let alive = true;
    let made = '';
    setState('opening');
    setProblem('');
    openSealedAttachment(sealed).then((blob) => {
      if (!alive) return;
      made = URL.createObjectURL(blob);
      setUrl(made);
      setState('ready');
    }).catch((err) => {
      if (!alive) return;
      setProblem(err instanceof Error ? err.message : 'This attachment could not be opened.');
      setState('failed');
    });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); setUrl(''); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, allowed, attempt]);

  if (!sealed) return null;
  const word = kind === 'audio' ? 'voice message' : kind === 'video' ? 'video' : 'photo';

  if (state === 'ready' && url) {
    if (kind === 'audio') {
      return (
        <div className="mb-2 flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3 py-2 min-w-[180px]" data-testid="sealed-audio">
          <Mic className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <audio src={url} controls preload="metadata" className="h-8 flex-1 min-w-0" style={{ maxWidth: 220 }} />
          {message.audioDuration && <span className="text-[10px] text-zinc-400 shrink-0">{message.audioDuration}</span>}
        </div>
      );
    }
    return (
      <div className="mb-2 rounded-xl overflow-hidden min-h-[100px] max-w-xs sm:max-w-sm bg-black/40 border border-white/10 shadow-md" data-testid={`sealed-${kind}`}>
        {kind === 'video' ? (
          <video src={url} controls playsInline className="w-full max-h-72 rounded-xl object-contain" />
        ) : (
          <img src={url} alt="Attachment" className="w-full max-h-72 min-h-[100px] rounded-xl object-contain bg-black/30" decoding="async" />
        )}
      </div>
    );
  }

  if (state === 'opening') {
    return (
      <div className="mb-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-4 py-5 text-xs font-semibold text-zinc-300 min-w-[200px]" data-testid="sealed-opening" role="status">
        <Lock className="w-3.5 h-3.5 shrink-0 animate-pulse" /> <span className="truncate">Decrypting...</span>
      </div>
    );
  }

  if (state === 'failed') {
    return (
      <button type="button" data-testid="sealed-failed" onClick={() => setAttempt((n) => n + 1)} className="mb-2 flex items-start gap-2 rounded-xl border border-white/10 bg-black/40 px-4 py-4 text-left text-xs text-zinc-300 min-w-[200px] max-w-xs cursor-pointer hover:bg-black/60">
        <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span className="min-w-0"><span className="block italic break-words">{problem}</span><span className="block mt-1 font-bold text-noob">Tap to try again</span></span>
      </button>
    );
  }

  // waiting for a tap
  return (
    <button
      type="button"
      data-testid="media-tap-to-load"
      onClick={onAsk}
      className="mb-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-4 py-5 text-xs font-semibold text-zinc-200 min-w-[200px] max-w-full cursor-pointer hover:bg-black/60"
    >
      <Lock className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate">Tap to open {word}{kind === 'audio' && message.audioDuration ? ` (${message.audioDuration})` : ''}</span>
    </button>
  );
}
