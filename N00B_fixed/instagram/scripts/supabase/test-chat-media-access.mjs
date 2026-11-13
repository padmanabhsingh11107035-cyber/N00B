// Tests migrations 20261114000001 / 20261114000002 (private chat media) on a real Postgres (PGlite): who can open which chat file, the backfill from old messages (odd address forms),
// the trigger for new messages, locked-file rows, delete-for-me / deleted messages / history start, function grants, the private bucket's rules, and that running the file twice is harmless.
// Usage: node scripts/supabase/test-chat-media-access.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createTestDb, asUser, asAnon, MIGRATIONS_DIR } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);

const MIG1 = '20261114000001_chat_media_access.sql', MIG2 = '20261114000002_chat_media_private_bucket.sql';
// the database is built from every migration BEFORE ours, filled with "old" data, and only then upgraded (as the real one will be)
const db = await createTestDb({ upTo: '20261113000003_sealed_media_keep_unattached.sql' });
const mkUser = async (name) => {
  const id = (await db.query('select gen_random_uuid() as id')).rows[0].id;
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query('select 1 from public.profiles where id = $1', [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $3)`, [id, name, name]);
  return id;
};
const [ann, bob, cy, dee] = [await mkUser('ann'), await mkUser('bob'), await mkUser('cy'), await mkUser('dee')];
const mkChat = async (members, extra = {}) => {
  const id = (await db.query(`insert into public.chats (is_group, name) values ($1, 'c') returning id`, [members.length > 2])).rows[0].id;
  for (const m of members) await db.query(`insert into public.chat_members (chat_id, user_id, joined_at) values ($1, $2, $3)`, [id, m, extra[m] || new Date(Date.now() - 86400000 * 5).toISOString()]);
  return id;
};
const obj = (bucket, name, owner) => db.query(`insert into storage.objects (bucket_id, name, owner_id, metadata) values ($1, $2, $3, '{"mimetype":"image/jpeg"}'::jsonb)`, [bucket, name, owner]);
const msg = async (chat, sender, media, created = null) => (await db.query(`insert into public.messages (chat_id, sender_id, text, media_url, media_type, created_at) values ($1, $2, '', $3, 'image', coalesce($4::timestamptz, now())) returning id`, [chat, sender, media, created])).rows[0].id;
const can = async (uid, key) => asUser(db, uid, async () => (await db.query('select public.can_read_chat_media($1) as r', [key])).rows[0].r);
const idx = async (key) => (await db.query('select count(*)::int n from public.chat_media_index where key = $1', [key])).rows[0].n;

section('0. Old data, written before the migration (the odd ways messages stored a file)');
const dm = await mkChat([ann, bob]);       // ann + bob
const other = await mkChat([cy, dee]);     // cy + dee
const A = (n) => `chat/17000000000${n}-aaaaaaa.jpg`;
const forms = {
  bare: A(1), m: `/m/${A(2)}`, media: `/media/${A(3)}`,
  full: `https://abffssydapumuhwgzeck.supabase.co/storage/v1/object/public/media/${A(4)}`,
  site: `https://noobsocials.com/m/${A(5)}?v=2`, xyz: `https://www.nooob.xyz/media/${A(6)}#x`
};
for (const [i, v] of Object.entries(Object.values(forms))) await msg(dm, ann, v);
const giphy = await msg(dm, ann, 'https://i.giphy.com/media/xyz/giphy.gif');
const posts = await msg(dm, ann, 'posts/1700000000000-zzz.jpg');
await msg(dm, ann, 'data:image/png;base64,AAAA');
const pastKey = A(7);
const hiddenKey = A(8), goneKey = A(9), lateKey = 'chat/1700000000010-bbbbbbb.mp4', otherKey = 'chat/1700000000011-ccccccc.m4a';
await msg(dm, ann, pastKey);
const hiddenMsg = await msg(dm, ann, hiddenKey);
const goneMsg = await msg(dm, ann, goneKey);
await msg(other, cy, otherKey);
const oldStolen = 'chat/1700000000014-sssssss.jpg';
await obj('media', oldStolen, cy);
await msg(dm, ann, oldStolen);
const oldImported = 'chat/1700000000015-iiiiiii.jpg';
await obj('media', oldImported, null);
await msg(dm, ann, oldImported);
const sealedKey = 'chat/1700000000012-ddddddd.sealed';
await db.query(`insert into public.sealed_media (key, owner_id, chat_id) values ($1, $2, $3)`, [sealedKey, ann, dm]);
// dee joins the dm later than an old message
const oldMsgKey = 'chat/1700000000013-eeeeeee.jpg';
const longChat = await mkChat([ann, bob]);
await db.query(`update public.chat_members set joined_at = now() - interval '1 day' where chat_id = $1`, [longChat]);
await msg(longChat, ann, oldMsgKey, new Date(Date.now() - 86400000 * 3).toISOString());
await db.query(`insert into public.chat_members (chat_id, user_id, joined_at) values ($1, $2, now())`, [longChat, dee]);

for (const f of [MIG1, MIG2]) await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));

