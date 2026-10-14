// Writes src/lightAccents.css: how the app's coloured text looks in LIGHT mode.
//
// The app is designed dark-first. Pale accent colours (text-emerald-300, text-amber-200, ...) read well on dark but are almost invisible on the white
// cards of light mode (a contrast of 1.0 to 1.2 out of 21 on a tinted chip). This looks at every colour class the app really uses and gives light mode a deeper
// version of each pale one, so a chip that says "Verified" in mint on a dark card says it in deep green on a white one. It also keeps white text white on solid
// colour buttons, keeps dark text dark on bright yellow buttons, and keeps white text on dark translucent pills.
//
// Run:  node scripts/gen-light-accents.mjs        (writes the file)       node scripts/gen-light-accents.mjs --check   (fails if the file is out of date)
// Surfaces that are dark in BOTH modes (reels, stories, calls, live video, the camera) carry the class "force-dark" and are never changed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HUES = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'];
const P = {
  red: ['#fef2f2', '#fee2e2', '#fecaca', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d'],
  orange: ['#fff7ed', '#ffedd5', '#fed7aa', '#fdba74', '#fb923c', '#f97316', '#ea580c', '#c2410c', '#9a3412', '#7c2d12'],
  amber: ['#fffbeb', '#fef3c7', '#fde68a', '#fcd34d', '#fbbf24', '#f59e0b', '#d97706', '#b45309', '#92400e', '#78350f'],
  yellow: ['#fefce8', '#fef9c3', '#fef08a', '#fde047', '#facc15', '#eab308', '#ca8a04', '#a16207', '#854d0e', '#713f12'],
  lime: ['#f7fee7', '#ecfccb', '#d9f99d', '#bef264', '#a3e635', '#84cc16', '#65a30d', '#4d7c0f', '#3f6212', '#365314'],
  green: ['#f0fdf4', '#dcfce7', '#bbf7d0', '#86efac', '#4ade80', '#22c55e', '#16a34a', '#15803d', '#166534', '#14532d'],
  emerald: ['#ecfdf5', '#d1fae5', '#a7f3d0', '#6ee7b7', '#34d399', '#10b981', '#059669', '#047857', '#065f46', '#064e3b'],
  teal: ['#f0fdfa', '#ccfbf1', '#99f6e4', '#5eead4', '#2dd4bf', '#14b8a6', '#0d9488', '#0f766e', '#115e59', '#134e4a'],
  cyan: ['#ecfeff', '#cffafe', '#a5f3fc', '#67e8f9', '#22d3ee', '#06b6d4', '#0891b2', '#0e7490', '#155e75', '#164e63'],
  sky: ['#f0f9ff', '#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#0ea5e9', '#0284c7', '#0369a1', '#075985', '#0c4a6e'],
  blue: ['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a'],
  indigo: ['#eef2ff', '#e0e7ff', '#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3', '#312e81'],
  violet: ['#f5f3ff', '#ede9fe', '#ddd6fe', '#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95'],
  purple: ['#faf5ff', '#f3e8ff', '#e9d5ff', '#d8b4fe', '#c084fc', '#a855f7', '#9333ea', '#7e22ce', '#6b21a8', '#581c87'],
  fuchsia: ['#fdf4ff', '#fae8ff', '#f5d0fe', '#f0abfc', '#e879f9', '#d946ef', '#c026d3', '#a21caf', '#86198f', '#701a75'],
  pink: ['#fdf2f8', '#fce7f3', '#fbcfe8', '#f9a8d4', '#f472b6', '#ec4899', '#db2777', '#be185d', '#9d174d', '#831843'],
  rose: ['#fff1f2', '#ffe4e6', '#fecdd3', '#fda4af', '#fb7185', '#f43f5e', '#e11d48', '#be123c', '#9f1239', '#881337']
};
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
const shadeHex = (hue, shade) => P[hue][SHADES.indexOf(shade)];
// hues whose deep shade must be deeper still, to read on white
const WARM = new Set(['amber', 'yellow', 'lime', 'orange']);
// the colour a pale shade becomes in light mode
export const deepOf = (hue, shade) => shadeHex(hue, WARM.has(hue) && shade <= 300 ? 800 : 700);
const NOOB_STRONG = '#c6613f';

const SUPPORTED = { '': '', hover: ':hover', focus: ':focus', active: ':active', disabled: ':disabled', 'group-hover': 'GROUP', placeholder: '::placeholder' };
const esc = (s) => s.replace(/[:/.[\]]/g, (c) => '\\' + c);

export function collectTokens(root = 'src') {
  const tokens = new Set();
  (function walk(d) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (/\.(tsx|ts)$/.test(f.name)) for (const m of fs.readFileSync(p, 'utf8').matchAll(/[A-Za-z0-9_:\-/.[\]]+/g)) tokens.add(m[0]);
    }
  })(root);
  return tokens;
}

