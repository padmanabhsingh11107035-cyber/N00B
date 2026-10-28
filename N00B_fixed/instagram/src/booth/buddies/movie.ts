// Movie buddies: Clappy (a clapperboard that claps) and Poppy (a popcorn bucket whose popcorn pops). Original characters, drawn in code; see parts.ts.
import { INK, bump, def, label, lin, paint, pCirc, pEll, pPoly, pRR, rad, saw, wave } from '../kit.ts';
import type { Ctx, Kit, StickerDef } from '../kit.ts';
import { EYE, GROUND, ball, bead, blinkOf, blush, grin, ground, hopOf, limb, smile } from './parts.ts';

/** a white glove: a round hand with two finger lines */
function glove(c: Ctx, k: Kit, x: number, y: number, r: number): void {
  pCirc(c, x, y, r); paint(c, k, { fill: ball(c, x, y, r, '#ffffff', '#fbfbff', '#c9cde0'), stroke: INK, lw: 3.6 });
  c.beginPath(); c.moveTo(x - r * 0.4, y - r * 0.15); c.lineTo(x - r * 0.4, y - r * 0.7); c.moveTo(x + r * 0.05, y - r * 0.3); c.lineTo(x + r * 0.05, y - r * 0.85); paint(c, k, { stroke: 'rgba(60,60,90,.55)', lw: 1.6 });
}

