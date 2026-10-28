import type { FaceFrame } from './types.ts';
import { clamp } from './faceMath.ts';
import { TAU, bloom, hash, heart, lin, magnify, rad, rr, scratch, spark, starPath, vignette } from './draw.ts';
import type { Ctx } from './draw.ts';

// The lenses. Each one is drawn from scratch with the canvas (no pictures to download), around a face in "eye distances" (see types.ts / draw.ts inFace): 0,0 is the spot between the
// eyes, +x is to the right of the screen, +y is down, and f.top / f.chin / f.halfW say where this face's forehead, chin and cheeks really are. Moving things use the time `t`
// (seconds) only, never saved state, so a dropped frame can not leave anything behind.

export interface LensDef {
  id: string;
  name: string;
  /** "face" lenses need a face to be drawn on; "look" lenses change the colours of the whole picture and work without one */
  kind: 'face' | 'look';
  /** the colour of the glow behind the lens's little picture in the list */
  color: string;
  /** changes the whole picture first (colours, magnifying); faces are in pixels */
  base?: (c: Ctx, w: number, h: number, faces: FaceFrame[], t: number) => void;
  /** drawn on each face, with the drawing space set to the face */
  face?: (c: Ctx, f: FaceFrame, t: number) => void;
  /** drawn over everything, in pixels of the picture */
  top?: (c: Ctx, w: number, h: number, t: number) => void;
}

/** run `fn` once for the right-hand side (+1) and once mirrored for the left-hand side (-1) */
const sides = (c: Ctx, fn: (s: 1 | -1) => void): void => {
  for (const s of [-1, 1] as const) { c.save(); c.scale(s, 1); fn(s); c.restore(); }
};
const wob = (t: number, speed: number, amount: number, phase = 0): number => Math.sin(t * speed + phase) * amount;
const tint = (color: string, mode: GlobalCompositeOperation = 'soft-light') => (c: Ctx, w: number, h: number): void => {
  c.save(); c.globalCompositeOperation = mode; c.fillStyle = color; c.fillRect(0, 0, w, h); c.restore();
};

// ---------------------------------------------------------------- Devil: flaming horns and rising embers
const devil = (c: Ctx, f: FaceFrame, t: number): void => {
  const A = c.globalAlpha;
  const flare = 1 + f.mouthOpen * 0.16 + f.browUp * 0.1;   // the horns flare up when the mouth opens or the eyebrows go up
  sides(c, (s) => {
    c.save();
    c.translate(f.halfW * 0.5, f.top + 0.2);
    c.scale(flare, flare);
    const flick = wob(t, 9, 0.025, s > 0 ? 0 : 2);
    c.shadowColor = 'rgba(255,110,30,.9)';
    c.shadowBlur = f.u * 0.32;
    c.fillStyle = lin(c, 0, 0.15, 0.25, -1.1, [[0, '#8f0d12'], [0.4, '#ff4d1a'], [1, '#ffd23f']]);
    c.beginPath();
    c.moveTo(-0.21, 0.14);
    c.bezierCurveTo(-0.3, -0.35, -0.04, -0.82, 0.42 + flick, -1.1);
    c.bezierCurveTo(0.31, -0.64, 0.38, -0.2, 0.24, 0.16);
    c.closePath();
    c.fill();
    c.shadowBlur = 0;
    c.lineWidth = 0.03; c.strokeStyle = 'rgba(80,8,8,.85)'; c.stroke();
    c.lineCap = 'round'; c.lineWidth = 0.028; c.strokeStyle = 'rgba(255,238,170,.6)';
    c.beginPath(); c.moveTo(-0.1, 0.02); c.bezierCurveTo(-0.17, -0.38, 0, -0.74, 0.3, -0.97); c.stroke();
    c.restore();
  });
  for (let i = 0; i < 18; i++) {   // embers
    const ph = (t * (0.22 + hash(i) * 0.25) + hash(i + 40)) % 1;
    const x = (hash(i + 9) - 0.5) * f.halfW * 2.8 + Math.sin(ph * 7 + i) * 0.1;
    const y = f.top + 0.3 - ph * 1.9;
    c.globalAlpha = A * (1 - ph) * (0.55 + 0.45 * hash(i + 3));
    c.fillStyle = i % 3 ? '#ffb347' : '#ff5a1f';
    c.beginPath(); c.arc(x, y, 0.02 + 0.03 * (1 - ph) * hash(i + 5), 0, TAU); c.fill();
  }
  c.globalAlpha = A;
};

