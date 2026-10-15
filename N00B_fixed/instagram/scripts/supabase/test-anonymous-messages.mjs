// Tests for migration 20261015000002: Anonymous Messages, on a REAL Postgres (PGlite) with every migration applied.
// Usage: node scripts/supabase/test-anonymous-messages.mjs
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
const rpc = async (uid, fn, ...args) => asUser(db, uid, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
const rpcAnon = async (fn, ...args) => asAnon(db, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r);
// make a person's earlier messages "old", so the per-person limits (20 s / 1 h / 24 h) do not get in the way of the next scenario
const age = (uid, interval) => db.query(`update public.anon_messages set created_at = created_at - $2::interval where author_id = $1`, [uid, interval]);
const feed = () => rpcAnon('anon_messages_feed');

const admin = await mkUser('noob');
const ann = await mkUser('ann_secret');
const bob = await mkUser('bob_secret');
const cat = await mkUser('cat_secret');
const dan = await mkUser('dan_secret');
const eve = await mkUser('eve_secret');
const suspended = await mkUser('susp', { is_suspended: true });

section('1. The tables can not be touched from the app');
for (const t of ['anon_messages', 'anon_message_reports', 'anon_message_bans']) {
  await expectFail(() => asAnon(db, () => db.query(`select * from public.${t}`)), /permission denied/i, `a visitor can not read ${t} directly`);
  await expectFail(() => asUser(db, ann, () => db.query(`select * from public.${t}`)), /permission denied/i, `a member can not read ${t} directly`);
}
await expectFail(() => asUser(db, ann, () => db.query(`insert into public.anon_messages (body, author_id) values ('x', $1)`, [ann])), /permission denied/i, 'a member can not write a message around the rules');
await expectFail(() => asAnon(db, () => db.query(`select public.anon_clean_text('x')`)), /permission denied/i, 'the text cleaner is not callable from the app either');
const idx = (await db.query(`select indexname from pg_indexes where tablename = 'anon_messages'`)).rows.map((r) => r.indexname);
check(idx.includes('anon_messages_feed_idx') && idx.includes('anon_messages_author_time_idx') && idx.includes('anon_messages_author_key_idx'), 'the feed, the post limits and the retry key each have an index', idx.join(','));

section('2. An empty feed');
let f = await feed();
check(Array.isArray(f.messages) && f.messages.length === 0 && f.hasMore === false, 'a visitor who is not logged in gets an empty list', JSON.stringify(f));

section('3. Posting: what is stored and what comes back');
const first = await rpc(ann, 'anon_message_post', 'Hello, this is my first anonymous message!', 'key-1');
check(JSON.stringify(Object.keys(first).sort()) === JSON.stringify(['body', 'createdAt', 'id']), 'the answer to the author holds the id, the text and the time - nothing about who', JSON.stringify(Object.keys(first)));
f = await feed();
check(f.messages.length === 1 && f.messages[0].body === 'Hello, this is my first anonymous message!' && f.messages[0].id === first.id, 'a visitor who is not logged in sees it at once');
check(JSON.stringify(Object.keys(f.messages[0]).sort()) === JSON.stringify(['body', 'createdAt', 'id']), 'each message in the public feed has only: id, body, createdAt');
const wire = JSON.stringify(f);
check(!wire.includes(ann) && !/ann_secret|users\.nooob|author|username|email|avatar/i.test(wire), 'the public answer holds no user id, username, e-mail, picture or author field anywhere');
const stored = (await db.query(`select author_id from public.anon_messages where id = $1`, [first.id])).rows[0];
check(stored.author_id === ann, 'the private column does record who wrote it (to stop abuse), but only the server can see it');

section('4. Validation and tidying');
await age(ann, '2 hours');
await expectFail(() => rpc(ann, 'anon_message_post', ''), /Write a message first/, 'an empty message is refused');
await expectFail(() => rpc(ann, 'anon_message_post', '   \n\t  '), /Write a message first/, 'a message of only spaces is refused');
await expectFail(() => rpc(ann, 'anon_message_post', null), /Write a message first/, 'no message at all is refused');
await expectFail(() => rpc(ann, 'anon_message_post', 'a'.repeat(1001)), /at most 1000/, '1001 characters are refused');
const exactly = await rpc(ann, 'anon_message_post', 'b'.repeat(1000));
check(exactly.body.length === 1000, 'exactly 1000 characters are accepted');
await age(ann, '2 hours');
const messy = await rpc(ann, 'anon_message_post', 'Line one  \r\nLine two\r\n\r\n\r\n\r\nLine‮ three​\u0007!   ');
check(messy.body === 'Line one\nLine two\n\nLine three!', 'line endings are unified, control and direction-changing characters removed, extra blank lines squeezed', JSON.stringify(messy.body));
await age(ann, '2 hours');
const html = await rpc(ann, 'anon_message_post', '<script>alert(1)</script> <b>hi</b> & "quotes"');
check(html.body === '<script>alert(1)</script> <b>hi</b> & "quotes"', 'text is stored exactly as text (it is shown as text, never as HTML)');
await age(ann, '2 hours');
const emoji = await rpc(ann, 'anon_message_post', 'नमस्ते 👋 café');
check(emoji.body === 'नमस्ते 👋 café', 'other languages and emoji are kept');
await expectFail(() => rpc(ann, 'anon_message_post', 'x', 'k'.repeat(65)), /Invalid request|wait a moment|limit/i, 'an over-long retry key is refused');
await age(ann, '2 hours');
await expectFail(() => rpc(ann, 'anon_message_post', 'see http://a.example http://b.example https://c.example'), /more than two links/, 'more than two links are refused (spam)');
const twoLinks = await rpc(ann, 'anon_message_post', 'see http://a.example and https://b.example');
check(!!twoLinks.id, 'two links are fine');

section('5. Who can post');
await expectFail(() => rpcAnon('anon_message_post', 'hello'), /permission denied/i, 'a visitor who is not logged in can not post');
await expectFail(() => rpc(suspended, 'anon_message_post', 'hello'), /can not post right now/, 'a suspended account can not post');

section('6. Limits against spam');
await age(ann, '3 days');
const a1 = await rpc(ann, 'anon_message_post', 'one');
await expectFail(() => rpc(ann, 'anon_message_post', 'two'), /wait a moment/, 'a second message within 20 seconds is refused');
let allowed = 1;
for (const text of ['two', 'three', 'four', 'five']) { await db.query(`update public.anon_messages set created_at = created_at - interval '1 minute' where author_id = $1`, [ann]); try { await rpc(ann, 'anon_message_post', text); allowed++; } catch { /* stop */ } }
check(allowed === 5, 'five messages in an hour are allowed', String(allowed));
await db.query(`update public.anon_messages set created_at = created_at - interval '1 minute' where author_id = $1`, [ann]);
await expectFail(() => rpc(ann, 'anon_message_post', 'six'), /a lot just now/, 'the sixth within the hour is refused');
await age(ann, '2 hours');
for (let i = 0; i < 4; i++) { await rpc(ann, 'anon_message_post', `second wave ${i}`); await db.query(`update public.anon_messages set created_at = created_at - interval '2 hours' where author_id = $1 and created_at > now() - interval '1 hour'`, [ann]); }
const day = (await db.query(`select count(*)::int as n from public.anon_messages where author_id = $1 and created_at > now() - interval '24 hours'`, [ann])).rows[0].n;
check(day >= 9, 'the daily count keeps running across hours', String(day));
// fill the day to 20, then one more is refused
const missing = Math.max(0, 20 - day);
for (let i = 0; i < missing; i++) await db.query(`insert into public.anon_messages (body, author_id, created_at) values ($1, $2, now() - interval '3 hours')`, [`filler ${i}`, ann]);
await expectFail(() => rpc(ann, 'anon_message_post', 'twenty-one'), /today's limit/, 'the 21st message in a day is refused');
await age(ann, '3 days');
const repeat1 = await rpc(ann, 'anon_message_post', 'Say it again');
await age(ann, '1 hour');
await expectFail(() => rpc(ann, 'anon_message_post', 'SAY IT AGAIN'), /already shared that/, 'the same message again within a day is refused (any capital letters)');
check(!!repeat1.id, 'the first copy was accepted');

section('7. A double tap or a retry posts only once');
const k1 = await rpc(bob, 'anon_message_post', 'Posted once', 'retry-key-1');
const k2 = await rpc(bob, 'anon_message_post', 'Posted once', 'retry-key-1');
const k3 = await rpc(bob, 'anon_message_post', 'A different text, same key', 'retry-key-1');
const copies = (await db.query(`select count(*)::int as n from public.anon_messages where author_id = $1`, [bob])).rows[0].n;
check(k1.id === k2.id && k2.duplicate === true && k3.id === k1.id && copies === 1, 'the same request twice gives back the same message and creates one row', `rows=${copies}`);
const carol = await rpc(cat, 'anon_message_post', 'Another person, same key', 'retry-key-1');
check(carol.id !== k1.id && !carol.duplicate, 'the key belongs to one person (another person with the same key is a separate message)');

section('8. Newest first, and loading more');
await db.query(`delete from public.anon_messages`);
const baseTs = new Date('2026-10-01T10:00:00Z').getTime();
for (let i = 0; i < 7; i++) await db.query(`insert into public.anon_messages (id, body, author_id, created_at) values (gen_random_uuid(), $1, $2, $3)`, [`msg ${i}`, [ann, bob, cat][i % 3], new Date(baseTs + i * 60000).toISOString()]);
// two with exactly the same time: the order must still be stable and nothing skipped or repeated
await db.query(`insert into public.anon_messages (body, author_id, created_at) values ('tie a', $1, $2), ('tie b', $1, $2)`, [dan, new Date(baseTs + 3 * 60000).toISOString()]);
const p1 = await rpcAnon('anon_messages_feed', 4);
check(p1.messages.length === 4 && p1.hasMore === true, 'the first page has 4 messages and says there are more', JSON.stringify(p1.messages.map((m) => m.body)));
check(new Date(p1.messages[0].createdAt) >= new Date(p1.messages[1].createdAt) && p1.messages[0].body === 'msg 6', 'the newest message comes first');
const seen = new Set(p1.messages.map((m) => m.id));
let cursor = p1.messages[p1.messages.length - 1];
let pages = 1, all = [...p1.messages];
while (true) {
  const next = await rpcAnon('anon_messages_feed', 4, cursor.createdAt, cursor.id);
  pages++;
  for (const m of next.messages) { if (seen.has(m.id)) throw new Error('a message came twice'); seen.add(m.id); all.push(m); }
  if (!next.hasMore) break;
  cursor = next.messages[next.messages.length - 1];
  if (pages > 10) throw new Error('paging does not end');
}
check(all.length === 9 && pages === 3, 'paging through gives all 9 messages, in 3 pages, none twice, none skipped', `n=${all.length} pages=${pages}`);
const times = all.map((m) => new Date(m.createdAt).getTime());
check(times.every((t, i) => i === 0 || times[i - 1] >= t), 'the whole list is in newest-first order, including the two with the same time');
check((await rpcAnon('anon_messages_feed', 1000)).messages.length === 9 && (await rpcAnon('anon_messages_feed', 0)).messages.length === 1 && (await rpcAnon('anon_messages_feed', -5)).messages.length === 1, 'the page size is kept between 1 and 50');

section('9. Reporting');
const target = (await rpcAnon('anon_messages_feed', 1)).messages[0];
await expectFail(() => rpcAnon('anon_message_report', target.id, 'spam'), /permission denied/i, 'a visitor who is not logged in can not report');
await expectFail(() => rpc(bob, 'anon_message_report', '00000000-0000-0000-0000-000000000000', 'spam'), /no longer there/, 'reporting something that does not exist is refused');
const r1 = await rpc(bob, 'anon_message_report', target.id, 'Spam');
const r1b = await rpc(bob, 'anon_message_report', target.id, 'Spam again');
check(r1.ok && r1b.ok && (await db.query(`select count(*)::int as n from public.anon_message_reports where message_id = $1`, [target.id])).rows[0].n === 1, 'one person reporting twice counts once');
check((await rpcAnon('anon_messages_feed', 1)).messages[0].id === target.id, 'one report does not hide a message');
await rpc(cat, 'anon_message_report', target.id, 'Harassment');
const r3 = await rpc(dan, 'anon_message_report', target.id, 'Hate');
check(r3.hidden === true && !(await rpcAnon('anon_messages_feed', 50)).messages.some((m) => m.id === target.id), 'three different people reporting hides it from the feed');

section('10. The main administrator');
await expectFail(() => rpc(ann, 'anon_messages_admin_feed'), /Access denied/, 'a member can not open the moderation list');
await expectFail(() => rpcAnon('anon_messages_admin_feed'), /permission denied/i, 'a visitor can not either');
await expectFail(() => rpc(ann, 'admin_anon_message_remove', target.id), /Access denied/, 'a member can not remove a message');
await expectFail(() => rpc(ann, 'admin_anon_message_dismiss', target.id), /Access denied/, 'a member can not clear reports');
const adminList = await rpc(admin, 'anon_messages_admin_feed', 50, null, null, true);
const reported = adminList.messages.find((m) => m.id === target.id);
check(adminList.messages.length === 1 && reported && reported.reportCount === 3 && reported.hidden === true && reported.reasons.includes('Hate'), 'the administrator sees the reported message, how many reported it and why');
check(JSON.stringify(Object.keys(reported).sort()) === JSON.stringify(['body', 'createdAt', 'hidden', 'id', 'reasons', 'reportCount']), 'and never who wrote it');
const everything = JSON.stringify(await rpc(admin, 'anon_messages_admin_feed', 100));
check(![ann, bob, cat, dan].some((id) => everything.includes(id)) && !/_secret/.test(everything), 'nothing in the administrator\'s answers names or identifies an author');
const author = (await db.query(`select author_id from public.anon_messages where id = $1`, [target.id])).rows[0].author_id;
await rpc(admin, 'admin_anon_message_dismiss', target.id);
check((await rpcAnon('anon_messages_feed', 50)).messages.some((m) => m.id === target.id) && (await db.query(`select count(*)::int as n from public.anon_message_reports where message_id = $1`, [target.id])).rows[0].n === 0, '"This is fine" shows it again and clears the reports');
await rpc(admin, 'admin_anon_message_remove', target.id, true);
check(!(await rpcAnon('anon_messages_feed', 50)).messages.some((m) => m.id === target.id), 'removing takes it out of the feed for everyone');
const banned = (await db.query(`select 1 from public.anon_message_bans where user_id = $1`, [author])).rows.length === 1;
check(banned, 'and, if asked, stops that author from sharing again - without anyone being told who it was');
await age(author, '5 days');
await expectFail(() => rpc(author, 'anon_message_post', 'I am back'), /no longer share/, 'the blocked author can not post');
const others = [ann, bob, cat, dan].filter((id) => id !== author);
await age(others[0], '5 days');
const okOther = await rpc(others[0], 'anon_message_post', 'Someone else can still post');
check(!!okOther.id, 'everyone else can');
await expectFail(() => rpc(admin, 'admin_anon_message_remove', target.id), /no longer there/, 'removing the same message twice says so');
const log = (await db.query(`select action, details from public.admin_audit_log where action like 'anon_message_%' order by created_at`)).rows;
check(log.length === 2 && log.map((r) => r.action).join() === 'anon_message_dismissed,anon_message_removed' && log.every((r) => !JSON.stringify(r.details).includes(author)), 'every moderation action is written to the activity log, without the author', String(log.length));

section('11. An account is deleted');
const solo = await mkUser('leaver');
const mine = await rpc(solo, 'anon_message_post', 'I was here');
await db.query(`delete from auth.users where id = $1`, [solo]);
const left = (await db.query(`select author_id, removed_at from public.anon_messages where id = $1`, [mine.id])).rows[0];
check(left && left.author_id === null && left.removed_at === null, 'the message stays, and its private author link is emptied: nothing points to anyone any more');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
