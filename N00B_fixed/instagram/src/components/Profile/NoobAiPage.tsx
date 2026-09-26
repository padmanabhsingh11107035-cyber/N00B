import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, RefreshCw } from 'lucide-react';
import { noobAiIsOnline, noobAiSignInUrl } from '../../utils/noobAi';
import { NoobAiLogo } from './NoobAiLogo';
import { NoobAiGem } from './NoobAiGem';

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
    // One quick second look before saying it's asleep: a slow phone connection can miss the first check.
    noobAiIsOnline()
      .then((online) => online || noobAiIsOnline())
      .then((online) => { if (alive) setStatus(online ? 'online' : 'offline'); });
    return () => { alive = false; };
  }, [attempt]);

  const wakeUp = () => setAttempt((n) => n + 1);

  return (
    <div className="fixed inset-0 z-[100] bg-[#f6f7fb] text-slate-900 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="relative z-10 flex items-center gap-3 px-3 py-2.5 sm:px-5 border-b border-slate-200 shrink-0 bg-white">
        <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 transition-colors cursor-pointer" aria-label="Back">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <NoobAiLogo className="w-11 h-11 shrink-0 drop-shadow-[0_6px_14px_rgba(76,47,208,0.35)]" sleeping={status === 'offline'} />
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-black tracking-tight leading-tight">NOOB AI</h1>
          <p className="text-[11px] font-semibold text-slate-500 leading-tight">
            {status === 'online' ? 'Your AI friend · online' : status === 'offline' ? 'Sleeping' : 'Waking up…'}
          </p>
        </div>
        <button onClick={wakeUp} className="p-2 rounded-full hover:bg-slate-100 transition-colors cursor-pointer" aria-label="Reload" title="Reload">
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="relative flex-1">
        {status === 'online' && (
          <iframe
            key={attempt}
            src={src}
            title="NOOB AI"
            allow="microphone; autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            onLoad={() => setLoaded(true)}
            className="absolute inset-0 w-full h-full border-0 bg-[#f6f7fb]"
          />
        )}
        {(status === 'checking' || (status === 'online' && !loaded)) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 bg-[radial-gradient(800px_500px_at_80%_-10%,rgba(109,93,252,0.10),transparent_60%),radial-gradient(600px_400px_at_10%_110%,rgba(6,182,212,0.08),transparent_60%)] bg-[#f6f7fb]">
            <NoobAiGem size={200} />
            <div className="text-center">
              <p className="text-lg font-black tracking-tight">Waking up NOOB AI…</p>
              <p className="text-sm text-slate-500 mt-1">Your multilingual AI friend</p>
            </div>
          </div>
        )}
        {status === 'offline' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-8 text-center">
            <NoobAiGem size={180} sleeping />
            <div>
              <h2 className="text-xl font-black tracking-tight">NOOB is sleeping 💤</h2>
              <p className="text-sm text-slate-500 max-w-xs mt-2">NOOB AI's computer is switched off or offline right now.</p>
            </div>
            <button
              onClick={wakeUp}
              className="px-7 py-3 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 text-white font-bold text-sm shadow-[0_10px_24px_rgba(109,93,252,0.35)] active:scale-95 transition-transform cursor-pointer"
            >
              Wake up NOOB
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