// ---------------------------------------------------------------- Shades: dark glasses with a fiery shine
const shades = (c: Ctx, f: FaceFrame, t: number): void => {
  const A = c.globalAlpha;
  const glass = (x: number): void => rr(c, x - 0.45, -0.28, 0.9, 0.62, 0.22);
  c.lineCap = 'round'; c.strokeStyle = '#0a0a0c'; c.lineWidth = 0.07;
  for (const s of [-1, 1]) {   // the arms: the one on the side that turns away fades
    c.globalAlpha = A * (1 - Math.max(0, s * f.yaw) * 0.85);
    c.beginPath(); c.moveTo(s * 0.93, -0.12); c.lineTo(s * (f.halfW + 0.06), -0.06); c.stroke();
  }
  c.globalAlpha = A;
  c.beginPath(); c.moveTo(-0.1, -0.12); c.quadraticCurveTo(0, -0.24, 0.1, -0.12); c.stroke();
  for (const x of [-0.5, 0.5]) {
    c.save();
    glass(x); c.clip();
    c.fillStyle = lin(c, 0, -0.3, 0, 0.36, [[0, '#101014'], [0.55, '#1c1512'], [1, '#3a2312']]);
    c.fillRect(x - 0.5, -0.3, 1, 0.7);
    c.fillStyle = rad(c, x, 0.44, 0, x, 0.44, 0.55, [[0, 'rgba(255,150,40,.72)'], [1, 'rgba(255,90,20,0)']]);
    c.fillRect(x - 0.5, -0.3, 1, 0.7);
    const sx = x - 0.45 + (((t * 0.4) % 2) - 0.4) * 0.9;   // a shine that sweeps across
    c.fillStyle = 'rgba(255,255,255,.22)';
    c.beginPath(); c.moveTo(sx, -0.3); c.lineTo(sx + 0.16, -0.3); c.lineTo(sx - 0.14, 0.36); c.lineTo(sx - 0.3, 0.36); c.closePath(); c.fill();
    c.restore();
    glass(x); c.lineWidth = 0.075; c.strokeStyle = '#0a0a0c'; c.stroke();
  }
};

// ---------------------------------------------------------------- Puppy: floppy ears, a wet nose and a tongue that comes out with the mouth
const puppy = (c: Ctx, f: FaceFrame, t: number): void => {
  sides(c, (s) => {
    c.save();
    c.translate(f.halfW * 0.78, f.top + 0.28);
    c.rotate(0.12 + wob(t, 3, 0.04, s > 0 ? 0 : 1.7));
    c.fillStyle = lin(c, 0, 0, 0.5, 1, [[0, '#b27644'], [1, '#6a3d1c']]);
    c.beginPath();
    c.moveTo(-0.12, -0.05);
    c.bezierCurveTo(0.35, -0.2, 0.75, 0.15, 0.78, 0.7);
    c.bezierCurveTo(0.8, 1.15, 0.38, 1.22, 0.24, 0.85);
    c.bezierCurveTo(0.14, 0.58, -0.02, 0.35, -0.12, -0.05);
    c.closePath();
    c.fill();
    c.lineWidth = 0.03; c.strokeStyle = '#3f240f'; c.stroke();
    c.fillStyle = 'rgba(40,18,6,.35)';
    c.beginPath(); c.ellipse(0.4, 0.62, 0.17, 0.4, 0.15, 0, TAU); c.fill();
    c.restore();
  });
  const open = clamp((f.mouthOpen - 0.15) / 0.5, 0, 1);
  if (open > 0) {   // the tongue
    const m = f.mouth, len = 0.2 + 0.42 * open, y0 = m.y + 0.04 + f.mouthOpen * 0.2;
    c.fillStyle = lin(c, 0, y0, 0, y0 + len, [[0, '#ff8fb1'], [1, '#e24a7d']]);
    c.beginPath(); c.moveTo(m.x - 0.17, y0); c.quadraticCurveTo(m.x - 0.2, y0 + len, m.x, y0 + len + 0.05); c.quadraticCurveTo(m.x + 0.2, y0 + len, m.x + 0.17, y0); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(150,30,70,.55)'; c.lineWidth = 0.025; c.lineCap = 'round';
    c.beginPath(); c.moveTo(m.x, y0 + 0.04); c.lineTo(m.x, y0 + len * 0.75); c.stroke();
  }
  const n = f.nose;
  c.fillStyle = '#141418';
  c.beginPath(); c.moveTo(n.x - 0.19, n.y - 0.09); c.quadraticCurveTo(n.x, n.y - 0.2, n.x + 0.19, n.y - 0.09); c.quadraticCurveTo(n.x + 0.17, n.y + 0.11, n.x, n.y + 0.17); c.quadraticCurveTo(n.x - 0.17, n.y + 0.11, n.x - 0.19, n.y - 0.09); c.fill();
  c.fillStyle = 'rgba(255,255,255,.55)';
  c.beginPath(); c.ellipse(n.x - 0.07, n.y - 0.09, 0.06, 0.028, -0.2, 0, TAU); c.fill();
};

