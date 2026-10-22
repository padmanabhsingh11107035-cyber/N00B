// The left menu of the desktop layout on a laptop-height screen: the menu scrolls inside itself, the profile box under it is never pushed out of sight, and the rows get slimmer in steps.
// Usage: node scripts/supabase/test-side-menu-fit.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const app = read('src/App.tsx'), css = read('src/index.css');

const aside = (app.match(/<aside className="[^"]*" data-testid="desktop-side-menu">/) || [''])[0];
check(/xl:h-screen/.test(aside) && /xl:overflow-hidden/.test(aside) && !/overflow-y-auto/.test(aside), 'the menu column is exactly one screen high and does not scroll as a whole');
check(/<div className="space-y-7 min-h-0 flex-1 overflow-y-auto no-scrollbar[^"]*" data-testid="desktop-side-menu-scroll">/.test(app), 'the part with the logo and the links scrolls inside itself when the screen is too short');
check(/<div className="shrink-0 [^"]*" data-testid="desktop-side-profile">/.test(app), 'the profile box under it keeps its size and stays in view');

const rule = (css.match(/\[data-testid="desktop-side-menu-scroll"\] nav button \{([^}]*)\}/) || [])[1] || '';
check(/flex: 1 1 0;/.test(rule) && /padding-top: 0; padding-bottom: 0;/.test(rule), 'the rows share the free height of the column between them, so there is no empty gap under the last link');
check(/min-height: 1\.75rem;/.test(rule) && /max-height: 3\.5rem;/.test(rule), 'a row is never slimmer than 28 px and never taller than 56 px');
check(/desktop-side-menu-scroll"\] > nav \{ flex: 1 1 auto; display: flex; flex-direction: column; \}/.test(css), 'the links fill the area above the profile box');
const tiers = [...css.matchAll(/@media \(min-width: 1280px\) and \(max-height: (\d+)px\)/g)].map((m) => Number(m[1]));
check(JSON.stringify(tiers) === '[900,740]', 'the spaces between the logo, the links and the screen edge get smaller on screens up to 900 and 740 px high');
check(!/@media[^{]*max-height[^{]*\{[^}]*desktop-side-menu-scroll"\][^}]*display: none/.test(css), 'no link is ever hidden to make room');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
