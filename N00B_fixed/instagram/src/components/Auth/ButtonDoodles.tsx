import React from 'react';

// Hand-drawn style doodles for the sign-in buttons: a little cluster on the far left and far right of the button, fading out toward the
// label so the text always stays clear. Every provider has its own set (Google: colourful squiggles and stars; Facebook: hearts and chat
// bubbles; Discord: a game controller and lightning). Purely decorative: they take no clicks and are hidden from screen readers. The
// gentle floating/twinkling is switched off for people who asked their device for less motion (see index.css).

type D = { stroke?: string; fill?: string; w?: number; cls?: string; delay?: number };

const star = (cx: number, cy: number, r: number) => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)} ${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join(' L')}Z`;
};
const sparkle = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy - r}Q${cx} ${cy} ${cx + r} ${cy}Q${cx} ${cy} ${cx} ${cy + r}Q${cx} ${cy} ${cx - r} ${cy}Q${cx} ${cy} ${cx} ${cy - r}Z`;
const plus = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}H${cx + r}M${cx} ${cy - r}V${cy + r}`;
const heart = (cx: number, cy: number, s: number) =>
  `M${cx} ${cy + s * 0.9}C${cx - s * 1.9} ${cy - s * 0.2} ${cx - s * 0.8} ${cy - s * 1.5} ${cx} ${cy - s * 0.5}C${cx + s * 0.8} ${cy - s * 1.5} ${cx + s * 1.9} ${cy - s * 0.2} ${cx} ${cy + s * 0.9}Z`;
const bolt = (cx: number, cy: number, s: number) =>
  `M${cx + s * 0.3} ${cy - s}L${cx - s * 0.6} ${cy + s * 0.15}H${cx}L${cx - s * 0.3} ${cy + s}L${cx + s * 0.7} ${cy - s * 0.25}H${cx + s * 0.1}Z`;
const wave = (x: number, y: number, w: number, amp: number, n: number) => `M${x} ${y}q${w / 2} ${-amp * 2} ${w} 0${` t${w} 0`.repeat(n - 1)}`;
const spiral = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy}a${r * 0.3} ${r * 0.3} 0 0 1 ${r * 0.6} 0a${r * 0.6} ${r * 0.6} 0 0 1 ${-r * 1.2} 0a${r * 0.9} ${r * 0.9} 0 0 1 ${r * 1.8} 0`;
const bubble = (x: number, y: number) =>
  `M${x + 4} ${y}h12a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4h-7l-4 4v-4h-1a4 4 0 0 1-4-4v-6a4 4 0 0 1 4-4Z`;
const controller = (cx: number, cy: number) =>
  `M${cx - 8} ${cy - 4}h16a5 5 0 0 1 5 6l-1.5 4.5a3 3 0 0 1-5 .5l-1.5-2.5h-9l-1.5 2.5a3 3 0 0 1-5-.5l-1.5-4.5a5 5 0 0 1 5-6Z`;

const P: React.FC<{ d: string } & D> = ({ d, stroke = 'currentColor', fill = 'none', w = 1.7, cls, delay = 0 }) => (
  <path d={d} stroke={stroke} fill={fill} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" className={cls} style={delay ? { animationDelay: `${delay}s` } : undefined} />
);
const Dot: React.FC<{ x: number; y: number; r?: number; c: string; cls?: string; delay?: number }> = ({ x, y, r = 1.5, c, cls, delay = 0 }) => (
  <circle cx={x} cy={y} r={r} fill={c} className={cls} style={delay ? { animationDelay: `${delay}s` } : undefined} />
);

// ---- Google: colourful, like the logo
const G = { b: '#4285F4', r: '#EA4335', y: '#F9AB00', g: '#34A853' };
const googleLeft = (
  <>
    <P d={wave(4, 36, 6, 4.5, 4)} stroke={G.b} w={2} />
    <P d={star(15, 12, 6.5)} stroke={G.r} cls="dd-twinkle" />
    <P d={plus(36, 9, 3)} stroke={G.y} w={1.9} cls="dd-float" delay={0.4} />
    <P d={spiral(32, 25, 5)} stroke={G.g} cls="dd-float" delay={0.9} />
    <Dot x={6} y={21} c={G.b} r={1.6} />
    <Dot x={46} y={33} c={G.y} r={1.4} />
  </>
);
const googleRight = (
  <>
    <P d={sparkle(41, 12, 6.5)} stroke={G.b} cls="dd-twinkle" delay={0.6} />
    <P d={wave(30, 36, 6, 4.5, 4)} stroke={G.r} w={2} />
    <P d={heart(14, 14, 3.6)} stroke={G.r} />
    <P d={plus(19, 29, 2.8)} stroke={G.g} w={1.9} cls="dd-float" delay={0.2} />
    <Dot x={50} y={26} c={G.g} r={1.6} />
    <Dot x={8} y={32} c={G.y} r={1.4} />
  </>
);

