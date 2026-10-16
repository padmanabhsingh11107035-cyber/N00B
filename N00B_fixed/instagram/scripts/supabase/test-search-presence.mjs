// What search engines (and link previews) see of NOOB Socials: the page title and description, the site name and who we are (a student-run team) as structured data, the
// canonical address, robots.txt, the sitemap, the About page that lists every feature, and the share card. No page or header may tell a search engine to stay away.
// Usage: node scripts/supabase/test-search-presence.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const html = read('index.html');
const about = read('public/about.html');
const robots = read('public/robots.txt');
const sitemap = read('public/sitemap.xml');
const headers = read('public/_headers');
const auth = read('src/components/Auth/AuthView.tsx');
const ld = (src) => JSON.parse(src.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);

section('1. The home page (what shows for "noobsocials")');
const title = html.match(/<title>([\s\S]*?)<\/title>/)[1].replace(/&amp;/g, '&');
check(/NOOB Socials/.test(title) && /Student-run/i.test(title) && title.length <= 70, 'the title names the site and says it is student-run', title);
const desc = html.match(/<meta name="description" content="([^"]*)"/)[1];
check(/NOOB Socials/.test(desc) && /noobsocials\.com/.test(desc) && /students/i.test(desc) && desc.length >= 90 && desc.length <= 175, 'the description says who we are and what it does, in a length search results show', String(desc.length));
check(/<link rel="canonical" href="https:\/\/noobsocials\.com\/" \/>/.test(html), 'one canonical address, so noobsocials.com and the older address count as one site');
check(/<meta name="robots" content="index, follow, max-image-preview:large" \/>/.test(html) && !/noindex|nofollow/i.test(html.replace('index, follow', '')), 'search engines are invited in');
check(/og:site_name" content="NOOB Socials"/.test(html) && /og:title" content="NOOB Socials \| The student-run social app"/.test(html), 'link previews use the same name');
check(/og:image" content="https:\/\/noobsocials\.com\/brand\/og-card\.png"/.test(html) && /og:image:width" content="1200"/.test(html) && /og:image:height" content="630"/.test(html), 'and a proper 1200x630 share card');
const g = ld(html)['@graph'];
const org = g.find((x) => x['@type'] === 'Organization'), site = g.find((x) => x['@type'] === 'WebSite'), app = g.find((x) => x['@type'] === 'WebApplication');
check(org && org.name === 'NOOB Socials' && org.alternateName.includes('noobsocials') && org.alternateName.includes('NOOB') && /students/.test(org.description), 'structured data: the organisation is "NOOB Socials", also known as NOOB / noobsocials, run by students');
check(org.sameAs.includes('https://www.instagram.com/nooob.xyz') && !/[?&]utm_|vrfl/.test(JSON.stringify(org.sameAs)), 'structured data: our official Instagram is linked to the organisation (clean address, no tracking)');
check(org.alternateName.includes('noob socials') && site.alternateName.includes('noob socials'), 'the spaced spelling "noob socials" is a known name too');
check(site && site.name === 'NOOB Socials' && site.alternateName.includes('noobsocials') && site.url === 'https://noobsocials.com/', 'structured data: the site name search results should show');
check(app && app.applicationCategory === 'SocialNetworkingApplication' && app.offers.price === '0' && app.featureList.length >= 8, 'structured data: a free social app with its list of features');
check(app.featureList.some((f) => /Ludo/.test(f)) && app.featureList.some((f) => /NOOB Study/.test(f)) && app.featureList.some((f) => /Daily NOOB/.test(f)), '... that names the real features');
check(/<noscript>[\s\S]*<h1>NOOB Socials<\/h1>[\s\S]*student/.test(html) && /<a href="\/about">/.test(html), 'a visitor (or crawler) without scripts still reads who we are, with a link to the About page');
check(/<script type="module" src="\/src\/main\.tsx"><\/script>/.test(html) && /id="root"/.test(html), 'the app itself is untouched');

section('2. The About page');
check(/<link rel="canonical" href="https:\/\/noobsocials\.com\/about" \/>/.test(about) && /<meta name="robots" content="index, follow/.test(about), 'its own canonical address, open to search engines');
check(/<title>About NOOB Socials/.test(about) && /<h1>|class="tag">The student-run social app/.test(about) && /built and run by students/.test(about), 'it says plainly that it is student-run');
const aboutLd = ld(about)['@graph'];
check(aboutLd.some((x) => x['@type'] === 'AboutPage') && aboutLd.some((x) => x['@type'] === 'BreadcrumbList'), 'structured data for an About page with a breadcrumb');
for (const feature of ['Reels', 'Stories', 'Voice and video calls', 'Ludo', 'Chess', 'Monopoly', 'Guess the Song', 'Live streaming', 'NOOB Rooms', 'Daily NOOB', 'Anonymous Messages', 'Ask Me Anything', 'This or That', 'Mood Status', 'public polls', 'NOOB AI', 'NOOB Study', 'NOOB Draw', 'Shop NOOB', 'Food Stall', 'NOOB Points', 'NOOB Pro', 'Suggestion Box', 'end-to-end encrypted']) {
  check(new RegExp(feature, 'i').test(about), `lists ${feature}`);
}
check(/href="https:\/\/www\.instagram\.com\/nooob\.xyz"/.test(about) && !/utm_source|vrfl/.test(about), 'the About page links to the Instagram, without tracking codes');
check(/href="\/\?join=team"/.test(about) && /href="\/privacy"/.test(about) && /href="\/terms"/.test(about) && /href="\/data-deletion"/.test(about), 'links to joining the team, privacy, terms and deleting your data');
check(!/<script(?![^>]*ld\+json)[^>]*>/.test(about) && /<style>/.test(about), 'it needs no scripts (fast, and allowed by the site\'s security rules)');
check(fs.existsSync('public/brand/noob-wordmark.png'), 'its logo file exists');

section('3. robots.txt and the sitemap');
check(/User-agent: \*\s*\nAllow: \//.test(robots) && !/Disallow: \/\s*$/m.test(robots) && /Sitemap: https:\/\/noobsocials\.com\/sitemap\.xml/.test(robots), 'robots.txt lets everyone in and points to the sitemap');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
check(locs.includes('https://noobsocials.com/') && locs.includes('https://noobsocials.com/about'), 'the sitemap lists the home page and the About page');
check(locs.every((u) => u === 'https://noobsocials.com/' || fs.existsSync('public/' + u.replace('https://noobsocials.com/', '') + '.html')), 'every address in it is a real page', locs.join(' '));
check(/<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/.test(sitemap), 'standard sitemap format');

section('4. Nothing keeps search engines away');
check(!/X-Robots-Tag|noindex/i.test(headers), 'no header tells search engines to skip the site');
const profile = read('src/components/Profile/ProfileView.tsx');
check(/window\.open\('\/about', '_blank', 'noopener'\);[\s\S]{0,900}About NOOB/.test(profile) && /data-testid="open-about"/.test(profile) && /Option 6: Terms and Conditions/.test(profile), "the profile's three-dots menu has an About NOOB entry that opens the About page");
check(/<a href="\/about" className="[^"]*">About NOOB<\/a>/.test(auth), 'the sign-in page links to the About page, so it is found from the home page');
const og = fs.readFileSync('public/brand/og-card.png');
check(og.readUInt32BE(16) === 1200 && og.readUInt32BE(20) === 630 && og.length < 200000, 'the share card is 1200 x 630 and small');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
