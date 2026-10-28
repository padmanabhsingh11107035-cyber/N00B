import React, { useEffect, useRef } from 'react';
import { OPENING_SECONDS, drawOpening } from '../../booth/opening';

/** The 4-second opening art of the Buddy Booth (flat 2D, two colours). A tap, a click or a key skips it. It tells `onDone` once, when it is over or skipped. */
export const BoothOpening: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current, c = cv?.getContext('2d');
    if (!cv || !c) { onDone(); return; }
    let raf = 0, over = false;
    const finish = (): void => { if (!over) { over = true; onDone(); } };
    const size = (): void => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.max(2, Math.round(cv.clientWidth * dpr)); cv.height = Math.max(2, Math.round(cv.clientHeight * dpr));
    };
    const t0 = performance.now();
    const tick = (): void => {
      if (over) return;
      const t = (performance.now() - t0) / 1000;
      if (t >= OPENING_SECONDS) { finish(); return; }
      drawOpening(c, cv.width, cv.height, t);
      raf = requestAnimationFrame(tick);
    };
    size();
    window.addEventListener('resize', size);
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finish(); } };
    window.addEventListener('keydown', onKey);
    raf = requestAnimationFrame(tick);
    const timer = window.setTimeout(finish, OPENING_SECONDS * 1000 + 300);   // however the screen is drawn, the opening is over after 4 seconds (a page that is hidden draws nothing)
    return () => { over = true; window.clearTimeout(timer); cancelAnimationFrame(raf); window.removeEventListener('resize', size); window.removeEventListener('keydown', onKey); };
  }, [onDone]);
  return (
    <div className="bb-open" onPointerDown={onDone} data-testid="booth-opening" aria-label="Buddy Booth is opening" role="img">
      <canvas ref={ref} />
      <span className="bb-skip">Tap to skip</span>
    </div>
  );
};
