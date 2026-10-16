// The next reel is fetched AHEAD of time, as a whole file, and played from the phone's memory (a blob: address) when it is reached — so it starts at once.
//
// Why not just a hidden <video preload="auto">: iPhone Safari ignores it (it fetches nothing until play() is called), so every swipe there started a cold
// download; and even where it works, the data it buffers is not handed to the video that plays. A plain fetch() works the same everywhere.
//
// Rules that keep this cheap: only the NEXT reel (the caller waits until the person has stayed on the current one for a moment, and skips it on Data Saver /
// slow connections), never a file bigger than MAX_BYTES, at most MAX_KEPT files held in memory, and everything is given back when the reels page closes.
// Anything that goes wrong (offline, refused, too big, aborted) is silent: the reel then simply streams from its normal address when it is reached.

export const MAX_BYTES = 40 * 1024 * 1024;
export const MAX_KEPT = 3;

const ready = new Map<string, string>();               // normal address -> blob: address, oldest first
const pending = new Map<string, AbortController>();
let inUse: string | null = null;                        // the reel playing right now (its blob must not be taken away)

function videoType(url: string): string {
  const path = url.split('?')[0].toLowerCase();
  if (path.endsWith('.webm')) return 'video/webm';
  if (path.endsWith('.mov')) return 'video/quicktime';
  return 'video/mp4';
}

function evict(): void {
  while (ready.size > MAX_KEPT) {
    const oldest = Array.from(ready.keys()).find((k) => k !== inUse);
    if (oldest === undefined) return;
    const blobUrl = ready.get(oldest);
    ready.delete(oldest);
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }
}

/** The in-memory address of a reel that was fetched ahead of time, or null (play it from its normal address then). */
export function prefetchedReel(url?: string | null): string | null {
  return (url && ready.get(url)) || null;
}

/** Tells the prefetcher which reel is playing, so its file is kept while others are given back. */
export function markReelInUse(url?: string | null): void {
  inUse = url || null;
}

/** Starts fetching a reel's video (once). Safe to call as often as needed. */
export function prefetchReel(url?: string | null): void {
  if (!url || ready.has(url) || pending.has(url)) return;
  if (url.startsWith('blob:') || url.startsWith('data:')) return;
  if (typeof fetch === 'undefined' || typeof AbortController === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return;
  const controller = new AbortController();
  pending.set(url, controller);
  void (async () => {
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return;
      const length = Number(res.headers.get('content-length') || 0);
      if (length > MAX_BYTES) {
        controller.abort();   // a big file is streamed as it plays instead
        return;
      }
      const blob = await res.blob();
      if (controller.signal.aborted || blob.size === 0 || blob.size > MAX_BYTES) return;
      const typed = blob.type.startsWith('video/') ? blob : new Blob([blob], { type: videoType(url) });
      ready.set(url, URL.createObjectURL(typed));
      evict();
    } catch {
      // offline, refused or stopped: nothing to do, the reel streams when it is reached
    } finally {
      if (pending.get(url) === controller) pending.delete(url);
    }
  })();
}

/** The reel is being played from its normal address now: a fetch of it that is still running would only compete with it. */
export function cancelReelPrefetch(url?: string | null): void {
  if (!url) return;
  const controller = pending.get(url);
  if (!controller) return;
  controller.abort();
  pending.delete(url);
}

/** Gives everything back (the reels page closed). */
export function clearReelPrefetch(): void {
  for (const controller of pending.values()) controller.abort();
  pending.clear();
  for (const blobUrl of ready.values()) URL.revokeObjectURL(blobUrl);
  ready.clear();
  inUse = null;
}
