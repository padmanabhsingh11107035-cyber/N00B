// The address bar follows the page (like chatgpt.com/c/<id>): opening Explore shows /explore, the browser's Back and Forward move between the pages that were visited, and a page can be
// refreshed or its address shared. Pages that are opened ON TOP of a page (a profile, the Settings, a Fun page) keep their own history entries (utils/pageLayers.tsx, SettingsHub); this only
// looks after the bottom-bar pages. Rules kept apart from the screen so they can be tested.
import type { NavTab } from '../components/Navigation/FloatingNavBar';
import { TAB_PATHS, cleanPath, tabFromPath } from './routes.ts';

interface HistoryLike { state: unknown; pushState(state: unknown, title: string, url?: string): void; replaceState(state: unknown, title: string, url?: string): void }
interface LocationLike { pathname: string; search: string; hash: string }

/** The page a history entry stands for; null for entries that belong to something opened on top of a page (a profile, the Settings, sign-up). The address is the truth. */
export function tabFromHistoryEntry(state: unknown, pathname: string): NavTab | null {
  const s = state as { noobLayer?: number; noobSettings?: number; noobAuth?: string } | null;
  if (s && (s.noobLayer || s.noobSettings || s.noobAuth)) return null;
  return tabFromPath(pathname);
}

/**
 * Makes the address bar show `tab`: the first time (the page was just opened) the current entry is renamed, afterwards every move to another page adds an entry,
 * so Back returns to the page before. Returns what it did.
 */
export function showTabAddress(tab: NavTab, first: boolean, loc: LocationLike = window.location, hist: HistoryLike = window.history): 'pushed' | 'replaced' | 'unchanged' {
  const want = TAB_PATHS[tab];
  const same = cleanPath(loc.pathname) === want;
  const prev = (hist.state && typeof hist.state === 'object' ? hist.state : {}) as Record<string, unknown>;
  if (same) {
    if (prev.noobTab !== tab) { hist.replaceState({ ...prev, noobTab: tab }, '', loc.pathname + loc.search + loc.hash); return 'replaced'; }
    return 'unchanged';
  }
  if (first) { hist.replaceState({ ...prev, noobTab: tab }, '', want + loc.search + loc.hash); return 'replaced'; }
  hist.pushState({ noobTab: tab }, '', want);
  return 'pushed';
}
