// The website's security settings stay strict: the headers (public/_headers), the way to report a problem, the automatic checks on GitHub, and the migration that closed the two
// holes the database audit found. (The database itself is audited by scripts/security-audit-db.mjs.) Usage: node scripts/supabase/test-security-config.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const headers = read('public/_headers');
// the block of the whole site: from "/*" to the next blank line
const site = (/^\/\*\n([\s\S]*?)\n\n/m.exec(headers) || [])[1] || '';
const csp = (/Content-Security-Policy: (.*)/.exec(site) || [])[1] || '';
const scriptSrc = (/script-src ([^;]*)/.exec(csp) || [])[1] || '';

section('1. Headers of every page');
check(/X-Frame-Options: DENY/.test(site) && /frame-ancestors 'none'/.test(csp), 'the app cannot be shown inside another site');
check(/X-Content-Type-Options: nosniff/.test(site) && /Referrer-Policy: strict-origin-when-cross-origin/.test(site), 'no guessing of file types, no full addresses sent on');
check(/Strict-Transport-Security: max-age=63072000; includeSubDomains; preload/.test(site), 'https is demanded for two years, for every sub-address, and the site can join the browsers\' built-in list');
check(/Cross-Origin-Opener-Policy: same-origin-allow-popups/.test(site), 'a page opened by NOOB or opening NOOB cannot reach back into it');
check(/X-Permitted-Cross-Domain-Policies: none/.test(site), 'old plug-ins (Flash, PDF) are told they may read nothing');
check(/Permissions-Policy:/.test(site) && /payment=\(\)/.test(site) && /usb=\(\)/.test(site) && /interest-cohort=\(\)/.test(site) && /browsing-topics=\(\)/.test(site), 'the browser features the app never uses are switched off');
check(!/'unsafe-inline'|'unsafe-eval'/.test(scriptSrc) && /script-src 'self'/.test(csp), 'scripts: only the site\'s own files (no inline scripts, no eval)', scriptSrc);
check(/default-src 'self'/.test(csp) && /object-src 'none'/.test(csp) && /base-uri 'self'/.test(csp) && /form-action 'self'/.test(csp), 'everything else defaults to the site itself; no plug-in objects, no base-address tricks, forms go nowhere else');
check(/upgrade-insecure-requests/.test(csp) && /manifest-src 'self'/.test(csp) && /worker-src 'self' blob:/.test(csp), 'a plain-http picture is fetched over https; the manifest and workers come from the site');
check(!/\*\.\*|connect-src[^;]*\s\*(\s|;)/.test(csp), 'the places the app may talk to are named, never "anywhere"');

