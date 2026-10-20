// Makes the web pages that describe each part of NOOB (public/features/<name>.html and public/features/index.html) and puts them in the site map.
// Each page is a real page of its own (its own title, words and links), so a search engine can list it; its button opens the real page of the app, which asks for an account first.
// Usage: node scripts/make-feature-pages.mjs
import fs from 'node:fs';
import path from 'node:path';

const SITE = 'https://noobsocials.com';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const out = path.join(root, 'public', 'features');

const FEATURES = [
  {
    slug: 'reels', name: 'NOOB Reels', open: '/reels', shot: 'noob-socials-reels.jpg',
    title: 'NOOB Reels | Short vertical videos on NOOB Socials',
    description: 'Watch and make short vertical videos on NOOB Socials: swipe through reels from people you follow, like, comment, save and share them with friends.',
    lead: 'Short videos made by NOOB members, one swipe at a time.',
    points: ['Swipe up for the next reel; sound, likes, comments and sharing sit right on the video.', 'Follow the person who made it without leaving the reel.', 'Send a reel straight to a friend from the faces at the top of the page, or share it to WhatsApp, Instagram, X and more.', 'Record or upload your own reel and earn NOOB Points for publishing.']
  },
  {
    slug: 'videos', name: 'NOOB Videos', open: '/videos', shot: 'noob-socials-menu.jpg',
    title: 'NOOB Videos | Long videos in portrait or landscape on NOOB Socials',
    description: 'Watch longer videos on NOOB Socials the way you do on YouTube: portrait or landscape, quality choices that save data, suggested videos, playback speed and a watch history.',
    lead: 'Longer videos with a proper player: turn your phone sideways and it fills the screen.',
    points: ['Choose the quality (Auto, 480p, 240p and more) and see roughly how much data each one uses.', 'Mute, change the speed, jump 10 seconds with a double tap, and carry on from where you stopped.', 'Suggested videos wait below the comments in portrait, and beside the video on a computer.', 'A watch history shows every video you started, by date, and you can remove any of them.']
  },
  {
    slug: 'chat', name: 'NOOB Chat', open: '/chat', shot: 'noob-socials-chat.jpg',
    title: 'NOOB Chat | Private chats, groups and calls on NOOB Socials',
    description: 'Message friends on NOOB Socials with private and group chats, voice messages, photos, videos, reactions, voice and video calls and end-to-end encryption.',
    lead: 'Talk to friends and groups in one place.',
    points: ['Private chats and groups, with replies, reactions, voice messages, photos and videos.', 'Voice and video calls.', 'Chats can be end-to-end encrypted between devices.', 'Share any post, reel or video into a chat in one tap.']
  },
  {
    slug: 'explore', name: 'NOOB Explore', open: '/explore', shot: 'noob-socials-explore.jpg',
    title: 'NOOB Explore | Find people, posts and communities on NOOB Socials',
    description: 'Explore NOOB Socials: search people and posts, browse topics and find communities and creators to follow.',
    lead: 'Find new people and new things to watch.',
    points: ['Search for people and posts.', 'Filter by topic and browse a grid of pictures.', 'See who is popular and who just joined.', 'Follow people to fill your Home feed.']
  },
  {
    slug: 'games', name: 'NOOB Games', open: '/games', shot: 'noob-socials-games.jpg',
    title: 'NOOB Games | 50+ mini games on NOOB Socials',
    description: 'Play more than 50 mini games on NOOB Socials, such as Ludo and Chess, alone or against friends, with a leaderboard.',
    lead: 'More than fifty mini games in the noob arena.',
    points: ['Play alone against a bot or invite a friend to a match with a link.', 'Ludo, Chess, Snakes & Ladders, Monopoly and many more.', 'A leaderboard shows who wins the most.', 'No download needed: games run inside NOOB.']
  },
  {
    slug: 'music', name: 'NOOB Music', open: '/music', shot: 'noob-socials-music.jpg',
    title: 'NOOB Music | Play songs and share them on NOOB Socials',
    description: 'Listen to songs in NOOB Music, search by artist or genre, and share songs in posts, stories and chats.',
    lead: 'A music hub inside your social app.',
    points: ['Play songs and search by artist or genre.', 'Add a song to a post or a story.', 'Share a song with a friend in a chat.', 'Find a song that is playing around you with Search song in the menu.']
  },
  {
    slug: 'stories', name: 'NOOB Stories', open: '/', shot: 'noob-socials-stories.jpg',
    title: 'NOOB Stories | Share a moment for 24 hours on NOOB Socials',
    description: 'Share a picture or video story on NOOB Socials that lasts 24 hours, with songs, stickers, polls and questions, and see who watched it.',
    lead: 'Moments that disappear after a day.',
    points: ['Add a picture or video, a song, stickers, polls and questions.', 'Rotating pictures and other effects.', 'Reply to a story or send a heart.', 'See who has watched your story.']
  },
  {
    slug: 'points', name: 'NOOB Points', open: '/me', shot: 'noob-socials-profile.jpg',
    title: 'NOOB Points | Earn points for posting and commenting on NOOB Socials',
    description: 'Earn NOOB Points on NOOB Socials for publishing posts, reels and videos and for commenting, and use them for NOOB Pro.',
    lead: 'Be active, get rewarded.',
    points: ['10,000,000 points for publishing a post, reel or video.', '1,000,000 points for a comment.', 'Every point earned or spent is written in your history, in order.', 'Use points to keep NOOB Pro.']
  }
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CSS = `:root { --ink:#fff; --muted:#b9b9b9; --line:rgba(255,255,255,.18); --card:#101010; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin:0; background:#0a0a0a; color:var(--ink); font-family:'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; line-height:1.6; }
a { color:inherit; }
.wrap { max-width: 760px; margin: 0 auto; padding: 22px 18px 60px; }
header.top { display:flex; align-items:center; justify-content:space-between; gap:12px; padding-bottom:18px; border-bottom:1px solid var(--line); }
.brand { display:flex; align-items:center; gap:10px; text-decoration:none; font-weight:800; font-size:18px; }
.brand img { width:34px; height:34px; border-radius:50%; }
nav.crumbs { font-size:13px; color:var(--muted); margin:18px 0 6px; }
nav.crumbs a { color:var(--muted); }
h1 { font-size: clamp(28px, 6vw, 40px); line-height:1.15; margin:8px 0 10px; font-weight:800; }
p.lead { font-size:18px; color:#e6e6e6; margin:0 0 18px; }
.card { background:var(--card); border:1px solid var(--line); border-radius:22px; padding:20px 22px; margin:18px 0; }
.card h2 { margin:0 0 10px; font-size:18px; }
ul { margin:0; padding-left:20px; } li { margin:7px 0; color:#d8d8d8; }
.shot { width:100%; max-width:320px; border-radius:22px; border:1px solid var(--line); display:block; margin:18px auto; }
.cta { display:inline-block; margin:6px 10px 6px 0; padding:13px 26px; border-radius:999px; background:#fff; color:#000; font-weight:800; text-decoration:none; }
.cta.alt { background:transparent; color:#fff; border:1px solid var(--line); }
.note { font-size:13px; color:var(--muted); }
.grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:12px; }
.grid a { display:block; text-decoration:none; background:var(--card); border:1px solid var(--line); border-radius:18px; padding:16px 18px; }
.grid a b { display:block; font-size:16px; margin-bottom:4px; } .grid a span { font-size:13px; color:var(--muted); }
footer { margin-top:40px; padding-top:18px; border-top:1px solid var(--line); font-size:13px; color:var(--muted); display:flex; flex-wrap:wrap; gap:6px 18px; }
footer a { color:var(--muted); }
`;

const head = (title, description, canonical, extraLd) => `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${canonical}" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<meta name="theme-color" content="#0a0a0a" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<link rel="icon" type="image/png" sizes="96x96" href="/favicon-96.png" />
<link rel="apple-touch-icon" href="/noob-logo-circle.png" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="NOOB Socials" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${canonical}" />
<meta property="og:image" content="${SITE}/brand/og-card.png" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/features/features.css" />
<script type="application/ld+json">
${JSON.stringify(extraLd, null, 2)}
</script>
</head>
<body>
<div class="wrap">
<header class="top">
  <a class="brand" href="/"><img src="/noob-logo-circle.png" alt="" width="34" height="34" /> NOOB Socials</a>
  <a class="cta" style="margin:0;padding:9px 20px;font-size:14px" href="/">Open NOOB</a>
</header>
`;

const foot = `<footer>
  <a href="/">NOOB Socials</a><a href="/features">All features</a><a href="/about">About</a><a href="/screenshots">Screenshots</a><a href="/privacy">Privacy Policy</a><a href="/terms">Terms</a>
</footer>
</div>
</body>
</html>
`;

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'features.css'), CSS);

