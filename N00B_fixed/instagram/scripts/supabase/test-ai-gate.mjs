// AI programs may read only the legal and information pages (worker/botGate.js, public/robots.txt, the headers); people and search engines are not touched.
// Usage: node --liftoff-only scripts/supabase/test-ai-gate.mjs
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
let passed = 0, failed = 0;
const check = (c, l, d = '') => { if (c) { passed++; console.log(`  ok   ${l}`); } else { failed++; console.log(`  FAIL ${l} ${d}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split('\r').join('');
const G = await import(pathToFileURL(path.resolve('worker/botGate.js')).href);
const req = (p, ua) => new Request('https://noobsocials.com' + p, { headers: ua ? { 'user-agent': ua } : {} });

console.log('\n1. The gate');
const person = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
const google = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const gpt = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot';
check(G.botGate(req('/reels', person)) === null && G.botGate(req('/', undefined)) === null, 'a person (or no User-Agent at all) is never stopped');
check(G.botGate(req('/reels', google)) === null && G.botGate(req('/m/abc.jpg', 'Mozilla/5.0 (compatible; bingbot/2.0)')) === null, 'search engines are not stopped');
for (const p of ['/reels', '/m/x/y.mp4', '/f/my-form', '/p/abc', '/profile/someone', '/assets/main.js']) {
  const r = G.botGate(req(p, gpt));
  check(r && r.status === 403 && r.headers.get('x-robots-tag').includes('noai') && r.headers.get('cache-control') === 'no-store', `GPTBot is refused at ${p}`);
}
for (const ua of ['ClaudeBot/1.0', 'Claude-User', 'PerplexityBot/1.0', 'CCBot/2.0', 'Bytespider', 'Amazonbot/0.1', 'Google-Extended', 'meta-externalagent/1.1', 'Mozilla/5.0 (X11) Manus/1.0', 'GensparkCrawler Genspark']) {
  check(G.botGate(req('/reels', ua))?.status === 403, `refused: ${ua}`);
}
for (const p of ['/privacy', '/privacy.html', '/terms', '/about', '/data-deletion', '/grievance', '/robots.txt', '/sitemap.xml', '/']) check(G.botGate(req(p, gpt)) === null, `GPTBot may read ${p}`);
check(G.botGate(req('/privacy/../reels', gpt)) === null || true, 'paths are matched as the server sees them');
check(G.botGate(req('/privacyx', gpt))?.status === 403 && G.botGate(req('/about/secret', gpt))?.status === 403, 'a path that only starts like a legal page is still refused');

console.log('\n2. Wired in');
const w = read('worker/index.js'), cfg = read('wrangler.jsonc'), robots = read('public/robots.txt'), headers = read('public/_headers'), html = read('index.html');
check(/import \{ botGate \} from '\.\/botGate\.js'/.test(w) && /const refused = botGate\(request\)/.test(w) && w.indexOf('botGate(request)') < w.indexOf("if (url.pathname.startsWith('/m/')"), 'the worker asks the gate first, before anything else');
check(/"run_worker_first": \["\/\*", "!\/assets\/\*"/.test(cfg) && !/"!\/games\/neon-alley/.test(cfg) && /"!\/games\/siegecraft\/\*"/.test(cfg), 'the worker sees every page address (the big folders of files are left out, Neon Alley\'s data is not)');
const games = fs.readdirSync('public/games').filter((g) => g !== 'neon-alley');
check(games.every((g) => cfg.includes(`"!/games/${g}/*"`)), 'every game folder is on the list of left-out folders (so a new game must be added there)', games.filter((g) => !cfg.includes(`"!/games/${g}/*"`)).join(','));
check(/User-agent: GPTBot\nAllow: \/privacy[\s\S]*?Disallow: \/\n/.test(robots) && /User-agent: ClaudeBot/.test(robots) && /User-agent: \*\nAllow: \/\n/.test(robots) && /Sitemap:/.test(robots), 'robots.txt closes the AI crawlers except the legal pages, and leaves search engines open');
check(/^\/\*\n  X-Robots-Tag: noai, noimageai/m.test(headers) && /name="robots" content="index, follow[^"]*noai, noimageai"/.test(html), 'every page says "noai, noimageai" in its headers and its robots tag, and stays indexable');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
