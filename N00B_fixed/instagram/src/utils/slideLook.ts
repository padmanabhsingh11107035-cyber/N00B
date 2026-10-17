// The "look" of one picture of a post, kept in the slide's existing `filter` text so no database change is needed:
//
//     clarendon                         a plain filter (what every older post has)
//     clarendon|ar=1:1|b=20|c=-10|s=30|w=15
//                                       the filter, the shape the picture is shown in, and the Adjustments sliders (each -100..100, 0 = untouched)
//
// Older posts keep working exactly as they are (a bare filter id parses to "no shape, no adjustments").
import type React from 'react';
import { POST_FILTERS } from '../data/postFilters.ts';

export type SlideShape = 'original' | '1:1' | '4:5' | '16:9';
export const SLIDE_SHAPES: { id: SlideShape; label: string; ratio: number | null }[] = [
  { id: 'original', label: 'Original', ratio: null },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 }
];

export interface SlideLook {
  preset: string;       // an id from POST_FILTERS
  shape: SlideShape;
  brightness: number;   // -100..100
  contrast: number;
  saturation: number;
  warmth: number;       // + warmer, - cooler
}
export const NO_LOOK: SlideLook = { preset: 'normal', shape: 'original', brightness: 0, contrast: 0, saturation: 0, warmth: 0 };

const clamp = (n: number) => Math.max(-100, Math.min(100, Math.round(n)));
const KEYS: Record<string, keyof SlideLook> = { b: 'brightness', c: 'contrast', s: 'saturation', w: 'warmth' };

export function parseLook(filter?: string | null): SlideLook {
  const [preset, ...rest] = String(filter || '').split('|');
  const look: SlideLook = { ...NO_LOOK, preset: POST_FILTERS.some((f) => f.id === preset) ? preset : 'normal' };
  for (const part of rest) {
    const [k, v] = part.split('=');
    if (k === 'ar' && SLIDE_SHAPES.some((s) => s.id === v)) look.shape = v as SlideShape;
    else if (KEYS[k] && Number.isFinite(Number(v))) (look[KEYS[k]] as number) = clamp(Number(v));
  }
  return look;
}

export function buildLook(look: SlideLook): string {
  const parts = [look.preset || 'normal'];
  if (look.shape !== 'original') parts.push(`ar=${look.shape}`);
  (Object.keys(KEYS) as string[]).forEach((k) => {
    const v = look[KEYS[k]] as number;
    if (v) parts.push(`${k}=${clamp(v)}`);
  });
  return parts.join('|');
}

/** The CSS `filter` for a look: the preset first, then the sliders. '' when there is nothing to apply. */
export function lookCss(filter?: string | null): string {
  const look = parseLook(filter);
  const preset = POST_FILTERS.find((f) => f.id === look.preset)?.css || '';
  const adj: string[] = [];
  if (look.brightness) adj.push(`brightness(${(1 + look.brightness / 200).toFixed(3)})`);
  if (look.contrast) adj.push(`contrast(${(1 + look.contrast / 200).toFixed(3)})`);
  if (look.saturation) adj.push(`saturate(${(1 + look.saturation / 100).toFixed(3)})`);
  if (look.warmth > 0) adj.push(`sepia(${(look.warmth / 250).toFixed(3)}) saturate(${(1 + look.warmth / 400).toFixed(3)})`);
  if (look.warmth < 0) adj.push(`hue-rotate(${Math.round(look.warmth * 0.2)}deg) saturate(${(1 - look.warmth / 500).toFixed(3)})`);
  return [preset, ...adj].filter(Boolean).join(' ');
}

/** Spread this on an <img> / <video>: style={lookStyle(slide.filter)} */
export function lookStyle(filter?: string | null): React.CSSProperties | undefined {
  const css = lookCss(filter);
  return css ? { filter: css } : undefined;
}

/** The width / height the picture is shown in, or null to show it in its own shape. */
export function lookRatio(filter?: string | null): number | null {
  const shape = parseLook(filter).shape;
  return SLIDE_SHAPES.find((s) => s.id === shape)?.ratio ?? null;
}