const googleLeftMore = (
  <>
    <P d={sparkle(70, 14, 5)} stroke={G.b} cls="dd-twinkle" delay={1.1} />
    <P d={plus(66, 29, 2.6)} stroke={G.r} w={1.9} />
    <P d={star(83, 29, 4.5)} stroke={G.g} cls="dd-float" delay={0.7} />
    <Dot x={90} y={11} c={G.r} r={1.5} />
  </>
);
const googleRightMore = (
  <>
    <P d={star(14, 30, 5)} stroke={G.y} cls="dd-twinkle" delay={0.3} />
    <P d={sparkle(29, 12, 4.5)} stroke={G.g} cls="dd-twinkle" delay={1.2} />
    <P d={spiral(24, 35, 4)} stroke={G.r} cls="dd-float" delay={0.5} />
    <Dot x={7} y={12} c={G.b} r={1.5} />
  </>
);

// ---- Facebook: hearts, chat bubbles, stars (white and sky blue on the blue button)
const fbLeft = (
  <>
    <P d={heart(14, 13, 4)} stroke="#ffffff" fill="rgba(255,255,255,.18)" cls="dd-float" />
    <P d={bubble(24, 22)} stroke="#cfe4ff" w={1.6} />
    <Dot x={30.5} y={29} c="#cfe4ff" r={1} />
    <Dot x={34} y={29} c="#cfe4ff" r={1} />
    <Dot x={37.5} y={29} c="#cfe4ff" r={1} />
    <P d={wave(3, 36, 6, 4, 3)} stroke="#ffffff" w={1.8} />
    <P d={star(40, 9, 5)} stroke="#ffe27a" cls="dd-twinkle" delay={0.5} />
    <Dot x={6} y={24} c="#cfe4ff" r={1.5} />
  </>
);
const fbRight = (
  <>
    <P d={bubble(10, 8)} stroke="#ffffff" w={1.6} cls="dd-float" delay={0.3} />
    <Dot x={16.5} y={15} c="#ffffff" r={1} />
    <Dot x={20} y={15} c="#ffffff" r={1} />
    <Dot x={23.5} y={15} c="#ffffff" r={1} />
    <P d={heart(42, 28, 3.6)} stroke="#ffb3c8" fill="rgba(255,179,200,.25)" cls="dd-twinkle" />
    <P d={sparkle(44, 9, 4.5)} stroke="#cfe4ff" cls="dd-twinkle" delay={0.8} />
    <P d={spiral(14, 33, 4.5)} stroke="#cfe4ff" />
    <Dot x={30} y={36} c="#ffffff" r={1.4} />
  </>
);

const fbLeftMore = (
  <>
    <P d={sparkle(70, 13, 4.5)} stroke="#ffffff" cls="dd-twinkle" delay={1} />
    <P d={heart(84, 29, 3.4)} stroke="#ffb3c8" fill="rgba(255,179,200,.25)" cls="dd-float" delay={0.6} />
    <P d={plus(65, 31, 2.5)} stroke="#cfe4ff" w={1.8} />
    <Dot x={90} y={12} c="#ffffff" r={1.4} />
  </>
);
const fbRightMore = (
  <>
    <P d={star(14, 30, 4.5)} stroke="#ffe27a" cls="dd-twinkle" delay={0.2} />
    <P d={heart(28, 13, 3.2)} stroke="#ffffff" fill="rgba(255,255,255,.18)" cls="dd-float" delay={0.9} />
    <P d={plus(30, 33, 2.4)} stroke="#cfe4ff" w={1.8} />
    <Dot x={7} y={14} c="#ffffff" r={1.4} />
  </>
);

