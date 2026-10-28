// Flair: the loose decorations that go anywhere on a photo (a twinkle, hearts, stars, bubbles, a rainbow, fireworks, a halo). They are light and see-through, like the "flair" of a photo app. See kit.ts.
import { INK, bump, clamp, def, detail, ease, lin, paint, pCirc, pEll, pHeart, pSpark, pStar, rad, rnd, saw, wave, TAU } from '../kit.ts';
import type { StickerDef } from '../kit.ts';

export const FLAIR: StickerDef[] = [
  def({
    id: 'fl-sparkles', pack: 'flair', name: 'Twinkles', outline: false, bw: 98, bh: 98, words: 'sparkle twinkle shine glitter stars magic',
    draw: (c, k) => {
      const spots: ReadonlyArray<readonly [number, number, number]> = [[-56, -48, 34], [48, -62, 26], [66, 4, 38], [-70, 24, 22], [-8, 6, 46], [28, 66, 24], [-40, 74, 18]];
      spots.forEach(([x, y, r], i) => {
        const t = 0.25 + 0.75 * bump(saw(k, 1, rnd(i, 1)));
        c.save();
        c.shadowColor = i % 2 ? '#ffd86b' : '#ffffff'; c.shadowBlur = 10;
        pSpark(c, x, y, r * t, i * 0.2);
        paint(c, k, { fill: i % 3 === 0 ? '#fff6b0' : '#ffffff', stroke: i % 2 ? '#ffd24d' : 'rgba(255,255,255,.0)', lw: 1.5 });
        c.restore();
      });
    }
  }),
  def({
    id: 'fl-hearts', pack: 'flair', name: 'Floating hearts', bw: 90, bh: 98, words: 'hearts love floating pink red cute',
    draw: (c, k) => {
      const cols = ['#ff5c8a', '#ff9ec2', '#ff7aa8', '#ffc2d8', '#ff4f7a'];
      for (let i = 0; i < 8; i++) {
        const p = saw(k, 1, i / 8), x = -70 + rnd(i) * 140 + Math.sin(p * TAU + i) * 12, y = 96 - p * 196, s = 20 + rnd(i, 2) * 26;
        c.save(); c.translate(x, y); c.rotate(Math.sin(p * TAU + i) * 0.35);
        pHeart(c, 0, 0, s);
        paint(c, k, { fill: cols[i % cols.length], stroke: INK, lw: 3, alpha: bump(p) });
        c.restore();
      }
    }
  }),
  def({
    id: 'fl-stars', pack: 'flair', name: 'Star shower', bw: 96, bh: 98, words: 'stars shower falling shooting night wish',
    draw: (c, k) => {
      for (let i = 0; i < 6; i++) {
        const p = saw(k, 1, i / 6), x = -80 + rnd(i) * 160 + p * 40, y = -100 + p * 210, r = 14 + rnd(i, 2) * 10, a = bump(p);
        c.beginPath(); c.moveTo(x - 36, y - 40); c.lineTo(x, y);
        paint(c, k, { stroke: '#ffe27a', lw: 5, alpha: 0.5 * a, nosil: true });
        c.save(); c.translate(x, y); c.rotate(p * TAU * 0.5 + i);
        pStar(c, 0, 0, r, r * 0.45, 5);
        paint(c, k, { fill: lin(c, 0, -r, 0, r, [[0, '#fff7b0'], [1, '#ffbf1f']]), stroke: INK, lw: 3, alpha: a });
        c.restore();
      }
    }
  }),
  def({
    id: 'fl-bubbles', pack: 'flair', name: 'Bubbles', bw: 94, bh: 98, words: 'bubbles soap rising water dreamy',
    draw: (c, k) => {
      for (let i = 0; i < 9; i++) {
        const p = saw(k, 1, i / 9), r = 10 + rnd(i, 3) * 22, x = -74 + rnd(i) * 148 + Math.sin(p * TAU + i) * 10, y = 100 - p * 200;
        pCirc(c, x, y, r);
        paint(c, k, { fill: rad(c, x - r * 0.3, y - r * 0.3, r * 0.1, r, [[0, 'rgba(255,255,255,.55)'], [1, 'rgba(160,220,255,.22)']]), stroke: 'rgba(255,255,255,.9)', lw: 2.5, alpha: clamp(bump(p) * 2) });
        detail(k, () => { pEll(c, x - r * 0.35, y - r * 0.4, r * 0.28, r * 0.14, -0.7); paint(c, k, { fill: '#fff', alpha: clamp(bump(p) * 2) }); });
      }
    }
  }),
  def({
    id: 'fl-rainbow', pack: 'flair', name: 'Rainbow', bw: 98, bh: 70, words: 'rainbow clouds happy cute pastel',
    draw: (c, k) => {
      const cols = ['#ff5d6c', '#ff9a4d', '#ffd34d', '#7ed957', '#4da6ff', '#9b6bff'];
      c.save(); c.translate(0, 12 + wave(k, 2) * 2.5);
      cols.forEach((col, i) => {
        c.beginPath(); c.arc(0, 40, 84 - i * 11, Math.PI, 0);
        paint(c, k, { stroke: col, lw: 12.5 });
      });
      for (const sx of [-1, 1]) {
        const bob = wave(k, 1, sx * 0.1) * 2;
        c.save(); c.translate(sx * 76, 44 + bob);
        for (const [x, y, r] of [[-16, 4, 15], [0, -6, 19], [17, 4, 15], [0, 8, 17]] as const) { pCirc(c, x, y, r); paint(c, k, { fill: '#fff', stroke: INK, lw: 4 }); }
        for (const [x, y, r] of [[-16, 4, 13], [0, -6, 17], [17, 4, 13], [0, 8, 15]] as const) { pCirc(c, x, y, r); paint(c, k, { fill: '#fff' }); }
        c.restore();
      }
      c.restore();
    }
  }),
  def({
    id: 'fl-fireworks', pack: 'flair', name: 'Fireworks', outline: false, bw: 100, bh: 100, words: 'fireworks celebrate party new year burst',
    draw: (c, k) => {
      const cols = ['#ff5d8f', '#ffd34d', '#5ee3ff', '#b58cff'];
      for (let b = 0; b < 2; b++) {
        const p = saw(k, 1, b * 0.5), cx = b ? 44 : -40, cy = b ? -34 : -10, e = ease(Math.min(1, p / 0.55)), a = 1 - ease(clamp((p - 0.5) / 0.5));
        for (let i = 0; i < 16; i++) {
          const ang = (i / 16) * TAU, r0 = e * 68, r1 = r0 + 24 * (1 - e) + 8;
          c.beginPath(); c.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0); c.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
          c.save(); c.shadowColor = cols[(i + b) % 4]; c.shadowBlur = 8;
          paint(c, k, { stroke: cols[(i + b) % 4], lw: 4.5, alpha: a });
          c.restore();
          pCirc(c, cx + Math.cos(ang + 0.1) * (r1 + 8), cy + Math.sin(ang + 0.1) * (r1 + 8) + e * 8, 2.2);
          paint(c, k, { fill: '#fff', alpha: a * 0.9 });
        }
      }
    }
  }),
  def({
    id: 'fl-halo', pack: 'flair', name: 'Halo', outline: false, bw: 86, bh: 40, words: 'halo angel gold ring shine blessed',
    draw: (c, k) => {
      c.save(); c.translate(0, wave(k, 2) * 3);
      pEll(c, 0, 0, 70, 20);
      paint(c, k, { stroke: 'rgba(255,214,90,.35)', lw: 22 });
      pEll(c, 0, 0, 70, 20);
      paint(c, k, { stroke: lin(c, -70, 0, 70, 0, [[0, '#ffe58a'], [0.5, '#fff7c9'], [1, '#e8a91a']]), lw: 10 });
      const x = -100 + saw(k, 1) * 200;
      c.save(); pEll(c, 0, 0, 74, 24); c.clip(); c.beginPath(); c.moveTo(x, -40); c.lineTo(x + 18, -40); c.lineTo(x - 6, 40); c.lineTo(x - 24, 40); c.closePath(); c.fillStyle = 'rgba(255,255,255,.7)'; c.fill(); c.restore();
      c.restore();
      for (const [x, y, o] of [[-82, -30, 0], [84, -24, 0.5], [0, -44, 0.25]] as const) {
        pSpark(c, x, y, 6 + 11 * bump(saw(k, 1, o)), 0);
        paint(c, k, { fill: '#fff6b0' });
      }
    }
  })
];
