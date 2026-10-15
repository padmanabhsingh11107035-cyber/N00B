import { useEffect, useSyncExternalStore } from 'react';

// Which full-screen pages are open right now (the pages of the three-line menu: Anonymous Messages, Our Team, Daily NOOB, Rooms, the shop, NOOB AI, Support...). They are
// separate pages: while one is open the Home page behind it is hidden, not just covered, so nothing of it can show through (not when the keyboard pushes the screen up, not
// when a finger drags past the end of the page), and the app knows that this is not the place to refresh. This keeps the count; the pages themselves report in with useFullPage.

let open = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

/** Says "a full-screen page is open" for as long as `active` is true (and the component is on screen). */
export function useFullPage(active: boolean = true): void {
  useEffect(() => {
    if (!active) return;
    open += 1;
    emit();
    return () => { open = Math.max(0, open - 1); emit(); };
  }, [active]);
}

/** Is any full-screen page open? */
export function useAnyFullPage(): boolean {
  return useSyncExternalStore(subscribe, () => open > 0, () => false);
}
