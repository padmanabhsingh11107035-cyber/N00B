// The loading page (src/components/Common/NoobStackLoader.tsx): NOOB's character hopping on a card, a quote, and a progress ring with the REAL start-up progress.
// Checks: nothing of the old burger loader is left, the quote list rules, the progress store, the component keeps its name and props, reduced motion, App.tsx marks the five steps.
// Usage: node scripts/supabase/test-loading-page.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const load = async (p) => {   // a TypeScript file with no imports of its own, run as it is
  const out = ts.transpileModule(read(p), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(out).toString('base64'));
};
const walk = (d, acc = []) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p, acc); else acc.push(p); } return acc; };

const loader = read('src/components/Common/NoobStackLoader.tsx');
const css = read('src/components/Common/noobLoader.css');
const app = read('src/App.tsx');

section('1. The old burger loader is gone');
const srcFiles = walk('src').filter((f) => /\.(tsx?|css)$/.test(f));
const old = srcFiles.filter((f) => /nsl-(in|drop|shadow|spark|msg|fast|twinkle)|QUICK_LAYER_MS|BurgerLoading|BurgerSmall|TabBurgerLoading|Toasting the NOOB bun|Counting the likes/.test(read(f)));
check(old.length === 0, 'no burger / stack code or class names left in src/', old.join(', '));
check(!fs.existsSync('src/components/Common/BurgerLoading.tsx') && !fs.existsSync('scripts/supabase/test-stack-loader.mjs'), 'the old burger file and its old test are deleted');
check(!/burger/i.test(read('src/components/Common/LoadingPages.tsx')) && !/\bburger\b/i.test(loader), 'no burger wording in the loading files');
check(!/\.nsl-/.test(read('src/index.css')), 'its CSS is out of index.css');
check(!/BurgerLoading|NoobStackLoader/.test(read('public/sw.js')) && !/nsl-|burger/i.test(read('index.html')), 'no old loader in the service worker or index.html');

