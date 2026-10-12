import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, RefreshCw } from 'lucide-react';
import { noobAiIsOnline, noobAiSignInUrl, NOOB_AI_URL } from '../../utils/noobAi';
import { fetchPublicPlatformSettings, requestNoobAiWake } from '../../services/api';
import { NoobAiLogo } from './NoobAiLogo';
import { NoobAiGem } from './NoobAiGem';

interface NoobAiPageProps {
  onClose: () => void;
  // The main admin can still open NOOB AI while it is locked for maintenance (to test it).
  isMainAdmin?: boolean;
  // Saying bye inside NOOB AI should land back on the main feed, not just close this overlay onto
  // whatever screen was open before — see the postMessage listener below.
  onBye?: () => void;
}

// One stage for every state (waking, sleeping, maintenance): soft colour glows, the 3D gem inside slowly turning rings, text under it.
const Stage: React.FC<{ sleeping?: boolean; title: React.ReactNode; text?: React.ReactNode; children?: React.ReactNode }> = ({ sleeping, title, text, children }) => (
  <div className="absolute inset-0 flex flex-col items-center justify-center gap-7 px-8 text-center overflow-hidden bg-zinc-950">
    <div className={`pointer-events-none absolute -top-28 -right-20 w-80 h-80 rounded-full blur-3xl ${sleeping ? 'bg-zinc-500/10' : 'bg-noob/25 animate-pulse'}`} />
    <div className={`pointer-events-none absolute -bottom-32 -left-24 w-96 h-96 rounded-full blur-3xl ${sleeping ? 'bg-zinc-500/10' : 'bg-violet-500/20 animate-pulse'}`} style={{ animationDelay: '1.2s' }} />
    <div className="relative flex items-center justify-center" style={{ width: 250, height: 250 }}>
      <div className={`absolute inset-0 rounded-full border border-dashed ${sleeping ? 'border-zinc-700' : 'border-noob/40 noob-ring'}`} />
      <div className={`absolute inset-6 rounded-full border ${sleeping ? 'border-zinc-800' : 'border-violet-400/30 noob-ring-rev'}`} />
      <NoobAiGem size={176} sleeping={sleeping} />
    </div>
    <div className="relative">
      <h2 className="text-2xl font-black tracking-tight text-zinc-50">{title}</h2>
      {text && <p className="text-sm text-zinc-400 max-w-xs mx-auto mt-2 leading-relaxed">{text}</p>}
    </div>
    {children}
  </div>
);

const WakingBar = () => (
  <div className="relative w-52 h-1.5 rounded-full bg-zinc-800 overflow-hidden" aria-hidden="true">
    <div className="absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-noob to-transparent noob-shimmer" />
  </div>
);