section('1. Backfill');
for (const [name, v] of Object.entries(forms)) check((await idx(A(Object.keys(forms).indexOf(name) + 1))) === 1, `the "${name}" form of an old message is indexed under its plain key`);
check((await db.query(`select count(*)::int n from public.chat_media_index where key !~ '^chat/'`)).rows[0].n === 0, 'only chat/ keys are ever indexed (no giphy link, no posts/ file, no data: string)');
check((await idx(sealedKey)) === 1, 'a locked-file registration is indexed too');
check((await idx(oldStolen)) === 0, "an old message naming a file that somebody else uploaded is left out");
check((await idx(oldImported)) === 1, 'a file from the old storage (no recorded uploader) is kept');
check((await db.query('select count(*)::int n from public.chat_media_index')).rows[0].n === 13, 'the number of rows is exactly the number of chat files in old messages (12, one left out below) plus the locked one', String((await db.query('select count(*)::int n from public.chat_media_index')).rows[0].n));

section('2. Who can open a file');
check(await can(ann, A(1)) && await can(bob, A(1)), 'both members of the chat can open an old file');
check(!(await can(cy, A(1))), 'a signed-in person who is not in the chat can not');
check(!(await can(cy, `/m/${A(1)}`)) && (await can(bob, `/m/${A(1)}`)), 'the answer is the same whatever form of the name is asked');
check(!(await can(ann, 'chat/1700000000099-nope.jpg')) && !(await can(ann, 'posts/1700000000000-zzz.jpg')) && !(await can(ann, null)) && !(await can(ann, '')), 'an unknown file, a file outside chat/ and nothing at all are all just false');
check(!(await can(ann, 'chat/../x')) && !(await can(ann, "chat/a'; drop table x;--")), 'strange names are false, not errors');
check(await can(cy, otherKey) && await can(dee, otherKey) && !(await can(ann, otherKey)), 'files of another chat belong to that chat only');
check(await can(bob, sealedKey), 'a member can open a registered locked file');
const anonAnswer = await asAnon(db, async () => { try { await db.query('select public.can_read_chat_media($1)', [A(1)]); return 'ran'; } catch (e) { return e.message; } });
check(/permission denied/.test(anonAnswer), 'a visitor who is not signed in can not even ask', anonAnswer);

section('3. Deleted-for-me, deleted messages, history start');
await db.query('insert into public.message_hides (user_id, message_id, chat_id) values ($1, $2, $3)', [bob, hiddenMsg, dm]);
check(!(await can(bob, hiddenKey)) && await can(ann, hiddenKey), '"delete for me" closes the file for that person only');
await db.query('delete from public.messages where id = $1', [goneMsg]);
check(!(await can(ann, goneKey)) && !(await can(bob, goneKey)) && (await idx(goneKey)) === 0, 'a message deleted for everyone closes its file for everybody');
check(await can(bob, oldMsgKey) && !(await can(dee, oldMsgKey)), 'a person who joined after the message was sent can not open its file');
await db.query('delete from public.chat_members where chat_id = $1 and user_id = $2', [dm, bob]);
check(!(await can(bob, A(1))), 'a person who left the chat can not open its files any more');
await db.query('insert into public.chat_members (chat_id, user_id) values ($1, $2)', [dm, bob]);

section('4. New messages are indexed by the database (old app versions keep working)');
const NK = 'chat/1700000000020-fffffff.jpg';
await obj('media', NK, ann);
await msg(dm, ann, NK);
check((await idx(NK)) === 1 && await can(bob, NK) && !(await can(cy, NK)), 'a new message with a file its sender uploaded is indexed at once');
const stolen = 'chat/1700000000021-ggggggg.jpg';
await obj('media', stolen, cy);
await msg(dm, ann, stolen);
check((await idx(stolen)) === 0 && !(await can(ann, stolen)), "typing the name of somebody else's file does not give access to it");
await msg(dm, ann, otherKey);
check(!(await can(ann, otherKey)), "...not even a file that belongs to a chat the sender is not in");
const priv = 'chat/1700000000022-hhhhhhh.jpg';
await obj('chatmedia', priv, ann);
await msg(dm, ann, `/m/${priv}`);
check((await idx(priv)) === 1, 'a file uploaded to the private bucket is indexed the same way');
const edit = 'chat/1700000000023-iiiiiii.jpg';
const mid = await msg(dm, ann, null);
await obj('media', edit, ann);
await db.query('update public.messages set media_url = $1 where id = $2', [edit, mid]);
check((await idx(edit)) === 1, 'a message that gets its file later is indexed too');
const broke = await db.query(`insert into public.messages (chat_id, sender_id, text, media_url) values ($1, $2, 'x', 'chat/%%%bad') returning id`, [dm, ann]).then(() => true, () => false);
check(broke, 'a bad name never stops a message from being saved');
const SK = 'chat/1700000000024-jjjjjjj.sealed';
await db.query(`insert into public.sealed_media (key, owner_id, chat_id) values ($1, $2, $3)`, [SK, ann, dm]);
const smid = await msg(dm, ann, null);
await db.query('update public.sealed_media set message_id = $1 where key = $2', [smid, SK]);
check((await idx(SK)) === 1, 'attaching a locked file to its message leaves one row, not two');
await db.query('delete from public.messages where id = $1', [smid]);
check((await idx(SK)) === 0, 'and deleting that message removes it');

