import { ASPECTS, Anim, Asset, CaptionLayer, DrawLayer, Layer, MediaLayer, Project, StickerLayer, Stroke, TextLayer, isPlain, mainClips, projectDuration } from './types';
import { GLProcessor } from './gl';

// Draws one frame of the project at time t onto a canvas. The editor's preview, the picture export and the video export all call this, so what is shown is what is saved.

export interface RenderEnv {
  project: Project;
  assets: Map<string, Asset>;
  /** the playing copy of a video clip (one per clip), if it is ready */
  videoFor: (layerId: string) => HTMLVideoElement | null;
  gl: GLProcessor | null;
  /** design pixels -> output pixels */
  k: number;
  /** hold to compare: pictures are drawn without their adjustments and filter */
  original?: boolean;
}

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
const easeBack = (p: number) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };

export const SYSTEM_FONTS: Record<string, string> = {
  'Plus Jakarta Sans': '"Plus Jakarta Sans", system-ui, sans-serif',
  Serif: '"Times New Roman", Times, serif',
  Georgia: 'Georgia, serif',
  Pacifico: '"Pacifico", cursive',
  Caveat: '"Caveat", cursive',
  'Grand Hotel': '"Grand Hotel", cursive',
  Mono: '"JetBrains Mono", ui-monospace, monospace',
  Impact: 'Impact, "Arial Black", sans-serif'
};
export const fontCss = (name: string) => SYSTEM_FONTS[name] || name;

// ---------- animation
export interface AnimState { alpha: number; dx: number; dy: number; scale: number; rot: number; chars: number }
const IDLE: AnimState = { alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0, chars: 1 };

function applyAnim(kind: Anim, p: number, out: boolean, t: number, s: AnimState): void {
  if (kind === 'none' || p >= 1) return;
  const e = easeOut(p);
  const dir = out ? -1 : 1;
  switch (kind) {
    case 'fade': s.alpha *= p; break;
    case 'slide-up': s.dy += (1 - e) * 160 * dir; s.alpha *= clamp(p * 2); break;
    case 'slide-down': s.dy -= (1 - e) * 160 * dir; s.alpha *= clamp(p * 2); break;
    case 'slide-left': s.dx += (1 - e) * 260 * dir; s.alpha *= clamp(p * 2); break;
    case 'slide-right': s.dx -= (1 - e) * 260 * dir; s.alpha *= clamp(p * 2); break;
    case 'zoom': s.scale *= 0.25 + 0.75 * e; s.alpha *= clamp(p * 1.6); break;
    case 'pop': s.scale *= clamp(easeBack(p), 0, 1.4); s.alpha *= clamp(p * 4); break;
    case 'bounce': s.dy -= Math.abs(Math.sin(p * Math.PI * 3)) * (1 - p) * 120; s.alpha *= clamp(p * 4); break;
    case 'rotate': s.rot += (1 - e) * -180 * dir; s.alpha *= clamp(p * 2); break;
    case 'shake': s.dx += Math.sin(t * 70) * 14 * (1 - p); break;
    case 'typewriter': s.chars = out ? 1 : p; break;
    default: break;
  }
}

/** How an overlay looks at time t because of its in / out animation. */
export function animState(l: Layer, t: number, still: boolean): AnimState {
  const s: AnimState = { ...IDLE };
  if (still) return s;
  const d = Math.max(0.05, Math.min(l.animDur, l.duration / 2));
  if (l.animIn !== 'none') applyAnim(l.animIn, clamp((t - l.start) / d), false, t, s);
  if (l.animOut !== 'none') applyAnim(l.animOut, clamp((l.start + l.duration - t) / d), true, t, s);
  return s;
}

// ---------- measuring (also used by the selection box)
let measureCtx: CanvasRenderingContext2D | null = null;
const mctx = (): CanvasRenderingContext2D => (measureCtx ||= document.createElement('canvas').getContext('2d')!);

