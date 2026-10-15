// The black-and-white doodle look (src/index.css): one palette of near-black, #161616 cards, #4a4a4a outlines, white text and a WHITE accent (black in Light mode),
// pill buttons, doodle wallpaper and doodle pop-ups. Usage: node scripts/supabase/test-mono-theme.mjs
import fs from 'node:fs';
import path from 'node:path';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const css = read('src/index.css');
const block = (sel) => { const i = css.indexOf(sel + ' {'); return i < 0 ? '' : css.slice(i, css.indexOf('\n}', i)); };

section('1. The palette');
const dark = block(':root,\n.force-dark');
check(/--page: #0a0a0a;/.test(dark) && /--color-zinc-900: #161616;/.test(dark) && /--color-zinc-950: #0a0a0a;/.test(dark) && /--color-zinc-50: #ffffff;/.test(dark) && /--color-zinc-400: #b8b8b8;/.test(dark), 'dark: #0a0a0a page, #161616 cards, white text, #b8b8b8 muted text');
check(/--color-noob: #ffffff;/.test(dark), 'dark: the accent is white');
const light = block(':root[data-theme="light"]');
check(/--page: #ffffff;/.test(light) && /--color-noob: #0a0a0a;/.test(light) && /--color-zinc-50: #0a0a0a;/.test(light), 'light: white page, black accent and text (the same palette, flipped)');
check(/--outline: #4a4a4a;/.test(css) && /--on-accent: #0a0a0a;/.test(css) && /--radius-2xl: 0\.75rem;/.test(css), 'outlines #4a4a4a, text on the accent #0a0a0a, cards 12px');
check(!/#d97757|#c6613f|217, ?119, ?87/i.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'no orange left in the stylesheet');
check(/html \{ background-color: #0a0a0a; \}/.test(css), 'the strip above the app on a phone is near-black, not orange');

section('2. Nothing orange is left in the app');
const walk = (d, out = []) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p, out); else if (/\.(tsx|ts|css|html|json|js)$/.test(f.name)) out.push(p); } return out; };
const hits = [...walk('src'), 'index.html', 'public/theme-init.js', 'public/manifest.json'].filter((p) => /#d97757|rgba?\(\s*217\s*,\s*119\s*,\s*87/i.test(read(p)) && !/ChatView\.tsx$/.test(p));
check(hits.length === 0, 'no file still draws the old orange (#d97757)', hits.join(', '));
check(/theme-color" content="#0a0a0a"/.test(read('index.html')) && /"theme_color": "#0a0a0a"/.test(read('public/manifest.json')) && /'#0a0a0a' : '#ffffff'/.test(read('public/theme-init.js')) && /'#0a0a0a' : '#ffffff'/.test(read('src/utils/theme.ts')), 'the phone / browser bar colour follows the theme: near-black in Dark, white in Light');
check(/oldAccent\(activeChat\?\.themeColor\)/.test(read('src/components/Chat/ChatView.tsx')) && /toLowerCase\(\) === '#d97757'/.test(read('src/components/Chat/ChatView.tsx')), 'a chat colour saved in the old orange shows as white');

section('3. The decorative hues are black-and-white');
for (const hue of ['cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'teal']) check(new RegExp(`--color-${hue}-400: var\\(--color-zinc-50\\);`).test(css) && new RegExp(`--color-${hue}-500: var\\(--color-zinc-600\\);`).test(css), `${hue} reads the grey scale`);
check(!/--color-(red|amber|green|emerald|pink|orange|yellow)-\d+: var\(--color-zinc/.test(css), 'red, amber, green, emerald, pink, orange and yellow keep their colour (errors, warnings, success, likes)');

section('4. The doodle look');
check(/body, \.doodle-wallpaper \{\s*background-image: var\(--doodle-wall\);/.test(css), 'a doodle wallpaper behind the pages');
check(/\[class~="fixed"\] \[class~="rounded-3xl"\]\[class\*="bg-zinc-9"\]/.test(css) && /outline: 1px dashed rgba\(var\(--doodle-rgb\), \.30\);/.test(css) && /background-image: var\(--doodle-corners\);/.test(css), 'every pop-up and sheet: dashed stitched edge and a doodle in each corner');
check(/button\.bg-noob, a\.bg-noob, \[role="button"\]\.bg-noob,\s*button\[class\*="from-noob"\], a\[class\*="from-noob"\] \{\s*border-radius: 9999px;/.test(css), 'accent buttons are full pills');
check(/\[class~="border-zinc-800"\]:not\(:hover\):not\(:focus-within\)/.test(css) && /border-color: var\(--outline\);/.test(css), 'card outlines are the visible grey');
check(/h1, h2 \{\s*font-family: inherit;/.test(css), 'titles use the same bold sans (no serif)');
const lightSrc = read('src/lightAccents.css');
check(!/#c6613f/.test(lightSrc) && /text-cyan-300[^}]*#111111/.test(lightSrc), 'in light mode the accent and the decorative hues come out black');
const buttons = read('src/components/Auth/AuthView.tsx');
check(!/from-noob to-noob-strong[^"'`]*text-white/.test(buttons), 'no white-on-white accent button on the sign-in screens');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
