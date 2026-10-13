// NOOB STUDY's sketch board: the rules and the drawing, kept apart from the screen so they can be tested. A sketch is a list of strokes (each a colour, a
// width and a list of points on a fixed 1000 x 1250 page), never a picture, so it is small, stays sharp at any size, and can be undone stroke by stroke.
export interface Stroke { t: 'pen' | 'eraser'; c: string; w: number; p: Array<[number, number]> }
export type Paper = 'white' | 'grid' | 'lined' | 'dark';

export const SKETCH_W = 1000;
export const SKETCH_H = 1250;
export const MAX_STROKES = 3000;          // the same limits as the database
export const MAX_BYTES = 300000;
export const MAX_HISTORY = 100;

export const PAPERS: Array<{ id: Paper; label: string }> = [{ id: 'white', label: 'Plain' }, { id: 'grid', label: 'Squares' }, { id: 'lined', label: 'Lines' }, { id: 'dark', label: 'Dark' }];
export const INK_DARK = '#1f1f24';
export const INK_LIGHT = '#f4f1ec';
export const PEN_COLORS = [INK_DARK, '#d93a3a', '#e8872b', '#d9b100', '#2f9e5b', '#2f7fc0', '#6a4fd1', '#c2478d', INK_LIGHT];
export const PEN_WIDTHS = [3, 6, 10, 18];
export const ERASER_FACTOR = 3.2;

export const isPaper = (v: unknown): v is Paper => v === 'white' || v === 'grid' || v === 'lined' || v === 'dark';

// the colours of the paper: its fill and its rule lines
export const PAPER_STYLE: Record<Paper, { bg: string; line: string }> = {
  white: { bg: '#fffdf9', line: 'transparent' },
  grid: { bg: '#fffdf9', line: 'rgba(60, 90, 140, 0.22)' },
  lined: { bg: '#fffdf9', line: 'rgba(60, 90, 140, 0.26)' },
  dark: { bg: '#15171f', line: 'transparent' }
};
// the pen that reads well on a paper
export const defaultInk = (paper: Paper): string => (paper === 'dark' ? INK_LIGHT : INK_DARK);
// when the paper changes, the plain ink follows (dark ink on white, light ink on dark); any colour the student chose stays
export const inkFor = (color: string, paper: Paper): string => (color === INK_DARK || color === INK_LIGHT ? defaultInk(paper) : color);

// a point is added only if the pen has really moved (a still hand does not fill the sketch with the same point), and it is stored as a whole number
export function addPoint(points: Array<[number, number]>, x: number, y: number, minDist = 1.6): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const px = Math.min(SKETCH_W, Math.max(0, Math.round(x)));
  const py = Math.min(SKETCH_H, Math.max(0, Math.round(y)));
  const last = points[points.length - 1];
  if (last && Math.hypot(px - last[0], py - last[1]) < minDist) return false;
  points.push([px, py]);
  return true;
}

export const strokeBytes = (strokes: Stroke[]): number => JSON.stringify(strokes).length;
// how full the sketch is: 'ok', 'near' (about nine tenths), or 'full' (no more can be saved)
export function fullness(strokes: Stroke[]): { state: 'ok' | 'near' | 'full'; strokes: number; bytes: number } {
  const bytes = strokeBytes(strokes);
  const state = strokes.length >= MAX_STROKES || bytes >= MAX_BYTES ? 'full' : strokes.length >= MAX_STROKES * 0.9 || bytes >= MAX_BYTES * 0.9 ? 'near' : 'ok';
  return { state, strokes: strokes.length, bytes };
}

// whatever came back from the database is checked before it is drawn: a damaged stroke is dropped, never drawn wrongly or allowed to crash the page
export function cleanStrokes(raw: unknown): Stroke[] {
  if (!Array.isArray(raw)) return [];
  const out: Stroke[] = [];
  for (const s of raw) {
    if (!s || typeof s !== 'object' || !Array.isArray((s as Stroke).p)) continue;
    const t = (s as Stroke).t === 'eraser' ? 'eraser' : 'pen';
    const w = Number((s as Stroke).w);
    const c = typeof (s as Stroke).c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test((s as Stroke).c) ? (s as Stroke).c : INK_DARK;
    const p: Array<[number, number]> = [];
    for (const pt of (s as Stroke).p) {
      if (Array.isArray(pt) && Number.isFinite(Number(pt[0])) && Number.isFinite(Number(pt[1]))) p.push([Math.min(SKETCH_W, Math.max(0, Number(pt[0]))), Math.min(SKETCH_H, Math.max(0, Number(pt[1])))]);
    }
    if (p.length) out.push({ t, c, w: Number.isFinite(w) ? Math.min(80, Math.max(1, w)) : 4, p });
  }
  return out.slice(0, MAX_STROKES);
}

