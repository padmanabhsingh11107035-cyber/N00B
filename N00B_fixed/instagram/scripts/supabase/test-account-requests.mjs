// Tests for migration 20260928000001: @NOOB and @padmanabh can see everyone's posts/reels/stories no matter
// privacy, a delegate's suspend/delete now files a request only the main admin can approve or reject, and
// deleting an account (one, or several selected together) needs the main admin's own password.
import fs from 'node:fs';
import path from 'node:path';
import { loadBackup, buildImportPlan } from './transform.mjs';
import { runImport } from './run-import.mjs';
import { createTestDb, makePgAdapter, asUser, asAnon } from './pg-test-env.mjs';

const backupsRoot = 'backups';
const dir = process.argv.slice(2).find((a) => !a.startsWith('--')) || path.join(backupsRoot, fs.readdirSync(backupsRoot).filter((d) => fs.existsSync(path.join(backupsRoot, d, 'users.json'))).sort().pop());
const raw = loadBackup(dir);

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};

const db = await createTestDb();
await runImport(buildImportPlan(raw, {}), makePgAdapter(db), { log: () => {} });
const profByLegacy = Object.fromEntries((await db.query('select * from profiles')).rows.map((p) => [p.legacy_id, p]));
const idOf = (u) => profByLegacy[u.id].id;
const admin = idOf(raw.users.find((u) => u.isAdmin));
// keep clear of the real @NOOB / @padmanabh rows so "an ordinary stranger" tests actually use one
const pool = raw.users.filter((u) => u.accountType !== 'private' && !u.isAdmin && !['noob', 'padmanabh'].includes(u.username.toLowerCase()));
const [aRaw, bRaw, delegateRaw, delegate2Raw] = pool;
const a = idOf(aRaw), b = idOf(bRaw), delegate = idOf(delegateRaw), delegate2 = idOf(delegate2Raw);
const realPadmanabhRow = (await db.query(`select id from profiles where lower(username) = 'padmanabh'`)).rows[0];
const padmanabh = realPadmanabhRow ? realPadmanabhRow.id : null;
if (padmanabh) await db.query('update profiles set is_suspended = false where id = $1', [padmanabh]);

const call = (uid, sql, params = []) => asUser(db, uid, async () => (await db.query(sql, params)).rows);
const rpc = async (uid, fn, ...args) => (await call(uid, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args))[0].r;
const rpcAnon = async (fn, ...args) => (await asAnon(db, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows))[0].r;
const n = async (sql, params = []) => (await db.query(sql, params)).rows[0].n;

// =====================================================================================
console.log('\n1. The two super viewers (@NOOB and @padmanabh) see everyone, privacy or not');
await db.query(`update profiles set account_type = 'private' where id = $1`, [a]);
await db.query('delete from follows where follower_id = any($1) or followee_id = any($1)', [[a, b, delegate].concat(padmanabh ? [padmanabh] : [])]);
await db.query('delete from blocks where blocker_id = any($1) or blocked_id = any($1)', [[a, b].concat(padmanabh ? [padmanabh] : [])]);
const post = (await rpc(a, 'create_post', [{ mediaUrl: 'posts/priv-1.jpg', mediaType: 'image' }], 'private post', 'tech', [], null, null));
await expectFail(() => rpc(b, 'post_by_id', post.id), /cannot see this post/, 'a stranger can not see a private account\'s post');
check((await rpc(admin, 'post_by_id', post.id)).id === post.id, '@NOOB (the main admin) can, regardless');
await expectFail(() => rpc(delegate, 'is_super_viewer'), /permission denied|does not exist/, '(is_super_viewer is internal-only — no direct RPC)');
await expectFail(() => rpc(delegate, 'post_by_id', post.id), /cannot see this post/, 'nobody else gets this — a third random account still can not see it');
await expectFail(() => rpcAnon('post_by_id', post.id), /cannot see this post/, 'nor a logged-out visitor fetching it by id (this used to slip through — see the fix below)');

if (padmanabh) {
  check((await rpc(padmanabh, 'post_by_id', post.id)).id === post.id, '@padmanabh can see it too — the second super viewer');
  // even blocking a super viewer does not hide content from them (mirrors the existing @NOOB behaviour)
  await db.query('insert into blocks (blocker_id, blocked_id) values ($1, $2)', [a, padmanabh]);
  check((await rpc(padmanabh, 'post_by_id', post.id)).id === post.id, 'blocking @padmanabh does not hide the post from them either');
  await db.query('delete from blocks where blocker_id = $1 and blocked_id = $2', [a, padmanabh]);
} else {
  console.log('  (skipped: this backup has no @padmanabh account to test against)');
}
await db.query(`update profiles set account_type = 'public' where id = $1`, [a]);

// =====================================================================================
console.log('\n2. A delegate files a request; the queue is main-admin-only');
await rpc(admin, 'admin_set_permissions', delegate, ['suspend_accounts', 'delete_accounts']);
await db.query(`update profiles set is_suspended = false where id = $1`, [b]);

