// The Pro plan cards: five glossy cards, the name and the price each on their own line (nothing side by side that can overlap), the features under the card in a white panel, and the buy button.
// Usage: node scripts/supabase/test-pro-cards.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';

let passed = 0, failed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label}`); } };

const out = path.resolve('node_modules/.cache-pro-cards.mjs');
buildSync({ entryPoints: [path.resolve('src/components/Profile/ProFeaturesModal.tsx')], bundle: true, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', outfile: out, logLevel: 'error', define: { 'import.meta.env': '{"VITE_SUPABASE_URL":"http://localhost","VITE_SUPABASE_ANON_KEY":"x","MODE":"test","DEV":false,"PROD":true,"BASE_URL":"/"}' } });
const M = await import(pathToFileURL(out).href);
const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');
const src = fs.readFileSync('src/components/Profile/ProFeaturesModal.tsx', 'utf8');

const html = renderToStaticMarkup(React.createElement(M.ProFeaturesModal, { currentUser: { id: 'u1', username: 'a', displayName: 'A', noobPoints: 5 }, onClose() {}, allUsers: [] }));
console.log('\n1. The cards');
check(['starter', 'plus', 'pro', 'elite', 'ultimate'].every((t) => html.includes(`data-testid="pro-card-${t}"`)), 'all five plans have a card');
check(!/aspect-\[1\.586\]/.test(html) && /aspect-\[1\.4\]/.test(html), 'the cards are taller, so the name and the price have room');
const cards = html.split('data-testid="pro-card-').slice(1).filter((c) => /^(starter|plus|pro|elite|ultimate)"/.test(c));
check(cards.length === 5, 'five card blocks found');
check(cards.every((c) => /NOOB PRO<\/p>/.test(c) && /tabular-nums whitespace-nowrap/.test(c) && /noobs/.test(c)), 'each card: NOOB, the plan name, then the price on its own line with "noobs" under it');
check(cards.every((c) => !/justify-between gap-2/.test(c.split('data-testid=')[0])), 'no name and price side by side in a row');
check(/radial-gradient\(120% 75% at 10% -12%/.test(html) && /rgba\(255,255,255,0\.7\) 44%/.test(html) && /repeating-linear-gradient\(90deg/.test(html) && /conic-gradient\(from 200deg/.test(html), 'metal and glossy: a sweep of light and dark bands, a brushed grain, a bright spot and a sharp streak of light');
check(!/#(3b82f6|1d4ed8|2563eb|8b5cf6|5b21b6|7c3aed)/i.test(src.slice(src.indexOf('const metal'), src.indexOf('export const ProFeaturesModal'))), 'no blue or violet in the card colours');
check(/background:#fbbf24;color:#3b2a00/.test(html) && />Save 17%</.test(html), 'the "Save 17%" tag is always shown, in its own colour, whichever of Monthly and Yearly is chosen');

console.log('\n2. The features and the buy button');
check(/data-testid="pro-card-detail"/.test(html) && /WHAT YOU GET WITH/.test(html) && /Choose /.test(html) && /data-testid="pro-choose"/.test(html), 'the features are listed under the card, with the buy button');
check(/style="background:#ffffff"/.test(html), 'the features panel is a real white (the Pro page turns plain white classes black)');
check(/Choose \$\{tier\.name\}/.test(src) && /setPayTier\(tier\)/.test(src), 'the button still opens the same payment sheet');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
