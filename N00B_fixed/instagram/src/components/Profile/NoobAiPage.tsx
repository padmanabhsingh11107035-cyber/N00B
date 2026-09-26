import React, { useEffect, useMemo, useState } from 'react';
import { Bot, ChevronLeft, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { noobAiIsOnline, noobAiSignInUrl, openNoobAi } from '../../utils/noobAi';

interface NoobAiPageProps {
  onClose: () => void;
}

// NOOB AI inside the NOOB app: the voice assistant opens full-screen here (no new browser tab) and signs this
// account in automatically. Its brain runs on the owner's PC, so it can be offline when that PC is off.
export const NoobAiPage: React.FC<NoobAiPageProps> = ({ onClose }) => {
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const src = useMemo(() => (status === 'online' ? noobAiSignInUrl() : ''), [status, attempt]);

  useEffect(() => {
    let alive = true;
    setStatus('checking');
    setLoaded(false);
    noobAiIsOnline().then((online) => { if (alive) setStatus(online ? 'online' : 'offline'); });
    return () => { alive = false; };
  }, [attempt]);

  return (
    <div className="fixed inset-0 z-[100] bg-[#f6f7fb] text-slate-900 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="relative z-10 flex items-center gap-3 px-3 py-3 sm:px-5 border-b border-slate-200 shrink-0 bg-white">
        <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 transition-colors cursor-pointer" aria-label="Back">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-violet-600 flex items-center justify-center shrink-0">
          <Bot className="w-4 h-4 text-white" />
        </div>
        <h1 className="text-lg font-black tracking-tight flex-1">NOOB AI</h1>
        <button onClick={() => setAttempt((n) => n + 1)} className="p-2 rounded-full hover:bg-slate-100 transition-colors cursor-pointer" aria-label="Reload" title="Reload">
          <RefreshCw className="w-5 h-5" />
        </button>
        <button onClick={openNoobAi} className="p-2 rounded-full hover:bg-slate-100 transition-colors cursor-pointer" aria-label="Open in a new tab" title="Open in a new tab">
          <ExternalLink className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="relative flex-1">
        {status === 'online' && (
          <iframe
            key={attempt}
            src={src}
            title="NOOB AI"
            allow="microphone; autoplay; clipboard-write"
            onLoad={() => setLoaded(true)}
            className="absolute inset-0 w-full h-full border-0 bg-[#f6f7fb]"
          />
        )}
        {(status === 'checking' || (status === 'online' && !loaded)) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#f6f7fb]">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-cyan-300 via-cyan-500 to-violet-600 shadow-[0_24px_60px_rgba(109,93,252,0.35)] animate-pulse" />
            <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Waking up NOOB AI…</p>
          </div>
        )}
        {status === 'offline' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-slate-200 flex items-center justify-center">
              <Bot className="w-9 h-9 text-slate-400" />
            </div>
            <h2 className="text-lg font-bold">NOOB AI is sleeping</h2>
            <p className="text-sm text-slate-500 max-w-xs">Its computer is switched off right now. Please try again a little later.</p>
            <button onClick={() => setAttempt((n) => n + 1)} className="mt-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-sm cursor-pointer">
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
