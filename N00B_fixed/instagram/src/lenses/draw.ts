import type { FaceFrame } from './types.ts';

// Small drawing tools shared by the lenses (all plain canvas, so they run the same on every phone and browser).

export type Ctx = CanvasRenderingContext2D;
export const TAU = Math.PI * 2;

/** Run `fn` with the drawing space set to the face: the spot between the eyes is (0, 0), 1 unit is the distance between the eyes, and everything turns with the head. */
export function inFace(c: Ctx, f: FaceFrame, fn: () => void): void {
  c.save();
  c.translate(f.cx, f.cy);
  c.rotate(f.roll);
  c.scale(f.u, f.u);
  fn();
  c.restore();
}

type Stops = ReadonlyArray<readonly [number, string]>;

export function lin(c: Ctx, x0: number, y0: number, x1: number, y1: number, stops: Stops): CanvasGradient {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}

export function rad(c: Ctx, x0: number, y0: number, r0: number, x1: number, y1: number, r1: number, stops: Stops): CanvasGradient {
  const g = c.createRadialGradient(x0, y0, r0, x1, y1, r1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}

/** a rounded rectangle as the current path */
export function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + k, y);
  c.arcTo(x + w, y, x + w, y + h, k);
  c.arcTo(x + w, y + h, x, y + h, k);
  c.arcTo(x, y + h, x, y, k);
  c.arcTo(x, y, x + w, y, k);
  c.closePath();
}

/** a star (4 points by default) as the current path */
export function starPath(c: Ctx, x: number, y: number, r: number, rot = 0, points = 4, inner = 0.36): void {
  c.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = rot + (i * Math.PI) / points - Math.PI / 2;
    const k = i % 2 ? r * inner : r;
    c.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k);
  }
  c.closePath();
}

/** a little shining star */
export function spark(c: Ctx, x: number, y: number, r: number, color: string, rot = 0): void {
  c.fillStyle = color;
  starPath(c, x, y, r, rot, 4, 0.3);
  c.fill();
}

const HEART = typeof Path2D !== 'undefined' ? new Path2D('M0 0.9 C -1.15 0.1 -1 -0.75 -0.5 -0.78 C -0.2 -0.8 0 -0.55 0 -0.4 C 0 -0.55 0.2 -0.8 0.5 -0.78 C 1 -0.75 1.15 0.1 0 0.9 Z') : null;
/** fill a heart (about `s` wide, centred on (x, y)), shaded from `top` to `bottom` */
export function heart(c: Ctx, x: number, y: number, s: number, top: string, bottom = top): void {
  if (!HEART) return;
  c.save();
  c.translate(x, y);
  c.scale(s / 2, s / 2);
  c.fillStyle = top === bottom ? top : lin(c, 0, -0.8, 0, 0.9, [[0, top], [1, bottom]]);
  c.fill(HEART);
  c.restore();
}

/** a steady "random" number between 0 and 1 for the number i (so a particle always has the same place and speed) */
export function hash(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ---------------------------------------------------------------- looks that change the whole picture (kept free of ctx.filter: Safari does not have it)
const spare: HTMLCanvasElement[] = [];
/** a spare canvas of the given size (cleared) to draw on for a moment */
export function scratch(n: number, w: number, h: number, readBack = false): Ctx {
  const cv = spare[n] || (spare[n] = document.createElement('canvas'));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const x = cv.getContext('2d', readBack ? { willReadFrequently: true } : undefined) as Ctx;   // (a spare that is read back pixel by pixel says so the first time it is used)
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalCompositeOperation = 'source-over';
  x.globalAlpha = 1;
  x.clearRect(0, 0, w, h);
  return x;
}

/** a soft glow: the picture made small, then big again, laid on top with "screen" */
export function bloom(c: Ctx, w: number, h: number, alpha: number): void {
  const a = scratch(0, Math.max(8, w >> 3), Math.max(8, h >> 3));
  a.imageSmoothingEnabled = true;
  a.drawImage(c.canvas, 0, 0, w, h, 0, 0, a.canvas.width, a.canvas.height);
  const b = scratch(1, Math.max(4, w >> 5), Math.max(4, h >> 5));
  b.imageSmoothingEnabled = true;
  b.drawImage(a.canvas, 0, 0, b.canvas.width, b.canvas.height);
  c.save();
  c.globalCompositeOperation = 'screen';
  c.globalAlpha = alpha;
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(b.canvas, 0, 0, w, h);
  c.restore();
}

/** dark corners */
export function vignette(c: Ctx, w: number, h: number, strength: number, color = '0,0,0'): void {
  c.save();
  c.fillStyle = rad(c, w / 2, h * 0.46, Math.min(w, h) * 0.28, w / 2, h * 0.46, Math.hypot(w, h) * 0.58, [[0, `rgba(${color},0)`], [1, `rgba(${color},${strength})`]]);
  c.fillRect(0, 0, w, h);
  c.restore();
}

/** blow up the round part of the picture around (x, y) by `k`, soft at the edge */
export function magnify(c: Ctx, x: number, y: number, r: number, k: number): void {
  const d = Math.max(8, Math.ceil(r * 2));
  const p = scratch(2, d, d);
  const s = d / k;
  p.drawImage(c.canvas, x - s / 2, y - s / 2, s, s, 0, 0, d, d);
  p.globalCompositeOperation = 'destination-in';
  p.fillStyle = rad(p, d / 2, d / 2, 0, d / 2, d / 2, d / 2, [[0, '#000'], [0.62, '#000'], [1, 'rgba(0,0,0,0)']]);
  p.fillRect(0, 0, d, d);
  c.drawImage(p.canvas, x - d / 2, y - d / 2);
}
