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

section('1. The bottom bar');
check(/hideMusic\?: boolean/.test(nav) && /const order = hideMusic \? TAB_ORDER\.filter\(\(t\) => t !== 'music'\) : TAB_ORDER;/.test(nav), 'it takes a "hide music" switch and leaves music out of the order');
check(/\{!hideMusic && \(\s*<NavButton\s+id="nav-item-music"/.test(nav), 'the Music button is only drawn while the page is shown');
check(/gridTemplateColumns: `repeat\(\$\{count\}, minmax\(0, 1fr\)\)`/.test(nav) && !/grid-cols-8/.test(nav), 'the columns follow the number of icons (8, or 7 without Music), not a fixed 8');
check(/order\.indexOf\(activeTab\)/.test(nav) && /order\.includes\(activeTab\)/.test(nav), 'the lit marker is placed by the icons that are really there');
check(/data-count=\{count\}/.test(nav) && (nav.match(/nav-ico /g) || []).length >= 7 && /nav-ava /.test(nav) && /nav-lbl /.test(nav), 'icons, picture and labels carry the hooks the seven-icon sizing uses');
check(/left: calc\(4px \+ \(100% - 8px\) \/ var\(--nav-n, 8\)/.test(css) && /width: var\(--nav-mw, 54px\)/.test(css), 'the marker maths uses the number of columns, and is exactly the old one for 8');
check(/#floating-bottom-nav\[data-count="7"\] \{ --nav-n: 7; --nav-mw: 62px; \}/.test(css) && /\[data-count="7"\] \.nav-ico \{ width: 1\.35rem/.test(css), 'with seven icons the marker and the icons grow to use the room');

section('2. Everywhere else the page shows up');
check(/const musicHidden = platformSettings\?\.musicPageHidden === true;/.test(app), 'hidden only when the administrator says so (a missing setting means shown)');
check(/hideMusic=\{musicHidden\}/.test(app), 'the bottom bar is told');
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
