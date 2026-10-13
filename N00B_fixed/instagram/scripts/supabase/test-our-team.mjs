// Tests migration 20261013000001: the "Our Team" page. The main NOOB administrator adds, edits, reorders and removes team members
// (name, qualification, photo, description); every signed-in person can read the list, nobody else can change it. On a REAL Postgres (PGlite)
// with every migration applied.
//
// Usage: node scripts/supabase/test-our-team.mjs
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
const names = (team) => team.map((m) => m.name).join(',');

const admin = await mkUser('noob', { is_admin: true });
const ann = await mkUser('ann');

section('1. An empty page');
check(Array.isArray(await rpc(ann, 'team_list')) && (await rpc(ann, 'team_list')).length === 0, 'before anyone is added the list is empty (an array, not null)');

section('2. Only the main administrator changes the page');
await expectFail(() => rpc(ann, 'admin_team_save', null, 'Eve', 'B.Tech', 'Builds things', 'team/a.jpg'), /Only the main NOOB administrator/, 'an ordinary member cannot add a member');
await expectFail(() => rpc(ann, 'admin_team_delete', '00000000-0000-0000-0000-000000000000'), /Only the main NOOB administrator/, 'nor remove one');
await expectFail(() => rpc(ann, 'admin_team_move', '00000000-0000-0000-0000-000000000000', 'up'), /Only the main NOOB administrator/, 'nor reorder');
let denied = 0;
for (const fn of ['team_list', 'admin_team_save']) {
  try { await asAnon(db, async () => db.query(fn === 'team_list' ? `select public.team_list()` : `select public.admin_team_save(null, 'x', '', '', null)`)); } catch (e) { if (/permission denied/.test(e.message)) denied++; }
}
check(denied === 2, 'someone not signed in can neither read nor change the list');
let direct = 0;
try { direct = (await asUser(db, ann, async () => db.query(`select * from public.team_members`))).rows.length; } catch { direct = 0; }
check(direct === 0, 'the table itself cannot be read directly (only through the functions)');
let directWrite = false;
try { await asUser(db, ann, async () => db.query(`insert into public.team_members (name) values ('Sneaky')`)); } catch { directWrite = true; }
check(directWrite, 'and cannot be written to directly');

section('3. Adding members');
let r = await rpc(admin, 'admin_team_save', null, '  Asha Rao ', ' B.Tech, Computer Science ', ' Leads the app. ', 'team/asha.jpg');
check(r.success === true && r.team.length === 1 && r.id === r.team[0].id, 'the first member is added and the fresh list comes back');
check(r.team[0].name === 'Asha Rao' && r.team[0].qualification === 'B.Tech, Computer Science' && r.team[0].description === 'Leads the app.' && r.team[0].photo === 'team/asha.jpg', 'name, qualification, description and photo are saved (spaces trimmed)');
r = await rpc(admin, 'admin_team_save', null, 'Ben Roy', 'MBA', 'Looks after the community.', 'team/ben.jpg');
r = await rpc(admin, 'admin_team_save', null, 'Chitra Nair', 'M.Des', 'Designs everything you see.', null);
check(names(r.team) === 'Asha Rao,Ben Roy,Chitra Nair' && r.team.map((m) => m.position).join() === '1,2,3', 'new members go to the end, in order');
check(r.team[2].photo === null, 'a member can exist without a photo yet (the page shows their initials)');
const seen = await rpc(ann, 'team_list');
check(names(seen) === 'Asha Rao,Ben Roy,Chitra Nair', 'every signed-in person sees the same list');

section('4. What is refused');
await expectFail(() => rpc(admin, 'admin_team_save', null, '   ', 'x', 'y', null), /write the name/, 'a name is required');
await expectFail(() => rpc(admin, 'admin_team_save', null, 'N'.repeat(81), 'x', 'y', null), /at most 80/, 'a name over 80 characters');
await expectFail(() => rpc(admin, 'admin_team_save', null, 'Dev', 'Q'.repeat(161), 'y', null), /at most 160/, 'a qualification over 160 characters');
await expectFail(() => rpc(admin, 'admin_team_save', null, 'Dev', 'x', 'D'.repeat(1201), null), /at most 1200/, 'a description over 1200 characters');
await expectFail(() => rpc(admin, 'admin_team_save', null, 'Dev', 'x', 'y', 'data:image/png;base64,AAAA'), /upload the photo as a file/, 'a picture cannot be stored inside the database');
await expectFail(() => rpc(admin, 'admin_team_save', '00000000-0000-0000-0000-000000000000', 'Dev', 'x', 'y', null), /no longer exists/, 'editing a member that is gone');
check((await rpc(ann, 'team_list')).length === 3, 'nothing was added by the refused attempts');

