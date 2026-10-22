// Three things people felt on their phones, and the rules that now hold them:
//   1. "Tap to refresh" brought back the OLD version: a plain reload may be answered with the page the phone already had. The app now reloads at a slightly different address, so the
//      newest page (and its files) must be fetched, and takes that mark off the address afterwards.
//   2. Switching pages and opening Settings showed a plain spinner and took long: every waiting moment shows NOOB's burger, and the pages are fetched ahead of time, two at a time.
//   3. Pulling the front page at its top and then scrolling moved the page BEHIND it: a page or window that covers the screen now switches the page behind it off.
// Also checks the small things found in the same sweep (a script the security policy blocked, a 242 KB logo).
//
// Usage: node scripts/supabase/test-updates-loading-scroll.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

// a tiny browser for the reload code
const calls = [];
const state = { href: 'https://noobsocials.com/?profile=ann&x=1#top', history: { state: { noobLayer: 2 }, replaced: null } };
globalThis.window = {
  location: {
    get href() { return state.href; },
    replace: (u) => { calls.push(['replace', u]); },
    reload: () => { calls.push(['reload']); }
  },
  history: { get state() { return state.history.state; }, replaceState: (st, _t, url) => { state.history.replaced = [st, url]; } }
};
const R = await import('../../src/utils/reloadApp.ts');
const O = await import('../../src/utils/overlayScrollLock.ts');

