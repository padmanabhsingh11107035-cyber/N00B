import { useEffect, useState, type CSSProperties } from 'react';

// The part of the screen a person can actually see: on a phone it shrinks when the keyboard opens, and the page can be pushed up. A full-screen layer sized to
// the page (inset-0) is then partly hidden behind the keyboard and shows what is under it in the gap. This gives the visible area's top and height, so a screen can fill exactly that.
export interface VisibleArea { top: number; height: number }

const read = (): VisibleArea | null => {
  if (typeof window === 'undefined' || !window.visualViewport) return null;
  return { top: Math.round(window.visualViewport.offsetTop), height: Math.round(window.visualViewport.height) };
};

export function useVisibleArea(): VisibleArea | null {
  const [area, setArea] = useState<VisibleArea | null>(read);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const on = () => setArea(read());
    vv.addEventListener('resize', on);
    vv.addEventListener('scroll', on);
    on();
    return () => { vv.removeEventListener('resize', on); vv.removeEventListener('scroll', on); };
  }, []);
  return area;
}

/** Style for a layer that fills the visible area (falls back to the whole screen when the browser cannot say). */
export const visibleAreaStyle = (area: VisibleArea | null): CSSProperties | undefined => (area ? { top: area.top, height: area.height, bottom: 'auto' } : undefined);

// ---- the box of a bottom sheet on a phone
// A sheet that covers `fraction` of the page (the comments sheets: 45 %, so the post or reel above stays in view) and keeps sitting right above the keyboard when it opens.
// Everything from the top of the keyboard down to the bottom of the page is filled by the sheet itself (black), because the keyboard of a phone is see-through glass: without
// that fill the bottom bar and the posts of the page behind show through it. On a bigger screen `style` is undefined and the sheet is the usual window in the middle.
export interface SheetBox { phone: boolean; style: CSSProperties | undefined; keyboard: number }

const PHONE_QUERY = '(max-width: 639px)';
const readBox = (fraction: number): SheetBox => {
  if (typeof window === 'undefined') return { phone: false, style: undefined, keyboard: 0 };
  const phone = typeof window.matchMedia === 'function' ? window.matchMedia(PHONE_QUERY).matches : window.innerWidth < 640;
  if (!phone) return { phone: false, style: undefined, keyboard: 0 };
  const page = window.innerHeight;
  const vv = window.visualViewport;
  const top = vv ? Math.round(vv.offsetTop) : 0;
  const visible = vv ? Math.round(vv.height) : page;
  const keyboard = Math.max(0, page - (top + visible));
  const kb = keyboard < 80 ? 0 : keyboard;   // a few pixels of difference is the address bar, not a keyboard
  const height = Math.max(160, Math.min(Math.round(page * fraction), visible - 24));
  return {
    phone: true,
    keyboard: kb,
    style: { position: 'fixed', left: 0, right: 0, bottom: 'auto', top: top + visible - height, height: height + kb, paddingBottom: kb || 'env(safe-area-inset-bottom)' },
  };
};

export function useSheetBox(fraction: number): SheetBox {
  const [box, setBox] = useState<SheetBox>(() => readBox(fraction));
  useEffect(() => {
    const on = () => setBox(readBox(fraction));
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    vv?.addEventListener('resize', on);
    vv?.addEventListener('scroll', on);
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    on();
    return () => {
      vv?.removeEventListener('resize', on);
      vv?.removeEventListener('scroll', on);
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, [fraction]);
  return box;
}

/** True while a keyboard is open on a phone (the page's visible part is much shorter than the page). */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const on = () => setOpen(window.innerHeight - (vv.offsetTop + vv.height) >= 120);
    vv.addEventListener('resize', on);
    vv.addEventListener('scroll', on);
    on();
    return () => { vv.removeEventListener('resize', on); vv.removeEventListener('scroll', on); };
  }, []);
  return open;
}

/** How much of the bottom of the page the keyboard covers (0 when none, or on a bigger screen), and how tall the visible part of the page is. For a sheet that is only as tall as its content. */
export function useKeyboardMetrics(): { keyboard: number; visible: number; page: number; phone: boolean } {
  const [m, setM] = useState(() => { const b = readBox(0.5); return { keyboard: b.keyboard, visible: typeof window !== 'undefined' ? Math.round(window.visualViewport?.height ?? window.innerHeight) : 0, page: typeof window !== 'undefined' ? window.innerHeight : 0, phone: b.phone }; });
  useEffect(() => {
    const on = () => { const b = readBox(0.5); setM({ keyboard: b.keyboard, visible: Math.round(window.visualViewport?.height ?? window.innerHeight), page: window.innerHeight, phone: b.phone }); };
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    vv?.addEventListener('resize', on);
    vv?.addEventListener('scroll', on);
    window.addEventListener('resize', on);
    on();
    return () => { vv?.removeEventListener('resize', on); vv?.removeEventListener('scroll', on); window.removeEventListener('resize', on); };
  }, []);
  return m;
}
