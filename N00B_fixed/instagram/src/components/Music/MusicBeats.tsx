import React, { useEffect, useRef } from 'react';

// The beats under the song name in the full-screen player: a row of mirrored bars that jump with the song while it plays and settle low when it is paused.
// The bars follow the song's own pace (a tempo taken from the song, so every song moves differently) and its position, and they run only while the player is on screen
// and the song plays. They do not listen to the audio itself: the song files come from another address, and hooking a sound analyser to them can silence the song on phones.
const BARS = 41;

const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const noise = (n: number): number => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export const MusicBeats: React.FC<{ seed: string; playing: boolean; elapsedSec: number }> = ({ seed, playing, elapsedSec }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ seed, playing, elapsedSec, at: performance.now() });
  live.current = { seed, playing, elapsedSec, at: performance.now() };

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const calm = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const level = new Float32Array(BARS).fill(0.06);
    let raf = 0, w = 0, h = 0, clock = 0, last = performance.now();

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = el.clientWidth; h = el.clientHeight;
      el.width = Math.max(1, Math.round(w * dpr)); el.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(el);

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { seed: s, playing: on, elapsedSec: pos, at } = live.current;
      // the song's position, moved on between the player's own updates so the bars stay smooth
      if (on) clock = pos + (now - at) / 1000;
      const hs = hash(s);
      const bpm = 84 + (hs % 56);                      // 84 to 139 beats a minute, the same for the same song
      const beat = (clock * bpm) / 60;
      const phase = beat - Math.floor(beat);
      const kick = Math.exp(-phase * 5.5);             // a jump on each beat, then it falls away
      const off = Math.exp(-(((beat * 2) % 1)) * 7) * 0.45; // a softer one between the beats
      const section = 0.72 + 0.28 * Math.sin(clock * 0.35 + (hs % 7)); // the song swells and eases

      ctx.clearRect(0, 0, w, h);
      const gap = 4, bw = Math.max(2, (w - gap * (BARS - 1)) / BARS), mid = h / 2;
      for (let i = 0; i < BARS; i++) {
        const c = Math.abs(i - (BARS - 1) / 2) / ((BARS - 1) / 2);              // 0 in the middle, 1 at the sides
        const shape = 1 - c * 0.62;                                              // taller in the middle
        const flutter = noise(i * 3.1 + Math.floor(clock * 14) * 1.7 + (hs % 100)); // each bar its own movement
        const target = on && !calm ? Math.min(1, (0.1 + 0.9 * (kick + off) * (0.35 + 0.65 * flutter)) * shape * section + 0.05 * flutter) : 0.05 + 0.03 * shape;
        level[i] += (target - level[i]) * Math.min(1, dt * (target > level[i] ? 22 : 9)); // up fast, down slow
        const bh = Math.max(3, level[i] * h * 0.94);
        const x = i * (bw + gap);
        ctx.fillStyle = `rgba(255,255,255,${(0.5 + 0.45 * Math.min(1, level[i] * 1.4)).toFixed(3)})`;
        const r = Math.min(bw / 2, bh / 2);
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x, mid - bh / 2, bw, bh, r) : ctx.rect(x, mid - bh / 2, bw, bh);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const onVis = () => { if (document.hidden) cancelAnimationFrame(raf); else { last = performance.now(); raf = requestAnimationFrame(draw); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelAnimationFrame(raf); ro?.disconnect(); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  return <canvas ref={canvas} aria-hidden="true" data-testid="music-beats" className="w-full h-full block" />;
};
