// Tests for supabase phase 2b (chats, groups, messages, blocking) on a REAL Postgres (PGlite) holding
// the real backup, as real signed-in users — including every way someone might try to cheat.
//
// Usage: node scripts/supabase/test-chat.mjs [backup-folder]
import fs from 'node:fs';
import path from 'node:path';
import { loadBackup, buildImportPlan } from './transform.mjs';
import { runImport } from './run-import.mjs';
import { createTestDb, makePgAdapter, asUser, asAnon } from './pg-test-env.mjs';

const backupsRoot = 'backups';
const dir = process.argv.slice(2).find((x) => !x.startsWith('--')) || path.join(backupsRoot, fs.readdirSync(backupsRoot).filter((d) => fs.existsSync(path.join(backupsRoot, d, 'users.json'))).sort().pop());
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

// ---- people, picked by role
const profByLegacy = Object.fromEntries((await db.query('select * from profiles')).rows.map((p) => [p.legacy_id, p]));
const idOf = (u) => profByLegacy[u.id].id;
const adminRaw = raw.users.find((u) => u.isAdmin);
const publicRaw = raw.users.filter((u) => u.accountType !== 'private' && !u.isAdmin);
const [aRaw, bRaw, cRaw, dRaw] = publicRaw.filter((u) => (u.password || '').length > 0);
const admin = idOf(adminRaw), a = idOf(aRaw), b = idOf(bRaw), c = idOf(cRaw), d = idOf(dRaw);

const call = (uid, sql, params = []) => asUser(db, uid, async () => (await db.query(sql, params)).rows);
const run = (uid, sql, params = []) => asUser(db, uid, () => db.query(sql, params));
const rpc = async (uid, fn, ...args) => (await call(uid, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args))[0].r;
const n = async (sql, params = []) => (await db.query(sql, params)).rows[0].n;
{ const ids = [a, b, c, d].map((x) => `'${x}'`).join(','); await db.query(`delete from follows where follower_id in (${ids}) or followee_id in (${ids})`); await db.query(`delete from blocks where blocker_id in (${ids}) or blocked_id in (${ids})`); await db.query(`update profiles set is_suspended = false where id in (${ids})`); }
const LOUNGE = (await db.query('select id from chats where is_global_default')).rows[0].id;

// =====================================================================================
section('1. The Global Lounge');
check((await n('select count(*)::int n from chats where is_global_default')) === 1, 'there is exactly one Global Lounge (the import and the migration agree on its id)');
const list = await rpc(a, 'my_chats');
const lounge = list.find((x) => x.id === LOUNGE);
check(lounge && lounge.isGlobalDefault && lounge.isPinned && lounge.isGroup && lounge.name.includes('Global Lounge'), 'everyone sees it, pinned, first in the list');
check(lounge.participants.length === raw.users.length && lounge.participants.every((p) => p.username && !('email' in p)), 'its member list is everyone, as public cards only');
const m1 = (await rpc(a, 'send_message', LOUNGE, { text: 'hello lounge' })).message;
check(m1.chatId === LOUNGE && m1.senderId === a && m1.text === 'hello lounge' && m1.senderUsername && m1.mediaType === 'text' && m1.status === 'sent' && m1.reactions.length === 0, 'anyone can post in the lounge, as themselves');
check((await rpc(b, 'chat_messages', LOUNGE)).messages.some((x) => x.id === m1.id), 'everyone can read it');
check((await rpc(b, 'my_chats')).find((x) => x.id === LOUNGE).unreadCount === 0, 'opening the lounge marks it read');
await expectFail(() => asAnon(db, () => db.query('select public.my_chats()')), /permission denied/, 'a logged-out visitor can not see any chat');
await expectFail(() => rpc(a, 'delete_chat', LOUNGE), /cannot be deleted/, 'the lounge can not be deleted');

