// Tests for migration 20260927000005: Instants (camera-only photos shared with friends or Close Friends from the
// Chat page — each friend can open one once, unopened ones expire after 24 h, reactions, a private archive),
// against a real Postgres (PGlite) holding the real backup.
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

const db = await createTestDb();
await runImport(buildImportPlan(raw, {}), makePgAdapter(db), { log: () => {} });
const profByLegacy = Object.fromEntries((await db.query('select * from profiles')).rows.map((p) => [p.legacy_id, p]));
const ids = raw.users.filter((u) => !u.isAdmin).map((u) => profByLegacy[u.id].id);
const [me, b, c, d, e, f] = ids;

const call = (uid, sql, params = []) => asUser(db, uid, async () => (await db.query(sql, params)).rows);
const rpc = async (uid, fn, ...args) => (await call(uid, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args))[0].r;
const rpcAnon = async (fn, ...args) => (await asAnon(db, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows))[0].r;

// a clean slate of follows between these six accounts
await db.query('delete from follows where follower_id = any($1) or followee_id = any($1)', [[me, b, c, d, e, f]]);
await db.query('delete from blocks where blocker_id = any($1) or blocked_id = any($1)', [[me, b, c, d, e, f]]);
const follow = (x, y) => db.query('insert into follows (follower_id, followee_id) values ($1, $2) on conflict do nothing', [x, y]);

// nobody to share with yet
await expectFail(() => rpc(me, 'send_instant', 'instants/1-a.jpg', '', 'friends'), /no friends/, 'with no friends there is nobody to share with');

// b, c, e: friends (both follow each other). d follows me but I don't follow back. I follow f, f doesn't follow me.
for (const x of [b, c, e]) { await follow(me, x); await follow(x, me); }
await follow(d, me);
await follow(me, f);
await db.query('insert into blocks (blocker_id, blocked_id) values ($1, $2)', [e, me]);   // e blocked me

// Close Friends
let friends = await rpc(me, 'my_close_friends');
check(friends.length === 2 && friends.every((x) => [b, c].includes(x.id)), 'only mutual followers (not blocked) are friends', JSON.stringify(friends.map((x) => x.username)));
check(friends.every((x) => x.isCloseFriend === false), 'nobody is a Close Friend at first');
await expectFail(() => rpc(me, 'set_close_friend', d, true), /Only friends/, 'someone who only follows me can not be a Close Friend');
await expectFail(() => rpc(me, 'set_close_friend', f, true), /Only friends/, 'someone who does not follow me back can not be a Close Friend');
await expectFail(() => rpc(me, 'send_instant', 'instants/1-a.jpg', '', 'close_friends'), /Close Friends first/, 'Close Friends needs someone on the list');
const cf = await rpc(me, 'set_close_friend', c, true);
check(cf.count === 1, 'a friend can be added to Close Friends');
friends = await rpc(me, 'my_close_friends');
check(friends.find((x) => x.id === c).isCloseFriend && !friends.find((x) => x.id === b).isCloseFriend, 'the list shows who is a Close Friend');
await expectFail(() => call(me, 'select * from public.close_friends'), /permission denied/, 'nobody reads the Close Friends table directly');

// storage: the new folder
await call(me, "insert into storage.objects (bucket_id, name) values ('media', 'instants/1-photo.jpg')");
check(true, 'a photo can be uploaded to the instants folder');
await expectFail(() => call(me, "insert into storage.objects (bucket_id, name) values ('media', 'secret/1-photo.jpg')"), /row-level security/, 'other folders are still refused');

// sending
await expectFail(() => rpc(me, 'send_instant', 'https://evil.example/x.jpg', '', 'friends'), /Take a photo/, 'only photos taken in the app (instants/ folder) can be sent');
await expectFail(() => rpc(me, 'send_instant', 'posts/1-a.jpg', '', 'friends'), /Take a photo/, 'a gallery/post picture can not be sent as an instant');
await expectFail(() => rpc(me, 'send_instant', 'instants/1-a.jpg', '', 'everyone'), /Friends or Close Friends/, 'the audience must be Friends or Close Friends');
const long = 'x'.repeat(300);
const sent = await rpc(me, 'send_instant', 'instants/1-photo.jpg', long, 'friends');
check(sent.success && sent.recipients === 2, 'an instant to friends goes to every friend (and nobody else)', JSON.stringify(sent));
const toClose = await rpc(me, 'send_instant', 'instants/2-photo.jpg', 'close one', 'close_friends');
check(toClose.recipients === 1, 'an instant to Close Friends goes only to them');
const notes = (await db.query("select target_user_id from notifications where type = 'instant' and actor_id = $1", [me])).rows.map((r) => r.target_user_id);
check(notes.length === 3 && notes.filter((t) => t === c).length === 2 && notes.includes(b), 'each friend is told they got an instant');

