import React, { useEffect, useRef, useState } from 'react';
import type { HelixBoard } from '../../../services/api';

// Helix Fall is a 3D game built on its own (public/games/helix-fall, a separate page). It runs in a frame inside the game window and talks to the app with messages
// ("helixfall:..." — the game's src/main.ts and public/embed-probe.js are the other end):
//   game -> app:  hello / ready / error (is it starting), level (a level of 90 floors was cleared), run-end (the ball fell), board-request (the leaderboard).
//   app -> game:  board (the answer), profile (the player's best score), saved (what the server kept of the run).
// The app pays and ranks it like any other game: every level cleared pays +50,000,000 NOOBs at once (levels never end), and a player's best Daily Tower run is their one score on the board.
// The address ends in a slash on purpose: the host answers ".../index.html" with a redirect, and a phone's offline helper can fumble a redirect inside a frame.
// (The local test server only knows the file name.)
const GAME_PATH = import.meta.env.DEV ? '/games/helix-fall/index.html' : '/games/helix-fall/';
// First load is about 0.7 MB, so a quiet start is allowed this long before it is called stuck; a reported error shortens that.
const STUCK_AFTER_MS = 40000;
const ERROR_GRACE_MS = 6000;

export interface HelixRun {
  kind: 'daily' | 'practice';
  score: number;
  floors: number;
  /** Levels cleared in this run; the ball fell on level `levels + 1`. */
  levels: number;
  level: number;
}

export interface HelixSaved { bestScore: number; newBest: boolean }

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function readRun(d: Record<string, unknown>): HelixRun | null {
  if (d.type !== 'helixfall:run-end') return null;
  const levels = Math.max(0, Math.floor(num(d.levels)));
  return { kind: d.kind === 'practice' ? 'practice' : 'daily', score: Math.max(0, Math.floor(num(d.score))), floors: Math.max(0, Math.floor(num(d.floors))), levels, level: levels + 1 };
}

// Browsers report these now and then without anything being wrong.
const harmless = (text: string) => /ResizeObserver|^Script error\.?$/i.test(text);

interface HelixFallGameProps {
  /** The name shown on the board (the player's NOOB name). */
  userName: string;
  pointsPerLevel: number;
  /** Pays one cleared level. Resolves with what was added to the balance, or an error text. */
  onLevel: (level: number) => Promise<{ earned: number } | { error: string }>;
  /** Records the end of a run (best score). Resolves with what the server kept, or null when it could not be saved. */
  onRun: (run: HelixRun) => Promise<HelixSaved | null>;
  loadBoard: (period: 'today' | 'all') => Promise<HelixBoard | null>;
}

type Note =
  | { kind: 'idle' }
  | { kind: 'level'; level: number; earned: number }
  | { kind: 'levelFailed'; level: number; error: string }
  | { kind: 'ended'; run: HelixRun; earned: number; saved: HelixSaved | null | 'saving' };
type Phase = 'loading' | 'ready' | 'stuck';

