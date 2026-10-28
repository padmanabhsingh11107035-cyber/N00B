import React, { useEffect, useState } from 'react';

// The opening of NOOB Music: the screen goes deep red, the record sleeve (NOOB Music's own picture) fades in, a vinyl record slides out of it and spins, the name rises under it,
// then the whole thing melts away into the page. It plays once per visit to the app (and never makes anyone wait: a tap skips it). With "reduce motion" it is just the name for a moment.
const SEEN_KEY = 'noob.musicSplashSeen';
const seen = (): boolean => { try { return sessionStorage.getItem(SEEN_KEY) === '1'; } catch { return false; } };
const markSeen = (): void => { try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* shown again next time */ } };

export const MusicSplash: React.FC = () => {
  const [show, setShow] = useState(() => !seen());
  const [leaving, setLeaving] = useState(false);
  const calm = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (!show) return;
    markSeen();
    const leave = window.setTimeout(() => setLeaving(true), calm ? 700 : 3000);
    const end = window.setTimeout(() => setShow(false), calm ? 1000 : 3600);
    return () => { window.clearTimeout(leave); window.clearTimeout(end); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!show) return null;
  const skip = () => { setLeaving(true); window.setTimeout(() => setShow(false), 260); };

  return (
    <div
      data-noob-keep=""
      data-testid="music-splash"
      onClick={skip}
      role="presentation"
      className={`fixed inset-0 z-[120] overflow-hidden cursor-pointer select-none ${leaving ? 'music-splash-out' : ''}`}
      style={{ background: 'radial-gradient(120% 80% at 50% 38%, #b3121d 0%, #6a0a12 46%, #1c0407 100%)' }}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="relative w-[150px] h-[150px] music-splash-sleeve">
          {/* the vinyl slides out from behind the sleeve and keeps turning */}
          <div className="absolute inset-0 music-splash-vinyl">
            <div className="w-full h-full rounded-full music-vinyl music-vinyl-spin" />
          </div>
          <img
            src="/noob-music-logo.jpg"
            alt="NOOB Music logo"
            width={400}
            height={400}
            draggable={false}
            className="relative w-full h-full rounded-[10px] object-cover bg-black shadow-[0_18px_50px_rgba(0,0,0,.55)]"
          />
        </div>
        <div className="mt-12 text-center music-splash-word">
          <div className="text-[38px] leading-none font-extrabold tracking-tight text-white">NOOB Music</div>
          <div className="mt-2 text-[13px] text-white/70">Feel every <span className="italic font-serif text-white/90">beat</span></div>
        </div>
      </div>
    </div>
  );
};
