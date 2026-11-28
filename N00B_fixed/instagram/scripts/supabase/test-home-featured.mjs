// NOOB's own posts on Home (3D models and pictures that ship with the app): migration 20261128000001 on a REAL Postgres (PGlite) + the app wiring.
// Usage: node --liftoff-only scripts/supabase/test-home-featured.mjs
import fs from 'node:fs';
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

section('1. The database');
const sql = read('supabase/migrations/20261128000001_home_featured_items.sql');
check(/revoke all on public\.mix_saves, public\.mix_reposts from public, anon, authenticated/.test(sql) && !/create table[^;]*featured_items/i.test(sql), 'the counters can not be read or written by the app directly, and there is no table of items (nobody can publish one)');
const db = await createTestDb();
const mk = async (name) => {
  const id = (await db.query('select gen_random_uuid() as id')).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values ($1, $2, 'x', $3::jsonb)`, [id, `${name}@users.nooob.xyz`, JSON.stringify({ legacy_id: `u_${name}` })]);
  await db.query(`insert into public.profiles (id, username, display_name, avatar) values ($1, $2, $2, 'avatars/test.jpg')`, [id, name]);
  return id;
};
const call = (uid, fn, args = []) => asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
const fail = async (uid, fn, args) => { try { await call(uid, fn, args); return ''; } catch (e) { return String(e.message || e); } };
const a = await mk('ft_a'), b = await mk('ft_b');
const ID1 = 'f0f0f0f0-0000-4000-8000-000000000001', ID2 = 'f0f0f0f0-0000-4000-8000-000000000002', BAD = 'f0f0f0f0-0000-4000-8000-000000000000', OTHER = '11111111-0000-4000-8000-000000000001';

let r = await call(a, 'mix_like', ['featured', ID1, true]);
check(r.liked === true && r.likes === 1, 'a like on a featured item counts');
r = await call(b, 'mix_like', ['featured', ID1, true]);
check(r.likes === 2, 'a second person adds to it');
r = await call(a, 'mix_like', ['featured', ID1, true]);
check(r.likes === 2, 'the same person can not like twice');
r = await call(a, 'mix_like', ['featured', ID1, false]);
check(r.likes === 1 && r.liked === false, 'unlike takes it back');
check(/no longer available/i.test(await fail(a, 'mix_like', ['featured', OTHER, true])) && /no longer available/i.test(await fail(a, 'mix_like', ['featured', BAD, true])), 'an id outside the fixed range is refused');
const c = await call(a, 'mix_comment_add', ['featured', ID1, 'nice ball']);
check(c.body === 'nice ball' && c.user.username === 'ft_a', 'a comment on a featured item is saved with its writer');
check((await call(b, 'mix_comments_list', ['featured', ID1])).comments.length === 1, 'and listed');
check(/no longer available/i.test(await fail(a, 'mix_comment_add', ['featured', OTHER, 'x'])), 'no comment on an id outside the range');

section('2. Save and repost');
check((await call(a, 'mix_save', ['featured', ID1, true])).on === true, 'save works');
r = await call(a, 'mix_repost', ['featured', ID2, true]);
check(r.on === true && r.reposts === 1, 'repost works and counts');
r = await call(b, 'mix_repost', ['featured', ID2, true]);
check(r.reposts === 2, 'a second repost counts');
r = await call(b, 'mix_repost', ['featured', ID2, false]);
check(r.reposts === 1 && r.on === false, 'undoing a repost takes it away');
const st = await call(a, 'mix_stats', ['featured', [ID1, ID2]]);
check(st[ID1].saved === true && st[ID1].likes === 1 && st[ID1].comments === 1 && st[ID2].reposted === true && st[ID2].reposts === 1, 'the numbers carry likes, comments, reposts and what this person did');
const stB = await call(b, 'mix_stats', ['featured', [ID1]]);
check(stB[ID1].saved === false, 'a save is private: another person does not see it as theirs');
check(/no longer available/i.test(await fail(a, 'mix_save', ['anon', ID1, true])) && /no longer available/i.test(await fail(a, 'mix_repost', ['poll', ID1, true])), 'save and repost exist only for featured items');
let anonErr = '';
try { await asAnon(db, () => db.query('select public.mix_repost($1, $2, true)', ['featured', ID1])); } catch (e) { anonErr = String(e.message || e); }
check(/permission denied/i.test(anonErr), 'a visitor without an account can not repost');
let direct = '';
try { await asUser(db, a, () => db.query('select * from public.mix_reposts')); } catch (e) { direct = String(e.message || e); }
check(/permission denied/i.test(direct), 'the repost table can not be read directly');
check((await call(a, 'mix_stats', ['anon', ['11111111-0000-4000-8000-000000000009']]))['11111111-0000-4000-8000-000000000009'].likes === 0, 'thoughts and polls still work as before');

section('3. The app');
const mix = read('src/components/Feed/HomeMix.tsx'), feed = read('src/components/Feed/FeedView.tsx'), feat = read('src/utils/features.ts'), data = read('src/data/featuredPosts.ts'), css = read('src/components/Feed/home.css'), filt = read('src/utils/homeFilter.ts');
check(/kind: 'featured'; at: string; featured: FeaturedPost/.test(mix) && /<FeaturedCard post=\{item\.featured\}/.test(mix) && /<MixBar kind="featured"[^>]*extras/.test(mix), 'a featured post is a card between the posts, with the bar plus Repost and Save');
check(/data-testid="home-mix-repost"/.test(mix) && /data-testid="home-mix-save"/.test(mix) && /setMixRepost\(kind, id, on\)/.test(mix) && /setMixSave\(kind, id, on\)/.test(mix), 'Repost and Save buttons work through the database functions');
check(/React\.lazy\(\(\) => import\('\.\.\/Featured\/ModelBox3D'\)\)/.test(mix), 'the 3D engine is fetched only when a 3D post is on screen');
check(/featOn\('featured'\)\);/.test(feed) && /key: 'featured'/.test(feat), 'the administrator can switch them off (Pages tab)');
check(/FEATURED_POSTS/.test(data) && !/(upload|fetch|supabase)/i.test(data.replace(/\/\/.*$/gm, '')), 'the list of posts is only a file in the app: nothing is uploaded and nothing is stored on the server');
check(/type: 'model'[^\n]*build: 'ball-eyes'/.test(data) && !/type: 'image'/.test(data) && !fs.existsSync('public/featured/noob-tee-girl.svg'), 'the Noob Ball is the only post (the 2D picture was removed)');
check(/\.hm-feat-media \{/.test(css) && /\.hm-ab\.is-on/.test(css), 'styles for the posts');
check(/item\.kind === 'featured' && f\.kinds\.length/.test(filt), 'a filter on Home by kind hides these posts (they pass only when no kind is chosen)');
check(!fs.existsSync('src/components/Models') && !/NOOB Models/.test(feed), 'the NOOB Models page is gone');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
