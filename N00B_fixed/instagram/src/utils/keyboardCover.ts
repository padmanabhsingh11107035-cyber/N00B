// When the keyboard opens on a phone, the screen pans to the box you are typing in, and a full-screen page that has a solid colour can leave a strip of the PAGE UNDER IT showing (the feed,
// the photos) above the keyboard. The same happens under a sheet that sits on a dimmed page (comments, notes). This puts a stop to that for every full-screen page and every dimmed-page sheet at
// once: while a box inside a nearly full-screen layer that has any colour of its own has the keyboard, the page underneath is hidden (it keeps its place, nothing moves), and comes back when the
// keyboard goes away. A layer with no colour at all (a plain wrapper) is left alone.
export const COVER_ATTR = 'data-cover-app';
export const LAYER_ATTR = 'data-cover-layer';

/** The opacity (0 to 1) written in a CSS colour, as the browser reports it: "rgb(9, 9, 11)" is 1, "rgba(0, 0, 0, 0.75)" is 0.75, "rgb(0 0 0 / 50%)" is 0.5, "transparent" is 0. */
export function alphaOf(color: string): number {
  const c = (color || '').trim().toLowerCase();
  if (!c || c === 'transparent') return 0;
  const slash = c.match(/\/\s*([\d.]+)(%?)\s*\)/);
  if (slash) return Math.max(0, Math.min(1, Number(slash[1]) / (slash[2] ? 100 : 1)));
  const comma = c.match(/^rgba?\(([^)]*)\)$/);
  if (comma) { const p = comma[1].split(','); if (p.length === 4) return Math.max(0, Math.min(1, Number(p[3]))); }
  return 1;
}

/** Is this layer big enough, and does it have a colour of its own (solid, or a dimming one), so that hiding the page under it changes nothing but the strip that showed? */
export function coversPage(box: { width: number; height: number }, view: { width: number; height: number }, color: string, hasImage: boolean): boolean {
  const big = box.width >= view.width * 0.9 && box.height >= view.height * 0.9;
  return big && (alphaOf(color) > 0 || hasImage);
}

function layerOf(el: Element | null): HTMLElement | null {
  let node: Element | null = el;
  while (node && node !== document.body) {
    const st = getComputedStyle(node);
    if (st.position === 'fixed') {
      const r = node.getBoundingClientRect();
      if (coversPage({ width: r.width, height: r.height }, { width: window.innerWidth, height: window.innerHeight }, st.backgroundColor, st.backgroundImage !== 'none')) return node as HTMLElement;
    }
    node = node.parentElement;
  }
  return null;
}

const isTyping = (el: Element | null): boolean => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable);

let installed = false;
export function installKeyboardCover(): () => void {
  if (installed || typeof document === 'undefined') return () => undefined;
  installed = true;
  const root = document.documentElement;
  let marked: HTMLElement | null = null;
  const clear = () => { root.removeAttribute(COVER_ATTR); marked?.removeAttribute(LAYER_ATTR); marked = null; };
  const update = () => {
    try {
      const a = document.activeElement;
      if (!isTyping(a)) { clear(); return; }
      const layer = layerOf(a);
      if (!layer) { clear(); return; }
      if (marked && marked !== layer) marked.removeAttribute(LAYER_ATTR);
      layer.setAttribute(LAYER_ATTR, '1'); marked = layer;
      root.setAttribute(COVER_ATTR, '1');
    } catch { clear(); }
  };
  const later = () => window.setTimeout(update, 60);
  document.addEventListener('focusin', update, true);
  document.addEventListener('focusout', later, true);
  window.visualViewport?.addEventListener('resize', update);
  return () => { document.removeEventListener('focusin', update, true); document.removeEventListener('focusout', later, true); window.visualViewport?.removeEventListener('resize', update); clear(); installed = false; };
}
