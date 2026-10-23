// Canyon Rush Circuit is a separate page (public/games/canyon-rush) that the Games page shows in a frame. Its files are fetched quietly in the background, in two steps, so that Play
// never waits for a download:
//   1. "shell" (about 1.5 MB: the page, its scripts and style, fonts, logo, interface sounds and the title music): while the Games page is open and the browser is idle;
//   2. "race" (about 9 MB: the road and canyon textures, the sky, the seven cars, the props, the race sounds and the race music): as soon as the game's own page opens.
// Reading a whole body is what puts it in the browser's cache, and the frame (same address, same site) then finds everything there. The list of files comes from warm.json, which the game's
// build writes (so nothing here has to be updated when the game is rebuilt). Nothing is fetched on a data saver or a very slow connection.
const BASE = '/games/canyon-rush/';

interface Plan { shell: string[]; race: string[] }

let plan: Promise<Plan | null> | null = null;
const finished: Partial<Record<'shell' | 'race', Promise<void>>> = {};

const dataSaver = (): boolean => {
  const c = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!c && (c.saveData === true || /(^|-)2g$/.test(c.effectiveType ?? ''));
};

async function pull(url: string): Promise<void> {
  const res = await fetch(url);
  if (res.ok) await res.arrayBuffer();
}

const loadPlan = (): Promise<Plan | null> => {
  if (!plan) {
    plan = fetch(`${BASE}warm.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Plan>) : null))
      .then((p) => (p && Array.isArray(p.shell) && Array.isArray(p.race) ? p : null))
      .catch(() => null);
  }
  return plan;
};

/** Fetches `files` three at a time; a file that fails is skipped (the game fetches it itself later). */
async function pullAll(files: string[], width = 3): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: width }, async () => {
    while (next < files.length) {
      const f = files[next++];
      try { await pull(BASE + f); } catch { /* skipped */ }
    }
  }));
}

/** Warms the title-screen files ('shell'), or those and the first race's ('race'). Resolves when done; safe to call many times. */
export function warmCanyonFiles(upTo: 'shell' | 'race' = 'race'): Promise<void> {
  if (typeof window === 'undefined' || dataSaver()) return Promise.resolve();
  const step = (name: 'shell' | 'race', run: () => Promise<void>) => (finished[name] ??= run().catch(() => { delete finished[name]; }));
  const shell = step('shell', async () => {
    const p = await loadPlan();
    await pull(BASE).catch(() => undefined);
    if (p) await pullAll(p.shell);
  });
  if (upTo === 'shell') return shell;
  return shell.then(() => step('race', async () => { const p = await loadPlan(); if (p) await pullAll(p.race); }));
}

/** Warm the title-screen files when the browser has nothing better to do. */
export function warmCanyonFilesWhenIdle(): void {
  const run = () => void warmCanyonFiles('shell');
  const w = window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 7000 });
  else window.setTimeout(run, 3000);
}
