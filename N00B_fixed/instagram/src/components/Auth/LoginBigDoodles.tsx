import React from 'react';

// Big hand-drawn pictures for the wide sign-in page: a speech bubble saying hello, a rocket with its smoke trail, a smiling star, a cat, a looping arrow,
// headphones with music, a camera with a photo coming out, a crown with confetti, and a paper plane doing a loop. They sit in the open space around the logo
// and at the sides of the card (only from 1280px wide, where there is room), behind everything, ignoring taps, drifting gently (see .login-doodle in index.css).
// Each picture is one small SVG drawn with the same loose, rounded line as the rest of the page.

interface Big {
  x: string;       // left, as a percentage of the page
  y: string;       // top, as a percentage of the page
  w: number;       // width in px (the height follows the picture's own shape)
  r: number;       // tilt in degrees
  c: string;       // colour class
  d: number;       // animation delay in seconds
  vb: string;      // the picture's own drawing area
  art: React.ReactNode;
}

const heart = (x: number, y: number, s: number) => <path transform={`translate(${x} ${y}) scale(${s})`} fill="currentColor" stroke="none" d="M12 21s-7-4.35-9.5-8.5C.5 8.5 3 5 6.5 5c2 0 3.5 1.2 4.5 2.8C12 6.2 13.5 5 15.5 5 19 5 21.5 8.5 20 12.5 17.5 16.65 12 21 12 21z" />;
const spark = (x: number, y: number, s: number) => <path transform={`translate(${x} ${y}) scale(${s})`} fill="currentColor" stroke="none" d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" />;

