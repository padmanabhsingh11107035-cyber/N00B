import React from 'react';

// A page that is downloaded when first needed (smaller first load), but can also be fetched ahead of time.
//
// React.lazy alone always shows its loading spinner for a moment on the first open, even when the file has already been fetched in the
// background (it still has to "wait" one tick). So once the page's file is here, this renders the page directly: no spinner at all. Only
// when someone opens a page whose file has not arrived yet does the spinner (the Suspense fallback around it) show.
export function lazyTab<C extends React.ComponentType<any>>(load: () => Promise<C>): { View: C; preload: () => Promise<unknown> } {
  let loaded: C | null = null;
  let loading: Promise<unknown> | null = null;
  const preload = () => (loading ??= load().then((c) => { loaded = c; }).catch((e) => { loading = null; throw e; }));
  const Lazy = React.lazy(() => preload().then(() => ({ default: loaded as C })));
  // The choice is made once, when the page opens, so an open page is never swapped for another copy of itself (which would reset it).
  const View = ((props: any) => {
    const [Ready] = React.useState<C | null>(() => loaded);
    return Ready ? <Ready {...props} /> : <Lazy {...props} />;
  }) as unknown as C;
  return { View, preload };
}
