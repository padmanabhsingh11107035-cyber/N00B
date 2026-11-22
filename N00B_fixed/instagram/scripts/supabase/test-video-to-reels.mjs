// Tests for migration 20261122000001: "Add to Reels" for a video: ONE file shown in two places, nothing copied, against a real Postgres (PGlite) holding the real backup.
import fs from 'node:fs';
import path from 'node:path';
import { loadBackup, buildImportPlan } from './transform.mjs';
import { runImport } from './run-import.mjs';
import { createTestDb, makePgAdapter, asUser } from './pg-test-env.mjs';

const backupsRoot = 'backups';
const dir = process.argv.slice(2).find((a) => !a.startsWith('--')) || path.join(backupsRoot, fs.readdirSync(backupsRoot).filter((d) => fs.existsSync(path.join(backupsRoot, d, 'users.json'))).sort().pop());
const raw = loadBackup(dir);

let passed = 0;
let failed = 0;
const check = (cond, label, detail = '') => {
  if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); }
};
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};
const section = (t) => console.log(`\n${t}`);

const plan = buildImportPlan(raw, {});
const db = await createTestDb();
await runImport(plan, makePgAdapter(db), { log: () => {} });

const profByLegacy = Object.fromEntries((await db.query('select * from profiles')).rows.map((p) => [p.legacy_id, p]));
const idOf = (u) => profByLegacy[u.id].id;
const publicRaw = raw.users.filter((u) => u.accountType !== 'private' && !u.isAdmin);
const [a, b] = publicRaw.slice(0, 2).map(idOf);

const call = (uid, sql, params = []) => asUser(db, uid, async () => (await db.query(sql, params)).rows);
const rpc = async (uid, fn, ...args) => (await call(uid, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args))[0].r;
const q = async (sql, params = []) => (await db.query(sql, params)).rows;

const FILE = 'videos/1700000000000-abc1234.mp4';
const COVER = 'videos/1700000000000-cover.jpg';
const short = (await rpc(a, 'create_long_video', FILE, COVER, 'My short video', 'about it', 45)).video;
const long = (await rpc(a, 'create_long_video', 'videos/1700000000001-long.mp4', null, 'A long one', '', 600)).video;

section('1. Add a short video to Reels');
const reel = await rpc(a, 'add_long_video_to_reels', short.id);
check(reel && reel.id, 'a reel is made', JSON.stringify(reel).slice(0, 120));
check(reel.videoUrl === FILE, 'the reel points to the SAME file (nothing copied)', reel.videoUrl);
check(reel.thumbnailUrl === COVER, 'the same cover picture too', reel.thumbnailUrl);
check(reel.caption === 'My short video', 'the caption is the title', reel.caption);
check(Number(reel.durationSeconds) === 45, "the length is the video's", String(reel.durationSeconds));
check((await q('select count(*)::int n from reels where video_url = $1', [FILE]))[0].n === 1, 'one reel row for that file');
check((await rpc(a, 'long_video_reel_id', short.id)) === reel.id, 'the video knows its reel');

section('2. Adding twice does nothing');
const again = await rpc(a, 'add_long_video_to_reels', short.id);
check(again.id === reel.id, 'the same reel comes back');
check((await q('select count(*)::int n from reels where source_video_id = $1', [short.id]))[0].n === 1, 'still just one reel for the video');

section('3. Rules');
await expectFail(() => rpc(b, 'add_long_video_to_reels', short.id), /Only the person who uploaded/i, 'somebody else can not add my video');
await expectFail(() => rpc(a, 'add_long_video_to_reels', long.id), /up to 70 seconds/i, 'a 10-minute video is refused');
await expectFail(() => rpc(a, 'add_long_video_to_reels', '00000000-0000-0000-0000-000000000000'), /not found/i, 'a video that does not exist');
check((await rpc(a, 'long_video_reel_id', long.id)) === null, 'the refused video has no reel');

section('4. Removing only the reel keeps the video and its file');
await call(a, 'delete from reels where id = $1', [reel.id]);
check((await q('select count(*)::int n from long_videos where id = $1', [short.id]))[0].n === 1, 'the video is still there');
const inUse = await q('select public.media_in_use($1::text[]) as u', [[FILE]]);
check(inUse[0].u.includes(FILE), 'the cleanup sees the file is still used by the video (it will not be removed)', JSON.stringify(inUse[0].u));

section('5. Add again, then remove the VIDEO: the reel goes with it and the file is free to clean up');
const reel2 = await rpc(a, 'add_long_video_to_reels', short.id);
check(reel2.id !== reel.id && reel2.videoUrl === FILE, 'a new reel (the old one was removed) on the same file');
await rpc(a, 'delete_long_video', short.id);
check((await q('select count(*)::int n from reels where id = $1', [reel2.id]))[0].n === 0, 'the reel is gone with its video');
const free = await q('select public.media_in_use($1::text[]) as u', [[FILE]]);
check(!free[0].u.includes(FILE), 'nothing points to the file any more (the cleanup may remove it after its delay)', JSON.stringify(free[0].u));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
