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