section('2. How to report a problem');
const sec = read('public/.well-known/security.txt');
check(/^Contact: https:\/\//m.test(sec) && /^Expires: 20(2[7-9]|3\d)-/m.test(sec) && /^Canonical: https:\/\/noobsocials\.com\//m.test(sec), 'security.txt names a contact, an expiry date in the future and its own address');
check(read('public/security.txt').includes('Contact:') && fs.existsSync('../../SECURITY.md'), 'the same file at /security.txt, and a SECURITY.md in the repository');
check(!/@[a-z0-9-]+\.[a-z]{2,}/i.test(sec.replace(/https:\/\/[^\s]+/g, '')), 'no personal e-mail address is published in it');

section('3. Automatic checks on GitHub');
const wf = read('../../.github/workflows/security.yml');
check(/node scripts\/security-audit-db\.mjs/.test(wf) && /npm audit --omit=dev --audit-level=high/.test(wf) && /gitleaks/.test(wf) && /codeql-action\/analyze/.test(wf), 'the database audit, the package audit, the secret scan and CodeQL run');
check(/cron:/.test(wf) && /pull_request:/.test(wf) && /permissions:\s*\n\s+contents: read/.test(wf), 'on every push and pull request and every week, with read-only rights');
check(/package-ecosystem: "npm"/.test(read('../../.github/dependabot.yml')), 'Dependabot watches the packages');

section('4. The database hardening');
const mig = read('supabase/migrations/20261022000004_security_hardening.sql');
check(/create or replace function public\.resolve_login_email/.test(mig) && /u\.email like '%@users\.nooob\.xyz' or coalesce\(u\.encrypted_password, ''\) <> ''/.test(mig), 'a visitor can no longer turn a User ID into a Google account\'s real e-mail address');
check(/revoke execute on function public\.ensure_daily_challenge\(date\) from public, anon, authenticated/.test(mig), 'nobody can fill Daily NOOB with made-up days');
check(/like 'admin\\_%' escape '\\'/.test(mig) && /revoke execute on function %s from public, anon/.test(mig), 'no admin function is open to visitors who are not logged in');
const audit = read('scripts/security-audit-db.mjs');
check(/LOCKED IN A MIGRATION BUT STILL CALLABLE/.test(audit) && /ADMIN FUNCTION CALLABLE WITHOUT LOGIN/.test(audit) && /TABLE WITHOUT ROW-LEVEL SECURITY/.test(audit), 'the audit looks for all of it, so the next mistake is caught the day it is made');

section('5. Nothing secret in the repository');
const tracked = read('.env.production');
check(/VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_/.test(tracked) && !/service_role|sb_secret_|SECRET|PRIVATE/i.test(tracked.replace(/#.*$/gm, '')), 'the only key in the repository is the public one');
check(!/sourcemap\s*:\s*true/.test(read('vite.config.ts')), 'the published files carry no source maps');

section('5b. Profile privacy and the Live Lounge rules');
{
  const m5 = read('supabase/migrations/20261022000005_profile_privacy_and_lounge_rls.sql');
  check(/revoke select on public\.profiles from authenticated/.test(m5) && /column_name not in \('pro_billing', 'pro_auto_renew', 'pro_renews_at', 'purchased_item_ids'\)/.test(m5), 'the Pro renewal, billing, auto-renew and shop purchase columns are closed to other people');
  check(/lounge_is_host/.test(m5) && /lounge_is_member/.test(m5) && /lounge_is_admitted/.test(m5) && /grant select on public\.live_lounge_rooms, public\.live_lounge_room_participants, public\.live_lounge_room_chat to authenticated/.test(m5), 'the Live Lounge rules ask small functions instead of each other, so they no longer loop');
  check(/CLOSED_PROFILE_COLUMNS/.test(read('scripts/security-audit-db.mjs')), 'the audit watches the profile columns, so a new column cannot be forgotten');
}

section('6. Links people type, and where a notification leads');
{
  const src = read('src/utils/safeUrl.ts');
  const fn = new Function(src.replace('export function', 'function').replace('(value?: string | null): string | null', '(value)').replace(/const MAX_LENGTH/, 'var MAX_LENGTH') + '\nreturn safeExternalUrl;')();
  check(fn('https://example.com/page?a=1') === 'https://example.com/page?a=1' && fn('example.com') === 'https://example.com/' && fn('  http://example.com  ') === 'http://example.com/' && fn('example.com:8080/x') === 'https://example.com:8080/x', 'a normal web address stays a link (a bare one gets https://)');
  check(fn('javascript:alert(1)') === null && fn('JaVaScRiPt:alert(1)') === null && fn('data:text/html,<script>1</script>') === null && fn('vbscript:x') === null && fn('file:///etc/passwd') === null && fn('ftp://example.com') === null, 'javascript:, data:, vbscript:, file: and ftp: are never links');
  check(fn('https://trusted.com@evil.com') === null && fn('https://exa mple.com') === null && fn('https://a.com/\u0000') === null && fn('') === null && fn(null) === null && fn('https://' + 'a'.repeat(3000) + '.com') === null, 'no user-name tricks, no spaces or hidden characters, nothing empty or enormous');
  const post = read('src/components/Feed/PostCard.tsx'), reel = read('src/components/Reels/ReelsView.tsx'), prof = read('src/components/Profile/ProfileView.tsx');
  check(/href=\{safeExternalUrl\(post\.webLink\) as string\}/.test(post) && /href=\{safeExternalUrl\(reel\.webLink\) as string\}/.test(reel) && /href=\{safeExternalUrl\(targetUser\.website\) as string\}/.test(prof), 'the web link of a post, of a reel and the website of a profile all go through it');
  const sw = read('public/sw.js');
  check(/ownSite\.test\(u\.hostname\)/.test(sw) && /let targetUrl = '\/'/.test(sw), 'a notification only ever opens a page of NOOB itself');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
