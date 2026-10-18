// How a video is squeezed so it fits what storage accepts. Pure arithmetic (no browser, no files), so every rule below is tested on its own.
//
// Storage takes at most 50 MB per file on the current plan; we aim at 48 MB so the wrapper around the picture and sound still fits. The picture is the only part we
// can shrink (the sound is copied as it is), so: the sound's size is taken off first, the rest of the 48 MB is spread over the length of the video, and the size of the
// picture (1080p, 720p, ...) is the biggest one that still gets enough bits per pixel to look clean. A short video keeps its full size and gets a generous bitrate; a long
// one steps down in size - never in a way that makes a short clip worse than it needs to be.

/** The most a single upload may weigh. Storage refuses 50 MiB (52 428 800 bytes); 48 MiB leaves room for the file's own wrapper. */
export const MAX_UPLOAD_BYTES = 48 * 1024 * 1024;

/** Heights (of the shorter side) a video may be scaled to, biggest first. */
export const SIZE_STEPS = [1080, 720, 540, 480, 360] as const;

/** Bits per pixel per frame. H.264 at about 0.09 looks like the original on a phone; 0.05 is clean for ordinary footage; 0.035 is acceptable for talking and slow scenes. */
export const BPP_COMFORT = 0.09;
export const BPP_GOOD = 0.05;
export const BPP_LOWEST = 0.035;
/** Below this the picture would be mush; the video is too long for one file at this plan's limit. */
export const BPP_FLOOR = 0.026;

/** A file this small is uploaded as it is: compressing it would take longer than sending it. */
export const SMALL_FILE_BYTES = 6 * 1024 * 1024;

export interface PlanInput {
  durationSec: number;
  /** The picture's size as it is shown (after any rotation). */
  width: number;
  height: number;
  /** Frames per second of the original. */
  fps: number;
  /** Bytes of the sound track (copied unchanged). */
  audioBytes: number;
  /** How big the original file is. */
  sourceBytes: number;
  /** Picture bits per second of the original, when known. */
  sourceVideoBps?: number;
  /** Defaults to MAX_UPLOAD_BYTES. */
  targetBytes?: number;
  /** A file this small is sent as it is. Defaults to SMALL_FILE_BYTES. */
  smallBytes?: number;
}

