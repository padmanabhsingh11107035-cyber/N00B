import type { FamilyApi } from './api.ts';
import { shouldPush, type Fix } from './geo.ts';
import type { Problem } from './locate.ts';

// NOOB Family Map: the one thing that follows this phone and sends its place (locked, see sealed.ts) to the rooms the person shares with. One of it per app, shared by the room screen
// (which shows "you" on the map) and by the app itself (which keeps sharing while NOOB is open anywhere, and in the Android app also while it is closed). The way to follow the phone is
// handed in (the page's own location, or the Android background service), so this part has no browser in it and is tested on its own.
export interface TrackerState { running: boolean; fix: Fix | null; problem: Problem | null }
export interface TrackerDeps {
  /** starts following the phone; returns the way to stop */
  watch: (onFix: (f: Fix) => void, onProblem: (p: Problem) => void) => Promise<() => void> | (() => void);
  now: () => number;
  /** calls `fn` every `ms` milliseconds; returns the way to stop */
  every: (fn: () => void, ms: number) => () => void;
  /** told about every place that is sent (the day report is made from them) */
  onSample?: (f: Fix) => void;
  /** called every few seconds while the tracker runs */
  onTick?: () => void;
}
const HEARTBEAT_MS = 20_000, BEAT_CHECK_MS = 5_000;

export function createTracker(deps: TrackerDeps) {
  let state: TrackerState = { running: false, fix: null, problem: null };
  const listeners = new Set<(s: TrackerState) => void>();
  let api: FamilyApi | null = null, stopWatch: (() => void) | null = null, stopBeat: (() => void) | null = null, starting: Promise<void> | null = null;
  let last: { lat: number; lng: number; at: number } | null = null;

  const set = (p: Partial<TrackerState>): void => { state = { ...state, ...p }; listeners.forEach((l) => l(state)); };
  const send = (f: Fix): void => { last = { lat: f.lat, lng: f.lng, at: deps.now() }; deps.onSample?.(f); void api?.pushLocation(f); };

  /** begins following and sending (nothing happens when it already runs) */
  function start(a: FamilyApi): Promise<void> {
    api = a;
    if (state.running) return starting ?? Promise.resolve();
    set({ running: true, problem: null });
    starting = (async () => {
      const stop = await deps.watch(
        (f) => { set({ fix: f, problem: null }); if (shouldPush(last, f, deps.now())) send(f); },
        (p) => set({ problem: p })
      );
      if (!state.running) { stop(); return; } // stopped while it was starting
      stopWatch = stop;
      // standing still sends nothing by itself: a heartbeat every 20 seconds keeps the person "live" for the others
      stopBeat = deps.every(() => { const f = state.fix; if (f && deps.now() - (last?.at ?? 0) >= HEARTBEAT_MS) send({ ...f, at: deps.now() }); deps.onTick?.(); }, BEAT_CHECK_MS);
    })().finally(() => { starting = null; });
    return starting;
  }
  function stop(): void {
    set({ running: false });
    stopWatch?.(); stopBeat?.();
    stopWatch = stopBeat = null; last = null;
  }
  function subscribe(cb: (s: TrackerState) => void): () => void { listeners.add(cb); cb(state); return () => { listeners.delete(cb); }; }
  return { start, stop, subscribe, state: (): TrackerState => state };
}
export type Tracker = ReturnType<typeof createTracker>;
