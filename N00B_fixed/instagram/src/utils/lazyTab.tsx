import React from 'react';
import { hardReload } from './reloadApp.ts';

// A page that is downloaded when first needed (smaller first load), but can also be fetched ahead of time.
//
// React.lazy alone always shows its loading spinner for a moment on the first open, even when the file has already been fetched in the
// background (it still has to "wait" one tick). So once the page's file is here, this renders the page directly: no spinner at all. Only
// when someone opens a page whose file has not arrived yet does the spinner (the Suspense fallback around it) show.
// A page's file can be gone: an app that has been open since before a new version was published asks for a file with the OLD name, which the server no longer has.
// The only cure is the new version, so the app is reloaded - at most once a minute (never a loop), and never while the phone is offline (a reload would only show
// the browser's "no internet" page).
const RELOAD_KEY = 'noob.chunkReloadAt';
function reloadForNewVersion(): void {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch { /* no storage: one reload is still fine */ }
  hardReload();
}

export function lazyTab<C extends React.ComponentType<any>>(load: () => Promise<C>): { View: C; preload: () => Promise<unknown> } {
  let loaded: C | null = null;
  let loading: Promise<unknown> | null = null;
  const preload = () => (loading ??= load().then((c) => { loaded = c; }).catch((e) => { loading = null; reloadForNewVersion(); throw e; }));
  const Lazy = React.lazy(() => preload().then(() => ({ default: loaded as C })));
  // The choice is made once, when the page opens, so an open page is never swapped for another copy of itself (which would reset it).
  const View = ((props: any) => {
    const [Ready] = React.useState<C | null>(() => loaded);
    return Ready ? <Ready {...props} /> : <Lazy {...props} />;
  }) as unknown as C;
  return { View, preload };
}
