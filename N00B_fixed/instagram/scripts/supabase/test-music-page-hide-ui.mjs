// The app side of "Hide the Music page" (the admin switch is tested on a real database in test-music-page-toggle.mjs): the bottom bar, the side menu, the page itself,
// the admin panel button, and that a hidden page never leaves anyone stuck on it. Usage: node scripts/supabase/test-music-page-hide-ui.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const app = read('src/App.tsx');
const nav = read('src/components/Navigation/FloatingNavBar.tsx');
const css = read('src/index.css');
const admin = read('src/components/Modals/AdminControlModal.tsx');
const api = read('src/services/supabaseApi.ts');
const sql = read('supabase/migrations/20261015000001_music_page_toggle.sql');

section('1. The bottom bar and the menu on Home');
const feed = read('src/components/Feed/FeedView.tsx');
check(!/hideMusic/.test(nav) && !/nav-item-music/.test(nav) && !/nav-item-videos/.test(nav), 'the bottom bar carries neither Music nor Videos (the bar has 3 pages, Create, then 3 pages)');
check(/musicHidden\?: boolean/.test(feed) && /\{!musicHidden && \(\s*<button\s+onClick=\{\(\) => \{ setShowNoobMenu\(false\); onOpenTab\('music'\); \}\}/.test(feed), 'the menu on Home lists Music only while the page is shown');
check(/onOpenTab\('videos'\)/.test(feed) && /data-testid="noob-menu-more-pages"/.test(feed), 'the same menu lists the Videos feed');

section('2. Everywhere else the page shows up');
check(/const musicHidden = platformSettings\?\.musicPageHidden === true;/.test(app), 'hidden only when the administrator says so (a missing setting means shown)');
check(/musicHidden=\{musicHidden\}/.test(app) && /onOpenTab=\{handleSelectNavTab\}/.test(app), 'the menu on Home is told');
check(/\{!musicHidden && \(\s*<button\s+onClick=\{\(\) => handleSelectNavTab\('music'\)\}/.test(app), 'the side menu on computers loses its Music Hub button');
check(/activeTab === 'music' && !musicHidden/.test(app), 'the page itself is never drawn while hidden');
check(/if \(musicHidden && activeTab === 'music'\) setActiveTab\('feed'\)/.test(app), 'anyone who is on it when it gets hidden is taken Home');
check(/document\.addEventListener\('visibilitychange', onBack\)/.test(app) && /Date\.now\(\) - last > 120_000/.test(app) && /\[currentUser\?\.id, viewAsUser\]/.test(app), 'the setting is re-read when the app comes back to the front (at most every 2 minutes), and when the administrator steps into "use as user"');

section('3. The admin panel button');
check(/adminSetMusicPageHidden\(!musicPageHidden\)/.test(admin) && /Hide the Music page/.test(admin) && /aria-label="Hide the Music page"/.test(admin), 'a switch called "Hide the Music page" that flips the setting');
check(/setMusicPageHidden\(s\.musicPageHidden === true\)/.test(admin), 'it shows the current state when the panel opens');
check(/rpc<PlatformSettings>\('admin_set_music_page_hidden', \{ p_hidden: hidden \}\)/.test(api) && /musicPageHidden: false/.test(api), 'the API calls the new function, and a failed read means "shown"');
check(/'musicPageHidden', s\.music_page_hidden/.test(sql) && /admin_set_music_page_hidden/.test(sql) && /is_master_admin\(\)/.test(sql), 'the SQL carries the setting in the public answer and lets only the main administrator change it');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
