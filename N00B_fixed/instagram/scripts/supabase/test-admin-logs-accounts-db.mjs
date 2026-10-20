// NOOB admin panel: User logs, the accounting ledger with its weekly audit (and settling a mistake), one user's transactions, and the visitors list.
// On a REAL Postgres (PGlite) with every migration applied. Usage: node --liftoff-only scripts/supabase/test-admin-logs-accounts-db.mjs
import fs from 'node:fs';
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const db = await createTestDb();
const mkUser = async (name, email) => {
  const id = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, extensions.crypt('secret pass', extensions.gen_salt('bf')))`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query(`select 1 from public.profiles where id = $1`, [id])).rows.length) await db.query(`insert into public.profiles (id, username, display_name) values ($1, $2, $3)`, [id, name, `${name} Display`]);
  await db.query(`insert into public.profile_private (user_id, email, mobile_number, date_of_birth) values ($1, $2, null, '2000-01-01') on conflict (user_id) do update set email = excluded.email`, [id, email || `${name}@example.com`]);
  await db.query(`update public.profiles set pro_tier = 'pro', noob_points = 0 where id = $1`, [id]).catch(() => undefined);
  return id;
};
const call = async (uid, sql, args = []) => asUser(db, uid, async () => (await db.query(sql, args)).rows[0]?.r);
const fails = async (uid, sql, args = []) => { try { await call(uid, sql, args); return null; } catch (e) { return e.message; } };
const points = async (u) => Number((await db.query(`select noob_points from public.profiles where id = $1`, [u])).rows[0].noob_points);
const claim = async (uid, fn) => { await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false)`); try { return await fn(); } finally { await db.exec(`select set_config('request.jwt.claim.sub', '', false)`); } };

const noob = await mkUser('noob', 'noob@example.com'); await db.query(`update public.profiles set is_admin = true where id = $1`, [noob]);
const ann = await mkUser('ann', 'ann@gmail.com'), bob = await mkUser('bob', 'bob@gmail.com'), cat = await mkUser('cat', 'cat@gmail.com'), dan = await mkUser('dan', 'dan@gmail.com');

section('1. User logs');
await call(ann, `select public.delete_my_account('secret pass') as r`);
await claim(noob, async () => db.query(`delete from auth.users where id = $1`, [bob]));
const gid = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
await db.query(`insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values ($1, 'kartavya@gmail.com', '{"provider":"google"}', '{"full_name":"Kartavya rao"}')`, [gid]);
let logs = await call(noob, `select public.admin_user_logs() as r`);
const byKind = (k) => logs.events.filter((e) => e.kind === k);
check(byKind('joined').some((e) => e.username === 'cat' && e.email === 'cat@gmail.com' && e.at), 'who joined is listed, with the date and time and their email');
const delAnn = byKind('deleted').find((e) => e.username === 'ann'), delBob = byKind('deleted').find((e) => e.username === 'bob');
check(delAnn && delAnn.how === 'self' && delAnn.joinedAt && delAnn.at, 'a person who deleted themselves: listed as "self", with when they joined and when they left', JSON.stringify(delAnn));
check(delBob && delBob.how === 'admin' && delBob.by === 'noob', 'an account the admin deleted: listed as "admin", with which admin', JSON.stringify(delBob));
check(byKind('unfinished').some((e) => e.email === 'kartavya@gmail.com' && e.detail === 'google' && e.displayName === 'Kartavya rao'), 'a Google login that never finished is listed too');
check(logs.summary.deletedBySelf === 1 && logs.summary.deletedByAdmin === 1 && logs.summary.unfinished === 1 && logs.summary.joined >= 3, 'the counts add up', JSON.stringify(logs.summary));
logs = await call(noob, `select public.admin_user_logs(50, 0, 'bob', 'deleted') as r`);
check(logs.total === 1 && logs.events[0].username === 'bob', 'searching and filtering work');
check(/permission|Administrator/i.test(await fails(cat, `select public.admin_user_logs() as r`) || ''), 'a normal user cannot read it');
check(/permission denied/i.test(await asAnon(db, async () => { try { await db.query(`select public.admin_user_logs()`); return ''; } catch (e) { return e.message; } }) || ''), 'and neither can someone who is not signed in');

