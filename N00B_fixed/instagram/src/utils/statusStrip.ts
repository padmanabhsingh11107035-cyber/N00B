// The strip at the very top of a phone screen (behind the clock, the notch or the Dynamic Island) is painted in the colour of the page that is open, so the app looks like it
// reaches the top of the screen. The colour is read from what is really drawn at the top edge (the header of the open page, or the page itself), and written to the browser's
// theme colour and to the page's own background (which is what shows behind a translucent status bar). It is read again whenever the page changes, scrolls or is resized.
// (The Messages page paints its own strip while it is open, see ChatView.)
const edgeMode = (): boolean => typeof document !== 'undefined' && document.documentElement.classList.contains('phone-edge');   // phones with the page under the clock: nothing is painted behind it
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
  return pageColour();
}

// A phone can miss a change of the page's background colour (iOS reads the colour of the strip from what sits at the top edge of the screen, and only looks again after some
// changes), so the colour is ALSO drawn by a thin fixed bar at the very top edge of the page (2 px, no taps), and is written again every time the page moves or changes.
// A page that has its own colour (the Messages list: green while the header is in view) sets it with setStripColour; with null the colour is read from the screen again.
let override: string | null = null;
let overrideOwner: (() => Element | null) | null = null;
const shown = (el: Element | null): boolean => !!el && (el as HTMLElement).getClientRects().length > 0;
const activeOverride = (): string | null => (override && (!overrideOwner || shown(overrideOwner())) ? override : null);
let edge: HTMLElement | null = null;

// A colour that a page puts on the strip by itself, with no looking at the screen and no owner check: the page that sets it also clears it (the Messages list while it is on screen).
let forced: string | null = null;
/** Messages calls this with the colour while its list is on screen, and with null when it is not. */
export function forceStripColour(colour: string | null): void {
  if (typeof window === 'undefined' || !window.matchMedia?.('(pointer: coarse)').matches) return;   // only a phone / tablet has a strip behind a clock: on a computer this must never paint the page
  if (forced === colour) { if (colour) applyColour(colour); return; }
  forced = colour;
  if (colour) { pending = ''; applyColour(colour, 'full'); window.setTimeout(() => { if (forced === colour) applyColour(colour); }, 120); }
  else { last = ''; applyColour(pageColour(), 'full'); queue(); }
}

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

// A phone looks at the colour behind the clock when the page CHANGES (and only then), so the colour must already be right in the very same moment as the change, and a few
// harmless nudges follow it (a fresh theme-colour element, the thin top bar 1 px taller or shorter) for a phone that looked a little too early.
let poked = '';
function poke(colour: string, viewport: boolean): void {
  poked = colour;
  [0, 90, 260, 650, 1400, 2600].forEach((ms) => window.setTimeout(() => {
    if (poked !== colour || last !== colour) return;
    try {
      const old = document.querySelector('meta[name="theme-color"]');
      if (old && old.getAttribute('content') === colour) old.replaceWith(old.cloneNode());
      // a brand-new thin bar at the top edge (the phone samples the colour from what sits there): the old one is replaced by a copy, then made 1 px taller or shorter
      let bar = edgeBar();
      if (bar && bar.parentNode) { const fresh = bar.cloneNode(false) as HTMLElement; bar.replaceWith(fresh); edge = fresh; bar = fresh; }
      if (bar) bar.style.height = bar.style.height === '3px' ? '2px' : '3px';
      // (the viewport tag is never changed any more: changing it could leave the phone's strip blank, pure black, until the next page change)
      void viewport;
    } catch { /* a nudge is never a reason to fail */ }
  }, ms));
}

/** The colour of an ordinary page of the app (the theme's page colour). */
const pageColour = (): string => (document.documentElement.getAttribute('data-theme') === 'light' ? '#ffffff' : '#0a0a0a');

// `nudge`: a page with a colour of its own (Messages) has just come or gone, so the phone is asked to look at the top of the screen again. NEVER for a colour that was only read from the
// screen (that can change while a page scrolls, and changing the viewport tag at that moment made the whole page flash white for a moment, most on Explore).
function applyColour(colour: string, nudge: false | 'light' | 'full' = false): void {
  if (edgeMode()) {
    // phones with the page under the clock: no bar and no page colour behind the clock, only the phone's own tint of that area (the theme colour) follows the page, so the fade the phone puts there matches
    document.getElementById('noob-top-edge')?.remove(); edge = null;
    let m = document.querySelector('meta[name="theme-color"]');
    if (!m) { m = document.createElement('meta'); m.setAttribute('name', 'theme-color'); document.head.appendChild(m); }
    if (m.getAttribute('content') !== colour) m.setAttribute('content', colour);
    last = colour;
    return;
  }
  const root = document.documentElement;
  root.style.setProperty('background-color', colour, 'important');
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) { meta = document.createElement('meta'); meta.setAttribute('name', 'theme-color'); document.head.appendChild(meta); }
  if (meta.getAttribute('content') !== colour) meta.setAttribute('content', colour);
  const bar = edgeBar();
  if (bar && bar.style.backgroundColor !== colour) bar.style.backgroundColor = colour;
  const changed = last !== colour;
  last = colour;
  if (changed && nudge) poke(colour, nudge === 'full');
}

