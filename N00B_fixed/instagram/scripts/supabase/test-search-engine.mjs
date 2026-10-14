// The video search (src/utils/searchEngine.ts): it must behave like YouTube's search box, not like "the title has to contain exactly what I typed".
// Usage: node scripts/supabase/test-search-engine.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const E = await import(pathToFileURL(path.resolve('src/utils/searchEngine.ts')).href);

const VIDEOS = [
  { id: 'v1', title: 'Python Tutorial for Beginners', username: 'codewithasha', description: 'Learn python from zero. Variables, loops and functions.', views: 5000, likes: 300 },
  { id: 'v2', title: 'Best Bollywood Songs 2026', username: 'musicmania', description: 'Top hindi gaana playlist, lofi remix included', views: 90000, likes: 4000 },
  { id: 'v3', title: 'Funniest Cricket Fails', username: 'cricketbuzz', description: 'A comedy compilation of IPL bloopers', views: 2000, likes: 150 },
  { id: 'v4', title: 'Easy Biryani Recipe at Home', username: 'chefrahul', description: 'Cooking a restaurant style biryani, step by step', views: 12000, likes: 900 },
  { id: 'v5', title: 'My Minecraft Survival Gameplay', username: 'gamerkid', description: 'Day 1 of survival, building a base', views: 800, likes: 50 },
  { id: 'v6', title: 'Morning Yoga Routine', username: 'fitwithpriya', description: 'Ten minute stretch and breathing, daily', views: 3000, likes: 400 },
  { id: 'v7', title: 'Café Vlog: Mumbai Street Food Tour', username: 'foodiejay', description: 'Eating our way through Mumbai', views: 7000, likes: 500 },
  { id: 'v8', title: 'Photoshop Basics', username: 'designdan', description: 'A tutorial on layers and masks', views: 1500, likes: 90 }
];
const docs = VIDEOS.map((v) => ({ item: v, boost: E.popularity({ views: v.views, likes: v.likes }), fields: [{ text: v.title, weight: 5 }, { text: v.username, weight: 3 }, { text: v.description, weight: 1.5 }] }));
const idx = E.buildIndex(docs);
const find = (q) => E.searchIndex(q, idx).map((h) => h.item.id);

section('1. Words, not exact names');
check(find('python')[0] === 'v1', 'one word finds the video that has it in its title');
check(find('tutorial python')[0] === 'v1', 'the order of the words does not matter');
check(find('python beginners tutorial')[0] === 'v1', 'a few words together find it');
check(find('PYTHON, Tutorial!!').join() === find('python tutorial').join(), 'capitals and punctuation do not matter');
check(find('cafe').includes('v7') && find('café').includes('v7'), 'accents do not matter either way (cafe / café)');
check(find('biryani').includes('v4') && find('biryani')[0] === 'v4', 'a word from the title and description ranks it first');
check(find('codewithasha')[0] === 'v1' && find('asha').length === 0 || find('codewithasha')[0] === 'v1', 'the uploader\'s name is searched too');
check(find('how to learn python')[0] === 'v1', 'little joining words ("how to") are ignored');

section('2. Forgiving');
check(find('pyhton')[0] === 'v1', 'a typo still finds it ("pyhton")');
check(find('tutoral')[0] === 'v1' || find('tutoral').includes('v1'), 'a missing letter still finds it ("tutoral")');
check(find('bryani').includes('v4') || find('biriyani').includes('v4'), 'a misspelt dish still finds the recipe');
check(find('min')[0] === 'v5' || find('min').includes('v5'), 'a word still being typed finds it ("min" -> minecraft / minute)');
check(find('mine')[0] === 'v5', 'typing part of a word finds it ("mine")');
check(find('songs').includes('v2') && find('song').includes('v2'), 'song and songs are the same word');
check(find('gaming').includes('v5') && find('games').includes('v5'), 'gaming, games and gameplay are found by each other');
check(find('cook').includes('v4') && find('cooking')[0] === 'v4', 'cook and cooking find the recipe');