section('2. The component keeps its name and props; a small ring exists');
check(/export const NoobStackLoader: React\.FC<NoobStackLoaderProps>/.test(loader) && /title\?: string;/.test(loader) && /subtitle\?: string;/.test(loader) && /mode\?: 'quick';/.test(loader), 'NoobStackLoader keeps its export name and the title / subtitle / mode props');
check(/export const NoobSpinner/.test(loader) && /nl-spinner/.test(css), 'a separate thin NoobSpinner is exported');
check(/NoobSpinner/.test(read('src/components/Settings/kit.tsx')) && /NoobSpinner/.test(read('src/components/Common/LoadingPages.tsx')), 'small waiting spots (inside a page, the bottom-bar pages, a window) use the small ring');
check(/<NoobStackLoader mode="quick" tracked \/>/.test(app) && /subtitle="Signing you in…"/.test(read('src/components/Auth/AuthView.tsx')), 'the full-screen call sites (start-up, signing in) show the full loading page');
check(/fixed|position: fixed/.test(css) && /edge-own/.test(loader) && /var\(--sat, 0px\)/.test(css) && /safe-area-inset-bottom/.test(css), 'a full-screen layer that reaches the edges and keeps clear of the clock and home bar');
check(/#0A0A0A/.test(css) && /max-width: 360px/.test(css) && /border-radius: 28px/.test(css) && /#1B1B1F, #0B0B0D/.test(css) && /rgba\(255, 255, 255, \.08\)/.test(css), 'the card: near-black page, 360 px wide, 28 px corners, soft gradient, hairline border');
check(/R = 19/.test(loader) && /strokeWidth="3"/.test(loader) && /width: 44px/.test(css) && /#FF4D9A/.test(loader) && /#FF8A3D/.test(loader), 'the ring: 44 px, 3 px line, pink to orange');
check(/noob-support-character\.png/.test(loader) && fs.existsSync('public/noob-support-character.png'), "NOOB's own character is the one that hops");
check(/#F8CB46/.test(loader) && /#FF5C8A/.test(loader) && /#8B5CF6/.test(loader) && /#FF8A3D/.test(loader), 'confetti in the app colours (pink, violet, orange, yellow)');

section('3. Light mode and reduced motion');
check(/:root\[data-theme="light"\] \.nl-layer \{ background: #F3F3F5/.test(css) && /:root\[data-theme="light"\] \.nl-card \{ background: #FFFFFF/.test(css) && /rgba\(0, 0, 0, \.1\)/.test(css), 'light mode: white card on #F3F3F5, dark text, dark ring track');
check(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.nl-runner[\s\S]*animation: none/.test(css) && /\.nl-arc \{ transition: none; \}/.test(css), 'with "reduce motion" the character and confetti stand still (the ring still fills)');
const anims = [...css.matchAll(/@keyframes (nl-[a-z]+) \{((?:[^{}]*\{[^{}]*\})+)\s*\}/g)];
check(anims.length === 6 && anims.every((m) => !/\b(top|left|width|height|margin)\s*:/.test(m[2])), 'the animations only move/fade (transform and opacity)');
check(/animation: nl-appear \.2s ease-out 400ms both/.test(css), 'nothing is seen for the first 400 ms (a quick load never flashes the page)');
check(/FADE_MS = 250/.test(loader) && /SLOW_AFTER_MS = 8000/.test(loader) && /Slow connection… still loading/.test(loader), 'fades out in 250 ms; after 8 seconds it says "Slow connection… still loading"');

section('4. The quotes');
const qsrc = read('src/data/loadingQuotes.ts');
const qmod = await load('src/data/loadingQuotes.ts');
const Q = qmod.LOADING_QUOTES;
const allowed = new Set(['Lao Tzu', 'Confucius', 'Seneca', 'Marcus Aurelius', 'Aesop', 'Benjamin Franklin', 'Ralph Waldo Emerson', 'Abraham Lincoln', 'Mark Twain', 'Henry David Thoreau', 'Goethe', 'Leonardo da Vinci', 'William Shakespeare', 'Rabindranath Tagore', 'Swami Vivekananda', 'NOOB']);
check(Q.length >= 40, `at least 40 quotes (${Q.length})`);
check(Q.every((q) => typeof q.text === 'string' && q.text.trim() && typeof q.author === 'string' && q.author.trim()), 'every quote has text and an author');
check(Q.every((q) => q.text.length <= 90), 'every quote is 90 characters or less', String(Math.max(...Q.map((q) => q.text.length))));
check(new Set(Q.map((q) => q.text.toLowerCase())).size === Q.length, 'no duplicates');
check(Q.every((q) => allowed.has(q.author)), 'only the allowed authors (public-domain authors and NOOB)', [...new Set(Q.map((q) => q.author).filter((a) => !allowed.has(a)))].join(', '));
check(Q.filter((q) => q.author === 'NOOB').length >= 8 && Q.filter((q) => q.author !== 'NOOB').length >= 20, 'a good mix of classic lines and NOOB lines');
check(!/Helen Keller|Pixar|Disney|Marvel|Naruto|Ratatouille|Rocky/i.test(qsrc), 'no film / song / recent-author lines');
let seen = null, same = 0;
for (let n = 0; n < 4000; n++) { const i = qmod.pickQuoteIndex(Q.length, seen, Math.random); if (i === seen || i < 0 || i >= Q.length) same++; seen = i; }
check(same === 0, 'the pick is never the same as last time and always in range');
check(qmod.pickQuoteIndex(Q.length, 3, () => 3 / Q.length) !== 3 && qmod.pickQuoteIndex(1, 0) === 0, 'even when the random number lands on last time\'s one, another is taken');
check(/localStorage\.getItem\(LAST_QUOTE_KEY\)/.test(qsrc) && /localStorage\.setItem\(LAST_QUOTE_KEY/.test(qsrc) && (qsrc.match(/try \{/g) || []).length >= 2, 'last time\'s number is remembered in localStorage, inside try/catch');

section('5. The progress store (real progress)');
const P = await load('src/utils/loadProgress.ts');
check(JSON.stringify(P.LOAD_STEPS) === JSON.stringify(['account', 'posts', 'stories', 'reels', 'notifications']), 'five named steps: account, posts, stories, reels, notifications');
P.resetLoadProgress();
const seenPct = [P.targetPercent(P.getLoadProgress())];
check(seenPct[0] === 8, 'nothing done = 8 %');
let calls = 0; const unsub = P.subscribeLoadProgress(() => { calls++; });
for (const s of P.LOAD_STEPS) { P.markLoadStep(s); seenPct.push(P.targetPercent(P.getLoadProgress())); }
P.markLoadStep('account');
check(calls === 5, 'every step tells the listeners once (marking a step twice changes nothing)', String(calls));
check(seenPct.every((v, i) => i === 0 || v > seenPct[i - 1]) && seenPct[5] === 96, `steps map to 8..96 and only go up (${seenPct.map((v) => Math.round(v * 10) / 10).join(', ')})`);
check(P.getLoadProgress().done === 5 && !P.getLoadProgress().finished, 'five done, not finished yet');
P.finishLoadProgress();
check(P.targetPercent(P.getLoadProgress()) === 100 && P.nextPercent(50, P.getLoadProgress(), 16) === 100, 'ready = 100 %');
unsub();
P.resetLoadProgress();
let v = 8, backwards = 0, prev = 8;
const states = [0, 1, 2, 3, 4, 5].map((d) => ({ done: d, total: 5, finished: false }));
for (let t = 0; t < 6000; t++) { const st = states[Math.min(5, Math.floor(t / 1000))]; v = P.nextPercent(v, st, 16); if (v < prev - 1e-9) backwards++; prev = v; }
check(backwards === 0 && v <= 96 && v > 90, `the shown number never goes backwards and never passes 96 before the app is ready (ends at ${v.toFixed(1)})`);
const stuck = { done: 1, total: 5, finished: false };
let w = P.targetPercent(stuck); const w0 = w;
for (let t = 0; t < 600; t++) w = P.nextPercent(w, stuck, 16);
check(w > w0 && w < P.targetPercent({ done: 2, total: 5, finished: false }), 'while waiting it creeps slowly (never looks frozen) but does not run ahead of the next step', `${w0} -> ${w.toFixed(2)}`);

section('6. App.tsx reports the five steps');
for (const [p, step] of [['userP', 'account'], ['postsP', 'posts'], ['trayP', 'stories'], ['reelsP', 'reels'], ['notifP', 'notifications']]) {
  check(new RegExp(`${p}\\.then\\(stepDone\\('${step}'\\), stepDone\\('${step}'\\)\\)`).test(app), `${p} marks "${step}" when it settles (worked or failed)`);
}
check(/resetLoadProgress\(\);/.test(app) && /finishLoadProgress\(\);/.test(app), 'a new start-up resets the steps and the finished app completes them');
check(/const \[user, pList, trayData, rList, notifRes\] = await Promise\.all\(\[userP, postsP, trayP, reelsP, notifP\]\);/.test(app) && /const earlyUser = await userP;/.test(app), 'the data logic is untouched (same promises, same Promise.all)');
check(/if \(initialLoadFailed\) \{[\s\S]{0,200}<SystemPage kind="down" onRetry=\{loadInitialData\} \/>/.test(app), 'the failure page with its Retry button is unchanged');

section('7. House rules');
const mine = [loader, css, qsrc, read('src/utils/loadProgress.ts'), read('src/components/Common/LoadingPages.tsx')].join('\n');
check(!/\bavatar\b/i.test(mine), 'the word "avatar" is not used in these files');
check(!/instagram|snapchat|whatsapp|tiktok|pixar|disney|blinkit/i.test(mine), "no other company's name in these files");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