// ---------------------------------------------------------------- Kitty: pointed ears, a pink nose and whiskers
const kitty = (c: Ctx, f: FaceFrame, t: number): void => {
  sides(c, () => {
    c.save();
    c.translate(f.halfW * 0.58, f.top + 0.34);
    c.rotate(0.12 + wob(t, 2.6, 0.015));
    c.fillStyle = lin(c, 0, -0.86, 0, 0.12, [[0, '#dfe3e8'], [1, '#9aa1ac']]);
    c.beginPath(); c.moveTo(-0.36, 0.12); c.quadraticCurveTo(-0.26, -0.45, 0.2, -0.86); c.quadraticCurveTo(0.54, -0.5, 0.62, 0.06); c.closePath(); c.fill();
    c.lineWidth = 0.03; c.strokeStyle = '#4b5059'; c.lineJoin = 'round'; c.stroke();
    c.fillStyle = '#ff9db8';
    c.beginPath(); c.moveTo(-0.18, 0.04); c.quadraticCurveTo(-0.12, -0.3, 0.2, -0.6); c.quadraticCurveTo(0.38, -0.34, 0.43, 0); c.closePath(); c.fill();
    c.restore();
  });
  const n = f.nose;
  sides(c, () => {   // whiskers: a dark line under a white one, so they show on every background
    c.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const y = n.y + 0.04 + i * 0.13, a = (i - 1) * 0.17;
      for (const [w, col] of [[0.06, 'rgba(30,30,40,.55)'], [0.03, '#ffffff']] as const) {
        c.lineWidth = w; c.strokeStyle = col;
        c.beginPath(); c.moveTo(0.34, y); c.quadraticCurveTo(0.9, y + a * 0.4 - 0.03, 1.55, y + a); c.stroke();
      }
    }
  });
  c.fillStyle = '#ff7fa3';
  c.beginPath(); c.moveTo(n.x - 0.14, n.y - 0.1); c.quadraticCurveTo(n.x, n.y - 0.16, n.x + 0.14, n.y - 0.1); c.quadraticCurveTo(n.x + 0.1, n.y + 0.03, n.x, n.y + 0.1); c.quadraticCurveTo(n.x - 0.1, n.y + 0.03, n.x - 0.14, n.y - 0.1); c.fill();
};

// ---------------------------------------------------------------- Bunny: tall ears that wobble, a pink nose, front teeth
const bunny = (c: Ctx, f: FaceFrame, t: number): void => {
  sides(c, (s) => {
    c.save();
    c.translate(0.42, f.top + 0.3);
    c.rotate(0.14 + wob(t, 2.2, 0.05, s > 0 ? 0 : 1) + f.browUp * 0.12);
    c.fillStyle = lin(c, 0, -1.55, 0, 0.2, [[0, '#ffffff'], [1, '#e9ddf7']]);
    c.beginPath(); c.moveTo(-0.22, 0.2); c.bezierCurveTo(-0.38, -0.55, -0.16, -1.35, 0.14, -1.55); c.bezierCurveTo(0.46, -1.33, 0.46, -0.5, 0.26, 0.2); c.closePath(); c.fill();
    c.lineWidth = 0.03; c.strokeStyle = '#b9a6d3'; c.stroke();
    c.fillStyle = '#ffb3cf';
    c.beginPath(); c.moveTo(-0.1, 0.1); c.bezierCurveTo(-0.2, -0.5, -0.04, -1.1, 0.14, -1.3); c.bezierCurveTo(0.34, -1.1, 0.32, -0.5, 0.18, 0.1); c.closePath(); c.fill();
    c.restore();
  });
  const n = f.nose;
  c.fillStyle = '#ff8fb3';
  c.beginPath(); c.ellipse(n.x, n.y - 0.02, 0.12, 0.085, 0, 0, TAU); c.fill();
  if (f.mouthOpen < 0.4) {   // two front teeth
    c.fillStyle = '#ffffff'; c.strokeStyle = '#c9c2d6'; c.lineWidth = 0.02;
    for (const x of [-0.065, 0.065]) { rr(c, n.x + x - 0.065, f.mouth.y - 0.04, 0.13, 0.19, 0.04); c.fill(); c.stroke(); }
  }
};

