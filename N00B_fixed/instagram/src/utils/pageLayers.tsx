import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

// "Go to previous page": a profile that is opened from any page (Home, Explore, Reels, Chat, another profile, ...) opens as a LAYER on top of that page, instead of replacing it.
//
//   * The page underneath is never closed. It stays alive (hidden, display:none), so when the person comes back it is exactly as they left it: the same posts in the same
//     order (nothing is reshuffled or reloaded), the same search, the same tab, and the same scroll position (the page's, and every scrolling box inside it).
//   * Layers stack: from a profile you can open another profile; "Go to previous page" goes back one layer at a time.
//   * The phone's back button / back swipe / the browser's Back does the same as the on-screen button (each layer adds one browser-history entry).
//   * Tapping a tab of the bottom bar (or any other jump to a different page) closes all layers; tapping the tab you are already on goes back to your page, at your place.
//   * A page that plays sound by itself (the reels) is told it is hidden (usePageHidden) and pauses; whatever was playing on its own is resumed when it comes back.

export interface PageLayer<T> { id: number; data: T }

// Window events: the person went back from the LAST layer to the page underneath (the Back button, the phone's back), and: every layer was closed at once (a tab of the bottom bar,
// the Home tab pressed again). The three-line menu on Home listens, to drop the person back in the menu after a Fun page (utils/menuReturn.ts).
export const LAYERS_BACK_EVENT = 'noob:layers-back-to-page';
export const LAYERS_CLEARED_EVENT = 'noob:layers-cleared';
const announce = (name: string) => { try { if (typeof window !== 'undefined') window.dispatchEvent(new Event(name)); } catch { /* nobody is listening: nothing to tell */ } };

const PageHiddenContext = createContext(false);
/** True while this page sits underneath another one (a profile that was opened over it): pages that play media by themselves should stay quiet. */
export const usePageHidden = (): boolean => useContext(PageHiddenContext);

// ------------------------------------------------------------------------------------------------ remembering where a page was scrolled to

export interface ScrollSnapshot {
  /** which page it was taken from (the tab), so a snapshot is never applied to a different page */
  page: string;
  x: number;
  y: number;
  /** every scrolling box inside the page that was not at its start (lists, rows of pills, the chat, ...) */
  inner: Array<{ el: Element; top: number; left: number }>;
}

export function captureScroll(root: Element | null, page: string): ScrollSnapshot {
  const inner: ScrollSnapshot['inner'] = [];
  if (root) {
    root.querySelectorAll('*').forEach((el) => {
      if (el.scrollTop > 0 || el.scrollLeft > 0) inner.push({ el, top: el.scrollTop, left: el.scrollLeft });
    });
  }
  return { page, x: window.scrollX, y: window.scrollY, inner };
}

export function restoreScroll(snap: ScrollSnapshot): void {
  const apply = () => {
    window.scrollTo({ left: snap.x, top: snap.y, behavior: 'instant' as ScrollBehavior });
    for (const s of snap.inner) {
      if (!s.el.isConnected) continue;
      s.el.scrollTop = s.top;
      s.el.scrollLeft = s.left;
    }
  };
  apply();
  // once more after the browser has laid the page out again (images, lazy parts), in case the first try was clamped to a page that was still short
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(apply);
}

// ------------------------------------------------------------------------------------------------ media that plays by itself

function pauseMedia(root: Element | null): HTMLMediaElement[] {
  if (!root) return [];
  const playing = Array.from(root.querySelectorAll<HTMLMediaElement>('video,audio')).filter((m) => !m.paused && !m.ended);
  playing.forEach((m) => { try { m.pause(); } catch { /* already gone */ } });
  return playing;
}

/** Only what starts and loops by itself comes back by itself (a feed video); something the person pressed play on (a voice message) stays paused. */
function resumeMedia(list: HTMLMediaElement[]): void {
  list.forEach((m) => {
    if (!m.isConnected || !(m.loop || m.autoplay)) return;
    try { void m.play()?.catch(() => undefined); } catch { /* the page will start it when it can */ }
  });
}

// ------------------------------------------------------------------------------------------------ the layers

export const MAX_LAYERS = 20;

export interface PageLayersController<T> {
  layers: PageLayer<T>[];
  /** open something on top of the page that is showing (nothing happens if it is already the top layer) */
  push: (data: T) => void;
  /** "Go to previous page": one layer back, with the page underneath exactly as it was */
  back: () => void;
  /** close every layer; `restore` brings the page underneath back to the place it was scrolled to (use it when the person stays on that same page) */
  clear: (opts?: { restore?: boolean }) => void;
  /** newer details of something that is already open (every layer showing it) */
  update: (data: T) => void;
  patch: (id: string, change: (data: T) => T) => void;
  register: (layerId: number, el: HTMLElement | null) => void;
}

