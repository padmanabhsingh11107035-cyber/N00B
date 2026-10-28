import type { FaceFrame } from './types.ts';
import { clamp } from './faceMath.ts';
import { TAU, bloom, hash, heart, lin, magnify, rad, rr, scratch, spark, starPath, vignette } from './draw.ts';
import type { Ctx } from './draw.ts';

// The lenses. Each one is drawn from scratch with the canvas (no pictures to download), around a face in "eye distances" (see types.ts / draw.ts inFace): 0,0 is the spot between the
// eyes, +x is to the right of the screen, +y is down. The numbers come from Google's average face (types.ts): f.hair is where the hair starts, f.skull the top of the head, f.base is just
// under the nose, f.lipTop the top of the upper lip, f.temple / f.halfW the width of the head and the face, and every one of them is this face's own measurement. Moving things use the
// time `t` (seconds) only, never saved state, so a dropped frame can not leave anything behind.
// The K-pop and anime lenses are fan-style little things (colours, hearts, hats, hair, headbands) drawn from scratch: no logo, no picture and no real person is copied.

export type Group = 'fun' | 'kpop' | 'anime' | 'looks';

export interface LensDef {
  id: string;
  name: string;
  group: Group;
  /** "face" lenses need a face to be drawn on; "look" lenses change the colours of the whole picture and work without one */
  kind: 'face' | 'look';
  /** the colour of the glow behind the lens's little picture in the list */
  color: string;
  /** more words the search box finds it by */
  tags?: string;
  /** changes the whole picture first (colours, magnifying); faces are in pixels */
  base?: (c: Ctx, w: number, h: number, faces: FaceFrame[], t: number) => void;
  /** drawn on each face, with the drawing space set to the face */
  face?: (c: Ctx, f: FaceFrame, t: number) => void;
  /** drawn over everything, in pixels of the picture */
  top?: (c: Ctx, w: number, h: number, t: number) => void;
}

export const GROUPS: ReadonlyArray<{ id: Group | 'all'; label: string }> = [
  { id: 'all', label: 'All' }, { id: 'fun', label: 'Fun' }, { id: 'kpop', label: 'K-Pop' }, { id: 'anime', label: 'Anime' }, { id: 'looks', label: 'Looks' }
];

/** run `fn` once for the right-hand side (+1) and once mirrored for the left-hand side (-1) */
const sides = (c: Ctx, fn: (s: 1 | -1) => void): void => {
  for (const s of [-1, 1] as const) { c.save(); c.scale(s, 1); fn(s); c.restore(); }
};
const wob = (t: number, speed: number, amount: number, phase = 0): number => Math.sin(t * speed + phase) * amount;
const tint = (color: string, mode: GlobalCompositeOperation = 'soft-light') => (c: Ctx, w: number, h: number): void => {
  c.save(); c.globalCompositeOperation = mode; c.fillStyle = color; c.fillRect(0, 0, w, h); c.restore();
};

