import { useSyncExternalStore } from 'react';

// Is NOOB Lenses open? Opened from the Home menu and the Create sheet; drawn once, by LensHost (App.tsx).
let open = false;
const listeners = new Set<() => void>();
const set = (next: boolean) => { if (open === next) return; open = next; listeners.forEach((l) => l()); };

// The face finder's files (about 15 MB, from this website's own server, not the database) are fetched ahead once: in the background a few seconds after the app is up on a fast connection
// (wifi / 4G, data saving off), and always the moment Lenses is opened (then the download runs while the page itself starts). The browser keeps them for 7 days.
let warmed = false;
export const warmLenses = (force = false): void => {
  if (warmed || typeof fetch !== 'function') return;
  const c = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (c?.saveData) return;
  if (!force && (!c || (c.effectiveType && c.effectiveType !== '4g'))) return;
  warmed = true;
  for (const u of ['/lenses/face_landmarker.task', '/lenses/mediapipe/vision_wasm_internal.wasm', '/lenses/mediapipe/vision_wasm_internal.js']) {
    void fetch(u, { priority: 'low' } as RequestInit).then((r) => r.arrayBuffer()).catch(() => undefined);
  }
};

export const openLenses = (): void => { warmLenses(true); set(true); };
export const closeLenses = (): void => set(false);
export function useLensOpen(): boolean {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => open, () => open);
}
