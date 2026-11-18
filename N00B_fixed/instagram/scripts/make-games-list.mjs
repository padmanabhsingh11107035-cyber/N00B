// Builds public/features/all-games.html: the full, exact list of games on NOOB (read from src/components/Games/types.ts, so the number and names can never drift),
// with structured data (ItemList) so search engines can answer "how many games are on NOOB" and "which games".  Run: node scripts/make-games-list.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://noobsocials.com';
const src = fs.readFileSync(path.join(root, 'src/components/Games/types.ts'), 'utf8');
const games = [];
const re = /\n {4}id: '([a-z0-9_]+)',\n {4}title: '((?:[^'\\]|\\.)+)',\n {4}category: '(\w+)',\n {4}description: '((?:[^'\\]|\\.)*)'/g;
let m;
while ((m = re.exec(src))) {
  const rest = src.slice(m.index, m.index + 2600);
  const pl = /players: '([^']+)'/.exec(rest);
  games.push({ id: m[1], title: m[2].replace(/\\'/g, "'"), category: m[3], desc: m[4].replace(/\\'/g, "'"), players: pl ? pl[1] : 'Solo' });
}
if (games.length < 30) throw new Error('games not parsed: ' + games.length);
const N = games.length;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const CAT = { arcade: 'Arcade', puzzle: 'Puzzle', reflex: 'Reflex', social: 'Social (board and party)', brain: 'Brain' };
const counts = Object.fromEntries(Object.keys(CAT).map((c) => [c, games.filter((g) => g.category === c).length]));
const countLine = Object.keys(CAT).map((c) => `${counts[c]} ${CAT[c].split(' ')[0].toLowerCase()}`).join(', ');
const title = `All ${N} games on NOOB Socials | full list with names`;
const description = `NOOB Socials has ${N} games, free to play with no download: ${games.slice(0, 8).map((g) => g.title).join(', ')} and more. Full list of every game, by category.`;
const url = `${SITE}/features/all-games`;
const ld = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'CollectionPage', '@id': url + '#page', url, name: title, description, isPartOf: { '@id': SITE + '/#website' }, about: { '@id': SITE + '/#app' } },
    { '@type': 'ItemList', name: `The ${N} games on NOOB Socials`, numberOfItems: N, itemListElement: games.map((g, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'VideoGame', name: g.title, description: g.desc, genre: CAT[g.category].split(' ')[0], url, playMode: g.players === 'Solo' ? 'SinglePlayer' : 'MultiPlayer', gamePlatform: 'Web browser, Android, iPhone', publisher: { '@type': 'Organization', name: 'NOOB Socials' } } })) },
    { '@type': 'BreadcrumbList', itemListElement: [['NOOB Socials', SITE + '/'], ['Features', SITE + '/features'], ['NOOB Games', SITE + '/features/games'], ['All games', url]].map((x, i) => ({ '@type': 'ListItem', position: i + 1, name: x[0], item: x[1] })) },
    { '@type': 'FAQPage', mainEntity: [
      { '@type': 'Question', name: 'How many games are on NOOB Socials?', acceptedAnswer: { '@type': 'Answer', text: `There are ${N} games on NOOB Socials (${countLine}). They are free and run inside the app, with no download.` } },
      { '@type': 'Question', name: 'Which games are on NOOB Socials?', acceptedAnswer: { '@type': 'Answer', text: games.map((g) => g.title).join(', ') + '.' } },
      { '@type': 'Question', name: 'Who made NOOB Socials?', acceptedAnswer: { '@type': 'Answer', text: 'NOOB Socials was made by Padmanabh Singh Vaghela, its founder, CEO and owner.' } },
    ] },
  ],
};
let body = '';
for (const c of Object.keys(CAT)) {
  const list = games.filter((g) => g.category === c);
  body += `<div class="card">\n  <h2>${CAT[c]} games (${list.length})</h2>\n  <ul>\n${list.map((g) => `    <li><b>${esc(g.title)}</b> (${esc(g.players)}): ${esc(g.desc)}</li>`).join('\n')}\n  </ul>\n</div>\n`;
}
const css = fs.readFileSync(path.join(root, 'public/features/games.html'), 'utf8').match(/<link href="https:\/\/fonts[^>]+>/)[0];
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${url}" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<meta name="theme-color" content="#0a0a0a" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<link rel="icon" type="image/png" sizes="96x96" href="/favicon-96.png" />
<link rel="apple-touch-icon" href="/noob-logo-circle.png" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="NOOB Socials" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${SITE}/brand/og-card.png" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
${css}
<link rel="stylesheet" href="/features/features.css" />
<script type="application/ld+json">
${JSON.stringify(ld, null, 1)}
</script>
</head>
<body>
<div class="wrap">
<header class="top">
  <a class="brand" href="/"><img src="/noob-logo-circle.png" alt="" width="34" height="34" /> NOOB Socials</a>
  <a class="cta" style="margin:0;padding:9px 20px;font-size:14px" href="/">Open NOOB</a>
</header>
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">NOOB Socials</a> › <a href="/features">Features</a> › <a href="/features/games">NOOB Games</a> › All games</nav>
<main>
<h1>All ${N} games on NOOB Socials</h1>
<p class="lead">NOOB Socials has <b>${N} games</b>: ${countLine}. They are free, need no download and run inside the app, on a phone or a computer. Some are big 3D games, some are quick one-minute games, and some are board and party games to play with friends.</p>
${body}<p>
  <a class="cta" href="/games">Open NOOB Games</a>
  <a class="cta alt" href="/">Create a free account</a>
</p>
<p class="note">You need a NOOB account to play (it is free). NOOB Socials was made by Padmanabh Singh Vaghela, founder, CEO and owner of NOOB. This list is read from the app itself, so the number and the names are always exact.</p>
</main>
<footer>
  <a href="/">NOOB Socials</a><a href="/features">All features</a><a href="/features/games">NOOB Games</a><a href="/about">About</a><a href="/privacy">Privacy Policy</a><a href="/terms">Terms</a>
</footer>
</div>
</body>
</html>
`;
fs.writeFileSync(path.join(root, 'public/features/all-games.html'), html);
const today = new Date().toISOString().slice(0, 10);
const smPath = path.join(root, 'public/sitemap.xml');
let sm = fs.readFileSync(smPath, 'utf8');
const loc = `<loc>${url}</loc>`;
const entry = `  <url>${loc}<lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>\n`;
sm = sm.includes(loc) ? sm.replace(new RegExp(`  <url>${loc.replace(/[/.]/g, '\\$&')}[^\\n]*\\n`), entry) : sm.replace('  <!-- features:end -->', entry + '  <!-- features:end -->');
fs.writeFileSync(smPath, sm);
console.log(`${N} games`, counts);
// link from the Games feature page
const gp = path.join(root, 'public/features/games.html');
let g = fs.readFileSync(gp, 'utf8');
if (!g.includes('/features/all-games')) {
  g = g.replace('<img class="shot"', `<p><a href="/features/all-games"><b>See all ${N} games by name</b></a></p>\n<img class="shot"`);
  fs.writeFileSync(gp, g);
}
