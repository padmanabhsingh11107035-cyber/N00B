// The opening animation (public/opening): a pen draws NOOB on a canvas, the camera dives into an eye and the app opens like an iris. It replaces the logo splash of index.html; the logo splash stays
// for reduced motion, the coaching / editor addresses and a missing script. Usage: node scripts/supabase/test-opening.mjs
import fs from 'node:fs';
import vm from 'node:vm';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const NAME = new RegExp(['ma', 'nus'].join(''), 'i');

const html = read('index.html'), main = read('src/main.tsx'), loader = read('src/components/Common/NoobStackLoader.tsx'), headers = read('public/_headers');
const code = read('public/opening/opening.js'), data = read('public/opening/opening-data.js');

section('1. The page loads it, in the right place');
const iData = html.indexOf('<script src="/opening/opening-data.js?v='), iCode = html.indexOf('<script src="/opening/opening.js?v=');
check(iData > 0 && iCode > iData, 'the shapes come before the animation');
check(html.indexOf('/coaching-init.js') < iData && html.indexOf('/editor-init.js') < iData && html.indexOf('id="noob-splash"') < html.indexOf('/coaching-init.js'), 'both come after the splash and after the two scripts that give the coaching / editor addresses their own opening screen');
check(!/<script>\s*\(function/.test(html) && !/<script>[^<]*opening/.test(html), 'no script is written inside the page (the security policy does not allow it)');
check(/#noob-splash img \{ display: none; \}/.test(html) && /#noob-splash\.logo img \{ display: block;/.test(html), 'the splash has no logo (no glow, nothing before the animation); only an address that asks for it shows one');
check(/splash\.className = 'logo'/.test(read('public/coaching-init.js')) && /splash\.className = 'logo'/.test(read('public/editor-init.js')), 'the coaching (NOOB STUDY) and editor (Studio) addresses ask for their logo');
check(/\/opening\/\*\n  Cache-Control: public, max-age=31536000, immutable/.test(headers) && /opening\.mp3\?v=2/.test(code) && /opening\.js\?v=3/.test(html), 'the files are kept for a year, their address carries a version number');

section('2. The app opens straight out of it');
check(/__noobOpening\?: unknown/.test(main) && /if \(splash && !\(window as unknown as \{ __noobOpening\?: unknown \}\)\.__noobOpening\)/.test(main), 'src/main.tsx leaves the splash to the animation when it is running (and removes it as before when it is not)');
check(!/noob-splash|opening/.test(loader.replace(/\/\/.*$/gm, '')) && /if \(loading\) \{/.test(read('src/App.tsx')) && !/openingDone/.test(read('src/App.tsx')), 'the app opens straight out of the animation: the burger is only the loading page (shown while the app is really loading), with no show of its own');
check(/window\.__splashSeconds\) return/.test(code) && /prefers-reduced-motion: reduce/.test(code), 'it stays out of the way on the coaching / editor addresses and for reduced motion');
check(/window\.setTimeout\(function \(\) \{ if \(!over\) finish\(\); \}, \(T \+ 0\.5\) \* 1000\)/.test(code), 'a page that gets no animation frames (a tab in the background) still has its splash removed');

section('3. It plays (the real code, run against a stand-in canvas)');
const calls = { fill: 0, stroke: 0, arc: 0, ellipse: 0 };
let badNumber = null;
const num = (n, args) => { for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) badNumber = badNumber || `${n}(${args.join(', ')})`; };
const ctx = new Proxy({}, {
  get: (t, k) => {
    if (k in t) return t[k];
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    return (...a) => { num(String(k), a); if (k in calls) calls[k]++; };
  },
  set: (t, k, v) => { t[k] = v; return true; },
});
const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx, setAttribute() {} };
let splashRemoved = false;
const splash = { parentNode: { removeChild() { splashRemoved = true; splash.parentNode = null; } }, style: {}, appendChild(c) { splash.canvas = c; }, querySelector: () => ({ style: {} }) };
let now = 100;
const timers = [];
const frames = [];
const sandbox = {
  window: null, document: { getElementById: (id) => (id === 'noob-splash' ? splash : null), createElement: () => canvas },
  performance: { now: () => now }, Path2D: class { moveTo() {} quadraticCurveTo() {} closePath() {} },
  Audio: class { constructor() { this.volume = 1; } addEventListener() {} play() { return Promise.resolve(); } },
  requestAnimationFrame: (f) => { frames.push(f); return frames.length; }, cancelAnimationFrame() {},
  Math, Number, Array, Object, Promise,
};
sandbox.window = Object.assign(sandbox, { innerWidth: 390, innerHeight: 844, devicePixelRatio: 3, matchMedia: () => ({ matches: false }), setTimeout: (f, ms) => { timers.push([f, ms]); return timers.length; } });
vm.createContext(sandbox);
vm.runInContext(data, sandbox);
vm.runInContext(code, sandbox);
const api = sandbox.__noobOpening;
check(!!api && api.duration === 4 && canvas.width === 780 && canvas.height === 1688, 'it starts at once, on a canvas the size of the screen (at most 2 pixels per pixel)');
check(timers.length === 1 && timers[0][1] === 4500, 'and sets its safety timer');
let removedAt = null;
for (let i = 1; i <= 240 && !splashRemoved; i++) {
  now = 100 + (i / 60) * 1000;
  const f = frames.pop();
  if (f) f();
  if (removedAt === null && splashRemoved) removedAt = i / 60;
}
check(splashRemoved && frames.length === 0, 'it runs to the end by itself and removes the splash');
check(removedAt !== null && removedAt >= 3.95 && removedAt <= 4.05, `the splash goes at ${removedAt?.toFixed(2)} s, when the iris is wide open`);
check(badNumber === null, 'every number given to the canvas is a real number (none is NaN or infinite)', badNumber || '');
check(calls.fill > 500 && calls.stroke > 100 && calls.arc > 300 && calls.ellipse > 50, `it drew ${calls.fill} fills, ${calls.stroke} strokes, ${calls.arc} arcs, ${calls.ellipse} ellipses over the 4 seconds`);
// every frame of the animation, including the ones it never reaches at 60 fps, in a small and a wide window
for (const [w, h, dpr] of [[390, 844, 3], [1280, 720, 1], [820, 1180, 2], [360, 640, 1]]) {
  sandbox.window.innerWidth = w; sandbox.window.innerHeight = h; sandbox.devicePixelRatio = dpr; sandbox.window.devicePixelRatio = dpr;
  badNumber = null; let thrown = null;
  try { for (let i = 0; i <= 240; i++) api.renderAt(i / 60); api.renderAt(3.999); } catch (e) { thrown = e; }
  check(!thrown && badNumber === null, `every frame draws without an error at ${w} x ${h}`, String(thrown || badNumber || ''));
}

