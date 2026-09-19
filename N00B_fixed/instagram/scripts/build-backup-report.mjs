// Turns a raw MongoDB backup (made by scripts/backup-mongo.mjs) into files a
// person can actually check: a browsable HTML report, spreadsheet-ready CSVs,
// a list of every media file the data points at, and SHA-256 checksums of
// every raw file so it can be proven later that nothing changed.
//
// Read-only with respect to the raw backup — it only ever WRITES a new
// "review" folder next to it. Passwords, push-subscription keys and IP
// addresses are deliberately left out of the review files (they stay in the
// raw JSON, which is what a migration uses).
//
// Usage (from the instagram folder):
//   node scripts/build-backup-report.mjs                 # newest backup
//   node scripts/build-backup-report.mjs backups/<stamp> # a specific one
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const backupsRoot = 'backups';
const dir = process.argv[2]
  || path.join(backupsRoot, fs.readdirSync(backupsRoot).filter(d => fs.existsSync(path.join(backupsRoot, d, 'users.json'))).sort().pop() || '');
if (!fs.existsSync(path.join(dir, 'users.json'))) {
  console.error(`No backup found at "${dir}". Run scripts/backup-mongo.mjs first.`);
  process.exit(1);
}
const load = (name, fallback) => {
  const file = path.join(dir, `${name}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
};

const users = load('users', []);
const posts = load('posts', []);
const reels = load('reels', []);
const stories = load('stories', []);
const highlights = load('highlights', []);
const commentsByPost = load('comments', {});
const notifications = load('notifications', []);
const chats = load('chats', []);
const messagesByChat = load('messages', {});
const gameScores = load('gameScores', []);
const coupons = load('coupons', []);
const supportReviews = load('supportReviews', []);
const musicTracks = load('musicTracks', []);
const customStickers = load('customStickers', []);
const storeProducts = load('storeProducts', []);

const comments = Object.values(commentsByPost).flat();
const messageCount = Object.values(messagesByChat).reduce((n, list) => n + list.length, 0);
const userById = new Map(users.map(u => [u.id, u]));

// ---------- helpers ----------
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const csvCell = (v) => {
  const s = Array.isArray(v) ? v.join('; ') : (v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (columns, rows) =>
  '﻿' + [columns.join(','), ...rows.map(r => columns.map(c => csvCell(r[c])).join(','))].join('\r\n') + '\r\n';

// Where a stored media value actually lives.
function describeMedia(value) {
  if (!value) return { kind: 'empty', key: '' };
  if (value.startsWith('data:')) return { kind: 'inline', key: '', note: `inline image, ${Math.round(value.length / 1024)} KB inside the database` };
  if (value.startsWith('/')) return { kind: 'app-file', key: '', note: 'file bundled with the app' };
  if (/^https?:\/\//.test(value)) {
    const host = new URL(value).host;
    if (/backblazeb2\.com$/.test(host)) {
      // A presigned B2 URL: "<endpoint>/<bucket>/<key>?X-Amz-...". The signature
      // has long expired, but the key is still right there in the path.
      const key = decodeURIComponent(new URL(value).pathname.split('/').slice(2).join('/'));
      return { kind: 'b2', key, note: 'B2 file (recovered from an expired link)' };
    }
    return { kind: 'external', key: '', note: `external image (${host})` };
  }
  return { kind: 'b2', key: value, note: 'B2 file' };
}
const mediaLabel = (value) => {
  const m = describeMedia(value);
  return m.kind === 'b2' ? `B2: ${m.key}` : m.kind === 'empty' ? '' : m.note;
};

// ---------- derived, cross-checked numbers ----------
const followersOf = new Map(users.map(u => [u.id, 0]));
for (const u of users) for (const id of u.followingIds || []) if (followersOf.has(id)) followersOf.set(id, followersOf.get(id) + 1);
const postsOf = new Map(users.map(u => [u.id, 0]));
for (const p of posts) if (postsOf.has(p.userId)) postsOf.set(p.userId, postsOf.get(p.userId) + 1);
const reelsOf = new Map(users.map(u => [u.id, 0]));
for (const r of reels) if (reelsOf.has(r.userId)) reelsOf.set(r.userId, reelsOf.get(r.userId) + 1);

const profileRows = users.map(u => ({
  username: u.username,
  displayName: u.displayName,
  firstName: u.firstName,
  lastName: u.lastName,
  email: u.email,
  mobile: [u.countryCode, u.mobileNumber].filter(Boolean).join(' '),
  dateOfBirth: u.dateOfBirth,
  gender: u.gender,
  bio: u.bio,
  accountType: u.accountType,
  verified: u.isVerified ? (u.verificationTier || 'yes') : '',
  admin: u.isAdmin ? 'yes' : '',
  suspended: u.isSuspended ? 'yes' : '',
  city: u.city,
  website: u.website,
  pronouns: u.pronouns,
  interests: u.interests,
  joined: u.createdAt,
  followers_actual: followersOf.get(u.id),
  followers_stored: u.followersCount,
  following_actual: (u.followingIds || []).length,
  following_stored: u.followingCount,
  posts_actual: postsOf.get(u.id),
  posts_stored: u.postsCount,
  reels_actual: reelsOf.get(u.id),
  noobPoints: u.noobPoints,
  gamesPlayed: u.gamesPlayedCount,
  gamesWon: u.gamesWonCount,
  proTier: u.proTier,
  passwordSet: u.password ? 'yes' : 'NO',
  avatar: mediaLabel(u.avatar),
  id: u.id
}));

const postRows = posts.map(p => ({
  id: p.id,
  author: p.username,
  caption: p.caption,
  createdAt: p.createdAt,
  slides: (p.slides || []).length,
  media: (p.slides || []).map(s => mediaLabel(s.objectKey || s.mediaUrl)),
  likes_actual: (p.likedBy || []).length,
  likes_stored: p.likesCount,
  comments_actual: (commentsByPost[p.id] || []).length,
  comments_stored: p.commentsCount,
  saves: p.savesCount,
  shares: p.sharesCount,
  hashtags: p.hashtags,
  category: p.category,
  music: p.audioTrack ? [p.audioTrack.title, p.audioTrack.artist].filter(Boolean).join(' - ') : '',
  authorFound: userById.has(p.userId) ? 'yes' : 'NO'
}));

const reelRows = reels.map(r => ({
  id: r.id,
  author: r.username,
  caption: r.caption,
  createdAt: r.createdAt,
  duration_s: r.durationSeconds,
  video: mediaLabel(r.videoUrl),
  thumbnail: mediaLabel(r.thumbnailUrl),
  likes_actual: (r.likedBy || []).length,
  likes_stored: r.likesCount,
  views: r.viewsCount,
  comments: r.commentsCount,
  hashtags: r.hashtags,
  music: r.audioTrack ? [r.audioTrack.title, r.audioTrack.artist].filter(Boolean).join(' - ') : '',
  authorFound: userById.has(r.userId) ? 'yes' : 'NO'
}));

const commentRows = comments.map(c => ({
  id: c.id, postId: c.postId, author: c.username, text: c.text, likes: c.likesCount, pinned: c.isPinned ? 'yes' : '', createdAt: c.createdAt,
  authorFound: userById.has(c.userId) ? 'yes' : 'NO'
}));

// ---------- media inventory (everything the data points at) ----------
const mediaRows = [];
const addMedia = (owner, what, value) => {
  const m = describeMedia(value);
  if (m.kind === 'empty') return;
  mediaRows.push({ where: what, owner, kind: m.kind, b2Key: m.key, note: m.note || '' });
};
users.forEach(u => addMedia(u.username, 'profile photo', u.avatar));
posts.forEach(p => (p.slides || []).forEach((s, i) => addMedia(`${p.username} / ${p.id}`, `post photo ${i + 1}`, s.objectKey || s.mediaUrl)));
reels.forEach(r => { addMedia(`${r.username} / ${r.id}`, 'reel video', r.videoUrl); addMedia(`${r.username} / ${r.id}`, 'reel thumbnail', r.thumbnailUrl); });
stories.forEach(s => addMedia(`${s.username} / ${s.id}`, 'story', s.mediaUrl));
highlights.forEach(h => addMedia(h.username || h.userId || '', 'highlight cover', h.coverUrl));
musicTracks.forEach(t => { addMedia(t.id || '', 'music cover', t.coverUrl); addMedia(t.id || '', 'music audio', t.audioUrl); });
customStickers.forEach(s => addMedia(s.id || '', 'sticker', s.objectKey));
storeProducts.forEach(p => (p.media || []).forEach(m => addMedia(p.id || '', 'shop product media', m.objectKey || m.url)));
const b2Keys = [...new Set(mediaRows.filter(m => m.kind === 'b2').map(m => m.b2Key))].sort();

// ---------- things worth a human look ----------
const flags = [];
const emailCount = new Map();
users.forEach(u => { const e = (u.email || '').toLowerCase(); if (e) emailCount.set(e, [...(emailCount.get(e) || []), u.username]); });
for (const [, names] of emailCount) if (names.length > 1) flags.push(`Two accounts share one email address: ${names.join(' and ')}. The new system needs one email per account, so one of them needs a decision.`);
users.filter(u => !u.email).forEach(u => flags.push(`Account "${u.username}" has no email address.`));
users.filter(u => !u.password).forEach(u => flags.push(`Account "${u.username}" has no password saved.`));
users.filter(u => (u.avatar || '').startsWith('data:')).forEach(u => flags.push(`"${u.username}" profile photo is stored inside the database (${Math.round(u.avatar.length / 1024)} KB) — it will be moved to file storage.`));
users.filter(u => /^https?:/.test(u.avatar || '') && !/backblazeb2/.test(u.avatar)).forEach(u => flags.push(`"${u.username}" uses an outside image link for the profile photo (${new URL(u.avatar).host}) — it works only while that website keeps it online.`));
const drift = profileRows.filter(r => r.followers_actual !== r.followers_stored || r.following_actual !== r.following_stored || r.posts_actual !== r.posts_stored);
if (drift.length) flags.push(`${drift.length} account(s) have stored follower/following/post counters that don't match the real data (e.g. ${drift.slice(0, 3).map(r => r.username).join(', ')}). The new system will calculate these from the real data instead.`);
posts.filter(p => !userById.has(p.userId)).forEach(p => flags.push(`Post ${p.id} belongs to an account that no longer exists.`));
reels.filter(r => !userById.has(r.userId)).forEach(r => flags.push(`Reel ${r.id} belongs to an account that no longer exists.`));
comments.filter(c => !userById.has(c.userId)).forEach(c => flags.push(`A comment (${c.id}) belongs to an account that no longer exists.`));
const expiredLinks = mediaRows.filter(m => m.note.includes('expired link'));
if (expiredLinks.length) flags.push(`${expiredLinks.length} media item(s) were saved as one-hour links that have since expired; their real file names were recovered from the link, so nothing is lost.`);

// ---------- write the review folder ----------
const out = path.join(dir, 'review');
fs.mkdirSync(out, { recursive: true });
const write = (name, text) => fs.writeFileSync(path.join(out, name), text);

write('PROFILES.csv', toCsv(Object.keys(profileRows[0] || {}), profileRows));
write('POSTS.csv', toCsv(Object.keys(postRows[0] || { id: '' }), postRows));
write('REELS.csv', toCsv(Object.keys(reelRows[0] || { id: '' }), reelRows));
write('COMMENTS.csv', toCsv(Object.keys(commentRows[0] || { id: '' }), commentRows));
write('MEDIA_FILES.csv', toCsv(['where', 'owner', 'kind', 'b2Key', 'note'], mediaRows));
// Machine-readable list for scripts/backup-b2-media.mjs
fs.writeFileSync(path.join(dir, 'media-keys.json'), JSON.stringify(b2Keys, null, 2));

const rawFiles = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
const checksumLines = rawFiles.map(f => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex')}  ${f}`);
write('CHECKSUMS.txt', checksumLines.join('\n') + '\n');

const counts = [
  ['Accounts (profiles)', users.length], ['Posts', posts.length],
  ['Photos inside posts', posts.reduce((n, p) => n + (p.slides || []).length, 0)], ['Reels', reels.length],
  ['Comments', comments.length], ['Stories', stories.length], ['Highlights', highlights.length],
  ['Notifications', notifications.length], ['Chats', chats.length], ['Chat messages', messageCount],
  ['Game scores', gameScores.length], ['Coupons', coupons.length], ['Support reviews', supportReviews.length],
  ['Music tracks', musicTracks.length], ['Custom stickers', customStickers.length], ['Shop products', storeProducts.length],
  ['Media files to copy from B2', b2Keys.length]
];

const table = (headers, rows) =>
  `<div class="scroll"><table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const avatarCell = (u) => {
  const v = u.avatar || '';
  if (v.startsWith('data:image/') || /^https?:\/\/(images\.unsplash\.com|api\.dicebear\.com)/.test(v)) return `<img class="av" src="${esc(v)}" alt="">`;
  return `<div class="av ph">${esc((u.username || '?')[0].toUpperCase())}</div>`;
};

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NOOB backup check</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#1a1a1a;--mut:#666;--line:#ddd;--card:#f6f6f6;--warn:#fff4d6;--warnb:#e0b400}
@media(prefers-color-scheme:dark){:root{--bg:#121212;--fg:#eee;--mut:#9a9a9a;--line:#333;--card:#1c1c1c;--warn:#3a3000;--warnb:#a88a00}}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif;max-width:1200px;margin-inline:auto}
h1{margin:.2em 0}h2{margin-top:2em;border-bottom:1px solid var(--line);padding-bottom:.2em}
.mut{color:var(--mut)}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px}
.tile{background:var(--card);border-radius:8px;padding:10px 12px}.tile b{font-size:22px;display:block}
.warn{background:var(--warn);border-left:4px solid var(--warnb);padding:8px 12px;margin:6px 0;border-radius:4px}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}
th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}th{position:sticky;top:0;background:var(--card)}
.av{width:44px;height:44px;border-radius:50%;object-fit:cover;background:var(--card)}.ph{display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--mut)}
code{font-size:12px;word-break:break-all}
</style></head><body>
<h1>NOOB backup — check sheet</h1>
<p class="mut">Made from the raw backup folder <code>${esc(path.basename(dir))}</code>. Private: this file lists real people's details. Do not upload or share it. Passwords are not shown here (they are kept in the raw backup).</p>

<h2>Totals — please compare with what you expect</h2>
<div class="grid">${counts.map(([k, v]) => `<div class="tile"><b>${v}</b>${esc(k)}</div>`).join('')}</div>

<h2>Things to look at (${flags.length})</h2>
${flags.length ? flags.map(f => `<div class="warn">${esc(f)}</div>`).join('') : '<p>Nothing unusual found.</p>'}

<h2>Profiles (${users.length})</h2>
<p class="mut">"actual" numbers are counted from the real data; "stored" numbers are what the old app had saved.</p>
${table(['', 'Username', 'Name', 'Email', 'Mobile', 'Born', 'Bio', 'Type', 'Followers (actual/stored)', 'Following', 'Posts', 'Points', 'Joined', 'Photo'],
  users.map((u, i) => {
    const r = profileRows[i];
    return [avatarCell(u), `<b>${esc(u.username)}</b>${u.isVerified ? ' ✔' : ''}${u.isAdmin ? ' (admin)' : ''}`, esc(u.displayName), esc(u.email), esc(r.mobile), esc(u.dateOfBirth), esc(u.bio),
      esc(u.accountType), `${r.followers_actual} / ${esc(u.followersCount)}`, `${r.following_actual} / ${esc(u.followingCount)}`, `${r.posts_actual} / ${esc(u.postsCount)}`, esc(u.noobPoints), esc(u.createdAt), `<code>${esc(r.avatar)}</code>`];
  }))}

<h2>Posts (${posts.length})</h2>
${table(['Post', 'By', 'Caption', 'Date', 'Photos', 'Likes', 'Comments', 'Files'], postRows.map(r => [`<code>${esc(r.id)}</code>`, esc(r.author), esc(r.caption), esc(r.createdAt), r.slides, `${r.likes_actual} / ${esc(r.likes_stored)}`, `${r.comments_actual} / ${esc(r.comments_stored)}`, `<code>${esc(r.media.join(' | '))}</code>`]))}

<h2>Reels (${reels.length})</h2>
${table(['Reel', 'By', 'Caption', 'Date', 'Seconds', 'Likes', 'Views', 'Files'], reelRows.map(r => [`<code>${esc(r.id)}</code>`, esc(r.author), esc(r.caption), esc(r.createdAt), esc(r.duration_s), `${r.likes_actual} / ${esc(r.likes_stored)}`, esc(r.views), `<code>${esc(r.video)} | ${esc(r.thumbnail)}</code>`]))}

<h2>Comments (${comments.length})</h2>
${table(['On post', 'By', 'Text', 'Date'], commentRows.map(r => [`<code>${esc(r.postId)}</code>`, esc(r.author), esc(r.text), esc(r.createdAt)]))}

<h2>Fingerprints of the raw files</h2>
<p class="mut">If any of these change, the raw backup was modified. Also saved as CHECKSUMS.txt.</p>
<pre style="overflow-x:auto">${esc(checksumLines.join('\n'))}</pre>
</body></html>`;
write('index.html', html);

console.log(`Review files written to: ${out}`);
console.log('  index.html      <- open this in your browser');
console.log('  PROFILES.csv, POSTS.csv, REELS.csv, COMMENTS.csv, MEDIA_FILES.csv  <- open in Excel');
console.log('  CHECKSUMS.txt   <- fingerprints of the raw backup');
console.log(`Totals: ${users.length} accounts, ${posts.length} posts, ${reels.length} reels, ${comments.length} comments, ${b2Keys.length} media files in B2.`);
console.log(`Flags for a human to look at: ${flags.length}`);
