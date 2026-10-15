// Pull-to-refresh (Home and Explore): dragging down at the top of the page refreshes it. The menus, sheets and pop-ups those pages open (the three-lines menu, comments,
// a video) are drawn on top of the page with position: fixed but are still children of it, so a finger dragging down inside one of them — which is just scrolling that menu
// back up — used to count as a pull and refreshed the whole app. A pull may only start on the page itself.

/** Does a touch that starts on `target` (inside `container`) start on something drawn over the page (any ancestor up to the container with position: fixed)? */
export function startsInsideOverlay(
  target: EventTarget | null,
  container: { parentElement?: unknown } | null,
  positionOf: (el: any) => string = (el) => (typeof getComputedStyle === 'function' ? getComputedStyle(el).position : '')
): boolean {
  let el: any = target;
  let hops = 0;
  while (el && el !== container && hops++ < 60) {
    if (positionOf(el) === 'fixed') return true;
    el = el.parentElement;
  }
  return false;
}
