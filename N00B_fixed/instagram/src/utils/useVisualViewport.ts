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
  const vTop = vv ? Math.round(vv.offsetTop) : 0;
  const vVisible = vv ? Math.round(vv.height) : page;
  const keyboard = Math.max(0, page - (vTop + vVisible));
  const kb = keyboard < 80 ? 0 : keyboard;   // a few pixels of difference is the address bar, not a keyboard
  // with no keyboard the sheet is measured against the page itself: the browser's address bar sliding in and out changes the visible area by a few pixels, and the sheet must not follow it
  const top = kb ? vTop : 0;
  const visible = kb ? vVisible : page;
  const height = Math.max(160, Math.min(Math.round(page * fraction), visible - 24));
  return {
    phone: true,
    keyboard: kb,
    style: { position: 'fixed', left: 0, right: 0, bottom: 'auto', top: top + visible - height, height: height + kb, paddingBottom: kb || 'env(safe-area-inset-bottom)',
      // the sheet's own colour carries on below it (a solid shadow): whatever is under the keyboard's see-through glass or its bar (the "^ v done" row) is the sheet, never the post or reel behind
      boxShadow: '0 900px 0 900px #09090b' },
  };
};

export function useSheetBox(fraction: number): SheetBox {
  const [box, setBox] = useState<SheetBox>(() => readBox(fraction));
  useEffect(() => {
    const on = () => setBox((prev) => { const next = readBox(fraction); return prev.phone === next.phone && prev.keyboard === next.keyboard && JSON.stringify(prev.style) === JSON.stringify(next.style) ? prev : next; });   // the same size again is not a change (no redraw)
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

// ---- the box of the COMMENTS sheet, on every screen
// One sheet for the comments of posts, reels and videos, on a phone, a tablet, a laptop and a computer: it rises from the bottom edge and covers between 30 % and 50 % of the page,
// depending on how many comments there are (a few comments: a low sheet, the post stays in view; many: up to half the page, then the list scrolls). It follows the keyboard on a phone,
// and its height eases from one size to the next instead of jumping. On a wide screen it is the same bottom sheet, centred (no keyboard to dodge, no dark side bands).
export const COMMENTS_MIN = 0.5;
export const COMMENTS_MAX = 0.5;
const COMMENTS_FIXED_PX = 168;   // the grip + title row and the writing area (icons, text box, send)
const COMMENTS_ROW_PX = 66;      // one comment

/** How much of the page the sheet covers for `rows` top-level comments on a page that is `pageHeight` px tall (always between 30 % and 50 %). */
export function commentsFraction(rows: number, pageHeight: number): number {
  const need = COMMENTS_FIXED_PX + (Number.isFinite(rows) ? Math.max(0, rows) : 0) * COMMENTS_ROW_PX;
  return Math.min(COMMENTS_MAX, Math.max(COMMENTS_MIN, need / Math.max(1, pageHeight)));
}

const EASE = 'cubic-bezier(.22, 1, .36, 1)';
const readCommentsBox = (rows: number): SheetBox => {
  if (typeof window === 'undefined') return { phone: false, style: undefined, keyboard: 0 };
  const wide = window.innerWidth >= 640;
  const page = window.innerHeight;
  const vv = window.visualViewport;
  const vTop = vv ? Math.round(vv.offsetTop) : 0;
  const vVisible = vv ? Math.round(vv.height) : page;
  const keyboard = Math.max(0, page - (vTop + vVisible));
  const kb = wide || keyboard < 80 ? 0 : keyboard;
  const top = kb ? vTop : 0;
  const visible = kb ? vVisible : page;
  const height = Math.max(300, Math.min(Math.round(page * commentsFraction(rows, page)), visible - 24));
  return {
    phone: true,
    keyboard: kb,
    style: {
      position: 'fixed', left: 0, right: 0, bottom: 'auto', top: top + visible - height, height: height + kb, paddingBottom: kb || 'env(safe-area-inset-bottom)',
      transition: `top .32s ${EASE}, height .32s ${EASE}`,
      // under the keyboard's see-through glass (a phone only) the sheet's own colour carries on
      boxShadow: wide ? '0 -18px 50px rgba(0, 0, 0, .45), 0 900px 0 900px var(--cmt-bg, #16161b)' : '0 900px 0 900px var(--cmt-bg, #16161b)',
    },
  };
};

export function useCommentsBox(rows: number): SheetBox {
  const [box, setBox] = useState<SheetBox>(() => readCommentsBox(rows));
  useEffect(() => {
    const on = () => setBox((prev) => { const next = readCommentsBox(rows); return prev.keyboard === next.keyboard && JSON.stringify(prev.style) === JSON.stringify(next.style) ? prev : next; });
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
  }, [rows]);
  return box;
}
