// Putting a picture together: the frame, the photo in its window, the buddies and stickers on top, the buddy's name tag, and the NOOB wordmark last (so nothing can cover it). One function
// draws it for the live preview, for the saved picture and for every picture of the saved video, so what is seen is what is saved.
import { BOX, FONT_LATIN, LOOP, TAU, lin, pRR } from './kit.ts';
import type { Ctx, Kit } from './kit.ts';
import { stickerById } from './catalog.ts';
import { drawCaption, drawFrameBack, drawFrameFront, drawTag, frameById, windowOf } from './frames.ts';
import type { FrameId, Logo, Win } from './frames.ts';

export type ShapeId = '4:5' | '1:1' | '9:16';
export interface ShapeDef { id: ShapeId; label: string; note: string; w: number; h: number }
export const SHAPES: ReadonlyArray<ShapeDef> = [
  { id: '4:5', label: '4:5', note: 'Posts', w: 1080, h: 1350 },
  { id: '1:1', label: '1:1', note: 'Square', w: 1080, h: 1080 },
  { id: '9:16', label: '9:16', note: 'Stories', w: 1080, h: 1920 }
];
export const shapeById = (id: string): ShapeDef => SHAPES.find((s) => s.id === id) || SHAPES[0];

/** a photo (or the moving picture of the camera): what to draw and how big it is */
export interface PhotoSrc { img: CanvasImageSource; w: number; h: number }

/** One buddy or sticker on the picture. x and y are fractions of the picture's width and height (so a change of shape keeps it in place); s is its size as a fraction of the width; r is turning, in radians. */
export interface Placed { uid: number; id: string; x: number; y: number; s: number; r: number; flip: boolean }

export interface Scene {
  shape: ShapeId;
  frame: FrameId;
  photo: PhotoSrc | null;
  /** 1 = the photo just fills its window; more = zoomed in */
  zoom: number;
  /** -1 .. 1: which part of a zoomed or cut photo is shown (0 = the middle) */
  panX: number;
  panY: number;
  /** buddies first (they stand in the scene), then the stickers on top: addPlaced keeps that order */
  stickers: ReadonlyArray<Placed>;
  /** the photo is shown as in a mirror (the selfie camera) */
  mirror?: boolean;
  /** the name tag of the buddy (default: shown when there is a buddy) */
  tag?: boolean;
}

export const MIN_SIZE = 0.07;
export const MAX_SIZE = 1.3;
export const START_SIZE = 0.34;
export const MAX_STICKERS = 24;
export const MAX_BUDDIES = 3;
/** the ground sits at this fraction of the box height below its middle (the feet stand there) */
export const FEET = 0.465;

export const isBuddy = (id: string): boolean => !!stickerById(id)?.buddy;
/** a buddy may be made smaller or larger than a sticker may */
export const sizeLimits = (id: string): { min: number; max: number } => (isBuddy(id) ? { min: 0.2, max: 1.2 } : { min: MIN_SIZE, max: MAX_SIZE });

/** a new one goes on top of its own kind: the buddies stand at the back (they are the scene), the stickers go over them */
export function addPlaced(list: ReadonlyArray<Placed>, p: Placed): Placed[] {
  if (!isBuddy(p.id)) return [...list, p];
  const at = list.findIndex((q) => !isBuddy(q.id));
  return at < 0 ? [...list, p] : [...list.slice(0, at), p, ...list.slice(at)];
}
/** bring one to the front of its own kind */
export function toFront(list: ReadonlyArray<Placed>, uid: number): Placed[] {
  const p = list.find((q) => q.uid === uid);
  if (!p) return [...list];
  const rest = list.filter((q) => q.uid !== uid);
  return addPlaced(rest, p);
}

/** where a buddy first stands: its feet on the floor of the photo, on the left (side -1) or the right (side 1) */
export function startSpot(id: string, shape: ShapeId, frame: FrameId, side: -1 | 1): { x: number; y: number; s: number } {
  const d = stickerById(id), sh = shapeById(shape), win = windowOf(frameById(frame), sh.w, sh.h);
  const s = d?.buddy?.size ?? START_SIZE;
  const feet = win.y + win.h * 0.94;
  return { x: (win.x + win.w * (0.5 + side * 0.2)) / sh.w, y: (feet - FEET * s * sh.w) / sh.h, s };
}

