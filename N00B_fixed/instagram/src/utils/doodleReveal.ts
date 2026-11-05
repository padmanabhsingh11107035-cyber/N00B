// The doodle pattern is drawn on the page itself, BEHIND everything. Most screens paint their own solid black (or white) over the page, which would hide it,
// so this finds those big plain-coloured full-width layers (looking at a few points of the screen) and lets the page show through them.
// Cards, sheets, dialogs (rounded, fixed, or on top of other things) and anything with a picture or video as its background are never touched.

const SEE = 'data-doodle-see';
const POINTS: Array<[number, number]> = [[0.04, 0.5], [0.96, 0.5], [0.5, 0.2], [0.5, 0.8], [0.04, 0.12], [0.96, 0.85]];

function plain(c: string): boolean {
  const m = /^rgba?\(([^)]+)\)$/.exec(c);
  if (!m) return false;
  const p = m[1].split(',').map((x) => parseFloat(x));
  if (p.length === 4 && p[3] < 0.98) return false;   // already see-through
  const [r, g, b] = p;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max - min <= 10 && (max <= 24 || min >= 245);   // near black or near white: the app's page colours
}

export function revealDoodle(): void {
  if (typeof document === 'undefined') return;
  if (document.documentElement.getAttribute('data-doodle') === 'off') return;
  const w = window.innerWidth, h = window.innerHeight;
  const seen = new Set<Element>();
  for (const [fx, fy] of POINTS) {
    for (const el of document.elementsFromPoint(Math.round(fx * w), Math.round(fy * h))) {
      if (el === document.body || el === document.documentElement || seen.has(el)) continue;
      seen.add(el);
      if (el.hasAttribute(SEE)) continue;
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.position === 'sticky' || el.closest('[class*="fixed"], [role="dialog"], [aria-modal="true"]')) { if (el.hasAttribute(SEE)) el.removeAttribute(SEE); continue; }
      if (cs.backgroundImage !== 'none' || !plain(cs.backgroundColor)) continue;
      if (parseFloat(cs.borderTopLeftRadius) > 0 || cs.boxShadow !== 'none') continue;
      if (el.matches('video, canvas, img, picture, svg, input, textarea, button, [role="dialog"], [aria-modal="true"]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < w * 0.9 || r.height < h * 0.3) continue;
      el.setAttribute(SEE, '');
    }
  }
}

let started = false;
export function startDoodleReveal(): void {
  if (started || typeof window === 'undefined' || typeof MutationObserver === 'undefined') return;
  started = true;
  let timer = 0;
  // a new full-page layer is made see-through before it is first drawn (the next frame, at most every 80 ms), and checked again after a moment: a layer that was drawn
  // solid for a quarter of a second first made the background flash
  let raf = 0, lastRun = 0;
  const queue = () => {
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; const t = Date.now(); if (t - lastRun < 80) return; lastRun = t; revealDoodle(); });
    if (timer) return;
    timer = window.setTimeout(() => { timer = 0; requestAnimationFrame(revealDoodle); }, 250);
  };
  const begin = () => { new MutationObserver(queue).observe(document.body, { childList: true, subtree: true }); window.addEventListener('resize', queue); queue(); };
  if (document.body) begin(); else window.addEventListener('DOMContentLoaded', begin, { once: true });
}
