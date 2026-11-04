// NOOB Party Pack on the Games page: the card, a page that follows the site's policy (no script written into it, nothing from another site, no online room that needs another site),
// "Made by NOOB developers". Usage: node --liftoff-only scripts/supabase/test-noobgames-hub.mjs
import fs from 'node:fs';
let passed = 0, failed = 0;
const check = (c, l) => { if (c) { passed++; console.log(`  ok   ${l}`); } else { failed++; console.log(`  FAIL ${l}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split('\r').join('');
const dir = 'public/games/noobgames-hub', html = read(`${dir}/index.html`), core = read(`${dir}/core.js`), js = read(`${dir}/game.js`), css = read(`${dir}/styles.css`);
const types = read('src/components/Games/types.ts'), headers = read('public/_headers'), wr = read('wrangler.jsonc');
const entry = types.slice(types.indexOf("id: 'noobgames_hub'"), types.indexOf('\n  },', types.indexOf("id: 'noobgames_hub'")));

console.log('\n1. On the Games page');
check(/embedUrl: '\/games\/noobgames-hub\/'/.test(entry) && /pointsReward: 0/.test(entry) && /Made by NOOB developers/.test(entry), 'a card that opens it, no points, "Made by NOOB developers"');
const posters = [...entry.matchAll(/'(\/game-posters\/[^']+)'/g)].map((m) => m[1]);
check(posters.length === 3 && posters.every((p) => fs.existsSync('public' + p)), '3 posters, all real files');

console.log('\n2. The page');
check(!/<script(?![^>]*\bsrc=)/.test(html) && !/ on[a-z]+="/.test(html) && /core\.js\?v=\d+/.test(html) && /game\.js\?v=\d+/.test(html) && /styles\.css\?v=\d+/.test(html), 'no script or event handler written into the page; the files carry a version number');
check(!/https?:\/\/(?!www\.w3\.org)/.test(html + core + js + css), 'nothing is loaded from another site');
check(!/cdn\.tailwindcss|fonts\.googleapis/.test(html) && /utilities\.css\?v=\d+/.test(html) && fs.existsSync(`${dir}/utilities.css`), 'the Tailwind script and the web fonts (other sites) are replaced by files of its own');
check(/<title>NOOB Games Hub · Made by NOOB developers<\/title>/.test(html) && /<meta name="author" content="NOOB developers"/.test(html), 'the title and the author tag say it is made by NOOB developers');
const block = headers.slice(headers.indexOf('/games/noobgames-hub/*'), headers.indexOf('/games/noobgames-hub/index.html'));
check(/frame-ancestors 'self'/.test(block) && /script-src 'self';/.test(block) && /connect-src 'self';/.test(block) && /\/games\/noobgames-hub\/\*\.js\n  Cache-Control: public, max-age=31536000, immutable/.test(headers) && wr.includes('"!/games/noobgames-hub/*"'), 'own policy (framed by this site only, no network), cached, routed past the worker');
check(fs.existsSync('../noobgames-hub/source/index.html') && fs.existsSync('../noobgames-hub/NOOB-EMBED.md'), 'the source is in the repository (noobgames-hub/)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
