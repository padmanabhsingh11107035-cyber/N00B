// The public games site (games.noobsocials.com): the hub at its root, the Worker's mapping, the headers, the first-visit dialog rule and the guest answers.
// Usage: node scripts/supabase/test-games-site.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { buildList } from '../gen-games-site.mjs';

let passed = 0, failed = 0;
const check = (ok, name) => { if (ok) { passed++; console.log('  ok  ', name); } else { failed++; console.log('  FAIL', name); } };
const read = (p) => fs.readFileSync(p, 'utf8');

console.log('1. Files and list');
const HUB = ['index.html', 'hub.css', 'hub.js', 'games.json', 'robots.txt'];
check(HUB.every((f) => fs.existsSync('public/games-site/' + f)), 'hub files exist');
const expected = buildList(read('src/components/Games/types.ts'));
const onDisk = JSON.parse(read('public/games-site/games.json')).games;
check(JSON.stringify(expected) === JSON.stringify(onDisk), 'games.json matches the catalogue (rerun: node scripts/gen-games-site.mjs)');
check(onDisk.length >= 20 && onDisk.every((g) => g.title && g.url.startsWith('/games/') && fs.existsSync('public' + g.url + 'index.html')), 'every listed game has a title and an index.html');
check(onDisk.every((g) => g.poster && fs.existsSync('public' + g.poster)), 'every listed game has a poster file');
check(onDisk.every((g) => !/noob|rank|point|reward/i.test(g.description)), 'no description promises NOOBs, points or a ranking to guests');

