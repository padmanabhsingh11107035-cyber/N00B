// K-Pop buddies: Bunby (a lilac bunny idol with a light stick) and Cleo (a black cat with heart shades and a pink microphone). Original characters, drawn in code; see parts.ts.
import { INK, bump, def, lin, paint, pCirc, pEll, pHeart, pPoly, pRR, pStar, saw, wave } from '../kit.ts';
import type { StickerDef } from '../kit.ts';
import { GROUND, ball, bead, blinkOf, blush, catMouth, glow, gloss, ground, hopOf, limb, paw, twinkle } from './parts.ts';

const FUR = ['#f1e4ff', '#c29dfc', '#8656dc'] as const;

export const KPOP_BUDDIES: StickerDef[] = [
  def({
    id: 'bd-bunby', pack: 'buddy', name: 'Bunby', bw: 66, bh: 96, outline: false,
    words: 'bunby bunny rabbit idol kpop k-pop bts army purple lightstick singer star concert',
    buddy: { field: 'kpop', tagline: 'K-Pop idol bunny', size: 0.5, accent: '#9b4dff' },
    draw: (c, k) => {
      const up = hopOf(k, 3) * 8, b = blinkOf(k, 0.55), sway = wave(k, 3) * 0.03;
      ground(c, 52, up);
      c.save();
      c.translate(0, -up);
      c.translate(0, GROUND); c.rotate(sway); c.translate(0, -GROUND);
      // the ears (behind the head): the right one is floppy
      const ear = (side: number, bend: number): void => {
        c.save(); c.translate(side * 22, -52); c.rotate(side * 0.16 + bend);
        pEll(c, 0, -24, 12.5, 28);
        paint(c, k, { fill: lin(c, -12, -52, 12, 4, [[0, FUR[0]], [0.5, FUR[1]], [1, FUR[2]]]), stroke: INK, lw: 4 });
        pEll(c, 0, -22, 6.2, 20); paint(c, k, { fill: lin(c, 0, -42, 0, -2, [[0, '#ffd7ee'], [1, '#ff9fcf']]) });
        c.restore();
      };
      ear(-1, wave(k, 1) * 0.05);
      ear(1, 0.42 + wave(k, 1, 0.3) * 0.07);
      // legs and shoes
      for (const s of [-1, 1]) {
        limb(c, k, s * 14, 68, s * 14, 80, 14, FUR[1]);
        pEll(c, s * 15, 84, 17, 9);
        paint(c, k, { fill: lin(c, 0, 76, 0, 93, [[0, '#ffffff'], [1, '#dcd2f5']]), stroke: INK, lw: 4 });
        pRR(c, s * 15 - 12, 83, 24, 4.5, 2); paint(c, k, { fill: '#7c3aed' });
      }
      // the jacket
      pRR(c, -29, 14, 58, 60, 24);
      paint(c, k, { fill: lin(c, -29, 14, 29, 74, [[0, '#8a55ec'], [1, '#4d24b0']]), stroke: INK, lw: 4.5 });
      c.beginPath(); c.moveTo(0, 24); c.lineTo(0, 72); paint(c, k, { stroke: '#ffd34d', lw: 2.6 });
      pStar(c, -14, 42, 9, 4.2); paint(c, k, { fill: '#ffd34d', stroke: INK, lw: 2.2 });
      pRR(c, -29, 66, 58, 8, 4); paint(c, k, { fill: '#ffd34d', stroke: INK, lw: 3 });
      // the arm that hangs
      const sw = wave(k, 3) * 3;
      limb(c, k, -26, 28, -42 + sw, 54, 13, '#7a45e6');
      paw(c, k, -42 + sw, 56, 8, FUR[0], FUR[1], FUR[2]);
      // the head
      pEll(c, 0, -20, 45, 38);
      paint(c, k, { fill: ball(c, 0, -20, 46, FUR[0], FUR[1], FUR[2]), stroke: INK, lw: 4.5 });
      gloss(c, k, -22, -46, 13, 5.5, -0.5, 0.45);
      // the headset
      c.beginPath(); c.arc(0, -20, 49, Math.PI * 1.1, Math.PI * 1.9); paint(c, k, { stroke: INK, lw: 9 }); paint(c, k, { stroke: '#6d3bd6', lw: 4.5 });
      for (const s of [-1, 1]) { pCirc(c, s * 46, -18, 9); paint(c, k, { fill: ball(c, s * 46, -18, 9, '#b794ff', '#6d3bd6', '#3d1a85'), stroke: INK, lw: 3.5 }); pCirc(c, s * 46, -18, 4); paint(c, k, { fill: '#ffd34d' }); }
      c.beginPath(); c.moveTo(46, -9); c.quadraticCurveTo(44, 9, 17, 2); paint(c, k, { stroke: '#2a1a4a', lw: 3.4 });
      pCirc(c, 16, 2, 4.6); paint(c, k, { fill: '#2a1a4a', stroke: INK, lw: 2 });
      // the face
      bead(c, k, -17, -22, 10.5, b); bead(c, k, 17, -22, 10.5, b);
      pEll(c, 0, -12, 4.6, 3.4); paint(c, k, { fill: '#ff7fb5', stroke: INK, lw: 1.8 });
      catMouth(c, k, 0, -8, 4.4);
      blush(c, k, -31, -9, 8, 5); blush(c, k, 31, -9, 8, 5);
      pStar(c, -27, -35, 5.4, 2.4); paint(c, k, { fill: '#ffd34d', stroke: INK, lw: 1.6 });
      // the arm that waves the light stick (in front of the head, out to the side)
      c.save();
      c.translate(26, 28); c.rotate(wave(k, 3, 0.25) * 0.16); c.translate(-26, -28);
      glow(c, k, 70, -46, 42, '200,140,255', 0.55 + 0.25 * wave(k, 3));
      c.beginPath(); c.moveTo(66, 14); c.lineTo(68, -30); paint(c, k, { stroke: INK, lw: 11 }); paint(c, k, { stroke: '#f4ecff', lw: 6 });
      pHeart(c, 70, -46, 34);
      paint(c, k, { fill: lin(c, 56, -62, 84, -30, [[0, '#ffe1ff'], [0.5, '#c77dff'], [1, '#8b3dff']]), stroke: INK, lw: 4 });
      gloss(c, k, 63, -53, 5.4, 3, -0.7, 0.8);
      limb(c, k, 26, 28, 62, 8, 13, '#7a45e6', 50, 30);
      paw(c, k, 66, 8, 8.5, FUR[0], FUR[1], FUR[2]);
      c.restore();
      c.restore();
    }
  }),
  def({
    id: 'bd-cleo', pack: 'buddy', name: 'Cleo', bw: 70, bh: 96, outline: false,
    words: 'cleo cat kitten black pink blackpink blink idol kpop k-pop sunglasses microphone star diva',
    buddy: { field: 'kpop', tagline: 'K-Pop star cat', size: 0.5, accent: '#ff4fb0' },
    draw: (c, k) => {
      const sway = wave(k, 2) * 0.035, lift = Math.abs(wave(k, 2)) * 2;
      const FURK = ['#5b5b73', '#2d2d3d', '#14141f'] as const;
      ground(c, 52, lift);
      c.save();
      c.translate(0, -lift);
      c.translate(0, GROUND); c.rotate(sway); c.translate(0, -GROUND);
      // the tail
      limb(c, k, 22, 74, 66 + wave(k, 2, 0.1) * 4, 34 + wave(k, 2, 0.3) * 5, 12, FURK[1], 66, 82);
      pCirc(c, 66 + wave(k, 2, 0.1) * 4, 34 + wave(k, 2, 0.3) * 5, 8); paint(c, k, { fill: '#ff5fb3', stroke: INK, lw: 3.5 });
      // the ears: dark outside, pink inside, and a bow
      for (const s of [-1, 1]) {
        pPoly(c, [[s * 44, -34], [s * 38, -90], [s * 12, -56]]);
        paint(c, k, { fill: lin(c, 0, -90, 0, -34, [[0, FURK[0]], [1, FURK[2]]]), stroke: INK, lw: 4.5 });
        pPoly(c, [[s * 38, -42], [s * 35, -76], [s * 20, -56]]); paint(c, k, { fill: '#ff8fc6' });
      }
      // legs and boots
      for (const s of [-1, 1]) {
        limb(c, k, s * 13, 66, s * 13, 80, 13, FURK[1]);
        pRR(c, s * 14 - 14, 76, 28, 17, 8);
        paint(c, k, { fill: lin(c, 0, 76, 0, 93, [[0, '#ff8fcf'], [1, '#e0338f']]), stroke: INK, lw: 4 });
        pRR(c, s * 14 - 14, 88, 28, 5, 2.5); paint(c, k, { fill: '#fff' });
      }
      // the jacket (pink, with a black star)
      pRR(c, -28, 14, 56, 58, 22);
      paint(c, k, { fill: lin(c, -28, 14, 28, 72, [[0, '#ff8fcf'], [1, '#e0338f']]), stroke: INK, lw: 4.5 });
      pStar(c, 0, 44, 13, 5.8); paint(c, k, { fill: '#1b1b28', stroke: INK, lw: 2 });
      pRR(c, -28, 16, 56, 7, 3.5); paint(c, k, { fill: '#1b1b28', stroke: INK, lw: 2.5 });
      // the arm on the hip
      limb(c, k, -26, 28, -47, 42, 12.5, '#e0338f', -46, 28);
      limb(c, k, -47, 42, -26, 54, 12.5, '#e0338f', -49, 54);
      paw(c, k, -25, 55, 7.8, FURK[0], FURK[1], FURK[2]);
      // the head
      pEll(c, 0, -22, 46, 38);
      paint(c, k, { fill: ball(c, 0, -22, 47, FURK[0], FURK[1], FURK[2]), stroke: INK, lw: 4.5 });
      pEll(c, 0, -6, 20, 14); paint(c, k, { fill: 'rgba(120,120,150,.55)' });
      gloss(c, k, -24, -48, 12, 4.6, -0.5, 0.28);
      for (const s of [-1, 1]) for (const dy of [-4, 3]) { c.beginPath(); c.moveTo(s * 28, -8 + dy); c.lineTo(s * 54, -12 + dy * 2.2); paint(c, k, { stroke: 'rgba(235,235,250,.85)', lw: 1.7 }); }
      // the heart shades
      c.beginPath(); c.moveTo(-6, -27); c.quadraticCurveTo(0, -31, 6, -27); paint(c, k, { stroke: INK, lw: 3.4 });
      c.beginPath(); c.moveTo(-44, -26); c.lineTo(-32, -26); c.moveTo(44, -26); c.lineTo(32, -26); paint(c, k, { stroke: INK, lw: 3.4 });
      for (const s of [-1, 1]) {
        pHeart(c, s * 19, -23, 34);
        paint(c, k, { fill: lin(c, s * 19 - 14, -40, s * 19 + 14, -8, [[0, '#ffb0dc'], [0.5, '#ff4fb0'], [1, '#a8135f']]), stroke: INK, lw: 3.8 });
        gloss(c, k, s * 19 - 6, -32, 6, 2.4, -0.7, 0.75);
      }
      pEll(c, 0, -10, 4, 3); paint(c, k, { fill: '#ff8fc6', stroke: INK, lw: 1.6 });
      catMouth(c, k, 0, -5, 5);
      pPoly(c, [[-2.4, -2.4], [2.4, -2.4], [0, 3.6]]); paint(c, k, { fill: '#fff', stroke: INK, lw: 1.2 });
      blush(c, k, -34, -8, 7, 4.4, 0.32); blush(c, k, 34, -8, 7, 4.4, 0.32);
      // the bow on an ear
      c.save(); c.translate(-32, -66); c.rotate(-0.35);
      for (const s of [-1, 1]) { pEll(c, s * 10, 0, 10.5, 7, s * 0.3); paint(c, k, { fill: lin(c, 0, -7, 0, 7, [[0, '#ffa8d6'], [1, '#e0338f']]), stroke: INK, lw: 3.2 }); }
      pCirc(c, 0, 0, 5); paint(c, k, { fill: '#ff5fb3', stroke: INK, lw: 3 });
      c.restore();
      twinkle(c, k, -31, -36, 4 + 9 * bump(saw(k, 1, 0.15)), 0);
      // the arm with the microphone, in front of the head
      limb(c, k, 26, 28, 44, 28, 12.5, '#e0338f', 44, 38);
      c.beginPath(); c.moveTo(46, 24); c.lineTo(36, 4); paint(c, k, { stroke: INK, lw: 10 }); paint(c, k, { stroke: '#f2f2f8', lw: 5.4 });
      pCirc(c, 33, -3, 10); paint(c, k, { fill: ball(c, 33, -3, 10, '#ffd0ea', '#ff5fb3', '#b0206e'), stroke: INK, lw: 3.6 });
      gloss(c, k, 29.5, -7, 3.6, 2, -0.7, 0.8);
      paw(c, k, 46, 26, 7.8, FURK[0], FURK[1], FURK[2]);
      c.restore();
    }
  })
];
