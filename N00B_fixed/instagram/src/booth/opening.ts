// The 4-second opening of the Buddy Booth: flat 2D art in two colours. A photo-booth strip: the words BUDDY BOOTH drop in, then four photo cards fall into place one after another, each
// is "taken" with a flash and a buddy pops into it (Bunby, Kitsu, Coco, Ember); all four hop once, one last flash, and everything slides away upwards into the first screen.
// The page's own colour is #111184, so nothing has to fade: the art simply leaves. Only #111184 and white are used (the buddies bring their own colours).
import { FONT_LATIN, TAU, bump, pRR, pSpark } from './kit.ts';
import type { Ctx } from './kit.ts';
import { drawSticker } from './scene.ts';

export const OPENING_SECONDS = 4;
export const PAGE_BLUE = '#111184';
const WHITE = '#ffffff';
/** the four that get their picture taken (one from four of the fields) */
export const OPENING_BUDDIES: ReadonlyArray<string> = ['bd-bunby', 'bd-kitsu', 'bd-coco', 'bd-ember'];
/** the moment each photo is taken (the card has fallen into place just before) */
export const SHOT_TIMES: ReadonlyArray<number> = [0.95, 1.6, 2.25, 2.9];
const FALL = 0.42, FLASH = 0.14, POP = 0.35, HOP_AT = 3.25, GROUP_FLASH = 3.5, LEAVE_AT = 3.62;
const TILT: ReadonlyArray<number> = [-0.05, 0.035, 0.05, -0.03];

export type SpriteFn = (c: Ctx, id: string, cx: number, cy: number, size: number, rot: number, flip: boolean, t: number) => void;

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const easeOutBack = (x: number): number => { const v = clamp01(x), a = 1.70158; return 1 + (a + 1) * (v - 1) ** 3 + a * (v - 1) ** 2; };
const easeOutBounce = (x: number): number => {
  let v = clamp01(x);
  const n = 7.5625, d = 2.75;
  if (v < 1 / d) return n * v * v;
  if (v < 2 / d) { v -= 1.5 / d; return n * v * v + 0.75; }
  if (v < 2.5 / d) { v -= 2.25 / d; return n * v * v + 0.9375; }
  v -= 2.625 / d; return n * v * v + 0.984375;
};
const easeIn = (x: number): number => { const v = clamp01(x); return v * v * v; };

export interface OpeningLayout {
  /** one card */
  cw: number; ch: number;
  /** where each card ends up (its top left corner) */
  cards: ReadonlyArray<{ x: number; y: number }>;
  /** the words BUDDY BOOTH: size of the letters and the middle line */
  titleSize: number; titleY: number;
}

/** where everything goes on a screen of W x H: the title above a grid of two by two cards, all of it in the middle */
export function openingLayout(W: number, H: number): OpeningLayout {
  const u = Math.min(W * 0.96, H * 0.5), cw = u * 0.41, ch = cw * 1.25, gap = cw * 0.09, ts = Math.min(u * 0.15, H * 0.075);
  const gridW = cw * 2 + gap, gridH = ch * 2 + gap, total = ts * 1.8 + gridH, top = (H - total) / 2;
  const x0 = (W - gridW) / 2, y0 = top + ts * 1.8;
  return {
    cw, ch,
    cards: [0, 1, 2, 3].map((k) => ({ x: x0 + (k % 2) * (cw + gap), y: y0 + Math.floor(k / 2) * (ch + gap) })),
    titleSize: ts,
    titleY: top + ts * 0.6
  };
}