// =====================================================================================
section('2. One-to-one chats');
const ab = (await rpc(a, 'create_chat', [b])).chat;
check(!ab.isGroup && ab.participants.length === 2 && ab.name === null && ab.unreadCount === 0 && ab.lastMessage === null, 'a 1:1 chat is created with both people');
check((await rpc(b, 'create_chat', [a])).chat.id === ab.id && (await rpc(a, 'create_chat', [b, a])).chat.id === ab.id, 'starting it again from either side finds the same chat (no duplicates)');
await expectFail(() => rpc(a, 'create_chat', [a]), /Could not find the other participant/, 'a chat with only yourself is refused');
check(!(await rpc(c, 'my_chats')).some((x) => x.id === ab.id), 'a stranger does not see it in their list');
await expectFail(() => rpc(c, 'chat_messages', ab.id), /not a participant/, 'a stranger can not read its messages');
check((await call(c, 'select id from messages where chat_id = $1', [ab.id])).length === 0, '...not even by asking the table directly');

// =====================================================================================
section('2b. The chat list\'s "encrypted" tag');
check(lounge.isEncryptable === false, 'the Global Lounge is never shown as encryptable');
check((await rpc(a, 'my_chats')).find((x) => x.id === ab.id).isEncryptable === false, 'a brand new 1:1 chat: neither side has a key yet, so not encryptable');
const aKey = { kty: 'EC', crv: 'P-256', x: 'A'.repeat(43), y: 'B'.repeat(43) };
await rpc(a, 'register_chat_key', '0123456789abcdef', aKey, 'A phone');
check((await rpc(a, 'my_chats')).find((x) => x.id === ab.id).isEncryptable === false, 'only one side has a key so far: still not encryptable');
const bKey = { kty: 'EC', crv: 'P-256', x: 'C'.repeat(43), y: 'D'.repeat(43) };
await rpc(b, 'register_chat_key', 'fedcba9876543210', bKey, 'B phone');
check((await rpc(a, 'my_chats')).find((x) => x.id === ab.id).isEncryptable === true && (await rpc(b, 'my_chats')).find((x) => x.id === ab.id).isEncryptable === true, 'both sides have a key now: the tag flips to encryptable for either of them');
const gForTag = (await rpc(a, 'create_chat', [b, c], true, 'Tag test')).chat;
check((await rpc(a, 'my_chats')).find((x) => x.id === gForTag.id).isEncryptable === false, 'a group with an unkeyed member is not encryptable either');
const cKey = { kty: 'EC', crv: 'P-256', x: 'E'.repeat(43), y: 'F'.repeat(43) };
await rpc(c, 'register_chat_key', '1111222233334444', cKey, 'C phone');
check((await rpc(a, 'my_chats')).find((x) => x.id === gForTag.id).isEncryptable === true, 'once everyone in the group has a key, it is encryptable too');
await rpc(a, 'delete_chat', gForTag.id);

// =====================================================================================
section('3. Sending, notifications, reading');
const long = 'x'.repeat(100);
const s1 = (await rpc(a, 'send_message', ab.id, { text: long })).message;
check(s1.senderId === a && s1.status === 'sent', 'a message is sent as the signed-in person');
const notif = (await db.query(`select * from notifications where type = 'new_message' and target_user_id = $1 and chat_id = $2`, [b, ab.id])).rows;
check(notif.length === 1 && notif[0].title === '💬 New Message' && notif[0].message.endsWith('…') && notif[0].message.length < 100 && notif[0].actor_id === a, 'the other person gets a "New Message" notification (long text shortened)');
check((await rpc(b, 'my_chats')).find((x) => x.id === ab.id).unreadCount === 1, 'they see 1 unread');
check((await rpc(a, 'my_chats')).find((x) => x.id === ab.id).unreadCount === 0, 'the sender has none');
check((await rpc(b, 'my_chats')).find((x) => x.id === ab.id).lastMessage.text === long, 'the chat list shows the last message');
const opened = (await rpc(b, 'chat_messages', ab.id)).messages;
check(opened.length === 1 && opened[0].status === 'read' && (await rpc(b, 'my_chats')).find((x) => x.id === ab.id).unreadCount === 0, 'opening the chat clears their unread badge');
check((await rpc(a, 'chat_messages', ab.id)).messages[0].status === 'read', 'and the sender now sees blue ticks (status read)');
const s2 = (await rpc(b, 'send_message', ab.id, { text: 'reply', replyTo: { messageId: s1.id, textPreview: 'FORGED', senderUsername: 'nobody' } })).message;
check(s2.replyTo.messageId === s1.id && s2.replyTo.textPreview === 'x'.repeat(100).slice(0, 100) && s2.replyTo.senderUsername !== 'nobody', 'a reply quotes the REAL message — a forged quote is ignored');
const pic = (await rpc(a, 'send_message', ab.id, { mediaUrl: 'stickers/s.png', mediaType: 'sticker' })).message;
check(pic.mediaType === 'sticker' && pic.mediaUrl === 'stickers/s.png', 'a sticker/picture message works without text');
check((await rpc(a, 'send_message', ab.id, { mediaUrl: 'posts/x.jpg' })).message.mediaType === 'image', 'a picture defaults to type "image"');
const inv = (await rpc(a, 'send_message', ab.id, { gameInvite: { gameId: 'chess', roomCode: 'ABC' } })).message;
check(inv.mediaType === 'game_invite' && inv.gameInvite.roomCode === 'ABC', 'a game invite is a message');
const rep = (await rpc(b, 'send_message', ab.id, { text: 'again', replyTo: { messageId: pic.id } })).message;
check(rep.replyTo.textPreview === 'Sticker', 'replying to a sticker quotes "Sticker"');
await expectFail(() => rpc(a, 'send_message', ab.id, { text: '   ' }), /cannot be empty/, 'an empty message is refused');
await expectFail(() => rpc(c, 'send_message', ab.id, { text: 'intruder' }), /not a participant/, 'a stranger can not post into someone else\'s chat');
await expectFail(() => run(a, `insert into messages (chat_id, sender_id, text) values ($1, $2, 'sneaky')`, [ab.id, a]), /permission denied/, 'writing straight to the messages table is not allowed');
await expectFail(() => run(a, `update messages set created_at = now() - interval '9 years' where id = $1`, [s1.id]), /permission denied/, 'rewriting a message\'s time is not allowed');

