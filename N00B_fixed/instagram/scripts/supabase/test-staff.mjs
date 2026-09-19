// Tests for supabase phase 5: delegated administrators (ticked permissions), the admin activity log, groups where
// only admins can send messages, admin roles in the Global Lounge, and the push-notification trigger — on a REAL
// Postgres (PGlite) holding the real backup, as real signed-in users, including every way someone might overstep.
//
// Usage: node scripts/supabase/test-staff.mjs [backup-folder]
import fs from 'node:fs';
import path from 'node:path';
import { loadBackup, buildImportPlan } from './transform.mjs';
import { runImport } from './run-import.mjs';
import { createTestDb, makePgAdapter, asUser, asAnon } from './pg-test-env.mjs';

const backupsRoot = 'backups';
const dir = process.argv.slice(2).find((x) => !x.startsWith('--')) || path.join(backupsRoot, fs.readdirSync(backupsRoot).filter((d) => fs.existsSync(path.join(backupsRoot, d, 'users.json'))).sort().pop());
const raw = loadBackup(dir);

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};
const section = (t) => console.log(`\n${t}`);

const db = await createTestDb();
await runImport(buildImportPlan(raw, {}), makePgAdapter(db), { log: () => {} });

const profByLegacy = Object.fromEntries((await db.query('select * from profiles')).rows.map((p) => [p.legacy_id, p]));
const idOf = (u) => profByLegacy[u.id].id;
const adminRaw = raw.users.find((u) => u.isAdmin);
const pool = raw.users.filter((u) => u.accountType !== 'private' && !u.isAdmin && (u.password || '').length > 0);
const [sRaw, tRaw, uRaw, vRaw, wRaw, xRaw] = pool;
const admin = idOf(adminRaw), s = idOf(sRaw), t = idOf(tRaw), u = idOf(uRaw), v = idOf(vRaw), w = idOf(wRaw), x = idOf(xRaw);
const names = Object.fromEntries((await db.query('select id, username from profiles')).rows.map((r) => [r.id, r.username]));

const call = (uid, sql, params = []) => asUser(db, uid, async () => (await db.query(sql, params)).rows);
const rpc = async (uid, fn, ...args) => (await call(uid, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args))[0].r;
const n = async (sql, params = []) => (await db.query(sql, params)).rows[0].n;
const audit = async () => (await rpc(admin, 'admin_audit_log', 500)).entries;
{
  const ids = [s, t, u, v, w, x].map((i) => `'${i}'`).join(',');
  await db.query(`delete from follows where follower_id in (${ids}) or followee_id in (${ids})`);
  await db.query(`delete from blocks where blocker_id in (${ids}) or blocked_id in (${ids})`);
  await db.query(`update profiles set is_suspended = false where id in (${ids})`);
}
const LOUNGE = (await db.query('select id from chats where is_global_default')).rows[0].id;
const msgs = async (uid, chat) => (await rpc(uid, 'chat_messages', chat)).messages;

