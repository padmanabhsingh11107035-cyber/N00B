import { useSyncExternalStore } from 'react';

// Is the NOOB Models page open? Opened from the three-line menu; drawn once, by ModelsHost (App.tsx).
let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const openNoobModels = (): void => { open = true; emit(); };
export const closeNoobModels = (): void => { open = false; emit(); };
export function useNoobModelsOpen(): boolean {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => open, () => open);
}
