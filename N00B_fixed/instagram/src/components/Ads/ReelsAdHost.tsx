import React, { useEffect, useRef, useState } from 'react';
import { ChevronUp, X } from 'lucide-react';
import { AdSlot } from './AdSlot';
import { AD_UNIT_REELS, AD_UNIT_TEST_NATIVE, adsAvailable } from '../../ads/noobAds';
import { useFeatureOn } from '../../utils/featureFlags';

// Google ads between reels (Android app only). Every sixth swipe an ad page comes up over the reels: a curved box with the ad, a Skip button, and "swipe up to continue" (a swipe up, or Skip, goes back to
// the reels). It never touches the list of reels or the reel being watched: it only covers the pager for a moment, and the reel under it waits (paused) until the page is closed.
//   * three swipes before it is due the ad is asked for in the background (the box is there but not seen), so the page only comes up when an ad is READY; if there is none, nothing comes up at all;
//   * the same box stays in place from the asking to the showing (so the ad is not thrown away on the way), and is released when the page closes;
//   * the administrator always gets Google's test ad (never a real one).
interface Props { swipes: number; isAdmin: boolean; onOpenChange: (open: boolean) => void }

const EVERY = 6;
const ASK_AT = 3;

export const ReelsAdHost: React.FC<Props> = ({ swipes, isAdmin, onOpenChange }) => {
  const on = useFeatureOn('ads') && adsAvailable();
  const [armed, setArmed] = useState(false);          // the ad is being asked for
  const [ready, setReady] = useState(false);          // the ad is there, waiting for its moment
  const [open, setOpen] = useState(false);            // the ad page is up
  const [cycle, setCycle] = useState(0);              // a new box (and a new ad) for every ad page
  const startY = useRef<number | null>(null);
  const openRef = useRef(false);
  openRef.current = open;

  useEffect(() => {
    if (!on) return;
    const phase = swipes % EVERY;
    if (!armed && !open && phase >= ASK_AT && phase < EVERY) { setReady(false); setArmed(true); }
    if (armed && !open && ready && swipes > 0 && phase === 0) { setOpen(true); onOpenChange(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swipes, on, armed, ready, open]);

  const close = (): void => {
    if (!openRef.current) return;
    setOpen(false); setArmed(false); setReady(false); setCycle((c) => c + 1);
    onOpenChange(false);
  };
  useEffect(() => { if (!on && openRef.current) { setOpen(false); onOpenChange(false); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [on]);
  useEffect(() => () => { if (openRef.current) onOpenChange(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  if (!on || !armed) return null;
  return (
    <div
      className={open ? 'rad-page' : 'rad-hidden'}
      data-testid={open ? 'reels-ad-page' : undefined}
      onTouchStart={(e) => { startY.current = e.touches[0]?.clientY ?? null; }}
      onTouchEnd={(e) => {
        const y0 = startY.current; startY.current = null;
        const y1 = e.changedTouches[0]?.clientY;
        if (open && y0 !== null && typeof y1 === 'number' && y0 - y1 > 70) close();   // a swipe up goes on to the reels
      }}
    >
      {open && (
        <>
          <button type="button" className="rad-skip" onClick={close} aria-label="Skip the ad" data-testid="reels-ad-skip"><X size={18} /> Skip</button>
          <div className="rad-hint"><ChevronUp size={18} /> Swipe up to continue</div>
        </>
      )}
      <div className="rad-box">
        <AdSlot key={cycle} slot="reels-1" unit={isAdmin ? AD_UNIT_TEST_NATIVE : AD_UNIT_REELS} height={380} onState={(s) => { if (s === 'loaded') setReady(true); else if (openRef.current) close(); else { setArmed(false); setReady(false); setCycle((c) => c + 1); } }} />
      </div>
    </div>
  );
};