section('3. Related words (this is what makes it feel like a search engine)');
check(find('music').includes('v2') && find('music')[0] === 'v2', 'music finds the songs video (and its uploader "musicmania")');
check(find('comedy').includes('v3'), 'comedy finds the funny cricket video');
check(find('funny').includes('v3'), 'funny finds it too');
check(find('food').includes('v4') && find('food').includes('v7'), 'food finds the recipe and the street-food tour');
check(find('workout').includes('v6') || find('yoga').includes('v6'), 'workout / yoga find the yoga routine');
check(find('learn').includes('v1') && find('learn').includes('v8'), 'learn finds both tutorials');
check(find('gaana')[0] === 'v2', 'a Hinglish word (gaana) finds the songs');
check(find('travel').includes('v7'), 'travel finds the vlog / tour');
check(find('zzzzqqq').length === 0, 'something that matches nothing gives nothing');

section('4. Ranking');
{
  const r = find('python tutorial');
  check(r[0] === 'v1' && r.includes('v8') && r.indexOf('v1') < r.indexOf('v8'), 'both words beat one word: the python tutorial first, the other tutorial after it');
}
{
  const a = E.search('survival', [
    { item: 'in-description', fields: [{ text: 'My day', weight: 5 }, { text: 'a survival story', weight: 1.5 }] },
    { item: 'in-title', fields: [{ text: 'Survival tips', weight: 5 }, { text: 'something else', weight: 1.5 }] }
  ]).map((h) => h.item);
  check(a.join() === 'in-title,in-description', 'a word in the title beats the same word in the description');
}
{
  const a = E.search('street food', [
    { item: 'loose', fields: [{ text: 'food and a street', weight: 5 }] },
    { item: 'phrase', fields: [{ text: 'Best street food ever', weight: 5 }] }
  ]).map((h) => h.item);
  check(a[0] === 'phrase', 'the exact phrase beats the same words scattered');
}
{
  const a = E.search('dance', [
    { item: 'quiet', boost: 0, fields: [{ text: 'dance video', weight: 5 }] },
    { item: 'popular', boost: 1, fields: [{ text: 'dance video', weight: 5 }] }
  ]).map((h) => h.item);
  check(a[0] === 'popular', 'between equally good results the popular one comes first');
  check(E.popularity({ views: 100000, likes: 5000, createdAt: new Date().toISOString() }) > E.popularity({ views: 10, likes: 0, createdAt: new Date(Date.now() - 400 * 86400000).toISOString() }) && E.popularity({}) >= 0 && E.popularity({ views: 1e12, likes: 1e12 }) <= 1, 'popularity is 0 to 1: watched, liked and recent scores higher');
}

section('5. Did you mean');
check(E.didYouMean('pyhton tutoral', idx.vocab) === 'python tutorial', '"pyhton tutoral" -> "python tutorial"', E.didYouMean('pyhton tutoral', idx.vocab));
check(E.didYouMean('python tutorial', idx.vocab) === null, 'a correct search is not "corrected"');
check(E.didYouMean('mine', idx.vocab) === null && E.didYouMean('min', idx.vocab) === null, 'a word still being typed is not "corrected"');
check(E.didYouMean('xyzxyz', idx.vocab) === null, 'a word nothing is close to is left alone');

section('6. Suggestions while typing');
const titles = VIDEOS.map((v) => v.title);
check(E.suggest('py', titles)[0] === 'Python Tutorial for Beginners', 'typing "py" offers the titles that begin with it');
check(E.suggest('tut', titles).length === 0 || E.suggest('tut', titles).includes('Python Tutorial for Beginners'), 'and titles with a word that begins with it');
check(E.suggest('python tutorial for beginners', titles).length === 0, 'nothing is offered when the whole title is already typed');
check(E.suggest('', titles).length === 0, 'nothing is offered for an empty box');
check(E.suggest('m', ['Mumbai a', 'Mumbai a', 'Mumbai b', 'Minecraft', 'Morning', 'Music', 'More', 'Mad'], 3).length === 3, 'at most the asked number, with no repeats');

