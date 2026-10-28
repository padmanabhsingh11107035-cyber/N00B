// The app side of the on / off switch for every page (the database side is tested on a real Postgres in test-feature-switches-db.mjs): the list of pages, who sees what, every
// place that opens a page, and the Pages tab of the admin panel. Bundled on the fly with esbuild for the parts that are drawn: no browser needed.
// Usage: node scripts/supabase/test-feature-switches-ui.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const count = (s, re) => (s.match(re) || []).length;

const app = read('src/App.tsx');
const feed = read('src/components/Feed/FeedView.tsx');
const nav = read('src/components/Navigation/FloatingNavBar.tsx');
const admin = read('src/components/Modals/AdminControlModal.tsx');
const panel = read('src/components/Modals/AdminFeaturesPanel.tsx');
const api = read('src/services/supabaseApi.ts');
const sql = read('supabase/migrations/20261023000001_feature_switches.sql');

// the real list, read by bundling the file
const out = path.resolve('node_modules/.cache-features-test.mjs');
buildSync({ entryPoints: [path.resolve('src/utils/features.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const F = await import(pathToFileURL(out).href);
fs.rmSync(out, { force: true });

section('1. The list of pages');
const keys = F.FEATURES.map((f) => f.key);
check(keys.length >= 25 && new Set(keys).size === keys.length, 'a page has one entry each and none is listed twice', String(keys.length));
check(keys.every((k) => /^[a-z0-9-]{2,40}$/.test(k)), 'every key is a name the database accepts (lower case, digits, dashes)');
check(F.FEATURES.every((f) => f.label && f.blurb && F.FEATURE_GROUPS.includes(f.group)), 'each has a name, a line of text and a group');
check(['explore', 'reels', 'videos', 'create', 'chat', 'games', 'music', 'draw', 'studio', 'lenses', 'team', 'anonymous', 'daily', 'rooms', 'song', 'lounge', 'shop', 'ai', 'drinks', 'creations', 'support', 'suggestions', 'fun-this-or-that', 'fun-ask', 'fun-mood', 'fun-polls'].every((k) => keys.includes(k)), 'every main page, menu page, fun page and help page is on the list');
check(!keys.includes('feed') && !keys.includes('profile'), 'Home and the profile are not on the list: they can not be switched off');
check(F.FEATURES.filter((f) => f.legacy).map((f) => f.key).join() === 'music', 'the Music page keeps its older switch (one switch, one truth)');
const funIds = [...read('src/utils/funRoutes.ts').matchAll(/id: '([a-z-]+)', label:/g)].map((m) => m[1]);
check(funIds.length === 4 && funIds.every((id) => keys.includes(F.funFeatureKey(id))), 'every fun page (' + funIds.join(', ') + ') has its own switch');
check(F.disabledFeatureSet(['reels', 7, null, 'chat']).size === 2 && F.disabledFeatureSet(undefined).size === 0 && F.disabledFeatureSet('x').size === 0, 'a list that is missing or wrong means: everything is on');
check(Object.entries(F.TAB_FEATURE).every(([tab, key]) => keys.includes(key)) && F.TAB_FEATURE.post === 'create', 'every tab of the bar is tied to a page (the + button is "create")');

section('2. The app: who sees what');
check(/const adminSeesAll = isMainAdmin\(currentUser\);/.test(app) && /adminSeesAll \? new Set<string>\(\) : disabledFeatureSet\(/.test(app), 'the administrator always gets an empty list, so sees every page');
check(/<FeatureFlagsContext\.Provider value=\{featuresOff\}>/.test(app) && /<\/FeatureFlagsContext\.Provider>/.test(app), 'the whole app is told which pages are off');
check(/platformSettings\?\.disabledFeatures\?\.join\(','\)/.test(app) && /fetchPublicPlatformSettings\(\)\.then/.test(app) && /Date\.now\(\) - last > 120_000/.test(app), 'the list comes with the settings that are read when the app opens and again when it comes back to the front');
check(/const key = TAB_FEATURE\[activeTab\];\s*if \(key && featuresOff\.has\(key\)\) setActiveTab\('feed'\);/.test(app), 'anyone who is on a page when it goes off is taken Home');
check(/const offKey = TAB_FEATURE\[tab\];\s*if \(offKey && featuresOff\.has\(offKey\)\) return;/.test(app), 'a tab that is off can not be opened from anywhere that picks a tab');

section('3. The side menu on computers');
for (const [k, tab] of [['explore', 'explore'], ['reels', 'reels'], ['videos', 'videos'], ['create', 'post'], ['chat', 'chat'], ['games', 'games']]) {
  check(new RegExp(`\\{featOn\\('${k}'\\) && \\(\\s*<button\\s+onClick=\\{\\(\\) => handleSelectNavTab\\('${tab}'\\)\\}`).test(app), `the ${k} button is drawn only while the page is on`);
}
check(/\{featOn\('lounge'\) && \(\s*<button\s+onClick=\{\(\) => setShowLiveLoungeUpsell\(true\)\}/.test(app) && /\{featOn\('ai'\) && \(\s*<button\s+onClick=\{\(\) => setShowNoobAiPage\(true\)\}/.test(app), 'so are Meetings and NOOB AI');
check(/\{featOn\('explore'\) && \(\s*<button\s+onClick=\{\(\) => setActiveTab\('explore'\)\}/.test(app) && /\{featOn\('explore'\) && \(\s*<>\s*<span>•<\/span>/.test(app), 'the two "Explore" links of the right-hand panel go too');
check(/activeTab !== 'chat' && activeTab !== 'reels' && featOn\('support'\) && \(/.test(app), 'the round help button at the bottom right is drawn only while Customer Support is on');

section('4. The bottom bar on phones (drawn for real)');
const navOut = path.resolve('node_modules/.cache-features-nav.mjs');
// one bundle for both, so the bar and the test share the very same context
buildSync({ stdin: { contents: "export * from './src/components/Navigation/FloatingNavBar.tsx'; export * from './src/utils/featureFlags.tsx';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', outfile: navOut, logLevel: 'error' });
const { FloatingNavBar, FeatureFlagsContext } = await import(pathToFileURL(navOut).href);
const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');
const bar = (off) => renderToStaticMarkup(React.createElement(FeatureFlagsContext.Provider, { value: new Set(off) }, React.createElement(FloatingNavBar, { activeTab: 'feed', onSelectTab: () => {}, userAvatar: '' })));
const all = bar([]);
check(['feed', 'explore', 'reels', 'post', 'chat', 'games', 'profile'].every((t) => all.includes(`id="nav-item-${t}"`)) && all.includes('repeat(7, minmax(0, 1fr))'), 'nothing off: seven buttons in seven columns, as before');
const some = bar(['chat', 'games']);
check(!some.includes('id="nav-item-chat"') && !some.includes('id="nav-item-games"') && some.includes('id="nav-item-reels"') && some.includes('repeat(5, minmax(0, 1fr))'), 'Chat and Games off: those two buttons are gone and the other five share the width');
const bare = bar(['explore', 'reels', 'create', 'chat', 'games']);
check(bare.includes('id="nav-item-feed"') && bare.includes('id="nav-item-profile"') && bare.includes('repeat(2, minmax(0, 1fr))') && !bare.includes('nav-item-explore'), 'every page off: Home and the profile are still there, in two columns');
fs.rmSync(navOut, { force: true });

section('5. The menu on Home');
for (const k of ['draw', 'studio', 'lenses', 'team', 'anonymous', 'daily', 'rooms', 'song', 'lounge', 'shop', 'ai', 'support', 'suggestions', 'drinks', 'creations']) {
  check(new RegExp(`\\{featOn\\('${k}'\\) && \\(`).test(feed), `${k}: its entry is drawn only while the page is on`);
}
check(/\{onOpenTab && featOn\('videos'\) && \(/.test(feed), 'the Feed (long videos) entry too');
check(/FUN_FEATURES\.some\(\(f\) => featOn\(funFeatureKey\(f\.id\)\)\)/.test(feed) && /FUN_FEATURES\.filter\(\(f\) => featOn\(funFeatureKey\(f\.id\)\)\)\.map/.test(feed), 'the fun pages are listed one by one, and their heading goes when all four are off');
check(/const featuresOff = useFeaturesOff\(\);/.test(feed), 'the menu reads the list from the app');

section('6. Other doors');
check(/if \(featuresOff\.has\(funFeatureKey\(loc\.feature\)\)\) return;/.test(app) && /if \(featuresOff\.has\(funFeatureKey\(bootFun\.feature\)\)\) \{ setBootFun\(null\); return; \}/.test(app), 'a fun page that is off does not open from a link or from its own address');
check(/if \(featuresOff\.has\('studio'\)\) closeStudio\(\); if \(featuresOff\.has\('draw'\)\) closeNoobDraw\(\); if \(featuresOff\.has\('lenses'\)\) closeLenses\(\);/.test(app) && /if \(kind === 'studio'\) \{ if \(featOn\('studio'\)\) openStudio\(\); \}/.test(app), 'Studio and Draw close again if they were opened (an address, a link) while off, and Studio is not started from the Create sheet');
const funCards = read('src/components/Profile/ProfileFunCards.tsx');
check(/useFeatureOn\('fun-ask'\)/.test(funCards) && /useFeatureOn\('fun-mood'\)/.test(funCards) && /if \(!pageOn \|\| !ready \|\| !onOpenFunPage\) return null;/.test(funCards), 'the Ask and Mood cards on profiles are not drawn while those pages are off');
const hub = read('src/components/Settings/SettingsHub.tsx'), help = read('src/components/Settings/pages/support.tsx');
check(/r\.action === 'openSupport' && featuresOff\.has\('support'\)/.test(hub) && /r\.action === 'openSuggestionBox' && featuresOff\.has\('suggestions'\)/.test(hub), 'the Settings search does not list the support assistant or the suggestion box while they are off');
check(/useFeatureOn\('support'\), ideasOn = useFeatureOn\('suggestions'\)/.test(help) && count(help, /\{supportOn && /g) >= 3, 'the Help page and Account Status page drop their support rows while it is off');

section('7. The admin panel: the Pages tab');
check(/type AdminTab = [^;]*'pages'/.test(admin) && /data-testid="admin-tab-pages"/.test(admin) && /<AdminFeaturesPanel \/>/.test(admin) && /activeTab === 'pages' && main/.test(admin), 'a "Pages" tab, for the main administrator');
check(count(panel, /role="switch"/g) === 1 && /aria-checked=\{on\}/.test(panel) && /testId=\{`feature-switch-\$\{f\.key\}`\}/.test(panel) && /data-testid=\{testId\}/.test(panel), 'every page has a real on / off switch (the same one drawn for each row of the list)');
check(/FEATURES\.filter\(\(f\) => f\.group === group\)/.test(panel) && /FEATURE_GROUPS\.map/.test(panel), 'every page of the list is shown, in its group');
check(/f\.legacy === 'music' \? await adminSetMusicPageHidden\(!on\) : await adminSetFeature\(f\.key, on\)/.test(panel) && /settings\?\.musicPageHidden !== true/.test(panel), 'the Music row uses the older Music switch, so the Platform tab and this tab always agree');
check(/setSettings\(before\)/.test(panel) && /setMessage\(\{ ok: false/.test(panel), 'if a change can not be saved, the switch goes back and the reason is shown');
check(/data-testid="features-all-on"/.test(panel) && /Turn everything on/.test(panel) && /features-summary/.test(panel), 'one button turns everything back on, and a line says how many pages are off');
check(/rpc<PlatformSettings>\('admin_set_feature', \{ p_key: key, p_on: on \}\)/.test(api) && /disabledFeatures: \[\]/.test(api) && /disabledFeatures\?: string\[\]/.test(api), 'the app calls the new database function, and a failed read means: everything is on');
check(/admin_set_feature/.test(sql) && /is_master_admin\(\)/.test(sql) && /revoke execute on function public\.admin_set_feature\(text, boolean\) from public, anon/.test(sql) && /'disabledFeatures'/.test(sql) && /log_admin_action\('feature_switch_changed'/.test(sql), 'the SQL: only the main administrator, not callable by visitors, in the public settings, written to the activity log');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
