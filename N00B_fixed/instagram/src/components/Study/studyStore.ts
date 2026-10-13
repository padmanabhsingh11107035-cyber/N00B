import { useSyncExternalStore } from 'react';

// NOOB STUDY's own small navigation: which screen is open, and the screens behind it (so Back goes where the student came from).
// Opened from the Home menu; drawn once, by StudyHost (App.tsx). The student can always leave to the main NOOB app.

export type StudyParams = Record<string, string | number | boolean | null | undefined>;
export interface StudyEntry { page: string; params: StudyParams }
interface NavState { open: boolean; stack: StudyEntry[] }

// Whether NOOB STUDY is open, coming soon or off is decided by the administrator (in the admin panel), not here.

// On coaching.nooob.xyz (or any address opened with ?coaching=1) NOOB STUDY is the whole page: closing it takes the student to the NOOB website instead of to the
// NOOB app that is not shown there.
export const isCoachingHost = (): boolean => {
  try { return typeof location !== 'undefined' && (/^coaching\./i.test(location.hostname) || new URLSearchParams(location.search).get('coaching') === '1'); } catch { return false; }
};

const TOP_LEVEL = new Set(['home', 'tutor', 'plan', 'subjects', 'more']);
let state: NavState = { open: false, stack: [] };
const listeners = new Set<() => void>();
const set = (next: NavState) => { state = next; listeners.forEach((l) => l()); };

export const isTopLevel = (page: string): boolean => TOP_LEVEL.has(page);

export const openStudy = (page = 'home', params: StudyParams = {}): void => set({ open: true, stack: [{ page, params }] });
export const closeStudy = (): void => set({ open: false, stack: [] });
// "Back to NOOB": the NOOB app when studying inside it, the NOOB website when studying on the coaching address
export const leaveStudy = (): void => {
  if (isCoachingHost()) { try { window.location.href = 'https://nooob.xyz'; } catch { /* the student can still use the browser's own back button */ } return; }
  closeStudy();
};
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
