import { useSyncExternalStore } from 'react';

// Is the NOOB Draw page open? Opened from the Profile "three dots" menu and from the Home page menu; drawn once, by NoobDrawHost (App.tsx).
let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const openNoobDraw = (): void => { open = true; emit(); };
export const closeNoobDraw = (): void => { open = false; emit(); };
export function useNoobDrawOpen(): boolean {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => open, () => open);
}
