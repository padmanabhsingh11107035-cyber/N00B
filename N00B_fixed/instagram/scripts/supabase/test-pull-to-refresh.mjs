// Pull-to-refresh on Home and Explore must never start from a menu / sheet / pop-up drawn over the page (src/utils/pullToRefresh.ts): scrolling the three-lines menu
// used to refresh the whole app. Usage: node scripts/supabase/test-pull-to-refresh.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const { startsInsideOverlay } = await import(pathToFileURL(path.resolve('src/utils/pullToRefresh.ts')).href);

// a tiny tree: page > (feed card > button), (fixed menu overlay > panel > list > item)
const node = (name, position, parent = null) => ({ name, position, parentElement: parent });
const page = node('page', 'relative');
const card = node('card', 'static', page);
const cardButton = node('cardButton', 'static', card);
const overlay = node('overlay', 'fixed', page);
const panel = node('panel', 'static', overlay);
const list = node('list', 'static', panel);
const item = node('item', 'static', list);
const stickyHeader = node('stickyHeader', 'sticky', page);
const pos = (el) => el.position;

section('1. Where a pull may start');
check(startsInsideOverlay(cardButton, page, pos) === false, 'on the page itself (a post, a button): a pull is allowed');
check(startsInsideOverlay(page, page, pos) === false, 'on the page container itself: allowed');
check(startsInsideOverlay(stickyHeader, page, pos) === false, 'on a sticky header: allowed (it is part of the page)');
check(startsInsideOverlay(item, page, pos) === true, 'on an item inside the three-lines menu: NOT a pull');
check(startsInsideOverlay(panel, page, pos) === true && startsInsideOverlay(overlay, page, pos) === true, 'on the menu panel or its dimmed background: NOT a pull');
check(startsInsideOverlay(null, page, pos) === false && startsInsideOverlay(undefined, page, pos) === false, 'no target: nothing special');
const loop = node('loop', 'static'); loop.parentElement = loop;
check(startsInsideOverlay(loop, page, pos) === false, 'a broken tree can never loop forever');
const outside = node('outside', 'static');
check(startsInsideOverlay(outside, page, pos) === false, 'an element that is not under the page just ends at the top');

section('2. Both pages use it');
const feed = read('src/components/Feed/FeedView.tsx');
const explore = read('src/components/Explore/ExploreView.tsx');
for (const [name, src] of [['Home', feed], ['Explore', explore]]) {
  check(/if \(startsInsideOverlay\(e\.target, e\.currentTarget\)\) return;\s*\n\s*if \(window\.scrollY <= 5\)/.test(src), `${name}: a touch that lands on an overlay never starts a pull`);
}
check(/z-\[95\] bg-black\/70 backdrop-blur-sm flex items-start overscroll-contain/.test(feed) && /overflow-y-auto overscroll-contain/.test(feed), 'the three-lines menu and its list do not pass their scrolling on to the page behind');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
