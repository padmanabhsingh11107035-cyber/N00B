// The premium frames of the Sticker Booth. A frame is a picture-card: a coloured border, a window for the photo, and the NOOB wordmark on the bottom strip, at the right.
// Some frames move a little (a holographic shine, drifting petals, a glowing neon line); like the stickers they repeat after LOOP seconds.
import { FONT_LATIN, LOOP, TAU, lin, pPoly, pRR, pSpark, rad, rnd } from './kit.ts';
import type { Ctx } from './kit.ts';

export type FrameId = 'pearl' | 'noir' | 'holo' | 'sakura' | 'neon';

export interface FrameDef {
  id: FrameId;
  name: string;
  /** three colours that show the frame on its button */
  swatch: readonly [string, string, string];
  /** side and top border, and bottom strip, as fractions of the picture's width */
  m: number;
  b: number;
  /** corner radius of the photo window, as a fraction of the width */
  r: number;
}

export const FRAMES: ReadonlyArray<FrameDef> = [
  { id: 'pearl', name: 'Pearl', swatch: ['#fffdf8', '#efe7d8', '#cfc4ad'], m: 0.055, b: 0.17, r: 0.012 },
  { id: 'noir', name: 'Noir Gold', swatch: ['#15151b', '#c9a24b', '#f6e7b4'], m: 0.07, b: 0.17, r: 0.006 },
  { id: 'holo', name: 'Photocard', swatch: ['#ffb3e6', '#a5f3fc', '#c7b9ff'], m: 0.05, b: 0.15, r: 0.04 },
  { id: 'sakura', name: 'Sakura', swatch: ['#ffe3ee', '#ffc0d6', '#ff8fb1'], m: 0.06, b: 0.16, r: 0.03 },
  { id: 'neon', name: 'Neon', swatch: ['#0b0716', '#b26bff', '#ff4fb0'], m: 0.06, b: 0.16, r: 0.02 }
];
export const frameById = (id: string): FrameDef => FRAMES.find((f) => f.id === id) || FRAMES[0];

export interface Win { x: number; y: number; w: number; h: number; r: number }
/** where the photo goes inside a picture of W x H */
export function windowOf(f: FrameDef, W: number, H: number): Win {
  const m = f.m * W;
  return { x: m, y: m, w: W - 2 * m, h: H - m - f.b * W, r: f.r * W };
}

// ------------------------------------------------------------------ the wordmark
export const WORDMARK_RATIO = 640 / 207;
/** The NOOB wordmark image (white letters on see-through): it is tinted to the colour of each frame. `null` = it could not be loaded, plain letters are drawn instead. */
export type Logo = CanvasImageSource & { width: number; height: number };
export type CanvasFactory = (w: number, h: number) => HTMLCanvasElement;
let makeCanvas: CanvasFactory = (w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; };
/** (tests give their own canvas maker) */
export function setCanvasFactory(f: CanvasFactory): void { makeCanvas = f; }
export { makeCanvas as newCanvas };

// The wordmark is tinted on one small scratch canvas that is drawn again for every picture (never kept): a phone may throw away the contents of a canvas it is not looking at, and a
// kept copy would then stay empty for good.
let scratch: HTMLCanvasElement | null = null;
function tinted(logo: Logo, w: number, h: number, paint: (c: Ctx) => void): HTMLCanvasElement {
  if (!scratch) scratch = makeCanvas(w, h);
  if (scratch.width !== w || scratch.height !== h) { scratch.width = w; scratch.height = h; }
  const c = scratch.getContext('2d') as Ctx;
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, w, h);
  c.drawImage(logo as CanvasImageSource, 0, 0, w, h);
  c.globalCompositeOperation = 'source-in';
  paint(c);
  c.globalCompositeOperation = 'source-over';
  return scratch;
}

/** the wordmark's place: bottom strip, right side */
export function wordmarkBox(f: FrameDef, W: number, H: number, win: Win): { x: number; y: number; w: number; h: number } {
  const w = Math.round(W * 0.165), h = Math.round(w / WORDMARK_RATIO);
  const strip = H - (win.y + win.h);
  return { x: Math.round(W - f.m * W - w), y: Math.round(win.y + win.h + (strip - h) / 2), w, h };
}