export function usePageLayers<T extends { id: string }>(page: string): PageLayersController<T> {
  const [layers, setLayers] = useState<PageLayer<T>[]>([]);
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const pageRef = useRef(page);
  pageRef.current = page;

  const nextId = useRef(1);
  const roots = useRef(new Map<number, HTMLElement>());          // 0 = the page itself, then one per layer
  const snaps = useRef<Array<ScrollSnapshot | undefined>>([]);   // index = how many layers were open when it was taken
  const mediaPaused = useRef<HTMLMediaElement[][]>([]);
  const restoreNext = useRef(false);
  const historyDepth = useRef(0);   // browser-history entries added for the open layers
  const ignorePops = useRef(0);     // pops that we caused ourselves (closing all layers at once)
  const backPending = useRef(false);
  const viaBack = useRef(false);   // the layer that is closing was closed by going back (not by closing all of them)

  const register = useCallback((layerId: number, el: HTMLElement | null) => {
    if (el) roots.current.set(layerId, el);
    else roots.current.delete(layerId);
  }, []);

  const visibleRoot = (count: number) => roots.current.get(count === 0 ? 0 : layersRef.current[count - 1]?.id ?? -1) ?? null;

  const push = useCallback((data: T) => {
    const cur = layersRef.current;
    if (cur.length > 0 && cur[cur.length - 1].data.id === data.id) return;   // already on it
    const root = visibleRoot(cur.length);
    snaps.current[cur.length] = captureScroll(root, pageRef.current);
    mediaPaused.current[cur.length] = pauseMedia(root);
    if (cur.length >= MAX_LAYERS) {
      // far more than anyone opens: swap the top one instead of piling up more
      setLayers((prev) => [...prev.slice(0, -1), { id: nextId.current++, data }]);
      return;
    }
    try {
      if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';   // we put the scroll back ourselves
      window.history.pushState({ noobLayer: cur.length + 1 }, '');
      historyDepth.current += 1;
    } catch { /* no history: the on-screen button still works */ }
    setLayers((prev) => [...prev, { id: nextId.current++, data }]);
  }, []);

  const popOne = useCallback(() => {
    restoreNext.current = true;
    viaBack.current = true;
    backPending.current = false;
    setLayers((prev) => prev.slice(0, -1));
  }, []);

  const back = useCallback(() => {
    if (layersRef.current.length === 0 || backPending.current) return;
    if (historyDepth.current > 0) {
      // go through the browser history, so the address stack stays in step; the popstate below closes the layer
      backPending.current = true;
      const before = layersRef.current.length;
      try { window.history.back(); } catch { popOne(); return; }
      // if the browser never answers, do not leave the person stuck on this page
      window.setTimeout(() => {
        if (backPending.current && layersRef.current.length === before) { historyDepth.current = Math.max(0, historyDepth.current - 1); popOne(); }
        backPending.current = false;
      }, 500);
    } else {
      popOne();
    }
  }, [popOne]);

  const clear = useCallback((opts?: { restore?: boolean }) => {
    if (layersRef.current.length === 0) return;
    restoreNext.current = !!opts?.restore;
    viaBack.current = false;
    setLayers([]);
    announce(LAYERS_CLEARED_EVENT);
    let n = historyDepth.current;
    historyDepth.current = 0;
    if (backPending.current) {
      // a "back" is already on its way: its answer must not close anything, and it already covers one of the entries
      backPending.current = false;
      ignorePops.current += 1;
      n = Math.max(0, n - 1);
    }
    if (n > 0) {
      ignorePops.current += 1;   // one popstate answers the whole jump back
      try { window.history.go(-n); } catch { ignorePops.current = Math.max(0, ignorePops.current - 1); }
    }
  }, []);

  const update = useCallback((data: T) => {
    setLayers((prev) => (prev.some((l) => l.data.id === data.id) ? prev.map((l) => (l.data.id === data.id ? { ...l, data } : l)) : prev));
  }, []);

  const patch = useCallback((id: string, change: (data: T) => T) => {
    setLayers((prev) => (prev.some((l) => l.data.id === id) ? prev.map((l) => (l.data.id === id ? { ...l, data: change(l.data) } : l)) : prev));
  }, []);

  // the phone's back button / back swipe / the browser's Back
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      if (ignorePops.current > 0) { ignorePops.current -= 1; return; }
      backPending.current = false;
      if (layersRef.current.length > 0) {
        historyDepth.current = Math.max(0, historyDepth.current - 1);
        popOne();
      } else if ((e.state as { noobLayer?: number } | null)?.noobLayer) {
        // "Forward" into a layer that is no longer there: step back over it
        ignorePops.current += 1;
        try { window.history.back(); } catch { ignorePops.current = Math.max(0, ignorePops.current - 1); }
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [popOne]);

  // when a layer arrives, it starts at its top; when one leaves, the page under it is put back exactly as it was
  const prevCount = useRef(0);
  useLayoutEffect(() => {
    const count = layers.length;
    const before = prevCount.current;
    prevCount.current = count;
    if (count > before) {
      window.scrollTo({ left: 0, top: 0, behavior: 'instant' as ScrollBehavior });
    } else if (count < before) {
      const snap = snaps.current[count];
      if (restoreNext.current && snap && snap.page === pageRef.current) restoreScroll(snap);
      resumeMedia(mediaPaused.current[count] || []);
      snaps.current.length = count;
      mediaPaused.current.length = count;
      restoreNext.current = false;
      if (count === 0 && viaBack.current) announce(LAYERS_BACK_EVENT);
      viaBack.current = false;
    }
  }, [layers.length]);

  return useMemo(() => ({ layers, push, back, clear, update, patch, register }), [layers, push, back, clear, update, patch, register]);
}