// ================================================================ FUN
// ---------------------------------------------------------------- Devil: flaming horns and rising embers
const devil = (c: Ctx, f: FaceFrame, t: number): void => {
  const A = c.globalAlpha;
  const flare = 1 + f.mouthOpen * 0.16 + f.browUp * 0.1;   // the horns flare up when the mouth opens or the eyebrows go up
  sides(c, (s) => {
    c.save();
    c.translate(f.halfW * 0.45, f.hair + 0.12);
    c.scale(flare * 1.2, flare * 1.2);
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
    const y = f.skull + 0.35 - ph * 1.9;
    c.globalAlpha = A * (1 - ph) * (0.55 + 0.45 * hash(i + 3));
    c.fillStyle = i % 3 ? '#ffb347' : '#ff5a1f';
    c.beginPath(); c.arc(x, y, 0.02 + 0.03 * (1 - ph) * hash(i + 5), 0, TAU); c.fill();
  }
  c.globalAlpha = A;
};

// ---------------------------------------------------------------- Shades: dark glasses with a fiery shine
const shades = (c: Ctx, f: FaceFrame, t: number): void => {
  const A = c.globalAlpha;
  const glass = (x: number): void => rr(c, x - 0.47, -0.3, 0.94, 0.66, 0.23);
  c.lineCap = 'round'; c.strokeStyle = '#0a0a0c'; c.lineWidth = 0.07;
  for (const s of [-1, 1]) {   // the arms: the one on the side that turns away fades
    c.globalAlpha = A * (1 - Math.max(0, s * f.yaw) * 0.85);
    c.beginPath(); c.moveTo(s * 0.95, -0.12); c.lineTo(s * (f.temple + 0.04), -0.06); c.stroke();
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
    c.translate(f.halfW * 0.7, f.hair + 0.28);
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
  const open = clamp((f.mouthOpen - 0.3) / 0.45, 0, 1);   // the tongue shows only when the mouth is really open
  if (open > 0) {
    const m = f.mouth, y0 = f.lipLow - 0.04, len = 0.22 + 0.4 * open;
    c.fillStyle = lin(c, 0, y0, 0, y0 + len, [[0, '#ff8fb1'], [1, '#e24a7d']]);
    c.beginPath(); c.moveTo(m.x - 0.17, y0); c.quadraticCurveTo(m.x - 0.2, y0 + len, m.x, y0 + len + 0.05); c.quadraticCurveTo(m.x + 0.2, y0 + len, m.x + 0.17, y0); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(150,30,70,.55)'; c.lineWidth = 0.025; c.lineCap = 'round';
    c.beginPath(); c.moveTo(m.x, y0 + 0.04); c.lineTo(m.x, y0 + len * 0.75); c.stroke();
  }
  const n = f.nose;
  c.fillStyle = '#141418';
  c.beginPath(); c.moveTo(n.x - 0.24, n.y - 0.1); c.quadraticCurveTo(n.x, n.y - 0.22, n.x + 0.24, n.y - 0.1); c.quadraticCurveTo(n.x + 0.2, n.y + 0.12, n.x, n.y + 0.19); c.quadraticCurveTo(n.x - 0.2, n.y + 0.12, n.x - 0.24, n.y - 0.1); c.fill();
  c.fillStyle = 'rgba(255,255,255,.55)';
  c.beginPath(); c.ellipse(n.x - 0.09, n.y - 0.1, 0.07, 0.03, -0.2, 0, TAU); c.fill();
};

// ---------------------------------------------------------------- Kitty: pointed ears, a pink nose and whiskers
const kitty = (c: Ctx, f: FaceFrame, t: number): void => {
  sides(c, () => {
    c.save();
    c.translate(f.halfW * 0.52, f.hair + 0.22);
    c.rotate(0.12 + wob(t, 2.6, 0.015));
    c.fillStyle = lin(c, 0, -0.86, 0, 0.12, [[0, '#dfe3e8'], [1, '#9aa1ac']]);
    c.beginPath(); c.moveTo(-0.36, 0.12); c.quadraticCurveTo(-0.26, -0.45, 0.2, -0.86); c.quadraticCurveTo(0.54, -0.5, 0.62, 0.06); c.closePath(); c.fill();
    c.lineWidth = 0.03; c.strokeStyle = '#4b5059'; c.lineJoin = 'round'; c.stroke();
    c.fillStyle = '#ff9db8';
    c.beginPath(); c.moveTo(-0.18, 0.04); c.quadraticCurveTo(-0.12, -0.3, 0.2, -0.6); c.quadraticCurveTo(0.38, -0.34, 0.43, 0); c.closePath(); c.fill();
    c.restore();
  });
  const n = f.nose;
  sides(c, () => {   // whiskers from the cheeks beside the nose: a dark line under a white one, so they show on every background
    c.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const y = f.base - 0.12 + i * 0.15, a = (i - 1) * 0.2;
      for (const [w, col] of [[0.06, 'rgba(30,30,40,.55)'], [0.03, '#ffffff']] as const) {
        c.lineWidth = w; c.strokeStyle = col;
        c.beginPath(); c.moveTo(0.42, y); c.quadraticCurveTo(1.0, y + a * 0.4 - 0.03, 1.8, y + a); c.stroke();
      }
    }
  });
  c.fillStyle = '#ff7fa3';
  c.beginPath(); c.moveTo(n.x - 0.15, n.y - 0.12); c.quadraticCurveTo(n.x, n.y - 0.18, n.x + 0.15, n.y - 0.12); c.quadraticCurveTo(n.x + 0.11, n.y + 0.03, n.x, n.y + 0.1); c.quadraticCurveTo(n.x - 0.11, n.y + 0.03, n.x - 0.15, n.y - 0.12); c.fill();
};

// ---------------------------------------------------------------- Bunny: tall ears that wobble, a pink nose, front teeth
const bunny = (c: Ctx, f: FaceFrame, t: number): void => {
  sides(c, (s) => {
    c.save();
    c.translate(0.42, f.hair + 0.2);
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
  c.beginPath(); c.ellipse(n.x, n.y - 0.02, 0.13, 0.09, 0, 0, TAU); c.fill();
  if (f.mouthOpen < 0.5) {   // two front teeth, hanging from the upper lip
    c.fillStyle = '#ffffff'; c.strokeStyle = '#c9c2d6'; c.lineWidth = 0.02;
    for (const x of [-0.07, 0.07]) { rr(c, n.x + x - 0.07, f.lipUp - 0.03, 0.14, 0.2, 0.04); c.fill(); c.stroke(); }
  }
};

// ---------------------------------------------------------------- Royal: a gold crown with jewels
const crown = (c: Ctx, f: FaceFrame, t: number): void => {
  c.save();
  c.translate(f.yaw * 0.1, f.hair - 0.16);
  c.scale((f.halfW / 1.21) * 1.2, 1.2);
  c.shadowColor = 'rgba(255,200,60,.55)'; c.shadowBlur = f.u * 0.18;
  c.fillStyle = lin(c, 0, -0.5, 0, 0.32, [[0, '#fff3b0'], [0.45, '#f2b824'], [1, '#a8680a']]);
  c.beginPath();
  c.moveTo(-0.7, 0.32); c.lineTo(-0.8, -0.26); c.lineTo(-0.45, -0.04); c.lineTo(-0.22, -0.5); c.lineTo(0, -0.08); c.lineTo(0.22, -0.5); c.lineTo(0.45, -0.04); c.lineTo(0.8, -0.26); c.lineTo(0.7, 0.32);
  c.closePath(); c.fill();
  c.shadowBlur = 0;
  c.lineJoin = 'round'; c.lineWidth = 0.035; c.strokeStyle = '#7a4a05'; c.stroke();
  c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(-0.68, 0.1, 1.36, 0.045);
  const gems: ReadonlyArray<readonly [number, number, number, string]> = [[-0.8, -0.28, 0.075, '#ff4d6d'], [-0.22, -0.52, 0.08, '#4cc9f0'], [0.22, -0.52, 0.08, '#4cc9f0'], [0.8, -0.28, 0.075, '#ff4d6d'], [0, 0.18, 0.1, '#3ddc84']];
  for (const [x, y, r, col] of gems) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, TAU); c.fill(); }
  const tw = 0.5 + 0.5 * Math.sin(t * 4);
  spark(c, -0.22, -0.54, 0.11 + 0.06 * tw, 'rgba(255,255,255,.95)');
  spark(c, 0.8, -0.3, 0.11 + 0.06 * (1 - tw), 'rgba(255,255,255,.95)');
  c.restore();
};

// ---------------------------------------------------------------- Bloom: a crown of flowers
const BLOOM_COLORS = ['#ff7eb6', '#ffd166', '#ffffff', '#b388ff', '#ff9f68', '#7ee0c3'];
const bloomCrown = (c: Ctx, f: FaceFrame, t: number): void => {
  const y0 = -0.45, rx = f.halfW * 0.98, ry = y0 - (f.hair - 0.05), n = 9;
  const at = (i: number): [number, number] => { const a = Math.PI * (1.04 + 0.92 * (i / (n - 1))); return [Math.cos(a) * rx, y0 + Math.sin(a) * ry + wob(t, 2, 0.012, i)]; };
  c.fillStyle = '#3fae6a';
  for (let i = 0; i < n - 1; i++) {   // leaves between the flowers
    const [x0, ya] = at(i), [x1, yb] = at(i + 1);
    for (const k of [-1, 1]) { c.save(); c.translate((x0 + x1) / 2, (ya + yb) / 2); c.rotate(Math.atan2(yb - ya, x1 - x0) + k * 0.7); c.beginPath(); c.ellipse(0.1, 0, 0.14, 0.05, 0, 0, TAU); c.fill(); c.restore(); }
  }
  for (let i = 0; i < n; i++) {
    const [x, y] = at(i), r = 0.21 + 0.06 * Math.sin(i * 2.1), col = BLOOM_COLORS[i % BLOOM_COLORS.length];
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
  const y = f.skull - 0.12 + wob(t, 2, 0.04), x = f.yaw * 0.12;
  c.save();
  c.shadowColor = `rgba(255,225,120,${0.7 + 0.25 * Math.sin(t * 3)})`; c.shadowBlur = f.u * 0.28;
  c.lineWidth = 0.075; c.strokeStyle = lin(c, -0.6, y, 0.6, y, [[0, '#ffe58a'], [0.5, '#fff7cf'], [1, '#f2b824']]);
  c.beginPath(); c.ellipse(x, y, 0.62, 0.15, 0, 0, TAU); c.stroke();
  c.restore();
  for (let i = 0; i < 7; i++) {
    const ph = (t * 0.5 + hash(i + 70)) % 1;
    const sx = (hash(i + 3) - 0.5) * f.halfW * 3, sy = f.skull - 0.6 + hash(i + 11) * 1.5;
    c.globalAlpha = A * Math.sin(ph * Math.PI);
    spark(c, sx, sy, 0.05 + 0.1 * hash(i + 21) * Math.sin(ph * Math.PI), '#fff6c9', ph * 2);
  }
  c.globalAlpha = A;
};

// ---------------------------------------------------------------- Crush: heart eyes, rosy cheeks, floating hearts
const crush = (c: Ctx, f: FaceFrame, t: number): void => {
  const A = c.globalAlpha;
  for (const s of [-1, 1]) {
    c.fillStyle = rad(c, s * 0.78, 0.56, 0, s * 0.78, 0.56, 0.34, [[0, 'rgba(255,90,130,.55)'], [1, 'rgba(255,90,130,0)']]);
    c.beginPath(); c.arc(s * 0.78, 0.56, 0.34, 0, TAU); c.fill();
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
    const x = (hash(i + 7) - 0.5) * f.halfW * 2.4 + Math.sin(ph * 6 + i) * 0.12, y = f.hair + 0.1 - ph * 1.6;
    c.globalAlpha = A * Math.sin(ph * Math.PI);
    c.save(); c.translate(x, y); c.rotate(Math.sin(ph * 5 + i) * 0.3);
    heart(c, 0, 0, 0.12 + 0.12 * hash(i + 3), i % 2 ? '#ff4d79' : '#ff9ebb');
    c.restore();
  }
  c.globalAlpha = A;
};

// ---------------------------------------------------------------- Gentleman: a top hat and a curly moustache
const gentleman = (c: Ctx, f: FaceFrame): void => {
  const by = f.hair + 0.3;
  c.save(); c.translate(f.yaw * 0.12, 0); c.scale(f.halfW / 1.21, 1);
  c.fillStyle = lin(c, -0.65, 0, 0.65, 0, [[0, '#131316'], [0.5, '#2f2f36'], [1, '#0e0e11']]);
  rr(c, -0.65, by - 1.1, 1.3, 1.1, 0.07); c.fill();
  c.fillStyle = '#c8102e'; c.fillRect(-0.65, by - 0.36, 1.3, 0.2);
  c.fillStyle = '#1b1b20'; c.beginPath(); c.ellipse(0, by - 1.1, 0.65, 0.12, 0, 0, TAU); c.fill();
  c.fillStyle = '#0d0d10'; c.beginPath(); c.ellipse(0, by, 1.15, 0.2, 0, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 0.02; c.stroke();
  c.restore();
  const k = clamp(f.mouthW / 0.78, 0.8, 1.4);
  c.save(); c.translate(f.nose.x, (f.base + f.lipTop) / 2 + 0.03); c.scale(k, k);   // between the nose and the lip
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
  const H = f.hair;
  const puff = (x: number, y: number, r: number, i: number): void => {
    const [base, light] = CLOWN[i % CLOWN.length];
    c.fillStyle = rad(c, x - r * 0.3, y - r * 0.35, 0, x, y, r, [[0, light], [1, base]]);
    c.beginPath(); c.arc(x, y + wob(t, 3, 0.012, i), r, 0, TAU); c.fill();
  };
  sides(c, () => { puff(1.12, H + 0.55, 0.42, 0); puff(1.32, H + 1.05, 0.34, 1); puff(0.88, H + 0.15, 0.38, 2); puff(0.52, H - 0.08, 0.3, 3); });
  puff(0, H - 0.14, 0.3, 4);
  c.fillStyle = '#3ec1ff'; c.strokeStyle = '#176a99'; c.lineWidth = 0.03; c.lineJoin = 'round';
  starPath(c, -0.68, -0.42, 0.24, 0.2, 5, 0.45); c.fill(); c.stroke();
  const n = f.nose;
  c.fillStyle = rad(c, n.x - 0.07, n.y - 0.08, 0.01, n.x, n.y, 0.22, [[0, '#ff9c9c'], [0.35, '#ff3b3b'], [1, '#b30000']]);
  c.beginPath(); c.arc(n.x, n.y, 0.22, 0, TAU); c.fill();
  c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.ellipse(n.x - 0.08, n.y - 0.08, 0.06, 0.035, -0.5, 0, TAU); c.fill();
};
const confetti = (c: Ctx, w: number, h: number, t: number): void => {
  for (let i = 0; i < 26; i++) {
    const x = hash(i) * w, y = ((hash(i + 9) + t * (0.06 + hash(i + 3) * 0.08)) % 1) * h, s = w * 0.014;
    c.save(); c.translate(x, y); c.rotate(t * (1 + hash(i)) + i); c.fillStyle = CLOWN[i % CLOWN.length][0]; c.fillRect(-s, -s * 0.5, s * 2, s); c.restore();
  }
};

// ---------------------------------------------------------------- Robo: a visor with a scanner, an antenna
const robot = (c: Ctx, f: FaceFrame, t: number): void => {
  const S = f.skull;
  c.lineCap = 'round'; c.strokeStyle = '#9aa7b2'; c.lineWidth = 0.05;
  c.beginPath(); c.moveTo(0, S + 0.2); c.lineTo(0, S - 0.4); c.stroke();
  const b = 0.5 + 0.5 * Math.sin(t * 5);
  c.shadowColor = 'rgba(255,60,60,.9)'; c.shadowBlur = f.u * 0.2 * b;
  c.fillStyle = `rgb(255,${Math.round(70 + 90 * b)},70)`; c.beginPath(); c.arc(0, S - 0.48, 0.1, 0, TAU); c.fill();
  c.shadowBlur = 0;
  sides(c, () => {
    c.fillStyle = lin(c, 0, 0, 0.4, 0.5, [[0, '#dfe6ea'], [1, '#6c7b88']]);
    c.beginPath(); c.arc(f.temple + 0.02, 0.4, 0.24, 0, TAU); c.fill();
    c.fillStyle = '#3b4650'; c.beginPath(); c.arc(f.temple + 0.02, 0.4, 0.12, 0, TAU); c.fill();
  });
  rr(c, -1.05, -0.3, 2.1, 0.76, 0.3);
  c.fillStyle = lin(c, 0, -0.3, 0, 0.46, [[0, 'rgba(60,220,255,.42)'], [1, 'rgba(20,90,160,.46)']]); c.fill();
  c.save(); c.clip();
  const sx = Math.sin(t * 1.8) * 0.85;
  c.fillStyle = lin(c, sx - 0.14, 0, sx + 0.14, 0, [[0, 'rgba(160,255,255,0)'], [0.5, 'rgba(160,255,255,.75)'], [1, 'rgba(160,255,255,0)']]);
  c.fillRect(sx - 0.14, -0.3, 0.28, 0.76);
  c.restore();
  rr(c, -1.05, -0.3, 2.1, 0.76, 0.3);
  c.lineWidth = 0.08; c.strokeStyle = lin(c, 0, -0.3, 0, 0.46, [[0, '#eef3f6'], [1, '#6c7b88']]); c.stroke();
  c.strokeStyle = '#7df9ff'; c.lineWidth = 0.03;
  for (const x of [-0.5, 0.5]) { c.setLineDash([0.14, 0.09]); c.lineDashOffset = -t * 0.4; c.beginPath(); c.arc(x, 0.08, 0.28, 0, TAU); c.stroke(); }
  c.setLineDash([]);
};

// ---------------------------------------------------------------- Pirate: a bandana, an eye patch, a gold earring
const pirate = (c: Ctx, f: FaceFrame): void => {
  const W = f.halfW, S = f.skull;
  c.fillStyle = '#d7263d'; c.strokeStyle = '#7d0f1f'; c.lineWidth = 0.03; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(W * 0.95, -0.62); c.lineTo(W + 0.5, -0.78); c.lineTo(W + 0.38, -0.5); c.lineTo(W + 0.55, -0.12); c.lineTo(W * 0.95, -0.26); c.closePath(); c.fill(); c.stroke();   // the knot and its tails
  c.beginPath(); c.moveTo(-W, -0.58); c.quadraticCurveTo(0, S - 0.2, W, -0.58); c.lineTo(W * 0.96, -0.2); c.quadraticCurveTo(0, -0.62, -W * 0.96, -0.2); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.9)';
  for (let i = 0; i < 8; i++) { const a = i / 7, x = -W * 0.8 + a * W * 1.6; c.beginPath(); c.arc(x, -0.5 - Math.sin(a * Math.PI) * 0.4 + (i % 2) * 0.1, 0.034, 0, TAU); c.fill(); }
  c.strokeStyle = '#0b0b0d'; c.lineWidth = 0.05; c.lineCap = 'round';   // the strap and the patch
  c.beginPath(); c.moveTo(0.3, -0.24); c.lineTo(-W * 0.9, -0.75); c.moveTo(0.8, -0.04); c.lineTo(f.temple, -0.1); c.stroke();
  c.fillStyle = '#0b0b0d'; c.beginPath(); c.ellipse(0.5, 0.02, 0.36, 0.29, -0.2, 0, TAU); c.fill();
  c.fillStyle = 'rgba(255,255,255,.14)'; c.beginPath(); c.ellipse(0.4, -0.08, 0.14, 0.06, -0.4, 0, TAU); c.fill();
  c.strokeStyle = '#ffd166'; c.lineWidth = 0.045;
  c.beginPath(); c.arc(-f.temple + 0.02, 1.0, 0.11, 0, TAU); c.stroke();
};

// ---------------------------------------------------------------- Glitter: shimmering sparkles on the face and in the air
const glitter = (c: Ctx, f: FaceFrame, t: number): void => {
  const A = c.globalAlpha;
  const cy = (f.top + f.chin) / 2, ry = (f.chin - f.top) / 2 - 0.1;
  for (let i = 0; i < 34; i++) {
    const ang = hash(i) * TAU, rr_ = Math.sqrt(hash(i + 50));
    const x = Math.cos(ang) * f.halfW * 0.9 * rr_, y = cy + Math.sin(ang) * ry * rr_;
    const tw = 0.5 + 0.5 * Math.sin(t * (3 + hash(i + 8) * 4) + i * 3);
    c.globalAlpha = A * tw;
    spark(c, x, y, 0.025 + 0.04 * hash(i + 30), i % 3 === 0 ? '#ffd166' : i % 3 === 1 ? '#ffffff' : '#ff9ed2', t + i);
  }
  for (const s of [-1, 1]) {   // big star stickers beside the eyes
    const pulse = 0.5 + 0.5 * Math.sin(t * 3 + s);
    c.globalAlpha = A;
    c.shadowColor = 'rgba(255,230,140,.9)'; c.shadowBlur = f.u * 0.15;
    spark(c, s * 1.0, -0.12, 0.17 + 0.05 * pulse, '#fff1b8', 0.1 * s);
    spark(c, s * 0.9, 0.2, 0.09 + 0.03 * (1 - pulse), '#ffd0ec');
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
    const co = Math.cos(f.roll), si = Math.sin(f.roll), r = f.u * Math.max(0.42, f.eyeW * 1.15);
    for (const s of [-0.5, 0.5]) magnify(c, f.cx + s * co * f.u, f.cy + s * si * f.u, r, 1.75);
  }
};

// ================================================================ K-POP (fan-style: colours, hearts, a headset; no logos)
const floatingHearts = (colors: ReadonlyArray<string>, count = 14) => (c: Ctx, w: number, h: number, t: number): void => {
  for (let i = 0; i < count; i++) {
    const ph = (t * (0.07 + hash(i + 1) * 0.07) + hash(i + 30)) % 1;
    const x = hash(i) * w + Math.sin(t * 0.9 + i) * w * 0.02, y = h * 1.05 - ph * h * 1.1, s = w * (0.03 + 0.04 * hash(i + 6));
    c.save(); c.globalAlpha = Math.sin(ph * Math.PI) * 0.95; c.translate(x, y); c.rotate(Math.sin(t + i) * 0.35);
    heart(c, 0, 0, s, colors[i % colors.length]);
    c.restore();
  }
};
const caption = (c: Ctx, w: number, h: number, text: string, fill: string, stroke: string): void => {
  const fs = Math.round(Math.min(w, h) * 0.058);
  c.save();
  c.font = `800 ${fs}px "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR","Hiragino Sans","Yu Gothic",system-ui,sans-serif`;
  c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.lineJoin = 'round'; c.lineWidth = fs * 0.24; c.strokeStyle = stroke; c.fillStyle = fill;
  const x = w * 0.05, y = h - w * 0.05;
  c.strokeText(text, x, y); c.fillText(text, x, y);
  c.restore();
};
/** a stage headset: an ear cup on the left of the screen, a thin arm along the cheek, a little microphone by the mouth */
const headset = (c: Ctx, f: FaceFrame, color: string): void => {
  const ex = -(f.temple + 0.02), ey = 0.45, mx = -0.42, my = f.lipUp + 0.08;
  c.save(); c.lineCap = 'round';
  c.strokeStyle = '#1b1b22'; c.lineWidth = 0.045;
  c.beginPath(); c.moveTo(ex, ey + 0.12); c.bezierCurveTo(ex + 0.05, 1.05, -0.95, 1.5, mx, my); c.stroke();
  c.fillStyle = lin(c, ex - 0.2, ey - 0.2, ex + 0.2, ey + 0.2, [[0, '#3a3a46'], [1, '#121217']]);
  c.beginPath(); c.arc(ex, ey, 0.2, 0, TAU); c.fill();
  c.strokeStyle = color; c.lineWidth = 0.03; c.beginPath(); c.arc(ex, ey, 0.13, 0, TAU); c.stroke();
  c.fillStyle = '#1b1b22'; c.beginPath(); c.arc(mx, my, 0.075, 0, TAU); c.fill();
  c.restore();
};

// ---------------------------------------------------------------- BTS: purple glow, a headset, a purple heart, "borahae"
const btsFace = (c: Ctx, f: FaceFrame, t: number): void => {
  headset(c, f, '#b57bff');
  const pulse = 1 + 0.07 * Math.sin(t * 4);
  c.save(); c.translate(0.84, 0.62); c.scale(pulse, pulse); c.shadowColor = 'rgba(190,120,255,.9)'; c.shadowBlur = f.u * 0.2;
  heart(c, 0, 0, 0.34, '#d9b3ff', '#8a3dff'); c.restore();
  const A = c.globalAlpha;
  for (let i = 0; i < 8; i++) {
    const ph = (t * 0.45 + hash(i + 80)) % 1;
    c.globalAlpha = A * Math.sin(ph * Math.PI);
    spark(c, (hash(i + 4) - 0.5) * f.halfW * 3.2, f.skull - 0.3 + hash(i + 12) * 1.2, 0.05 + 0.08 * hash(i + 22), i % 2 ? '#e6d0ff' : '#ffffff', ph * 2);
  }
  c.globalAlpha = A;
};
const btsLook = (c: Ctx, w: number, h: number): void => {
  tint('rgba(140,70,255,.4)')(c, w, h);
  tint('rgba(200,150,255,.12)', 'screen')(c, w, h);
  bloom(c, w, h, 0.22);
  vignette(c, w, h, 0.35, '40,0,90');
};
const btsTop = (c: Ctx, w: number, h: number, t: number): void => {
  floatingHearts(['#c9a0ff', '#9b5cff', '#e6d0ff'], 12)(c, w, h, t);
  caption(c, w, h, '보라해 💜', '#ffffff', '#7a35e6');
};

// ---------------------------------------------------------------- Blackpink: heart sunglasses, a pink bow, pink and black
const heartGlasses = (c: Ctx, f: FaceFrame, t: number): void => {
  const A = c.globalAlpha;
  c.lineCap = 'round'; c.strokeStyle = '#0c0c10'; c.lineWidth = 0.06;
  for (const s of [-1, 1]) {
    c.globalAlpha = A * (1 - Math.max(0, s * f.yaw) * 0.85);
    c.beginPath(); c.moveTo(s * 0.98, -0.1); c.lineTo(s * (f.temple + 0.04), -0.05); c.stroke();
  }
  c.globalAlpha = A;
  c.beginPath(); c.moveTo(-0.14, -0.04); c.quadraticCurveTo(0, -0.16, 0.14, -0.04); c.stroke();
  for (const x of [-0.5, 0.5]) {
    c.save(); c.translate(x, 0.04);
    heart(c, 0, 0.02, 1.0, '#0c0c10');
    heart(c, 0, 0.02, 0.86, 'rgba(255,120,190,.92)', 'rgba(255,40,140,.95)');
    c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.ellipse(-0.19, -0.2, 0.1, 0.045, -0.6, 0, TAU); c.fill();
    const sx = ((t * 0.5) % 2 - 0.5) * 0.7; c.fillStyle = 'rgba(255,255,255,.2)'; c.fillRect(sx - 0.03, -0.3, 0.07, 0.6);
    c.restore();
  }
  c.save(); c.translate(0.82, f.hair + 0.1); c.rotate(0.25 + wob(t, 2, 0.03));   // the bow, on the right of the head
  c.fillStyle = lin(c, -0.4, 0, 0.4, 0, [[0, '#ff7ac0'], [1, '#e0156f']]); c.strokeStyle = '#8f0b49'; c.lineWidth = 0.025; c.lineJoin = 'round';
  for (const k of [-1, 1]) { c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(k * 0.2, -0.32, k * 0.62, -0.32, k * 0.58, 0); c.bezierCurveTo(k * 0.62, 0.32, k * 0.2, 0.32, 0, 0); c.fill(); c.stroke(); }
  c.fillStyle = '#ff4fa3'; c.beginPath(); c.arc(0, 0, 0.1, 0, TAU); c.fill(); c.stroke();
  c.restore();
};
const blackpinkLook = (c: Ctx, w: number, h: number): void => {
  tint('rgba(255,60,150,.32)')(c, w, h);
  bloom(c, w, h, 0.18);
  vignette(c, w, h, 0.62, '25,0,12');
};
const blackpinkTop = (c: Ctx, w: number, h: number, t: number): void => {
  floatingHearts(['#ff5fb0', '#ff9ad0', '#ffffff'], 12)(c, w, h, t);
  drift(c, w, h, t);
  caption(c, w, h, '🖤 PINK × BLACK 💗', '#ffffff', '#e0156f');
};

// ---------------------------------------------------------------- K-Pop Stage: spotlights, a headset, confetti and glow sticks
const stageBeams = (c: Ctx, w: number, h: number, _faces: FaceFrame[], t: number): void => {
  tint('rgba(20,0,50,.4)', 'multiply')(c, w, h);
  c.save(); c.globalCompositeOperation = 'screen';
  const cols = ['255,60,200', '60,200,255', '255,220,80', '160,90,255'];
  for (let i = 0; i < 4; i++) {
    c.save(); c.translate(w * (0.15 + 0.23 * i), -h * 0.02); c.rotate(wob(t, 0.8, 0.35, i * 1.7));
    const g = c.createLinearGradient(0, 0, 0, h * 1.1); g.addColorStop(0, `rgba(${cols[i]},.36)`); g.addColorStop(1, `rgba(${cols[i]},0)`);
    c.fillStyle = g; c.beginPath(); c.moveTo(-w * 0.02, 0); c.lineTo(w * 0.02, 0); c.lineTo(w * 0.17, h * 1.1); c.lineTo(-w * 0.17, h * 1.1); c.closePath(); c.fill();
    c.restore();
  }
  c.restore();
  bloom(c, w, h, 0.2);
};
const idolFace = (c: Ctx, f: FaceFrame, t: number): void => {
  headset(c, f, '#ff6ad5');
  const A = c.globalAlpha;
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    c.globalAlpha = A * (0.5 + 0.5 * Math.sin(t * 5 + i * 2 + s));
    spark(c, s * (0.45 + i * 0.12), 0.36 + (i % 2) * 0.09, 0.05 + 0.03 * (i % 2), i % 2 ? '#fff1b8' : '#ffb3ec', t + i);
  }
  c.globalAlpha = A;
};
const idolTop = (c: Ctx, w: number, h: number, t: number): void => {
  confetti(c, w, h, t);
  const cols = ['#ff4fd8', '#4fd2ff', '#ffe14f', '#a678ff', '#ff7a7a'];
  for (let i = 0; i < 6; i++) {   // glow sticks waved in the crowd
    const x = w * (0.08 + 0.17 * i) + Math.sin(t * 2 + i) * w * 0.02, y = h * (0.93 + 0.01 * Math.sin(t * 3 + i));
    c.save(); c.shadowColor = cols[i % cols.length]; c.shadowBlur = w * 0.04; c.fillStyle = cols[i % cols.length];
    c.globalAlpha = 0.9; c.beginPath(); c.arc(x, y, w * 0.018, 0, TAU); c.fill(); c.restore();
  }
};

// ================================================================ ANIME (fan-style hats, hair and headbands; no pictures or logos copied)
// ---------------------------------------------------------------- Straw Hat (One Piece style): a straw hat with a red band, a little scar
const strawHat = (c: Ctx, f: FaceFrame, t: number): void => {
  c.save();
  c.translate(f.yaw * 0.1, f.hair + 0.32); c.scale(f.halfW / 1.21, 1); c.rotate(wob(t, 1.7, 0.012));
  c.fillStyle = lin(c, 0, -0.3, 0, 0.4, [[0, '#f7de86'], [1, '#d6a43a']]); c.strokeStyle = '#a77a1f'; c.lineWidth = 0.03; c.lineJoin = 'round';
  c.beginPath(); c.ellipse(0, 0.06, 1.7, 0.32, 0, 0, TAU); c.fill(); c.stroke();                       // the brim
  c.beginPath(); c.moveTo(-0.98, 0.02); c.bezierCurveTo(-1.04, -1.02, 1.04, -1.02, 0.98, 0.02); c.closePath(); c.fill(); c.stroke();   // the dome
  c.strokeStyle = 'rgba(150,100,20,.42)'; c.lineWidth = 0.022;
  for (let i = -4; i <= 4; i++) { c.beginPath(); c.moveTo(i * 0.21, -0.26); c.quadraticCurveTo(i * 0.24, -0.62, i * 0.13, -0.82); c.stroke(); }
  c.strokeStyle = 'rgba(150,100,20,.3)';
  for (let k = 1; k <= 3; k++) { c.beginPath(); c.ellipse(0, 0.06, 1.7 * (0.55 + 0.15 * k), 0.32 * (0.55 + 0.15 * k), 0, 0.1, Math.PI - 0.1); c.stroke(); }
  c.fillStyle = '#d62828'; c.strokeStyle = '#7d1111'; c.lineWidth = 0.028;   // the red band
  c.beginPath(); c.moveTo(-1.0, -0.22); c.quadraticCurveTo(0, -0.4, 1.0, -0.22); c.lineTo(0.98, 0.04); c.quadraticCurveTo(0, -0.16, -0.98, 0.04); c.closePath(); c.fill(); c.stroke();
  c.restore();
  c.strokeStyle = 'rgba(190,70,60,.9)'; c.lineWidth = 0.035; c.lineCap = 'round';   // a scar under the left eye
  c.beginPath(); c.moveTo(-0.62, 0.22); c.lineTo(-0.6, 0.4); c.stroke();
  c.lineWidth = 0.024; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-0.67, 0.26 + i * 0.05); c.lineTo(-0.54, 0.26 + i * 0.05); c.stroke(); }
};

