// The admin panel's new pages (User logs, Accounts, Visitors), one user's transactions, the phone lookup, and the visitor facts the app sends. The database side is test-admin-logs-accounts-db.mjs.
// Usage: node --liftoff-only scripts/supabase/test-admin-pages-ui.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const load = (p) => import(pathToFileURL(path.resolve(p)).href);

section('1. User logs: the words');
const V = await load('src/utils/adminLedgerView.ts');
const base = { at: '2026-10-20T10:00:00Z', userId: 'u1', username: 'ann', displayName: 'Ann Rao', avatar: null, email: 'ann@gmail.com', detail: null, how: null, by: null, joinedAt: null };
let d = V.describeEvent({ ...base, kind: 'joined', detail: 'iPhone' });
check(d.label === 'Joined' && /signed up on iPhone/.test(d.sentence) && d.name === 'Ann Rao @ann', 'a join says when they came and on what', JSON.stringify(d));
d = V.describeEvent({ ...base, kind: 'deleted', how: 'self' });
check(d.label === 'Deleted by themselves' && /deleted their own account/.test(d.sentence), 'a self-deletion says so');
d = V.describeEvent({ ...base, kind: 'deleted', how: 'admin', by: 'noob' });
check(d.label === 'Deleted by admin / team' && /admin \/ team deleted this account \(@noob\)/.test(d.sentence), 'an admin deletion says who');
d = V.describeEvent({ ...base, kind: 'deleted', how: 'system' });
check(/straight in the database/.test(d.sentence), 'a deletion made in the database says that');
d = V.describeEvent({ ...base, kind: 'unfinished', detail: 'google', username: null, displayName: 'Kartavya rao' });
check(d.label === 'Never finished' && /Signed in with google but did not finish/.test(d.sentence), 'a Google sign-in that stopped is explained');
const csv = V.logsToCsv([{ ...base, kind: 'deleted', how: 'self', displayName: 'Rao, "Ann"' }]);
check(csv.split('\n')[0] === 'Event,When,Name,Username,Email,How,By,Joined at' && csv.includes('"Rao, ""Ann"""'), 'the spreadsheet has a header and quotes names properly');

section('2. Accounts: what each audit finding means');
const iss = (kind, detail, username = 'cat') => ({ id: 'i', userId: 'u', username, kind, severity: 'error', detail, resolvedAt: null, resolution: null });
d = V.describeIssue(iss('balance_mismatch', { balance: 3827, ledgerBalance: 3750, difference: 77 }));
check(d.fixable && /@cat has 3,827 points, but the last line of their ledger says 3,750 \(\+77\)/.test(d.text), 'a balance that does not match its ledger', d.text);
d = V.describeIssue(iss('chain_break', { breaks: 2, totalGap: -40, example: { reason: 'Mini-game win' } }));
check(d.fixable && /2 lines where the balance does not add up \(-40 in all\)/.test(d.text) && /Mini-game win/.test(d.text), 'a broken ledger line');
d = V.describeIssue(iss('negative_balance', { balance: -3 }));
check(!d.fixable && /Adjust points/.test(d.text), 'a negative balance is for the admin to decide');
d = V.describeIssue(iss('transfer_mismatch', { transferId: 'abcdef12-0000', lines: 1, net: 40 }, null));
check(!d.fixable && /Payment ABCDEF12 has 1 line adding up to 40/.test(d.text), 'half a payment');
d = V.describeIssue(iss('no_ledger', { balance: 900 }));
check(d.fixable && /never written in a ledger/.test(d.text), 'points with no ledger');
const lcsv = V.ledgerToCsv([{ id: '1', at: 'x', userId: 'u', username: 'dan', displayName: 'Dan', avatar: null, amount: -250, reason: 'Bought a coupon', balanceAfter: 3750, transferId: null }]);
check(lcsv.includes('x,dan,Dan,-250,Bought a coupon,3750,'), 'the ledger spreadsheet');

section('3. Visitors: the words and the facts the app sends');
check(V.placeOf({ city: 'Mumbai', region: 'Maharashtra', country: 'IN' }) === 'Mumbai, Maharashtra, IN' && V.placeOf({ city: '', region: '', country: '' }) === 'Unknown place' && V.placeOf({ city: 'Delhi', region: 'Delhi', country: 'IN' }) === 'Delhi, IN', 'the place, without repeating a name');
check(V.PLATFORM_LABEL.app === 'Android app' && V.PLATFORM_LABEL.pwa === 'Home-screen app' && V.PLATFORM_LABEL.web === 'Browser', 'the three ways of opening NOOB are named');
const I = await load('src/utils/visitorInfo.ts');
const ua = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  firefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0'
};
check(JSON.stringify(I.parseUserAgent(ua.iphone)) === JSON.stringify({ browser: 'Safari', os: 'iOS 17', device: 'Phone' }), 'an iPhone', JSON.stringify(I.parseUserAgent(ua.iphone)));
check(JSON.stringify(I.parseUserAgent(ua.android)) === JSON.stringify({ browser: 'Chrome', os: 'Android 14', device: 'Phone' }), 'an Android phone');
check(JSON.stringify(I.parseUserAgent(ua.windows)) === JSON.stringify({ browser: 'Edge', os: 'Windows', device: 'Computer' }), 'a Windows computer with Edge');
check(I.parseUserAgent(ua.ipad).device === 'Tablet' && I.parseUserAgent(ua.firefox).browser === 'Firefox' && I.parseUserAgent(ua.firefox).os === 'Linux', 'a tablet, Firefox and Linux');
check(I.parseUserAgent('').browser === 'Other' && I.parseUserAgent('').device === 'Computer', 'an empty description is not a crash');
check(I.referrerHost('https://www.google.com/search?q=secret+thing', 'noobsocials.com') === 'www.google.com' && I.referrerHost('https://noobsocials.com/x', 'noobsocials.com') === '' && I.referrerHost('not a url', 'x') === '', 'only the other site\'s name is kept, never what was on its address');
check(I.newVisitorId(() => 'abcd1234-abcd-1234-abcd-123456789012') === 'abcd1234-abcd-1234-abcd-123456789012' && I.newVisitorId(() => '') === null && I.newVisitorId(() => 'ab!!') === null, 'a visitor id is made only from safe characters');
const tracker = read('src/services/visitTracker.ts');
check(/record_visit/.test(tracker) && /MIN_GAP_MS = 10 \* 60 \* 1000/.test(tracker) && /catch \{[^}]*never in the way/.test(tracker), 'the tracker calls record_visit, not more than every 10 minutes, and never gets in the way');

