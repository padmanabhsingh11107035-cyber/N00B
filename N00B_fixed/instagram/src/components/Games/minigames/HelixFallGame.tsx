import React, { useEffect, useRef, useState } from 'react';

// Helix Fall is a 3D game built on its own (public/games/helix-fall, a separate page with its own physics engine). It runs in a frame inside the game window; the only
// thing it says to the app is how each run ended (src/main.ts of the game posts "helixfall:run-end"). The app then pays and ranks that run like any other game:
// reach the base of the tower = a win (+10,000,000 NOOBs, counted on the Global Leaderboard), falling = a loss (0).
const GAME_URL = '/games/helix-fall/index.html?embed=1';

export interface HelixRun {
  outcome: 'won' | 'dead';
  kind: 'daily' | 'practice';
  score: number;
  floors: number;
  totalFloors: number;
  stage: number;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function readRun(data: unknown): HelixRun | null {
  const d = data as Record<string, unknown> | null;
  if (!d || d.type !== 'helixfall:run-end') return null;
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

interface HelixFallGameProps {
  /** Records a finished run with the app's points system. Resolves with what was added to the balance, or null when it could not be saved. */
  onRun: (result: 'win' | 'loss', run: HelixRun) => Promise<{ earned: number } | null>;
  pointsReward: number;
}

type Outcome = { run: HelixRun; state: 'saving' } | { run: HelixRun; state: 'saved'; earned: number } | { run: HelixRun; state: 'failed' };

export const HelixFallGame: React.FC<HelixFallGameProps> = ({ onRun, pointsReward }) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;
  // One message per run: a second message while the first is still being saved is ignored.
  const savingRef = useRef(false);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frameRef.current?.contentWindow) return;
      const run = readRun(e.data);
      if (!run || savingRef.current) return;
      savingRef.current = true;
      setOutcome({ run, state: 'saving' });
      void onRunRef.current(run.outcome === 'won' ? 'win' : 'loss', run).then((res) => {
        setOutcome(res ? { run, state: 'saved', earned: res.earned } : { run, state: 'failed' });
      }).finally(() => { savingRef.current = false; });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const won = outcome?.run.outcome === 'won';

  return (
    <div className="space-y-2">
      <iframe
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
