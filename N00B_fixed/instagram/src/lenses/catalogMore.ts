import type { FaceFrame } from './types.ts';
import { clamp } from './faceMath.ts';
import { TAU, bloom, hash, heart, lin, magnify, rad, rr, scratch, spark, starPath, vignette } from './draw.ts';
import type { Ctx } from './draw.ts';
import type { LensDef } from './catalog.ts';

// More lenses (Snapchat-style): animals, funny faces, beauty, party and seasons, and more looks. Drawn from scratch with the canvas exactly like the first lenses (see catalog.ts and draw.ts):
// around a face in "eye distances", 0,0 between the eyes, +y down; moving things use the time `t` only. No pictures, no logos, no real people. A few of them (bald, tiny face, long chin, face swap,
// big head ...) change the camera picture itself, so they work in pixels in `base` and need to find a face first.

const sides = (c: Ctx, fn: (s: 1 | -1) => void): void => { for (const s of [-1, 1] as const) { c.save(); c.scale(s, 1); fn(s); c.restore(); } };
const wob = (t: number, speed: number, amount: number, phase = 0): number => Math.sin(t * speed + phase) * amount;
const tint = (color: string, mode: GlobalCompositeOperation = 'soft-light') => (c: Ctx, w: number, h: number): void => {
  c.save(); c.globalCompositeOperation = mode; c.fillStyle = color; c.fillRect(0, 0, w, h); c.restore();
};
const eachFace = (faces: FaceFrame[], fn: (f: FaceFrame) => void): void => { for (const f of faces) if (f.seen >= 0.05) fn(f); };
/** a point of the face (x, y in eye distances) as a pixel of the picture */
const px = (f: FaceFrame, x: number, y: number): [number, number] => {
  const co = Math.cos(f.roll), si = Math.sin(f.roll);
  return [f.cx + (x * co - y * si) * f.u, f.cy + (x * si + y * co) * f.u];
};

