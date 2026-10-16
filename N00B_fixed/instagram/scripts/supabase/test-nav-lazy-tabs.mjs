// Tests two things about the bottom navigation: (1) opening a page for the first time shows no loading spinner once its file has been fetched ahead
// of time (src/utils/lazyTab.tsx, used for every page of the bar), and every page of the bar IS fetched ahead of time, also when a finger touches
// its icon; (2) the bar has ONE lit marker: the buttons add no second outline of their own (the hover look used to stick on a phone after a tap and
// drew a smaller ring inside the sliding marker). Bundled on the fly with esbuild: no browser needed.
//
// Usage: node scripts/supabase/test-nav-lazy-tabs.mjs
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);

// next to the project (not in the temp folder) so that `react` resolves from node_modules; removed again at the end
const out = path.resolve('node_modules/.cache-lazytab-test.mjs');
buildSync({ entryPoints: [path.resolve('src/utils/lazyTab.tsx')], bundle: true, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', outfile: out, logLevel: 'error' });
const { lazyTab } = await import(pathToFileURL(out).href);
const React = (await import('react')).default;
const { renderToString } = await import('react-dom/server');
const html = (View) => renderToString(React.createElement(React.Suspense, { fallback: React.createElement('i', null, 'SPINNER') }, React.createElement(View, { name: 'x' })));

section('1. A page that was fetched ahead of time opens with no spinner');
let loads = 0;
const Page = ({ name }) => React.createElement('b', null, 'PAGE-' + name);
const tab = lazyTab(async () => { loads++; await new Promise((r) => setTimeout(r, 20)); return Page; });
check(html(tab.View).includes('SPINNER') && !html(tab.View).includes('PAGE-'), 'not fetched yet: the spinner shows while it downloads');
await tab.preload();
const after = html(tab.View);
check(after.includes('PAGE-x') && !after.includes('SPINNER'), 'fetched: the page is drawn straight away, with no spinner');
check(loads === 1, 'the file is downloaded once, however many times it is asked for', `loads=${loads}`);
await Promise.all([tab.preload(), tab.preload()]);
check(loads === 1, 'asking again (a tap after the background fetch) does not download it again');

section('2. A failed download can be tried again');
let tries = 0;
const flaky = lazyTab(async () => { tries++; if (tries === 1) throw new Error('offline'); return Page; });
let failedOnce = false;
try { await flaky.preload(); } catch { failedOnce = true; }
check(failedOnce, 'the first (failed) download reports the failure');
await flaky.preload();
check(tries === 2 && html(flaky.View).includes('PAGE-x'), 'the next try downloads it again and the page then opens');

section('3. Every page of the bottom bar is fetched ahead of time');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const list = (app.match(/const TAB_PRELOADS[\s\S]*?\];/) || [''])[0];
for (const t of ['profile', 'explore', 'reels', 'videos', 'music', 'games', 'chat']) check(new RegExp(`\\['${t}', preload`).test(list), `${t} is in the list that is fetched in the background`);
for (const v of ['ExploreView', 'ReelsView', 'GamesView', 'MusicHubView', 'ProfileView', 'HomeVideoFeedView', 'ChatView']) {
  check(new RegExp(`View: ${v}, preload: preload\\w+ \\} = lazyTab\\(`).test(app) && !new RegExp(`const ${v} = React\\.lazy`).test(app), `${v} uses lazyTab (no spinner flash), not plain React.lazy`);
}
check(/\.\.\.TAB_PRELOADS\.map\(\(\[, preload\]\) => preload\)/.test(app) && /void worker\(\); void worker\(\)/.test(app), 'after sign-in they are fetched quietly, two at a time');
check(/onPressTab=\{\(tab\) =>[^}]*TAB_PRELOADS\.find/.test(app), 'touching a tab icon starts its download at once');
const nav = fs.readFileSync('src/components/Navigation/FloatingNavBar.tsx', 'utf8');
check(/onPointerDown=/.test(nav) && /onPressTab\?\.\(/.test(nav), 'the bar reports a finger touching an icon');

section('4. One marker, no second outline');
const css = fs.readFileSync('src/index.css', 'utf8');
const hoverRule = css.indexOf('.liquid-glass-btn:hover {');
const mq = css.lastIndexOf('@media (hover: hover)', hoverRule);
check(hoverRule > 0 && mq > 0 && css.slice(mq, hoverRule).split('}').length <= 2, 'the glass button hover look only applies where a mouse can hover (not stuck after a tap)');
check(/#floating-bottom-nav \.liquid-glass-btn:hover\s*\{[^}]*background:\s*transparent[^}]*box-shadow:\s*none/.test(css), 'in the bottom bar the buttons have no hover outline at all');
check(!/liquid-glass-btn-active/.test(nav), 'the buttons no longer carry their own lit look (the sliding marker is the only one)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
