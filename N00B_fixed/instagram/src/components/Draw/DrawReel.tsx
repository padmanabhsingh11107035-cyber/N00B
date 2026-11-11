import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DrawPrize, SPIN_MS, TICK_BUZZ_MS, buildReel, cardAtMarker, reelOffset, tickGapOk } from '../../utils/noobDraw';
import { CARD_GAP, CARD_W, PrizeCard } from './PrizeVisual';
import { buzz, startSpinSound, stopSpinSound, thumpSound, tickSound } from './drawFx';

interface DrawReelProps {
  prizes: DrawPrize[];
  accent?: string;
  /** a new number starts a spin that lands on `winner` */
  spinKey: number;
  winner: DrawPrize | null;
  onLanded: () => void;
}

const WINNER_INDEX = 46;
const STRIP_LENGTH = 56;
const IDLE_INDEX = 4;

// The reel: a strip of prize cards that rushes past a marker and slows down until the won prize sits under it (the same idea as PackDraw's
// pack opening). The server has already decided the prize; this only shows it. The strip is moved by the browser's own CSS transition.
export const DrawReel: React.FC<DrawReelProps> = React.memo(({ prizes, spinKey, winner, onLanded }) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const job = useRef<{ viewport: number } | null>(null);
  const landedRef = useRef(onLanded);
  landedRef.current = onLanded;
  const doneTimer = useRef(0);
  const frame = useRef(0);
  const prizeKey = prizes.map((p) => p.id).join(',');       // the same prizes (even as a new list) keep the same idle strip
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const idle = useMemo(() => buildReel(prizes, null, { length: 40 }), [prizeKey]);
  const [strip, setStrip] = useState<DrawPrize[]>(idle);

  // a different pack: show its own idle strip
  useEffect(() => { setStrip(idle); }, [idle]);

  // a new spin: build the strip with the won prize in place, then run it
  useEffect(() => {
    if (!winner || spinKey === 0) return;
    job.current = { viewport: viewportRef.current?.clientWidth || 340 };
    setStrip(buildReel(prizes, winner.id, { length: STRIP_LENGTH, winnerIndex: WINNER_INDEX }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinKey]);

  useLayoutEffect(() => {
    const el = stripRef.current;
    const vp = viewportRef.current;
    if (!el || !vp) return;
    const running = job.current;
    job.current = null;
    if (!running) {
      el.style.transition = 'none';
      el.style.transform = `translate3d(${reelOffset(CARD_W, CARD_GAP, IDLE_INDEX, vp.clientWidth)}px,0,0)`;
      return;
    }
    const jitter = Math.random() * 0.7 - 0.35;
    el.style.transition = 'none';
    el.style.transform = `translate3d(${reelOffset(CARD_W, CARD_GAP, 3, running.viewport)}px,0,0)`;
    void el.offsetWidth;                                  // lock in the start before the move is set
    el.style.transition = `transform ${SPIN_MS}ms cubic-bezier(0.09, 0.77, 0.14, 1)`;
    el.style.transform = `translate3d(${reelOffset(CARD_W, CARD_GAP, WINNER_INDEX, running.viewport, jitter)}px,0,0)`;

    // the rushing sound, and a click and a short buzz for every card that passes the marker
    startSpinSound(SPIN_MS);
    const t0 = performance.now();
    let last = -1;
    let lastTick = 0;
    const watch = () => {
      const now = performance.now();
      const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      const at = cardAtMarker(CARD_W, CARD_GAP, m.m41, running.viewport);
      if (at !== last) {
        last = at;
        if (tickGapOk(now, lastTick)) { lastTick = now; tickSound(Math.min(1, (now - t0) / SPIN_MS)); buzz(TICK_BUZZ_MS); }
      }
      frame.current = requestAnimationFrame(watch);
    };
    frame.current = requestAnimationFrame(watch);
    window.clearTimeout(doneTimer.current);
    doneTimer.current = window.setTimeout(() => { cancelAnimationFrame(frame.current); stopSpinSound(); thumpSound(); buzz(40); landedRef.current(); }, SPIN_MS + 250);
  }, [strip]);

  // leaving the page mid-spin: stop the watcher (the prize is already paid by the server)
  useEffect(() => () => { cancelAnimationFrame(frame.current); window.clearTimeout(doneTimer.current); stopSpinSound(); }, []);

  return (
    <div ref={viewportRef} className="dr-reel">
      <div ref={stripRef} className="dr-reel-strip will-change-transform" style={{ gap: CARD_GAP, width: 'max-content' }}>
        {strip.map((p, i) => <PrizeCard key={`${i}-${p.id}`} prize={p} />)}
      </div>
      {/* the one marker line */}
      <div className="dr-reel-line" />
      {/* the soft fade at both edges */}
      <div className="dr-reel-fade dr-reel-fade-l" />
      <div className="dr-reel-fade dr-reel-fade-r" />
    </div>
  );
});
