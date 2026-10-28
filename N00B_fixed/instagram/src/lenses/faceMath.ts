import type { FaceFrame, Pt } from './types.ts';

// The maths of the lenses that needs no browser: from the 478 points that MediaPipe's face model gives for a face to the few numbers every lens is drawn with (types.ts), and the
// smoothing that keeps a lens from shaking. (Tested in scripts/supabase/test-lenses.mjs.)

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

export interface Landmark { x: number; y: number; z?: number }

// the numbers of the points of MediaPipe's face mesh that are used
const FOREHEAD = 10, CHIN = 152, CHEEK_A = 234, CHEEK_B = 454, NOSE = 1, BROW_A = 105, BROW_B = 334, LIP_TOP = 13, LIP_BOTTOM = 14, MOUTH_A = 61, MOUTH_B = 291;
const UNDER_NOSE = 2, LIP_EDGE = 0, TEMPLE_A = 127, TEMPLE_B = 356, EYE_IN_A = 133, EYE_OUT_A = 33, EYE_IN_B = 362, EYE_OUT_B = 263;
// on Google's average face the finder's forehead point is 0.89 above the eyes and the chin 1.90 below them: the face is 2.79 long. The hairline is 0.31 above that point, the top of the head 0.64.
const AVERAGE_LENGTH = 2.79;
const EYE_A = [33, 133, 159, 145];    // the four points around one eye ...
const EYE_B = [362, 263, 386, 374];   // ... and around the other

/**
 * The face that one set of landmarks describes. `aspect` is the width / height of the picture the points were found in, `mirror` turns it into a mirror picture (the front camera),
 * `shapes` are the expression scores of the model (jawOpen ...) when it gave any. cx / cy / u of the answer are fractions of the picture.
 */
export function faceFromLandmarks(L: ReadonlyArray<Landmark>, aspect: number, mirror: boolean, shapes?: Record<string, number>): FaceFrame | null {
  if (!L || L.length < 400 || !(aspect > 0)) return null;
  const ar = 1 / aspect;   // height / width: distances are measured in widths, so they are the same in every direction
  const P = (i: number): Pt => ({ x: mirror ? 1 - L[i].x : L[i].x, y: L[i].y * ar });
  const mean = (ids: number[]): Pt => { let x = 0, y = 0; for (const i of ids) { const p = P(i); x += p.x; y += p.y; } return { x: x / ids.length, y: y / ids.length }; };
  let a = mean(EYE_A), b = mean(EYE_B);
  if (a.x > b.x) { const s = a; a = b; b = s; }   // a = the eye on the left of the picture
  const ipd = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(ipd > 1e-4)) return null;
  const roll = Math.atan2(b.y - a.y, b.x - a.x);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const co = Math.cos(roll), si = Math.sin(roll);
  const loc = (p: Pt): Pt => { const dx = p.x - mid.x, dy = p.y - mid.y; return { x: (dx * co + dy * si) / ipd, y: (-dx * si + dy * co) / ipd }; };

  const c1 = loc(P(CHEEK_A)), c2 = loc(P(CHEEK_B));
  const lo = Math.min(c1.x, c2.x), hi = Math.max(c1.x, c2.x);
  const halfW = (hi - lo) / 2;
  const nose = loc(P(NOSE));
  const yaw = clamp(((nose.x - (lo + hi) / 2) / Math.max(halfW, 0.3)) * 1.6, -1, 1);
  const lipA = loc(P(LIP_TOP)), lipB = loc(P(LIP_BOTTOM));
  const mouth = { x: (lipA.x + lipB.x) / 2, y: (lipA.y + lipB.y) / 2 };
  const mouthW = Math.abs(loc(P(MOUTH_B)).x - loc(P(MOUTH_A)).x);
  const brow = (loc(P(BROW_A)).y + loc(P(BROW_B)).y) / 2;
  const gap = Math.hypot(lipA.x - lipB.x, lipA.y - lipB.y);
  const top = loc(P(FOREHEAD)).y, chin = loc(P(CHIN)).y;
  const size = clamp((chin - top) / AVERAGE_LENGTH, 0.8, 1.25);   // this face compared with the average one
  const tA = loc(P(TEMPLE_A)), tB = loc(P(TEMPLE_B));
  const eyeW = (Math.abs(loc(P(EYE_IN_A)).x - loc(P(EYE_OUT_A)).x) + Math.abs(loc(P(EYE_OUT_B)).x - loc(P(EYE_IN_B)).x)) / 2;

  const s = shapes;
  const sc = (k: string): number => (s && typeof s[k] === 'number' ? s[k] : 0);
  // with the model's own expression scores when it gave them, else measured from the points
  const mouthOpen = s ? clamp(sc('jawOpen') * 1.15, 0, 1) : clamp((gap - 0.04) / 0.5, 0, 1);
  const smile = s ? clamp((sc('mouthSmileLeft') + sc('mouthSmileRight')) / 2 * 1.25, 0, 1) : clamp((mouthW - 0.6) / 0.35, 0, 1);
  const browUp = s ? clamp(Math.max(sc('browInnerUp'), (sc('browOuterUpLeft') + sc('browOuterUpRight')) / 2) * 1.2, 0, 1) : 0;
  // the model names the eyes after the person's own left and right: in a mirror picture the person's left is on the left of the screen
  const blinkL = s ? clamp(mirror ? sc('eyeBlinkLeft') : sc('eyeBlinkRight'), 0, 1) : 0;
  const blinkR = s ? clamp(mirror ? sc('eyeBlinkRight') : sc('eyeBlinkLeft'), 0, 1) : 0;

  return {
    cx: mid.x, cy: mid.y / ar, u: ipd, roll, yaw,
    top, chin, hair: top - 0.31 * size, skull: top - 0.64 * size, halfW, temple: Math.abs(tB.x - tA.x) / 2, brow, eyeW,
    nose, base: loc(P(UNDER_NOSE)).y, lipTop: loc(P(LIP_EDGE)).y, lipUp: lipA.y, lipLow: lipB.y,
    mouth, mouthW, mouthOpen, smile, browUp, blinkL, blinkR, seen: 1
  };
}

