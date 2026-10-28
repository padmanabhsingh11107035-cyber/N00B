// Migration 20261030000002: the AI moderator also watches stories, NOOB Videos, Daily NOOB entries, polls, live-stream comments, room chat and the status note.
// On a REAL Postgres (PGlite) with every migration applied. The AI is replaced by verdicts handed to mod_apply.
// Usage: node --liftoff-only scripts/supabase/test-moderation-places-db.mjs
import { createTestDb } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const db = await createTestDb();
const SECRET = 'a-very-private-password';
await db.query(`insert into public.internal_config (key, value) values ('push_secret', $1) on conflict (key) do update set value = excluded.value`, [SECRET]);
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const one = async (sql, args = []) => (await q(sql, args))[0];
const mkUser = async (name) => {
  const id = (await one(`select gen_random_uuid() as id`)).id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  if (!(await q(`select 1 from public.profiles where id = $1`, [id])).length) await db.query(`insert into public.profiles (id, username, display_name, bio) values ($1, $2, $2, 'hello there')`, [id, name]);
  return id;
};
const admin = await mkUser('noob');
const ann = await mkUser('ann');
await db.query(`update public.moderation_settings set mode = 'enforce', strikes_to_suspend = 20`);
const job = async (kind, target) => one(`select * from public.moderation_jobs where kind = $1 and target_id = $2`, [kind, target]);
const claim = async (id) => (await one(`select public.mod_claim($1, $2) as r`, [SECRET, id])).r;
const apply = async (id, v) => (await one(`select public.mod_apply($1, $2, $3::jsonb) as r`, [SECRET, id, JSON.stringify(v)])).r;
const V = (o) => ({ violation: true, severity: 'severe', category: 'harassment', confidence: 0.95, words: [], reason: 'it is abusive', mediaViolation: false, ...o });
const exists = async (sql, args) => (await q(sql, args)).length === 1;
const run = async (kind, target, verdict) => { const j = await job(kind, target); if (!j) return { noJob: true }; const c = await claim(j.id); return { c, r: c.claimed ? await apply(j.id, verdict) : null, j }; };

section('1. Every public place writes a job');
const trg = (await q(`select c.relname from pg_trigger t join pg_class c on c.oid = t.tgrelid where t.tgname like 'zz_moderate%' and not t.tgisinternal`)).map((r) => r.relname);
for (const t of ['stories', 'long_videos', 'daily_challenge_entries', 'polls', 'live_stream_comments', 'noob_room_chat']) check(trg.includes(t), `${t} is watched`);

section('2. Story: the picture and the words on it');
const st = (await one(`insert into public.stories (user_id, media_url, media_type, stickers) values ($1, 'stories/a.jpg', 'image', $2::jsonb) returning id`,
  [ann, JSON.stringify([{ type: 'text', data: { text: 'you are a dirty idiot', color: 'red' }, x: 50, y: 50 }, { type: 'sticker', data: { url: 'https://x.test/a.gif' }, x: 10, y: 10 }])])).id;
const sj = await job('story', st);
check(sj && sj.status === 'pending', 'a new story writes a job');
const sc = await claim(sj.id);
check(sc.claimed && /dirty idiot/.test(sc.text) && !/x\.test/.test(sc.text) && sc.images[0] === 'stories/a.jpg', 'the AI is given the words on the story and its picture (not the addresses of stickers)');
const sr = await apply(sj.id, V({ mediaViolation: false, severity: 'mild', words: ['idiot'] }));
check(sr.action === 'deleted' && !(await exists(`select 1 from public.stories where id = $1`, [st])), 'a story can not be edited: it is removed');
check((await one(`select title from public.notifications where target_user_id = $1 order by created_at desc limit 1`, [ann])).title === '⚠️ Your story was removed', 'and the person is told');

section('3. NOOB Videos: title, description, thumbnail');
const vid = (await one(`insert into public.long_videos (user_id, video_url, thumbnail_url, title, description, duration_seconds) values ($1, 'videos/a.mp4', 'videos/a.jpg', 'My day', 'a very stupid thing', 60) returning id`, [ann])).id;
const vc = await claim((await job('video', vid)).id);
check(vc.claimed && /My day a very stupid thing/.test(vc.text) && vc.images[0] === 'videos/a.jpg', 'title + description + thumbnail go to the AI');
const vr = await apply((await job('video', vid)).id, V({ severity: 'mild', words: ['stupid'] }));
const vrow = await one(`select title, description from public.long_videos where id = $1`, [vid]);
check(vr.action === 'words_removed' && vrow.description === 'a very thing' && vrow.title === 'My day', 'a bad word is taken out of the description, the video stays');
await db.query(`update public.long_videos set title = 'stupid' where id = $1`, [vid]);
const vj2 = await q(`select * from public.moderation_jobs where kind = 'video' and target_id = $1 and status = 'pending'`, [vid]);
check(vj2.length === 1, 'editing the title judges it again');
await claim(vj2[0].id);
check((await apply(vj2[0].id, V({ severity: 'mild', words: ['stupid'] }))).action === 'words_removed', 'words only');
await db.query(`delete from public.moderation_jobs where kind = 'video'`);
const vid2 = (await one(`insert into public.long_videos (user_id, video_url, title, description, duration_seconds) values ($1, 'videos/b.mp4', 'idiot', '', 60) returning id`, [ann])).id;
await claim((await job('video', vid2)).id);
check((await apply((await job('video', vid2)).id, V({ severity: 'mild', words: ['idiot'] }))).action === 'deleted' && !(await exists(`select 1 from public.long_videos where id = $1`, [vid2])), 'a video whose whole title is the bad word is removed');