/** where the "stand here" box is for the person: on the side of the photo the first buddy is not on (fractions of the window) */
export function guideSpot(list: ReadonlyArray<Placed>, shape: ShapeId, frame: FrameId): { cx: number; fy: number; hh: number } | null {
  const first = list.find((p) => isBuddy(p.id));
  if (!first) return null;
  const sh = shapeById(shape), win = windowOf(frameById(frame), sh.w, sh.h);
  const bx = (first.x * sh.w - win.x) / win.w;
  return { cx: bx < 0.5 ? 0.72 : 0.28, fy: 0.94, hh: 0.62 };
}

/** When the shape or the frame changes the photo's window changes too: every buddy and sticker keeps its place inside the window (and its size next to the window), so a buddy keeps standing on the floor. */
export function reflow(list: ReadonlyArray<Placed>, from: { shape: ShapeId; frame: FrameId }, to: { shape: ShapeId; frame: FrameId }): Placed[] {
  const a = shapeById(from.shape), b = shapeById(to.shape), wa = windowOf(frameById(from.frame), a.w, a.h), wb = windowOf(frameById(to.frame), b.w, b.h);
  return list.map((p) => ({
    ...p,
    x: (wb.x + ((p.x * a.w - wa.x) / wa.w) * wb.w) / b.w,
    y: (wb.y + ((p.y * a.h - wa.y) / wa.h) * wb.h) / b.h,
    s: (p.s * a.w * (wb.w / wa.w)) / b.w
  }));
}

const kitAt = (t: number, sil: boolean): Kit => ({ t, ph: (t / LOOP) * TAU, sil, out: 6 });
/** a time inside the loop */
export const inLoop = (t: number): number => { const v = t % LOOP; return v < 0 ? v + LOOP : v; };

/** where the photo is drawn so that it fills the window (cut at the edges) with the zoom and the pan */
export function photoRect(p: PhotoSrc, win: Win, zoom: number, panX: number, panY: number): { x: number; y: number; w: number; h: number } {
  const k = Math.max(win.w / p.w, win.h / p.h) * Math.max(1, zoom);
  const w = p.w * k, h = p.h * k, ex = (w - win.w) / 2, ey = (h - win.h) / 2;
  const cl = (v: number): number => Math.max(-1, Math.min(1, v));
  return { x: win.x - ex + cl(panX) * ex, y: win.y - ey + cl(panY) * ey, w, h };
}

/** Draw one sticker or buddy with its transform. A sticker gets its white edge and soft shadow first, then its colours; a buddy is drawn in colour only (it makes its own shadow on the ground).
 *  `size` is the width of its 200-unit box in pixels. */
export function drawSticker(c: Ctx, id: string, cx: number, cy: number, size: number, rot: number, flip: boolean, t: number): void {
  const d = stickerById(id);
  if (!d) return;
  c.save();
  c.translate(cx, cy);
  if (rot) c.rotate(rot);
  if (flip && !d.text) c.scale(-1, 1);
  const u = size / BOX;
  c.scale(u, u);
  const tt = inLoop(t);
  if (d.outline !== false) {
    c.save();
    c.shadowColor = 'rgba(25,10,45,.4)'; c.shadowBlur = size * 0.05; c.shadowOffsetY = size * 0.022;
    d.draw(c, kitAt(tt, true));
    c.restore();
  }
  d.draw(c, kitAt(tt, false));
  c.restore();
}

// ------------------------------------------------------------------ the name tag: "NOOB Buddy" and the buddy's name, on a white card near the buddy
export interface NameTag { x: number; y: number; w: number; h: number; rot: number; top: string; name: string }

const joinNames = (names: ReadonlyArray<string>): string => (names.length <= 1 ? names[0] || '' : names.length === 2 ? `${names[0]} & ${names[1]}` : `${names[0]}, ${names[1]} +${names.length - 2}`);

