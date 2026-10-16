// A page or window that covers the whole screen (Settings and activity, the pages of the three-line menu, a picture viewer, any pop-up) is a page of its own: the page
// behind it must not move. Without this, on a phone, pulling the front page down at its top and then scrolling made the page BEHIND it scroll (the finger's movement is passed
// on to whatever is underneath once the front page cannot move any further).
//
// This watches for such a covering layer (a fixed element that fills the screen and takes touches) and, for as long as one is there, switches off the scrolling of the page
// behind it (html[data-overlay-open], see index.css). It works out the answer from what is on screen, not from a counter, so it can never be left "locked" by a page
// that closed in an unusual way, and it checks again whenever the screen changes, the phone is turned, or the app comes back to the front.

export const OVERLAY_ATTR = 'data-overlay-open';

/** Does this element cover (nearly) the whole screen, show, and take touches? */
export function coversScreen(rect: { width: number; height: number }, style: { display: string; visibility: string; pointerEvents: string; opacity: string }, viewport: { width: number; height: number }): boolean {
  if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none' || Number(style.opacity) === 0) return false;
  return rect.width >= viewport.width * 0.95 && rect.height >= viewport.height * 0.9;
}

function overlayIsOpen(): boolean {
  const nodes = document.querySelectorAll<HTMLElement>('.fixed.inset-0');
  if (nodes.length === 0) return false;
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  for (const el of Array.from(nodes)) {
    const style = window.getComputedStyle(el);
    if (style.position !== 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (coversScreen(r, { display: style.display, visibility: style.visibility, pointerEvents: style.pointerEvents, opacity: style.opacity }, viewport)) return true;
  }
  return false;
}

let installed = false;

/** Starts watching (once). Returns a function that stops. */
export function installOverlayScrollLock(): () => void {
  if (installed || typeof document === 'undefined') return () => undefined;
  installed = true;
  const root = document.documentElement;
  let queued = false;
  let lastRun = 0;
  const MIN_GAP_MS = 100;       // however busy the page is, this looks at most ten times a second
  const apply = () => {
    queued = false;
    lastRun = Date.now();
    let open = false;
    try { open = overlayIsOpen(); } catch { open = false; }
    if (open) { if (!root.hasAttribute(OVERLAY_ATTR)) root.setAttribute(OVERLAY_ATTR, '1'); }
    else if (root.hasAttribute(OVERLAY_ATTR)) root.removeAttribute(OVERLAY_ATTR);
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    const wait = Math.max(16, lastRun + MIN_GAP_MS - Date.now());
    setTimeout(apply, wait);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'data-tab-hidden'] });
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  window.addEventListener('popstate', schedule);
  document.addEventListener('visibilitychange', schedule);
  const safety = window.setInterval(schedule, 3000);   // a last guard: whatever was missed is put right within seconds
  schedule();
  return () => {
    installed = false;
    observer.disconnect();
    window.removeEventListener('resize', schedule);
    window.removeEventListener('orientationchange', schedule);
    window.removeEventListener('popstate', schedule);
    document.removeEventListener('visibilitychange', schedule);
    window.clearInterval(safety);
    root.removeAttribute(OVERLAY_ATTR);
  };
}
