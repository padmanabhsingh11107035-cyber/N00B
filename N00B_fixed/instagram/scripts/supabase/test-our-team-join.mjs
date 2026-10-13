// Tests migration 20261013000002: people join the "Our Team" page themselves, from a link, inside the app. The account (User ID, account ID)
// comes from the login; the administrator approves (or a switch publishes straight away, or another one closes applications); the page shows
// the linked account and the viewer's follow state. On a REAL Postgres (PGlite) with every migration applied.
//
// Usage: node scripts/supabase/test-our-team-join.mjs
import fs from 'node:fs';
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
const rpc = (uid, fn, ...args) => asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const names = (team) => team.map((m) => m.name).join(',');
const apply = (uid, name = 'Ria Shah', qual = 'B.Sc IT', desc = 'I design things.', photo = 'team/ria.jpg') => rpc(uid, 'team_apply', name, qual, desc, photo);

const admin = await mkUser('noob', { is_admin: true });
const ria = await mkUser('ria');
const sam = await mkUser('sam');
const tia = await mkUser('tia');
const viewer = await mkUser('viewer');

section('1. Applying needs a login, and everything filled in');
let denied = false;
try { await asAnon(db, async () => db.query(`select public.team_apply('A', 'B', 'C', 'team/x.jpg')`)); } catch (e) { denied = /permission denied/.test(e.message); }
check(denied, 'someone not signed in cannot apply');
await expectFail(() => apply(ria, 'Ria', 'B.Sc', 'About me', ''), /add a photo/, 'a photo is required');
await expectFail(() => apply(ria, '  ', 'B.Sc', 'About me'), /write your name/, 'a name is required');
await expectFail(() => apply(ria, 'Ria', '', 'About me'), /write your qualification/, 'a qualification is required');
await expectFail(() => apply(ria, 'Ria', 'B.Sc', ' '), /short description/, 'a description is required');
await expectFail(() => apply(ria, 'N'.repeat(81)), /at most 80/, 'a name over 80 characters');
await expectFail(() => apply(ria, 'Ria', 'Q'.repeat(161)), /at most 160/, 'a qualification over 160 characters');
await expectFail(() => apply(ria, 'Ria', 'B.Sc', 'D'.repeat(1201)), /at most 1200/, 'a description over 1200 characters');
await expectFail(() => apply(ria, 'Ria', 'B.Sc', 'About me', 'data:image/png;base64,AAAA'), /upload the photo as a file/, 'a picture cannot be stored inside the database');
check((await q(`select count(*)::int n from public.team_page_applications`))[0].n === 0, 'nothing was saved by the refused attempts');

section('2. A pending application');
let r = await apply(ria);
check(r.success === true && r.status === 'pending', 'ria applies: it waits for the administrator');
check((await rpc(viewer, 'team_list')).length === 0, 'she is not on the page yet');
let mine = await rpc(ria, 'team_my_application');
check(mine.open === true && mine.onTeam === false && mine.application.status === 'pending' && mine.application.name === 'Ria Shah' && mine.application.photo === 'team/ria.jpg', 'she can see what she sent and that it is pending');
r = await apply(ria, 'Ria S. Shah', 'B.Sc IT, MBA', 'I design and I write.', 'team/ria2.jpg');
check((await q(`select count(*)::int n from public.team_page_applications where user_id = $1`, [ria]))[0].n === 1, 'applying again changes the same application (never a second one)');
mine = await rpc(ria, 'team_my_application');
check(mine.application.name === 'Ria S. Shah' && mine.application.qualification === 'B.Sc IT, MBA' && mine.application.photo === 'team/ria2.jpg', 'with the new details');
check((await rpc(sam, 'team_my_application')).application === null, 'someone who never applied has none');

section('3. The administrator sees it, with the User ID that came from the login');
await expectFail(() => rpc(ria, 'admin_team_page_applications'), /Only the main NOOB administrator/, 'an ordinary member cannot see the applications');
const anyApplicationId = (await q(`select id from public.team_page_applications limit 1`))[0].id;
await expectFail(() => rpc(ria, 'admin_team_decide', anyApplicationId, true), /Only the main NOOB administrator/, 'nor decide on them');
await expectFail(() => rpc(ria, 'admin_team_settings', false, null), /Only the main NOOB administrator/, 'nor change the switches');
const ov = await rpc(admin, 'admin_team_page_applications');
const app = ov.applications[0];
check(ov.applications.length === 1 && app.status === 'pending' && app.userId === ria && app.username === 'ria' && app.name === 'Ria S. Shah' && app.qualification === 'B.Sc IT, MBA' && app.onTeam === false, 'the administrator sees the application with her User ID and account ID');
check(ov.settings.open === true && ov.settings.autoPublish === false, 'the switches start as: applications open, nothing published automatically');