section('1. Reloading for the newest version');
R.hardReload();
const target = calls[0]?.[1] || '';
const u = new URL(target || 'https://x.invalid/');
check(calls[0]?.[0] === 'replace' && u.searchParams.get('_r') && /^\d+$/.test(u.searchParams.get('_r')), 'the page is asked for at a new address (a "?_r=" mark), so it can not come from a saved copy');
check(u.searchParams.get('profile') === 'ann' && u.searchParams.get('x') === '1' && u.hash === '#top' && u.pathname === '/', 'everything else in the address is kept (the page, the other parts, the #part)');
state.href = target;
R.cleanReloadMark();
check(state.history.replaced && state.history.replaced[1] === '/?profile=ann&x=1#top' && state.history.replaced[0].noobLayer === 2, 'once the app has started the mark is taken off the address again, and the page history is kept');
state.history.replaced = null; state.href = 'https://noobsocials.com/about';
R.cleanReloadMark();
check(state.history.replaced === null, 'an address without the mark is left alone');
const files = ['src/utils/appVersion.ts', 'src/components/Common/UpdateAvailableBanner.tsx', 'src/components/ErrorBoundary.tsx', 'src/utils/lazyTab.tsx'];
check(files.every((f) => /hardReload/.test(read(f)) && !/window\.location\.reload\(\)/.test(read(f))), 'the update banner, the automatic update, the crash screen and a missing page file all reload this way');
check(/onClick=\{hardReload\}/.test(read('src/App.tsx')) && /cleanReloadMark\(\);/.test(read('src/main.tsx')), 'the chat "Reload NOOB" button does too, and the mark is removed at start-up');
check(/\/version\.json[\s\S]{0,40}no-store/.test(read('public/_headers')) && /\/index\.html\s+Cache-Control: no-cache/.test(read('public/_headers').replace(/\r/g, '')) && !/\.put\(/.test(read('public/sw.js')) && /DOWN_FILES = \['\/app-down\.html', '\/boot-guard\.js', '\/noob-logo-circle\.png', '\/favicon-32\.png'\]/.test(read('public/sw.js')), 'the page, the version file and the service worker are never kept, and the service worker keeps no copies of its own pages (only the four small files of the "short break" page)');

section('2. Burger while waiting, pages fetched ahead');
const burger = read('src/components/Common/BurgerLoading.tsx');
check(/export const BurgerLoading/.test(burger) && /export const TabBurgerLoading/.test(burger) && /export const BurgerSmall/.test(burger) && /<NoobStackLoader mode="quick"/.test(burger), 'one burger layer (full screen), one inside a page of the bottom bar, one small');
const fallbackFiles = ['src/App.tsx', 'src/components/Feed/FeedView.tsx', 'src/components/Profile/ProfileView.tsx', 'src/components/NoobRooms/NoobRoomsLobbyView.tsx', 'src/components/Games/GamesView.tsx', 'src/components/Games/GamePlayModal.tsx', 'src/components/Reels/ReelsView.tsx', 'src/components/Draw/NoobDrawHost.tsx', 'src/components/Team/TeamJoinHost.tsx', 'src/components/Settings/kit.tsx'];
const spinners = fallbackFiles.filter((f) => /border-2 border-(white\/20|zinc-700) border-t-/.test(read(f)));
check(spinners.length === 0, 'no page or window waits behind the old plain spinner any more', spinners.join(', '));
const app = read('src/App.tsx');
check((app.match(/fallback=\{<TabBurgerLoading \/>\}/g) || []).length >= 6, 'the pages of the bottom bar wait inside their own area (the bar stays, the tap is seen to have worked)');
check(/const queue: Array<\(\) => Promise<unknown>> = \[\.\.\.TAB_PRELOADS\.map\(\(\[, preload\]\) => preload\), \(\) => import\('\.\/components\/Settings\/SettingsHub'\)\];/.test(app) && /void worker\(\); void worker\(\);/.test(app) && /\}, 600\);/.test(app), 'every page of the bar and Settings and activity are fetched in the background two at a time, 0.6 seconds after sign-in');
check(/onPressTab=\{\(tab\) => \{ const hit = TAB_PRELOADS/.test(app), 'and a page is asked for the moment its button is pressed');
check(/BurgerLoading label="Connecting…"/.test(read('src/components/NoobRooms/NoobRoomsLobbyView.tsx')), 'a voice room says it is connecting, behind the burger');

section('3. The page behind a full-screen page does not scroll');
const vp = { width: 390, height: 844 };
const live = { display: 'block', visibility: 'visible', pointerEvents: 'auto', opacity: '1' };
check(O.coversScreen({ width: 390, height: 844 }, live, vp), 'a layer that fills the screen counts');
check(O.coversScreen({ width: 390, height: 780 }, live, vp), 'also when the browser bar takes a little of the height');
check(!O.coversScreen({ width: 390, height: 400 }, live, vp) && !O.coversScreen({ width: 200, height: 844 }, live, vp), 'a small or narrow layer does not');
check(!O.coversScreen({ width: 390, height: 844 }, { ...live, pointerEvents: 'none' }, vp), 'a layer that lets touches through (a decoration) does not');
check(!O.coversScreen({ width: 390, height: 844 }, { ...live, display: 'none' }, vp) && !O.coversScreen({ width: 390, height: 844 }, { ...live, visibility: 'hidden' }, vp) && !O.coversScreen({ width: 390, height: 844 }, { ...live, opacity: '0' }, vp), 'a hidden layer does not (so a page that was switched away from can never leave the screen locked)');
const css = read('src/index.css');
check(/html\[data-overlay-open\], html\[data-overlay-open\] body \{ overflow: hidden !important; overscroll-behavior: none; \}/.test(css), 'while a covering layer shows, the page behind has no scrolling');
check(/\.fixed\.inset-0, \.fixed\.inset-0 \.overflow-y-auto, \.fixed\.inset-0 \.overflow-auto, \.fixed\.inset-0\.overflow-y-auto \{ overscroll-behavior: none; \}/.test(css), 'and a front page pulled past its end does not hand the pull on to the page behind (the iPhone did)');
const lock = read('src/utils/overlayScrollLock.ts');
check(/MIN_GAP_MS = 100/.test(lock) && /MutationObserver/.test(lock) && /setInterval\(schedule, 3000\)/.test(lock) && /removeAttribute\(OVERLAY_ATTR\)/.test(lock), 'it looks at most ten times a second, notices every change, and puts right anything it missed within seconds');
check(/installOverlayScrollLock\(\);/.test(read('src/main.tsx')), 'it is started when the app starts');

section('4. Found in the same sweep');
const html = read('index.html');
check(!/<script>/.test(html) && /<script src="\/coaching-init\.js"><\/script>/.test(html) && fs.existsSync('public/coaching-init.js'), 'no script is written inside index.html (the security policy blocked it, so the coaching address never got its own look)');
check(/\/assets\/\*\s+Cache-Control: public, max-age=31536000, immutable/.test(read('public/_headers')) && /\/index\.html\s+Cache-Control: no-cache/.test(read('public/_headers')), 'files with a fingerprint in their name are kept for a year (no asking the server on every visit); the page, the version file and the service worker are never kept');
check(fs.statSync('public/noob-logo-circle.png').size < 40 * 1024, 'the logo that opens every page is small (it was 242 KB)');
const mig = read('supabase/migrations/20261017000003_lock_visitor_functions.sql');
check(/revoke execute on function public\.generate_suggested_user_notifications\(\) from public, anon, authenticated;/.test(mig), 'a stranger can no longer start the job that writes notifications for everybody (see test-visitor-functions.mjs)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
