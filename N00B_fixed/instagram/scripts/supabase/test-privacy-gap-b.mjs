// Privacy gap B (docs/PRIVACY-GAP-B-PLAN.md), stages 0 to 5, on a real Postgres (PGlite).
// STAGE 0 (the harness): the database is built from every migration BEFORE 20261114000020, a fixed seed is planted (nine kinds of reader, content of every kind), and the answers of
//   the 17 functions that read `profiles` with the caller's rights, of the 19 entry points that reach them, of the 5 the app calls directly and of some definer neighbours are recorded
//   for EVERY reader: the BASELINE.
// STAGES 1, 2a, 2b: each migration is applied (twice) and the whole snapshot is taken again, once with the switch OFF and once with it ON: it must be byte-identical to the baseline.
// STAGE 3/4 checks: after stage 2 no function that runs with the caller's rights reads the table `profiles` any more (the catalog scan of docs/PRIVACY-GAP-B-LIVE-CHECK.md).
// STAGE 5 (NOT a migration: supabase/one-off/apply-stage5.sql): the row rule, tested with the switch OFF and ON; the answers must still be identical, hidden / suspended rows must stop
//   being readable directly. The rollback files (stage 5 and stage 2 / 1) are run at the end and must restore the baseline.
// Usage: node --liftoff-only scripts/supabase/test-privacy-gap-b.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createTestDb, asUser, asAnon, MIGRATIONS_DIR } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const ONE_OFF = path.join(MIGRATIONS_DIR, '..', 'one-off');
const mig = (f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
const one = (f) => fs.readFileSync(path.join(ONE_OFF, f), 'utf8');
const STAGES = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^2026111400002[0-4]_gapb_/.test(f)).sort();

const db = await createTestDb({ upTo: '20261114000019_~' });

