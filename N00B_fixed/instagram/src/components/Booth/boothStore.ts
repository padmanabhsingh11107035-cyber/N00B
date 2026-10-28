import { useSyncExternalStore } from 'react';

// Is the Buddy Booth open? Opened from the profile page (the button beside Edit profile / Share profile); drawn once, by BoothHost (App.tsx).
let open = false;
const listeners = new Set<() => void>();
const set = (next: boolean) => { if (open === next) return; open = next; listeners.forEach((l) => l()); };

export const openBooth = (): void => set(true);
export const closeBooth = (): void => set(false);
export function useBoothOpen(): boolean {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => open, () => open);
}
/** the booth's code is a big piece: it is fetched when someone first touches the button, so it opens at once */
export const preloadBooth = (): void => { void import('./BuddyBooth'); };
