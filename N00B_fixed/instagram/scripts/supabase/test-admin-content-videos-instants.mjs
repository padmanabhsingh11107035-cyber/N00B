// Tests migration 20261012000001: the admin panel's Content tab can list every long VIDEO and every INSTANT on the platform (only the
// main admin may), and a video listed there can be pinned with the existing pin function — on a REAL Postgres (PGlite), every migration applied.
//
// Usage: node scripts/supabase/test-admin-content-videos-instants.mjs
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};
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
const call = (uid, sql, params = []) => asUser(db, uid, async () => (await db.query(sql, params)).rows);
const rpc = async (uid, fn, ...args) => (await call(uid, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args))[0].r;

const admin = await mkUser('noob', { is_admin: true });
const ann = await mkUser('ann');
const priv = await mkUser('priv_ann', { account_type: 'private' });
const friend = await mkUser('friend');
const friend2 = await mkUser('friend2');

const v1 = (await db.query(`insert into public.long_videos (user_id, video_url, title, duration_seconds, created_at) values ($1, 'videos/a.mp4', 'First', 60, now() - interval '2 hours') returning id`, [ann])).rows[0].id;
const v2 = (await db.query(`insert into public.long_videos (user_id, video_url, title, duration_seconds) values ($1, 'videos/b.mp4', 'Secret one', 90) returning id`, [priv])).rows[0].id;

const i1 = (await db.query(`insert into public.instants (user_id, media_url, caption, audience) values ($1, 'instants/one.jpg', 'hi', 'friends') returning id`, [ann])).rows[0].id;
await db.query(`insert into public.instant_recipients (instant_id, user_id) values ($1, $2), ($1, $3)`, [i1, friend, friend2]);
const i2 = (await db.query(`insert into public.instants (user_id, media_url, caption, audience, created_at) values ($1, 'instants/two.jpg', '', 'close_friends', now() - interval '3 hours') returning id`, [priv])).rows[0].id;
await db.query(`insert into public.instant_recipients (instant_id, user_id) values ($1, $2)`, [i2, friend]);

section('1. Only the main admin');
await expectFail(() => rpc(ann, 'admin_content_videos'), /Access denied/, 'an ordinary member cannot list the videos');
await expectFail(() => rpc(ann, 'admin_content_instants'), /Access denied/, 'an ordinary member cannot list the instants');
await expectFail(() => rpc(friend, 'admin_content_instants', 10), /Access denied/, 'not even someone who received an instant');
let denied = false;
try { await asAnon(db, async () => db.query(`select public.admin_content_videos()`)); } catch (e) { denied = /permission denied/.test(e.message); }
check(denied, 'someone not signed in cannot call it');

section('2. Videos');
const vids = (await rpc(admin, 'admin_content_videos')).items;
check(vids.length === 2, 'the admin sees every video, even from a private account', String(vids.length));
check(vids[0].id === v2 && vids[1].id === v1, 'newest first');
check(vids[1].videoUrl === 'videos/a.mp4' && vids[1].title === 'First' && vids[1].username === 'ann' && vids[1].durationSeconds === 60, 'each carries its file, title, owner and length');
check((await rpc(admin, 'admin_content_videos', 1)).items.length === 1, 'the limit works');

section('3. A video from that list can be pinned');
check((await rpc(admin, 'admin_set_feed_pin', 'video', v1, true)).pinned === true, 'pin it');
check((await rpc(friend, 'pinned_feed_items')).some((p) => p.kind === 'video' && p.itemId === v1), 'everyone sees it pinned');
check((await rpc(admin, 'admin_set_feed_pin', 'video', v1, false)).pinned === false, 'unpin it');

section('4. Instants');
const inst = (await rpc(admin, 'admin_content_instants')).items;
check(inst.length === 2, 'the admin sees every instant', String(inst.length));
check(inst[0].id === i1 && inst[1].id === i2, 'newest first');
check(inst[0].mediaUrl === 'instants/one.jpg' && inst[0].username === 'ann' && inst[0].caption === 'hi' && inst[0].mediaType === 'image', 'each carries its photo, owner and caption');
check(inst[0].sentTo === 2 && inst[0].audience === 'friends' && inst[1].sentTo === 1 && inst[1].audience === 'close_friends', 'and who it went to (how many, which audience)');
await expectFail(() => rpc(admin, 'admin_set_feed_pin', 'instant', i1, true), /Unknown kind/, 'an instant can never be pinned to the Feed');
check((await rpc(admin, 'admin_content_instants', 1)).items.length === 1, 'the limit works');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