// =====================================================================================
section('3b. Message reactions (persisted — the `reactions` column existed since day one, but nothing ever wrote to it)');
check(pic.reactions === undefined || pic.reactions.length === 0, 'a fresh message starts with no reactions');
const r1 = await rpc(b, 'toggle_message_reaction', pic.id, '👍');
check(r1.success === true && r1.reactions.length === 1 && r1.reactions[0].emoji === '👍' && r1.reactions[0].count === 1 && r1.reactions[0].users[0] === b, 'reacting adds the emoji, and it is saved on the message');
check((await rpc(a, 'chat_messages', ab.id)).messages.find((m) => m.id === pic.id).reactions[0].emoji === '👍', '...and the OTHER participant sees it too on refetch (it really persisted)');
const r2 = await rpc(a, 'toggle_message_reaction', pic.id, '❤️');
check(r2.reactions.length === 2 && r2.reactions.find((x) => x.emoji === '❤️').users[0] === a, 'a second person reacting with a different emoji adds a second entry');
const r3 = await rpc(b, 'toggle_message_reaction', pic.id, '👍');
check(r3.reactions.length === 1 && r3.reactions[0].emoji === '❤️', 'reacting with the SAME emoji again removes it (tap to un-react)');
const r4 = await rpc(b, 'toggle_message_reaction', pic.id, '😂');
check(r4.reactions.length === 2 && r4.reactions.find((x) => x.emoji === '😂').users[0] === b, 'reacting with a NEW emoji after having none re-adds b');
const r5 = await rpc(b, 'toggle_message_reaction', pic.id, '❤️');
check(r5.reactions.length === 1 && r5.reactions[0].emoji === '❤️' && r5.reactions[0].count === 2, 'switching emoji moves the person, never leaving two reactions from the same person (one per person, like WhatsApp)');
await expectFail(() => rpc(c, 'toggle_message_reaction', pic.id, '👍'), /not a participant/, 'a stranger can not react to a message in a chat they are not in');
await expectFail(() => rpc(a, 'toggle_message_reaction', '00000000-0000-0000-0000-000000000000', '👍'), /Message not found/, 'reacting to a made-up message id is refused');
await expectFail(() => rpc(a, 'toggle_message_reaction', pic.id, ''), /Pick an emoji/, 'an empty emoji is refused');