// ---------------------------------------------------------------- the colour of this person's skin (one look at the forehead), for the lenses that cover part of the head
let skinCss = 'rgb(226,171,130)';
const lookAtSkin = (c: Ctx, faces: FaceFrame[]): void => {
  const f = faces.find((x) => x.seen > 0.3);
  if (!f) return;
  try {
    const [x, y] = px(f, 0, (f.brow + f.hair) / 2 + 0.05);
    const s = 4, w = c.canvas.width, h = c.canvas.height;
    const sx = Math.round(clamp(x - s, 0, w - 2 * s)), sy = Math.round(clamp(y - s, 0, h - 2 * s));
    const d = c.getImageData(sx, sy, 2 * s, 2 * s).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i + 3 < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    if (n) skinCss = `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
  } catch { /* a picture that can not be read: the last colour stays */ }
};
const shade = (css: string, k: number): string => {
  const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(css);
  if (!m) return css;
  const f = (v: string): number => Math.round(clamp(Number(v) * k, 0, 255));
  return `rgb(${f(m[1])},${f(m[2])},${f(m[3])})`;
};

// ---------------------------------------------------------------- the face standing upright on a spare canvas (for the lenses that cut the picture up)
const upright = (c: Ctx, f: FaceFrame, rU: number): { sc: Ctx; d: number } => {
  const d = Math.max(16, Math.ceil(rU * 2 * f.u));
  const sc = scratch(3, d, d);
  sc.translate(d / 2, d / 2); sc.rotate(-f.roll); sc.drawImage(c.canvas, -f.cx, -f.cy);
  sc.setTransform(1, 0, 0, 1, 0, 0);
  return { sc, d };
};

// ---------------------------------------------------------------- shared little drawings
/** a rounded rectangle ADDED to the current path (rr() in draw.ts starts a new path) */
const subRR = (c: Ctx, x: number, y: number, w: number, h: number, r: number): void => {
  const k = Math.min(r, w / 2, h / 2);
  c.moveTo(x + k, y); c.arcTo(x + w, y, x + w, y + h, k); c.arcTo(x + w, y + h, x, y + h, k); c.arcTo(x, y + h, x, y, k); c.arcTo(x, y, x + w, y, k); c.closePath();
};
const dot = (c: Ctx, x: number, y: number, r: number, color: string): void => { c.fillStyle = color; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); };
const eye = (c: Ctx, x: number, y: number, open: number, color = '#2a1d14', r = 0.14): void => {
  c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x, y, r * 1.6, Math.max(0.012, r * 1.15 * open), 0, 0, TAU); c.fill();
  if (open > 0.15) { dot(c, x, y, r * 0.8 * Math.min(1, open + 0.2), color); dot(c, x - r * 0.25, y - r * 0.3, r * 0.26, '#fff'); }
  c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 0.025; c.beginPath(); c.ellipse(x, y, r * 1.6, Math.max(0.012, r * 1.15 * open), 0, 0, TAU); c.stroke();
};
/** a cartoon face (eyes that blink, brows, a mouth that opens) for the lenses that cover the whole head with something else */
const cartoonFace = (c: Ctx, f: FaceFrame, ink = '#2a1d14'): void => {
  eye(c, -0.5, 0, 1 - f.blinkL, ink);
  eye(c, 0.5, 0, 1 - f.blinkR, ink);
  c.strokeStyle = ink; c.lineWidth = 0.06; c.lineCap = 'round';
  for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 0.8, f.brow - f.browUp * 0.08 + 0.02); c.quadraticCurveTo(s * 0.5, f.brow - 0.1 - f.browUp * 0.1, s * 0.22, f.brow + 0.02); c.stroke(); }
  const open = Math.max(0.02, f.lipLow - f.lipUp);
  c.fillStyle = '#6b1d1d'; c.beginPath(); c.ellipse(f.mouth.x, f.mouth.y, f.mouthW * 0.42, open * 0.7 + 0.05 + f.smile * 0.02, 0, 0, TAU); c.fill();
  c.strokeStyle = ink; c.lineWidth = 0.035; c.stroke();
};
const headBlob = (c: Ctx, f: FaceFrame, t: number, bumps: number, wobble: number): void => {
  const mid = (f.skull + f.chin) / 2 + 0.05, rx = f.halfW * 1.18, ry = (f.chin - f.skull) / 2 + 0.2;
  c.beginPath();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * TAU, k = 1 + wobble * Math.sin(a * bumps + 1.3) + 0.02 * Math.sin(t * 2 + i);
    const x = Math.cos(a) * rx * k, y = mid + Math.sin(a) * ry * k;
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.closePath();
};
/** run `fn` with the face's head (an oval) as the clip */
const clipHead = (c: Ctx, f: FaceFrame, grow: number, fn: () => void): void => {
  const mid = (f.skull + f.chin) / 2 + 0.05;
  c.save(); c.beginPath(); c.ellipse(0, mid, f.halfW * grow, (f.chin - f.skull) / 2 * grow + 0.05, 0, 0, TAU); c.clip(); fn(); c.restore();
};

// ================================================================ ANIMALS
const roundEars = (c: Ctx, f: FaceFrame, outer: string, inner: string, r = 0.46): void => {
  sides(c, () => {
    const x = f.halfW * 0.86, y = f.hair + 0.3;
    dot(c, x, y, r, outer); c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 0.03; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
    dot(c, x, y + 0.02, r * 0.62, inner);
  });
};
const pointEars = (c: Ctx, f: FaceFrame, t: number, outer: string, inner: string, tip?: string): void => {
  sides(c, (s) => {
    c.save(); c.translate(f.halfW * 0.6, f.hair + 0.25); c.rotate(0.14 + wob(t, 2.4, 0.015, s));
    c.fillStyle = lin(c, 0, -0.9, 0, 0.1, [[0, tip || outer], [0.35, outer], [1, outer]]);
    c.beginPath(); c.moveTo(-0.38, 0.14); c.quadraticCurveTo(-0.28, -0.5, 0.2, -0.95); c.quadraticCurveTo(0.58, -0.5, 0.66, 0.06); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 0.035; c.lineJoin = 'round'; c.stroke();
    c.fillStyle = inner; c.beginPath(); c.moveTo(-0.18, 0.05); c.quadraticCurveTo(-0.12, -0.3, 0.2, -0.62); c.quadraticCurveTo(0.4, -0.34, 0.45, 0); c.closePath(); c.fill();
    c.restore();
  });
};
const noseBlob = (c: Ctx, f: FaceFrame, w: number, h: number, color: string): void => {
  const n = f.nose;
  c.fillStyle = color; c.beginPath(); c.ellipse(n.x, n.y - 0.02, w, h, 0, 0, TAU); c.fill();
  c.fillStyle = 'rgba(255,255,255,.5)'; c.beginPath(); c.ellipse(n.x - w * 0.35, n.y - 0.02 - h * 0.35, w * 0.28, h * 0.2, -0.3, 0, TAU); c.fill();
};
const whiskers = (c: Ctx, f: FaceFrame, color = '#fff'): void => {
  sides(c, () => {
    c.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const y = f.base - 0.1 + i * 0.14, a = (i - 1) * 0.2;
      for (const [w, col] of [[0.06, 'rgba(30,30,40,.5)'], [0.03, color]] as const) { c.lineWidth = w; c.strokeStyle = col; c.beginPath(); c.moveTo(0.42, y); c.quadraticCurveTo(1.0, y + a * 0.4 - 0.03, 1.7, y + a); c.stroke(); }
    }
  });
};
const tongue = (c: Ctx, f: FaceFrame): void => {
  const open = clamp((f.mouthOpen - 0.3) / 0.45, 0, 1);
  if (open <= 0) return;
  const m = f.mouth, y0 = f.lipLow - 0.04, len = 0.22 + 0.4 * open;
  c.fillStyle = lin(c, 0, y0, 0, y0 + len, [[0, '#ff8fb1'], [1, '#e24a7d']]);
  c.beginPath(); c.moveTo(m.x - 0.17, y0); c.quadraticCurveTo(m.x - 0.2, y0 + len, m.x, y0 + len + 0.05); c.quadraticCurveTo(m.x + 0.2, y0 + len, m.x + 0.17, y0); c.closePath(); c.fill();
};

const dalmatian = (c: Ctx, f: FaceFrame, t: number): void => {
  sides(c, (s) => {
    c.save(); c.translate(f.halfW * 0.7, f.hair + 0.28); c.rotate(0.12 + wob(t, 3, 0.04, s > 0 ? 0 : 1.7));
    c.fillStyle = '#fbfbfb'; c.strokeStyle = '#2b2b2b'; c.lineWidth = 0.035;
    c.beginPath(); c.moveTo(-0.12, -0.05); c.bezierCurveTo(0.35, -0.2, 0.75, 0.15, 0.78, 0.7); c.bezierCurveTo(0.8, 1.15, 0.38, 1.22, 0.24, 0.85); c.bezierCurveTo(0.14, 0.58, -0.02, 0.35, -0.12, -0.05); c.closePath(); c.fill(); c.stroke();
    c.save(); c.clip();
    for (let i = 0; i < 6; i++) dot(c, 0.1 + hash(i + 3) * 0.6, 0.1 + hash(i + 9) * 0.95, 0.07 + hash(i + 1) * 0.08, '#1d1d20');
    c.restore(); c.restore();
  });
  for (let i = 0; i < 7; i++) { const s = i % 2 ? 1 : -1; dot(c, s * (0.45 + hash(i + 20) * 0.7), 0.3 + hash(i + 31) * 0.7, 0.035 + hash(i) * 0.03, 'rgba(25,25,28,.85)'); }
  tongue(c, f); noseBlob(c, f, 0.22, 0.15, '#141418');
};
const deer = (c: Ctx, f: FaceFrame, t: number): void => {
  sides(c, (s) => {
    c.save(); c.translate(f.halfW * 0.5, f.hair + 0.2); c.rotate(wob(t, 1.5, 0.01, s));
    c.strokeStyle = '#8a5a34'; c.lineCap = 'round'; c.lineJoin = 'round';
    const branch = (x0: number, y0: number, x1: number, y1: number, w: number): void => { c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); };
    c.lineWidth = 0.1; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(0.35, -0.6, 0.28, -1.35); c.stroke();
    branch(0.1, -0.4, 0.62, -0.62, 0.075); branch(0.24, -0.82, 0.7, -1.12, 0.065); branch(0.28, -1.35, 0.1, -1.7, 0.055); branch(0.3, -1.1, 0.62, -1.5, 0.05);
    c.strokeStyle = '#b98556'; c.lineWidth = 0.025; c.beginPath(); c.moveTo(-0.02, -0.05); c.quadraticCurveTo(0.31, -0.6, 0.25, -1.3); c.stroke();
    c.restore();
    c.save(); c.translate(f.halfW * 0.78, f.hair + 0.5); c.rotate(0.9);   // little ears
    c.fillStyle = '#c99a6a'; c.beginPath(); c.ellipse(0.2, 0, 0.3, 0.14, 0, 0, TAU); c.fill(); c.fillStyle = '#f2c6b4'; c.beginPath(); c.ellipse(0.2, 0, 0.18, 0.07, 0, 0, TAU); c.fill(); c.restore();
  });
  for (let i = 0; i < 9; i++) { const s = i % 2 ? 1 : -1; dot(c, s * (0.35 + hash(i + 4) * 0.8), -0.2 + hash(i + 14) * 0.15 - 0.45 + hash(i + 24) * 1.2, 0.04 + hash(i) * 0.03, 'rgba(255,255,255,.8)'); }
  noseBlob(c, f, 0.17, 0.12, '#3a2415');
};
const honeybee = (c: Ctx, f: FaceFrame, t: number): void => {
  sides(c, (s) => {   // wings behind the head, buzzing
    c.save(); c.translate(f.halfW * 0.95, f.hair + 0.9); c.rotate(0.5 + wob(t, 40, 0.1, s));
    c.fillStyle = 'rgba(205,235,255,.55)'; c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 0.03;
    c.beginPath(); c.ellipse(0.5, -0.35, 0.65, 0.32, -0.5, 0, TAU); c.fill(); c.stroke(); c.restore();
    c.save(); c.translate(f.halfW * 0.35, f.hair + 0.12);   // antennae
    c.strokeStyle = '#1b1b1f'; c.lineWidth = 0.045; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(0.2 + wob(t, 5, 0.05, s), -0.5, 0.4, -0.85); c.stroke();
    dot(c, 0.4, -0.88, 0.1, '#1b1b1f'); c.restore();
  });
  clipHead(c, f, 1.0, () => {   // stripes across the forehead and the cheeks
    for (let i = 0; i < 3; i++) { c.fillStyle = i % 2 ? 'rgba(255,200,30,.55)' : 'rgba(25,25,28,.6)'; c.fillRect(-2, f.skull + 0.15 + i * 0.22, 4, 0.14); }
  });
  noseBlob(c, f, 0.12, 0.09, '#1b1b1f');
};
const koala = (c: Ctx, f: FaceFrame): void => {
  roundEars(c, f, '#8e949c', '#e9e6df', 0.5);
  const n = f.nose;
  c.fillStyle = '#1f1f24'; c.beginPath(); c.ellipse(n.x, n.y - 0.05, 0.3, 0.38, 0, 0, TAU); c.fill();
  c.fillStyle = 'rgba(255,255,255,.4)'; c.beginPath(); c.ellipse(n.x - 0.1, n.y - 0.2, 0.09, 0.14, -0.3, 0, TAU); c.fill();
};
const tiger = (c: Ctx, f: FaceFrame, t: number): void => {
  pointEars(c, f, t, '#ff9a2e', '#fff4e0', '#ff9a2e');
  c.strokeStyle = 'rgba(30,18,10,.88)'; c.lineCap = 'round';
  const stripe = (x0: number, y0: number, x1: number, y1: number, w: number): void => { c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 - 0.05, x1, y1); c.stroke(); };
  sides(c, () => {
    stripe(0.35, f.brow - 0.25, 0.5, f.hair + 0.2, 0.07); stripe(0.18, f.brow - 0.3, 0.2, f.hair + 0.15, 0.06);
    stripe(f.halfW * 0.9, 0.35, f.halfW * 0.55, 0.45, 0.08); stripe(f.halfW * 0.92, 0.7, f.halfW * 0.5, 0.75, 0.07); stripe(f.halfW * 0.85, 1.05, f.halfW * 0.45, 1.0, 0.06);
  });
  noseBlob(c, f, 0.16, 0.11, '#ff7fa3'); whiskers(c, f);
};
const panda = (c: Ctx, f: FaceFrame): void => {
  roundEars(c, f, '#1b1b1f', '#2e2e34', 0.42);
  sides(c, (s) => { c.save(); c.translate(0.5, 0.02); c.rotate(0.25 * s); c.fillStyle = 'rgba(20,20,24,.92)'; c.beginPath(); c.ellipse(0, 0, 0.36, 0.46, 0, 0, TAU); c.fill(); c.restore(); });
  eye(c, -0.5, 0, 1 - f.blinkL, '#111', 0.1); eye(c, 0.5, 0, 1 - f.blinkR, '#111', 0.1);
  noseBlob(c, f, 0.2, 0.13, '#17171a');
};
const fox = (c: Ctx, f: FaceFrame, t: number): void => {
  pointEars(c, f, t, '#f07a1c', '#2b1a12', '#fff1de');
  sides(c, () => { c.fillStyle = 'rgba(255,248,236,.95)'; c.beginPath(); c.moveTo(f.halfW * 0.95, 0.5); c.lineTo(f.halfW * 0.5, 0.95); c.lineTo(f.halfW * 0.98, 1.05); c.lineTo(f.halfW * 0.7, 0.75); c.closePath(); c.fill(); });
  noseBlob(c, f, 0.14, 0.1, '#17171a'); whiskers(c, f, '#fff');
};

// ================================================================ FUNNY FACES
const bald = (c: Ctx, _w: number, _h: number, faces: FaceFrame[]): void => { lookAtSkin(c, faces); };
const baldFace = (c: Ctx, f: FaceFrame): void => {
  const top = f.skull - 0.1, mid = (top + f.brow - 0.05) / 2, ry = (f.brow - 0.05 - top) / 2;
  c.save();
  c.shadowColor = skinCss; c.shadowBlur = f.u * 0.05 + 2;
  c.fillStyle = rad(c, -0.2, mid - ry * 0.4, 0.05, 0, mid, ry * 1.4, [[0, shade(skinCss, 1.05)], [0.7, skinCss], [1, shade(skinCss, 0.93)]]);
  c.beginPath(); c.ellipse(0, mid, f.temple * 1.1, ry + 0.06, 0, 0, TAU); c.fill();
  sides(c, () => { c.beginPath(); c.ellipse(f.temple * 0.92, 0.1, 0.17, 0.55, 0, 0, TAU); c.fill(); });   // the hair over the sides too
  c.restore();
  c.fillStyle = 'rgba(255,255,255,.16)'; c.beginPath(); c.ellipse(-0.25, top + 0.2, 0.4, 0.1, -0.3, 0, TAU); c.fill();   // a shine on the head
};
const beard = (c: Ctx, f: FaceFrame): void => {
  const jy = f.chin + 0.12, lw = f.halfW * 1.04, mw = f.mouthW * 0.55;
  c.save();
  c.fillStyle = lin(c, 0, 0.4, 0, jy + 0.2, [[0, '#2b1a10'], [1, '#150b06']]);
  c.beginPath();
  c.moveTo(-f.temple * 0.95, -0.15);
  c.bezierCurveTo(-lw * 1.05, 0.7, -lw * 0.85, jy - 0.3, -0.4, jy + 0.08);
  c.quadraticCurveTo(0, jy + 0.32, 0.4, jy + 0.08);
  c.bezierCurveTo(lw * 0.85, jy - 0.3, lw * 1.05, 0.7, f.temple * 0.95, -0.15);
  c.lineTo(lw * 0.82, 0.62);
  c.quadraticCurveTo(mw + 0.3, f.mouth.y - 0.12, mw, f.mouth.y - 0.02);   // round the corner of the mouth
  c.quadraticCurveTo(mw * 0.5, f.lipLow + 0.07, 0, f.lipLow + 0.07);    // under the lower lip: moves with the jaw
  c.quadraticCurveTo(-mw * 0.5, f.lipLow + 0.07, -mw, f.mouth.y - 0.02);
  c.quadraticCurveTo(-mw - 0.3, f.mouth.y - 0.12, -lw * 0.82, 0.62);
  c.closePath(); c.fill();
  c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 0.012;
  for (let i = 0; i < 22; i++) { const x = (hash(i) - 0.5) * lw * 1.5, y = 0.7 + hash(i + 50) * (jy - 0.6); c.beginPath(); c.moveTo(x, y); c.lineTo(x + (hash(i + 9) - 0.5) * 0.1, y + 0.16); c.stroke(); }
  c.restore();
  c.fillStyle = lin(c, 0, -0.1, 0, 0.2, [[0, '#2b1a10'], [1, '#150b06']]);   // the moustache
  c.save(); c.translate(f.nose.x, (f.base + f.lipTop) / 2 + 0.03); const k = clamp(f.mouthW / 0.78, 0.8, 1.4); c.scale(k, k);
  c.beginPath(); c.moveTo(0, -0.06); c.bezierCurveTo(-0.14, -0.14, -0.36, -0.12, -0.54, -0.02); c.bezierCurveTo(-0.66, 0.04, -0.76, 0, -0.8, -0.14); c.bezierCurveTo(-0.8, 0.14, -0.62, 0.24, -0.4, 0.2); c.bezierCurveTo(-0.22, 0.17, -0.08, 0.1, 0, 0.1);
  c.bezierCurveTo(0.08, 0.1, 0.22, 0.17, 0.4, 0.2); c.bezierCurveTo(0.62, 0.24, 0.8, 0.14, 0.8, -0.14); c.bezierCurveTo(0.76, 0, 0.66, 0.04, 0.54, -0.02); c.bezierCurveTo(0.36, -0.12, 0.14, -0.14, 0, -0.06); c.closePath(); c.fill(); c.restore();
};
const bigMouth = (c: Ctx, _w: number, _h: number, faces: FaceFrame[]): void => {
  eachFace(faces, (f) => { const [x, y] = px(f, f.mouth.x, f.mouth.y); magnify(c, x, y, f.u * 1.05, 1.9 + f.mouthOpen * 0.5); });
};
const bigHead = (c: Ctx, _w: number, _h: number, faces: FaceFrame[], t: number): void => {
  eachFace(faces, (f) => { const [x, y] = px(f, 0, 0.55); magnify(c, x, y, f.u * 2.9, 1.5 + wob(t, 3, 0.05)); });
};
const faceZoom = (c: Ctx, _w: number, _h: number, faces: FaceFrame[]): void => {
  eachFace(faces, (f) => { const [x, y] = px(f, 0, 0.5); const k = 1 + 1.3 * Math.max(f.mouthOpen, f.browUp); if (k > 1.04) magnify(c, x, y, f.u * 2.6, k); });
};
const popEyes = (c: Ctx, _w: number, _h: number, faces: FaceFrame[], t: number): void => {
  eachFace(faces, (f) => { for (const s of [-0.5, 0.5]) { const [x, y] = px(f, s, 0); magnify(c, x, y, f.u * Math.max(0.48, f.eyeW * 1.3), 2.2 + wob(t, 14, 0.12)); } });
};
const bigLips = (c: Ctx, _w: number, _h: number, faces: FaceFrame[]): void => {
  eachFace(faces, (f) => { const [x, y] = px(f, f.mouth.x, (f.lipUp + f.lipLow) / 2); magnify(c, x, y, f.mouthW * f.u * 0.95, 1.55); });
};
const bigLipsFace = (c: Ctx, f: FaceFrame): void => {
  c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(f.mouth.x - f.mouthW * 0.15, f.lipTop + 0.05, f.mouthW * 0.2, 0.035, 0, 0, TAU); c.fill();
};
const shookEyes = (c: Ctx, _w: number, _h: number, faces: FaceFrame[]): void => {
  eachFace(faces, (f) => { for (const s of [-0.5, 0.5]) { const [x, y] = px(f, s, 0); magnify(c, x, y, f.u * 0.55, 1.7); } });
};
const shookFace = (c: Ctx, f: FaceFrame, t: number): void => {
  const y = ((t * 0.9) % 1), x = f.halfW * 0.95;
  c.fillStyle = 'rgba(120,200,255,.85)'; c.beginPath(); c.moveTo(x, f.brow + y * 0.6); c.quadraticCurveTo(x + 0.14, f.brow + y * 0.6 + 0.22, x, f.brow + y * 0.6 + 0.28); c.quadraticCurveTo(x - 0.14, f.brow + y * 0.6 + 0.22, x, f.brow + y * 0.6); c.fill();
  c.strokeStyle = 'rgba(40,30,30,.7)'; c.lineWidth = 0.05; c.lineCap = 'round';
  for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 0.8, f.brow - 0.2); c.quadraticCurveTo(s * 0.5, f.brow - 0.3 + wob(t, 30, 0.01), s * 0.2, f.brow - 0.18); c.stroke(); }
};
const tinyFace = (c: Ctx, _w: number, _h: number, faces: FaceFrame[]): void => {
  lookAtSkin(c, faces);
  eachFace(faces, (f) => {
    const { sc, d } = upright(c, f, 2.4);
    const mid = (f.skull + f.chin) / 2 + 0.05, rx = f.halfW * 1.05, ry = (f.chin - f.skull) / 2;
    c.save(); c.translate(f.cx, f.cy); c.rotate(f.roll);
    c.fillStyle = rad(c, 0, f.brow, 0.1 * f.u, 0, mid * f.u, ry * 1.3 * f.u, [[0, shade(skinCss, 1.08)], [1, shade(skinCss, 0.94)]]);
    c.beginPath(); c.ellipse(0, mid * f.u, rx * f.u, (ry + 0.02) * f.u, 0, 0, TAU); c.fill();
    const k = 0.5, sw = rx * 2 * f.u, sh = (f.chin - f.skull) * f.u;
    c.save(); c.beginPath(); c.ellipse(0, (f.brow - 0.1) * f.u * 0.4 + (mid - f.brow * 0.4) * f.u * 0.3, rx * k * f.u, (sh * k) / 2, 0, 0, TAU); c.clip();
    c.drawImage(sc.canvas, d / 2 - rx * f.u, d / 2 + f.skull * f.u, sw, sh, -rx * k * f.u, (f.brow - 0.1) * f.u * 0.4 - (sh * k) / 2 + (mid - f.brow * 0.4) * f.u * 0.3, sw * k, sh * k);
    c.restore();
    c.restore();
  });
};
const longChin = (c: Ctx, _w: number, _h: number, faces: FaceFrame[], t: number): void => {
  eachFace(faces, (f) => {
    const { sc, d } = upright(c, f, 2.8);
    const rW = f.halfW * 1.15, y0 = f.base, y1 = f.chin + 0.3, k = 1.5 + wob(t, 3, 0.08);
    c.save(); c.translate(f.cx, f.cy); c.rotate(f.roll);
    rr(c, -rW * f.u, y0 * f.u, rW * 2 * f.u, (y1 - y0) * k * f.u, 0.4 * f.u); c.clip();
    c.drawImage(sc.canvas, d / 2 - rW * f.u, d / 2 + y0 * f.u, rW * 2 * f.u, (y1 - y0) * f.u, -rW * f.u, y0 * f.u, rW * 2 * f.u, (y1 - y0) * k * f.u);
    c.restore();
  });
};
const potato = (c: Ctx, f: FaceFrame, t: number): void => {
  headBlob(c, f, t, 5, 0.06);
  c.fillStyle = rad(c, -0.3, f.brow, 0.1, 0, 0.5, 2.4, [[0, '#cf9a5e'], [0.7, '#a8723a'], [1, '#7d5226']]); c.fill();
  c.strokeStyle = '#5c3b17'; c.lineWidth = 0.04; c.stroke();
  for (let i = 0; i < 12; i++) dot(c, (hash(i) - 0.5) * f.halfW * 1.8, f.skull + 0.3 + hash(i + 7) * (f.chin - f.skull - 0.5), 0.04 + hash(i + 2) * 0.04, 'rgba(70,42,16,.55)');
  cartoonFace(c, f, '#2a1608');
};
const strawberry = (c: Ctx, f: FaceFrame, t: number): void => {
  const mid = (f.skull + f.chin) / 2 + 0.1, rx = f.halfW * 1.2, ry = (f.chin - f.skull) / 2 + 0.2;
  c.fillStyle = rad(c, -0.3, f.brow, 0.1, 0, mid, ry * 1.4, [[0, '#ff5a6a'], [0.7, '#e0243b'], [1, '#a8132a']]);
  c.beginPath(); c.moveTo(-rx, f.skull + 0.5); c.bezierCurveTo(-rx * 1.1, f.skull - 0.2, rx * 1.1, f.skull - 0.2, rx, f.skull + 0.5); c.bezierCurveTo(rx * 1.05, mid + ry * 0.55, rx * 0.4, f.chin + 0.45, 0, f.chin + 0.5); c.bezierCurveTo(-rx * 0.4, f.chin + 0.45, -rx * 1.05, mid + ry * 0.55, -rx, f.skull + 0.5); c.closePath(); c.fill();
  for (let i = 0; i < 16; i++) { const x = (hash(i) - 0.5) * rx * 1.6, y = f.skull + 0.5 + hash(i + 11) * (f.chin - f.skull - 0.2); c.fillStyle = '#ffe9a8'; c.beginPath(); c.ellipse(x, y, 0.03, 0.055, hash(i) * 3, 0, TAU); c.fill(); }
  c.fillStyle = '#2f9e4f'; for (let i = 0; i < 6; i++) { c.save(); c.translate(0, f.skull + 0.25); c.rotate(-1.2 + i * 0.48 + wob(t, 2, 0.03, i)); c.beginPath(); c.ellipse(0.34, 0, 0.36, 0.1, 0, 0, TAU); c.fill(); c.restore(); }
  cartoonFace(c, f, '#3a0610');
};
const toast = (c: Ctx, f: FaceFrame): void => {
  const mid = (f.skull + f.chin) / 2 + 0.05, rx = f.halfW * 1.9, top = f.skull - 0.9, bot = f.chin + 0.9;
  c.save();
  c.beginPath();   // the slice: a rounded top, straight sides (the face is cut out of it afterwards)
  c.moveTo(-rx, bot); c.lineTo(-rx, top + 0.7); c.bezierCurveTo(-rx - 0.45, top + 0.1, -rx * 0.5, top - 0.15, -0.35, top); c.bezierCurveTo(-0.1, top - 0.1, 0.1, top - 0.1, 0.35, top); c.bezierCurveTo(rx * 0.5, top - 0.15, rx + 0.45, top + 0.1, rx, top + 0.7); c.lineTo(rx, bot); c.closePath();
  c.ellipse(0, mid, f.halfW * 1.02, (f.chin - f.skull) / 2 + 0.1, 0, 0, TAU);
  c.fillStyle = '#e8b86d'; c.fill('evenodd');
  c.lineWidth = 0.14; c.strokeStyle = '#a8662b'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(-rx, bot); c.lineTo(-rx, top + 0.7); c.bezierCurveTo(-rx - 0.45, top + 0.1, -rx * 0.5, top - 0.15, -0.35, top); c.bezierCurveTo(-0.1, top - 0.1, 0.1, top - 0.1, 0.35, top); c.bezierCurveTo(rx * 0.5, top - 0.15, rx + 0.45, top + 0.1, rx, top + 0.7); c.lineTo(rx, bot); c.stroke();
  c.lineWidth = 0.05; c.strokeStyle = 'rgba(168,102,43,.55)'; c.beginPath(); c.ellipse(0, mid, f.halfW * 1.04, (f.chin - f.skull) / 2 + 0.12, 0, 0, TAU); c.stroke();
  c.restore();
};
const scream = (c: Ctx, f: FaceFrame): void => {
  const mid = (f.skull + f.chin) / 2 + 0.2, rx = f.halfW * 1.1, ry = (f.chin - f.skull) / 2 + 0.55;
  c.fillStyle = lin(c, 0, f.skull, 0, f.chin + 0.6, [[0, '#f4f1ea'], [1, '#d8d2c4']]); c.beginPath(); c.ellipse(0, mid, rx, ry, 0, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 0.04; c.stroke();
  c.fillStyle = '#16161a';
  sides(c, () => { c.beginPath(); c.moveTo(0.18, -0.2); c.bezierCurveTo(0.7, -0.25, 0.78, 0.2, 0.62, 0.5); c.bezierCurveTo(0.58, 0.8, 0.4, 0.9, 0.34, 0.5); c.bezierCurveTo(0.3, 0.3, 0.2, 0.05, 0.18, -0.2); c.closePath(); c.fill(); });
  const open = 0.5 + f.mouthOpen * 0.5;
  c.beginPath(); c.ellipse(0, f.mouth.y + 0.55, 0.28 + f.mouthOpen * 0.06, 0.55 * open, 0, 0, TAU); c.fill();
  c.beginPath(); c.moveTo(-0.12, f.nose.y - 0.05); c.quadraticCurveTo(0, f.nose.y + 0.15, 0.12, f.nose.y - 0.05); c.quadraticCurveTo(0, f.nose.y - 0.15, -0.12, f.nose.y - 0.05); c.fill();
};
const balaclava = (c: Ctx, f: FaceFrame): void => {
  const mid = (f.skull + f.chin) / 2 + 0.25, rx = f.halfW * 1.16, ry = (f.chin - f.skull) / 2 + 0.55;
  c.save();
  c.beginPath(); c.ellipse(0, mid, rx, ry, 0, 0, TAU);
  subRR(c, -f.halfW * 0.92, -0.32, f.halfW * 1.84, 0.62, 0.3);       // the slot for the eyes
  subRR(c, -f.mouthW * 0.85, f.lipTop - 0.12, f.mouthW * 1.7, Math.max(0.2, f.lipLow - f.lipUp) + 0.5, 0.2);   // the hole for the mouth
  c.fillStyle = '#2b2c33'; c.fill('evenodd');
  c.save(); c.clip('evenodd');
  c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 0.03;
  for (let i = -14; i < 15; i++) { c.beginPath(); c.moveTo(i * 0.17, f.skull - 0.4); c.lineTo(i * 0.17 + 0.5, f.chin + 0.9); c.stroke(); }
  c.restore(); c.restore();
};
const nerd = (c: Ctx, f: FaceFrame): void => {
  c.strokeStyle = '#18181c'; c.lineWidth = 0.09;
  for (const s of [-1, 1]) { rr(c, s * 0.5 - 0.36, -0.28, 0.72, 0.56, 0.16); c.fillStyle = 'rgba(255,255,255,.1)'; c.fill(); c.stroke(); }
  c.beginPath(); c.moveTo(-0.14, -0.04); c.quadraticCurveTo(0, -0.12, 0.14, -0.04); c.stroke();
  c.beginPath(); c.moveTo(-0.86, -0.04); c.lineTo(-f.temple * 1.05, -0.02); c.moveTo(0.86, -0.04); c.lineTo(f.temple * 1.05, -0.02); c.stroke();
  c.fillStyle = '#fff'; c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 0.025;   // buck teeth
  for (const x of [-0.07, 0.07]) { rr(c, x - 0.065, f.lipUp - 0.06, 0.13, 0.2 + f.mouthOpen * 0.08, 0.03); c.fill(); c.stroke(); }
  for (let i = 0; i < 10; i++) dot(c, (hash(i) < 0.5 ? -1 : 1) * (0.2 + hash(i + 5) * 0.55), 0.38 + hash(i + 9) * 0.3, 0.03, 'rgba(150,80,50,.6)');
};
const moustache = (c: Ctx, f: FaceFrame): void => {
  c.fillStyle = '#0f0f12';
  c.save(); c.translate(f.nose.x, (f.base + f.lipTop) / 2 + 0.04); const k = clamp(f.mouthW / 0.7, 0.9, 1.5); c.scale(k, k);
  c.fillStyle = '#17171b';
  c.beginPath(); c.moveTo(0, -0.06); c.bezierCurveTo(-0.2, -0.15, -0.55, -0.1, -0.7, 0.04); c.bezierCurveTo(-0.95, 0.04, -1.05, -0.15, -0.95, -0.3); c.bezierCurveTo(-1.12, -0.05, -1.0, 0.22, -0.7, 0.22); c.bezierCurveTo(-0.4, 0.2, -0.15, 0.08, 0, 0.1);
  c.bezierCurveTo(0.15, 0.08, 0.4, 0.2, 0.7, 0.22); c.bezierCurveTo(1.0, 0.22, 1.12, -0.05, 0.95, -0.3); c.bezierCurveTo(1.05, -0.15, 0.95, 0.04, 0.7, 0.04); c.bezierCurveTo(0.55, -0.1, 0.2, -0.15, 0, -0.06); c.closePath(); c.fill(); c.restore();
  c.fillStyle = lin(c, 0, -0.2, 0, 0.2, [[0, '#2a2a31'], [1, '#050507']]);
  rr(c, -1.15, -0.2, 1.05, 0.38, 0.12); c.fill(); rr(c, 0.1, -0.2, 1.05, 0.38, 0.12); c.fill();
  c.fillRect(-0.12, -0.15, 0.24, 0.07);
  c.fillStyle = 'rgba(255,255,255,.22)'; c.beginPath(); c.ellipse(-0.75, -0.1, 0.25, 0.04, -0.2, 0, TAU); c.fill(); c.beginPath(); c.ellipse(0.45, -0.1, 0.25, 0.04, -0.2, 0, TAU); c.fill();
};
const wrinkles = (c: Ctx, f: FaceFrame, strength: number): void => {
  c.strokeStyle = `rgba(80,45,30,${0.4 * strength})`; c.lineWidth = 0.03; c.lineCap = 'round';
  for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-0.7, f.brow - 0.25 - i * 0.1); c.quadraticCurveTo(0, f.brow - 0.32 - i * 0.1 + wob(0, 1, 0), 0.7, f.brow - 0.25 - i * 0.1); c.stroke(); }
  sides(c, () => { for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(0.82, 0.02 + i * 0.07); c.lineTo(1.08, -0.04 + i * 0.12); c.stroke(); } c.beginPath(); c.moveTo(0.45, f.base + 0.02); c.quadraticCurveTo(0.7, f.mouth.y - 0.1, 0.6, f.mouth.y + 0.3); c.stroke(); });
};
const grayHair = (c: Ctx, f: FaceFrame, bun: boolean): void => {
  const mid = f.skull + 0.5, rx = f.halfW * 1.25;
  c.fillStyle = lin(c, 0, f.skull - 0.2, 0, f.brow, [[0, '#f2f2f4'], [1, '#b9bcc4']]);
  c.beginPath(); c.ellipse(0, mid, rx, 0.72, 0, Math.PI, TAU); c.lineTo(rx * 0.92, -0.4); c.quadraticCurveTo(0.7, f.hair + 0.1, 0.1, f.hair + 0.15); c.quadraticCurveTo(-0.4, f.hair + 0.2, -rx * 0.92, -0.4); c.closePath(); c.fill();
  sides(c, () => { c.beginPath(); c.ellipse(f.temple * 1.04, 0.15, 0.2, 0.6, 0, 0, TAU); c.fill(); });
  if (bun) { c.fillStyle = '#e9eaee'; c.beginPath(); c.arc(0, f.skull - 0.35, 0.42, 0, TAU); c.fill(); c.strokeStyle = 'rgba(0,0,0,.2)'; c.lineWidth = 0.03; c.stroke(); }
};
const oldMe = (c: Ctx, w: number, h: number): void => { tint('rgba(150,140,120,.35)')(c, w, h); tint('rgba(255,255,255,.08)', 'screen')(c, w, h); };
const oldFace = (c: Ctx, f: FaceFrame): void => { grayHair(c, f, false); wrinkles(c, f, 1); };
const granny = (c: Ctx, f: FaceFrame): void => {
  grayHair(c, f, true); wrinkles(c, f, 0.9);
  c.strokeStyle = '#7a3b52'; c.lineWidth = 0.055;
  for (const s of [-1, 1]) { c.save(); c.translate(s * 0.5, 0); c.beginPath(); c.moveTo(-0.34, 0.08); c.quadraticCurveTo(-0.38, -0.2, 0.06, -0.25); c.quadraticCurveTo(0.42, -0.26, 0.36, 0.1); c.quadraticCurveTo(0.3, 0.3, -0.04, 0.28); c.quadraticCurveTo(-0.3, 0.26, -0.34, 0.08); c.closePath(); c.fillStyle = 'rgba(255,255,255,.1)'; c.fill(); c.stroke(); c.restore(); }
  c.beginPath(); c.moveTo(-0.14, -0.05); c.quadraticCurveTo(0, -0.12, 0.14, -0.05); c.stroke();
  dot(c, -0.8, 0.5, 0.18, 'rgba(255,120,140,.28)'); dot(c, 0.8, 0.5, 0.18, 'rgba(255,120,140,.28)');
};
const baby = (c: Ctx, _w: number, _h: number, faces: FaceFrame[]): void => {
  eachFace(faces, (f) => { const [x, y] = px(f, 0, 0.5); magnify(c, x, y, f.u * 2.3, 1.2); for (const s of [-0.5, 0.5]) { const [ex, ey] = px(f, s, 0); magnify(c, ex, ey, f.u * 0.5, 1.4); } });
};
const babyFace = (c: Ctx, f: FaceFrame, t: number): void => {
  dot(c, -0.85, 0.52, 0.2, 'rgba(255,120,150,.32)'); dot(c, 0.85, 0.52, 0.2, 'rgba(255,120,150,.32)');
  c.fillStyle = '#ffb3d1'; c.strokeStyle = '#d6638f'; c.lineWidth = 0.03;
  c.beginPath(); c.arc(0, f.skull + 0.1, 0.55, Math.PI, TAU); c.fill(); c.stroke();   // a small bonnet tuft
  heart(c, 0, f.skull - 0.35 + wob(t, 3, 0.02), 0.34, '#ff6fa0', '#e0457b');
  const m = f.mouth; if (f.mouthOpen < 0.35) { c.fillStyle = '#9ad7ff'; c.strokeStyle = '#4a96c8'; c.beginPath(); c.arc(m.x, m.y + 0.02, 0.17, 0, TAU); c.fill(); c.stroke(); dot(c, m.x, m.y + 0.02, 0.06, '#ffffff'); }
};
const dollEyes = (c: Ctx, w: number, h: number, faces: FaceFrame[]): void => {
  eachFace(faces, (f) => { for (const s of [-0.5, 0.5]) { const [x, y] = px(f, s, 0); magnify(c, x, y, f.u * 0.55, 1.5); } const [nx, ny] = px(f, f.nose.x, f.nose.y); void nx; void ny; });
  tint('rgba(255,245,240,.25)', 'screen')(c, w, h);
};
const dollFace = (c: Ctx, f: FaceFrame): void => {
  dot(c, -0.85, 0.5, 0.22, 'rgba(255,100,130,.38)'); dot(c, 0.85, 0.5, 0.22, 'rgba(255,100,130,.38)');
  c.strokeStyle = '#17171b'; c.lineWidth = 0.05; c.lineCap = 'round';
  sides(c, () => { for (let i = 0; i < 4; i++) { const a = -0.55 - i * 0.28; c.beginPath(); c.moveTo(0.5 + Math.cos(a) * 0.3, -0.04 + Math.sin(a) * 0.14); c.lineTo(0.5 + Math.cos(a) * 0.5, -0.04 + Math.sin(a) * 0.3); c.stroke(); } });
  c.fillStyle = 'rgba(214,40,80,.5)'; c.beginPath(); c.ellipse(f.mouth.x, f.lipTop + 0.08, f.mouthW * 0.3, 0.05, 0, 0, TAU); c.fill();
};
const vampire = (c: Ctx, f: FaceFrame, t: number): void => {
  sides(c, (s) => {
    const x = f.mouth.x + s * f.mouthW * 0.28, y = f.lipUp - 0.02, len = 0.2 + f.mouthOpen * 0.12;
    c.fillStyle = '#fff'; c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 0.02; c.beginPath(); c.moveTo(x - 0.05, y); c.lineTo(x + 0.05, y); c.lineTo(x, y + len); c.closePath(); c.fill(); c.stroke();
  });
  const d = (t * 0.6) % 1; c.fillStyle = 'rgba(200,20,40,.9)'; c.beginPath(); c.ellipse(f.mouth.x + f.mouthW * 0.28, f.lipLow + 0.12 + d * 0.5, 0.025, 0.05 + d * 0.04, 0, 0, TAU); c.fill();
  sides(c, () => { c.fillStyle = 'rgba(255,30,40,.28)'; c.beginPath(); c.arc(0.5, 0, 0.3, 0, TAU); c.fill(); dot(c, 0.5, 0, 0.08, '#ff2a2a'); });
};
const vampireLook = (c: Ctx, w: number, h: number): void => { tint('rgba(205,215,255,.35)')(c, w, h); vignette(c, w, h, 0.5, '30,0,10'); };
const elf = (c: Ctx, f: FaceFrame, t: number): void => {
  sides(c, (s) => {
    c.save(); c.translate(f.temple * 1.02, 0.15); c.rotate(-0.3);
    c.fillStyle = 'rgba(240,190,150,.98)'; c.strokeStyle = 'rgba(140,80,50,.5)'; c.lineWidth = 0.03;
    c.beginPath(); c.moveTo(0, -0.22); c.quadraticCurveTo(0.5, -0.4, 1.25, -0.82); c.quadraticCurveTo(0.7, -0.1, 0.1, 0.34); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,150,150,.4)'; c.beginPath(); c.moveTo(0.1, -0.1); c.quadraticCurveTo(0.5, -0.22, 0.9, -0.55); c.quadraticCurveTo(0.5, -0.05, 0.12, 0.2); c.closePath(); c.fill();
    c.restore();
    for (let i = 0; i < 6; i++) { c.globalAlpha = 0.5 + 0.5 * Math.sin(t * 3 + i + s); dot(c, 0.2 + hash(i + 5) * 0.55, 0.28 + hash(i + 8) * 0.25, 0.028, '#ffd24a'); }
    c.globalAlpha = 1;
  });
};

const swap = (c: Ctx, w: number, h: number, faces: FaceFrame[]): void => {
  const pair = faces.filter((f) => f.seen > 0.3).slice(0, 2);
  if (pair.length < 2) return;
  const snap = scratch(3, w, h); snap.drawImage(c.canvas, 0, 0);
  const put = (dst: FaceFrame, src: FaceFrame): void => {
    const mid = (dst.top + dst.chin) / 2 + 0.05;
    c.save(); c.translate(dst.cx, dst.cy); c.rotate(dst.roll); c.scale(dst.u, dst.u);
    c.beginPath(); c.ellipse(0, mid, dst.halfW * 0.98, (dst.chin - dst.top) / 2 + 0.04, 0, 0, TAU); c.clip();
    c.scale(1 / src.u, 1 / src.u); c.rotate(-src.roll); c.translate(-src.cx, -src.cy);
    c.drawImage(snap.canvas, 0, 0);
    c.restore();
  };
  put(pair[0], pair[1]); put(pair[1], pair[0]);
};

// ================================================================ BEAUTY
const lipTint = (c: Ctx, f: FaceFrame, color: string, gloss = true): void => {
  const open = Math.max(0.02, f.lipLow - f.lipUp);
  c.fillStyle = color;
  c.beginPath(); c.ellipse(f.mouth.x, f.mouth.y - open * 0.5 - 0.02, f.mouthW * 0.5, 0.075 + f.smile * 0.01, 0, Math.PI, TAU); c.fill();
  c.beginPath(); c.ellipse(f.mouth.x, f.mouth.y + open * 0.5 + 0.02, f.mouthW * 0.46, 0.09, 0, 0, Math.PI); c.fill();
  if (gloss) { c.fillStyle = 'rgba(255,255,255,.4)'; c.beginPath(); c.ellipse(f.mouth.x - f.mouthW * 0.12, f.mouth.y + open * 0.5 + 0.06, f.mouthW * 0.16, 0.022, 0, 0, TAU); c.fill(); }
};
const freckleDots = (c: Ctx, f: FaceFrame, n: number, color = 'rgba(150,80,50,.6)'): void => {
  for (let i = 0; i < n; i++) { const s = i % 2 ? 1 : -1; dot(c, s * (0.1 + hash(i + 3) * 0.75), 0.3 + hash(i + 13) * 0.32, 0.016 + hash(i + 23) * 0.018, color); }
  void f;
};
const blush = (c: Ctx, color: string): void => { sides(c, () => { c.fillStyle = rad(c, 0.85, 0.5, 0, 0.85, 0.5, 0.34, [[0, color], [1, 'rgba(255,120,150,0)']]); c.beginPath(); c.arc(0.85, 0.5, 0.34, 0, TAU); c.fill(); }); };
const makeup = (c: Ctx, f: FaceFrame): void => {
  blush(c, 'rgba(255,110,140,.4)'); lipTint(c, f, 'rgba(210,50,95,.62)');
  sides(c, () => { c.fillStyle = 'rgba(255,255,255,.18)'; c.beginPath(); c.ellipse(0.78, 0.22, 0.2, 0.07, -0.45, 0, TAU); c.fill(); c.fillStyle = 'rgba(190,120,200,.3)'; c.beginPath(); c.ellipse(0.5, -0.1, 0.34, 0.1, 0, Math.PI, TAU); c.fill(); });
  c.fillStyle = 'rgba(255,255,255,.2)'; c.beginPath(); c.ellipse(0, 0.35, 0.05, 0.3, 0, 0, TAU); c.fill();
};
const freckles = (c: Ctx, f: FaceFrame): void => { blush(c, 'rgba(255,120,130,.32)'); freckleDots(c, f, 34); };
const nekoMimi = (c: Ctx, f: FaceFrame, t: number): void => {
  pointEars(c, f, t, '#f6f1f4', '#ffb3cf'); blush(c, 'rgba(255,110,150,.45)');
  c.strokeStyle = 'rgba(60,40,50,.6)'; c.lineWidth = 0.025; c.lineCap = 'round';
  sides(c, () => { for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(0.7, 0.45 + i * 0.08); c.lineTo(1.0, 0.4 + i * 0.12); c.stroke(); } });
  spark(c, -0.95 + wob(t, 2, 0.04), f.hair + 0.1, 0.1, '#ffffff', t);
};
const furryGlasses = (c: Ctx, f: FaceFrame, t: number): void => {
  sides(c, (s) => {
    const cx = 0.5, r = 0.46;
    for (let i = 0; i < 46; i++) { const a = (i / 46) * TAU; c.strokeStyle = i % 3 ? '#ff7fc4' : '#ffc4e3'; c.lineWidth = 0.1; c.lineCap = 'round'; const j = 0.1 + hash(i + s) * 0.1; c.beginPath(); c.moveTo(cx + Math.cos(a) * (r - 0.02), Math.sin(a) * (r - 0.02)); c.lineTo(cx + Math.cos(a) * (r + j), Math.sin(a) * (r + j)); c.stroke(); }
    c.fillStyle = 'rgba(255,170,215,.18)'; c.beginPath(); c.arc(cx, 0, r - 0.02, 0, TAU); c.fill();
  });
  c.strokeStyle = '#ff9ed2'; c.lineWidth = 0.07; c.beginPath(); c.moveTo(-0.08, 0); c.lineTo(0.08, 0); c.stroke();
  spark(c, 0.95 + wob(t, 2, 0.03), -0.5, 0.09, '#fff', t); void f;
};
const y2kLook = (c: Ctx, w: number, h: number): void => { bloom(c, w, h, 0.3); tint('rgba(200,220,255,.3)')(c, w, h); tint('rgba(255,170,230,.18)', 'screen')(c, w, h); };
const y2kFace = (c: Ctx, f: FaceFrame, t: number): void => {
  sides(c, (s) => { c.fillStyle = 'rgba(190,225,255,.55)'; c.beginPath(); c.ellipse(0.5, -0.08, 0.36, 0.12, 0, Math.PI, TAU); c.fill(); starPath(c, 0.88, -0.05, 0.1, t * 0.4 * s, 4, 0.3); c.fillStyle = '#fff'; c.fill(); });
  lipTint(c, f, 'rgba(255,120,190,.6)'); blush(c, 'rgba(255,150,210,.35)');
  for (let i = 0; i < 3; i++) spark(c, -0.95 + i * 0.2, f.hair - 0.05 + wob(t, 2, 0.03, i), 0.1, i % 2 ? '#bfe4ff' : '#ffd1ee', t + i);
};
const glitterTears = (c: Ctx, f: FaceFrame, t: number): void => {
  sides(c, (s) => {
    for (let i = 0; i < 12; i++) { const ph = (t * (0.35 + hash(i) * 0.2) + hash(i + 30)) % 1, x = 0.5 + (hash(i + 4) - 0.5) * 0.3, y = 0.18 + ph * 1.1; c.globalAlpha = Math.sin(ph * Math.PI); spark(c, x + s * 0.0, y, 0.045 + hash(i + 8) * 0.045, i % 3 ? '#e8d5ff' : '#9fe0ff', t * 2 + i); }
  });
  c.globalAlpha = 1; blush(c, 'rgba(255,120,170,.28)'); void f;
};
const eyelinerWing = (c: Ctx, f: FaceFrame): void => {
  c.strokeStyle = '#0e0e11'; c.lineCap = 'round'; c.lineJoin = 'round';
  sides(c, () => { c.lineWidth = 0.065; c.beginPath(); c.moveTo(0.26, -0.1); c.quadraticCurveTo(0.5, -0.18, 0.72, -0.1); c.lineTo(1.0, -0.28); c.lineTo(0.78, -0.02); c.stroke(); for (let i = 0; i < 5; i++) { c.lineWidth = 0.03; const a = -0.3 - i * 0.22; c.beginPath(); c.moveTo(0.5 + Math.cos(a + 3.1) * -0.25, -0.1); c.lineTo(0.5 + Math.cos(a) * 0.4 + 0.1, -0.1 + Math.sin(a) * 0.3); c.stroke(); } });
  lipTint(c, f, 'rgba(190,40,70,.4)', false);
};
const peach = (c: Ctx, w: number, h: number): void => { tint('rgba(255,170,130,.38)')(c, w, h); tint('rgba(255,225,200,.18)', 'screen')(c, w, h); };
const sunKissed = (c: Ctx, w: number, h: number, _f: FaceFrame[], t: number): void => {
  tint('rgba(255,160,70,.32)')(c, w, h);
  const g = c.createRadialGradient(w * 0.88, h * 0.05, 0, w * 0.88, h * 0.05, Math.max(w, h) * (0.55 + wob(t, 1, 0.03)));
  g.addColorStop(0, 'rgba(255,230,160,.75)'); g.addColorStop(0.3, 'rgba(255,190,90,.22)'); g.addColorStop(1, 'rgba(255,170,60,0)');
  c.save(); c.globalCompositeOperation = 'screen'; c.fillStyle = g; c.fillRect(0, 0, w, h); c.restore();
};
const sunFace = (c: Ctx, f: FaceFrame): void => { freckleDots(c, f, 22, 'rgba(160,80,30,.5)'); };
const pinkHearts = (c: Ctx, f: FaceFrame, t: number): void => {
  blush(c, 'rgba(255,110,160,.4)');
  for (let i = 0; i < 9; i++) { const a = t * 0.6 + (i / 9) * TAU, rx = f.halfW * 1.5, ry = (f.chin - f.skull) / 2 + 0.5; c.globalAlpha = 0.85; heart(c, Math.cos(a) * rx, (f.skull + f.chin) / 2 + Math.sin(a) * ry * 0.9, 0.2 + 0.1 * hash(i), i % 2 ? '#ff7eb6' : '#ffb3d4', '#ff4d8d'); }
  c.globalAlpha = 1;
};
const clearSkin = (c: Ctx, w: number, h: number): void => { bloom(c, w, h, 0.34); tint('rgba(255,235,225,.22)')(c, w, h); };
const cyberLook = (c: Ctx, w: number, h: number): void => {
  c.save(); c.globalCompositeOperation = 'overlay';
  c.fillStyle = lin(c, 0, 0, w, 0, [[0, 'rgba(0,200,255,.55)'], [0.5, 'rgba(120,60,255,.25)'], [1, 'rgba(255,0,170,.55)']]); c.fillRect(0, 0, w, h); c.restore();
  vignette(c, w, h, 0.4, '10,0,40');
};
const cyberFace = (c: Ctx, f: FaceFrame, t: number): void => {
  c.lineCap = 'round'; c.shadowColor = '#37e0ff'; c.shadowBlur = 0.12;
  sides(c, (s) => { c.strokeStyle = s > 0 ? '#ff39c8' : '#37e0ff'; c.lineWidth = 0.035; c.beginPath(); c.moveTo(0.9, 0.2); c.lineTo(1.0, 0.55); c.lineTo(0.75, 0.8); c.stroke(); dot(c, 0.75, 0.8, 0.045 + 0.02 * Math.sin(t * 5), s > 0 ? '#ff39c8' : '#37e0ff'); });
  c.shadowBlur = 0;
};

// ================================================================ PARTY AND SEASONS
const partyHat = (c: Ctx, f: FaceFrame, t: number, colors: [string, string], pom: string): void => {
  c.save(); c.translate(f.yaw * 0.1, f.hair + 0.18); c.rotate(wob(t, 2, 0.02));
  c.fillStyle = lin(c, -0.5, 0, 0.5, 0, [[0, colors[0]], [1, colors[1]]]);
  c.beginPath(); c.moveTo(-0.62, 0); c.lineTo(0, -1.55); c.lineTo(0.62, 0); c.closePath(); c.fill();
  c.save(); c.clip();
  c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 0.1; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-0.7, -0.15 - i * 0.38); c.lineTo(0.7, 0.05 - i * 0.38 - 0.3); c.stroke(); }
  c.restore();
  dot(c, 0, -1.58, 0.14, pom); c.restore();
};
const balloons = (c: Ctx, w: number, h: number, t: number): void => {
  const cols = ['#ff4d6d', '#ffc62e', '#4da3ff', '#7bd88f', '#a35cff', '#ff8a3d'];
  for (let i = 0; i < 7; i++) {
    const ph = (t * (0.06 + hash(i + 4) * 0.05) + hash(i + 14)) % 1, x = (0.08 + hash(i) * 0.84) * w + Math.sin(t + i) * w * 0.012, y = h * (1.1 - ph * 1.3), r = w * (0.035 + 0.02 * hash(i + 9));
    c.fillStyle = cols[i % cols.length]; c.beginPath(); c.ellipse(x, y, r, r * 1.2, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,.4)'; c.beginPath(); c.ellipse(x - r * 0.35, y - r * 0.4, r * 0.2, r * 0.32, -0.5, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, y + r * 1.2); c.quadraticCurveTo(x - r * 0.3, y + r * 2, x, y + r * 3); c.stroke();
  }
};
const confettiRain = (c: Ctx, w: number, h: number, t: number): void => {
  const cols = ['#ff4d6d', '#ffc62e', '#4da3ff', '#7bd88f', '#a35cff', '#ff8a3d'];
  for (let i = 0; i < 46; i++) { const ph = (t * (0.18 + hash(i) * 0.2) + hash(i + 50)) % 1; c.save(); c.translate(hash(i + 1) * w + Math.sin(t * 2 + i) * 8, ph * h); c.rotate(t * 3 + i); c.fillStyle = cols[i % cols.length]; c.fillRect(-w * 0.008, -w * 0.004, w * 0.016, w * 0.008); c.restore(); }
};
const birthdayTop = (c: Ctx, w: number, h: number, t: number): void => {
  balloons(c, w, h, t); confettiRain(c, w, h, t);
  c.save(); c.textAlign = 'center'; c.font = `900 ${Math.round(w * 0.075)}px system-ui, sans-serif`; c.lineWidth = w * 0.012; c.strokeStyle = 'rgba(0,0,0,.45)'; c.fillStyle = '#fff';
  const y = h * 0.93 + Math.sin(t * 3) * 3; c.strokeText('Happy Birthday!', w / 2, y); c.fillText('Happy Birthday!', w / 2, y); c.restore();
};
const snow = (c: Ctx, w: number, h: number, t: number): void => {
  c.fillStyle = '#fff';
  for (let i = 0; i < 60; i++) { const ph = (t * (0.07 + hash(i) * 0.1) + hash(i + 30)) % 1; c.globalAlpha = 0.5 + 0.5 * hash(i + 8); c.beginPath(); c.arc((hash(i + 2) + Math.sin(t * 0.7 + i) * 0.02) * w, ph * h, w * (0.003 + 0.005 * hash(i + 5)), 0, TAU); c.fill(); }
  c.globalAlpha = 1;
};
const santa = (c: Ctx, f: FaceFrame, t: number): void => {
  c.save(); c.translate(f.yaw * 0.1, f.hair + 0.2); c.rotate(-0.06 + wob(t, 2, 0.02));
  c.fillStyle = lin(c, 0, -1.2, 0, 0.1, [[0, '#e0262f'], [1, '#a8121c']]);
  c.beginPath(); c.moveTo(-0.85, 0.05); c.bezierCurveTo(-0.8, -0.8, -0.2, -1.1, 0.5, -0.9); c.bezierCurveTo(0.95, -0.8, 1.1, -0.5, 1.05, -0.2); c.lineTo(0.85, 0.05); c.closePath(); c.fill();
  c.fillStyle = '#fff'; rr(c, -1.0, -0.12, 2.0, 0.34, 0.17); c.fill(); dot(c, 1.1, -0.28, 0.2, '#fff'); c.restore();
  blush(c, 'rgba(255,100,110,.35)');
};
const halloweenLook = (c: Ctx, w: number, h: number): void => { tint('rgba(255,120,20,.28)')(c, w, h); vignette(c, w, h, 0.55, '20,0,30'); };
const halloweenFace = (c: Ctx, f: FaceFrame, t: number): void => {
  c.fillStyle = 'rgba(20,10,30,.85)';
  sides(c, () => { c.beginPath(); c.moveTo(0.22, -0.32); c.lineTo(0.78, -0.4); c.lineTo(0.5, 0.18); c.closePath(); c.fill(); });
  c.beginPath(); c.moveTo(-0.3, 0.55); c.lineTo(0.3, 0.55); c.lineTo(0, 0.3); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(255,140,30,.85)'; c.lineWidth = 0.07; c.lineCap = 'round';
  sides(c, () => { c.beginPath(); c.moveTo(0.95, 0.35); c.quadraticCurveTo(1.05, 0.7, 0.8, 1.0); c.stroke(); });
  c.fillStyle = '#e8741a'; c.strokeStyle = '#2c6a1e'; c.lineWidth = 0.05;
  c.beginPath(); c.ellipse(0.1, f.skull - 0.1 + wob(t, 2, 0.02), 0.45, 0.36, 0, 0, TAU); c.fill(); c.beginPath(); c.moveTo(0.1, f.skull - 0.45); c.lineTo(0.2, f.skull - 0.65); c.stroke();
};
const bat = (c: Ctx, x: number, y: number, s: number, flap: number): void => {
  c.save(); c.translate(x, y); c.scale(s, s); c.fillStyle = '#0d0b14';
  for (const k of [-1, 1]) { c.save(); c.scale(k, 1); c.beginPath(); c.moveTo(0.1, 0); c.quadraticCurveTo(0.5, -0.5 * flap, 1.1, -0.2 * flap); c.quadraticCurveTo(0.9, 0.05, 0.75, 0.22); c.quadraticCurveTo(0.55, 0.1, 0.4, 0.28); c.quadraticCurveTo(0.25, 0.12, 0.1, 0.2); c.closePath(); c.fill(); c.restore(); }
  c.beginPath(); c.arc(0, 0.04, 0.16, 0, TAU); c.fill(); c.beginPath(); c.moveTo(-0.12, -0.05); c.lineTo(-0.08, -0.26); c.lineTo(-0.02, -0.1); c.moveTo(0.12, -0.05); c.lineTo(0.08, -0.26); c.lineTo(0.02, -0.1); c.fill(); c.restore();
};
const halloweenTop = (c: Ctx, w: number, h: number, t: number): void => {
  for (let i = 0; i < 5; i++) bat(c, ((t * (0.05 + hash(i) * 0.04) + hash(i + 3)) % 1.2 - 0.1) * w, h * (0.1 + hash(i + 9) * 0.35) + Math.sin(t * 2 + i) * h * 0.02, w * (0.05 + 0.03 * hash(i + 6)), 0.6 + 0.6 * Math.sin(t * 14 + i));
  c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1.3;
  for (let i = 0; i < 6; i++) { const a = (i / 5) * (Math.PI / 2); c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * w * 0.34, Math.sin(a) * w * 0.34); c.stroke(); }
  for (let r = 1; r <= 4; r++) { c.beginPath(); for (let i = 0; i <= 5; i++) { const a = (i / 5) * (Math.PI / 2), rr2 = r * w * 0.085; const x = Math.cos(a) * rr2, y = Math.sin(a) * rr2; if (i === 0) c.moveTo(x, y); else c.quadraticCurveTo(Math.cos(a - 0.15) * rr2 * 0.85, Math.sin(a - 0.15) * rr2 * 0.85, x, y); } c.stroke(); }
};
const diwaliLook = (c: Ctx, w: number, h: number): void => { tint('rgba(255,170,40,.34)')(c, w, h); bloom(c, w, h, 0.3); };
const diwaliFace = (c: Ctx, f: FaceFrame, t: number): void => {
  dot(c, 0, f.brow - 0.3, 0.07, '#e0262f'); c.strokeStyle = '#e0262f'; c.lineWidth = 0.03; c.beginPath(); c.moveTo(0, f.brow - 0.4); c.lineTo(0, f.brow - 0.2); c.stroke();
  for (let i = 0; i < 7; i++) { const a = Math.PI * (1.05 + 0.9 * (i / 6)); spark(c, Math.cos(a) * f.halfW * 1.05, -0.45 + Math.sin(a) * (-0.45 - f.hair + 0.1) + wob(t, 3, 0.02, i), 0.09, i % 2 ? '#ffd24a' : '#fff1a8', t + i); }
};
const diwaliTop = (c: Ctx, w: number, h: number, t: number): void => {
  c.strokeStyle = 'rgba(40,20,5,.7)'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, h * 0.02); c.quadraticCurveTo(w / 2, h * 0.09, w, h * 0.02); c.stroke();
  for (let i = 0; i < 12; i++) { const x = (i + 0.5) / 12 * w, y = h * 0.02 + Math.sin((i / 11) * Math.PI) * h * 0.05 + h * 0.02; c.globalAlpha = 0.6 + 0.4 * Math.sin(t * 4 + i); dot(c, x, y, w * 0.012, ['#ff4d6d', '#ffc62e', '#7bd88f', '#ff8a3d'][i % 4]); }
  c.globalAlpha = 1;
  for (let i = 0; i < 4; i++) { const x = w * (0.14 + i * 0.24), y = h * 0.93; c.fillStyle = '#b8571c'; c.beginPath(); c.moveTo(x - w * 0.045, y); c.quadraticCurveTo(x, y + h * 0.04, x + w * 0.045, y); c.quadraticCurveTo(x, y + h * 0.012, x - w * 0.045, y); c.fill(); const fl = 1 + 0.15 * Math.sin(t * 9 + i); c.fillStyle = 'rgba(255,200,60,.9)'; c.beginPath(); c.ellipse(x, y - h * 0.012, w * 0.012 * fl, h * 0.022 * fl, 0, 0, TAU); c.fill(); dot(c, x, y - h * 0.01, w * 0.045, 'rgba(255,170,40,.18)'); }
};
const fireworks = (c: Ctx, w: number, h: number, t: number): void => {
  const cols = ['#ffd24a', '#ff4d9a', '#4dd8ff', '#8cff6a'];
  for (let k = 0; k < 4; k++) {
    const cyc = (t * 0.45 + k * 0.27) % 1, seed = Math.floor(t * 0.45 + k * 0.27) + k * 7, cx = (0.15 + hash(seed) * 0.7) * w, cy = (0.12 + hash(seed + 3) * 0.3) * h;
    if (cyc < 0.08) continue;
    const p = (cyc - 0.08) / 0.92, n = 22;
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU, d = w * 0.16 * (1 - Math.pow(1 - p, 2.2)); c.globalAlpha = Math.max(0, 1 - p); dot(c, cx + Math.cos(a) * d, cy + Math.sin(a) * d + p * p * h * 0.04, w * 0.006, cols[(seed + k) % cols.length]); }
  }
  c.globalAlpha = 1;
};
const newYearTop = (c: Ctx, w: number, h: number, t: number): void => {
  fireworks(c, w, h, t);
  const now = new Date(), year = now.getMonth() === 0 && now.getDate() < 8 ? now.getFullYear() : now.getFullYear() + 1;
  c.save(); c.textAlign = 'center'; c.font = `900 ${Math.round(w * 0.1)}px system-ui, sans-serif`; c.lineWidth = w * 0.014; c.strokeStyle = 'rgba(0,0,0,.5)'; c.fillStyle = '#ffd24a';
  c.strokeText(`Happy ${year}`, w / 2, h * 0.93); c.fillText(`Happy ${year}`, w / 2, h * 0.93); c.restore();
};
const bridal = (c: Ctx, f: FaceFrame, t: number): void => {
  c.strokeStyle = '#f2b824'; c.lineWidth = 0.035; c.beginPath(); c.moveTo(0, f.hair + 0.05); c.quadraticCurveTo(0, f.brow - 0.4, 0, f.brow - 0.3); c.stroke();
  for (let i = 0; i < 5; i++) { const a = Math.PI * (1.12 + 0.76 * (i / 4)); dot(c, Math.cos(a) * f.halfW * 0.98, -0.3 + Math.sin(a) * (-0.3 - f.hair), 0.04, '#f2b824'); }
  c.fillStyle = '#e0262f'; c.strokeStyle = '#f2b824'; c.lineWidth = 0.035; c.beginPath(); c.moveTo(0, f.brow - 0.22); c.quadraticCurveTo(0.14, f.brow - 0.05, 0, f.brow + 0.08); c.quadraticCurveTo(-0.14, f.brow - 0.05, 0, f.brow - 0.22); c.fill(); c.stroke();
  dot(c, 0, f.brow + 0.22, 0.06, '#e0262f');
  sides(c, () => { c.strokeStyle = '#f2b824'; c.lineWidth = 0.03; c.beginPath(); c.moveTo(f.temple * 1.02, 0.4); c.lineTo(f.temple * 1.04, 0.62); c.stroke(); c.fillStyle = '#f2b824'; c.beginPath(); c.arc(f.temple * 1.04, 0.74, 0.14, 0, Math.PI); c.fill(); dot(c, f.temple * 1.04, 0.92 + wob(t, 3, 0.02), 0.045, '#fff1a8'); });
  dot(c, f.nose.x + 0.2, f.nose.y, 0.05, '#f2b824'); lipTint(c, f, 'rgba(200,30,60,.55)', false); blush(c, 'rgba(255,100,120,.35)');
};
const bridalLook = (c: Ctx, w: number, h: number): void => { tint('rgba(255,190,100,.3)')(c, w, h); bloom(c, w, h, 0.26); };
const tricolour = (c: Ctx, f: FaceFrame, t: number): void => {
  sides(c, () => { const cols = ['#ff9933', '#ffffff', '#138808']; for (let i = 0; i < 3; i++) { c.fillStyle = cols[i]; c.globalAlpha = 0.9; rr(c, 0.55, 0.45 + i * 0.12, 0.5, 0.09, 0.04); c.fill(); } c.globalAlpha = 1; });
  c.fillStyle = '#ff9933'; c.fillRect(-0.6, f.brow - 0.45, 0.4, 0.1); c.fillStyle = '#fff'; c.fillRect(-0.2, f.brow - 0.45, 0.4, 0.1); c.fillStyle = '#138808'; c.fillRect(0.2, f.brow - 0.45, 0.4, 0.1);
  c.strokeStyle = '#1b2c8f'; c.lineWidth = 0.03; c.beginPath(); c.arc(0, f.brow - 0.4, 0.05, 0, TAU); c.stroke(); void t;
};
const emojiRing = (c: Ctx, w: number, h: number, t: number): void => {
  const set = ['💯', '🔥', '😂', '❤️', '✨', '😎'];
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let i = 0; i < 14; i++) { const ph = (t * (0.1 + hash(i) * 0.06) + hash(i + 7)) % 1; c.globalAlpha = Math.sin(ph * Math.PI); c.font = `${Math.round(w * (0.06 + 0.05 * hash(i + 2)))}px system-ui, sans-serif`; c.fillText(set[i % set.length], hash(i + 20) * w + Math.sin(t + i) * w * 0.02, h - ph * h * 1.1); }
  c.globalAlpha = 1;
};
const hundredFace = (c: Ctx, f: FaceFrame, t: number): void => {
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + t * 0.5; c.font = `${0.22 + 0.06 * hash(i)}px system-ui, sans-serif`; c.fillText(i % 3 ? '😂' : '💯', Math.cos(a) * f.halfW * 1.35, (f.skull + f.chin) / 2 + Math.sin(a) * 1.5); }
};
const stream = (c: Ctx, f: FaceFrame, t: number, kind: 'rainbow' | 'hearts'): void => {
  const open = clamp((f.mouthOpen - 0.2) / 0.35, 0, 1);
  if (open <= 0) return;
  const m = f.mouth, y0 = f.lipLow;
  for (let i = 0; i < 46; i++) {
    const ph = (t * (0.8 + hash(i) * 0.5) + hash(i + 40)) % 1;
    const x = m.x + (hash(i + 9) - 0.5) * 0.28 * (0.3 + ph) + Math.sin(ph * 8 + i) * 0.04, y = y0 + 0.05 + ph * ph * 3.2 * open + ph * 0.5;
    c.globalAlpha = Math.min(1, (1 - ph) * 1.6) * open;
    if (kind === 'hearts') heart(c, x, y, 0.13 + 0.12 * hash(i + 3), i % 2 ? '#ff7eb6' : '#ffb3d4', '#ff4d8d');
    else dot(c, x, y, 0.06 + 0.04 * hash(i + 3), `hsl(${(i * 47 + Math.floor(t * 120)) % 360} 95% 58%)`);
  }
  c.globalAlpha = 1;
};
const butterfly = (c: Ctx, x: number, y: number, s: number, flap: number, hue: string): void => {
  c.save(); c.translate(x, y); c.scale(s, s);
  for (const k of [-1, 1]) { c.save(); c.scale(k * (0.35 + 0.65 * Math.abs(flap)), 1); c.fillStyle = lin(c, 0, -0.5, 0.8, 0.5, [[0, hue], [1, '#ffe9a8']]); c.beginPath(); c.moveTo(0.04, 0); c.bezierCurveTo(0.3, -0.7, 0.95, -0.55, 0.85, -0.05); c.bezierCurveTo(0.95, 0.35, 0.45, 0.55, 0.04, 0.1); c.closePath(); c.fill(); c.strokeStyle = 'rgba(80,40,0,.5)'; c.lineWidth = 0.05; c.stroke(); c.restore(); }
  c.fillStyle = '#3a2410'; c.beginPath(); c.ellipse(0, 0.02, 0.05, 0.28, 0, 0, TAU); c.fill(); c.restore();
};
const butterflyCrown = (c: Ctx, f: FaceFrame, t: number): void => {
  const cols = ['#f2b824', '#ff9a3c', '#ffd24a', '#ffb347'];
  for (let i = 0; i < 7; i++) { const a = Math.PI * (1.06 + 0.88 * (i / 6)), rx = f.halfW * 1.1, ry = -0.45 - f.hair + 0.1; butterfly(c, Math.cos(a) * rx + wob(t, 2, 0.05, i), -0.45 + Math.sin(a) * ry + wob(t, 3, 0.05, i), 0.2 + 0.07 * hash(i), Math.sin(t * 12 + i * 1.7), cols[i % cols.length]); }
};

// ================================================================ MORE LOOKS AND OVERLAYS
const brighten = (c: Ctx, w: number, h: number): void => { tint('rgba(255,255,255,.28)', 'screen')(c, w, h); tint('rgba(255,250,240,.12)')(c, w, h); };
const sepia = (c: Ctx, w: number, h: number): void => { tint('rgba(255,255,255,.5)', 'saturation')(c, w, h); tint('rgba(150,100,50,.5)', 'multiply')(c, w, h); tint('rgba(255,225,170,.18)', 'screen')(c, w, h); };
const contrast = (c: Ctx, w: number, h: number): void => { tint('rgba(128,128,128,1)', 'overlay')(c, w, h); tint('rgba(255,255,255,.12)', 'overlay')(c, w, h); vignette(c, w, h, 0.25); };
const clockTop = (c: Ctx, w: number, h: number): void => {
  const now = new Date(), hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0');
  c.save(); c.textAlign = 'center'; c.font = `800 ${Math.round(w * 0.16)}px system-ui, sans-serif`; c.lineWidth = w * 0.01; c.strokeStyle = 'rgba(0,0,0,.4)'; c.fillStyle = '#fff';
  c.strokeText(`${hh}:${mm}`, w / 2, h * 0.14); c.fillText(`${hh}:${mm}`, w / 2, h * 0.14);
  c.font = `700 ${Math.round(w * 0.04)}px system-ui, sans-serif`; const d = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  c.strokeText(d, w / 2, h * 0.19); c.fillText(d, w / 2, h * 0.19); c.restore();
};
const camcorder = (c: Ctx, w: number, h: number, _f: FaceFrame[], t: number): void => {
  tint('rgba(90,120,255,.12)')(c, w, h); vignette(c, w, h, 0.35);
  c.save(); c.fillStyle = 'rgba(255,255,255,.07)'; for (let y = 0; y < h; y += 4) c.fillRect(0, y, w, 1);
  const ty = ((t * 0.12) % 1) * h; c.fillStyle = 'rgba(255,255,255,.1)'; c.fillRect(0, ty, w, h * 0.03);
  for (let i = 0; i < 140; i++) { c.fillStyle = `rgba(255,255,255,${0.06 + 0.1 * hash(i + Math.floor(t * 24))})`; c.fillRect(hash(i * 2 + Math.floor(t * 24)) * w, hash(i * 3 + Math.floor(t * 24)) * h, 2, 2); }
  c.restore();
};
const camcorderTop = (c: Ctx, w: number, h: number, t: number): void => {
  const now = new Date();
  c.save(); c.font = `700 ${Math.round(w * 0.045)}px ui-monospace, monospace`; c.fillStyle = '#ffd24a'; c.shadowColor = '#000'; c.shadowBlur = 3;
  c.textAlign = 'left'; c.fillText(now.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }).toUpperCase(), w * 0.05, h * 0.95);
  c.textAlign = 'right'; c.fillText(now.toLocaleTimeString(), w * 0.95, h * 0.95);
  c.textAlign = 'left'; c.fillStyle = '#ff3b30'; if (Math.floor(t * 2) % 2 === 0) dot(c, w * 0.07, h * 0.06, w * 0.014, '#ff3b30'); c.fillStyle = '#fff'; c.fillText('REC', w * 0.1, h * 0.068); c.restore();
};
const vintage16 = (c: Ctx, w: number, h: number): void => { tint('rgba(255,200,130,.28)')(c, w, h); tint('rgba(255,255,255,.22)', 'overlay')(c, w, h); vignette(c, w, h, 0.4, '40,20,0'); tint('rgba(90,140,255,.07)', 'screen')(c, w, h); };

const faceLens = (id: string, name: string, group: LensDef['group'], color: string, tags: string, extra: Partial<LensDef>): LensDef => ({ id, name, group, kind: 'face', color, tags, ...extra });
const lookLens = (id: string, name: string, group: LensDef['group'], color: string, tags: string, extra: Partial<LensDef>): LensDef => ({ id, name, group, kind: 'look', color, tags, ...extra });

export const MORE_LENSES: ReadonlyArray<LensDef> = [
  // animals
  faceLens('dalmatian', 'Dalmatian', 'animals', '#eceff3', 'dog puppy spotted spots ears', { face: dalmatian }),
  faceLens('deer', 'Deer', 'animals', '#c99a6a', 'antlers reindeer spots doe', { face: deer, base: (c, w, h, faces) => { eachFace(faces, (f) => { for (const s of [-0.5, 0.5]) { const [x, y] = px(f, s, 0); magnify(c, x, y, f.u * 0.5, 1.45); } }); void w; void h; } }),
  faceLens('bee', 'Honeybee', 'animals', '#ffc62e', 'bee buzz wings insect', { face: honeybee, base: (c, _w, _h, faces) => eachFace(faces, (f) => { const [x, y] = px(f, 0, 0.5); magnify(c, x, y, f.u * 2.3, 1.22); }) }),
  faceLens('koala', 'Koala', 'animals', '#8e949c', 'koala bear ears nose australia', { face: koala }),
  faceLens('tiger', 'Tiger', 'animals', '#ff9a2e', 'stripes cat big cat jungle', { face: tiger, base: tint('rgba(255,150,40,.2)') }),
  faceLens('panda', 'Panda', 'animals', '#cfd4da', 'bear china black white', { face: panda }),
  faceLens('fox', 'Fox', 'animals', '#f07a1c', 'foxy ears orange', { face: fox }),
  // funny
  faceLens('bald', 'Bald', 'funny', '#e3ab82', 'no hair shaved head funny', { base: bald, face: baldFace }),
  faceLens('beard', 'Beard', 'funny', '#5b3a22', 'beard moustache mustache man hair', { face: beard }),
  faceLens('bigmouth', 'Big Mouth', 'funny', '#ff6b6b', 'mouth lips huge funny', { base: bigMouth }),
  faceLens('bighead', 'Big Head', 'funny', '#ffb347', 'bobblehead head huge funny', { base: bigHead }),
  faceLens('zoom', 'Face Zoom', 'funny', '#4cc9f0', 'zoom mouth eyebrows funny', { base: faceZoom }),
  faceLens('popeyes', 'Pop Eyes', 'funny', '#9bf6ff', 'eyes bulge funny', { base: popEyes }),
  faceLens('biglips', 'Big Lips', 'funny', '#ff4d79', 'lips pout kiss', { base: bigLips, face: bigLipsFace }),
  faceLens('shook', 'Shook', 'funny', '#7ee0c3', 'scared panic wide eyes sweat', { base: shookEyes, face: shookFace }),
  faceLens('tiny', 'Tiny Face', 'funny', '#bdb2ff', 'small little face funny', { base: tinyFace }),
  faceLens('chin', 'Long Chin', 'funny', '#ffd6a5', 'stretch jaw funny', { base: longChin }),
  faceLens('potato', 'Potato', 'funny', '#a8723a', 'potato head funny food', { face: potato }),
  faceLens('berry', 'Strawberry', 'funny', '#e0243b', 'strawberry fruit funny food', { face: strawberry }),
  faceLens('toast', 'Toast', 'funny', '#e8b86d', 'bread slice breakfast funny food', { face: toast }),
  faceLens('scream', 'Scream', 'funny', '#d8d2c4', 'ghost mask halloween scary', { face: scream }),
  faceLens('balaclava', 'Balaclava', 'funny', '#2b2c33', 'ski mask knitted beanie', { face: balaclava }),
  faceLens('nerd', 'Nerd', 'funny', '#4da3ff', 'glasses buck teeth freckles geek', { face: nerd }),
  faceLens('moustache', 'Moustache', 'funny', '#17171b', 'mustache shades sunglasses handlebar', { face: moustache }),
  faceLens('old', 'Old Me', 'funny', '#b9bcc4', 'old age ageing grandpa wrinkles', { base: oldMe, face: oldFace }),
  faceLens('granny', 'Granny', 'funny', '#e9eaee', 'grandma old woman bun glasses', { base: oldMe, face: granny }),
  faceLens('baby', 'Baby Face', 'funny', '#ffb3d1', 'baby toddler cute young', { base: baby, face: babyFace }),
  faceLens('doll', 'Doll Face', 'funny', '#ffd1dc', 'doll porcelain big eyes', { base: dollEyes, face: dollFace }),
  faceLens('vampire', 'Vampire', 'funny', '#c1121f', 'dracula fangs blood halloween', { base: vampireLook, face: vampire }),
  faceLens('elf', 'Elf Ears', 'funny', '#ffd24a', 'fantasy pointed ears freckles', { face: elf }),
  faceLens('swap', 'Face Swap', 'funny', '#7b2cbf', 'swap faces two friends', { base: swap }),
  // beauty
  faceLens('makeup', 'Glow Makeup', 'beauty', '#ff6f91', 'glow lip tint makeup highlight', { base: (c, w, h) => { bloom(c, w, h, 0.22); tint('rgba(255,200,190,.18)')(c, w, h); }, face: makeup }),
  faceLens('freckles', 'Freckles', 'beauty', '#d98b6a', 'blush freckles cute natural', { face: freckles }),
  faceLens('neko', 'Neko Mimi', 'beauty', '#ffb3cf', 'anime cat ears blush', { face: nekoMimi }),
  faceLens('furry', 'Furry Specs', 'beauty', '#ff9ed2', 'furry glasses plush pink', { face: furryGlasses }),
  faceLens('y2k', 'Y2K Gloss', 'beauty', '#bfe4ff', 'frost gloss sparkle 2000s', { base: y2kLook, face: y2kFace }),
  faceLens('tears', 'Star Tears', 'beauty', '#e8d5ff', 'crying sparkle shimmer tears', { face: glitterTears }),
  faceLens('wing', 'Wing Liner', 'beauty', '#2b2b30', 'eyeliner wing lashes makeup', { face: eyelinerWing }),
  faceLens('peach', 'Soft Peach', 'beauty', '#ffb59e', 'peach coral warm tint', { base: peach, face: (c: Ctx, f: FaceFrame) => blush(c, 'rgba(255,140,120,.3)') }),
  faceLens('sunkiss', 'Sun-Kissed', 'beauty', '#ffa94d', 'tan bronze flare golden', { base: sunKissed, face: sunFace }),
  faceLens('hearts', 'Pink Hearts', 'beauty', '#ff7eb6', 'love hearts romantic pastel', { face: pinkHearts }),
  faceLens('clear', 'Clear Skin', 'beauty', '#ffe0d6', 'smooth skin soft glow', { base: clearSkin }),
  faceLens('cyber', 'Cyber Neon', 'beauty', '#37e0ff', 'cyberpunk neon blue magenta led', { base: cyberLook, face: cyberFace }),
  // party and seasons
  faceLens('birthday', 'Birthday', 'party', '#ff4d6d', 'party hat balloons confetti happy birthday', { face: (c: Ctx, f: FaceFrame, t: number) => partyHat(c, f, t, ['#ff4d9a', '#ffc62e'], '#4da3ff'), top: birthdayTop }),
  faceLens('santa', 'Santa Hat', 'party', '#e0262f', 'christmas snow red hat holiday', { face: santa, top: snow }),
  faceLens('halloween', 'Halloween', 'party', '#ff7a00', 'bats cobweb pumpkin spooky paint', { base: halloweenLook, face: halloweenFace, top: halloweenTop }),
  faceLens('diwali', 'Diwali', 'party', '#ffb020', 'festival lights diya deepavali tikka', { base: diwaliLook, face: diwaliFace, top: diwaliTop }),
  faceLens('newyear', 'New Year', 'party', '#ffd24a', 'fireworks countdown celebrate', { base: tint('rgba(30,10,60,.25)'), top: newYearTop }),
  faceLens('bridal', 'Bridal', 'party', '#f2b824', 'indian bride jewellery tikka wedding shaadi', { base: bridalLook, face: bridal }),
  faceLens('tricolour', 'Match Day', 'party', '#ff9933', 'cricket india flag cheer face paint jersey', { face: tricolour }),
  faceLens('hundred', '100 Stickers', 'party', '#ffc62e', 'emoji 100 fire laugh stickers', { face: hundredFace, top: emojiRing }),
  faceLens('rainbow', 'Rainbow', 'party', '#ff4da6', 'rainbow vomit puke colourful mouth', { face: (c: Ctx, f: FaceFrame, t: number) => stream(c, f, t, 'rainbow') }),
  faceLens('lovepuke', 'Heart Puke', 'party', '#ff7eb6', 'hearts puke mouth love', { face: (c: Ctx, f: FaceFrame, t: number) => stream(c, f, t, 'hearts') }),
  faceLens('butterfly', 'Butterflies', 'party', '#f2b824', 'butterfly crown golden', { face: butterflyCrown, base: (c, w, h) => bloom(c, w, h, 0.12) }),
  // more looks
  lookLens('brighten', 'Brighten', 'looks', '#fff3c4', 'bright light dark room exposure', { base: brighten }),
  lookLens('sepia', 'Sepia', 'looks', '#b98a56', 'old brown antique', { base: sepia }),
  lookLens('contrast', 'Contrast', 'looks', '#9aa0a8', 'punchy deep colours pop', { base: contrast }),
  lookLens('clock', 'Clock', 'looks', '#9bb7ff', 'time date overlay', { top: clockTop }),
  lookLens('camcorder', 'Camcorder', 'looks', '#ff5b5b', 'vhs 90s retro rec tape', { base: camcorder, top: camcorderTop }),
  lookLens('vintage16', 'Vintage 2016', 'looks', '#e9b872', 'throwback 2016 warm', { base: vintage16 })
];