export const HelixFallGame: React.FC<HelixFallGameProps> = ({ userName, pointsPerLevel, onLevel, onRun, loadBoard }) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [note, setNote] = useState<Note>({ kind: 'idle' });
  const [phase, setPhase] = useState<Phase>('loading');
  // What the game page said while starting ("hello" details, errors): shown when it gets stuck, so the problem can be told exactly.
  const [notes, setNotes] = useState<string[]>([]);
  // Changing this loads the game again (the "Try again" button).
  const [attempt, setAttempt] = useState(0);
  const props = useRef({ onLevel, onRun, loadBoard });
  props.current = { onLevel, onRun, loadBoard };
  const phaseRef = useRef<Phase>('loading');
  phaseRef.current = phase;
  // Levels are paid one after the other, and what a run earned is added up for its summary.
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const runEarnedRef = useRef(0);

  useEffect(() => {
    setPhase('loading');
    setNotes([]);
    runEarnedRef.current = 0;
    let errorTimer = 0;
    const tell = (message: Record<string, unknown>) => frameRef.current?.contentWindow?.postMessage(message, window.location.origin);
    const stuckTimer = window.setTimeout(() => { if (phaseRef.current === 'loading') setPhase('stuck'); }, STUCK_AFTER_MS);
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frameRef.current?.contentWindow) return;
      const d = e.data as Record<string, unknown> | null;
      if (!d || typeof d.type !== 'string' || !d.type.startsWith('helixfall:')) return;
      const detail = typeof d.detail === 'string' ? d.detail.slice(0, 300) : '';
      switch (d.type) {
        case 'helixfall:hello':
          setNotes((n) => [...n, `page loaded: ${detail}`]);
          break;
        case 'helixfall:ready':
          window.clearTimeout(errorTimer);
          setPhase('ready');
          // the player's best score (from any device) for the game's "best" line
          void props.current.loadBoard('all').then((board) => tell({ type: 'helixfall:profile', bestScore: board?.me?.score ?? 0 }));
          break;
        case 'helixfall:error':
          if (harmless(detail)) break;
          setNotes((n) => (n.length < 6 ? [...n, detail] : n));
          // An error before the game is on screen: give it a moment (it may still recover), then call it stuck.
          if (phaseRef.current === 'loading' && !errorTimer) errorTimer = window.setTimeout(() => { if (phaseRef.current === 'loading') setPhase('stuck'); }, ERROR_GRACE_MS);
          break;
        case 'helixfall:run-start':
          // a new run: what was said about the last one goes (queued, so a payout still being saved is not lost)
          queueRef.current = queueRef.current.then(() => { runEarnedRef.current = 0; setNote({ kind: 'idle' }); });
          break;
        case 'helixfall:level': {
          const level = Math.max(1, Math.floor(num(d.level)));
          setPhase('ready');
          queueRef.current = queueRef.current.then(async () => {
            const res = await props.current.onLevel(level);
            if ('error' in res) setNote({ kind: 'levelFailed', level, error: res.error });
            else { runEarnedRef.current += res.earned; setNote({ kind: 'level', level, earned: res.earned }); }
          });
          break;
        }
        case 'helixfall:run-end': {
          const run = readRun(d);
          if (!run) break;
          setPhase('ready');
          // after the level payouts of this run, so the summary has all of them
          queueRef.current = queueRef.current.then(async () => {
            const earned = runEarnedRef.current;
            runEarnedRef.current = 0;
            setNote({ kind: 'ended', run, earned, saved: 'saving' });
            const saved = await props.current.onRun(run);
            setNote({ kind: 'ended', run, earned, saved });
            if (saved) tell({ type: 'helixfall:saved', bestScore: saved.bestScore, newBest: saved.newBest });
          });
          break;
        }
        case 'helixfall:board-request': {
          const id = num(d.id);
          const period = d.period === 'all' ? 'all' : 'today';
          void props.current.loadBoard(period).then((board) => {
            tell(board
              ? { type: 'helixfall:board', id, ok: true, period: board.period, total: board.total, me: board.me, entries: board.entries.map((x) => ({ rank: x.rank, userId: x.userId, displayName: x.displayName, score: x.score, isMe: x.isMe })) }
              : { type: 'helixfall:board', id, ok: false });
          });
          break;
        }
        default:
          break;
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(stuckTimer);
      window.clearTimeout(errorTimer);
    };
  }, [attempt]);

  const src = `${GAME_PATH}?embed=1&name=${encodeURIComponent(userName.slice(0, 16))}`;
  const money = (n: number) => n.toLocaleString();
  const good = note.kind === 'level' || (note.kind === 'ended' && note.earned > 0);

  return (
    <div className="space-y-2">
      <div className="relative">
        <iframe
          key={attempt}
          ref={frameRef}
          title="Helix Fall"
          src={src}
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
            <span className="text-[11px] text-zinc-400">Just a moment.</span>
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
          good ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-zinc-900 border-zinc-800 text-zinc-300'
        }`}
      >
        {note.kind === 'idle' && <span className="text-zinc-400">Clear 90 floors = a level: +{money(pointsPerLevel)} NOOBs, level after level</span>}
        {note.kind === 'level' && <span>🏆 Level {note.level} cleared! +{money(note.earned)} NOOBs added to your balance</span>}
        {note.kind === 'levelFailed' && <span className="text-rose-300">Level {note.level} cleared, but it could not be paid: {note.error}</span>}
        {note.kind === 'ended' && (
          <span>
            {note.earned > 0
              ? `🏆 Level ${note.run.levels} cleared · +${money(note.earned)} NOOBs this run`
              : `💥 Fell on floor ${note.run.floors} of level ${note.run.level} — clear 90 floors for +${money(pointsPerLevel)} NOOBs`}
            {note.saved === 'saving' && ' · saving…'}
            {note.saved && note.saved !== 'saving' && note.run.kind === 'daily' && ` · your best score: ${money(note.saved.bestScore)}`}
            {note.saved === null && <span className="text-rose-300"> · could not save the score</span>}
          </span>
        )}
      </div>
    </div>
  );
};
