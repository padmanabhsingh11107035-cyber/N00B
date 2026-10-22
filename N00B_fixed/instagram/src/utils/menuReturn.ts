// "Back to the three-line menu": a page that was opened from the menu on Home (Daily NOOB, Rooms, Shop, a Fun page ...) drops the person back in the menu, at the very button
// they pressed, when it is closed, instead of on the Home feed. Only the menu works this way. The id of the pressed button is kept here (and for the visit, in sessionStorage,
// so a page that comes back after a refresh also returns to the menu); the menu draws each button with data-menu-entry="<id>".
const KEY = 'noob.menuEntry';
let entry: string | null = null;

/** Remember which button of the menu was pressed (null = forget it). */
export function markMenuEntry(id: string | null): void {
  entry = id;
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (id) sessionStorage.setItem(KEY, id); else sessionStorage.removeItem(KEY);
  } catch { /* storage blocked: it lasts until the page is closed */ }
}

/** The button that was pressed last, if its page has not been closed yet. */
export function currentMenuEntry(): string | null {
  if (entry) return entry;
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(KEY); } catch { return null; }
}

/** Puts the button in the middle of the menu's list and makes it flash once, so the eye lands on it. The menu may not be drawn yet: it tries for about a third of a second. */
export function scrollToMenuEntry(id: string, tries = 20): void {
  if (typeof document === 'undefined') return;
  const el = document.querySelector<HTMLElement>(`[data-menu-entry="${id.replace(/"/g, '')}"]`);
  if (!el) {
    if (tries > 0 && typeof requestAnimationFrame === 'function') requestAnimationFrame(() => scrollToMenuEntry(id, tries - 1));
    return;
  }
  try { el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior }); } catch { /* the menu is short enough to show everything */ }
  el.classList.remove('menu-entry-flash');
  void el.offsetWidth;   // lets the flash start again if it was already running
  el.classList.add('menu-entry-flash');
  window.setTimeout(() => el.classList.remove('menu-entry-flash'), 1600);
}
