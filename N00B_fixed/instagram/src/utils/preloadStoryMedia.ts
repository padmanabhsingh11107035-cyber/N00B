// Story pictures are fetched BEFORE they are needed, so tapping a circle (or moving on to the next person) shows the picture at once.
// The browser keeps what it fetched (pictures are stored for a year), so a picture loaded here is ready the moment the story screen asks for it.
// `isStoryPictureLoaded` tells the story screen it can start the timer straight away; otherwise it waits for the picture (and shows the loader meanwhile).

const MAX_KEPT = 60;
const started = new Map<string, HTMLImageElement>();   // kept referenced so the picture is not dropped while it loads
const loaded = new Set<string>();

export function isStoryPictureLoaded(url?: string | null): boolean {
  return !!url && loaded.has(url);
}

/** Starts fetching a story picture (once). Safe to call as often as needed. */
export function preloadStoryPicture(url?: string | null): void {
  if (!url || typeof Image === 'undefined' || started.has(url)) return;
  const img = new Image();
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.onload = () => {
    loaded.add(url);
    // decoded ahead of time too, so the first paint is not delayed by it (not every browser has decode())
    if (typeof img.decode === 'function') img.decode().catch(() => undefined);
  };
  img.onerror = () => { started.delete(url); };   // a failed one may be tried again later
  img.src = url;
  started.set(url, img);
  if (started.size > MAX_KEPT) {
    const oldest = started.keys().next().value;
    if (oldest !== undefined) { started.delete(oldest); loaded.delete(oldest); }
  }
}

export function preloadStoryPictures(urls: Array<string | null | undefined>): void {
  for (const u of urls) preloadStoryPicture(u);
}
