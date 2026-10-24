import React, { useEffect, useState } from 'react';

// The loading screen: a "burger" made of social media that builds itself. A chat bar, a row of likes, a comment, a photo and a profile header drop onto each other one
// by one and a NOOB bun lands on top. Drawn in the black-and-white doodle look (it follows the theme: white line art on black, black on white in Light mode).
//
// It is the loading page of the whole app, and it is quick: the burger appears in a fraction of a second and stays until the app is ready (nothing is held back, so when the
// app is ready at once, nothing shows). When the app is opened, the opening animation (public/opening/opening.js) plays first and the app opens straight out of it: there is no
// separate burger show any more. With "reduce motion" on, the finished burger is simply shown. The motion of each layer is in index.css (.nsl-*).

const MESSAGES = ['Setting up your chats…', 'Counting the likes…', 'Writing the comments…', 'Hanging the photos…', 'Meeting your people…', 'Toasting the NOOB bun…'];
export const QUICK_LAYER_MS = 55;       // the whole burger is up in about a third of a second

const heart = (cx: number, cy: number, s: number) =>
  `M${cx} ${cy + s * 0.9}C${cx - s * 1.9} ${cy - s * 0.2} ${cx - s * 0.8} ${cy - s * 1.5} ${cx} ${cy - s * 0.5}C${cx + s * 0.8} ${cy - s * 1.5} ${cx + s * 1.9} ${cy - s * 0.2} ${cx} ${cy + s * 0.9}Z`;
const sparkle = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy - r}Q${cx} ${cy} ${cx + r} ${cy}Q${cx} ${cy} ${cx} ${cy + r}Q${cx} ${cy} ${cx - r} ${cy}Q${cx} ${cy} ${cx} ${cy - r}Z`;

interface NoobStackLoaderProps {
  title?: string;
  subtitle?: string;
  /** the only way to play it now (kept so every place that asks for the quick one still reads the same) */
  mode?: 'quick';
}

export const NoobStackLoader: React.FC<NoobStackLoaderProps> = ({ title = 'NOOB', subtitle }) => {
  const reduce = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [n, setN] = useState(reduce ? 6 : 0);          // how many layers have landed

  // build the burger
  useEffect(() => {
    if (reduce) return;
    let alive = true;
    const timers: number[] = [];
    for (let k = 1; k <= 6; k++) timers.push(window.setTimeout(() => { if (alive) setN(k); }, k * QUICK_LAYER_MS));
    return () => { alive = false; timers.forEach((t) => window.clearTimeout(t)); };
  }, [reduce]);

  const box = 'fill-zinc-900 stroke-current';
  const L = (k: number, children: React.ReactNode) => (n >= k ? <g key={k} className="nsl-in">{children}</g> : null);
  const message = subtitle ?? (n === 0 ? 'Warming up…' : MESSAGES[Math.min(n, 6) - 1]);

  return (
    <div role="status" aria-live="polite" aria-label="Loading NOOB" className="flex flex-col items-center text-zinc-50 select-none nsl-fast">
      <svg viewBox="0 0 220 250" className="w-[210px] h-[238px] overflow-visible" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {/* the shadow it lands on grows as the stack does */}
        <ellipse cx="110" cy="234" rx="84" ry="7" fill="currentColor" stroke="none" className="nsl-shadow" style={{ transform: `scaleX(${0.45 + n * 0.092})`, opacity: n === 0 ? 0.04 : 0.13 }} />

        {/* 1 - the chat bar (bottom bun) */}
        {L(1, <>
          <rect x="35" y="196" width="150" height="26" rx="13" className={box} />
          <rect x="47" y="205" width="72" height="8" rx="4" fill="currentColor" stroke="none" opacity=".55" />
          <path d="M160 209l16-8-4 16-4-6z" />
        </>)}

        {/* 2 - the likes */}
        {L(2, <>
          <rect x="35" y="168" width="150" height="24" rx="12" className={box} />
          <path d={heart(72, 180, 5)} fill="currentColor" />
          <path d={heart(110, 180, 5)} />
          <path d={heart(148, 180, 5)} fill="currentColor" />
        </>)}

        {/* 3 - a comment */}
        {L(3, <>
          <rect x="35" y="134" width="150" height="30" rx="10" className={box} />
          <path d="M52 164l-4 9 11-9" className={box} />
          <circle cx="92" cy="149" r="2.6" fill="currentColor" stroke="none" />
          <circle cx="110" cy="149" r="2.6" fill="currentColor" stroke="none" />
          <circle cx="128" cy="149" r="2.6" fill="currentColor" stroke="none" />
        </>)}

        {/* 4 - the photo (the patty) */}
        {L(4, <>
          <rect x="35" y="74" width="150" height="56" rx="10" className={box} />
          <circle cx="70" cy="92" r="7" />
          <path d="M43 124l30-24 20 16 22-26 42 34" />
        </>)}

        {/* 5 - the profile header */}
        {L(5, <>
          <rect x="35" y="44" width="150" height="26" rx="13" className={box} />
          <circle cx="53" cy="57" r="8" fill="currentColor" stroke="none" opacity=".85" />
          <rect x="68" y="51" width="58" height="6" rx="3" fill="currentColor" stroke="none" opacity=".8" />
          <rect x="68" y="60" width="38" height="5" rx="2.5" fill="currentColor" stroke="none" opacity=".45" />
          <path d={sparkle(166, 57, 5)} />
        </>)}

        {/* 6 - the NOOB bun */}
        {L(6, <>
          <path d="M28 40Q28 6 110 6Q192 6 192 40Z" className={box} />
          <text x="110" y="33" textAnchor="middle" fontSize="19" fontWeight="900" letterSpacing="3" fill="currentColor" stroke="none" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>NOOB</text>
          <circle cx="62" cy="20" r="2" fill="currentColor" stroke="none" />
          <circle cx="158" cy="20" r="2" fill="currentColor" stroke="none" />
          <circle cx="76" cy="12" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="144" cy="12" r="1.6" fill="currentColor" stroke="none" />
        </>)}

        {/* doodles around it */}
        <path d={sparkle(14, 40, 7)} className="nsl-spark" style={{ animationDelay: '0s' }} />
        <path d="M206 96v12M200 102h12" className="nsl-spark" style={{ animationDelay: '.5s' }} />
        <path d={sparkle(208, 178, 6)} className="nsl-spark" style={{ animationDelay: '1s' }} />
        <path d="M6 150q4-7 8 0t8 0" className="nsl-spark" style={{ animationDelay: '1.5s' }} />
      </svg>
      <p className="mt-1 text-[15px] font-black tracking-[0.18em] pl-[0.18em]">{title}</p>
      <p key={message} className="nsl-msg mt-1.5 text-[11px] text-zinc-400 h-4">{message}</p>
    </div>
  );
};
