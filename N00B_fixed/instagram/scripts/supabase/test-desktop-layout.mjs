// The desktop layout (PC / laptop): the menu on the left now touches the left edge of the window instead of floating with an empty gap beside it, and the feed and the people
// list share the rest of the width. Checked against the real classes in src/App.tsx and the real breakpoint in src/index.css; the pixels were measured in a browser at
// 1366 and 1920 px wide (menu 0-240 / 0-272, gaps of 75 / 242 px between the menu and the feed, instead of one 170 px gap on the far left).
// Usage: node scripts/supabase/test-desktop-layout.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const app = read('src/App.tsx');
const css = read('src/index.css');

section('1. The menu touches the left edge');
const page = /<div className="(min-h-screen bg-black[^"]*)">/.exec(app)?.[1] || '';
check(/xl:justify-start/.test(page) && /xl:pl-0/.test(page), 'from 1280 px wide the page starts at the left edge (no centring, no left padding)', page);
const side = /<aside className="(hidden xl:flex[^"]*)" data-testid="desktop-side-menu">/.exec(app)?.[1] || '';
check(/xl:h-screen/.test(side) && /xl:top-0/.test(side) && /xl:-my-6/.test(side), 'the menu is as tall as the window and stuck to its top', side);
check(/xl:border-r/.test(side) && /xl:overflow-y-auto/.test(side) && /2xl:w-\[272px\]/.test(side), 'it has a dividing line, scrolls when the window is short, and is wider on big screens');

section('2. The feed and the people list share the rest');
const main = /<main\s+className=\{`relative w-full max-w-\[480px\] \$\{[\s\S]*?\} xl:ml-auto bg-black/.exec(app)?.[0] || '';
check(main.includes('xl:ml-auto') && /2xl:max-w-\[800px\] 3xl:max-w-\[880px\]/.test(main), 'the feed takes an equal share of the free space and grows on big screens (800 px, 880 px)');
check(/2xl:max-w-5xl/.test(main), 'the chat page grows too');
const people = /<aside className="(hidden lg:flex[^"]*)" data-testid="desktop-people-panel">/.exec(app)?.[1] || '';
check(/xl:mr-auto/.test(people) && /2xl:w-\[340px\] 3xl:w-\[380px\]/.test(people), 'the people list takes the other equal share and grows on big screens');
check(/--breakpoint-3xl: 112\.5rem/.test(css), 'the 3xl breakpoint (1800 px) is defined for very wide monitors');

section('3. Smaller screens are unchanged');
check(/hidden xl:flex/.test(side) && /hidden lg:flex/.test(people) && /lg:p-6 lg:gap-8/.test(page), 'below 1280 px there is no side menu, below 1024 px no people list, and the spacing is as before');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