// ---------------------------------------------------------------- Royal: a gold crown with jewels
const crown = (c: Ctx, f: FaceFrame, t: number): void => {
  c.save();
  c.translate(f.yaw * 0.15, f.top - 0.04);
  c.shadowColor = 'rgba(255,200,60,.55)'; c.shadowBlur = f.u * 0.18;
  c.fillStyle = lin(c, 0, -0.5, 0, 0.32, [[0, '#fff3b0'], [0.45, '#f2b824'], [1, '#a8680a']]);
  c.beginPath();
  c.moveTo(-0.64, 0.32); c.lineTo(-0.72, -0.26); c.lineTo(-0.4, -0.04); c.lineTo(-0.2, -0.46); c.lineTo(0, -0.08); c.lineTo(0.2, -0.46); c.lineTo(0.4, -0.04); c.lineTo(0.72, -0.26); c.lineTo(0.64, 0.32);
  c.closePath(); c.fill();
  c.shadowBlur = 0;
  c.lineJoin = 'round'; c.lineWidth = 0.035; c.strokeStyle = '#7a4a05'; c.stroke();
  c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(-0.62, 0.1, 1.24, 0.045);
  const gems: ReadonlyArray<readonly [number, number, number, string]> = [[-0.72, -0.28, 0.07, '#ff4d6d'], [-0.2, -0.48, 0.075, '#4cc9f0'], [0.2, -0.48, 0.075, '#4cc9f0'], [0.72, -0.28, 0.07, '#ff4d6d'], [0, 0.18, 0.09, '#3ddc84']];
  for (const [x, y, r, col] of gems) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, TAU); c.fill(); }
  const tw = 0.5 + 0.5 * Math.sin(t * 4);
  spark(c, -0.2, -0.5, 0.1 + 0.06 * tw, 'rgba(255,255,255,.95)');
  spark(c, 0.72, -0.3, 0.1 + 0.06 * (1 - tw), 'rgba(255,255,255,.95)');
  c.restore();
};

// ---------------------------------------------------------------- Bloom: a crown of flowers
const BLOOM_COLORS = ['#ff7eb6', '#ffd166', '#ffffff', '#b388ff', '#ff9f68', '#7ee0c3'];
const bloomCrown = (c: Ctx, f: FaceFrame, t: number): void => {
  const cy = f.top + 0.55, rx = f.halfW * 0.98, ry = 0.66, n = 9;
  const at = (i: number): [number, number] => { const a = Math.PI * (1.04 + 0.92 * (i / (n - 1))); return [Math.cos(a) * rx, cy + Math.sin(a) * ry + wob(t, 2, 0.012, i)]; };
  c.fillStyle = '#3fae6a';
  for (let i = 0; i < n - 1; i++) {   // leaves between the flowers
    const [x0, y0] = at(i), [x1, y1] = at(i + 1);
    for (const k of [-1, 1]) { c.save(); c.translate((x0 + x1) / 2, (y0 + y1) / 2); c.rotate(Math.atan2(y1 - y0, x1 - x0) + k * 0.7); c.beginPath(); c.ellipse(0.1, 0, 0.14, 0.05, 0, 0, TAU); c.fill(); c.restore(); }
  }
  for (let i = 0; i < n; i++) {
    const [x, y] = at(i), r = 0.17 + 0.05 * Math.sin(i * 2.1), col = BLOOM_COLORS[i % BLOOM_COLORS.length];
    c.save(); c.translate(x, y); c.rotate(i * 0.7 + wob(t, 1.5, 0.1, i));
    c.fillStyle = col; c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 0.015;
    for (let p = 0; p < 6; p++) { c.save(); c.rotate((p * TAU) / 6); c.beginPath(); c.ellipse(r * 0.62, 0, r * 0.52, r * 0.34, 0, 0, TAU); c.fill(); c.stroke(); c.restore(); }
    c.fillStyle = col === '#ffd166' ? '#e07a1f' : '#ffd166'; c.beginPath(); c.arc(0, 0, r * 0.3, 0, TAU); c.fill();
    c.restore();
  }
};

// ---------------------------------------------------------------- Angel: a glowing halo and twinkles
const angel = (c: Ctx, f: FaceFrame, t: number): void => {
  const A = c.globalAlpha;
  const y = f.top - 0.34 + wob(t, 2, 0.04), x = f.yaw * 0.12;
  c.save();
  c.shadowColor = `rgba(255,225,120,${0.7 + 0.25 * Math.sin(t * 3)})`; c.shadowBlur = f.u * 0.28;
  c.lineWidth = 0.075; c.strokeStyle = lin(c, -0.6, y, 0.6, y, [[0, '#ffe58a'], [0.5, '#fff7cf'], [1, '#f2b824']]);
  c.beginPath(); c.ellipse(x, y, 0.62, 0.15, 0, 0, TAU); c.stroke();
  c.restore();
  for (let i = 0; i < 7; i++) {
    const ph = (t * 0.5 + hash(i + 70)) % 1;
    const sx = (hash(i + 3) - 0.5) * f.halfW * 3, sy = f.top - 0.7 + hash(i + 11) * 1.5;
    c.globalAlpha = A * Math.sin(ph * Math.PI);
    spark(c, sx, sy, 0.05 + 0.1 * hash(i + 21) * Math.sin(ph * Math.PI), '#fff6c9', ph * 2);
  }
  c.globalAlpha = A;
};