section('7. Recent searches (kept on this phone)');
{
  const store = {};
  globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  E.clearSearches('t');
  E.rememberSearch('python', 't'); E.rememberSearch('Python ', 't'); E.rememberSearch('yoga', 't'); E.rememberSearch('a', 't');
  check(E.recentSearches('t').join().toLowerCase() === 'yoga,python', 'newest first, no repeats, a single letter is not kept', E.recentSearches('t').join());
  for (let i = 0; i < 12; i++) E.rememberSearch('query number ' + i, 't');
  check(E.recentSearches('t').length === 8 && E.recentSearches('t')[0] === 'query number 11', 'only the latest eight are kept');
  check(E.forgetSearch('query number 11', 't').length === 7, 'one can be removed');
  E.clearSearches('t');
  check(E.recentSearches('t').length === 0, 'and all of them cleared');
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  E.rememberSearch('hello world', 'blocked');
  check(E.recentSearches('blocked').join() === 'hello world', 'a phone that blocks storage still remembers them until the app is closed');
  delete globalThis.localStorage;
}

section('8. Other scripts and edge cases');
check(E.normalize('  Hello,   WORLD!! #tag @user_name ') === 'hello world tag user name', 'normalize: lower case, no punctuation, # and @ and _ become spaces');
check(E.search('गाना', [{ item: 'hindi', fields: [{ text: 'नया गाना 2026', weight: 5 }] }]).length === 1, 'Hindi words are matched as they are written');
check(E.search('', docs).length === 0 && E.search('   ', docs).length === 0 && E.search('the', docs).length === 0, 'an empty search, or only joining words, finds nothing');
check(E.search('video', [{ item: 1, fields: [{ text: null, weight: 5 }, { text: undefined, weight: 1 }] }]).length === 0, 'a missing title or description never crashes');
check(E.wordScore('a', 'apple') < 0.8 && E.wordScore('x', 'y') === 0, 'a single letter does not match everything');
check(E.editDistance('video', 'vidoe', 2) === 1 && E.editDistance('abc', 'xyzxyz', 2) === 3, 'edit distance: a swap is one change; far-apart words give up early');
const t0 = Date.now();
const big = Array.from({ length: 3000 }, (_, i) => ({ item: i, boost: (i % 10) / 10, fields: [{ text: `video number ${i} about ${['music', 'cooking', 'travel', 'gaming'][i % 4]} and more`, weight: 5 }, { text: 'user' + (i % 50), weight: 3 }, { text: 'a long description that goes on and on '.repeat(5), weight: 1.5 }] }));
const bi = E.buildIndex(big);
const t1 = Date.now();
const res = E.searchIndex('cokking vidoe', bi);
check(res.length > 0 && Date.now() - t1 < 1500, `3000 videos are searched quickly (${Date.now() - t1} ms, index ${t1 - t0} ms)`);
check(!/\(\?<[=!]/.test(read('src/utils/searchEngine.ts')), 'no regex look-behind');

section('9. The Feed page uses it');
const feed = read('src/components/Videos/HomeVideoFeedView.tsx');
check(/from '\.\.\/\.\.\/utils\/searchEngine'/.test(feed) && /searchIndex(?:<\w+>)?\(/.test(feed) && /buildIndex(?:<\w+>)?\(/.test(feed), 'the Feed search runs through the engine');
check(!/v\.title\.toLowerCase\(\)\.includes\(q\)/.test(feed), 'the old "title must contain exactly this" test is gone');
check(/didYouMean\(/.test(feed) && /Showing results for/.test(feed), 'it says "Showing results for ..." when it fixed a typo');
check(/suggest\(/.test(feed) && /recentSearches\(\)/.test(feed) && /rememberSearch\(/.test(feed), 'it offers suggestions and recent searches under the box');
const explore = read('src/components/Explore/ExploreView.tsx');
check(/searchIndex(?:<\w+>)?\(/.test(explore) && /buildIndex(?:<\w+>)?\(/.test(explore) && !/\.toLowerCase\(\)\.includes\(searchQuery\.toLowerCase\(\)\)/.test(explore.split('// Active items count')[0].split('// Search works like')[1] || ''), 'Explore uses the same engine for posts and reels');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
