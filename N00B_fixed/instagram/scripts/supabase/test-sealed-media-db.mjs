// Tests migration 20261113000002 (locked chat attachments) on a real Postgres (PGlite): the three functions, who may call them, that deleting a message
// (or a chat) puts the locked file into the normal deletion queue, that a file nobody attached is not swept as "unused", that forgotten registrations are
// cleared, that nothing else in the bucket changes (other folders still refuse an opaque type), and that the migration is safe to run twice.
//
// Usage: node scripts/supabase/test-sealed-media-db.mjs [backup-folder]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadBackup, buildImportPlan } from './transform.mjs';
import { runImport } from './run-import.mjs';
import { createTestDb, makePgAdapter, asUser, MIGRATIONS_DIR } from './pg-test-env.mjs';

const backupsRoot = 'backups';
const dir = process.argv.slice(2).find((x) => !x.startsWith('--')) || path.join(backupsRoot, fs.readdirSync(backupsRoot).filter((d) => fs.existsSync(path.join(backupsRoot, d, 'users.json'))).sort().pop());
const raw = loadBackup(dir);
const C = await import(pathToFileURL(path.resolve('src/e2ee/crypto.ts')).href);
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
const pool = raw.users.filter((u) => !u.isAdmin && (u.password || '').length > 0);
const [ann, bob, cy] = pool.slice(0, 3).map((u) => profByLegacy[u.id].id);
const rpc = async (uid, fn, ...args) => asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
const sql = (uid, q, params = []) => asUser(db, uid, async () => (await db.query(q, params)).rows);
const n = async (q, params = []) => (await db.query(q, params)).rows[0].n;

const A1 = await C.generateDeviceKey('Ann'), B1 = await C.generateDeviceKey('Bob');
await rpc(ann, 'register_chat_key', A1.kid, A1.publicJwk, ''); await rpc(bob, 'register_chat_key', B1.kid, B1.publicJwk, '');
const dm = (await sql(ann, `select public.create_chat(array[$1::uuid], false, null, null, null) as r`, [bob]))[0].r.chat;
const seal = (text, chatId) => C.seal(text, { chatId, sender: A1, recipients: [A1, B1].map((k) => ({ kid: k.kid, publicJwk: k.publicJwk })) });
const upload = async (uid, name, mime = 'application/octet-stream') => db.query(`insert into storage.objects (bucket_id, name, owner_id, metadata) values ('media', $1, $2, jsonb_build_object('mimetype', $3::text))`, [name, uid, mime]);
const send = async (chatId) => (await rpc(ann, 'send_message', chatId, { e2ee: await seal(JSON.stringify({ t: '' }), chatId) })).message.id;
const queued = async (key) => n(`select count(*)::int n from public.media_trash where key = $1`, [key]);

section('1. Registering a locked file');
const K1 = 'chat/1700000000001-aaaaaaa.sealed';
await expectFail(() => rpc(ann, 'register_sealed_media', dm.id, K1), /not found/, 'a file that was never uploaded can not be registered');
await upload(ann, K1);
check((await rpc(ann, 'register_sealed_media', dm.id, K1)).success, 'the owner registers an uploaded locked file for a chat they are in');
check((await rpc(ann, 'register_sealed_media', dm.id, K1)).success && (await n('select count(*)::int n from public.sealed_media')) === 1, 'registering twice changes nothing');
await expectFail(() => rpc(ann, 'register_sealed_media', dm.id, 'chat/../x.sealed'), /not a valid attachment/, 'a name outside the locked-file pattern is refused');
await expectFail(() => rpc(ann, 'register_sealed_media', dm.id, 'posts/1700000000001-aaaaaaa.sealed'), /not a valid attachment/, 'a file outside the chat folder is refused');
await upload(bob, 'chat/1700000000002-bbbbbbb.sealed');
await expectFail(() => rpc(ann, 'register_sealed_media', dm.id, 'chat/1700000000002-bbbbbbb.sealed'), /not found/, "somebody else's file can not be registered");
await expectFail(() => rpc(cy, 'register_sealed_media', dm.id, K1), /not a participant|not found/, 'somebody outside the chat can not register');
check(await rpc(ann, 'my_chat_keys').then(() => true), '(the end-to-end functions still work)');

section('2. Tying it to the message, and deleting');
const mid = await send(dm.id);
await expectFail(() => rpc(bob, 'attach_sealed_media', mid, K1), /does not belong/, "somebody else can not attach a file to Ann's message");
const plainMsg = (await rpc(bob, 'send_message', dm.id, { text: 'plain' })).message.id;
await expectFail(() => rpc(ann, 'attach_sealed_media', plainMsg, K1), /does not belong/, 'a file can not be attached to a message that is not hers');
check((await rpc(ann, 'attach_sealed_media', mid, K1)).success, 'the sender attaches the file to her locked message');
await expectFail(() => rpc(ann, 'attach_sealed_media', mid, K1), /does not belong/, 'a file is attached only once');
check((await queued(K1)) === 0, 'nothing is queued while the message exists');
check((await n('select count(*)::int n from public.media_unused_candidates($1::interval) where name = $2', ['0 seconds', K1])) === 0, 'the files-nobody-points-to sweep does NOT list a registered locked file');
await db.query('delete from public.messages where id = $1', [mid]);
check((await queued(K1)) === 1 && (await n('select count(*)::int n from public.sealed_media where key = $1', [K1])) === 0, 'deleting the message puts the locked file into the deletion queue');

