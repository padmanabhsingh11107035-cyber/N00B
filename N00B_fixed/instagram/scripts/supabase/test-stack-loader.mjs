// The loading screen: a burger made of social media that builds itself, layer by layer (src/components/Common/NoobStackLoader.tsx).
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

section('2. The timing');
const layerMs = Number(/const LAYER_MS = (\d+)/.exec(src)[1]), hold = Number(/const HOLD_MS = (\d+)/.exec(src)[1]), leave = Number(/const LEAVE_MS = (\d+)/.exec(src)[1]);
check(layerMs >= 350 && layerMs <= 700 && hold >= 1000 && leave >= 300, `a layer lands every ${layerMs} ms, the finished stack is held ${hold} ms and lifts away in ${leave} ms`);
check(/at\(250 \+ 6 \* LAYER_MS \+ HOLD_MS \+ LEAVE_MS, run\)/.test(src) && /setN\(0\)/.test(src) && /setLeaving\(false\)/.test(src), 'it clears completely, then builds again');
check(/clearTimeout\(t\)/.test(src) && /alive = false/.test(src), 'its timers are cleaned up when the app is ready');
check(/prefers-reduced-motion: reduce/.test(src) && /useState\(reduce \? 6 : 0\)/.test(src) && /@media \(prefers-reduced-motion: reduce\) \{ \.nsl-in/.test(css), 'with "reduce motion" the finished burger is just shown');

section('3. The motion (CSS) and where it is used');
check(/@keyframes nsl-drop \{ 0% \{ opacity: 0; transform: translateY\(-150px\); \}/.test(css) && /\.nsl-in \{ animation: nsl-drop \.55s cubic-bezier\(\.3, 1\.5, \.5, 1\) both; \}/.test(css) && /\.nsl-leaving \.nsl-in \{ animation: nsl-out/.test(css), 'each layer drops in with a little bounce, and they lift away together');
check(/<NoobStackLoader \/>/.test(app) && /doodle-wallpaper-feed w-full h-screen flex flex-col items-center justify-center text-white/.test(app), 'it is the loading screen of the app (on the doodle wallpaper)');
check(/<NoobStackLoader subtitle="Signing you in…" \/>/.test(auth), 'and the "signing you in" screen after Google / Facebook / Discord');
check(!/border-t-transparent animate-spin mb-4/.test(app), 'the old spinner is gone from the main loading screen');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