section('5. Nobody can read or write the list, grants');
check((await asUser(db, ann, async () => db.query('select * from public.chat_media_index').then(() => 'read', (e) => e.message))).includes('permission denied'), 'a signed-in person can not read the list');
check((await asUser(db, ann, async () => db.query(`insert into public.chat_media_index (key, chat_id) values ('chat/x.jpg', $1)`, [dm]).then(() => 'wrote', (e) => e.message))).includes('permission denied'), '...or add to it');
check((await asAnon(db, async () => db.query('select * from public.chat_media_index').then(() => 'read', (e) => e.message))).includes('permission denied'), 'a visitor can not read it');
const g = (await db.query(`select has_function_privilege('anon', 'public.can_read_chat_media(text)', 'execute') a, has_function_privilege('authenticated', 'public.can_read_chat_media(text)', 'execute') u, has_function_privilege('public', 'public.can_read_chat_media(text)', 'execute') p, has_function_privilege('authenticated', 'public.chat_media_key_of(text)', 'execute') k, has_function_privilege('authenticated', 'public.index_chat_media_from_message()', 'execute') t`)).rows[0];
check(g.u && !g.a && !g.p && !g.k && !g.t, 'can_read_chat_media: signed-in only; the helpers and triggers are closed to everybody');

section('6. The private bucket');
const b = (await db.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'chatmedia'`)).rows[0];
check(b && b.public === false && Number(b.file_size_limit) === 52428800 && b.allowed_mime_types.includes('application/octet-stream'), 'chatmedia exists, is not public, 50 MB, same types plus locked files');
check((await db.query(`select public from storage.buckets where id = 'media'`)).rows[0].public === true, 'the old bucket is untouched (still public)');
const put = (uid, name, mime = 'image/jpeg') => asUser(db, uid, async () => db.query(`insert into storage.objects (bucket_id, name, owner_id, metadata) values ('chatmedia', $1, $2, jsonb_build_object('mimetype', $3::text))`, [name, uid, mime]).then(() => 'ok', (e) => e.message));
check((await put(ann, 'chat/1700000000030-kkkkkkk.jpg')) === 'ok', 'a signed-in person can add a file with a normal chat name');
check((await put(ann, 'posts/1700000000030-kkkkkkk.jpg')) !== 'ok' && (await put(ann, 'chat/a/b.jpg')) !== 'ok' && (await put(ann, 'chat/x.bin', 'application/octet-stream')) !== 'ok', 'other folders, deeper paths and opaque types are refused');
check((await put(ann, 'chat/1700000000031-lllllll.sealed', 'application/octet-stream')) === 'ok', '...except a locked-file name');
const seeObj = (uid, name) => asUser(db, uid, async () => (await db.query(`select count(*)::int n from storage.objects where bucket_id = 'chatmedia' and name = $1`, [name])).rows[0].n);
check((await seeObj(ann, 'chat/1700000000030-kkkkkkk.jpg')) === 1 && (await seeObj(cy, 'chat/1700000000030-kkkkkkk.jpg')) === 0, 'the uploader sees their file, a stranger does not');
check((await seeObj(bob, priv)) === 1 && (await seeObj(cy, priv)) === 0, 'a member of the chat sees a registered file, a stranger does not');
check((await asUser(db, ann, async () => db.query(`update storage.objects set name = 'chat/zzz.jpg' where bucket_id = 'chatmedia'`).then((r) => r.affectedRows || 0))) === 0, 'no policy lets a person change a file');
check((await asUser(db, ann, async () => db.query(`delete from storage.objects where bucket_id = 'chatmedia'`).then((r) => r.affectedRows || 0))) === 0, 'or delete one (the deletion queue does that with the server key)');

section('7. Running both files again changes nothing');
const before = (await db.query('select count(*)::int n from public.chat_media_index')).rows[0].n;
for (const f of [MIG1, MIG2]) await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
check((await db.query('select count(*)::int n from public.chat_media_index')).rows[0].n === before, 'the second run adds no rows and raises no error');
const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, MIG1), 'utf8') + fs.readFileSync(path.join(MIGRATIONS_DIR, MIG2), 'utf8');
check(!/\bdrop\s+table\b|\bdelete\s+from\s+(storage|public\.messages)|\btruncate\b|alter\s+table\s+public\.messages/i.test(sql), 'the files add only; they delete nothing from messages or storage');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
