// Tests migration 20261010000011: the profile "Feed" tab gets one person's video posts straight from the server
// (not just the latest 200 posts of everyone), on a REAL Postgres (PGlite) with every migration applied.
//
// Usage: node scripts/supabase/test-user-feed-videos.mjs
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);

const db = await createTestDb();
const mkUser = async (name, patch = {}) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  const has = (await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length;
  if (!has) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  for (const [col, val] of Object.entries(patch)) await db.query(`update public.profiles set ${col} = $2 where id = $1`, [id, val]);
  return id;
};
const rpc = async (uid, user, limit) => (await asUser(db, uid, async () => (await db.query(`select public.user_feed_videos($1, $2) as r`, [user, limit ?? 60])).rows))[0].r;
const post = async (owner, caption, kinds, minutesAgo = 0, archived = false) => {
  const id = (await db.query(`insert into public.posts (user_id, caption, is_archived, created_at) values ($1, $2, $3, now() - ($4 || ' minutes')::interval) returning id`, [owner, caption, archived, String(minutesAgo)])).rows[0].id;
  for (let i = 0; i < kinds.length; i++) await db.query(`insert into public.post_slides (post_id, position, media_url, media_type) values ($1, $2, $3, $4)`, [id, i, `posts/${id}-${i}`, kinds[i]]);
  return id;
};

const me = await mkUser('me');
const maker = await mkUser('maker');
const priv = await mkUser('priv', { account_type: 'private' });
const blocker = await mkUser('blocker');

const v1 = await post(maker, 'oldest video', ['video'], 300);
const v2 = await post(maker, 'carousel with a video', ['image', 'video'], 200);
const photo = await post(maker, 'just a photo', ['image'], 100);
const archivedVideo = await post(maker, 'archived video', ['video'], 50, true);
const v3 = await post(maker, 'newest video', ['video'], 10);
const pv = await post(priv, 'private video', ['video'], 5);
await post(blocker, 'blocked video', ['video'], 5);
await db.query(`insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [blocker, me]);

section('1. Only the video posts, newest first');
const list = await rpc(me, maker);
check(list.map((p) => p.caption).join('|') === 'newest video|carousel with a video|oldest video', 'video posts only (a carousel with a video counts), newest first', list.map((p) => p.caption).join('|'));
check(!list.some((p) => p.id === photo), 'a photo-only post is not in the Feed tab');
check(!list.some((p) => p.id === archivedVideo), 'an archived video is left out');
check(list.every((p) => Array.isArray(p.slides) && p.slides.some((s) => s.mediaType === 'video') && p.username === 'maker'), 'each item is a normal post with its slides');
check((await rpc(maker, maker)).length === 3, 'the owner sees their own three as well');

section('2. Limits and privacy');
check((await rpc(me, maker, 2)).length === 2, 'the limit is honoured');
check((await rpc(me, maker, 0)).length === 1, 'a silly limit is pulled back to at least one');
check((await rpc(me, priv)).length === 0, 'a private account\'s videos are not returned to someone who cannot see it');
await db.query(`insert into public.follows (follower_id, followee_id) values ($1, $2)`, [me, priv]);
check((await rpc(me, priv)).map((p) => p.id).join() === pv, '...but are, once they follow it');
check((await rpc(me, blocker)).length === 0, 'a person who blocked me returns nothing');
check((await rpc(me, me)).length === 0, 'someone with no videos returns an empty list');

section('3. Not for everyone');
let denied = false;
try { await asAnon(db, async () => db.query(`select public.user_feed_videos($1)`, [maker])); } catch (e) { denied = /permission denied/.test(e.message); }
check(denied, 'someone not signed in cannot call it');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