const susReq = await rpc(delegate, 'admin_suspend_user', bRaw.username, 'harassment', true);
check(susReq.success && susReq.pending === true, 'a delegate\'s suspend tap files a request instead of acting');
check((await n('select count(*)::int n from profiles where id = $1 and is_suspended', [b])) === 0, 'nothing happened to the account yet');
await expectFail(() => rpc(delegate, 'admin_suspend_user', bRaw.username, 'again', true), /already waiting/, 'filing the exact same request twice is refused, not duplicated');
await expectFail(() => rpc(delegate, 'admin_action_requests_list'), /Only the main NOOB administrator/, 'a delegate can not see the approval queue');
await expectFail(() => rpc(delegate, 'admin_resolve_action_request', '00000000-0000-0000-0000-000000000000', true), /Only the main NOOB administrator/, '...nor resolve anything, even with every other permission ticked');
await expectFail(() => call(delegate, 'select * from public.account_action_requests'), /permission denied/, '...nor read the table directly');
await expectFail(() => rpcAnon('admin_action_requests_list'), /Only the main NOOB administrator|permission denied/, 'nor a logged-out visitor');

let queue = await rpc(admin, 'admin_action_requests_list');
let row = queue.requests.find((r) => r.id && r.target.id === b && r.status === 'pending' && r.action === 'suspend');
check(!!row && row.reason === 'harassment' && row.requestedBy.id === delegate, 'the main admin sees the request, its reason, and who asked');

console.log('\n3. Approving does the work; rejecting leaves the account untouched and tells the delegate');
const resolved = await rpc(admin, 'admin_resolve_action_request', row.id, true);
check(resolved.success && resolved.user.isSuspended === true, 'approving actually suspends the account');
check((await n('select count(*)::int n from auth.users where id = $1 and banned_until is not null', [b])) === 1, 'and really locks them out');
await expectFail(() => rpc(admin, 'admin_resolve_action_request', row.id, true), /already resolved/, 'the same request can not be resolved twice');

const restoreReq = await rpc(delegate, 'admin_suspend_user', bRaw.username, null, false);
check(restoreReq.pending === true, 'restoring is also just a request');
row = (await rpc(admin, 'admin_action_requests_list')).requests.find((r) => r.target.id === b && r.action === 'unsuspend' && r.status === 'pending');
const declined = await rpc(admin, 'admin_resolve_action_request', row.id, false);
check(declined.success, 'the main admin can reject instead');
check((await n('select count(*)::int n from profiles where id = $1 and is_suspended', [b])) === 1, 'rejecting a restore leaves the account exactly as it was (still suspended)');
check((await n(`select count(*)::int n from notifications where type = 'admin_direct' and target_user_id = $1 and message ilike '%declined%'`, [delegate])) === 1, 'and the delegate is told it was declined');
await expectFail(() => rpc(admin, 'admin_resolve_action_request', row.id, false), /already resolved/, 'a rejected request stays resolved too');

// clean up: the main admin restores the account directly (their own actions still act at once)
const directRestore = await rpc(admin, 'admin_suspend_user', bRaw.username, null, false);
check(directRestore.success && !directRestore.pending, 'the main admin\'s own tap still acts immediately, no request involved');

// =====================================================================================
console.log('\n4. Delete needs the main admin\'s own password — nothing else does');
await db.query(`update auth.users set encrypted_password = extensions.crypt('correct horse battery staple', extensions.gen_salt('bf')) where id = $1`, [admin]);

const delReq = await rpc(delegate, 'admin_delete_user', bRaw.username);
check(delReq.success && delReq.pending === true, 'a delegate\'s delete tap files a request too — no password asked of THEM');
row = (await rpc(admin, 'admin_action_requests_list')).requests.find((r) => r.target.id === b && r.action === 'delete' && r.status === 'pending');
await expectFail(() => rpc(admin, 'admin_resolve_action_request', row.id, true), /Incorrect password/, 'approving a delete without a password is refused');
await expectFail(() => rpc(admin, 'admin_resolve_action_request', row.id, true, 'totally-wrong'), /Incorrect password/, '...and a wrong one too');
check((await n('select count(*)::int n from profiles where id = $1', [b])) === 1, 'so the account survives both attempts');
const delOk = await rpc(admin, 'admin_resolve_action_request', row.id, true, 'correct horse battery staple');
check(delOk.success && (await n('select count(*)::int n from profiles where id = $1', [b])) === 0, 'the right password approves the delete for real');

console.log('\n5. Selecting several accounts and deleting them together — one password, once');
const victims = pool.slice(4, 7).map((u) => idOf(u));
await expectFail(() => rpc(admin, 'admin_bulk_delete_users', victims, 'nope'), /Incorrect password/, 'the wrong password refuses the whole batch');
check((await n(`select count(*)::int n from profiles where id = any($1)`, [victims])) === victims.length, 'and nobody in it was touched');
await expectFail(() => rpc(delegate, 'admin_bulk_delete_users', victims, 'correct horse battery staple'), /Only the main NOOB administrator/, 'bulk delete is main-admin only, even for a delegate who can delete one at a time');
const bulk = await rpc(admin, 'admin_bulk_delete_users', [...victims, admin], 'correct horse battery staple');
check(bulk.success && bulk.deletedCount === victims.length, 'the main admin is silently skipped, not deleted, if selected by mistake');
check((await n(`select count(*)::int n from profiles where id = any($1)`, [victims])) === 0, 'every selected (non-protected) account is gone');
check((await n('select count(*)::int n from profiles where id = $1', [admin])) === 1, '...and the main admin themself always survives');
await expectFail(() => rpc(admin, 'admin_bulk_delete_users', [], 'correct horse battery staple'), /Choose at least one/, 'an empty selection is refused');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
