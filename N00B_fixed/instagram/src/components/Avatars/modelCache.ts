// Downloads the 3D avatar files ahead of time, so turning to the next character shows it at once. A file is asked for only once; the last few stay in memory.
// While a file comes in, whoever waits for it is told how far it is (0 to 1), so the page can show a real progress bar.
interface Entry { promise: Promise<ArrayBuffer>; progress: number; listeners: Set<(p: number) => void> }
const cache = new Map<string, Entry>();
const KEEP = 6;

const download = (src: string, e: { progress: number; listeners: Set<(p: number) => void> }): Promise<ArrayBuffer> =>
  fetch(src).then(async (r) => {
    if (!r.ok) throw new Error(String(r.status));
    const total = Number(r.headers.get('content-length')) || 0;
    if (!r.body || !total) return r.arrayBuffer();
    const reader = r.body.getReader(); const parts: Uint8Array[] = []; let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) { parts.push(value); got += value.length; e.progress = Math.min(1, got / total); e.listeners.forEach((f) => f(e.progress)); }
    }
    const out = new Uint8Array(got); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
    return out.buffer;
  });

export const fetchAvatarModel = (src: string, onProgress?: (p: number) => void): Promise<ArrayBuffer> => {
  let hit = cache.get(src);
  if (hit) { cache.delete(src); cache.set(src, hit); } // most recent last
  else {
    const e = { progress: 0, listeners: new Set<(p: number) => void>() };
    const promise = download(src, e);
    hit = { promise, progress: 0, listeners: e.listeners };
    Object.defineProperty(hit, 'progress', { get: () => e.progress });
    promise.catch(() => { if (cache.get(src)?.promise === promise) cache.delete(src); });
    cache.set(src, hit);
    while (cache.size > KEEP) { const oldest = cache.keys().next().value; if (oldest === undefined) break; cache.delete(oldest); }
  }
  if (onProgress) { hit.listeners.add(onProgress); onProgress(hit.progress); }
  return hit.promise;
};

/** quietly starts downloading a model (nothing is shown, errors are ignored) */
export const prefetchAvatarModel = (src: string): void => { fetchAvatarModel(src).catch(() => { /* it is asked for again when it is really needed */ }); };
