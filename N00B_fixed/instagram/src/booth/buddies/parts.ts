// The parts the buddies are built from: the shadow on the ground, shiny eyes, cheeks, mouths, arms and legs, a lit ball of colour. A buddy is a life-size character that stands next to the
// person in the photo: no white edge (that is for stickers), a soft shadow where it stands, and a little life of its own (it breathes, hops, sways, blinks once in every loop).
// Everything is in the sticker box (200 x 200, centre 0,0); the ground is at y = GROUND.
import { INK, LOOP, TAU, clamp, paint, pCirc, pEll, pSpark, rad } from '../kit.ts';
import type { Ctx, Kit } from '../kit.ts';

export const EYE = '#2a1538';
/** the y of the ground: the feet stand here */
export const GROUND = 93;

/** the soft shadow on the ground under a buddy. `w` = half its width; `lift` = how high the buddy is above the ground (the shadow gets smaller and fainter). */
export function ground(c: Ctx, w = 56, lift = 0): void {
  const s = 1 - clamp(lift / 50) * 0.3, r = w * s;
  c.save();
  c.translate(0, GROUND);
  c.scale(1, 0.2);
  c.fillStyle = rad(c, 0, 0, 0, r, [[0, `rgba(18,8,32,${0.62 * s})`], [0.55, `rgba(18,8,32,${0.34 * s})`], [1, 'rgba(18,8,32,0)']]);
  c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
  c.restore();
}

/** a lit ball of colour (light from the top left): the fill of a round part of a buddy that is centred on cx, cy */
export function ball(c: Ctx, cx: number, cy: number, r: number, light: string, mid: string, dark: string): CanvasGradient {
  return rad(c, cx - r * 0.4, cy - r * 0.46, r * 0.06, r * 1.25, [[0, light], [0.5, mid], [1, dark]], cx, cy);
}

/** hops: `n` hops in every loop (0 on the ground .. 1 at the top) */
export const hopOf = (k: Kit, n: number, off = 0): number => Math.abs(Math.sin((k.ph * n) / 2 + off * Math.PI));
/** how shut the eyes are (0 open .. 1 shut): one blink in every loop, `at` = where in the loop (0..0.8) */
export function blinkOf(k: Kit, at = 0.4, dur = 0.17): number {
  const u = (k.t - at * LOOP) / dur;
  return u > 0 && u < 1 ? Math.sin(u * Math.PI) : 0;
}

/** a round shiny eye (a dark bead with two lights); b = how shut it is, look = a look to the side */
export function bead(c: Ctx, k: Kit, x: number, y: number, r: number, b = 0, look = 0): void {
  if (b > 0.6) {
    c.beginPath(); c.moveTo(x - r * 0.8, y - r * 0.05); c.quadraticCurveTo(x, y + r * 0.62, x + r * 0.8, y - r * 0.05);
    paint(c, k, { stroke: EYE, lw: Math.max(2.6, r * 0.34) });
    return;
  }
  pEll(c, x + look, y, r * 0.82, r * (1 - b * 1.1));
  paint(c, k, { fill: EYE });
  if (b < 0.3) {
    pCirc(c, x + look - r * 0.28, y - r * 0.32, r * 0.3); paint(c, k, { fill: '#fff' });
    pCirc(c, x + look + r * 0.3, y + r * 0.28, r * 0.13); paint(c, k, { fill: 'rgba(255,255,255,.85)' });
  }
}

/** a big anime eye: a dark rim, a coloured shiny middle and two lights; w and h = half width and half height */
export function bigEye(c: Ctx, k: Kit, x: number, y: number, w: number, h: number, iris: readonly [string, string], b = 0, look = 0): void {
  if (b > 0.6) {
    c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(x, y + h * 0.55, x + w, y);
    paint(c, k, { stroke: EYE, lw: 3.4 });
    return;
  }
  const hh = h * (1 - b * 1.1);
  pEll(c, x, y, w, hh); paint(c, k, { fill: EYE });
  pEll(c, x + look, y + hh * 0.08, w * 0.8, hh * 0.84);
  paint(c, k, { fill: rad(c, x + look, y - hh * 0.4, 1, hh * 1.1, [[0, iris[0]], [1, iris[1]]]) });
  pEll(c, x + look, y + hh * 0.12, w * 0.38, hh * 0.46); paint(c, k, { fill: EYE });
  if (b < 0.3) {
    pCirc(c, x + look - w * 0.3, y - hh * 0.38, w * 0.3); paint(c, k, { fill: '#fff' });
    pCirc(c, x + look + w * 0.34, y + hh * 0.32, w * 0.15); paint(c, k, { fill: 'rgba(255,255,255,.9)' });
  }
}

