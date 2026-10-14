// The song attached to a post or a reel plays by itself while that post / reel is on screen, with sound, like Instagram.
//
// How it works:
//   * ONE hidden media element (getSongPlayer) plays every song. A phone gives the permission to make sound to a particular element, not to the
//     whole page, so one element that has been allowed once can play every later song without asking again (same idea as the reels' video,
//     see reelAudio.ts). It is a <video> element so that a phone also lets it start silently when it refuses sound.
//   * On the Feed (many posts on one page) each post tells the coordinator how much of it is on screen (reportSongVisibility); the coordinator
//     plays the song of the post that fills the screen the most, switches when the next one takes over, and pauses when none does.
//   * The reels page plays its reel's song directly with the same element (loadSong + playReel from reelAudio.ts).
//   * If the phone refuses sound until a tap, the song plays silently, the post shows "Tap for sound", and the next real tap anywhere switches
//     the sound on. The first real tap anywhere in the app also "wakes up" the element with a silent clip (armSongPlayer) so that, on iPhone,
//     later songs can start by themselves.
//   * Stories, the full video page and the Music player ask the songs to be quiet (holdSongs) while they play their own sound; the speaker
//     button turns song sound off and on (kept on the device).
import { playReel, unmuteInTap, onRealTap, type PlayerLike } from './reelAudio.ts';

const KEY = 'noob_song_sound';
let memory: boolean | null = null;

/** Whether the person wants the songs of posts and reels to have sound. On unless they switched it off themselves. */
export function getSongSoundPreference(): boolean {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'off') return false;
    if (saved === 'on') return true;
  } catch {
    if (memory !== null) return memory;
  }
  return true;
}

export function setSongSoundPreference(on: boolean): void {
  memory = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // storage blocked: the choice lasts until the page is closed
  }
}

// ------------------------------------------------------------------------------------------------ the one element

let carrier: HTMLVideoElement | null = null;
let loaded = '';
let resumeOnShow = false;

function onVisibility() {
  if (!carrier) return;
  if (document.hidden) {
    resumeOnShow = !!loaded && !carrier.paused;
    carrier.pause();
  } else if (resumeOnShow) {
    resumeOnShow = false;
    carrier.play()?.catch(() => undefined);
  }
}

/** The one hidden element every song plays through. Created on first use and kept for the whole session so its permission stays with it. */
export function getSongPlayer(): HTMLVideoElement {
  if (carrier) return carrier;
  const v = document.createElement('video');
  v.loop = true;
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.setAttribute('webkit-playsinline', '');
  v.setAttribute('aria-hidden', 'true');
  v.preload = 'auto';
  v.tabIndex = -1;
  v.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1';
  document.body.appendChild(v);
  carrier = v;
  document.addEventListener('visibilitychange', onVisibility);
  return v;
}

/** Puts a song into the element (from the start when it is a different song, or when `restart` is true). Does not start it. */
export function loadSong(url: string, restart = false): HTMLVideoElement {
  const v = getSongPlayer();
  if (loaded !== url) {
    loaded = url;
    v.src = url;
  } else if (restart) {
    try { v.currentTime = 0; } catch { /* not ready yet: it starts from the beginning anyway */ }
  }
  return v;
}

export function pauseSong(): void {
  carrier?.pause();
}

/** Stops the song and empties the element (its permission is kept). */
export function stopSong(): void {
  const v = carrier;
  if (!v) return;
  loaded = '';
  resumeOnShow = false;
  try {
    v.pause();
    v.removeAttribute('src');
    v.load();
  } catch {
    // an element that is already gone is fine
  }
}

/** The url of the song that is in the element right now ('' when none). */
export function loadedSong(): string {
  return loaded;
}

// ------------------------------------------------------------------------------------------------ waking the element up (iPhone)

let armed = false;
let blessed = false;

/** A tiny silent clip, made on the spot (a data: address would be refused by the page's security rules; blob: is allowed). */
function silentClipUrl(): string {
  const samples = 800;
  const buf = new ArrayBuffer(44 + samples);
  const d = new DataView(buf);
  const text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) d.setUint8(at + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); d.setUint32(4, 36 + samples, true); text(8, 'WAVE'); text(12, 'fmt ');
  d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true); d.setUint32(24, 8000, true); d.setUint32(28, 8000, true);
  d.setUint16(32, 1, true); d.setUint16(34, 8, true); text(36, 'data'); d.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) d.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

/**
 * Call once when the app starts. The first real tap anywhere plays a silent clip through the song element, which is what makes an iPhone allow
 * every later song to start by itself (the permission belongs to the element). Does nothing on a phone that does not need it.
 */
export function armSongPlayer(): void {
  if (armed || typeof document === 'undefined') return;
  armed = true;
  const stop = onRealTap(() => {
    if (blessed) { stop(); return; }
    if (loaded) return; // a song is already in the element: its own start (or the next tap) gives the permission
    blessed = true;
    stop();
    try {
      const v = getSongPlayer();
      const clip = silentClipUrl();
      v.muted = false;
      v.src = clip;
      v.play()
        ?.then(() => { if (!loaded) { v.pause(); v.removeAttribute('src'); } })
        .catch(() => { blessed = false; })
        .finally(() => URL.revokeObjectURL(clip));
    } catch {
      blessed = false;
    }
  });
}

// ------------------------------------------------------------------------------------------------ quiet while something else makes sound