section('3b. The sound where the browser refuses it (an iPhone, a phone\'s browser tab)');
{
  const listeners = {}, plays = [], created = [];
  let refuse = true, removedListeners = 0, splashGone = false, now2 = 100;
  const frames2 = [];
  const canvas2 = { width: 0, height: 0, style: {}, getContext: () => ctx, setAttribute() {} };
  const splash2 = { parentNode: { removeChild() { splashGone = true; splash2.parentNode = null; } }, style: {}, appendChild(c) { created.push(c); c.parentNode = splash2; }, removeChild(c) { c.parentNode = null; }, querySelector: () => ({ style: {} }) };
  const sb = {
    window: null,
    document: {
      getElementById: (id) => (id === 'noob-splash' ? splash2 : null),
      createElement: (tag) => (tag === 'canvas' ? canvas2 : { style: {}, setAttribute() {}, set innerHTML(v) { this.html = v; }, get innerHTML() { return this.html; } }),
      addEventListener: (n, f) => { listeners[n] = f; }, removeEventListener: (n, f) => { if (listeners[n] === f) { delete listeners[n]; removedListeners++; } },
    },
    performance: { now: () => now2 }, Path2D: class { moveTo() {} quadraticCurveTo() {} closePath() {} },
    Audio: class { constructor() { this.volume = 1; this.readyState = 4; this.currentTime = 0; } play() { plays.push(this.currentTime); return refuse ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve(); } },
    requestAnimationFrame: (f) => { frames2.push(f); return frames2.length; }, cancelAnimationFrame() {}, Math, Number, Array, Object, Promise,
  };
  sb.window = Object.assign(sb, { innerWidth: 390, innerHeight: 844, devicePixelRatio: 3, matchMedia: () => ({ matches: false }), setTimeout: () => 1, clearTimeout() {} });
  vm.createContext(sb);
  vm.runInContext(data, sb);
  vm.runInContext(code, sb);
  await new Promise((r) => setTimeout(r, 0));
  const pill = created.find((c) => c !== canvas2);
  check(plays.length === 1 && !!pill && /Tap for sound/.test(pill.innerHTML || ''), 'it tries the sound at once; when the browser says no, a small "Tap for sound" shows and the picture goes on');
  check(['touchend', 'pointerup', 'click', 'keydown'].every((n) => typeof listeners[n] === 'function'), 'the first touch (finger lifted, click or key) is waited for, anywhere on the screen');
  now2 = 100 + 1500;   // the picture is 1.5 seconds on
  listeners.touchend();   // refused again: it keeps waiting
  await new Promise((r) => setTimeout(r, 0));
  check(plays.length === 2 && Math.abs(plays[1] - 1.5) < 0.01 && !!listeners.touchend, 'a touch starts the sound at the place the picture has reached (1.5 s); if the browser still refuses, it waits for the next touch');
  refuse = false;
  now2 = 100 + 1800;
  listeners.click();
  await new Promise((r) => setTimeout(r, 0));
  check(plays.length === 3 && Math.abs(plays[2] - 1.8) < 0.01, 'the next touch works, at 1.8 s');
  check(Object.keys(listeners).length === 0 && removedListeners === 4 && splash2.parentNode !== null, 'and then it stops listening and the "Tap for sound" goes');
}