function textFont(l: TextLayer, px: number): string {
  return `${l.italic ? 'italic ' : ''}${l.bold ? '800 ' : '500 '}${px}px ${fontCss(l.font)}`;
}
function lineWidth(ctx: CanvasRenderingContext2D, text: string, letter: number): number {
  if (!letter) return ctx.measureText(text).width;
  let w = 0;
  for (const ch of Array.from(text)) w += ctx.measureText(ch).width + letter;
  return w - letter;
}

export function textBox(l: TextLayer): { w: number; h: number; lines: string[]; pad: number } {
  const ctx = mctx();
  ctx.font = textFont(l, l.size);
  const lines = l.text.split('\n');
  const pad = l.size * 0.28;
  const w = Math.max(...lines.map((ln) => lineWidth(ctx, ln || ' ', l.letter)), l.size * 0.5);
  return { w: w + pad * 2, h: lines.length * l.size * l.lineHeight + pad * 1.2, lines, pad };
}

/** Width and height (design px, before the layer's own scale) of a layer, for selecting and moving it. */
export function boxOf(assets: Map<string, Asset>, l: Layer): { w: number; h: number } {
  switch (l.type) {
    case 'media': { const a = assets.get(l.assetId); return a ? { w: a.width * l.crop.w * l.scale, h: a.height * l.crop.h * l.scale } : { w: 100, h: 100 }; }
    case 'text': { const b = textBox(l); return { w: b.w * l.scale, h: b.h * l.scale }; }
    case 'sticker': return { w: l.size * l.scale, h: l.size * l.scale };
    default: return { w: 0, h: 0 };
  }
}

// ---------- shapes
export const SHAPES = ['heart', 'star', 'circle', 'square', 'rounded', 'triangle', 'diamond', 'arrow', 'bubble', 'burst', 'plus', 'cloud'] as const;

function shapePath(ctx: CanvasRenderingContext2D, name: string, r: number): void {
  ctx.beginPath();
  switch (name) {
    case 'heart':
      ctx.moveTo(0, r * 0.85);
      ctx.bezierCurveTo(-r * 1.25, r * 0.1, -r * 0.9, -r * 0.95, 0, -r * 0.4);
      ctx.bezierCurveTo(r * 0.9, -r * 0.95, r * 1.25, r * 0.1, 0, r * 0.85);
      break;
    case 'star': {
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rad = i % 2 ? r * 0.42 : r; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); }
      break;
    }
    case 'burst': {
      for (let i = 0; i < 24; i++) { const a = (i * Math.PI) / 12; const rad = i % 2 ? r * 0.72 : r; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); }
      break;
    }
    case 'circle': ctx.arc(0, 0, r, 0, Math.PI * 2); break;
    case 'square': ctx.rect(-r, -r, r * 2, r * 2); break;
    case 'rounded': roundRect(ctx, -r, -r * 0.75, r * 2, r * 1.5, r * 0.4); break;
    case 'triangle': ctx.moveTo(0, -r); ctx.lineTo(r * 0.95, r * 0.8); ctx.lineTo(-r * 0.95, r * 0.8); break;
    case 'diamond': ctx.moveTo(0, -r); ctx.lineTo(r * 0.75, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.75, 0); break;
    case 'arrow': ctx.moveTo(-r, -r * 0.3); ctx.lineTo(r * 0.2, -r * 0.3); ctx.lineTo(r * 0.2, -r * 0.7); ctx.lineTo(r, 0); ctx.lineTo(r * 0.2, r * 0.7); ctx.lineTo(r * 0.2, r * 0.3); ctx.lineTo(-r, r * 0.3); break;
    case 'bubble': roundRect(ctx, -r, -r * 0.7, r * 2, r * 1.2, r * 0.35); ctx.moveTo(-r * 0.4, r * 0.5); ctx.lineTo(-r * 0.7, r * 0.95); ctx.lineTo(0, r * 0.5); break;
    case 'plus': ctx.moveTo(-r * 0.3, -r); ctx.lineTo(r * 0.3, -r); ctx.lineTo(r * 0.3, -r * 0.3); ctx.lineTo(r, -r * 0.3); ctx.lineTo(r, r * 0.3); ctx.lineTo(r * 0.3, r * 0.3); ctx.lineTo(r * 0.3, r); ctx.lineTo(-r * 0.3, r); ctx.lineTo(-r * 0.3, r * 0.3); ctx.lineTo(-r, r * 0.3); ctx.lineTo(-r, -r * 0.3); ctx.lineTo(-r * 0.3, -r * 0.3); break;
    case 'cloud':
      ctx.arc(-r * 0.45, r * 0.1, r * 0.45, Math.PI * 0.5, Math.PI * 1.5); ctx.arc(-r * 0.1, -r * 0.3, r * 0.45, Math.PI, Math.PI * 2); ctx.arc(r * 0.4, -r * 0.05, r * 0.45, Math.PI * 1.2, Math.PI * 0.5 + Math.PI * 2, false);
      ctx.lineTo(-r * 0.45, r * 0.55);
      break;
    default: ctx.arc(0, 0, r, 0, Math.PI * 2);
  }
  ctx.closePath();
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr); ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ---------- media
interface Mods { alpha: number; dx: number; dy: number; scale: number; blur: number; clip?: [number, number, number, number]; black?: boolean }
const PLAIN_MODS: Mods = { alpha: 1, dx: 0, dy: 0, scale: 1, blur: 0 };

