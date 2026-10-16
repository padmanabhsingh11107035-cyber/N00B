// Sound for reels.
//
// Phones (iPhone Safari above all) only let a video make sound when the page asked for it inside a real tap, and they give that permission
// to one particular <video> element, not to the whole page. Two things used to break it:
//   1. The "unlock" listened to pointerdown / touchstart. On a touch screen those are NOT real taps for the browser (only touchend, click and
//      pointerup are), so the attempt to switch the sound on was refused every time and the reel went back to silent.
//   2. Every reel was a brand new <video>, so every reel needed its own permission again.
// So: the reels page now plays everything through ONE video element (getReelPlayer), tries sound first, and if the browser refuses, it plays
// silently, shows "Tap for sound", and switches the sound on inside the very next real tap. From then on that element can play every reel with
// sound without asking again.

const KEY = 'noob_reels_sound';

/** The events a browser accepts as "the person really did something" for playing sound. (pointerdown and touchstart are NOT among them on a phone.) */
export const TAP_EVENTS = ['touchend', 'pointerup', 'mousedown', 'click', 'keydown'] as const;

let memory: boolean | null = null;

/** Whether the person wants sound on reels. Sound is on unless they switched it off themselves. */
export function getSoundPreference(): boolean {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'off') return false;
    if (saved === 'on') return true;
  } catch {
    if (memory !== null) return memory;
  }
  return true;
}

export function setSoundPreference(on: boolean): void {
  memory = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // storage blocked: the choice lasts until the page is closed
  }
}

export interface PlayerLike {
  muted: boolean;
  play(): Promise<void> | undefined;
}

export type PlayResult = 'sound' | 'silent' | 'aborted' | 'failed';

const isAbort = (err: unknown) => !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';

/**
 * Starts (or resumes) playback, with sound when the person wants it. If the browser refuses the sound it plays silently instead, so a reel is
 * never stuck on a frozen frame. 'silent' with wantSound true means "refused: ask for a tap".
 */
export async function playReel(player: PlayerLike, wantSound: boolean): Promise<PlayResult> {
  player.muted = !wantSound;
  try {
    await player.play();
    return wantSound ? 'sound' : 'silent';
  } catch (err) {
    if (isAbort(err)) return 'aborted'; // the reel was changed while this one was starting: the next one starts itself
    if (!wantSound) return 'failed';
  }
  player.muted = true;
  try {
    await player.play();
    return 'silent';
  } catch (err) {
    return isAbort(err) ? 'aborted' : 'failed';
  }
}

/**
 * Switches the sound on. Must be called straight from a real tap (see TAP_EVENTS), not from a timer or an effect.
 * Resolves true when the sound is really on.
 */
export async function unmuteInTap(player: PlayerLike): Promise<boolean> {
  player.muted = false;
  try {
    await player.play();
    return true;
  } catch (err) {
    if (isAbort(err)) return !player.muted;
    player.muted = true;
    try {
      await player.play();
    } catch {
      // nothing more to do
    }
    return false;
  }
}

let shared: HTMLVideoElement | null = null;

/** The one video element every reel plays through. Created on first use; kept for the whole session so the browser's permission stays with it. */
export function getReelPlayer(): HTMLVideoElement {
  if (shared) return shared;
  const v = document.createElement('video');
  v.loop = true;
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.setAttribute('webkit-playsinline', '');
  v.preload = 'auto';
  v.className = 'w-full h-full object-contain object-bottom';
  shared = v;
  return v;
}

/** Stops the player and takes it off the page (its permission is kept for the next time the reels open). */
export function releaseReelPlayer(): void {
  const v = shared;
  if (!v) return;
  try {
    v.pause();
    v.removeAttribute('src');
    v.removeAttribute('poster');
    v.load();
  } catch {
    // an element that is already gone is fine
  }
  v.parentNode?.removeChild(v);
}

/** Calls `onTap` for every real tap or key press anywhere on the page (capture phase, so nothing on the page can swallow it). Returns the remover. */
export function onRealTap(onTap: () => void): () => void {
  const options = { capture: true, passive: true } as const;
  for (const name of TAP_EVENTS) document.addEventListener(name, onTap, options);
  return () => {
    for (const name of TAP_EVENTS) document.removeEventListener(name, onTap, options);
  };
}
