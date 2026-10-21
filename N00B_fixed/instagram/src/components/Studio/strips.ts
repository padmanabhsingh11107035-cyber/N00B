import { useEffect, useState } from 'react';
import type { Asset } from './types';

// The little pictures along a video clip on the timeline (a "film strip"): frames taken at even steps through the video, made once in the background and kept for the session.
// Everything happens on this device with a hidden copy of the video; nothing is read from or sent anywhere.
const cache = new Map<string, string[]>();
const pending = new Map<string, Promise<string[]>>();
const listeners = new Set<() => void>();

export const stripCount = (duration: number): number => Math.max(6, Math.min(40, Math.ceil(duration / 1.5)));

function make(a: Asset): Promise<string[]> {
  return new Promise((resolve) => {
    const n = stripCount(a.duration);
    const out: string[] = [];
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.playsInline = true;
    const c = document.createElement('canvas');
    const w = 112, h = Math.max(2, Math.round((w * a.height) / Math.max(1, a.width)));
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const done = () => { v.removeAttribute('src'); v.load(); resolve(out); };
    const guard = window.setTimeout(done, 60000);
    let i = 0;
    const next = () => {
      if (i >= n || !ctx) { window.clearTimeout(guard); done(); return; }
      v.currentTime = Math.min(a.duration - 0.05, ((i + 0.5) / n) * a.duration);
    };
    v.onseeked = () => {
      try { ctx!.drawImage(v, 0, 0, w, h); out.push(c.toDataURL('image/jpeg', 0.6)); } catch { out.push(a.thumb); }
      i++;
      next();
    };
    v.onerror = () => { window.clearTimeout(guard); done(); };
    v.onloadeddata = next;
    v.src = a.url;
  });
}

/** The strip of frames of a video asset (empty until it is ready; the asset's own thumbnail is the stand-in). */
export function useStrip(a: Asset | undefined): string[] {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!a || a.kind !== 'video') return;
    const cb = () => tick((v) => v + 1);
    listeners.add(cb);
    if (!cache.has(a.id) && !pending.has(a.id)) {
      const p = make(a).then((frames) => { cache.set(a.id, frames); pending.delete(a.id); listeners.forEach((l) => l()); return frames; });
      pending.set(a.id, p);
    }
    return () => { listeners.delete(cb); };
  }, [a]);
  return a && a.kind === 'video' ? cache.get(a.id) || [] : [];
}
