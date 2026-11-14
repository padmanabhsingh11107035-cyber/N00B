// How far the app's start-up has got, for the loading page (src/components/Common/NoobStackLoader.tsx). A tiny store with no React in it:
// App.tsx marks each of the five start-up requests as done when it settles (loadInitialData), the loading page shows done/5 as a percentage.

export const LOAD_STEPS = ['account', 'posts', 'stories', 'reels', 'notifications'] as const;
export type LoadStep = (typeof LOAD_STEPS)[number];

export const PROGRESS_MIN = 8;     // nothing done yet: the ring already shows a little, so it never looks empty
export const PROGRESS_MAX = 96;    // every request done: 96; the last 4 % is the jump to 100 when the app opens

export interface LoadProgressState { done: number; total: number; finished: boolean }

let doneSteps = new Set<LoadStep>();
let finished = false;
let snapshot: LoadProgressState = { done: 0, total: LOAD_STEPS.length, finished: false };
const listeners = new Set<() => void>();

const emit = () => {
  snapshot = { done: doneSteps.size, total: LOAD_STEPS.length, finished };
  listeners.forEach((l) => { try { l(); } catch { /* a listener must never break the app */ } });
};

/** A new start-up begins (also the "Try again" button). */
export const resetLoadProgress = (): void => { doneSteps = new Set(); finished = false; emit(); };
/** One request has settled (worked or failed: the page moves on either way). */
export const markLoadStep = (step: LoadStep): void => { if (doneSteps.has(step)) return; doneSteps.add(step); emit(); };
/** The app is ready. */
export const finishLoadProgress = (): void => { if (finished) return; finished = true; emit(); };
export const getLoadProgress = (): LoadProgressState => snapshot;
export const subscribeLoadProgress = (fn: () => void): (() => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** The percentage the finished steps stand for: 8 with none, 96 with all five, 100 once the app is ready. */
export const targetPercent = (s: LoadProgressState): number => {
  if (s.finished) return 100;
  const share = s.total > 0 ? Math.min(1, s.done / s.total) : 0;
  return PROGRESS_MIN + share * (PROGRESS_MAX - PROGRESS_MIN);
};

/** The number shown a moment later: eases towards the target, creeps slowly while it waits for the next step (never past 70 % of the way to it), never goes backwards. */
export const nextPercent = (shown: number, s: LoadProgressState, dtMs: number): number => {
  const target = targetPercent(s);
  if (s.finished) return 100;
  const slice = (PROGRESS_MAX - PROGRESS_MIN) / Math.max(1, s.total);
  const ceiling = s.done >= s.total ? PROGRESS_MAX : Math.min(PROGRESS_MAX, target + slice * 0.7);
  let v = shown;
  if (v < target) v = v + (target - v) * (1 - Math.exp(-dtMs / 260));     // catch up with what is really done
  else if (v < ceiling) v = Math.min(ceiling, v + dtMs * 0.0006);          // creep: about 0.6 % a second, so it never looks frozen
  return Math.max(shown, Math.min(v, 100));
};
