// K-Movie stickers: the cinema bits (clapperboard, popcorn, ticket), the Korean street sweet everyone knows, a suspense look and a title card. All drawn in code and moving; see kit.ts.
import { INK, bump, clamp, def, detail, ease, label, lin, paint, pCirc, pEll, pPoly, pRR, pSpark, pStar, rad, saw, wave, TAU } from '../kit.ts';
import type { Ctx, Kit, StickerDef } from '../kit.ts';

/** a clapperboard bar: a rounded bar with diagonal black / white stripes */
function bar(c: Ctx, k: Kit, x: number, y: number, w: number, h: number, a: string, b: string): void {
  pRR(c, x, y, w, h, 4);
  paint(c, k, { fill: b, stroke: INK, lw: 5 });
  if (k.sil) return;
  pRR(c, x, y, w, h, 4);
  c.save();
  c.clip();
  for (let i = -4; i < 14; i++) {
    c.beginPath();
    c.moveTo(x + i * 24, y); c.lineTo(x + i * 24 + 14, y); c.lineTo(x + i * 24 + 14 - h * 0.5, y + h); c.lineTo(x + i * 24 - h * 0.5, y + h);
    c.closePath();
    c.fillStyle = i % 2 ? a : b;
    c.fill();
  }
  c.restore();
  pRR(c, x, y, w, h, 4);
  paint(c, k, { stroke: INK, lw: 5 });
}