section('5. Editing');
const ben = (await rpc(ann, 'team_list'))[1];
r = await rpc(admin, 'admin_team_save', ben.id, 'Ben Roy', 'MBA, Marketing', 'Looks after the community and the brand.', 'team/ben2.jpg');
const ben2 = r.team.find((m) => m.id === ben.id);
check(ben2.qualification === 'MBA, Marketing' && ben2.photo === 'team/ben2.jpg' && ben2.position === ben.position && r.team.length === 3, 'an edit changes the details, keeps the place, adds nobody');
r = await rpc(admin, 'admin_team_save', ben.id, 'Ben Roy', 'MBA, Marketing', 'Looks after the community and the brand.', '');
check(r.team.find((m) => m.id === ben.id).photo === null, 'clearing the photo works');

section('6. Reordering');
let team = await rpc(ann, 'team_list');
r = await rpc(admin, 'admin_team_move', team[2].id, 'up');
check(names(r.team) === 'Asha Rao,Chitra Nair,Ben Roy', 'Chitra moves up one place');
r = await rpc(admin, 'admin_team_move', team[0].id, 'down');
check(names(r.team) === 'Chitra Nair,Asha Rao,Ben Roy' && r.team.map((m) => m.position).join() === '1,2,3', 'Asha moves down one place; the positions stay 1, 2, 3');
r = await rpc(admin, 'admin_team_move', r.team[0].id, 'up');
check(names(r.team) === 'Chitra Nair,Asha Rao,Ben Roy', 'moving the first member up changes nothing (and is not an error)');
r = await rpc(admin, 'admin_team_move', r.team[2].id, 'down');
check(names(r.team) === 'Chitra Nair,Asha Rao,Ben Roy', 'nor moving the last one down');
await expectFail(() => rpc(admin, 'admin_team_move', team[0].id, 'sideways'), /up or down/, 'any other direction is refused');
await expectFail(() => rpc(admin, 'admin_team_move', '00000000-0000-0000-0000-000000000000', 'up'), /no longer exists/, 'a member that is gone');

section('7. Removing');
team = await rpc(ann, 'team_list');
r = await rpc(admin, 'admin_team_delete', team[0].id);
check(names(r.team) === 'Asha Rao,Ben Roy' && r.team.map((m) => m.position).join() === '1,2', 'Chitra is removed; the places close up (1, 2)');
check(Array.isArray(r.removedPhotos) && r.removedPhotos.length === 0, 'the answer says which photo files were removed (none here)');
r = await rpc(admin, 'admin_team_delete', team[1].id);
check(r.removedPhotos.join() === 'team/asha.jpg' && names(r.team) === 'Ben Roy', 'removing Asha reports her photo file so the app can delete it');
await expectFail(() => rpc(admin, 'admin_team_delete', team[1].id), /no longer exists/, 'removing someone twice is refused');
r = await rpc(admin, 'admin_team_save', null, 'Dev Patel', 'BCA', 'Tests it all.', 'team/dev.jpg');
check(r.team.map((m) => m.position).join() === '1,2', 'a member added after a removal still lands at the end (places 1, 2)', r.team.map((m) => m.position).join());
check(names(r.team) === 'Ben Roy,Dev Patel', 'in the right order');

section('8. The activity log and the upload folder');
const acts = (await db.query(`select action, details from public.admin_audit_log where action like 'team_member_%' order by created_at`)).rows;
check(['team_member_added', 'team_member_updated', 'team_member_moved', 'team_member_removed'].every((a) => acts.some((x) => x.action === a)), 'adding, editing, moving and removing are all in the admin activity log');
check(acts.some((x) => x.action === 'team_member_added' && x.details?.name === 'Ben Roy'), 'with the member\'s name (for people still on the page)');
check(!JSON.stringify(acts).includes('Asha Rao') && !JSON.stringify(acts).includes('Chitra Nair'), 'and the names of the two who were removed are gone from the log');
const sql = fs.readFileSync('supabase/migrations/20261013000001_our_team.sql', 'utf8');
check(/\(storage\.foldername\(name\)\)\[1\] in[\s\S]*'songs', 'team'\)/.test(sql), 'the "team" folder is one people may upload photos into');
check(/'posts', 'reels', 'stories', 'avatars', 'music', 'covers', 'stickers', 'products', 'chat', 'instants', 'comments', 'videos', 'daily', 'songs'/.test(sql), 'and every folder that was allowed before still is');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
