// Metro Rush on the Games page: the card, a page that follows the site's policy (own files only, no event handlers written into the page, nothing loaded from another site), "Made by NOOB developers".
// Usage: node --liftoff-only scripts/supabase/test-metro-rush.mjs
import fs from 'node:fs';
let passed = 0, failed = 0;
const check = (c, l) => { if (c) { passed++; console.log(`  ok   ${l}`); } else { failed++; console.log(`  FAIL ${l}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split('\r').join('');
const dir = 'public/games/metro-rush';
const html = read(`${dir}/index.html`), css = read(`${dir}/metro-rush.css`);
const js = fs.readdirSync(`${dir}/js`).map((f) => read(`${dir}/js/${f}`)).join('\n');
const types = read('src/components/Games/types.ts'), headers = read('public/_headers'), wr = read('wrangler.jsonc');
const entry = types.slice(types.indexOf("id: 'metro_rush'"), types.indexOf('\n  },', types.indexOf("id: 'metro_rush'")));
console.log('\n1. On the Games page');
check(/embedUrl: '\/games\/metro-rush\/'/.test(entry) && /pointsReward: 0/.test(entry) && /Made by NOOB developers/.test(entry), 'a card that opens it, no points, "Made by NOOB developers"');
const posters = [...entry.matchAll(/'(\/game-posters\/[^']+)'/g)].map((m) => m[1]);
check(posters.length === 3 && posters.every((p) => fs.existsSync('public' + p)), '3 posters, all real files');
console.log('\n2. The page');
check(!/<script(?![^>]*\bsrc=)/.test(html) && !/ on[a-z]+="/.test(html) && /mr-game\.js\?v=\d+/.test(html), 'no script or event handler written into the page; files carry a version number');
check(!/https?:\/\/(?!www\.w3\.org)/.test(html + css + js) && !/fonts\.g/.test(html + css), 'nothing is loaded from another site (no web fonts, no network calls)');
check(/<title>Metro Rush · Made by NOOB developers<\/title>/.test(html) && /<meta name="author" content="NOOB developers"/.test(html), 'title and author say it is made by NOOB developers');
check(/noob\.metrorush\.best/.test(js) && !/metro-rush-best/.test(js), 'its saves have names of their own (this site holds the saves of every game)');
const at = headers.indexOf('/games/metro-rush/*'), block = headers.slice(at, headers.indexOf('\n/', at + 5));
check(/frame-ancestors 'self'/.test(block) && /script-src 'self'/.test(block) && /\/games\/metro-rush\/\*\.js\n  Cache-Control: public, max-age=31536000, immutable/.test(headers) && wr.includes('"!/games/metro-rush/*"'), 'own policy (framed by this site only), scripts cached, routed past the worker');
check(headers.split('\n').filter((l) => /^[^ #]/.test(l)).length <= 100, 'public/_headers stays at 100 rules or fewer (Cloudflare refuses more)');
check(fs.existsSync('../metro-rush/NOOB-EMBED.md') && fs.existsSync('../metro-rush/source/README.md'), 'the source is in the repository (metro-rush/)');
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
