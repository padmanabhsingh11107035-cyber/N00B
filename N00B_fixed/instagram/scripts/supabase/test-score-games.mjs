// The score games on the Games page (plain pages shown in a frame, sending their score to NOOB's shared ranking): each has a card, a ranking rule in the database, a page that follows the
// site's policy (no script written into the page, nothing from another site, nothing that names where it was made), its own save key, and the shared script. Add every new score game to GAMES.
// Usage: node --liftoff-only scripts/supabase/test-score-games.mjs
import fs from 'node:fs';
import path from 'node:path';
let passed = 0, failed = 0;
const check = (c, l, d = '') => { if (c) { passed++; console.log(`  ok   ${l}`); } else { failed++; console.log(`  FAIL ${l} ${d}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split('\r').join('');
const NAME = new RegExp(['ma', 'nus'].join(''), 'i'), OTHER = new RegExp(['gen', 'spark'].join(''), 'i'), STUDIO = new RegExp(['ai', ' ?studio'].join(''), 'i');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const types = read('src/components/Games/types.ts'), headers = read('public/_headers'), wr = read('wrangler.jsonc'), sql = read('supabase/migrations/20261103000002_hosted_scores.sql');
// id of the card, folder, score id, a word every page must contain
const GAMES = [
  { card: 'flappy20', dir: 'flappy20', score: 'flappy20', title: 'Flappy' },
  { card: 'noob_run_3d', dir: 'noob-run-3d', score: 'noob_run_3d', title: 'NOOB Run' },
];
section('0. The shared pieces');
const shim = read('public/games/_shared/noob-score.js'), frame = read('src/components/Games/minigames/HostedGameFrame.tsx');
check(/window\.parent\.postMessage\(/.test(shim) && /NOOB_PARENT/.test(shim) && /e\.source !== window\.parent/.test(shim) && !/fetch\(|XMLHttpRequest|WebSocket|innerHTML/.test(shim), 'the shared script only talks to the page that shows the game, with the same origin, and builds its list without innerHTML');
check(/if \(!win \|\| e\.source !== win \|\| e\.origin !== plan\.origin\) return;[\s\S]{0,200}noobScore !== scoreGame/.test(frame) && /gameScoreSubmit\(scoreGame, d\.score\)/.test(frame) && /gameScoreBoard\(scoreGame\)/.test(frame), 'the Games page answers only its own frame, only for its own game');
check(/"!\/games\/_shared\/\*"/.test(wr) && /\/games\/_shared\/\*\n  Cache-Control/.test(headers), 'the shared folder is routed and cached');
for (const g of GAMES) {
  section(`${g.card}`);
  const dir = `public/games/${g.dir}`, html = read(`${dir}/index.html`), files = walk(dir);
  const entry = types.slice(types.indexOf(`id: '${g.card}'`), types.indexOf('\n  },', types.indexOf(`id: '${g.card}'`)));
  check(new RegExp(`embedUrl: '/games/${g.dir}/'`).test(entry) && new RegExp(`scoreGame: '${g.score}'`).test(entry) && /pointsReward: 0/.test(entry) && /Made by NOOB developers/.test(entry), 'a card that opens it, with the ranking id, no points, and "Made by NOOB developers"');
  const posters = [...entry.matchAll(/'(\/game-posters\/[^']+)'/g)].map((m) => m[1]);
  check(posters.length >= 3 && posters.every((p) => fs.existsSync('public' + p)), `${posters.length} posters, all real files`);
  check(new RegExp(`'${g.score}'`).test(sql), 'it has a ranking rule in the database (hosted_score_rules)');
  check(!/<script(?![^>]*\bsrc=)/.test(html) && !/ on[a-z]+="/.test(html) && /_shared\/noob-score\.js" data-game="[a-z0-9_]+"/.test(html) && html.includes(`data-game="${g.score}"`), 'no script or event handler written into the page (the policy forbids it), the shared script is loaded for this game');
  const text = files.filter((f) => /\.(html|js|css|json)$/.test(f)).map(read).join('\n');
  check(!/https?:\/\/(?!www\.w3\.org|react\.dev|jcgt\.org)/.test(text), 'nothing is loaded from another site (only XML name spaces and two library texts are written in the code)');
  check(!NAME.test(text + html) && !OTHER.test(text) && !STUDIO.test(text), 'nothing in it names where it was made');
  check(/<meta name="author" content="NOOB developers"/.test(html) && /Made by NOOB developers/.test(html.match(/<title>[^<]*/)[0]), 'the page says it is made by NOOB developers');
  check(/localStorage\.(get|set)Item\(\s*['"`]noob[._]/.test(text), 'its save has a name of its own (this site holds the saves of every game)');
  const blockStart = headers.indexOf(`/games/${g.dir}/*`);
  const block = headers.slice(blockStart, headers.indexOf(`/games/${g.dir}/index.html`));
  check(blockStart > 0 && /frame-ancestors 'self'/.test(block) && /script-src 'self';/.test(block) && /connect-src 'self';/.test(block) && wr.includes(`"!/games/${g.dir}/*"`), 'own policy: framed by this site only, only its own files, no network; routed past the worker');
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
