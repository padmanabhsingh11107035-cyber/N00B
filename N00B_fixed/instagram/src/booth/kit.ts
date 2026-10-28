// The drawing kit of the Sticker Booth. Every sticker is code: it is drawn on a canvas in a 200 x 200 box (centre 0,0) and moves with the time `t`, so it needs no picture files and stays sharp at any size.
//
// Every moving sticker repeats after LOOP seconds, so a saved video loops without a jump. To keep that true, an animation uses whole numbers of turns per loop (wave(k, 3) = three waves in a loop).
//
// A sticker is drawn twice by the Booth: first as a white copy (k.sil = true: the white "die-cut" edge and the soft shadow every real sticker has), then in colour. So a sticker never paints
// with c.fill() / c.stroke() itself: it builds a path and calls paint(), which does the right thing in both rounds. Small details that need no edge (shines, specks) use `if (k.sil) return`.

export type Ctx = CanvasRenderingContext2D;
export type Paintish = string | CanvasGradient | CanvasPattern;

export const LOOP = 3;
export const BOX = 200;
export const TAU = Math.PI * 2;
export const INK = '#34204a';

export interface Kit {
  /** seconds into the loop (0 up to LOOP) */
  t: number;
  /** the same moment as an angle: 0 up to 2 pi */
  ph: number;
  /** true while the white die-cut copy is drawn */
  sil: boolean;
  /** how far the white edge reaches beyond the sticker, in sticker units */
  out: number;
}

export interface StickerDef {
  id: string;
  pack: PackId;
  name: string;
  draw: (c: Ctx, k: Kit) => void;
  /** half width / half height of the part that can be touched, in sticker units (the box is 100 either way); default 92 x 92 */
  bw?: number;
  bh?: number;
  /** false = no white edge and no shadow (light, see-through things: beams, confetti, glows) */
  outline?: boolean;
  /** a sticker made of words is never mirrored */
  text?: boolean;
  /** the words, for the search and for screen readers */
  words?: string;
  /** a buddy is a life-size character that stands next to the person in the photo (it has no white edge and draws its own shadow on the ground); a sticker is not */
  buddy?: BuddyInfo;
}

export type PackId = 'kdrama' | 'kmovie' | 'anime' | 'purple' | 'pink' | 'flair' | 'buddy';
/** the "fields" the buddies come from */
export type FieldId = 'kpop' | 'kdrama' | 'movies' | 'anime' | 'cute' | 'fun';
export interface BuddyInfo {
  field: FieldId;
  /** two or three words on the name tag, under "NOOB Buddy" */
  tagline: string;
  /** how big it first stands, as a fraction of the picture's width */
  size: number;
  /** the colour of its button */
  accent: string;
}

// ------------------------------------------------------------------ time
/** -1 .. 1, `f` whole waves per loop, `off` = a head start in turns */
export const wave = (k: Kit, f = 1, off = 0): number => Math.sin(k.ph * f + off * TAU);
/** 0 .. 1, repeating `f` times per loop, `off` = a head start (0..1) */
export const saw = (k: Kit, f = 1, off = 0): number => { const v = (k.t / LOOP) * f + off; return v - Math.floor(v); };
export const clamp = (v: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, v));
export const ease = (x: number): number => { const v = clamp(x); return v * v * (3 - 2 * v); };
/** a smooth bump: 0 at both ends of 0..1, 1 in the middle */
export const bump = (x: number): number => Math.sin(clamp(x) * Math.PI);
/** a ball dropped from 1 that bounces: x 0..1 -> height 0..1 (1 = the start) */
export const bounce = (x: number): number => {
  const v = clamp(x);
  if (v < 0.5) return 1 - (v / 0.5) ** 2;
  if (v < 0.75) { const u = (v - 0.5) / 0.25; return 0.28 * (1 - (2 * u - 1) ** 2); }
  const u = (v - 0.75) / 0.25; return 0.08 * (1 - (2 * u - 1) ** 2);
};
/** the same "random" number for the same i, j (0..1): lets a sticker scatter its specks without anything changing from one picture to the next */
export const rnd = (i: number, j = 0): number => { const x = Math.sin(i * 127.1 + j * 311.7 + 1.3) * 43758.5453; return x - Math.floor(x); };

