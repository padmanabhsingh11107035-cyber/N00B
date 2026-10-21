import { useSyncExternalStore } from 'react';

// Is NOOB Studio open? Opened from the Home menu, the Create sheet and the /studio address; drawn once, by StudioHost (App.tsx). `files` are pictures / videos it should open with.
interface State { open: boolean; files: File[] }
let state: State = { open: false, files: [] };
const listeners = new Set<() => void>();
const set = (next: State) => { state = next; listeners.forEach((l) => l()); };

export const openStudio = (files: File[] = []): void => set({ open: true, files });
export const closeStudio = (): void => set({ open: false, files: [] });
export function useStudioState(): State {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => state, () => state);
}

/** editor.noobsocials.com (or any address opened with ?editor=1): the whole page is NOOB Studio, with no account needed, because everything is edited on the device. */
export const isEditorHost = (): boolean => {
  try { return typeof location !== 'undefined' && (/^editor\./i.test(location.hostname) || new URLSearchParams(location.search).get('editor') === '1'); } catch { return false; }
};