section('4. Daily NOOB entry');
if (!(await q(`select 1 from public.daily_challenge_prompts limit 1`)).length) await db.query(`insert into public.daily_challenge_prompts (id, prompt) values (1, 'test')`).catch(() => undefined);
const pid = (await one(`select id from public.daily_challenge_prompts limit 1`)).id;
await db.query(`insert into public.daily_challenges (challenge_date, prompt_id) values (current_date, $1) on conflict do nothing`, [pid]);
const de = (await one(`insert into public.daily_challenge_entries (challenge_date, user_id, media_url, media_type, caption) values (current_date, $1, 'daily/a.jpg', 'image', 'rude caption') returning id`, [ann])).id;
const dr = await run('daily', de, V({ mediaViolation: true, severity: 'severe', category: 'sexual' }));
check(dr.c.claimed && dr.c.images[0] === 'daily/a.jpg' && dr.r.action === 'deleted' && !(await exists(`select 1 from public.daily_challenge_entries where id = $1`, [de])), 'a picture that breaks the rules removes the entry');

section('5. Public poll');
const pl = (await one(`insert into public.polls (creator_id, question, ends_at) values ($1, 'Is this stupid or fine?', now() + interval '1 day') returning id`, [ann])).id;
const pr = await run('poll', pl, V({ severity: 'mild', words: ['stupid'] }));
check(pr.r.action === 'words_removed' && (await one(`select question from public.polls where id = $1`, [pl])).question === 'Is this or fine?', 'a bad word is taken out of the question');
const pl2 = (await one(`insert into public.polls (creator_id, question, ends_at) values ($1, 'you idiot you', now() + interval '1 day') returning id`, [ann])).id;
const pr2 = await run('poll', pl2, V({ severity: 'mild', words: ['idiot', 'you'] }));
check(pr2.r.action === 'deleted' && (await one(`select removed_at from public.polls where id = $1`, [pl2])).removed_at !== null, 'a poll that would be too short without the words is removed (hidden), not edited into nonsense');

section('6. Live comments and room chat');
const ls = (await one(`insert into public.live_streams (host_id, channel_name, title) values ($1, 'ch-1', 't') returning id`, [admin])).id;
const lc = (await one(`insert into public.live_stream_comments (stream_id, sender_id, text) values ($1, $2, 'go to hell loser') returning id`, [ls, ann])).id;
const lr = await run('live', lc, V({ severity: 'severe' }));
check(lr.r.action === 'deleted' && !(await exists(`select 1 from public.live_stream_comments where id = $1`, [lc])), 'a severe live comment is deleted');
await db.query(`insert into public.live_stream_comments (stream_id, sender_id, text, gift_amount) values ($1, $2, 'sent a gift', 10)`, [ls, ann]);
check(!(await q(`select 1 from public.moderation_jobs where kind = 'live' and target_id in (select id from public.live_stream_comments where gift_amount is not null)`)).length, 'a gift line is not judged');
const room = (await one(`insert into public.noob_rooms (host_id, name, channel_name) values ($1, 'room', 'rc-1') returning id`, [admin])).id;
const rc = (await one(`insert into public.noob_room_chat (room_id, sender_id, text) values ($1, $2, 'you damn idiot') returning id`, [room, ann])).id;
const rr = await run('room', rc, V({ severity: 'mild', words: ['idiot'] }));
check(rr.r.action === 'words_removed' && (await one(`select text from public.noob_room_chat where id = $1`, [rc])).text === 'you damn', 'a room message loses only the bad word');
const rp = (await one(`insert into public.noob_room_chat (room_id, sender_id, text, media_url, media_type) values ($1, $2, '', 'rooms/a.jpg', 'image') returning id`, [room, ann])).id;
const rpr = await run('room', rp, V({ mediaViolation: true, severity: 'severe', category: 'sexual' }));
check(rpr.c.claimed && rpr.c.images[0] === 'rooms/a.jpg' && rpr.r.action === 'deleted', 'a picture sent in a room is judged too');

section('7. Status note');
await db.query(`update public.profiles set status_note = $2::jsonb where id = $1`, [ann, JSON.stringify({ text: 'feeling like a stupid fool', createdAt: new Date().toISOString() })]);
const nj = await job('note', ann);
check(nj && (await claim(nj.id)).text === 'feeling like a stupid fool', 'a new status note is judged');
check((await apply(nj.id, V({ severity: 'mild', words: ['stupid'] }))).action === 'deleted' && (await one(`select status_note from public.profiles where id = $1`, [ann])).status_note === null, 'a note is removed as a whole');

section('8. The moderator never touches private places');
const all = (await q(`select c.relname from pg_trigger t join pg_class c on c.oid = t.tgrelid where t.tgname like 'zz_moderate%' and not t.tgisinternal`)).map((r) => r.relname);
for (const t of ['messages', 'chats', 'anon_messages', 'call_logs', 'live_lounge_room_chat', 'ask_questions']) check(!all.includes(t), `${t} is NOT watched`);

section('9. Audit: nobody can call the helpers');
for (const fn of ['mod_fetch(text, uuid)', 'mod_enforce(text, uuid, text, text[])', 'mod_trg_any()']) {
  const r = await one(`select has_function_privilege('anon', 'public.${fn}', 'execute') a, has_function_privilege('authenticated', 'public.${fn}', 'execute') b`);
  check(!r.a && !r.b, `${fn} is closed to visitors and members`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
