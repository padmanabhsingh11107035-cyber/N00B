import { Adjust, NO_ADJUST } from './types';

// Original looks, made only of the adjustments below plus (for the tinted ones) a colour matrix. A filter replaces the previous filter (they never pile up), its strength is a
// slider, and the person's own adjustments are applied on top of it.
export interface FilterDef {
  id: string;
  name: string;
  adjust: Partial<Adjust>;
  /** 4x5 colour matrix (row-major: r,g,b,a, offset) applied after the adjustments, optional */
  matrix?: number[];
}

const I = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
const mat = (rows: number[][], offset: number[] = [0, 0, 0]): number[] => [...rows[0], offset[0], ...rows[1], offset[1], ...rows[2], offset[2], 0, 0, 0, 1, 0];

export const FILTERS: FilterDef[] = [
  { id: 'none', name: 'Original', adjust: {} },
  { id: 'natural', name: 'Natural', adjust: { contrast: 6, vibrance: 14, sharpness: 12 } },
  { id: 'warm', name: 'Warm', adjust: { temperature: 32, saturation: 8, brightness: 3 } },
  { id: 'cool', name: 'Cool', adjust: { temperature: -32, tint: -4, saturation: 4 } },
  { id: 'cinematic', name: 'Cinematic', adjust: { contrast: 18, saturation: -10, vignette: 28, shadows: -10 }, matrix: mat([[1.08, 0, -0.02], [0, 1, 0.02], [-0.04, 0.08, 1.1]], [0.01, 0, 0.01]) },
  { id: 'vintage', name: 'Vintage', adjust: { fade: 30, grain: 18, saturation: -12, temperature: 14, vignette: 16 }, matrix: mat([[0.93, 0.07, 0.05], [0.04, 0.9, 0.04], [0.03, 0.08, 0.78]], [0.03, 0.02, 0]) },
  { id: 'retro', name: 'Retro', adjust: { fade: 24, temperature: 22, saturation: 10, vignette: 24, grain: 10 } },
  { id: 'film', name: 'Film', adjust: { contrast: 10, saturation: -8, grain: 26, fade: 12, highlights: -8 } },
  { id: 'bw', name: 'Black & white', adjust: { saturation: -100, contrast: 12 } },
  { id: 'mono', name: 'Monochrome', adjust: { contrast: 24, vignette: 18 }, matrix: mat([[0.33, 0.55, 0.12], [0.33, 0.55, 0.12], [0.33, 0.55, 0.12]]) },
  { id: 'faded', name: 'Faded', adjust: { fade: 46, saturation: -16, contrast: -6 } },
  { id: 'dramatic', name: 'Dramatic', adjust: { contrast: 36, saturation: 10, shadows: -22, highlights: -12, vignette: 30, sharpness: 20 } },
  { id: 'vibrant', name: 'Vibrant', adjust: { vibrance: 52, saturation: 20, contrast: 8 } },
  { id: 'soft', name: 'Soft', adjust: { contrast: -14, brightness: 8, fade: 10, blur: 1.2 } },
  { id: 'moody', name: 'Moody', adjust: { exposure: -12, contrast: 22, saturation: -20, temperature: -10, vignette: 36 } },
  { id: 'sunset', name: 'Sunset', adjust: { temperature: 46, tint: 12, saturation: 22, highlights: -6 } },
  { id: 'night', name: 'Night', adjust: { exposure: -10, temperature: -36, shadows: 22, saturation: 10, vignette: 22 } },
  { id: 'portrait', name: 'Portrait', adjust: { temperature: 12, highlights: -16, vibrance: 16, sharpness: 12, brightness: 4 } },
  { id: 'matte', name: 'Matte', adjust: { fade: 55, contrast: -10, saturation: -6 } }
];

export const filterById = (id: string): FilterDef => FILTERS.find((f) => f.id === id) || FILTERS[0];

/** The adjustments a filter adds, scaled by its strength (0..100). */
export function filterAdjust(id: string, amount: number): Adjust {
  const f = filterById(id);
  const k = Math.max(0, Math.min(1, amount / 100));
  const out: Adjust = { ...NO_ADJUST };
  for (const key of Object.keys(f.adjust) as Array<keyof Adjust>) out[key] = (f.adjust[key] || 0) * k;
  return out;
}

export const filterMatrix = (id: string): number[] => filterById(id).matrix || I;
