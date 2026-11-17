// "Report" on posts, reels and videos (migration 20261118000001), and the post viewer's back bar under the clock.
//   1. the SQL on a REAL Postgres (PGlite): the owner is looked up on the server, own content can not be reported, a repeat returns the first, a visitor is refused,
//      and the admin's view of the report names who reported, what (type, id, link) and whose it is;
//   2. the screens: a Report entry in the post, reel and video menus (not for the owner), the sheet host is mounted, the admin card shows the link, the reporter and the owner;
//   3. the profile post viewer keeps its Back bar below the clock (a video inside made the app treat it as a picture screen and skip the gap).
// Usage: node --liftoff-only scripts/supabase/test-content-reports.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

section('1. The SQL on a real Postgres');
const { createTestDb, asUser, asAnon } = await import('./pg-test-env.mjs');
const db = await createTestDb();
const mkUser = async (name) => {
  const id = (await db.query('select gen_random_uuid() as id')).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, extensions.crypt('secret pass', extensions.gen_salt('bf')))`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query('select 1 from public.profiles where id = $1', [id])).rows.length) await db.query('insert into public.profiles (id, username, display_name) values ($1, $2, $2)', [id, name]);
  return id;
};
const ann = await mkUser('ann'), bob = await mkUser('bob');
const post = (await db.query(`insert into public.posts (user_id, caption) values ($1, 'p') returning id`, [ann])).rows[0].id;
const reel = (await db.query(`insert into public.reels (user_id, video_url) values ($1, 'x.mp4') returning id`, [ann])).rows[0].id;
const call = async (uid, sql, args = []) => asUser(db, uid, async () => (await db.query(sql, args)).rows[0]?.r);
const fail = async (uid, sql, args = []) => { try { await call(uid, sql, args); return null; } catch (e) { return e.message; } };
const r1 = await call(bob, 'select public.report_content($1, $2, $3, $4) as r', ['post', post, 'Spam or scam', 'looks like an ad']);
check(r1.success === true && !!r1.reportId, 'a person can report a post');
const row = (await db.query('select * from public.reports where id = $1', [r1.reportId])).rows[0];
check(row.reporter_id === bob && row.target_id === ann && row.content_type === 'post' && row.content_id === post, 'the report stores who reported, whose it is (looked up on the server) and which post');
const again = await call(bob, 'select public.report_content($1, $2, $3, $4) as r', ['post', post, 'Spam or scam', '']);
check(again.reportId === r1.reportId && (await db.query('select count(*)::int as n from public.reports where content_id = $1', [post])).rows[0].n === 1, 'reporting the same thing again returns the first report (no duplicates)');
check((await call(bob, 'select public.report_content($1, $2, $3, $4) as r', ['reel', reel, 'Something else', ''])).success === true, 'a reel can be reported');
check(/your own/i.test((await fail(ann, 'select public.report_content($1, $2, $3, $4) as r', ['post', post, 'Spam', ''])) || ''), 'you can not report your own content');
check(/no longer available/i.test((await fail(bob, 'select public.report_content($1, $2, $3, $4) as r', ['post', '00000000-0000-0000-0000-000000000000', 'Spam', ''])) || ''), 'content that does not exist is refused');
check(/nothing to report/i.test((await fail(bob, 'select public.report_content($1, $2, $3, $4) as r', ['comment', post, 'Spam', ''])) || ''), 'only post, reel, video and story can be reported');
check((await db.query('select count(*)::int as n from public.blocks where blocker_id = $1', [bob])).rows[0].n === 0, 'reporting content does not block its owner');
const anonTry = await asAnon(db, async () => { try { await db.query('select public.report_content($1, $2, $3, $4)', ['post', post, 'x', '']); return 'ran'; } catch (e) { return e.message; } });
check(/permission denied/i.test(anonTry), 'a logged-out visitor can not report');
const j = (await db.query('select public.report_json(r) as j from public.reports r where r.id = $1', [r1.reportId])).rows[0].j;
check(j.reporterId === bob && j.reporterUsername === 'bob' && j.targetUsername === 'ann' && j.contentType === 'post' && j.contentId === post && j.contentPath === '/p/' + post, 'the admin sees who reported (id and name), what (type, id, link path) and whose it is');
const jr = (await db.query(`select public.report_json(r) as j from public.reports r where r.content_type = 'reel'`)).rows[0].j;
check(jr.contentPath === '/reel/' + reel, 'a reel report carries the reel address');
const direct = await asUser(db, bob, async () => { try { await db.query('select public.report_json(r) from public.reports r'); return 'read'; } catch (e) { return e.message; } });
check(/permission denied/i.test(direct), 'a normal user can not read the report view');

section('2. The screens');
const sheet = read('src/components/Common/ContentReportSheet.tsx'), main = read('src/main.tsx'), api = read('src/services/supabaseApi.ts'), admin = read('src/components/Modals/AdminControlModal.tsx');
check(/<ContentReportHost \/>/.test(main) && /rpc\('report_content'/.test(api) && /export function openContentReport/.test(sheet), 'the report sheet is mounted once and calls report_content');
check(/!isOwner && \(\s*<button\s+onClick=\{\(\) => \{ setShowOptionsMenu\(false\); openContentReport\(\{ type: 'post'/.test(read('src/components/Feed/PostCard.tsx')), 'posts (and the videos inside them): Report is in the menu of somebody else\'s post');
check(/!isReelOwner && currentReel && \([\s\S]{0,260}openContentReport\(\{ type: 'reel'/.test(read('src/components/Reels/ReelsView.tsx')), 'reels: Report is in the menu of somebody else\'s reel');
check(/!isOwner\(actionVideo\) && \([\s\S]{0,260}openContentReport\(\{ type: 'video'/.test(read('src/components/Videos/HomeVideoFeedView.tsx')), 'videos: Report is in the menu of somebody else\'s video');
check(/report-content-info/.test(admin) && /rep\.reporterId/.test(admin) && /rep\.contentPath/.test(admin) && /Made by/.test(admin), 'the admin card shows the link, who made it and who reported it');

section('3. The profile post viewer');
const pv = read('src/components/Profile/ProfilePostViewer.tsx');
check(/className="edge-own fixed inset-0/.test(pv) && /safe-area-inset-top/.test(pv), 'its Back bar keeps its own room under the clock (a video inside skips the app\'s automatic gap)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
