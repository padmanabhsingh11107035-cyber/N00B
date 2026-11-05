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
  while (el && el !== document.documentElement) {
    const c = toRgba(getComputedStyle(el).backgroundColor);
    if (c && c[3] >= 0.95) return hex(c[0], c[1], c[2]);
    el = el.parentElement;
  }
  // nothing solid at the top: the page's own colour (never the <html> colour, which is the one this file writes)
  return document.documentElement.getAttribute('data-theme') === 'light' ? '#ffffff' : '#0a0a0a';
}

// A phone can miss a change of the page's background colour (iOS reads the colour of the strip from what sits at the top edge of the screen, and only looks again after some
// changes), so the colour is ALSO drawn by a thin fixed bar at the very top edge of the page (2 px, no taps), and is written again every time the page moves or changes.
// A page that has its own colour (the Messages list: green while the header is in view) sets it with setStripColour; with null the colour is read from the screen again.
let override: string | null = null;
let overrideOwner: (() => Element | null) | null = null;
const shown = (el: Element | null): boolean => !!el && (el as HTMLElement).getClientRects().length > 0;
const activeOverride = (): string | null => (override && (!overrideOwner || shown(overrideOwner())) ? override : null);
let edge: HTMLElement | null = null;

function edgeBar(): HTMLElement | null {
  if (typeof document === 'undefined' || !document.body) return null;
  if (edge && edge.isConnected) return edge;
  edge = document.createElement('div');
  edge.id = 'noob-top-edge';
  edge.setAttribute('aria-hidden', 'true');
  edge.style.cssText = 'position:fixed;top:0;left:0;right:0;height:2px;z-index:2147483000;pointer-events:none;background:transparent;contain:strict;';
  document.body.appendChild(edge);
  return edge;
}

// A phone only looks at the colour behind the clock again after certain events, so after every CHANGE of colour the page is nudged in the ways that make it look again:
// the theme-colour element is replaced by a fresh one, and the root element is lifted onto its own layer for a moment (no visible change).
let kicked = '';
function kick(colour: string): void {
  if (kicked === colour) return;
  kicked = colour;
  [0, 150].forEach((ms) => window.setTimeout(() => {
    if (kicked !== colour) return;
    try {
      const old = document.querySelector('meta[name="theme-color"]');
      if (old && old.getAttribute('content') === colour) old.replaceWith(old.cloneNode());
    } catch { /* a nudge is never a reason to fail */ }
  }, ms));
}

function applyColour(colour: string): void {
  const root = document.documentElement;
  root.style.setProperty('background-color', colour, 'important');
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) { meta = document.createElement('meta'); meta.setAttribute('name', 'theme-color'); document.head.appendChild(meta); }
  if (meta.getAttribute('content') !== colour) meta.setAttribute('content', colour);
  const bar = edgeBar();
  if (bar && bar.style.backgroundColor !== colour) bar.style.backgroundColor = colour;
  last = colour;
}

function paint(): void {
  queued = false;
  if (document.hidden) return;
  const colour = activeOverride() || colourAtTop();
  if (!colour) return;
  applyColour(colour);
}

const queue = () => { if (!queued) { queued = true; window.setTimeout(paint, 120); } };

/** A page with a colour of its own (null: read it from the screen again). Applied at once and again a moment later. */
export function setStripColour(colour: string | null, owner?: () => Element | null, nudge = false): void {
  if (typeof window === 'undefined' || !window.matchMedia?.('(pointer: coarse)').matches) return;   // on a computer the page has no strip behind a clock
  override = colour;
  overrideOwner = colour ? owner || null : null;
  if (nudge) kicked = '';
  if (colour && activeOverride()) { applyColour(colour); if (nudge) kick(colour); window.setTimeout(() => { if (override === colour && activeOverride()) applyColour(colour); }, 90); }
  queue();
}

/** Paint the strip again from what is on screen now. */
export function repaintStrip(): void { last = ''; kicked = ''; queue(); }

let started = false;
/** Call once at start-up. Only does anything on a touch screen (a phone or tablet): on a computer the browser's own bar is not part of the page. */
export function initStatusStrip(): void {
  if (started || typeof window === 'undefined' || !window.matchMedia?.('(pointer: coarse)').matches) return;
  started = true;
  new MutationObserver(queue).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  window.setInterval(() => { if (!document.hidden) queue(); }, 2500);   // a slow check as well: whatever drifted is put right
  window.addEventListener('scroll', queue, { capture: true, passive: true });
  window.addEventListener('resize', queue);
  window.addEventListener('popstate', queue);
  document.addEventListener('visibilitychange', queue);
  queue();
}