for (const f of FEATURES) {
  const url = `${SITE}/features/${f.slug}`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', '@id': `${url}#page`, url, name: f.title, description: f.description, isPartOf: { '@id': `${SITE}/#website` }, about: { '@id': `${SITE}/#app` } },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'NOOB Socials', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Features', item: `${SITE}/features` },
        { '@type': 'ListItem', position: 3, name: f.name, item: url }
      ] }
    ]
  };
  const html = head(f.title, f.description, url, ld) +
`<nav class="crumbs" aria-label="Breadcrumb"><a href="/">NOOB Socials</a> › <a href="/features">Features</a> › ${esc(f.name)}</nav>
<main>
<h1>${esc(f.name)}</h1>
<p class="lead">${esc(f.lead)}</p>
<div class="card">
  <h2>What you can do</h2>
  <ul>
${f.points.map((p) => `    <li>${esc(p)}</li>`).join('\n')}
  </ul>
</div>
<img class="shot" src="/screens/${f.shot}" alt="${esc(f.name)} on NOOB Socials" width="320" loading="lazy" />
<p>
  <a class="cta" href="${f.open}">Open ${esc(f.name)}</a>
  <a class="cta alt" href="/">Create a free account</a>
</p>
<p class="note">You need a NOOB account to open this page of the app. Log in (or sign up, it is free) and ${esc(f.name)} opens straight away.</p>
<div class="card">
  <h2>More on NOOB</h2>
  <div class="grid">
${FEATURES.filter((o) => o.slug !== f.slug).map((o) => `    <a href="/features/${o.slug}"><b>${esc(o.name)}</b><span>${esc(o.lead)}</span></a>`).join('\n')}
  </div>
</div>
</main>
` + foot;
  fs.writeFileSync(path.join(out, `${f.slug}.html`), html);
}