// ---------------------------------------------------------------- Swordsman (One Piece style): a green headband, three gold earrings, a scar over the eye
const swordsman = (c: Ctx, f: FaceFrame): void => {
  const W = f.halfW;
  c.fillStyle = lin(c, 0, -1.1, 0, -0.2, [[0, '#46b86a'], [1, '#1f7a3f']]); c.strokeStyle = '#124d27'; c.lineWidth = 0.03; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(-W * 0.97, -0.5); c.quadraticCurveTo(0, -1.12, W * 0.97, -0.5); c.lineTo(W * 0.95, -0.2); c.quadraticCurveTo(0, -0.74, -W * 0.95, -0.2); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#1f7a3f'; c.beginPath(); c.moveTo(W * 0.9, -0.34); c.lineTo(W + 0.5, -0.1); c.lineTo(W + 0.28, 0.1); c.lineTo(W * 0.9, -0.16); c.closePath(); c.fill(); c.stroke();   // the tail of the knot
  for (let i = 0; i < 3; i++) {   // three gold earrings on the left ear
    const y = 0.7 + i * 0.13;
    c.fillStyle = lin(c, 0, y, 0, y + 0.12, [[0, '#ffe58a'], [1, '#c9921a']]); c.strokeStyle = '#7a5410'; c.lineWidth = 0.015;
    rr(c, -f.temple - 0.03, y, 0.06, 0.12, 0.02); c.fill(); c.stroke();
  }
  c.strokeStyle = 'rgba(150,40,40,.95)'; c.lineWidth = 0.04; c.lineCap = 'round';   // the scar across the left eye
  c.beginPath(); c.moveTo(-0.52, -0.42); c.lineTo(-0.48, 0.44); c.stroke();
  c.lineWidth = 0.025; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-0.58, -0.22 + i * 0.16); c.lineTo(-0.42, -0.18 + i * 0.16); c.stroke(); }
};

