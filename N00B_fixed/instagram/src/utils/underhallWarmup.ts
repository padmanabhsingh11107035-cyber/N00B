// Underhall: After Curfew is a separate page (public/games/underhall) that the Games page shows in a frame. It is a 3D game with about 17 MB of files, so only what it needs to open
// (its script, style, fonts, the title picture and the hero models, about 3 MB) is fetched quietly in the background while the person is on the Games page or on the game's page: when
// they press Play the browser already has them. The rest (the dungeon's props, textures and music) the game streams in by itself while it is being played.
// The names of the script and style change with every build, so they are found by reading the page; nothing here has to be updated when the game is rebuilt.
const BASE = '/games/underhall/';
const EXTRA = ['title/campus.webp', 'models/char_male.glb', 'models/char_female.glb', 'models/anims.glb'];

let warming: Promise<void> | null = null;

const dataSaver = (): boolean => {
  const c = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!c && (c.saveData === true || /(^|-)2g$/.test(c.effectiveType ?? ''));
};

async function pull(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) return '';
  // Reading the whole body is what puts it in the browser's cache; only the page is looked into.
  return url.endsWith('/') ? res.text() : (await res.arrayBuffer(), '');
}

export function warmUnderhallFiles(): Promise<void> {
  if (warming) return warming;
  if (typeof window === 'undefined' || dataSaver()) return Promise.resolve();
  warming = (async () => {
    try {
      const html = await pull(BASE);
      const own = [...html.matchAll(/(?:src|href)="\.\/([^"]+\.(?:js|css|woff2))"/g)].map((m) => BASE + m[1]);
      for (const url of [...new Set(own), ...EXTRA.map((f) => BASE + f)]) await pull(url);
    } catch {
      warming = null; // try again next time
    }
  })();
  return warming;
}

/** Warm the files when the browser has nothing better to do. */
export function warmUnderhallFilesWhenIdle(): void {
  const run = () => void warmUnderhallFiles();
  const w = window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 6000 });
  else window.setTimeout(run, 2500);
}
