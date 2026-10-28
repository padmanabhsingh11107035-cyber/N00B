// K-Drama buddies: Coco (a bear in a trench coat with a clear umbrella, in the rain) and Nana (a carton of banana milk). Original characters, drawn in code; see parts.ts.
import { INK, def, label, lin, paint, pCirc, pEll, pPoly, pRR, saw, wave } from '../kit.ts';
import type { StickerDef } from '../kit.ts';
import { GROUND, ball, bead, blinkOf, blush, ground, hopOf, limb, paw, smile } from './parts.ts';

const BEAR = ['#ecc9a0', '#c78b58', '#8a532f'] as const;

export const DRAMA_BUDDIES: StickerDef[] = [
  def({
    id: 'bd-coco', pack: 'buddy', name: 'Coco', bw: 84, bh: 96, outline: false,
    words: 'coco bear teddy drama kdrama k-drama umbrella rain trench coat romance oppa sad love',
    buddy: { field: 'kdrama', tagline: 'K-Drama bear', size: 0.52, accent: '#ff4f8b' },
    draw: (c, k) => {
      const b = blinkOf(k, 0.3), br = 1 + wave(k, 2) * 0.012, ua = wave(k, 1) * 0.045;
      // the rain, outside the umbrella
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
        const p = saw(k, 1, i / 3 + (s > 0 ? 0.17 : 0)), x = s * (80 + i * 8) - p * 4, y = -92 + p * 184;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x - 4, y + 14); paint(c, k, { stroke: 'rgba(160,212,255,.9)', lw: 3.2 });
      }
      ground(c, 56);
      c.save();
      c.translate(0, GROUND); c.scale(1, br); c.translate(0, -GROUND);
      const umbrella = (fn: () => void): void => { c.save(); c.translate(4, 42); c.rotate(ua); c.translate(-4, -42); fn(); c.restore(); };
      umbrella(() => {
        c.beginPath(); c.moveTo(-80, -52); c.bezierCurveTo(-80, -92, -40, -102, 0, -102); c.bezierCurveTo(40, -102, 80, -92, 80, -52);
        c.quadraticCurveTo(60, -62, 40, -52); c.quadraticCurveTo(20, -62, 0, -52); c.quadraticCurveTo(-20, -62, -40, -52); c.quadraticCurveTo(-60, -62, -80, -52); c.closePath();
        paint(c, k, { fill: lin(c, 0, -102, 0, -52, [[0, 'rgba(214,240,255,.92)'], [1, 'rgba(120,190,255,.6)']]), stroke: INK, lw: 4 });
        for (const x of [-80, -40, 40, 80]) { c.beginPath(); c.moveTo(0, -101); c.quadraticCurveTo(x * 0.7, -92, x, -54); paint(c, k, { stroke: 'rgba(255,255,255,.85)', lw: 2 }); }
        c.beginPath(); c.moveTo(0, -101); c.lineTo(0, -54); paint(c, k, { stroke: 'rgba(255,255,255,.85)', lw: 2 });
        pEll(c, -40, -84, 18, 5, -0.35); paint(c, k, { fill: 'rgba(255,255,255,.75)' });
      });
      // the ears
      for (const s of [-1, 1]) {
        pCirc(c, s * 35, -50, 14); paint(c, k, { fill: ball(c, s * 35, -50, 14, BEAR[0], BEAR[1], BEAR[2]), stroke: INK, lw: 4 });
        pCirc(c, s * 35, -49, 7); paint(c, k, { fill: '#f3b7a0' });
      }
      // the boots
      for (const s of [-1, 1]) { pEll(c, s * 16, 86, 15, 7.5); paint(c, k, { fill: lin(c, 0, 79, 0, 93, [[0, '#6a4a52'], [1, '#2a1c26']]), stroke: INK, lw: 4 }); }
      // the trench coat
      c.beginPath(); c.moveTo(-26, 14); c.lineTo(26, 14); c.quadraticCurveTo(39, 50, 39, 82); c.lineTo(-39, 82); c.quadraticCurveTo(-39, 50, -26, 14); c.closePath();
      paint(c, k, { fill: lin(c, -39, 14, 39, 82, [[0, '#f3e2bf'], [1, '#bd9560']]), stroke: INK, lw: 4.5 });
      pRR(c, -38, 52, 76, 9, 3); paint(c, k, { fill: '#6d4527', stroke: INK, lw: 2.6 });
      pRR(c, -7, 50, 14, 13, 2.5); paint(c, k, { fill: '#ffd34d', stroke: INK, lw: 2.4 });
      pCirc(c, 0, 71, 3.2); paint(c, k, { fill: '#6d4527', stroke: INK, lw: 1.8 });
      for (const s of [-1, 1]) { pPoly(c, [[s * 26, 14], [s * 4, 14], [s * 15, 36]]); paint(c, k, { fill: '#f8ecd2', stroke: INK, lw: 3 }); }
      // the umbrella's stick, held in front of the coat
      umbrella(() => {
        c.beginPath(); c.moveTo(4, -60); c.lineTo(4, 62); c.arc(-3.5, 62, 7.5, 0, Math.PI, false);
        paint(c, k, { stroke: INK, lw: 9 }); paint(c, k, { stroke: '#a8683a', lw: 4.4 });
      });
      limb(c, k, 24, 28, 5, 43, 13, '#d9bb88', 18, 44);
      paw(c, k, 4, 43, 8.2, BEAR[0], BEAR[1], BEAR[2]);
      const w = wave(k, 2) * 3;
      limb(c, k, -24, 28, -42 + w, 54, 13, '#d9bb88');
      paw(c, k, -43 + w, 57, 8.2, BEAR[0], BEAR[1], BEAR[2]);
      // the scarf
      pRR(c, -31, 5, 62, 15, 7.5); paint(c, k, { fill: lin(c, 0, 5, 0, 20, [[0, '#ee5d73'], [1, '#c3263f']]), stroke: INK, lw: 4 });
      for (const x of [-18, -4, 10, 24]) { c.beginPath(); c.moveTo(x, 7); c.lineTo(x - 2, 18); paint(c, k, { stroke: 'rgba(255,255,255,.4)', lw: 2 }); }
      const sc = wave(k, 2, 0.2) * 2.5;
      pRR(c, 14 + sc, 14, 15, 34, 5); paint(c, k, { fill: lin(c, 0, 14, 0, 48, [[0, '#ee5d73'], [1, '#c3263f']]), stroke: INK, lw: 3.6 });
      // the head
      pEll(c, 0, -22, 46, 38);
      paint(c, k, { fill: ball(c, 0, -22, 47, BEAR[0], BEAR[1], BEAR[2]), stroke: INK, lw: 4.5 });
      pEll(c, 0, -8, 19, 14); paint(c, k, { fill: lin(c, 0, -22, 0, 6, [[0, '#fff2dc'], [1, '#ecc9a0']]) });
      bead(c, k, -19, -27, 8.6, b); bead(c, k, 19, -27, 8.6, b);
      c.beginPath(); c.moveTo(-28, -39); c.quadraticCurveTo(-20, -43, -12, -40); c.moveTo(12, -40); c.quadraticCurveTo(20, -43, 28, -39); paint(c, k, { stroke: '#5a331c', lw: 3 });
      pEll(c, 0, -13, 6.4, 4.6); paint(c, k, { fill: '#3a2230', stroke: INK, lw: 1.6 });
      pEll(c, -1.6, -14.4, 2, 1.2, -0.3); paint(c, k, { fill: 'rgba(255,255,255,.7)' });
      c.beginPath(); c.moveTo(0, -9); c.lineTo(0, -4); paint(c, k, { stroke: '#3a2230', lw: 2.6 });
      smile(c, k, -5, -4, 5, 4, 2.6); smile(c, k, 5, -4, 5, 4, 2.6);
      blush(c, k, -33, -10, 7.5, 4.6, 0.4); blush(c, k, 33, -10, 7.5, 4.6, 0.4);
      c.restore();
    }
  }),
  def({
    id: 'bd-nana', pack: 'buddy', name: 'Nana', bw: 62, bh: 96, outline: false,
    words: 'nana banana milk carton drink drama kdrama k-drama snack yellow cute',
    buddy: { field: 'kdrama', tagline: 'Banana milk', size: 0.46, accent: '#ffcf33' },
    draw: (c, k) => {
      const hop = hopOf(k, 2), up = hop * 12, b = blinkOf(k, 0.5), land = hop < 0.12 ? 1 - hop / 0.12 : 0, sy = 1 - land * 0.07, sx = 1 + land * 0.05;
      ground(c, 50, up);
      c.save();
      c.translate(0, -up);
      c.translate(0, GROUND); c.scale(sx, sy); c.translate(0, -GROUND);
      // legs
      for (const s of [-1, 1]) {
        limb(c, k, s * 17, 74, s * 17, 85, 11, '#ffe27a');
        pEll(c, s * 18, 88, 14, 6); paint(c, k, { fill: '#fff', stroke: INK, lw: 4 });
        pEll(c, s * 18, 89, 8, 2.5); paint(c, k, { fill: '#ff7fb0' });
      }
      // the straw
      const sw = wave(k, 1) * 3;
      c.beginPath(); c.moveTo(12, -40); c.quadraticCurveTo(20 + sw, -62, 30 + sw, -84);
      paint(c, k, { stroke: INK, lw: 12 }); paint(c, k, { stroke: '#fff', lw: 7.6 });
      c.setLineDash([5, 5]); paint(c, k, { stroke: '#ff7fb0', lw: 7.6 }); c.setLineDash([]);
      // the carton: the roof first, then the front
      pPoly(c, [[-37, -8], [37, -8], [27, -36], [-27, -36]]);
      paint(c, k, { fill: lin(c, 0, -36, 0, -8, [[0, '#fff6c2'], [1, '#ffe27a']]), stroke: INK, lw: 4.2 });
      pRR(c, -27, -45, 54, 10, 3); paint(c, k, { fill: '#ffd84a', stroke: INK, lw: 3.6 });
      c.beginPath(); c.moveTo(-14, -45); c.lineTo(-14, -35); c.moveTo(14, -45); c.lineTo(14, -35); paint(c, k, { stroke: 'rgba(140,90,0,.5)', lw: 1.8 });
      pRR(c, -37, -8, 74, 86, 9);
      paint(c, k, { fill: lin(c, -37, -8, 37, 78, [[0, '#fff3a8'], [0.55, '#ffd84a'], [1, '#f2ad00']]), stroke: INK, lw: 4.5 });
      c.save(); pRR(c, -37, -8, 74, 86, 9); c.clip(); pRR(c, 24, -10, 20, 92, 0); paint(c, k, { fill: 'rgba(160,100,0,.2)' }); c.restore();
      // the banana on the front
      c.beginPath(); c.moveTo(-19, 4); c.bezierCurveTo(-9, 22, 13, 22, 24, 1); c.bezierCurveTo(16, 27, -11, 29, -19, 4); c.closePath();
      paint(c, k, { fill: lin(c, 0, 1, 0, 26, [[0, '#fff08a'], [1, '#f5c400']]), stroke: '#a8680a', lw: 2.6 });
      pCirc(c, 24, 1, 2.2); paint(c, k, { fill: '#6a3d12' });
      // the face
      bead(c, k, -15, 38, 7.6, b); bead(c, k, 15, 38, 7.6, b);
      smile(c, k, 0, 47, 6, 5, 2.8);
      blush(c, k, -26, 46, 6.4, 4, 0.5); blush(c, k, 26, 46, 6.4, 4, 0.5);
      label(c, k, 'banana milk', 0, 66, 11, { fill: '#a8680a', weight: 800 });
      // the arms
      const ar = wave(k, 2) * 0.35;
      limb(c, k, -37, 32, -55, 44 - ar * 30, 10, '#ffe27a');
      paw(c, k, -56, 45 - ar * 30, 6.4, '#fff', '#fff', '#fff0b0');
      limb(c, k, 37, 32, 54, 20 + ar * 24, 10, '#ffe27a');
      paw(c, k, 55, 18 + ar * 24, 6.4, '#fff', '#fff', '#fff0b0');
      c.restore();
    }
  })
];