// ---------------------------------------------------------------- Super Saiyan (Dragon Ball style): golden spiky hair, golden brows, crackling energy
const saiyan = (c: Ctx, f: FaceFrame, t: number): void => {
  const A = c.globalAlpha;
  const cy0 = f.hair + 0.55, rx = f.halfW * 1.2, ry = 1.35;
  const tips = [0.55, 0.85, 0.7, 1.05, 0.8, 1.1, 0.75, 0.9, 0.6];
  const N = tips.length;
  c.save();
  c.shadowColor = 'rgba(255,200,40,.95)'; c.shadowBlur = f.u * 0.4;
  c.fillStyle = lin(c, 0, f.skull - 1.0, 0, -0.3, [[0, '#fff6b0'], [0.45, '#ffd400'], [1, '#ff9d00']]);
  c.beginPath();
  c.moveTo(-rx, cy0);
  for (let i = 0; i < N; i++) {   // the spikes on top, round the head
    const a1 = Math.PI + ((i + 0.5) * Math.PI) / N, a2 = Math.PI + ((i + 1) * Math.PI) / N;
    const k = 1 + tips[i] * 0.9 + wob(t, 7 + i, 0.025, i);
    c.lineTo(Math.cos(a1) * rx * k, cy0 + Math.sin(a1) * ry * k);
    c.lineTo(Math.cos(a2) * rx, cy0 + Math.sin(a2) * ry);
  }
  c.lineTo(f.halfW * 0.98, -0.5);   // the bangs, down over the forehead
  c.lineTo(0.75, -0.98); c.lineTo(0.55, -0.4); c.lineTo(0.32, -0.96); c.lineTo(0.08, -0.36); c.lineTo(-0.2, -0.96); c.lineTo(-0.46, -0.44); c.lineTo(-0.72, -0.98);
  c.lineTo(-f.halfW * 0.98, -0.5);
  c.closePath(); c.fill();
  c.shadowBlur = 0; c.lineWidth = 0.03; c.strokeStyle = '#a86a00'; c.lineJoin = 'round'; c.stroke();
  c.restore();
  c.strokeStyle = '#ffd400'; c.lineCap = 'round'; c.lineWidth = 0.075;   // golden brows
  for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 0.22, f.brow + 0.04); c.quadraticCurveTo(s * 0.55, f.brow - 0.1, s * 0.88, f.brow + 0.06); c.stroke(); }
  const seed = Math.floor(t * 12);   // energy crackling round the head
  c.strokeStyle = 'rgba(190,230,255,.95)'; c.lineWidth = 0.03; c.shadowColor = 'rgba(120,200,255,.9)'; c.shadowBlur = f.u * 0.12;
  for (const s of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      let x = s * (f.halfW + 0.05), y = -0.9 + k * 0.9 + hash(seed + k + s * 5) * 0.2;
      c.beginPath(); c.moveTo(x, y);
      for (let j = 0; j < 4; j++) { x += s * (0.1 + hash(seed + j + k * 9 + s * 3) * 0.14); y += (hash(seed + j * 3 + k + s) - 0.5) * 0.4; c.lineTo(x, y); }
      c.stroke();
    }
  }
  c.shadowBlur = 0; c.globalAlpha = A;
};
const saiyanLook = (c: Ctx, w: number, h: number, _faces: FaceFrame[], t: number): void => {
  tint('rgba(255,200,40,.28)')(c, w, h);
  c.save(); c.globalCompositeOperation = 'screen';
  c.fillStyle = rad(c, w / 2, h * 0.42, w * 0.1, w / 2, h * 0.42, Math.max(w, h) * 0.7, [[0, `rgba(255,220,80,${0.18 + 0.05 * Math.sin(t * 6)})`], [1, 'rgba(255,170,0,.38)']]);
  c.fillRect(0, 0, w, h); c.restore();
  bloom(c, w, h, 0.25);
};
const saiyanTop = (c: Ctx, w: number, h: number, t: number): void => {
  c.save(); c.globalCompositeOperation = 'screen';
  for (let i = 0; i < 26; i++) {   // golden flames rising from the bottom
    const ph = (t * (0.3 + hash(i) * 0.4) + hash(i + 9)) % 1, x = (0.05 + 0.9 * hash(i + 2)) * w + Math.sin(t * 3 + i) * w * 0.015, y = h * (1.02 - ph * 0.9), s = w * (0.02 + 0.03 * hash(i + 5)) * (1 - ph * 0.6);
    c.fillStyle = `rgba(255,${190 + Math.round(60 * hash(i + 3))},60,${0.7 * (1 - ph)})`;
    c.beginPath(); c.moveTo(x, y - s * 2.2); c.quadraticCurveTo(x + s, y - s * 0.5, x, y + s); c.quadraticCurveTo(x - s, y - s * 0.5, x, y - s * 2.2); c.fill();
  }
  c.restore();
};

