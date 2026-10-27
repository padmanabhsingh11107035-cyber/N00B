// Every window that is really a PAGE (a tall card in the middle of the screen with the page still showing behind it, or a full page with no way back) becomes a page of its own:
//   * "card": a tall card over a dimmed page (a list, a form, a settings window). The page behind goes (a solid page colour), the card fills the screen. On a computer the card stays
//     a readable width in the middle.
//   * "page": a layer that already fills the screen. It keeps its look.
//   * both get "<" at the left of their top row in place of the "X" at the right (the same button, so it does exactly what the "X" did: it goes back to the page before).
// Small pop-ups (a question with two buttons), bottom sheets (comments, sharing), and screens made of a picture or video (camera, calls, viewers, games) are left as they are.
// Nothing in the pages' own code is touched: the layer is only marked (data-noob-page, data-noob-card, data-noob-close) and index.css does the rest. Pure rules first, for tests.

export interface Box { top: number; left: number; width: number; height: number }
export type FrameKind = 'page' | 'card' | 'skip';

export const PAGE_ATTR = 'data-noob-page';
export const CARD_ATTR = 'data-noob-card';
export const CLOSE_ATTR = 'data-noob-close';
export const ROW_ATTR = 'data-noob-row';
export const KEEP_ATTR = 'data-noob-keep';   // a layer that must stay exactly as it is

/** What is this layer? `card` is the biggest thing inside it. */
export function classifyOverlay(viewport: { width: number; height: number }, card: Box, opts: { hasMedia?: boolean; keep?: boolean } = {}): FrameKind {
  if (opts.keep || opts.hasMedia) return 'skip';
  if (viewport.width < 200 || viewport.height < 200) return 'skip';
  const full = card.width >= viewport.width * 0.97 && card.height >= viewport.height * 0.95;
  if (full) return 'page';
  const sheet = card.top > viewport.height * 0.2 && card.top + card.height >= viewport.height - 4;   // stuck to the bottom: a sheet
  if (sheet) return 'skip';
  const tall = card.height >= viewport.height * 0.6 && card.width >= Math.min(viewport.width * 0.6, 340);
  return tall ? 'card' : 'skip';
}

export interface Candidate { top: number; right: number; width: number; isX: boolean; isBack: boolean; parentFlex: boolean }
/** Does the top row already have a back arrow? Else which button is the "X" to turn into "<" (the right-most one near the top that belongs to a row that can be reordered). */
export function pickClose(cands: Candidate[], cardTop: number): { hasBack: boolean; index: number } {
  if (cands.some((c) => c.isBack && c.top - cardTop <= 110)) return { hasBack: true, index: -1 };
  let best = -1;
  cands.forEach((c, i) => {
    if (!c.isX || !c.parentFlex || c.top - cardTop > 110 || c.width > 64) return;
    if (best === -1 || c.right > cands[best].right) best = i;
  });
  return { hasBack: false, index: best };
}

// ------------------------------------------------------------------------------------------------------- the part that looks at the screen
const BACK_LABEL = /^(back|go back|previous)/i;
const CLOSE_LABEL = /close|dismiss/i;

function hasMediaInside(el: Element): boolean { return !!el.querySelector('canvas, video, iframe'); }

function biggestChild(overlay: HTMLElement): HTMLElement | null {
  let best: HTMLElement | null = null, area = 0;
  for (const c of Array.from(overlay.children) as HTMLElement[]) {
    const st = getComputedStyle(c);
    if (st.display === 'none' || st.visibility === 'hidden') continue;
    if ((st.position === 'absolute' || st.position === 'fixed') && !(c.textContent || '').trim() && !c.querySelector('button, input, img')) continue;   // a backdrop
    const r = c.getBoundingClientRect();
    if (r.width * r.height > area) { area = r.width * r.height; best = c; }
  }
  return best;
}

function candidatesIn(card: HTMLElement): { list: Candidate[]; els: HTMLElement[] } {
  const list: Candidate[] = [], els: HTMLElement[] = [];
  card.querySelectorAll<HTMLElement>('button, [role="button"], a').forEach((b) => {
    const r = b.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const label = `${b.getAttribute('aria-label') || ''} ${b.getAttribute('title') || ''}`.trim();
    const svg = b.querySelector('svg');
    const cls = svg ? String(svg.getAttribute('class') || '') : '';
    const isBack = BACK_LABEL.test(label) || /lucide-(arrow-left|chevron-left|move-left)/.test(cls) || b.hasAttribute('data-testid') && /back/i.test(b.getAttribute('data-testid') || '');
    const isX = /lucide-x\b/.test(cls) || CLOSE_LABEL.test(label) || (b.textContent || '').trim() === '✕';
    const parent = b.parentElement ? getComputedStyle(b.parentElement) : null;
    list.push({ top: r.top, right: r.right, width: r.width, isX, isBack, parentFlex: !!parent && /flex/.test(parent.display) });
    els.push(b);
  });
  return { list, els };
}

export function enhanceOverlay(overlay: HTMLElement): void {
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const card = biggestChild(overlay);
  if (!card) return;
  const r = card.getBoundingClientRect();
  const kind = classifyOverlay(viewport, { top: r.top, left: r.left, width: r.width, height: r.height }, { hasMedia: hasMediaInside(overlay), keep: overlay.hasAttribute(KEEP_ATTR) });
  if (kind === 'skip') { overlay.removeAttribute(PAGE_ATTR); return; }
  overlay.setAttribute(PAGE_ATTR, kind);
  card.setAttribute(CARD_ATTR, '1');
  const { list, els } = candidatesIn(card);
  const pick = pickClose(list, r.top);
  card.querySelectorAll(`[${CLOSE_ATTR}]`).forEach((e) => { if (e !== els[pick.index]) e.removeAttribute(CLOSE_ATTR); });
  if (!pick.hasBack && pick.index >= 0) {
    els[pick.index].setAttribute(CLOSE_ATTR, '1');
    els[pick.index].parentElement?.setAttribute(ROW_ATTR, '1');   // the top row: its things start at the left, next to the "<"
  }
}

let installed = false;
/** Starts watching (once): looks at every full-screen layer when something on the screen changes. */
export function installPageFrames(): () => void {
  if (installed || typeof document === 'undefined') return () => undefined;
  installed = true;
  let queued = false, last = 0;
  const seen = new WeakMap<Element, number>();
  const run = () => {
    queued = false; last = Date.now();
    document.querySelectorAll<HTMLElement>('.fixed.inset-0').forEach((el) => {
      try {
        if (getComputedStyle(el).position !== 'fixed') return;
        const st = el.getAttribute(PAGE_ATTR);
        const at = seen.get(el) || 0;
        // a layer that was judged a page is checked again (its top row may have been drawn again); one that was left alone is looked at again now and then (it may have filled up since)
        if (!st || Date.now() - at > (st === 'skip' ? 1200 : 400)) { seen.set(el, Date.now()); enhanceOverlay(el); if (!el.hasAttribute(PAGE_ATTR)) el.setAttribute(PAGE_ATTR, 'skip'); }
      } catch { /* a layer that can not be measured is left alone */ }
    });
  };
  const schedule = () => { if (queued) return; queued = true; setTimeout(run, Math.max(30, last + 150 - Date.now())); };
  const obs = new MutationObserver(schedule);
  obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'data-tab-hidden'] });
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  const safety = window.setInterval(schedule, 2500);
  return () => { obs.disconnect(); window.removeEventListener('resize', schedule); window.removeEventListener('orientationchange', schedule); window.clearInterval(safety); installed = false; };
}
