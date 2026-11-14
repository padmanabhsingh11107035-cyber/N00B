// THE OPENING SCREEN IS YELLOW (the owner asked for it on 2026-11-14): whenever the app is opened it first shows a full-screen yellow (#F8CB46) screen with the NOOB logo and NO words,
// from the top edge (behind the notch / camera / status bar) to the bottom edge (behind the home bar / navigation bar), on Android and iOS. The old black pen animation and its sound are gone.
// Usage: node scripts/supabase/test-yellow-splash.mjs
import fs from 'node:fs';
import vm from 'node:vm';

let passed = 0, failed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r/g, '');
const html = read('index.html');
const box = html.slice(html.indexOf('<div id="noob-splash"'), html.indexOf('<script src="/editor-init.js">'));

console.log('The splash in index.html');
check(/#noob-splash \{[^}]*background: #F8CB46/.test(box), 'its colour is yellow #F8CB46');
check(/#noob-splash \{[^}]*position: fixed; top: 0; left: 0; right: 0; bottom: 0;[^}]*height: 100vh; height: 100lvh;/.test(box), 'it covers the whole screen: fixed, top/left/right/bottom 0, height 100vh with an lvh upgrade');
check(/html\.ns-on, html\.ns-on body \{ background: #F8CB46 !important; \}/.test(html), 'the page itself is yellow while it shows (no black or white band can appear above or below)');
const textNodes = box.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim();
check(textNodes === '' && !/<text[\s>]|<tspan/.test(box), 'no text in the splash (only the logo)');
check(/min\(62vw, 380px\)/.test(box), 'the logo is 62% of the width, 380 px at most');
check(/prefers-reduced-motion: reduce\) \{ #noob-splash svg, #noob-splash \.ns-eye/.test(box), 'static with reduced motion');
check(!/box-shadow|text-shadow|glow/.test(box.replace(/<!--[\s\S]*?-->/g, '')), 'no glow and no box');
check(fs.existsSync('public/brand/noob-splash-logo.svg') && fs.existsSync('public/brand/noob-splash-logo-1024.png'), 'the logo is a vector file and a transparent PNG in public/brand');
check(box.includes(read('public/brand/noob-splash-logo.svg').match(/<path d="M163.5[^"]*"/)[0]), 'the inline logo is the one in public/brand/noob-splash-logo.svg');
check(html.indexOf('/splash.js') > html.indexOf('/theme-init.js') && html.indexOf('/splash.js') < html.indexOf('</head>'), 'splash.js runs in the head, after theme-init.js');
check(/<script src="\/editor-init\.js"><\/script>/.test(html) && !/<script>/.test(html), 'no script is written inside the page (security policy)');
check(/viewport-fit=cover/.test(read('public/theme-init.js')) && /black-translucent/.test(html), 'iPhone home-screen app: black-translucent bar (page under the status bar), viewport-fit=cover added by theme-init on phones');

console.log('The old animation is gone');
check(!fs.existsSync('public/opening') && !/opening\/|__noobOpening|opening\.js|opening-data/.test(html + read('src/main.tsx') + read('public/sw.js') + read('public/_headers')), 'public/opening deleted and nothing refers to it');

console.log('Launch pictures for iOS');
const links = [...html.matchAll(/<link rel="apple-touch-startup-image" href="(\/launch\/[^"]+)" media="\(device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d)\) and \(orientation: portrait\)" \/>/g)];
check(links.length >= 11, `${links.length} apple-touch-startup-image tags`);
let sizesOk = true;
for (const [, href, cw, ch, r] of links) {
  const f = 'public' + href;
  if (!fs.existsSync(f)) { sizesOk = false; console.log('   missing', f); continue; }
  const b = fs.readFileSync(f);
  if (b.readUInt32BE(16) !== cw * r || b.readUInt32BE(20) !== ch * r || b.length > 120 * 1024) { sizesOk = false; console.log('   wrong', f, b.length); }
}
check(sizesOk, 'every tag has its file, with exactly width x ratio by height x ratio pixels, under 120 KB');
for (const [w, h] of [[1290, 2796], [1179, 2556], [1284, 2778], [1170, 2532], [1125, 2436], [1242, 2688], [828, 1792], [1242, 2208], [750, 1334], [1320, 2868], [1206, 2622]]) {
  check(links.some((l) => l[1] === `/launch/launch-${w}x${h}.png`), `iPhone ${w}x${h}`);
}
check(/apple-mobile-web-app-capable" content="yes"/.test(html), 'apple-mobile-web-app-capable yes');
const headers = read('public/_headers');
const rules = (headers.match(/^\//gm) || []).length;
check(/\/launch\/\*\n  Cache-Control/.test(headers) && rules <= 100, `_headers has a /launch/* rule and at most 100 rules (${rules})`);

console.log('Android');
const man = JSON.parse(read('public/manifest.json'));
check(man.background_color === '#F8CB46' && man.theme_color === '#F8CB46', 'manifest background and launch colour are yellow');
const res = 'android/app/src/main/res/';
check(/#F8CB46/i.test(read('capacitor.config.json')) && /noob_yellow">#F8CB46/.test(read(res + 'values/colors_noob.xml')), 'capacitor.config.json and colors: yellow');
const styles = read(res + 'values/styles.xml') + read(res + 'values-v27/styles.xml');
check(/windowSplashScreenBackground">@color\/noob_yellow/.test(styles) && /windowSplashScreenAnimatedIcon">@drawable\/splash_logo/.test(styles) && /windowLayoutInDisplayCutoutMode">shortEdges/.test(styles), 'Android 12+ launch screen: yellow, logo icon, drawn under the cut-out');
check(fs.existsSync(res + 'drawable/splash_logo.xml') && fs.existsSync(res + 'drawable/splash_yellow.xml') && !/<text/.test(read(res + 'drawable/splash_logo.xml')), 'launch drawables exist, no text');

console.log('Timing and hand-over (public/splash.js)');
const code = read('public/splash.js');
check(/MIN_MS = 1100, MAX_MS = 1800, FADE_MS = 250/.test(code) && /#F8CB46/.test(code), 'at least 1.1 s, at most 1.8 s, fade 250 ms');
check(/__noobSplash\?\.ready\(\)/.test(read('src/App.tsx')) && /noobSplash\?\.ready\(\)/.test(read('src/main.tsx')) && /noob-splash-end/.test(read('src/utils/statusStrip.ts')) && /__noobSplash\?: \{ active\?: boolean/.test(read('src/utils/statusStrip.ts')), 'the app tells the splash when it is ready; the strip waits for it and repaints after');
check(/__noobSplash\.cancel/.test(read('public/editor-init.js')), 'NOOB Studio keeps its own black screen');

// splash.js against a fake page and a fake clock
function world() {
  const timers = []; const w = { now: 0, op: '', classes: new Set(), meta: '#0a0a0a', removed: false, events: [] };
  const el = { style: { set opacity(v) { w.op = v; }, get opacity() { return w.op; } }, parentNode: { removeChild() { w.removed = true; } } };
  const meta = { getAttribute: () => w.meta, setAttribute: (_, v) => { w.meta = v; } };
  const win = { setTimeout: (f, ms) => { timers.push({ f, at: w.now + ms }); return timers.length; }, clearTimeout: (i) => { if (timers[i - 1]) timers[i - 1].dead = true; }, dispatchEvent: (e) => { w.events.push(e.type); }, Event: class { constructor(t) { this.type = t; } } };
  const document = { documentElement: { classList: { add: (c) => w.classes.add(c), remove: (c) => w.classes.delete(c) } }, querySelector: () => meta, head: {}, getElementById: (id) => (id === 'noob-splash' ? el : null), createElement: () => meta };
  vm.runInNewContext(code, { window: win, document, Date: { now: () => w.now }, Event: win.Event, setTimeout: win.setTimeout, clearTimeout: win.clearTimeout });
  w.tick = (to) => { for (;;) { const t = timers.filter((x) => !x.dead && x.at <= to).sort((a, b) => a.at - b.at)[0]; if (!t) break; t.dead = true; w.now = t.at; t.f(); } w.now = to; };
  w.api = win.__noobSplash;
  return w;
}
const fadeStart = (readyAt) => { for (let ms = 0; ms <= 4300; ms += 10) { const w = world(); if (readyAt !== null) { w.tick(Math.min(readyAt, ms)); if (ms >= readyAt) w.api.ready(); } w.tick(ms); if (w.op === '0') return ms; } return -1; };
for (const [name, at] of [['app ready at 0.2 s', 200], ['app ready at 1.5 s', 1500], ['app never ready', null]]) {
  const w = world();
  check(w.classes.has('ns-on') && w.meta === '#F8CB46', `${name}: yellow page and theme colour from the first moment`);
  if (at !== null) { w.tick(at); w.api.ready(); }
  w.tick(4400);
  check(w.removed && w.classes.size === 0 && w.meta === '#0a0a0a' && w.events.includes('noob-splash-end') && w.api.active === false, `${name}: removed, page colour and theme colour put back, end event sent`);
}
const a = fadeStart(200), b = fadeStart(1500), c = fadeStart(null);
check(a >= 1100 && a <= 1130, `ready early: it still stays 1.1 s (fade starts at ${a} ms)`);
check(b >= 1500 && b <= 1530, `ready at 1.5 s: it goes right then (fade starts at ${b} ms)`);
check(c >= 1800 && c <= 1830, `never ready: it goes at 1.8 s (fade starts at ${c} ms)`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
