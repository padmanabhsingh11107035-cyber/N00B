// A link that leads to one of NOOB's own pages (a question link /ask/<name>, a poll /polls/<id>...) opens INSIDE the app, with the usual way back, instead of leaving it for the phone's
// browser. The app registers the handler once (App.tsx); anything that shows a tappable link (a Story's link button) asks here first and only opens a new browser tab when the link is not ours.

type Handler = (url: string) => boolean;
let handler: Handler | null = null;

export function setInAppLinkHandler(next: Handler | null): void {
  handler = next;
}

/** Opens `url` inside the app when it is one of NOOB's own pages. Returns false when it is not (the caller then opens it the normal way). */
export function openInApp(url: unknown): boolean {
  if (typeof url !== 'string' || !url || !handler) return false;
  try { return handler(url) === true; } catch { return false; }
}

// A tapped #hashtag opens the hashtag page inside the app (App.tsx registers the opener once; the page is a layer on top of the page that is showing, with the usual way back).
type TagHandler = (tag: string) => void;
let tagHandler: TagHandler | null = null;

export function setHashtagHandler(next: TagHandler | null): void {
  tagHandler = next;
}

/** Opens the page of `tag` ("#robots" or "robots"). Returns false when the app has not registered an opener (nothing happens then). */
export function openHashtag(tag: unknown): boolean {
  if (typeof tag !== 'string' || !tag || !tagHandler) return false;
  try { tagHandler(tag); return true; } catch { return false; }
}