const idxUrl = `${SITE}/features`;
const idxTitle = 'NOOB Socials features | Reels, videos, chat, games, music, stories and points';
const idxDesc = 'Everything you can do on NOOB Socials, the free student-run social app: reels, long videos, chat, explore, games, music, stories and NOOB Points.';
const idx = head(idxTitle, idxDesc, idxUrl, {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'CollectionPage', '@id': `${idxUrl}#page`, url: idxUrl, name: idxTitle, description: idxDesc, isPartOf: { '@id': `${SITE}/#website` } },
    { '@type': 'ItemList', itemListElement: FEATURES.map((f, i) => ({ '@type': 'ListItem', position: i + 1, name: f.name, url: `${SITE}/features/${f.slug}` })) }
  ]
}) +
`<nav class="crumbs" aria-label="Breadcrumb"><a href="/">NOOB Socials</a> › Features</nav>
<main>
<h1>What you can do on NOOB</h1>
<p class="lead">NOOB Socials is free and run by students. Pick a part of NOOB to read about it, then log in to open it.</p>
<div class="grid">
${FEATURES.map((f) => `  <a href="/features/${f.slug}"><b>${esc(f.name)}</b><span>${esc(f.lead)}</span></a>`).join('\n')}
</div>
<p style="margin-top:22px"><a class="cta" href="/">Open NOOB</a></p>
</main>
` + foot;
fs.writeFileSync(path.join(out, 'index.html'), idx);

// the site map: one block, between markers, rewritten every time
const smPath = path.join(root, 'public', 'sitemap.xml');
let sm = fs.readFileSync(smPath, 'utf8');
const today = new Date().toISOString().slice(0, 10);
const block = `  <!-- features:start -->\n  <url><loc>${SITE}/features</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>\n${FEATURES.map((f) => `  <url><loc>${SITE}/features/${f.slug}</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`).join('\n')}\n  <!-- features:end -->\n`;
if (sm.includes('<!-- features:start -->')) sm = sm.replace(/ {2}<!-- features:start -->[\s\S]*?<!-- features:end -->\n/, block);
else sm = sm.replace('</urlset>', block + '</urlset>');
fs.writeFileSync(smPath, sm);
console.log(`made ${FEATURES.length + 1} pages in public/features and updated the site map`);
