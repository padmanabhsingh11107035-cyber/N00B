// Cute buddies: Mochi (a squishy rice cake), Boba (a cup of bubble tea) and Waddle (a penguin with headphones). Original characters, drawn in code; see parts.ts.
import { INK, bump, def, lin, paint, pCirc, pEll, pHeart, pRR, rad, saw, wave } from '../kit.ts';
import type { StickerDef } from '../kit.ts';
import { EYE, GROUND, bead, blinkOf, blush, ground, hopOf, limb, smile, twinkle } from './parts.ts';

export const CUTE_BUDDIES: StickerDef[] = [
  def({
    id: 'bd-mochi', pack: 'buddy', name: 'Mochi', bw: 66, bh: 96, outline: false,
    words: 'mochi rice cake daifuku cute soft blob squishy white kawaii sweet dessert japanese',
    buddy: { field: 'cute', tagline: 'Squishy rice cake', size: 0.54, accent: '#ff8fb1' },
    draw: (c, k) => {
      const hop = hopOf(k, 2), up = hop * 16, sy = 0.92 + hop * 0.16, sx = 1 / sy, b = blinkOf(k, 0.5), sway = wave(k, 2) * 0.03;
      ground(c, 56, up);
      c.save();
      c.translate(0, -up);
      c.translate(0, GROUND); c.scale(sx, sy); c.rotate(sway); c.translate(0, -GROUND);
      // feet
      for (const s of [-1, 1]) { pEll(c, s * 22, 89, 14, 6.6); paint(c, k, { fill: lin(c, 0, 83, 0, 95, [[0, '#ffd6e4'], [1, '#ff9fbd']]), stroke: INK, lw: 4 }); }
      // the soft white body
      const body = (): void => {
        c.beginPath(); c.moveTo(0, -30); c.bezierCurveTo(34, -30, 58, 4, 58, 48); c.bezierCurveTo(58, 78, 36, 92, 0, 92); c.bezierCurveTo(-36, 92, -58, 78, -58, 48); c.bezierCurveTo(-58, 4, -34, -30, 0, -30); c.closePath();
      };
      body(); paint(c, k, { fill: rad(c, -20, 0, 4, 100, [[0, '#ffffff'], [0.55, '#fff3f7'], [1, '#f2cddb']]), stroke: INK, lw: 4.5 });
      c.save(); body(); c.clip(); pEll(c, 0, 94, 50, 14); paint(c, k, { fill: 'rgba(255,150,185,.28)' }); pEll(c, -26, 2, 16, 7, -0.7); paint(c, k, { fill: 'rgba(255,255,255,.85)' }); c.restore();
      // the face: a happy shut-eyed smile
      for (const s of [-1, 1]) { c.beginPath(); c.arc(s * 21, 32, 7.4, Math.PI * 1.08, Math.PI * 1.92); paint(c, k, { stroke: EYE, lw: 3.8 * (1 - b * 0.4) }); }
      blush(c, k, -35, 42, 9.5, 6, 0.55); blush(c, k, 35, 42, 9.5, 6, 0.55);
      c.beginPath(); c.moveTo(-6, 41); c.quadraticCurveTo(-3, 47, 0, 41); c.quadraticCurveTo(3, 47, 6, 41); paint(c, k, { stroke: EYE, lw: 3 });
      // the little arms
      const w = wave(k, 2);
      pEll(c, -58, 50 - w * 3, 9.5, 7, 0.5 + w * 0.15); paint(c, k, { fill: '#fff6f9', stroke: INK, lw: 4 });
      pEll(c, 58, 42 + w * 6, 9.5, 7, -0.5 - w * 0.2); paint(c, k, { fill: '#fff6f9', stroke: INK, lw: 4 });
      // a flower on top
      c.save(); c.translate(-20, -30); c.rotate(-0.3 + wave(k, 1) * 0.06);
      for (let i = 0; i < 5; i++) { c.save(); c.rotate((i * Math.PI * 2) / 5); pEll(c, 0, -9, 6.4, 9.4); paint(c, k, { fill: lin(c, 0, -18, 0, 0, [[0, '#ffd0e0'], [1, '#ff8fb5']]), stroke: INK, lw: 2.6 }); c.restore(); }
      pCirc(c, 0, 0, 4.8); paint(c, k, { fill: '#ffe066', stroke: INK, lw: 2.4 });
      c.restore();
      // a heart floats up
      const p = saw(k, 1, 0.2);
      c.save(); c.globalAlpha = bump(p); pHeart(c, 44 + wave(k, 1) * 5, -14 - p * 30, 17); paint(c, k, { fill: '#ff6b9b', stroke: INK, lw: 2.8 }); c.restore();
      twinkle(c, k, 40, -38, 3 + 8 * bump(saw(k, 1, 0.6)), 0);
      c.restore();
    }
  }),
  def({
    id: 'bd-boba', pack: 'buddy', name: 'Boba', bw: 60, bh: 96, outline: false,
    words: 'boba bubble tea milk tea pearls tapioca drink cup straw cute taiwan cafe',
    buddy: { field: 'cute', tagline: 'Bubble tea', size: 0.48, accent: '#c58f5d' },
    draw: (c, k) => {
      const hop = hopOf(k, 2, 0.5), up = hop * 12, b = blinkOf(k, 0.4), sway = wave(k, 2) * 0.03;
      ground(c, 50, up);
      c.save();
      c.translate(0, -up);
      c.translate(0, GROUND); c.rotate(sway); c.translate(0, -GROUND);
      // legs and sneakers
      for (const s of [-1, 1]) { limb(c, k, s * 14, 80, s * 14, 87, 9, '#f2e2c8'); pEll(c, s * 15, 89, 13, 6); paint(c, k, { fill: lin(c, 0, 83, 0, 95, [[0, '#ffa3c7'], [1, '#e8508c']]), stroke: INK, lw: 4 }); }
      // the straw
      const sw = wave(k, 1) * 3;
      c.beginPath(); c.moveTo(6, -20); c.quadraticCurveTo(14 + sw, -58, 24 + sw, -90);
      paint(c, k, { stroke: INK, lw: 13 }); paint(c, k, { stroke: '#fff', lw: 8.6 });
      c.setLineDash([5, 5]); paint(c, k, { stroke: '#ff7fb0', lw: 8.6 }); c.setLineDash([]);
      // the cup
      const cup = (inset: number): void => {
        c.beginPath(); c.moveTo(-37 + inset, -6); c.lineTo(37 - inset, -6); c.lineTo(28 - inset, 78); c.quadraticCurveTo(0, 86, -28 + inset, 78); c.closePath();
      };
      cup(0); paint(c, k, { fill: 'rgba(255,255,255,.3)' });
      c.save(); cup(2);
      c.clip();
      c.beginPath(); c.moveTo(-44, 12);
      for (let x = -44; x <= 44; x += 4) c.lineTo(x, 12 + Math.sin(x * 0.09 + k.ph) * 2.6);
      c.lineTo(44, 90); c.lineTo(-44, 90); c.closePath();
      paint(c, k, { fill: lin(c, 0, 10, 0, 84, [[0, '#f6e0bd'], [1, '#c98f5a']]) });
      for (let i = 0; i < 9; i++) {
        const row = i < 5 ? 0 : 1, x = row ? -15 + (i - 5) * 10 : -20 + i * 10, y = (row ? 62 : 72) + wave(k, 3, i / 9) * 0.9;
        pCirc(c, x, y, 6.2); paint(c, k, { fill: rad(c, x - 2, y - 2.2, 0.5, 8, [[0, '#8a5638'], [1, '#2a160c']]), stroke: 'rgba(30,12,4,.7)', lw: 1.4 });
        pCirc(c, x - 2, y - 2.2, 1.5); paint(c, k, { fill: 'rgba(255,255,255,.75)' });
      }
      pRR(c, -31, 0, 5, 56, 2.5); paint(c, k, { fill: 'rgba(255,255,255,.4)' });
      c.restore();
      cup(0); paint(c, k, { stroke: INK, lw: 4.5 });
      // the lid
      pEll(c, 0, -6, 40, 22); paint(c, k, { fill: lin(c, 0, -28, 0, 8, [[0, '#ffffff'], [1, '#e9dcc9']]), stroke: INK, lw: 4.2 });
      pRR(c, -42, -9, 84, 9, 4.5); paint(c, k, { fill: lin(c, 0, -9, 0, 0, [[0, '#fff'], [1, '#d8c9b2']]), stroke: INK, lw: 3.6 });
      pEll(c, -14, -14, 12, 4.4, -0.3); paint(c, k, { fill: 'rgba(255,255,255,.85)' });
      // the face on the cup
      bead(c, k, -14, 28, 7.2, b); bead(c, k, 14, 28, 7.2, b);
      smile(c, k, 0, 38, 6, 5.4, 2.8);
      blush(c, k, -23, 37, 6, 3.8, 0.5); blush(c, k, 23, 37, 6, 3.8, 0.5);
      // the arms
      const ar = wave(k, 2, 0.25);
      limb(c, k, -37, 34, -54, 48, 9, '#f2e2c8'); pCirc(c, -55, 49, 6.2); paint(c, k, { fill: '#fff6e6', stroke: INK, lw: 3.4 });
      limb(c, k, 36, 34, 54, 20 + ar * 6, 9, '#f2e2c8', 52, 32); pCirc(c, 55, 17 + ar * 6, 6.2); paint(c, k, { fill: '#fff6e6', stroke: INK, lw: 3.4 });
      c.restore();
    }
  }),
  def({
    id: 'bd-waddle', pack: 'buddy', name: 'Waddle', bw: 70, bh: 96, outline: false,
    words: 'waddle penguin headphones scarf winter music cold ice cute bird antarctic',
    buddy: { field: 'cute', tagline: 'Penguin DJ', size: 0.52, accent: '#3a4870' },
    draw: (c, k) => {
      const step = wave(k, 3), b = blinkOf(k, 0.55), tilt = step * 0.06, lift = Math.abs(step) * 2;
      ground(c, 54, lift);
      c.save();
      c.translate(0, GROUND); c.rotate(tilt); c.translate(0, -GROUND - lift);
      // the webbed feet
      for (const s of [-1, 1]) {
        const up = Math.max(0, step * s) * 4;
        pEll(c, s * 17, 90 - up, 16, 6.4); paint(c, k, { fill: lin(c, 0, 84, 0, 96, [[0, '#ffc15a'], [1, '#f08a14']]), stroke: INK, lw: 4 });
      }
      // the body: a dark egg with a white belly
      const egg = (): void => {
        c.beginPath(); c.moveTo(0, -62); c.bezierCurveTo(30, -62, 50, -30, 50, 18); c.bezierCurveTo(50, 62, 32, 88, 0, 88); c.bezierCurveTo(-32, 88, -50, 62, -50, 18); c.bezierCurveTo(-50, -30, -30, -62, 0, -62); c.closePath();
      };
      egg(); paint(c, k, { fill: rad(c, -18, -24, 6, 110, [[0, '#6c86b8'], [0.45, '#33426a'], [1, '#131a30']]), stroke: INK, lw: 4.5 });
      pEll(c, 0, 42, 31, 42); paint(c, k, { fill: lin(c, 0, 0, 0, 84, [[0, '#ffffff'], [1, '#d9e3f3']]), stroke: 'rgba(30,20,60,.55)', lw: 2.4 });
      // the face: a white mask, shiny eyes, a beak
      pEll(c, -14, -14, 19, 18); paint(c, k, { fill: '#fff' }); pEll(c, 14, -14, 19, 18); paint(c, k, { fill: '#fff' }); pEll(c, 0, -6, 26, 18); paint(c, k, { fill: '#fff' });
      bead(c, k, -14, -15, 7.4, b); bead(c, k, 14, -15, 7.4, b);
      c.beginPath(); c.moveTo(-9, -6); c.quadraticCurveTo(0, -13, 9, -6); c.quadraticCurveTo(7, 4, 0, 9); c.quadraticCurveTo(-7, 4, -9, -6); c.closePath();
      paint(c, k, { fill: lin(c, 0, -10, 0, 9, [[0, '#ffd37a'], [1, '#f08a14']]), stroke: INK, lw: 3 });
      blush(c, k, -29, -4, 6.4, 4, 0.5); blush(c, k, 29, -4, 6.4, 4, 0.5);
      // the flippers
      pEll(c, -52, 34, 9, 26, 0.35 - step * 0.12); paint(c, k, { fill: lin(c, -60, 10, -44, 60, [[0, '#4b5e8c'], [1, '#1b2442']]), stroke: INK, lw: 4 });
      pEll(c, 52, 22 - Math.max(0, wave(k, 3, 0.25)) * 8, 9, 26, -0.85 + wave(k, 3, 0.25) * 0.25); paint(c, k, { fill: lin(c, 44, 10, 60, 60, [[0, '#4b5e8c'], [1, '#1b2442']]), stroke: INK, lw: 4 });
      // the knitted scarf
      pRR(c, -40, 14, 80, 15, 7.5); paint(c, k, { fill: '#e8465a', stroke: INK, lw: 4 });
      for (const x of [-30, -16, -2, 12, 26]) { c.beginPath(); c.moveTo(x, 16); c.lineTo(x - 2, 27); paint(c, k, { stroke: '#fff', lw: 3.4 }); }
      const sc = wave(k, 3, 0.2) * 2.5;
      pRR(c, 22 + sc, 24, 15, 32, 5); paint(c, k, { fill: '#e8465a', stroke: INK, lw: 3.6 });
      c.beginPath(); c.moveTo(25 + sc, 36); c.lineTo(35 + sc, 36); c.moveTo(25 + sc, 44); c.lineTo(35 + sc, 44); paint(c, k, { stroke: '#fff', lw: 2.6 });
      // the headphones
      c.beginPath(); c.arc(0, -14, 49, Math.PI * 1.12, Math.PI * 1.88); paint(c, k, { stroke: INK, lw: 10 }); paint(c, k, { stroke: '#1fc8b8', lw: 5 });
      for (const s of [-1, 1]) { pEll(c, s * 50, -12, 8.4, 14); paint(c, k, { fill: lin(c, s * 42, -26, s * 58, 2, [[0, '#7af0e0'], [1, '#12968c']]), stroke: INK, lw: 3.8 }); pEll(c, s * 50, -12, 3.6, 7); paint(c, k, { fill: '#e8fffb' }); }
      c.restore();
    }
  })
];