// ---------------------------------------------------------------- Crush: heart eyes, rosy cheeks, floating hearts
const crush = (c: Ctx, f: FaceFrame, t: number): void => {
  const A = c.globalAlpha;
  for (const s of [-1, 1]) {
    c.fillStyle = rad(c, s * 0.82, 0.62, 0, s * 0.82, 0.62, 0.34, [[0, 'rgba(255,90,130,.55)'], [1, 'rgba(255,90,130,0)']]);
    c.beginPath(); c.arc(s * 0.82, 0.62, 0.34, 0, TAU); c.fill();
  }
  const pulse = 1 + 0.09 * Math.sin(t * 7);
  for (const [x, blink] of [[-0.5, f.blinkL], [0.5, f.blinkR]] as const) {
    c.save(); c.translate(x, 0.02); c.scale(pulse, pulse * (1 - 0.7 * blink));
    heart(c, 0, 0, 0.66, '#ff6b8b', '#d90f45');
    c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.ellipse(-0.17, -0.2, 0.08, 0.05, -0.6, 0, TAU); c.fill();
    c.restore();
  }
  const n = 6 + Math.round(f.smile * 6);   // more hearts while smiling
  for (let i = 0; i < n; i++) {
    const ph = (t * (0.3 + hash(i) * 0.2) + hash(i + 20)) % 1;
    const x = (hash(i + 7) - 0.5) * f.halfW * 2.4 + Math.sin(ph * 6 + i) * 0.12, y = f.top + 0.1 - ph * 1.6;
    c.globalAlpha = A * Math.sin(ph * Math.PI);
    c.save(); c.translate(x, y); c.rotate(Math.sin(ph * 5 + i) * 0.3);
    heart(c, 0, 0, 0.12 + 0.12 * hash(i + 3), i % 2 ? '#ff4d79' : '#ff9ebb');
    c.restore();
  }
  c.globalAlpha = A;
};

