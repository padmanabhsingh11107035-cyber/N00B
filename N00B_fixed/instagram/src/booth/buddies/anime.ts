// Anime buddies: Kitsu (a three-tailed fox spirit with foxfire), Kuro (a ninja cat with a shuriken) and Onigi (a rice ball with a sprout). Original characters, drawn in code; see parts.ts.
import { INK, TAU, def, lin, paint, pCirc, pEll, pPoly, pRR, pStar, rad, saw, wave } from '../kit.ts';
import type { Ctx, Kit, StickerDef } from '../kit.ts';
import { GROUND, ball, bead, bigEye, blinkOf, blush, catMouth, glow, gloss, ground, hopOf, limb, paw, smile } from './parts.ts';

const FOX = ['#ffcd96', '#f68e40', '#c4501c'] as const;
const NAVY = ['#7587b0', '#3a4870', '#181e36'] as const;

/** a little flame of foxfire: a soft blue glow and a flame with a pale heart */
function wisp(c: Ctx, k: Kit, x: number, y: number, s: number, flick: number): void {
  glow(c, k, x, y, 22 * s, '120,225,255', 0.5);
  c.save(); c.translate(x, y); c.scale(s, s * (1 + flick * 0.12));
  c.beginPath(); c.moveTo(0, -16); c.quadraticCurveTo(11, -3, 0, 9); c.quadraticCurveTo(-11, -3, 0, -16); c.closePath();
  paint(c, k, { fill: lin(c, 0, -16, 0, 9, [[0, '#e9ffff'], [1, '#4cc3ff']]), stroke: INK, lw: 2.6 });
  pEll(c, 0, 0, 3.4, 5); paint(c, k, { fill: '#ffffff' });
  c.restore();
}

