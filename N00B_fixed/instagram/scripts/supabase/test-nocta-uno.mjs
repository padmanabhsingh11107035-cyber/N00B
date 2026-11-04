// NOCTA on the Games page: the card, a page that follows the site's policy (no script written into it, nothing from another site, no online room that needs another site),
// "Made by NOOB developers". Usage: node --liftoff-only scripts/supabase/test-nocta-uno.mjs
import fs from 'node:fs';
let passed = 0, failed = 0;
const check = (c, l) => { if (c) { passed++; console.log(`  ok   ${l}`); } else { failed++; console.log(`  FAIL ${l}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split('\r').join('');
const dir = 'public/games/nocta-uno', html = read(`${dir}/index.html`), core = read(`${dir}/core.js`), js = read(`${dir}/game.js`), css = read(`${dir}/styles.css`);
const types = read('src/components/Games/types.ts'), headers = read('public/_headers'), wr = read('wrangler.jsonc');
const entry = types.slice(types.indexOf("id: 'nocta_uno'"), types.indexOf('\n  },', types.indexOf("id: 'nocta_uno'")));

console.log('\n1. On the Games page');
check(/embedUrl: '\/games\/nocta-uno\/'/.test(entry) && /pointsReward: 0/.test(entry) && /Made by NOOB developers/.test(entry), 'a card that opens it, no points, "Made by NOOB developers"');
const posters = [...entry.matchAll(/'(\/game-posters\/[^']+)'/g)].map((m) => m[1]);
check(posters.length === 3 && posters.every((p) => fs.existsSync('public' + p)), '3 posters, all real files');

console.log('\n2. The page');
check(!/<script(?![^>]*\bsrc=)/.test(html) && !/ on[a-z]+="/.test(html) && /core\.js\?v=\d+/.test(html) && /game\.js\?v=\d+/.test(html) && /styles\.css\?v=\d+/.test(html), 'no script or event handler written into the page; the files carry a version number');
check(!/https?:\/\/(?!www\.w3\.org)/.test(html + core + js + css), 'nothing is loaded from another site');
check(!/data-mode="online"/.test(html) && /loadPeer\(\) \{ return Promise\.reject/.test(js), 'the online room (it needed another site) is gone; solo and pass and play remain');
check(/<title>NOCTA · Made by NOOB developers<\/title>/.test(html) && /<meta name="author" content="NOOB developers"/.test(html), 'the title and the author tag say it is made by NOOB developers');
const block = headers.slice(headers.indexOf('/games/nocta-uno/*'), headers.indexOf('\n/', headers.indexOf('/games/nocta-uno/*') + 5));
check(/frame-ancestors 'self'/.test(block) && /script-src 'self';/.test(block) && /connect-src 'self';/.test(block) && /\/games\/nocta-uno\/\*\.js\n  Cache-Control: public, max-age=31536000, immutable/.test(headers) && wr.includes('"!/games/nocta-uno/*"'), 'own policy (framed by this site only, no network), cached, routed past the worker');
check(fs.existsSync('../nocta-uno/source/index.html') && fs.existsSync('../nocta-uno/NOOB-EMBED.md'), 'the source is in the repository (nocta-uno/)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