function sourceOf(env: RenderEnv, l: MediaLayer): { src: ImageBitmap | HTMLImageElement | HTMLVideoElement; w: number; h: number } | null {
  const a = env.assets.get(l.assetId);
  if (!a) return null;
  if (a.kind === 'image' && a.bitmap) return { src: a.bitmap, w: a.width, h: a.height };
  if (a.kind === 'video') {
    const v = env.videoFor(l.id);
    if (v && v.readyState >= 2 && v.videoWidth) return { src: v, w: v.videoWidth, h: v.videoHeight };
  }
  return null;
}

function clipFade(l: MediaLayer, t: number): number {
  let a = 1;
  if (l.fadeIn > 0) a *= clamp((t - l.start) / l.fadeIn);
  if (l.fadeOut > 0) a *= clamp((l.start + l.duration - t) / l.fadeOut);
  return a;
}

function drawMedia(ctx: CanvasRenderingContext2D, env: RenderEnv, l: MediaLayer, t: number, m: Mods, an: AnimState): void {
  const s = sourceOf(env, l);
  if (!s) return;
  const k = env.k;
  const a = env.assets.get(l.assetId)!;
  const cw = (a.kind === 'video' ? s.w : a.width) * l.crop.w;
  const ch = (a.kind === 'video' ? s.h : a.height) * l.crop.h;
  const sc = l.scale * m.scale * an.scale;
  const w = cw * sc * k;
  const h = ch * sc * k;
  if (w < 1 || h < 1) return;
  ctx.save();
  ctx.globalAlpha = clamp(l.opacity * m.alpha * an.alpha * clipFade(l, t));
  if (m.clip) { ctx.beginPath(); ctx.rect(m.clip[0] * k, m.clip[1] * k, m.clip[2] * k, m.clip[3] * k); ctx.clip(); }
  ctx.translate((l.x + m.dx + an.dx) * k, (l.y + m.dy + an.dy) * k);
  ctx.rotate(((l.rotation + an.rot) * Math.PI) / 180);
  ctx.scale(l.flipX ? -1 : 1, l.flipY ? -1 : 1);
  if (l.radius > 0) { ctx.beginPath(); roundRect(ctx, -w / 2, -h / 2, w, h, l.radius * sc * k); ctx.clip(); }
  const plain = env.original || (l.filter === 'none' && isPlain(l.adjust));
  const needGL = !!env.gl && !env.gl.lost && (!plain || m.blur > 0);
  const sx = s.w * l.crop.x, sy = s.h * l.crop.y;
  if (needGL) {
    const r = env.gl!.process(s.src, w, h, {
      crop: { x: l.crop.x, y: l.crop.y, w: l.crop.w, h: l.crop.h },
      adjust: env.original ? { ...l.adjust, brightness: 0, contrast: 0, exposure: 0, highlights: 0, shadows: 0, saturation: 0, vibrance: 0, temperature: 0, tint: 0, hue: 0, fade: 0, vignette: 0, grain: 0, sharpness: 0, blur: 0 } : l.adjust,
      filter: env.original ? 'none' : l.filter, filterAmount: l.filterAmount, extraBlur: m.blur, seed: Math.floor(t * 24) % 97
    });
    ctx.drawImage(r.canvas, r.sx, r.sy, r.sw, r.sh, -w / 2, -h / 2, w, h);
  } else {
    ctx.drawImage(s.src, sx, sy, cw, ch, -w / 2, -h / 2, w, h);
  }
  ctx.restore();
}

