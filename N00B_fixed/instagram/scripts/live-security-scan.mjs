// WEEKLY LIVE SECURITY SCAN (run by .github/workflows/security-weekly.yml, also by hand): looks at the real website from the outside, like a stranger would, and fails if
// something that is protected today stops being protected. Read-only: it changes nothing and creates nothing.
//   node scripts/live-security-scan.mjs [https://noobsocials.com]
import tls from 'node:tls';
import dns from 'node:dns/promises';

const SITE = (process.argv[2] || 'https://noobsocials.com').replace(/\/$/, '');
const HOST = new URL(SITE).hostname;
let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };

console.log('Page security headers');
const res = await fetch(SITE + '/', { redirect: 'manual' });
const h = (n) => res.headers.get(n) || '';
check(res.status === 200, 'the site answers', `(status ${res.status})`);
check(/max-age=\d{7,}/.test(h('strict-transport-security')) && /includeSubDomains/i.test(h('strict-transport-security')), 'HTTPS is forced (HSTS, long, all subdomains)');
check(/default-src 'self'/.test(h('content-security-policy')) && /object-src 'none'/.test(h('content-security-policy')) && /frame-ancestors 'none'/.test(h('content-security-policy')), 'content security policy: own files only, no plug-ins, nobody can frame the site');
check(!/script-src[^;]*'unsafe-inline'/.test(h('content-security-policy')) && !/script-src[^;]*'unsafe-eval'/.test(h('content-security-policy')), 'no inline or eval scripts allowed');
check(h('x-content-type-options').toLowerCase() === 'nosniff' && h('x-frame-options').toUpperCase() === 'DENY', 'no sniffing, no clickjacking');
check(/strict-origin/.test(h('referrer-policy')), 'the address of the page is not leaked to other sites');

console.log('\nEncryption: old TLS versions must be refused');
const oldTls = (v) => new Promise((resolve) => {
  const s = tls.connect({ host: HOST, port: 443, servername: HOST, minVersion: v, maxVersion: v, timeout: 15000 }, () => { s.end(); resolve(true); });
  s.on('error', () => resolve(false)); s.on('timeout', () => { s.destroy(); resolve(false); });
});
check(!(await oldTls('TLSv1')), 'TLS 1.0 refused');
check(!(await oldTls('TLSv1.1')), 'TLS 1.1 refused');
check(await oldTls('TLSv1.3'), 'TLS 1.3 works');

console.log('\nFiles that must never be public');
for (const p of ['.env', '.git/config', 'wrangler.toml', 'supabase/config.toml', 'package.json', 'backup.zip']) {
  const r = await fetch(`${SITE}/${p}`);
  const t = (await r.text()).slice(0, 400);
  check(!/SUPABASE_SERVICE|service_role|\[core\]|repositoryformatversion|"dependencies"|\[env\]|^name\s*=/m.test(t), `/${p} does not expose anything`);
}

console.log('\nEmail spoofing protection');
// asks public resolvers directly, so an old copy cached on this computer's resolver can not give a stale answer
const resolver = new dns.Resolver(); resolver.setServers(['1.1.1.1', '8.8.8.8']);
const txt = async (n) => { try { return (await resolver.resolveTxt(n)).map((a) => a.join('')); } catch { return []; } };
const dmarc = (await txt('_dmarc.' + HOST)).find((t) => t.startsWith('v=DMARC1')) || '';
check(/p=(quarantine|reject)/.test(dmarc), 'DMARC says fake mail from our domain is quarantined or rejected', dmarc);
check((await txt(HOST)).some((t) => /^v=spf1 .*-all$/.test(t)), 'SPF: the main domain sends no mail');

console.log('\nMozilla Observatory grade');
try {
  const r = await fetch(`https://observatory-api.mdn.mozilla.net/api/v2/scan?host=${HOST}`, { method: 'POST' });
  const d = await r.json();
  check(/^A/.test(d.grade || ''), `grade is A or better`, `(got ${d.grade})`);
} catch (e) { console.log('  note  Observatory could not be reached this time (' + e.message + ') - not counted as a failure'); }

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