section('4. Approving');
r = await rpc(admin, 'admin_team_decide', app.id, true);
check(r.success === true && r.team.length === 1 && r.team[0].name === 'Ria S. Shah' && r.team[0].userId === ria && r.team[0].username === 'ria', 'approved: she is on the page with her linked account');
check(r.admin.applications[0].status === 'approved', 'the application is marked approved');
const note = (await q(`select title, message, type from public.notifications where target_user_id = $1 order by created_at desc limit 1`, [ria]))[0];
check(note?.type === 'admin_direct' && /Welcome to the team/.test(note.title) && /Our Team/.test(note.message), 'she is told, by notification');
await expectFail(() => rpc(admin, 'admin_team_decide', app.id, true), /already decided/, 'deciding twice is refused');
await expectFail(() => apply(ria), /already on the Our Team page/, 'someone already on the page cannot apply again');
mine = await rpc(ria, 'team_my_application');
check(mine.onTeam === true && mine.application.status === 'approved', 'her form now says she is on the team');

section('5. Turning someone down');
await apply(sam, 'Sam Lee', 'Diploma', 'I moderate.', 'team/sam.jpg');
const samApp = (await rpc(admin, 'admin_team_page_applications')).applications.find((a) => a.userId === sam);
check(samApp.status === 'pending' && samApp.username === 'sam', 'sam\'s application is waiting (pending ones come first)');
r = await rpc(admin, 'admin_team_decide', samApp.id, false);
check(r.team.length === 1 && r.admin.applications.find((a) => a.userId === sam).status === 'rejected', 'turned down: he is not added');
const note2 = (await q(`select title, message from public.notifications where target_user_id = $1 order by created_at desc limit 1`, [sam]))[0];
check(/welcome to apply again/.test(note2.message), 'he is told kindly');
r = await apply(sam, 'Sam Lee', 'Diploma, B.Com', 'I moderate and I help.', 'team/sam2.jpg');
check(r.status === 'pending' && (await rpc(sam, 'team_my_application')).application.status === 'pending', 'and may apply again: it goes back to waiting');

section('6. The switches');
await expectFail(() => rpc(ria, 'admin_team_settings', null, true), /Only the main NOOB administrator/, 'only the administrator flips them');
let s = await rpc(admin, 'admin_team_settings', false, null);
check(s.settings.open === false && s.settings.autoPublish === false, 'applications can be closed');
await expectFail(() => apply(tia), /closed right now/, 'then nobody can apply, and the form says so');
check((await rpc(tia, 'team_my_application')).open === false, 'the form can tell the person it is closed');
s = await rpc(admin, 'admin_team_settings', true, true);
check(s.settings.open === true && s.settings.autoPublish === true, 'reopened, and publishing straight away switched on');
r = await apply(tia, 'Tia Rao', 'BCA', 'I test everything.', 'team/tia.jpg');
check(r.status === 'approved', 'with the switch on, an application goes live at once');
let team = await rpc(viewer, 'team_list');
check(names(team) === 'Ria S. Shah,Tia Rao' && team[1].userId === tia && team[1].username === 'tia', 'she is on the page, last, with her linked account');
check((await rpc(admin, 'admin_team_page_applications')).applications.find((a) => a.userId === tia).status === 'approved', 'and the administrator sees it as approved');
await rpc(admin, 'admin_team_settings', null, false);

