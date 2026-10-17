// Keeps the phone's screen from dimming and turning itself off while something is being watched (reels, videos, a live stream).
//
// 1. The Screen Wake Lock API (Chrome / Android, Safari 16.4+ and the home-screen app on newer iPhones). The browser lets go of it by itself whenever the
//    page is hidden, so it is asked for again when the page comes back.
// 2. Where that does not exist, a tiny silent video of a moving canvas is kept playing — a playing video is what keeps most phones awake.
//
// Everything is best-effort and silent: if neither works, the phone simply behaves as before.
import { useEffect } from 'react';

type Sentinel = { release: () => Promise<void>; addEventListener: (t: 'release', cb: () => void) => void };
type WakeLockApi = { request: (type: 'screen') => Promise<Sentinel> };

let holders = 0;                       // how many screens want the phone awake right now
let sentinel: Sentinel | null = null;
let fallback: { video: HTMLVideoElement; timer: number } | null = null;
let listening = false;

const api = (): WakeLockApi | null => (typeof navigator !== 'undefined' && (navigator as any).wakeLock ? ((navigator as any).wakeLock as WakeLockApi) : null);

function startFallback(): void {
  if (fallback || typeof document === 'undefined') return;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    if (!ctx || !(canvas as any).captureStream) return;
    let n = 0;
    const timer = window.setInterval(() => {
      n = (n + 1) % 255;
      ctx.fillStyle = `rgb(${n},${255 - n},${n >> 1})`;   // a changing picture, so it counts as moving video
      ctx.fillRect(0, 0, 16, 16);
    }, 500);
    const video = document.createElement('video');
    video.muted = true;
    video.setAttribute('playsinline', '');
    video.srcObject = (canvas as any).captureStream(2);
    video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;left:0;top:0;';
    document.body.appendChild(video);
    void video.play().catch(() => undefined);
    fallback = { video, timer };
  } catch {
    /* not available here */
  }
}

function stopFallback(): void {
  if (!fallback) return;
  window.clearInterval(fallback.timer);
  try { fallback.video.pause(); fallback.video.srcObject = null; fallback.video.remove(); } catch { /* gone already */ }
  fallback = null;
}

async function acquire(): Promise<void> {
  if (holders <= 0 || document.visibilityState === 'hidden') return;
  const wl = api();
  if (wl) {
    if (sentinel) return;
    try {
      const s = await wl.request('screen');
      if (holders <= 0) { void s.release().catch(() => undefined); return; }
      sentinel = s;
      s.addEventListener('release', () => { if (sentinel === s) sentinel = null; });
    } catch {
      startFallback();   // refused (battery saver, no permission): the video trick may still work
    }
    return;
  }
  startFallback();
}

function release(): void {
  if (holders > 0) return;
  const s = sentinel;
  sentinel = null;
  if (s) void s.release().catch(() => undefined);
  stopFallback();
}

function listen(): void {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void acquire();   // the browser let go of it while the page was hidden
  });
}

/** Keep the screen awake for as long as `active` is true (and this screen is mounted). Several screens can ask at once. */
export function useScreenAwake(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    listen();
    holders++;
    void acquire();
    return () => {
      holders = Math.max(0, holders - 1);
      release();
    };
  }, [active]);
}

/** For tests: how many screens are asking for the phone to stay awake. */
export function awakeHolders(): number {
  return holders;
}
