import React, { useEffect, useRef, useState } from 'react';
import { adsAvailable, onAdState, placeAd, removeAd, startAds } from '../../ads/noobAds';

// An advertisement between the posts (Android app only). This is just the EMPTY curved box: the ad itself is drawn by the phone on top of it (android-overrides/NoobAdsPlugin.java), because Google
// only allows its ads to be drawn by its own SDK. This box keeps the place, and a few times a second while the page moves it tells the phone where the box is and which part of it can really be seen:
// the part under the header or the bottom bar is cut off, and nothing is drawn while a page, sheet or menu is open on top of it. If there is no ad (no fill, offline, an older app) the box closes
// and leaves no gap, so a person simply scrolls on. Swipes that start on the ad scroll the page (handled in the plugin).
interface Props { slot: string; unit: string; height?: number; /** told when the ad is ready to be seen or is not available */ onState?: (state: 'loaded' | 'failed') => void }

const HEIGHT = 340;
const cssVar = (name: string, fallback: string): string => {
  try { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback; } catch { return fallback; }
};
const isLight = (): boolean => { try { return document.documentElement.getAttribute('data-theme') === 'light'; } catch { return false; } };

export const AdSlot: React.FC<Props> = ({ slot, unit, height = HEIGHT, onState }) => {
  const told = useRef(onState);
  told.current = onState;
  const box = useRef<HTMLDivElement | null>(null);
  const [gone, setGone] = useState(!adsAvailable());   // no ad on the website / iPhone / older app: no box at all
  const [near, setNear] = useState(false);
  const loaded = useRef(false);

  // is it near the screen? (a box far away costs nothing: no ad is asked for)
  useEffect(() => {
    const el = box.current; if (!el || gone) return;
    const io = new IntersectionObserver(([e]) => setNear(!!e?.isIntersecting), { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [gone]);

  useEffect(() => {
    if (gone) return;
    const stop = onAdState((s, state) => { if (s !== slot) return; if (state === 'failed') setGone(true); else loaded.current = true; told.current?.(state); });
    return stop;
  }, [slot, gone]);

  // while it is near: ask for the ad once, then keep the phone told where the box is
  useEffect(() => {
    const el = box.current; if (!el || gone || !near) return;
    let alive = true;
    let raf = 0;
    let lastKey = '';
    let lastSentAt = 0;
    let busyUntil = 0;
    const light = isLight();
    const colors = {
      card: light ? '#ffffff' : cssVar('--hv-card', '#1f1f23'),
      text: light ? '#15151f' : '#f5f5fa',
      muted: light ? '#565662' : '#b4b4bf',
      accent: '#ff4d6d'
    };

    // which part of the box can be seen? (the page counts: the header, the bar, a sheet over it)
    const mine = (x: number, y: number): boolean => { const hit = document.elementFromPoint(x, y); return !!hit && el.contains(hit); };
    const measure = (): void => {
      if (!alive) return;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      let visible = r.width > 8 && r.height > 8 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw && !document.hidden;
      let visTop = 0, visBottom = 0;
      if (visible) {
        const cx = Math.min(vw - 1, Math.max(0, r.left + r.width / 2));
        const top = Math.max(r.top, 0) + 1, bottom = Math.min(r.bottom, vh) - 1;
        const mid = (top + bottom) / 2;
        if (bottom - top < 8 || !mine(cx, mid)) visible = false;
        else {
          let lo = top, hi = mid;                       // the first row (from the top) that belongs to this box
          while (hi - lo > 2) { const m = (lo + hi) / 2; if (mine(cx, m)) hi = m; else lo = m; }
          const firstSeen = hi === mid ? mid : (mine(cx, top) ? top : hi);
          lo = mid; hi = bottom;                        // the last row that belongs to it
          while (hi - lo > 2) { const m = (lo + hi) / 2; if (mine(cx, m)) lo = m; else hi = m; }
          const lastSeen = mine(cx, bottom) ? bottom : lo;
          visTop = Math.max(0, firstSeen - r.top); visBottom = Math.max(0, r.bottom - lastSeen);
        }
      }
      const o = { slot, unit, x: Math.round(r.left * dpr), y: Math.round(r.top * dpr), w: Math.round(r.width * dpr), h: Math.round(r.height * dpr), visTop: Math.round(visTop * dpr), visBottom: Math.round(visBottom * dpr), visible, ...colors };
      const key = `${o.x}|${o.y}|${o.w}|${o.h}|${o.visTop}|${o.visBottom}|${o.visible}`;
      const now = performance.now();
      if (key !== lastKey || now - lastSentAt > 2500) { lastKey = key; lastSentAt = now; void placeAd(o); }
    };
    const loop = (): void => {
      raf = 0;
      if (!alive) return;
      measure();
      if (performance.now() < busyUntil) raf = requestAnimationFrame(loop);
    };
    const kick = (): void => { busyUntil = performance.now() + 450; if (!raf) raf = requestAnimationFrame(loop); };
    const onScroll = (): void => kick();

    void startAds().then((ok) => { if (!alive) return; if (!ok) { setGone(true); told.current?.('failed'); return; } kick(); });
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onScroll);
    window.addEventListener('touchmove', onScroll, { passive: true });
    const idle = window.setInterval(kick, 400);   // also notices a page or sheet opening on top, or the layout moving without a scroll
    // if no ad has appeared after 12 seconds the box closes (nothing is lost: it was only a place for an ad)
    const giveUp = window.setTimeout(() => { if (alive && !loaded.current) { setGone(true); told.current?.('failed'); } }, 12000);
    return () => {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('touchmove', onScroll);
      window.clearInterval(idle);
      window.clearTimeout(giveUp);
      removeAd(slot);
    };
  }, [near, gone, slot, unit]);

  if (gone) return null;
  return <div ref={box} className="ad-slot" data-testid="ad-slot" data-slot={slot} style={{ height }} aria-hidden="true" />;
};