export const ANIME_BUDDIES: StickerDef[] = [
  def({
    id: 'bd-kitsu', pack: 'buddy', name: 'Kitsu', bw: 78, bh: 96, outline: false,
    words: 'kitsu kitsune fox spirit anime japan japanese manga three tails foxfire shrine kawaii',
    buddy: { field: 'anime', tagline: 'Fox spirit', size: 0.54, accent: '#4da6ff' },
    draw: (c, k) => {
      const b = blinkOf(k, 0.45), br = 1 + wave(k, 2) * 0.012, hop = hopOf(k, 2, 0.1) * 3;
      ground(c, 58, hop);
      for (let i = 0; i < 3; i++) { const a = k.ph + (i * TAU) / 3; if (Math.sin(a) < -1e-9) wisp(c, k, Math.cos(a) * 84, -8 + Math.sin(a) * 22, 0.9, wave(k, 3, i / 3)); }
      c.save();
      c.translate(0, -hop);
      c.translate(0, GROUND); c.scale(1, br); c.translate(0, -GROUND);
      // three tails, with a pale tip
      const tail = (ang: number, len: number, ph: number): void => {
        const path = (): void => {
          c.beginPath(); c.moveTo(-8, 0); c.bezierCurveTo(-26, -12, -28, -50, -3, -len); c.bezierCurveTo(8, -len + 6, 27, -48, 22, -14); c.bezierCurveTo(21, -6, 12, -1, 8, 0); c.closePath();
        };
        c.save(); c.translate(0, 66); c.rotate(ang + wave(k, 1, ph) * 0.07);
        path(); paint(c, k, { fill: lin(c, -26, 0, 26, -len, [[0, FOX[2]], [0.35, FOX[1]], [1, '#ffb066']]) });
        c.save(); path(); c.clip(); pEll(c, -2, -len - 4, 34, 22); paint(c, k, { fill: '#fff6e6' }); c.restore();
        path(); paint(c, k, { stroke: INK, lw: 4.5 });
        c.restore();
      };
      tail(1.45, 74, 0.7); tail(0.98, 86, 0.4); tail(0.5, 96, 0);
      // legs and sandals
      for (const s of [-1, 1]) { limb(c, k, s * 12, 72, s * 12, 82, 11, '#fff3de'); pEll(c, s * 13, 88, 13.5, 6.4); paint(c, k, { fill: lin(c, 0, 82, 0, 94, [[0, '#8a4a2c'], [1, '#4a2216']]), stroke: INK, lw: 4 }); }
      // the white robe, a red sash and a gold bell
      pRR(c, -27, 12, 54, 64, 20); paint(c, k, { fill: lin(c, -27, 12, 27, 76, [[0, '#ffffff'], [1, '#e6dccb']]), stroke: INK, lw: 4.5 });
      pPoly(c, [[-12, 12], [0, 32], [12, 12]]); paint(c, k, { fill: '#e03a3a', stroke: INK, lw: 3 });
      pRR(c, -28, 48, 56, 13, 3); paint(c, k, { fill: lin(c, 0, 48, 0, 61, [[0, '#f0524f'], [1, '#b82828']]), stroke: INK, lw: 3.6 });
      c.beginPath(); c.moveTo(0, 61); c.lineTo(0, 66); paint(c, k, { stroke: INK, lw: 2 });
      pCirc(c, 0, 70, 5.4); paint(c, k, { fill: ball(c, 0, 70, 5.4, '#fff1a8', '#ffc83d', '#b8780c'), stroke: INK, lw: 2.4 });
      // the arms
      limb(c, k, 24, 26, 40, 52, 14, '#fff6ea');
      paw(c, k, 41, 56, 7.6, FOX[0], FOX[1], FOX[2]);
      const w = wave(k, 3);
      limb(c, k, -24, 26, -52, 4 + w * 3, 14, '#fff6ea', -46, 26);
      paw(c, k, -54, 0 + w * 3, 7.8, FOX[0], FOX[1], FOX[2]);
      // the ears
      for (const s of [-1, 1]) {
        const ear = (): void => { c.beginPath(); c.moveTo(s * 42, -36); c.lineTo(s * 36, -94); c.lineTo(s * 8, -54); c.closePath(); };
        ear(); paint(c, k, { fill: lin(c, 0, -94, 0, -36, [[0, '#f9a35a'], [1, FOX[1]]]) });
        c.save(); ear(); c.clip(); pEll(c, s * 36, -96, 20, 22); paint(c, k, { fill: '#5a2a1c' }); c.restore();
        ear(); paint(c, k, { stroke: INK, lw: 4.5 });
        pPoly(c, [[s * 36, -46], [s * 33, -78], [s * 18, -55]]); paint(c, k, { fill: '#ffe2cf' });
      }
      // the head, with cheek fur
      for (const s of [-1, 1]) { pPoly(c, [[s * 40, -22], [s * 62, -12], [s * 56, -3], [s * 42, 4]]); paint(c, k, { fill: '#fff6e6', stroke: INK, lw: 4 }); }
      pEll(c, 0, -22, 46, 35); paint(c, k, { fill: ball(c, 0, -22, 48, FOX[0], FOX[1], FOX[2]), stroke: INK, lw: 4.5 });
      c.save(); pEll(c, 0, -22, 46, 35); c.clip(); pEll(c, 0, 4, 36, 21); paint(c, k, { fill: lin(c, 0, -14, 0, 24, [[0, '#fff9ee'], [1, '#fde6c8']]) }); c.restore();
      gloss(c, k, -22, -46, 12, 4.6, -0.5, 0.35);
      for (const s of [-1, 1]) { bigEye(c, k, s * 18, -22, 9.5, 11.5, ['#ffe7a0', '#e8801a'], b); c.beginPath(); c.moveTo(s * 33, -12); c.lineTo(s * 43, -9); paint(c, k, { stroke: '#d9362d', lw: 2.6 }); }
      pEll(c, 0, -9, 4.4, 3.2); paint(c, k, { fill: '#3a2230', stroke: INK, lw: 1.5 });
      catMouth(c, k, 0, -4.5, 4.6);
      blush(c, k, -29, -6, 6.6, 4, 0.42); blush(c, k, 29, -6, 6.6, 4, 0.42);
      pCirc(c, 0, -44, 3.2); paint(c, k, { fill: '#e03a3a' });
      c.restore();
      for (let i = 0; i < 3; i++) { const a = k.ph + (i * TAU) / 3; if (Math.sin(a) >= -1e-9) wisp(c, k, Math.cos(a) * 84, -8 + Math.sin(a) * 22, 1, wave(k, 3, i / 3)); }
    }
  }),
  def({
    id: 'bd-kuro', pack: 'buddy', name: 'Kuro', bw: 70, bh: 96, outline: false,
    words: 'kuro ninja cat anime shuriken japan japanese manga headband scarf warrior shinobi',
    buddy: { field: 'anime', tagline: 'Ninja cat', size: 0.52, accent: '#3a4870' },
    draw: (c, k) => {
      const b = blinkOf(k, 0.7), w = wave(k, 2), lean = wave(k, 2) * 0.03, dip = Math.abs(wave(k, 2)) * 2.5;
      ground(c, 54, 0);
      c.save();
      c.translate(0, GROUND); c.rotate(lean); c.translate(0, -GROUND - dip);
      // the scarf streaming behind
      for (const [dy, len] of [[0, 1], [10, 0.78]] as const) {
        c.beginPath(); c.moveTo(-8, 14 + dy * 0.2); c.quadraticCurveTo(30, 6 + dy + w * 4, 24 + 52 * len, 14 + dy + w * 8 * len); c.lineTo(20 + 52 * len, 28 + dy + w * 8 * len); c.quadraticCurveTo(28, 26 + dy + w * 3, -4, 28 + dy * 0.2); c.closePath();
        paint(c, k, { fill: lin(c, 0, 0, 70, 0, [[0, '#ff7a1c'], [1, '#ffb347']]), stroke: INK, lw: 3.8 });
      }
      // the tail
      limb(c, k, -14, 72, -64, 60, 11, NAVY[1], -50, 92);
      c.beginPath(); c.moveTo(-64, 60); c.quadraticCurveTo(-72, 50 + w * 5, -66, 36 + w * 6); paint(c, k, { stroke: INK, lw: 19 }); paint(c, k, { stroke: NAVY[1], lw: 11 });
      pCirc(c, -66, 36 + w * 6, 6.6); paint(c, k, { fill: '#f4f6ff', stroke: INK, lw: 3.2 });
      // legs and shoes
      for (const s of [-1, 1]) { limb(c, k, s * 13, 70, s * 14, 82, 13, NAVY[2]); pEll(c, s * 15, 88, 14, 6.4); paint(c, k, { fill: lin(c, 0, 82, 0, 94, [[0, '#3a3f58'], [1, '#14172a']]), stroke: INK, lw: 4 }); }
      // the ninja suit and a white belt
      pRR(c, -27, 14, 54, 60, 20); paint(c, k, { fill: lin(c, -27, 14, 27, 74, [[0, '#5a6a94'], [1, '#222a48']]), stroke: INK, lw: 4.5 });
      c.beginPath(); c.moveTo(-16, 18); c.lineTo(10, 46); c.moveTo(16, 18); c.lineTo(-10, 46); paint(c, k, { stroke: 'rgba(255,255,255,.3)', lw: 2.4 });
      pRR(c, -28, 50, 56, 11, 3); paint(c, k, { fill: '#f4f6ff', stroke: INK, lw: 3.4 });
      // the left arm on the hip, the right arm up with a spinning shuriken
      limb(c, k, -24, 28, -44, 42, 12.5, NAVY[2], -44, 28); limb(c, k, -44, 42, -26, 54, 12.5, NAVY[2], -47, 54);
      paw(c, k, -25, 55, 7.6, '#f4f6ff', '#dfe4f6', '#9aa4c8');
      limb(c, k, 24, 28, 58, 12, 12.5, NAVY[2], 52, 30);
      for (const t of [0, 1]) { c.beginPath(); c.moveTo(38 + t * 8, 26 - t * 6); c.lineTo(46 + t * 8, 32 - t * 6); paint(c, k, { stroke: '#f4f6ff', lw: 2.4 }); }
      paw(c, k, 60, 10, 7.6, '#f4f6ff', '#dfe4f6', '#9aa4c8');
      c.save(); c.translate(64, -14); c.rotate(saw(k, 2) * TAU);
      pStar(c, 0, 0, 21, 6.4, 4, -Math.PI / 4); paint(c, k, { fill: lin(c, -20, -20, 20, 20, [[0, '#ffffff'], [0.5, '#b9c2d9'], [1, '#6b7592']]), stroke: INK, lw: 3 });
      pCirc(c, 0, 0, 3.4); paint(c, k, { fill: '#2a2f48' });
      c.restore();
      // the ears
      for (const s of [-1, 1]) {
        pPoly(c, [[s * 44, -34], [s * 38, -90], [s * 12, -56]]); paint(c, k, { fill: lin(c, 0, -90, 0, -34, [[0, NAVY[0]], [1, NAVY[2]]]), stroke: INK, lw: 4.5 });
        pPoly(c, [[s * 38, -44], [s * 35, -76], [s * 21, -57]]); paint(c, k, { fill: '#ff9fc2' });
      }
      // the head
      pEll(c, 0, -22, 46, 37); paint(c, k, { fill: ball(c, 0, -22, 47, NAVY[0], NAVY[1], NAVY[2]), stroke: INK, lw: 4.5 });
      c.save(); pEll(c, 0, -22, 46, 37); c.clip(); pEll(c, 0, 1, 28, 19); paint(c, k, { fill: lin(c, 0, -12, 0, 20, [[0, '#ffffff'], [1, '#dfe4f6']]) }); c.restore();
      gloss(c, k, -24, -48, 12, 4.6, -0.5, 0.28);
      for (const s of [-1, 1]) bigEye(c, k, s * 18, -19, 9, 11, ['#d2ffb4', '#2fa84f'], b);
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 10, -34); c.lineTo(s * 27, -30); paint(c, k, { stroke: '#10152a', lw: 3.2 }); }
      pEll(c, 0, -6, 3.8, 2.8); paint(c, k, { fill: '#ff8fb5', stroke: INK, lw: 1.4 });
      catMouth(c, k, 0, -2.4, 4.4);
      for (const s of [-1, 1]) for (const dy of [-2, 4]) { c.beginPath(); c.moveTo(s * 26, -4 + dy); c.lineTo(s * 52, -8 + dy * 2); paint(c, k, { stroke: 'rgba(235,238,255,.85)', lw: 1.6 }); }
      // the headband with a metal plate
      c.beginPath(); c.moveTo(-46, -42); c.quadraticCurveTo(0, -58, 46, -42); c.lineTo(46, -29); c.quadraticCurveTo(0, -45, -46, -29); c.closePath();
      paint(c, k, { fill: lin(c, 0, -52, 0, -30, [[0, '#3b5bd0'], [1, '#1d2f86']]), stroke: INK, lw: 4 });
      pRR(c, -17, -53, 34, 21, 5); paint(c, k, { fill: lin(c, -17, -53, 17, -32, [[0, '#ffffff'], [0.5, '#c4ccdf'], [1, '#7a849f']]), stroke: INK, lw: 3 });
      c.beginPath(); c.arc(0, -42, 5.6, Math.PI * 0.35, Math.PI * 1.65); paint(c, k, { stroke: '#2a2f48', lw: 2.4 });
      c.beginPath(); c.moveTo(-44, -38); c.quadraticCurveTo(-62, -34 + w * 4, -76, -26 + w * 8); c.lineTo(-72, -16 + w * 8); c.quadraticCurveTo(-58, -26 + w * 3, -43, -30); c.closePath();
      paint(c, k, { fill: '#2a3fa8', stroke: INK, lw: 3.2 });
      c.restore();
    }
  }),
  def({
    id: 'bd-onigi', pack: 'buddy', name: 'Onigi', bw: 62, bh: 96, outline: false,
    words: 'onigi onigiri rice ball japanese food sushi anime kawaii cute sprout seaweed nori',
    buddy: { field: 'anime', tagline: 'Rice ball', size: 0.46, accent: '#7ac96b' },
    draw: (c, k) => {
      const hop = hopOf(k, 2), up = hop * 14, b = blinkOf(k, 0.35), land = hop < 0.14 ? 1 - hop / 0.14 : 0, sy = 1 - land * 0.08, sx = 1 + land * 0.06, sprout = wave(k, 2) * 0.16;
      ground(c, 52, up);
      c.save();
      c.translate(0, -up);
      c.translate(0, GROUND); c.scale(sx, sy); c.translate(0, -GROUND);
      // feet
      for (const s of [-1, 1]) { pEll(c, s * 17, 88, 13, 6.4); paint(c, k, { fill: lin(c, 0, 82, 0, 94, [[0, '#ffffff'], [1, '#e1d8c6']]), stroke: INK, lw: 4 }); }
      // the sprout on top
      c.save(); c.translate(0, -60); c.rotate(sprout);
      c.beginPath(); c.moveTo(0, 2); c.quadraticCurveTo(-2, -12, 1, -24); paint(c, k, { stroke: INK, lw: 7 }); paint(c, k, { stroke: '#4aa84a', lw: 3 });
      for (const s of [-1, 1]) {
        c.save(); c.translate(0, -22); c.rotate(s * 0.7);
        pEll(c, s * 9, -3, 10, 5.4); paint(c, k, { fill: lin(c, 0, -8, 0, 2, [[0, '#b6f58a'], [1, '#3fae44']]), stroke: INK, lw: 3 });
        c.restore();
      }
      c.restore();
      // the rice ball
      const body = (): void => {
        c.beginPath(); c.moveTo(0, -62); c.bezierCurveTo(16, -62, 54, 26, 56, 58); c.quadraticCurveTo(57, 82, 30, 82); c.lineTo(-30, 82); c.quadraticCurveTo(-57, 82, -56, 58); c.bezierCurveTo(-54, 26, -16, -62, 0, -62); c.closePath();
      };
      body(); paint(c, k, { fill: rad(c, -18, -20, 4, 96, [[0, '#ffffff'], [0.6, '#f6f1e6'], [1, '#d7cebc']]) });
      c.save(); body(); c.clip();
      for (const [x, y, r] of [[-22, -20, 0.3], [18, -30, -0.4], [-34, 20, 0.5], [30, 6, 0.2], [-8, -44, -0.3], [40, 34, 0.6]] as const) { pEll(c, x, y, 3.6, 1.8, r); paint(c, k, { fill: 'rgba(140,125,95,.22)' }); }
      c.beginPath(); c.moveTo(-60, 46); c.quadraticCurveTo(-30, 40, 0, 46); c.quadraticCurveTo(30, 52, 60, 44); c.lineTo(60, 90); c.lineTo(-60, 90); c.closePath();
      paint(c, k, { fill: lin(c, 0, 44, 0, 84, [[0, '#2d4a3c'], [1, '#13241d']]) });
      pEll(c, -22, 60, 16, 4.4, -0.2); paint(c, k, { fill: 'rgba(255,255,255,.16)' });
      c.restore();
      body(); paint(c, k, { stroke: INK, lw: 4.5 });
      // the face
      bead(c, k, -17, 12, 8.2, b); bead(c, k, 17, 12, 8.2, b);
      smile(c, k, 0, 22, 6, 6, 3);
      blush(c, k, -28, 22, 7, 4.4, 0.5); blush(c, k, 28, 22, 7, 4.4, 0.5);
      // the arms
      const wv = wave(k, 2);
      limb(c, k, -50, 30, -66, 44 - wv * 6, 9, '#fbf7ee'); pCirc(c, -67, 45 - wv * 6, 6); paint(c, k, { fill: '#fff', stroke: INK, lw: 3.4 });
      limb(c, k, 50, 30, 66, 16 + wv * 8, 9, '#fbf7ee', 62, 26); pCirc(c, 67, 13 + wv * 8, 6); paint(c, k, { fill: '#fff', stroke: INK, lw: 3.4 });
      c.restore();
    }
  })
];
