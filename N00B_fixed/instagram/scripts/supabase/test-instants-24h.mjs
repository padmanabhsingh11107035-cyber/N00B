// Tests migration 20261017000002: Instants (and Daily NOOB) are the ONLY media NOOB deletes by itself, and they go within 24 hours. An Instant is deleted for good when its 24 hours
// are over - the row, who it was sent to, their reactions, the "sent you an instant" notifications - and its picture is queued for the server a few minutes later. Everything else
// (posts, reels, stories, videos, chat pictures, profile pictures) is never touched by a clock: it stays until the person deletes it. Nothing is deleted "after 30 days".
// On a REAL Postgres (PGlite) with every migration applied.
//
// Usage: node scripts/supabase/test-instants-24h.mjs
import fs from 'node:fs';
import { createTestDb, asUser } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);

const db = await createTestDb();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const mkUser = async (name) => {
  const id = (await q(`select gen_random_uuid() as id`))[0].id;
  await q(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  if (!(await q(`select 1 from public.profiles where id = $1`, [id])).length) await q(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  return id;
};
const call = (uid, sql, params = []) => asUser(db, uid, async () => (await db.query(sql, params)).rows);
const rpc = async (uid, fn, ...args) => (await call(uid, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args))[0].r;
const trash = () => q(`select key, reason, extract(epoch from (delete_after - now())) as secs from public.media_trash order by key`);

const ann = await mkUser('ann');
const bob = await mkUser('bob');
const cat = await mkUser('cat');
await q(`insert into public.follows (follower_id, followee_id) values ($1, $2), ($2, $1), ($1, $3), ($3, $1) on conflict do nothing`, [ann, bob, cat]);

section('1. The rules are in place');
const sql = fs.readFileSync('supabase/migrations/20261017000002_instants_24h.sql', 'utf8');
const triggers = await q(`select tgname from pg_trigger where tgrelid = 'public.instants'::regclass and not tgisinternal`);
check(triggers.some((t) => t.tgname === 'trash_media_del_instants'), 'an Instant that is deleted queues its picture');
check(/trash_replaced_media\('10 minutes', 'media_url'\)/.test(sql), 'and the picture leaves the server ten minutes later, not a day later');
check(!/30 days|interval '3[0-9]/.test(sql.replace(/--[^\n]*/g, '')), 'nothing here deletes anything after 30 days');

section('2. A live Instant is left alone, an Instant past 24 hours is deleted');
const live = await rpc(ann, 'send_instant', 'instants/live-1.jpg', 'hello', 'friends');
const old = await rpc(ann, 'send_instant', 'instants/old-1.jpg', 'yesterday', 'friends');
check(live.success && old.success && live.recipients === 2, 'two Instants sent to two friends');
await q(`update public.instants set created_at = now() - interval '25 hours', expires_at = now() - interval '1 hour' where id = $1`, [old.id]);
await q(`update public.instant_recipients set reaction = 'heart', reacted_at = now() where instant_id = $1 and user_id = $2`, [old.id, bob]);
await q(`insert into public.notifications (target_user_id, actor_id, type, message, created_at) values ($1, $2, 'instant', 'marker-old', now() - interval '25 hours')`, [bob, ann]);
await q(`insert into public.notifications (target_user_id, actor_id, type, message) values ($1, $2, 'instant', 'marker-new')`, [cat, ann]);
let denied = false;
try { await call(ann, 'select public.purge_expired_instants()'); } catch (e) { denied = /permission denied/.test(e.message); }
check(denied, 'only the server runs it (a person asking is refused)');
const n = (await q(`select public.purge_expired_instants() as n`))[0].n;
check(n === 1, 'one Instant was deleted', `(deleted ${n})`);
check((await q(`select 1 from public.instants where id = $1`, [live.id])).length === 1, 'the live one is still there');
check((await q(`select 1 from public.instants where id = $1`, [old.id])).length === 0, 'the old one is gone');
check((await q(`select 1 from public.instant_recipients where instant_id = $1`, [old.id])).length === 0, 'with who it was sent to and their reactions');
check((await q(`select 1 from public.notifications where message = 'marker-old'`)).length === 0 && (await q(`select 1 from public.notifications where message = 'marker-new'`)).length === 1, 'old "sent you an instant" notifications go, new ones stay');
const t = await trash();
const queued = t.find((x) => x.key === 'instants/old-1.jpg');
check(queued && queued.secs > 0 && queued.secs <= 11 * 60, 'its picture is queued for the server within about ten minutes', JSON.stringify(t));
check(!t.some((x) => x.key === 'instants/live-1.jpg'), 'the live one is not queued');

section('3. "Your Instants" shows only the live ones');
const mine = await rpc(ann, 'my_instants_archive');
check(mine.length === 1 && mine[0].id === live.id, 'the old one is not listed any more');
await q(`update public.instants set expires_at = now() - interval '1 minute' where id = $1`, [live.id]);
check((await rpc(ann, 'my_instants_archive')).length === 0, 'and one past its time is not listed even before the cleanup runs');

section('4. The app\'s start-up nudge does it too');
await q(`update public.instants set expires_at = now() - interval '1 minute' where id = $1`, [live.id]);
await q(`delete from public.internal_config where key = 'media_purge_kicked_at'`);
await call(bob, 'select public.poke_media_cleanup()');
check((await q(`select 1 from public.instants`)).length === 0, 'opening the app deletes Instants that are over');

section('5. Everything else is left alone (no clock deletes it)');
await q(`insert into public.posts (user_id, caption, media_url, media_type, category, created_at) values ($1, 'old post', '/media/posts/old-post.jpg', 'image', 'General', now() - interval '400 days')`, [ann]).catch(async () => {
  await q(`insert into public.posts (user_id, caption, created_at) values ($1, 'old post', now() - interval '400 days')`, [ann]);
});
const reelCols = (await q(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'reels'`)).map((c) => c.column_name);
await q(`insert into public.reels (user_id, video_url, caption, created_at) values ($1, '/media/reels/old-reel.mp4', 'old reel', now() - interval '400 days')`, [ann]).catch(() => null);
await q(`insert into public.stories (user_id, media_url, media_type, created_at, expires_at) values ($1, '/media/stories/old-story.jpg', 'image', now() - interval '400 days', now() - interval '399 days')`, [ann]).catch(() => null);
await q(`update public.profiles set avatar = '/media/avatars/ann-old.jpg' where id = $1`, [ann]);
await q(`delete from public.internal_config where key = 'media_purge_kicked_at'`);
await call(bob, 'select public.poke_media_cleanup()');
await q(`select public.cleanup_expired_stories()`);
await q(`select public.settle_past_daily_challenges()`);
check((await q(`select 1 from public.posts where caption = 'old post'`)).length === 1, 'a post more than a year old is still there');
if (reelCols.includes('video_url')) check((await q(`select 1 from public.reels where caption = 'old reel'`)).length === 1, 'a reel more than a year old is still there');
check((await q(`select 1 from public.stories where media_url = '/media/stories/old-story.jpg'`)).length === 1, 'a story more than a year old is still there');
const after = await trash();
check(!after.some((x) => /old-post|old-reel|old-story|ann-old/.test(x.key)), 'none of their pictures is queued for deletion');

section('6. Daily NOOB: deleted when its day is over, files within minutes');
const dsql = fs.readFileSync('supabase/migrations/20261016000005_storage_cleanup_daily_admin.sql', 'utf8');
check(/\('daily_challenge_entries', array\['media_url'\],\s+'10 minutes', false\)/.test(dsql) && /delete from public\.daily_challenge_entries where challenge_date < current_date/.test(dsql), 'entries of a finished day are deleted, their pictures queued for ten minutes later');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