/** the tag for the buddies on the picture: above the first buddy's head (or under its feet when there is no room above), and always inside the photo; null = no buddy */
export function nameTagOf(c: Ctx, list: ReadonlyArray<Placed>, W: number, H: number, win: Win): NameTag | null {
  const bs = list.filter((p) => isBuddy(p.id));
  if (!bs.length) return null;
  const first = bs[0], name = joinNames(bs.map((p) => stickerById(p.id)?.name || ''));
  const h = Math.round(W * 0.078), pad = h * 0.3, badge = h * 0.64, top = 'NOOB Buddy';
  c.save();
  c.font = `800 ${Math.round(h * 0.44)}px ${FONT_LATIN}`; const wName = c.measureText(name).width;
  c.font = `700 ${Math.round(h * 0.25)}px ${FONT_LATIN}`; const wTop = c.measureText(top).width;
  c.restore();
  const w = Math.round(pad + badge + pad * 0.7 + Math.max(wName, wTop) + pad * 1.1), u = (first.s * W) / BOX, m = W * 0.02;
  let x = first.x * W, y = first.y * H - 100 * u - h * 0.65;
  if (y - h / 2 < win.y + m) y = first.y * H + FEET * BOX * u + h * 0.85;
  x = Math.min(win.x + win.w - w / 2 - m, Math.max(win.x + w / 2 + m, x));
  y = Math.min(win.y + win.h - h / 2 - m, Math.max(win.y + h / 2 + m, y));
  return { x, y, w, h, rot: first.flip ? 0.045 : -0.045, top, name };
}

