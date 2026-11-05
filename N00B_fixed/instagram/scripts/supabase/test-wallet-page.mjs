// The Wallet page (green card, one row for each action, tabs), drawn for real and checked against the real style sheet, in dark and in light.
// Usage: node scripts/supabase/test-wallet-page.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';

let passed = 0, failed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

const out = path.resolve('node_modules/.cache-wallet-page.mjs');
buildSync({ entryPoints: [path.resolve('src/components/Profile/AccountsStatisticsModal.tsx')], bundle: true, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', outfile: out, logLevel: 'error', define: { 'import.meta.env': '{"VITE_SUPABASE_URL":"http://localhost","VITE_SUPABASE_ANON_KEY":"x","MODE":"test","DEV":false,"PROD":true,"BASE_URL":"/"}' } });
const M = await import(pathToFileURL(out).href);
const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');

console.log('\n1. The page drawn for real');
const user = { id: 'ab12-cd34', username: 'sabbir', displayName: 'Sabbir Hossain', noobPoints: 1234567, followersCount: 7, noobTransactions: [{ id: 't1', reason: 'Won a game', amount: 50, timestamp: new Date().toISOString() }] };
const html = renderToStaticMarkup(React.createElement(M.AccountsStatisticsModal, { currentUser: user, allUsers: [], onClose() {}, onUserUpdated() {} }));
check(/class="wl fixed inset-0/.test(html) && /data-noob-keep="1"/.test(html), 'a full-screen page that the app\'s page-frame rule leaves alone');
check(/aria-label="Close"/.test(html) && /<h2 class="wl-title">Wallet<\/h2>/.test(html) && /aria-label="Show your QR code"/.test(html), 'back button, "Wallet" in the middle, the QR button');
check(/data-testid="wallet-card"/.test(html) && /Sabbir Hossain/.test(html) && /1\.2M|1,234,567/.test(html) && /Next milestone/.test(html), 'the green card shows the name, the balance and the next milestone');
check(/data-testid="wallet-actions"/.test(html) && />Send<\/button>/.test(html) && (html.match(/>Open<\/button>/g) || []).length === 2, 'Send, Requests and Coupons are one row each with a green button');
check(/role="tab"/.test(html) && /Overview/.test(html) && /Badges \(/.test(html) && /Transactions/.test(html), 'the three tabs are there');

const html2 = renderToStaticMarkup(React.createElement(M.AccountsStatisticsModal, { currentUser: { ...user, proTier: 'elite', proBilling: 'monthly', proAutoRenew: true, proRenewsAt: '2027-01-05T00:00:00Z' }, allUsers: [], onClose() {}, onUserUpdated() {} }));
check(/data-testid="wallet-plan-card"/.test(html2) && /ELITE|Elite/.test(html2) && /Sabbir Hossain/.test(html2) && /Auto-renew on/.test(html2), 'a bought plan shows its card with the name of the owner and when it renews');
check(!/data-testid="wallet-plan-card"/.test(html), 'no plan, no card');

console.log('\n2. Dark and light');
const css = read('src/index.css');
check(/\.wl \{[^}]*--wl-bg: #0a0e0c[^}]*--wl-surface: #141b17[^}]*--wl-text: #f2f7f4/.test(css), 'dark: a near-black green page with dark panels and light words');
check(/:root\[data-theme="light"\] \.wl \{[^}]*--wl-bg: #f3f8f5[^}]*--wl-surface: #ffffff[^}]*--wl-text: #0f1f18/.test(css), 'light: a mint page with white panels and dark words');
check(/\.wl-panel \{[^}]*background: var\(--wl-surface\)/.test(css) && /\.wl-row-title \{[^}]*color: var\(--wl-text\)/.test(css) && /\.wl-pill \{[^}]*background: var\(--wl-accent\)/.test(css), 'panels, words and buttons use those colours (nothing is white on white)');
check(!/class="[^"]*\b(bg-zinc-9|text-zinc-[2-4]00|bg-black)\b/.test(html), 'the page uses no fixed dark-only classes');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