// ---------------------------------------------------------------- Gentleman: a top hat and a curly moustache
const gentleman = (c: Ctx, f: FaceFrame): void => {
  const by = f.top + 0.16;
  c.save(); c.translate(f.yaw * 0.12, 0);
  c.fillStyle = lin(c, -0.5, 0, 0.5, 0, [[0, '#131316'], [0.5, '#2f2f36'], [1, '#0e0e11']]);
  rr(c, -0.5, by - 0.95, 1, 0.95, 0.06); c.fill();
  c.fillStyle = '#c8102e'; c.fillRect(-0.5, by - 0.32, 1, 0.17);
  c.fillStyle = '#1b1b20'; c.beginPath(); c.ellipse(0, by - 0.95, 0.5, 0.1, 0, 0, TAU); c.fill();
  c.fillStyle = '#0d0d10'; c.beginPath(); c.ellipse(0, by, 0.92, 0.16, 0, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 0.02; c.stroke();
  c.restore();
  const n = f.nose, m = f.mouth, k = clamp(f.mouthW / 0.7, 0.8, 1.4);
  c.save(); c.translate(n.x, n.y + (m.y - n.y) * 0.42); c.scale(k, k);
  c.fillStyle = lin(c, 0, -0.15, 0, 0.2, [[0, '#4a3520'], [1, '#150d06']]);
  c.beginPath();
  c.moveTo(0, -0.05);
  c.bezierCurveTo(-0.14, -0.14, -0.36, -0.12, -0.54, -0.02);
  c.bezierCurveTo(-0.66, 0.04, -0.76, -0.04, -0.8, -0.2);
  c.bezierCurveTo(-0.8, 0.12, -0.62, 0.24, -0.4, 0.2);
  c.bezierCurveTo(-0.22, 0.17, -0.08, 0.1, 0, 0.1);
  c.bezierCurveTo(0.08, 0.1, 0.22, 0.17, 0.4, 0.2);
  c.bezierCurveTo(0.62, 0.24, 0.8, 0.12, 0.8, -0.2);
  c.bezierCurveTo(0.76, -0.04, 0.66, 0.04, 0.54, -0.02);
  c.bezierCurveTo(0.36, -0.12, 0.14, -0.14, 0, -0.05);
  c.closePath(); c.fill();
  c.restore();
};

// ---------------------------------------------------------------- Clown: a red nose, a rainbow wig, a painted star
const CLOWN: ReadonlyArray<readonly [string, string]> = [['#ff595e', '#ffa3a6'], ['#ffca3a', '#fff0a8'], ['#3ec1ff', '#b6e8ff'], ['#7bd02a', '#d3f59a'], ['#b565ff', '#e3c6ff']];
const clown = (c: Ctx, f: FaceFrame, t: number): void => {
  const T = f.top;
  const puff = (x: number, y: number, r: number, i: number): void => {
    const [base, light] = CLOWN[i % CLOWN.length];
    c.fillStyle = rad(c, x - r * 0.3, y - r * 0.35, 0, x, y, r, [[0, light], [1, base]]);
    c.beginPath(); c.arc(x, y + wob(t, 3, 0.012, i), r, 0, TAU); c.fill();
  };
  sides(c, () => { puff(1.08, T + 0.5, 0.42, 0); puff(1.3, T + 1.0, 0.34, 1); puff(0.82, T + 0.12, 0.38, 2); puff(0.5, T - 0.1, 0.3, 3); });
  puff(0, T - 0.12, 0.3, 4);
  c.fillStyle = '#3ec1ff'; c.strokeStyle = '#176a99'; c.lineWidth = 0.03; c.lineJoin = 'round';
  starPath(c, -0.66, -0.4, 0.24, 0.2, 5, 0.45); c.fill(); c.stroke();
  const n = f.nose;
  c.fillStyle = rad(c, n.x - 0.07, n.y - 0.1, 0.01, n.x, n.y - 0.02, 0.22, [[0, '#ff9c9c'], [0.35, '#ff3b3b'], [1, '#b30000']]);
  c.beginPath(); c.arc(n.x, n.y - 0.02, 0.22, 0, TAU); c.fill();
  c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.ellipse(n.x - 0.08, n.y - 0.1, 0.06, 0.035, -0.5, 0, TAU); c.fill();
};
const confetti = (c: Ctx, w: number, h: number, t: number): void => {
  for (let i = 0; i < 26; i++) {
    const x = hash(i) * w, y = ((hash(i + 9) + t * (0.06 + hash(i + 3) * 0.08)) % 1) * h, s = w * 0.014;
    c.save(); c.translate(x, y); c.rotate(t * (1 + hash(i)) + i); c.fillStyle = CLOWN[i % CLOWN.length][0]; c.fillRect(-s, -s * 0.5, s * 2, s); c.restore();
  }
};

// ---------------------------------------------------------------- Robo: a visor with a scanner, an antenna
const robot = (c: Ctx, f: FaceFrame, t: number): void => {
  const T = f.top;
  c.lineCap = 'round'; c.strokeStyle = '#9aa7b2'; c.lineWidth = 0.05;
  c.beginPath(); c.moveTo(0, T + 0.12); c.lineTo(0, T - 0.46); c.stroke();
  const b = 0.5 + 0.5 * Math.sin(t * 5);
  c.shadowColor = 'rgba(255,60,60,.9)'; c.shadowBlur = f.u * 0.2 * b;
  c.fillStyle = `rgb(255,${Math.round(70 + 90 * b)},70)`; c.beginPath(); c.arc(0, T - 0.54, 0.1, 0, TAU); c.fill();
  c.shadowBlur = 0;
  sides(c, () => {
    c.fillStyle = lin(c, 0, 0, 0.4, 0.5, [[0, '#dfe6ea'], [1, '#6c7b88']]);
    c.beginPath(); c.arc(f.halfW + 0.02, 0.3, 0.24, 0, TAU); c.fill();
    c.fillStyle = '#3b4650'; c.beginPath(); c.arc(f.halfW + 0.02, 0.3, 0.12, 0, TAU); c.fill();
  });
  rr(c, -1.02, -0.34, 2.04, 0.8, 0.3);
  c.fillStyle = lin(c, 0, -0.34, 0, 0.46, [[0, 'rgba(60,220,255,.42)'], [1, 'rgba(20,90,160,.46)']]); c.fill();
  c.save(); c.clip();
  const sx = Math.sin(t * 1.8) * 0.85;
  c.fillStyle = lin(c, sx - 0.14, 0, sx + 0.14, 0, [[0, 'rgba(160,255,255,0)'], [0.5, 'rgba(160,255,255,.75)'], [1, 'rgba(160,255,255,0)']]);
  c.fillRect(sx - 0.14, -0.34, 0.28, 0.8);
  c.restore();
  rr(c, -1.02, -0.34, 2.04, 0.8, 0.3);
  c.lineWidth = 0.08; c.strokeStyle = lin(c, 0, -0.34, 0, 0.46, [[0, '#eef3f6'], [1, '#6c7b88']]); c.stroke();
  c.strokeStyle = '#7df9ff'; c.lineWidth = 0.03;
  for (const x of [-0.5, 0.5]) { c.setLineDash([0.14, 0.09]); c.lineDashOffset = -t * 0.4; c.beginPath(); c.arc(x, 0.06, 0.28, 0, TAU); c.stroke(); }
  c.setLineDash([]);
};

// ---------------------------------------------------------------- Pirate: a bandana, an eye patch, a gold earring
const pirate = (c: Ctx, f: FaceFrame): void => {
  const T = f.top, W = f.halfW * 1.02;
  c.fillStyle = '#d7263d'; c.strokeStyle = '#7d0f1f'; c.lineWidth = 0.03; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(W * 0.98, T + 0.52); c.lineTo(W + 0.55, T + 0.34); c.lineTo(W + 0.4, T + 0.62); c.lineTo(W + 0.58, T + 0.98); c.lineTo(W * 0.98, T + 0.84); c.closePath(); c.fill(); c.stroke();   // the knot
  c.beginPath(); c.moveTo(-W, T + 0.5); c.quadraticCurveTo(0, T - 0.4, W, T + 0.5); c.lineTo(W * 0.98, T + 0.86); c.quadraticCurveTo(0, T + 0.26, -W * 0.98, T + 0.86); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.9)';
  for (let i = 0; i < 8; i++) { const a = i / 7, x = -W * 0.85 + a * W * 1.7; c.beginPath(); c.arc(x, T + 0.5 - Math.sin(a * Math.PI) * 0.22 + (i % 2) * 0.12, 0.034, 0, TAU); c.fill(); }
  c.strokeStyle = '#0b0b0d'; c.lineWidth = 0.05; c.lineCap = 'round';   // the strap and the patch
  c.beginPath(); c.moveTo(0.3, -0.22); c.lineTo(-W * 0.9, T + 0.7); c.moveTo(0.78, -0.02); c.lineTo(W, -0.12); c.stroke();
  c.fillStyle = '#0b0b0d'; c.beginPath(); c.ellipse(0.5, 0.02, 0.35, 0.28, -0.2, 0, TAU); c.fill();
  c.fillStyle = 'rgba(255,255,255,.14)'; c.beginPath(); c.ellipse(0.4, -0.08, 0.14, 0.06, -0.4, 0, TAU); c.fill();
  c.strokeStyle = '#ffd166'; c.lineWidth = 0.045;
  c.beginPath(); c.arc(-f.halfW * 0.98, 0.78, 0.11, 0, TAU); c.stroke();
};

