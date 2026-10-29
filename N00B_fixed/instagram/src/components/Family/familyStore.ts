import { useSyncExternalStore } from 'react';

// Is the Family Map open? Opened from the Home menu; drawn once, by FamilyHost (App.tsx).
let open = false;
const listeners = new Set<() => void>();
const set = (next: boolean) => { if (open === next) return; open = next; listeners.forEach((l) => l()); };

export const openFamily = (): void => set(true);
export const closeFamily = (): void => set(false);
export function useFamilyOpen(): boolean {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => open, () => open);
}
/** the map's code is a big piece: it is fetched when someone first touches the menu entry, so the page opens at once */
export const preloadFamily = (): void => { void import('./FamilyMap'); };
