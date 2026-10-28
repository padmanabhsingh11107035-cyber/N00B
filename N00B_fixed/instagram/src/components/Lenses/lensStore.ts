import { useSyncExternalStore } from 'react';

// Is NOOB Lenses open? Opened from the Home menu and the Create sheet; drawn once, by LensHost (App.tsx).
let open = false;
const listeners = new Set<() => void>();
const set = (next: boolean) => { if (open === next) return; open = next; listeners.forEach((l) => l()); };

export const openLenses = (): void => set(true);
export const closeLenses = (): void => set(false);
export function useLensOpen(): boolean {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => open, () => open);
}