export function drawTag(c: Ctx, f: FrameDef, W: number, H: number, win: Win, logo: Logo | null): void {
  const b = wordmarkBox(f, W, H, win);
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  const gold = (cc: Ctx) => { cc.fillStyle = lin(cc, 0, 0, b.w, b.h, [[0, '#fff1b8'], [0.5, '#d9a93c'], [1, '#8a6a22']]); cc.fillRect(0, 0, b.w, b.h); };
  const solid = (col: string) => (cc: Ctx) => { cc.fillStyle = col; cc.fillRect(0, 0, b.w, b.h); };
  const ink: Record<FrameId, { paint: (cc: Ctx) => void; glow?: string; text: string }> = {
    pearl: { paint: solid('#2b2622'), text: '#2b2622' },
    noir: { paint: gold, text: '#d9a93c' },
    holo: { paint: solid('#ffffff'), glow: 'rgba(90,40,140,.55)', text: '#fff' },
    sakura: { paint: solid('#c2185b'), text: '#c2185b' },
    neon: { paint: solid('#ffffff'), glow: '#ff4fb0', text: '#fff' }
  };
  const t = ink[f.id];
  if (t.glow) { c.shadowColor = t.glow; c.shadowBlur = W * 0.018; }
  if (logo) c.drawImage(tinted(logo, b.w, b.h, t.paint), b.x, b.y, b.w, b.h);
  else {
    c.fillStyle = t.text; c.font = `900 ${Math.round(b.h * 0.95)}px system-ui, -apple-system, Arial, sans-serif`;
    c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText('NOOB', b.x + b.w, b.y + b.h / 2);
  }
  c.restore();
}

/** a small line of words on the bottom strip, at the left (the wordmark is at the right): it only shows when a buddy is in the picture */
const CAPTION_INK: Record<FrameId, string> = { pearl: 'rgba(43,38,34,.62)', noir: 'rgba(217,169,60,.92)', holo: 'rgba(255,255,255,.95)', sakura: 'rgba(194,24,91,.8)', neon: 'rgba(255,255,255,.95)' };
export function drawCaption(c: Ctx, f: FrameDef, W: number, H: number, win: Win, text: string): void {
  const strip = H - (win.y + win.h);
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  if (f.id === 'holo') { c.shadowColor = 'rgba(90,40,140,.55)'; c.shadowBlur = W * 0.012; }
  if (f.id === 'neon') { c.shadowColor = '#ff4fb0'; c.shadowBlur = W * 0.014; }
  c.font = `800 ${Math.round(strip * 0.2)}px ${FONT_LATIN}`;
  c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = CAPTION_INK[f.id];
  c.fillText(text, win.x, win.y + win.h + strip / 2);
  c.restore();
}

// ------------------------------------------------------------------ the frames
function winPath(c: Ctx, w: Win, grow = 0): void { pRR(c, w.x - grow, w.y - grow, w.w + grow * 2, w.h + grow * 2, w.r + grow); }

/** a shadow cast from the frame onto the photo, so the photo looks set in */
function inset(c: Ctx, w: Win, W: number, blur: number, alpha: number): void {
  c.save();
  winPath(c, w); c.clip();
  c.shadowColor = `rgba(0,0,0,${alpha})`; c.shadowBlur = blur * W; c.lineWidth = 0.07 * W; c.strokeStyle = '#000';
  winPath(c, w, 0.035 * W); c.stroke();
  c.restore();
}

const petal = (c: Ctx, s: number): void => {
  c.beginPath(); c.moveTo(0, 18 * s); c.bezierCurveTo(-17 * s, 8 * s, -15 * s, -12 * s, -3.5 * s, -16 * s); c.lineTo(0, -10 * s); c.lineTo(3.5 * s, -16 * s); c.bezierCurveTo(15 * s, -12 * s, 17 * s, 8 * s, 0, 18 * s); c.closePath();
};

