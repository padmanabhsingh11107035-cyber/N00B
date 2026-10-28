import type { FaceFrame } from './types.ts';
import { MANNEQUIN, placeFace } from './faceMath.ts';
import { coverRect } from './frame.ts';
import { TAU, inFace, lin, rad, rr } from './draw.ts';
import type { Ctx } from './draw.ts';
import type { LensDef } from './catalog.ts';

/**
 * Draw one picture of w x h pixels: the camera frame (or photo, sw x sh) filling it, as it is (cut at the edges when the shape is not the camera's own), then the lens on top of it.
 * `faces` are as the tracker gives them (cx / cy / u as fractions of the camera frame); a little turning of the head squeezes what is drawn on it, as a real turn would.
 */
export function renderScene(c: Ctx, w: number, h: number, source: CanvasImageSource, sw: number, sh: number, mirror: boolean, faces: ReadonlyArray<FaceFrame>, lens: LensDef, t: number): void {
  const r = coverRect(sw, sh, w, h);
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  c.shadowBlur = 0;
  if (mirror) { c.translate(r.dx + r.dw, r.dy); c.scale(-1, 1); c.drawImage(source, 0, 0, r.dw, r.dh); } else c.drawImage(source, r.dx, r.dy, r.dw, r.dh);
  c.restore();
  const px = faces.map((f) => placeFace(f, r));
  lens.base?.(c, w, h, px, t);
  const draw = lens.face;
  if (draw) {
    for (const f of px) {
      if (f.seen < 0.02) continue;
      c.save();
      c.globalAlpha = f.seen;
      inFace(c, f, () => { c.translate(f.yaw * 0.08, 0); c.scale(1 - 0.16 * Math.abs(f.yaw), 1); draw(c, f, t); });
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
  c.fillStyle = lin(c, 0, 0, size, size, [[0, '#2a2f3d'], [1, '#141720']]); c.fillRect(0, 0, size, size);
  c.fillStyle = rad(c, size * 0.5, size * 0.55, 0, size * 0.5, size * 0.55, size * 0.7, [[0, color + 'aa'], [1, color + '00']]);
  c.fillRect(0, 0, size, size);
  const f: FaceFrame = { ...MANNEQUIN, cx: size * 0.5, cy: size * 0.6, u: size * 0.165 };
  inFace(c, f, () => {
    const mid = (f.skull + f.chin) / 2 + 0.02, ry = (f.chin - f.skull) / 2, rx = f.halfW + 0.02;
    c.fillStyle = '#3d4f78'; c.beginPath(); c.ellipse(0, f.chin + 1.5, 2.5, 1.1, 0, 0, TAU); c.fill();                  // shoulders
    c.fillStyle = '#d29f78'; rr(c, -0.5, f.chin - 0.55, 1.0, 1.0, 0.25); c.fill();                                       // neck
    c.fillStyle = '#e3ab82'; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * (f.temple + 0.02), 0.4, 0.11, 0.32, 0, 0, TAU); c.fill(); }   // ears
    c.fillStyle = lin(c, 0, f.skull, 0, f.chin, [[0, '#f6d2b0'], [1, '#e3ab82']]);                                      // head
    c.beginPath(); c.ellipse(0, mid, rx, ry, 0, 0, TAU); c.fill();
    c.fillStyle = '#2a1d14';                                                                                              // hair: over the top of the head, down to a hairline with a fringe
    c.beginPath(); c.ellipse(0, mid, rx + 0.02, ry + 0.02, 0, Math.PI, TAU); c.lineTo(rx * 0.9, -0.45);
    c.quadraticCurveTo(0.7, f.hair + 0.05, 0.2, f.hair + 0.12); c.quadraticCurveTo(-0.3, f.hair + 0.2, -0.75, f.hair + 0.1); c.quadraticCurveTo(-rx * 0.8, -0.8, -rx * 0.9, -0.45); c.closePath(); c.fill();
    for (const x of [-0.5, 0.5]) {                                                                                         // eyes and brows
      c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x, 0, 0.2, 0.1, 0, 0, TAU); c.fill();
      c.fillStyle = '#3a2a1e'; c.beginPath(); c.arc(x, 0, 0.085, 0, TAU); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x - 0.03, -0.03, 0.025, 0, TAU); c.fill();
      c.strokeStyle = '#2a1d14'; c.lineWidth = 0.055; c.lineCap = 'round'; c.beginPath(); c.moveTo(x - 0.26, f.brow + 0.05); c.quadraticCurveTo(x, f.brow - 0.06, x + 0.26, f.brow + 0.04); c.stroke();
    }
    c.strokeStyle = 'rgba(150,80,50,.55)'; c.lineWidth = 0.03; c.beginPath(); c.moveTo(0.02, 0.15); c.quadraticCurveTo(-0.1, f.nose.y, -0.02, f.base - 0.02); c.stroke();   // the nose
    c.fillStyle = '#7a2a2a'; c.beginPath(); c.ellipse(0, f.mouth.y, f.mouthW * 0.38, (f.lipLow - f.lipUp) / 2 + 0.02, 0, 0, TAU); c.fill();                     // the open mouth
    c.fillStyle = '#fff'; c.beginPath(); c.ellipse(0, f.lipUp + 0.03, f.mouthW * 0.3, 0.045, 0, 0, TAU); c.fill();
  });
  return cv;
}

/** The little round picture of a lens for the list, as a data address. */
export function lensThumb(lens: LensDef, size = 168): string {
  const src = mannequinPicture(size, lens.color);
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const c = out.getContext('2d') as Ctx;
  const face: FaceFrame = { ...MANNEQUIN, cx: 0.5, cy: 0.6, u: 0.165 };
  renderScene(c, size, size, src, size, size, false, [face], lens, 2.2);
  return out.toDataURL('image/jpeg', 0.86);
}