// ---------------------------------------------------------------- Dragon Balls: seven orange balls with red stars circling above the head
const dragonBalls = (c: Ctx, f: FaceFrame, t: number): void => {
  const cy0 = f.skull - 0.05, R = 1.3;
  const balls = Array.from({ length: 7 }, (_, i) => { const a = t * 0.8 + (i * TAU) / 7; return { n: i + 1, x: Math.cos(a) * R, y: cy0 + Math.sin(a) * 0.32, z: Math.sin(a) }; }).sort((p, q) => p.z - q.z);
  for (const b of balls) {
    const r = 0.21 * (0.82 + 0.18 * b.z);
    c.save();
    c.shadowColor = 'rgba(255,150,30,.85)'; c.shadowBlur = f.u * 0.16;
    c.fillStyle = rad(c, b.x - r * 0.3, b.y - r * 0.35, r * 0.1, b.x, b.y, r, [[0, '#ffe3a3'], [0.35, '#ffa530'], [1, '#d9570a']]);
    c.beginPath(); c.arc(b.x, b.y, r, 0, TAU); c.fill();
    c.shadowBlur = 0; c.strokeStyle = '#8a3a00'; c.lineWidth = 0.02; c.stroke();
    c.fillStyle = '#d62828';
    const rs = r * (b.n <= 3 ? 0.36 : b.n <= 5 ? 0.3 : 0.25);
    const ring = (k: number, count: number, rad0: number, off: number): [number, number] => [Math.cos((k * TAU) / count + off) * r * rad0, Math.sin((k * TAU) / count + off) * r * rad0];
    const pts: Array<[number, number]> = b.n === 1 ? [[0, 0]] : b.n === 7 ? [[0, 0], ...Array.from({ length: 6 }, (_, k) => ring(k, 6, 0.58, 0))] : Array.from({ length: b.n }, (_, k) => ring(k, b.n, 0.5, -Math.PI / 2));
    for (const [px, py] of pts) { starPath(c, b.x + px, b.y + py, rs, 0, 5, 0.45); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.ellipse(b.x - r * 0.38, b.y - r * 0.45, r * 0.18, r * 0.1, -0.7, 0, TAU); c.fill();
    c.restore();
  }
};

// ---------------------------------------------------------------- Ninja (Naruto style): a forehead protector and whisker marks
const ninja = (c: Ctx, f: FaceFrame): void => {
  const W = f.halfW;
  c.fillStyle = '#1c2a6b'; c.strokeStyle = '#0d1440'; c.lineWidth = 0.03; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(-W * 0.98, -0.68); c.quadraticCurveTo(0, -0.98, W * 0.98, -0.68); c.lineTo(W * 0.96, -0.4); c.quadraticCurveTo(0, -0.7, -W * 0.96, -0.4); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = lin(c, 0, -0.9, 0, -0.52, [[0, '#f3f6f9'], [0.5, '#aab4be'], [1, '#7d8893']]); c.strokeStyle = '#4a525a'; c.lineWidth = 0.025;
  rr(c, -0.52, -0.9, 1.04, 0.38, 0.06); c.fill(); c.stroke();
  c.strokeStyle = '#3a424a'; c.lineWidth = 0.028; c.lineCap = 'round';
  c.beginPath();
  for (let a = 0; a < 4.6 * Math.PI; a += 0.25) { const r = 0.011 * a, x = Math.cos(a) * r, y = -0.71 + Math.sin(a) * r; if (a === 0) c.moveTo(x, y); else c.lineTo(x, y); }
  c.stroke();
  c.strokeStyle = 'rgba(70,40,25,.85)'; c.lineWidth = 0.04;   // whisker marks
  sides(c, () => { for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(0.58, 0.3 + i * 0.15); c.lineTo(1.05, 0.2 + i * 0.17); c.stroke(); } });
};

