// Videos in the posts of the Home page: the video that fills the screen the most plays by itself, with sound, and stops when the next one takes over, like a short-video feed.
//
// How it works (the same idea as the reels, see reelAudio.ts, and the songs, see songSound.ts):
//   * ONE <video> element plays every video post. A phone gives the permission to make sound to a particular element, not to the whole page, so one element that was allowed
//     once can play every later video with sound, without asking again.
//   * Each video post tells the coordinator how much of it is on screen (reportFeedVideoVisibility). The coordinator moves the one element into the post that fills the screen the
//     most (with a little stickiness, so two half-visible posts do not trade places on every pixel), starts it, and pauses it when no post is on screen enough.
//   * Sound is on unless the person turned it off (the same choice as on the reels). If the browser refuses sound until a tap, the video plays silently, the post shows
//     "Tap for sound", and the next real tap anywhere switches the sound on. The first real tap anywhere in the app also "wakes up" the element with a silent clip, so on an
//     iPhone the first video already starts with sound.
//   * The speaker button of a post turns the sound off and on for all videos (kept on the device).
import { getSoundPreference, setSoundPreference, playReel, unmuteInTap, onRealTap } from './reelAudio.ts';

export interface FeedVideoView {
  /** the id of the video post that owns the player ('' when none) */
  activeId: string;
  /** the video is moving (not paused) */
  playing: boolean;
  /** the video is playing with sound */
  sound: boolean;
  /** the browser refused sound: it plays silently until the next tap */
  blocked: boolean;
  /** the person wants sound (the speaker is "on") */
  wantSound: boolean;
}

export interface FeedVideoSlotInfo {
  /** the box the player is moved into */
  box: HTMLElement;
  src: string;
  /** a CSS look (the filter of the picture) put on the player while it is in this box */
  look?: Partial<CSSStyleDeclaration>;
  /** false when the settings say videos do not start by themselves */
  autoplay: boolean;
}

/** a video must fill this much of its own height on the screen to start, and keeps the player until it falls under the second number (or another one is clearly better) */
export const START_RATIO = 0.6;
export const KEEP_RATIO = 0.35;

const slots = new Map<string, FeedVideoSlotInfo>();
const ratios = new Map<string, number>();
const listeners = new Set<() => void>();
let view: FeedVideoView = { activeId: '', playing: false, sound: false, blocked: false, wantSound: true };
let player: HTMLVideoElement | null = null;
let loaded = '';
let userPausedId = '';
let wantSound = true;
let wantRead = false;
let armedTap: (() => void) | null = null;
let resumeOnShow = false;

const emit = () => { listeners.forEach((l) => l()); };
const setView = (patch: Partial<FeedVideoView>) => {
  const next = { ...view, ...patch };
  if (next.activeId === view.activeId && next.playing === view.playing && next.sound === view.sound && next.blocked === view.blocked && next.wantSound === view.wantSound) return;
  view = next;
  emit();
};

export const getFeedVideoView = (): FeedVideoView => view;
export const subscribeFeedVideo = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

function wants(): boolean {
  if (!wantRead) { wantRead = true; wantSound = getSoundPreference(); view = { ...view, wantSound }; }
  return wantSound;
}

/** The one element every video post plays through. Created on first use; kept for the whole session so its permission stays with it. */
export function getFeedVideoPlayer(): HTMLVideoElement {
  if (player) return player;
  const v = document.createElement('video');
  v.loop = true;
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.setAttribute('webkit-playsinline', '');
  v.preload = 'auto';
  v.className = 'feed-video-el';
  v.setAttribute('data-testid', 'feed-video-player');
  const sync = () => setView({ playing: !v.paused && !v.ended, sound: !v.muted && !v.paused });
  v.addEventListener('play', sync);
  v.addEventListener('pause', sync);
  v.addEventListener('volumechange', sync);
  player = v;
  document.addEventListener('visibilitychange', () => {
    if (!player) return;
    if (document.hidden) { resumeOnShow = !player.paused; player.pause(); }
    else if (resumeOnShow && view.activeId) { resumeOnShow = false; void playReel(player, wants()); }
  });
  return v;
}

function stopWaitingForTap() { if (armedTap) { armedTap(); armedTap = null; } }

/** The browser refused sound: the next real tap anywhere switches it on (inside that very tap, which is what the browser wants). */
function waitForTap() {
  if (armedTap) return;
  armedTap = onRealTap(() => {
    const v = player;
    if (!v || !view.blocked) { stopWaitingForTap(); return; }
    stopWaitingForTap();
    void unmuteInTap(v).then((on) => { setView({ blocked: !on, sound: on && !v.paused }); if (!on) waitForTap(); });
  });
}

function place(id: string): boolean {
  const slot = slots.get(id);
  if (!slot) return false;
  const v = getFeedVideoPlayer();
  if (v.parentNode !== slot.box) slot.box.appendChild(v);
  v.removeAttribute('style');
  if (slot.look) Object.assign(v.style, slot.look);
  if (loaded !== slot.src) { loaded = slot.src; v.src = slot.src; }
  return true;
}

