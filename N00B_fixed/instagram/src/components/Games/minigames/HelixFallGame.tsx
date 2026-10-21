import React, { useEffect, useRef, useState } from 'react';

// Helix Fall is a 3D game built on its own (public/games/helix-fall, a separate page with its own physics engine). It runs in a frame inside the game window; the only
// things it says to the app are whether it started and how each run ended (the game's src/main.ts and public/embed-probe.js post "helixfall:..." messages). The app then
// pays and ranks each run like any other game: reach the base of the tower = a win (+10,000,000 NOOBs, counted on the Global Leaderboard), falling = a loss (0).
// On the real site the address ends in a slash on purpose: the host answers ".../index.html" with a redirect, and a phone's offline helper can fumble a redirect inside a frame.
// (The local test server only knows the file name.)
const GAME_URL = import.meta.env.DEV ? '/games/helix-fall/index.html?embed=1' : '/games/helix-fall/?embed=1';
// First load is about 6 MB over a slow connection, so a quiet start is allowed this long before it is called stuck; a reported error shortens that.
const STUCK_AFTER_MS = 40000;
const ERROR_GRACE_MS = 6000;

export interface HelixRun {
  outcome: 'won' | 'dead';
  kind: 'daily' | 'practice';
  score: number;
  floors: number;
  totalFloors: number;
  stage: number;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function readRun(d: Record<string, unknown>): HelixRun | null {
  if (d.type !== 'helixfall:run-end') return null;
  if (d.outcome !== 'won' && d.outcome !== 'dead') return null;
  return {
    outcome: d.outcome,
    kind: d.kind === 'practice' ? 'practice' : 'daily',
    score: num(d.score),
    floors: num(d.floors),
    totalFloors: num(d.totalFloors),
    stage: num(d.stage)
  };
}

// Browsers report these now and then without anything being wrong.
const harmless = (text: string) => /ResizeObserver|^Script error\.?$/i.test(text);

interface HelixFallGameProps {
  /** Records a finished run with the app's points system. Resolves with what was added to the balance, or null when it could not be saved. */
  onRun: (result: 'win' | 'loss', run: HelixRun) => Promise<{ earned: number } | null>;
  pointsReward: number;
}

type Outcome = { run: HelixRun; state: 'saving' } | { run: HelixRun; state: 'saved'; earned: number } | { run: HelixRun; state: 'failed' };
type Phase = 'loading' | 'ready' | 'stuck';

export const HelixFallGame: React.FC<HelixFallGameProps> = ({ onRun, pointsReward }) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  // What the game page said while starting ("hello" details, errors): shown when it gets stuck, so the problem can be told exactly.
  const [notes, setNotes] = useState<string[]>([]);
  // Changing this loads the game again (the "Try again" button).
  const [attempt, setAttempt] = useState(0);
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;
  // One message per run: a second message while the first is still being saved is ignored.
  const savingRef = useRef(false);
  const phaseRef = useRef<Phase>('loading');
  phaseRef.current = phase;