// ---------------------------------------------------------------- Anime Eyes: big shining anime eyes
const animeEyes = (c: Ctx, f: FaceFrame, t: number): void => {
  for (const [x, blink] of [[-0.5, f.blinkL], [0.5, f.blinkR]] as const) {
    c.save(); c.translate(x, 0); c.scale(1, 0.12 + 0.88 * (1 - blink));
    c.fillStyle = '#ffffff'; c.strokeStyle = '#2a1d3d'; c.lineWidth = 0.035;
    c.beginPath(); c.ellipse(0, 0, 0.32, 0.38, 0, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = lin(c, 0, -0.32, 0, 0.32, [[0, '#2b1f6b'], [0.55, '#5b6dff'], [1, '#9fe8ff']]);
    c.beginPath(); c.ellipse(0, 0.02, 0.23, 0.31, 0, 0, TAU); c.fill();
    c.fillStyle = '#120a2e'; c.beginPath(); c.ellipse(0, 0, 0.1, 0.15, 0, 0, TAU); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(-0.09, -0.12, 0.075, 0, TAU); c.fill(); c.beginPath(); c.arc(0.09, 0.12, 0.04, 0, TAU); c.fill();
    spark(c, 0.11, -0.02, 0.05 + 0.02 * Math.sin(t * 5 + x), 'rgba(255,255,255,.95)');
    c.strokeStyle = '#120a2e'; c.lineWidth = 0.07; c.lineCap = 'round';
    c.beginPath(); c.arc(0, 0.02, 0.34, Math.PI * 1.08, Math.PI * 1.92); c.stroke();
    c.restore();
  }
  for (const s of [-1, 1]) {
    c.fillStyle = rad(c, s * 0.78, 0.56, 0, s * 0.78, 0.56, 0.3, [[0, 'rgba(255,110,150,.5)'], [1, 'rgba(255,110,150,0)']]);
    c.beginPath(); c.arc(s * 0.78, 0.56, 0.3, 0, TAU); c.fill();
  }
};

// ---------------------------------------------------------------- Kawaii: manga blush lines, a sweat drop, sparkles and hearts
const kawaii = (c: Ctx, f: FaceFrame, t: number): void => {
  const A = c.globalAlpha;
  c.lineCap = 'round'; c.strokeStyle = '#ff5f8f'; c.lineWidth = 0.045;
  sides(c, () => { for (let i = 0; i < 3; i++) { const x = 0.6 + i * 0.13; c.beginPath(); c.moveTo(x, 0.46); c.lineTo(x - 0.07, 0.64); c.stroke(); } });
  const slide = (t * 0.3) % 1;
  c.save(); c.translate(0.98, f.hair + 0.6 + slide * 0.3); c.globalAlpha = A * (1 - slide * 0.6);
  c.fillStyle = lin(c, 0, -0.2, 0, 0.16, [[0, '#d9f3ff'], [1, '#4aa8ff']]); c.strokeStyle = '#2b7bd1'; c.lineWidth = 0.02;
  c.beginPath(); c.moveTo(0, -0.2); c.bezierCurveTo(0.12, -0.02, 0.14, 0.1, 0, 0.16); c.bezierCurveTo(-0.14, 0.1, -0.12, -0.02, 0, -0.2); c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.8)'; c.beginPath(); c.ellipse(-0.04, 0.02, 0.025, 0.05, 0.3, 0, TAU); c.fill();
  c.restore();
  c.globalAlpha = A;
  for (let i = 0; i < 9; i++) {
    const ph = (t * 0.4 + hash(i + 60)) % 1;
    c.globalAlpha = A * Math.sin(ph * Math.PI);
    const x = (hash(i + 5) - 0.5) * f.halfW * 3.4, y = f.skull - 0.3 + hash(i + 15) * 2.4;
    if (i % 3 === 0) heart(c, x, y, 0.16, '#ff7aa8'); else spark(c, x, y, 0.07 + 0.08 * hash(i + 25), i % 2 ? '#fff3b0' : '#ffffff', ph * 2);
  }
  c.globalAlpha = A;
};

