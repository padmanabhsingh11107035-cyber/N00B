// Reloading NOOB so that the NEW version really arrives.
//
// A plain window.location.reload() is not enough on a phone: an iPhone's home-screen app (and some Android browsers) may answer a reload with the page it already has,
// so after "tap to refresh" the app comes back as the same old version. Asking for the page at a slightly different address (the same page with one extra,
// harmless "?_r=<time>") can never be answered from a saved copy, so the server's current page - and with it the current files - is fetched. The extra bit is removed from
// the address bar again as soon as the app has started (cleanReloadMark), so nobody sees it and shared links stay clean.

const MARK = '_r';

/** Reloads the page and makes sure the newest version is fetched. */
export function hardReload(): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set(MARK, String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

/** Takes the "?_r=" mark off the address after a reload (keeps everything else in it, and the page's history state). */
export function cleanReloadMark(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(MARK)) return;
    url.searchParams.delete(MARK);
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  } catch { /* the address keeps the mark: harmless */ }
}