export function build(tokens) {
  const R = ':root[data-theme="light"]';
  const NOT = ':not(.force-dark *):not(.media-dark *)';
  const out = [];
  const warnings = [];
  const accentRe = new RegExp(`^((?:[a-z-]+:)?)text-(${HUES.join('|')})-(100|200|300|400)(?:/(\\d{1,3}))?$`);
  const noobRe = /^((?:[a-z-]+:)?)text-noob(?:\/(\d{1,3}))?$/;
  const seen = new Set();
  const emit = (variant, token, valueCss) => {
    const kind = SUPPORTED[variant.replace(/:$/, '')];
    if (kind === undefined) { warnings.push(token); return; }
    const cls = '.' + esc(token);
    let sel;
    if (kind === 'GROUP') sel = `${R} .group:hover ${cls}${NOT}`;
    else if (kind === '::placeholder') sel = `${R} ${cls}${NOT}::placeholder`;
    else sel = `${R} ${cls}${kind}${NOT}`;
    if (seen.has(sel)) return;
    seen.add(sel);
    out.push(`${sel} { color: ${valueCss} !important; }`);
  };
  const list = [...tokens].sort();
  for (const t of list) {
    let m = accentRe.exec(t);
    if (m) {
      const hex = deepOf(m[2], Number(m[3]));
      emit(m[1], t, m[4] ? `color-mix(in srgb, ${hex} ${m[4]}%, transparent)` : hex);
      continue;
    }
    m = noobRe.exec(t);
    if (m) emit(m[1], t, m[2] ? `color-mix(in srgb, ${NOOB_STRONG} ${m[2]}%, transparent)` : NOOB_STRONG);
  }
  // white text stays white on solid colour (the "text-white becomes dark" rule is for white-on-dark surfaces)
  const solid = [];
  for (const hue of HUES) for (const shade of [500, 600, 700, 800, 900]) {
    solid.push(`${R} .text-white[class~="bg-${hue}-${shade}"]${NOT}`);
    solid.push(`${R} .text-white[class*="from-${hue}-${shade}"]${NOT}`);
  }
  for (const n of ['bg-noob', 'bg-noob-strong', 'from-noob', 'from-noob-strong']) solid.push(`${R} .text-white[class~="${n}"]${NOT}`, `${R} .text-white[class*="${n} "]${NOT}`);
  // white text stays white on dark translucent pills laid over pictures and video
  const pills = [];
  for (const a of [40, 50, 60, 70, 80, 90, 95]) pills.push(`${R} .text-white[class~="bg-black/${a}"]${NOT}`);
  // text that is meant to be DARK on a bright fill (written text-slate-950 and the like) must not turn white with the flipped grey scale
  const darkText = [];
  for (const g of ['zinc', 'slate', 'gray', 'neutral', 'stone']) for (const s of [900, 950]) darkText.push(`${R} .text-${g}-${s}${NOT}`);
  // black fades over pictures (a shadow under a caption) must stay black fades inside always-dark screens: light mode otherwise turns them into pale fades
  const fades = [];
  for (const pos of ['from', 'via', 'to']) {
    fades.push(`${R} .media-dark [class~="${pos}-black"] { --tw-gradient-${pos}: #000000 !important; }`);
    for (let a = 5; a <= 95; a += 5) fades.push(`${R} .media-dark [class~="${pos}-black/${a}"] { --tw-gradient-${pos}: color-mix(in oklab, #000000 ${a}%, transparent) !important; }`);
  }
  const head = `/* GENERATED by scripts/gen-light-accents.mjs from the colour classes used in src/ — do not edit by hand; run:  node scripts/gen-light-accents.mjs */\n`;
  const body = [
    '/* pale accent text becomes a deeper colour of the same family in light mode */',
    ...out,
    '',
    '/* white text stays white on solid colour buttons and badges */',
    `${solid.join(',\n')} { color: #ffffff !important; }`,
    '',
    '/* white text stays white on dark translucent pills over pictures and video */',
    `${pills.join(',\n')} { color: #ffffff !important; }`,
    '',
    '/* text written as the darkest greys is dark text on a bright fill: it stays dark */',
    `${darkText.join(',\n')} { color: #1f1e1d !important; }`,
    '',
    '/* black fades over pictures stay black inside the always-dark screens */',
    ...fades,
    ''
  ].join('\n');
  // inside @layer base, next to the light-mode rules these have to win over (an !important rule outside every layer loses to an !important rule inside one)
  return { css: head + '@layer base {\n' + body + '}\n', count: out.length, warnings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { css, count, warnings } = build(collectTokens());
  const file = 'src/lightAccents.css';
  if (process.argv.includes('--check')) {
    const now = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(String.fromCharCode(13)).join('') : '';
    if (now !== css) { console.error('src/lightAccents.css is out of date: run  node scripts/gen-light-accents.mjs'); process.exit(1); }
    console.log(`lightAccents.css is up to date (${count} accent rules)`);
  } else {
    fs.writeFileSync(file, css);
    console.log(`wrote ${file}: ${count} accent rules` + (warnings.length ? `; skipped ${warnings.length} with variants that are not supported: ${warnings.slice(0, 8).join(' ')}` : ''));
  }
}
