// Strike Bowl on the Games page: the card, a page that follows the site's policy (nothing from another site, no maker names anywhere, ranking kept on the device),
// "Made by NOOB developers". Usage: node --liftoff-only scripts/supabase/test-strikebowl.mjs
import fs from 'node:fs';
let passed = 0, failed = 0;
const check = (c, l) => { if (c) { passed++; console.log(`  ok   ${l}`); } else { failed++; console.log(`  FAIL ${l}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split('\r').join('');
const dir = 'public/games/strikebowl';
const html = read(`${dir}/index.html`);
const files = fs.readdirSync(`${dir}/assets`);
const text = html + files.filter((f) => /\.(js|css)$/.test(f)).map((f) => read(`${dir}/assets/${f}`)).join('\n');
const glb = fs.readFileSync(`${dir}/assets/${files.find((f) => f.endsWith('.glb'))}`).toString('latin1');
const types = read('src/components/Games/types.ts'), headers = read('public/_headers'), wr = read('wrangler.jsonc');
const entry = types.slice(types.indexOf("id: 'strikebowl'"), types.indexOf('\n  },', types.indexOf("id: 'strikebowl'")));
const NAMES = new RegExp(['ma' + 'nus', 'tri' + 'po'].join('|'), 'i');

console.log('\n1. On the Games page');
check(/embedUrl: '\/games\/strikebowl\/'/.test(entry) && /pointsReward: 0/.test(entry) && /Made by NOOB developers/.test(entry), 'a card that opens it, no points, "Made by NOOB developers"');
const posters = [...entry.matchAll(/'(\/game-posters\/[^']+)'/g)].map((m) => m[1]);
check(posters.length === 3 && posters.every((p) => fs.existsSync('public' + p)), '3 posters, all real files');

console.log('\n2. The page');
check(/<title>Strike Bowl · Made by NOOB developers<\/title>/.test(html) && /<meta name="author" content="NOOB developers"/.test(html), 'title and author say it is made by NOOB developers');
check(!NAMES.test(text) && !NAMES.test(glb), 'nothing in the page, the scripts, the styles or the pin model names a maker or a tool');
check(!/https?:\/\/(?!www\.w3\.org)/.test(html) && !/fetch\(["'`]https?:/.test(text), 'nothing is loaded from another site');
check(!/api\/leaderboards|__MANUS|game-history/i.test(text) && /noob\.strikebowl\.board/.test(text), 'the ranking is kept on the device (no server call)');
const block = headers.slice(headers.indexOf('/games/strikebowl/*'), headers.indexOf('/games/strikebowl/assets/*'));
check(/frame-ancestors 'self'/.test(block) && /connect-src 'self' blob: data:/.test(block) && /wasm-unsafe-eval/.test(block) && /strikebowl\/assets\/\*\n  Cache-Control: public, max-age=31536000, immutable/.test(headers) && wr.includes('"!/games/strikebowl/*"'), 'own policy (framed by this site only, WebAssembly for the physics), assets cached, routed past the worker');
check(headers.split('\n').filter((l) => /^[^ #]/.test(l)).length <= 100, 'public/_headers stays at 100 rules or fewer (Cloudflare refuses more)');
check(fs.existsSync('../strikebowl/src/game/game.ts') && fs.existsSync('../strikebowl/NOOB-EMBED.md'), 'the source is in the repository (strikebowl/)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