// ---- Discord: a controller, lightning, pixels (Discord's own colours)
const DC = { w: '#ffffff', green: '#57F287', yellow: '#FEE75C', pink: '#EB459E' };
const dcLeft = (
  <>
    <P d={controller(16, 14)} stroke={DC.w} fill="rgba(255,255,255,.14)" w={1.6} cls="dd-float" />
    <P d={plus(11, 14, 2)} stroke={DC.w} w={1.3} />
    <Dot x={22} y={13} c={DC.green} r={1.1} />
    <Dot x={25} y={15.5} c={DC.pink} r={1.1} />
    <P d={bolt(40, 12, 7)} stroke={DC.yellow} fill="rgba(254,231,92,.25)" cls="dd-twinkle" delay={0.4} />
    <P d={wave(4, 37, 6, 4, 4)} stroke={DC.w} w={1.9} />
    <P d={star(36, 31, 4.5)} stroke={DC.green} cls="dd-twinkle" delay={0.9} />
    <Dot x={6} y={26} c={DC.pink} r={1.5} />
  </>
);
const dcRight = (
  <>
    <P d={sparkle(13, 12, 6)} stroke={DC.w} cls="dd-twinkle" delay={0.2} />
    <P d={bolt(32, 28, 6.5)} stroke={DC.pink} fill="rgba(235,69,158,.25)" cls="dd-float" delay={0.6} />
    <P d={plus(40, 9, 3)} stroke={DC.yellow} w={1.9} />
    <P d={wave(26, 38, 6, 4, 4)} stroke={DC.w} w={1.9} />
    <P d={spiral(10, 28, 4.5)} stroke={DC.green} cls="dd-float" />
    <Dot x={50} y={22} c={DC.w} r={1.5} />
    <Dot x={47} y={34} c={DC.green} r={1.3} />
  </>
);

const dcLeftMore = (
  <>
    <P d={star(70, 12, 4.5)} stroke={DC.pink} cls="dd-twinkle" delay={0.8} />
    <P d={plus(84, 29, 2.6)} stroke={DC.green} w={1.9} />
    <P d={sparkle(89, 11, 4)} stroke={DC.w} cls="dd-twinkle" delay={1.3} />
    <Dot x={62} y={33} c={DC.yellow} r={1.5} />
  </>
);
const dcRightMore = (
  <>
    <P d={bolt(14, 14, 5.5)} stroke={DC.green} fill="rgba(87,242,135,.22)" cls="dd-float" delay={0.4} />
    <P d={star(28, 31, 4.5)} stroke={DC.yellow} cls="dd-twinkle" delay={1} />
    <P d={plus(30, 12, 2.6)} stroke={DC.w} w={1.8} />
    <Dot x={6} y={34} c={DC.pink} r={1.4} />
  </>
);

// ---- anything else: a few quiet doodles in the button's own text colour
const plainLeft = (
  <>
    <P d={wave(4, 34, 6, 4, 4)} w={1.8} />
    <P d={star(15, 12, 6)} cls="dd-twinkle" />
    <Dot x={40} y={14} c="currentColor" r={1.5} />
  </>
);
const plainRight = (
  <>
    <P d={sparkle(40, 12, 6)} cls="dd-twinkle" />
    <P d={wave(26, 35, 6, 4, 4)} w={1.8} />
    <Dot x={10} y={16} c="currentColor" r={1.5} />
  </>
);

// left / right = the main doodles (they sit at the very edge and always show); leftMore / rightMore = extras that only show when the
// button is wide enough to have room (the picture is cropped, not squashed, on a narrow phone).
const SETS: Record<string, { left: React.ReactNode; right: React.ReactNode; leftMore?: React.ReactNode; rightMore?: React.ReactNode; tone: string }> = {
  google: { left: googleLeft, right: googleRight, leftMore: googleLeftMore, rightMore: googleRightMore, tone: 'text-black' },
  facebook: { left: fbLeft, right: fbRight, leftMore: fbLeftMore, rightMore: fbRightMore, tone: 'text-white' },
  discord: { left: dcLeft, right: dcRight, leftMore: dcLeftMore, rightMore: dcRightMore, tone: 'text-white' }
};

export const ButtonDoodles: React.FC<{ provider: string; light?: boolean }> = ({ provider, light }) => {
  const set = SETS[provider] || { left: plainLeft, right: plainRight, tone: light ? 'text-black/40' : 'text-white/50' };
  return (
    <>
      <svg aria-hidden="true" viewBox="0 0 96 44" preserveAspectRatio="xMinYMid slice" style={{ width: 'clamp(36px, calc((100% - 212px) / 2), 92px)' }} className={`dd-mask-l pointer-events-none absolute left-0 top-0 h-full ${set.tone}`}>
        {set.left}
        {set.leftMore}
      </svg>
      <svg aria-hidden="true" viewBox="0 0 96 44" preserveAspectRatio="xMaxYMid slice" style={{ width: 'clamp(36px, calc((100% - 212px) / 2), 92px)' }} className={`dd-mask-r pointer-events-none absolute right-0 top-0 h-full ${set.tone}`}>
        <g transform="translate(40 0)">{set.right}</g>
        {set.rightMore}
      </svg>
    </>
  );
};
