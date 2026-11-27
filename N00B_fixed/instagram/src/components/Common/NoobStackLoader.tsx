import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import './noobLoader.css';
import { getLoadingQuote } from '../../data/loadingQuotes';
import { Doodle, LOADER_DOODLES } from './LoaderDoodles';
import { getLoadProgress, nextPercent, subscribeLoadProgress } from '../../utils/loadProgress';

// The loading page: a full-screen layer with a card in the middle. Six big, colourful doodles (Common/LoaderDoodles.tsx, a different six each time) bob on the spot, then a line to read
// (a quote and its author), and a thin ring with a percentage at the bottom. When `tracked` (the start-up of the app) the percentage is the real progress of the five start-up
// requests (src/utils/loadProgress.ts); everywhere else (a page being fetched) the ring simply turns, with no number, because nothing is known to count.
// Nothing is seen for the first 400 ms (a quick load shows no page at all); at the end it jumps to 100 % and fades out in 250 ms. Look and motion: noobLoader.css.

interface NoobStackLoaderProps {
  /** kept for the call sites that pass it */
  title?: string;
  /** a short line under the ring, e.g. "Signing you in…" (the plain "Loading…" is not shown) */
  subtitle?: string;
  mode?: 'quick';
  /** show the real start-up progress as a percentage (only the start-up of the app does) */
  tracked?: boolean;
  /** stacking order of the layer */
  z?: number;
}

/** where the six doodles sit and how they lean and bob (the middle column sits lower, so they look scattered, not in a grid) */
const SPOTS: { r: number; d: number }[] = [{ r: -8, d: 0 }, { r: 6, d: 0.35 }, { r: -5, d: 0.7 }, { r: 7, d: 0.2 }, { r: -7, d: 0.55 }, { r: 5, d: 0.9 }];
const pickDoodles = (): string[] => { const ids = LOADER_DOODLES.map((d) => d.id); for (let i = ids.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [ids[i], ids[k]] = [ids[k], ids[i]]; } return ids.slice(0, 6); };

const R = 19;
const CIRC = 2 * Math.PI * R;
const FADE_MS = 250;
const SHOW_AFTER_MS = 400;
const SLOW_AFTER_MS = 8000;

/** A small thin ring for a spot inside a page (a list, a window) where the full loading page would be too much. */
export const NoobSpinner: React.FC<{ size?: number; label?: string; showLabel?: boolean }> = ({ size = 28, label = 'Loading…', showLabel = false }) => (
  <div role="status" aria-label={label} className="nl-spinbox">
    <span className="nl-spinner" style={{ width: size, height: size }} aria-hidden="true" />
    {showLabel && <span>{label}</span>}
  </div>
);

export const NoobStackLoader: React.FC<NoobStackLoaderProps> = ({ title = 'NOOB', subtitle, tracked = false, z = 50 }) => {
  const quote = getLoadingQuote();
  const [doodles] = useState(pickDoodles);
  const progress = useSyncExternalStore(subscribeLoadProgress, getLoadProgress, getLoadProgress);
  const [pct, setPct] = useState(() => (tracked ? nextPercent(0, progress, 0) : 0));
  const [slow, setSlow] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const pctRef = useRef(pct);
  pctRef.current = pct;

  // the number: eases towards the real progress, creeps while it waits, never goes back
  useEffect(() => {
    if (!tracked) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(500, now - last);
      last = now;
      setPct((p) => Math.max(p, nextPercent(p, progressRef.current, dt)));
    }, 120);
    return () => window.clearInterval(id);
  }, [tracked]);

  // a slow connection
  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => window.clearTimeout(t);
  }, []);

  // when the app is ready this page is removed at once: leave a copy at 100 % that fades out in 250 ms (only if the page was visible at all)
  useEffect(() => {
    const node = rootRef.current;
    const born = Date.now();
    return () => {
      try {
        if (!node || Date.now() - born < SHOW_AFTER_MS + 50) return;
        const ghost = node.cloneNode(true) as HTMLElement;
        ghost.removeAttribute('role');
        ghost.setAttribute('aria-hidden', 'true');
        ghost.classList.add('nl-fadeout');
        if (tracked) {
          const num = ghost.querySelector('.nl-pct');
          if (num) num.textContent = '100%';
          const arc = ghost.querySelector('.nl-arc');
          if (arc) (arc as SVGElement).style.strokeDashoffset = '0';
        }
        document.body.appendChild(ghost);
        window.setTimeout(() => { try { ghost.remove(); } catch { /* already gone */ } }, FADE_MS + 60);
      } catch { /* the fade is only decoration */ }
    };
  }, [tracked]);

  const shown = Math.round(Math.min(100, pct));
  const size = quote.text.length <= 48 ? 'l' : quote.text.length <= 70 ? 'm' : 's';
  const note = slow ? 'Slow connection… still loading' : subtitle && subtitle !== 'Loading…' ? subtitle : '';
  const arcLen = tracked ? CIRC * (1 - Math.min(100, pct) / 100) : CIRC * 0.72;

  return (
    <div ref={rootRef} className="nl-layer edge-own" style={{ zIndex: z }} role="status" aria-live="polite" aria-label={subtitle ? `${title}: ${subtitle}` : `Loading ${title}`}>
      <div className="nl-card">
        <div className="nl-stage" aria-hidden="true">
          <div className="nl-doodles">
            {doodles.map((id, i) => (
              <Doodle key={id} id={id} className="nl-doodle" style={{ ['--r' as string]: `${SPOTS[i].r}deg`, ['--d' as string]: `${SPOTS[i].d}s` } as React.CSSProperties} />
            ))}
          </div>
        </div>
        <div className="nl-text">
          <p className="nl-quote" data-size={size}><span>{'“'}{quote.text}{'”'}</span></p>
          <div className="nl-rule" aria-hidden="true" />
          <p className="nl-author">{quote.author}</p>
        </div>
        <div className="nl-foot">
          <div className="nl-ringbox" role={tracked ? 'progressbar' : undefined} aria-valuemin={tracked ? 0 : undefined} aria-valuemax={tracked ? 100 : undefined} aria-valuenow={tracked ? shown : undefined}>
            <svg viewBox="0 0 44 44" aria-hidden="true">
              <defs>
                <linearGradient id="nl-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#FF4D9A" />
                  <stop offset="1" stopColor="#FF8A3D" />
                </linearGradient>
              </defs>
              <circle className="nl-track" cx="22" cy="22" r={R} fill="none" strokeWidth="3" />
              <g className={tracked ? undefined : 'nl-spin'}>
                <circle className="nl-arc" cx="22" cy="22" r={R} fill="none" stroke="url(#nl-grad)" strokeWidth="3" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={arcLen} />
              </g>
            </svg>
            {tracked && <span className="nl-pct" aria-hidden="true">{shown}%</span>}
          </div>
          <p className="nl-note">{note}</p>
        </div>
      </div>
    </div>
  );
};
