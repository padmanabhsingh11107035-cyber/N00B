// The shape of the picture: the sizes people post in, and how a camera picture is cut to fit one. (Tested in scripts/supabase/test-lenses.mjs.)

export interface Ratio {
  id: string;
  label: string;
  /** width / height; 0 = the shape the camera gives */
  ar: number;
  /** the apps and places this shape is made for */
  apps: string;
}

export const RATIOS: ReadonlyArray<Ratio> = [
  { id: 'orig', label: 'Original', ar: 0, apps: 'As the camera sees it' },
  { id: '9:16', label: '9:16', ar: 9 / 16, apps: 'Stories, Reels, TikTok, Shorts, WhatsApp status' },
  { id: '4:5', label: '4:5', ar: 4 / 5, apps: 'Instagram and Facebook posts' },
  { id: '1:1', label: '1:1', ar: 1, apps: 'Square posts, profile pictures' },
  { id: '3:4', label: '3:4', ar: 3 / 4, apps: 'Portrait photos, Facebook' },
  { id: '2:3', label: '2:3', ar: 2 / 3, apps: 'Pinterest, 4 x 6 prints' },
  { id: '4:3', label: '4:3', ar: 4 / 3, apps: 'Landscape photos' },
  { id: '16:9', label: '16:9', ar: 16 / 9, apps: 'YouTube, X (Twitter), wide screens' }
];

export const ratioById = (id: string): Ratio => RATIOS.find((r) => r.id === id) || RATIOS[0];

/** The size of the picture for a camera picture of sw x sh cut to the shape `ar` (0 = as it is): the biggest one of that shape that fits inside it, never stretched and never made bigger than the camera gave, then made smaller if it is above the limits. */
export function outputSize(sw: number, sh: number, ar: number, maxShort: number, maxLong: number): { w: number; h: number } {
  const a = ar > 0 ? ar : sw / sh;
  let w = sw, h = sw / a;
  if (h > sh) { h = sh; w = sh * a; }
  const k = Math.min(1, maxShort / Math.min(w, h), maxLong / Math.max(w, h));
  return { w: Math.max(2, Math.round(w * k)), h: Math.max(2, Math.round(h * k)) };
}

export interface Rect { dx: number; dy: number; dw: number; dh: number }

/** Where the camera picture (sw x sh) is drawn so that it fills an ow x oh picture, cut at the edges: the middle of the sides, and for a cut at the top and bottom a little more of the top is kept (a head is near the top). */
export function coverRect(sw: number, sh: number, ow: number, oh: number, keepTop = 0.45): Rect {
  const s = Math.max(ow / sw, oh / sh);
  const dw = sw * s, dh = sh * s;
  return { dx: (ow - dw) / 2, dy: (oh - dh) * keepTop, dw, dh };
}