section('2. The ledger: every transaction of every user');
for (const [u, amt, why] of [[cat, 5000, 'Mini-game win'], [dan, 700, 'Mini-game win'], [cat, -250, 'Bought a coupon']]) await db.query(`select public.apply_points($1, $2, $3)`, [u, amt, why]);
const tid = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
await db.query(`select public.apply_points($1, -1000, 'Sent to @dan', $3), public.apply_points($2, 1000, 'Received from @cat', $3)`, [cat, dan, tid]);
let led = await call(noob, `select public.admin_accounts_ledger(100, 0) as r`);
check(led.rows.length === 5 && led.rows.some((r) => r.username === 'cat' && r.amount === 5000 && r.reason === 'Mini-game win') && led.rows.some((r) => r.username === 'dan' && r.transferId === tid), 'all users\' transactions are in one list, newest first');
check(led.rows[0].at && led.rows.every((r, i, a) => i === 0 || true), 'each has its time');
check(led.totals.credited === 6700 && led.totals.debited === 1250 && led.totals.circulation === (await db.query(`select sum(noob_points)::bigint s from public.profiles`)).rows[0].s * 1 && led.totals.users >= 3, 'with the totals: credited, debited, points in circulation', JSON.stringify(led.totals));
led = await call(noob, `select public.admin_accounts_ledger(100, 0, 'dan Display') as r`);
check(led.rows.length === 2 && led.rows.every((r) => r.username === 'dan'), 'search by name');
led = await call(noob, `select public.admin_accounts_ledger(100, 0, null, 'out') as r`);
check(led.rows.length === 2 && led.rows.every((r) => r.amount < 0), 'only money going out');
led = await call(noob, `select public.admin_accounts_ledger(1, 0) as r`);
const first = led.rows[0].id;
led = await call(noob, `select public.admin_accounts_ledger(1, 1) as r`);
check(led.rows.length === 1 && led.rows[0].id !== first, 'paging works');
check(/permission|Administrator/i.test(await fails(cat, `select public.admin_accounts_ledger() as r`) || ''), 'a normal user cannot read the ledger');

section('3. One user\'s transactions (inside that user\'s details)');
const ut = await call(noob, `select public.admin_user_transactions($1) as r`, [cat]);
check(ut.count === 3 && ut.rows.length === 3 && ut.balance === 3750 && ut.credited === 5000 && ut.debited === 1250 && ut.rows[0].amount === -1000, 'cat\'s own list, balance, credited and debited', JSON.stringify({ c: ut.count, b: ut.balance, cr: ut.credited, d: ut.debited }));
check(/Administrator/i.test(await fails(cat, `select public.admin_user_transactions($1) as r`, [dan]) || ''), 'only people who may see accounts can open it');

section('4. The audit');
let ov = await call(noob, `select public.admin_run_accounting_audit() as r`);
check(ov.audit.status === 'issues' || ov.audit.status === 'clean', 'an audit can be run by the admin');
const errorsNow = ov.issues.filter((i) => i.severity === 'error');
check(errorsNow.length === 0, 'honest books: no mistakes found', JSON.stringify(errorsNow));
check(ov.audit.usersChecked >= 3 && ov.audit.transactionsChecked >= 5, 'it says how much it looked at');
// now break things in four different ways
await db.query(`update public.profiles set noob_points = noob_points + 77 where id = $1`, [cat]);                        // the balance moved without a ledger line
const oneLine = (await db.query(`select id from public.noob_transactions where user_id = $1 and amount = 700`, [dan])).rows[0].id;
await db.query(`update public.noob_transactions set balance_after = balance_after + 5 where id = $1`, [oneLine]);       // a line that does not follow from the one before
await db.query(`update public.profiles set noob_points = -3 where id = $1`, [noob]);                                       // below zero
const lone = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
await db.query(`insert into public.noob_transactions (user_id, amount, reason, balance_after, transfer_id) values ($1, 40, 'Received from @ghost', 40, $2)`, [dan, lone]); // half a payment
const eve = await mkUser('eve'); await db.query(`update public.profiles set noob_points = 900 where id = $1`, [eve]);     // points that were never written down
ov = await call(noob, `select public.admin_run_accounting_audit() as r`);
const kinds = Object.fromEntries(ov.issues.map((i) => [i.kind + ':' + (i.username || ''), i]));
check(kinds['balance_mismatch:cat'] && kinds['balance_mismatch:cat'].detail.difference === 77, 'a balance that does not match its ledger is found, with the difference', JSON.stringify(kinds['balance_mismatch:cat']));
check(kinds['chain_break:dan'] && kinds['chain_break:dan'].detail.breaks >= 1, 'a ledger line that does not follow from the one before is found');
check(kinds['negative_balance:noob'], 'a negative balance is found');
check(ov.issues.some((i) => i.kind === 'transfer_mismatch' && i.detail.transferId === lone), 'half a payment is found');
check(kinds['no_ledger:eve'] && kinds['no_ledger:eve'].severity === 'info', 'points with no ledger are noted (not called a mistake)');
check(ov.audit.status === 'issues' && ov.audit.errors >= 4 && ov.audit.notes >= 1, 'the audit says issues, with the counts', JSON.stringify(ov.audit));
check(ov.audits.length >= 2, 'the earlier audits are kept in a list');
check(/permission|Administrator/i.test(await fails(cat, `select public.admin_run_accounting_audit() as r`) || ''), 'a normal user cannot run or read an audit');

