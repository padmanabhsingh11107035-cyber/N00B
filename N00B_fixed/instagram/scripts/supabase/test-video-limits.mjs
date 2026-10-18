// Video length limits: a video for the Videos page up to 5 hours (database, on a REAL Postgres with every migration applied), a reel up to 70 seconds
// (the app checks it on the phone before uploading). Usage: node --liftoff-only scripts/supabase/test-video-limits.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTestDb, asUser } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

section('1. The database: up to 5 hours');
const db = await createTestDb();
const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, 'maker@users.nooob.xyz']);
if (!(await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, 'maker', 'maker')`, [id]);
await db.query(`update public.profiles set pro_tier = 'pro' where id = $1`, [id]).catch(() => undefined);   // no one-a-day limit in the way
const make = (secs) => asUser(db, id, async () => (await db.query(`select public.create_long_video('k/video.mp4', null, 'v', '', $1) as r`, [secs])).rows[0].r);
const tryMake = async (secs) => { try { await make(secs); return null; } catch (e) { return e.message; } };
check((await tryMake(60)) === null, 'a one-minute video is fine');
check((await tryMake(7201)) === null, 'a video longer than 2 hours is fine now (it used to be refused)');
check((await tryMake(18000)) === null, 'exactly 5 hours is fine');
check(/no more than 5 hours/.test((await tryMake(18001)) || ''), 'a second over 5 hours is refused, with a clear message');
check(/no more than 5 hours/.test((await tryMake(0)) || ''), 'and so is a video with no length');
let backstop = '';
try { await db.query(`insert into public.long_videos (user_id, video_url, duration_seconds) values ($1, 'k/x.mp4', 18001)`, [id]); } catch (e) { backstop = e.message; }
check(/check constraint/.test(backstop), 'the table itself refuses more than 5 hours too, even if the function were bypassed', backstop);
const sql = read('supabase/migrations/20261018000004_long_video_5_hours.sql');
await db.exec(sql);
check((await tryMake(9000)) === null, 'running the migration twice changes nothing');

section('2. The app');
const U = await import(pathToFileURL(path.resolve('src/utils/videoDuration.ts')).href);
check(U.REEL_MAX_SECONDS === 70 && U.LONG_VIDEO_MAX_SECONDS === 18000, 'the limits are 70 seconds and 5 hours');
check(U.describeLength(45) === '45 seconds' && U.describeLength(600) === '10 minutes' && U.describeLength(3 * 3600 + 1800) === '3 hours 30 minutes' && U.describeLength(3600) === '1 hour', 'lengths are described in plain words');
const modal = read('src/components/PostCreation/PostCreationModal.tsx');
check(/const length = await readVideoDuration\(firstFile\);\s*\n\s*if \(Number\.isFinite\(length\) && length > REEL_MAX_SECONDS\) \{/.test(modal) && /A reel can be up to \$\{REEL_MAX_SECONDS\} seconds/.test(modal), 'a video over 70 seconds is refused as a reel before it is uploaded, with a message that says how long it is');
const upload = read('src/components/Videos/UploadVideoModal.tsx');
check(/const MAX_DURATION_SECONDS = 5 \* 60 \* 60;/.test(upload) && /the limit here is 5 hours/.test(upload) && /maxSecondsThatFit/.test(upload) && /One upload can hold about/.test(upload), 'the Videos upload still checks 5 hours, and says up front how much one upload can hold today (storage takes 50 MB a file)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