// ---------------------------------------------------------------- Sakura: cherry blossom petals and a soft pink glow
const blossom = (c: Ctx, x: number, y: number, s: number, rot: number): void => {
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s);
  c.fillStyle = lin(c, 0, 0, 0, -0.34, [[0, '#ff7fae'], [1, '#ffd6e6']]); c.strokeStyle = 'rgba(190,60,110,.5)'; c.lineWidth = 0.015;
  for (let k = 0; k < 5; k++) {
    c.save(); c.rotate((k * TAU) / 5);
    c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-0.15, -0.1, -0.14, -0.31, -0.045, -0.36); c.lineTo(0, -0.3); c.lineTo(0.045, -0.36); c.bezierCurveTo(0.14, -0.31, 0.15, -0.1, 0, 0); c.fill(); c.stroke();
    c.restore();
  }
  c.fillStyle = '#d6407a'; c.beginPath(); c.arc(0, 0, 0.06, 0, TAU); c.fill();
  c.strokeStyle = '#d6407a'; c.lineWidth = 0.014;
  for (let k = 0; k < 6; k++) { const a = (k * TAU) / 6 + 0.3; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * 0.13, Math.sin(a) * 0.13); c.stroke(); c.fillStyle = '#ffe38a'; c.beginPath(); c.arc(Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0.017, 0, TAU); c.fill(); }
  c.restore();
};
const sakuraFace = (c: Ctx, f: FaceFrame, t: number): void => {
  blossom(c, f.halfW * 0.78, f.hair + 0.3, 1.0 + 0.04 * Math.sin(t * 2), 0.3 + wob(t, 1.5, 0.05));
  blossom(c, f.halfW * 0.5, f.hair + 0.05, 0.55, -0.4);
  blossom(c, f.halfW * 1.02, f.hair + 0.7, 0.45, 0.9);
};
const sakuraLook = (c: Ctx, w: number, h: number): void => {
  tint('rgba(255,170,200,.36)')(c, w, h);
  tint('rgba(255,235,245,.12)', 'screen')(c, w, h);
  bloom(c, w, h, 0.3);
};
const petals = (c: Ctx, w: number, h: number, t: number): void => {
  for (let i = 0; i < 26; i++) {
    const ph = (t * (0.045 + 0.05 * hash(i)) + hash(i + 9)) % 1;
    const x = (hash(i + 2) + Math.sin(t * 0.7 + i) * 0.05) * w, y = ph * h * 1.1 - h * 0.05, s = w * (0.012 + 0.014 * hash(i + 5));
    c.save(); c.translate(x, y); c.rotate(t * (0.5 + hash(i)) + i); c.scale(1, 0.7 + 0.3 * Math.sin(t * 2 + i));
    c.fillStyle = i % 3 ? '#ffb3cf' : '#ff8fb6'; c.globalAlpha = 0.95;
    c.beginPath(); c.moveTo(0, -s); c.bezierCurveTo(s * 0.95, -s * 0.7, s * 0.9, s * 0.6, 0, s); c.bezierCurveTo(-s * 0.9, s * 0.6, -s * 0.95, -s * 0.7, 0, -s); c.fill();
    c.restore();
  }
};

// ---------------------------------------------------------------- Manga: black and white, screentone dots and speed lines
let tone: HTMLCanvasElement | null = null;
const manga = (c: Ctx, w: number, h: number, _faces: FaceFrame[], t: number): void => {
  tint('#000', 'saturation')(c, w, h);
  const copy = scratch(3, w, h); copy.drawImage(c.canvas, 0, 0);
  c.save(); c.globalCompositeOperation = 'overlay'; c.globalAlpha = 0.9; c.drawImage(copy.canvas, 0, 0); c.restore();
  if (!tone) {
    tone = document.createElement('canvas'); tone.width = tone.height = 7;
    const g = tone.getContext('2d') as Ctx; g.fillStyle = '#000'; g.beginPath(); g.arc(3.5, 3.5, 1.6, 0, TAU); g.fill();
  }
  c.save(); c.globalCompositeOperation = 'multiply'; c.globalAlpha = 0.34; c.fillStyle = c.createPattern(tone, 'repeat') as CanvasPattern; c.fillRect(0, 0, w, h); c.restore();
  vignette(c, w, h, 0.5);
  c.save(); c.translate(w / 2, h * 0.45);   // speed lines
  const R = Math.hypot(w, h) * 0.6, seed = Math.floor(t * 10);
  c.fillStyle = 'rgba(0,0,0,.55)';
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * TAU + hash(i + seed) * 0.05, half = 0.012 + 0.02 * hash(i * 3 + seed), r0 = R * (0.5 + 0.18 * hash(i + seed * 7));
    c.beginPath(); c.moveTo(Math.cos(a - half) * R, Math.sin(a - half) * R); c.lineTo(Math.cos(a + half) * R, Math.sin(a + half) * R); c.lineTo(Math.cos(a) * r0, Math.sin(a) * r0); c.closePath(); c.fill();
  }
  c.restore();
};
const mangaTop = (c: Ctx, w: number, h: number, t: number): void => {
  const fs = Math.round(Math.min(w, h) * 0.13) * (1 + 0.04 * Math.sin(t * 9));
  c.save();
  c.font = `900 ${fs}px "Hiragino Sans","Yu Gothic","Noto Sans JP","Apple SD Gothic Neo",system-ui,sans-serif`;
  c.translate(w * 0.06, h * 0.94); c.rotate(-0.12); c.textAlign = 'left'; c.lineJoin = 'round'; c.lineWidth = fs * 0.2;
  c.strokeStyle = '#ffffff'; c.strokeText('ドン!', 0, 0); c.fillStyle = '#000000'; c.fillText('ドン!', 0, 0);
  c.restore();
};