function start(id: string) {
  if (!place(id)) return;
  const v = getFeedVideoPlayer();
  const want = wants();
  setView({ activeId: id });
  void playReel(v, want).then((result) => {
    if (view.activeId !== id) return;
    if (result === 'aborted') return;
    const blocked = want && result === 'silent';
    setView({ playing: !v.paused, sound: result === 'sound', blocked });
    if (blocked) waitForTap(); else stopWaitingForTap();
  });
}

function stop() {
  const v = player;
  if (v) v.pause();
  stopWaitingForTap();
  setView({ activeId: '', playing: false, sound: false, blocked: false });
}

/** Works out which video post owns the player now, and starts / stops accordingly. */
function choose() {
  let best = '';
  let bestRatio = 0;
  slots.forEach((slot, id) => {
    const r = ratios.get(id) || 0;
    if (!slot.autoplay || id === userPausedId) return;
    if (r >= START_RATIO && r > bestRatio) { best = id; bestRatio = r; }
  });
  const current = view.activeId;
  const currentRatio = current ? ratios.get(current) || 0 : 0;
  const currentOk = !!current && slots.has(current) && currentRatio >= KEEP_RATIO && current !== userPausedId && !!slots.get(current)?.autoplay;
  if (currentOk && (!best || best === current || bestRatio - currentRatio < 0.25)) return;   // keep the one that has it
  if (best) { if (best !== current) start(best); return; }
  if (current && !currentOk) { if (current === userPausedId && currentRatio >= KEEP_RATIO) return; stop(); }
}

export function registerFeedVideo(id: string, info: FeedVideoSlotInfo): void {
  slots.set(id, info);
  const own = view.activeId === id;
  if (own && player) {   // the same post drew again (a new box or look): put the player back in
    if (player.parentNode !== info.box) info.box.appendChild(player);
    player.removeAttribute('style');
    if (info.look) Object.assign(player.style, info.look);
  }
  choose();
}

export function unregisterFeedVideo(id: string): void {
  const own = view.activeId === id;
  slots.delete(id);
  ratios.delete(id);
  if (userPausedId === id) userPausedId = '';
  if (own) stop();
  choose();
}

export function reportFeedVideoVisibility(id: string, ratio: number): void {
  if (!slots.has(id)) return;
  ratios.set(id, ratio);
  if (userPausedId === id && ratio < KEEP_RATIO) userPausedId = '';   // scrolled away: it plays again when it comes back
  choose();
}

/** A tap on the video: pause it, or play it (a video the settings do not start by itself starts here). */
export function toggleFeedVideo(id: string): void {
  const v = getFeedVideoPlayer();
  if (view.activeId === id && !v.paused) { userPausedId = id; v.pause(); return; }
  userPausedId = '';
  if (view.activeId === id) { void unmuteOrPlay(v); return; }
  start(id);
}

async function unmuteOrPlay(v: HTMLVideoElement) {
  const want = wants();
  const result = await playReel(v, want);
  if (result === 'silent' && want) { setView({ blocked: true }); waitForTap(); }
}

/** "Tap for sound" (a real tap): the sound goes on for the video that is playing. */
export function enableFeedVideoSound(): void {
  const v = player;
  if (!v) return;
  void unmuteInTap(v).then((on) => { setView({ blocked: !on && !v.paused, sound: on && !v.paused }); if (!on) waitForTap(); else stopWaitingForTap(); });
}

/** The speaker button (a real tap): sound on or off for every video post, kept on the device. */
export function toggleFeedVideoSound(): void {
  const next = !wants();
  wantSound = next;
  setSoundPreference(next);
  const v = player;
  setView({ wantSound: next });
  if (!v) return;
  if (!next) { v.muted = true; setView({ sound: false, blocked: false }); stopWaitingForTap(); return; }
  void unmuteInTap(v).then((on) => { setView({ sound: on && !v.paused, blocked: !on && !v.paused }); if (!on) waitForTap(); });
}

// ------------------------------------------------------------------------------------------------ waking the element up (iPhone)

let armed = false;
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
 * Call when the Home page opens. The first real tap anywhere plays a silent clip through the video element, which is what makes an iPhone allow the videos that start later
 * to have sound. Does nothing once a video is in the element, and nothing on a phone that does not need it.
 */
export function armFeedVideo(): void {
  if (armed || typeof document === 'undefined') return;
  armed = true;
  const stopTap = onRealTap(() => {
    stopTap();
    if (loaded || view.activeId) return;   // a video is already in the element: its own start (or the next tap) gives the permission
    try {
      const v = getFeedVideoPlayer();
      const clip = silentClipUrl();
      v.style.cssText = 'display:none';
      if (!v.parentNode) document.body.appendChild(v);
      v.muted = false;
      v.src = clip;
      v.play()
        ?.then(() => { if (!loaded) { v.pause(); v.removeAttribute('src'); } })
        .catch(() => undefined)
        .finally(() => URL.revokeObjectURL(clip));
    } catch {
      // not needed on this phone
    }
  });
}