export interface EncodingPlan {
  /** false: send the original as it is (already small and light enough). */
  transcode: boolean;
  /** false: even the smallest picture would not fit - the video is too long for one file. */
  fits: boolean;
  width: number;
  height: number;
  fps: number;
  /** Picture bits per second to ask the encoder for. */
  videoBps: number;
  /** Bits per pixel per frame that bitrate gives. */
  bpp: number;
  /** About how big the finished file will be. */
  estimatedBytes: number;
  /** 'small' = left alone because it is already small. 'light' = left alone because it is already efficient. 'too-long' = does not fit. */
  reason?: 'small' | 'light' | 'too-long';
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** The picture size for a step: the shorter side becomes `step` pixels, the other keeps the shape; never bigger than the original. */
export function sizeForStep(width: number, height: number, step: number): { width: number; height: number } {
  const short = Math.min(width, height);
  if (short <= step) return { width: even(width), height: even(height) };
  const k = step / short;
  return { width: even(width * k), height: even(height * k) };
}

/** Frame rate to encode at: the original's, but never above 30 (60 fps doubles the cost for a difference nobody sees in a chat or a feed) and never below 15. */
export function targetFps(sourceFps: number, tight = false): number {
  const f = Number.isFinite(sourceFps) && sourceFps > 0 ? sourceFps : 30;
  const capped = Math.min(30, Math.max(15, Math.round(f)));
  return tight ? Math.min(capped, 24) : capped;
}

export function planEncoding(input: PlanInput): EncodingPlan {
  const target = input.targetBytes ?? MAX_UPLOAD_BYTES;
  const dur = Math.max(0.5, input.durationSec);
  const srcFps = targetFps(input.fps);
  const srcShort = Math.min(input.width, input.height);

  // The bytes left for the picture: a little off the top for the file's wrapper (3 %), then the sound.
  const pictureBytes = target * 0.97 - input.audioBytes;
  const budgetBps = (pictureBytes * 8) / dur;

  // Already small enough and light enough: send it as it is.
  if (input.sourceBytes <= (input.smallBytes ?? SMALL_FILE_BYTES)) {
    return { transcode: false, fits: true, width: even(input.width), height: even(input.height), fps: srcFps, videoBps: input.sourceVideoBps || 0, bpp: 0, estimatedBytes: input.sourceBytes, reason: 'small' };
  }

  // A step is never bigger than the original (a 640-pixel video is not scaled up): its own size stands in for every step above it.
  const sorted = [...new Set(SIZE_STEPS.map((s) => Math.min(s, srcShort)))].sort((a, b) => b - a);

  const bppAt = (s: number, fps: number) => {
    const d = sizeForStep(input.width, input.height, s);
    return { d, bpp: budgetBps / (d.width * d.height * fps) };
  };

  let pick: { step: number; fps: number; d: { width: number; height: number }; bpp: number } | null = null;
  // The biggest picture that still gets BPP_GOOD; then the biggest that gets BPP_LOWEST; then (same fps lowered to 24) the smallest picture at BPP_FLOOR.
  for (const threshold of [BPP_GOOD, BPP_LOWEST]) {
    for (const s of sorted) {
      const { d, bpp } = bppAt(s, srcFps);
      if (bpp >= threshold) { pick = { step: s, fps: srcFps, d, bpp }; break; }
    }
    if (pick) break;
  }
  if (!pick) {
    const fps = targetFps(input.fps, true);
    const small = sorted[sorted.length - 1];
    const { d, bpp } = bppAt(small, fps);
    pick = { step: small, fps, d, bpp };
    if (bpp < BPP_FLOOR) {
      return { transcode: true, fits: false, width: d.width, height: d.height, fps, videoBps: Math.max(0, Math.floor(budgetBps)), bpp, estimatedBytes: Math.ceil((budgetBps * dur) / 8 + input.audioBytes), reason: 'too-long' };
    }
  }

  // Spend what is needed to look like the original, not the whole budget: the comfortable bitrate for this picture, or the original's own, whichever is lower.
  const pixels = pick.d.width * pick.d.height;
  const comfortBps = BPP_COMFORT * pixels * pick.fps;
  let videoBps = Math.min(budgetBps, comfortBps);
  if (input.sourceVideoBps && input.sourceVideoBps > 0) videoBps = Math.min(videoBps, input.sourceVideoBps * 0.85);

  // Already within what we would produce, and it fits: sending it again as a new, smaller file gains nothing.
  if (input.sourceBytes <= target && input.sourceVideoBps && input.sourceVideoBps <= comfortBps * 1.05 && pick.d.width >= even(input.width) - 2) {
    return { transcode: false, fits: true, width: even(input.width), height: even(input.height), fps: srcFps, videoBps: input.sourceVideoBps, bpp: 0, estimatedBytes: input.sourceBytes, reason: 'light' };
  }

  videoBps = Math.max(80_000, Math.floor(videoBps));
  return {
    transcode: true,
    fits: true,
    width: pick.d.width,
    height: pick.d.height,
    fps: pick.fps,
    videoBps,
    bpp: videoBps / (pixels * pick.fps),
    estimatedBytes: Math.ceil((videoBps * dur) / 8 / 0.97 + input.audioBytes)
  };
}

/** The longest video (in seconds) that can be made to fit in one file, with sound of `audioBps` bits per second, at the smallest picture we accept. */
export function maxSecondsThatFit(audioBps = 128_000, targetBytes: number = MAX_UPLOAD_BYTES): number {
  const smallest = SIZE_STEPS[SIZE_STEPS.length - 1];
  const w = Math.round((smallest * 16) / 9);
  const minVideoBps = BPP_FLOOR * w * smallest * targetFps(24, true);
  return Math.floor((targetBytes * 0.97 * 8) / (minVideoBps + audioBps));
}

/** "about 20 minutes" - for messages. */
export function describeSeconds(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 90) return `${s} seconds`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} minutes`;
  const h = s / 3600;
  return `${h.toFixed(h < 10 ? 1 : 0).replace(/\.0$/, '')} hours`;
}