// A colour read from the screen that is NOT the page's own colour has to be seen twice in a row (about 160 ms apart) before it is used. A page that is scrolled past its end (the
// rubber-band bounce of a phone), or an element that flashes by for a few frames, used to turn the whole page background white for a moment in the dark theme (and the strip behind
// the clock with it). During a bounce nothing is read at all; in the dark theme a nearly white reading is never used; the page's own colour is always put at once.
let pending = '';
const lightness = (c: string): number => { const n = parseInt(c.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
function bouncing(): boolean {
  const y = window.scrollY, doc = document.documentElement;
  return y < 0 || y + window.innerHeight > doc.scrollHeight + 1;
}

function paint(): void {
  queued = false;
  if (document.hidden) return;
  if (forced) { pending = ''; applyColour(forced); return; }
  const own = activeOverride();
  if (own) { pending = ''; applyColour(own, 'light'); return; }
  if (bouncing()) return;
  const colour = colourAtTop();
  if (!colour) return;
  if (colour === pageColour() || colour === last) { pending = ''; applyColour(colour); return; }
  if (document.documentElement.getAttribute('data-theme') !== 'light' && lightness(colour) > 0.75) { pending = ''; return; }
  if (pending === colour) { pending = ''; applyColour(colour); return; }
  pending = colour;
  window.setTimeout(queue, 160);   // look once more: only a colour that stays is used
}

const queue = () => { if (!queued) { queued = true; window.setTimeout(paint, 120); } };

// The colour is also put right at once when the page changes (this runs right after the page's change and before the phone draws it), at most every 60 ms
let lastNow = 0;
const now = () => { const t = Date.now(); if (t - lastNow < 60) return; lastNow = t; paint(); };

/** A page with a colour of its own (null: the page is an ordinary one again: its colour at once, then read from the screen). Applied at once and again a moment later. */
export function setStripColour(colour: string | null, owner?: () => Element | null, nudge = false): void {
  if (typeof window === 'undefined' || !window.matchMedia?.('(pointer: coarse)').matches) return;   // on a computer the page has no strip behind a clock
  const transition = (colour === null) !== (override === null);   // a page with its own colour comes or goes
  override = colour;
  overrideOwner = colour ? owner || null : null;
  void nudge;
  const mode = transition ? 'full' : 'light';
  if (colour && activeOverride()) { applyColour(colour, mode); window.setTimeout(() => { if (override === colour && activeOverride()) applyColour(colour, 'light'); }, 90); }
  else if (!colour) applyColour(forced || pageColour(), forced ? false : mode);
  queue();
}

/** Paint the strip again from what is on screen now. */
export function repaintStrip(): void { last = ''; queue(); }

/** A few lines about the strip, for the hidden check (tap the word Messages five times): what the page set, and what is really at the top edge. */
export function stripDebugText(): string {
  try {
    const root = document.documentElement;
    const bar = document.getElementById('noob-top-edge');
    const meta = document.querySelector('meta[name="theme-color"]');
    const vp = document.querySelector('meta[name="viewport"]');
    const top = document.elementFromPoint(Math.floor(window.innerWidth / 2), 3);
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;height:env(safe-area-inset-top,0px);visibility:hidden';
    document.body.appendChild(probe);
    const env = probe.getBoundingClientRect().height;
    probe.remove();
    return [
      `html bg: ${getComputedStyle(root).backgroundColor}`,
      `forced: ${forced || '-'}  last: ${last || '-'}  override: ${override || '-'}`,
      `top edge bar: ${bar ? getComputedStyle(bar).backgroundColor + ' h=' + bar.getBoundingClientRect().height : 'none'}`,
      `meta theme-color: ${meta?.getAttribute('content') || '-'}`,
      `viewport: ${vp?.getAttribute('content') || '-'}`,
      `safe-area top: ${env}px  standalone: ${(navigator as unknown as { standalone?: boolean }).standalone === true}`,
      `at y=3: ${top ? top.tagName.toLowerCase() + '.' + String(top.className).slice(0, 40) : '-'}`,
      `scroll: ${window.scrollY}  inner: ${window.innerWidth}x${window.innerHeight}`,
      `ua: ${navigator.userAgent.slice(0, 80)}`,
    ].join('\n');
  } catch (e) { return String(e); }
}

let started = false;
/** Call once at start-up. Only does anything on a touch screen (a phone or tablet): on a computer the browser's own bar is not part of the page. */
export function initStatusStrip(): void {
  if (started || typeof window === 'undefined' || !window.matchMedia?.('(pointer: coarse)').matches) return;
  started = true;
  new MutationObserver((records) => {
    if (records.every((r) => r.target === edge)) return;   // the top bar itself changing is not a page change
    now(); queue();
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  window.setInterval(() => { if (!document.hidden) queue(); }, 2500);   // a slow check as well: whatever drifted is put right
  window.addEventListener('scroll', queue, { capture: true, passive: true });
  window.addEventListener('resize', queue);
  window.addEventListener('popstate', queue);
  document.addEventListener('visibilitychange', queue);
  queue();
}
