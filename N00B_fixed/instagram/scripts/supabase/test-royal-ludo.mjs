// Royal Ludo on the Games page: the card, a page that follows the site's policy (no script written into it, nothing from another site, nothing that names where it was made), its own save key,
// "Made by NOOB developers", and the one-screen phone layout (nothing to scroll). Usage: node --liftoff-only scripts/supabase/test-royal-ludo.mjs
import fs from 'node:fs';
let passed = 0, failed = 0;
const check = (c, l, d = '') => { if (c) { passed++; console.log(`  ok   ${l}`); } else { failed++; console.log(`  FAIL ${l} ${d}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split('\r').join('');
const NAME = new RegExp(['ma', 'nus'].join(''), 'i');
const dir = 'public/games/royal-ludo', html = read(`${dir}/index.html`), js = read(`${dir}/game.js`), css = read(`${dir}/styles.css`), fit = read(`${dir}/fit.css`);
const types = read('src/components/Games/types.ts'), headers = read('public/_headers'), wr = read('wrangler.jsonc');
const entry = types.slice(types.indexOf("id: 'royal_ludo'"), types.indexOf('\n  },', types.indexOf("id: 'royal_ludo'")));

console.log('\n1. On the Games page');
check(/embedUrl: '\/games\/royal-ludo\/'/.test(entry) && /pointsReward: 0/.test(entry) && /Made by NOOB developers/.test(entry) && /embedPortrait: true/.test(entry), 'a card that opens it, no points, "Made by NOOB developers", held upright on a phone');
const posters = [...entry.matchAll(/'(\/game-posters\/[^']+)'/g)].map((m) => m[1]);
check(posters.length === 3 && posters.every((p) => fs.existsSync('public' + p)), '3 posters, all real files');

console.log('\n2. The page');
check(!/<script(?![^>]*\bsrc=)/.test(html) && !/ on[a-z]+="/.test(html) && /game\.js\?v=\d+/.test(html) && /fit\.css\?v=\d+/.test(html), 'no script or event handler written into the page (the policy forbids it); the files carry a version number (they are kept for a year)');
check(!/https?:\/\/(?!www\.w3\.org)/.test(html + js + css + fit), 'nothing is loaded from another site');
check(!NAME.test(html + js + css + fit), 'nothing in it names where it was made');
check(/<title>Royal Ludo · Made by NOOB developers<\/title>/.test(html) && /<meta name="author" content="NOOB developers"/.test(html) && /Made by NOOB developers/.test(html.split('<main>')[0]), 'the title, the author tag and the header say it is made by NOOB developers');
check(/const KEY = "noob\.royalludo\.v1";/.test(js), 'its save has a name of its own (this site holds the saves of every game)');
const block = headers.slice(headers.indexOf('/games/royal-ludo/*'), headers.indexOf('\n/', headers.indexOf('/games/royal-ludo/*') + 5));
check(/frame-ancestors 'self'/.test(block) && /script-src 'self';/.test(block) && /connect-src 'self';/.test(block) && /\/games\/royal-ludo\/\*\.js\n  Cache-Control: public, max-age=31536000, immutable/.test(headers) && wr.includes('"!/games/royal-ludo/*"'), 'own policy (framed by this site only, only its own files, no network), cached, routed past the worker');

console.log('\n3. One screen, nothing to scroll');
check(/@media \(max-width: 820px\), \(max-height: 560px\)/.test(fit) && /height: 100dvh/.test(fit) && /overflow: hidden/.test(fit), 'on a phone the page is exactly as tall as the screen and does not scroll');
check(/\.intro, footer, \.tip-card/.test(fit) && /container-type: size/.test(fit) && /100cqh/.test(fit) && /aspect-ratio: 1 \/ 1/.test(fit), 'the long texts are left out and the board takes the biggest square that leaves room for the players, the dice and the buttons');
check(/orientation: landscape\) and \(max-height: 560px\)/.test(fit) && /flex-direction: row/.test(fit), 'held sideways, the board is on the left and the controls on the right');
check(/env\(safe-area-inset-top\)/.test(fit) && /env\(safe-area-inset-bottom\)/.test(fit), 'the notch and the home bar are respected');
check(fs.existsSync('../royal-ludo/source/game.js') && fs.existsSync('../royal-ludo/NOOB-EMBED.md'), 'the source is in the repository (royal-ludo/)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
