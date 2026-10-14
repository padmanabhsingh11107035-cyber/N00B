// NOOB's web addresses (src/utils/siteUrl.ts): the website moves to a new .com for the Google Play release, and both addresses keep working meanwhile.
// Checks: both addresses (and www / ai. / coaching. under them) are "our own site", the main address comes from the build and can only be one of ours, the Android app
// (files on the phone) loads pictures and videos from the website's full address, and nothing spells the old address by hand where it matters.
// Usage: node scripts/supabase/test-site-domain.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const load = async (q = '') => import(pathToFileURL(path.resolve('src/utils/siteUrl.ts')).href + '?' + q + Math.random());

section('1. Which addresses are NOOB');
const S = await load();
check(S.SITE_DOMAINS.includes('noobsocials.com') && S.SITE_DOMAINS.includes('nooob.xyz'), 'both the new .com and the old .xyz are NOOB');
for (const h of ['noobsocials.com', 'www.noobsocials.com', 'ai.noobsocials.com', 'coaching.noobsocials.com', 'nooob.xyz', 'WWW.NOOB.xyz'.toLowerCase().replace('noob', 'nooob'), 'ai.nooob.xyz']) check(S.isOwnHost(h), `${h} is ours`);
for (const h of ['example.com', 'noobsocials.com.evil.io', 'evilnoobsocials.com', 'nooob.xyz.attacker.net', 'noob.xyz', '', null, undefined]) check(!S.isOwnHost(h), `${String(h)} is not ours`);

section('2. The main address comes from the build, and can only be one of ours');
check(S.MAIN_SITE === 'https://nooob.xyz', 'until the build says otherwise, the main address stays the old one (nothing changes by itself)');
globalThis.__env = {};
for (const [value, want] of [['https://noobsocials.com', 'https://noobsocials.com'], ['https://noobsocials.com/', 'https://noobsocials.com'], ['https://www.noobsocials.com', 'https://noobsocials.com'], ['https://evil.example', 'https://nooob.xyz'], ['not a url', 'https://nooob.xyz'], ['', 'https://nooob.xyz']]) {
  // import.meta.env is replaced by the build; here the file is read with the value written in
  const src = read('src/utils/siteUrl.ts').replace("(import.meta as any).env?.VITE_SITE_URL", JSON.stringify(value));
  const tmp = path.join(fs.mkdtempSync(path.join(process.env.TEMP || '.', 'noob-site-')), 'siteUrl.ts');
  fs.writeFileSync(tmp, src);
  const M = await import(pathToFileURL(tmp).href);
  check(M.MAIN_SITE === want, `VITE_SITE_URL "${value}" gives ${want}`, M.MAIN_SITE);
  fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
}

section('3. Links that are shown or shared');
{
  const make = async (hostname, native = false) => {
    globalThis.window = { location: { hostname, origin: 'https://' + hostname }, ...(native ? { Capacitor: { isNativePlatform: () => true } } : {}) };
    const M = await load();
    return M;
  };
  check((await make('noobsocials.com')).siteOrigin() === 'https://noobsocials.com', 'on the new .com, links say the new .com');
  check((await make('nooob.xyz')).siteOrigin() === 'https://nooob.xyz', 'on the old address, links stay on the old address (nobody is moved without choosing)');
  check((await make('ai.nooob.xyz')).siteOrigin() === 'https://nooob.xyz', 'on a sub-address (ai., coaching.) a link points at the main site, not at the sub-address');
  check((await make('localhost')).siteOrigin() === 'https://nooob.xyz', 'on a test address, links point at the real site');
  const n = await make('localhost', true);
  check(n.isNativeApp() && n.siteOrigin() === 'https://nooob.xyz' && n.mediaOrigin() === 'https://nooob.xyz', 'inside the Android app, links and pictures use the website\'s full address');
  check((await make('noobsocials.com')).mediaOrigin() === '', 'on the website, pictures use the same address (no prefix)');
  delete globalThis.window;
  check(S.siteOrigin() === 'https://nooob.xyz' && S.mediaOrigin() === '', 'with no browser at all (tests), the main address is used');
}

section('4. Where it is used');
const sb = read('src/services/supabase.ts');
check(/if \(value\.startsWith\('\/media\/'\)\) return mediaOrigin\(\) \+ value;/.test(sb) && /return `\$\{mediaOrigin\(\)\}\/media\//.test(sb), 'pictures and videos: a saved key or "/media/..." gets the full address inside the Android app');
const ib = read('src/utils/inAppBrowser.ts');
check(/SITE_DOMAINS\.some/.test(ib) && !/'nooob\.xyz'/.test(ib), 'a link to either of NOOB\'s addresses opens normally, never in the in-app browser');
const push = read('src/utils/pushSupport.ts');
check(!/Open nooob\.xyz|address https:\/\/nooob\.xyz/.test(push), 'the notification help names the main address, not a fixed one');
check(/siteOrigin\(\)/.test(read('src/components/Study/studyStore.ts')) && /siteOrigin\(\)/.test(read('src/components/Modals/AdminSignInPanel.tsx')), 'closing NOOB STUDY and the admin sign-in guide use the current address');
check(/VITE_SITE_URL: \$\{\{ vars\.SITE_URL \|\| 'https:\/\/nooob\.xyz' \}\}/.test(fs.readFileSync(path.resolve('../../.github/workflows/android-build.yml'), 'utf8')), 'the Android build takes the main address from the repo variable SITE_URL');
check(parseProfileQrBothDomains(), 'a profile QR code from either address is read');
function parseProfileQrBothDomains() {
  const src = read('src/utils/profileQr.ts');
  return !/hostname|\.host\b/.test(src) && /searchParams\.get\('profile'\)/.test(src);   // the host is not checked: any NOOB address works
}
check(!/\(\?<[=!]/.test(read('src/utils/siteUrl.ts')), 'no regex look-behind');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
