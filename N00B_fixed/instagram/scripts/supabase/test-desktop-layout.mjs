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
const page = /<div className=\{`(min-h-screen (?:bg-(?:black|page) )?text-white[^`]*)`\}>/.exec(app)?.[1] || '';
check(/md:justify-start/.test(page) && /md:pl-0/.test(page) && /xl:justify-start/.test(page) && /xl:pl-0/.test(page), 'from 768 px wide the page starts at the left edge (no centring, no left padding), as the long strip is there', page);
const side = /<aside\s+className=\{`(hidden md:block[^`]*)`\}\s+data-testid="desktop-side-menu"/.exec(app)?.[1] || '';
check(/h-dvh/.test(side) && /top-0/.test(side) && /lg:-my-6/.test(side) && /sticky/.test(side), 'the strip is as tall as the window and stuck to its top', side);
check(/w-\[80px\] xl:w-\[272px\]/.test(side) && /: 'w-\[80px\]'/.test(side), 'it takes 80 px (icons only) and, extended, 272 px on a screen from 1280 px wide (narrower: it opens over the page)');
check(/className="nmenu-scroll no-scrollbar" data-testid="desktop-side-menu-scroll"/.test(app) && /\.nmenu-scroll \{[^}]*overflow-y: auto/.test(css), 'the list inside it scrolls when the window is short, the profile box under it stays in view');

section('2. The feed and the people list share the rest');
const main = /<main\s+className=\{`relative w-full max-w-\[480px\] \$\{[\s\S]*?lg:rounded-t-\[40px\]/.exec(app)?.[0] || '';   // up to the rounded top: the Music page has its own colour and width in the middle
check(main.includes("'xl:mx-0 xl:ml-auto'") && /md:mx-auto/.test(app) && /2xl:max-w-\[800px\] 3xl:max-w-\[880px\]/.test(main), 'the other pages keep their share of the free space and grow on big screens (800 px, 880 px)');
check(!/2xl:max-w-5xl/.test(main) && !/pageTab === 'chat' \? 'md:max-w-4xl/.test(main), 'the chat page has the same widths as the other pages (a wider one pushed the people list off the screen between 1280 and 1720 px)');
check(/pageTab === 'feed' \? 'xl:flex-1 xl:min-w-0 xl:max-w-\[1200px\] xl:mx-auto'/.test(main), 'on Home the middle page takes ALL the room between the menu and the people list (up to 1200 px), not just an equal share');
check(/pageTab === 'feed' \? 'md:max-w-2xl'/.test(main), 'and the fixed 800 / 880 px limits do not apply to Home');
check(/pageTab === 'feed' \? 'xl:pr-4' : ''/.test(page),'on Home the right edge of the window only has a small margin, so the people list sits at the far right');
const people = /<aside className=\{`([^`]*)`\} data-testid="desktop-people-panel">/.exec(app)?.[1] || '';   // (the Music page hides it)
check(/pageTab === 'feed' \? '' : 'xl:mr-auto'/.test(people) && /2xl:w-\[340px\] 3xl:w-\[380px\]/.test(people), 'the people list is at the far right on Home (no spare room after it), and takes its equal share elsewhere');
const feed = read('src/components/Feed/FeedView.tsx');
check((feed.match(/max-w-\[480px\] xl:max-w-\[640px\]/g) || []).length === 3 && !/max-w-\[480px\] px/.test(feed) && /data-testid="feed-topic-chips"/.test(feed), 'the Home feed itself (banners, posts) grows from 480 to 640 px on wide screens, to use the wider middle page');
check(/--breakpoint-3xl: 112\.5rem/.test(css), 'the 3xl breakpoint (1800 px) is defined for very wide monitors');

section('3. Smaller screens are unchanged');
check(/hidden md:block/.test(side) && /hidden lg:flex/.test(people) && /lg:pb-0 lg:gap-8/.test(page), 'below 768 px (a phone) there is no strip, below 1024 px no people list, and the spacing is as before');
check(/md:mx-auto overflow-hidden shrink-0 md:shrink md:min-w-0 xl:shrink-0/.test(app), 'between 768 and 1280 px the middle page may shrink a little, so the strip, the page and the people list fit side by side');

check(/hidden lg:flex fixed/.test(read('src/components/Common/BackToTop.tsx')) && /window\.scrollY > 500/.test(read('src/components/Common/BackToTop.tsx')) && /<BackToTop \/>/.test(app) && /::-webkit-scrollbar \{ width: 12px/.test(read('src/index.css')), 'laptops get a scroll bar they can see and drag, and a Back to the top button after scrolling down');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
