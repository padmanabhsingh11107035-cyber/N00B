// Tests the admin panel that runs on the admin's own computer (scripts/admin-local.mjs): what it serves, who can reach it, and what its status page says.
//   * it serves the built app (every page address gets the app's start page, a missing file is a real 404, nothing outside the app's folder is ever served)
//   * only this computer's own names are accepted (a web page on the internet can not talk to it through the browser), and it listens on 127.0.0.1 only
//   * the status page says in plain words whether the database works, is switched off by its host (with the host's own reason), or can not be reached
//
// Usage: node scripts/supabase/test-admin-local.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createAdminServer, checkEverything, statusPage, readBuildEnv } from '../admin-local.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);

const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'noob-admin-dist-'));
fs.mkdirSync(path.join(dist, 'assets'));
fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>NOOB app</title><div id="root"></div>');
fs.writeFileSync(path.join(dist, 'assets', 'a.js'), 'console.log(1)');
fs.writeFileSync(path.join(dist, 'assets', 'b.css'), 'body{}');
fs.writeFileSync(path.join(dist, 'sw.js'), '// the website\'s own service worker that caches the app');
fs.writeFileSync(path.join(dist, 'secret-next-to-dist.txt'), 'x');
const outside = path.join(path.dirname(dist), 'noob-admin-outside.txt');
fs.writeFileSync(outside, 'must never be served');

const RESTRICTED_TEXT = JSON.stringify({ message: 'Service for this project is restricted due to the following violations: exceed_cached_egress_quota. The project owner must upgrade their plan or remove spend caps to restore service.' });
let dbAnswer = () => ({ ok: false, status: 402, text: async () => RESTRICTED_TEXT });
const fakeFetch = async (url) => {
  if (String(url).includes('/auth/v1/health')) return dbAnswer();
  if (String(url).endsWith('/version.json')) return { ok: true, status: 200, text: async () => '{"buildId":1}' };
  throw new Error('unexpected ' + url);
};
const env = { VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'k' };
const server = createAdminServer({ dist, env, fetchImpl: fakeFetch, port: 0 });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port, address } = server.address();

const get = (urlPath, { host = `127.0.0.1:${port}`, method = 'GET' } = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path: urlPath, method, headers: { host } }, (res) => {
    let body = ''; res.on('data', (c) => (body += c)); res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], headers: res.headers, body }));
  });
  req.on('error', reject); req.end();
});

section('1. It listens on this computer only');
check(address === '127.0.0.1', 'bound to 127.0.0.1 (another phone or computer on the network can not reach it)', address);

section('2. It serves the built app');
let r = await get('/');
check(r.status === 200 && /text\/html/.test(r.type) && r.body.includes('NOOB app'), 'the start page');
r = await get('/assets/a.js');
check(r.status === 200 && /javascript/.test(r.type) && r.body === 'console.log(1)', 'a script, with the right type');
r = await get('/assets/b.css');
check(r.status === 200 && /text\/css/.test(r.type), 'a style file, with the right type');
r = await get('/admin/anything/at/all');
check(r.status === 200 && r.body.includes('NOOB app'), 'any page address of the app gets the app (it reads the address itself)');
r = await get('/assets/missing.js');
check(r.status === 404, 'a missing script is a real 404 (not the start page in its place)');
r = await get('/sw.js');
check(r.status === 200 && /unregister/.test(r.body) && !/caches the app/.test(r.body), "the website's service worker is never handed out here (it would keep an old copy of the app on this address)");
check(r.headers['cache-control'] === 'no-store', 'nothing is kept by the browser: always the copy that is in the folder');
r = await get('/', { method: 'POST' });
check(r.status === 405, 'only reading is allowed');

section('3. Nothing outside the app is served');
for (const p of ['/..%2fnoob-admin-outside.txt', '/%2e%2e/noob-admin-outside.txt', '/..%2f..%2f..%2fWindows%2fwin.ini', '/assets/..%2f..%2fnoob-admin-outside.txt']) {
  r = await get(p);
  check(r.status !== 200 || !r.body.includes('must never be served'), `${decodeURIComponent(p)} is refused`, `${r.status}`);
}
r = await get('/%00');
check(r.status !== 200 || !r.body.includes('must never be served'), 'a null byte gets nothing either');

