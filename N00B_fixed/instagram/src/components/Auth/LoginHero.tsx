import React, { useEffect, useRef, useState } from 'react';
import './loginHero.css';

// The top of the sign-in page: the word NOOB with its two O's as eyes. The eyes follow your finger (or the mouse), blink now and then, and look around by themselves when nothing is moving.
// Under it a line that changes by itself. Nothing here touches the sign-in itself; with "reduce motion" on the eyes stay still and the line stays put.
const LINES = ['Share your moments', 'Chat with real friends', 'Play games together', 'Watch reels, make yours', 'Learn, create, grow'];

export const LoginHero: React.FC = () => {
  const eyeA = useRef<HTMLSpanElement>(null);
  const eyeB = useRef<HTMLSpanElement>(null);
  const pupilA = useRef<HTMLSpanElement>(null);
  const pupilB = useRef<HTMLSpanElement>(null);
  const [blink, setBlink] = useState(false);
  const [line, setLine] = useState(0);

  useEffect(() => {
    const calm = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (calm) return;
    let lastMove = Date.now();
    const look = (x: number, y: number) => {
      [[eyeA.current, pupilA.current], [eyeB.current, pupilB.current]].forEach(([eye, pupil]) => {
        if (!eye || !pupil) return;
        const r = eye.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const dx = x - cx, dy = y - cy;
        const d = Math.hypot(dx, dy) || 1;
        const max = r.width * 0.2;
        const k = Math.min(1, d / 160) * max;
        pupil.style.transform = `translate(${(dx / d) * k}px, ${(dy / d) * k}px)`;
      });
    };
    const onMove = (e: PointerEvent) => { lastMove = Date.now(); look(e.clientX, e.clientY); };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onMove, { passive: true });
    // by itself: glance left, right, up, then back to the middle
    const wander = window.setInterval(() => {
      if (Date.now() - lastMove < 2500) return;
      const w = window.innerWidth, h = window.innerHeight;
      const spots: Array<[number, number]> = [[w * 0.1, h * 0.3], [w * 0.9, h * 0.35], [w * 0.5, h * 0.05], [w * 0.5, h * 0.6]];
      const s = spots[Math.floor(Math.random() * spots.length)];
      look(s[0], s[1]);
    }, 1800);
    const blinkTimer = window.setInterval(() => { setBlink(true); window.setTimeout(() => setBlink(false), 170); }, 3600);
    const lineTimer = window.setInterval(() => setLine((n) => (n + 1) % LINES.length), 3200);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onMove);
      window.clearInterval(wander); window.clearInterval(blinkTimer); window.clearInterval(lineTimer);
    };
  }, []);

  return (
    <div className="lh-root" aria-hidden="true">
      <div className="lh-word">
        <span className="lh-letter">N</span>
        <span className="lh-eye" ref={eyeA}><span className={`lh-lid ${blink ? 'on' : ''}`} /><span className="lh-pupil" ref={pupilA}><i /></span></span>
        <span className="lh-eye" ref={eyeB}><span className={`lh-lid ${blink ? 'on' : ''}`} /><span className="lh-pupil" ref={pupilB}><i /></span></span>
        <span className="lh-letter">B</span>
      </div>
      <div className="lh-line"><span key={line}>{LINES[line]}</span></div>
    </div>
  );
};
