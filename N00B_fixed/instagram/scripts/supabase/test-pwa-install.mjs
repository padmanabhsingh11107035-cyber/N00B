// "Install NOOB" works from any of NOOB's web addresses, and the logo files for the Google / Facebook / Discord sign-in screens are the sizes those sites ask for.
// A browser offers to install a site when it has: a name, a start address inside its scope, "standalone" display, a 192 px and a 512 px PNG icon, a
// maskable icon (so the phone can round it), and a service worker that answers 'fetch'. None of it may name one particular address.
// Usage: node scripts/supabase/test-pwa-install.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const pngSize = (p) => { const b = fs.readFileSync(p); return b.readUInt32BE(16) + 'x' + b.readUInt32BE(20); };

section('1. The install manifest');
const m = JSON.parse(read('public/manifest.json'));
check(m.name && m.short_name === 'NOOB', 'it is called NOOB');
check(m.display === 'standalone' && m.start_url === '/' && m.scope === '/' && m.id === '/', 'opens like an app, from the home page, on whatever address it was installed from');
check(!/https?:\/\//.test(JSON.stringify(m)), 'no web address is written in it (so it is the same on nooob.xyz and noobsocials.com)');
for (const [size, purpose] of [[192, 'any'], [512, 'any'], [192, 'maskable'], [512, 'maskable']]) {
  const icon = (m.icons || []).find((i) => i.sizes === `${size}x${size}` && i.purpose === purpose);
  check(!!icon && icon.type === 'image/png', `a ${size} px ${purpose} icon is listed`);
  if (icon) {
    const file = 'public' + icon.src;
    check(fs.existsSync(file) && pngSize(file) === `${size}x${size}`, `... and its file is really ${size}x${size}`, fs.existsSync(file) ? pngSize(file) : 'missing');
  }
}
check(/<link rel="manifest" href="\/manifest\.json"/.test(read('index.html')), 'the page points at the manifest');
check(/<meta name="theme-color"/.test(read('index.html')) && /rel="apple-touch-icon"/.test(read('index.html')), 'theme colour and iPhone home-screen icon are set');

section('2. The service worker');
const sw = read('public/sw.js');
check(/addEventListener\('fetch'/.test(sw), 'it answers fetch (Chrome needs that to offer "Install")');
check(!/nooob\.xyz|noobsocials\.com/.test(sw), 'it names no particular address');

section('3. Logos for the sign-in screens');
check(pngSize('public/brand/noob-logo-120.png') === '120x120' && fs.statSync('public/brand/noob-logo-120.png').size < 1_000_000, 'Google: 120 x 120 px, under 1 MB');
check(pngSize('public/brand/noob-logo-1024.png') === '1024x1024' && fs.statSync('public/brand/noob-logo-1024.png').size < 5_000_000, 'Facebook and Discord: 1024 x 1024 px');

section('4. NOOB AI works inside the app on either address');
const server = read('../noob-ai/server/noob_server.py');
const theme = read('../noob-ai/server/web/theme.js');
check(/EMBED_ALLOWED = "[^"]*https:\/\/noobsocials\.com[^"]*https:\/\/nooob\.xyz|EMBED_ALLOWED = "[^"]*https:\/\/nooob\.xyz[^"]*https:\/\/noobsocials\.com/.test(server), 'NOOB AI may be shown inside the app on nooob.xyz and on noobsocials.com');
check(/"https:\/\/noobsocials\.com"/.test(theme) && /"https:\/\/nooob\.xyz"/.test(theme), 'and it follows the app\'s light / dark choice on both');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
