import React from 'react';

// A third layer of doodles for the wide sign-in page, to fill the rest of the page with things the other layers do not have: food (pizza, ice cream, a
// donut, bubble tea), things to wear and play with (sunglasses, a skateboard, dice, a joystick, a cassette), little characters (a ghost, a robot, a UFO,
// a paw), study things (a graduation cap, a pencil), weather and sky, and short hand-written words about what NOOB is for. Only from 1280px wide,
// behind everything, decoration only (see LoginDoodles.tsx for the same rules).

type Art = 'ghost' | 'pizza' | 'icecream' | 'sunglasses' | 'cassette' | 'ufo' | 'robot' | 'diamond' | 'skateboard' | 'dice' | 'sun' | 'moon' | 'boba'
  | 'joystick' | 'storm' | 'clapper' | 'donut' | 'cap' | 'pencil' | 'plant' | 'paw';

const f = { fill: 'currentColor', stroke: 'none' } as const;

// each picture is drawn on a 100 x 100 sheet
const ART: Record<Art, React.ReactNode> = {
  ghost: <>
    <path d="M22 90V46C22 24 34 12 50 12S78 24 78 46V90l-9-8-9 8-10-8-10 8-9-8z" />
    <circle cx="40" cy="44" r="4" {...f} /><circle cx="60" cy="44" r="4" {...f} />
    <path d="M42 58q8 7 16 0" /><path d="M31 54h.01M69 54h.01" strokeWidth="6" opacity=".5" /><path d="M12 30l-5-5M88 28l6-5M90 60h7" />
  </>,
  pizza: <>
    <path d="M12 24Q50 2 88 24L50 94z" /><path d="M16 31Q50 11 84 31" />
    <circle cx="40" cy="42" r="6" /><circle cx="61" cy="43" r="6" /><circle cx="50" cy="63" r="5" /><path d="M46 29h.01M58 31h.01M50 78h.01" strokeWidth="5" />
  </>,
  icecream: <>
    <path d="M30 52L50 94 70 52" /><path d="M36 62l20 12M44 54l22 14M40 78l8-14" />
    <path d="M24 52Q22 24 50 22T76 52z" /><path d="M31 41q6-9 15-6" /><circle cx="64" cy="13" r="5" {...f} /><path d="M64 9q6-8 13-5" />
  </>,
  sunglasses: <>
    <path d="M6 40h88M6 40l-3-13M94 40l3-13" />
    <rect x="10" y="38" width="34" height="27" rx="12" fill="currentColor" fillOpacity=".22" /><rect x="56" y="38" width="34" height="27" rx="12" fill="currentColor" fillOpacity=".22" />
    <path d="M44 49q6-6 12 0M18 47l8 9M64 47l8 9" />
  </>,
  cassette: <>
    <rect x="8" y="22" width="84" height="56" rx="8" /><rect x="22" y="30" width="56" height="22" rx="5" />
    <circle cx="37" cy="41" r="6" /><circle cx="63" cy="41" r="6" /><path d="M37 41h26M24 78l6-14h40l6 14M38 71h24" />
  </>,
  ufo: <>
    <path d="M34 40Q34 14 50 14T66 40" /><ellipse cx="50" cy="46" rx="40" ry="12" />
    <circle cx="26" cy="48" r="2.4" {...f} /><circle cx="50" cy="53" r="2.4" {...f} /><circle cx="74" cy="48" r="2.4" {...f} />
    <path d="M34 62l-12 30M66 62l12 30M50 64v28" strokeDasharray="3 7" /><path d="M7 16l7 7M93 12l-7 8" />
  </>,
  robot: <>
    <rect x="20" y="28" width="60" height="50" rx="10" /><path d="M50 28V16" /><circle cx="50" cy="11" r="4.5" />
    <rect x="31" y="40" width="14" height="12" rx="4" /><rect x="55" y="40" width="14" height="12" rx="4" />
    <path d="M36 66h28M42 62v8M50 62v8M58 62v8M20 46h-8v14h8M80 46h8v14h-8M32 78v11h36V78" />
  </>,
  diamond: <>
    <path d="M26 18h48l16 22L50 90 10 40z" /><path d="M10 40h80M36 18l-8 22 22 50M64 18l8 22-22 50M26 18l24 22 24-22" />
    <path d="M88 10v10M83 15h10M10 76v8M6 80h8" />
  </>,
  skateboard: <>
    <path d="M6 44q0-6 8-6h72q8 0 8 6t-8 6H14q-8 0-8-6z" /><circle cx="26" cy="62" r="8" /><circle cx="74" cy="62" r="8" /><path d="M26 54v-4M74 54v-4" />
    <path d="M4 74h20M0 83h14M10 92h14" />
  </>,
  dice: <>
    <rect x="10" y="30" width="52" height="52" rx="10" />
    <circle cx="26" cy="46" r="3.6" {...f} /><circle cx="46" cy="46" r="3.6" {...f} /><circle cx="36" cy="56" r="3.6" {...f} /><circle cx="26" cy="66" r="3.6" {...f} /><circle cx="46" cy="66" r="3.6" {...f} />
    <g transform="rotate(16 76 28)"><rect x="58" y="10" width="34" height="34" rx="8" /><circle cx="68" cy="20" r="3" {...f} /><circle cx="82" cy="34" r="3" {...f} /><circle cx="75" cy="27" r="3" {...f} /></g>
  </>,
  sun: <>
    <circle cx="50" cy="50" r="18" /><path d="M50 14v10M50 76v10M14 50h10M76 50h10M24 24l7 7M69 69l7 7M76 24l-7 7M31 69l-7 7" />
    <path d="M43 47h.01M57 47h.01" strokeWidth="5" /><path d="M42 56q8 8 16 0" />
  </>,
  moon: <>
    <path d="M64 12A30 30 0 1 0 86 62 26 26 0 0 1 64 12z" />
    <path d="M18 16v10M13 21h10M84 88v8M80 92h8" /><path d="M20 90a8 8 0 0 1 2-16 12 12 0 0 1 23 2 7 7 0 0 1 0 14z" />
  </>,
  boba: <>
    <path d="M26 34h48l-6 56H32z" /><path d="M22 34h56M52 34l10-26h13" />
    <circle cx="40" cy="79" r="4" {...f} /><circle cx="52" cy="82" r="4" {...f} /><circle cx="63" cy="77" r="4" {...f} /><path d="M32 54h38" strokeDasharray="2 6" />
  </>,
  joystick: <>
    <path d="M50 34V12" /><circle cx="50" cy="11" r="9" />
    <path d="M18 82V66q0-14 14-14h36q14 0 14 14v16z" /><path d="M10 82h80" /><circle cx="36" cy="68" r="4.5" /><circle cx="62" cy="65" r="3.6" {...f} /><circle cx="73" cy="72" r="3.6" {...f} />
  </>,
  storm: <>
    <path d="M24 56a14 14 0 0 1 2-28 20 20 0 0 1 38-4 16 16 0 0 1 6 32z" /><path d="M52 52l-9 16h11l-9 20" />
    <path d="M22 66l-4 11M72 62l-4 11M36 76l-3 9" />
  </>,
  clapper: <>
    <rect x="10" y="40" width="80" height="46" rx="5" /><path d="M10 40l8-20h74l-8 20M26 40l8-20M46 40l8-20M66 40l8-20M26 58h48M26 72h30" />
  </>,
  donut: <>
    <circle cx="50" cy="50" r="38" /><circle cx="50" cy="50" r="13" />
    <path d="M26 34l8 4M62 22l-3 9M76 48l-10 2M70 72l-8-5M36 76l5-8M25 56l9-2" strokeWidth="4.5" />
  </>,
  cap: <>
    <path d="M50 20L8 40l42 20 42-20z" /><path d="M24 50v18c9 9 43 9 52 0V50M90 42v26" /><circle cx="90" cy="73" r="4" {...f} />
  </>,
  pencil: <>
    <path d="M16 84l6-20L68 18l14 14-46 46z" /><path d="M60 26l14 14M22 64l14 14M16 84l10-2M62 12l8-8 14 14-8 8" />
  </>,
  plant: <>
    <path d="M34 62h32l-4 28H38zM30 62h40M50 62V36" /><path d="M50 46c-14 0-20-10-20-20 14 0 20 8 20 20zM50 40c12 0 20-8 20-20-14 0-20 8-20 20z" />
  </>,
  paw: <>
    <path d="M50 52c-12 0-24 12-18 24 4 8 10 8 18 4 8 4 14 4 18-4 6-12-6-24-18-24z" />
    <ellipse cx="24" cy="44" rx="7" ry="9" /><ellipse cx="40" cy="26" rx="7" ry="10" /><ellipse cx="60" cy="26" rx="7" ry="10" /><ellipse cx="76" cy="44" rx="7" ry="9" />
  </>
};

