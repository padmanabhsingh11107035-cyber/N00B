// Tests the pure parts of the language feature: the language list, the text keys, the catalog and the matching of screen text to
// translations (including texts with slots like "{0} followers"), and the checks on translations coming back from the translator.
// (What it does on a real screen is checked in the browser.)
//
// Usage: node scripts/supabase/test-i18n.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const load = (p) => import(pathToFileURL(path.resolve(p)).href);
const L = await load('src/i18n/languages.ts');
const K = await load('src/i18n/textKey.ts');
const T = await load('src/i18n/translator.ts');
const catalog = JSON.parse(fs.readFileSync('src/i18n/catalog.json', 'utf8'));

section('1. The language list');
const codes = L.LANGUAGES.map((l) => l.code);
check(L.LANGUAGES.length >= 110, `offers ${L.LANGUAGES.length} languages`);
check(L.DEFAULT_LANGUAGE === 'en' && L.LANGUAGES[0].code === 'en', 'English is the default and comes first');
check(new Set(codes.map((c) => c.toLowerCase())).size === codes.length, 'no language appears twice');
check(L.LANGUAGES.every((l) => l.code && l.name && l.native && /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(l.code)), 'every language has a proper code, an English name and a native name');
const must = ['hi', 'es', 'fr', 'ar', 'zh-CN', 'pt', 'ru', 'ja', 'de', 'bn', 'ur', 'ta', 'te', 'mr', 'gu', 'pa', 'kn', 'ml', 'ko', 'tr', 'id', 'sw', 'vi', 'th', 'fa', 'he'];
check(must.every((c) => codes.includes(c)), 'all the big languages (Hindi, Spanish, Arabic, Chinese, Bengali, Tamil...) are there', must.filter((c) => !codes.includes(c)).join(','));
check(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi'].every((c) => L.isRtl(c)) && !L.isRtl('en') && !L.isRtl('hi') && !L.isRtl('zz'), 'right-to-left languages are marked (and only those)');
check(L.findLanguage('HI')?.code === 'hi' && L.findLanguage('zh-cn')?.code === 'zh-CN' && L.findLanguage('xx') === undefined && L.findLanguage(null) === undefined, 'a code is found in any letter case; unknown codes are not');
check(L.cleanLanguageCode('FR') === 'fr' && L.cleanLanguageCode('nonsense') === 'en' && L.cleanLanguageCode(undefined) === 'en' && L.cleanLanguageCode('') === 'en', 'an unknown or missing language becomes English');
check(L.deviceLanguage(['hi-IN', 'en']) === 'hi' && L.deviceLanguage(['fr-CA']) === 'fr' && L.deviceLanguage(['nb-NO']) === 'no' && L.deviceLanguage(['zh-TW']) === 'zh-TW' && L.deviceLanguage(['zh-HK']) === 'zh-TW' && L.deviceLanguage(['zh']) === 'zh-CN' && L.deviceLanguage(['tl']) === 'fil' && L.deviceLanguage(['xx']) === 'en' && L.deviceLanguage([]) === 'en', 'the device language is understood');
check(L.searchLanguages('span').map((l) => l.code).join() === 'es' && L.searchLanguages('espanol').some((l) => l.code === 'es') && L.searchLanguages('हिन्दी').some((l) => l.code === 'hi') && L.searchLanguages('HIN').some((l) => l.code === 'hi'), 'search finds a language by English name, native name, without accents, any case');
check(L.searchLanguages('').length === L.LANGUAGES.length && L.searchLanguages('qqqq').length === 0, 'an empty search shows everything; a silly one shows nothing');

section('2. Text keys');
check(K.normalizeText('  Save \n   changes  ') === 'Save changes', 'line breaks and extra spaces collapse');
check(K.textId('Save') === K.textId('Save') && K.textId('Save') !== K.textId('save') && /^[0-9a-z]+$/.test(K.textId('Save')), 'the id is stable, case-sensitive and simple to store');
const ids = new Set();
for (let i = 0; i < 50000; i++) ids.add(K.textId('sample text number ' + i));
check(ids.size === 50000, 'no clashes among 50,000 different texts');
check(K.decodeEntities('Tom &amp; Jerry &copy; &#39;x&#39; &#x41; &nbsp;&bogus;') === "Tom & Jerry © 'x' A  &bogus;", 'HTML entities in JSX text are decoded');
check(K.looksLikeUiText('Save changes') && K.looksLikeUiText('Cancel') && K.looksLikeUiText('Ok', true) && K.looksLikeUiText('posts', true), 'real button and label text is accepted');
const junk = ['flex items-center gap-2', 'bg-red-500/10 border-white/5', 'text-[10px]', '/api/users', 'https://nooob.xyz', 'user_name', 'camelCaseName', 'MAX_VALUE', 'image.png', '12', '#00FF66', 'conic-gradient(from 180deg, #00FF66)', '', 'a'];
check(junk.every((j) => !K.looksLikeUiText(j)), 'class names, paths, links, identifiers and numbers are not mistaken for text', junk.filter((j) => K.looksLikeUiText(j)).join(' | '));
check(K.looksLikeUiText('not sure yet') && K.looksLikeUiText('Sign-in') && K.looksLikeUiText('Delete my account permanently'), 'ordinary sentences with dashes or lower-case words are still text');

section('3. The catalog (made from the source code by scripts/i18n/extract.mjs)');
check(catalog.count === catalog.strings.length && catalog.count > 1500, `${catalog.count} texts`);
check(catalog.strings.every(([id, s]) => id === K.textId(s) && s === K.normalizeText(s)), 'every id matches its text, and every text is already normalised');
check(new Set(catalog.strings.map(([id]) => id)).size === catalog.count, 'no two texts share an id');
const has = (s) => catalog.strings.some(([, t]) => t === s);
check(['Log In to Your Account', 'Create New Account', 'Name', 'Cancel'].every(has), 'the login and sign-up texts are in it');
check(catalog.strings.some(([, s]) => /Cyber Snake/.test(s)), 'game names are in it');

section('4. Matching screen text to translations');
const idx = T.buildIndex([
  ['a1', 'Save changes'], ['a2', '{0} followers'], ['a3', 'Hi {0}, welcome back!'], ['a4', 'Hi {0}'], ['a5', '{0}'], ['a6', '{0}:'],
  ['a7', 'Liked by {0} and {1} others'], ['a8', 'Followers']
]);
const tr = new Map([['a1', 'Enregistrer'], ['a2', '{0} abonnés'], ['a3', 'Salut {0}, bon retour !'], ['a4', 'Salut {0}'], ['a7', 'Aimé par {0} et {1} autres'], ['a8', 'Abonnés']]);
const one = (s, t = tr) => T.translateText(s, idx, t);
check(one('Save changes').text === 'Enregistrer' && one('Save changes').id === 'a1', 'a plain text is translated');
check(one('  Save changes ').text === '  Enregistrer ', 'the spaces around it are kept');
check(one('Save\n  changes').text === 'Enregistrer', 'even when the screen text has a line break inside');
check(one('12 followers').text === '12 abonnés', 'a text with a slot: the number is carried over');
check(one('Hi Asha, welcome back!').text === 'Salut Asha, bon retour !' && one('Hi Asha').text === 'Salut Asha', 'the more specific pattern wins');
check(one('Liked by asha_k and 41 others').text === 'Aimé par asha_k et 41 autres', 'two slots');
check(one('Followers').text === 'Abonnés' && one('followers').text === null && one('followers').id === null, 'plain texts match exactly (case matters)');
check(one('Hello there, this is a comment someone wrote').text === null && one('Hello there, this is a comment someone wrote').id === null, 'a comment or post is never touched');
check(one('12').id === null && one('42:').id === null, 'a lone slot pattern ("{0}") never grabs anything');
check(one('Save changes', new Map()).text === null && one('Save changes', new Map()).id === 'a1', 'a text without a translation yet reports its id, so it can be fetched');
check(one('9 followers', new Map()).id === 'a2' && one('9 followers', new Map()).text === null, '...also for texts with slots');
check(T.translateText('', idx, tr).id === null && T.translateText('   ', idx, tr).id === null, 'empty text is ignored');

section('5. Checking a translation from the translator');
const ok = T.isUsableTranslation;
check(ok('Save', 'Guardar') && ok('{0} followers', '{0} seguidores') && ok('{0} of {1}', '{1} de {0}'), 'a normal translation, with slots in any order, is accepted');
check(!ok('Save', '') && !ok('Save', '   ') && !ok('Save', null) && !ok('Save', 42) && !ok('Save', undefined), 'empty or non-text answers are rejected');
check(!ok('{0} followers', 'seguidores') && !ok('{0} followers', '{0} {1} seguidores') && !ok('Hi', 'Hola {0}'), 'a lost, added or invented slot is rejected');
check(!ok('Save', 'x'.repeat(200)), 'a rambling answer is rejected');
check(!ok('Save', 'Guardar<script>alert(1)</script>') && ok('Bold <b>text</b>', 'Texto <b>negrita</b>'), 'markup that was not in the source is rejected');
check(!ok('Save', 'Guar' + String.fromCharCode(0) + 'dar'), 'control characters are rejected');

section('6. Speed');
const big = T.buildIndex(catalog.strings);
const map = new Map(catalog.strings.map(([id, s]) => [id, s + '!']));
let t0 = performance.now(), hits = 0;
for (let i = 0; i < 20000; i++) if (T.lookup(catalog.strings[i % catalog.count][1], big, map)) hits++;
const perMs = 20000 / (performance.now() - t0);
check(hits === 20000, 'every catalog text is found again');
t0 = performance.now();
for (let i = 0; i < 20000; i++) T.lookup('a comment somebody wrote number ' + i + ' with some words in it', big, map);
const missPerMs = 20000 / (performance.now() - t0);
check(perMs > 20 && missPerMs > 5, `fast enough: ${Math.round(perMs)} matches per millisecond, ${Math.round(missPerMs)} non-matches per millisecond`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
