import type { FaceFrame } from './types.ts';
import { MANNEQUIN, scaleFace } from './faceMath.ts';
import { TAU, inFace, lin, rad, rr } from './draw.ts';
import type { Ctx } from './draw.ts';
import type { LensDef } from './catalog.ts';

/** Draw one picture: the camera frame (or photo) as it is, then the lens on top of it. `faces` are as the tracker gives them (cx / cy / u as fractions of the picture). */
export function renderScene(c: Ctx, w: number, h: number, source: CanvasImageSource, mirror: boolean, faces: ReadonlyArray<FaceFrame>, lens: LensDef, t: number): void {
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  c.shadowBlur = 0;
  if (mirror) { c.translate(w, 0); c.scale(-1, 1); }
  c.drawImage(source, 0, 0, w, h);
  c.restore();
  const px = faces.map((f) => scaleFace(f, w, h));
  lens.base?.(c, w, h, px, t);
  const draw = lens.face;
  if (draw) {
    for (const f of px) {
      if (f.seen < 0.02) continue;
      c.save();
      c.globalAlpha = f.seen;
      inFace(c, f, () => draw(c, f, t));
      c.restore();
    }
  }
  lens.top?.(c, w, h, t);
}

// ---------------------------------------------------------------- the little pictures in the lens list: the lens drawn on a made-up face, by the very same code as the camera uses
function mannequinPicture(size: number, color: string): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d') as Ctx;
  const bg = lin(c, 0, 0, size, size, [[0, '#2a2f3d'], [1, '#141720']]);
  c.fillStyle = bg; c.fillRect(0, 0, size, size);
  c.fillStyle = rad(c, size * 0.5, size * 0.55, 0, size * 0.5, size * 0.55, size * 0.7, [[0, color + 'aa'], [1, color + '00']]);
  c.fillRect(0, 0, size, size);
  const f: FaceFrame = { ...MANNEQUIN, cx: size * 0.5, cy: size * 0.56, u: size * 0.19 };
  inFace(c, f, () => {
    // shoulders and neck
    c.fillStyle = '#3d4f78'; c.beginPath(); c.ellipse(0, f.chin + 1.25, 2.1, 0.95, 0, 0, TAU); c.fill();
    c.fillStyle = '#d29f78'; rr(c, -0.4, f.chin - 0.35, 0.8, 0.8, 0.2); c.fill();
    // hair at the back, then the head
    c.fillStyle = '#2a1d14'; c.beginPath(); c.ellipse(0, f.top + 0.45, f.halfW * 1.1, 1.0, 0, 0, TAU); c.fill();
    c.fillStyle = lin(c, 0, f.top, 0, f.chin, [[0, '#f6d2b0'], [1, '#e3ab82']]);
    c.beginPath(); c.ellipse(0, (f.top + f.chin) / 2 + 0.08, f.halfW * 0.98, (f.chin - f.top) / 2 + 0.02, 0, 0, TAU); c.fill();
    c.fillStyle = '#2a1d14';   // a fringe
    c.beginPath(); c.moveTo(-f.halfW * 0.95, f.top + 0.5); c.quadraticCurveTo(-0.2, f.top - 0.05, 0.1, f.top + 0.05); c.quadraticCurveTo(0.7, f.top - 0.02, f.halfW * 0.95, f.top + 0.5);
    c.quadraticCurveTo(0.5, f.top + 0.28, 0, f.top + 0.34); c.quadraticCurveTo(-0.5, f.top + 0.3, -f.halfW * 0.95, f.top + 0.5); c.fill();
    // ears, eyes, brows, nose, mouth
    c.fillStyle = '#e3ab82'; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * (f.halfW + 0.02), 0.25, 0.1, 0.22, 0, 0, TAU); c.fill(); }
    for (const x of [-0.5, 0.5]) {
      c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x, 0, 0.19, 0.115, 0, 0, TAU); c.fill();
      c.fillStyle = '#3a2a1e'; c.beginPath(); c.arc(x, 0, 0.09, 0, TAU); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x - 0.03, -0.03, 0.025, 0, TAU); c.fill();
      c.strokeStyle = '#2a1d14'; c.lineWidth = 0.05; c.lineCap = 'round'; c.beginPath(); c.moveTo(x - 0.2, f.brow + 0.03); c.quadraticCurveTo(x, f.brow - 0.05, x + 0.2, f.brow + 0.02); c.stroke();
    }
    c.strokeStyle = 'rgba(150,80,50,.55)'; c.lineWidth = 0.03; c.beginPath(); c.moveTo(0, 0.3); c.quadraticCurveTo(-0.1, f.nose.y, 0.0, f.nose.y + 0.04); c.stroke();
    c.fillStyle = '#7a2a2a'; c.beginPath(); c.ellipse(0, f.mouth.y + 0.08, f.mouthW * 0.38, 0.1 + f.mouthOpen * 0.16, 0, 0, TAU); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.ellipse(0, f.mouth.y - 0.02, f.mouthW * 0.3, 0.05, 0, 0, TAU); c.fill();
  });
  return cv;
}

/** The little round picture of a lens for the list, as a data address. */
export function lensThumb(lens: LensDef, size = 168): string {
  const src = mannequinPicture(size, lens.color);
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const c = out.getContext('2d') as Ctx;
  const face: FaceFrame = { ...MANNEQUIN, cx: 0.5, cy: 0.56, u: 0.19 };
  renderScene(c, size, size, src, false, [face], lens, 2.2);
  return out.toDataURL('image/jpeg', 0.86);
}
