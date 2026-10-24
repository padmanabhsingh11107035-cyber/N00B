// The see-through keyboard of an iPhone showed the page behind the help desk (a post, a reel) through it. src/utils/keyboardFill.ts lays a bar of the colour of the screen above the keyboard under it,
// on every page. Tested here with stand-ins for the page and for the phone's visual viewport.
// Usage: node scripts/supabase/test-keyboard-fill.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

const K = await import(pathToFileURL(path.resolve('src/utils/keyboardFill.ts')).href);

section('1. Colours');
check(JSON.stringify(K.parseColor('rgb(10, 20, 30)')) === '{"r":10,"g":20,"b":30,"a":1}' && K.parseColor('rgba(0, 0, 0, 0.5)').a === 0.5 && K.parseColor('rgb(0 0 0 / 50%)').a === 0.5, 'rgb(), rgba() and the space form are read');
check(K.parseColor('transparent') === null && K.parseColor('') === null && K.parseColor('red') === null && K.parseColor(undefined) === null, 'anything else is not a colour here (so it is skipped)');
check(K.flatten([], { r: 10, g: 10, b: 10, a: 1 }) === 'rgb(10, 10, 10)', 'no layer: the page colour');
check(K.flatten([{ r: 255, g: 255, b: 255, a: 1 }], { r: 10, g: 10, b: 10, a: 1 }) === 'rgb(255, 255, 255)', 'a white layer is white');
check(K.flatten([{ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255, a: 1 }], { r: 10, g: 10, b: 10, a: 1 }) === 'rgb(128, 128, 128)', 'a half-dark layer over white is grey (a dimmed page stays dimmed)');
check(K.flatten([{ r: 0, g: 0, b: 0, a: 0.85 }], { r: 10, g: 10, b: 10, a: 1 }) === 'rgb(2, 2, 2)', 'a dark dim over the page is almost black');

section('2. How tall the keyboard is');
check(K.keyboardHeight(844, 0, 844) === 0 && K.keyboardHeight(844, 0, 800) === 0 && K.keyboardHeight(844, 0, 724) === 120, 'under 120 px is an address bar, not a keyboard');
check(K.keyboardHeight(844, 0, 480) === 364, 'a keyboard: the page minus what is visible');
check(K.keyboardHeight(844, 60, 420) === 364, 'also when the page has been pushed up (the visible part starts lower)');
check(K.keyboardHeight(600, 0, 700) === 0, 'never negative');
check(K.keyboardHeight(480, 0, 480, 844, true) === 364 && K.keyboardHeight(480, 0, 480, 844, false) === 0, 'if a browser made the page as short as the visible part, a typing box that has the focus still means a keyboard (the height of the screen is used)');
check(K.keyboardHeight(844, 0, 800, 844, true) === 0 && K.keyboardHeight(900, 0, 900, 1000, true) === 0, 'but a focus alone, with no room under the page for a keyboard, does nothing');

section('3. The bar (run against a stand-in page)');
{
  const styles = new Map();
  const mk = (name, bg, parent = null) => { const el = { name, parentElement: parent }; styles.set(el, bg); return el; };
  const body = mk('body', 'rgb(10, 10, 10)'), html = mk('html', 'rgb(10, 10, 10)');
  const page = mk('page', 'rgba(0, 0, 0, 0)', body), panel = mk('panel', 'rgb(255, 255, 255)', page), composer = mk('composer', 'rgba(0, 0, 0, 0)', panel);
  const scrim = mk('scrim', 'rgba(0, 0, 0, 0.5)', page);
  let under = composer;                       // what is at the left edge, just above the keyboard
  const appended = [], bar = { style: {}, dataset: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  const listeners = {}, vvListeners = {};
  globalThis.document = {
    body, documentElement: html,
    activeElement: null,
    createElement: () => bar, elementFromPoint: (x, y) => { globalThis.__asked = [x, y]; return under; },
    addEventListener: (n, f) => { listeners[n] = f; },
  };
  body.appendChild = (el) => appended.push(el);
  globalThis.getComputedStyle = (el) => ({ backgroundColor: styles.get(el) });
  const timers = [];
  globalThis.window = { innerHeight: 844, innerWidth: 390, setTimeout: (f) => { timers.push(f); return timers.length; }, clearTimeout() {}, setInterval: () => 1 };
  const vv = { offsetTop: 0, height: 844, addEventListener: (n, f) => { vvListeners[n] = f; } };
  K.installKeyboardFill(vv);
  check(appended.length === 1 && appended[0] === bar && bar.style.display === 'none' && /pointer-events:none/.test(bar.style.cssText) && bar.attrs['aria-hidden'] === 'true', 'one bar is added, hidden, and it can not be touched');
  check(typeof vvListeners.resize === 'function' && typeof vvListeners.scroll === 'function' && typeof listeners.focusin === 'function' && typeof listeners.focusout === 'function', 'it watches the keyboard (the visible area changing) and the typing boxes getting and losing focus');

  vv.height = 480;                            // the keyboard opens
  vvListeners.resize();
  check(bar.style.display === 'block' && bar.style.top === '480px' && bar.style.height === '364px', 'with the keyboard open the bar lies exactly under the visible part, as tall as the keyboard');
  check(bar.style.background === 'rgb(255, 255, 255)' && globalThis.__asked[0] === 2 && globalThis.__asked[1] === 477, 'in the colour of the screen right above it (white here, read just above the edge), not the page behind');
  under = scrim;                              // a dimmed pop-up above the keyboard
  vvListeners.resize();
  check(bar.style.background === 'rgb(5, 5, 5)', 'over a dimmed screen the bar is dimmed too');
  vv.offsetTop = 60; vv.height = 420;         // the phone pushed the page up
  vvListeners.scroll();
  check(bar.style.top === '480px' && bar.style.height === '364px', 'it follows the page when the phone pushes it up');
  vv.offsetTop = 0; vv.height = 844;          // the keyboard closes
  vvListeners.resize();
  check(bar.style.display === 'none', 'and goes when the keyboard goes');
  const later = timers.length; vv.height = 480; vvListeners.resize();
  check(timers.length >= later + 2, 'it looks again a moment later, once the keyboard has finished sliding');
}

section('4. Where it is used');
const main = read('src/main.tsx'), src = read('src/utils/keyboardFill.ts');
check(/import \{ installKeyboardFill \} from '\.\/utils\/keyboardFill\.ts'/.test(main) && /^installKeyboardFill\(\);/m.test(main), 'the app starts it once, for every page');
check(/'ontouchstart' in window/.test(src) && /maxTouchPoints/.test(src), 'it does nothing on a computer');
check(/pointer-events:none/.test(src) && /z-index:2147482000/.test(src) && /aria-hidden/.test(src), 'it is only paint: not touchable, not read by a screen reader');
check(!/innerHTML|dangerouslySetInnerHTML|eval\(|fetch\(/.test(src), 'it touches nothing else');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
