// Fun buddies: Ember (a baby dragon with a flame on its tail) and Bolt (a little robot with a screen for a face). Original characters, drawn in code; see parts.ts.
import { INK, def, lin, paint, pCirc, pEll, pPoly, pRR, wave } from '../kit.ts';
import type { StickerDef } from '../kit.ts';
import { GROUND, ball, bigEye, blinkOf, blush, glow, gloss, ground, hopOf, limb } from './parts.ts';

const RED = ['#ffa08a', '#f2553f', '#a82222'] as const;
const STEEL = ['#f6f9ff', '#bccbe6', '#7a8fb4'] as const;

export const FUN_BUDDIES: StickerDef[] = [
  def({
    id: 'bd-ember', pack: 'buddy', name: 'Ember', bw: 80, bh: 96, outline: false,
    words: 'ember dragon baby fire flame wings fantasy fun cute monster horns',
    buddy: { field: 'fun', tagline: 'Baby dragon', size: 0.54, accent: '#f2553f' },
    draw: (c, k) => {
      const hop = hopOf(k, 2, 0.25), up = hop * 7, b = blinkOf(k, 0.42), fl = wave(k, 6), flap = wave(k, 3) * 0.22;
      ground(c, 58, up);
      c.save();
      c.translate(0, -up);
      // the wings (behind): they flap
      for (const s of [-1, 1]) {
        c.save(); c.translate(s * 22, 30); c.rotate(s * (flap - 0.1)); c.scale(s, 1);
        c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(24, -44, 70, -56); c.quadraticCurveTo(62, -40, 74, -26); c.quadraticCurveTo(58, -22, 62, -4); c.quadraticCurveTo(42, -10, 40, 10); c.quadraticCurveTo(22, 8, 0, 14); c.closePath();
        paint(c, k, { fill: lin(c, 0, 0, 70, -56, [[0, '#d63a58'], [1, '#ff8da0']]), stroke: INK, lw: 4.2 });
        c.beginPath(); c.moveTo(2, 4); c.quadraticCurveTo(30, -26, 66, -50); c.moveTo(6, 8); c.lineTo(58, -2); paint(c, k, { stroke: 'rgba(120,20,40,.55)', lw: 2.4 });
        c.restore();
      }
      // the tail with a flame on its tip
      const tx = 76, ty = 36 + wave(k, 2) * 3;
      limb(c, k, 22, 78, tx, ty, 14, RED[1], 62, 92);
      glow(c, k, tx + 4, ty - 14, 34, '255,170,60', 0.55);
      c.save(); c.translate(tx + 4, ty - 6); c.scale(1 + fl * 0.06, 1 + fl * 0.1);
      c.beginPath(); c.moveTo(0, -30); c.quadraticCurveTo(16, -12, 12, 4); c.quadraticCurveTo(0, 14, -12, 4); c.quadraticCurveTo(-16, -12, 0, -30); c.closePath();
      paint(c, k, { fill: lin(c, 0, -30, 0, 12, [[0, '#fff3a0'], [0.5, '#ffb02e'], [1, '#ef4a1c']]), stroke: INK, lw: 3 });
      pEll(c, 0, -2, 5, 8); paint(c, k, { fill: '#fffbe0' });
      c.restore();
      // feet
      for (const s of [-1, 1]) {
        pEll(c, s * 18, 88, 16, 7); paint(c, k, { fill: lin(c, 0, 81, 0, 95, [[0, RED[0]], [1, RED[2]]]), stroke: INK, lw: 4 });
        for (const t of [-1, 0, 1]) { pPoly(c, [[s * 18 + t * 6 - 2.4, 92], [s * 18 + t * 6 + 2.4, 92], [s * 18 + t * 6, 97]]); paint(c, k, { fill: '#ffd34d', stroke: INK, lw: 1.6 }); }
      }
      // the round body and the cream belly with bands
      pEll(c, 0, 52, 38, 38); paint(c, k, { fill: ball(c, 0, 52, 40, RED[0], RED[1], RED[2]), stroke: INK, lw: 4.5 });
      pEll(c, 0, 58, 23, 29); paint(c, k, { fill: lin(c, 0, 30, 0, 88, [[0, '#fff3c6'], [1, '#ffcd62']]), stroke: 'rgba(120,40,20,.5)', lw: 2.4 });
      for (const y of [46, 58, 70]) { c.beginPath(); c.moveTo(-17, y); c.quadraticCurveTo(0, y + 5, 17, y); paint(c, k, { stroke: 'rgba(160,80,20,.4)', lw: 2.2 }); }
      // the arms
      limb(c, k, -30, 40, -48, 58, 11, RED[1]); pCirc(c, -49, 60, 6.4); paint(c, k, { fill: RED[0], stroke: INK, lw: 3.4 });
      const w = wave(k, 3, 0.25);
      limb(c, k, 30, 40, 52, 22 + w * 6, 11, RED[1], 48, 40); pCirc(c, 53, 19 + w * 6, 6.4); paint(c, k, { fill: RED[0], stroke: INK, lw: 3.4 });
      // the horns and the little spikes
      for (const s of [-1, 1]) {
        c.beginPath(); c.moveTo(s * 16, -50); c.quadraticCurveTo(s * 30, -70, s * 42, -80); c.quadraticCurveTo(s * 42, -60, s * 34, -44); c.closePath();
        paint(c, k, { fill: lin(c, 0, -80, 0, -44, [[0, '#fff0a8'], [1, '#e8a317']]), stroke: INK, lw: 4 });
      }
      for (const x of [-9, 0, 9]) { pPoly(c, [[x - 5, -52], [x, -66 + Math.abs(x) * 0.4], [x + 5, -52]]); paint(c, k, { fill: '#ffd34d', stroke: INK, lw: 3 }); }
      // the head: a big round one with a snout
      pEll(c, 0, -18, 47, 40); paint(c, k, { fill: ball(c, 0, -18, 48, RED[0], RED[1], RED[2]), stroke: INK, lw: 4.5 });
      pEll(c, 0, 0, 27, 15); paint(c, k, { fill: lin(c, 0, -14, 0, 16, [[0, '#ffc6b0'], [1, '#ff9a80']]), stroke: 'rgba(120,30,20,.5)', lw: 2.4 });
      pEll(c, -6, -7, 1.8, 2.4, 0.4); paint(c, k, { fill: '#7a1d2a' }); pEll(c, 6, -7, 1.8, 2.4, -0.4); paint(c, k, { fill: '#7a1d2a' });
      c.beginPath(); c.moveTo(-14, 3); c.quadraticCurveTo(0, 13, 14, 3); paint(c, k, { stroke: '#5a1420', lw: 3.2 });
      pPoly(c, [[-9, 6.6], [-4, 8.4], [-7, 13]]); paint(c, k, { fill: '#fff', stroke: INK, lw: 1.4 });
      gloss(c, k, -24, -44, 12, 4.6, -0.5, 0.4);
      for (const s of [-1, 1]) bigEye(c, k, s * 20, -26, 9.4, 11.4, ['#b9fff2', '#12a398'], b);
      blush(c, k, -35, -8, 6.6, 4, 0.45); blush(c, k, 35, -8, 6.6, 4, 0.45);
      c.restore();
    }
  }),
  def({
    id: 'bd-bolt', pack: 'buddy', name: 'Bolt', bw: 66, bh: 96, outline: false,
    words: 'bolt robot tech future ai android machine gadget cyber metal fun space',
    buddy: { field: 'fun', tagline: 'Little robot', size: 0.5, accent: '#1fb6ff' },
    draw: (c, k) => {
      const hop = hopOf(k, 2), up = hop * 7, b = blinkOf(k, 0.58), pulse = 0.65 + 0.35 * wave(k, 3), tilt = wave(k, 2) * 0.035;
      ground(c, 52, up);
      c.save();
      c.translate(0, -up);
      c.translate(0, GROUND); c.rotate(tilt * 0.5); c.translate(0, -GROUND);
      // legs and feet
      for (const s of [-1, 1]) {
        pRR(c, s * 16 - 7, 70, 14, 14, 4); paint(c, k, { fill: lin(c, 0, 70, 0, 84, [[0, '#9aabcb'], [1, '#5a6d92']]), stroke: INK, lw: 3.6 });
        pRR(c, s * 16 - 15, 82, 30, 11, 5); paint(c, k, { fill: lin(c, 0, 82, 0, 93, [[0, '#3b4a78'], [1, '#1a2342']]), stroke: INK, lw: 4 });
        pRR(c, s * 16 - 11, 86, 22, 3, 1.5); paint(c, k, { fill: `rgba(60,220,255,${pulse})` });
      }
      // the body with a glowing bolt on the chest
      pRR(c, -31, 14, 62, 60, 15); paint(c, k, { fill: lin(c, -31, 14, 31, 74, [[0, STEEL[0]], [0.55, STEEL[1]], [1, STEEL[2]]]), stroke: INK, lw: 4.5 });
      pRR(c, -17, 28, 34, 28, 8); paint(c, k, { fill: lin(c, 0, 28, 0, 56, [[0, '#17204c'], [1, '#0c1130']]), stroke: INK, lw: 3 });
      glow(c, k, 0, 42, 24, '60,220,255', 0.5 * pulse);
      pPoly(c, [[3, 31], [-9, 44], [-1, 44], [-4, 54], [9, 40], [1, 40]]); paint(c, k, { fill: `rgba(120,240,255,${0.65 + 0.35 * pulse})`, stroke: '#e9fdff', lw: 1.6 });
      for (const [x, y] of [[-24, 22], [24, 22], [-24, 66], [24, 66]] as const) { pCirc(c, x, y, 2.4); paint(c, k, { fill: '#7a8fb4', stroke: INK, lw: 1.4 }); }
      gloss(c, k, -22, 20, 7, 2.6, -0.4, 0.6);
      // the arms with round joints and claws
      const w = wave(k, 3);
      limb(c, k, -32, 26, -48, 46, 9, '#aebfdc'); limb(c, k, -48, 46, -50, 62, 8, '#aebfdc');
      pCirc(c, -32, 26, 6.4); paint(c, k, { fill: ball(c, -32, 26, 6.4, '#fff', '#c0cde6', '#7488ac'), stroke: INK, lw: 3 });
      c.beginPath(); c.arc(-50, 66, 6, Math.PI * 0.15, Math.PI * 0.85, true); paint(c, k, { stroke: INK, lw: 8 }); paint(c, k, { stroke: '#7a8fb4', lw: 4 });
      limb(c, k, 32, 26, 52, 22, 9, '#aebfdc'); limb(c, k, 52, 22, 58 + w * 2, 0 + w * 3, 8, '#aebfdc');
      pCirc(c, 32, 26, 6.4); paint(c, k, { fill: ball(c, 32, 26, 6.4, '#fff', '#c0cde6', '#7488ac'), stroke: INK, lw: 3 });
      c.save(); c.translate(59 + w * 2, -4 + w * 3);
      c.beginPath(); c.arc(0, 0, 6, Math.PI * 1.15, Math.PI * 1.85, false); paint(c, k, { stroke: INK, lw: 8 }); paint(c, k, { stroke: '#7a8fb4', lw: 4 });
      c.restore();
      // the neck and the head
      pRR(c, -8, 6, 16, 12, 3); paint(c, k, { fill: '#6f82a8', stroke: INK, lw: 3 });
      c.save(); c.translate(0, 8); c.rotate(tilt); c.translate(0, -8);
      c.beginPath(); c.moveTo(0, -58); c.lineTo(0, -74); paint(c, k, { stroke: INK, lw: 7 }); paint(c, k, { stroke: '#7a8fb4', lw: 3 });
      const on = wave(k, 3) > 0;
      glow(c, k, 0, -80, on ? 16 : 8, '255,80,80', on ? 0.6 : 0.2);
      pCirc(c, 0, -80, 6.6); paint(c, k, { fill: on ? ball(c, 0, -80, 6.6, '#ffd0d0', '#ff5a5a', '#b01c1c') : ball(c, 0, -80, 6.6, '#c07878', '#8a3a3a', '#4a1818'), stroke: INK, lw: 3 });
      for (const s of [-1, 1]) { pRR(c, s * 45 - 5, -36, 10, 26, 4); paint(c, k, { fill: lin(c, 0, -36, 0, -10, [[0, '#7488ac'], [1, '#4a5c82']]), stroke: INK, lw: 3.4 }); }
      pRR(c, -45, -58, 90, 68, 26); paint(c, k, { fill: lin(c, -45, -58, 45, 10, [[0, STEEL[0]], [0.55, STEEL[1]], [1, STEEL[2]]]), stroke: INK, lw: 4.5 });
      pRR(c, -35, -48, 70, 48, 17); paint(c, k, { fill: lin(c, 0, -48, 0, 0, [[0, '#1b2766'], [1, '#0b1030']]), stroke: INK, lw: 3.4 });
      for (const s of [-1, 1]) {
        const hh = 11 * (1 - b * 0.88);
        glow(c, k, s * 16, -28, 20, '60,220,255', 0.4);
        pRR(c, s * 16 - 8, -28 - hh, 16, hh * 2, 8); paint(c, k, { fill: lin(c, 0, -40, 0, -16, [[0, '#d8ffff'], [1, '#28c7ff']]) });
        pPoly(c, [[s * 16 - 3, -28 - hh * 0.6], [s * 16 + 1, -28 - hh * 0.6], [s * 16 - 1, -28 - hh * 0.3]]); paint(c, k, { fill: 'rgba(255,255,255,.9)' });
      }
      c.beginPath(); c.arc(0, -16, 9, Math.PI * 0.18, Math.PI * 0.82); paint(c, k, { stroke: '#7af0ff', lw: 3.6 });
      pEll(c, -28, -14, 5, 3.4); paint(c, k, { fill: 'rgba(255,100,170,.75)' }); pEll(c, 28, -14, 5, 3.4); paint(c, k, { fill: 'rgba(255,100,170,.75)' });
      gloss(c, k, -30, -52, 11, 3.6, -0.3, 0.7);
      c.restore();
      c.restore();
    }
  })
];