section('3. Chat deletion, failed sends, forgotten registrations');
const K2 = 'chat/1700000000003-ccccccc.sealed', K3 = 'chat/1700000000004-ddddddd.sealed', K4 = 'chat/1700000000005-eeeeeee.sealed';
for (const k of [K2, K3, K4]) { await upload(ann, k); await rpc(ann, 'register_sealed_media', dm.id, k); }
await rpc(ann, 'attach_sealed_media', await send(dm.id), K2);
await rpc(ann, 'discard_sealed_media', K3);
check((await queued(K3)) === 1, 'a failed send discards its registration and the file is queued');
await rpc(bob, 'discard_sealed_media', K4);
check((await queued(K4)) === 0, "somebody else's registration can not be discarded");
check((await n(`select count(*)::int n from public.media_unused_candidates($1::interval) where name = $2`, ['0 seconds', K4])) === 0, 'a registered but not yet attached file is not swept either');
await db.query(`update public.sealed_media set created_at = now() - interval '3 days' where key = $1`, [K4]);
const K5 = 'chat/1700000000006-fffffff.sealed';
await upload(ann, K5); await rpc(ann, 'register_sealed_media', dm.id, K5);
check((await queued(K4)) === 0 && (await n('select count(*)::int n from public.sealed_media where key = $1', [K4])) === 1, 'a registration left unattached for 3 days is KEPT (a delivered attachment is never purged by a later upload)');
await rpc(ann, 'attach_sealed_media', await send(dm.id), K4);
check((await rpc(ann, 'discard_sealed_media', K4)).success && (await queued(K4)) === 0, 'and once attached it can not be discarded');
await db.query('delete from public.chats where id = $1', [dm.id]);
check((await queued(K2)) === 1 && (await queued(K5)) === 1, 'deleting the whole chat queues every locked file in it');

section('4. Nothing else changed');
const direct = await asUser(db, ann, async () => { try { await db.query('select * from public.sealed_media'); return 'read'; } catch { return 'denied'; } });
check(direct === 'denied', 'people can not read the table directly');
const direct2 = await asUser(db, ann, async () => { try { await db.query(`insert into public.sealed_media (key, owner_id, chat_id) values ('chat/x.sealed', $1, $2)`, [ann, dm.id]); return 'wrote'; } catch { return 'denied'; } });
check(direct2 === 'denied', 'people can not write the table directly');
const types = (await db.query(`select allowed_mime_types t from storage.buckets where id = 'media'`)).rows[0].t;
check(types.includes('image/*') && types.includes('video/*') && types.includes('audio/*') && types.includes('application/octet-stream'), 'the bucket takes pictures, video, audio - and the opaque type');
const stray = await asUser(db, ann, async () => { try { await db.query(`insert into storage.objects (bucket_id, name, owner_id, metadata) values ('media', 'posts/9-x.jpg', $1, '{"mimetype":"application/octet-stream"}')`, [ann]); return 'allowed'; } catch { return 'refused'; } });
check(stray === 'refused', 'an opaque file in ANY other folder is refused by the policy (only chat/<name>.sealed takes it)');
const strayCase = await asUser(db, ann, async () => { try { await db.query(`insert into storage.objects (bucket_id, name, owner_id, metadata) values ('media', 'posts/9-c.jpg', $1, '{"mimetype":"Application/Octet-Stream"}')`, [ann]); return 'allowed'; } catch { return 'refused'; } });
check(strayCase === 'refused', 'the same type written in capitals is refused outside chat/<name>.sealed too');
const fine = await asUser(db, ann, async () => { try { await db.query(`insert into storage.objects (bucket_id, name, owner_id, metadata) values ('media', 'posts/9-y.jpg', $1, '{"mimetype":"image/jpeg"}'), ('media', 'chat/9-z.sealed', $1, '{"mimetype":"application/octet-stream"}'), ('media', 'chat/9-w.jpg', $1, '{"mimetype":"image/jpeg"}'), ('media', 'chat/9-v.jpg', $1, '{}')`, [ann]); return 'allowed'; } catch (e) { return e.message; } });
check(fine === 'allowed', 'normal uploads (and a locked file) still pass', fine);
const again = ['20261113000002_sealed_chat_media.sql', '20261113000003_sealed_media_keep_unattached.sql'].map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8')).join(' ');
let twice = 'ok';
try { await db.exec(again); } catch (e) { twice = e.message; }
check(twice === 'ok', 'running the migration a second time is harmless', twice);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
