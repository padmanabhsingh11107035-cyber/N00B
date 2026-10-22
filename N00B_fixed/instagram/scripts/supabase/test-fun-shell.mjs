// The four "Fun" pages of the three-line menu (This or That, Ask Me Anything, Mood Status, Public Polls): their addresses, the menu entries, the frame around them (a way back
// Home, a strip of the four pages with the one you are on lit), and how they open on top of the page that was showing. Usage: node scripts/supabase/test-fun-shell.mjs
import fs from 'node:fs';
import { parseFunPath, funPath, funShareUrl, FUN_FEATURES, isPollId, isUsername } from '../../src/utils/funRoutes.ts';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const feed = read('src/components/Feed/FeedView.tsx');
const app = read('src/App.tsx');
const hub = read('src/components/Fun/FunHub.tsx');
const ui = read('src/components/Fun/funUi.tsx');

section('1. The four pages and their addresses');
check(FUN_FEATURES.map((f) => f.label).join('|') === 'This or That|Ask Me Anything|Mood Status|Public Polls', 'the four pages, in the order of the menu');
check(parseFunPath('/this-or-that')?.feature === 'this-or-that' && parseFunPath('/ask')?.feature === 'ask' && parseFunPath('/mood')?.feature === 'mood' && parseFunPath('/polls')?.feature === 'polls', 'each page has its own address');
check(parseFunPath('/ask/ann_secret')?.target === 'ann_secret', '/ask/<username> is the page where that person is asked a question');
const pid = '0b3c1c6e-9a0e-4f5d-8b61-2f3c4d5e6f70';
check(parseFunPath(`/polls/${pid}`)?.target === pid && parseFunPath(`/polls/${pid.toUpperCase()}`)?.target === pid, '/polls/<id> is one poll (the id is kept in lower case)');
check(parseFunPath('/') === null && parseFunPath('/anonymous') === null && parseFunPath('/profile') === null && parseFunPath('/polls/not-an-id') === null && parseFunPath('/ask/a b') === null && parseFunPath('/ask/x/y') === null && parseFunPath('/mood/anything') === null, 'every other address is not one of ours');
check(parseFunPath('/ask/%E0%A4%A') === null, 'a broken address does not crash anything');
check(funPath({ feature: 'ask', target: 'ann_secret' }) === '/ask/ann_secret' && funPath({ feature: 'polls', target: pid }) === `/polls/${pid}` && funPath({ feature: 'mood' }) === '/mood' && funPath({ feature: 'ask', target: '../etc' }) === '/ask', 'addresses are built the same way, and a target that is not a username or id is dropped');
check(funShareUrl({ feature: 'ask', target: 'ann_secret' }, 'https://noobsocials.com') === 'https://noobsocials.com/ask/ann_secret', 'the link people share is on the site they are using');
check(isUsername('a.b_c9') && !isUsername('') && !isUsername('x'.repeat(31)) && isPollId(pid) && !isPollId('123'), 'username and poll id checks');