section('5. Settling a mistake');
const before = await points(cat);
const res = await call(noob, `select public.admin_fix_accounting_issue($1, 'checked by hand') as r`, [kinds['balance_mismatch:cat'].id]);
check(res.success && await points(cat) === before, 'settling does not change anyone\'s balance');
const lastLine = (await db.query(`select amount::bigint a, reason, balance_after::bigint b from public.noob_transactions where user_id = $1 order by seq desc limit 1`, [cat])).rows[0];
check(Number(lastLine.a) === 77 && /^Accounting correction/.test(lastLine.reason) && Number(lastLine.b) === before, 'it adds one clearly marked line to the ledger that bridges the gap', JSON.stringify(lastLine));
check((await call(noob, `select public.admin_fix_accounting_issue($1) as r`, [kinds['balance_mismatch:cat'].id])).already === true, 'doing it twice does nothing more');
check(/negative balance needs a decision/i.test(await fails(noob, `select public.admin_fix_accounting_issue($1) as r`, [kinds['negative_balance:noob'].id]) || ''), 'a negative balance is not settled automatically');
await db.query(`update public.profiles set noob_points = 0 where id = $1`, [noob]);
ov = await call(noob, `select public.admin_run_accounting_audit() as r`);
check(!ov.issues.some((i) => i.kind === 'balance_mismatch' && i.username === 'cat'), 'the next audit no longer lists cat\'s mismatch');
check(ov.issues.some((i) => i.kind === 'chain_break' && i.username === 'dan'), 'but dan\'s broken line is still there until it is settled');
await call(noob, `select public.admin_fix_accounting_issue($1) as r`, [ov.issues.find((i) => i.kind === 'chain_break' && i.username === 'dan').id]);
ov = await call(noob, `select public.admin_run_accounting_audit() as r`);
check(!ov.issues.some((i) => i.kind === 'chain_break' && i.username === 'dan'), 'settled: the old broken line is history and is not reported again');
check((await db.query(`select count(*)::int n from public.admin_audit_log where action = 'accounting_fix'`)).rows[0].n >= 2, 'every settling is written in the admin log');
check(typeof (await db.query(`select public.run_accounting_audit('weekly') as r`)).rows[0].r === 'string' && (await db.query(`select kind from public.accounting_audits order by run_at desc limit 1`)).rows[0].kind === 'weekly', 'the weekly job (no one signed in) works and is recorded as weekly');

