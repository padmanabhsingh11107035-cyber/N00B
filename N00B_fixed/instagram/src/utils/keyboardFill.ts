// The keyboard of an iPhone is see-through glass: whatever the page paints in the part of the screen it covers shines through it. A screen that is only as tall as the visible part of the
// page (everything above the keyboard) leaves that part to the page behind it, so a post or a reel showed through the keyboard behind the typing bar of the help desk (and would behind
// any other page). This fills the part under the keyboard, on every page, with the colour of the screen right above it: one solid bar, laid over the page, as tall as the keyboard.
// It does nothing while there is no keyboard (and never on a computer, or where the keyboard shrinks the page itself, like most Androids).

export interface Rgba { r: number; g: number; b: number; a: number }

/** "rgb(10, 10, 10)", "rgba(0, 0, 0, 0.5)", "rgb(0 0 0 / 50%)" -> numbers (null for anything else, e.g. "transparent" or a named colour) */
export function parseColor(css: string): Rgba | null {
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec((css || '').trim());
  if (!m) return null;
  const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: Number.isFinite(a) ? a : 1 };
}

/** The colour that results when `layers` (the top one first, as met walking up from an element) lie over `base`: a dim layer over a page is a darker page. */
export function flatten(layers: Rgba[], base: Rgba): string {
  let c = { r: base.r, g: base.g, b: base.b };
  for (let i = layers.length - 1; i >= 0; i--) {
    const L = layers[i];
    c = { r: L.r * L.a + c.r * (1 - L.a), g: L.g * L.a + c.g * (1 - L.a), b: L.b * L.a + c.b * (1 - L.a) };
  }
  return `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
}

/**
 * How much of the bottom of the page the keyboard covers (0 for the few pixels of an address bar). Normally the page is taller than the visible part by the height of the keyboard.
 * If a typing box has the focus and the page was made as short as the visible part anyway (a browser that resizes the page for the keyboard), the height of the screen is used instead.
 */
export function keyboardHeight(page: number, offsetTop: number, visible: number, screenHeight?: number, editing = false): number {
  const gap = Math.max(0, page - (offsetTop + visible));
  if (gap >= 120) return gap;
  if (editing && screenHeight) {
    const viaScreen = Math.min(Math.max(0, screenHeight - (offsetTop + visible)), 460);   // a keyboard is never taller than that
    if (viaScreen >= 120) return viaScreen;
  }
  return 0;
}

const isEditing = (): boolean => {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

interface ViewportLike { offsetTop: number; height: number; addEventListener: (type: string, fn: () => void) => void }

/** The colour of what is painted at (x, y): the element there and its parents, down to the first solid background. */
function colourAt(x: number, y: number): string {
  const base = parseColor(getComputedStyle(document.body).backgroundColor) || parseColor(getComputedStyle(document.documentElement).backgroundColor) || { r: 10, g: 10, b: 10, a: 1 };
  const layers: Rgba[] = [];
  for (let el = document.elementFromPoint(x, y) as HTMLElement | null; el; el = el.parentElement) {
    const c = parseColor(getComputedStyle(el).backgroundColor);
    if (!c || c.a <= 0.01) continue;
    layers.push(c);
    if (c.a >= 0.97) break;
  }
  return flatten(layers, { ...base, a: 1 });
}

/** Starts watching the keyboard (once). `viewport` is only given by the tests. */
export function installKeyboardFill(viewport?: ViewportLike): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const vv = viewport ?? window.visualViewport;
  if (!vv) return;
  if (!viewport && !('ontouchstart' in window) && !(navigator.maxTouchPoints > 0)) return;   // a computer: no glass keyboard
  const bar = document.createElement('div');
  bar.setAttribute('aria-hidden', 'true');
  bar.dataset.keyboardFill = '';
  bar.style.cssText = 'position:fixed;left:0;right:0;display:none;pointer-events:none;z-index:2147482000;background:#0a0a0a;transform:translateZ(0);-webkit-transform:translateZ(0)';
  document.body.appendChild(bar);

  const update = () => {
    const top = Math.round(vv.offsetTop), visible = Math.round(vv.height);
    const kb = keyboardHeight(window.innerHeight, top, visible, window.screen ? window.screen.height : undefined, isEditing());
    if (!kb) { bar.style.display = 'none'; return; }
    const y = top + visible;
    bar.style.top = `${y}px`;
    bar.style.height = `${kb}px`;
    bar.style.display = 'block';
    try { bar.style.background = colourAt(2, Math.max(1, y - 3)); } catch { /* keeps the colour it had */ }
  };
  // the keyboard slides in over a few hundred milliseconds and the screen above it moves with it: look again as it settles
  let later = 0;
  const soon = () => { update(); window.clearTimeout(later); later = window.setTimeout(update, 150); window.setTimeout(update, 450); };
  vv.addEventListener('resize', soon);
  vv.addEventListener('scroll', soon);
  document.addEventListener('focusin', soon);
  document.addEventListener('focusout', soon);
  window.setInterval(() => { if (bar.style.display !== 'none' || isEditing()) update(); }, 400);
  update();
}
