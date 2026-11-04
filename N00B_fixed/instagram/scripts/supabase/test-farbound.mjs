// Farbound: Ruins Beyond on the Games page: the card, a page that follows the site's policy (nothing from another site, no maker or tool names anywhere), "Made by NOOB developers".
// Usage: node --liftoff-only scripts/supabase/test-farbound.mjs
import fs from 'node:fs';
let passed = 0, failed = 0;
const check = (c, l) => { if (c) { passed++; console.log(`  ok   ${l}`); } else { failed++; console.log(`  FAIL ${l}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split('\r').join('');
const dir = 'public/games/farbound';
const html = read(`${dir}/index.html`);
const files = fs.readdirSync(`${dir}/assets`);
const text = html + files.filter((f) => /\.(js|css)$/.test(f)).map((f) => read(`${dir}/assets/${f}`)).join('\n');
const models = files.filter((f) => f.endsWith('.glb')).map((f) => fs.readFileSync(`${dir}/assets/${f}`).toString('latin1')).join('\n');
const types = read('src/components/Games/types.ts'), headers = read('public/_headers'), wr = read('wrangler.jsonc');
const entry = types.slice(types.indexOf("id: 'farbound'"), types.indexOf('\n  },', types.indexOf("id: 'farbound'")));
const NAMES = new RegExp(['ma' + 'nus', 'tri' + 'po'].join('|'), 'i');

console.log('\n1. On the Games page');
check(/embedUrl: '\/games\/farbound\/'/.test(entry) && /pointsReward: 0/.test(entry) && /Made by NOOB developers/.test(entry), 'a card that opens it, no points, "Made by NOOB developers"');
const posters = [...entry.matchAll(/'(\/game-posters\/[^']+)'/g)].map((m) => m[1]);
check(posters.length === 3 && posters.every((p) => fs.existsSync('public' + p)), '3 posters, all real files');

console.log('\n2. The page');
check(/<title>[^<]* · Made by NOOB developers<\/title>/.test(html) && /<meta name="author" content="NOOB developers"/.test(html), 'title and author say it is made by NOOB developers');
check(!NAMES.test(text) && !NAMES.test(models), 'nothing in the page, the scripts, the styles or the models names a maker or a tool');
check(!/https?:\/\/(?!www\.w3\.org)/.test(html) && !/fetch\(["'`]https?:/.test(text), 'nothing is loaded from another site');
const at = headers.indexOf('/games/farbound/*');
const block = headers.slice(at, headers.indexOf('\n/', at + 5));
check(/frame-ancestors 'self'/.test(block) && /script-src 'self'/.test(block) && wr.includes('"!/games/farbound/*"'), 'own policy (framed by this site only, only its own scripts), routed past the worker');
check(headers.split('\n').filter((l) => /^[^ #]/.test(l)).length <= 100, 'public/_headers stays at 100 rules or fewer (Cloudflare refuses more)');
check(fs.existsSync('../farbound/NOOB-EMBED.md') && fs.existsSync('../farbound/package.json'), 'the source is in the repository (farbound/)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
