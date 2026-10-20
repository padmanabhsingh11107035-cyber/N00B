// Lower-quality copies of a video (the Feed's quality options): right after a video is posted, the uploader's phone makes smaller copies of it, one after the other, uploads them and
// tells the server. It runs quietly in the background (a small strip shows how far it is, with a cancel), never delays posting, and a failed copy is simply left out.
import { transcodeToHeight, canTranscode } from './videoTranscode';
import { uploadMediaFile, setLongVideoRenditions } from '../services/api';

export { renditionHeights } from './videoQuality';
import { renditionHeights } from './videoQuality';

export interface RenditionJob {
  videoId: string;
  heights: number[];
  index: number;                 // the copy being made (0-based)
  fraction: number;              // how far that one is, 0..1
  status: 'running' | 'done' | 'failed' | 'cancelled';
}

let job: RenditionJob | null = null;
let abort: AbortController | null = null;
const listeners = new Set<(j: RenditionJob | null) => void>();
const publish = (next: RenditionJob | null) => { job = next; listeners.forEach((l) => { try { l(job); } catch { /* a listener must not stop the job */ } }); };

export const currentRenditionJob = () => job;
export function subscribeRenditionJob(fn: (j: RenditionJob | null) => void): () => void {
  listeners.add(fn);
  fn(job);
  return () => { listeners.delete(fn); };
}
export function cancelRenditionJob(): void { abort?.abort(); }
export const dismissRenditionJob = () => { if (job && job.status !== 'running') publish(null); };

/** Overall 0..1 for the strip. */
export const jobFraction = (j: RenditionJob) => (j.heights.length ? (j.index + j.fraction) / j.heights.length : 0);

/** Starts making the copies of a posted video (does nothing when this phone cannot, the video is long or small, or another job is running). Returns at once. */
export function queueRenditions(args: { videoId: string; source: File; mainHeight: number; durationSec: number }): boolean {
  const heights = renditionHeights(args.mainHeight, args.durationSec);
  if (!heights.length || !canTranscode() || (job && job.status === 'running')) return false;
  abort = new AbortController();
  const signal = abort.signal;
  publish({ videoId: args.videoId, heights, index: 0, fraction: 0, status: 'running' });
  void (async () => {
    const made: Array<{ height: number; url: string; bytes: number }> = [];
    try {
      for (let i = 0; i < heights.length; i++) {
        if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        publish({ videoId: args.videoId, heights, index: i, fraction: 0, status: 'running' });
        try {
          const copy = await transcodeToHeight(args.source, heights[i], { signal, onProgress: (f) => publish({ videoId: args.videoId, heights, index: i, fraction: f, status: 'running' }) });
          const up = await uploadMediaFile(copy.file, 'videos', { signal, skipCompress: true });
          if (up.objectKey) {
            made.push({ height: copy.height === 0 ? heights[i] : Math.min(copy.width, copy.height), url: up.objectKey, bytes: copy.file.size });
            await setLongVideoRenditions(args.videoId, made);   // each copy is added as soon as it is ready
          }
        } catch (err) {
          if ((err as { name?: string })?.name === 'AbortError') throw err;
          console.warn(`The ${heights[i]}p copy could not be made:`, err);   // this one is left out; the next is still tried
        }
      }
      publish({ videoId: args.videoId, heights, index: heights.length, fraction: 0, status: made.length ? 'done' : 'failed' });
    } catch {
      publish({ videoId: args.videoId, heights, index: 0, fraction: 0, status: 'cancelled' });
    } finally {
      abort = null;
    }
  })();
  return true;
}
