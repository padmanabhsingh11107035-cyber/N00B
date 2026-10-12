// Tests migration 20261012000002: after a live profile picture is replaced by a normal photo, the "live" mark and its video are gone too
// (posts, comments and stories read them from the profile), on a REAL Postgres (PGlite) with every migration applied.
//
// Usage: node scripts/supabase/test-live-avatar-switch-back.mjs
import { createTestDb, asUser } from './pg-test-env.mjs';

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
const rpc = (uid, fn, ...args) => asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
const row = async (id) => (await db.query(`select avatar, is_live_avatar, live_avatar_video_url from public.profiles where id = $1`, [id])).rows[0];

const me = await mkUser('livey', { pro_tier: 'starter' });
const post = (await db.query(`insert into public.posts (user_id, caption) values ($1, 'hi') returning id`, [me])).rows[0].id;
await db.query(`insert into public.post_slides (post_id, position, media_url, media_type) values ($1, 0, 'posts/a.jpg', 'image')`, [post]);
const author = async () => { const posts = await rpc(me, 'post_by_id', post); return { live: posts.authorIsLiveAvatar, video: posts.authorLiveAvatarVideoUrl, avatar: posts.userAvatar }; };

section('1. A custom live picture');
await rpc(me, 'apply_live_avatar', null, 'avatars/live-1.jpg', 'avatars/live-1.webm');
let r = await row(me);
check(r.is_live_avatar === true && r.live_avatar_video_url === 'avatars/live-1.webm' && r.avatar === 'avatars/live-1.jpg', 'it is applied');
let a = await author();
check(a.live === true && a.video === 'avatars/live-1.webm', 'posts show the live picture');

section('2. Saving the same photo again (for example editing only the bio) leaves it alone');
await rpc(me, 'update_my_profile', { avatar: 'avatars/live-1.jpg', bio: 'new bio' });
r = await row(me);
check(r.is_live_avatar === true && r.live_avatar_video_url === 'avatars/live-1.webm', 'still live');
await rpc(me, 'update_my_profile', { bio: 'only the bio' });
check((await row(me)).is_live_avatar === true, 'a change that does not mention the photo leaves it alone too');

section('3. Choosing a normal photo');
await rpc(me, 'update_my_profile', { avatar: 'avatars/avatar-2.jpg' });
r = await row(me);
check(r.avatar === 'avatars/avatar-2.jpg' && r.is_live_avatar === false && r.live_avatar_video_url === null, 'the live mark and the video are removed with the old photo');
a = await author();
check(a.live === false && !a.video && a.avatar === 'avatars/avatar-2.jpg', 'posts now show the normal photo, not the live one');

section('4. A preset live picture, then a normal photo');
const preset = (await db.query(`select id from public.live_avatar_presets order by sort limit 1`)).rows[0].id;
await rpc(me, 'apply_live_avatar', preset);
check((await row(me)).is_live_avatar === true, 'preset applied');
await rpc(me, 'update_my_profile', { avatar: 'avatars/avatar-3.jpg' });
r = await row(me);
check(r.is_live_avatar === false && r.avatar === 'avatars/avatar-3.jpg', 'switching back clears a preset too');

section('5. Other people are not touched');
const other = await mkUser('other', { pro_tier: 'starter' });
await rpc(other, 'apply_live_avatar', null, 'avatars/live-9.jpg', 'avatars/live-9.webm');
await rpc(me, 'update_my_profile', { avatar: 'avatars/avatar-4.jpg' });
check((await row(other)).is_live_avatar === true, 'someone else\'s live picture stays');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
