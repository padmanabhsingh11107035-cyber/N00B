// The turning of a product's pictures (like the game posters): every couple of seconds the next picture appears, and after the last one
// it starts again from the first. Pure rules, so they can be tested without a browser.

export const ROTATE_MS = 2200;

// The picture after this one; after the last comes the first again.
export const nextIndex = (i: number, count: number): number => (count <= 1 ? 0 : (i + 1) % count);

// The picture before this one; before the first comes the last.
export const prevIndex = (i: number, count: number): number => (count <= 1 ? 0 : (i - 1 + count) % count);

export interface RotateState {
  count: number; // how many pictures / videos the product has
  tabHidden: boolean; // the browser tab is in the background
  offscreen: boolean; // the card is scrolled out of view
  reducedMotion: boolean; // the person asked their device for less movement
  holding: boolean; // the person is looking at one (hovering / touching it, or a video is playing)
}

// Should the pictures keep turning right now? Not for a single picture, not while nobody can see them (saves battery and data), not for
// people who asked for less movement.
export const shouldRotate = (s: RotateState): boolean => s.count > 1 && !s.tabHidden && !s.offscreen && !s.reducedMotion && !s.holding;

// The wait before the first turn, so that a whole shelf of cards does not flip at the same instant: the base time plus a little spread.
export const firstDelay = (baseMs: number, random: number): number => baseMs + Math.floor(Math.min(Math.max(random, 0), 1) * 900);