let holds = 0;
const holdListeners = new Set<() => void>();

/** Songs stay quiet until the returned function is called. Used by anything that plays its own sound over the Feed. */
export function holdSongs(): () => void {
  holds++;
  holdListeners.forEach((f) => f());
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds--;
    holdListeners.forEach((f) => f());
  };
}

export function songsHeld(): boolean {
  return holds > 0;
}

// ------------------------------------------------------------------------------------------------ the Feed: the post on screen plays

export const SHOW_AT = 0.55;       // a post must fill this much of the screen to start its song
export const KEEP_AT = 0.4;        // the playing post keeps its song until it drops below this ...
export const SWITCH_MARGIN = 0.15; // ... or another post is this much more on screen

/** Which post's song should play: the one that fills the screen most; the current one is kept while it is still mostly there. */
export function pickActive(ratios: ReadonlyArray<readonly [string, number]>, current: string | null): string | null {
  let best: string | null = null;
  let bestRatio = 0;
  let currentRatio = 0;
  for (const [id, ratio] of ratios) {
    if (id === current) currentRatio = ratio;
    if (ratio > bestRatio) { best = id; bestRatio = ratio; }
  }
  if (current && currentRatio >= KEEP_AT && (best === current || bestRatio - currentRatio < SWITCH_MARGIN)) return current;
  return best !== null && bestRatio >= SHOW_AT ? best : null;
}

export interface FeedSongView {
  /** the post whose song is playing (or trying to) */
  activeId: string | null;
  /** the phone refused sound: the song plays silently until the next tap */
  blocked: boolean;
  /** the person wants sound (the speaker is on) */
  soundOn: boolean;
}

const entries = new Map<string, { url: string; ratio: number }>();
let activeId: string | null = null;
let blocked = false;
let soundOn: boolean | null = null;
let startToken = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let removeTap: (() => void) | null = null;
let tapUnmutedAt = 0;
let snapshot: FeedSongView = { activeId: null, blocked: false, soundOn: true };
const listeners = new Set<() => void>();

const wantSound = (): boolean => (soundOn === null ? (soundOn = getSongSoundPreference()) : soundOn);

function emit() {
  if (snapshot.activeId === activeId && snapshot.blocked === blocked && snapshot.soundOn === wantSound()) return;
  snapshot = { activeId, blocked, soundOn: wantSound() };
  listeners.forEach((f) => f());
}

function reconcile() {
  timer = null;
  const wanted = holds > 0 ? null : pickActive([...entries].map(([id, e]) => [id, e.ratio] as const), activeId);
  if (wanted === activeId) return;
  activeId = wanted;
  blocked = false;
  const token = ++startToken;
  if (wanted === null) {
    pauseSong();
    emit();
    return;
  }
  const player = loadSong(entries.get(wanted)!.url);
  playReel(player as PlayerLike, wantSound()).then((result) => {
    if (token !== startToken) return;
    blocked = result === 'silent' && wantSound();
    emit();
  });
  emit();
}

const schedule = () => {
  if (timer === null) timer = setTimeout(reconcile, 120);   // a quick scroll passes many posts: only where it stops matters
};

holdListeners.add(() => {
  if (timer !== null) { clearTimeout(timer); timer = null; }
  reconcile();
});

function onTap() {
  if (!blocked || !wantSound() || activeId === null) return;
  tapUnmutedAt = Date.now();
  unmuteInTap(getSongPlayer()).then((on) => {
    if (on) { blocked = false; emit(); }
  });
}

/** A post tells how much of it is on screen (0 to 1: the share of the part that could be seen). */
export function reportSongVisibility(id: string, url: string, ratio: number): void {
  entries.set(id, { url, ratio: Math.max(0, Math.min(1, ratio)) });
  if (!removeTap) removeTap = onRealTap(onTap);
  schedule();
}

/** A post left the page. */
export function forgetSong(id: string): void {
  entries.delete(id);
  if (entries.size === 0 && removeTap) { removeTap(); removeTap = null; }
  if (id === activeId) {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    reconcile();   // the playing post is gone: pause now, and the next one (if any) takes over
    if (entries.size > 0) schedule();
  } else if (entries.size === 0 && timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

/** The speaker button: sound on / off for the songs. Call it straight from a tap. Returns whether sound is now on. */
export function toggleFeedSound(): boolean {
  if (wantSound() && Date.now() - tapUnmutedAt < 700) return true;   // this very tap already switched the sound on
  const next = !wantSound();
  soundOn = next;
  setSongSoundPreference(next);
  if (!next) {
    if (carrier) carrier.muted = true;
    blocked = false;
    emit();
  } else if (activeId !== null) {
    unmuteInTap(getSongPlayer()).then((on) => { blocked = !on; emit(); });
    emit();
  } else {
    emit();
  }
  return next;
}

export function getFeedSongView(): FeedSongView {
  if (snapshot.soundOn !== wantSound()) snapshot = { ...snapshot, soundOn: wantSound() };
  return snapshot;
}

export function subscribeFeedSong(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Start again from nothing (tests). */
export function resetSongSound(): void {
  entries.clear();
  activeId = null;
  blocked = false;
  soundOn = null;
  startToken++;
  holds = 0;
  tapUnmutedAt = 0;
  if (timer !== null) { clearTimeout(timer); timer = null; }
  if (removeTap) { removeTap(); removeTap = null; }
  snapshot = { activeId: null, blocked: false, soundOn: true };
}
