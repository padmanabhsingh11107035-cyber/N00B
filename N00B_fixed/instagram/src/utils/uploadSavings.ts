// Pure rules for making NEW uploads smaller (no browser, no files, so each rule is tested on its own: scripts/supabase/test-upload-savings.mjs).
// Nothing here touches anything already stored; it only decides how a picture is prepared before it is sent.

export type UploadFolder = string;

/** Longest side (pixels) a picture may have once uploaded, by where it goes. A phone screen never shows more than this. */
const FOLDER_CAPS: Record<string, number> = {
  posts: 1600,
  reels: 1280,
  stories: 1280,
  chat: 1280,
  comments: 1280,
  avatars: 512,
  covers: 1440,
  products: 1440,
  stickers: 1024,
  team: 1100,
  ads: 1600
};
const DEFAULT_CAP = 1600;

/** What Settings > Media quality calls "normal": anything above these means the person chose High, which is respected. */
const NORMAL_AVATAR = 640;
const NORMAL_OTHER = 1440;

/** The longest side to use: the Media quality setting, but never above the cap for this folder - unless the person picked High quality. */
export function effectiveMaxSide(folder: UploadFolder, settingsMaxSide: number): number {
  const setting = Number.isFinite(settingsMaxSide) && settingsMaxSide > 0 ? Math.round(settingsMaxSide) : NORMAL_OTHER;
  const cap = FOLDER_CAPS[folder] ?? DEFAULT_CAP;
  const normal = folder === 'avatars' ? NORMAL_AVATAR : NORMAL_OTHER;
  if (setting > normal) return setting;
  return Math.min(setting, cap);
}

/** The size after fitting inside maxSide: shape kept, never bigger than the original, never below 1 pixel. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number; scaled: boolean } {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const longest = Math.max(w, h);
  if (!(maxSide > 0) || longest <= maxSide) return { width: w, height: h, scaled: false };
  const k = maxSide / longest;
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)), scaled: true };
}

export interface SkipInput {
  type: string;
  size: number;
  /** An animated WebP (found by reading the file's first bytes). */
  animated?: boolean;
  /** Below this many bytes a picture is left alone. */
  minBytes?: number;
}

/** Before decoding anything: should this file go up exactly as it is? */
export function shouldSkipImage(i: SkipInput): boolean {
  const type = (i.type || '').toLowerCase();
  if (!type.startsWith('image/')) return true;
  if (type.includes('svg') || type.includes('gif')) return true;   // vector / animation
  if (type === 'image/webp' && i.animated) return true;
  const heic = type === 'image/heic' || type === 'image/heif';
  if (!heic && i.size < (i.minBytes ?? 100 * 1024)) return true;   // already small
  return false;
}

export interface PlanInput {
  type: string;
  width: number;
  height: number;
  maxSide: number;
  supportsWebp: boolean;
}
export interface ImagePlan {
  width: number;
  height: number;
  scaled: boolean;
  outType: 'image/webp' | 'image/jpeg';
  /** PNG-like sources: the pixels must be checked for see-through areas; if any exist the original is kept. */
  needsAlphaCheck: boolean;
  heic: boolean;
}

export function planImage(i: PlanInput): ImagePlan {
  const type = (i.type || '').toLowerCase();
  const heic = type === 'image/heic' || type === 'image/heif';
  const fit = fitWithin(i.width, i.height, i.maxSide);
  return {
    width: fit.width,
    height: fit.height,
    scaled: fit.scaled,
    // HEIC always becomes a JPEG every browser can show; others use WebP when this browser can write it.
    outType: !heic && i.supportsWebp ? 'image/webp' : 'image/jpeg',
    needsAlphaCheck: type === 'image/png' || type === 'image/webp',
    heic
  };
}

/** Use the re-encoded copy? HEIC always (the original cannot be shown). A resized picture when smaller. A same-size picture only when clearly smaller (5 %), to avoid quality loss for nothing. */
export function useReencoded(i: { origSize: number; newSize: number; scaled: boolean; heic: boolean }): boolean {
  if (!(i.newSize > 0)) return false;
  if (i.heic) return true;
  if (i.scaled) return i.newSize < i.origSize;
  return i.newSize <= i.origSize * 0.95;
}

/** Is this WebP an animated one? Reads the VP8X header flags (first 32 bytes of the file). */
export function isAnimatedWebp(head: Uint8Array): boolean {
  if (head.length < 21) return false;
  const tag = (o: number, s: string) => s.split('').every((c, k) => head[o + k] === c.charCodeAt(0));
  if (!tag(0, 'RIFF') || !tag(8, 'WEBP')) return false;
  if (!tag(12, 'VP8X')) return false;
  return (head[20] & 0x02) !== 0;
}

/** Can this PNG have see-through pixels? Reads the colour type in the header (4 = grey+alpha, 6 = RGBA, 3 = palette that may carry transparency). */
export function pngMayHaveAlpha(head: Uint8Array): boolean {
  if (head.length < 26) return true;   // unknown: be careful
  const sig = [0x89, 0x50, 0x4e, 0x47];
  if (!sig.every((b, k) => head[k] === b)) return true;
  const colorType = head[25];
  return colorType === 3 || colorType === 4 || colorType === 6;
}

/** "Saved 2.4 MB" / "Saved 640 KB"; empty when nothing worth saying was saved (under 50 KB). */
export function describeSaved(before: number, after: number): string {
  const diff = before - after;
  if (!(diff >= 50 * 1024)) return '';
  if (diff >= 1024 * 1024) return `Saved ${(diff / 1024 / 1024).toFixed(1)} MB`;
  return `Saved ${Math.round(diff / 1024)} KB`;
}

/** The biggest picture height a video may be scaled to, by where it goes. Long videos keep the full ladder (their own renditions exist). */
export function videoMaxStep(folder: UploadFolder): number | undefined {
  return folder === 'videos' ? undefined : 720;
}