// ------------------------------------------------------------------ colour
export type Stops = ReadonlyArray<readonly [number, string]>;
export function lin(c: Ctx, x0: number, y0: number, x1: number, y1: number, stops: Stops): CanvasGradient {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}
export function rad(c: Ctx, x: number, y: number, r0: number, r1: number, stops: Stops, x1 = x, y1 = y): CanvasGradient {
  const g = c.createRadialGradient(x, y, r0, x1, y1, r1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}

// ------------------------------------------------------------------ paths (they only build the path; paint() colours it)
export function pHeart(c: Ctx, cx: number, cy: number, size: number): void {
  const w = size / 2;
  c.beginPath();
  c.moveTo(cx, cy + w * 0.95);
  c.bezierCurveTo(cx - w * 1.3, cy + w * 0.12, cx - w * 1.08, cy - w * 0.98, cx, cy - w * 0.4);
  c.bezierCurveTo(cx + w * 1.08, cy - w * 0.98, cx + w * 1.3, cy + w * 0.12, cx, cy + w * 0.95);
  c.closePath();
}
export function pStar(c: Ctx, cx: number, cy: number, R: number, r: number, n = 5, rot = -Math.PI / 2): void {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n, d = i % 2 ? r : R;
    if (i) c.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); else c.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
  }
  c.closePath();
}
/** the four-point twinkle */
export function pSpark(c: Ctx, cx: number, cy: number, R: number, rot = 0, pinch = 0.16): void {
  c.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = rot + (i * Math.PI) / 2, b = a + Math.PI / 4, n = a + Math.PI / 2;
    if (!i) c.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    c.quadraticCurveTo(cx + Math.cos(b) * R * pinch, cy + Math.sin(b) * R * pinch, cx + Math.cos(n) * R, cy + Math.sin(n) * R);
  }
  c.closePath();
}
export function pRR(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const q = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + q, y);
  c.arcTo(x + w, y, x + w, y + h, q);
  c.arcTo(x + w, y + h, x, y + h, q);
  c.arcTo(x, y + h, x, y, q);
  c.arcTo(x, y, x + w, y, q);
  c.closePath();
}
export function pEll(c: Ctx, cx: number, cy: number, rx: number, ry: number, rot = 0): void {
  c.beginPath();
  c.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
  c.closePath();
}
export function pCirc(c: Ctx, cx: number, cy: number, r: number): void {
  c.beginPath();
  c.arc(cx, cy, Math.max(0.01, r), 0, TAU);
  c.closePath();
}
export function pPoly(c: Ctx, pts: ReadonlyArray<readonly [number, number]>): void {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
}

// ------------------------------------------------------------------ painting
export interface PaintOpts {
  fill?: Paintish | null;
  stroke?: Paintish | null;
  /** the line width of the stroke (4 when there is a stroke) */
  lw?: number;
  /** 0..1, for this one shape */
  alpha?: number;
  /** leave this shape out of the white die-cut copy (a glow, a puff of steam) */
  nosil?: boolean;
}

/** Colour the path that was just built: the sticker, or while the white copy is drawn a white version of it that reaches `k.out` further. */
export function paint(c: Ctx, k: Kit, o: PaintOpts = {}): void {
  const lw = o.lw ?? (o.stroke ? 4 : 0);
  if (k.sil) {
    if (o.nosil) return;
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.fillStyle = '#fff'; c.strokeStyle = '#fff';
    if (o.fill) c.fill();
    c.lineWidth = lw + k.out * 2;
    c.stroke();
    return;
  }
  const a = c.globalAlpha;
  if (o.alpha !== undefined) c.globalAlpha = a * o.alpha;
  if (o.fill) { c.fillStyle = o.fill; c.fill(); }
  if (o.stroke && lw > 0) { c.strokeStyle = o.stroke; c.lineWidth = lw; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }
  c.globalAlpha = a;
}

/** a line (open path) in colour; in the white copy it is a fat white line */
export function line(c: Ctx, k: Kit, color: string, lw: number, alpha = 1): void {
  paint(c, k, { stroke: color, lw, alpha });
}

/** run `fn` only in the colour round (shines, specks and other small things that need no white edge) */
export function detail(k: Kit, fn: () => void): void {
  if (!k.sil) fn();
}

// ------------------------------------------------------------------ words
const hasWide = (s: string): boolean => /[^\u0000-ɏ]/.test(s);
export const FONT_LATIN = '"Avenir Next","Nunito","Segoe UI",system-ui,-apple-system,"Helvetica Neue",Roboto,Arial,sans-serif';
export const FONT_CJK = '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR","Noto Sans CJK KR","Hiragino Sans","Yu Gothic","Noto Sans JP","Meiryo","Segoe UI",system-ui,sans-serif';

export interface LabelOpts {
  fill?: Paintish;
  stroke?: string;
  lw?: number;
  weight?: number;
  rot?: number;
  align?: CanvasTextAlign;
  alpha?: number;
  /** shrink the letters until the words are at most this wide */
  maxW?: number;
}

export function label(c: Ctx, k: Kit, text: string, x: number, y: number, size: number, o: LabelOpts = {}): void {
  c.save();
  c.translate(x, y);
  if (o.rot) c.rotate(o.rot);
  const face = hasWide(text) ? FONT_CJK : FONT_LATIN;
  const weight = o.weight ?? 900;
  c.font = `${weight} ${size}px ${face}`;
  c.textAlign = o.align ?? 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.miterLimit = 2;
  if (o.maxW) {
    const w = c.measureText(text).width;
    if (w > o.maxW) { size = (size * o.maxW) / w; c.font = `${weight} ${size}px ${face}`; }
  }
  if (k.sil) {
    c.fillStyle = '#fff'; c.strokeStyle = '#fff';
    c.lineWidth = size * 0.17 + k.out * 2;
    c.strokeText(text, 0, 0);
    c.fillText(text, 0, 0);
  } else {
    if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
    if (o.stroke) { c.strokeStyle = o.stroke; c.lineWidth = o.lw ?? size * 0.17; c.strokeText(text, 0, 0); }
    c.fillStyle = o.fill ?? '#fff';
    c.fillText(text, 0, 0);
  }
  c.restore();
}

/** the set-up every sticker file starts with */
export const def = (d: StickerDef): StickerDef => d;
