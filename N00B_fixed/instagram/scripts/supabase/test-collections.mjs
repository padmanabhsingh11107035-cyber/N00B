// Saved collections (migration 20261118000004) and the Saved screen that uses them.
//   1. the SQL on a REAL Postgres (PGlite): make, fill, take out, rename, delete; only the owner; limits; a logged-out visitor is refused;
//   2. the screen: the fake "New collection" (a prompt() and a made-up local list) is gone, the real one calls the database, + on each saved picture, collection view.
// Usage: node --liftoff-only scripts/supabase/test-collections.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

section('1. The SQL on a real Postgres');
const { createTestDb, asUser, asAnon } = await import('./pg-test-env.mjs');
const db = await createTestDb();
const mkUser = async (name) => {
  const id = (await db.query('select gen_random_uuid() as id')).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, extensions.crypt('secret pass', extensions.gen_salt('bf')))`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query('select 1 from public.profiles where id = $1', [id])).rows.length) await db.query('insert into public.profiles (id, username, display_name) values ($1, $2, $2)', [id, name]);
  return id;
};
const ann = await mkUser('ann'), bob = await mkUser('bob');
const mkPost = async (uid) => (await db.query(`insert into public.posts (user_id, caption) values ($1, 'p') returning id`, [uid])).rows[0].id;
const p1 = await mkPost(bob), p2 = await mkPost(bob);
const call = async (uid, sql, args = []) => asUser(db, uid, async () => (await db.query(sql, args)).rows[0]?.r);
const fail = async (uid, sql, args = []) => { try { await call(uid, sql, args); return null; } catch (e) { return e.message; } };

const c1 = (await call(ann, 'select public.create_collection($1, $2) as r', ['Recipes', null])).collection;
check(c1.name === 'Recipes' && c1.postsCount === 0, 'a person can make a collection');
check((await call(ann, 'select public.create_collection($1, $2) as r', ['   ', null])).collection.name === 'New Collection', 'an empty name becomes "New Collection"');
check((await call(ann, 'select public.create_collection($1, $2) as r', ['x'.repeat(80), null])).collection.name.length === 40, 'a long name is cut to 40 letters');
const a1 = await call(ann, 'select public.add_post_to_collection($1, $2) as r', [c1.id, p1]);
check(a1.collection.postsCount === 1 && a1.collection.postIds[0] === p1, 'a post can be put in');
await call(ann, 'select public.add_post_to_collection($1, $2) as r', [c1.id, p1]);
check((await call(ann, 'select public.add_post_to_collection($1, $2) as r', [c1.id, p2])).collection.postsCount === 2, 'the same post twice counts once, another post is added');
check(/not found/i.test((await fail(bob, 'select public.add_post_to_collection($1, $2) as r', [c1.id, p1])) || ''), 'somebody else can not put posts into your collection');
check(/no longer available/i.test((await fail(ann, 'select public.add_post_to_collection($1, $2) as r', [c1.id, '00000000-0000-0000-0000-000000000000'])) || ''), 'a post that does not exist is refused');
check((await call(bob, 'select jsonb_array_length(public.my_collections()) as r')) === 0, 'somebody else does not see your collections');
const rm = await call(ann, 'select public.remove_post_from_collection($1, $2) as r', [c1.id, p1]);
check(rm.collection.postsCount === 1 && !rm.collection.postIds.includes(p1), 'a post can be taken out');
check((await db.query('select 1 from public.posts where id = $1', [p1])).rows.length === 1, 'taking it out does not delete the post');
check(/not found/i.test((await fail(bob, 'select public.remove_post_from_collection($1, $2) as r', [c1.id, p2])) || ''), 'only the owner can take posts out');
check((await call(ann, 'select public.rename_collection($1, $2) as r', [c1.id, '  Dinners  '])).collection.name === 'Dinners', 'a collection can be renamed (trimmed)');
check(/name/i.test((await fail(ann, 'select public.rename_collection($1, $2) as r', [c1.id, '  '])) || ''), 'an empty new name is refused');
check(/not found/i.test((await fail(bob, 'select public.rename_collection($1, $2) as r', [c1.id, 'Mine'])) || ''), 'only the owner can rename');
check(/not found/i.test((await fail(bob, 'select public.delete_collection($1) as r', [c1.id])) || ''), 'only the owner can delete');
check((await call(ann, 'select public.delete_collection($1) as r', [c1.id])).success === true && (await db.query('select 1 from public.collections where id = $1', [c1.id])).rows.length === 0, 'the owner can delete it');
check((await db.query('select 1 from public.posts where id = any($1)', [[p1, p2]])).rows.length === 2, 'deleting a collection never deletes the posts');
check((await db.query('select 1 from public.collection_posts where collection_id = $1', [c1.id])).rows.length === 0, 'and its list of posts goes with it');
for (let i = 0; i < 28; i++) await call(ann, 'select public.create_collection($1, $2) as r', ['c' + i, null]);
check(/up to 30/i.test((await fail(ann, 'select public.create_collection($1, $2) as r', ['one more', null])) || ''), 'at most 30 collections');
const big = (await call(bob, 'select public.create_collection($1, $2) as r', ['Big', null])).collection;
for (let i = 0; i < 100; i++) { const pid = await mkPost(bob); await db.query('insert into public.collection_posts (collection_id, post_id) values ($1, $2)', [big.id, pid]); }
check(/up to 100/i.test((await fail(bob, 'select public.add_post_to_collection($1, $2) as r', [big.id, p1])) || ''), 'at most 100 posts in one collection');
const anonTry = await asAnon(db, async () => { try { await db.query('select public.create_collection($1, $2)', ['x', null]); return 'ran'; } catch (e) { return e.message; } });
check(/permission denied/i.test(anonTry), 'a logged-out visitor can not make a collection');

section('2. The screen');
const vault = read('src/components/Profile/SavedVault.tsx'), pv = read('src/components/Profile/ProfileView.tsx'), api = read('src/services/supabaseApi.ts');
check(/<SavedVault /.test(pv) && !/prompt\('Enter new private collection name/.test(pv), 'the Saved tab uses the real vault, the made-up local "New collection" is gone');
check(/createCollection\(\{ name/.test(vault) && /addPostToCollection\(/.test(vault) && /removePostFromCollection\(/.test(vault) && /renameCollection\(/.test(vault) && /deleteCollection\(/.test(vault), 'make, add, take out, rename and delete all call the database');
check(/rpc<any>\('remove_post_from_collection'/.test(api) && /rpc<any>\('rename_collection'/.test(api) && /rpc<any>\('delete_collection'/.test(api), 'the three new database functions are wired');
check(/data-testid="vault-add"/.test(vault) && /data-testid="vault-collection"/.test(vault) && /data-testid="vault-back"/.test(vault), 'a + on each saved picture, collection cards that open, a Back button');
check(/The posts stay saved/.test(vault), 'deleting a collection says the posts stay');
section('3. The same batch: quick story reactions and the shared empty look');
const sv = read('src/components/Stories/StoryViewerModal.tsx');
check(/data-testid="story-quick-reactions"/.test(sv) && /sendStoryText\(emo\)/.test(sv) && /isCommentFocused && !commentText\.trim\(\)/.test(sv), 'stories: six emoji appear above the reply box and one tap sends it as the reply');
check(/es-ico/.test(read('src/components/Common/EmptyState.tsx')) && /color-mix\(in srgb, currentColor/.test(read('src/components/Common/emptyState.css')), 'one empty-state look that follows the text colour (dark and light)');
check(['src/components/Feed/CommentsSheet.tsx', 'src/components/Videos/VideoCommentsSheet.tsx', 'src/components/Reels/ReelsView.tsx', 'src/components/Profile/FollowListPage.tsx', 'src/components/Profile/SavedVault.tsx'].every((f) => /<EmptyState /.test(read(f))), 'comments (feed, videos, reels), follow lists and Saved all use it');
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
