// Tests for migration 20261121000003: the "Notify me" story sticker (tap to be reminded at a time), against a real Postgres (PGlite) holding the real backup.
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
await runImport(plan, makePgAdapter(db), { log: () => {} });

const profByLegacy = Object.fromEntries((await db.query('select * from profiles')).rows.map((p) => [p.legacy_id, p]));
const idOf = (u) => profByLegacy[u.id].id;
const publicRaw = raw.users.filter((u) => u.accountType !== 'private' && !u.isAdmin);
const [a, b, c] = publicRaw.slice(0, 3).map(idOf);

const call = (uid, sql, params = []) => asUser(db, uid, async () => (await db.query(sql, params)).rows);
const rpc = async (uid, fn, ...args) => (await call(uid, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args))[0].r;
const rpcAnon = async (fn, ...args) => (await asAnon(db, async () => (await db.query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows))[0].r;

const future = new Date(Date.now() + 3600_000).toISOString();
const stickers = [
  { type: 'mention', x: 50, y: 20, data: { username: 'someone' } },
  { type: 'notify', x: 50, y: 58, width: 60, data: { title: 'New video on Friday', whenIso: future } },
];
const story = (await rpc(a, 'create_story', 'stories/notify-test.jpg', 'image', JSON.stringify(stickers))).id;

section('1. Fresh sticker');
let res = await rpc(b, 'story_notify_status', story);
check(Object.keys(res).join(',') === '1' && res['1'].mine === false && res['1'].count === 0, 'only the notify sticker is listed, nobody has tapped', JSON.stringify(res));

section('2. Tap Notify me');
let t = await rpc(b, 'story_notify_toggle', story, 1, true);
check(t.success && t.mine === true && t.count === 1, 'tapping gives a reminder', JSON.stringify(t));
t = await rpc(b, 'story_notify_toggle', story, 1, true);
check(t.count === 1, 'tapping twice is still one reminder');
await rpc(c, 'story_notify_toggle', story, 1, true);
res = await rpc(a, 'story_notify_status', story);
check(res['1'].count === 2 && res['1'].mine === false, 'the owner sees how many (2) and did not tap themselves');
t = await rpc(b, 'story_notify_toggle', story, 1, false);
check(t.mine === false && t.count === 1, 'tapping again cancels it');

section('3. Wrong input is refused');
await expectFail(() => rpc(b, 'story_notify_toggle', story, 0, true), /not found/i, 'a sticker that is not a notify button');
await expectFail(() => rpc(b, 'story_notify_toggle', story, 9, true), /not found/i, 'a position that does not exist');
const past = (await rpc(a, 'create_story', 'stories/notify-past.jpg', 'image', JSON.stringify([{ type: 'notify', x: 50, y: 50, data: { title: 'Old', whenIso: new Date(Date.now() - 3600_000).toISOString() } }]))).id;
await expectFail(() => rpc(b, 'story_notify_toggle', past, 0, true), /already passed/i, 'a time that has passed');
await expectFail(() => rpcAnon('story_notify_status', story), /./, 'a logged-out visitor');

section('4. The reminder is sent when the time comes');
await db.query("update story_reminders set remind_at = now() - interval '1 minute' where story_id = $1", [story]);
const sent = (await db.query('select public.run_story_reminders() as n')).rows[0].n;
check(sent === 1, 'one reminder is due and sent', String(sent));
const notif = (await db.query("select type, message, title from notifications where target_user_id = $1 and type = 'story_reminder'", [c])).rows;
check(notif.length === 1 && /New video on Friday/.test(notif[0].message), 'c got the notification with the title', JSON.stringify(notif));
const again = (await db.query('select public.run_story_reminders() as n')).rows[0].n;
check(again === 0, 'it is not sent twice');

section('5. The reminder outlives the story');
await db.query('delete from stories where id = $1', [story]);
const left = (await db.query('select count(*)::int as n from story_reminders where story_id = $1', [story])).rows[0].n;
check(left === 1, 'the sent row stays (it is cleared a week later)');

console.log(`
${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