section('4. Only this computer\'s own names are accepted');
for (const h of ['evil.example.com', 'evil.example.com:5757', '127.0.0.1.evil.com', 'localhost.evil.com']) {
  r = await get('/', { host: h });
  check(r.status === 403, `a request that arrives under the name "${h}" is refused (DNS rebinding)`);
}
for (const h of [`localhost:${port}`, `127.0.0.1:${port}`, 'localhost']) {
  r = await get('/', { host: h });
  check(r.status === 200, `"${h}" is this computer: served`);
}

section('5. The status page');
r = await get('/__noob/status.json');
let j = JSON.parse(r.body);
const db = j.checks.find((c) => c.id === 'database');
check(r.status === 200 && j.overall === 'restricted' && db.state === 'restricted', 'the database switched off by its host is recognised as that (not as "down")');
check(/exceed_cached_egress_quota/.test(db.detail) && /upgrade the plan or remove the spend cap/.test(db.fix), "the host's own reason is shown, with what to do about it");
check(j.checks.find((c) => c.id === 'website').state === 'ok', 'the website is checked too, apart from the database');
r = await get('/__noob/status');
check(/SWITCHED OFF/.test(r.body) && /exceed_cached_egress_quota/.test(r.body) && /Open the admin panel/.test(r.body) && /refresh/.test(r.body), 'the page says SWITCHED OFF, shows the reason, offers the panel, and checks again by itself');
check(!/<script/i.test(r.body), 'and it has no script in it');
dbAnswer = () => ({ ok: true, status: 200, text: async () => '{}' });
j = JSON.parse((await get('/__noob/status.json')).body);
check(j.overall === 'database-ok' && j.checks[0].state === 'ok', 'a working database: good news, the panel will work even if the website does not');
r = await get('/__noob/status');
check(/Good news/.test(r.body) && /WORKING/.test(r.body), 'in words, on the page');
dbAnswer = () => { throw new Error('getaddrinfo ENOTFOUND'); };
j = JSON.parse((await get('/__noob/status.json')).body);
check(j.checks[0].state === 'unreachable' && j.overall === 'database-not-ok', 'no connection: "can not reach", with what to check');
dbAnswer = () => ({ ok: false, status: 502, text: async () => 'bad gateway' });
j = JSON.parse((await get('/__noob/status.json')).body);
check(j.checks[0].state === 'down', 'an error answer from the host: "down"');
check(!JSON.stringify(j).includes('"k"') && !/apikey/i.test(statusPage(j, port)), 'the key is never shown on the page');
const noEnv = await checkEverything({ env: {}, fetchImpl: fakeFetch });
check(noEnv.checks[0].state === 'unknown' && /\.env\.production/.test(noEnv.checks[0].fix), 'without the project\'s .env.production it says what is missing');
check(/<script>alert/.test(statusPage({ checkedAt: new Date().toISOString(), overall: 'x', checks: [{ id: 'a', name: '<script>alert(1)</script>', state: 'ok', say: 'x' }] }, 1)) === false, 'text from outside is escaped on the page');

section('6. The build values and the launcher');
const envDir = fs.mkdtempSync(path.join(os.tmpdir(), 'noob-admin-env-'));
fs.writeFileSync(path.join(envDir, '.env.production'), 'VITE_SUPABASE_URL=https://abc.supabase.co\nVITE_SUPABASE_PUBLISHABLE_KEY="pk_123"\nOTHER=1\n');
const be = readBuildEnv(envDir);
check(be.VITE_SUPABASE_URL === 'https://abc.supabase.co' && be.VITE_SUPABASE_PUBLISHABLE_KEY === 'pk_123' && !('OTHER' in be), 'it reads only the two public values the website was built with');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const cmd = fs.readFileSync('Start-Admin-Panel.cmd', 'utf8');
check(pkg.scripts['admin:local'] === 'node scripts/admin-local.mjs' && /scripts\\admin-local\.mjs/.test(cmd) && /127\.0\.0\.1:5757/.test(cmd), 'npm run admin:local and a double-click launcher (Start-Admin-Panel.cmd) both start it');

server.close();
fs.rmSync(dist, { recursive: true, force: true });
fs.rmSync(envDir, { recursive: true, force: true });
fs.rmSync(outside, { force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