function blurredBackdrop(ctx: CanvasRenderingContext2D, env: RenderEnv, l: MediaLayer): void {
  const s = sourceOf(env, l);
  if (!s || !env.gl || env.gl.lost) return;
  const size = ASPECTS[env.project.aspect];
  const W = size.w * env.k, H = size.h * env.k;
  const bw = 72, bh = Math.max(2, Math.round((72 * H) / W));
  const r = env.gl.process(s.src, bw, bh, { crop: { x: 0, y: 0, w: 1, h: 1 }, adjust: { ...l.adjust, blur: 5 }, filter: l.filter, filterAmount: l.filterAmount });
  ctx.save();
  ctx.globalAlpha = 0.9;
  // fill the canvas by "cover"
  const k2 = Math.max(W / s.w, H / s.h);
  const dw = s.w * k2, dh = s.h * k2;
  const tmpW = Math.round(dw), tmpH = Math.round(dh);
  void tmpW; void tmpH;
  ctx.drawImage(r.canvas, r.sx, r.sy, r.sw, r.sh, 0, 0, W, H);
  ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 0, W, H);
}

function drawMain(ctx: CanvasRenderingContext2D, env: RenderEnv, t: number): void {
  const p = env.project;
  const size = ASPECTS[p.aspect];
  const clips = mainClips(p).filter((c) => !c.hidden);
  const still = p.mode === 'photo';
  const active = still ? clips.slice(0, 1) : clips.filter((c) => t >= c.start - 1e-6 && t < c.start + c.duration);
  if (active.length === 0) return;
  if (p.bgBlur) blurredBackdrop(ctx, env, active[active.length - 1]);
  const an = (l: Layer) => animState(l, t, true);
  if (active.length === 1) { drawMedia(ctx, env, active[0], t, PLAIN_MODS, an(active[0])); return; }
  // two clips overlap: the later one is coming in over the earlier one
  const A = active[0], B = active[active.length - 1];
  const overlap = Math.max(0.05, A.start + A.duration - B.start);
  const q = clamp((t - B.start) / overlap);
  const W = size.w, H = size.h;
  switch (B.transition.type) {
    case 'fade': {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W * env.k, H * env.k);
      drawMedia(ctx, env, A, t, { ...PLAIN_MODS, alpha: clamp(1 - q * 2) }, an(A));
      drawMedia(ctx, env, B, t, { ...PLAIN_MODS, alpha: clamp(q * 2 - 1) }, an(B));
      break;
    }
    case 'slide':
      drawMedia(ctx, env, A, t, { ...PLAIN_MODS, dx: -W * q * 0.35 }, an(A));
      drawMedia(ctx, env, B, t, { ...PLAIN_MODS, dx: W * (1 - easeOut(q)), clip: [0, 0, W, H] }, an(B));
      break;
    case 'zoom':
      drawMedia(ctx, env, A, t, { ...PLAIN_MODS, alpha: 1 - q, scale: 1 + q * 0.5 }, an(A));
      drawMedia(ctx, env, B, t, { ...PLAIN_MODS, alpha: q, scale: 0.8 + q * 0.2 }, an(B));
      break;
    case 'wipe':
      drawMedia(ctx, env, A, t, PLAIN_MODS, an(A));
      drawMedia(ctx, env, B, t, { ...PLAIN_MODS, clip: [0, 0, W * q, H] }, an(B));
      break;
    case 'blur':
      drawMedia(ctx, env, A, t, { ...PLAIN_MODS, alpha: 1 - q, blur: q * 18 }, an(A));
      drawMedia(ctx, env, B, t, { ...PLAIN_MODS, alpha: q, blur: (1 - q) * 18 }, an(B));
      break;
    default: // dissolve (a cross-fade)
      drawMedia(ctx, env, A, t, { ...PLAIN_MODS, alpha: 1 - q * 0.0 }, an(A));
      drawMedia(ctx, env, B, t, { ...PLAIN_MODS, alpha: q }, an(B));
  }
}

