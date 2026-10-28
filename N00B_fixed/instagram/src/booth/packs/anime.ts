// Anime stickers: the little marks every anime uses (sparkling eyes, a sweat drop, an angry mark, a blush, speed lines with a sound word, falling petals, power-up flames, a sword slash).
// They are drawn in code, in the same spirit, with no character from any show. See kit.ts.
import { INK, bump, clamp, def, detail, ease, label, lin, paint, pCirc, pEll, pHeart, pPoly, pRR, pSpark, rad, rnd, saw, wave, TAU } from '../kit.ts';
import type { StickerDef } from '../kit.ts';

export const ANIME: StickerDef[] = [
  def({
    id: 'an-eyes', pack: 'anime', name: 'Sparkle eyes', bw: 96, bh: 62, words: 'anime eyes sparkle kawaii shine cute manga',
    draw: (c, k) => {
      const q = saw(k, 1, 0.1), blink = q < 0.08 ? 1 - Math.abs(q - 0.04) / 0.04 : 0;
      const bob = wave(k, 2) * 2.5;
      for (const sx of [-1, 1]) {
        const x = sx * 46;
        c.save();
        c.translate(x, bob);
        c.scale(1, 1 - 0.88 * blink);
        pEll(c, 0, 0, 38, 44);
        paint(c, k, { fill: '#fff', stroke: INK, lw: 5 });
        detail(k, () => {
          c.save(); pEll(c, 0, 0, 38, 44); c.clip();
          pEll(c, 0, 4, 29, 38); c.fillStyle = lin(c, 0, -34, 0, 42, [[0, '#1c2f7a'], [0.6, '#2f6fe0'], [1, '#67d6ff']]); c.fill();
          pEll(c, 0, 4, 14, 22); paint(c, k, { fill: '#0a1233' });
          c.restore();
          pCirc(c, -8, -14, 10); paint(c, k, { fill: '#fff' });
          pCirc(c, 11, 14, 5); paint(c, k, { fill: '#fff', alpha: 0.9 });
          const t = 0.6 + 0.4 * bump(saw(k, 1, sx < 0 ? 0 : 0.5));
          pSpark(c, 15, -22, 11 * t, 0); paint(c, k, { fill: '#fff' });
          c.beginPath(); c.moveTo(-40, -6); c.quadraticCurveTo(0, -62, 40, -10); paint(c, k, { stroke: INK, lw: 8 });
        });
        c.restore();
      }
      detail(k, () => { for (const sx of [-1, 1]) { pEll(c, sx * 46, 56, 18, 6); paint(c, k, { fill: 'rgba(255,120,160,.55)' }); } });
    }
  }),
  def({
    id: 'an-don', pack: 'anime', name: 'DON!', text: true, words: 'don sound effect manga burst speed lines impact',
    draw: (c, k) => {
      for (let i = 0; i < 24; i++) {   // the spikes breathe in and out (each at its own moment), so the loop has no seam
        const a = (i * TAU) / 24, r0 = 36, r1 = 70 + rnd(i) * 26 + wave(k, 2, rnd(i, 5)) * 5, w = 0.05 + rnd(i, 3) * 0.03;
        pPoly(c, [[Math.cos(a - w) * r0, Math.sin(a - w) * r0], [Math.cos(a) * r1, Math.sin(a) * r1], [Math.cos(a + w) * r0, Math.sin(a + w) * r0]]);
        paint(c, k, { fill: INK });
      }
      const s = 1 + 0.13 * bump(saw(k, 2));
      c.save(); c.scale(s, s);
      label(c, k, 'ドン!', 0, 2, 70, { fill: '#fff', stroke: '#fff', lw: 18 });
      label(c, k, 'ドン!', 0, 2, 70, { fill: '#ff2d55', stroke: INK, lw: 8 });
      c.restore();
    }
  }),
  def({
    id: 'an-sweat', pack: 'anime', name: 'Sweat drop', words: 'sweat drop nervous awkward anime oops',
    draw: (c, k) => {
      const w = wave(k, 2) * 0.04;
      c.save();
      c.translate(-8, 4);
      c.scale(1 - w, 1 + w);
      c.beginPath(); c.moveTo(0, -78); c.bezierCurveTo(30, -36, 54, -4, 54, 26); c.arc(0, 26, 54, 0, Math.PI, false); c.bezierCurveTo(-54, -4, -30, -36, 0, -78); c.closePath();
      paint(c, k, { fill: lin(c, 0, -78, 0, 80, [[0, '#d4f1ff'], [1, '#3b9cff']]), stroke: INK, lw: 5 });
      detail(k, () => {
        pEll(c, -22, 6, 11, 22, 0.35); paint(c, k, { fill: 'rgba(255,255,255,.8)' });
        pCirc(c, -12, 40, 5); paint(c, k, { fill: 'rgba(255,255,255,.7)' });
      });
      c.restore();
      for (let i = 0; i < 3; i++) {
        const on = saw(k, 1) > i / 3.3;
        if (on) { pCirc(c, 56 + i * 17, -58 + i * 3, 6.5); paint(c, k, { fill: INK }); }
      }
    }
  }),
  def({
    id: 'an-vein', pack: 'anime', name: 'Angry mark', words: 'angry mad vein anime annoyed rage',
    draw: (c, k) => {
      const s = 1 + 0.14 * bump(saw(k, 3)), j = wave(k, 9) * 1.4;
      c.save();
      c.translate(j, 0);
      c.scale(s, s);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const dir = Math.atan2(-sy, -sx);
        c.beginPath(); c.arc(sx * 56, sy * 56, 42, dir - Math.PI / 4, dir + Math.PI / 4);
        paint(c, k, { stroke: INK, lw: 24 });
        paint(c, k, { stroke: '#ff3b5c', lw: 15 });
      }
      c.restore();
    }
  }),
  def({
    id: 'an-blush', pack: 'anime', name: 'Blush', words: 'blush shy cheeks cute anime embarrassed love',
    draw: (c, k) => {
      const s = 1 + wave(k, 3) * 0.04;
      c.save(); c.scale(s, s);
      pEll(c, 0, 8, 76, 46);
      paint(c, k, { fill: rad(c, 0, 8, 6, 76, [[0, '#ff9dbb'], [1, '#ff6b9a']]), stroke: INK, lw: 4.5 });
      detail(k, () => { for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(-18 + i * 30, -10); c.lineTo(-34 + i * 30, 30); paint(c, k, { stroke: '#fff', lw: 8, alpha: 0.9 }); } });
      c.restore();
      for (const [x, o] of [[-62, 0], [64, 0.5]] as const) {
        const p = saw(k, 1, o);
        pHeart(c, x, -44 - p * 26, 22 - p * 6);
        paint(c, k, { fill: '#ff6b9a', stroke: INK, lw: 3, alpha: bump(p) });
      }
    }
  }),
  def({
    id: 'an-sakura', pack: 'anime', name: 'Sakura petals', outline: false, words: 'sakura cherry blossom petals spring japan pink falling',
    draw: (c, k) => {
      for (let i = 0; i < 9; i++) {
        const p = saw(k, 1, i / 9), x = -84 + rnd(i) * 168 + Math.sin(p * TAU + i * 2) * 20, y = -104 + p * 212, rot = p * TAU + i, sz = 0.85 + rnd(i, 4) * 0.7;
        c.save(); c.translate(x, y); c.rotate(rot); c.scale(sz, sz * (0.6 + 0.4 * Math.abs(Math.cos(p * TAU * 2 + i))));
        c.beginPath(); c.moveTo(0, 18); c.bezierCurveTo(-17, 8, -15, -12, -3.5, -16); c.lineTo(0, -10); c.lineTo(3.5, -16); c.bezierCurveTo(15, -12, 17, 8, 0, 18); c.closePath();
        paint(c, k, { fill: lin(c, 0, -20, 0, 20, [[0, '#ffd3e2'], [1, '#ff8fb1']]), stroke: '#d6457a', lw: 2.5, alpha: clamp(bump(p) * 2.2) });
        c.restore();
      }
    }
  }),
  def({
    id: 'an-kawaii', pack: 'anime', name: 'Kawaii', text: true, bw: 100, bh: 60, words: 'kawaii cute かわいい japan anime pastel',
    draw: (c, k) => {
      const letters = 'KAWAII'.split(''), cols = ['#ff7eb6', '#6ec6ff', '#ffd166', '#7fe0a0', '#ff7eb6', '#b69cff'];
      letters.forEach((ch, i) => {
        label(c, k, ch, -75 + i * 30, -8 + wave(k, 1, -i / 6) * 9, 46, { fill: cols[i], stroke: INK, lw: 9 });
      });
      label(c, k, 'かわいい', 0, 40, 26, { fill: '#ff7eb6', stroke: '#fff', lw: 7 });
      for (const [x, y, o] of [[-86, -44, 0], [90, -40, 0.4], [-60, 60, 0.7]] as const) {
        pSpark(c, x, y, 8 + 12 * bump(saw(k, 1, o)), 0);
        paint(c, k, { fill: '#fff6a8', stroke: INK, lw: 2.5 });
      }
    }
  }),
  def({
    id: 'an-aura', pack: 'anime', name: 'Power aura', outline: false, bw: 90, bh: 100, words: 'aura power up flames energy saiyan fire anime strong',
    draw: (c, k) => {
      pCirc(c, 0, 10, 82);
      paint(c, k, { fill: rad(c, 0, 10, 10, 82, [[0, 'rgba(255,230,120,.0)'], [0.7, 'rgba(255,190,40,.28)'], [1, 'rgba(255,120,0,0)']]) });
      for (let i = 0; i < 15; i++) {
        const a = -Math.PI / 2 + (i - 7) * 0.27, f = 0.5 + 0.5 * wave(k, 3, i / 15), L = 70 + f * 34 + (7 - Math.abs(i - 7)) * 5;
        const bx = Math.cos(a) * 34, by = 12 + Math.sin(a) * 34, tx = Math.cos(a) * L + Math.sin(k.ph * 3 + i) * 5, ty = 12 + Math.sin(a) * L;
        c.beginPath();
        c.moveTo(bx - Math.sin(a) * 12, by + Math.cos(a) * 12);
        c.quadraticCurveTo((bx + tx) / 2 - Math.sin(a) * 18, (by + ty) / 2 + Math.cos(a) * 18, tx, ty);
        c.quadraticCurveTo((bx + tx) / 2 + Math.sin(a) * 18, (by + ty) / 2 - Math.cos(a) * 18, bx + Math.sin(a) * 12, by - Math.cos(a) * 12);
        c.closePath();
        paint(c, k, { fill: lin(c, bx, by, tx, ty, [[0, '#fff7a8'], [0.5, '#ffc21a'], [1, 'rgba(255,90,0,.85)']]), alpha: 0.92 });
      }
      for (let i = 0; i < 7; i++) {
        const p = saw(k, 1, rnd(i, 5)), x = -50 + rnd(i) * 100, y = 70 - p * 160;
        pSpark(c, x, y, 5 + rnd(i, 2) * 5, 0); paint(c, k, { fill: '#fff6b0', alpha: bump(p) });
      }
    }
  }),
  def({
    id: 'an-slash', pack: 'anime', name: 'Sword slash', outline: false, words: 'slash sword cut katana anime fight 斬',
    draw: (c, k) => {
      const p = saw(k, 1);
      const slash = (x0: number, y0: number, x1: number, y1: number, start: number): void => {
        const u = clamp((p - start) / 0.18), fade = 1 - clamp((p - start - 0.3) / 0.35);
        if (u <= 0 || fade <= 0) return;
        const e = ease(u), n = 16;
        const L: number[][] = [], R: number[][] = [];
        for (let i = 0; i <= n; i++) {
          const f = (i / n) * e, w = Math.sin((i / n) * Math.PI) * 9 * (0.4 + 0.6 * e);
          const x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f, nx = -(y1 - y0), ny = x1 - x0, nl = Math.hypot(nx, ny) || 1;
          L.push([x + (nx / nl) * w, y + (ny / nl) * w]); R.push([x - (nx / nl) * w, y - (ny / nl) * w]);
        }
        c.save();
        c.shadowColor = '#7fdcff'; c.shadowBlur = 16; c.globalAlpha *= fade;
        pPoly(c, [...L, ...R.reverse()].map(([x, y]) => [x, y] as [number, number]));
        paint(c, k, { fill: '#ffffff' });
        c.restore();
      };
      slash(-92, 70, 92, -62, 0);
      slash(-84, -66, 90, 74, 0.14);
      const s = ease(clamp((p - 0.3) / 0.12));
      if (s > 0) {
        c.save(); c.translate(64, 62); c.rotate(-0.1); c.scale(s, s);
        pRR(c, -24, -24, 48, 48, 6); paint(c, k, { fill: '#d62839', stroke: '#fff', lw: 3 });
        label(c, k, '斬', 0, 1, 34, { fill: '#fff', weight: 900 });
        c.restore();
      }
    }
  })
];
