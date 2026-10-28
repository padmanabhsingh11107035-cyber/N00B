// K-Drama stickers: the little things every drama has (a love word, the umbrella in the rain, banana milk, ramyeon, a shocked subtitle, the twist). All drawn in code and moving; see kit.ts.
import { INK, bump, def, detail, label, lin, paint, pCirc, pEll, pHeart, pPoly, pRR, pSpark, pStar, rad, rnd, saw, wave, TAU } from '../kit.ts';
import type { StickerDef } from '../kit.ts';

const PINK = '#ff3d81';

export const KDRAMA: StickerDef[] = [
  def({
    id: 'kd-saranghae', pack: 'kdrama', name: 'Saranghae', text: true, words: 'saranghae i love you korean love heart 사랑해 romance',
    draw: (c, k) => {
      for (let i = 0; i < 3; i++) {   // little hearts floating up
        const p = saw(k, 1, i / 3);
        c.save();
        c.globalAlpha = bump(p);
        pHeart(c, (i - 1) * 56 + Math.sin(p * TAU + i) * 10, 52 - p * 140, 32 - p * 8);
        paint(c, k, { fill: i === 1 ? '#ffd0e2' : '#ff9ec2', stroke: INK, lw: 3.5 });
        c.restore();
      }
      const s = 1 + wave(k, 3) * 0.06;
      c.save();
      c.translate(0, 10);
      c.scale(s, s);
      pHeart(c, 0, 0, 156);
      paint(c, k, { fill: lin(c, 0, -62, 0, 82, [[0, '#ff86b2'], [1, '#e11d5a']]), stroke: INK, lw: 5 });
      detail(k, () => { pEll(c, -36, -34, 19, 11, -0.65); paint(c, k, { fill: 'rgba(255,255,255,.6)' }); });
      label(c, k, '사랑해', 0, 0, 38, { fill: '#fff', stroke: '#a3123f' });
      label(c, k, 'saranghae', 0, 34, 15, { fill: '#ffe3ee', stroke: '#a3123f', lw: 3.5 });
      c.restore();
    }
  }),
  def({
    id: 'kd-oppa', pack: 'kdrama', name: 'Oppa', text: true, bw: 90, bh: 70, words: 'oppa 오빠 brother crush speech bubble korean',
    draw: (c, k) => {
      c.save();
      c.translate(0, -Math.abs(wave(k, 2)) * 6);
      c.rotate(wave(k, 1) * 0.06);
      pPoly(c, [[-34, 30], [-60, 74], [4, 38]]);
      paint(c, k, { fill: '#fff', stroke: INK, lw: 5 });
      pRR(c, -88, -56, 176, 100, 44);
      paint(c, k, { fill: '#fff', stroke: INK, lw: 5 });
      detail(k, () => { pRR(c, -72, -46, 100, 14, 7); paint(c, k, { fill: 'rgba(255,61,129,.12)' }); });
      label(c, k, '오빠~', 0, -6, 56, { fill: PINK, stroke: '#ffd0e2', lw: 7 });
      const pop = 0.8 + 0.3 * bump(saw(k, 1));
      pHeart(c, 76, -60, 34 * pop);
      paint(c, k, { fill: PINK, stroke: INK, lw: 3.5 });
      c.restore();
    }
  }),
  def({
    id: 'kd-daebak', pack: 'kdrama', name: 'Daebak!', text: true, words: 'daebak 대박 wow awesome amazing omg korean',
    draw: (c, k) => {
      const s = 1 + wave(k, 4) * 0.045;
      pStar(c, 0, 0, 98 * s, 68 * s, 12, saw(k, 1) * (TAU / 12));
      paint(c, k, { fill: rad(c, 0, -10, 8, 100, [[0, '#fff38a'], [1, '#ffb11b']]), stroke: INK, lw: 5 });
      label(c, k, '대박!', 0, -4, 60, { fill: '#e11d48', stroke: '#fff', lw: 11 });
      label(c, k, 'DAEBAK', 0, 40, 17, { fill: INK, weight: 900 });
    }
  }),
  def({
    id: 'kd-hwaiting', pack: 'kdrama', name: 'Hwaiting!', text: true, bw: 100, bh: 56, words: 'hwaiting fighting 화이팅 cheer good luck korean',
    draw: (c, k) => {
      const top = (x: number): number => -34 + Math.sin(x * 0.045 + k.ph) * 9;
      c.beginPath();
      for (let x = -94; x <= 94; x += 4) (x === -94 ? c.moveTo(x, top(x)) : c.lineTo(x, top(x)));
      for (let x = 94; x >= -94; x -= 4) c.lineTo(x, top(x) + 68);
      c.closePath();
      paint(c, k, { fill: lin(c, 0, -40, 0, 40, [[0, '#ff6b6b'], [1, '#d62839']]), stroke: INK, lw: 5 });
      label(c, k, '화이팅!', 0, top(0) + 28, 46, { fill: '#fff', stroke: '#8f1230' });
      label(c, k, 'FIGHTING!', 0, top(0) + 54, 12, { fill: '#ffe3e3', stroke: '#8f1230', lw: 3 });
      for (const [sx, off] of [[-86, 0], [86, 0.5]] as const) {
        const q = 0.55 + 0.45 * bump(saw(k, 1, off));
        pSpark(c, sx, -52, 18 * q, 0.4);
        paint(c, k, { fill: '#fff6a8', stroke: INK, lw: 2.5 });
      }
    }
  }),
  def({
    id: 'kd-umbrella', pack: 'kdrama', name: 'Rainy day', words: 'umbrella rain rainy day romance drama',
    draw: (c, k) => {
      for (let i = 0; i < 11; i++) {   // the rain
        const p = saw(k, 1, rnd(i, 2)), x = -92 + i * 18.4 + rnd(i) * 6, y = -104 + p * 214;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x - 4, y + 18);
        paint(c, k, { stroke: '#8fd0ff', lw: 3.5, nosil: true });
      }
      c.save();
      c.translate(0, -4);
      c.rotate(wave(k, 1) * 0.07);
      c.beginPath(); c.moveTo(0, 8); c.lineTo(0, 76); c.arc(-12, 76, 12, 0, Math.PI, false);   // the handle
      paint(c, k, { stroke: INK, lw: 11 });
      paint(c, k, { stroke: '#e8b88a', lw: 5 });
      c.beginPath(); c.arc(0, 10, 82, Math.PI, 0);
      for (let i = 0; i < 4; i++) c.arc(62 - i * 41, 10, 20.5, 0, Math.PI, false);
      c.closePath();
      paint(c, k, { fill: lin(c, -80, -70, 80, 10, [[0, '#ff7a93'], [1, '#e11d48']]), stroke: INK, lw: 5 });
      detail(k, () => {
        for (const x of [-41, 0, 41]) { c.beginPath(); c.moveTo(0, -72); c.quadraticCurveTo(x * 0.95, -38, x, 8); paint(c, k, { stroke: 'rgba(120,10,40,.55)', lw: 3 }); }
        pEll(c, -38, -44, 18, 8, -0.7); paint(c, k, { fill: 'rgba(255,255,255,.5)' });
      });
      c.restore();
      for (const [hx, hy, off] of [[-40, 54, 0], [40, 62, 0.5]] as const) {
        pHeart(c, hx, hy, 20 + bump(saw(k, 1, off)) * 6);
        paint(c, k, { fill: '#ff9ec2', stroke: INK, lw: 3 });
      }
    }
  }),
  def({
    id: 'kd-bananamilk', pack: 'kdrama', name: 'Banana milk', words: 'banana milk drink snack korean cute',
    draw: (c, k) => {
      c.save();
      c.translate(0, wave(k, 2) * 3);
      c.rotate(wave(k, 1) * 0.05);
      c.beginPath(); c.moveTo(14, -66); c.lineTo(30, -96); c.lineTo(46, -96);   // the straw
      paint(c, k, { stroke: INK, lw: 11 });
      paint(c, k, { stroke: '#ff6fa5', lw: 6 });
      pPoly(c, [[-46, -38], [46, -38], [32, -68], [-32, -68]]);
      paint(c, k, { fill: '#ffe27a', stroke: INK, lw: 5 });
      pRR(c, -46, -38, 92, 112, 10);
      paint(c, k, { fill: lin(c, -46, 0, 46, 0, [[0, '#fff6c2'], [1, '#ffe98f']]), stroke: INK, lw: 5 });
      c.beginPath(); c.moveTo(-26, 12); c.quadraticCurveTo(0, 40, 30, 4); c.quadraticCurveTo(4, 24, -26, 12); c.closePath();   // the banana
      paint(c, k, { fill: '#ffcf2e', stroke: INK, lw: 3 });
      detail(k, () => {
        for (const x of [-16, 16]) { pCirc(c, x, -14, 4.5); paint(c, k, { fill: INK }); }
        c.beginPath(); c.arc(0, -8, 7, 0.15 * Math.PI, 0.85 * Math.PI); paint(c, k, { stroke: INK, lw: 3 });
        for (const x of [-28, 28]) { pEll(c, x, -4, 7, 5); paint(c, k, { fill: 'rgba(255,120,160,.65)' }); }
        pRR(c, -34, -34, 10, 56, 5); paint(c, k, { fill: 'rgba(255,255,255,.55)' });
      });
      label(c, k, 'BANANA', 0, 46, 15, { fill: '#b9740f', stroke: '#fff6c2', lw: 3 });
      label(c, k, 'MILK', 0, 62, 15, { fill: '#b9740f', stroke: '#fff6c2', lw: 3 });
      c.restore();
      for (const [sx, sy, off] of [[-70, -44, 0], [68, 18, 0.5]] as const) {
        pSpark(c, sx, sy, 8 + 14 * bump(saw(k, 1, off)), 0);
        paint(c, k, { fill: '#fff6a8', stroke: INK, lw: 2.5 });
      }
    }
  }),
  def({
    id: 'kd-ramyeon', pack: 'kdrama', name: 'Ramyeon', words: 'ramyeon ramen noodles instant food korean 라면 hot',
    draw: (c, k) => {
      for (let i = 0; i < 3; i++) {   // steam
        const p = saw(k, 1, i / 3), x = -30 + i * 30 + Math.sin(p * TAU + i) * 7, y = -26 - p * 62;
        c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x - 10, y - 12, x + 10, y - 22, x, y - 36);
        paint(c, k, { stroke: '#ffffff', lw: 7, alpha: 0.85 * bump(p), nosil: true });
      }
      for (const sx of [-1, 1]) { pEll(c, sx * 88, 14, 12, 8); paint(c, k, { fill: '#b91c1c', stroke: INK, lw: 4 }); }   // handles
      c.beginPath(); c.moveTo(-84, -6); c.lineTo(84, -6); c.quadraticCurveTo(84, 70, 0, 74); c.quadraticCurveTo(-84, 70, -84, -6); c.closePath();
      paint(c, k, { fill: lin(c, 0, -6, 0, 74, [[0, '#ff6a5b'], [1, '#c4231a']]), stroke: INK, lw: 5 });
      pEll(c, 0, -6, 84, 15);
      paint(c, k, { fill: '#ffd98a', stroke: INK, lw: 5 });
      detail(k, () => {
        for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-64 + i * 10, -8 + i * 2); c.bezierCurveTo(-30, -18 + i * 3, 20, 4 + i * 2, 66 - i * 8, -8 + i * 2); paint(c, k, { stroke: '#e9a93a', lw: 3 }); }
        pEll(c, -26, -8, 22, 8); paint(c, k, { fill: '#fff', stroke: INK, lw: 2.5 });
        pCirc(c, -26, -9, 6.5); paint(c, k, { fill: '#ffae1a' });
      });
      label(c, k, '라면', 0, 38, 32, { fill: '#fff', stroke: '#8f1411', lw: 6 });
      const lift = Math.abs(wave(k, 1)) * 10;   // the chopsticks lift a bundle of noodles
      c.save();
      c.translate(0, -lift);
      for (const [x0, y0, x1, y1] of [[34, -78, 12, -6], [52, -72, 22, 0]] as const) {
        c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); paint(c, k, { stroke: INK, lw: 10 }); paint(c, k, { stroke: '#d9a066', lw: 5 });
      }
      c.beginPath(); c.moveTo(10, -4); c.bezierCurveTo(-4, 8, 28, 10, 16, 22); paint(c, k, { stroke: '#f4c44a', lw: 5 });
      c.restore();
    }
  }),
  def({
    id: 'kd-subtitle', pack: 'kdrama', name: 'Drama subtitle', text: true, bw: 100, bh: 30, words: 'subtitle caption omg shocked drama wait what',
    draw: (c, k) => {
      const lines = ['Wait... WHAT?!', 'Omo omo omo!', 'Aigoo~ really?'];
      const idx = Math.floor(k.t / 1) % 3, p = (k.t % 1) / 0.55;
      const shown = lines[idx].slice(0, Math.ceil(lines[idx].length * Math.min(1, p)));
      pRR(c, -98, -27, 196, 54, 13);
      paint(c, k, { fill: 'rgba(14,12,20,.86)', stroke: '#ffffff', lw: 2.5 });
      label(c, k, shown, -82, 1, 24, { fill: '#fff', align: 'left', weight: 800, maxW: 168 });
      detail(k, () => { if (p < 1) { c.fillStyle = '#ffd23f'; c.fillRect(-82 + Math.min(168, shown.length * 12.4), -11, 3, 22); } });
    }
  }),
  def({
    id: 'kd-twist', pack: 'kdrama', name: 'Plot twist', text: true, words: 'plot twist drama shock surprise lightning',
    draw: (c, k) => {
      const j = wave(k, 12) * 1.6, s = 1 + wave(k, 6) * 0.025;
      c.save();
      c.translate(j, -j * 0.5);
      c.scale(s, s);
      pStar(c, 0, 0, 98, 72, 9, 0.2);
      paint(c, k, { fill: rad(c, 0, -8, 8, 100, [[0, '#fff59a'], [1, '#ffc414']]), stroke: INK, lw: 5 });
      label(c, k, 'PLOT', 0, -22, 46, { fill: '#e11d48', stroke: INK, lw: 9, rot: -0.12 });
      label(c, k, 'TWIST!', 0, 26, 46, { fill: '#e11d48', stroke: INK, lw: 9, rot: -0.12 });
      c.restore();
      const on = saw(k, 3) < 0.35, side = Math.floor(k.t) % 3 === 1 ? 1 : -1;   // 3 flashes in a loop: the middle one on the other side
      if (on) {
        pPoly(c, [[0, -34], [-15, 2], [-3, 2], [-12, 36], [17, -8], [4, -8]].map(([x, y]) => [x + side * 80, y - 56] as [number, number]));
        paint(c, k, { fill: '#fff3a0', stroke: INK, lw: 4 });
      }
    }
  }),
  def({
    id: 'kd-tears', pack: 'kdrama', name: 'Drama tears', words: 'cry crying tears sad drama emotional face',
    draw: (c, k) => {
      const q = wave(k, 1) * 0.04;
      c.save();
      c.rotate(q);
      pCirc(c, 0, -4, 70);
      paint(c, k, { fill: rad(c, -16, -30, 6, 84, [[0, '#fff0a0'], [1, '#ffc22e']]), stroke: INK, lw: 5 });
      detail(k, () => {
        for (const sx of [-1, 1]) {
          c.beginPath(); c.moveTo(sx * 34, 4); c.lineTo(sx * 40, 66);
          paint(c, k, { stroke: '#8fd0ff', lw: 8, alpha: 0.55 + 0.2 * wave(k, 3) });
          pEll(c, sx * 26, -12, 13, 17); paint(c, k, { fill: '#2b1a3d' });
          pCirc(c, sx * 26 - 4, -19, 5.5); paint(c, k, { fill: '#fff' });
          pCirc(c, sx * 26 + 5, -6, 2.8); paint(c, k, { fill: '#fff' });
          pEll(c, sx * 26, 3, 12, 5); paint(c, k, { fill: 'rgba(120,200,255,.85)' });
          c.beginPath(); c.moveTo(sx * 44, -30); c.lineTo(sx * 14, -42); paint(c, k, { stroke: INK, lw: 4 });
          pEll(c, sx * 46, 18, 9, 6); paint(c, k, { fill: 'rgba(255,120,130,.5)' });
        }
        c.beginPath(); c.moveTo(-17, 38); c.quadraticCurveTo(0, 26 + wave(k, 6) * 2.5, 17, 38); paint(c, k, { stroke: INK, lw: 4.5 });
      });
      c.restore();
      for (const sx of [-1, 1]) {   // drops falling from the eyes
        const p = saw(k, 1, sx < 0 ? 0 : 0.5), y = 8 + p * 88;
        pEll(c, sx * (36 + p * 6), y, 6, 8.5);
        paint(c, k, { fill: '#69b8ff', stroke: '#2d6cc0', lw: 2.5, alpha: 1 - Math.max(0, (p - 0.8) * 5) });
      }
    }
  })
];