// ---------- text, stickers, drawings, captions
function drawText(ctx: CanvasRenderingContext2D, env: RenderEnv, l: TextLayer, t: number, an: AnimState): void {
  const k = env.k;
  const { w, h, lines, pad } = textBox(l);
  const px = l.size * k;
  ctx.save();
  ctx.globalAlpha = clamp(l.opacity * an.alpha);
  ctx.translate((l.x + an.dx) * k, (l.y + an.dy) * k);
  ctx.rotate(((l.rotation + an.rot) * Math.PI) / 180);
  const sc = l.scale * an.scale;
  ctx.scale(sc * (l.flipX ? -1 : 1), sc * (l.flipY ? -1 : 1));
  ctx.font = textFont(l, px);
  ctx.textBaseline = 'middle';
  if (l.bgOpacity > 0) {
    ctx.save();
    ctx.globalAlpha *= l.bgOpacity;
    ctx.fillStyle = l.bg;
    ctx.beginPath(); roundRect(ctx, (-w / 2) * k, (-h / 2) * k, w * k, h * k, l.bgRadius * k); ctx.fill();
    ctx.restore();
  }
  const total = lines.join('').length;
  let shown = Math.ceil(total * an.chars);
  const lh = l.size * l.lineHeight * k;
  const top = (-(lines.length * lh) / 2) + lh / 2 - (pad * 0.1) * k;
  lines.forEach((raw, i) => {
    const take = Math.max(0, Math.min(Array.from(raw).length, shown));
    shown -= Array.from(raw).length;
    const line = Array.from(raw).slice(0, take).join('');
    const full = lineWidth(ctx, raw || ' ', l.letter * k);
    const x0 = l.align === 'left' ? -full / 2 : l.align === 'right' ? full / 2 : 0;
    const y = top + i * lh;
    const draw = (mode: 'stroke' | 'fill') => {
      if (!l.letter) {
        ctx.textAlign = l.align === 'left' ? 'left' : l.align === 'right' ? 'right' : 'center';
        const ax = l.align === 'left' ? -full / 2 : l.align === 'right' ? full / 2 : 0;
        if (mode === 'stroke') ctx.strokeText(line, ax, y); else ctx.fillText(line, ax, y);
      } else {
        ctx.textAlign = 'left';
        let cx = l.align === 'left' ? -full / 2 : l.align === 'right' ? full / 2 - full : -full / 2;
        for (const ch of Array.from(line)) { if (mode === 'stroke') ctx.strokeText(ch, cx, y); else ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + l.letter * k; }
      }
    };
    void x0;
    if (l.shadow > 0 || l.glow > 0) { ctx.shadowColor = l.glow > 0 ? l.color : l.shadowColor; ctx.shadowBlur = (l.glow > 0 ? l.glow : l.shadow) * k; ctx.shadowOffsetY = l.glow > 0 ? 0 : l.shadow * 0.25 * k; }
    if (l.stroke > 0) { ctx.lineJoin = 'round'; ctx.lineWidth = l.stroke * 2 * k; ctx.strokeStyle = l.strokeColor; draw('stroke'); }
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = l.color;
    if (l.shadow > 0 || l.glow > 0) { ctx.shadowColor = l.glow > 0 ? l.color : l.shadowColor; ctx.shadowBlur = (l.glow > 0 ? l.glow : l.shadow) * k; ctx.shadowOffsetY = l.glow > 0 ? 0 : l.shadow * 0.25 * k; }
    draw('fill');
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    if (l.underline) { ctx.fillRect(-full / 2, y + px * 0.5, full, Math.max(1, px * 0.06)); }
  });
  ctx.restore();
}

