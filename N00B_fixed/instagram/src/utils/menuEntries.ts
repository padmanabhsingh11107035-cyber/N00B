import { useSyncExternalStore } from 'react';
import type { MenuGroupSpec } from '../components/Navigation/SideMenu';

// The pages of the NOOB menu (Draw, Studio, Daily, Shop, the Fun pages ...) are opened by the Home page, which owns their state. Home publishes the list here, and the long strip
// on a tablet / laptop / computer reads it, so the strip and the three-line menu of a phone always show the very same pages (and the same switches of the administrator).
let groups: MenuGroupSpec[] = [];
let latest: MenuGroupSpec[] = [];
let signature = '';
const listeners = new Set<() => void>();

/** Home publishes its menu (called after every draw, it only tells the strip when something visible changed). */
export function publishMenuGroups(next: MenuGroupSpec[]): void {
  const sig = next.map((g) => g.id + ':' + g.items.map((i) => [i.id, i.label, i.tag || '', i.onClick ? 1 : 0].join('~')).join(',')).join('|');
  latest = next;   // the newest handlers are always kept
  if (sig === signature) return;   // same list on screen: nobody has to redraw
  signature = sig;
  groups = next;
  listeners.forEach((l) => l());
}

export function clearMenuGroups(): void {
  latest = [];
  if (!groups.length) return;
  groups = [];
  signature = '';
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => groups;
// the snapshot only changes when the visible list changes; the handlers are always read from the newest published list
export const useMenuGroups = (): MenuGroupSpec[] => useSyncExternalStore(subscribe, snapshot, snapshot);
/** The newest handler of an item (the list a strip draws may be one draw older than the page that owns the state). */
export const menuItemClick = (id: string): (() => void) | undefined => {
  for (const g of latest) for (const i of g.items) if (i.id === id) return i.onClick;
  return undefined;
};