section('4. The drawn shapes and the sound');
const shapes = (() => { const s = { window: {} }; vm.createContext(s); vm.runInContext(data, s); return s.window.__NOOB_OPENING_DATA; })();
check(shapes.N.length === 1 && shapes.B.length === 3 && shapes.doodles.length === 13, 'N has 1 outline, B has 3 (the letter and its two holes), and there are 13 doodles');
check([...shapes.N, ...shapes.B].every((c) => c.length > 40 && c.length % 2 === 0 && c.every(Number.isFinite)), 'every outline is a list of points');
check(fs.statSync('public/opening/opening.mp3').size > 20000 && fs.statSync('public/opening/opening.mp3').size < 120000, `the sound is a small file (${Math.round(fs.statSync('public/opening/opening.mp3').size / 1024)} KB)`);
const total = ['opening.js', 'opening-data.js', 'opening.mp3'].reduce((n, f) => n + fs.statSync('public/opening/' + f).size, 0);
check(total < 100 * 1024, `all of it is ${Math.round(total / 1024)} KB`);

section('5. Nothing in it names where anything came from, and the source is in the repository');
check(![code, data, html.slice(iData, iCode + 80)].some((s) => NAME.test(s)) && !NAME.test(fs.readFileSync('../promo/opening.py', 'utf8')), 'no maker name in the files');
check(fs.existsSync('../promo/opening.py') && /def export_js/.test(read('../promo/opening.py')) && /python opening\.py export/.test(read('../promo/README.md')), 'promo/opening.py (which also makes the video and the sound) and its notes are in the repository');
check(!/https?:\/\//.test(code) && !/fetch\(|XMLHttpRequest|WebSocket/.test(code), 'it talks to no server (the sound and the shapes are files of this site)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
