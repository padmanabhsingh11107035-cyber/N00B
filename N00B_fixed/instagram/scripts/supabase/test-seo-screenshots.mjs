// Search engines can find pictures of the app: a gallery page with described screenshots, a strip on the About page, the pictures in the sitemap,
// and the home page naming them as the app's screenshots. Usage: node scripts/supabase/test-seo-screenshots.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8');

const page = read('public/screenshots.html');
const about = read('public/about.html');
const sitemap = read('public/sitemap.xml');
const index = read('index.html');
const files = fs.readdirSync('public/screens').filter((f) => f.endsWith('.jpg'));

section('1. The pictures');
check(files.length >= 18, `${files.length} screenshots are published`);
check(files.every((f) => /^noob-socials-[a-z0-9-]+\.jpg$/.test(f)), 'each file is named for what it shows, with the site name (search engines read file names)');
for (const must of ['login-page', 'login-page-desktop', 'signup-page', 'home-feed', 'reels', 'chat', 'games', 'profile']) check(files.includes(`noob-socials-${must}.jpg`), `a "${must}" screenshot`);
check(files.every((f) => fs.statSync(`public/screens/${f}`).size < 600 * 1024), 'none is bigger than 600 KB (they load fast on a phone)');

section('2. The gallery page');
const imgs = [...page.matchAll(/<img src="\/screens\/([^"]+)" width="(\d+)" height="(\d+)"[^>]*alt="([^"]*)"/g)];
check(imgs.length === files.length, 'every picture is on the page', `${imgs.length} of ${files.length}`);
check(imgs.every((m) => m[4].length >= 40), 'each has a real description (alt text), not just a name');
check(imgs.every((m) => files.includes(m[1]) && Number(m[2]) > 0 && Number(m[3]) > 0), 'and its real size, so the page does not jump while loading');
check(/<title>NOOB Socials screenshots/.test(page) && /rel="canonical" href="https:\/\/noobsocials\.com\/screenshots"/.test(page) && /name="robots" content="index, follow, max-image-preview:large"/.test(page), 'a title, its own address and "index me, large pictures allowed"');
const ld = JSON.parse(page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
const gallery = ld['@graph'].find((x) => x['@type'] === 'ImageGallery');
check(gallery && gallery.image.length === files.length && gallery.image.every((i) => i['@type'] === 'ImageObject' && /^https:\/\/noobsocials\.com\/screens\//.test(i.contentUrl) && i.description && i.name), 'structured data lists every picture with its address, name and description');
check(/made-up examples/.test(page), 'it says honestly that the people and pictures in them are examples');

section('3. Found from everywhere');
check(/<section id="inside-the-app">/.test(about) && (about.match(/\/screens\/noob-socials-[a-z-]+\.jpg"/g) || []).length >= 6 && /href="\/screenshots"/.test(about), 'the About page shows a strip of them and links to the gallery');
check(/<loc>https:\/\/noobsocials\.com\/screenshots<\/loc>/.test(sitemap) && /xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/.test(sitemap), 'the sitemap lists the gallery page, in the picture-sitemap format');
const mapped = [...sitemap.matchAll(/<image:loc>https:\/\/noobsocials\.com\/screens\/([^<]+)<\/image:loc>/g)].map((m) => m[1]);
check(files.every((f) => mapped.includes(f)), 'and every picture');
check(/"screenshot": \[/.test(index) && /noob-socials-login-page\.jpg/.test(index), 'the home page names them as the app\'s screenshots');
check(/href="\/screenshots"/.test(index), 'and links to the gallery in its plain-text version');
check(/href="\/screenshots"/.test(read('src/components/Auth/AuthView.tsx')), 'the log in page has a "Screenshots" link');
check(/Allow: \//.test(read('public/robots.txt')) && !/Disallow:\s*\/screens/.test(read('public/robots.txt')), 'robots.txt lets search engines in');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