// ---------------------------------------------------------------- Anime Look: flat colours with dark outlines, like a drawing
const cartoon = (c: Ctx, w: number, h: number): void => {
  const sw = Math.max(32, Math.round(w / 2.4)), sh = Math.max(32, Math.round(h / 2.4));
  const tiny = scratch(5, Math.max(16, sw >> 1), Math.max(16, sh >> 1));   // made small, then a little bigger: a soft picture, so the lines come from real edges and not from noise
  tiny.imageSmoothingEnabled = true;
  tiny.drawImage(c.canvas, 0, 0, w, h, 0, 0, tiny.canvas.width, tiny.canvas.height);
  const s = scratch(4, sw, sh, true);
  s.imageSmoothingEnabled = true;
  s.drawImage(tiny.canvas, 0, 0, sw, sh);
  const img = s.getImageData(0, 0, sw, sh), d = img.data;
  const lum = new Float32Array(sw * sh);
  for (let i = 0, p = 0; i < lum.length; i++, p += 4) lum[i] = d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const i = y * sw + x, p = i * 4;
      let edge = 0;
      if (x > 0 && y > 0 && x < sw - 1 && y < sh - 1) {
        const gx = -lum[i - sw - 1] - 2 * lum[i - 1] - lum[i + sw - 1] + lum[i - sw + 1] + 2 * lum[i + 1] + lum[i + sw + 1];
        const gy = -lum[i - sw - 1] - 2 * lum[i - sw] - lum[i - sw + 1] + lum[i + sw - 1] + 2 * lum[i + sw] + lum[i + sw + 1];
        edge = Math.abs(gx) + Math.abs(gy);
      }
      if (edge > 120) { d[p] = d[p + 1] = d[p + 2] = 26; } else {   // a dark line where the brightness changes fast, flat colour steps everywhere else
        d[p] = Math.min(255, Math.round((d[p] * 1.08) / 36) * 36);
        d[p + 1] = Math.min(255, Math.round((d[p + 1] * 1.08) / 36) * 36);
        d[p + 2] = Math.min(255, Math.round((d[p + 2] * 1.08) / 36) * 36);
      }
    }
  }
  s.putImageData(img, 0, 0);
  c.save(); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(s.canvas, 0, 0, sw, sh, 0, 0, w, h); c.restore();
  tint('rgba(255,150,210,.12)')(c, w, h);
};

// ================================================================ LOOKS: the colours of the whole picture
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
  { id: 'none', name: 'Normal', group: 'fun', kind: 'look', color: '#8a8f98' },
  { id: 'devil', name: 'Devil', group: 'fun', kind: 'face', color: '#ff5a1f', tags: 'horns fire demon', base: tint('rgba(255,70,40,.3)'), face: devil },
  { id: 'shades', name: 'Shades', group: 'fun', kind: 'face', color: '#ff9f1c', tags: 'sunglasses cool glasses', face: shades },
  { id: 'puppy', name: 'Puppy', group: 'fun', kind: 'face', color: '#b27644', tags: 'dog ears tongue', face: puppy },
  { id: 'kitty', name: 'Kitty', group: 'fun', kind: 'face', color: '#ff8fb1', tags: 'cat ears whiskers', face: kitty },
  { id: 'bunny', name: 'Bunny', group: 'fun', kind: 'face', color: '#c9a7ff', tags: 'rabbit ears', face: bunny },
  { id: 'crown', name: 'Royal', group: 'fun', kind: 'face', color: '#f2b824', tags: 'crown king queen gold', face: crown },
  { id: 'bloom', name: 'Bloom', group: 'fun', kind: 'face', color: '#ff7eb6', tags: 'flowers crown', face: bloomCrown },
  { id: 'angel', name: 'Angel', group: 'fun', kind: 'face', color: '#ffe58a', tags: 'halo', face: angel, base: (c, w, h) => bloom(c, w, h, 0.18) },
  { id: 'crush', name: 'Crush', group: 'fun', kind: 'face', color: '#ff4d79', tags: 'love heart eyes', face: crush },
  { id: 'gent', name: 'Gentleman', group: 'fun', kind: 'face', color: '#6b6f7b', tags: 'hat moustache mustache', face: gentleman },
  { id: 'clown', name: 'Clown', group: 'fun', kind: 'face', color: '#3ec1ff', tags: 'circus wig nose', face: clown, top: confetti },
  { id: 'robo', name: 'Robo', group: 'fun', kind: 'face', color: '#4cc9f0', tags: 'robot visor', face: robot },
  { id: 'pirate', name: 'Pirate', group: 'fun', kind: 'face', color: '#d7263d', tags: 'bandana eye patch', face: pirate },
  { id: 'glitter', name: 'Glitter', group: 'fun', kind: 'face', color: '#ff9ed2', tags: 'sparkle shine stars', face: glitter, top: drift },
  { id: 'wide', name: 'Wide Eyes', group: 'fun', kind: 'face', color: '#7ee0c3', tags: 'big eyes funny', base: wideEyes },

  { id: 'bts', name: 'BTS Purple', group: 'kpop', kind: 'face', color: '#8a3dff', tags: 'k-pop kpop bts army purple borahae korean', base: btsLook, face: btsFace, top: btsTop },
  { id: 'blackpink', name: 'Blackpink', group: 'kpop', kind: 'face', color: '#ff4fa3', tags: 'k-pop kpop blackpink pink black blink korean heart glasses', base: blackpinkLook, face: heartGlasses, top: blackpinkTop },
  { id: 'idol', name: 'K-Pop Stage', group: 'kpop', kind: 'face', color: '#ff4fd8', tags: 'k-pop kpop idol concert stage lights korean', base: stageBeams, face: idolFace, top: idolTop },

  { id: 'strawhat', name: 'Straw Hat', group: 'anime', kind: 'face', color: '#f2c14e', tags: 'one piece luffy pirate hat anime', face: strawHat },
  { id: 'swordsman', name: 'Swordsman', group: 'anime', kind: 'face', color: '#2f9a55', tags: 'one piece zoro green earrings anime', face: swordsman },
  { id: 'saiyan', name: 'Super Saiyan', group: 'anime', kind: 'face', color: '#ffc400', tags: 'dragon ball goku saiyan golden hair anime', base: saiyanLook, face: saiyan, top: saiyanTop },
  { id: 'dragonballs', name: 'Dragon Balls', group: 'anime', kind: 'face', color: '#ff9d2e', tags: 'dragon ball z goku orange stars anime', face: dragonBalls },
  { id: 'ninja', name: 'Ninja', group: 'anime', kind: 'face', color: '#3b57d6', tags: 'naruto headband whiskers anime', face: ninja },
  { id: 'animeeyes', name: 'Anime Eyes', group: 'anime', kind: 'face', color: '#6f7dff', tags: 'big shiny eyes manga', face: animeEyes },
  { id: 'kawaii', name: 'Kawaii', group: 'anime', kind: 'face', color: '#ff7aa8', tags: 'cute blush manga hearts', face: kawaii },
  { id: 'sakura', name: 'Sakura', group: 'anime', kind: 'face', color: '#ffb3cf', tags: 'cherry blossom japan flowers', base: sakuraLook, face: sakuraFace, top: petals },
  { id: 'manga', name: 'Manga', group: 'anime', kind: 'look', color: '#d0d4da', tags: 'black white comic speed lines anime', base: manga, top: mangaTop },
  { id: 'cartoon', name: 'Anime Look', group: 'anime', kind: 'look', color: '#ff8fd0', tags: 'cartoon drawing cel flat colours anime', base: cartoon },

  { id: 'golden', name: 'Golden Hour', group: 'looks', kind: 'look', color: '#ffb347', tags: 'warm sunset', base: goldenHour },
  { id: 'noir', name: 'Noir', group: 'looks', kind: 'look', color: '#d0d4da', tags: 'black and white film', base: noir },
  { id: 'neon', name: 'Neon', group: 'looks', kind: 'look', color: '#8a3dff', tags: 'purple cyber glow', base: neon },
  { id: 'dream', name: 'Dreamy', group: 'looks', kind: 'look', color: '#ffc2e6', tags: 'soft pink glow', base: dreamy, top: drift }
];

export const DEFAULT_LENS = 'devil';
export const lensById = (id: string): LensDef => LENSES.find((l) => l.id === id) || LENSES[0];
/** does this lens need to find a face to do its work? */
export const needsFace = (l: LensDef): boolean => l.kind === 'face';
/** the lenses of one group (the "Normal" picture is in every group, first) */
export const lensesIn = (g: Group | 'all'): LensDef[] => LENSES.filter((l) => l.id === 'none' || g === 'all' || l.group === g);
/** the search box: by name, group and the words people use */
export const lensMatches = (l: LensDef, q: string): boolean => {
  const s = q.trim().toLowerCase();
  return !s || l.name.toLowerCase().includes(s) || (l.tags || '').includes(s) || l.group.includes(s);
};
