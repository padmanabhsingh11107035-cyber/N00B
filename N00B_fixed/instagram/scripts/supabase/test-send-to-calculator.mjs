// "Send to Calculator": a Calculator button in the Share sheet. Nothing opens: the kind of content (Post, Reel or Video) is put in the calculator's list, which shows
// "Reel sent to Calculator" the next time the calculator is opened. Usage: node scripts/supabase/test-send-to-calculator.mjs
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

// a phone's storage, for the test
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } };

console.log('\n1. What is kept');
const U = await load('src/utils/calculatorSend.ts', 'calc-send-util');
check(U.readCalculatorSent().length === 0, 'nothing sent: an empty list');
U.sendToCalculator({ type: 'reel', itemId: 'r1' });
U.sendToCalculator({ type: 'post', itemId: 'p1' });
U.sendToCalculator({ type: 'reel', itemId: 'r1' });
const l = U.readCalculatorSent();
check(l.length === 2 && l[0].type === 'reel' && l[1].type === 'post', 'the same reel sent twice is listed once, the newest first');
U.sendToCalculator({ type: 'story', itemId: 's' });
check(U.readCalculatorSent().length === 2, 'a kind that is not a post, reel or video is ignored');
for (let i = 0; i < 20; i++) U.sendToCalculator({ type: 'video', itemId: 'v' + i });
check(U.readCalculatorSent().length === 8, 'only the last 8 are kept');
U.clearCalculatorSent();
check(U.readCalculatorSent().length === 0, 'Clear empties the list');
store.set('noob.calc.sent.v1', '{not json'); check(U.readCalculatorSent().length === 0, 'a broken list is read as empty, not as an error');

console.log('\n2. The calculator says what was sent');
store.clear();
U.sendToCalculator({ type: 'reel', itemId: 'r1' }); U.sendToCalculator({ type: 'post', itemId: 'p1' });
const C = await load('src/components/Profile/CalculatorPage.tsx', 'calc-sent');
const html = renderToStaticMarkup(React.createElement(C.CalculatorPage, { onClose() {} }));
check(/data-testid="calc-sent"/.test(html) && html.includes('Reel sent to Calculator') && html.includes('Post sent to Calculator'), 'it lists "Reel sent to Calculator" and "Post sent to Calculator"');
store.clear();
check(!/data-testid="calc-sent"/.test(renderToStaticMarkup(React.createElement(C.CalculatorPage, { onClose() {} }))), 'with nothing sent, it looks as it always did');

console.log('\n3. The button');
const share = read('src/components/Common/SharePostSheet.tsx'), app = read('src/App.tsx');
check(/testId="share-calculator"/.test(share) && /sendToCalculator\(\{ type, itemId \}\); setCalcSent\(true\);/.test(share) && !/sendToCalculator\(\{ type, itemId \}\); [^}]*onClose\(\)/.test(share), 'the Calculator button sends it and says "sent", and nothing opens');
check(!/onCalculatorSend|<CalculatorPage/.test(app), 'the App no longer opens the calculator by itself');
check(/w-\[5rem\] shrink-0/.test(share) && /w-full text-\[10px\][^"]*truncate/.test(share), 'the names under the icons have room and are cut short instead of running into the next one');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