interface Spot { a: Art; x: string; y: string; w: number; r: number; c: string; d: number }
const A = 'text-amber-300/80', P = 'text-pink-300/80', C = 'text-cyan-300/80', V = 'text-violet-300/80', G = 'text-emerald-300/80', O = 'text-orange-300/85';

const SPOTS: Spot[] = [
  // left side
  { a: 'ghost', x: '21.5%', y: '32%', w: 84, r: -8, c: V, d: 0.3 },
  { a: 'icecream', x: '26%', y: '57%', w: 80, r: -10, c: P, d: 1.0 },
  { a: 'pizza', x: '9%', y: '67%', w: 84, r: 12, c: O, d: 0.6 },
  { a: 'cap', x: '3.5%', y: '60%', w: 76, r: -10, c: G, d: 1.5 },
  { a: 'paw', x: '28%', y: '69%', w: 58, r: 14, c: A, d: 0.9 },
  { a: 'sunglasses', x: '12.5%', y: '77%', w: 100, r: -6, c: A, d: 0.2 },
  { a: 'cassette', x: '19%', y: '76%', w: 112, r: 5, c: G, d: 1.2 },
  { a: 'dice', x: '27%', y: '80%', w: 84, r: 14, c: V, d: 0.7 },
  { a: 'robot', x: '13%', y: '86%', w: 90, r: 8, c: C, d: 1.7 },
  { a: 'boba', x: '8%', y: '91%', w: 80, r: -8, c: O, d: 0.4 },
  { a: 'skateboard', x: '21%', y: '90%', w: 124, r: -4, c: P, d: 1.1 },
  { a: 'moon', x: '1.5%', y: '92.5%', w: 84, r: 0, c: A, d: 1.9 },
  // right side
  { a: 'icecream', x: '61%', y: '15%', w: 70, r: 8, c: P, d: 0.5 },
  { a: 'diamond', x: '69.5%', y: '21%', w: 68, r: -10, c: V, d: 1.3 },
  { a: 'ufo', x: '88%', y: '24%', w: 96, r: 8, c: C, d: 0.8 },
  { a: 'moon', x: '95%', y: '50%', w: 68, r: 6, c: A, d: 1.6 },
  { a: 'paw', x: '66%', y: '78%', w: 58, r: 20, c: O, d: 0.2 },
  { a: 'pencil', x: '73%', y: '70%', w: 78, r: 14, c: A, d: 1.4 },
  { a: 'clapper', x: '86.5%', y: '62.5%', w: 92, r: -6, c: A, d: 0.9 },
  { a: 'donut', x: '84%', y: '80%', w: 88, r: 12, c: P, d: 0.1 },
  { a: 'joystick', x: '76%', y: '88%', w: 98, r: -8, c: V, d: 1.5 },
  { a: 'cap', x: '88%', y: '88%', w: 98, r: 10, c: G, d: 0.6 },
  { a: 'plant', x: '69%', y: '91%', w: 80, r: 0, c: G, d: 1.2 },
  { a: 'storm', x: '82%', y: '92.5%', w: 90, r: -6, c: C, d: 1.8 },
  { a: 'sun', x: '95%', y: '85%', w: 70, r: 0, c: O, d: 0.4 },
  { a: 'robot', x: '67.5%', y: '65%', w: 66, r: -10, c: C, d: 1.0 },
  // below the card
  { a: 'boba', x: '37%', y: '93%', w: 70, r: -6, c: O, d: 0.8 },
  { a: 'donut', x: '44%', y: '94%', w: 66, r: 10, c: P, d: 1.4 },
  { a: 'diamond', x: '51%', y: '93%', w: 64, r: -8, c: V, d: 0.2 },
  { a: 'pizza', x: '58%', y: '94%', w: 66, r: 12, c: A, d: 1.1 }
];

