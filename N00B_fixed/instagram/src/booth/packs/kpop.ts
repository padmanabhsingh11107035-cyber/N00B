// K-Pop stickers in two colours: PURPLE (hearts, a glowing light stick, stage beams, a mic drop, confetti) and PINK (crown, neon sign, diamond, a heart light stick, a photocard, a bow).
// Everything is original and drawn in code: no band's logo, name, member or official item is copied. See kit.ts.
import { INK, bounce, bump, clamp, def, detail, ease, label, lin, paint, pCirc, pEll, pHeart, pPoly, pRR, pSpark, pStar, rad, rnd, saw, wave, TAU } from '../kit.ts';
import type { StickerDef } from '../kit.ts';

export const PURPLE: StickerDef[] = [
  def({
    id: 'pp-heart', pack: 'purple', name: 'Purple heart', words: 'purple heart love bts army borahae kpop',
    draw: (c, k) => {
      const s = 1 + wave(k, 3) * 0.05;
      c.save(); c.scale(s, s);
      pHeart(c, 0, 2, 150);
      paint(c, k, { fill: lin(c, -50, -60, 50, 80, [[0, '#e3c8ff'], [0.45, '#9b4dff'], [1, '#4b1a9e']]), stroke: INK, lw: 5 });
      detail(k, () => { pEll(c, -34, -32, 22, 11, -0.65); paint(c, k, { fill: 'rgba(255,255,255,.65)' }); pCirc(c, -52, -6, 4.5); paint(c, k, { fill: 'rgba(255,255,255,.7)' }); });
      c.restore();
      for (let i = 0; i < 3; i++) {
        const a = k.ph + (i * TAU) / 3, x = Math.cos(a) * 84, y = Math.sin(a) * 30 - 18;
        pSpark(c, x, y, 10 + 6 * bump(saw(k, 1, i / 3)), a);
        paint(c, k, { fill: '#fff', stroke: INK, lw: 2.5 });
      }
    }
  }),
  def({
    id: 'pp-lightstick', pack: 'purple', name: 'Light stick', bw: 70, bh: 96, words: 'light stick lightstick concert glow fan purple kpop',
    draw: (c, k) => {
      c.save();
      c.translate(0, 84);
      c.rotate(wave(k, 1) * 0.22);
      c.translate(0, -84);
      const g = 0.75 + 0.25 * wave(k, 3);
      pCirc(c, 0, -34, 78);
      paint(c, k, { fill: rad(c, 0, -34, 20, 78, [[0, `rgba(200,140,255,${0.5 * g})`], [1, 'rgba(160,90,255,0)']]), nosil: true });
      pRR(c, -11, 6, 22, 80, 9);
      paint(c, k, { fill: lin(c, -11, 0, 11, 0, [[0, '#ffffff'], [0.5, '#e7d7ff'], [1, '#b69cf5']]), stroke: INK, lw: 5 });
      detail(k, () => { pRR(c, -11, 34, 22, 8, 3); paint(c, k, { fill: '#7c3aed', stroke: INK, lw: 2.5 }); });
      pCirc(c, 0, -34, 44);
      paint(c, k, { fill: rad(c, -8, -44, 4, 50, [[0, '#ffffff'], [0.45, '#d9b8ff'], [1, '#8b3dff']]), stroke: INK, lw: 5 });
      detail(k, () => {
        pStar(c, 0, -34, 22, 10, 5); paint(c, k, { fill: `rgba(255,255,255,${0.7 + 0.25 * wave(k, 3)})` });
        pEll(c, -16, -52, 11, 6, -0.7); paint(c, k, { fill: 'rgba(255,255,255,.8)' });
      });
      c.restore();
      for (const [x, y, o] of [[-60, -70, 0], [58, -50, 0.4], [50, 30, 0.7]] as const) {
        pSpark(c, x, y, 7 + 11 * bump(saw(k, 1, o)), 0);
        paint(c, k, { fill: '#fff', stroke: INK, lw: 2.5 });
      }
    }
  }),
  def({
    id: 'pp-stage', pack: 'purple', name: 'Stage lights', outline: false, bw: 100, bh: 100, words: 'stage lights spotlight concert beams show purple',
    draw: (c, k) => {
      const cols: ReadonlyArray<readonly [string, string]> = [['rgba(200,140,255,.95)', 'rgba(200,140,255,0)'], ['rgba(255,255,255,.9)', 'rgba(255,255,255,0)'], ['rgba(165,100,255,.95)', 'rgba(165,100,255,0)']];
      cols.forEach(([a, b], i) => {
        const bx = (i - 1) * 68, th = (wave(k, 1, i / 3) * 0.38) + (i - 1) * 0.08, L = 220, w = 22;
        const tx = bx + Math.tan(th) * L;
        pPoly(c, [[bx - 5, 104], [bx + 5, 104], [tx + w, 104 - L], [tx - w, 104 - L]]);
        paint(c, k, { fill: lin(c, bx, 104, tx, 104 - L, [[0, a], [1, b]]) });
      });
      pEll(c, 0, 100, 96, 14);
      paint(c, k, { fill: rad(c, 0, 100, 4, 96, [[0, 'rgba(210,160,255,.7)'], [1, 'rgba(210,160,255,0)']]) });
      for (let i = 0; i < 9; i++) {
        const p = saw(k, 1, rnd(i, 7)), x = -86 + rnd(i) * 172, y = 90 - p * 190, r = 3 + rnd(i, 2) * 6;
        pCirc(c, x, y, r); paint(c, k, { fill: '#fff', alpha: 0.65 * bump(p) });
      }
    }
  }),
  def({
    id: 'pp-mic', pack: 'purple', name: 'Mic drop', bw: 60, bh: 96, words: 'mic drop microphone concert sing stage purple',
    draw: (c, k) => {
      const p = saw(k, 1), h = bounce(p), y = -h * 46;
      pEll(c, 0, 90, 36 - h * 14, 7 - h * 2);
      paint(c, k, { fill: 'rgba(0,0,0,.28)', nosil: true });
      c.save();
      c.translate(0, y);
      c.rotate((1 - h) * 0.0 + h * 0.3);
      pRR(c, -13, -4, 26, 90, 12);
      paint(c, k, { fill: lin(c, -13, 0, 13, 0, [[0, '#4a2a8a'], [0.5, '#8a5be0'], [1, '#33195f']]), stroke: INK, lw: 5 });
      pCirc(c, 0, -40, 33);
      paint(c, k, { fill: rad(c, -10, -52, 4, 40, [[0, '#f1e6ff'], [1, '#9a73e8']]), stroke: INK, lw: 5 });
      detail(k, () => {
        c.save(); pCirc(c, 0, -40, 33); c.clip();
        c.strokeStyle = 'rgba(70,30,140,.45)'; c.lineWidth = 2;
        for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 10, -76); c.lineTo(i * 10, -4); c.stroke(); c.beginPath(); c.moveTo(-34, -40 + i * 10); c.lineTo(34, -40 + i * 10); c.stroke(); }
        c.restore();
        pRR(c, -17, -9, 34, 10, 4); paint(c, k, { fill: '#c9a7ff', stroke: INK, lw: 3 });
      });
      c.restore();
      const hit = clamp((p - 0.48) / 0.2);
      if (hit > 0 && hit < 1) {
        for (let i = 0; i < 7; i++) {
          const a = Math.PI + (i / 6) * Math.PI, r0 = 20 + 24 * hit, r1 = r0 + 14 * (1 - hit);
          c.beginPath(); c.moveTo(Math.cos(a) * r0, 90 + Math.sin(a) * r0 * 0.6); c.lineTo(Math.cos(a) * r1, 90 + Math.sin(a) * r1 * 0.6);
          paint(c, k, { stroke: '#ffe27a', lw: 4, alpha: 1 - hit, nosil: true });
        }
      }
    }
  }),
  def({
    id: 'pp-borahae', pack: 'purple', name: 'Purple you', text: true, bw: 92, bh: 64, words: 'borahae i purple you 보라해 purple love bts army',
    draw: (c, k) => {
      for (let i = 0; i < 3; i++) {
        const p = saw(k, 1, i / 3);
        pHeart(c, (i - 1) * 54, -36 - p * 52, 26 - p * 6);
        paint(c, k, { fill: '#c9a7ff', stroke: INK, lw: 3, alpha: bump(p) });
      }
      const s = 1 + wave(k, 3) * 0.03;
      c.save(); c.scale(s, s);
      pRR(c, -90, -34, 180, 92, 44);
      paint(c, k, { fill: lin(c, 0, -34, 0, 58, [[0, '#b794ff'], [1, '#6d28d9']]), stroke: INK, lw: 5 });
      detail(k, () => { pRR(c, -76, -28, 120, 14, 7); paint(c, k, { fill: 'rgba(255,255,255,.28)' }); });
      label(c, k, '보라해', 0, 4, 46, { fill: '#fff', stroke: '#3b0764', lw: 8 });
      label(c, k, 'borahae', 0, 38, 17, { fill: '#e9dcff', stroke: '#3b0764', lw: 4 });
      c.restore();
    }
  }),
  def({
    id: 'pp-confetti', pack: 'purple', name: 'Confetti pop', outline: false, bw: 100, bh: 100, words: 'confetti party celebrate pop purple',
    draw: (c, k) => {
      const cols = ['#c4b5fd', '#a78bfa', '#ffffff', '#7c3aed', '#f0abfc', '#ddd6fe'];
      const p = saw(k, 1), e = ease(Math.min(1, p / 0.45));
      for (let i = 0; i < 30; i++) {
        const a = rnd(i) * TAU, v = 50 + rnd(i, 1) * 70, x = Math.cos(a) * v * e, y = Math.sin(a) * v * e + 70 * Math.max(0, p - 0.3) ** 2 * 1.6;
        c.save(); c.translate(x, y); c.rotate(rnd(i, 2) * TAU + p * (3 + rnd(i, 3) * 6));
        const w = 10 + rnd(i, 4) * 8, h = 6 + rnd(i, 5) * 5;
        pRR(c, -w / 2, -h / 2, w, h, 1.5);
        paint(c, k, { fill: cols[i % cols.length], alpha: 1 - ease(clamp((p - 0.62) / 0.38)) });
        c.restore();
      }
      const f = clamp(1 - p / 0.3);
      if (f > 0) { pCirc(c, 0, 0, 16 + 30 * (1 - f)); paint(c, k, { fill: `rgba(255,255,255,${0.7 * f})` }); }
    }
  }),
  def({
    id: 'pp-bias', pack: 'purple', name: 'Bias wrecker', text: true, bw: 98, bh: 34, words: 'bias wrecker fan kpop favorite purple',
    draw: (c, k) => {
      const g = saw(k, 6) < 0.1 ? 3 : 0;
      c.save(); c.translate(g, 0);
      pRR(c, -96, -28, 192, 56, 28);
      paint(c, k, { fill: lin(c, -96, 0, 96, 0, [[0, '#7c3aed'], [1, '#c026d3']]), stroke: INK, lw: 5 });
      label(c, k, 'BIAS WRECKER', 0, 1, 25, { fill: '#fff', stroke: '#2e1065', lw: 5, maxW: 150 });
      for (const sx of [-1, 1]) {
        pPoly(c, [[0, -16], [-8, 2], [-1, 2], [-6, 18], [8, -3], [1, -3]].map(([x, y]) => [x + sx * 82, y] as [number, number]));
        paint(c, k, { fill: '#ffe45e', stroke: INK, lw: 2.5 });
      }
      c.restore();
    }
  })
];