/** a face of the picture's fractions (cx, cy, u) turned into pixels of the rectangle the picture is drawn into */
export function placeFace(f: FaceFrame, r: { dx: number; dy: number; dw: number; dh: number }): FaceFrame {
  return { ...f, cx: r.dx + f.cx * r.dw, cy: r.dy + f.cy * r.dh, u: f.u * r.dw };
}

/** ... or of a picture that fills a w x h canvas */
export function scaleFace(f: FaceFrame, w: number, h: number): FaceFrame {
  return placeFace(f, { dx: 0, dy: 0, dw: w, dh: h });
}

// ---------------------------------------------------------------- smoothing
// "One Euro" filter: strong smoothing while the value hardly moves (no shaking), almost none while it moves fast (no lagging behind).
class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private minCutoff: number;
  private beta: number;
  constructor(minCutoff: number, beta: number) { this.minCutoff = minCutoff; this.beta = beta; }
  filter(v: number, dt: number): number {
    if (this.x === null) { this.x = v; return v; }
    const rate = 1 / Math.max(dt, 1e-3);
    const alpha = (cutoff: number): number => 1 / (1 + 1 / (2 * Math.PI * cutoff) * rate);
    this.dx += alpha(1) * ((v - this.x) * rate - this.dx);
    this.x += alpha(this.minCutoff + this.beta * Math.abs(this.dx)) * (v - this.x);
    return this.x;
  }
}

type Kind = 'pos' | 'ang' | 'loc' | 'expr';
const FIELDS: ReadonlyArray<readonly [string, Kind]> = [
  ['cx', 'pos'], ['cy', 'pos'], ['u', 'pos'], ['roll', 'ang'], ['yaw', 'ang'],
  ['top', 'loc'], ['chin', 'loc'], ['hair', 'loc'], ['skull', 'loc'], ['halfW', 'loc'], ['temple', 'loc'], ['brow', 'loc'], ['eyeW', 'loc'], ['noseX', 'loc'], ['noseY', 'loc'],
  ['base', 'loc'], ['lipTop', 'loc'], ['lipUp', 'loc'], ['lipLow', 'loc'], ['mouthX', 'loc'], ['mouthY', 'loc'], ['mouthW', 'loc'],
  ['mouthOpen', 'expr'], ['smile', 'expr'], ['browUp', 'expr'], ['blinkL', 'expr'], ['blinkR', 'expr']
];
const SETTINGS: Record<Kind, readonly [number, number]> = { pos: [1.0, 80], ang: [1.2, 6], loc: [1.2, 12], expr: [4, 14] };   // [slowest cut-off in Hz, how much a fast move opens it]