section('4. The phone: full number, country, the name given at sign-up');
const Ph = await load('src/utils/phoneLookup.ts');
const f = Ph.phoneFacts('🇮🇳 India (+91)', '9123456789');
check(f.e164 === '+919123456789' && f.iso === 'IN' && f.countryName === 'India' && !('truecallerUrl' in f), 'an Indian number that itself starts with 91 is not mistaken for already having its code', JSON.stringify(f));
check(Ph.phoneFacts('🇬🇧 United Kingdom (+44)', '7911 123456').e164 === '+447911123456' && Ph.phoneFacts('🇺🇸 United States (+1)', '2025550123').e164 === '+12025550123', 'other countries');
check(Ph.phoneFacts('🇮🇳 India (+91)', '') === null && Ph.phoneFacts(null, null) === null, 'no number, nothing shown');
check(Ph.isoFromLabel('🇦🇪 United Arab Emirates (+971)') === 'AE', 'the country comes from the flag in its label');

section('5. In the admin panel');
const admin = read('src/components/Modals/AdminControlModal.tsx');
check(/type AdminTab = [^;]*'userLogs'/.test(admin) && /type AdminTab = [^;]*'accounts'/.test(admin) && /type AdminTab = [^;]*'visitors'/.test(admin), 'three new pages');
for (const [tab, label] of [['userLogs', 'User logs'], ['accounts', 'Accounts'], ['visitors', 'Visitors']]) {
  check(new RegExp(`\\{main && \\(\\s*<button\\s*onClick=\\{\\(\\) => setActiveTab\\('${tab}'\\)\\}[\\s\\S]{0,420}${label}`).test(admin), `"${label}" has its own tab, for the main administrator only`);
}
check(/activeTab === 'userLogs' && main \? \(\s*<AdminUserLogsPanel \/>/.test(admin) && /activeTab === 'accounts' && main \? \(\s*<AdminAccountsPanel \/>/.test(admin) && /activeTab === 'visitors' && main \? \(\s*<AdminVisitorsPanel \/>/.test(admin), 'each tab shows its page');
check(/<AdminUserTransactions userId=\{selectedUserForDetails\.id\} \/>/.test(admin), 'one user\'s details show all that user\'s transactions');
check(/data-testid="phone-lookup"/.test(admin) && !/truecaller/i.test(admin) && /Name given at sign-up/.test(admin) && /NOOB cannot see the name a phone company has on record/.test(admin), 'the phone box shows the full number, country and the name the person typed at sign-up, and says plainly what it is');
const panels = ['AdminUserLogsPanel', 'AdminAccountsPanel', 'AdminVisitorsPanel'].map((n) => read(`src/components/Modals/${n}.tsx`));
check(panels.every((p) => /Download/.test(p) && /text\/csv/.test(p)), 'each page can be downloaded as a spreadsheet');
check(/Show more/.test(panels[0]) && /Show more/.test(panels[1]) && /Show more/.test(panels[2]), 'and pages through long lists');
check(/run-audit/.test(panels[1]) && /Settle/.test(panels[1]) && /every Sunday/.test(panels[1]) && /audit-issue/.test(panels[1]), 'Accounts: run an audit now, see each mistake in words, settle it with one tap; says it runs every Sunday');
check(/startVisitTracking\(\)/.test(read('src/App.tsx')) && /noteVisit\(true\)/.test(read('src/App.tsx')), 'the app tells the server about every open, and again after login');
const api = read('src/services/adminLedgerApi.ts');
check(['admin_user_logs', 'admin_accounts_ledger', 'admin_user_transactions', 'admin_accounting_overview', 'admin_run_accounting_audit', 'admin_fix_accounting_issue', 'admin_site_visits'].every((fn) => api.includes(`'${fn}'`)), 'every page asks the matching database function');
const mig = read('supabase/migrations/20261020000002_admin_logs_accounts_visitors.sql');
check(/cron\.schedule\('noob-weekly-audit', '0 3 \* \* 0'/.test(mig), 'the weekly audit is scheduled for Sundays 03:00');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