/** behind the photo: the colour of the frame */
export function drawFrameBack(c: Ctx, f: FrameDef, W: number, H: number, t: number, win: Win): void {
  const ph = (t / LOOP) * TAU;
  c.save();
  if (f.id === 'pearl') {
    c.fillStyle = lin(c, 0, 0, 0, H, [[0, '#fffdf8'], [1, '#ece4d4']]); c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(120,100,70,.25)'; c.lineWidth = W * 0.003; c.strokeRect(W * 0.012, W * 0.012, W - W * 0.024, H - W * 0.024);
    c.shadowColor = 'rgba(70,50,20,.35)'; c.shadowBlur = W * 0.02; c.shadowOffsetY = W * 0.006; winPath(c, win); c.fillStyle = '#d8cfbd'; c.fill();
  } else if (f.id === 'noir') {
    c.fillStyle = rad(c, W / 2, H * 0.4, 0, Math.max(W, H) * 0.8, [[0, '#1d1d26'], [1, '#07070a']]); c.fillRect(0, 0, W, H);
    const gold = lin(c, 0, 0, W, H, [[0, '#f6e7b4'], [0.5, '#c9a24b'], [1, '#8a6a22']]);
    c.strokeStyle = gold; c.lineWidth = W * 0.004; c.strokeRect(W * 0.017, W * 0.017, W - W * 0.034, H - W * 0.034);
    c.lineWidth = W * 0.0017; c.strokeRect(W * 0.03, W * 0.03, W - W * 0.06, H - W * 0.06);
    c.fillStyle = gold;
    for (const [x, y] of [[0.017 * W, 0.017 * W], [W - 0.017 * W, 0.017 * W], [0.017 * W, H - 0.017 * W], [W - 0.017 * W, H - 0.017 * W]] as const) {
      const d = W * 0.011; pPoly(c, [[x, y - d], [x + d, y], [x, y + d], [x - d, y]]); c.fill();
    }
  } else if (f.id === 'holo') {
    const a = ph, dx = Math.cos(a) * W * 0.8, dy = Math.sin(a) * H * 0.8;
    c.fillStyle = lin(c, W / 2 - dx, H / 2 - dy, W / 2 + dx, H / 2 + dy, [[0, '#ffb3e6'], [0.2, '#c7b9ff'], [0.4, '#a5f3fc'], [0.6, '#fef3c7'], [0.8, '#ffc2e2'], [1, '#ffb3e6']]); c.fillRect(0, 0, W, H);
    const x = -W * 0.5 + (t / LOOP) * W * 2;
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x + W * 0.25, 0); c.lineTo(x - W * 0.15, H); c.lineTo(x - W * 0.4, H); c.closePath(); c.fillStyle = 'rgba(255,255,255,.32)'; c.fill();
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = W * 0.006; pRR(c, W * 0.012, W * 0.012, W - W * 0.024, H - W * 0.024, W * 0.045); c.stroke();
  } else if (f.id === 'sakura') {
    c.fillStyle = lin(c, 0, 0, W, H, [[0, '#ffeaf2'], [1, '#ffbfd5']]); c.fillRect(0, 0, W, H);
    for (let i = 0; i < 16; i++) {
      const edge = i % 4, u = rnd(i, 1), drift = Math.sin(ph + i) * W * 0.004;
      const x = edge === 0 ? u * W : edge === 1 ? W - rnd(i, 2) * f.m * W * 0.9 : edge === 2 ? u * W : rnd(i, 2) * f.m * W * 0.9;
      const y = edge === 0 ? rnd(i, 2) * f.m * W * 0.9 : edge === 1 ? u * H : edge === 2 ? H - rnd(i, 3) * (f.b * W) * 0.9 : u * H;
      c.save(); c.translate(x + drift, y + drift); c.rotate(rnd(i, 4) * TAU + Math.sin(ph + i) * 0.2); petal(c, W * 0.0017 * (0.8 + rnd(i, 5)));
      c.fillStyle = i % 3 ? '#ffd3e2' : '#ff9ebd'; c.fill(); c.strokeStyle = 'rgba(214,69,122,.5)'; c.lineWidth = W * 0.0014; c.stroke();
      c.restore();
    }
    c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = W * 0.005; winPath(c, win, W * 0.006); c.stroke();
  } else {
    c.fillStyle = '#07050f'; c.fillRect(0, 0, W, H);
    const g = 0.75 + 0.25 * Math.sin(ph * 2);
    c.lineJoin = 'round';
    c.shadowColor = '#b26bff'; c.shadowBlur = W * 0.03 * g; c.strokeStyle = '#c490ff'; c.lineWidth = W * 0.006; c.strokeRect(W * 0.02, W * 0.02, W - W * 0.04, H - W * 0.04);
    c.shadowColor = '#ff4fb0'; c.shadowBlur = W * 0.025 * g; c.strokeStyle = '#ff8ccc'; c.lineWidth = W * 0.004; c.strokeRect(W * 0.036, W * 0.036, W - W * 0.072, H - W * 0.072);
  }
  c.restore();
}