// ---------------------------------------------------------------- Glitter: shimmering sparkles on the face and in the air
const glitter = (c: Ctx, f: FaceFrame, t: number): void => {
  const A = c.globalAlpha;
  for (let i = 0; i < 34; i++) {
    const ang = hash(i) * TAU, rr_ = Math.sqrt(hash(i + 50));
    const x = Math.cos(ang) * f.halfW * 0.9 * rr_, y = (f.top + f.chin) / 2 + 0.1 + Math.sin(ang) * ((f.chin - f.top) / 2 - 0.15) * rr_;
    const tw = 0.5 + 0.5 * Math.sin(t * (3 + hash(i + 8) * 4) + i * 3);
    c.globalAlpha = A * tw;
    spark(c, x, y, 0.025 + 0.04 * hash(i + 30), i % 3 === 0 ? '#ffd166' : i % 3 === 1 ? '#ffffff' : '#ff9ed2', t + i);
  }
  for (const s of [-1, 1]) {   // big star stickers by the eyes
    const pulse = 0.5 + 0.5 * Math.sin(t * 3 + s);
    c.globalAlpha = A;
    c.shadowColor = 'rgba(255,230,140,.9)'; c.shadowBlur = f.u * 0.15;
    spark(c, s * 0.98, -0.2, 0.17 + 0.05 * pulse, '#fff1b8', 0.1 * s);
    spark(c, s * 0.82, 0.12, 0.09 + 0.03 * (1 - pulse), '#ffd0ec');
    c.shadowBlur = 0;
  }
  c.globalAlpha = A;
};
const drift = (c: Ctx, w: number, h: number, t: number): void => {
  for (let i = 0; i < 16; i++) {
    const ph = (t * (0.05 + hash(i + 2) * 0.06) + hash(i + 40)) % 1;
    c.globalAlpha = Math.sin(ph * Math.PI) * 0.9;
    spark(c, hash(i) * w + Math.sin(t + i) * w * 0.02, h - ph * h, w * (0.008 + 0.014 * hash(i + 7)), '#ffffff', t * 0.6 + i);
  }
  c.globalAlpha = 1;
};

// ---------------------------------------------------------------- Wide eyes: the eyes magnified
const wideEyes = (c: Ctx, _w: number, _h: number, faces: FaceFrame[]): void => {
  for (const f of faces) {
    if (f.seen < 0.05) continue;
    const co = Math.cos(f.roll), si = Math.sin(f.roll);
    for (const s of [-0.5, 0.5]) magnify(c, f.cx + s * co * f.u, f.cy + s * si * f.u, f.u * 0.46, 1.75);
  }
};