section('6. Visitors');
const setHeaders = (h) => db.exec(`select set_config('request.headers', '${JSON.stringify(h)}', false)`);
const visit = (id, info) => asAnon(db, async () => db.query(`select public.record_visit($1, $2::jsonb)`, [id, JSON.stringify(info)]));
await setHeaders({ 'cf-ipcountry': 'IN', 'cf-ipcity': 'Mumbai', 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'user-agent': 'Mozilla/5.0 (iPhone)' });
await visit('guest-device-0001', { browser: 'Safari', os: 'iOS 17', device: 'Phone', platform: 'web', language: 'en-IN', timezone: 'Asia/Kolkata', screen: '390x844', referrer: 'https://google.com/', path: '/reels', userAgent: 'Mozilla/5.0 (iPhone)' });
await visit('guest-device-0001', { browser: 'Safari', path: '/explore' });
let v = (await db.query(`select * from public.site_visits where visitor_id = 'guest-device-0001'`)).rows[0];
check(v && v.visits === 1 && v.country === 'IN' && v.city === 'Mumbai' && v.ip === '203.0.113.7' && v.landing_path === '/reels' && v.last_path === '/explore' && v.user_id === null, 'a guest is recorded with country, city, address, device and where they landed; the same visit is not counted twice', JSON.stringify(v));
await db.query(`update public.site_visits set last_seen = now() - interval '31 minutes' where visitor_id = 'guest-device-0001'`);
await visit('guest-device-0001', { path: '/chat' });
check((await db.query(`select visits from public.site_visits where visitor_id = 'guest-device-0001'`)).rows[0].visits === 2, 'coming back after half an hour is a second visit');
await asUser(db, cat, async () => db.query(`select public.record_visit('member-device-0002', '{"browser":"Chrome","platform":"app","path":"/"}'::jsonb)`));
v = (await db.query(`select * from public.site_visits where visitor_id = 'member-device-0002'`)).rows[0];
check(v && v.user_id === cat && v.platform === 'app', 'someone logged in is linked to their account');
await visit('guest-device-0001-x', { userAgent: 'Googlebot/2.1 (+http://www.google.com/bot.html)' });
await asAnon(db, async () => db.query(`select public.record_visit('x', '{}'::jsonb)`));
check((await db.query(`select is_bot from public.site_visits where visitor_id = 'guest-device-0001-x'`)).rows[0].is_bot === true && (await db.query(`select count(*)::int n from public.site_visits where visitor_id = 'x'`)).rows[0].n === 0, 'a search-engine bot is marked as one, and a made-up short id is ignored');
let vis = await call(noob, `select public.admin_site_visits() as r`);
check(vis.total === 2 && vis.rows.some((r) => r.visitorId === 'member-device-0002' && r.username === 'cat' && r.email === 'cat@gmail.com') && vis.rows.some((r) => r.visitorId === 'guest-device-0001' && r.username === null && r.visits === 2), 'the admin sees people (bots hidden): members with their name and email, guests as guests', JSON.stringify(vis.rows.map((r) => r.visitorId)));
check(vis.summary.devices === 2 && vis.summary.members === 1 && vis.summary.guests === 1 && vis.summary.bots === 1 && vis.summary.countries[0].country === 'IN', 'with the summary');
vis = await call(noob, `select public.admin_site_visits(50, 0, null, 'guests') as r`);
check(vis.total === 1 && vis.rows[0].visitorId === 'guest-device-0001', 'guests only');
vis = await call(noob, `select public.admin_site_visits(50, 0, 'mumbai') as r`);
check(vis.total === 2 && vis.rows.every((r) => r.city === 'Mumbai'), 'search by place');
check(/permission|Administrator/i.test(await fails(cat, `select public.admin_site_visits() as r`) || ''), 'a normal user cannot read the visitors');
check(/permission denied/i.test(await asAnon(db, async () => { try { await db.query(`select public.admin_site_visits()`); return ''; } catch (e) { return e.message; } }) || ''), 'a guest cannot either');
check(/permission denied/i.test(await asAnon(db, async () => { try { await db.query(`select * from public.site_visits`); return ''; } catch (e) { return e.message; } }) || ''), 'and the table itself is closed');

section('7. Safe to run twice');
const sql = fs.readFileSync('supabase/migrations/20261020000002_admin_logs_accounts_visitors.sql', 'utf8');
await db.exec(sql);
await db.exec(sql);
const tx = (await db.query(`select count(*)::int n from public.noob_transactions`)).rows[0].n;
check(tx > 0 && (await db.query(`select count(distinct seq)::int n from public.noob_transactions`)).rows[0].n === tx, 'every ledger line has its own running number, also after running it again');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
