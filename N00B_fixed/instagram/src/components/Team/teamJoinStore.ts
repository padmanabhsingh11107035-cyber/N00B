import { useSyncExternalStore } from 'react';

// Is the "Join the NOOB team page" form open? Opened by the shared link (?team=join, once the person is signed in); drawn once, by TeamJoinHost (App.tsx).
let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const openTeamJoin = (): void => { open = true; emit(); };
export const closeTeamJoin = (): void => { open = false; emit(); };
export function useTeamJoinOpen(): boolean {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => open, () => open);
}

// The link may be opened by someone who is not signed in yet (or whose sign-in leaves the page and comes back, e.g. "Continue with Google"):
// the wish is remembered for a day and served once there is an account.
const KEY = 'noob.teamJoin';
const DAY_MS = 24 * 60 * 60 * 1000;
export const rememberTeamJoin = (now = Date.now()): void => { try { localStorage.setItem(KEY, String(now)); } catch { /* private mode: the link still works while the tab stays open */ } };
export const forgetTeamJoin = (): void => { try { localStorage.removeItem(KEY); } catch { /* nothing to forget */ } };
export const hasRememberedTeamJoin = (now = Date.now()): boolean => {
  try {
    const at = Number(localStorage.getItem(KEY));
    return Number.isFinite(at) && at > 0 && now - at < DAY_MS;
  } catch { return false; }
};
