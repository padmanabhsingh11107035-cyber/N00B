// Makes public/games-site/games.json (the list the public games site shows) from the game catalogue in src/components/Games/types.ts, so the two never drift apart.
// Rerun after the catalogue changes:   node scripts/gen-games-site.mjs        (the test scripts/supabase/test-games-site.mjs fails when the file is out of date)
import fs from 'node:fs';
import ts from 'typescript';

const HELIX = { id: 'helix_fall', url: '/games/helix-fall/', portrait: true };   // Helix Fall is framed by its own component in the app, not by embedUrl

export function buildList(typesSource, exists = (p) => fs.existsSync('public' + p)) {
  const js = ts.transpileModule(typesSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const all = (new Function(js.replace(/export const (\w+) =/g, 'const $1 =') + '\nreturn ALL_50_MINI_GAMES;'))();
  const out = [];
  for (const g of all) {
    const url = g.id === HELIX.id ? HELIX.url : g.embedUrl;
    if (!url) continue;                                   // not a hosted game (a small built-in game of the app)
    const poster = (g.posters || [])[0] || '';
    let first = String(g.description || '').split(/(?<=[.!?])\s+/)[0].trim();
    if (first.length > 110 && first.includes(': ')) first = first.split(': ')[0].trim() + '.';
    if (first.length > 110) first = first.slice(0, 107).replace(/\s+\S*$/, '') + '...';
    const short = /noob|rank/i.test(first) ? '' : first;  // guests earn nothing and have no ranking: never advertise them
    out.push({
      id: g.id,
      title: g.title,
      description: short,
      category: g.category,
      players: g.players,
      url,
      poster: poster && exists(poster) ? poster : '',
      portrait: g.id === HELIX.id ? true : !!g.embedPortrait,
      lazy: !!g.embedLazy,
    });
  }
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('gen-games-site.mjs')) {
  const list = buildList(fs.readFileSync('src/components/Games/types.ts', 'utf8'));
  fs.mkdirSync('public/games-site', { recursive: true });
  fs.writeFileSync('public/games-site/games.json', JSON.stringify({ games: list }, null, 1) + '\n');
  console.log(`public/games-site/games.json: ${list.length} games`);
}
