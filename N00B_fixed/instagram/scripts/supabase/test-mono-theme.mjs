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
check(/--page: #0a0a0a;/.test(dark) && /--color-zinc-900: #000000;/.test(dark) && /--color-zinc-50: #ffffff;/.test(dark) && /--color-zinc-400: #d2d2d2;/.test(dark), 'dark: #0a0a0a page, pure black cards, white text, #d2d2d2 muted text (crisp, not faded)');
check(/--color-noob: #ffffff;/.test(dark), 'dark: the accent is white');
const light = block(':root[data-theme="light"]');
check(/--page: #ffffff;/.test(light) && /--color-noob: #0a0a0a;/.test(light) && /--color-zinc-50: #000000;/.test(light), 'light: white page, black accent and text (the same palette, flipped)');
check(/--outline: rgba\(255, 255, 255, \.55\);/.test(css) && /--divider: rgba\(255, 255, 255, \.2\);/.test(css) && /--on-accent: #0a0a0a;/.test(css) && /--radius-2xl: 0\.75rem;/.test(css), 'outlines are a bright white edge, hairlines a softer one, text on the accent #0a0a0a, cards 12px');
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
check((css.match(/--doodle-feed: url\(/g) || []).length === 3 && /\.doodle-wallpaper-feed \{\s*background-color: var\(--page\);\s*background-image: var\(--doodle-feed\);\s*background-size: 160px 160px;/.test(css), 'Home has its own denser wallpaper of small doodles (dark, light and dark-in-light)');
check(/className="doodle-wallpaper-feed w-full flex flex-col items-center pb-24/.test(read('src/components/Feed/FeedView.tsx')), 'and the Home page uses it');
const lightSrc = read('src/lightAccents.css');
check(!/#c6613f/.test(lightSrc) && /text-cyan-300[^}]*#111111/.test(lightSrc), 'in light mode the accent and the decorative hues come out black');
const buttons = read('src/components/Auth/AuthView.tsx');
check(!/from-noob to-noob-strong[^"'`]*text-white/.test(buttons), 'no white-on-white accent button on the sign-in screens');

section('5. Crisp, not faded');
check(/\[class~="bg-zinc-900\/40"\][\s\S]*?background-color: color-mix\(in srgb, var\(--color-zinc-900\) 97%, transparent\);/.test(css), 'see-through zinc cards and bars are solid black cards now');
check(/\.liquid-glass,\s*:root\[data-theme="light"\] \.liquid-glass \{\s*background: var\(--color-zinc-900\);\s*backdrop-filter: none;/.test(css) && /\.liquid-glass::before \{ display: none; \}/.test(css), 'the bottom bar is a black card with a white edge, not frosted glass');
check(/\.nav-marker \{\s*background: #ffffff;/.test(css) && /:root:not\(\[data-theme="light"\]\) #floating-bottom-nav \.text-noob \{ color: #000000; \}/.test(css) && /:root\[data-theme="light"\] \.nav-marker \{\s*background: var\(--color-zinc-800\);/.test(css), 'the open page in the bar: black text on a white pill (a grey pill with a black edge in Light mode)');
const post = read('src/components/Feed/PostCard.tsx');
check(/className="w-full bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden mb-4 shadow-xl transition-all"/.test(post), 'a post is a solid black card with a bright edge');

section('5b. The sign-in page has the same small doodles as Home, more of them');
check((css.match(/--doodle-login: url\(/g) || []).length === 3 && /\.doodle-wallpaper-login \{\s*background-color: var\(--page\);\s*background-image: var\(--doodle-login\);\s*background-size: 120px 120px;/.test(css), 'a 120-px tile of the same doodles (Home uses 160 px): about 1.8 times as many, at the same size');
const feedTile = decodeURIComponent((/--doodle-feed: url\("data:image\/svg\+xml,([^"]*)"\)/.exec(css) || [])[1] || '');
const loginTile = decodeURIComponent((/--doodle-login: url\("data:image\/svg\+xml,([^"]*)"\)/.exec(css) || [])[1] || '');
check((feedTile.match(/<path /g) || []).length === (loginTile.match(/<path /g) || []).length && (feedTile.match(/<path /g) || []).length >= 16 && /stroke-width='1\.4'/.test(loginTile), 'the same sixteen doodles, drawn at the same size and line weight');
check(/className="doodle-wallpaper-login min-h-screen w-full text-white flex flex-col justify-between/.test(read('src/components/Auth/AuthView.tsx')), 'and the sign-in page uses it');

section('6. Names on a post can be seen to be tappable, and open a profile at once');
const UL = 'underline decoration-1 underline-offset-[3px] decoration-zinc-50/70';
check((post.match(new RegExp(UL.replace(/[[\]/.]/g, '\\$&'), 'g')) || []).length >= 3, 'the name, a co-author and the username under the picture are always underlined (the @handle is shown once, under the picture)');
check(/const known = allUsers\.find\(\(u\) => u\.id === userId\);\s*if \(known\) \{\s*onNavigateToProfile\(known\);/.test(post), 'tapping a name opens the profile AT ONCE with what the app already knows');
check(/fetchUserById\(userId\)\.then\(\(fresh\) => \{ if \(fresh\) onNavigateToProfile\(fresh, true\); \}\)/.test(post), 'and the newest details are fetched quietly and swapped in');
const app2 = read('src/App.tsx');
check(/const handleNavigateToUserProfile = \(user: User, isUpdate = false\) => \{\s*[\s\S]{0,200}if \(isUpdate\) \{\s*pageLayers\.update\(user\);\s*return;/.test(app2), 'the quiet update changes only that profile (not the page, not the scroll)');
check(/<React\.Suspense fallback=\{<ProfileSkeleton user=\{viewing \|\| currentUser\} \/>\}><ProfileView/.test(app2) && /const ProfileSkeleton: React\.FC/.test(app2), 'while the profile page arrives, the person is shown (picture, name, @handle), never an empty black screen');
const lazy = read('src/utils/lazyTab.tsx');
check(/Date\.now\(\) - last < 60_000/.test(lazy) && /navigator\.onLine === false/.test(lazy) && /reloadForNewVersion\(\); throw e;/.test(lazy), 'a page file that no longer exists (an old copy of the app) gets the new version once - never a loop, never while offline');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
