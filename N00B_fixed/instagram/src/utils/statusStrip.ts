// The strip at the very top of a phone screen (behind the clock, the notch or the Dynamic Island) is painted in the colour of the page that is open, so the app looks like it
// reaches the top of the screen. The colour is read from what is really drawn at the top edge (the header of the open page, or the page itself), and written to the browser's
// theme colour and to the page's own background (which is what shows behind a translucent status bar). It is read again whenever the page changes, scrolls or is resized.
// (The Messages page paints its own strip while it is open, see ChatView.)
let last = '';
let queued = false;

const toRgba = (css: string): [number, number, number, number] | null => {
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  if (p.length < 3 || p.some((n) => Number.isNaN(n))) return null;
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
};
const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('');

function colourAtTop(): string | null {
  let el: Element | null = document.elementFromPoint(Math.floor(window.innerWidth / 2), 3);
  while (el) {
    const c = toRgba(getComputedStyle(el).backgroundColor);
    if (c && c[3] >= 0.95) return hex(c[0], c[1], c[2]);
    el = el.parentElement;
  }
  return null;
}

function paint(): void {
  queued = false;
  const root = document.documentElement;
  if (root.classList.contains('msg-open') || document.hidden) return;
  const colour = colourAtTop();
  if (!colour || colour === last) return;
  last = colour;
  root.style.backgroundColor = colour;
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) { meta = document.createElement('meta'); meta.setAttribute('name', 'theme-color'); document.head.appendChild(meta); }
  meta.setAttribute('content', colour);
}

const queue = () => { if (!queued) { queued = true; window.setTimeout(() => requestAnimationFrame(paint), 120); } };

/** Paint the strip again from what is on screen now (after a page that painted its own strip has closed). */
export function repaintStrip(): void { last = ''; queue(); }

let started = false;
/** Call once at start-up. Only does anything on a touch screen (a phone or tablet): on a computer the browser's own bar is not part of the page. */
export function initStatusStrip(): void {
  if (started || typeof window === 'undefined' || !window.matchMedia?.('(pointer: coarse)').matches) return;
  started = true;
  new MutationObserver(queue).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  window.addEventListener('scroll', queue, { capture: true, passive: true });
  window.addEventListener('resize', queue);
  window.addEventListener('popstate', queue);
  document.addEventListener('visibilitychange', queue);
  queue();
}