// ---------------------------------------------------------------- Looks: the colours of the whole picture
let grainTile: HTMLCanvasElement | null = null;
const grain = (c: Ctx, w: number, h: number, alpha: number): void => {
  if (!grainTile) {
    grainTile = document.createElement('canvas'); grainTile.width = grainTile.height = 128;
    const g = grainTile.getContext('2d') as Ctx, d = g.createImageData(128, 128);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.floor(Math.random() * 255); d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0);
  }
  c.save(); c.globalCompositeOperation = 'overlay'; c.globalAlpha = alpha;
  c.fillStyle = c.createPattern(grainTile, 'repeat') as CanvasPattern;
  c.translate(Math.floor(Math.random() * 128), Math.floor(Math.random() * 128));
  c.fillRect(-128, -128, w + 128, h + 128);
  c.restore();
};
const goldenHour = (c: Ctx, w: number, h: number): void => {
  tint('rgba(255,170,80,.55)')(c, w, h);
  tint('rgba(255,200,120,.22)', 'screen')(c, w, h);
  bloom(c, w, h, 0.28);
  vignette(c, w, h, 0.28, '60,20,0');
};
const noir = (c: Ctx, w: number, h: number): void => {
  tint('#000', 'saturation')(c, w, h);
  const copy = scratch(3, w, h); copy.drawImage(c.canvas, 0, 0);   // more contrast: the picture laid over itself with "overlay"
  c.save(); c.globalCompositeOperation = 'overlay'; c.globalAlpha = 0.6; c.drawImage(copy.canvas, 0, 0); c.restore();
  c.save(); c.globalAlpha = 0.35; c.globalCompositeOperation = 'multiply'; c.fillStyle = lin(c, 0, 0, 0, h, [[0, '#fff'], [1, '#777']]); c.fillRect(0, 0, w, h); c.restore();
  vignette(c, w, h, 0.7);
  grain(c, w, h, 0.12);
};
const neon = (c: Ctx, w: number, h: number): void => {
  c.save(); c.globalCompositeOperation = 'color'; c.globalAlpha = 0.6;
  c.fillStyle = lin(c, 0, 0, w, h, [[0, '#ff2bd6'], [0.5, '#6a3dff'], [1, '#13e0ff']]); c.fillRect(0, 0, w, h); c.restore();
  tint('rgba(120,60,255,.25)', 'overlay')(c, w, h);
  bloom(c, w, h, 0.38);
  vignette(c, w, h, 0.4, '10,0,40');
};
const dreamy = (c: Ctx, w: number, h: number): void => {
  bloom(c, w, h, 0.62);
  tint('rgba(255,190,230,.4)')(c, w, h);
  tint('rgba(255,240,250,.1)', 'screen')(c, w, h);
};

export const LENSES: ReadonlyArray<LensDef> = [
  { id: 'none', name: 'Normal', kind: 'look', color: '#8a8f98' },
  { id: 'devil', name: 'Devil', kind: 'face', color: '#ff5a1f', base: tint('rgba(255,70,40,.3)'), face: devil },
  { id: 'shades', name: 'Shades', kind: 'face', color: '#ff9f1c', face: shades },
  { id: 'puppy', name: 'Puppy', kind: 'face', color: '#b27644', face: puppy },
  { id: 'kitty', name: 'Kitty', kind: 'face', color: '#ff8fb1', face: kitty },
  { id: 'bunny', name: 'Bunny', kind: 'face', color: '#c9a7ff', face: bunny },
  { id: 'crown', name: 'Royal', kind: 'face', color: '#f2b824', face: crown },
  { id: 'bloom', name: 'Bloom', kind: 'face', color: '#ff7eb6', face: bloomCrown },
  { id: 'angel', name: 'Angel', kind: 'face', color: '#ffe58a', face: angel, base: (c, w, h) => bloom(c, w, h, 0.18) },
  { id: 'crush', name: 'Crush', kind: 'face', color: '#ff4d79', face: crush },
  { id: 'gent', name: 'Gentleman', kind: 'face', color: '#6b6f7b', face: gentleman },
  { id: 'clown', name: 'Clown', kind: 'face', color: '#3ec1ff', face: clown, top: confetti },
  { id: 'robo', name: 'Robo', kind: 'face', color: '#4cc9f0', face: robot },
  { id: 'pirate', name: 'Pirate', kind: 'face', color: '#d7263d', face: pirate },
  { id: 'glitter', name: 'Glitter', kind: 'face', color: '#ff9ed2', face: glitter, top: drift },
  { id: 'wide', name: 'Wide Eyes', kind: 'face', color: '#7ee0c3', base: wideEyes },
  { id: 'golden', name: 'Golden Hour', kind: 'look', color: '#ffb347', base: goldenHour },
  { id: 'noir', name: 'Noir', kind: 'look', color: '#d0d4da', base: noir },
  { id: 'neon', name: 'Neon', kind: 'look', color: '#8a3dff', base: neon },
  { id: 'dream', name: 'Dreamy', kind: 'look', color: '#ffc2e6', base: dreamy, top: drift }
];

export const DEFAULT_LENS = 'devil';
export const lensById = (id: string): LensDef => LENSES.find((l) => l.id === id) || LENSES[0];
/** does this lens need to find a face to do its work? */
export const needsFace = (l: LensDef): boolean => l.kind === 'face';