const flatten = (f: FaceFrame): Record<string, number> => ({ ...f, noseX: f.nose.x, noseY: f.nose.y, mouthX: f.mouth.x, mouthY: f.mouth.y }) as unknown as Record<string, number>;
const unflatten = (v: Record<string, number>, seen: number): FaceFrame => ({
  cx: v.cx, cy: v.cy, u: v.u, roll: v.roll, yaw: v.yaw, top: v.top, chin: v.chin, hair: v.hair, skull: v.skull, halfW: v.halfW, temple: v.temple, brow: v.brow, eyeW: v.eyeW,
  nose: { x: v.noseX, y: v.noseY }, base: v.base, lipTop: v.lipTop, lipUp: v.lipUp, lipLow: v.lipLow, mouth: { x: v.mouthX, y: v.mouthY }, mouthW: v.mouthW,
  mouthOpen: v.mouthOpen, smile: v.smile, browUp: v.browUp, blinkL: v.blinkL, blinkR: v.blinkR, seen
});

interface Track { filters: Record<string, OneEuro>; last: FaceFrame; t: number; found: number }

/** Remembers the faces from one picture to the next, smooths them, and lets a face that was lost fade out over a moment instead of vanishing. */
export class FaceSmoother {
  private tracks: Track[] = [];
  private grace: number;
  constructor(grace = 0.3) { this.grace = grace; }
  reset(): void { this.tracks = []; }
  /** `found` = this picture's faces (as faceFromLandmarks gives them), `now` in seconds. Gives the faces to draw, left to right. */
  update(found: ReadonlyArray<FaceFrame>, now: number): FaceFrame[] {
    const used = new Set<Track>();
    const out: FaceFrame[] = [];
    for (const raw of [...found].sort((p, q) => p.cx - q.cx)) {
      let best: Track | null = null, bd = 0.3;
      for (const tr of this.tracks) {
        if (used.has(tr)) continue;
        const d = Math.abs(tr.last.cx - raw.cx) + Math.abs(tr.last.cy - raw.cy);
        if (d < bd) { bd = d; best = tr; }
      }
      if (!best) {
        const filters: Record<string, OneEuro> = {};
        for (const [k, kind] of FIELDS) filters[k] = new OneEuro(SETTINGS[kind][0], SETTINGS[kind][1]);
        best = { filters, last: raw, t: now, found: now };
        this.tracks.push(best);
      }
      used.add(best);
      const dt = Math.max(0.001, now - best.t);
      const flat = flatten(raw), sm: Record<string, number> = {};
      for (const [k] of FIELDS) sm[k] = best.filters[k].filter(flat[k], dt);
      best.last = unflatten(sm, 1);
      best.t = now; best.found = now;
      out.push(best.last);
    }
    this.tracks = this.tracks.filter((tr) => used.has(tr) || now - tr.found < this.grace);
    for (const tr of this.tracks) if (!used.has(tr)) out.push({ ...tr.last, seen: clamp(1 - (now - tr.found) / this.grace, 0, 1) });
    return out.sort((p, q) => p.cx - q.cx);
  }
}

/** A made-up face with the proportions of Google's average face (measured on its published model): the lens pictures in the list are drawn on it, and the tests use it. cx / cy / u are for the caller to set. */
export const MANNEQUIN: FaceFrame = {
  cx: 0, cy: 0, u: 1, roll: 0, yaw: 0, top: -0.89, chin: 1.9, hair: -1.2, skull: -1.53, halfW: 1.21, temple: 1.22, brow: -0.39, eyeW: 0.41,
  nose: { x: 0, y: 0.59 }, base: 0.75, lipTop: 0.95, lipUp: 1.05, lipLow: 1.29, mouth: { x: 0, y: 1.17 }, mouthW: 0.78,
  mouthOpen: 0.55, smile: 0.6, browUp: 0, blinkL: 0, blinkR: 0, seen: 1
};