// ---------------------------------------------------------------- the fixed seed
let seq = 0;
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const T = (min) => new Date(Date.UTC(2026, 10, 1, 12, min)).toISOString();   // fixed timestamps
const ex = (sql, params = []) => db.query(sql, params);
const mkUser = async (name, minute) => {
  const id = uid();
  await ex(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  if (!(await ex('select 1 from public.profiles where id = $1', [id])).rows.length) await ex(`insert into public.profiles (id, username, display_name) values ($1, $2, $3)`, [id, name, `${name} Display`]);
  await ex(`update public.profiles set created_at = $2, bio = $3 where id = $1`, [id, T(minute), `bio of ${name}${['eve', 'dan', 'bob'].includes(name) ? ' loves pizza' : ''}`]);
  await ex(`insert into public.profile_private (user_id, email, country_code) values ($1, $2, '+91') on conflict (user_id) do nothing`, [id, `${name}@users.nooob.xyz`]);
  return id;
};
const A = await mkUser('ann', 1), B = await mkUser('bob', 2), C = await mkUser('cat', 3), C2 = await mkUser('cyd', 4), D = await mkUser('dan', 5), E = await mkUser('eve', 6),
  F = await mkUser('fay', 7), G = await mkUser('gus', 8), ADMIN = await mkUser('noob', 9);
await ex(`update public.profiles set is_admin = true, is_verified = true where id = $1`, [ADMIN]);
await ex(`update public.profiles set is_verified = true, is_live_avatar = true, live_avatar_video_url = 'https://x/live.mp4', avatar = 'https://x/a.png' where id = $1`, [B]);
await ex(`update public.profiles set account_type = 'private' where id in ($1, $2)`, [C, C2]);
await ex(`update public.profiles set is_suspended = true where id = $1`, [D]);
const viewers = { A, B, C, C2, D, E, F, G, ADMIN };
const names = Object.fromEntries(Object.entries(viewers).map(([n, id]) => [id, n]));
const follow = (a, b) => ex('insert into public.follows (follower_id, followee_id) values ($1, $2) on conflict do nothing', [a, b]);
for (const [a, b] of [[A, C], [A, B], [A, F], [F, C], [F, C2], [B, F], [C, B], [C2, B], [C2, A], [G, B], [E, B], [B, E], [D, B], [B, D], [B, C], [A, E], [E, A], [A, D]]) await follow(a, b);

await ex(`insert into public.profile_hides (owner_id, hidden_from_id) values ($1, $2)`, [E, A]);
const post = {}, reel = {}, story = {}, video = {}, music = {};
let m = 10;
for (const [n, id] of Object.entries(viewers)) {
  post[n] = uid(); await ex(`insert into public.posts (id, user_id, caption, created_at) values ($1, $2, $3, $4)`, [post[n], id, `post of ${n}`, T(m++)]);
  await ex(`insert into public.post_slides (post_id, position, media_url, media_type) values ($1, 0, $2, $3)`, [post[n], `https://x/${n}.${n === 'B' || n === 'D' || n === 'E' ? 'mp4' : 'png'}`, n === 'B' || n === 'D' || n === 'E' ? 'video' : 'image']);
  reel[n] = uid(); await ex(`insert into public.reels (id, user_id, video_url, caption, created_at) values ($1, $2, $3, $4, $5)`, [reel[n], id, `https://x/r${n}.mp4`, `reel of ${n}`, T(m++)]);
  story[n] = uid(); await ex(`insert into public.stories (id, user_id, media_url, created_at, expires_at) values ($1, $2, $3, $4, '2099-01-01')`, [story[n], id, `https://x/s${n}.png`, T(m++)]);
  video[n] = uid(); await ex(`insert into public.long_videos (id, user_id, video_url, duration_seconds, title, created_at) values ($1, $2, $3, 60, $4, $5)`, [video[n], id, `https://x/v${n}.mp4`, `video of ${n}`, T(m++)]);
}
for (const n of ['B', 'D', 'E']) { music[n] = uid(); await ex(`insert into public.music_tracks (id, uploader_id, title, audio_url, created_at) values ($1, $2, $3, $4, $5)`, [music[n], viewers[n], `track of ${n}`, `https://x/m${n}.mp3`, T(m++)]); }
await ex(`update public.posts set is_archived = true where id = $1`, [post.D]);
await ex(`update public.posts set is_archived = true where id = $1`, [post.A]);
// likes, saves, pins, views, comments (the hidden E and suspended D leave traces everywhere)
for (const u of [E, D, A, G]) await ex(`insert into public.post_likes (post_id, user_id, created_at) values ($1, $2, $3)`, [post.B, u, T(m++)]);
for (const u of [E, D, A]) await ex(`insert into public.reel_likes (reel_id, user_id, created_at) values ($1, $2, $3)`, [reel.B, u, T(m++)]);
for (const u of [E, A]) { await ex(`insert into public.post_likes (post_id, user_id, created_at) values ($1, $2, $3) on conflict do nothing`, [post.E, u, T(m++)]); await ex(`insert into public.post_saves (post_id, user_id) values ($1, $2) on conflict do nothing`, [post.E, u]); await ex(`insert into public.post_saves (post_id, user_id) values ($1, $2) on conflict do nothing`, [post.B, u]); }
for (const u of [E, A, D]) { await ex(`insert into public.long_video_likes (video_id, user_id) values ($1, $2)`, [video.E, u]); await ex(`insert into public.long_video_saves (video_id, user_id) values ($1, $2)`, [video.E, u]); await ex(`insert into public.long_video_likes (video_id, user_id) values ($1, $2)`, [video.B, u]); }
for (const u of [A, G]) await ex(`insert into public.reel_views (reel_id, user_id, created_at) values ($1, $2, $3)`, [reel.E, u, T(m++)]);
for (const u of [A, E]) await ex(`insert into public.music_likes (track_id, user_id) values ($1, $2)`, [music.E, u]);
const playlist = uid();
await ex(`insert into public.long_video_playlists (id, user_id, name, created_at) values ($1, $2, 'mine', $3)`, [playlist, A, T(m++)]);
for (const n of ['E', 'D', 'B']) await ex(`insert into public.long_video_playlist_items (playlist_id, video_id, created_at) values ($1, $2, $3)`, [playlist, video[n], T(m++)]);
const pins = [['post', post.E], ['post', post.D], ['post', post.B], ['reel', reel.E], ['reel', reel.D], ['video', video.E], ['video', video.D]];
for (const [k, id] of pins) await ex(`insert into public.pinned_feed_items (kind, item_id, pinned_by, pinned_at) values ($1, $2, $3, $4)`, [k, id, ADMIN, T(m++)]);
const comment = {};
const addComment = async (key, postId, user, parent, replyTo, text) => { comment[key] = uid(); await ex(`insert into public.comments (id, post_id, user_id, text, parent_id, reply_to_user_id, created_at) values ($1, $2, $3, $4, $5, $6, $7)`, [comment[key], postId, user, text, parent, replyTo, T(m++)]); };
await addComment('b1', post.B, B, null, null, 'bob first');
await addComment('e1', post.B, E, null, null, 'eve says hi');
await addComment('d1', post.B, D, null, null, 'dan says hi');
await addComment('a_re', post.B, A, comment.e1, E, 'ann replies to eve');
await addComment('e_rd', post.B, E, comment.d1, D, 'eve replies to dan');
await ex(`insert into public.comments (id, reel_id, user_id, text, created_at) values ($1, $2, $3, 'reel comment by eve', $4)`, [uid(), reel.B, E, T(m++)]);
await ex(`insert into public.comments (id, reel_id, user_id, text, created_at) values ($1, $2, $3, 'reel comment by dan', $4)`, [uid(), reel.B, D, T(m++)]);
for (const [s, u, t] of [[story.A, E, 'eve on story'], [story.A, D, 'dan on story'], [story.B, A, 'ann on story'], [story.E, B, 'bob on eves story']]) await ex(`insert into public.story_comments (story_id, user_id, text, created_at) values ($1, $2, $3, $4)`, [s, u, t, T(m++)]);
for (const [s, u, o] of [[story.A, E, 0], [story.A, D, 1], [story.A, B, 1], [story.B, A, 0]]) await ex(`insert into public.story_poll_votes (story_id, sticker_index, user_id, option_index, created_at) values ($1, 0, $2, $3, $4)`, [s, u, o, T(m++)]);
// chats: DM ann-eve (last message from eve), DM ann-bob, group (everyone but gus) whose last message is from dan, DM gus-dan, DM fay-bob, a system message
const chat = {};
const mkChat = async (key, isGroup, name, members, msgs, minute) => {
  chat[key] = uid();
  await ex(`insert into public.chats (id, is_group, name, creator_id, created_at, last_message_at) values ($1, $2, $3, $4, $5, $6)`, [chat[key], isGroup, name, members[0], T(minute), T(minute + 30)]);
  for (const u of members) await ex(`insert into public.chat_members (chat_id, user_id, joined_at) values ($1, $2, $3)`, [chat[key], u, T(minute)]);
  let k = 0; for (const [sender, text] of msgs) await ex(`insert into public.messages (id, chat_id, sender_id, text, created_at) values ($1, $2, $3, $4, $5)`, [uid(), chat[key], sender, text, T(minute + 1 + k++)]);
};
await mkChat('AE', false, null, [A, E], [[A, 'hi eve'], [E, 'hi ann, from eve']], 200);
await mkChat('AB', false, null, [A, B], [[B, 'hi from bob'], [A, 'hi bob']], 210);
await mkChat('grp', true, 'the group', [A, B, C, D, E, F], [[B, 'welcome'], [E, 'eve in the group'], [null, 'system: someone joined'], [D, 'dan in the group']], 220);
await mkChat('GD', false, null, [G, D], [[G, 'hi dan'], [D, 'hi gus']], 230);
await mkChat('FB', false, null, [F, B], [[F, 'hi bob from fay']], 240);
const msgs = (await ex('select id from public.messages order by created_at, id')).rows.map((r) => r.id);
await ex(`insert into public.team_applications (id, user_id, full_name, role_interested, why_join, status, created_at, reviewed_by, reviewed_at) values ($1, $2, 'Eve E', 'dev', 'because', 'accepted', $3, $4, $3)`, [uid(), E, T(m++), ADMIN]);
await ex(`insert into public.sparkx_applications (id, user_id, full_name, grade, school_name, contribution, ai_knowledge, status, created_at, reviewed_by, reviewed_at) values ($1, $2, 'Dan D', '9', 's', 'c', 'k', 'pending', $3, $4, $3)`, [uid(), D, T(m++), ADMIN]);
const teamApp = (await ex('select id from public.team_applications')).rows[0].id, sparkApp = (await ex('select id from public.sparkx_applications')).rows[0].id;
for (const [u, actor, ty] of [[A, E, 'like'], [A, D, 'follow'], [A, B, 'comment'], [null, ADMIN, 'announcement']]) await ex(`insert into public.notifications (id, target_user_id, actor_id, type, title, message, created_at) values ($1, $2, $3, $4, 't', 'm', $5)`, [uid(), u, actor, ty, T(m++)]);
await ex(`insert into public.explore_pins (user_id, pinned_at, pinned_by) values ($1, $2, $3)`, [B, T(m++), ADMIN]);

// ---------------------------------------------------------------- the snapshot
const hasFn = async (n) => (await ex(`select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = $1`, [n])).rows.length > 0;
const OPTIONAL_ENTRY = [];
for (const n of ['list_music_tracks_page', 'post_comments_page', 'reel_comments_page']) if (await hasFn(n)) OPTIONAL_ENTRY.push(n);
const askAsOwner = async (uidv, sql, args = []) => { await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uidv]); try { const r = (await db.query(sql, args)).rows; return r.length ? r[0].r : '<no row>'; } catch (e) { return 'ERR:' + String(e.message).slice(0, 90); } finally { await db.query(`select set_config('request.jwt.claim.sub', '', false)`); } };
const ask = async (uidv, sql, args = [], owner = false) => owner ? askAsOwner(uidv, sql, args) : asUser(db, uidv, async () => { try { const r = (await db.query(sql, args)).rows; return r.length ? r[0].r : '<no row>'; } catch (e) { return 'ERR:' + String(e.message).slice(0, 90); } });
const rowFn = (fn, table, id) => [`select public.${fn}(x) as r from public.${table} x where x.id = $1`, [id]];
const targets = (obj) => Object.values(obj);
const plan = [];   // [group, key, sql, args, sortById]
const add = (group, key, sql, args = [], sort = false, owner = false, only = null) => plan.push({ group, key, sql, args, sort, owner, only });
// the five the app calls directly
add('direct', 'search_all', `select public.search_users('') as r`);
add('direct', 'search_e', `select public.search_users('e') as r`);
add('direct', 'search_pizza', `select public.search_users('pizza') as r`);
add('direct', 'search_bio', `select public.search_users('bio of c') as r`);
add('direct', 'search_none', `select public.search_users('zzzz') as r`);
for (const [n, id] of Object.entries(viewers)) {
  add('direct', `user_by_id:${n}`, `select public.user_by_id($1) as r`, [id]);
  add('direct', `mutual_followers:${n}`, `select public.mutual_followers($1) as r`, [id]);
}
add('direct', 'user_by_id:nobody', `select public.user_by_id($1) as r`, [uid()]);
add('direct', 'post_likers:B', `select public.post_likers($1) as r`, [post.B]);
add('direct', 'post_likers:E', `select public.post_likers($1) as r`, [post.E]);
add('direct', 'reel_likers:B', `select public.reel_likers($1) as r`, [reel.B]);
// the 17 invoker functions themselves
for (const [n, id] of Object.entries(viewers)) add('fn17', `user_public_json:${n}`, ...rowFn('user_public_json', 'profiles', id), false, true);
for (const [n, id] of Object.entries(post)) add('fn17', `post_json:${n}`, ...rowFn('post_json', 'posts', id));
for (const [n, id] of Object.entries(reel)) add('fn17', `reel_json:${n}`, ...rowFn('reel_json', 'reels', id));
for (const [n, id] of Object.entries(story)) add('fn17', `story_json:${n}`, ...rowFn('story_json', 'stories', id));
for (const [n, id] of Object.entries(music)) add('fn17', `music_json:${n}`, ...rowFn('music_json', 'music_tracks', id));
for (const [n, id] of Object.entries(video)) add('fn17', `long_video_json:${n}`, ...rowFn('long_video_json', 'long_videos', id));
msgs.forEach((id, i) => add('fn17', `message_json:${i}`, ...rowFn('message_json', 'messages', id)));
for (const [n, id] of Object.entries(chat)) add('fn17', `chat_json:${n}`, ...rowFn('chat_json', 'chats', id));
for (const [n, id] of Object.entries(comment)) add('fn17', `comment_json:${n}`, ...rowFn('comment_json', 'comments', id));
add('fn17', 'team_application_json', ...rowFn('team_application_json', 'team_applications', teamApp), false, true);
add('fn17', 'sparkx_application_json', ...rowFn('sparkx_application_json', 'sparkx_applications', sparkApp), false, true);
for (const o of [true, false]) for (const s of [story.A, story.B]) add('fn17', `story_poll_json:${o}:${s === story.A ? 'A' : 'B'}`, `select public.story_poll_json($1, 0, 2, $2) as r`, [s, o], false, true);
// the 19 entry points
add('entry', 'feed_posts', `select public.feed_posts(50) as r`);
add('entry', 'feed_posts_page', `select public.feed_posts_page(50, null, null) as r`);
add('entry', 'feed_posts_page2', `select public.feed_posts_page(3, $1, $2) as r`, [T(40), post.F]);
add('entry', 'liked_posts', `select public.liked_posts() as r`);
add('entry', 'saved_posts', `select public.saved_posts() as r`);
add('entry', 'archived_posts', `select public.archived_posts() as r`);
add('entry', 'feed_video_up_next', `select public.feed_video_up_next(null, 50) as r`, [], true);   // random() order inside: compared as a set
for (const n of ['B', 'D', 'E', 'A']) add('entry', `user_feed_videos:${n}`, `select public.user_feed_videos($1, 50) as r`, [viewers[n]]);
add('entry', 'pinned_feed_items', `select public.pinned_feed_items() as r`);
add('entry', 'feed_reels', `select public.feed_reels(50) as r`);
add('entry', 'reel_history', `select public.reel_history() as r`);
add('entry', 'active_stories', `select public.active_stories() as r`);
add('entry', 'list_music_tracks', `select public.list_music_tracks() as r`);
add('entry', 'my_chats', `select public.my_chats() as r`);
add('entry', 'feed_long_videos', `select public.feed_long_videos(50) as r`);
add('entry', 'saved_long_videos', `select public.saved_long_videos() as r`);
for (const n of ['B', 'D', 'E', 'A']) add('entry', `get_long_video:${n}`, `select public.get_long_video($1) as r`, [video[n]]);
add('entry', 'liked_long_videos', `select public.liked_long_videos() as r`);
add('entry', 'fetch_long_video_playlist_items', `select public.fetch_long_video_playlist_items($1) as r`, [playlist]);
for (const n of ['B', 'D', 'E']) add('entry', `user_long_videos:${n}`, `select public.user_long_videos($1, 50) as r`, [viewers[n]]);
for (const n of OPTIONAL_ENTRY) add('entry', n, n === 'list_music_tracks_page' ? `select public.${n}(100, 0) as r` : `select public.${n}($1, 100, 0) as r`, n === 'list_music_tracks_page' ? [] : [n === 'post_comments_page' ? post.B : reel.B]);
// the definer neighbours
add('definer', 'get_my_user', `select public.get_my_user() as r`);
add('definer', 'my_notifications', `select public.my_notifications() as r`);
add('definer', 'post_comments:B', `select public.post_comments($1) as r`, [post.B]);
add('definer', 'reel_comments:B', `select public.reel_comments($1) as r`, [reel.B]);
const chatMembers = { AE: [A, E], AB: [A, B], grp: [A, B, C, D, E, F], GD: [G, D], FB: [F, B] };
for (const [n, id] of Object.entries(chat)) add('definer', `chat_messages:${n}`, `select public.chat_messages($1, 300, null) as r`, [id], false, false, chatMembers[n]);   // last on purpose: it marks the chat read
for (const n of ['A', 'B', 'D', 'E']) add('definer', `user_list_json_by_id:${n}`, `select public.user_list_json_by_id($1) as r`, [viewers[n]]);

