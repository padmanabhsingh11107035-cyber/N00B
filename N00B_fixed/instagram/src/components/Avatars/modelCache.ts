// Downloads the 3D avatar files ahead of time, so turning to the next character shows it at once. A file is asked for only once; the last few stay in memory.
const cache = new Map<string, Promise<ArrayBuffer>>();
const KEEP = 6;

export const fetchAvatarModel = (src: string): Promise<ArrayBuffer> => {
  const hit = cache.get(src);
  if (hit) { cache.delete(src); cache.set(src, hit); return hit; } // most recent last
  const p = fetch(src).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); });
  p.catch(() => { if (cache.get(src) === p) cache.delete(src); });
  cache.set(src, p);
  while (cache.size > KEEP) { const oldest = cache.keys().next().value; if (oldest === undefined) break; cache.delete(oldest); }
  return p;
};

/** quietly starts downloading a model (nothing is shown, errors are ignored) */
export const prefetchAvatarModel = (src: string): void => { fetchAvatarModel(src).catch(() => { /* it is asked for again when it is really needed */ }); };
