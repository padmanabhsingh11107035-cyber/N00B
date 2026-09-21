// Builds the two data files behind the chat's emoji and animated-sticker pickers.
//   src/data/emojiData.json   every emoji in the Unicode standard that phones show today (about 1,900, with skin tones and search words)
//   src/data/stickerData.json the free animated emoji stickers by Google (Noto Animated Emoji, CC BY 4.0), checked one by one
//
// Usage (needs network):
//   mkdir %TEMP%\emo && cd %TEMP%\emo && npm init -y && npm install emojibase-data
//   node scripts/build-emoji-data.mjs %TEMP%\emo
//
// The emoji themselves are drawn by each phone with its own emoji font (Apple's on an iPhone, Google's on Android), so every
// person sees the emoji in their phone's own style. Emoji newer than Unicode 15.1 are left out (most phones do not have them yet).
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('Give the folder where emojibase-data was installed.'); process.exit(1); }
const require = (p) => JSON.parse(fs.readFileSync(path.join(dir, 'node_modules', 'emojibase-data', p), 'utf8'));

const GROUPS = { 0: 'Smileys & emotion', 1: 'People & body', 3: 'Animals & nature', 4: 'Food & drink', 5: 'Travel & places', 6: 'Activities', 7: 'Objects', 8: 'Symbols', 9: 'Flags' };
const groupIds = Object.keys(GROUPS).map(Number);
const MAX_VERSION = 15.1;

const data = require('en/data.json');
const emoji = data
  .filter((e) => groupIds.includes(e.group) && e.emoji && e.version <= MAX_VERSION)
  .sort((a, b) => a.order - b.order)
  .map((e) => {
    const tags = [...new Set([...(e.tags || [])].map((t) => String(t).toLowerCase()))].join(' ');
    const skins = e.skins && e.skins.length === 5 ? e.skins.map((s) => s.emoji) : 0;
    return [e.emoji, e.label, tags, groupIds.indexOf(e.group), e.version, skins];
  });
fs.mkdirSync('src/data', { recursive: true });
fs.writeFileSync('src/data/emojiData.json', JSON.stringify({ groups: groupIds.map((g) => GROUPS[g]), emoji }) + '\n');
console.log(`emoji: ${emoji.length} (with skin tones: ${emoji.filter((e) => e[5]).length})`);

// ---- the animated stickers: only the ones whose picture files really exist
const api = await (await fetch('https://googlefonts.github.io/noto-emoji-animation/data/api.json')).json();
const base = 'https://fonts.gstatic.com/s/e/notoemoji/latest/';
const CAT = { 'Smileys and emotions': 'Faces', 'People and body': 'People', 'Animals and nature': 'Animals', 'Food and drink': 'Food', 'Travel and places': 'Travel', 'Activities and events': 'Fun', Objects: 'Things', Symbols: 'Symbols', Flags: 'Flags' };
const icons = api.icons;
const ok = [];
let next = 0;
async function worker() {
  while (next < icons.length) {
    const icon = icons[next++];
    try {
      const [a, b] = await Promise.all([fetch(`${base}${icon.codepoint}/512.webp`, { method: 'HEAD' }), fetch(`${base}${icon.codepoint}/128.png`, { method: 'HEAD' })]);
      if (a.ok && b.ok) ok.push(icon);
    } catch { /* skip this one */ }
  }
}
await Promise.all(Array.from({ length: 16 }, worker));
ok.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
const stickers = ok.map((i) => [i.codepoint, CAT[i.categories?.[0]] || 'Fun', String(i.tags?.[0] || '').replace(/^:|:$/g, '').replace(/-/g, ' ')]);
fs.writeFileSync('src/data/stickerData.json', JSON.stringify({ credit: 'Animated emoji by Google (Noto Emoji Animation), CC BY 4.0', stickers }) + '\n');
console.log(`animated stickers: ${stickers.length} of ${icons.length} listed (all picture files checked)`);