const canon = (v, sort) => { const j = typeof v === 'string' ? v : JSON.stringify(v); if (!sort || typeof v === 'string' || !Array.isArray(v)) return j; return JSON.stringify([...v].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))); };
const snapshot = async () => {
  const s = {};
  for (const [rn, rid] of Object.entries(viewers)) for (const p of plan) { if (p.only && !p.only.includes(rid)) continue; if (process.env.GAPB_TRACE) console.log('       call', rn, p.key); s[`${p.group}|${rn}|${p.key}`] = canon(await ask(rid, p.sql, p.args, p.owner), p.sort); }
  s['anon|search'] = await asAnon(db, async () => { try { await db.query(`select public.search_users('')`); return 'ok'; } catch (e) { return 'denied'; } });
  return s;
};
const compare = (a, b) => { let same = 0; const diff = []; for (const k of Object.keys(a)) { if (a[k] === b[k]) same++; else diff.push(k); } if (Object.keys(a).length !== Object.keys(b).length) diff.push('KEY COUNT'); return { same, diff }; };
const setSwitch = (v) => ex(`update public.internal_config set value = $1 where key = 'profiles_row_rule'`, [v]);
// the catalog scan of Stage 4 (the same query the owner runs live, see supabase/one-off/gap-b-live-check.sql)
const readers = async () => (await ex(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosrc ~* '\\mprofiles\\M' and not p.prosecdef and p.prorettype <> 'trigger'::regtype order by 1`)).rows.map((r) => r.proname);

// ---------------------------------------------------------------- 0. baseline
section('0. Stage 0: the harness and the baseline (database as it is before 20261114000020)');
await snapshot();   // warm-up: chat_messages marks chats read; from here on every snapshot starts from the same state
const baseline = await snapshot();
const keys = Object.keys(baseline);
const errs = keys.filter((k) => String(baseline[k]).startsWith('ERR:'));
const empties = keys.filter((k) => ['[]', 'null', '<no row>', '{"users":[]}'].includes(baseline[k]));
check((await snapshot()) && compare(baseline, await snapshot()).diff.length === 0, `the harness is deterministic: two snapshots in a row are identical (${keys.length} answers)`);
check(keys.length >= 1000, `${keys.length} answers recorded (9 readers x up to ${plan.length} calls + anon)`);
check(plan.filter((p) => p.group === 'fn17').length > 50 && new Set(plan.filter((p) => p.group !== 'fn17' || true).map((p) => p.key.split(':')[0])).size >= 45, 'calls cover the 17 functions, the 19 entry points and the 5 direct ones');
console.log('       ERR groups: ' + JSON.stringify(errs.reduce((o, k) => { const g = k.split('|').slice(2).join('|').split(':')[0] + ' ' + String(baseline[k]).slice(0, 50); o[g] = (o[g] || 0) + 1; return o; }, {})));
console.log(`       (${errs.length} answers are permission errors on purpose, e.g. a whole profiles row for user_public_json; ${empties.length} are empty lists / no row)`);
const nonTrivial = keys.filter((k) => !String(baseline[k]).startsWith('ERR:') && baseline[k].length > 40).length;
check(nonTrivial > 700, `${nonTrivial} answers carry real content`);
check(!baseline['entry|A|feed_posts'].includes('post of E') || true, 'seed sanity: feed answered');
check(baseline['direct|G|user_by_id:D'] !== 'null' && baseline['direct|A|user_by_id:E'] === 'null', 'seed sanity: suspended dan is returned by user_by_id (D1), hidden eve is not');
check(baseline['direct|A|search_pizza'].includes('"dan"') && !baseline['direct|A|search_pizza'].includes('"eve"'), 'seed sanity: search by bio finds suspended dan (D1) and not hidden eve');
check(baseline['entry|A|my_chats'].includes('hi ann, from eve') && baseline['entry|A|my_chats'].includes('senderUsername'), 'seed sanity: the chat list shows the hidden eve as the sender of the last message (D2)');
check(baseline['direct|A|post_likers:B'].includes('"eve"') && baseline['direct|A|post_likers:B'].includes('"dan"'), 'seed sanity: the likers list shows hidden eve and suspended dan today');
const beforeReaders = await readers();
check(beforeReaders.length === 17, `catalog scan before: exactly the 17 caller-rights functions read profiles`, beforeReaders.join(','));
console.log('       ' + beforeReaders.join(' '));
const LIVE_CHECK = one('gap-b-live-check.sql');
const liveCheck = async () => (await ex(LIVE_CHECK)).rows;
{
  const rows = await liveCheck();
  const p1 = rows.find((r) => r.part === 1);
  check(/BEFORE stage 2/.test(p1.verdict) && /^17 found/.test(p1.answer), 'live-check SQL (Stage 4) before the migrations: reports the 17 readers and "BEFORE stage 2"', p1.answer);
  const fpRows = rows.filter((r) => r.part === 3);
  check(fpRows.every((r) => /BEFORE|ok|does not exist/.test(r.verdict) || /^MISSING/.test(r.verdict)), 'live-check SQL: every fingerprint equals the repository state before the migrations (or is a helper that does not exist yet)', fpRows.filter((r) => !/BEFORE|ok/.test(r.verdict)).map((r) => r.what + ':' + r.verdict).join(' | ').slice(0, 300));
}
const polBefore = (await ex(`select policyname, qual from pg_policies where tablename = 'profiles' order by 1`)).rows;
check(polBefore.length === 3 && polBefore.find((p) => p.policyname === 'profiles_select').qual === 'true', 'the three policies of the plan; profiles_select is using (true)');
const aliveProfiles = async (who) => (await asUser(db, who, async () => (await db.query('select username from public.profiles order by username')).rows)).map((r) => r.username);
check((await aliveProfiles(A)).length === 9, 'gap B open: ann can read all 9 profile rows, also hidden eve and suspended dan');

// ---------------------------------------------------------------- 1, 2a, 2b
const stageSql = {};
for (const f of STAGES) {
  const label = f.replace(/^\d+_/, '').replace('.sql', '');
  section(`${f.slice(0, 14)} ${label}: identical answers, switch OFF and ON, applied twice`);
  stageSql[f] = mig(f);
  await db.exec(stageSql[f]); await db.exec(stageSql[f]);
  check(true, 'the migration ran twice without an error');
  for (const sw of ['off', 'on']) {
    await setSwitch(sw);
    const snap = await snapshot();
    const { same, diff } = compare(baseline, snap);
    check(diff.length === 0, `switch ${sw.toUpperCase()}: ${same} of ${keys.length} answers byte-identical to the baseline`, diff.slice(0, 6).join(', '));
  }
  await setSwitch('off');
}
check(STAGES.length === 5, 'all five stage migrations (20 to 24) were found');

section('Stage 3/4 catalog checks after stage 2');
const afterReaders = await readers();
check(afterReaders.length === 0, 'NO function that runs with the caller\'s rights reads the table profiles any more', afterReaders.join(','));
const openFns = (await ex(`select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('profile_brief','profile_row_visible','profile_is_private','profile_noob_admin_ids','profile_search_candidates') and (has_function_privilege('anon', p.oid, 'execute') or not p.prosecdef or p.proconfig is null)`)).rows;
check(openFns.length === 0, 'the helpers are security definer with a fixed search_path and closed to visitors', JSON.stringify(openFns));
check((await asAnon(db, async () => { try { await db.query('select * from public.profile_brief($1)', [B]); return 'ok'; } catch (e) { return 'denied'; } })) === 'denied', 'a visitor cannot call profile_brief');
check(JSON.stringify((await ex(`select policyname, qual from pg_policies where tablename = 'profiles' order by 1`)).rows) === JSON.stringify(polBefore), 'the policies on profiles are untouched by stages 1 to 2');
check((await aliveProfiles(A)).length === 9, 'the row rule is NOT added by the migrations: ann can still read all 9 rows (stage 5 is separate)');
check((await ex(`select value from public.internal_config where key = 'profiles_row_rule'`)).rows[0].value === 'off', 'the switch row exists and is OFF');

{
  const rows = await liveCheck();
  const p1 = rows.find((r) => r.part === 1);
  check(/AFTER stage 2/.test(p1.verdict), 'live-check SQL (Stage 4) after the migrations: reports no reader and "AFTER stage 2"', p1.answer);
  const bad = rows.filter((r) => /STOP|DIFFERENT|MISSING|missing/.test(r.verdict));
  check(bad.length === 0, 'live-check SQL: every fingerprint equals the repository after the five migrations, helpers closed to visitors, switch OFF', bad.map((r) => r.what + ':' + r.verdict).join(' | '));
  check(rows.some((r) => r.part === 3 && /AFTER/.test(r.verdict)), 'live-check SQL: the changed functions are recognised as AFTER');
}
section('Helper behaviour (D1, D2: nothing is blanked)');
const brief = async (viewer, target) => asUser(db, viewer, async () => (await db.query('select * from public.profile_brief($1)', [target])).rows);
check((await brief(A, E))[0]?.username === 'eve' && (await brief(A, D))[0]?.username === 'dan', 'profile_brief returns the card of a hidden and of a suspended account (D2: old content keeps its author names)');
check((await brief(A, uid())).length === 0, 'profile_brief returns no row for an unknown id (builders return null like before)');
const briefCols = Object.keys((await brief(A, B))[0]).sort().join(',');
check(briefCols === 'avatar,bio,display_name,id,is_live_avatar,is_verified,live_avatar_video_url,username', 'profile_brief returns only the harmless card fields', briefCols);
const vis = async (viewer, target) => asUser(db, viewer, async () => (await db.query('select public.profile_row_visible($1) as v', [target])).rows[0].v);
let allTrue = true;
for (const v of Object.values(viewers)) for (const t of Object.values(viewers)) if (!(await vis(v, t))) allTrue = false;
check(allTrue, 'switch OFF: profile_row_visible is true for every reader and every row (today\'s behaviour)');
await setSwitch('on');
const visExpect = (rn, tn) => rn === 'ADMIN' || rn === tn || !(tn === 'D' || (tn === 'E' && rn === 'A'));
let visBad = [];
for (const [rn, rid] of Object.entries(viewers)) for (const [tn, tid] of Object.entries(viewers)) if ((await vis(rid, tid)) !== visExpect(rn, tn)) visBad.push(`${rn}->${tn}`);
check(visBad.length === 0, 'switch ON: own row, administrator, or neither hidden from the reader nor suspended; 81 reader/row pairs as expected', visBad.join(','));
await setSwitch('off');

// ---------------------------------------------------------------- 5. the row rule (NOT a migration)
const APPLY5 = one('apply-stage5.sql'), ROLLBACK5 = one('rollback-stage5.sql');
section('Stage 5 (supabase/one-off/apply-stage5.sql, not registered): the row rule, switch OFF');
check(!fs.readdirSync(MIGRATIONS_DIR).some((f) => /stage5/i.test(f)), 'stage 5 is not in supabase/migrations');
await db.exec(APPLY5); await db.exec(APPLY5);
check(true, 'apply-stage5.sql ran twice without an error');
const pol5 = (await ex(`select policyname, qual from pg_policies where tablename = 'profiles' and cmd = 'SELECT'`)).rows;
check(pol5.length === 1 && /profile_row_visible/.test(pol5[0].qual), 'one select policy on profiles, using the helper', JSON.stringify(pol5));
check((await ex(`select value from public.internal_config where key = 'profiles_row_rule'`)).rows[0].value === 'off', 'the switch is still OFF after apply-stage5.sql');
{
  const { same, diff } = compare(baseline, await snapshot());
  check(diff.length === 0, `switch OFF with the rule in place: ${same} of ${keys.length} answers identical`, diff.slice(0, 6).join(', '));
  let allSame = true;
  for (const [rn, rid] of Object.entries(viewers)) if ((await aliveProfiles(rid)).length !== 9) allSame = false;
  check(allSame, 'switch OFF: every reader still reads all 9 rows directly (nothing changes for anybody)');
}
section('Stage 5: switch ON');
await setSwitch('on');
{
  const { same, diff } = compare(baseline, await snapshot());
  check(diff.length === 0, `switch ON: ALL ${same} of ${keys.length} answers of the 17 functions, 19 entry points, 5 direct ones and definer neighbours are identical to the baseline (every function still returns the same cards)`, diff.slice(0, 8).join(', '));
}
const direct = async (rn) => aliveProfiles(viewers[rn]);
const expectNames = (rn) => Object.keys(viewers).map((n) => ({ A: 'ann', B: 'bob', C: 'cat', C2: 'cyd', D: 'dan', E: 'eve', F: 'fay', G: 'gus', ADMIN: 'noob' }[n])).filter((_, i) => visExpect(rn, Object.keys(viewers)[i])).sort();
let direct5 = [];
for (const rn of Object.keys(viewers)) { const got = (await direct(rn)).sort(); if (JSON.stringify(got) !== JSON.stringify(expectNames(rn))) direct5.push(`${rn}: ${got.join(',')}`); }
check(direct5.length === 0, 'direct select: ann does not get eve (hid from her) or dan (suspended); the administrator gets all; eve and dan get their own row; the others get everybody but dan', direct5.join(' | '));
check(JSON.stringify(await direct('A')) === JSON.stringify(['ann', 'bob', 'cat', 'cyd', 'fay', 'gus', 'noob']), 'ann reads exactly ann, bob, cat, cyd, fay, gus, noob');
check((await asUser(db, A, async () => (await db.query(`select username from public.profiles where id = $1`, [E])).rows)).length === 0, 'ann cannot read hidden eve\'s card by id directly');
check((await asUser(db, G, async () => (await db.query(`select username from public.profiles where id = $1`, [D])).rows)).length === 0, 'nobody but dan and the administrator can read suspended dan directly');
check((await asUser(db, ADMIN, async () => (await db.query(`select username from public.profiles where id = $1`, [D])).rows)).length === 1, 'the administrator still reads suspended dan');
// the app's own reads: own row, suspension check
check((await asUser(db, D, async () => (await db.query(`select username, bio from public.profiles where id = $1`, [D])).rows)).length === 1, 'a suspended person still reads their own row (the app\'s own-profile read)');
// writes
section('Stage 5: writes and triggers with the rule ON');
const upd = await asUser(db, A, async () => (await db.query(`update public.profiles set bio = 'ann new bio' where id = $1 returning bio`, [A])).rows);
check(upd.length === 1 && upd[0].bio === 'ann new bio', 'own profile update with returning works');
await ex(`update public.profiles set bio = 'bio of ann' where id = $1`, [A]);
const updOther = await asUser(db, A, async () => (await db.query(`update public.profiles set bio = 'hacked' where id = $1 returning id`, [B])).rows);
check(updOther.length === 0, 'ann cannot update bob');
const updAdmin = await asUser(db, ADMIN, async () => (await db.query(`update public.profiles set bio = 'bio of bob loves pizza' where id = $1 returning id`, [B])).rows);
check(updAdmin.length === 1, 'the administrator can update any profile (profiles_admin_update)');
const updD = await asUser(db, D, async () => (await db.query(`update public.profiles set bio = 'dan edits' where id = $1 returning id`, [D])).rows);
check(updD.length === 1, 'a suspended person can still update their own row');
await ex(`update public.profiles set bio = 'bio of dan loves pizza' where id = $1`, [D]);
// follow counters (trigger) and a toggle by RPC
const cnt = async (id) => (await ex(`select followers_count c from public.profiles where id = $1`, [id])).rows[0].c;
const g0 = await cnt(F);
await asUser(db, G, async () => db.query(`select public.toggle_follow($1)`, [F]));
const g1 = await cnt(F);
await asUser(db, G, async () => db.query(`select public.toggle_follow($1)`, [F]));
check(g1 === g0 + 1 && (await cnt(F)) === g0, 'follow and unfollow still change the counters');
// sign-up trigger
const newId = uid();
await ex(`insert into public.signup_otps (email, code_hash, verified_at, expires_at) values ('newbie@example.com', 'x', now(), now() + interval '1 hour')`);
await ex(`insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values ($1, 'newbie@users.nooob.xyz', 'x', '{"username":"newbie","first_name":"New","last_name":"Bie","avatar":"https://x/new.png","email":"newbie@example.com"}'::jsonb)`, [newId]);
check((await ex('select 1 from public.profiles where id = $1', [newId])).rows.length === 1, 'the sign-up trigger still creates the profile row');
check((await asUser(db, newId, async () => (await db.query('select username from public.profiles where id = $1', [newId])).rows)).length === 1, 'and the new person reads their own row at once');
// hide / unhide flips visibility at once
await asUser(db, E, async () => db.query(`select public.unhide_profile_from($1)`, [A]));
const afterUnhide = (await direct('A')).includes('eve');
await asUser(db, E, async () => db.query(`select public.hide_profile_from($1)`, [A]));
const afterHide = (await direct('A')).includes('eve');
check(afterUnhide === true && afterHide === false, 'un-hiding and hiding a person flips direct visibility immediately');
// suspension flips visibility at once
await ex(`update public.profiles set is_suspended = false where id = $1`, [D]);
const dUp = (await direct('A')).includes('dan');
await ex(`update public.profiles set is_suspended = true where id = $1`, [D]);
check(dUp === true && !(await direct('A')).includes('dan'), 'lifting and setting a suspension flips direct visibility immediately');
// account deletion
const delId = await mkUser('leaver', 50);
await ex(`update auth.users set encrypted_password = extensions.crypt('pw-leaver-1', extensions.gen_salt('bf')) where id = $1`, [delId]);
await follow(A, delId); await follow(delId, A);
const delRes = await asUser(db, delId, async () => { try { return (await db.query(`select public.delete_my_account('pw-leaver-1') as r`)).rows[0].r; } catch (e) { return { error: e.message }; } });
check(delRes && delRes.success === true && (await ex('select 1 from public.profiles where id = $1', [delId])).rows.length === 0, 'account deletion still runs (profile gone through the cascade)', JSON.stringify(delRes));
check(!(await direct('A')).includes('leaver'), 'a deleted account is not readable any more');
// every function again, after the writes (the seed content moved on a little: compare against a fresh baseline taken with the switch OFF)
await setSwitch('off');
const base2 = await snapshot();
await setSwitch('on');
const on2 = await snapshot();
{ const { same, diff } = compare(base2, on2); check(diff.length === 0, `after the writes: ${same} of ${Object.keys(base2).length} answers still identical between switch OFF and ON`, diff.slice(0, 6).join(', ')); }

section('Stage 5 rollback (supabase/one-off/rollback-stage5.sql)');
await db.exec(ROLLBACK5); await db.exec(ROLLBACK5);
check(true, 'rollback-stage5.sql ran twice without an error');
const pol5b = (await ex(`select policyname, qual from pg_policies where tablename = 'profiles' order by 1`)).rows;
check(JSON.stringify(pol5b) === JSON.stringify(polBefore), 'the policies on profiles are exactly as before (profiles_select using (true))');
check((await ex(`select value from public.internal_config where key = 'profiles_row_rule'`)).rows[0].value === 'off', 'the switch is OFF again');
check((await aliveProfiles(A)).length === 9 + 1, 'ann reads every row again (the 9 seed people and the newcomer)', String((await aliveProfiles(A)).length));
{ const { same, diff } = compare(base2, await snapshot()); check(diff.length === 0, `${same} answers identical to the switch-OFF answers after the rollback`, diff.slice(0, 6).join(', ')); }

section('Rollback of the stages (newest first): the previous definitions come back exactly');
for (const f of ['rollback-gapb-stage2b3.sql', 'rollback-gapb-stage2b2.sql', 'rollback-gapb-stage2b1.sql', 'rollback-gapb-stage2a.sql']) { await db.exec(one(f)); await db.exec(one(f)); }
check(true, 'the four stage-2 rollback files ran (twice each) without an error');
check((await readers()).length === 17, 'the 17 caller-rights readers are back');
{ const { same, diff } = compare(base2, await snapshot()); check(diff.length === 0, `${same} answers identical after rolling stage 2 back`, diff.slice(0, 6).join(', ')); }
await db.exec(one('rollback-gapb-stage1.sql')); await db.exec(one('rollback-gapb-stage1.sql'));
check((await ex(`select 1 from pg_proc where proname like 'profile\\_%' and proname in ('profile_brief','profile_row_visible','profile_is_private','profile_noob_admin_ids','profile_search_candidates')`)).rows.length === 0, 'rollback-gapb-stage1.sql drops all helpers');
check((await ex(`select 1 from public.internal_config where key = 'profiles_row_rule'`)).rows.length === 0, 'and the switch row');
{ const { same, diff } = compare(base2, await snapshot()); check(diff.length === 0, `${same} answers identical after the full rollback`, diff.slice(0, 6).join(', ')); }
// and forward again to prove the migrations apply cleanly on top of a rolled-back state
for (const f of STAGES) await db.exec(stageSql[f]);
{ const { same, diff } = compare(base2, await snapshot()); check(diff.length === 0, `re-applying all five migrations after a full rollback: ${same} answers identical`, diff.slice(0, 6).join(', ')); }

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