// =====================================================================================
section('1. Groups where only admins can send messages');
const g = (await rpc(s, 'create_chat', [t, u], true, 'Announcements')).chat;
check(g.onlyAdminsCanSend === false, 'a new group lets everyone send (the setting starts off)');
check((await rpc(u, 'send_message', g.id, { text: 'hi from a member' })).message.senderId === u, 'so a member can send');
await expectFail(() => rpc(u, 'set_group_send_policy', g.id, true), /Only group admins can change this setting/, 'an ordinary member can NOT switch the setting on');
const on = await rpc(s, 'set_group_send_policy', g.id, true);
check(on.success && on.chat.onlyAdminsCanSend === true, 'the creator switches it on');
check((await msgs(t, g.id)).some((m) => m.text === '🔒 Only admins can send messages now.' && m.senderId === 'system'), 'everyone is told with a notice in the chat');
await expectFail(() => rpc(u, 'send_message', g.id, { text: 'can I talk?' }), /^Only admins can send messages$/, 'a member now gets exactly "Only admins can send messages"');
await expectFail(() => rpc(u, 'send_message', g.id, { mediaUrl: 'posts/x.jpg' }), /Only admins can send messages/, '...for pictures too');
await expectFail(() => rpc(u, 'send_message', g.id, { gameInvite: { gameId: 'x' } }), /Only admins can send messages/, '...and game invites');
check((await call(u, 'select count(*)::int n from messages where chat_id = $1 and text = $2', [g.id, 'can I talk?']))[0].n === 0, 'nothing was saved from the refused attempts');
await expectFail(() => call(u, `insert into messages (chat_id, sender_id, text) values ($1, $2, 'sneaky')`, [g.id, u]), /permission denied|row-level security/, '...and writing straight into the table is refused too');
check((await rpc(s, 'send_message', g.id, { text: 'official news' })).message.text === 'official news', 'the creator can still send');
check((await rpc(u, 'my_chats')).find((c) => c.id === g.id).onlyAdminsCanSend === true, 'members see the setting in their chat list (so the app can show the notice)');
const before = await n('select count(*)::int n from messages where chat_id = $1', [g.id]);
await rpc(s, 'set_group_send_policy', g.id, true);
check((await n('select count(*)::int n from messages where chat_id = $1', [g.id])) === before, 'switching it "on" again does not post the notice twice');
await rpc(s, 'manage_group_admin', g.id, t, 'make_admin');
check((await rpc(t, 'send_message', g.id, { text: 'from a new admin' })).message.senderId === t, 'a member promoted to admin can send');
const off = await rpc(t, 'set_group_send_policy', g.id, false);
check(off.chat.onlyAdminsCanSend === false && (await msgs(u, g.id)).some((m) => m.text === '🔓 All members can send messages now.'), 'an admin (not only the creator) can switch it off, with a notice');
check((await rpc(u, 'send_message', g.id, { text: 'thanks!' })).message.senderId === u, 'and members can send again');
await rpc(s, 'set_group_send_policy', g.id, true);
await rpc(s, 'manage_group_admin', g.id, t, 'remove_admin');
await expectFail(() => rpc(t, 'send_message', g.id, { text: 'no longer admin' }), /Only admins can send messages/, 'a dismissed admin is muted again');
const dm = (await rpc(s, 'create_chat', [t])).chat;
await expectFail(() => rpc(s, 'set_group_send_policy', dm.id, true), /Group chat not found/, 'a one-to-one chat has no such setting');
await expectFail(() => rpc(w, 'set_group_send_policy', g.id, true), /Only group admins can change this setting/, 'a stranger can not change it');
await expectFail(() => asAnon(db, () => db.query('select public.set_group_send_policy($1, true)', [g.id])), /permission denied/, 'a logged-out visitor can not');
check((await rpc(admin, 'set_group_send_policy', g.id, false)).success, 'the main NOOB admin can change it in any group');