section('2. The three-line menu');
check(/FUN_FEATURES\.map\(\(f\) => \{\s*const Icon = FUN_MENU_ICONS\[f\.id\];/.test(feed) && /ariaLabel=\{f\.label\}/.test(feed), 'the menu lists the four pages with their names and icons');
check(/onClick=\{\(\) => \{ markMenuEntry\('fun-' \+ f\.id\); setShowNoobMenu\(false\); onOpenFunPage\(\{ feature: f\.id \}\); \}\}/.test(feed) && /onPointerDown=\{preloadFunHub\}/.test(feed), 'tapping one closes the menu and opens that page (its code starts loading on the touch)');
check(/Fun &amp; community/.test(feed) && /\{onOpenFunPage && \(/.test(feed), 'they sit under their own heading, only where the app can open them');
check(/Anonymous Messages/.test(feed) && /Our Team/.test(feed) && /Customer Support/.test(feed) && /NOOB Draw/.test(feed), 'every earlier menu entry is still there');
check(/onOpenFunPage=\{openFun\}/.test(app), 'Home is given the way to open them');

section('3. They open on top of the page that was showing');
check(/type AppLayer =\s*\| \{ id: string; kind: 'profile'; user: User \}\s*\| \{ id: 'fun'; kind: 'fun'; loc: FunLocation \};/.test(app) && /usePageLayers<AppLayer>\(activeTab\)/.test(app), 'a Fun page is a layer like a profile: the page under it stays alive and comes back exactly as it was');
check(/const openFun = \(loc: FunLocation\) => \{[\s\S]{0,260}pageLayers\.update\(\{ id: 'fun', kind: 'fun', loc \}\);[\s\S]{0,120}pageLayers\.push\(\{ id: 'fun', kind: 'fun', loc \}\);/.test(app), 'opening a Fun page pushes a layer, or moves within the Fun page that is already open');
check(/onBack=\{pageLayers\.back\}/.test(app) && /onHome=\{\(\) => setActiveTab\('feed'\)\}/.test(app), 'Back goes one step back (the phone\'s back button does the same); Home goes straight to the Home page');
check(/const topLayerData = pageLayers\.layers\[pageLayers\.layers\.length - 1\]\?\.data;/.test(app) && /replaceState\(window\.history\.state, '', want \+ window\.location\.search\)/.test(app) && /else if \(parseFunPath\(here\) \|\| parseContentPath\(here\)\) \{\s*window\.history\.replaceState\(window\.history\.state, '', TAB_PATHS\[activeTabRef\.current\] \+ window\.location\.search\);/.test(app), 'the address follows the page that is showing, and goes back to the address of the page underneath when it closes');
check(/const \[bootFun, setBootFun\] = useState<FunLocation \| null>\(\(\) => parseFunPath\(window\.location\.pathname\)\);/.test(app) && /if \(!currentUser \|\| !bootFun\) return;\s*pageLayers\.push\(\{ id: 'fun', kind: 'fun', loc: bootFun \}\);/.test(app), 'an address opened directly (a shared link) opens the page once someone is logged in');
check(/if \(bootFun && publicFunOpen\) \{[\s\S]{0,700}<FunHub currentUser=\{null\}/.test(app), 'a visitor who is not logged in can look at it first, and is asked to log in only when it is time to send or vote');
check(/onNavigate=\{setBootFun\}/.test(app) && /leaveFunPublic/.test(app), '... and can move between pages while looking, or leave to the login screen (the address is kept for after login)');

section('4. The frame');
check(/role="tablist" aria-label="NOOB Fun pages"/.test(hub) && /aria-current=\{on \? 'page' : undefined\}/.test(hub) && /aria-selected=\{on\}/.test(hub), 'a strip of the four pages marks the one you are on (for everyone, including screen readers)');
check(/bg-noob text-black border-zinc-50 shadow-lg scale-\[1\.02\]/.test(hub) && /transition-all duration-200/.test(hub), 'the active page is lit in the app\'s accent, with a light animation');
check(/aria-label="Go back"/.test(hub) && /aria-label="Back to the Home page"/.test(hub), 'a Back button and a Home button are always at the top');
check(/onPointerEnter=\{\(\) => preloadFunPage\(f\.id\)\}/.test(hub) && /React\.lazy\(\(\) => import\('\.\/ThisOrThatPage'\)\)/.test(hub), 'each page is loaded only when it is wanted');
check(/sticky top-0 z-10 bg-zinc-900 border-b border-zinc-800/.test(hub) && /max-w-2xl mx-auto/.test(hub) && /overflow-x-auto no-scrollbar/.test(hub), 'the frame follows the app\'s look and works from a phone to a desktop (the strip scrolls on a narrow screen)');
check(/scrollRef\.current\?\.scrollTo\(\{ top: 0 \}\)/.test(hub), 'a new page starts at its top');
check(/export function useToast/.test(ui) && /role="status" aria-live="polite"/.test(ui) && /animate-pulse/.test(ui) && /role="alert"/.test(ui), 'success and error notices, loading placeholders and error states are shared by the four pages');
check(!/dangerouslySetInnerHTML|innerHTML/.test(hub + ui), 'nothing a person types is ever drawn as HTML');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
