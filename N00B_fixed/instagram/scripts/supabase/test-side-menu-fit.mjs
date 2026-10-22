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

const tiers = [...css.matchAll(/@media \(min-width: 1280px\) and \(max-height: (\d+)px\) \{([^}]*(?:\}[^}]*?)*?)\n\}/g)].map((m) => ({ h: Number(m[1]), body: m[2] }));
check(JSON.stringify(tiers.map((t) => t.h)) === '[900,740,660]', 'rows get slimmer in three steps (screens up to 900, 740 and 660 px high)');
check(tiers.every((t) => /desktop-side-menu-scroll"\] nav button \{ padding-top: [\d.]+rem; padding-bottom: [\d.]+rem; \}/.test(t.body)), 'each step sets the padding of the rows');
const pad = tiers.map((t) => Number((t.body.match(/nav button \{ padding-top: ([\d.]+)rem/) || [])[1]));
check(pad[0] < 0.75 && pad[0] > pad[1] && pad[1] > pad[2], 'the shorter the screen the slimmer the row');
check(!/@media[^{]*max-height[^{]*\{[^}]*desktop-side-menu-scroll"\][^}]*display: none/.test(css), 'no link is ever hidden to make room');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