export function blush(c: Ctx, k: Kit, x: number, y: number, rx = 9, ry = 5.5, a = 0.42): void {
  pEll(c, x, y, rx, ry); paint(c, k, { fill: `rgba(255,88,140,${a})` });
}

/** a happy little mouth */
export function smile(c: Ctx, k: Kit, x: number, y: number, w: number, h = 6, lw = 3.4): void {
  c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(x, y + h, x + w, y);
  paint(c, k, { stroke: EYE, lw });
}

/** the "w" mouth of a bunny, a kitten and a fox */
export function catMouth(c: Ctx, k: Kit, x: number, y: number, w = 7, lw = 3): void {
  c.beginPath(); c.moveTo(x - w * 1.9, y - 1.5); c.quadraticCurveTo(x - w, y + w * 0.9, x, y); c.quadraticCurveTo(x + w, y + w * 0.9, x + w * 1.9, y - 1.5);
  paint(c, k, { stroke: EYE, lw });
}

/** a wide open happy mouth with a tongue */
export function grin(c: Ctx, k: Kit, x: number, y: number, w: number, h: number): void {
  c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(x, y + h * 0.35, x + w, y); c.quadraticCurveTo(x + w * 0.8, y + h * 1.25, x, y + h * 1.25); c.quadraticCurveTo(x - w * 0.8, y + h * 1.25, x - w, y); c.closePath();
  paint(c, k, { fill: '#7a1d3a', stroke: INK, lw: 3 });
  c.save();
  c.clip();
  pEll(c, x, y + h * 1.18, w * 0.55, h * 0.5); paint(c, k, { fill: '#ff7b9c' });
  c.restore();
}

/** a limb: a thick line with round ends and an outline, from (x0, y0) to (x1, y1), curved through (bx, by) when it is given */
export function limb(c: Ctx, k: Kit, x0: number, y0: number, x1: number, y1: number, w: number, fill: string, bx?: number, by?: number, edge = 4): void {
  c.beginPath(); c.moveTo(x0, y0);
  if (bx !== undefined && by !== undefined) c.quadraticCurveTo(bx, by, x1, y1); else c.lineTo(x1, y1);
  paint(c, k, { stroke: INK, lw: w + edge * 2 });
  paint(c, k, { stroke: fill, lw: w });
}

/** a hand or a foot: a round part with an outline */
export function paw(c: Ctx, k: Kit, x: number, y: number, r: number, light: string, mid: string, dark: string): void {
  pCirc(c, x, y, r);
  paint(c, k, { fill: ball(c, x, y, r, light, mid, dark), stroke: INK, lw: 4 });
}

/** a white shine on a round part (a glossy highlight) */
export function gloss(c: Ctx, k: Kit, x: number, y: number, rx: number, ry: number, rot = -0.65, a = 0.55): void {
  pEll(c, x, y, rx, ry, rot); paint(c, k, { fill: `rgba(255,255,255,${a})` });
}

/** a twinkle */
export function twinkle(c: Ctx, k: Kit, x: number, y: number, r: number, rot = 0, fill = '#fff'): void {
  pSpark(c, x, y, r, rot);
  paint(c, k, { fill, stroke: INK, lw: 2.2 });
}

/** a soft glow (a disc of light that fades out) */
export function glow(c: Ctx, k: Kit, x: number, y: number, r: number, rgb: string, a: number): void {
  pCirc(c, x, y, r);
  paint(c, k, { fill: rad(c, x, y, 0, r, [[0, `rgba(${rgb},${a})`], [1, `rgba(${rgb},0)`]]) });
}