// NOOB AI inside the NOOB app: the voice assistant opens full-screen here (no new browser tab) and signs this
// account in automatically. Its brain runs on the owner's PC, so it can be offline when that PC is off.
export const NoobAiPage: React.FC<NoobAiPageProps> = ({ onClose, isMainAdmin = false, onBye }) => {
  const [status, setStatus] = useState<'checking' | 'online' | 'offline' | 'maintenance' | 'waking'>('checking');
  // true after a wake-up attempt that didn't work (then NOOB AI's computer itself is off)
  const [wakeFailed, setWakeFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const src = useMemo(() => (status === 'online' ? noobAiSignInUrl() : ''), [status, attempt]);

  useEffect(() => {
    let alive = true;
    setStatus('checking');
    setLoaded(false);
    // Locked for maintenance in the Admin Control Panel? (The main admin may still go in.)
    // Otherwise one quick second look before saying it's asleep: a slow phone connection can miss the first check.
    Promise.all([
      isMainAdmin ? Promise.resolve(false) : fetchPublicPlatformSettings().then((s) => !!s.noobAiMaintenance),
      noobAiIsOnline().then((online) => online || noobAiIsOnline()),
    ]).then(([locked, online]) => {
      if (alive) setStatus(locked ? 'maintenance' : online ? 'online' : 'offline');
    });
    return () => { alive = false; };
  }, [attempt]);

  // "Bye" said inside NOOB AI posts this from the iframe (its own hash-based pages have no way to
  // reach outside themselves) — closing straight to the main feed, not back to whatever screen under
  // this overlay happened to be open before.
  useEffect(() => {
    const expectedOrigin = new URL(NOOB_AI_URL).origin;
    const handler = (event: MessageEvent) => {
      if (event.origin !== expectedOrigin || event.data?.type !== 'noob-ai-bye') return;
      onClose();
      onBye?.();
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onClose, onBye]);

  const reload = () => setAttempt((n) => n + 1);

  // NOOB AI is a separate website inside this page: tell it which colour theme NOOB is showing (and keep telling it if that changes),
  // so it is dark when the app is dark. (It listens in server/web/theme.js.)
  const frameRef = useRef<HTMLIFrameElement>(null);
  const sendTheme = () => {
    try {
      const theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      frameRef.current?.contentWindow?.postMessage({ type: 'noob-theme', theme }, new URL(NOOB_AI_URL).origin);
    } catch { /* the frame is not ready yet */ }
  };
  useEffect(() => {
    const watcher = new MutationObserver(sendTheme);
    watcher.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => watcher.disconnect();
  }, []);

  // A rotating line under the waking-up title, so the wait feels alive.
  const WAKE_LINES = ['Warming up the voice…', 'Remembering what you told me…', 'Catching up with today\'s news…', 'Getting ready to talk…'];
  const [wakeLine, setWakeLine] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setWakeLine((n) => (n + 1) % WAKE_LINES.length), 2400);
    return () => window.clearInterval(t);
  }, []);

  // "Wake up NOOB": asks the NOOB AI computer to start NOOB AI (its keeper checks every 15 seconds), then waits
  // for it to come online. Anyone can wake it; nobody can switch it off from here.
  const wakeUp = async () => {
    setStatus('waking');
    setWakeFailed(false);
    await requestNoobAiWake();
    const started = Date.now();
    while (Date.now() - started < 100_000) {
      await new Promise((r) => setTimeout(r, 1500));
      if (await noobAiIsOnline()) {
        setLoaded(false);
        setStatus('online');
        return;
      }
    }
    setWakeFailed(true);
    setStatus('offline');
  };

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950 text-zinc-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="relative z-10 flex items-center gap-3 px-3 py-2.5 sm:px-5 border-b border-zinc-800 shrink-0 bg-zinc-900/90 backdrop-blur">
        <button onClick={onClose} className="p-2 rounded-full hover:bg-zinc-800 transition-colors cursor-pointer" aria-label="Back">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <NoobAiLogo className="w-11 h-11 shrink-0 drop-shadow-[0_4px_12px_rgba(0,0,0,0.3)]" sleeping={status === 'offline'} />
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-black tracking-tight leading-tight">NOOB AI</h1>
          <p className="text-[11px] font-semibold text-zinc-400 leading-tight flex items-center gap-1.5">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${status === 'online' ? 'bg-emerald-400' : status === 'offline' || status === 'maintenance' ? 'bg-zinc-500' : 'bg-amber-400 animate-pulse'}`} />
            {status === 'online' ? 'Your AI friend · online' : status === 'offline' ? 'Sleeping' : status === 'maintenance' ? 'Under maintenance' : 'Waking up…'}
          </p>
        </div>
        <button onClick={reload} className="p-2 rounded-full hover:bg-zinc-800 transition-colors cursor-pointer" aria-label="Reload" title="Reload">
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="relative flex-1">
        {status === 'online' && (
          <iframe
            ref={frameRef}
            key={attempt}
            src={src}
            title="NOOB AI"
            allow="microphone; autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            onLoad={() => { setLoaded(true); sendTheme(); window.setTimeout(sendTheme, 400); }}
            className="absolute inset-0 w-full h-full border-0 bg-zinc-950"
          />
        )}
        {(status === 'checking' || (status === 'online' && !loaded)) && (
          <Stage
            title={<>Waking up NOOB AI<span className="noob-dots" /></>}
            text={<span key={wakeLine} className="inline-block animate-[noob-fade_.5s_ease]">{WAKE_LINES[wakeLine]}</span>}
          >
            <WakingBar />
            <p className="relative text-[11px] font-semibold tracking-wide uppercase text-zinc-500">Your multilingual AI friend</p>
          </Stage>
        )}
        {status === 'maintenance' && (
          <Stage sleeping title="NOOB AI is under maintenance 🛠️" text="We're making NOOB AI even better. Please check back soon!">
            <button
              onClick={wakeUp}
              className="relative px-7 py-3 rounded-2xl bg-zinc-800 text-zinc-50 border border-zinc-700 font-bold text-sm active:scale-95 transition-transform cursor-pointer"
            >
              Check again
            </button>
          </Stage>
        )}
        {status === 'waking' && (
          <Stage title={<>Waking NOOB up<span className="noob-dots" /></>} text="This takes a few seconds.">
            <WakingBar />
          </Stage>
        )}
        {status === 'offline' && (
          <Stage
            sleeping
            title="NOOB is sleeping 💤"
            text={wakeFailed
              ? "NOOB couldn't wake up — its computer is switched off right now. Please try again later."
              : 'Tap below to wake NOOB up.'}
          >
            <button
              onClick={wakeUp}
              className="relative px-7 py-3 rounded-2xl bg-gradient-to-r from-noob to-noob-strong text-white font-bold text-sm shadow-[0_10px_24px_rgba(217,119,87,0.35)] active:scale-95 transition-transform cursor-pointer"
            >
              Wake up NOOB
            </button>
          </Stage>
        )}
      </div>
    </div>
  );
};
