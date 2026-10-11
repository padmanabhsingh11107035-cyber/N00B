import React from 'react';

// A backdrop of small hand-drawn style doodles for the sign-in page: stars, hearts, squiggles, music notes, a camera, a game pad...
// Purely decorative (hidden from screen readers, ignores taps), drawn behind the sign-in card, and only drifting gently when the
// person has not asked their device to reduce motion (see .login-doodle in index.css). `phone: false` ones are left out on small
// screens so a narrow page does not turn into clutter.

type Kind =
  | 'sparkle' | 'heart' | 'squiggle' | 'spiral' | 'bolt' | 'note' | 'camera' | 'chat' | 'smile' | 'crown' | 'flower' | 'plus'
  | 'plane' | 'pad' | 'bell' | 'arrow' | 'star' | 'cloud' | 'eye' | 'hash' | 'play' | 'dots' | 'ring' | 'moon';

const ICONS: Record<Kind, { fill?: boolean; node: React.ReactNode }> = {
  sparkle: { fill: true, node: <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" /> },
  heart: { fill: true, node: <path d="M12 21s-7-4.35-9.5-8.5C.5 8.5 3 5 6.5 5c2 0 3.5 1.2 4.5 2.8C12 6.2 13.5 5 15.5 5 19 5 21.5 8.5 20 12.5 17.5 16.65 12 21 12 21z" /> },
  squiggle: { node: <path d="M2 12q3-7 6 0t6 0 6 0" /> },
  spiral: { node: <path d="M12 12c0-1.5 2-1.5 2 0s-3 2.5-4 0 1-5 5-4 5 6 2 8-9 1-10-3 1-8 7-8" /> },
  bolt: { fill: true, node: <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /> },
  note: { node: <><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></> },
  camera: { node: <><rect x="3" y="7" width="18" height="13" rx="3" /><circle cx="12" cy="13.5" r="3.5" /><path d="M8 7l1.5-3h5L16 7" /></> },
  chat: { node: <path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 8.5 8.5 0 0 1-4-.9L3 20l1.9-5A8.4 8.4 0 1 1 21 11.5z" /> },
  smile: { node: <><circle cx="12" cy="12" r="9.5" /><path d="M8.5 9.5h.01M15.5 9.5h.01" /><path d="M8 14c1 2 2.5 3 4 3s3-1 4-3" /></> },
  crown: { fill: true, node: <path d="M3 8l4 3 5-6 5 6 4-3-2 10H5L3 8z" /> },
  flower: { node: <><circle cx="12" cy="6" r="3" /><circle cx="18" cy="10.5" r="3" /><circle cx="15.8" cy="17.5" r="3" /><circle cx="8.2" cy="17.5" r="3" /><circle cx="6" cy="10.5" r="3" /><circle cx="12" cy="12.5" r="1.6" /></> },
  plus: { node: <path d="M12 4v16M4 12h16" /> },
  plane: { node: <><path d="M22 2 11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></> },
  pad: { node: <><path d="M17.3 5H6.7a4 4 0 0 0-3.9 3.2L2 15a3 3 0 0 0 5.4 1.8L9 15h6l1.6 1.8A3 3 0 0 0 22 15l-.8-6.8A4 4 0 0 0 17.3 5z" /><path d="M6 11h4M8 9v4M15 12h.01M18 10h.01" /></> },
  bell: { node: <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" /> },
  arrow: { node: <path d="M3 18c4-10 10-12 17-8M20 10l-4-1M20 10l-1 4" /> },
  star: { node: <path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 14.3 7.2 16.9l.9-5.4L4.2 7.7l5.4-.8z" /> },
  cloud: { node: <path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9H7z" /> },
  eye: { node: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></> },
  hash: { node: <path d="M5 9h14M5 15h14M10 3L8 21M16 3l-2 18" /> },
  play: { node: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M10 9l5 3-5 3z" /></> },
  dots: { fill: true, node: <><circle cx="5" cy="5" r="1.4" /><circle cx="12" cy="5" r="1.4" /><circle cx="19" cy="5" r="1.4" /><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /><circle cx="5" cy="19" r="1.4" /><circle cx="12" cy="19" r="1.4" /><circle cx="19" cy="19" r="1.4" /></> },
  ring: { node: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></> },
  moon: { node: <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" /> }
};

interface Doodle {
  k: Kind;
  x: string;          // left, as a percentage of the page
  y: string;          // top, as a percentage of the page
  s: number;          // size in px (on phones it is scaled down in CSS)
  r: number;          // tilt in degrees
  c: string;          // colour class
  d?: number;         // animation delay in seconds
  phone?: boolean;    // false = not shown on small screens
}

const A = 'text-amber-300/75', P = 'text-pink-300/70', C = 'text-cyan-300/70', V = 'text-violet-300/70', G = 'text-emerald-300/70', O = 'text-orange-300/75', W = 'text-white/35';

const SIZE_BOOST = 1.4;     // all sizes below are scaled up by this

const DOODLES: Doodle[] = [
  // top band
  { k: 'sparkle', x: '4%', y: '3%', s: 22, r: 10, c: A, d: 0.2 },
  { k: 'squiggle', x: '14%', y: '2%', s: 46, r: -6, c: C, d: 1.1, phone: false },
  { k: 'note', x: '27%', y: '4%', s: 24, r: -12, c: P, d: 0.6 },
  { k: 'crown', x: '70%', y: '3%', s: 22, r: 14, c: A, d: 1.4 },
  { k: 'star', x: '80%', y: '12%', s: 20, r: -10, c: V, d: 0.9, phone: false },
  { k: 'bolt', x: '92%', y: '4%', s: 22, r: 12, c: O, d: 0.3 },
  { k: 'cloud', x: '56%', y: '1%', s: 34, r: 0, c: W, d: 1.8, phone: false },
  // left edge
  { k: 'heart', x: '2%', y: '22%', s: 20, r: -14, c: P, d: 0.5 },
  { k: 'camera', x: '9%', y: '47%', s: 30, r: -8, c: C, d: 1.3, phone: false },
  { k: 'spiral', x: '3%', y: '58%', s: 30, r: 8, c: V, d: 0.8 },
  { k: 'smile', x: '7%', y: '71%', s: 28, r: 10, c: A, d: 1.6 },
  { k: 'plus', x: '16%', y: '34%', s: 16, r: 12, c: G, d: 0.4, phone: false },
  { k: 'flower', x: '2%', y: '84%', s: 28, r: -10, c: P, d: 1.0 },
  { k: 'hash', x: '15%', y: '62%', s: 20, r: 8, c: W, d: 0.7, phone: false },
  { k: 'moon', x: '4%', y: '38%', s: 24, r: -18, c: A, d: 1.9 },
  // right edge
  { k: 'chat', x: '95%', y: '20%', s: 24, r: 10, c: C, d: 0.3 },
  { k: 'pad', x: '88%', y: '46%', s: 32, r: 12, c: G, d: 1.2, phone: false },
  { k: 'sparkle', x: '96%', y: '36%', s: 18, r: -8, c: A, d: 0.9 },
  { k: 'play', x: '92%', y: '60%', s: 28, r: -10, c: P, d: 0.5 },
  { k: 'bell', x: '95%', y: '73%', s: 24, r: 14, c: O, d: 1.5 },
  { k: 'eye', x: '85%', y: '86%', s: 28, r: -6, c: V, d: 0.2, phone: false },
  { k: 'heart', x: '78%', y: '30%', s: 18, r: 16, c: P, d: 1.1, phone: false },
  { k: 'ring', x: '84%', y: '64%', s: 22, r: 0, c: C, d: 1.7, phone: false },
  // bottom band
  { k: 'plane', x: '22%', y: '92%', s: 26, r: -12, c: C, d: 0.6 },
  { k: 'squiggle', x: '32%', y: '95%', s: 50, r: 4, c: P, d: 1.4, phone: false },
  { k: 'star', x: '45%', y: '94%', s: 22, r: 10, c: A, d: 0.1 },
  { k: 'note', x: '58%', y: '93%', s: 24, r: 8, c: V, d: 1.0 },
  { k: 'bolt', x: '68%', y: '95%', s: 20, r: -14, c: O, d: 1.7 },
  { k: 'dots', x: '75%', y: '90%', s: 30, r: 0, c: W, d: 0.9, phone: false },
  { k: 'sparkle', x: '12%', y: '94%', s: 18, r: 20, c: G, d: 0.4 },
  { k: 'smile', x: '92%', y: '95%', s: 24, r: -10, c: A, d: 1.2 },
  // scattered between (behind the card these only peek out at the edges and on tall screens)
  { k: 'arrow', x: '22%', y: '16%', s: 34, r: 10, c: W, d: 0.8, phone: false },
  { k: 'sparkle', x: '33%', y: '14%', s: 14, r: 0, c: A, d: 1.5 },
  { k: 'heart', x: '66%', y: '15%', s: 16, r: -12, c: P, d: 0.6 },
  { k: 'sparkle', x: '72%', y: '26%', s: 14, r: 12, c: C, d: 1.3 },
  { k: 'plus', x: '28%', y: '80%', s: 14, r: 0, c: V, d: 0.3, phone: false },
  { k: 'flower', x: '74%', y: '78%', s: 24, r: 12, c: G, d: 1.1, phone: false },
  { k: 'spiral', x: '40%', y: '88%', s: 26, r: -8, c: O, d: 0.5, phone: false },
  { k: 'crown', x: '10%', y: '12%', s: 20, r: -16, c: A, d: 1.9, phone: false }
];

export const LoginDoodles: React.FC = () => (
  <div className="absolute inset-0 pointer-events-none select-none z-[1] overflow-hidden" aria-hidden="true">
    {DOODLES.map((d, i) => {
      const icon = ICONS[d.k];
      return (
        <svg
          key={i}
          viewBox="0 0 24 24"
          className={`login-doodle absolute ${d.c} ${d.phone === false ? 'hidden sm:block' : ''}`}
          style={{ left: d.x, top: d.y, width: d.s * SIZE_BOOST, height: d.s * SIZE_BOOST, ['--r' as string]: `${d.r}deg`, animationDelay: `${d.d ?? 0}s` }}
          fill={icon.fill ? 'currentColor' : 'none'}
          stroke={icon.fill ? 'none' : 'currentColor'}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {icon.node}
        </svg>
      );
    })}
  </div>
);
