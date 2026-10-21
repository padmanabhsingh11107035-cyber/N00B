// The text is bigger now (index.css, --tx). A bar with a fixed number of things in a row (the top bar, the bottom bar, a row of tabs ...) can run out of room, and then one thing is
// pushed under its neighbour. This looks at every <header>, <nav> and anything marked data-fit: when something in it sticks out sideways, the text in THAT bar is made a step
// smaller (data-fit 1, 2, 3 = a third, two thirds, all of the extra size taken away; see index.css) until it fits. Everything else on the page keeps the bigger text.
//
// Elements that deal with their own overflow (scrolling rows, "…" cut-offs) are left alone.

const MAX_STEP = 3;
const BARS = 'header, nav, [data-fit]';

function sticksOut(bar: HTMLElement): boolean {
  const nodes: HTMLElement[] = [bar, ...Array.from(bar.querySelectorAll<HTMLElement>(':scope > *, :scope > * > *, :scope > * > * > *'))];
  for (const n of nodes) {
    if (n.clientWidth === 0 || n.scrollWidth <= n.clientWidth + 1) continue;
    const css = getComputedStyle(n);
    if (css.display === 'inline' || css.position === 'absolute' || css.position === 'fixed') continue;
    if (/(hidden|auto|scroll|clip)/.test(css.overflowX)) continue;
    return true;
  }
  return false;
}

/** Make the text of one bar as big as it can be while everything in it still fits. */
export function fitBar(bar: HTMLElement): number {
  bar.removeAttribute('data-fit');
  let step = 0;
  while (step < MAX_STEP && sticksOut(bar)) {
    step += 1;
    bar.setAttribute('data-fit', String(step));
  }
  return step;
}

export function fitAllBars(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>(BARS).forEach((b) => { fitBar(b); });
}

let started = false;

export function startTextFit(): void {
  if (started || typeof window === 'undefined' || typeof MutationObserver === 'undefined') return;
  started = true;
  let timer = 0;
  const queue = () => {
    if (timer) return;
    timer = window.setTimeout(() => { timer = 0; requestAnimationFrame(() => fitAllBars()); }, 120);
  };
  const begin = () => {
    new MutationObserver(queue).observe(document.body, { childList: true, subtree: true, characterData: true });
    new MutationObserver(queue).observe(document.documentElement, { attributes: true, attributeFilter: ['data-text-size', 'data-serif', 'data-bold'] });
    queue();
  };
  if (document.body) begin(); else window.addEventListener('DOMContentLoaded', begin, { once: true });
  window.addEventListener('resize', queue);
  window.addEventListener('orientationchange', queue);
  void document.fonts?.ready.then(queue);
}
