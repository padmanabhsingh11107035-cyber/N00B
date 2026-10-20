// Quality options for a video, the way YouTube offers them: "Auto" picks by the connection, or the person picks 1080p, 480p, 240p ... and sees roughly how much data each one uses.
// A video's lower-quality copies are made on the uploader's phone after it is posted (utils/videoRenditions.ts); an older video has only its original.

export interface Rendition { height: number; url: string; bytes: number }
export interface QualityOption {
  /** 'original' or the height as text ('480'), which is also what a person picks. */
  id: string;
  label: string;
  url: string;
  height: number;
  /** Bytes of the file when known (the copies carry it; the original is looked up). */
  bytes: number | null;
}

export const ORIGINAL_ID = 'original';

/** The original first, then the copies from big to small. `originalHeight` is only for the label (0 when unknown). */
export function buildOptions(originalUrl: string, renditions: ReadonlyArray<Rendition> | null | undefined, originalHeight = 0, originalBytes: number | null = null): QualityOption[] {
  const copies = [...(renditions || [])].filter((r) => r && r.url && r.height > 0).sort((a, b) => b.height - a.height);
  const opts: QualityOption[] = [{ id: ORIGINAL_ID, label: originalHeight > 0 ? `${originalHeight}p` : 'Original', url: originalUrl, height: originalHeight || 100000, bytes: originalBytes }];
  for (const r of copies) {
    if (originalHeight > 0 && r.height >= originalHeight) continue;   // a "copy" that is not smaller is no use
    opts.push({ id: String(r.height), label: `${r.height}p`, url: r.url, height: r.height, bytes: r.bytes });
  }
  return opts;
}

/** About how many megabytes one minute of this option costs, as text ("≈ 3.2 MB per minute"); empty when it is not known. */
export function dataPerMinute(bytes: number | null | undefined, durationSeconds: number): string {
  if (!bytes || bytes <= 0 || !(durationSeconds > 0)) return '';
  const mb = (bytes / 1_048_576) / (durationSeconds / 60);
  return mb < 10 ? `≈ ${mb.toFixed(1)} MB per minute` : `≈ ${Math.round(mb)} MB per minute`;
}

// A usual bit rate for a picture height, when the file's own size is not known (megabits per second)
const TYPICAL_MBPS: Array<[number, number]> = [[1080, 5], [720, 2.5], [480, 1.1], [360, 0.6], [240, 0.3], [0, 0.15]];
export const typicalMbps = (height: number): number => (TYPICAL_MBPS.find(([h]) => height >= h) || [0, 0.15])[1];

export interface Network { saveData?: boolean; effectiveType?: string; downlinkMbps?: number }

/** What the connection allows: the bit rate (megabits per second) it can carry for a video, comfortably; Infinity when nothing is known. */
export function allowedMbps(n: Network): number {
  if (n.saveData) return 0.4;
  if (n.effectiveType === 'slow-2g' || n.effectiveType === '2g') return 0.15;
  if (n.effectiveType === '3g') return 0.7;
  if (typeof n.downlinkMbps === 'number' && n.downlinkMbps > 0) return n.downlinkMbps * 0.6;
  return Infinity;
}

/** "Auto": the best option the connection can carry; the smallest one when even that is too much. */
export function chooseAuto(options: QualityOption[], n: Network, durationSeconds: number): QualityOption {
  const limit = allowedMbps(n);
  const mbps = (o: QualityOption) => (o.bytes && durationSeconds > 0 ? (o.bytes * 8) / durationSeconds / 1_000_000 : typicalMbps(Math.min(o.height, 1080)));
  const best = options.find((o) => mbps(o) <= limit);   // options are biggest first
  return best || options[options.length - 1];
}

export function readNetwork(): Network {
  try {
    const c = (navigator as any).connection;
    if (!c) return {};
    return { saveData: !!c.saveData, effectiveType: typeof c.effectiveType === 'string' ? c.effectiveType : undefined, downlinkMbps: typeof c.downlink === 'number' ? c.downlink : undefined };
  } catch { return {}; }
}

/** What the menu shows for "Auto": which quality it is using right now. */
export const autoLabel = (current: QualityOption | null) => (current ? `Auto (${current.label})` : 'Auto');

/** Which picture heights get a copy, from the posted video's short side and length. Long videos get none (it would take too long on a phone). */
export function renditionHeights(mainHeight: number, durationSec: number): number[] {
  if (!(mainHeight > 0) || !(durationSec > 0) || durationSec > 15 * 60) return [];
  if (mainHeight >= 900) return [480, 240];
  if (mainHeight >= 540) return [360, 240];
  if (mainHeight >= 300) return [240];
  return [];
}
