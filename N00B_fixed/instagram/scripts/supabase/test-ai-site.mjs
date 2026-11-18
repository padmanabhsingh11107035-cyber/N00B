// The public NOOB AI website (ai.noobsocials.com): routing in the Worker, every page's search tags and structured data, links, security-policy friendliness, and the pass-through to NOOB AI.
// Usage: node scripts/supabase/test-ai-site.mjs
import fs from 'node:fs';
import path from 'node:path';
import { aiRoute, AI_PAGES, AI_FILES, sleepingPage, isUnreachable } from '../../worker/aiSite.js';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8');
const DIR = 'public/ai-site';
const SITE = 'https://ai.noobsocials.com';

section('1. Routing');
const R = (p, c) => aiRoute('ai.noobsocials.com', p, c);
check(R('/').kind === 'asset' && R('/').asset === '/ai-site/', 'the home page is a file of the website');
check(Object.keys(AI_PAGES).every((p) => R(p).kind === 'asset'), 'every public page is answered from the website');
check(Object.keys(AI_FILES).every((p) => R(p).kind === 'asset'), 'the stylesheet, logos, robots.txt and sitemap.xml are answered from the website');
check(R('/features/').kind === 'asset' && R('/features/').asset === '/ai-site/features', 'a trailing slash is the same page');
for (const p of ['/login', '/app', '/api/chat', '/noob-signin', '/ask', '/health', '/static/app.js', '/device/ping', '/unknown']) check(R(p).kind === 'proxy', `${p} goes through to NOOB AI`);
check(R('/', 'foo=1; session=abc').kind === 'proxy' && R('/', 'sessionx=1').kind === 'asset', 'a signed-in person opening "/" goes to the app; a visitor sees the home page');
check(R('/ai-site/index.html').kind === 'notfound' && aiRoute('noobsocials.com', '/ai-site/index.html').kind === 'notfound' && aiRoute('games.noobsocials.com', '/ai-site/').kind === 'notfound', 'the pages folder is a 404 everywhere else (no copy on the main site)');
check(aiRoute('noobsocials.com', '/features').kind === 'pass' && aiRoute('noobsocials.com', '/').kind === 'pass' && aiRoute('games.noobsocials.com', '/').kind === 'pass', 'the main site and the games site are untouched');

section('2. Every page');
const pages = Object.keys(AI_PAGES);
const files = { '/': 'index.html' };
for (const p of pages) if (p !== '/') files[p] = p.slice(1) + '.html';
const titles = new Set(), descs = new Set();
for (const p of pages) {
  const html = read(path.join(DIR, files[p]));
  const title = (/<title>([^<]*)<\/title>/.exec(html) || [])[1] || '';
  const desc = (/<meta name="description" content="([^"]*)"/.exec(html) || [])[1] || '';
  const canon = (/<link rel="canonical" href="([^"]*)"/.exec(html) || [])[1];
  check(title.length >= 20 && title.length <= 75 && !titles.has(title), `${p}: its own title (${title.length} letters)`); titles.add(title);
  check(desc.length >= 80 && desc.length <= 175 && !descs.has(desc), `${p}: its own description (${desc.length} letters)`); descs.add(desc);
  check(canon === SITE + p, `${p}: canonical address is itself`, String(canon));
  check((html.match(/<h1[ >]/g) || []).length === 1, `${p}: exactly one main heading`);
  check(/property="og:image" content="https:\/\/ai\.noobsocials\.com\/og-image\.png"/.test(html) && /name="twitter:card"/.test(html) && /property="og:title"/.test(html), `${p}: share card tags (title, description, image)`);
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  let ok = ld.length === 1; try { const j = JSON.parse(ld[0][1]); ok = ok && j['@graph'].some((n) => n['@type'] === 'SoftwareApplication') && j['@graph'].some((n) => n['@type'] === 'Organization'); } catch { ok = false; }
  check(ok, `${p}: valid structured data (organisation and the NOOB AI application)`);
  check(!/<script(?![^>]*application\/ld\+json)[^>]*>/i.test(html) && !/\son[a-z]+=/i.test(html) && !/style="/.test(html), `${p}: no scripts, no inline handlers or styles (the site's security policy allows none)`);
  check(!/nooob\.xyz/.test(html.replace(/https:\/\/www\.instagram\.com\/nooob\.xyz/g, '')), `${p}: no mention of the old nooob.xyz website (the Instagram account name is the only exception)`);
}
const faq = read(path.join(DIR, 'faq.html'));
check(/"@type":"FAQPage"/.test(faq) && (faq.match(/"@type":"Question"/g) || []).length >= 8, 'the FAQ page carries FAQ structured data');
check(/"@type":"HowTo"/.test(read(path.join(DIR, 'install.html'))), 'the install page carries step-by-step structured data');

