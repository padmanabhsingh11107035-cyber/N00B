// Live streams: 30 minutes at most, nothing kept after they end (migration 20261127000002) on a REAL Postgres (PGlite), the screen of the host, and the "Live now" boxes on Home.
// Usage: node --liftoff-only scripts/supabase/test-live-30-minutes.mjs
import fs from 'node:fs';
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

section('1. The database');
const sql = read('supabase/migrations/20261127000002_live_30_minutes.sql');
check(/interval '30 minutes'/.test(sql) && /revoke all on function public\.live_streams_housekeeping\(\) from public, anon, authenticated/.test(sql) && /'totalLikes', s\.total_likes/.test(sql), '30 minutes, the clean-up is private, and the hearts are handed out');
const db = await createTestDb();
const mk = async (name) => {
  const id = (await db.query('select gen_random_uuid() as id')).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values ($1, $2, 'x', $3::jsonb)`, [id, `${name}@users.nooob.xyz`, JSON.stringify({ legacy_id: `u_${name}` })]);
  await db.query(`insert into public.profiles (id, username, display_name, avatar) values ($1, $2, $2, 'avatars/test.jpg')`, [id, name]);
  return id;
};
const raw = async (q, a = []) => (await db.query(q, a)).rows;
const call = (uid, fn, args = []) => asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
const host = await mk('lv_host'), fan = await mk('lv_fan');
const stream = async (minutesAgo, likes = 0) => (await raw(`insert into public.live_streams (host_id, channel_name, title, total_likes, started_at) values ($1, 'live_' || replace(gen_random_uuid()::text, '-', ''), 't', $2, now() - ($3 || ' minutes')::interval) returning id`, [host, likes, String(minutesAgo)]))[0].id;
const fresh = await stream(5, 7), old = await stream(31);
await raw(`insert into public.live_stream_comments (stream_id, sender_id, text) values ($1, $2, 'hello')`, [old, fan]);
await raw(`insert into public.live_stream_comments (stream_id, sender_id, text) values ($1, $2, 'hi there')`, [fresh, fan]);
const list = await call(fan, 'list_live_streams');
check(list.length === 1 && list[0].id === fresh && list[0].totalLikes === 7 && list[0].host.username === 'lv_host', 'only the live under 30 minutes is listed, with its hearts');
check((await raw('select status from public.live_streams where id = $1', [old]))[0].status === 'ended', 'the one that reached 30 minutes was ended by the database');
check((await raw('select count(*)::int n from public.live_stream_comments where stream_id = $1', [fresh]))[0].n === 1, 'the chat of a running live is kept while it runs');
await raw(`update public.live_streams set ended_at = now() - interval '2 minutes' where id = $1`, [old]);
await call(fan, 'list_live_streams');
check((await raw('select count(*)::int n from public.live_stream_comments where stream_id = $1', [old]))[0].n === 0, 'the chat of a live that ended is erased a minute later');
await raw(`insert into public.live_stream_gifts (stream_id, sender_id, amount) values ($1, $2, 100)`, [old, fan]);
await call(fan, 'list_live_streams');
check((await raw('select count(*)::int n from public.live_stream_gifts where stream_id = $1', [old]))[0].n === 1, 'the gifts stay (a record of NOOB Points that moved)');
let err = '';
const overdue = await stream(35);
try { await call(fan, 'live_stream_join', [overdue]); } catch (e) { err = String(e.message || e); }
check(/not available/i.test(err), 'nobody can join a live that is past 30 minutes');
const joined = await call(fan, 'live_stream_join', [fresh]);
check(joined.hostId === host && joined.isHost === false, 'joining a live that is running still works');
err = '';
try { await asAnon(db, () => db.query('select public.list_live_streams()')); } catch (e) { err = String(e.message || e); }
check(/permission denied/i.test(err), 'a visitor without an account can not list lives');
err = '';
try { await asUser(db, fan, () => db.query('select public.live_streams_housekeeping()')); } catch (e) { err = String(e.message || e); }
check(/permission denied/i.test(err), 'nobody can call the clean-up by hand');

section('2. The host\'s screen and the boxes on Home');
const view = read('src/components/LiveStream/LiveStreamView.tsx'), rail = read('src/components/Feed/HomeLiveRail.tsx'), feed = read('src/components/Feed/FeedView.tsx'), css = read('src/components/Feed/home.css');
check(/LIVE_MAX_MINUTES = 30/.test(view) && /endLiveStream\(streamId\)/.test(view) && /2 minutes/.test(view), 'the host\'s phone warns at 28 minutes and stops the live at 30');
check(/data-testid="home-live-rail"/.test(rail) && /likeLiveStream/.test(rail) && /fetchLiveStreamComments/.test(rail) && /onOpen\(/.test(rail) && /hl-card/.test(rail), 'the "Live now" boxes: curved, with a heart, the latest chat line and a button into the live');
check(/<HomeLiveRail/.test(feed) && /featOn\('live'\)/.test(feed), 'the boxes sit on top of Home (under the stories), only while Live is switched on');
check(/\.hl-card \{[^}]*border-radius: 28px/.test(css) && /:root\[data-theme="light"\] \.hl-card/.test(css), 'curved corners, dark and light');

section('3. When going live fails');
const agoraSrc = read('src/utils/agoraError.ts');
check(/createScreenVideoTrack\(\{\}, 'disable'\)/.test(view) && /screenResult\.status === 'rejected'/.test(view) && /audioTrack = micResult\.status === 'fulfilled' \? micResult\.value : null;/.test(view) && !/\[audioTrack, videoTrack\] = await withTimeout\(Promise\.all/.test(view), 'sharing the screen no longer needs a microphone: the screen and the microphone are asked for separately (a computer without a microphone shares without sound)');
check(/DEVICE_NOT_FOUND/.test(agoraSrc) && /NOT_SUPPORTED/.test(agoraSrc) && /PERMISSION_DENIED/.test(agoraSrc) && /No camera or screen was found on this device/.test(agoraSrc) && /can not share its screen/.test(agoraSrc),'the browser\'s plain message ("Requested device not found") is replaced by a sentence that says what to do');
check(/data-testid="live-try-again"/.test(view) && /setPhase\('setup'\)/.test(view), 'a host whose live failed gets "Try again" next to "Close"');
check(/data-testid="home-live-end"/.test(rail) && /endLiveStream\(s\.id\)/.test(rail) && /meId=\{currentUser\.id\}/.test(feed) && /Tap again to end/.test(rail), 'the host\'s own box on Home has an End live button (a second press ends it), from any phone or computer');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
