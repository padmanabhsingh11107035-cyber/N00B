// Tests of 2026-10-27 (batch D): windows that are really pages become pages of their own with "<" (utils/pageFrames.ts), the admin screen for "where did you hear about NOOB",
// and the tutor's picture fallback. Usage: node --liftoff-only scripts/supabase/test-page-frames.mjs
import fs from 'node:fs';
import { classifyOverlay, pickClose, PAGE_ATTR, CARD_ATTR, CLOSE_ATTR, ROW_ATTR } from '../../src/utils/pageFrames.ts';
import { percent } from '../../src/utils/signupSource.ts';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8');

section('1. Which windows become pages');
const phone = { width: 375, height: 812 }, desktop = { width: 1280, height: 720 };
const box = (top, left, width, height) => ({ top, left, width, height });
check(classifyOverlay(phone, box(0, 0, 375, 812)) === 'page', 'a layer that fills the screen is a page already');
check(classifyOverlay(phone, box(40, 8, 359, 730)) === 'card', 'a tall window with the page showing round it becomes a page');
check(classifyOverlay(desktop, box(36, 416, 448, 648)) === 'card', '...on a computer too (it keeps a readable width)');
check(classifyOverlay(phone, box(440, 0, 375, 372)) === 'skip', 'a bottom sheet (comments, sharing) is left as it is');
check(classifyOverlay(phone, box(300, 40, 295, 200)) === 'skip', 'a small question with two buttons is left as it is');
check(classifyOverlay(phone, box(100, 20, 335, 300)) === 'skip', 'a short window is left as it is');
check(classifyOverlay(phone, box(0, 0, 375, 812), { hasMedia: true }) === 'skip', 'a screen made of a picture or video (camera, calls, viewers, games) is left as it is');
check(classifyOverlay(phone, box(40, 8, 359, 730), { keep: true }) === 'skip', 'a layer marked to stay exactly as it is, stays');
check(classifyOverlay({ width: 100, height: 100 }, box(0, 0, 100, 100)) === 'skip', 'nothing is done when the screen is not measurable');

section('2. Which button becomes "<"');
const c = (o) => ({ top: 50, right: 300, width: 32, isX: false, isBack: false, parentFlex: true, ...o });
check(pickClose([c({ isX: true, right: 340 }), c({ right: 300 })], 40).index === 0, 'the X at the right of the top row');
check(pickClose([c({ isX: true, right: 200 }), c({ isX: true, right: 340 })], 40).index === 1, 'with two, the right-most one');
check(pickClose([c({ isBack: true, right: 60 }), c({ isX: true, right: 340 })], 40).hasBack === true, 'a page that already has a back arrow keeps it, and nothing is changed');
check(pickClose([c({ isX: true, top: 400 })], 40).index === -1, 'an X far down the page (a clear button, a tag) is not the way back');
check(pickClose([c({ isX: true, parentFlex: false })], 40).index === -1 && pickClose([c({ isX: true, width: 200 })], 40).index === -1, 'a button that can not be moved, or is not a small icon, is left alone');

section('3. How it looks, and that it is switched on');
const css = read('src/index.css'), main = read('src/main.tsx');
check(new RegExp(`\\[${PAGE_ATTR}='card'\\], \\[${PAGE_ATTR}='page'\\] \\{ background: var\\(--page\\) !important`).test(css), 'a page is the solid page colour: nothing of the page behind shows');
check(new RegExp(`\\[${PAGE_ATTR}='card'\\] > \\[${CARD_ATTR}\\] \\{ width: 100% !important; max-width: min\\(100%, 760px\\) !important; height: 100% !important`).test(css), 'the window fills the screen (a readable width in the middle on a computer)');
check(new RegExp(`\\[${CLOSE_ATTR}\\] \\{ order: -1 !important`).test(css) && new RegExp(`\\[${CLOSE_ATTR}\\]::before`).test(css) && /m15 18-6-6 6-6/.test(css) && new RegExp(`\\[${ROW_ATTR}\\] \\{ justify-content: flex-start`).test(css), 'the X moves to the left and is drawn as "<", and the top row starts at the left');
check(/installPageFrames\(\);/.test(main) && /import \{ installPageFrames \}/.test(main), 'it is switched on when the app starts');
const src = read('src/utils/pageFrames.ts');
check(/canvas, video, iframe/.test(src) && /new WeakMap/.test(src) && /setInterval\(schedule, 2500\)/.test(src), 'screens of pictures and video are skipped, and layers that fill up later are looked at again');

section('4. The admin screen: where people heard about NOOB');
const panel = read('src/components/Modals/AdminSignupSourcesPanel.tsx'), admin = read('src/components/Modals/AdminControlModal.tsx');
check(percent(1, 4) === 25 && percent(0, 0) === 0 && percent(2, 3) === 67, 'percentages');
check(/rpc\('admin_signup_sources'\)/.test(panel) && /data-testid="signup-source-row"/.test(panel) && /What people typed under/.test(panel) && /Refresh/.test(panel), 'bars per place, what people typed under "Somewhere else", a refresh button');
check(/activeTab === 'signupSources' && main \?/.test(admin) && /Where from/.test(admin) && /'signupSources' \| 'userLogs'/.test(admin), 'it is a tab of the admin panel ("Where from"), for the main administrator only');

section('5. The tutor and pictures');
const fn = read('supabase/functions/study-ai/index.ts');
check(/opts\.vision \? \[\.\.\.buildProviders\(\)\]\.sort\(\(a, b\) => \(b\.id === 'gemini' \? 1 : 0\) - \(a\.id === 'gemini' \? 1 : 0\)\)/.test(fn), 'a photo question asks Gemini (best at reading pictures) first');
check(/attempts: opened\.tried\.slice\(0, 12\)/.test(fn), 'when no provider answers, the answer lists which models were tried and what they said (no keys), so it can be diagnosed');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
