import { useCallback, useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

// Drag a bottom sheet down to close it (the grey bar at the top of a sheet, and the title row under it, are the handle).
// The sheet follows the finger, the dark layer behind it fades with it; let go past a third of the sheet, or with a quick flick, and it slides away and closes,
// otherwise it springs back. A finger that only taps (no movement) still taps the buttons in the title row.

/** Past this much of the sheet's height (at most DISMISS_PX) the sheet closes when let go. */
export const DISMISS_PX = 110;
/** A flick this fast (pixels per millisecond, downwards) closes the sheet even after a short pull. */
export const DISMISS_SPEED = 0.55;
/** Movement before a touch counts as a drag (so a tap on a button in the title row is still a tap). */
export const DRAG_START_PX = 6;

/** Should a sheet that was pulled down `dy` px (at `speed` px/ms when let go) and is `height` px tall close? */
export function shouldDismiss(dy: number, speed: number, height: number): boolean {
  if (!(dy > 0)) return false;
  if (dy >= Math.min(DISMISS_PX, Math.max(40, height * 0.33))) return true;
  return speed >= DISMISS_SPEED && dy >= 40;
}

/** Pulling up past the top is held back (a quarter of the distance), so the sheet is felt to be fixed there. */
export const pullOffset = (dy: number): number => (dy < 0 ? dy / 4 : dy);

export interface SheetDrag {
  /** Put on the sheet itself (the box that moves). */
  sheetRef: RefObject<HTMLDivElement | null>;
  /** Put on the dark layer behind the sheet (it fades while the sheet is pulled). Optional. */
  backdropRef: RefObject<HTMLDivElement | null>;
  /** Spread on the handle (the grey bar and the title row). */
  gripProps: {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
    style: CSSProperties;
  };
  /** Slide the sheet away and close it (same as letting go after a pull). */
  closeAnimated: () => void;
}

export function useSheetDrag(onClose: () => void): SheetDrag {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const timer = useRef<number | null>(null);
  const s = useRef({ down: false, dragging: false, id: -1, startY: 0, dy: 0, lastY: 0, lastT: 0, speed: 0 });

  useEffect(() => () => { if (timer.current != null) window.clearTimeout(timer.current); }, []);

  const place = useCallback((dy: number, animate: boolean) => {
    const el = sheetRef.current;
    if (!el) return;
    el.style.transition = animate ? 'transform 220ms cubic-bezier(.2,.8,.2,1)' : 'none';
    el.style.transform = dy ? `translateY(${dy}px)` : '';
    const bd = backdropRef.current;
    if (bd) {
      bd.style.transition = animate ? 'opacity 220ms ease-out' : 'none';
      bd.style.opacity = dy > 0 ? String(Math.max(0, 1 - dy / Math.max(1, el.offsetHeight))) : '';
    }
  }, []);

  const closeAnimated = useCallback(() => {
    const el = sheetRef.current;
    if (!el) { closeRef.current(); return; }
    place(el.offsetHeight + 40, true);
    if (backdropRef.current) backdropRef.current.style.opacity = '0';
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => closeRef.current(), 200);
  }, [place]);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const st = s.current;
    st.down = true; st.dragging = false; st.id = e.pointerId; st.startY = e.clientY; st.dy = 0; st.lastY = e.clientY; st.lastT = e.timeStamp; st.speed = 0;
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const st = s.current;
    if (!st.down || e.pointerId !== st.id) return;
    const raw = e.clientY - st.startY;
    if (!st.dragging) {
      if (Math.abs(raw) < DRAG_START_PX) return;
      st.dragging = true;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* the drag still works without capture */ }
    }
    const dt = e.timeStamp - st.lastT;
    if (dt > 0) st.speed = 0.6 * st.speed + 0.4 * ((e.clientY - st.lastY) / dt);   // smoothed, so one jittery sample is not a flick
    st.lastY = e.clientY; st.lastT = e.timeStamp;
    st.dy = raw;
    place(pullOffset(raw), false);
  }, [place]);

  const finish = useCallback((e: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
    const st = s.current;
    if (!st.down || e.pointerId !== st.id) return;
    st.down = false;
    if (!st.dragging) return;
    st.dragging = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    const el = sheetRef.current;
    const height = el ? el.offsetHeight : 0;
    if (!cancelled && shouldDismiss(st.dy, st.speed, height)) closeAnimated();
    else place(0, true);
  }, [closeAnimated, place]);

  return {
    sheetRef,
    backdropRef,
    closeAnimated,
    gripProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (e) => finish(e, false),
      onPointerCancel: (e) => finish(e, true),
      style: { touchAction: 'none' },
    },
  };
}
