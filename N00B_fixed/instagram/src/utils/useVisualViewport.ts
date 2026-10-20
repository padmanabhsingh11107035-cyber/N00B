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
