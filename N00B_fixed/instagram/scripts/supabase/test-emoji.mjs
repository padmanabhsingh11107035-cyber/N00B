// Tests the chat's emoji and sticker pickers: the generated data (every emoji phones have today, skin tones, search words, the verified
// animated stickers) and the rules (search, skin tones, recently used, sticker addresses). Pure logic: no browser needed.
//
// Usage: node scripts/supabase/test-emoji.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const E = await import(pathToFileURL(path.resolve('src/components/Chat/emojiLogic.ts')).href);
const data = JSON.parse(fs.readFileSync('src/data/emojiData.json', 'utf8'));
const stk = JSON.parse(fs.readFileSync('src/data/stickerData.json', 'utf8'));

section('1. The emoji list');
check(data.emoji.length >= 1800, `${data.emoji.length} emoji (the old picker had about 280)`);
check(data.groups.length === 9 && data.groups[0] === 'Smileys & emotion' && data.groups.at(-1) === 'Flags', 'nine groups, from smileys to flags');
check(data.emoji.every((e) => Array.isArray(e) && e.length === 6 && typeof e[0] === 'string' && e[0].length > 0 && typeof e[1] === 'string' && e[1].length > 0 && e[3] >= 0 && e[3] < 9), 'every entry has an emoji, a name and a real group');
check(new Set(data.emoji.map((e) => e[0])).size === data.emoji.length, 'no emoji appears twice');
check(data.emoji.every((e) => e[4] <= 15.1), 'only emoji that phones have today (Unicode 15.1 or older)');
check(data.emoji.filter((e) => e[5]).length >= 250 && data.emoji.filter((e) => e[5]).every((e) => e[5].length === 5 && e[5].every((s) => typeof s === 'string' && s.length > e[0].length - 1)), 'about 300 emoji come in five skin tones, each with exactly five versions');
const must = ['😀', '😂', '❤️', '🔥', '👍', '🙏', '🎉', '🇮🇳', '🇺🇸', '👨‍👩‍👧‍👦', '🏳️‍🌈', '🧑‍💻', '🫶', '🥹'];
check(must.every((m) => data.emoji.some((e) => e[0].replace(/️/g, '') === m.replace(/️/g, ''))), 'the everyday ones are there, including flags, family and joined emoji', must.filter((m) => !data.emoji.some((e) => e[0].replace(/️/g, '') === m.replace(/️/g, ''))).join(' '));
check(data.emoji.every((e) => !/[\u{1F3FB}-\u{1F3FF}]/u.test(e[0])), 'the plain list holds no skin-tone versions (they live inside their emoji)');

section('2. Search');
// (the list keeps the emoji in their full form, with an invisible "show as a picture" mark; it looks the same)
const plain = (x) => x.replace(/️/g, '');
const names = (q) => E.searchEmoji(data, q).map((e) => plain(e[0]));
check(names('heart').includes('❤') && names('heart').includes('💙'), '"heart" finds hearts');
check(names('lol').includes('😂') || names('laugh').includes('😂'), 'search words work too ("laugh" finds a laughing face)');
check(names('fire').includes('🔥') && names('FIRE').includes('🔥'), 'capital letters do not matter');
check(names('waving').includes('👋') && names('thumbs up').includes('👍'), 'several words: every word must match');
check(names('thumbs zzzz').length === 0 && names('').length === 0 && names('   ').length === 0 && names('%%%').length === 0, 'silly searches find nothing, empty search shows nothing');
check(E.searchEmoji(data, 'face', 10).length === 10, 'the number of answers is limited');
check(E.searchEmoji(data, 'cat')[0][1].startsWith('cat'), 'names that start with the typed word come first');
check(E.emojiInGroup(data, 8).every((e) => e[3] === 8) && E.emojiInGroup(data, 8).length > 100, 'a group holds its own emoji');

section('3. Skin tones');
const wave = data.emoji.find((e) => e[0] === '👋');
check(E.withTone(wave, 0) === '👋' && E.withTone(wave, 1) === wave[5][0] && E.withTone(wave, 5) === wave[5][4] && E.withTone(wave, 3).includes('🏽'), 'the chosen tone gives the right version');
const heart = data.emoji.find((e) => e[0] === '❤️');
check(E.withTone(heart, 3) === '❤️', 'an emoji without tones is never changed');
check(E.withTone(wave, 9) === '👋' && E.withTone(wave, -1) === '👋', 'a bad tone number changes nothing');
check(E.TONES.length === 6 && E.TONES[0] === '' && E.TONES.slice(1).every((t) => t.length > 0), 'six choices: none and five tones');

section('4. Recently used');
let r = [];
r = E.pushRecent(r, '😀'); r = E.pushRecent(r, '🔥'); r = E.pushRecent(r, '😀');
check(r.join() === '😀,🔥', 'the newest is first, and nothing is listed twice');
let many = []; for (let i = 0; i < 50; i++) many = E.pushRecent(many, 'e' + i);
check(many.length === 32 && many[0] === 'e49', 'only the last 32 are kept');

section('5. Animated stickers');
check(stk.stickers.length >= 800, `${stk.stickers.length} animated stickers`);
check(/CC BY 4.0/.test(stk.credit) && /Google/.test(stk.credit), 'the credit the licence asks for is included');
check(stk.stickers.every((s) => Array.isArray(s) && s.length === 3 && /^[0-9a-f]{4,6}(_[0-9a-f]{4,6})*$/.test(s[0])), 'every sticker has a proper code');
check(new Set(stk.stickers.map((s) => s[0])).size === stk.stickers.length, 'no sticker twice');
const cats = E.stickerCategories(stk.stickers);
check(cats.length >= 6 && cats.includes('Faces') && cats.includes('Animals'), 'stickers come in categories: ' + cats.join(', '));
check(E.stickerUrl('1f602') === 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f602/512.webp' && E.stickerPreviewUrl('1f602') === 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f602/128.png', 'the sent picture is the moving one; the grid shows a light still one');
check(E.isAnimatedStickerUrl(E.stickerUrl('2764_fe0f')) && !E.isAnimatedStickerUrl('https://evil.example.com/x.webp') && !E.isAnimatedStickerUrl('') && !E.isAnimatedStickerUrl(null), 'only real sticker addresses are recognised');
check(E.searchStickers(stk.stickers, 'smile').length > 0 && E.searchStickers(stk.stickers, '', 'Faces').every((s) => s[1] === 'Faces') && E.searchStickers(stk.stickers, 'zzzzqqq').length === 0, 'sticker search and category filter work');
check(fs.statSync('src/data/emojiData.json').size < 300000 && fs.statSync('src/data/stickerData.json').size < 60000, 'the data files are small (loaded only when the picker is opened)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