function drawSticker(ctx: CanvasRenderingContext2D, env: RenderEnv, l: StickerLayer, t: number, an: AnimState): void {
  const k = env.k;
  const size = l.size * k;
  ctx.save();
  ctx.globalAlpha = clamp(l.opacity * an.alpha);
  ctx.translate((l.x + an.dx) * k, (l.y + an.dy) * k);
  ctx.rotate(((l.rotation + an.rot) * Math.PI) / 180);
  const sc = l.scale * an.scale;
  ctx.scale(sc * (l.flipX ? -1 : 1), sc * (l.flipY ? -1 : 1));
  if (l.kind === 'emoji') {
    ctx.font = `${size * 0.82}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(l.content, 0, size * 0.04);
  } else if (l.kind === 'shape') {
    shapePath(ctx, l.content, size / 2);
    ctx.fillStyle = l.color; ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = size * 0.06; ctx.shadowOffsetY = size * 0.02;
    ctx.fill();
  } else {
    const a = env.assets.get(l.content);
    if (a?.bitmap) {
      const r = Math.min(size / a.width, size / a.height);
      ctx.drawImage(a.bitmap, (-a.width * r) / 2, (-a.height * r) / 2, a.width * r, a.height * r);
    }
  }
  ctx.restore();
  void t;
}

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, k: number): void {
  const pts = s.points;
  if (pts.length === 0) return;
  ctx.save();
  ctx.globalAlpha *= s.opacity;
  ctx.strokeStyle = s.color; ctx.fillStyle = s.color;
  ctx.lineWidth = s.size * k; ctx.lineCap = s.kind === 'highlighter' ? 'butt' : 'round'; ctx.lineJoin = 'round';
  const [x0, y0] = pts[0];
  const [x1, y1] = pts[pts.length - 1];
  ctx.beginPath();
  if (s.kind === 'pen' || s.kind === 'highlighter') {
    if (pts.length === 1) { ctx.arc(x0 * k, y0 * k, (s.size * k) / 2, 0, Math.PI * 2); ctx.fill(); ctx.restore(); return; }
    ctx.moveTo(x0 * k, y0 * k);
    for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; ctx.quadraticCurveTo(pts[i][0] * k, pts[i][1] * k, mx * k, my * k); }
    ctx.lineTo(x1 * k, y1 * k);
    ctx.stroke();
  } else if (s.kind === 'line' || s.kind === 'arrow') {
    ctx.moveTo(x0 * k, y0 * k); ctx.lineTo(x1 * k, y1 * k); ctx.stroke();
    if (s.kind === 'arrow') {
      const a = Math.atan2(y1 - y0, x1 - x0); const hl = Math.max(30, s.size * 3.2);
      ctx.beginPath(); ctx.moveTo(x1 * k, y1 * k); ctx.lineTo((x1 - Math.cos(a - 0.45) * hl) * k, (y1 - Math.sin(a - 0.45) * hl) * k);
      ctx.moveTo(x1 * k, y1 * k); ctx.lineTo((x1 - Math.cos(a + 0.45) * hl) * k, (y1 - Math.sin(a + 0.45) * hl) * k); ctx.stroke();
    }
  } else if (s.kind === 'rect') {
    ctx.strokeRect(Math.min(x0, x1) * k, Math.min(y0, y1) * k, Math.abs(x1 - x0) * k, Math.abs(y1 - y0) * k);
  } else {
    ctx.ellipse(((x0 + x1) / 2) * k, ((y0 + y1) / 2) * k, (Math.abs(x1 - x0) / 2) * k, (Math.abs(y1 - y0) / 2) * k, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawDraw(ctx: CanvasRenderingContext2D, env: RenderEnv, l: DrawLayer, an: AnimState): void {
  ctx.save();
  ctx.globalAlpha = clamp(l.opacity * an.alpha);
  for (const s of l.strokes) drawStroke(ctx, s, env.k);
  ctx.restore();
}

function drawCaptions(ctx: CanvasRenderingContext2D, env: RenderEnv, l: CaptionLayer, t: number): void {
  const cue = l.cues.find((c) => t >= c.start && t < c.end);
  if (!cue || !cue.text.trim()) return;
  const k = env.k;
  const size = ASPECTS[env.project.aspect];
  const px = l.size * k;
  ctx.save();
  ctx.globalAlpha = clamp(l.opacity);
  ctx.font = `${l.bold ? '800' : '500'} ${px}px ${fontCss(l.font)}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const maxW = size.w * 0.86 * k;
  const words = cue.text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) { const test = cur ? `${cur} ${w}` : w; if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test; }
  if (cur) lines.push(cur);
  const lh = px * 1.25;
  const cy = size.h * l.y01 * k;
  const widest = Math.max(...lines.map((ln) => ctx.measureText(ln).width));
  const bh = lines.length * lh + px * 0.4;
  if (l.bgOpacity > 0) {
    ctx.globalAlpha *= l.bgOpacity; ctx.fillStyle = l.bg;
    ctx.beginPath(); roundRect(ctx, (size.w * k) / 2 - widest / 2 - px * 0.4, cy - bh / 2, widest + px * 0.8, bh, px * 0.35); ctx.fill();
    ctx.globalAlpha = clamp(l.opacity);
  }
  lines.forEach((ln, i) => {
    const y = cy - ((lines.length - 1) * lh) / 2 + i * lh;
    if (l.stroke > 0) { ctx.lineWidth = l.stroke * 2 * k; ctx.strokeStyle = '#000'; ctx.lineJoin = 'round'; ctx.strokeText(ln, (size.w * k) / 2, y); }
    ctx.fillStyle = l.color; ctx.fillText(ln, (size.w * k) / 2, y);
  });
  ctx.restore();
}

