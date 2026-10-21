// Helix Fall is a separate page (public/games/helix-fall) that the Games page shows in a frame. Its files are small now (about 0.7 MB) but still a download, so they are fetched quietly
// in the background while the person is on the Games page: when they press Play the browser already has them, and the game starts at once.
// Everything the game names in its files is found by reading them (their names change with every build), nothing here has to be updated when the game is rebuilt.
const BASE = '/games/helix-fall/';

let warming: Promise<void> | null = null;

const dataSaver = (): boolean => {
  const c = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!c && (c.saveData === true || /(^|-)2g$/.test(c.effectiveType ?? ''));
};

async function pull(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) return '';
  // Reading the whole body is what puts it in the browser's cache; only the script is looked into.
  return url.endsWith('.js') || url.endsWith('/') ? res.text() : (await res.arrayBuffer(), '');
}

export function warmHelixFiles(): Promise<void> {
  if (warming) return warming;
  if (typeof window === 'undefined' || dataSaver()) return Promise.resolve();
  warming = (async () => {
    try {
      const html = await pull(BASE);
      const own = [...html.matchAll(/(?:src|href)="\.\/([^"]+\.(?:js|css|woff2))"/g)].map((m) => BASE + m[1]);
      const done = new Set<string>();
      for (const url of own) {
        if (done.has(url)) continue;
        done.add(url);
        const text = await pull(url);
        // the script names the model (and anything else it loads later)
        for (const m of text.matchAll(/assets\/[\w.-]+\.(?:glb|png|jpe?g)/g)) {
          const extra = BASE + m[0];
          if (!done.has(extra)) { done.add(extra); await pull(extra); }
        }
      }
    } catch {
      warming = null; // try again next time
    }
  })();
  return warming;
}

/** Warm the files when the browser has nothing better to do. */
export function warmHelixFilesWhenIdle(): void {
  const run = () => void warmHelixFiles();
  const w = window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 4000 });
  else window.setTimeout(run, 1500);
}
