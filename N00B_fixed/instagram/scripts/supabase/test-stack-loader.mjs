// The loading screen: a burger made of social media that builds itself, layer by layer (src/components/Common/NoobStackLoader.tsx).
// When the app is OPENED the whole animation plays (after the opening splash, until the burger is finished); inside the app it is the quick version.
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

section('2. Opening the app: the whole show');
const layerMs = Number(/OPENING_LAYER_MS = (\d+)/.exec(src)[1]), hold = Number(/OPENING_HOLD_MS = (\d+)/.exec(src)[1]), quick = Number(/QUICK_LAYER_MS = (\d+)/.exec(src)[1]);
check(layerMs >= 350 && layerMs <= 700 && hold >= 500, `a layer lands every ${layerMs} ms and the finished burger is held ${hold} ms`);
check(/getElementById\('noob-splash'\)/.test(src) && /if \(!go \|\| reduce\) return;/.test(src) && /useState\(!opening \|\| splashGone\(\)\)/.test(src), 'the show starts only when the opening splash has gone, so none of it plays behind the splash');
check(/if \(!opening \|\| !go \|\| n < 6 \|\| !ready \|\| doneRef\.current\) return;/.test(src) && /onDoneRef\.current\?\.\(\)/.test(src), 'it hands over only when the burger is finished AND the app is ready (a slow app just waits with the finished burger)');
check(/n >= 6 && opening && !ready \? 'Almost ready…'/.test(src), 'and says "Almost ready…" while it waits');
check(/prefers-reduced-motion: reduce/.test(src) && /useState\(reduce \? 6 : 0\)/.test(src), 'with "reduce motion" the finished burger is just shown');
check(/clearTimeout/.test(src) && /alive = false/.test(src) && /clearInterval/.test(src), 'its timers are cleaned up');
check(/const \[openingDone, setOpeningDone\] = useState\(false\);/.test(app) && /if \(loading \|\| !openingDone\) \{/.test(app) && /mode=\{openingDone \? 'quick' : 'opening'\} ready=\{!loading\} onDone=\{\(\) => setOpeningDone\(true\)\}/.test(app), 'the app keeps the loading screen until the opening show is done, even if its data came sooner');

section('3. Inside the app: the quick version');
check(quick <= 100 && /mode = 'quick'/.test(src), `inside the app the whole burger is up in about ${quick * 6} ms, and that is the default`);
check(/\.nsl-fast \.nsl-in \{ animation-duration: \.2s; \}/.test(css) && /\$\{opening \? '' : 'nsl-fast'\}/.test(src), 'each layer just snaps in');
check(/mode=\{openingDone \? 'quick' : 'opening'\}/.test(app) && /<NoobStackLoader mode="quick" subtitle="Signing you in…" \/>/.test(auth), 'any loading screen after the opening (signing in again, the Google / Facebook / Discord check) is the quick one');

section('4. The motion (CSS)');
check(/@keyframes nsl-drop \{ 0% \{ opacity: 0; transform: translateY\(-150px\); \}/.test(css) && /\.nsl-in \{ animation: nsl-drop \.55s cubic-bezier\(\.3, 1\.5, \.5, 1\) both; \}/.test(css), 'each layer drops in with a little bounce');
check(!/nsl-leaving|nsl-out/.test(css + src), 'the finished burger stays (it no longer lifts away and rebuilds)');
check(!/border-t-transparent animate-spin mb-4/.test(app), 'the old spinner is gone from the main loading screen');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