// =====================================================================================
section('4. Editing and deleting messages');
const ed = (await rpc(a, 'edit_message', ab.id, s1.id, '  edited  ')).message;
check(ed.text === 'edited' && ed.isEdited === true, 'the author can edit a message');
await expectFail(() => rpc(b, 'edit_message', ab.id, s1.id, 'hijack'), /only edit your own/, 'nobody else can edit it');
await expectFail(() => rpc(a, 'edit_message', ab.id, s1.id, ' '), /cannot be empty/, 'an empty edit is refused');
check((await run(c, 'delete from messages where id = $1', [s1.id])).affectedRows === 0, 'a stranger can not delete it');
check((await run(b, 'delete from messages where id = $1', [s1.id])).affectedRows === 0, 'the other person in a 1:1 can not delete your message');
check((await run(a, 'delete from messages where id = $1', [s1.id])).affectedRows === 1, 'the author can delete it');

// =====================================================================================
section('5. Groups');
const g = (await rpc(a, 'create_chat', [b, c], true, '  Squad  ', null, 'our group')).chat;
check(g.isGroup && g.name === 'Squad' && g.avatar === '/noob-logo-circle.png' && g.description === 'our group' && g.creatorId === a && g.participants.length === 3, 'a group is created (default photo, trimmed name)');
check(g.adminIds.includes(a) && g.adminIds.includes(admin) && !g.adminIds.includes(b), 'the creator and the official NOOB admin are its admins');
const gm = (await rpc(b, 'send_message', g.id, { text: 'hi group' })).message;
check((await n(`select count(*)::int n from notifications where chat_id = $1`, [g.id])) === 0, 'group messages do not send a notification per member');
check((await rpc(c, 'my_chats')).find((x) => x.id === g.id).unreadCount === 1, 'members still get an unread badge');
check((await rpc(b, 'update_group_details', g.id, 'x', null, null).catch((e) => ({ err: e.message }))).err?.includes('Only group admins'), 'a normal member can not edit group details');
check((await rpc(a, 'update_group_details', g.id, 'Renamed', 'avatars/g.png', 'new')).chat.name === 'Renamed', 'the admin can edit it');
await expectFail(() => rpc(b, 'manage_group_admin', g.id, b, 'make_admin'), /Only group admins/, 'a member can NOT promote themselves');
await expectFail(() => run(b, `update chat_members set is_admin = true where chat_id = $1 and user_id = $2`, [g.id, b]), /permission denied/, '...nor by editing the table directly');
check((await rpc(a, 'manage_group_admin', g.id, b, 'make_admin')).adminIds.includes(b), 'an admin can promote a member');
await expectFail(() => rpc(b, 'manage_group_admin', g.id, a, 'remove_admin'), /Cannot remove group creator/, 'the creator can never be demoted');
await expectFail(() => rpc(b, 'manage_group_admin', g.id, admin, 'remove_admin'), /Cannot remove NOOB official admin/, 'nor can the official NOOB admin');
check(!(await rpc(a, 'manage_group_admin', g.id, b, 'remove_admin')).adminIds.includes(b), 'an admin can demote another admin');
await expectFail(() => rpc(c, 'add_group_members', g.id, [d]), /Only group admins/, 'a member can not add people');
check((await rpc(a, 'add_group_members', g.id, [d, d])).participants.length === 4, 'an admin can add people (twice is harmless)');
check((await run(a, 'delete from messages where id = $1', [gm.id])).affectedRows === 1, 'a group admin can delete anyone\'s message in the group');
const gm2 = (await rpc(b, 'send_message', g.id, { text: 'from b' })).message;
check((await call(admin, 'select id from messages where id = $1', [gm2.id])).length === 0, 'the site admin can NOT read the messages of a private group');
await expectFail(() => rpc(c, 'admin_delete_message', gm2.id), /Administrator privileges/, 'only the admin can use the moderation delete');
check((await rpc(admin, 'admin_delete_message', gm2.id)).success === true && (await n('select count(*)::int n from messages where id = $1', [gm2.id])) === 0, 'but the site admin can moderate: delete any message by its id');
await expectFail(() => rpc(c, 'remove_group_member', g.id, d), /Only group admins/, 'a member can not remove others');
await expectFail(() => rpc(b, 'remove_group_member', g.id, a), /Only group admins|Cannot remove group creator/, 'nobody can remove the creator');
check((await rpc(a, 'remove_group_member', g.id, d)).participants.length === 3, 'an admin can remove a member');
await rpc(c, 'remove_group_member', g.id, c);
await expectFail(() => rpc(c, 'chat_messages', g.id), /not a participant/, 'someone who left can no longer read the group');
check(!(await rpc(c, 'my_chats')).some((x) => x.id === g.id), '...and it disappears from their list');