export const PINK: StickerDef[] = [
  def({
    id: 'pk-crown', pack: 'pink', name: 'Pink crown', bw: 82, bh: 70, words: 'crown queen princess gold pink blackpink kpop royal',
    draw: (c, k) => {
      c.save();
      c.translate(0, wave(k, 2) * 3);
      const pts: ReadonlyArray<readonly [number, number]> = [[-74, 28], [-80, -34], [-40, -4], [0, -54], [40, -4], [80, -34], [74, 28]];
      pPoly(c, pts);
      paint(c, k, { fill: lin(c, 0, -54, 0, 30, [[0, '#fff2a8'], [0.5, '#f7c948'], [1, '#c98b12']]), stroke: INK, lw: 5 });
      pRR(c, -74, 20, 148, 30, 8);
      paint(c, k, { fill: lin(c, 0, 20, 0, 50, [[0, '#ffe58a'], [1, '#d9a21b']]), stroke: INK, lw: 5 });
      detail(k, () => {
        c.save();
        pPoly(c, pts); c.clip();
        const x = -120 + saw(k, 1) * 260;
        c.beginPath(); c.moveTo(x, -70); c.lineTo(x + 26, -70); c.lineTo(x + 6, 60); c.lineTo(x - 20, 60); c.closePath(); c.fillStyle = 'rgba(255,255,255,.45)'; c.fill();
        c.restore();
        for (const [x, y, r] of [[-80, -36, 7], [80, -36, 7], [0, -58, 8]] as const) { pCirc(c, x, y, r); paint(c, k, { fill: '#fff', stroke: INK, lw: 3 }); }
        for (const x of [-44, 0, 44]) { pCirc(c, x, 35, 8); paint(c, k, { fill: x === 0 ? '#ff4fa3' : '#ff9ac8', stroke: INK, lw: 3 }); }
      });
      c.restore();
      for (const [x, y, o] of [[-86, -60, 0], [88, -52, 0.4], [72, 60, 0.7]] as const) {
        pSpark(c, x, y, 7 + 12 * bump(saw(k, 1, o)), 0);
        paint(c, k, { fill: '#fff', stroke: INK, lw: 2.5 });
      }
    }
  }),
  def({
    id: 'pk-neon', pack: 'pink', name: 'Girl crush sign', text: true, bw: 94, bh: 48, words: 'girl crush neon sign pink queen blackpink kpop',
    draw: (c, k) => {
      pRR(c, -92, -46, 184, 92, 22);
      paint(c, k, { fill: '#0d0a14', stroke: '#ff4fb0', lw: 5 });
      detail(k, () => { c.save(); c.shadowColor = '#ff4fb0'; c.shadowBlur = 16; pRR(c, -92, -46, 184, 92, 22); c.strokeStyle = '#ff8ccc'; c.lineWidth = 3; c.stroke(); c.restore(); });
      const flick = saw(k, 3) < 0.12 ? 0.55 : 1;
      c.save();
      c.globalAlpha *= flick;
      if (!k.sil) { c.shadowColor = '#ff2d9a'; c.shadowBlur = 16; }
      label(c, k, 'GIRL', 0, -14, 38, { fill: '#ffe3f3', stroke: '#ff4fb0', lw: 6 });
      label(c, k, 'CRUSH', 0, 24, 38, { fill: '#ffe3f3', stroke: '#ff4fb0', lw: 6 });
      c.restore();
    }
  }),
  def({
    id: 'pk-diamond', pack: 'pink', name: 'Diamond', bw: 84, bh: 84, words: 'diamond gem bling jewel pink luxury',
    draw: (c, k) => {
      const top: ReadonlyArray<readonly [number, number]> = [[-44, -56], [44, -56], [82, -10], [0, 80], [-82, -10]];
      c.save(); c.translate(0, wave(k, 2) * 2.5);
      pPoly(c, top);
      paint(c, k, { fill: lin(c, -80, -56, 80, 80, [[0, '#ffe0f0'], [0.5, '#ff7fc0'], [1, '#d6247f']]), stroke: INK, lw: 5 });
      detail(k, () => {
        c.save(); pPoly(c, top); c.clip();
        c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 3; c.lineJoin = 'round';
        const segs: ReadonlyArray<readonly [number, number, number, number]> = [[-82, -10, 82, -10], [-44, -56, -26, -10], [-26, -10, 0, 80], [44, -56, 26, -10], [26, -10, 0, 80], [0, -56, 0, -10], [-44, -56, 0, -10], [44, -56, 0, -10]];
        for (const [a, b, d, e] of segs) { c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.stroke(); }
        pPoly(c, [[-26, -10], [0, 80], [26, -10]]); c.fillStyle = 'rgba(190,20,110,.18)'; c.fill();
        const x = -120 + saw(k, 1) * 260;
        c.beginPath(); c.moveTo(x, -70); c.lineTo(x + 30, -70); c.lineTo(x + 6, 90); c.lineTo(x - 24, 90); c.closePath(); c.fillStyle = 'rgba(255,255,255,.5)'; c.fill();
        c.restore();
      });
      c.restore();
      for (const [x, y, o] of [[-80, -56, 0], [86, -40, 0.35], [70, 62, 0.7], [-70, 52, 0.15]] as const) {
        pSpark(c, x, y, 7 + 13 * bump(saw(k, 1, o)), 0);
        paint(c, k, { fill: '#fff', stroke: INK, lw: 2.5 });
      }
    }
  }),
  def({
    id: 'pk-lightstick', pack: 'pink', name: 'Heart light stick', bw: 70, bh: 98, words: 'light stick lightstick heart concert pink fan blackpink kpop',
    draw: (c, k) => {
      c.save();
      c.translate(0, 86); c.rotate(wave(k, 1) * 0.22); c.translate(0, -86);
      const g = 0.75 + 0.25 * wave(k, 3);
      pCirc(c, 0, -34, 80);
      paint(c, k, { fill: rad(c, 0, -34, 20, 80, [[0, `rgba(255,120,190,${0.5 * g})`], [1, 'rgba(255,80,160,0)']]), nosil: true });
      pRR(c, -9, 12, 18, 76, 8);
      paint(c, k, { fill: lin(c, -9, 0, 9, 0, [[0, '#444'], [0.5, '#1c1c24'], [1, '#08080c']]), stroke: INK, lw: 5 });
      detail(k, () => { pRR(c, -10, 40, 20, 8, 3); paint(c, k, { fill: '#ff4fa3', stroke: INK, lw: 2.5 }); });
      pHeart(c, 0, -36, 96);
      paint(c, k, { fill: rad(c, -12, -52, 4, 62, [[0, '#ffe3f1'], [0.45, '#ff8cc6'], [1, '#e11d7f']]), stroke: INK, lw: 5 });
      detail(k, () => { pEll(c, -20, -56, 14, 7, -0.65); paint(c, k, { fill: 'rgba(255,255,255,.8)' }); });
      c.restore();
      for (const [x, y, o] of [[-64, -76, 0], [60, -52, 0.4], [54, 34, 0.7]] as const) {
        pSpark(c, x, y, 7 + 11 * bump(saw(k, 1, o)), 0);
        paint(c, k, { fill: '#fff', stroke: INK, lw: 2.5 });
      }
    }
  }),
  def({
    id: 'pk-photocard', pack: 'pink', name: 'Photocard', bw: 62, bh: 90, words: 'photocard photo card holographic idol collect kpop pink',
    draw: (c, k) => {
      c.save();
      c.rotate(0.1 + wave(k, 1) * 0.05);
      pRR(c, -54, -82, 108, 164, 12);
      const sh = saw(k, 1) * 108;
      paint(c, k, { fill: lin(c, -54 + sh - 60, -82, 54 + sh, 82, [[0, '#ffb3e6'], [0.2, '#c7b9ff'], [0.4, '#a5f3fc'], [0.6, '#fef3c7'], [0.8, '#ffc2e2'], [1, '#c7b9ff']]), stroke: INK, lw: 5 });
      pRR(c, -43, -71, 86, 118, 8);
      paint(c, k, { fill: lin(c, 0, -71, 0, 47, [[0, '#ff7ac0'], [1, '#2a1233']]), stroke: '#fff', lw: 3 });
      detail(k, () => {
        pHeart(c, 0, -22, 44); paint(c, k, { fill: '#fff', alpha: 0.95 });
        pStar(c, -22, -50, 9, 4, 5); paint(c, k, { fill: '#ffe27a' });
        pStar(c, 24, 2, 7, 3, 5); paint(c, k, { fill: '#ffe27a' });
        c.save(); pRR(c, -54, -82, 108, 164, 12); c.clip();
        const x = -90 + saw(k, 1) * 220;
        c.beginPath(); c.moveTo(x, -90); c.lineTo(x + 20, -90); c.lineTo(x - 30, 90); c.lineTo(x - 50, 90); c.closePath(); c.fillStyle = 'rgba(255,255,255,.4)'; c.fill();
        c.restore();
      });
      label(c, k, 'PHOTO CARD', 0, 62, 13, { fill: '#6b2150', weight: 900, maxW: 84 });
      label(c, k, '#NOOB', 0, 74, 9, { fill: '#8a3a6c', weight: 800 });
      c.restore();
    }
  }),
  def({
    id: 'pk-bow', pack: 'pink', name: 'Pink bow', bw: 86, bh: 66, words: 'bow ribbon pink cute coquette girly',
    draw: (c, k) => {
      c.save(); c.rotate(wave(k, 2) * 0.03);
      for (const sx of [-1, 1]) {
        pPoly(c, [[sx * 8, 12], [sx * 28, 80], [sx * 12, 68], [sx * 2, 84]]);
        paint(c, k, { fill: '#ff4f9e', stroke: INK, lw: 4.5 });
      }
      for (const sx of [-1, 1]) {
        pEll(c, sx * 42, -6, 44, 30, sx * -0.4);
        paint(c, k, { fill: lin(c, sx * 42, -36, sx * 42, 24, [[0, '#ffa6d3'], [1, '#ff4f9e']]), stroke: INK, lw: 5 });
        detail(k, () => { pEll(c, sx * 42, -6, 24, 13, sx * -0.4); paint(c, k, { stroke: 'rgba(160,20,90,.4)', lw: 3 }); pEll(c, sx * 36, -20, 18, 5, sx * -0.4); paint(c, k, { fill: 'rgba(255,255,255,.55)' }); });
      }
      pCirc(c, 0, 0, 17);
      paint(c, k, { fill: rad(c, -4, -5, 2, 18, [[0, '#ff93c6'], [1, '#e11d7f']]), stroke: INK, lw: 5 });
      c.restore();
      for (const [x, y, o] of [[-86, -48, 0], [88, -44, 0.45], [60, 66, 0.7]] as const) {
        pSpark(c, x, y, 7 + 12 * bump(saw(k, 1, o)), 0);
        paint(c, k, { fill: '#fff', stroke: INK, lw: 2.5 });
      }
    }
  })
];
