// What a finger (or the mouse) does on the picture: pick a sticker, drag it, turn and resize it from its corner handle, pinch it with two fingers, and (when no sticker is picked) move and
// zoom the photo behind. Only numbers in, numbers out, so it is tested without a screen (scripts/supabase/test-stickers.mjs).
import { BOX } from './kit.ts';
import { stickerById } from './catalog.ts';
import { handleRadius, handlesOf, isBuddy, sizeLimits } from './scene.ts';
import type { PhotoSrc, Placed, Pt } from './scene.ts';
import type { Win } from './frames.ts';

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const MAX_ZOOM = 4;

/** a point of the picture (pixels) in the sticker's own units (the 200 x 200 box, centre 0,0, before turning and mirroring) */
export function toLocal(p: Placed, px: number, py: number, W: number, H: number): Pt {
  const dx = px - p.x * W, dy = py - p.y * H, cs = Math.cos(-p.r), sn = Math.sin(-p.r), u = (p.s * W) / BOX;
  const lx = (dx * cs - dy * sn) / u, ly = (dx * sn + dy * cs) / u;
  return { x: p.flip ? -lx : lx, y: ly };
}

export function hitSticker(p: Placed, px: number, py: number, W: number, H: number, pad = 6): boolean {
  const d = stickerById(p.id), l = toLocal(p, px, py, W, H);
  return Math.abs(l.x) <= (d?.bw ?? 92) + pad && Math.abs(l.y) <= (d?.bh ?? 92) + pad;
}

/** the sticker on top at this point (the last one drawn), or null */
export function pickTop(list: ReadonlyArray<Placed>, px: number, py: number, W: number, H: number): number | null {
  for (let i = list.length - 1; i >= 0; i--) if (hitSticker(list[i], px, py, W, H)) return list[i].uid;
  return null;
}

export type HandleHit = 'del' | 'turn' | null;
/** is this point on the picked sticker's delete or turn / resize handle? (a finger is bigger than a mouse: touch = a wider target) */
export function pickHandle(p: Placed, px: number, py: number, W: number, H: number, touch = false, unit?: number): HandleHit {
  const h = handlesOf(p, W, H), r = handleRadius(W, unit) * (touch ? 1.7 : 1.25);
  const near = (a: Pt): boolean => Math.hypot(a.x - px, a.y - py) <= r;
  if (near(h.br)) return 'turn';
  if (near(h.tl)) return 'del';
  return null;
}

/** dragging the handle at the corner: the size follows the distance from the centre, the turning follows the angle */
export function dragHandle(p0: Placed, start: Pt, now: Pt, W: number, H: number): { s: number; r: number } {
  const c = { x: p0.x * W, y: p0.y * H }, lim = sizeLimits(p0.id);
  const d0 = Math.hypot(start.x - c.x, start.y - c.y) || 1, d1 = Math.hypot(now.x - c.x, now.y - c.y) || 1;
  const a0 = Math.atan2(start.y - c.y, start.x - c.x), a1 = Math.atan2(now.y - c.y, now.x - c.x);
  // a buddy stands on the ground: it only gets bigger or smaller, it is never turned
  return { s: clamp(p0.s * (d1 / d0), lim.min, lim.max), r: isBuddy(p0.id) ? 0 : p0.r + (a1 - a0) };
}

/** two fingers: how much further apart (a ratio), how much turned (radians), and where the middle was and is */
export function pinchOf(a0: Pt, b0: Pt, a1: Pt, b1: Pt): { k: number; dr: number; mid0: Pt; mid1: Pt } {
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y) || 1, d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y) || 1;
  let dr = Math.atan2(b1.y - a1.y, b1.x - a1.x) - Math.atan2(b0.y - a0.y, b0.x - a0.x);
  while (dr > Math.PI) dr -= 2 * Math.PI;
  while (dr < -Math.PI) dr += 2 * Math.PI;
  return { k: d1 / d0, dr, mid0: { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 }, mid1: { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 } };
}

/** a sticker moved by dx, dy pixels; its middle always stays on the picture */
export function moved(p: Placed, dx: number, dy: number, W: number, H: number): Placed {
  return { ...p, x: clamp(p.x + dx / W, 0, 1), y: clamp(p.y + dy / H, 0, 1) };
}

export function pinched(p0: Placed, a0: Pt, b0: Pt, a1: Pt, b1: Pt, W: number, H: number): Placed {
  const g = pinchOf(a0, b0, a1, b1), lim = sizeLimits(p0.id);
  return { ...p0, s: clamp(p0.s * g.k, lim.min, lim.max), r: isBuddy(p0.id) ? 0 : p0.r + g.dr, x: clamp(p0.x + (g.mid1.x - g.mid0.x) / W, 0, 1), y: clamp(p0.y + (g.mid1.y - g.mid0.y) / H, 0, 1) };
}

/** the photo moved by dx, dy pixels (dragging it): the pan that makes the photo follow the finger */
export function panned(photo: PhotoSrc, win: Win, zoom: number, panX: number, panY: number, dx: number, dy: number): { panX: number; panY: number } {
  const k = Math.max(win.w / photo.w, win.h / photo.h) * Math.max(1, zoom);
  const ex = (photo.w * k - win.w) / 2, ey = (photo.h * k - win.h) / 2;
  return { panX: ex > 0.5 ? clamp(panX + dx / ex, -1, 1) : 0, panY: ey > 0.5 ? clamp(panY + dy / ey, -1, 1) : 0 };
}

export const zoomed = (zoom0: number, k: number): number => clamp(zoom0 * k, 1, MAX_ZOOM);