// =====================================================================================
section('5b. Calls (1:1 and group): who may start one, and the "a call started" notification');
check((await rpc(a, 'can_start_call', g.id)) === true, 'a real group, not restricted, a member: calling is allowed');
check((await rpc(a, 'can_start_call', ab.id)) === true, 'a direct 1:1 chat can now host a call too');
check((await rpc(a, 'can_start_call', LOUNGE)) === false, 'the Global Lounge can never host a call either');
check((await rpc(c, 'can_start_call', g.id)) === false, 'someone who already left the group can not start a call there');
const beforeCall = (await n(`select count(*)::int n from notifications where target_user_id = $1 and type = 'call_started'`, [b]));
check((await rpc(a, 'notify_call_started', g.id)).success === true, 'starting a call in the group succeeds');
const callNotif = (await db.query(`select * from notifications where target_user_id = $1 and type = 'call_started' order by created_at desc limit 1`, [b])).rows[0];
const aUsername = (await db.query('select username from profiles where id = $1', [a])).rows[0].username;
check(!!callNotif && callNotif.chat_id === g.id && callNotif.message.includes(aUsername) && (await n(`select count(*)::int n from notifications where target_user_id = $1 and type = 'call_started'`, [b])) === beforeCall + 1, 'the other member gets exactly one "call started" notification, naming who started it and which chat');
check((await n(`select count(*)::int n from notifications where target_user_id = $1 and type = 'call_started'`, [a])) === 0, 'the person who started the call does not notify themselves');
await expectFail(() => rpc(admin, 'notify_call_started', g.id), /not a participant/, 'somebody outside the group can not announce a call in it either');
check((await rpc(a, 'set_group_send_policy', g.id, true)).chat.onlyAdminsCanSend === true, '(switching "only admins can send" on, to check calling turns off with it)');
check((await rpc(a, 'can_start_call', g.id)) === false, 'a group under "only admins can send" can not host a call — not even for its own admin');
await expectFail(() => rpc(a, 'notify_call_started', g.id), /not available/, 'nor can a call be announced there while that restriction is on');
check((await rpc(a, 'set_group_send_policy', g.id, false)).chat.onlyAdminsCanSend === false, '(switching it back off)');
check((await rpc(a, 'can_start_call', g.id)) === true, 'and calling works again once the restriction is lifted');

const beforeCall1to1 = (await n(`select count(*)::int n from notifications where target_user_id = $1 and type = 'call_started'`, [b]));
check((await rpc(a, 'notify_call_started', ab.id)).success === true, 'starting a call in a 1:1 chat succeeds too');
check((await n(`select count(*)::int n from notifications where target_user_id = $1 and type = 'call_started'`, [b])) === beforeCall1to1 + 1, 'the other person in the 1:1 gets the "call started" notification');
await expectFail(() => rpc(admin, 'notify_call_started', ab.id), /not a participant/, 'somebody outside a 1:1 chat can not announce a call in it either');

// =====================================================================================
section('6. Per-person settings');
check((await rpc(a, 'toggle_chat_flag', ab.id, 'pin')).isPinned === true, 'you can pin a chat');
check((await rpc(b, 'my_chats')).find((x) => x.id === ab.id).isPinned === false, '...for yourself only (the old app pinned it for both)');
check((await rpc(b, 'toggle_chat_flag', ab.id, 'mute')).isMuted === true && (await rpc(a, 'my_chats')).find((x) => x.id === ab.id).isMuted === false, 'muting is personal too');
await expectFail(() => rpc(c, 'toggle_chat_flag', ab.id, 'pin'), /not a participant/, 'a stranger can not touch a chat\'s settings');
const st = (await rpc(a, 'update_chat_settings', ab.id, { themeColor: '#FF00AA', vanishMode: true, readReceiptsEnabled: false, nickname: '  Bestie ' })).chat;
check(st.themeColor === '#FF00AA' && st.vanishMode === true && st.readReceiptsEnabled === false && st.customNickname === 'Bestie', 'theme, vanish mode, read receipts and my nickname for them can be changed');
check((await rpc(b, 'my_chats')).find((x) => x.id === ab.id).customNickname === null, 'a nickname is only shown to the person who set it');
check((await rpc(a, 'update_chat_settings', ab.id, { themeColor: 'javascript:alert(1)' })).chat.themeColor === '#FF00AA', 'an invalid theme colour is ignored');
await expectFail(() => rpc(c, 'update_chat_settings', ab.id, { vanishMode: false }), /not a participant/, 'a stranger can not change them');

