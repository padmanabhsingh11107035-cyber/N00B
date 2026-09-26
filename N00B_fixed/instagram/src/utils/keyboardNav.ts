// On a computer there is no swiping, so the keyboard does what a swipe does on a phone:
//   W / S  (or ↑ / ↓ in reels)      previous / next post or reel
//   A / D  (or ← / →)               previous / next photo in a post, previous / next story
// Keys are ignored while typing (inputs, text areas, editable text) and with Ctrl / Alt / Cmd held.

export type NavDirection = 'up' | 'down' | 'left' | 'right';

export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function navKey(e: KeyboardEvent, { arrows = true }: { arrows?: boolean } = {}): NavDirection | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return null;
  switch (e.key) {
    case 'w': case 'W': return 'up';
    case 's': case 'S': return 'down';
    case 'a': case 'A': return 'left';
    case 'd': case 'D': return 'right';
    case 'ArrowUp': return arrows ? 'up' : null;
    case 'ArrowDown': return arrows ? 'down' : null;
    case 'ArrowLeft': return arrows ? 'left' : null;
    case 'ArrowRight': return arrows ? 'right' : null;
    default: return null;
  }
}

// Is this element really on screen and on top (not hidden under a modal, a sheet or another page)?
export function isOnTop(el: HTMLElement | null): boolean {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0 || r.bottom <= 0 || r.top >= window.innerHeight) return false;
  const x = Math.min(Math.max(r.left + r.width / 2, 0), window.innerWidth - 1);
  const y = Math.min(Math.max(r.top + r.height / 2, 1), window.innerHeight - 1);
  const hit = document.elementFromPoint(x, y);
  return !!hit && el.contains(hit);
}

// ---- Posts in the feed / on a profile: one listener for the whole page ----
// The post nearest the middle of the screen (and on top) gets A/D; W/S scroll to the next / previous post.
export const POST_SLIDE_EVENT = 'noob:slide';

function postCards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('article[data-post-card]'));
}

function centrePost(cards: HTMLElement[]): HTMLElement | null {
  const mid = window.innerHeight / 2;
  let best: HTMLElement | null = null;
  let bestDistance = Infinity;
  for (const card of cards) {
    const r = card.getBoundingClientRect();
    if (r.width === 0 || r.bottom <= 0 || r.top >= window.innerHeight) continue;
    const x = Math.min(Math.max(r.left + r.width / 2, 0), window.innerWidth - 1);
    const y = Math.min(Math.max(mid, r.top + 1), r.bottom - 1, window.innerHeight - 1);
    const hit = document.elementFromPoint(x, y);
    if (!hit || !card.contains(hit)) continue;                 // covered by something else
    const distance = Math.abs((r.top + r.bottom) / 2 - mid);
    if (distance < bestDistance) { best = card; bestDistance = distance; }
  }
  return best;
}

let postKeysInstalled = false;
export function installPostKeys(): void {
  if (postKeysInstalled || typeof window === 'undefined') return;
  postKeysInstalled = true;
  window.addEventListener('keydown', (e) => {
    const dir = navKey(e);
    if (!dir) return;
    const cards = postCards();
    const card = centrePost(cards);
    if (!card) return;
    if (dir === 'left' || dir === 'right') {
      card.dispatchEvent(new CustomEvent(POST_SLIDE_EVENT, { detail: dir }));
      return;
    }
    if (e.key.startsWith('Arrow')) return;                       // ↑ / ↓ keep scrolling the page normally
    const i = cards.indexOf(card);
    const target = cards[dir === 'down' ? i + 1 : i - 1];
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}