const BIG: Big[] = [
  // a speech bubble saying hello
  { x: '14%', y: '3.5%', w: 200, r: -7, c: 'text-cyan-300/80', d: 0.2, vb: '0 0 200 150', art: <>
    <path d="M22 22q0-12 14-12h128q16 0 16 14v60q0 14-16 14h-62l-34 30 4-30H38q-16 0-16-14z" />
    <text x="100" y="66" textAnchor="middle" className="font-script" fontSize="42" fill="currentColor" stroke="none">hello!</text>
    <path d="M52 78q48 8 96 0" strokeDasharray="2 7" />
    {heart(158, 14, 1.6)}
    {spark(6, 96, 1.1)}{spark(176, 112, 0.9)}
    <path d="M12 132l9 9M21 132l-9 9" />
  </> },
  // a rocket, its flame and a long swirling trail, a little ringed planet
  { x: '66%', y: '1%', w: 170, r: 14, c: 'text-violet-300/80', d: 0.9, vb: '0 0 180 300', art: <>
    <path d="M90 12c28 24 38 62 30 96l-16 18H76l-16-18C52 74 62 36 90 12z" />
    <circle cx="90" cy="62" r="13" /><circle cx="90" cy="62" r="6" strokeWidth="1.5" />
    <path d="M60 108l-26 30 18 8 22-18M120 108l26 30-18 8-22-18" />
    <path d="M78 130c-2 20 12 30 12 46 0-16 14-26 12-46" />
    <path d="M90 190c-40 14 30 34-12 54s34 30 6 54" strokeDasharray="2 8" />
    <circle cx="150" cy="40" r="15" /><ellipse cx="150" cy="40" rx="26" ry="7" transform="rotate(-20 150 40)" />
    {spark(18, 24, 1.2)}{spark(138, 170, 0.9)}{spark(24, 190, 0.8)}
    <path d="M150 220v14M143 227h14" />
  </> },
  // a star with a smile
  { x: '16%', y: '24%', w: 104, r: -10, c: 'text-amber-300/85', d: 1.4, vb: '0 0 24 26', art: <>
    <path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 14.3 7.2 16.9l.9-5.4L4.2 7.7l5.4-.8z" strokeWidth="1" transform="translate(0 2) scale(1)" />
    <circle cx="10" cy="10.4" r=".55" fill="currentColor" stroke="none" transform="translate(0 2)" /><circle cx="14" cy="10.4" r=".55" fill="currentColor" stroke="none" transform="translate(0 2)" />
    <path d="M10 12.3q2 1.7 4 0" strokeWidth=".9" transform="translate(0 2)" />
    <path d="M8.6 11.6h.01M15.4 11.6h.01" strokeWidth="1.6" transform="translate(0 2)" opacity=".6" />
    <path d="M19.5 3.5v2.2M18.4 4.6h2.2M3 18v2M2 19h2" strokeWidth=".9" />
  </> },
  // a cat
  { x: '74%', y: '23%', w: 130, r: 8, c: 'text-pink-300/80', d: 0.5, vb: '0 0 120 100', art: <>
    <path d="M20 46Q20 15 60 15Q100 15 100 46Q100 86 60 86Q20 86 20 46z" />
    <path d="M24 32L20 6l28 14M96 32l4-26-28 14" />
    <path d="M45 46h.01M75 46h.01" strokeWidth="6" />
    <path d="M55 57h10l-5 6z" fill="currentColor" />
    <path d="M60 63q-5 9-12 3M60 63q5 9 12 3" />
    <path d="M30 58L6 53M30 64L6 68M90 58l24-5M90 64l24 4" />
    {heart(96, 76, 0.9)}
  </> },
  // a looping arrow with words
  { x: '27%', y: '10%', w: 190, r: -4, c: 'text-emerald-300/80', d: 1.1, vb: '0 0 200 110', art: <>
    <text x="8" y="26" className="font-script" fontSize="26" fill="currentColor" stroke="none">come on in!</text>
    <path d="M10 62C36 14 96 14 90 52 86 78 56 64 70 44c14-18 70-12 110 24" />
    <path d="M180 68l-16-1M180 68l-5-15" />
  </> },
  // headphones with music
  { x: '2.5%', y: '49%', w: 140, r: 6, c: 'text-cyan-300/80', d: 0.7, vb: '0 0 160 140', art: <>
    <path d="M30 90V70a50 50 0 0 1 100 0v20" />
    <rect x="18" y="86" width="26" height="42" rx="10" /><rect x="116" y="86" width="26" height="42" rx="10" />
    <path d="M62 30V8l30-6v22M62 30a6 6 0 1 1-6-6M92 24a6 6 0 1 1-6-6" strokeWidth="2" transform="translate(30 4) scale(.8)" />
    <path d="M52 112q14-10 28 0t28 0" strokeDasharray="2 6" />
  </> },
  // a camera with a photo coming out
  { x: '78%', y: '36%', w: 140, r: -9, c: 'text-orange-300/85', d: 1.6, vb: '0 0 150 150', art: <>
    <rect x="12" y="46" width="108" height="76" rx="12" />
    <circle cx="66" cy="84" r="24" /><circle cx="66" cy="84" r="12" /><circle cx="56" cy="74" r="3" fill="currentColor" stroke="none" />
    <path d="M32 46l6-12h32l6 12" /><rect x="92" y="56" width="16" height="8" rx="3" />
    <rect x="96" y="104" width="46" height="40" rx="3" transform="rotate(10 96 104)" />
    {heart(104, 114, 1.1)}
    {spark(124, 20, 1)}
  </> },
  // a crown with confetti
  { x: '76.5%', y: '2%', w: 130, r: 10, c: 'text-amber-300/85', d: 0.3, vb: '0 0 140 120', art: <>
    <path d="M18 90L10 40l32 24 28-44 28 44 32-24-8 50z" />
    <path d="M18 102h104" />
    <circle cx="70" cy="76" r="5" /><circle cx="38" cy="82" r="3.5" /><circle cx="102" cy="82" r="3.5" />
    <path d="M30 14l4 8M52 8l-4 9M96 10l4 9M118 20l-8 6M6 22l9 3M126 52l8 2" strokeWidth="2.4" />
    <path d="M60 112c10 6 20 6 30 0" strokeDasharray="2 6" />
  </> },
  // a paper plane doing a loop
  { x: '0.5%', y: '0%', w: 120, r: -6, c: 'text-pink-300/80', d: 1.8, vb: '0 0 180 110', art: <>
    <path d="M6 96C34 98 58 78 50 52S14 30 34 22s52 6 76 40" strokeDasharray="2 8" />
    <path d="M168 14L106 62M168 14l-26 82-14-34-34-14z" />
    <path d="M128 62l6 22" />
    {spark(10, 16, 0.9)}
  </> }
];

export const LoginBigDoodles: React.FC = () => (
  <div className="absolute inset-0 pointer-events-none select-none z-[1] overflow-hidden hidden xl:block" aria-hidden="true" data-testid="big-doodles">
    {BIG.map((b, i) => {
      const [, , vw, vh] = b.vb.split(' ').map(Number);
      return (
        <svg
          key={i}
          viewBox={b.vb}
          className={`login-doodle absolute ${b.c}`}
          style={{ left: b.x, top: b.y, width: b.w, height: Math.round((b.w * vh) / vw), ['--r' as string]: `${b.r}deg`, animationDelay: `${b.d}s` }}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {b.art}
        </svg>
      );
    })}
  </div>
);