console.log('2. Page text and links');
const html = read('public/games-site/index.html'), js = read('public/games-site/hub.js'), css = read('public/games-site/hub.css');
check(html.includes('Sign up / Log in to save your progress') && /id="signbar"/.test(html), 'the top banner text is on the page');
check(html.includes('Save your progress') && html.includes('Sign up or log in to keep your scores and unlock rewards.') && html.includes('>Not now<') && html.includes('aria-modal="true"'), 'first-visit dialog text and aria-modal');
const hrefs = [...html.matchAll(/href="(https?:[^"]+)"/g)].map((m) => m[1]).filter((h) => !/games\.noobsocials\.com/.test(h));
check(hrefs.length >= 3 && hrefs.every((h) => h === 'https://noobsocials.com/'), 'every outside link points to https://noobsocials.com/');
check(!/supabase|localStorage\.(get|set)Item\(['"](sb-|supabase)|auth\.|access_token|refresh_token|session/i.test(js + html), 'no Supabase or sign-in/session code in the hub');
check(!/style="/.test(html) && !/<style|<script(?![^>]*\bsrc=)/.test(html) && !/\.style\.cssText|setAttribute\('style'/.test(js), 'no inline style or script (the page CSP allows none)');
check(!/postMessage\([^)]*['"]\*['"]\)/.test(js), 'the hub never posts to *');
check(/prefers-color-scheme: dark/.test(css) && /#F8CB46/i.test(css) && /#0C831F/i.test(css), 'dark mode and the brand colours are in the style');
check(!/avatar/i.test(html + js + css), "no 'avatar' in the hub");

console.log('3. Worker mapping');
const { routeFor, GAMES_HOSTS } = await import(pathToFileURL(path.resolve('worker/gamesSite.js')).href);
const G = 'games.noobsocials.com', M = 'noobsocials.com';
check(GAMES_HOSTS.has(G) && routeFor(G, '/').kind === 'hub' && routeFor(G, '/').asset === '/games-site/', 'games host: / is the hub (not the app)');
check(['/index.html', '/hub.css', '/hub.js', '/games.json', '/robots.txt'].every((p) => routeFor(G, p).kind === 'hub' && routeFor(G, p).asset.startsWith('/games-site/')), 'games host: the hub files are mapped');
check(['/sw.js', '/manifest.json', '/profile', '/reels', '/login', '/version.json', '/assets/x.js', '/games-site/hub.js', '/games', '/m/a.jpg', '/__geo', '/hub.js/x', '/../index.html'].every((p) => routeFor(G, p).kind === 'notfound'), 'games host: sw.js, manifest, app routes, media, geo and everything else are 404');
check(routeFor(G, '/games/flappy20/').kind === 'pass' && routeFor(G, '/games/neon-alley/data/x.bin').kind === 'pass', 'games host: /games/* passes as before');
check(['/', '/profile', '/sw.js', '/games/flappy20/', '/hub.js', '/m/a.jpg', '/assets/x.js'].every((p) => routeFor(M, p).kind === 'pass'), 'main host: nothing changed');
check(routeFor(M, '/games-site/').kind === 'notfound' && routeFor(M, '/games-site/hub.js').kind === 'notfound', 'main host: the hub folder is not a page there');

// the real Worker, with stand-in assets
const W = (await import(pathToFileURL(path.resolve('worker/index.js')).href)).default;
const hits = [];
const env = { ASSETS: { fetch: async (r) => { hits.push(new URL(r.url).pathname); return new Response('ASSET ' + new URL(r.url).pathname); } } };
const ctx = { waitUntil() {} };
const get = async (host, p, method = 'GET') => W.fetch(new Request(`https://${host}${p}`, { method }), env, ctx);
let r = await get(G, '/');
check(r.status === 200 && (await r.text()) === 'ASSET /games-site/', 'Worker: games host / serves the hub file');
r = await get(G, '/games.json'); check(r.status === 200 && (await r.text()) === 'ASSET /games-site/games.json', 'Worker: games host /games.json serves the list');
hits.length = 0;
for (const p of ['/sw.js', '/manifest.json', '/profile', '/index.html?x=1/../', '/assets/a.js']) {
  r = await get(G, p === '/index.html?x=1/../' ? '/profile/' : p);
  check(r.status === 404 && hits.length === 0, `Worker: games host ${p} is 404 and the app files are never asked for`);
}
r = await get(G, '/', 'POST'); check(r.status === 405, 'Worker: games host / only answers GET and HEAD');
r = await get(M, '/profile'); check(r.status === 200 && (await r.text()) === 'ASSET /profile', 'Worker: main host app route still served from the files');
r = await get(M, '/games-site/'); check(r.status === 404, 'Worker: main host /games-site/ is 404');

console.log('4. Headers');
const hdr = read('public/_headers');
const rules = hdr.split(/\r?\n/).filter((l) => /^\//.test(l));
check(rules.length < 100, `_headers has ${rules.length} rules (limit 100)`);
const block = (name) => { const i = hdr.split(/\r?\n/).findIndex((l) => l === name); const out = []; for (let k = i + 1; k < i + 12 && /^\s/.test(hdr.split(/\r?\n/)[k] || ''); k++) out.push(hdr.split(/\r?\n/)[k].trim()); return out; };
const hubRule = block('/games-site/*');
const csp = (hubRule.find((l) => l.startsWith('Content-Security-Policy:')) || '');
check(hubRule.includes('! Content-Security-Policy') && /default-src 'self'/.test(csp) && /script-src 'self';/.test(csp) && /style-src 'self';/.test(csp) && /frame-src 'self'/.test(csp) && /connect-src 'self'/.test(csp) && /img-src 'self' data:/.test(csp) && /frame-ancestors 'none'/.test(csp) && !/unsafe-inline|unsafe-eval/.test(csp), "hub CSP: 'self' only, frame-src 'self', not frameable");
check(/X-Frame-Options: DENY/.test(block('/*').join('\n')) && /X-Content-Type-Options: nosniff/.test(block('/*').join('\n')), 'every page (hub included) keeps nosniff and X-Frame-Options DENY from the /* rule');
// every hosted game may be framed by the hub (same origin) and by the app
const missing = onDisk.filter((g) => { const b = block(g.url + '*').join('\n'); return !/frame-ancestors[^;]*'self'/.test(b); }).map((g) => g.id);
check(missing.length === 0, 'every hosted game allows frame-ancestors self (the hub on its own address)' + (missing.length ? ': ' + missing.join(',') : ''));
const wr = read('wrangler.jsonc');
check(wr.includes('"run_worker_first": ["/*", "!/assets/*"'), 'wrangler: the Worker still runs first for every address except the plain-file folders (so / on the games host reaches it)');

console.log('5. First visit dialog rule and guest answers (the real hub.js)');
const win = {}; const ctxVm = vm.createContext({ window: win, document: undefined, console });
vm.runInContext(js, ctxVm);
const H = win.NoobGamesHub;
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
const st = mem(), T0 = 1_000_000_000_000, DAY = 86400000;
check(H && H.shouldPrompt(st, T0) === true, 'first visit: the dialog shows');
H.rememberNotNow(st, T0);
check(H.shouldPrompt(st, T0 + 1000) === false && H.shouldPrompt(st, T0 + 6.9 * DAY) === false, 'after Not now: hidden for the next 7 days');
check(H.shouldPrompt(st, T0 + 7 * DAY + 1) === true, 'after 7 days: it may show again');
const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
check(H.shouldPrompt(blocked, T0) === true && (H.rememberNotNow(blocked, T0), true), 'storage blocked: shown every time, nothing throws');
check(JSON.stringify(H.guestReply({ noobScore: 'flappy20', type: 'board-request' })) === JSON.stringify({ noobScore: 'flappy20', type: 'board', ok: false, board: null }), 'score board request: answered "not available"');
check(H.guestReply({ noobGame: 'color-sort', type: 'board-request' }).ok === false && H.guestReply({ noobMp: 'critter', type: 'join', room: 'ABCD' }).type === 'error', 'ranking board and online room: answered "not available" / error');
check(H.guestReply({ noobScore: 'flappy20', type: 'submit', score: 99 }) === null && H.guestReply({ noobGame: 'color-sort', type: 'level-done', level: 3 }) === null && H.guestReply({ noobMp: 'x', type: 'send', event: 'e' }) === null && H.guestReply('x') === null, 'scores, levels and online messages are never answered or kept');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
