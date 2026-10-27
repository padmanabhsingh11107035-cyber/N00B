// Tests migration 20261027000003: a Live Lounge meeting that is still running an hour after it started is ended by itself.
//   * the sweep ends only rooms that are "active" and older than an hour, with the reason "time_limit"
//   * the question every person in a room already asks (live_lounge_room_my_status) does the sweep and tells the person why the room ended
//   * nobody can run the sweep from a browser
//   * the room screen says why
//
// Usage: node --liftoff-only scripts/supabase/test-meeting-hour-limit-db.mjs
import fs from 'node:fs';
import { createTestDb } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);

const db = await createTestDb();
const user = async (name) => {
  const id = crypto.randomUUID();
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${name}@users.nooob.xyz`]);
  await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  return id;
};
const host = await user('hosty');
const guest = await user('guesty');
const room = async (code, minutesOld, status = 'active') => {
  const id = crypto.randomUUID();
  await db.query(
    `insert into public.live_lounge_rooms (id, host_id, title, room_code, channel_name, status, created_at) values ($1, $2, $3, $4, $5, $6, now() - ($7 || ' minutes')::interval)`,
    [id, host, 'Room ' + code, code, 'ch_' + code, status, String(minutesOld)]
  );
  await db.query(`insert into public.live_lounge_room_participants (room_id, user_id, role, status) values ($1, $2, 'host', 'admitted'), ($1, $3, 'participant', 'admitted')`, [id, host, guest]);
  return id;
};
const row = async (id) => (await db.query(`select status, ended_reason, ended_at from public.live_lounge_rooms where id = $1`, [id])).rows[0];
const asUser = async (uid, fn) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false)`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false)`); }
};

section('1. The sweep');
const fresh = await room('NEW001', 5);
const almost = await room('NEW002', 59);
const old = await room('OLD001', 61);
const veryOld = await room('OLD002', 600);
const alreadyEnded = await room('END001', 300, 'ended');
const n = (await db.query(`select public.end_stale_live_lounge_rooms() n`)).rows[0].n;
check(n === 2, 'two rooms were ended: the two that are over an hour old', String(n));
check((await row(old)).status === 'ended' && (await row(old)).ended_reason === 'time_limit' && (await row(old)).ended_at, 'a 61 minute old room is ended, with the reason "time_limit" and the time');
check((await row(veryOld)).status === 'ended' && (await row(veryOld)).ended_reason === 'time_limit', 'a room somebody forgot for 10 hours too');
check((await row(fresh)).status === 'active' && (await row(almost)).status === 'active', 'a 5 minute old room and a 59 minute old room keep running');
check((await row(alreadyEnded)).ended_reason === null, 'a room that was already ended keeps its own story (no reason is written over it)');
check((await db.query(`select public.end_stale_live_lounge_rooms() n`)).rows[0].n === 0, 'running it again changes nothing');

section('2. The question every person in a room already asks');
const live = await room('LIVE01', 70);
const st = await asUser(guest, async () => (await db.query(`select public.live_lounge_room_my_status($1) s`, [live])).rows[0].s);
check(st && st.roomStatus === 'ended' && st.endedReason === 'time_limit', 'a guest asking about an hour-old room is told it ended, and why', JSON.stringify(st));
const fine = await asUser(guest, async () => (await db.query(`select public.live_lounge_room_my_status($1) s`, [fresh]).then((r) => r.rows[0].s)));
check(fine && fine.roomStatus === 'active' && fine.status === 'admitted' && fine.endedReason === null, 'a guest in a young room sees it as it was: active, admitted');
const hostSt = await asUser(host, async () => (await db.query(`select public.live_lounge_room_my_status($1) s`, [almost]).then((r) => r.rows[0].s)));
check(hostSt && hostSt.roomStatus === 'active' && hostSt.role === 'host', 'the host of a 59 minute old room still has it');
const manual = await room('MAN001', 10);
await asUser(host, async () => db.query(`select public.end_live_lounge_room($1)`, [manual]));
const manualRow = await row(manual);
check(manualRow.status === 'ended' && manualRow.ended_reason === null, 'a host who ends a room by hand: no "time_limit" reason');

section('3. Who may sweep');
const asRole = async (role, sql) => {
  await db.exec(`set role ${role}`);
  try { await db.query(sql); return true; } catch { return false; } finally { await db.exec('reset role'); }
};
check(!(await asRole('anon', `select public.end_stale_live_lounge_rooms()`)) && !(await asRole('authenticated', `select public.end_stale_live_lounge_rooms()`)), 'nobody in a browser can run the sweep');
check(await asRole('service_role', `select public.end_stale_live_lounge_rooms()`), 'the server can');

section('4. The room screen and the files');
const view = fs.readFileSync('src/components/LiveStream/LiveLoungeRoomView.tsx', 'utf8');
const api = fs.readFileSync('src/services/supabaseApi.ts', 'utf8');
const mig = fs.readFileSync('supabase/migrations/20261027000003_meetings_end_after_one_hour.sql', 'utf8');
check(/TIME_LIMIT_MESSAGE = 'This meeting reached the 1 hour limit and ended automatically/.test(view) && (view.match(/endedReason === 'time_limit' \? TIME_LIMIT_MESSAGE/g) || []).length === 2, 'both places that close the room screen say "reached the 1 hour limit and ended automatically"');
check(/endedReason\?: string/.test(api), 'the status answer carries the reason');
check(/cron\.schedule\('noob-end-stale-meetings', '\*\/5 \* \* \* \*'/.test(mig) && /exception when others then/.test(mig), 'where pg_cron exists it also runs every 5 minutes, and a missing pg_cron never fails the migration');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
