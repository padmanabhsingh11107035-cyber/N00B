// "Send to Calculator": a Calculator button in the Share sheet; the calculator opens and says what was sent (Post, Reel or Video), nothing more.
// Usage: node scripts/supabase/test-send-to-calculator.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';

let passed = 0, failed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const env = { 'import.meta.env': '{"VITE_SUPABASE_URL":"http://localhost","VITE_SUPABASE_ANON_KEY":"x","MODE":"test","DEV":false,"PROD":true,"BASE_URL":"/"}' };
const load = async (entry, name) => { const out = path.resolve(`node_modules/.cache-${name}.mjs`); buildSync({ entryPoints: [path.resolve(entry)], bundle: true, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', outfile: out, logLevel: 'error', define: env }); return import(pathToFileURL(out).href); };
const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');

console.log('\n1. The calculator says what was sent');
const C = await load('src/components/Profile/CalculatorPage.tsx', 'calc-sent');
for (const [type, word] of [['post', 'Post'], ['reel', 'Reel'], ['video', 'Video']]) {
  const html = renderToStaticMarkup(React.createElement(C.CalculatorPage, { onClose() {}, sent: { type, itemId: 'x' } }));
  check(/data-testid="calc-sent"/.test(html) && html.includes(`${word} sent to Calculator`), `a ${type} sent here shows "${word} sent to Calculator"`);
}
check(!/data-testid="calc-sent"/.test(renderToStaticMarkup(React.createElement(C.CalculatorPage, { onClose() {} }))), 'opened the usual way, the calculator shows no such line');

console.log('\n2. The button and the wiring');
const share = read('src/components/Common/SharePostSheet.tsx'), app = read('src/App.tsx');
check(/data-testid="share-calculator"|testId="share-calculator"/.test(share) && /sendToCalculator\(\{ type, itemId \}\); onClose\(\);/.test(share), 'the Share sheet has a Calculator button that sends the post, reel or video and closes the sheet');
check(/onCalculatorSend\(\(item\) => setCalcSent\(item\)\)/.test(app) && /<CalculatorPage sent=\{calcSent\}/.test(app), 'the App listens once and opens the calculator on top of any page');
const U = await load('src/utils/calculatorSend.ts', 'calc-send-util');
let got = null; const g = globalThis; g.window = new EventTarget(); g.CustomEvent = class extends Event { constructor(t, o) { super(t); this.detail = o?.detail; } };
const stop = U.onCalculatorSend((i) => { got = i; });
U.sendToCalculator({ type: 'reel', itemId: 'r1' });
check(got && got.type === 'reel' && got.itemId === 'r1', 'sending reaches the listener');
got = null; U.sendToCalculator({ type: 'story', itemId: 's' }); check(got === null, 'a kind that is not a post, reel or video is ignored');
stop(); U.sendToCalculator({ type: 'post', itemId: 'p' }); check(got === null, 'after stopping, nothing is heard');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
