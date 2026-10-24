// The loading screen: a burger made of social media that builds itself, layer by layer (src/components/Common/NoobStackLoader.tsx).
// It is the loading page of the whole app and it is quick; opening the app has no burger show (the opening animation plays and the app opens straight out of it).
// Usage: node scripts/supabase/test-stack-loader.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const src = read('src/components/Common/NoobStackLoader.tsx');
const css = read('src/index.css');
const app = read('src/App.tsx');
const auth = read('src/components/Auth/AuthView.tsx');

section('1. The burger');
const layers = [...src.matchAll(/\{L\((\d), <>/g)].map((m) => Number(m[1]));
check(layers.join(',') === '1,2,3,4,5,6', 'six layers, built from the bottom up: chat bar, likes, comment, photo, profile header, NOOB bun', layers.join(','));
check(/Setting up your chats/.test(src) && /Counting the likes/.test(src) && /Writing the comments/.test(src) && /Hanging the photos/.test(src) && /Meeting your people/.test(src) && /Toasting the NOOB bun/.test(src), 'each layer has its own line of text, in the same order');
check(/>NOOB<\/text>/.test(src) && /stroke="currentColor"/.test(src) && !/#[0-9a-fA-F]{3,6}/.test(src.replace(/<!--[\s\S]*?-->/g, '')), 'drawn in the theme colour (white on black, black on white), no colour of its own');

section('2. Opening the app: no show of its own');
check(!/opening|OPENING|noob-splash|splashGone|onDone|ready/.test(src.replace(/\/\/.*$/gm, '')), 'the loader has no opening mode any more: it does not wait for the splash and does not hold the app back');
check(/const \[loading, setLoading\] = useState\(true\);/.test(app) && /if \(loading\) \{/.test(app) && !/openingDone/.test(app) && /<NoobStackLoader mode="quick" \/>/.test(app), 'the app shows the loading page only while it is really loading, and opens directly when it is ready (the opening animation comes first)');
check(/prefers-reduced-motion: reduce/.test(src) && /useState\(reduce \? 6 : 0\)/.test(src), 'with "reduce motion" the finished burger is just shown');
check(/clearTimeout/.test(src) && /alive = false/.test(src), 'its timers are cleaned up');

section('3. The loading page of the whole app: the quick version');
const quick = Number(/QUICK_LAYER_MS = (\d+)/.exec(src)[1]);
check(quick <= 100, `the whole burger is up in about ${quick * 6} ms`);
check(/\.nsl-fast \.nsl-in \{ animation-duration: \.2s; \}/.test(css) && /nsl-fast/.test(src), 'each layer just snaps in');
check(/<NoobStackLoader mode="quick" subtitle="Signing you in…" \/>/.test(auth), 'any loading screen after the opening (signing in again, the Google / Facebook / Discord check) is the same one');

section('4. The motion (CSS)');
check(/@keyframes nsl-drop \{ 0% \{ opacity: 0; transform: translateY\(-150px\); \}/.test(css) && /\.nsl-in \{ animation: nsl-drop \.55s cubic-bezier\(\.3, 1\.5, \.5, 1\) both; \}/.test(css), 'each layer drops in with a little bounce');
check(!/nsl-leaving|nsl-out/.test(css + src), 'the finished burger stays (it no longer lifts away and rebuilds)');
check(!/border-t-transparent animate-spin mb-4/.test(app), 'the old spinner is gone from the main loading screen');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