function drawNameTag(c: Ctx, t: NameTag, W: number): void {
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.translate(t.x, t.y); c.rotate(t.rot);
  const { w, h } = t;
  c.shadowColor = 'rgba(20,10,40,.38)'; c.shadowBlur = W * 0.014; c.shadowOffsetY = W * 0.004;
  pRR(c, -w / 2, -h / 2, w, h, h * 0.3); c.fillStyle = 'rgba(255,255,255,.97)'; c.fill();
  c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0;
  const br = h * 0.32, bx = -w / 2 + h * 0.3 + br;
  c.beginPath(); c.arc(bx, 0, br, 0, TAU); c.fillStyle = lin(c, bx - br, -br, bx + br, br, [[0, '#a855f7'], [1, '#ff4fb0']]); c.fill();
  c.fillStyle = '#fff'; c.font = `900 ${Math.round(br * 1.25)}px ${FONT_LATIN}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('N', bx, br * 0.06);
  const tx = bx + br + h * 0.2;
  c.textAlign = 'left';
  c.fillStyle = '#8a8499'; c.font = `700 ${Math.round(h * 0.25)}px ${FONT_LATIN}`; c.fillText(t.top, tx, -h * 0.2);
  c.fillStyle = '#1f1530'; c.font = `800 ${Math.round(h * 0.44)}px ${FONT_LATIN}`; c.fillText(t.name, tx, h * 0.17);
  c.restore();
}

// ------------------------------------------------------------------ the "stand here" box for the person (only in the live preview: never in a saved picture)
export interface Guide { cx: number; fy: number; hh: number }

function drawStandHere(c: Ctx, win: Win, g: Guide, t: number): void {
  // the box is as tall as asked, but never wider than 42% of the window, and always inside it
  let bh = win.h * g.hh, bw = bh * 0.56;
  if (bw > win.w * 0.42) { bw = win.w * 0.42; bh = bw / 0.56; }
  const m = win.w * 0.03, cx = Math.min(win.x + win.w - m - bw / 2, Math.max(win.x + m + bw / 2, win.x + win.w * g.cx));
  const feet = win.y + win.h * g.fy, top = feet - bh, breathe = 0.9 + 0.1 * Math.sin((t / LOOP) * TAU * 2);
  c.save();
  c.lineCap = 'round'; c.lineJoin = 'round';
  // the corners of the box: white, with a thin dark-blue line round them so they show on any photo (the corners breathe a little instead of fading)
  const lw = Math.max(2.5, win.w * 0.006), L = bw * 0.2 * breathe, x0 = cx - bw / 2, x1 = cx + bw / 2, y0 = top - bh * 0.04, y1 = feet + bh * 0.03;
  c.beginPath();
  c.moveTo(x0, y0 + L); c.lineTo(x0, y0); c.lineTo(x0 + L, y0);
  c.moveTo(x1 - L, y0); c.lineTo(x1, y0); c.lineTo(x1, y0 + L);
  c.moveTo(x1, y1 - L); c.lineTo(x1, y1); c.lineTo(x1 - L, y1);
  c.moveTo(x0 + L, y1); c.lineTo(x0, y1); c.lineTo(x0, y1 - L);
  c.strokeStyle = '#111184'; c.lineWidth = lw * 2.6; c.stroke();
  c.strokeStyle = '#ffffff'; c.lineWidth = lw; c.stroke();
  // the person: one white shape (a head, a body, two legs: drawn as one path so nothing is painted twice), in a box of 1 x 1 whose middle is the middle of the person
  c.translate(cx, top + bh / 2); c.scale(bh, bh);
  const rr = (x: number, y: number, w: number, h: number, r: number): void => {
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  };
  c.beginPath();
  c.moveTo(0.075, -0.39); c.arc(0, -0.39, 0.075, 0, TAU);
  rr(-0.17, -0.29, 0.34, 0.27, 0.07);
  rr(-0.145, -0.05, 0.135, 0.55, 0.05);
  rr(0.01, -0.05, 0.135, 0.55, 0.05);
  c.strokeStyle = '#111184'; c.lineWidth = 0.02; c.stroke();
  c.fillStyle = '#ffffff'; c.fill();
  c.restore();
}

export interface RenderOpts {
  /** seconds (any number: it is taken inside the loop) */
  t: number;
  logo: Logo | null;
  /** the sticker that is picked, and whether to draw its frame and handles (only the live preview does) */
  selected?: number | null;
  guides?: boolean;
  /** the "stand here" box (only the live preview) */
  guide?: Guide | null;
  /** picture pixels for one screen pixel (the live preview: the handles keep the same size on the screen) */
  unit?: number;
}

export function renderScene(c: Ctx, sc: Scene, W: number, H: number, o: RenderOpts): void {
  const f = frameById(sc.frame), win = windowOf(f, W, H), t = inLoop(o.t);
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, W, H);
  drawFrameBack(c, f, W, H, t, win);
  c.save();
  c.beginPath(); c.moveTo(win.x + win.r, win.y);
  c.arcTo(win.x + win.w, win.y, win.x + win.w, win.y + win.h, win.r); c.arcTo(win.x + win.w, win.y + win.h, win.x, win.y + win.h, win.r);
  c.arcTo(win.x, win.y + win.h, win.x, win.y, win.r); c.arcTo(win.x, win.y, win.x + win.w, win.y, win.r); c.closePath();
  c.clip();
  if (sc.photo) {
    const r = photoRect(sc.photo, win, sc.zoom, sc.panX, sc.panY);
    c.save();
    if (sc.mirror) { const mid = win.x + win.w / 2; c.translate(mid, 0); c.scale(-1, 1); c.translate(-mid, 0); }
    c.drawImage(sc.photo.img, r.x, r.y, r.w, r.h);
    c.restore();
  } else {
    c.fillStyle = '#1a1424'; c.fillRect(win.x, win.y, win.w, win.h);
  }
  if (o.guide) drawStandHere(c, win, o.guide, t);
  c.restore();
  drawFrameFront(c, f, W, H, t, win);
  for (const p of sc.stickers) drawSticker(c, p.id, p.x * W, p.y * H, p.s * W, p.r, p.flip, t);
  const hasBuddy = sc.stickers.some((p) => isBuddy(p.id));
  if (hasBuddy && sc.tag !== false) { const nt = nameTagOf(c, sc.stickers, W, H, win); if (nt) drawNameTag(c, nt, W); }
  if (hasBuddy) drawCaption(c, f, W, H, win, '#NOOBbuddies');
  drawTag(c, f, W, H, win, o.logo);
  if (o.guides && o.selected != null) {
    const p = sc.stickers.find((s) => s.uid === o.selected);
    if (p) drawGuides(c, p, W, H, o.unit);
  }
  c.restore();
}

// ------------------------------------------------------------------ the picked one: its frame and its two handles
export interface Pt { x: number; y: number }
export interface Handles { tl: Pt; tr: Pt; br: Pt; bl: Pt; center: Pt }

export function handlesOf(p: Placed, W: number, H: number): Handles {
  const d = stickerById(p.id), hw = (d?.bw ?? 92) + 4, hh = (d?.bh ?? 92) + 4, u = (p.s * W) / BOX, cs = Math.cos(p.r), sn = Math.sin(p.r);
  const at = (lx: number, ly: number): Pt => ({ x: p.x * W + (lx * cs - ly * sn) * u, y: p.y * H + (lx * sn + ly * cs) * u });
  return { tl: at(-hw, -hh), tr: at(hw, -hh), br: at(hw, hh), bl: at(-hw, hh), center: { x: p.x * W, y: p.y * H } };
}
/** the size of a handle: 11 screen pixels (`unit` = picture pixels for one screen pixel; when it is not known it is taken from a phone-wide picture) */
export const handleRadius = (W: number, unit?: number): number => 11 * (unit ?? W / 360);

function drawGuides(c: Ctx, p: Placed, W: number, H: number, unit?: number): void {
  const h = handlesOf(p, W, H), r = handleRadius(W, unit), standing = isBuddy(p.id), u = unit ?? W / 360;
  c.save();
  c.lineJoin = 'round'; c.lineCap = 'round';
  // the frame round it: a dark-blue line under a white dashed one (so it shows on any photo)
  c.beginPath(); c.moveTo(h.tl.x, h.tl.y); c.lineTo(h.tr.x, h.tr.y); c.lineTo(h.br.x, h.br.y); c.lineTo(h.bl.x, h.bl.y); c.closePath();
  c.strokeStyle = '#111184'; c.lineWidth = 3.6 * u; c.stroke();
  c.setLineDash([6 * u, 4 * u]); c.strokeStyle = '#ffffff'; c.lineWidth = 1.6 * u; c.stroke();
  c.setLineDash([]);
  const disc = (pt: Pt): void => { c.beginPath(); c.arc(pt.x, pt.y, r, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); c.strokeStyle = '#111184'; c.lineWidth = r * 0.16; c.stroke(); };
  c.strokeStyle = '#111184'; c.lineWidth = r * 0.2;
  // delete (top left): a cross
  disc(h.tl);
  c.beginPath(); c.moveTo(h.tl.x - r * 0.4, h.tl.y - r * 0.4); c.lineTo(h.tl.x + r * 0.4, h.tl.y + r * 0.4); c.moveTo(h.tl.x + r * 0.4, h.tl.y - r * 0.4); c.lineTo(h.tl.x - r * 0.4, h.tl.y + r * 0.4); c.stroke();
  // resize (a buddy) or turn + resize (a sticker), bottom right
  disc(h.br);
  if (standing) {
    const a = r * 0.46;
    c.beginPath(); c.moveTo(h.br.x - a, h.br.y + a); c.lineTo(h.br.x + a, h.br.y - a);
    c.moveTo(h.br.x + a, h.br.y - a); c.lineTo(h.br.x + a * 0.2, h.br.y - a); c.moveTo(h.br.x + a, h.br.y - a); c.lineTo(h.br.x + a, h.br.y - a * 0.2);
    c.moveTo(h.br.x - a, h.br.y + a); c.lineTo(h.br.x - a * 0.2, h.br.y + a); c.moveTo(h.br.x - a, h.br.y + a); c.lineTo(h.br.x - a, h.br.y + a * 0.2);
    c.stroke();
  } else {
    c.beginPath(); c.arc(h.br.x, h.br.y, r * 0.5, Math.PI * 0.15, Math.PI * 1.3); c.stroke();
    c.beginPath(); c.moveTo(h.br.x - r * 0.62, h.br.y - r * 0.25); c.lineTo(h.br.x - r * 0.5, h.br.y - r * 0.5); c.lineTo(h.br.x - r * 0.2, h.br.y - r * 0.42); c.stroke();
  }
  c.restore();
}
