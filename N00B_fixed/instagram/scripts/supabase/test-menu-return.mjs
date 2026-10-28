// "Back to the three-line menu": a page opened from the menu drops the person back in the menu, at the button they pressed (src/utils/menuReturn.ts, the wiring in
// src/components/Feed/FeedView.tsx and the layer events in src/utils/pageLayers.tsx). Usage: node scripts/supabase/test-menu-return.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

// ---- stand-ins for the browser
const store = new Map();
globalThis.sessionStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } };
const classes = new Set();
let scrolled = 0, wanted = null, present = true;
const el = { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) }, scrollIntoView: () => { scrolled++; }, offsetWidth: 1 };
globalThis.document = { querySelector: (q) => { wanted = q; return present ? el : null; } };
const timers = [];
globalThis.window = { setTimeout: (fn, ms) => { timers.push([fn, ms]); return timers.length; } };
globalThis.requestAnimationFrame = (fn) => { fn(); return 1; };

const M = await import(pathToFileURL(path.resolve('src/utils/menuReturn.ts')).href);

section('1. The menu remembers the button that was pressed');
M.markMenuEntry('rooms');
check(M.currentMenuEntry() === 'rooms' && store.get('noob.menuEntry') === 'rooms', 'the pressed button is kept (and for the visit, so a refresh also comes back to it)');
M.markMenuEntry(null);
check(M.currentMenuEntry() === null && !store.has('noob.menuEntry'), 'forgetting it clears both');
store.set('noob.menuEntry', 'shop');
check(M.currentMenuEntry() === 'shop', 'after a refresh it is read back from the visit');
M.markMenuEntry(null);

section('2. It lands on that exact button');
M.markMenuEntry('fun-polls');
M.scrollToMenuEntry('fun-polls');
check(wanted === '[data-menu-entry="fun-polls"]' && scrolled === 1, 'the button is found by its id and put in the middle of the list');
check(classes.has('menu-entry-flash') && timers.length === 1 && timers[0][1] === 1600, 'it flashes once, then the flash is taken off again');
timers[0][0]();
check(!classes.has('menu-entry-flash'), 'the flash goes away by itself');
present = false; scrolled = 0;
let n = 0;
globalThis.requestAnimationFrame = (fn) => { if (++n < 5) fn(); return 1; };
M.scrollToMenuEntry('daily');
check(scrolled === 0 && n >= 4, 'if the menu is not drawn yet it keeps looking for a moment');
present = true; n = 0;
globalThis.requestAnimationFrame = (fn) => { fn(); return 1; };
check((() => { try { M.scrollToMenuEntry('a"b'); return true; } catch { return false; } })(), 'a strange id cannot break the lookup');
M.markMenuEntry(null);

section('3. The wiring');
const feed = read('src/components/Feed/FeedView.tsx');
const layers = read('src/utils/pageLayers.tsx');
const banner = read('src/components/Feed/MenuBanner.tsx');
const ids = ['draw', 'studio', 'lenses', 'study', 'team', 'join', 'spark', 'anonymous', 'daily', 'rooms', 'song', 'lounge', 'shop', 'food', 'ai', 'support', 'idea', 'drinks', 'creations'];
check(ids.every((id) => new RegExp(`markMenuEntry\\('${id}'\\)`).test(feed) && new RegExp(`data-menu-entry="${id}"|entryId="${id}"`).test(feed)), 'every button of the menu (Draw ... More of our creations) remembers itself when pressed and can be found again');
check(/markMenuEntry\('fun-' \+ f\.id\)/.test(feed) && /entryId=\{'fun-' \+ f\.id\}/.test(feed), 'so do the four Fun pages');
check(/data-menu-entry=\{entryId\}/.test(banner), 'a banner carries its id on the page');
check(/const entryPageOpen = !!\(menuPageOpen \|\| showJoinUsModal \|\| showSparkXModal \|\| studioOpen \|\| lensesOpen\)/.test(feed) && /entryPageWasOpen\.current && !entryPageOpen/.test(feed), 'closing any page opened from the menu (Daily NOOB ... Studio) is noticed');
check(/if \(pageHiddenRef\.current\) markMenuEntry\(null\); else backToMenu\(\)/.test(feed), 'it only returns to the menu when Home is on screen (another tab opened meanwhile = nothing is remembered)');
check(/setShowNoobMenu\(true\);\s*scrollToMenuEntry\(id\)/.test(feed), 'returning opens the menu and goes to the button');
check(/onClick=\{\(\) => \{ markMenuEntry\(null\); setShowNoobMenu\(true\); \}\}/.test(feed), 'opening the menu with its own button starts a fresh visit (an old button is forgotten)');
check(/LAYERS_BACK_EVENT, onBack/.test(feed) && /id\.startsWith\('fun-'\)/.test(feed), 'a Fun page (a layer of the app) returns to the menu when the person goes back from it');
check(/LAYERS_CLEARED_EVENT, onCleared/.test(feed), 'but not when every layer is closed at once (a bottom-bar tab, Home pressed again)');
check(/export const LAYERS_BACK_EVENT/.test(layers) && /viaBack\.current = true/.test(layers) && /if \(count === 0 && viaBack\.current\) announce\(LAYERS_BACK_EVENT\)/.test(layers), 'the layers say so when the person goes back from the last one');
check(/announce\(LAYERS_CLEARED_EVENT\)/.test(layers) && /viaBack\.current = false;\s*setLayers\(\[\]\)/.test(layers), 'and when all are closed at once');
const hamburgerOnly = (feed.match(/setShowNoobMenu\(true\)/g) || []).length;
check(hamburgerOnly === 2, 'only the menu itself is involved: the hamburger and the way back (no other page changed)', String(hamburgerOnly));
check(!/markMenuEntry/.test(read('src/components/Profile/ProfileView.tsx')), 'nothing outside the three-line menu on Home remembers a button');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