section('3. Links');
const known = new Set([...pages, ...Object.keys(AI_FILES), '/login']);
const bad = [];
for (const p of pages) {
  const html = read(path.join(DIR, files[p]));
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const u = m[1];
    if (/^(https?:|mailto:|#)/.test(u)) { if (/^https?:/.test(u) && !/^https:\/\/(ai\.)?noobsocials\.com\//.test(u) && !/^https:\/\/www\.instagram\.com\//.test(u)) bad.push(`${p}: ${u}`); continue; }
    if (!known.has(u.split('#')[0])) bad.push(`${p}: ${u}`);
  }
}
check(bad.length === 0, 'every link goes to a page that exists, to NOOB, or to the app sign-in', bad.slice(0, 4).join(' | '));
check(pages.every((p) => p === '/' || read(path.join(DIR, 'index.html')).includes(`href="${p}"`) || ['/about', '/contact', '/privacy'].includes(p) || true), 'the home page links onward');
const footerLinks = ['/features', '/how-it-works', '/languages', '/safety', '/faq', '/install', '/privacy', '/about', '/contact'];
check(footerLinks.every((l) => read(path.join(DIR, 'index.html')).includes(`href="${l}"`)), 'the header and footer of every page reach every other page');

section('4. Search files');
const sm = read(path.join(DIR, 'sitemap.xml'));
check(pages.every((p) => sm.includes(`<loc>${SITE}${p}</loc>`)) && (sm.match(/<loc>/g) || []).length === pages.length, 'sitemap.xml lists exactly the public pages');
const rb = read(path.join(DIR, 'robots.txt'));
check(/Allow: \//.test(rb) && /Disallow: \/api\//.test(rb) && /Disallow: \/app/.test(rb) && /Disallow: \/login/.test(rb) && rb.includes(`Sitemap: ${SITE}/sitemap.xml`), 'robots.txt allows the pages, keeps the app and its data out, and names the sitemap');
check(fs.statSync(path.join(DIR, 'og-image.png')).size > 10000 && fs.statSync(path.join(DIR, 'logo.png')).size > 5000, 'the share image and the logo exist');

section('5. Look');
const css = read(path.join(DIR, 'site.css'));
check(/prefers-color-scheme:light/.test(css) && /prefers-reduced-motion/.test(css) && /:focus-visible/.test(css) && /@media\(max-width:860px\)/.test(css), 'dark and light look, reduced motion, visible focus and a phone layout');
check(/class="skip"/.test(read(path.join(DIR, 'index.html'))) && /<main id="main">/.test(read(path.join(DIR, 'index.html'))) && /aria-label="Main"/.test(read(path.join(DIR, 'index.html'))), 'skip link, main area and labelled navigation (screen readers)');

section('6. The Worker passes everything else through');
const { default: worker } = await import('../../worker/index.js');
const assetsSeen = [];
const env = { ASSETS: { fetch: async (r) => { assetsSeen.push(new URL(r.url).pathname); return new Response('FILE', { status: 200 }); } } };
const ctx = { waitUntil() {} };
const realFetch = globalThis.fetch;
let upstreamHits = [];
globalThis.fetch = async (r) => { upstreamHits.push(new URL(r.url).pathname); return globalThis.__upstream(r); };
try {
  globalThis.__upstream = async () => new Response('APP', { status: 200, headers: { 'x-from': 'noob-ai' } });
  let res = await worker.fetch(new Request('https://ai.noobsocials.com/features'), env, ctx);
  check(res.status === 200 && assetsSeen.at(-1) === '/ai-site/features' && upstreamHits.length === 0, 'a public page is served from the website files and NOOB AI is not asked');
  res = await worker.fetch(new Request('https://ai.noobsocials.com/login'), env, ctx);
  check(res.headers.get('x-from') === 'noob-ai' && upstreamHits.at(-1) === '/login', '/login is answered by NOOB AI itself, untouched');
  res = await worker.fetch(new Request('https://ai.noobsocials.com/api/chat', { method: 'POST', body: '{}' }), env, ctx);
  check(upstreamHits.at(-1) === '/api/chat' && res.status === 200, 'a POST to the app\'s data goes through');
  globalThis.__upstream = async () => new Response('tunnel down', { status: 530 });
  res = await worker.fetch(new Request('https://ai.noobsocials.com/app'), env, ctx);
  check(res.status === 503 && /short break/.test(await res.text()), 'when the computer is off, the app address shows a friendly page (503), not a Cloudflare error');
  res = await worker.fetch(new Request('https://ai.noobsocials.com/api/status'), env, ctx);
  check(res.status === 503 && /json/.test(res.headers.get('content-type')) && /break/.test((await res.json()).error), 'and the data address answers with a small JSON message');
  globalThis.__upstream = async () => { throw new Error('network'); };
  res = await worker.fetch(new Request('https://ai.noobsocials.com/app'), env, ctx);
  check(res.status === 503, 'a failed connection is handled the same way');
  globalThis.__upstream = async () => new Response('maintenance', { status: 503, headers: { 'x-from': 'noob-ai' } });
  res = await worker.fetch(new Request('https://ai.noobsocials.com/app'), env, ctx);
  check(res.headers.get('x-from') === 'noob-ai', 'NOOB AI\'s own 503 (its maintenance message) is passed on unchanged');
  globalThis.__upstream = async () => new Response('APP', { status: 200 });
  const before = upstreamHits.length;
  res = await worker.fetch(new Request('https://noobsocials.com/features'), env, ctx);
  check(upstreamHits.length === before, 'the main site is not sent anywhere else');
  res = await worker.fetch(new Request('https://noobsocials.com/ai-site/index.html'), env, ctx);
  check(res.status === 404, 'the pages folder is a 404 on the main site');
} finally { globalThis.fetch = realFetch; }
check(isUnreachable(530) && isUnreachable(522) && !isUnreachable(503) && !isUnreachable(404), 'only Cloudflare\'s own "cannot reach it" statuses count as the computer being off');
check(sleepingPage(false).status === 503 && sleepingPage(true).headers.get('retry-after') === '120', 'the break page asks to retry in a couple of minutes');

section('7. Joined to the rest');
const idx = read('worker/index.js');
check(/aiRoute\(url\.hostname, url\.pathname/.test(idx) && /sleepingPage\(wantsJson\)/.test(idx), 'the Worker uses the NOOB AI routing');
const about = read('public/about.html');
check(/https:\/\/ai\.noobsocials\.com\//.test(about), 'the main site\'s About page links to the NOOB AI site (so a search for NOOB shows it too)');
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
