// The app side of: (1) the NOOB logo on the sign-in page, written straight onto the page (no box, no tile); (2) the "Something went wrong / Reload NOOB" page, dressed in the same
// doodle theme as the sign-in page; (3) the admin's Daily NOOB page and Storage page, and the cleanup calls the app makes. (The database side is tested on a real Postgres in
// test-storage-cleanup.mjs, the Edge Function side in test-purge-media-function.mjs. Tried in a real browser too: the sign-in page, the error page in dark and light, both admin pages.)
// Usage: node scripts/supabase/test-logo-error-page-admin-pages.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const auth = read('src/components/Auth/AuthView.tsx');
const mark = read('src/components/Common/NoobWordmark.tsx');
const boundary = read('src/components/ErrorBoundary.tsx');
const css = read('src/index.css');
const admin = read('src/components/Modals/AdminControlModal.tsx');
const daily = read('src/components/Modals/AdminDailyNoobPanel.tsx');
const storage = read('src/components/Modals/AdminStoragePanel.tsx');
const api = read('src/services/supabaseApi.ts');
const apiIndex = read('src/services/api.ts');
const app = read('src/App.tsx');

section('1. The logo on the sign-in page');
check(fs.existsSync('public/brand/noob-wordmark.png') && fs.statSync('public/brand/noob-wordmark.png').size < 60000, 'the letters are their own small picture with a see-through background');
const png = fs.readFileSync('public/brand/noob-wordmark.png');
check(png.slice(0, 8).toString('hex') === '89504e470d0a1a0a' && png[25] === 6, 'a real PNG with an alpha channel (colour type 6)', String(png[25]));
check(/<NoobWordmark className="w-52 sm:w-60 mb-4" \/>/.test(auth), 'the sign-in page uses it');
check(!/rounded-\[30px\] sm:rounded-\[34px\] overflow-hidden bg-black/.test(auth) && !/noob-logo-circle\.png" alt="NOOB" className="w-full h-full object-cover scale-\[1\.12\]"/.test(auth), 'the rounded black box around a rounded black picture is gone');
check(/src="\/brand\/noob-wordmark\.png"/.test(mark) && /className="noob-wordmark block w-full h-auto select-none"/.test(mark) && !/bg-black|overflow-hidden|rounded-\[/.test(mark), 'the component draws the letters with no box, no background and no rounded clip');
check((mark.match(/<svg/g) || []).length >= 4 && /strokeLinecap="round"/.test(mark), 'with hand-drawn doodles around it: a squiggle underline, sparkles, a heart and a bolt');
check(/--wordmark-invert: invert\(0\);/.test(css) && /--wordmark-invert: invert\(1\);/.test(css) && /\.noob-wordmark \{ filter: var\(--wordmark-invert\) drop-shadow/.test(css), 'white on the dark page, black in Light mode');
check(/:root\[data-theme="light"\] \.media-dark \{\s*--wordmark-invert: invert\(0\);/.test(css), 'and white again on surfaces that stay dark');
check(/prefers-reduced-motion: reduce\) \{ \.noob-wordmark-wrap:hover \.noob-wordmark \{ transform: none; \}/.test(css), 'its little hop on touch is skipped for people who ask for less motion');

section('2. The reload page');
check(/import \{ LoginDoodles \} from '\.\/Auth\/LoginDoodles';/.test(boundary) && /import \{ LoginBigDoodles \} from '\.\/Auth\/LoginBigDoodles';/.test(boundary) && /<LoginDoodles \/>\s*<LoginBigDoodles \/>/.test(boundary), 'it carries the same small doodles (and the big pictures on wide screens) as the sign-in page');
check(/doodle-wallpaper-login fixed inset-0 z-\[9999\] overflow-y-auto/.test(boundary), 'on the same doodle wallpaper, full screen, scrollable on a short phone');
check(/<NoobWordmark className="w-44 sm:w-52" \/>/.test(boundary), 'the NOOB letters on top');
check(/font-script absolute -top-5 -left-2 text-2xl[^"]*">oops!/.test(boundary) && />NO WORRIES<\/span>/.test(boundary), 'a hand-written "oops!" and a "NO WORRIES" sticker like the ones on the sign-in page');
check(/border border-dashed border-white\/20/.test(boundary) && /repeating-linear-gradient\(135deg/.test(boundary), 'a stitched dashed card and a striped pill button, as on the sign-in page');
check(/Something went wrong/.test(boundary) && /Your account and data are safe — just reload to continue\./.test(boundary) && /Reload NOOB/.test(boundary), 'the same words as before');
check(!/text-red-400|errorMessage\}/.test(boundary) && /console\.error\('Uncaught render error:', error, info\.componentStack\)/.test(boundary) && /if \(this\.props\.fallback\) \{\s*return this\.props\.fallback;/.test(boundary), 'no red technical message on the reload page (the error goes to the console instead), and the scoped fallback still works');
check(/flex-1 justify-center whitespace-nowrap px-3 py-1\.5/.test(read('src/components/Explore/ExploreView.tsx')) && /shrink-0 w-max min-w-full/.test(read('src/components/Explore/ExploreView.tsx')), 'Explore\'s Post / Suggested users / Reel switcher fills the whole width, each part sharing it equally');
check(/onClick=\{this\.handleReload\}/.test(boundary) && /hardReload\(\)/.test(boundary), 'Reload still reloads (and fetches the newest version: utils/reloadApp.ts)');

section('3. The admin pages');
check(/'study' \| 'analytics' \| 'daily' \| 'storage' \| 'ads' \| 'settings'/.test(admin), 'the Daily NOOB, Storage and Ads tabs in the admin panel');
check(/setActiveTab\('daily'\)[\s\S]{0,500}<Trophy className="w-4 h-4" \/> Daily NOOB/.test(admin) && /setActiveTab\('storage'\)[\s\S]{0,500}<HardDrive className="w-4 h-4" \/> Storage/.test(admin), 'Daily NOOB and Storage tabs, for the main admin');
check(/activeTab === 'daily' && main \? \(\s*<AdminDailyNoobPanel \/>/.test(admin) && /activeTab === 'storage' && main \? \(\s*<AdminStoragePanel \/>/.test(admin), 'each opens its own page');
check(!/Daily NOOB — assign winners|Daily NOOB task|dailyWinners|dailyNoobDate/.test(admin), 'the old Daily NOOB blocks are gone from the Platform tab (they live on the new page now)');
check(!/fetchDailyChallenge\(\)/.test(admin), 'opening Platform no longer settles days as a side effect');
check(/useEffect\(\(\) => \{ void load\(date\); \}, \[date, load\]\);/.test(daily) && /adminFetchDailyOverview\(d\)/.test(daily), 'the Daily NOOB page loads the entries by itself when it opens and when the day changes (nothing to press)');
check(!/Load entries/.test(daily) && !/setInterval/.test(daily) && !/RefreshCw/.test(daily), '... with no "load" button, no refresh button and no timer');
check(/const todayUtc = \(\) => new Date\(\)\.toISOString\(\)\.slice\(0, 10\);/.test(daily) && /Open · ends in \{untilDayEnds\(\)\}/.test(daily), 'it opens on today and says when the day ends');
check(/e\.mediaType === 'video'\s*\? <video src=\{e\.mediaUrl\}/.test(daily) && /<img src=\{e\.mediaUrl\}/.test(daily), 'each entry shows its picture or video, its maker, caption, time and votes');
check(/permanently deleted from the server/.test(daily) && /entries & files deleted/.test(daily) && /This day is finished\./.test(daily), 'it says plainly that finished days are deleted from the server');
check(/setConfirmDelete\(e\.id\)/.test(daily) && /Delete for good/.test(daily) && /deleteDailyChallengeEntry\(id\)/.test(daily), 'removing an entry asks first');
check(/Yes — pay and delete the entries/.test(daily) && /adminAssignDailyChallengeWinners\(date, first, second \|\| null, third \|\| null\)/.test(daily) && /ranked\[0\]\?\.userId/.test(daily), 'paying the winners by hand asks first, and starts with the leaders by votes already picked');
check(/adminSetDailyChallenge\(taskDate, taskText\)/.test(daily) && /min=\{data\.today\}/.test(daily), 'the task of a day can still be set (not for a past day)');
check(/onClick=\{\(\) => setDate\(d\.date\)\}/.test(daily) && /Waiting to be settled/.test(daily), 'the list of recent days shows which are open, waiting or finished');
check(/adminRemoveDueMediaNow\(\)/.test(daily) && /Remove due files now/.test(daily), 'and files waiting to leave the server can be removed at once');
check(/adminFetchStorageOverview\(\)/.test(storage) && /formatBytes\(data\.bytes\)/.test(storage) && /data\.folders\.map/.test(storage), 'the Storage page shows the total and each folder');
check(/role="switch"[\s\S]{0,120}aria-label="Automatic cleanup"/.test(storage) && /adminSetMediaCleanup\(!data\.cleanupEnabled\)/.test(storage), 'automatic cleanup has a switch');
check(/adminScanUnusedMedia\(minAge\)/.test(storage) && /adminQueueUnusedMedia\(minAge, 500\)/.test(storage) && /Delete these files in 24 hours/.test(storage) && /Looking changes nothing/.test(storage), 'unused files are looked for first (nothing changes), then queued for deletion in 24 hours');
check(/adminCancelMediaQueue\(\)/.test(storage) && /Cancel all waiting/.test(storage), 'everything waiting can be cancelled');
check(!/setInterval|RefreshCw/.test(storage), 'no refresh button and no timer there either');

section('4. The calls');
check(/rpc<any>\('admin_daily_overview', date \? \{ p_date: date \} : \{\}\)/.test(api) && /rpc<AdminStorageOverview>\('admin_storage_overview'\)/.test(api), 'the pages read through the admin database functions');
check(/'admin_media_scan', \{ p_min_age_days: minAgeDays \}/.test(api) && /'admin_media_queue_unused', \{ p_min_age_days: minAgeDays, p_limit: limit \}/.test(api) && /'admin_media_trash_cancel'/.test(api) && /'admin_set_media_cleanup', \{ p_on: on \}/.test(api), 'scan, queue, cancel and the switch');
check(/'admin_media_purge_take', \{ p_limit: 50 \}/.test(api) && /supabase\.storage\.from\(MEDIA_BUCKET\)\.remove\(keys\)/.test(api) && /'admin_media_purge_done'/.test(api), '"remove now" takes the due files from the database, deletes them through the storage API and reports back');
check(/supabase\.rpc\('poke_media_cleanup'\)/.test(api) && /export function pokeMediaCleanup\(\): void/.test(api), 'the app can nudge the server\'s cleanup');
check(/useEffect\(\(\) => \{ if \(currentUser\?\.id\) pokeMediaCleanup\(\); \}, \[currentUser\?\.id\]\);/.test(app), '... once a person is signed in');
check(!/purgedMediaKeys/.test(api) && !/storage\.from\(MEDIA_BUCKET\)\.remove\(res\.mediaKey|remove\(\[res\.mediaKey\]\)/.test(api), 'the phone no longer tries to delete other people\'s Daily NOOB files itself (it never could)');
check(/adminFetchDailyOverview,\s*adminFetchStorageOverview,\s*adminSetMediaCleanup,\s*adminScanUnusedMedia,\s*adminQueueUnusedMedia,\s*adminCancelMediaQueue,\s*adminRemoveDueMediaNow,\s*pokeMediaCleanup,/.test(apiIndex), 'all exported from the API index');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
