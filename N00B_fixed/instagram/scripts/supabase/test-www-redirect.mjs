// The website's Worker: www.noobsocials.com is redirected (301) to noobsocials.com, path and query kept, before anything else. Everything else on the apex and the games address is untouched.
// Usage: node scripts/supabase/test-www-redirect.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };

const worker = (await import(pathToFileURL(path.resolve('worker/index.js')).href)).default;
let assetCalls = [];
const env = { ASSETS: { fetch: async (r) => { assetCalls.push(new URL(r.url).pathname); return new Response('<html>app</html>', { status: 200, headers: { 'content-type': 'text/html' } }); } } };
const ctx = { waitUntil() {} };
const run = (url, init = {}) => { assetCalls = []; return worker.fetch(new Request(url, init), env, ctx); };

console.log('\nwww goes to the apex');
let r = await run('https://www.noobsocials.com/');
check(r.status === 301 && r.headers.get('location') === 'https://noobsocials.com/', 'the home page: 301 to https://noobsocials.com/', r.headers.get('location'));
r = await run('https://www.noobsocials.com/profile/ann?x=1&y=a%20b#frag');
check(r.status === 301 && r.headers.get('location') === 'https://noobsocials.com/profile/ann?x=1&y=a%20b', 'path and query are kept', r.headers.get('location'));
r = await run('https://www.noobsocials.com/m/posts/a.jpg');
check(r.status === 301 && r.headers.get('location') === 'https://noobsocials.com/m/posts/a.jpg', '/m/ files too (they are served from the apex)');
r = await run('https://www.noobsocials.com/__geo');
check(r.status === 301 && r.headers.get('location') === 'https://noobsocials.com/__geo', '/__geo too');
r = await run('https://www.noobsocials.com/', { method: 'HEAD' });
check(r.status === 301, 'HEAD is redirected');
check(assetCalls.length === 0, 'nothing is served from the site files on www');
r = await run('https://www.noobsocials.com/x', { method: 'POST', body: 'a' });
check(r.status !== 301, 'a POST is not redirected (reading requests only)');
r = await run('https://www.noobsocials.com/', { headers: { 'user-agent': 'GPTBot' } });
check(r.status === 301, 'the redirect comes before the AI-program gate');

console.log('\nthe apex and other hosts are untouched');
r = await run('https://noobsocials.com/');
check(r.status === 200 && assetCalls.includes('/'), 'the apex still serves the app');
r = await run('https://noobsocials.com/__geo');
check(r.status === 200 && /"country"/.test(await r.text()), '/__geo on the apex still answers');
r = await run('https://games.noobsocials.com/');
check(r.status === 200, 'the games address still serves its hub');
r = await run('https://games.noobsocials.com/profile');
check(r.status === 404, 'the games address still refuses app pages');
r = await run('https://www.noobsocials.com.evil.example/');
check(r.status !== 301, 'another site whose name starts with www.noobsocials.com is left alone');
r = await run('https://www.nooob.xyz/');
check(r.status !== 301, 'the old address is not touched by this rule');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
