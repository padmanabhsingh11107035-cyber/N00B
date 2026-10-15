// Light mode (white theme): coloured text is readable on white cards, white text stays white on solid colour buttons, dark text stays dark on bright buttons, and the
// screens that are dark in both modes (reels, stories, calls, live video, the camera) stay dark. Dark mode is not touched by any of it.
// Usage: node scripts/supabase/test-light-mode.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const G = await import(pathToFileURL(path.resolve('scripts/gen-light-accents.mjs')).href);

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (c) => { const f = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
const blend = (fg, bg, a) => fg.map((v, i) => Math.round(v * a + bg[i] * (1 - a)));
const WHITE = [255, 255, 255];

section('1. The generated stylesheet is current');
const css = read('src/lightAccents.css');
const built = G.build(G.collectTokens());
check(built.css === css, 'src/lightAccents.css matches the colour classes used in the app (run: node scripts/gen-light-accents.mjs)');
check(/@import "\.\/lightAccents\.css"/.test(read('src/index.css')), 'the app stylesheet loads it');
check(/^@layer base \{/m.test(css) && /\}\s*$/.test(css), 'it lives in @layer base, next to the light-mode rules it has to win over (an !important rule outside every layer loses to one inside)');
check(built.count >= 100, `${built.count} accent colours are covered`);

section('2. Every pale colour gets a readable one');
{
  const rules = [...css.matchAll(/\.((?:hover|focus|active|disabled|group-hover|placeholder)\\:)?text-([a-z]+)-(\d+)(?:\\\/(\d+))?[^{]*\{ color: (#[0-9a-f]{6}|color-mix\(in srgb, (#[0-9a-f]{6}) (\d+)%, transparent\)) !important/g)];
  const accentRules = rules.filter((m) => !/#1f1e1d/.test(m[0]));
  const noobRules = css.split('\n').filter((l) => /text-noob[^ ]* /.test(l) && /\{ color:/.test(l)).length;
  check(accentRules.length + noobRules === built.count, `${accentRules.length} accent rules and ${noobRules} text-noob rules read back`);
  let worstWhite = 99, worstTint = 99, worstName = '';
  for (const m of accentRules) {
    const hex = m[6] || m[5] || m[3] && null;
    const color = m[5] ? m[5] : m[0].match(/color: (#[0-9a-f]{6})/)[1];
    const alpha = m[7] ? Number(m[7]) / 100 : 1;
    const fg = blend(rgb(color), WHITE, alpha);
    const rW = ratio(fg, WHITE);
    const tint = blend(rgb(color), WHITE, 0.2);                       // the pale chip behind it: the same colour at 20%
    const rT = ratio(blend(rgb(color), tint, alpha), tint);
    if (alpha >= 0.7) { if (rW < worstWhite) { worstWhite = rW; worstName = m[0].slice(0, 60); } if (rT < worstTint) worstTint = rT; }
  }
  check(worstWhite >= 4.4, `full-strength accent text is at least 4.4:1 on white (worst ${worstWhite.toFixed(2)})`, worstName);
  check(worstTint >= 3.7, `and at least 3.7:1 on its own pale chip (worst ${worstTint.toFixed(2)})`);
}
check(G.deepOf('emerald', 300) === '#047857' && G.deepOf('amber', 200) === '#92400e' && G.deepOf('amber', 400) === '#b45309' && G.deepOf('purple', 100) === '#111111' && G.deepOf('cyan', 300) === '#111111', 'mint becomes deep green, pale amber a deep brown-gold, and the decorative hues (lilac, cyan...) near-black: the black-and-white look');
check(/\.text-emerald-300:not\(\.force-dark \*\):not\(\.media-dark \*\) \{ color: #047857 !important; \}/.test(css), 'for example text-emerald-300 is deep green in light mode');
check(/\.hover\\:text-/.test(css) && /group-hover\\:text-/.test(css), 'hover colours get the same treatment');
check(/:not\(\.force-dark \*\):not\(\.media-dark \*\)/.test(css) && !/\.text-emerald-300 \{/.test(css), 'and never inside the screens that are dark in both modes');

section('3. White stays white, dark stays dark, where it should');
check(/\.text-white\[class~="bg-indigo-600"\]/.test(css) && /\.text-white\[class~="bg-noob"\]/.test(css) && /\.text-white\[class\*="from-purple-500"\]/.test(css), 'white text stays white on solid colour buttons and gradients (indigo, violet, noob, purple ...)');
check(/\.text-white\[class~="bg-black\/60"\]/.test(css), 'and on dark translucent pills over pictures');
check(/\.text-slate-950:not/.test(css) && /\.text-zinc-900:not/.test(css), 'dark text on a bright yellow or white button stays dark (slate-950 would otherwise flip to white)');
check(/\.media-dark \[class~="from-black\/60"\] \{ --tw-gradient-from: color-mix\(in oklab, #000000 60%, transparent\)/.test(css), 'black fades over pictures stay black fades on the dark screens');

section('4. The dark screens');
const SCREENS = {
  'src/components/Reels/ReelsView.tsx': 2, 'src/components/Stories/StoryViewerModal.tsx': 1, 'src/components/Chat/InstantViewer.tsx': 1, 'src/components/Chat/InstantCamera.tsx': 2,
  'src/components/Chat/ChatCallModal.tsx': 1, 'src/components/LiveStream/LiveStreamView.tsx': 5, 'src/components/LiveStream/LiveLoungeRoomView.tsx': 1,
  'src/components/Feed/FeedVideoWatchView.tsx': 1, 'src/components/Videos/HomeVideoFeedView.tsx': 1, 'src/components/Common/QrScannerModal.tsx': 1, 'src/components/Common/AvatarAdjustEditor.tsx': 1
};
for (const [file, n] of Object.entries(SCREENS)) check((read(file).match(/\bmedia-dark\b/g) || []).length >= n, `${file.replace('src/components/', '')} is a dark screen in both modes`);
const idx = read('src/index.css');
check(/:root\[data-theme="light"\] \.media-dark \{[^}]*background-color: #000000 !important;[^}]*color: #ffffff !important;/.test(idx), 'in light mode a dark screen gets black behind and white text on top');
check(!/^\.media-dark/m.test(idx) && !/\n\.media-dark[^\n]*\{/.test(idx.replace(/:root\[data-theme="light"\] \.media-dark/g, '')), 'and nothing is changed for the dark theme (every rule is under the light theme)');
check(/@layer base \{\s*\n:root\[data-theme="light"\] \.media-dark \{/.test(idx), 'those rules are in @layer base too');
check(/:root\[data-theme="light"\] \.force-dark,\s*\n:root\[data-theme="light"\] \.media-dark \{[\s\S]*--color-slate-50: var\(--color-zinc-50\)/.test(idx), 'the other grey scales (slate, gray, neutral, stone) are re-derived inside the dark screens');

section('5. Nothing else moved');
const lightRules = css.split('\n').filter((l) => /^:root|^\.|^\[/.test(l) || /\{/.test(l));
check(css.split('\n').filter((l) => /\{/.test(l) && !/@layer/.test(l)).every((l) => /^:root\[data-theme="light"\]/.test(l.trim()) || /^[\s,]*:root\[data-theme="light"\]/.test(l)), 'every rule in the file is under :root[data-theme="light"]');
void lightRules;

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
