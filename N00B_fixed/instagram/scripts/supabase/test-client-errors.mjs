// Automatic error reports + "Report a problem" (migration 20261112000006).
//   1. the pure reporter rules (src/utils/errorReporterCore.ts): noise filter, same-error key, once per page load / at most 10, path only, scrubbing, platform;
//   2. the screens are wired (main.tsx, ErrorBoundary, Settings Help + search row, the sheet, the admin tab);
//   3. the SQL on a REAL Postgres (PGlite) with every migration applied: truncation, de-duplication, rate limits, admin-only reads, anon cannot read, purge.
// Usage: node --liftoff-only scripts/supabase/test-client-errors.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

section('1. The reporter rules (pure functions)');
const out = path.resolve('node_modules/.cache-error-reporter-core.mjs');
buildSync({ entryPoints: [path.resolve('src/utils/errorReporterCore.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const R = await import(pathToFileURL(out).href);
check(R.isNoise({ message: 'ResizeObserver loop completed with undelivered notifications.' }), 'ResizeObserver loop is ignored');
check(R.isNoise({ message: 'ResizeObserver loop limit exceeded' }), 'the older ResizeObserver wording is ignored too');
check(R.isNoise({ message: 'AbortError: The user aborted a request.' }) && R.isNoise({ message: 'signal is aborted without reason' }), 'AbortError is ignored');
check(R.isNoise({ message: 'Script error.' }), '"Script error." (another origin, no details) is ignored');
check(R.isNoise({ message: 'Failed to fetch' }, false) && R.isNoise({ message: 'Load failed' }, false), 'network failures are ignored while offline');
check(!R.isNoise({ message: 'Failed to fetch' }, true), 'but "Failed to fetch" while online is kept');
check(R.isNoise({ message: 'x is not a function', stack: 'at chrome-extension://abc/content.js:1:1' }), 'errors from browser extensions are ignored');
check(R.isNoise({ message: 'boom', source: 'https://ads.example.net/a.js' }, true, 'https://nooob.xyz'), 'a script from another website without a stack is ignored');
check(!R.isNoise({ message: 'boom', source: 'https://nooob.xyz/assets/a.js', stack: 'Error: boom\n at a' }, true, 'https://nooob.xyz'), 'an error from our own script is kept');
check(!R.isNoise({ message: "Cannot read properties of undefined (reading 'id')", stack: 'TypeError\n at f (https://nooob.xyz/assets/a.js:1:2)' }), 'a real error is kept');
check(R.isNoise({ message: '' }), 'an empty message is ignored');

const a = R.clientFingerprint('error', 'boom', 'Error: boom\n at one\n at two');
check(a === R.clientFingerprint('error', 'boom', 'Error: boom\n at one\n at three'), 'same message + same first stack line = same key');
check(a !== R.clientFingerprint('error', 'boom', 'Error: other\n at one') && a !== R.clientFingerprint('rejection', 'boom', 'Error: boom\n at one'), 'another message / kind / first line = another key');
const gate = R.createGate(10);
check(gate('a') && !gate('a'), 'the same error is sent once per page load');
let sent = 0; for (let i = 0; i < 30; i++) if (gate('k' + i)) sent++;
check(sent === 9, `at most 10 reports per page load (1 used + ${sent} more)`, String(sent));
check(R.cutMessage('x'.repeat(900)).length === 500 && R.cutStack('x'.repeat(9000)).length === 4000 && R.cutNote('x'.repeat(2000)).length === 1000 && R.cutOther('x'.repeat(900)).length === 300, 'texts are cut to 500 / 4000 / 1000 / 300');
check(R.pathOnly('https://nooob.xyz/f/abc?token=1#x') === '/f/abc' && R.pathOnly('/profile?x=1') === '/profile' && R.pathOnly('') === '', 'the page is the path only (no query, no #)');
const sc = R.scrubText('at https://nooob.xyz/a.js?token=SECRET#h and ann@example.com eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcDEF123');
check(!/SECRET|ann@example|eyJhbG/.test(sc) && /nooob\.xyz\/a\.js/.test(sc), 'query strings, e-mail addresses and login tokens are removed from texts');
check(R.detectPlatform({ native: true }) === 'android-app' && R.detectPlatform({ ua: 'Mozilla iPhone', standalone: true }) === 'ios-pwa' && R.detectPlatform({ ua: 'Mozilla iPhone', standalone: false }) === 'web' && R.detectPlatform({ ua: 'Windows' }) === 'web', 'platform: web / ios-pwa / android-app');

section('2. The screens are wired');
const main = read('src/main.tsx');
check(/installErrorReporter\(\);/.test(main) && /<ReportProblemHost \/>/.test(main), 'main.tsx: the reporter is installed once and the sheet host is mounted');
const eb = read('src/components/ErrorBoundary.tsx');
check(/reportError\('boundary', error\)/.test(eb), 'ErrorBoundary: componentDidCatch reports');
const rep = read('src/utils/errorReporter.ts');
check(/addEventListener\('error'/.test(rep) && /addEventListener\('unhandledrejection'/.test(rep) && /report_client_error/.test(rep) && /catch \{ \/\* never throw/.test(rep), 'errorReporter: error + unhandledrejection handlers, calls report_client_error, never throws');
check(/p_page: cutOther\(currentPage\(\)\)/.test(rep) && /pathOnly\(location\.pathname\)/.test(rep), 'errorReporter: only the path is sent');
const sheet = read('src/components/Common/ReportProblemSheet.tsx');
check(/What went wrong\?/.test(sheet) && /Thank you - we got it/.test(sheet) && /Cancel/.test(sheet) && /No screenshots/.test(sheet) && /sendUserReport/.test(sheet), 'sheet: textarea, attached line, Send/Cancel, thank-you state');
const css = read('src/components/Common/reportProblem.css');
check(/#f8cb46/i.test(css) && /#0c831f/i.test(css) && /#121212/i.test(css) && /:root\[data-theme="light"\] \.rp-sheet/.test(css), 'reportProblem.css: yellow band, green buttons, #121212 page, and a light theme');
check(/openReportProblem/.test(read('src/components/Settings/types.ts')) && /openReportProblem: \(\) => openReportProblem\(\)/.test(read('src/components/Profile/ProfileView.tsx')), 'Settings actions: openReportProblem exists and opens the sheet');
check(/action: 'openReportProblem'/.test(read('src/components/Settings/registry.ts')) && /help-report-problem/.test(read('src/components/Settings/pages/support.tsx')), 'Settings: a "Report a problem" row on the Help page and in search');
const adm = read('src/components/Modals/AdminControlModal.tsx');
check(/\{main && \(\s*<button\s+onClick=\{\(\) => setActiveTab\('errors'\)\}/.test(adm) && /activeTab === 'errors' && main/.test(adm), 'admin: an Errors tab, main admin only');
const panel = read('src/components/Modals/AdminErrorsPanel.tsx');
check(/errors-clear-confirm/.test(panel) && /aria-expanded/.test(panel) && /r\.stack/.test(panel) && /r\.note/.test(panel), 'admin panel: Clear asks first, rows expand to the stack, the user note is shown');
const api = read('src/services/supabaseApi.ts');
check(/'admin_client_errors'/.test(api) && /'admin_clear_client_errors'/.test(api), 'API layer calls the two admin functions');

section('3. The SQL file');
const sql = read('supabase/migrations/20261112000006_client_errors.sql');
check(!/\bdrop\s+(table|column|function|index|policy)\b/i.test(sql) && !/\balter\s+table\s+(?!public\.client_error\w*\s+enable row level security)/i.test(sql) && !/\btruncate\b/i.test(sql), 'additive only: no drop, no truncate, alter table only to switch on row-level security of the two new tables');

section('4. The SQL on a real Postgres (every migration applied)');
const { createTestDb, asUser, asAnon } = await import('./pg-test-env.mjs');
const db = await createTestDb();
const mkUser = async (name) => {
  const id = (await db.query('select gen_random_uuid() as id')).rows[0].id;
  await db.query(`insert into auth.users (id, email, encrypted_password) values ($1, $2, extensions.crypt('secret pass', extensions.gen_salt('bf')))`, [id, `${name}@users.nooob.xyz`]);
  if (!(await db.query('select 1 from public.profiles where id = $1', [id])).rows.length) await db.query('insert into public.profiles (id, username, display_name) values ($1, $2, $2)', [id, name]);
  return id;
};
const ann = await mkUser('ann'), adm1 = await mkUser('boss');
await db.query('update public.profiles set is_admin = true where id = $1', [adm1]);
const rep1 = (kind, msg, stack, extra = {}) => [kind, msg, stack, extra.page ?? '/home', extra.ver ?? '1700', extra.plat ?? 'web', extra.ua ?? 'UA', extra.note ?? null];
const SEND = `select public.report_client_error($1,$2,$3,$4,$5,$6,$7,$8)`;
const asAnn = (args) => asUser(db, ann, () => db.query(SEND, args));
const rows = async () => (await db.query('select * from public.client_errors order by id')).rows;

await asAnon(db, () => db.query(SEND, rep1('error', 'x'.repeat(900), 's'.repeat(9000), { page: 'p'.repeat(500), ver: 'v'.repeat(500), plat: 'f'.repeat(500), ua: 'u'.repeat(500) })));
let r = (await rows())[0];
check(r && r.message.length === 500 && r.stack.length === 4000 && r.page.length === 300 && r.app_version.length === 300 && r.platform.length === 300 && r.user_agent.length === 300, 'visitors can report (before login) and every field is cut: 500 / 4000 / 300');
check(r.user_id === null && r.count === 1 && !!r.fingerprint, 'a visitor has no user id; count starts at 1; a fingerprint is stored');
await asAnn(['user_report', 'User report', null, '/home', '1700', 'web', 'UA', 'n'.repeat(2000)]);
r = (await rows())[1];
check(r.note.length === 1000 && r.user_id === ann && r.kind === 'user_report', 'a note is cut to 1000 and the user id comes from the login');
await asAnn(rep1('error', 'same thing', 'Error: same\n at f'));
await asAnn(rep1('error', 'same thing', 'Error: same\n at f\n at other'));
await asAnn(rep1('error', 'same thing', 'Error: same\n at f'));
let all = await rows();
const same = all.filter((x) => x.message === 'same thing');
check(same.length === 1 && same[0].count === 3, 'the same error inside 24 h is ONE row with a counter (3)', JSON.stringify(same.map((x) => x.count)));
await db.query(`update public.client_errors set last_seen = now() - interval '25 hours' where message = 'same thing'`);
await asAnn(rep1('error', 'same thing', 'Error: same\n at f'));
check((await rows()).filter((x) => x.message === 'same thing').length === 2, 'after 24 h the same error is a new row');
await asAnn(['user_report', 'User report', null, '/home', '1', 'web', 'UA', 'first note']);
await asAnn(['user_report', 'User report', null, '/home', '1', 'web', 'UA', 'second note']);
check((await rows()).filter((x) => x.kind === 'user_report' && /note/.test(x.note || '')).length === 2, 'two different user notes are two rows (never merged)');
const before = (await rows()).length;
await asAnn(['bogus', 'x', null, '/', '1', 'web', 'UA', null]);
check((await rows()).length === before, 'an unknown kind is dropped quietly (no error)');

// rate limit: 30 per hour per logged-in person
await db.query('delete from public.client_error_rate');
const bob = await mkUser('bob');
for (let i = 0; i < 40; i++) await asUser(db, bob, () => db.query(SEND, rep1('error', 'unique ' + i, 'E\n at ' + i)));
check((await db.query(`select count(*)::int n from public.client_errors where user_id = $1`, [bob])).rows[0].n === 30, 'a logged-in person can send 30 reports an hour, the rest are dropped quietly');
const carl = await mkUser('carl');
await asUser(db, carl, () => db.query(SEND, rep1('error', 'carl one', 'E\n at c')));
check((await db.query(`select count(*)::int n from public.client_errors where user_id = $1`, [carl])).rows[0].n === 1, 'one person hitting the limit does not block another');
await db.query('delete from public.client_error_rate');
for (let i = 0; i < 320; i++) await asAnon(db, () => db.query(SEND, rep1('error', 'visitor ' + i, 'E\n at v' + i)));
check((await db.query(`select count(*)::int n from public.client_errors where message like 'visitor %'`)).rows[0].n === 300, 'visitors who are not logged in share 300 an hour');

// who can read
const msg = async (fn) => { try { await fn(); return ''; } catch (e) { return e.message; } };
check(/permission denied/i.test(await msg(() => asAnon(db, () => db.query('select * from public.client_errors')))), 'a visitor cannot read the table');
check(/permission denied/i.test(await msg(() => asUser(db, ann, () => db.query('select * from public.client_errors')))), 'a logged-in person cannot read the table');
check(/permission denied/i.test(await msg(() => asUser(db, ann, () => db.query('delete from public.client_errors')))), 'and cannot delete from it');
check(/permission denied/i.test(await msg(() => asAnon(db, () => db.query('select * from public.admin_client_errors()')))), 'a visitor cannot call admin_client_errors');
check(/Admin only/.test(await msg(() => asUser(db, ann, () => db.query('select * from public.admin_client_errors()')))), 'an ordinary person is refused by admin_client_errors (checked in SQL)');
check(/Admin only/.test(await msg(() => asUser(db, ann, () => db.query('select public.admin_clear_client_errors()')))), 'an ordinary person is refused by admin_clear_client_errors');
check(/permission denied/i.test(await msg(() => asUser(db, ann, () => db.query('select public.purge_client_errors()')))), 'nobody can call purge_client_errors from the app');

const list = await asUser(db, adm1, async () => (await db.query('select * from public.admin_client_errors(500, interval \'7 days\')')).rows);
const grp = list.find((x) => x.message === 'same thing');
check(list.length > 5 && grp && Number(grp.total_count) === 4 && Number(grp.users) === 1, 'admin sees the errors grouped by fingerprint (the "same thing" row group counts 3 + 1 = 4)', JSON.stringify(grp));
check(list.every((x, i) => i === 0 || new Date(list[i - 1].last_seen) >= new Date(x.last_seen)), 'newest first');
check(list.some((x) => x.kind === 'user_report' && x.note === 'first note'), 'user notes are in the list');
check((await asUser(db, adm1, async () => (await db.query('select * from public.admin_client_errors(2)')).rows)).length === 2, 'the limit works');

// purge
await db.query(`update public.client_errors set last_seen = now() - interval '31 days' where message = 'carl one'`);
const purged = (await db.query('select public.purge_client_errors() as n')).rows[0].n;
check(purged === 1 && !(await rows()).some((x) => x.message === 'carl one'), 'purge removes reports older than 30 days (and only those)');
// clear
const cleared = await asUser(db, adm1, async () => (await db.query('select public.admin_clear_client_errors() as n')).rows[0].n);
check(cleared > 0 && (await rows()).length === 0, 'the admin can clear everything');

// the hard ceiling
await db.query(`insert into public.client_errors (kind, message, fingerprint) select 'error', 'f' || g, 'fp' || g from generate_series(1, 5000) g`);
await db.query('delete from public.client_error_rate');
await asAnn(rep1('error', 'over the ceiling', 'E\n at z'));
check((await rows()).length === 5000, 'at most 5000 rows are ever held (a new error is dropped when full)');
await db.query('delete from public.client_errors');

section('5. The database security audit passes');
const fns = (await db.query(`select p.proname, has_function_privilege('anon', p.oid, 'execute') a from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('report_client_error','admin_client_errors','admin_clear_client_errors','purge_client_errors')`)).rows;
const f = Object.fromEntries(fns.map((x) => [x.proname, x.a]));
check(f.report_client_error === true && f.admin_client_errors === false && f.admin_clear_client_errors === false && f.purge_client_errors === false, 'only report_client_error is open to visitors; the three others are closed');
check((await db.query(`select relrowsecurity from pg_class where relname in ('client_errors','client_error_rate')`)).rows.every((x) => x.relrowsecurity) && (await db.query(`select count(*)::int n from pg_policies where tablename in ('client_errors','client_error_rate')`)).rows[0].n === 0, 'both tables have row-level security on and no policies');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