// =====================================================================================
section('2. The Global Lounge: admin roles and the same setting');
const lg = (await rpc(u, 'my_chats')).find((c) => c.id === LOUNGE);
check(lg.onlyAdminsCanSend === false && lg.adminIds.includes(admin), 'the lounge lists the main admin as its admin');
await expectFail(() => rpc(u, 'manage_group_admin', LOUNGE, v, 'make_admin'), /Only group admins can manage admin roles/, 'an ordinary member can not make lounge admins');
const mk = await rpc(admin, 'manage_group_admin', LOUNGE, v, 'make_admin');
check(mk.success && mk.adminIds.includes(v), 'the main admin CAN make someone a Lounge admin (this used to fail with "Group chat not found")');
check((await rpc(u, 'my_chats')).find((c) => c.id === LOUNGE).adminIds.includes(v), 'and everyone sees them as an admin');
await expectFail(() => rpc(admin, 'manage_group_admin', LOUNGE, '00000000-0000-0000-0000-000000000001', 'make_admin'), /not found/, 'an unknown person is refused');
await rpc(admin, 'set_group_send_policy', LOUNGE, true);
check((await msgs(u, LOUNGE)).some((m) => m.text === '🔒 Only admins can send messages now.'), 'the Lounge can be set to admins-only, with the notice');
await expectFail(() => rpc(u, 'send_message', LOUNGE, { text: 'hello lounge' }), /Only admins can send messages/, 'ordinary members can not post in it');
check((await rpc(v, 'send_message', LOUNGE, { text: 'lounge admin here' })).message.senderId === v, 'a Lounge admin can');
check((await rpc(admin, 'send_message', LOUNGE, { text: 'main admin here' })).message.senderId === admin, 'and so can the main admin');
check((await rpc(v, 'set_group_send_policy', LOUNGE, false)).success, 'a Lounge admin may switch it back');
check((await rpc(u, 'send_message', LOUNGE, { text: 'back to normal' })).message.senderId === u, 'ordinary members can post again');
await rpc(admin, 'manage_group_admin', LOUNGE, v, 'remove_admin');
check(!(await rpc(u, 'my_chats')).find((c) => c.id === LOUNGE).adminIds.includes(v), 'admin status can be taken away again');
await expectFail(() => rpc(admin, 'manage_group_admin', LOUNGE, admin, 'remove_admin'), /Cannot remove NOOB official admin/, 'the main admin can not be demoted');
await expectFail(() => rpc(admin, 'add_group_members', LOUNGE, [u]), /already in the Global Lounge/, 'adding people to the Lounge gives a clear message (everyone is already in)');
await expectFail(() => rpc(admin, 'remove_group_member', LOUNGE, u), /can't be removed from it/, 'removing people from the Lounge gives a clear message');
check((await rpc(admin, 'update_group_details', LOUNGE, null, null, 'Official lounge (edited)')).chat.description === 'Official lounge (edited)', 'the main admin can edit the Lounge details');
await expectFail(() => rpc(u, 'update_group_details', LOUNGE, 'Hacked'), /Only group admins can modify group details/, 'an ordinary member can not');
await db.query(`update chats set description = 'Official global community group chat for all NOOB members' where id = $1`, [LOUNGE]);

// =====================================================================================
section('3. Delegated administrators — starting point');
const ALL = ['admin_users_list', 'admin_reports'];
for (const [fn, args] of [['admin_users_list', []], ['admin_reports', []], ['admin_suspend_user', [t]], ['admin_delete_user', [t]], ['admin_adjust_points', [t, 5]],
  ['admin_send_notification', ['all', 'x', 'y']], ['create_coupon', [{ title: 'X', discountPercent: 5 }]], ['create_store_product', [{ price: 5, description: 'x', media: [{ type: 'photo', url: 'p' }] }]],
  ['admin_report_action', ['00000000-0000-0000-0000-000000000001']], ['admin_delete_message', ['00000000-0000-0000-0000-000000000001']],
  ['admin_staff_list', []], ['admin_set_permissions', [t, ['suspend_accounts']]], ['admin_audit_log', []]]) {
  await expectFail(() => rpc(s, fn, ...args), /Access denied|Only the (main )?NOOB admin|privileges/, `an ordinary person is refused: ${fn}`);
}
check((await rpc(s, 'get_my_user')).adminPermissions.length === 0, 'an ordinary account has no admin permissions');
check((await rpc(admin, 'get_my_user')).adminPermissions.length === 0, '(the main admin needs none — it can do everything)');
check((await rpc(s, 'has_permission', 'suspend_accounts')) === false && (await rpc(admin, 'has_permission', 'suspend_accounts')) === true, 'asking "may I?" answers truthfully for each');

section('4. The main admin ticks permissions');
await expectFail(() => rpc(admin, 'admin_set_permissions', s, ['suspend_accounts', 'launch_missiles']), /Unknown permission: launch_missiles/, 'an invented permission is refused');
await expectFail(() => rpc(admin, 'admin_set_permissions', admin, ['suspend_accounts']), /already has full access/, 'the main admin can not be given (or limited to) a permission list');
await expectFail(() => rpc(admin, 'admin_set_permissions', '00000000-0000-0000-0000-000000000001', ['suspend_accounts']), /not found/, 'an unknown account is refused');
const giv = await rpc(admin, 'admin_set_permissions', s, ['suspend_accounts', 'suspend_accounts', 'handle_reports']);
check(giv.success && giv.staff.permissions.join() === 'handle_reports,suspend_accounts' && giv.staff.username === names[s] && giv.message.includes('2 admin permissions'), 'permissions are saved (sorted, without duplicates)');
const nt = (await rpc(s, 'my_notifications')).notifications.find((k) => k.title === '🛡️ You are now a NOOB admin');
check(nt && nt.message.includes('handle reports, suspend accounts') && nt.type === 'admin_direct', 'the person is told exactly what they were given');
check((await rpc(s, 'get_my_user')).adminPermissions.join() === 'handle_reports,suspend_accounts', 'their own record now lists the permissions (so the app can show the panel)');
check((await rpc(admin, 'admin_staff_list')).staff.length === 1 && (await rpc(admin, 'admin_staff_list')).staff[0].userId === s, 'the main admin sees who has access');
await expectFail(() => rpc(s, 'admin_staff_list'), /Only the main NOOB administrator/, 'the delegate can NOT see the staff list');
await expectFail(() => rpc(s, 'admin_set_permissions', t, ['delete_accounts']), /Only the main NOOB administrator can give or remove admin access/, 'a delegate can NOT give anyone access');
await expectFail(() => rpc(s, 'admin_set_permissions', s, ['delete_accounts', 'suspend_accounts']), /Only the main NOOB administrator/, '...nor promote themselves');
await expectFail(() => call(s, `insert into admin_grants (user_id, permissions) values ($1, array['delete_accounts'])`, [s]), /permission denied|row-level security/, '...nor write to the permissions table directly');
await expectFail(() => call(s, `update admin_grants set permissions = array['delete_accounts'] where user_id = $1`, [s]), /permission denied/, '...nor edit it');
check((await call(s, 'select user_id from admin_grants')).length === 1 && (await call(t, 'select user_id from admin_grants')).length === 0, 'people can only read their OWN permission row');

section('5. Only what was ticked works');
const pubList = await rpc(s, 'admin_users_list');
const sample = pubList.users.find((k) => k.id === t);
check(pubList.success && pubList.users.length === raw.users.length && sample.email === undefined && sample.mobileNumber === undefined && sample.dateOfBirth === undefined, 'with suspend/reports permission the accounts list works — but WITHOUT anyone\'s email, phone or birthday');
check(pubList.users.find((k) => k.id === s).isStaff === true && pubList.users.find((k) => k.id === admin).isStaff === true && pubList.users.find((k) => k.id === t).isStaff === false, 'the list marks who is an administrator');
await expectFail(() => rpc(s, 'admin_delete_user', t), /do not have permission to delete accounts/, 'delete was NOT ticked: refused');
await expectFail(() => rpc(s, 'admin_adjust_points', t, 5), /do not have permission to adjust/, 'points were NOT ticked: refused');
await expectFail(() => rpc(s, 'admin_send_notification', 'all', 'a', 'b'), /do not have permission to send notifications/, 'notifications were NOT ticked: refused');
await expectFail(() => rpc(s, 'create_coupon', { title: 'X', discountPercent: 5 }), /Only the NOOB admin account can create coupons/, 'coupons were NOT ticked: refused');
await expectFail(() => rpc(s, 'create_store_product', { price: 5, description: 'x', media: [{ type: 'photo', url: 'p' }] }), /Only the NOOB admin account can add products/, 'the store was NOT ticked: refused');
await expectFail(() => rpc(s, 'admin_delete_message', '00000000-0000-0000-0000-000000000001'), /Access denied/, 'chat moderation was NOT ticked: refused');
check((await rpc(s, 'my_coupons', true)).every((k) => k.active), '(and the coupon "manage" view shows a delegate only the normal wallet coupons)');
const sus = await rpc(s, 'admin_suspend_user', names[t], '  spamming  ', true);
check(sus.success && sus.user.isSuspended === true && sus.user.email === undefined, 'suspend WAS ticked: it works (and the answer holds no private details)');
check((await db.query('select p.is_suspended, u.banned_until is not null as banned from profiles p join auth.users u on u.id = p.id where p.id = $1', [t])).rows[0].banned === true, 'the account really is stopped');
check((await rpc(s, 'admin_suspend_user', names[t], null, false)).message.includes('unsuspended'), 'and it can be restored');
await expectFail(() => rpc(s, 'admin_suspend_user', names[admin], 'x', true), /primary NOOB administrator account cannot be suspended/, 'the main admin can not be suspended');
await expectFail(() => rpc(s, 'admin_suspend_user', names[s], 'x', true), /can't do this to your own account/, 'a delegate can not suspend themselves');
await rpc(admin, 'admin_set_permissions', v, ['suspend_accounts', 'delete_accounts', 'adjust_points']);
await expectFail(() => rpc(s, 'admin_suspend_user', names[v], 'x', true), /Only the main administrator can change another administrator/, 'a delegate can NOT suspend another administrator');
await expectFail(() => rpc(v, 'admin_delete_user', names[s]), /Only the main administrator can change another administrator/, '...nor delete one');
await expectFail(() => rpc(v, 'admin_adjust_points', s, 0, null), /Only the main administrator can change another administrator/, '...nor change their points');
check((await rpc(admin, 'admin_suspend_user', names[v], 'test', true)).success && (await rpc(admin, 'admin_suspend_user', names[v], null, false)).success, 'but the main admin can suspend and restore any delegate');
// reports need BOTH permissions to suspend
await rpc(u, 'submit_report', names[w], 'Spam', 'testing');
const rep = (await rpc(s, 'admin_reports')).reports[0];
check(!!rep && rep.targetUsername === names[w], 'with "handle reports" the delegate sees the reports');
await rpc(admin, 'admin_set_permissions', s, ['handle_reports']);
await expectFail(() => rpc(s, 'admin_report_action', rep.id, 'resolved', true), /need the "suspend accounts" permission/, 'suspending through a report needs the suspend permission as well');
check((await rpc(s, 'admin_report_action', rep.id, 'resolved', false)).report.status === 'resolved', 'but resolving it without suspending is fine');
await expectFail(() => rpc(s, 'admin_suspend_user', names[t], 'x', true), /do not have permission to suspend/, '(and with suspend un-ticked, suspending directly is refused again)');

section('6. Each other power, one at a time');
await rpc(admin, 'admin_set_permissions', s, ['view_accounts']);
const full = await rpc(s, 'admin_users_list');
const fs_ = full.users.find((k) => k.id === t);
check(fs_.email !== undefined && fs_.mobileNumber !== undefined && !JSON.stringify(full).includes('encrypted_password') && fs_.password === undefined, '"see all accounts" adds email, phone and birthday (never passwords)');
await expectFail(() => rpc(s, 'admin_suspend_user', names[t], 'x', true), /do not have permission to suspend/, '...but grants no other power');
await rpc(admin, 'admin_set_permissions', s, ['adjust_points']);
const adj = await rpc(s, 'admin_adjust_points', t, 12345, null, 'fixing a glitch');
check(adj.success && adj.user.noobPoints === 12345 && adj.user.email === undefined, '"change points" works');
await expectFail(() => rpc(s, 'admin_adjust_points', s, 999999999999, null), /can't do this to your own account/, 'a delegate can not give themselves points');
await rpc(admin, 'admin_set_permissions', s, ['send_notifications']);
check((await rpc(s, 'admin_send_notification', names[u], 'Hello', 'From a moderator')).success && (await rpc(u, 'my_notifications')).notifications.some((k) => k.title === 'Hello'), '"send notifications" works');
await rpc(admin, 'admin_set_permissions', s, ['manage_coupons']);
const cc = await rpc(s, 'create_coupon', { title: 'Staff deal', discountPercent: 15 });
check(cc.success && cc.coupon.code === 'STAFFDEAL15' && (await rpc(s, 'my_coupons', true)).some((k) => k.id === cc.coupon.id), '"coupons" lets them create and manage them');
check((await rpc(s, 'delete_coupon', cc.coupon.id)).success, '...and retire them');
await rpc(admin, 'admin_set_permissions', s, ['manage_store']);
const prod = await rpc(s, 'create_store_product', { price: 99, description: 'Staff item', media: [{ type: 'photo', url: 'products/a.jpg' }] });
check(prod.success && (await rpc(s, 'delete_store_product', prod.product.id)).success, '"store" lets them add and remove products');
await rpc(admin, 'admin_set_permissions', s, ['delete_accounts']);
const victim = idOf(xRaw);
const vName = names[victim];
const del = await rpc(s, 'admin_delete_user', vName);
check(del.success && (await n('select count(*)::int n from profiles where id = $1', [victim])) === 0 && (await n('select count(*)::int n from auth.users where id = $1', [victim])) === 0, '"delete accounts" removes the account, its login and everything they made');
await expectFail(() => rpc(s, 'admin_delete_user', names[admin]), /primary NOOB administrator account cannot be deleted/, 'but never the main admin');

section('7. Moderating content and chats');
const somePost = (await db.query(`select p.id, p.user_id from posts p join profiles a on a.id = p.user_id where a.account_type <> 'private' and p.user_id <> $1 limit 1`, [s])).rows[0];
await rpc(admin, 'admin_set_permissions', s, ['handle_reports']);
check((await call(s, 'delete from posts where id = $1 returning id', [somePost.id])).length === 0, 'without "moderate content" a delegate can NOT delete somebody else\'s post');
await rpc(admin, 'admin_set_permissions', s, ['moderate_content']);
check((await call(s, 'delete from posts where id = $1 returning id', [somePost.id])).length === 1, 'with it, they can');
const someComment = await rpc(u, 'add_comment', (await db.query('select id from posts where user_id <> $1 limit 1', [u])).rows[0].id, 'a comment to moderate').catch(() => null);
const cmt = (await db.query(`select id from comments order by created_at desc limit 1`)).rows[0];
check((await call(s, 'delete from comments where id = $1 returning id', [cmt.id])).length === 1, '...and delete comments');
await rpc(admin, 'admin_set_permissions', s, ['view_accounts']);
check((await call(s, 'delete from comments where id in (select id from comments limit 3) returning id')).length === 0, '(un-ticked again: comments are safe)');
const m1 = (await rpc(u, 'send_message', LOUNGE, { text: 'rude message' })).message;
await expectFail(() => rpc(s, 'admin_delete_message', m1.id), /Access denied/, 'without "chat moderation" a delegate can not remove chat messages');
await rpc(admin, 'admin_set_permissions', s, ['moderate_chats']);
check((await rpc(s, 'admin_delete_message', m1.id)).success && (await n('select count(*)::int n from messages where id = $1', [m1.id])) === 0, 'with it, they can remove any message');
check((await call(s, `select id from messages where chat_id in (select id from chats where not is_global_default and id not in (select chat_id from chat_members where user_id = $1)) limit 1`, [s])).length === 0, "...WITHOUT being able to read other people's private chats");

section('8. Taking access away');
await rpc(admin, 'admin_set_permissions', s, ['suspend_accounts', 'delete_accounts']);
const rm = await rpc(admin, 'admin_set_permissions', s, []);
check(rm.success && rm.staff === null && rm.message.includes('no longer has admin access'), 'the main admin removes all access with an empty list');
await expectFail(() => rpc(s, 'admin_suspend_user', names[t], 'x', true), /do not have permission to suspend/, 'the powers stop at once');
check((await rpc(s, 'get_my_user')).adminPermissions.length === 0 && (await rpc(admin, 'admin_staff_list')).staff.every((k) => k.userId !== s), 'the record and the staff list are updated');
check((await rpc(s, 'my_notifications')).notifications.some((k) => k.title === '🛡️ Admin access removed'), 'the person is told');
await rpc(admin, 'admin_set_permissions', s, ['suspend_accounts']);
await db.query('update profiles set is_suspended = true where id = $1', [s]);
await expectFail(() => rpc(s, 'admin_suspend_user', names[t], 'x', true), /Unauthorized|do not have permission|Access denied/, 'a delegate whose own account is suspended loses every power');
await db.query('update profiles set is_suspended = false where id = $1', [s]);
check((await rpc(admin, 'admin_set_permissions', w, [])).success && !(await rpc(admin, 'admin_staff_list')).staff.some((k) => k.userId === w), 'removing access from someone who never had any is harmless');
{
  await rpc(admin, 'admin_set_permissions', w, ['suspend_accounts']);
  await db.query('delete from auth.users where id = $1', [w]);
  check((await n('select count(*)::int n from admin_grants where user_id = $1', [w])) === 0, 'deleting a delegate\'s account removes their permission row too');
}

section('9. The activity log');
const log = await audit();
const acts = new Set(log.map((e) => e.action));
for (const a of ['admin_access_set', 'admin_access_removed', 'account_suspended', 'account_restored', 'account_deleted', 'points_adjusted', 'notification_sent', 'coupon_created', 'coupon_removed', 'product_added', 'product_removed', 'message_deleted', 'report_resolved']) {
  check(acts.has(a), `the log recorded: ${a}`);
}
const one = log.find((e) => e.action === 'account_suspended' && e.actor === names[s]);
check(one && one.target === names[t] && one.details.reason === 'spamming' && new Date(one.at) > new Date(Date.now() - 600000), 'each entry says who, what, to whom, when (and why)');
check(log.find((e) => e.action === 'points_adjusted').details.to === 12345 && log.find((e) => e.action === 'account_deleted').details.username === vName, 'amounts and names are kept (even for an account that no longer exists)');
check(log[0].at >= log[log.length - 1].at, 'newest first');
await expectFail(() => rpc(s, 'admin_audit_log'), /Only the main NOOB administrator/, 'a delegate can NOT read the log');
await expectFail(() => call(s, 'select * from admin_audit_log'), /permission denied/, '...nor the table');
await expectFail(() => call(admin, 'select * from admin_audit_log'), /permission denied/, '(not even the main admin\'s browser reads the table directly — only through the function)');
await expectFail(() => call(admin, `delete from admin_audit_log`), /permission denied/, 'and nobody can erase it');
await expectFail(() => asAnon(db, () => db.query('select public.admin_audit_log()')), /permission denied/, 'a logged-out visitor can not read it');

section('10. Internal helpers stay internal');
for (const [fn, args] of [['require_permission', `('suspend_accounts', 'x')`], ['log_admin_action', `('x', null, '{}'::jsonb)`], ['assert_can_act_on', `('${t}'::uuid, false)`], ['is_staff', `('${t}'::uuid)`], ['is_group_admin', `('${g.id}'::uuid, '${s}'::uuid)`], ['push_on_notification', '()']]) {
  await expectFail(() => call(u, `select public.${fn}${args}`), /permission denied|trigger/, `a browser can not call ${fn}()`);
}
await expectFail(() => call(u, 'select * from internal_config'), /permission denied/, 'the private settings table is not readable');
await expectFail(() => call(u, 'select * from recovery_attempts'), /permission denied/, '(and the recovery attempts stay private)');
await expectFail(() => call(u, `select public.recovery_check('1','x','1','2000-01-01','a@b.c')`), /permission denied/, 'the recovery check is still service-key only (this migration did not re-open it)');

// =====================================================================================
section('11. Push notifications');
const before2 = await n('select count(*)::int n from notifications');
await db.query(`select public.notify_user($1, 'system', null, 'before the web-call helper exists', 'x')`, [u]);
check((await n('select count(*)::int n from notifications')) === before2 + 1, 'a notification is created even if the web-call helper is missing or fails (push can never block it)');
await db.exec(`create schema if not exists net;
  create table public._net_calls (id serial primary key, url text, body jsonb, headers jsonb);
  create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 2000)
    returns bigint language plpgsql as $$ begin insert into public._net_calls (url, body, headers) values (url, body, headers); return 1; end; $$;`);
const nid = (await db.query(`select public.notify_user($1, 'new_follower', $2, 'started following you.', 'x') id`, [u, t])).rows[0].id;
const calls = (await db.query('select * from _net_calls order by id')).rows;
const secret = (await db.query(`select value from internal_config where key = 'push_secret'`)).rows[0].value;
check(calls.length === 1 && calls[0].url === 'https://abffssydapumuhwgzeck.supabase.co/functions/v1/dynamic-handler' && calls[0].body.action === 'push' && calls[0].body.notificationId === nid, 'every new notification asks the push function to deliver it (with its id)');
check(calls[0].headers['x-noob-push'] === secret && secret.length >= 48 && /^[0-9a-f]+$/.test(secret), 'the request carries a private password only the database and the function know (random, 64 hex characters)');
await rpc(admin, 'admin_send_notification', 'all', 'Broadcast', 'to everyone');
check((await n('select count(*)::int n from _net_calls')) === 2, 'a broadcast to everyone triggers one push request too (the function fans it out)');
check((await n(`select count(*)::int n from notifications where push_sent_at is not null`)) === 0, '(nothing is marked as pushed until the function actually delivers it)');
check((await rpc(u, 'get_vapid_public_key')).startsWith('BJD8vr') && (await rpc(u, 'get_vapid_public_key')).length === 87, 'the app\'s public push key is available to every signed-in person');
await expectFail(() => asAnon(db, () => db.query('select public.get_vapid_public_key()')), /permission denied/, '(but not to logged-out visitors)');
await expectFail(() => call(u, 'update notifications set push_sent_at = null'), /permission denied/, 'nobody can tamper with the "already pushed" marker');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