/**
 * Wraps one page (layerId 0 = the page itself, otherwise the layer's id). Drawn normally while it is the one showing; kept alive but hidden while another layer is on top.
 * `display: contents` keeps the layout identical to having no wrapper at all.
 */
export const PageLayerSlot: React.FC<{ layerId: number; hidden: boolean; register: (layerId: number, el: HTMLElement | null) => void; children?: React.ReactNode }> = ({ layerId, hidden, register, children }) => {
  const ref = useCallback((el: HTMLDivElement | null) => register(layerId, el), [register, layerId]);
  return (
    <PageHiddenContext.Provider value={hidden}>
      <div ref={ref} data-page-layer={layerId} data-page-hidden={hidden ? 'true' : undefined} aria-hidden={hidden ? true : undefined} style={{ display: hidden ? 'none' : 'contents' }}>
        {children}
      </div>
    </PageHiddenContext.Provider>
  );
};

// ------------------------------------------------------------------------------------------------ pages that stay alive when another tab shows

/** Says "hidden" to everything inside (usePageHidden) when this page, or any page above it, is hidden. */
export const PageHiddenScope: React.FC<{ hidden: boolean; children?: React.ReactNode }> = ({ hidden, children }) => {
  const above = useContext(PageHiddenContext);
  return <PageHiddenContext.Provider value={above || hidden}>{children}</PageHiddenContext.Provider>;
};

/**
 * A tab (Home, Explore) that is built once and then only hidden while another tab shows, so coming back is instant: nothing is built again, nothing is fetched again, and the
 * page is exactly as it was left. While hidden it is told so (usePageHidden), whatever plays by itself is paused (and resumed on return), and it is not drawn again when the app
 * changes something in the background (its content is held as it was until it is shown again).
 */
export const KeepAliveTab: React.FC<{ hidden: boolean; children?: React.ReactNode }> = ({ hidden, children }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const held = useRef<React.ReactNode>(children);
  if (!hidden) held.current = children;
  const paused = useRef<HTMLMediaElement[]>([]);
  useLayoutEffect(() => {
    if (hidden) paused.current = pauseMedia(ref.current);
    else { resumeMedia(paused.current); paused.current = []; }
  }, [hidden]);
  return (
    <PageHiddenScope hidden={hidden}>
      <div ref={ref} data-tab-hidden={hidden ? 'true' : undefined} aria-hidden={hidden ? true : undefined} style={{ display: hidden ? 'none' : 'contents' }}>
        {held.current}
      </div>
    </PageHiddenScope>
  );
};

/**
 * Where each tab was scrolled to. The tabs that stay alive come back at their place; every other tab starts at its top. Only recorded while the tab itself is showing
 * (`enabled` is false while a profile or another page sits on top of it: that page has its own place).
 */
export function useTabScroll(active: string, keepAlive: readonly string[], enabled: boolean): void {
  const places = useRef(new Map<string, number>());
  const current = useRef(active);
  const recording = useRef(enabled);
  useLayoutEffect(() => { recording.current = enabled; });
  useEffect(() => {
    const onScroll = () => { if (recording.current) places.current.set(current.current, window.scrollY); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const first = useRef(true);
  useLayoutEffect(() => {
    current.current = active;
    if (first.current) { first.current = false; return; }
    const top = keepAlive.includes(active) ? places.current.get(active) ?? 0 : 0;
    const apply = () => window.scrollTo({ left: 0, top, behavior: 'instant' as ScrollBehavior });
    apply();
    if (top > 0 && typeof requestAnimationFrame === 'function') requestAnimationFrame(apply);   // once more after the page is laid out again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
