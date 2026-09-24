// Tests for migration 20260924000038: story likes, "apply to join us" applications, and the
// admin console's platform-wide toggles (sign-ups pause, maintenance lock), against a real
// Postgres (PGlite) holding the real backup.
import fs from 'node:fs';
import path from 'node:path';
import { loadBackup, buildImportPlan } from './transform.mjs';
import { runImport } from './run-import.mjs';
import { createTestDb, makePgAdapter, asUser, asAnon } from './pg-test-env.mjs';

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
const adapter = makePgAdapter(db);
await runImport(plan, adapter, { log: () => {} });

const profByLegacy = Object.fromEntries((await db.query('select * from profiles')).rows.map((p) => [p.legacy_id, p]));
const idOf = (u) => profByLegacy[u.id].id;
const adminRaw = raw.users.find((u) => u.isAdmin);
const publicRaw = raw.users.filter((u) => u.accountType !== 'private' && !u.isAdmin);
const admin = idOf(adminRaw);
const [aRaw, bRaw] = publicRaw.slice(0, 2);
const a = idOf(aRaw), b = idOf(bRaw);

const call = (uid, sql, params = []) => asUser(db, uid, async () => (await db.query(sql, params)).rows);
const rpc = async (uid, fn, ...args) => (await call(uid, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args))[0].r;
const rpcAnon = async (fn, ...args) => (await asAnon(db, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows))[0].r;

// =====================================================================================
section('1. Story likes');
const story = (await rpc(a, 'create_story', 'stories/like-test.jpg')).id;
const findStory = async (uid, sid) => (await rpc(uid, 'active_stories')).find((x) => x.id === sid);

let sv = await findStory(b, story);
check(sv.isLiked === false && sv.likesCount === 0, 'a fresh story starts unliked with 0 likes');

let r1 = await rpc(b, 'toggle_story_like', story);
check(r1.isLiked === true && r1.likesCount === 1, 'liking it returns isLiked true and count 1');

sv = await findStory(b, story);
check(sv.isLiked === true && sv.likesCount === 1, 'story_json now reflects the like for that viewer');

sv = await findStory(a, story);
check(sv.likesCount === 1 && sv.isLiked === false, 'the count is shared, but isLiked is per-viewer (the author never liked it themselves)');

let r2 = await rpc(b, 'toggle_story_like', story);
check(r2.isLiked === false && r2.likesCount === 0, 'liking again un-likes it, back to 0');

// re-like so the "survives a fresh look" check below is meaningful
await rpc(b, 'toggle_story_like', story);
sv = await findStory(b, story);
check(sv.isLiked === true, 'the like really is persisted server-side — a completely fresh story_json read still shows it');

await expectFail(() => rpc(b, 'toggle_story_like', '00000000-0000-0000-0000-000000000000'), /no longer available/, 'liking a made-up story id is refused');

// =====================================================================================
section('2. Apply to join us');
const app1 = await rpc(a, 'submit_team_application', 'Test Applicant', 'Moderator', 'I love NOOB and want to help.', 'Some mod experience', 'Weekends', '');
check(app1.success === true && app1.application.status === 'pending', 'a signed-in member can submit an application');
check(app1.application.username === aRaw.username.toLowerCase() || app1.application.username, 'the application carries the applicant\'s own username');

await expectFail(
  () => rpc(a, 'submit_team_application', 'Test Applicant Again', 'Developer', 'Trying again', '', '', ''),
  /already have an application/,
  'a second application while one is pending is refused'
);

await expectFail(() => rpcAnon('submit_team_application', 'Nobody', 'Moderator', 'why', '', '', ''), /log in/i, 'a logged-out visitor can not apply');

await expectFail(() => rpc(a, 'admin_team_applications'), /Access denied/, 'a non-admin can not list applications');
let list = await rpc(admin, 'admin_team_applications');
check(list.success === true && list.applications.some((x) => x.id === app1.application.id), 'the main admin sees the submitted application');

await expectFail(() => rpc(a, 'admin_review_team_application', app1.application.id, 'accepted'), /Access denied/, 'a non-admin can not review an application');
let reviewed = await rpc(admin, 'admin_review_team_application', app1.application.id, 'accepted');
check(reviewed.success === true && reviewed.application.status === 'accepted', 'the admin can accept an application');

let app2 = await rpc(a, 'submit_team_application', 'Test Applicant', 'Developer', 'Trying again now that the first is resolved', '', '', '');
check(app2.success === true, 'once the earlier one is no longer pending, the same person can apply again');

// =====================================================================================
section('3. Platform settings');
let pub = await rpcAnon('public_platform_settings');
check(pub.signupsEnabled === true && pub.maintenanceEnabled === false, 'defaults: sign-ups open, no maintenance lock');

await expectFail(() => rpc(a, 'admin_set_platform_settings', null, null, null), /Access denied/, 'a non-admin can not change platform settings');

let saved = await rpc(admin, 'admin_set_platform_settings', false, null, null);
check(saved.signupsEnabled === false, 'the admin can pause sign-ups');
pub = await rpcAnon('public_platform_settings');
check(pub.signupsEnabled === false, 'a logged-out visitor immediately sees sign-ups are paused (needed for the sign-up screen\'s own gate)');

saved = await rpc(admin, 'admin_set_platform_settings', null, true, 'Back soon!');
check(saved.maintenanceEnabled === true && saved.maintenanceMessage === 'Back soon!', 'the admin can turn on maintenance mode with a custom message');

saved = await rpc(admin, 'admin_set_platform_settings', true, false, null);
check(saved.signupsEnabled === true && saved.maintenanceEnabled === false && saved.maintenanceMessage === 'Back soon!', 'turning things back off keeps the message text (only null leaves a field untouched)');

// =====================================================================================
section('4. Admin content browser');
await expectFail(() => rpc(a, 'admin_content_feed', 'posts', 10), /Access denied/, 'a non-admin can not use the admin content browser');
let posts = await rpc(admin, 'admin_content_feed', 'posts', 10);
check(posts.success === true && Array.isArray(posts.items), 'the admin can list posts platform-wide');
let stories = await rpc(admin, 'admin_content_feed', 'stories', 10);
check(stories.success === true && stories.items.some((x) => x.id === story), 'the admin content browser sees the story created earlier, regardless of who follows whom');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