/** over the photo's edge: the inner border, the shadow that sets the photo in, and the little extras */
export function drawFrameFront(c: Ctx, f: FrameDef, W: number, H: number, t: number, win: Win): void {
  const ph = (t / LOOP) * TAU;
  c.save();
  if (f.id === 'pearl') {
    inset(c, win, W, 0.02, 0.4);
    c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = W * 0.003; winPath(c, win, -W * 0.002); c.stroke();
  } else if (f.id === 'noir') {
    inset(c, win, W, 0.016, 0.55);
    c.strokeStyle = lin(c, 0, win.y, W, win.y + win.h, [[0, '#f6e7b4'], [0.5, '#c9a24b'], [1, '#8a6a22']]); c.lineWidth = W * 0.004; winPath(c, win, W * 0.004); c.stroke();
  } else if (f.id === 'holo') {
    inset(c, win, W, 0.014, 0.35);
    c.strokeStyle = '#fff'; c.lineWidth = W * 0.012; winPath(c, win, W * 0.005); c.stroke();
    for (const [x, y, o] of [[win.x + win.w - W * 0.03, win.y + W * 0.04, 0], [win.x + W * 0.04, win.y + win.h - W * 0.04, 0.5]] as const) {
      const s = 0.4 + 0.6 * Math.abs(Math.sin(ph / 2 + o * Math.PI));
      pSpark(c, x, y, W * 0.032 * s, 0); c.fillStyle = '#fff'; c.shadowColor = '#fff'; c.shadowBlur = W * 0.01; c.fill();
    }
  } else if (f.id === 'sakura') {
    inset(c, win, W, 0.012, 0.3);
    c.strokeStyle = '#fff'; c.lineWidth = W * 0.008; winPath(c, win, W * 0.002); c.stroke();
    for (const [x, y, rot, o] of [[win.x + win.w * 0.04, win.y + win.h * 0.03, 0.6, 0], [win.x + win.w * 0.97, win.y + win.h * 0.97, 3.7, 0.5]] as const) {
      c.save(); c.translate(x + Math.sin(ph + o * 6) * W * 0.004, y); c.rotate(rot + Math.sin(ph + o * 6) * 0.15); petal(c, W * 0.0019);
      c.fillStyle = '#ffd3e2'; c.fill(); c.strokeStyle = 'rgba(214,69,122,.6)'; c.lineWidth = W * 0.002; c.stroke(); c.restore();
    }
  } else {
    inset(c, win, W, 0.016, 0.6);
    const g = 0.75 + 0.25 * Math.sin(ph * 2);
    c.shadowColor = '#ff4fb0'; c.shadowBlur = W * 0.022 * g; c.strokeStyle = '#ffd0ec'; c.lineWidth = W * 0.004; winPath(c, win, W * 0.004); c.stroke();
    c.shadowColor = '#b26bff'; c.shadowBlur = W * 0.03 * g; c.strokeStyle = '#c490ff'; c.lineWidth = W * 0.002; winPath(c, win, W * 0.012); c.stroke();
  }
  c.restore();
}