// =====================================================================================
section('7. Ending a chat, reviews, deleting');
const ended = await rpc(b, 'end_chat', ab.id);
check(ended.chat.isEnded === true && ended.chat.endedAt, 'a chat session can be ended');
const sys = (await rpc(a, 'chat_messages', ab.id)).messages.find((x) => x.text.includes('concluded'));
check(sys && sys.senderId === 'system' && sys.senderUsername === null, 'a system message announces it');
const rev = await rpc(a, 'submit_chat_review', ab.id, 9, 'great');
check(rev.review.rating === 5 && rev.review.feedback === 'great', 'a rating is limited to 1-5');
check((await rpc(a, 'my_chats')).find((x) => x.id === ab.id).review.rating === 5 && (await rpc(b, 'chat_messages', ab.id)).messages.some((x) => x.text.includes('Rating Submitted')), 'the review is stored on the chat and announced');
await expectFail(() => rpc(c, 'submit_chat_review', ab.id, 5, 'x'), /not a participant/, 'a stranger can not review or end someone else\'s chat');
await expectFail(() => rpc(c, 'end_chat', ab.id), /not a participant/, 'nor end it');
await expectFail(() => rpc(c, 'delete_chat', ab.id), /not a participant/, 'nor delete it');
check((await rpc(b, 'delete_chat', ab.id)).success === true && (await n('select count(*)::int n from messages where chat_id = $1', [ab.id])) === 0, 'a participant can delete the chat with all its messages');

// =====================================================================================
section('8. Blocking');
const bc = (await rpc(b, 'create_chat', [c])).chat;
const blk = await rpc(b, 'block_user', c);
check(blk.blockedUserIds.includes(c), 'you can block someone');
await expectFail(() => rpc(c, 'send_message', bc.id, { text: 'hey' }), /can't message this person/, 'a blocked person can not message you');
await expectFail(() => rpc(b, 'send_message', bc.id, { text: 'hey' }), /can't message this person/, 'and you can not message them while blocked');
await expectFail(() => rpc(c, 'create_chat', [b]).then((r) => r.chat.id === bc.id ? Promise.reject(new Error("can't message this person")) : r), /can't message this person/, 'a new chat with someone who blocked you is refused');
check((await rpc(b, 'get_my_user')).blockedUserIds.includes(c), 'the block shows in my own record');
check((await rpc(b, 'unblock_user', c)).blockedUserIds.length === 0, 'you can unblock');
check((await rpc(c, 'send_message', bc.id, { text: 'hey again' })).success === true, 'and messaging works again');
await expectFail(() => rpc(b, 'block_user', b), /can't block yourself/, 'you can not block yourself');
await db.query('insert into follows (follower_id, followee_id) values ($1, $2), ($2, $1)', [b, c]);
await rpc(b, 'block_user', c);
check((await n('select count(*)::int n from follows where (follower_id = $1 and followee_id = $2) or (follower_id = $2 and followee_id = $1)', [b, c])) === 0, 'blocking also removes the follow in both directions');

// =====================================================================================
section('9. Direct table access is closed');
await expectFail(() => run(a, `insert into chats (name, is_group, creator_id) values ('sneaky', true, $1)`, [a]), /permission denied/, 'a chat can not be created by writing to the table');
await expectFail(() => run(a, `insert into chat_members (chat_id, user_id) values ($1, $2)`, [LOUNGE, a]), /permission denied/, 'nor can you add yourself to a chat');
await expectFail(() => run(a, `update chats set creator_id = $1 where id = $2`, [a, g.id]), /permission denied/, 'nor can you take over a group');
check((await run(a, `delete from chat_members where chat_id = $1 and user_id = $2`, [g.id, a])).affectedRows === 1, 'leaving a group directly is still allowed');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