/** Draw the opening at second `t` (0 .. OPENING_SECONDS) on a canvas of W x H. `sprite` draws a buddy (tests give their own). */
export function drawOpening(c: Ctx, W: number, H: number, t: number, sprite: SpriteFn = drawSticker): void {
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = PAGE_BLUE;
  c.fillRect(0, 0, W, H);
  if (t >= OPENING_SECONDS) { c.restore(); return; }
  const L = openingLayout(W, H);
  // everything slides away upwards at the end (no fading: the page behind is the same blue)
  const leave = easeIn((t - LEAVE_AT) / (OPENING_SECONDS - LEAVE_AT));
  c.translate(0, -H * 1.1 * leave);

  // the words: each letter drops in with a bounce
  const word = 'BUDDY BOOTH';
  c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillStyle = WHITE;
  let size = L.titleSize;
  const measure = (): number[] => { c.font = `900 ${Math.round(size)}px ${FONT_LATIN}`; return [...word].map((ch) => c.measureText(ch).width); };
  let widths = measure(), total = widths.reduce((a, b) => a + b, 0);
  if (total > W * 0.9) { size *= (W * 0.9) / total; widths = measure(); total = widths.reduce((a, b) => a + b, 0); }   // the words always fit on the screen
  let x = (W - total) / 2;
  [...word].forEach((ch, i) => {
    const e = easeOutBounce((t - i * 0.045) / 0.5), y = L.titleY - (L.titleY + L.titleSize) * (1 - e);
    if (t >= i * 0.045 && ch !== ' ') c.fillText(ch, x, y);
    x += widths[i];
  });

  // the four photo cards
  OPENING_BUDDIES.forEach((id, k) => {
    const start = SHOT_TIMES[k] - FALL, shot = SHOT_TIMES[k], p = L.cards[k];
    if (t < start) return;
    const e = easeOutBounce((t - start) / FALL), drop = -(p.y + L.ch + L.cw * 0.3) * (1 - e);
    const m = L.cw * 0.07, win = { x: m, y: m, w: L.cw - 2 * m, h: L.ch - m - L.cw * 0.22 };
    c.save();
    c.translate(p.x + L.cw / 2, p.y + L.ch / 2 + drop);
    c.rotate(TILT[k] * e);
    c.translate(-L.cw / 2, -L.ch / 2);
    pRR(c, 0, 0, L.cw, L.ch, L.cw * 0.05); c.fillStyle = WHITE; c.fill();
    pRR(c, win.x, win.y, win.w, win.h, L.cw * 0.02); c.fillStyle = t >= shot && t < shot + FLASH ? WHITE : PAGE_BLUE; c.fill();
    c.font = `900 ${Math.round(L.cw * 0.1)}px ${FONT_LATIN}`; c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillStyle = PAGE_BLUE;
    c.fillText('NOOB', L.cw - m, L.ch - L.cw * 0.1);
    if (t >= shot + FLASH) {
      const pop = easeOutBack((t - shot - FLASH) / POP), size = win.w * 0.98, hop = bump((t - HOP_AT) / 0.4) * L.cw * 0.07;
      const feet = win.y + win.h - win.h * 0.03 - hop, cx = win.x + win.w / 2;
      c.save();
      c.translate(cx, feet); c.scale(pop, pop); c.translate(-cx, -feet);
      sprite(c, id, cx, feet - 0.465 * size, size, 0, false, t + k * 0.37);
      c.restore();
    }
    c.restore();
    // a few flat white twinkles round the card when its photo is taken
    const age = (t - shot) / 0.6;
    if (age >= 0 && age < 1) {
      for (let j = 0; j < 3; j++) {
        const a = k * 1.3 + j * (TAU / 3), r = L.cw * (0.62 + 0.1 * j), s = L.cw * 0.09 * bump(age + j * 0.05);
        pSpark(c, p.x + L.cw / 2 + Math.cos(a) * r, p.y + L.ch / 2 + Math.sin(a) * r * 0.9, s, a);
        c.fillStyle = WHITE; c.fill();
      }
    }
  });
  c.restore();

  // the last flash: a picture of all four (it is gone again in a blink)
  if (t >= GROUP_FLASH && t < GROUP_FLASH + 0.1) { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = WHITE; c.fillRect(0, 0, W, H); c.restore(); }
}
