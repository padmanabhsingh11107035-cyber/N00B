// The plain maths of NOOB's own face check (no camera, no model in here, so it can be tested on its own).
// A face is turned into 128 numbers (a "descriptor") by the model in public/face/. Two photos of the same person give descriptors that are close together.

export type Descriptor = number[];
export type Pt = { x: number; y: number };

/** How far apart two descriptors are (0 = the same face). */
export function distance(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length || a.length === 0) return Infinity;
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

/** The closest distance between a face and the faces saved for the owner. */
export function bestDistance(d: ArrayLike<number>, templates: Descriptor[]): number {
  let best = Infinity;
  for (const t of templates) best = Math.min(best, distance(d, t));
  return best;
}

// 0.6 is the usual "same person" line of this model; NOOB uses a stricter one because it guards an account.
export const MATCH_THRESHOLD = 0.46;
// The saved faces of one enrolment must look alike (the same person, not two people or a shaky frame).
export const ENROLL_SPREAD_MAX = 0.42;
export const ENROLL_SAMPLES = 5;
export const VERIFY_MATCHES_NEEDED = 3;

export const isMatch = (d: ArrayLike<number>, templates: Descriptor[], threshold = MATCH_THRESHOLD): boolean => templates.length > 0 && bestDistance(d, templates) <= threshold;

/** True when every new sample is close enough to every other one. */
export function samplesAgree(samples: Descriptor[], max = ENROLL_SPREAD_MAX): boolean {
  if (samples.length < 2) return false;
  for (let i = 0; i < samples.length; i++) for (let j = i + 1; j < samples.length; j++) if (distance(samples[i], samples[j]) > max) return false;
  return true;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Eye aspect ratio from the six points of one eye (about 0.3 open, below 0.2 closed). */
export function eyeAspect(p: Pt[]): number {
  if (p.length !== 6) return 0;
  const w = dist(p[0], p[3]);
  return w === 0 ? 0 : (dist(p[1], p[5]) + dist(p[2], p[4])) / (2 * w);
}

/** Both eyes from the 68 points of a face (points 36-41 and 42-47). */
export function eyesAspect(points: Pt[]): number {
  if (points.length < 48) return 0;
  return (eyeAspect(points.slice(36, 42)) + eyeAspect(points.slice(42, 48))) / 2;
}

/** A blink is "eyes open, then closed, then open again": a photo held up to the camera never does that. */
export class BlinkDetector {
  private seenOpen = false;
  private seenClosed = false;
  blinked = false;
  private readonly closed: number;
  private readonly open: number;
  constructor(closed = 0.2, open = 0.255) { this.closed = closed; this.open = open; }
  push(ear: number): boolean {
    if (this.blinked || ear <= 0) return this.blinked;
    if (ear >= this.open) { if (this.seenClosed && this.seenOpen) this.blinked = true; this.seenOpen = true; }
    else if (ear <= this.closed && this.seenOpen) this.seenClosed = true;
    return this.blinked;
  }
}

/** Counts matching frames in a row; a miss starts the count again. */
export class MatchRun {
  count = 0;
  private readonly needed: number;
  constructor(needed = VERIFY_MATCHES_NEEDED) { this.needed = needed; }
  push(matched: boolean): boolean { this.count = matched ? this.count + 1 : 0; return this.count >= this.needed; }
}

const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
export const roundDescriptor = (d: ArrayLike<number>): Descriptor => Array.from(d, r4);
export const isDescriptor = (d: unknown): d is Descriptor => Array.isArray(d) && d.length === 128 && d.every((n) => typeof n === 'number' && Number.isFinite(n));