section('7. The page: linked accounts and "Follow on NOOB"');
team = await rpc(viewer, 'team_list');
const riaCard = team.find((m) => m.username === 'ria');
check(riaCard.userId === ria && riaCard.following === false && riaCard.requested === false && riaCard.isMe === false && riaCard.blocked === false && typeof riaCard.avatar === 'string', 'a linked card carries the account, the avatar and the viewer\'s state (not following yet)');
await rpc(viewer, 'toggle_follow', ria);
team = await rpc(viewer, 'team_list');
check(team.find((m) => m.username === 'ria').following === true && team.find((m) => m.username === 'tia').following === false, 'after following ria the page shows "Following" for her only');
check((await rpc(ria, 'team_list')).find((m) => m.username === 'ria').isMe === true, 'on her own card she is told it is her (no Follow button for yourself)');
await db.query(`insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [tia, viewer]);
check((await rpc(viewer, 'team_list')).find((m) => m.username === 'tia').blocked === true, 'a blocked pair is flagged (so no Follow button)');
await db.query(`delete from public.blocks where blocker_id = $1`, [tia]);

section('8. The administrator links someone by User ID');
const dev = (await rpc(admin, 'admin_team_save', null, 'Dev Patel', 'BCA', 'Tests it all.', 'team/dev.jpg', null)).team.find((m) => m.name === 'Dev Patel');
check(dev.userId === null && dev.username === null, 'a member added by hand has no account until one is linked');
await expectFail(() => rpc(admin, 'admin_team_save', dev.id, 'Dev Patel', 'BCA', 'Tests it all.', 'team/dev.jpg', '@nobody'), /no NOOB account with the User ID @nobody/, 'an unknown User ID is refused');
r = await rpc(admin, 'admin_team_save', dev.id, 'Dev Patel', 'BCA', 'Tests it all.', 'team/dev.jpg', ' @Sam ');
check(r.team.find((m) => m.id === dev.id).username === 'sam' && r.team.find((m) => m.id === dev.id).userId === sam, 'a User ID typed as " @Sam " finds the account');
await expectFail(() => rpc(admin, 'admin_team_save', null, 'Other', 'x', 'y', 'team/o.jpg', 'sam'), /already on the team page/, 'one account cannot be on the page twice');
await expectFail(() => rpc(admin, 'admin_team_save', null, 'Other', 'x', 'y', 'team/o.jpg', 'ria'), /already on the team page/, 'including one that joined through the form');
r = await rpc(admin, 'admin_team_save', dev.id, 'Dev Patel', 'BCA', 'Tests it all.', 'team/dev.jpg', '');
check(r.team.find((m) => m.id === dev.id).userId === null, 'clearing the User ID unlinks it');

section('9. Removing someone erases what they filled in, and only that');
const unknownId = '00000000-0000-0000-0000-000000000000';
await expectFail(() => rpc(ria, 'admin_team_delete', unknownId), /Only the main NOOB administrator/, 'an ordinary member cannot remove anyone');
await expectFail(() => rpc(ria, 'admin_team_application_erase', unknownId), /Only the main NOOB administrator/, 'nor delete a form');
await expectFail(() => rpc(admin, 'admin_team_delete', unknownId), /no longer exists/, 'removing someone who is gone');
await expectFail(() => rpc(admin, 'admin_team_application_erase', unknownId), /no longer exists/, 'deleting a form that is gone');

// 9a. from the Members list: tia joined through the form and went live at once
const tiaCard = (await rpc(viewer, 'team_list')).find((m) => m.username === 'tia');
await rpc(viewer, 'toggle_follow', tia);
await rpc(admin, 'admin_team_settings', null, null);
r = await rpc(admin, 'admin_team_delete', tiaCard.id);
check(r.success === true && !names(r.team).includes('Tia Rao'), 'tia is off the page');
check(r.removedPhotos.join() === 'team/tia.jpg', 'the answer lists her photo file once (the card and the form shared it), for the app to delete');
check((await q(`select count(*)::int n from public.team_page_applications where user_id = $1`, [tia]))[0].n === 0, 'her whole joining form is gone from the server');
mine = await rpc(tia, 'team_my_application');
check(mine.onTeam === false && mine.application === null, 'her form is empty again: nothing she filled in is kept');
check(r.admin.applications.every((a) => a.userId !== tia), 'and she is not in the administrator\'s list any more');
check((await q(`select username from public.profiles where id = $1`, [tia]))[0]?.username === 'tia', 'her NOOB account is untouched');
check((await q(`select count(*)::int n from public.follows where follower_id = $1 and followee_id = $2`, [viewer, tia]))[0].n === 1, 'and so are her followers');
check(r.team.map((m) => m.position).join() === '1,2', 'the places on the page close up (1, 2)');
r = await apply(tia, 'Tia Rao', 'BCA, MCA', 'A second try.', 'team/tia2.jpg');
mine = await rpc(tia, 'team_my_application');
check(r.status === 'pending' && mine.application.name === 'Tia Rao' && mine.application.description === 'A second try.' && mine.application.photo === 'team/tia2.jpg', 'if she applies again it starts from a clean sheet, with only the new details');

// 9b. a card added by hand has no form: only the card goes
const devCard = (await rpc(viewer, 'team_list')).find((m) => m.name === 'Dev Patel');
r = await rpc(admin, 'admin_team_delete', devCard.id);
check(names(r.team) === 'Ria S. Shah' && r.removedPhotos.join() === 'team/dev.jpg', 'a card added by hand: the card and its photo go');

// 9c. from the Applications list: a waiting one (sam), and one that is on the page (ria)
const notesBefore = async (id) => (await q(`select count(*)::int n from public.notifications where target_user_id = $1`, [id]))[0].n;
const samNotes = await notesBefore(sam), riaNotes = await notesBefore(ria);
const samWaiting = (await rpc(admin, 'admin_team_page_applications')).applications.find((a) => a.userId === sam);
r = await rpc(admin, 'admin_team_application_erase', samWaiting.id);
check(r.removedPhotos.join() === 'team/sam2.jpg' && r.admin.applications.every((a) => a.userId !== sam), 'a waiting application is deleted, with its photo file');
check((await rpc(sam, 'team_my_application')).application === null && (await notesBefore(sam)) === samNotes && (await q(`select 1 from public.profiles where id = $1`, [sam])).length === 1, 'sam\'s form is gone; his account and his notifications are not');

const riaApp = (await rpc(admin, 'admin_team_page_applications')).applications.find((a) => a.userId === ria);
check(riaApp.onTeam === true, 'ria\'s application is the one of someone on the page');
r = await rpc(admin, 'admin_team_application_erase', riaApp.id);
check(r.team.length === 0 && r.removedPhotos.join() === 'team/ria2.jpg', 'deleting it also takes her card off the page, and lists her photo file');
check((await q(`select count(*)::int n from public.team_members where user_id = $1`, [ria]))[0].n === 0 && (await q(`select count(*)::int n from public.team_page_applications where user_id = $1`, [ria]))[0].n === 0, 'nothing of hers is left in either table');
check((await q(`select 1 from public.profiles where id = $1`, [ria])).length === 1 && (await notesBefore(ria)) === riaNotes && (await q(`select count(*)::int n from public.follows where followee_id = $1`, [ria]))[0].n === 1, 'her account, notifications and follower are all still there');

// 9d. the activity log
const logText = JSON.stringify((await q(`select action, details from public.admin_audit_log where action like 'team\\_%'`)));
check(!/Ria|Tia Rao|Dev Patel|Sam Lee/.test(logText), 'none of the removed people\'s names is left in the activity log');
const removedLog = (await q(`select details, target_name from public.admin_audit_log where action = 'team_member_removed'`));
check(removedLog.length >= 4 && removedLog.every((x) => x.details.name === undefined), 'but it still records that people were removed (without saying who they were)');

section('10. Nothing is reachable directly, and everything is logged');
let direct = 0;
for (const t of ['team_settings', 'team_page_applications']) {
  try { direct += (await asUser(db, ria, async () => db.query(`select * from public.${t}`))).rows.length; } catch { /* denied is fine */ }
}
check(direct === 0, 'the new tables cannot be read directly');
let wrote = false;
try { await asUser(db, ria, async () => db.query(`update public.team_settings set auto_publish = true`)); wrote = (await q(`select auto_publish from public.team_settings`))[0].auto_publish; } catch { wrote = false; }
check(wrote === false, 'and the switches cannot be changed directly');
const acts = (await q(`select action from public.admin_audit_log where action like 'team_%'`)).map((x) => x.action);
check(['team_application_approved', 'team_application_rejected', 'team_settings_changed', 'team_member_added', 'team_member_updated', 'team_member_removed'].every((a) => acts.includes(a)), 'approvals, rejections, switch changes and member changes are in the activity log');

section('11. No function of this feature replaces an older one by accident');
const migrationsDir = 'supabase/migrations';
const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
const defs = (text) => [...text.matchAll(/create or replace function public\.(\w+)\s*\(([^)]*)\)/gi)].map((m) => ({ name: m[1], args: m[2].replace(/\s+default\s+[^,]+/gi, '').split(',').map((a) => a.trim().split(/\s+/).slice(1).join(' ').toLowerCase()).filter(Boolean).join(',') }));
const older = new Map();
for (const f of files.filter((x) => x < '20261013000001')) {
  for (const d of defs(fs.readFileSync(`${migrationsDir}/${f}`, 'utf8'))) older.set(`${d.name}(${d.args})`, f);
}
// deliberately redefined: the list the older Our Team migration made (same migration family), now with the linked account
const ourTeamFiles = files.filter((x) => x.startsWith('20261013'));
const clashes = [];
for (const f of ourTeamFiles) {
  for (const d of defs(fs.readFileSync(`${migrationsDir}/${f}`, 'utf8'))) {
    const key = `${d.name}(${d.args})`;
    if (older.has(key)) clashes.push(`${key} (also in ${older.get(key)}, again in ${f})`);
  }
}
check(clashes.length === 0, 'every function in the Our Team migrations has a name no older migration uses', clashes.join('; '));
check(/function public\.admin_team_applications\(\)/.test(fs.readFileSync(`${migrationsDir}/20260924000038_story_likes_join_requests_platform_settings.sql`, 'utf8')) && !/function public\.admin_team_applications\(\)/.test(fs.readFileSync(`${migrationsDir}/20261013000002_team_join.sql`, 'utf8')), 'and the private staff-application list (admin_team_applications) is left exactly as it was');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
