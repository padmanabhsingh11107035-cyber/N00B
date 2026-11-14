// Tests migration 20261114000012 (capped lists, "Load more") on a real Postgres (PGlite), plus the screens that use it.
//   * below the cap, the four old functions answer exactly as before (recorded before the migration, compared after, and after running it a second time)
//   * above the cap: 500 rows, same order, the page functions walk the whole list without a gap or an overlap
//   * hidden comments are still shown only to their writer; access rights are what they were (page functions need a sign-in)
//   * the app: first page / Load more / fallback while the migration is not run / buttons on the three screens
// Usage: node --liftoff-only scripts/supabase/test-capped-lists.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createTestDb, asUser, asAnon, MIGRATIONS_DIR } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const MIG = '20261114000012_capped_lists.sql';
const migSql = fs.readFileSync(path.join(MIGRATIONS_DIR, MIG), 'utf8');
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

const db = await createTestDb({ upTo: '20261114000011_sealed_media_chat_index.sql' });
const mkUser = async (name) => {
  const id = (await db.query('select gen_random_uuid() as id')).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query('select 1 from public.profiles where id = $1', [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $3)`, [id, name, `${name} Display`]);
  return id;
};
const A = await mkUser('ann'), B = await mkUser('bob');
const post = (await db.query(`insert into public.posts (user_id, caption) values ($1, 'p') returning id`, [B])).rows[0].id;
const reel = (await db.query(`insert into public.reels (user_id, video_url, caption) values ($1, 'reels/x.mp4', 'r') returning id`, [B])).rows[0].id;
const T0 = Date.parse('2026-10-01T00:00:00Z');
const at = (i) => new Date(T0 + i * 1000).toISOString();
const addComments = async (col, target, n, from = 0) => {
  await db.query(`insert into public.comments (${col}, user_id, text, created_at) select $1, case when g % 2 = 0 then $2::uuid else $3::uuid end, 'c' || g, $4::timestamptz + g * interval '1 second' from generate_series($5::int, $5::int + $6::int - 1) g`, [target, A, B, at(0), from, n]);
};
await addComments('post_id', post, 12);
await addComments('reel_id', reel, 7);
await db.query(`update public.comments set hidden_reason = 'spam' where post_id = $1 and text in ('c3', 'c4')`, [post]);   // c4 is ann's, c3 is bob's
await db.query(`insert into public.music_tracks (uploader_id, title, audio_url, created_at) select $1, 't' || g, 'music/' || g || '.mp3', $2::timestamptz + g * interval '1 second' from generate_series(1, 9) g`, [B, at(0)]);
const chat1 = (await db.query(`insert into public.chats (name, is_group, creator_id) values ('g1', true, $1) returning id`, [A])).rows[0].id;
await db.query(`insert into public.chat_members (chat_id, user_id, is_pinned) values ($1, $2, true), ($1, $3, false)`, [chat1, A, B]);

const call = (uid, sql, args = []) => asUser(db, uid, async () => (await db.query(sql, args)).rows[0]?.r);
const snap = async () => ({
  postA: await call(A, `select public.post_comments($1) as r`, [post]), postB: await call(B, `select public.post_comments($1) as r`, [post]),
  reelA: await call(A, `select public.reel_comments($1) as r`, [reel]),
  music: await call(A, `select public.list_music_tracks() as r`),
  chatsA: await call(A, `select public.my_chats() as r`), chatsB: await call(B, `select public.my_chats() as r`)
});

section('1. below the cap the answer is identical');
const before = await snap();
check(before.postA.comments.length === 11 && before.postB.comments.length === 11, 'sanity: 12 comments, one hidden comment per writer (11 each)');
check(before.music.length === 9 && before.chatsA.length >= 2, 'sanity: 9 songs, chats exist');
await db.exec(migSql);
const after = await snap();
for (const k of Object.keys(before)) check(JSON.stringify(before[k]) === JSON.stringify(after[k]), `${k}: byte-identical after the migration`);
await db.exec(migSql);
const again = await snap();
check(JSON.stringify(after) === JSON.stringify(again), 'running the migration twice changes nothing');

section('2. the page functions');
const ids = (r) => r.comments.map((c) => c.id);
const p1 = await call(A, `select public.post_comments_page($1, 5, 0) as r`, [post]);
const p2 = await call(A, `select public.post_comments_page($1, 5, 5) as r`, [post]);
const p3 = await call(A, `select public.post_comments_page($1, 5, 10) as r`, [post]);
check(ids(p1).length === 5 && ids(p2).length === 5 && ids(p3).length === 1, 'pages of 5, 5 and 1 for 11 visible comments');
check(JSON.stringify([...ids(p1), ...ids(p2), ...ids(p3)]) === JSON.stringify(ids(after.postA)), 'the pages put together are the old list, in the same order, no gap and no overlap');
check(JSON.stringify(await call(A, `select public.post_comments_page($1) as r`, [post])) === JSON.stringify(after.postA), 'defaults (100, 0) give the whole short list');
const odd = await call(A, `select public.post_comments_page($1, 0, -4) as r`, [post]);
check(odd.comments.length === 1 && odd.comments[0].id === ids(after.postA)[0], 'a limit of 0 becomes 1 and a negative offset becomes 0');
check((await call(A, `select public.post_comments_page($1, 5, 500) as r`, [post])).comments.length === 0, 'past the end: an empty list, not an error');
const texts = (r) => r.comments.map((c) => c.text);
check(texts(after.postA).includes('c4') && !texts(after.postA).includes('c3'), 'a hidden comment is shown to its writer only (ann sees her c4, not bob\'s c3)');
check(texts(after.postB).includes('c3') && !texts(after.postB).includes('c4'), '... and bob sees his own c3, not ann\'s c4');
const r1 = await call(A, `select public.reel_comments_page($1, 3, 0) as r`, [reel]);
const r2 = await call(A, `select public.reel_comments_page($1, 3, 3) as r`, [reel]);
const r3 = await call(A, `select public.reel_comments_page($1, 3, 6) as r`, [reel]);
check(JSON.stringify([...ids(r1), ...ids(r2), ...ids(r3)]) === JSON.stringify(ids(after.reelA)) && ids(r3).length === 1, 'reel comments: pages of 3, 3, 1 equal the old list');
const m = (l, o) => call(A, `select public.list_music_tracks_page($1, $2) as r`, [l, o]);
const mAll = [...(await m(4, 0)), ...(await m(4, 4)), ...(await m(4, 8))].map((t) => t.id);
check(mAll.length === 9 && JSON.stringify(mAll) === JSON.stringify(after.music.map((t) => t.id)), 'music: pages of 4, 4, 1 equal the old list');

section('3. above the cap');
await addComments('post_id', post, 520, 100);
await addComments('reel_id', reel, 505, 100);
await db.query(`insert into public.music_tracks (uploader_id, title, audio_url, created_at) select $1, 'm' || g, 'music/m' || g || '.mp3', $2::timestamptz + (g + 100) * interval '1 second' from generate_series(1, 510) g`, [B, at(0)]);
const big = await call(A, `select public.post_comments($1) as r`, [post]);
check(big.comments.length === 500, 'post_comments stops at 500');
check(big.comments[0].text === 'c619', 'the newest comment is first');
const bigReel = await call(A, `select public.reel_comments($1) as r`, [reel]);
check(bigReel.comments.length === 500, 'reel_comments stops at 500');
check((await call(A, `select public.list_music_tracks() as r`)).length === 500, 'list_music_tracks stops at 500');
let walked = [];
for (let off = 0; off < 600; off += 100) walked = walked.concat(ids(await call(A, `select public.post_comments_page($1, 100, $2) as r`, [post, off])));
check(walked.length === 531 && new Set(walked).size === 531, 'walking the pages of 100 reaches all 531 visible comments exactly once', String(walked.length));
check(JSON.stringify(walked.slice(0, 500)) === JSON.stringify(ids(big)), 'and the first five pages are exactly the capped list');
check((await call(A, `select public.post_comments_page($1, 100000, 0) as r`, [post])).comments.length === 500, 'a huge limit is held at 500');
await db.query(`insert into public.chats (name, is_group, creator_id) select 'many' || g, true, $1 from generate_series(1, 520) g`, [A]);
await db.query(`insert into public.chat_members (chat_id, user_id) select id, $1 from public.chats where name like 'many%'`, [A]);
await db.query(`update public.chats set last_message_at = $1::timestamptz + (substr(name, 5)::int) * interval '1 second' where name like 'many%'`, [at(0)]);
const chats = await call(A, `select public.my_chats() as r`);
check(chats.length === 500, 'my_chats stops at 500');
check(chats.some((c) => c.id === chat1) && chats.some((c) => c.isGlobalDefault), 'the pinned chat and the Lounge are always inside');
check(chats.find((c) => !c.isGlobalDefault && c.id !== chat1)?.name === 'many520', 'the rest is newest first');

section('4. access rights');
const denied = (sql, args) => asAnon(db, async () => { try { await db.query(sql, args); return false; } catch { return true; } });
check((await denied('select public.post_comments_page($1)', [post])) && (await denied('select public.reel_comments_page($1)', [reel])) && (await denied('select public.list_music_tracks_page()', [])), 'a visitor who is not signed in can not call the page functions');
check((await db.query(`select has_function_privilege('authenticated', p.oid, 'execute') ok from pg_proc p where p.proname in ('post_comments','reel_comments','list_music_tracks','my_chats') and p.pronamespace = 'public'::regnamespace`)).rows.every((r) => r.ok), 'the four old functions are still callable by signed-in people');
check(Number((await db.query(`select count(*) n from pg_proc where proname in ('post_comments','reel_comments','list_music_tracks','my_chats') and pronamespace = 'public'::regnamespace`)).rows[0].n) === 4, 'still exactly one function of each old name (nothing dropped, no overloads)');

section('5. the app');
const api = read('src/services/supabaseApi.ts');
const sheet = read('src/components/Feed/CommentsSheet.tsx'), reels = read('src/components/Reels/ReelsView.tsx'), hub = read('src/components/Music/MusicHubView.tsx'), ctx = read('src/context/MusicPlayerContext.tsx');
check(/export const LIST_PAGE_SIZE = 100;/.test(api), 'a page is 100');
check(/'post_comments_page', \{ p_post: postId, p_limit: LIST_PAGE_SIZE, p_offset: offset \}/.test(api) && /'reel_comments_page'/.test(api) && /'list_music_tracks_page'/.test(api), 'the three page functions are called with a limit and an offset');
check((api.match(/if \(!isMissingRpc\(err\)\) throw err;/g) || []).length === 3, 'while the migration is not run, all three fall back to the old function (nothing breaks)');
check(/Could not load more comments/.test(sheet) && /Could not load more comments/.test(reels), 'a failed "Load more" says so and can be tried again');
check(/data-testid="comments-load-more"/.test(sheet) && /fetchCommentsPage\(post\.id, loadedCount\.current\)/.test(sheet), 'post comments: Load more button asks for the next page');
check(/data-testid="reel-comments-load-more"/.test(reels) && /fetchReelCommentsPage\(reelId, reelCommentsLoaded\.current\)/.test(reels), 'reel comments: Load more button asks for the next page');
check(/data-testid="music-load-more"/.test(hub) && /loadMoreTracks/.test(ctx), 'music: Load more songs button');
check(/have\.has\(c\.id\)/.test(sheet) && /have\.has\(c\.id\)/.test(reels) && /have\.has\(t\.id\)/.test(ctx), 'a comment or song that moves between pages is never shown twice');
check(/if \(page\.failed\) return;/.test(ctx), 'a refresh of the songs that fails keeps the songs on screen');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
