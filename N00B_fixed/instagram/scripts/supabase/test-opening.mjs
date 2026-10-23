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
check(/noob-splash-in \.55s cubic-bezier\(\.2,\.8,\.2,1\) \.9s both/.test(html), 'the logo of the old splash only appears after a second (so it does not flash before the animation, and is still there if the script is missing)');
check(/\/opening\/\*\n  Cache-Control: public, max-age=31536000, immutable/.test(headers) && /opening\.mp3\?v=1/.test(code) && /opening\.js\?v=1/.test(html), 'the files are kept for a year, their address carries a version number');

section('2. The app waits for it');
check(/__noobOpening\?: unknown/.test(main) && /if \(splash && !\(window as unknown as \{ __noobOpening\?: unknown \}\)\.__noobOpening\)/.test(main), 'src/main.tsx leaves the splash to the animation when it is running (and removes it as before when it is not)');
check(/__noobOpeningRevealed === true/.test(loader) && /getElementById\('noob-splash'\)/.test(loader) && /useState\(!opening \|\| splashGone\(\)\)/.test(loader), 'the loading screen (burger) starts when the iris opens, not after the splash is gone');
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
let revealedAt = null;
for (let i = 1; i <= 240 && !splashRemoved; i++) {
  now = 100 + (i / 60) * 1000;
  const f = frames.pop();
  if (f) f();
  if (revealedAt === null && sandbox.__noobOpeningRevealed) revealedAt = i / 60;
}
check(splashRemoved && frames.length === 0, 'it runs to the end by itself and removes the splash');
check(revealedAt !== null && revealedAt > 3.1 && revealedAt < 3.4, `the loading screen is told to start at ${revealedAt?.toFixed(2)} s, as the iris opens`);
check(badNumber === null, 'every number given to the canvas is a real number (none is NaN or infinite)', badNumber || '');
check(calls.fill > 500 && calls.stroke > 100 && calls.arc > 300 && calls.ellipse > 50, `it drew ${calls.fill} fills, ${calls.stroke} strokes, ${calls.arc} arcs, ${calls.ellipse} ellipses over the 4 seconds`);
// every frame of the animation, including the ones it never reaches at 60 fps, in a small and a wide window
for (const [w, h, dpr] of [[390, 844, 3], [1280, 720, 1], [820, 1180, 2], [360, 640, 1]]) {
  sandbox.window.innerWidth = w; sandbox.window.innerHeight = h; sandbox.devicePixelRatio = dpr; sandbox.window.devicePixelRatio = dpr;
  badNumber = null; let thrown = null;
  try { for (let i = 0; i <= 240; i++) api.renderAt(i / 60); api.renderAt(3.999); } catch (e) { thrown = e; }
  check(!thrown && badNumber === null, `every frame draws without an error at ${w} x ${h}`, String(thrown || badNumber || ''));
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