/** Draws the whole project at time t (seconds; ignored for a photo). */
export function renderFrame(ctx: CanvasRenderingContext2D, env: RenderEnv, t: number): void {
  const p = env.project;
  const size = ASPECTS[p.aspect];
  const W = size.w * env.k, H = size.h * env.k;
  // the very end of a video shows its last picture (every clip ends just before its end time)
  if (p.mode === 'video') { const end = projectDuration(p); if (end > 0.002 && t >= end) t = end - 0.002; }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = p.bgColor;
  ctx.fillRect(0, 0, W, H);
  drawMain(ctx, env, t);
  const still = p.mode === 'photo';
  for (const l of p.layers) {
    if (l.hidden || l.type === 'audio') continue;
    if (l.type === 'media' && l.track === 'main') continue;
    if (!still && l.type !== 'captions' && !(t >= l.start && t < l.start + l.duration)) continue;
    const an = animState(l, t, still);
    switch (l.type) {
      case 'media': drawMedia(ctx, env, l, t, PLAIN_MODS, an); break;
      case 'text': drawText(ctx, env, l, t, an); break;
      case 'sticker': drawSticker(ctx, env, l, t, an); break;
      case 'draw': drawDraw(ctx, env, l, an); break;
      case 'captions': drawCaptions(ctx, env, l, t); break;
      default: break;
    }
  }
  ctx.restore();
}

/** Loads the fonts the project uses, so the first frame already has them. */
export async function loadFonts(p: Project): Promise<void> {
  const names = new Set<string>();
  for (const l of p.layers) if (l.type === 'text' || l.type === 'captions') names.add(l.font);
  await Promise.all([...names].map((n) => document.fonts?.load(`700 40px ${fontCss(n)}`).catch(() => undefined)));
}
