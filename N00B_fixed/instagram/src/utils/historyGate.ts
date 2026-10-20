// The browser's history moves on its own time: history.go(-2) / back() change the page a moment LATER (a "popstate" announces it). Anything that adds a history entry in that gap
// lands in the wrong place. Pages that close several layers at once (utils/pageLayers.tsx, the Settings hub) walk back through history, and the address bar must wait for them.
// This keeps count of the walks that were started and have not finished, and lets the address bar wait until they have (afterHistoryIdle).

let installed = false;
let pending = 0;
const timers: number[] = [];
const waiting: Array<() => void> = [];

function flushSoon() {
  if (pending > 0 || waiting.length === 0) return;
  window.setTimeout(() => {
    if (pending > 0) return;
    const run = waiting.splice(0, waiting.length);
    run.forEach((fn) => { try { fn(); } catch { /* one waiting job must not stop the others */ } });
  }, 0);
}

export function installHistoryGate(): void {
  if (installed || typeof window === 'undefined' || !window.history) return;
  installed = true;
  const h = window.history as unknown as Record<string, (...args: unknown[]) => void>;
  const walk = (name: 'go' | 'back' | 'forward') => {
    const original = h[name].bind(window.history);
    h[name] = (...args: unknown[]) => {
      // go() with nothing or 0 reloads the page: that is not a walk
      if (name === 'go' && !Number(args[0])) { original(...args); return; }
      pending += 1;
      // if the browser never answers (nothing to go back to), the walk is over after a moment anyway
      timers.push(window.setTimeout(() => {
        timers.shift();
        if (pending > 0) pending -= 1;
        flushSoon();
      }, 700));
      original(...args);
    };
  };
  walk('go'); walk('back'); walk('forward');
  window.addEventListener('popstate', () => {
    if (pending > 0) {
      pending -= 1;
      const t = timers.shift();
      if (t !== undefined) window.clearTimeout(t);
    }
    flushSoon();
  }, true);
}

/** Runs `fn` as soon as no walk through history is under way (at once when none is). */
export function afterHistoryIdle(fn: () => void): void {
  if (pending === 0) { fn(); return; }
  waiting.push(fn);
}

export const historyBusy = (): boolean => pending > 0;

/** For tests: forget everything. */
export function resetHistoryGate(): void { pending = 0; timers.splice(0).forEach((t) => window.clearTimeout(t)); waiting.length = 0; }
