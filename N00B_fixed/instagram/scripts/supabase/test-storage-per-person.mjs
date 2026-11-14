// Tests migration 20261114000013 (storage per person) on a real Postgres (PGlite) and the phone-side check (src/utils/storageRoom.ts).
//   * measuring: owner + size from storage.objects; a file without a size counts 0, without an owner counts for nobody
//   * the limit is OFF until internal_config 'storage_cap_mb' is set; admins, AI accounts, Pro accounts and "noob" are never limited
//   * nobody can read another person's number; only an admin sees the list; nothing in storage or any other table is changed
//   * the phone: refuses only when used + file > limit, with the friendly message; anything unclear lets the upload through
// Usage: node --liftoff-only scripts/supabase/test-storage-per-person.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';
import { createTestDb, asUser, asAnon, MIGRATIONS_DIR } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const MB = 1048576;
const migSql = fs.readFileSync(path.join(MIGRATIONS_DIR, '20261114000013_storage_per_person.sql'), 'utf8');

const db = await createTestDb({ upTo: '20261114000012_capped_lists.sql' });
const mkUser = async (name) => {
  const id = (await db.query('select gen_random_uuid() as id')).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query('select 1 from public.profiles where id = $1', [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $3)`, [id, name, `${name} Display`]);
  return id;
};
const ann = await mkUser('ann'), bob = await mkUser('bob'), adm = await mkUser('boss'), ai = await mkUser('robot'), pro = await mkUser('payer'), noob = await mkUser('noob'), fresh = await mkUser('fresh');
await db.query(`update public.profiles set is_admin = true where id = $1`, [adm]);
await db.query(`update public.profiles set is_ai = true where id = $1`, [ai]);
await db.query(`update public.profiles set pro_tier = 'plus' where id = $1`, [pro]);
const obj = (bucket, name, owner, size) => db.query(`insert into storage.objects (bucket_id, name, owner_id, metadata) values ($1, $2, $3, $4::jsonb)`, [bucket, name, owner, size == null ? '{}' : JSON.stringify({ size })]);
await obj('media', 'posts/a1.jpg', ann, 30 * MB);
await obj('media', 'videos/a2.mp4', ann, 15 * MB);
await obj('chatmedia', 'chat/a3.bin', ann, 2 * MB);
await obj('media', 'posts/a4.jpg', ann, null);          // no size: counts 0
await obj('media', 'posts/orphan.jpg', null, 40 * MB);  // no owner: counts for nobody
await obj('form-uploads', 'f/x.pdf', ann, 99 * MB);     // another bucket: not counted
await obj('media', 'posts/b1.jpg', bob, 60 * MB);
await obj('media', 'posts/adm.mp4', adm, 90 * MB);
await obj('media', 'posts/ai.mp4', ai, 90 * MB);
await obj('media', 'posts/pro.mp4', pro, 90 * MB);
await obj('media', 'posts/noob.mp4', noob, 90 * MB);

const tableCounts = async () => JSON.stringify((await db.query(`select (select count(*) from storage.objects) o, (select count(*) from public.profiles) p, (select count(*) from public.posts) po, (select count(*) from public.internal_config) c`)).rows);
const countsBefore = await tableCounts();
const policiesBefore = JSON.stringify((await db.query(`select policyname, cmd, qual, with_check from pg_policies where schemaname = 'storage' order by 1, 2`)).rows);
await db.exec(migSql);
await db.exec(migSql);
check(policiesBefore === JSON.stringify((await db.query(`select policyname, cmd, qual, with_check from pg_policies where schemaname = 'storage' order by 1, 2`)).rows), 'no storage policy was touched');
check(countsBefore === (await tableCounts()), 'nothing was added to or removed from any table; running it twice is fine');

const usage = (uid) => asUser(db, uid, async () => (await db.query('select public.my_storage_usage() as r')).rows[0].r);

section('1. measuring');
const u = await usage(ann);
check(u.usedBytes === 47 * MB, 'ann: 30 + 15 + 2 MB = 47 MB (a file without a size counts 0, another bucket is not counted)', String(u.usedBytes));
check((await usage(bob)).usedBytes === 60 * MB, 'bob: 60 MB; the file without an owner is nobody\'s');
check((await usage(fresh)).usedBytes === 0, 'a person with no files: 0');

section('2. the limit is off until it is switched on');
check(u.limitOn === false && u.capBytes === null && u.exempt === false, 'no setting: no limit for anybody');
await db.query(`insert into public.internal_config (key, value) values ('storage_cap_mb', '50')`);
const u2 = await usage(ann), b2 = await usage(bob);
check(u2.limitOn === true && u2.capBytes === 50 * MB && u2.usedBytes === 47 * MB, 'set to 50: ann is told 47 of 50 MB');
check(b2.capBytes === 50 * MB && b2.usedBytes > b2.capBytes, 'bob is over it (60 of 50 MB) - he is told, nothing of his is touched');
for (const [n, id] of [['an admin', adm], ['an AI account', ai], ['a Pro account', pro], ['the account called noob', noob]]) {
  const x = await usage(id);
  check(x.exempt === true && x.capBytes === null && x.limitOn === true, `${n} is never limited (90 MB used, no limit)`);
}
for (const bad of ['0', '-5', 'abc', '', '99999999', '50.5']) {
  await db.query(`update public.internal_config set value = $1 where key = 'storage_cap_mb'`, [bad]);
  check((await usage(ann)).capBytes === null, `a setting of "${bad}" is not a limit (off, never a crash)`);
}
await db.query(`delete from public.internal_config where key = 'storage_cap_mb'`);
check((await usage(bob)).capBytes === null, 'deleting the setting switches it off again');
await db.query(`insert into public.internal_config (key, value) values ('storage_cap_mb', '50')`);

section('3. who may ask what');
const failsFor = (fn) => fn().then(() => false, () => true);
check(await failsFor(() => asAnon(db, () => db.query('select public.my_storage_usage()'))), 'a visitor who is not signed in can not ask');
for (const f of ['public.storage_used_bytes(gen_random_uuid())', 'public.storage_exempt(gen_random_uuid())', 'public.storage_cap_bytes()']) {
  check(await failsFor(() => asUser(db, ann, () => db.query(`select ${f}`))), `${f.split('(')[0]} can not be called by a signed-in person (no looking at other people's numbers)`);
}
check(await failsFor(() => asUser(db, ann, () => db.query('select public.admin_storage_by_person()'))), 'an ordinary person can not read the per-person list');
const list = await asUser(db, adm, async () => (await db.query('select public.admin_storage_by_person(10) as r')).rows[0].r);
check(list.capBytes === 50 * MB && Array.isArray(list.people), 'an admin gets the limit and the list');
const row = (name) => list.people.find((p) => p.username === name);
check(row('boss').bytes === 90 * MB && row('boss').exempt === true && row('boss').overLimit === false, 'an exempt account is listed as "no limit", never over it');
check(row('bob').overLimit === true && row('ann').overLimit === false, 'bob (60 MB) is over the limit, ann (47 MB) is not');
check(list.people[0].bytes >= list.people[list.people.length - 1].bytes, 'biggest first');
check(list.people.every((p) => p.userId), 'the file without an owner is not listed');
check((await asUser(db, adm, async () => (await db.query('select public.admin_storage_by_person(1) as r')).rows[0].r)).people.length === 1, 'the limit of the list is honoured');

section('4. the phone');
const dir = path.resolve('node_modules');
const out = path.join(dir, '.cache-storageroom.mjs');
buildSync({ entryPoints: [path.resolve('src/utils/storageRoom.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const { storageRefusal, STORAGE_FULL_MESSAGE } = await import(pathToFileURL(out).href);
check(STORAGE_FULL_MESSAGE === 'Storage full: delete something to upload more.', 'the message is the agreed one');
check(storageRefusal({ usedBytes: 47 * MB, capBytes: 50 * MB }, 2 * MB) === null, '47 + 2 of 50 MB: goes up');
check(storageRefusal({ usedBytes: 47 * MB, capBytes: 50 * MB }, 3 * MB) === null, '47 + 3 = exactly 50 MB: goes up');
const msg = storageRefusal({ usedBytes: 47 * MB, capBytes: 50 * MB }, 4 * MB);
check(typeof msg === 'string' && msg.startsWith(STORAGE_FULL_MESSAGE) && msg.includes('47 MB of 50 MB'), '47 + 4 of 50 MB: refused with the message and the numbers', String(msg));
check(storageRefusal({ usedBytes: 60 * MB, capBytes: 50 * MB }, 1) !== null, 'a person already over the limit can not add more');
for (const unclear of [null, undefined, {}, { usedBytes: 5 }, { usedBytes: 5, capBytes: null }, { usedBytes: 5, capBytes: 0 }, { usedBytes: 5, capBytes: 'x' }, 'garbage', 7]) {
  check(storageRefusal(unclear, 100 * MB) === null, `unclear answer ${JSON.stringify(unclear)}: the upload goes ahead`);
}
check(storageRefusal({ usedBytes: 'x', capBytes: 50 * MB }, 1 * MB) === null && storageRefusal({ usedBytes: 1, capBytes: 50 * MB }, NaN) === null, 'unreadable numbers never refuse');
const api = read('src/services/supabaseApi.ts');
check(/await assertStorageRoom\(file, folder\);/.test(api) && /if \(folder === 'avatars'\) return;/.test(api), 'every upload asks first; profile pictures are never refused');
check(/catch \{\s*storageUsage = null;\s*\}/.test(api), 'if the question fails (network, migration not run) the upload goes ahead as before');
check(/rpc<any>\('my_storage_usage'\)/.test(api) && /countStorageSent\(file\.size\)/.test(api), 'asked at most once a minute, with what this phone sent in between added up');
check(/data-testid="storage-by-person"/.test(read('src/components/Modals/AdminStoragePanel.tsx')), 'the admin Storage tab shows the per-person list');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