  useEffect(() => {
    setPhase('loading');
    setNotes([]);
    let errorTimer = 0;
    const stuckTimer = window.setTimeout(() => { if (phaseRef.current === 'loading') setPhase('stuck'); }, STUCK_AFTER_MS);
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frameRef.current?.contentWindow) return;
      const d = e.data as Record<string, unknown> | null;
      if (!d || typeof d.type !== 'string' || !d.type.startsWith('helixfall:')) return;
      const detail = typeof d.detail === 'string' ? d.detail.slice(0, 300) : '';
      if (d.type === 'helixfall:hello') {
        setNotes((n) => [...n, `page loaded: ${detail}`]);
      } else if (d.type === 'helixfall:ready') {
        window.clearTimeout(errorTimer);
        setPhase('ready');
      } else if (d.type === 'helixfall:error') {
        if (harmless(detail)) return;
        setNotes((n) => (n.length < 6 ? [...n, detail] : n));
        // An error before the game is on screen: give it a moment (it may still recover), then call it stuck.
        if (phaseRef.current === 'loading' && !errorTimer) errorTimer = window.setTimeout(() => { if (phaseRef.current === 'loading') setPhase('stuck'); }, ERROR_GRACE_MS);
      } else {
        const run = readRun(d);
        if (!run || savingRef.current) return;
        savingRef.current = true;
        setPhase('ready');
        setOutcome({ run, state: 'saving' });
        void onRunRef.current(run.outcome === 'won' ? 'win' : 'loss', run).then((res) => {
          setOutcome(res ? { run, state: 'saved', earned: res.earned } : { run, state: 'failed' });
        }).finally(() => { savingRef.current = false; });
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(stuckTimer);
      window.clearTimeout(errorTimer);
    };
  }, [attempt]);

  const won = outcome?.run.outcome === 'won';

  return (
    <div className="space-y-2">
      <div className="relative">
        <iframe
          key={attempt}
          ref={frameRef}
          title="Helix Fall"
          src={GAME_URL}
          allow="autoplay; fullscreen"
          allowFullScreen
          // The keyboard (A / D, arrows, Space) goes to the game as soon as it is on screen.
          onLoad={() => frameRef.current?.contentWindow?.focus()}
          className="block w-full border-0 rounded-2xl bg-[#1b1838]"
          style={{ height: 'clamp(420px, calc(100dvh - 230px), 720px)' }}
        />

        {phase === 'loading' && (
          <div className="absolute inset-0 rounded-2xl bg-[#1b1838] flex flex-col items-center justify-center gap-3 px-6 text-center pointer-events-none">
            <div className="w-9 h-9 rounded-full border-4 border-amber-300/30 border-t-amber-300 animate-spin" />
            <span className="text-sm font-black text-amber-300">Loading Helix Fall…</span>
            <span className="text-[11px] text-zinc-400">The first time takes a little longer (about 6 MB).</span>
          </div>
        )}

        {phase === 'stuck' && (
          <div className="absolute inset-0 rounded-2xl bg-[#1b1838] flex flex-col items-center justify-center gap-3 px-5 text-center">
            <span className="text-3xl">🌀</span>
            <span className="text-sm font-black text-white">Helix Fall could not start</span>
            <span className="text-[11px] text-zinc-300">
              {notes.length === 0
                ? 'The game page did not answer. Check your connection and try again.'
                : 'It stopped while starting. Try again; if it keeps happening, send this to support:'}
            </span>
            {notes.length > 0 && (
              <pre className="max-w-full max-h-28 overflow-auto select-text whitespace-pre-wrap break-words text-left text-[10px] leading-snug text-zinc-400 bg-black/40 border border-white/10 rounded-xl p-2">
                {notes.join('\n')}
              </pre>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setAttempt((n) => n + 1)}
                className="px-4 py-2 rounded-2xl bg-noob text-black text-xs font-black cursor-pointer"
              >
                Try again
              </button>
              <a
                href="/games/helix-fall/"
                target="_blank"
                rel="noopener"
                className="px-4 py-2 rounded-2xl bg-zinc-800 text-white text-xs font-bold"
              >
                Open on its own
              </a>
            </div>
          </div>
        )}
      </div>

      <div
        aria-live="polite"
        className={`min-h-[44px] px-3 py-2 rounded-2xl border text-center text-xs font-bold flex items-center justify-center ${
          !outcome
            ? 'bg-zinc-900 border-zinc-800 text-zinc-400'
            : won
            ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
            : 'bg-zinc-900 border-zinc-800 text-zinc-300'
        }`}
      >
        {!outcome && <span>Reach the base of the tower to win +{pointsReward.toLocaleString()} NOOBs</span>}
        {outcome?.state === 'saving' && <span>Saving your run…</span>}
        {outcome?.state === 'saved' && (
          won ? (
            <span>🏆 You reached the base! +{outcome.earned.toLocaleString()} NOOBs added to your balance</span>
          ) : (
            <span>
              💥 Fell on floor {outcome.run.floors}{outcome.run.totalFloors ? ` of ${outcome.run.totalFloors}` : ''} — reach the base to win +{pointsReward.toLocaleString()} NOOBs
            </span>
          )
        )}
        {outcome?.state === 'failed' && <span className="text-rose-300">Could not save this run. Check your connection and play again.</span>}
      </div>
    </div>
  );
};