export const MOVIE_BUDDIES: StickerDef[] = [
  def({
    id: 'bd-clappy', pack: 'buddy', name: 'Clappy', bw: 66, bh: 96, outline: false,
    words: 'clappy clapperboard clapper board movie film cinema director action cut scene take hollywood bollywood',
    buddy: { field: 'movies', tagline: 'Clapperboard', size: 0.5, accent: '#f2a900' },
    draw: (c, k) => {
      const step = wave(k, 3), lift = Math.abs(step) * 2.5, open = Math.pow(Math.max(0, Math.sin(k.ph * 3)), 0.6), b = blinkOf(k, 0.62);
      ground(c, 52, lift);
      c.save();
      c.translate(0, -lift);
      // legs and shoes (it walks on the spot)
      for (const s of [-1, 1]) {
        const up = Math.max(0, step * s) * 4;
        limb(c, k, s * 17, 74, s * 17, 84 - up, 7, '#2d2d3a', undefined, undefined, 3.4);
        pEll(c, s * 19, 88 - up, 15, 6.6); paint(c, k, { fill: lin(c, 0, 82, 0, 94, [[0, '#ffe27a'], [1, '#f0a800']]), stroke: INK, lw: 4 });
      }
      // the stripes of a clapper
      const bar = (x: number, y: number, w: number, h: number, flip: boolean): void => {
        pRR(c, x, y, w, h, 3); paint(c, k, { fill: '#f4f4fb' });
        c.save(); pRR(c, x, y, w, h, 3); c.clip();
        for (let i = 0; i < 6; i++) { const sx = x + i * (w / 5) - 6, d = flip ? -h * 0.9 : h * 0.9; pPoly(c, [[sx, y], [sx + w / 10, y], [sx + w / 10 + d, y + h], [sx + d, y + h]]); paint(c, k, { fill: '#23232e' }); }
        c.restore();
        pRR(c, x, y, w, h, 3); paint(c, k, { stroke: INK, lw: 4 });
      };
      // the board
      pRR(c, -42, -8, 84, 84, 6);
      paint(c, k, { fill: lin(c, -42, -8, 42, 76, [[0, '#454558'], [1, '#1c1c27']]), stroke: INK, lw: 4.5 });
      bar(-42, -22, 84, 14, false);
      c.save();
      c.translate(-42, -24); c.rotate(-open * 0.5); c.translate(42, 24);
      bar(-42, -38, 84, 14, true);
      c.restore();
      pCirc(c, -42, -24, 4); paint(c, k, { fill: '#c9cde0', stroke: INK, lw: 2.4 });
      // the face on the board
      for (const s of [-1, 1]) {
        const x = s * 17, y = 14, hh = 11 * (1 - b * 0.9);
        pEll(c, x, y, 10, hh); paint(c, k, { fill: '#fff', stroke: INK, lw: 2.8 });
        if (b < 0.5) { pEll(c, x + 1, y + 1.5, 5.2, 6.4); paint(c, k, { fill: EYE }); pCirc(c, x - 0.6, y - 1.8, 2); paint(c, k, { fill: '#fff' }); }
      }
      grin(c, k, 0, 30, 11, 9);
      blush(c, k, -31, 30, 6.4, 4, 0.45); blush(c, k, 31, 30, 6.4, 4, 0.45);
      label(c, k, 'ACTION!', 0, 62, 12, { fill: '#ffd34d', weight: 900 });
      // the arms with white gloves
      const w = wave(k, 3, 0.25);
      limb(c, k, -42, 34, -58, 46, 8, '#e9e9f4', -52, 38, 3.6);
      glove(c, k, -60, 48, 9);
      limb(c, k, 42, 34, 58, 26 + w * 5, 8, '#e9e9f4', 54, 34, 3.6);
      glove(c, k, 60, 22 + w * 6, 9);
      c.restore();
    }
  }),
  def({
    id: 'bd-poppy', pack: 'buddy', name: 'Poppy', bw: 64, bh: 96, outline: false,
    words: 'poppy popcorn bucket movie cinema snack film popping corn butter theatre',
    buddy: { field: 'movies', tagline: 'Popcorn bucket', size: 0.48, accent: '#e63946' },
    draw: (c, k) => {
      const hop = hopOf(k, 3), up = hop * 8, b = blinkOf(k, 0.3), sway = wave(k, 3) * 0.03;
      ground(c, 52, up);
      c.save();
      c.translate(0, -up);
      c.translate(0, GROUND); c.rotate(sway); c.translate(0, -GROUND);
      // legs and sneakers
      for (const s of [-1, 1]) {
        limb(c, k, s * 17, 74, s * 17, 85, 10, '#fff6df');
        pEll(c, s * 19, 88, 15, 6.6); paint(c, k, { fill: lin(c, 0, 82, 0, 94, [[0, '#ff6b78'], [1, '#c9212f']]), stroke: INK, lw: 4 });
        pEll(c, s * 24, 88, 6.4, 5); paint(c, k, { fill: '#fff' });
      }
      // the popcorn: the back row first, then the ones that pop
      const kernel = (x: number, y: number, r: number, rot: number): void => {
        c.save(); c.translate(x, y); c.rotate(rot);
        for (const [dx, dy, rr] of [[-0.8, 0.5, 1], [0.9, 0.55, 0.95], [0, -0.7, 1.05]] as const) {
          pCirc(c, dx * r, dy * r, rr * r);
          paint(c, k, { fill: rad(c, dx * r - r * 0.3, dy * r - r * 0.35, 1, rr * r * 1.3, [[0, '#ffffff'], [0.6, '#fff1b8'], [1, '#f2c75a']]), stroke: INK, lw: 3 });
        }
        pEll(c, r * 0.3, r * 0.1, r * 0.22, r * 0.16); paint(c, k, { fill: '#e8a63a' });
        c.restore();
      };
      for (const [x, y, r, rot] of [[-30, -14, 10, 0.3], [-10, -22, 11, -0.2], [12, -22, 11, 0.4], [32, -14, 10, -0.3]] as const) kernel(x, y, r, rot);
      for (let i = 0; i < 3; i++) {
        const p = bump(saw(k, 1, i / 3)), x = (i - 1) * 24, y = -34 - p * 30 + (i === 1 ? -6 : 0);
        kernel(x, y, 10.5, (i - 1) * 0.5 + p * 1.6);
      }
      // the bucket: red and white stripes
      const top = -6, bot = 78;
      c.beginPath(); c.moveTo(-43, top); c.lineTo(43, top); c.lineTo(33, bot); c.lineTo(-33, bot); c.closePath();
      paint(c, k, { fill: '#fff' });
      c.save(); c.clip();
      for (let i = 0; i < 7; i += 2) { const xt = -43 + i * 12.3, xb = -33 + i * 9.5; pPoly(c, [[xt, top], [xt + 12.3, top], [xb + 9.5, bot], [xb, bot]]); paint(c, k, { fill: lin(c, 0, top, 0, bot, [[0, '#f0525e'], [1, '#c4202e']]) }); }
      pRR(c, -50, top, 24, 90, 0); paint(c, k, { fill: 'rgba(255,255,255,.2)' });
      c.restore();
      c.beginPath(); c.moveTo(-43, top); c.lineTo(43, top); c.lineTo(33, bot); c.quadraticCurveTo(0, bot + 6, -33, bot); c.closePath();
      paint(c, k, { stroke: INK, lw: 4.5 });
      pRR(c, -47, -14, 94, 12, 6); paint(c, k, { fill: lin(c, 0, -14, 0, -2, [[0, '#ff6b78'], [1, '#c4202e']]), stroke: INK, lw: 4 });
      // the face on a round label
      pEll(c, 0, 36, 25, 23); paint(c, k, { fill: lin(c, 0, 13, 0, 59, [[0, '#fffdf2'], [1, '#ffeec2']]), stroke: INK, lw: 3.4 });
      bead(c, k, -10, 32, 5.6, b); bead(c, k, 10, 32, 5.6, b);
      smile(c, k, 0, 40, 6, 5.4, 2.8);
      blush(c, k, -17, 40, 5, 3.4, 0.5); blush(c, k, 17, 40, 5, 3.4, 0.5);
      // the arms
      limb(c, k, -42, 30, -58, 46 + wave(k, 3) * 2, 9, '#fff6df');
      glove(c, k, -59, 48 + wave(k, 3) * 2, 8.4);
      limb(c, k, 42, 30, 58, 14 + wave(k, 3, 0.25) * 6, 9, '#fff6df', 56, 26);
      glove(c, k, 59, 10 + wave(k, 3, 0.25) * 6, 8.4);
      c.restore();
    }
  })
];