export const KMOVIE: StickerDef[] = [
  def({
    id: 'km-clapper', pack: 'kmovie', name: 'Clapperboard', bw: 92, bh: 76, words: 'clapperboard action movie film scene take cinema',
    draw: (c, k) => {
      const p = saw(k, 1);
      const open = p < 0.5 ? ease(p / 0.5) : p < 0.62 ? 1 - ease((p - 0.5) / 0.12) : 0;
      pRR(c, -82, -8, 164, 84, 8);
      paint(c, k, { fill: '#25252f', stroke: INK, lw: 5 });
      bar(c, k, -82, -8, 164, 20, '#25252f', '#f4f4f6');
      detail(k, () => {
        label(c, k, 'SCENE 1', -70, 28, 16, { fill: '#fff', align: 'left', weight: 800 });
        label(c, k, 'TAKE 1', -70, 50, 16, { fill: '#fff', align: 'left', weight: 800 });
        label(c, k, 'NOOB FILM', -70, 68, 11, { fill: '#9ca3af', align: 'left', weight: 800 });
        c.fillStyle = '#ffd23f'; c.fillRect(30, 24, 36, 4); c.fillRect(30, 40, 24, 4); c.fillRect(30, 56, 30, 4);
      });
      c.save();
      c.translate(-80, -12);
      c.rotate(-open * 0.52);
      bar(c, k, 0, -22, 162, 22, '#25252f', '#f4f4f6');
      c.restore();
      const hit = clamp((p - 0.6) / 0.14);
      if (hit > 0 && hit < 1) { pSpark(c, 78, -34, 10 + 22 * bump(hit), 0); paint(c, k, { fill: '#fff6a8', stroke: INK, lw: 2.5 }); }
    }
  }),
  def({
    id: 'km-popcorn', pack: 'kmovie', name: 'Popcorn', words: 'popcorn movie snack cinema',
    draw: (c, k) => {
      const base: ReadonlyArray<readonly [number, number, number]> = [[-38, -22, 20], [-10, -36, 22], [22, -30, 21], [44, -14, 18], [-52, -4, 17], [4, -12, 20], [-26, -8, 18]];
      for (const [x, y, r] of base) {
        pCirc(c, x, y, r); paint(c, k, { fill: '#fff6d6', stroke: INK, lw: 3.5 });
        detail(k, () => { pCirc(c, x + r * 0.2, y - r * 0.15, r * 0.3); paint(c, k, { fill: '#ffd25c' }); });
      }
      for (let i = 0; i < 3; i++) {   // kernels popping
        const p = saw(k, 1, i / 3), r = 12, x = -34 + i * 34 + Math.sin(p * TAU + i) * 6, y = -30 - Math.sin(p * Math.PI) * 62;
        c.save(); c.translate(x, y); c.rotate(p * TAU);
        pCirc(c, 0, 0, r); paint(c, k, { fill: '#fff6d6', stroke: INK, lw: 3.5, alpha: 1 - Math.max(0, p - 0.85) * 6 });
        c.restore();
      }
      pPoly(c, [[-56, -2], [56, -2], [44, 82], [-44, 82]]);
      paint(c, k, { fill: '#fff', stroke: INK, lw: 5 });
      detail(k, () => {
        c.save(); pPoly(c, [[-56, -2], [56, -2], [44, 82], [-44, 82]]); c.clip();
        for (let i = -3; i <= 3; i += 2) { c.fillStyle = '#e63946'; c.fillRect(i * 16 - 8, -4, 16, 90); }
        c.restore();
        pPoly(c, [[-56, -2], [56, -2], [44, 82], [-44, 82]]); paint(c, k, { stroke: INK, lw: 5 });
      });
      label(c, k, 'POP!', 0, 38, 28, { fill: '#fff', stroke: '#9d1220', lw: 6 });
    }
  }),
  def({
    id: 'km-ticket', pack: 'kmovie', name: 'Cinema ticket', text: true, bw: 96, bh: 54, words: 'ticket cinema admit one movie',
    draw: (c, k) => {
      c.save();
      c.rotate(wave(k, 1) * 0.07);
      c.beginPath();
      c.moveTo(-84, -50); c.lineTo(84, -50); c.arcTo(92, -50, 92, -42, 8); c.lineTo(92, -12); c.arc(92, 0, 12, -Math.PI / 2, Math.PI / 2, true);
      c.lineTo(92, 42); c.arcTo(92, 50, 84, 50, 8); c.lineTo(-84, 50); c.arcTo(-92, 50, -92, 42, 8); c.lineTo(-92, 12);
      c.arc(-92, 0, 12, Math.PI / 2, -Math.PI / 2, true); c.lineTo(-92, -42); c.arcTo(-92, -50, -84, -50, 8); c.closePath();
      paint(c, k, { fill: lin(c, -92, -50, 92, 50, [[0, '#ff5d73'], [1, '#c81e3a']]), stroke: INK, lw: 5 });
      detail(k, () => {
        c.save();
        c.clip();
        const x = -150 + saw(k, 1) * 320;
        c.beginPath(); c.moveTo(x, -60); c.lineTo(x + 28, -60); c.lineTo(x + 8, 60); c.lineTo(x - 20, 60); c.closePath();
        c.fillStyle = 'rgba(255,255,255,.3)'; c.fill();
        c.restore();
        c.setLineDash([5, 5]); c.beginPath(); c.moveTo(44, -42); c.lineTo(44, 42); c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 3; c.stroke(); c.setLineDash([]);
        pStar(c, 68, 0, 15, 6.5, 5); paint(c, k, { fill: '#ffd23f', stroke: INK, lw: 2.5 });
      });
      label(c, k, 'ADMIT ONE', -22, -12, 24, { fill: '#fff', stroke: '#7d0f24', lw: 5, maxW: 100 });
      label(c, k, 'CINEMA NIGHT', -22, 22, 14, { fill: '#ffd9df', weight: 800 });
      c.restore();
    }
  }),
  def({
    id: 'km-dalgona', pack: 'kmovie', name: 'Dalgona', words: 'dalgona honeycomb candy cookie korean street snack star',
    draw: (c, k) => {
      const s = 1 + bump(saw(k, 1)) * 0.05;
      c.save(); c.scale(s, s);
      pCirc(c, 0, 0, 76);
      paint(c, k, { fill: rad(c, -22, -26, 6, 86, [[0, '#f3c883'], [1, '#c98a3c']]), stroke: INK, lw: 5 });
      detail(k, () => {
        pCirc(c, 0, 0, 64); paint(c, k, { stroke: 'rgba(120,70,20,.5)', lw: 3 });
        pStar(c, 0, 4, 42, 19, 5); paint(c, k, { fill: 'rgba(150,90,30,.35)', stroke: '#8a4b16', lw: 5 });
        pEll(c, -36, -44, 20, 9, -0.7); paint(c, k, { fill: 'rgba(255,255,255,.45)' });
        for (const [x, y] of [[26, -42], [-48, 20], [44, 34]] as const) { pCirc(c, x, y, 3); paint(c, k, { fill: 'rgba(140,80,25,.5)' }); }
      });
      c.restore();
      for (const [x, y, o] of [[-74, -62, 0], [76, -50, 0.33], [64, 66, 0.66]] as const) {
        pSpark(c, x, y, 8 + 14 * bump(saw(k, 1, o)), 0);
        paint(c, k, { fill: '#fff6a8', stroke: INK, lw: 2.5 });
      }
    }
  }),
  def({
    id: 'km-eyes', pack: 'kmovie', name: 'Suspense eyes', words: 'eyes look watching suspense thriller peek',
    draw: (c, k) => {
      const ox = wave(k, 1) * 11, oy = wave(k, 2) * 3;
      const q = saw(k, 1, 0.12), blink = q < 0.07 ? 1 - Math.abs(q - 0.035) / 0.035 : 0;
      const ry = 40 * (1 - 0.9 * blink);
      for (const sx of [-1, 1]) {
        const x = sx * 38;
        pEll(c, x, 6, 32, ry);
        paint(c, k, { fill: '#fff', stroke: INK, lw: 5 });
        detail(k, () => {
          c.save(); pEll(c, x, 6, 32, ry); c.clip();
          pCirc(c, x + ox, 6 + oy, 14); paint(c, k, { fill: '#241a33' });
          pCirc(c, x + ox - 4, 1 + oy, 4.5); paint(c, k, { fill: '#fff' });
          c.restore();
        });
        c.beginPath(); c.moveTo(x - sx * 30, -50 - wave(k, 1) * 2); c.quadraticCurveTo(x, -66 - wave(k, 1) * 3, x + sx * 30, -48);
        paint(c, k, { stroke: INK, lw: 9 });
      }
    }
  }),
  def({
    id: 'km-comingsoon', pack: 'kmovie', name: 'Coming soon', text: true, bw: 98, bh: 50, words: 'coming soon title card movie trailer film',
    draw: (c, k) => {
      pRR(c, -96, -48, 192, 96, 10);
      paint(c, k, { fill: '#0e0e14', stroke: '#d4af37', lw: 5 });
      detail(k, () => {
        for (const y of [-40, 34]) for (let i = 0; i < 13; i++) { const x = -92 + ((i * 16 + saw(k, 1) * 16) % 208); if (x > -92 && x < 84) { pRR(c, x, y, 9, 6, 2); paint(c, k, { fill: '#3a3a46' }); } }
        c.save(); pRR(c, -96, -48, 192, 96, 10); c.clip();
        const x = -150 + saw(k, 1) * 340;
        c.beginPath(); c.moveTo(x, -60); c.lineTo(x + 24, -60); c.lineTo(x + 4, 60); c.lineTo(x - 20, 60); c.closePath(); c.fillStyle = 'rgba(255,225,130,.22)'; c.fill();
        c.restore();
      });
      const flick = saw(k, 6) < 0.14 ? 0.7 : 1;
      c.save(); c.globalAlpha *= flick;
      label(c, k, 'COMING', 0, -10, 34, { fill: lin(c, 0, -28, 0, 8, [[0, '#fff2b0'], [1, '#d4a017']]), stroke: '#5a3c00', lw: 6 });
      label(c, k, 'SOON', 0, 22, 34, { fill: lin(c, 0, 6, 0, 40, [[0, '#fff2b0'], [1, '#d4a017']]), stroke: '#5a3c00', lw: 6 });
      c.restore();
    }
  }),
  def({
    id: 'km-blockbuster', pack: 'kmovie', name: 'Blockbuster', text: true, words: 'blockbuster hit star movie badge',
    draw: (c, k) => {
      pCirc(c, 0, -6, 80);
      paint(c, k, { fill: '#3b2a8c', stroke: INK, lw: 5 });
      detail(k, () => {
        c.save(); pCirc(c, 0, -6, 78); c.clip();
        const a0 = saw(k, 1) * (TAU / 7);
        for (let i = 0; i < 14; i++) {
          const a = a0 + (i * TAU) / 14;
          c.beginPath(); c.moveTo(0, -6); c.lineTo(Math.cos(a) * 100, -6 + Math.sin(a) * 100); c.lineTo(Math.cos(a + TAU / 28) * 100, -6 + Math.sin(a + TAU / 28) * 100); c.closePath();
          c.fillStyle = i % 2 ? '#5b46d6' : '#3b2a8c'; c.fill();
        }
        c.restore();
      });
      const s = 1 + wave(k, 3) * 0.05;
      pStar(c, 0, -14, 52 * s, 24 * s, 5);
      paint(c, k, { fill: lin(c, 0, -66, 0, 36, [[0, '#fff3a0'], [1, '#f2a900']]), stroke: INK, lw: 5 });
      pRR(c, -76, 40, 152, 34, 8);
      paint(c, k, { fill: '#e11d48', stroke: INK, lw: 5 });
      label(c, k, 'BLOCKBUSTER', 0, 58, 20, { fill: '#fff', maxW: 138 });
    }
  })
];