const WORDS: Array<{ t: string; x: string; y: string; r: number; c: string; s: string }> = [
  { t: 'level up!', x: '4%', y: '68%', r: -6, c: 'text-emerald-300/75', s: 'text-2xl' },
  { t: 'gg!', x: '31%', y: '62%', r: 8, c: 'text-cyan-300/75', s: 'text-2xl' },
  { t: 'memes', x: '3%', y: '86%', r: -8, c: 'text-pink-300/75', s: 'text-xl' },
  { t: 'streak!', x: '24%', y: '88%', r: 5, c: 'text-amber-300/75', s: 'text-2xl' },
  { t: 'music', x: '15%', y: '59%', r: -4, c: 'text-violet-300/75', s: 'text-lg' },
  { t: 'reels', x: '68%', y: '34%', r: -7, c: 'text-pink-300/75', s: 'text-xl' },
  { t: 'daily quiz', x: '74%', y: '84%', r: 5, c: 'text-cyan-300/75', s: 'text-xl' },
  { t: 'play!', x: '79.5%', y: '75%', r: -8, c: 'text-emerald-300/75', s: 'text-2xl' },
  { t: 'no cap ♡', x: '90.5%', y: '57%', r: 6, c: 'text-amber-300/75', s: 'text-lg' },
  { t: 'chill', x: '67.5%', y: '72.5%', r: -5, c: 'text-violet-300/75', s: 'text-xl' }
];

export const LoginMoreDoodles: React.FC = () => (
  <div className="absolute inset-0 pointer-events-none select-none z-[1] overflow-hidden hidden xl:block" aria-hidden="true" data-testid="more-doodles">
    {SPOTS.map((p, i) => (
      <svg
        key={i}
        viewBox="0 0 100 100"
        className={`login-doodle absolute ${p.c}`}
        style={{ left: p.x, top: p.y, width: p.w, height: p.w, ['--r' as string]: `${p.r}deg`, animationDelay: `${p.d}s` }}
        fill="none"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {ART[p.a]}
      </svg>
    ))}
    {WORDS.map((w, i) => (
      <span key={'w' + i} className={`login-doodle absolute font-script whitespace-nowrap ${w.s} ${w.c}`} style={{ left: w.x, top: w.y, ['--r' as string]: `${w.r}deg`, animationDelay: `${(i % 4) * 0.5}s` }}>{w.t}</span>
    ))}
  </div>
);
