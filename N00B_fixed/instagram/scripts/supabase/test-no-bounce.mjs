// No page of the app follows a dragging finger and springs back (the iPhone's rubber band): the Chat page could be pulled down until blank space opened above it. "overscroll-behavior:
// contain" keeps that spring (it only stops the pull from reaching the page behind), "none" removes it. Usage: node scripts/supabase/test-no-bounce.mjs
import fs from 'node:fs';
import path from 'node:path';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const css = read('src/index.css');
const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else if (/\.(tsx|ts)$/.test(e.name)) out.push(p); } return out; };
const files = walk('src');

section('1. The pages');
check(/html\[data-refresh="off"\],\s*html\[data-refresh="off"\] body \{ overscroll-behavior: none; \}/.test(css), 'every page where refreshing is off (all but Home) has no spring at its top and bottom');
check(/html\[data-refresh="on"\],\s*html\[data-refresh="on"\] body \{ overscroll-behavior-x: none; \}/.test(css), 'Home, which has its own pull-down refresh, still has no sideways drag');
check(!/data-refresh="off"\][^{]*\{[^}]*overscroll-behavior-y: contain/.test(css), 'the old "contain" (which kept the spring) is gone from the pages');
check(/html\[data-overlay-open\], html\[data-overlay-open\] body \{ overflow: hidden !important; overscroll-behavior: none; \}/.test(css), 'a page behind a full-screen window does not move either');

section('2. The lists and panels inside a page');
check(/\.overflow-y-auto, \.overflow-y-scroll, \.st-scroll, \.st-sheet \{ overscroll-behavior-y: none; \}/.test(css), 'vertical lists and panels do not spring');
check(/\.overflow-x-auto, \.overflow-x-scroll, \.st-hscroll \{ overscroll-behavior-x: none; \}/.test(css), 'sideways rows do not spring (and a vertical drag on them still scrolls the page)');
check(/\.overflow-auto, \.overflow-scroll \{ overscroll-behavior: none; \}/.test(css), 'panels that scroll both ways do not spring');
check(/\[style\*="overflow-y: auto"\]/.test(css) && /\[style\*="overflow-x: auto"\]/.test(css), 'scrollers set with an inline style too');
check(/\.fixed\.inset-0, \.fixed\.inset-0 \.overflow-y-auto, \.fixed\.inset-0 \.overflow-auto, \.fixed\.inset-0\.overflow-y-auto \{ overscroll-behavior: none; \}/.test(css), 'full-screen windows and their panels do not spring');

section('3. Nothing in the app puts the spring back');
const contain = files.filter((f) => /overscrollBehavior:\s*'contain'/.test(read(f)));
check(contain.length === 0, 'no component asks for "contain" in a style', contain.join(', '));
check(!/overscroll-behavior(-[xy])?:\s*contain/.test(css.split('\n').filter((l) => !l.startsWith("[data-noob-page")).join('\n')), 'and the style sheet no longer uses "contain" anywhere');
const uncovered = [];
for (const f of files.filter((x) => x.endsWith('.tsx'))) for (const [i, line] of read(f).split('\n').entries()) if (/overscroll-contain/.test(line) && !/overflow-y-auto|overflow-auto|overflow-y-scroll|fixed inset-0/.test(line)) uncovered.push(`${f}:${i + 1}`);
check(uncovered.length === 0, 'every panel marked "overscroll-contain" is also one of the scrollers above (so the rule that removes the spring reaches it)', uncovered.join(', '));
check(/overscroll-none/.test(read('src/components/Reels/ReelsView.tsx')), 'the Reels pager still has none');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
