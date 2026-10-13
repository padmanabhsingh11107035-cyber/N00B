import { useSyncExternalStore } from 'react';

// NOOB STUDY's own small navigation: which screen is open, and the screens behind it (so Back goes where the student came from).
// Opened from the Home menu; drawn once, by StudyHost (App.tsx). The student can always leave to the main NOOB app.

export type StudyParams = Record<string, string | number | boolean | null | undefined>;
export interface StudyEntry { page: string; params: StudyParams }
interface NavState { open: boolean; stack: StudyEntry[] }

// NOOB STUDY is shown to everybody once this is true; until then only the main administrator sees the menu entry (to try it first).
export const STUDY_OPEN_TO_ALL = false;

const TOP_LEVEL = new Set(['home', 'tutor', 'plan', 'subjects', 'more']);
let state: NavState = { open: false, stack: [] };
const listeners = new Set<() => void>();
const set = (next: NavState) => { state = next; listeners.forEach((l) => l()); };

export const isTopLevel = (page: string): boolean => TOP_LEVEL.has(page);

export const openStudy = (page = 'home', params: StudyParams = {}): void => set({ open: true, stack: [{ page, params }] });
export const closeStudy = (): void => set({ open: false, stack: [] });
// Move to another screen. A top-level screen (a tab) replaces the stack; any other screen is put on top of it.
export const goStudy = (page: string, params: StudyParams = {}): void => {
  if (!state.open) return openStudy(page, params);
  if (isTopLevel(page)) return set({ open: true, stack: [{ page, params }] });
  const top = state.stack[state.stack.length - 1];
  if (top && top.page === page && JSON.stringify(top.params) === JSON.stringify(params)) return;
  set({ open: true, stack: [...state.stack, { page, params }] });
};
// Replace the current screen (used when a screen has done its job, e.g. the set-up form after it finishes).
export const replaceStudy = (page: string, params: StudyParams = {}): void => {
  if (!state.open) return openStudy(page, params);
  set({ open: true, stack: [...state.stack.slice(0, -1), { page, params }] });
};
export const backStudy = (): void => {
  if (state.stack.length > 1) set({ open: true, stack: state.stack.slice(0, -1) });
  else if (state.stack[0] && state.stack[0].page !== 'home') set({ open: true, stack: [{ page: 'home', params: {} }] });
  else closeStudy();
};

export function useStudyNav(): NavState {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => state, () => state);
}
export const currentEntry = (s: NavState): StudyEntry => s.stack[s.stack.length - 1] || { page: 'home', params: {} };