// the drawing itself: smooth curves through the points (each segment curves to the midpoint of the next), a dot for a single tap, and an eraser that
// really removes what is under it
type Ctx = CanvasRenderingContext2D;
function setup(ctx: Ctx, s: Stroke, scale: number): void {
  ctx.globalCompositeOperation = s.t === 'eraser' ? 'destination-out' : 'source-over';
  ctx.strokeStyle = s.t === 'eraser' ? '#000' : s.c;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = (s.t === 'eraser' ? s.w * ERASER_FACTOR : s.w) * scale;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
}
export function drawStroke(ctx: Ctx, s: Stroke, scale = 1): void {
  const p = s.p;
  if (!p.length) return;
  ctx.save();
  setup(ctx, s, scale);
  ctx.beginPath();
  if (p.length === 1) { ctx.moveTo(p[0][0] * scale, p[0][1] * scale); ctx.lineTo(p[0][0] * scale + 0.01, p[0][1] * scale); }
  else {
    ctx.moveTo(p[0][0] * scale, p[0][1] * scale);
    for (let i = 1; i < p.length - 1; i++) ctx.quadraticCurveTo(p[i][0] * scale, p[i][1] * scale, ((p[i][0] + p[i + 1][0]) / 2) * scale, ((p[i][1] + p[i + 1][1]) / 2) * scale);
    ctx.lineTo(p[p.length - 1][0] * scale, p[p.length - 1][1] * scale);
  }
  ctx.stroke();
  ctx.restore();
}
// while the pen is moving: only the newest piece is drawn (the whole stroke is drawn again when the pen lifts)
export function drawTail(ctx: Ctx, s: Stroke, scale = 1): void {
  const p = s.p;
  if (p.length < 2) { drawStroke(ctx, s, scale); return; }
  ctx.save();
  setup(ctx, s, scale);
  ctx.beginPath();
  const a = p[p.length - 2], b = p[p.length - 1];
  const prev = p.length >= 3 ? p[p.length - 3] : null;
  const from: [number, number] = prev ? [(prev[0] + a[0]) / 2, (prev[1] + a[1]) / 2] : a;
  ctx.moveTo(from[0] * scale, from[1] * scale);
  ctx.quadraticCurveTo(a[0] * scale, a[1] * scale, ((a[0] + b[0]) / 2) * scale, ((a[1] + b[1]) / 2) * scale);
  ctx.lineTo(b[0] * scale, b[1] * scale);
  ctx.stroke();
  ctx.restore();
}
export function drawAll(ctx: Ctx, strokes: Stroke[], scale = 1): void {
  ctx.clearRect(0, 0, SKETCH_W * scale, SKETCH_H * scale);
  for (const s of strokes) drawStroke(ctx, s, scale);
}

// the paper, drawn for the saved picture (on screen the paper is plain CSS behind the drawing)
export function drawPaper(ctx: Ctx, paper: Paper, scale = 1): void {
  const st = PAPER_STYLE[paper];
  ctx.save();
  ctx.fillStyle = st.bg; ctx.fillRect(0, 0, SKETCH_W * scale, SKETCH_H * scale);
  ctx.strokeStyle = st.line; ctx.lineWidth = Math.max(1, scale);
  if (paper === 'grid') {
    for (let x = 40; x < SKETCH_W; x += 40) { ctx.beginPath(); ctx.moveTo(x * scale, 0); ctx.lineTo(x * scale, SKETCH_H * scale); ctx.stroke(); }
    for (let y = 40; y < SKETCH_H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y * scale); ctx.lineTo(SKETCH_W * scale, y * scale); ctx.stroke(); }
  } else if (paper === 'lined') {
    for (let y = 50; y < SKETCH_H; y += 50) { ctx.beginPath(); ctx.moveTo(0, y * scale); ctx.lineTo(SKETCH_W * scale, y * scale); ctx.stroke(); }
  }
  ctx.restore();
}
// the same paper as CSS for the screen (the sizes are percentages, so it fits whatever width the page is shown at)
export function paperCss(paper: Paper): { backgroundColor: string; backgroundImage?: string; backgroundSize?: string } {
  const st = PAPER_STYLE[paper];
  if (paper === 'grid') return { backgroundColor: st.bg, backgroundImage: `linear-gradient(to right, ${st.line} 1px, transparent 1px), linear-gradient(to bottom, ${st.line} 1px, transparent 1px)`, backgroundSize: `${(40 / SKETCH_W) * 100}% ${(40 / SKETCH_H) * 100}%` };
  if (paper === 'lined') return { backgroundColor: st.bg, backgroundImage: `linear-gradient(to bottom, transparent calc(100% - 1px), ${st.line} calc(100% - 1px))`, backgroundSize: `100% ${(50 / SKETCH_H) * 100}%` };
  return { backgroundColor: st.bg };
}

// history for undo and redo: a list of earlier states of the stroke list (strokes themselves never change, so each state only holds references)
export interface History { past: Stroke[][]; future: Stroke[][] }
export const newHistory = (): History => ({ past: [], future: [] });
export function pushHistory(h: History, before: Stroke[]): void {
  h.past.push(before);
  if (h.past.length > MAX_HISTORY) h.past.shift();
  h.future = [];
}
export function undo(h: History, now: Stroke[]): Stroke[] | null {
  const prev = h.past.pop();
  if (!prev) return null;
  h.future.push(now);
  return prev;
}
export function redo(h: History, now: Stroke[]): Stroke[] | null {
  const next = h.future.pop();
  if (!next) return null;
  h.past.push(now);
  return next;
}