// inboxes
const inboxB = await rpc(b, 'my_instant_inbox');
check(inboxB.length === 1 && inboxB[0].id === sent.id && inboxB[0].sender.userId === me, 'b sees the friends instant only');
check(!('mediaUrl' in inboxB[0]), 'the inbox never hands out the photo (only opening does)');
check(inboxB[0].caption.length === 100, 'captions are cut to 100 characters');
const inboxC = await rpc(c, 'my_instant_inbox');
check(inboxC.length === 2 && inboxC[0].id === sent.id && inboxC[1].id === toClose.id, 'a Close Friend sees both, oldest first');
check((await rpc(d, 'my_instant_inbox')).length === 0, 'a one-way follower sees nothing');
check((await rpc(f, 'my_instant_inbox')).length === 0, 'someone I follow who does not follow me sees nothing');
check((await rpc(e, 'my_instant_inbox')).length === 0, 'someone who blocked me sees nothing');
await expectFail(() => call(b, 'select * from public.instants'), /permission denied/, 'nobody reads the instants table directly');
await expectFail(() => call(b, 'select * from public.instant_recipients'), /permission denied/, 'nobody reads who got what directly');
await expectFail(() => rpcAnon('my_instant_inbox'), /permission denied|log in/, 'logged-out visitors have no inbox');

// opening: once only
await expectFail(() => rpc(d, 'open_instant', sent.id), /no longer available/, 'someone it was not sent to can not open it');
const opened = await rpc(b, 'open_instant', sent.id);
check(opened.instant.mediaUrl === 'instants/1-photo.jpg' && opened.instant.sender.userId === me, 'opening shows the photo');
await expectFail(() => rpc(b, 'open_instant', sent.id), /no longer available/, 'an instant can be opened only once');
check((await rpc(b, 'my_instant_inbox')).length === 0, 'once opened it leaves the inbox');

// reactions
const r = await rpc(b, 'react_instant', sent.id, '😂');
check(r.reaction === '😂', 'a friend can react after opening');
await rpc(b, 'react_instant', sent.id, '❤️');
await expectFail(() => rpc(d, 'react_instant', sent.id, '😂'), /no longer available/, 'others can not react');
await expectFail(() => rpc(b, 'react_instant', sent.id, ''), /Pick an emoji/, 'a reaction needs an emoji');
const told = (await db.query("select count(*)::int n from notifications where type = 'instant_reaction' and target_user_id = $1 and actor_id = $2", [me, b])).rows[0].n;
check(told === 2, 'the sender is told about reactions');

// the sender's private archive
const archive = await rpc(me, 'my_instants_archive');
check(archive.length === 2 && archive[0].id === toClose.id && archive[1].id === sent.id, 'the archive lists my instants, newest first');
check(archive[1].sentTo === 2 && archive[1].reactions.length === 1 && archive[1].reactions[0].emoji === '❤️', 'the archive shows reactions (one per person, the latest)');
check(archive[1].mediaUrl === 'instants/1-photo.jpg', 'the archive keeps my own photos');
check((await rpc(b, 'my_instants_archive')).length === 0, 'nobody else sees my archive');

// expiry after 24 hours
await db.query("update instants set expires_at = now() - interval '1 minute' where id = $1", [toClose.id]);
check((await rpc(c, 'my_instant_inbox')).length === 1, 'an expired instant leaves the inbox');
await expectFail(() => rpc(c, 'open_instant', toClose.id), /no longer available/, 'an expired instant can not be opened');
check((await rpc(me, 'my_instants_archive')).some((x) => x.id === toClose.id), 'expired instants stay in my own archive');

// undo / delete
await expectFail(() => rpc(b, 'delete_instant', sent.id), /not found/, 'only the sender can delete an instant');
await rpc(me, 'delete_instant', sent.id);
check((await rpc(c, 'my_instant_inbox')).length === 0, 'deleting takes it back from everyone who has not opened it');
check((await rpc(me, 'my_instants_archive')).every((x) => x.id !== sent.id), 'and removes it from my archive');
const left = (await db.query("select count(*)::int n from notifications where type = 'instant' and actor_id = $1 and target_user_id = any($2)", [me, [b]])).rows[0].n;
check(left === 0, 'its "sent you an instant" notifications go too');

// a suspended sender's instants are hidden
const again = await rpc(me, 'send_instant', 'instants/3-photo.jpg', '', 'friends');
await db.query('update profiles set is_suspended = true where id = $1', [me]);
check((await rpc(b, 'my_instant_inbox')).every((x) => x.id !== again.id), 'a suspended account\'s instants are hidden');
await expectFail(() => rpc(me, 'send_instant', 'instants/4-photo.jpg', '', 'friends'), /log in/, 'a suspended account can not send');
await db.query('update profiles set is_suspended = false where id = $1', [me]);

// deleting an account removes its instants and Close Friends
await db.query('delete from profiles where id = $1', [c]).catch(() => {});
const cfLeft = (await db.query('select count(*)::int n from close_friends where friend_id = $1', [c])).rows[0].n;
check(cfLeft === 0, 'no Close Friends entry is left behind when an account is deleted');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
