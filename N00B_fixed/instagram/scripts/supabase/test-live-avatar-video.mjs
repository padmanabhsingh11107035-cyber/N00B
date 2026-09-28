// Tests for migration 20260928000002: a custom live profile picture is now a real video, and its poster
// (profiles.avatar) plus matching clip (profiles.live_avatar_video_url) travel wherever an author's avatar
// already shows up — post, reel, story, comment, and the profile itself.
import fs from 'node:fs';
import path from 'node:path';
import { loadBackup, buildImportPlan } from './transform.mjs';
import { runImport } from './run-import.mjs';
import { createTestDb, makePgAdapter, asUser } from './pg-test-env.mjs';

const backupsRoot = 'backups';
const dir = process.argv.slice(2).find((a) => !a.startsWith('--')) || path.join(backupsRoot, fs.readdirSync(backupsRoot).filter((d) => fs.existsSync(path.join(backupsRoot, d, 'users.json'))).sort().pop());
const raw = loadBackup(dir);

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };

const db = await createTestDb();
await runImport(buildImportPlan(raw, {}), makePgAdapter(db), { log: () => {} });
const profByLegacy = Object.fromEntries((await db.query('select * from profiles')).rows.map((p) => [p.legacy_id, p]));
const idOf = (u) => profByLegacy[u.id].id;
const pool = raw.users.filter((u) => u.accountType !== 'private' && !u.isAdmin);
const me = idOf(pool[0]);
const viewer = idOf(pool[1]);

const call = (uid, sql, params = []) => asUser(db, uid, async () => (await db.query(sql, params)).rows);
const rpc = async (uid, fn, ...args) => (await call(uid, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args))[0].r;

await db.query(`update profiles set pro_tier = 'starter' where id = $1`, [me]);
await rpc(me, 'apply_live_avatar', null, 'avatars/live-1.jpg', 'avatars/live-1.webm');

const author = await rpc(viewer, 'user_by_id', me);
check(!!author && author.avatar === 'avatars/live-1.jpg' && author.liveAvatarVideoUrl === 'avatars/live-1.webm', 'sanity: looking the author up directly already shows it');

const post = await rpc(me, 'create_post', [{ mediaUrl: 'posts/1.jpg', mediaType: 'image' }], 'hi', 'tech', [], null, null);
check(post.userAvatar === 'avatars/live-1.jpg' && post.authorIsLiveAvatar === true && post.authorLiveAvatarVideoUrl === 'avatars/live-1.webm', 'a post carries its author\'s poster AND matching video');

const reel = await rpc(me, 'create_reel', 'reels/1.mp4', 'reels/1.jpg', 'hi', null, [], 'tech');
check(reel.userAvatar === 'avatars/live-1.jpg' && reel.authorIsLiveAvatar === true && reel.authorLiveAvatarVideoUrl === 'avatars/live-1.webm', 'so does a reel');

const story = await rpc(me, 'create_story', 'stories/1.jpg', 'image');
check(story.userAvatar === 'avatars/live-1.jpg' && story.authorIsLiveAvatar === true && story.authorLiveAvatarVideoUrl === 'avatars/live-1.webm', 'and a story');

const commented = (await rpc(me, 'add_comment', post.id, 'nice')).comment;
check(commented.userAvatar === 'avatars/live-1.jpg' && commented.authorIsLiveAvatar === true && commented.authorLiveAvatarVideoUrl === 'avatars/live-1.webm', 'and a comment');

const myProfile = await rpc(me, 'get_my_user');
check(myProfile.avatar === 'avatars/live-1.jpg' && myProfile.isLiveAvatar === true && myProfile.liveAvatarVideoUrl === 'avatars/live-1.webm', 'and the profile itself');

const someoneElse = await rpc(viewer, 'get_my_user');
check(someoneElse.liveAvatarVideoUrl == null, 'an account with no live video simply has none — never someone else\'s');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
