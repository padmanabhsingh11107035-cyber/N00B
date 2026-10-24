// The address bar and Back button, the "page not found" and "short break" pages, links that open without an account, the pages that describe each feature for search engines,
// and the support help desk page. The real app is driven in a real browser by the scratchpad check (route_check.mjs); this is what must keep holding on every change.
// Usage: node --liftoff-only scripts/supabase/test-routing-pages.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import { FEATURE_PAGES, TAB_PATHS } from '../../src/utils/routes.ts';
import { showTabAddress, tabFromHistoryEntry } from '../../src/utils/addressBar.ts';
import { filterTopics, SUPPORT_TOPICS, STARTER_PROMPTS } from '../../src/components/Support/supportTopics.ts';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8');

section('1. The address bar rules');
const fakeHist = (state = null) => { const h = { state, calls: [], pushState(s, t, u) { h.calls.push(['push', u]); h.state = s; }, replaceState(s, t, u) { h.calls.push(['replace', u]); h.state = s; } }; return h; };
const loc = (pathname, search = '', hash = '') => ({ pathname, search, hash });
let h = fakeHist();
check(showTabAddress('feed', true, loc('/'), h) === 'replaced' && h.state.noobTab === 'feed', 'the first page is marked in the history (the entry is renamed, not added)');
h = fakeHist({ noobTab: 'feed' });
check(showTabAddress('feed', false, loc('/'), h) === 'unchanged' && h.calls.length === 0, 'a page that is already shown changes nothing');
check(showTabAddress('explore', false, loc('/'), h) === 'pushed' && h.calls[0][0] === 'push' && h.calls[0][1] === '/explore' && h.state.noobTab === 'explore', 'moving to another page adds one entry with its address');
h = fakeHist(null);
check(showTabAddress('reels', true, loc('/reel/abc', '?x=1'), h) === 'replaced' && h.calls[0][1] === '/reels?x=1', 'opened from a shared link: the address is renamed to the page it opened on (the rest of the link is kept)');
h = fakeHist({ noobTab: 'chat' });
check(showTabAddress('chat', true, loc('/chat'), h) === 'unchanged', 'arriving by Back on the right address changes nothing');
check(Object.values(TAB_PATHS).every((p) => tabFromHistoryEntry(null, p) !== null) && tabFromHistoryEntry(null, '/zzz') === null, 'every page address names its page');
check(tabFromHistoryEntry({ noobLayer: 1 }, '/explore') === null && tabFromHistoryEntry({ noobSettings: 2 }, '/me') === null && tabFromHistoryEntry({ noobAuth: 'signup' }, '/') === null, 'entries that belong to a profile, the Settings or sign-up are not pages');
check(tabFromHistoryEntry({ noobTab: 'explore' }, '/explore') === 'explore', 'the address decides, the mark only confirms');

section('2. Waiting for the browser to finish walking through history');
{
  const listeners = [];
  const timers = [];
  const calls = [];
  const fakeWin = {
    history: { go: (n) => calls.push(['go', n]), back: () => calls.push(['back']), forward: () => calls.push(['forward']) },
    addEventListener: (t, fn) => { if (t === 'popstate') listeners.push(fn); },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].fn = null; }
  };
  globalThis.window = fakeWin;
  const gate = await import('../../src/utils/historyGate.ts?t=' + Date.now());
  gate.resetHistoryGate();
  gate.installHistoryGate();
  gate.installHistoryGate();
  check(listeners.length === 1, 'installed once, however often it is asked');
  const ran = [];
  gate.afterHistoryIdle(() => ran.push('now'));
  check(ran.join() === 'now' && !gate.historyBusy(), 'with nothing under way, a job runs at once');
  fakeWin.history.go(-2);
  check(calls[0][0] === 'go' && calls[0][1] === -2 && gate.historyBusy(), 'a walk back through history is still carried out, and is counted');
  gate.afterHistoryIdle(() => ran.push('later'));
  check(ran.join() === 'now', 'a job started in the gap waits');
  listeners[0]({});
  check(!gate.historyBusy(), 'the browser answering ends the walk');
  const flush = timers.filter((t) => t.fn && t.ms === 0).pop();
  flush && flush.fn();
  check(ran.join() === 'now,later', 'and then the waiting job runs');
  fakeWin.history.back();
  check(gate.historyBusy(), 'back() is counted too');
  timers.filter((t) => t.fn && t.ms === 700).forEach((t) => t.fn());
  check(!gate.historyBusy(), 'a walk the browser never answers (nothing to go back to) is over after a moment');
  fakeWin.history.go(0);
  check(!gate.historyBusy(), 'go(0) is a reload, not a walk');
  delete globalThis.window;
}

section('3. The two pages that stand alone');
const main = read('src/main.tsx');
const sys = read('src/components/Common/SystemPage.tsx');
const app = read('src/App.tsx');
check(/installHistoryGate\(\)/.test(main) && /pageNotFound = !oldAddress && !editorPage && !approvalPage && !isNativeApp\(\) && !isCoachingHost\(\) && !isKnownPath\(/.test(main) && /<SystemPage kind="not-found" \/>/.test(main), 'an address that is not a page shows only the "page not found" page, before the app starts');
check(/__noobBooted = true/.test(main), 'the app says when it has started');
check(/kind === 'down'/.test(sys) && /Trying again by itself in/.test(sys) && /NOOB is taking a short break/.test(sys) && /This page does not exist/.test(sys) && /href="\/"/.test(sys), 'the pages say what is wrong in plain words, offer a way out, and the short break one retries by itself');
check(/if \(initialLoadFailed\) \{\s*\/\/[^\n]*\n\s*return <SystemPage kind="down" onRetry=\{loadInitialData\} \/>;/.test(app), 'when the first load fails only the "short break" page is shown');
const guard = read('public/boot-guard.js');
const sw = read('public/sw.js');
const html = read('index.html');
check(/<script src="\/boot-guard\.js"><\/script>/.test(html) && html.indexOf('boot-guard.js') < html.indexOf('/src/main.tsx'), 'index.html loads the guard before the app');
check(/window\.__noobBooted/.test(guard) && /setTimeout\(show, 25000\)/.test(guard) && /\/assets\\\//.test(guard) && /Failed to fetch dynamically imported module/.test(guard) && /version\.json/.test(guard), 'the guard shows the page when the app cannot start (a file fails, it never starts) and keeps checking until NOOB is back');
new vm.Script(guard); new vm.Script(sw);
check(/DOWN_FILES = \['\/app-down\.html'/.test(sw) && /req\.mode === 'navigate'/.test(sw) && /res\.status >= 500/.test(sw) && /catch\(\(\) => downResponse\(\)\)/.test(sw.replace(/\s+/g, ' ')) || /\.catch\(\(\) => downResponse\(\)\)/.test(sw), 'the service worker shows the page when a page cannot be fetched or the server answers with an error');
check(fs.existsSync('public/app-down.html') && /NOOB is taking a short break/.test(read('public/app-down.html')) && /boot-guard\.js/.test(read('public/app-down.html')) && /noindex/.test(read('public/app-down.html')), 'the page itself is a file of the site');
check(/script-src 'self'/.test(read('public/_headers')) && !/<script>[^<]/.test(read('public/app-down.html')), 'no script is written inside a page (the site\'s rules do not allow it)');

section('4. A link opens without an account');
const pub = read('src/components/Public/PublicContentPage.tsx');
check(/bootRoute && publicRouteOpen/.test(app) && /<PublicContentPage route=\{bootRoute\}/.test(app) && /parseContentPath\(window\.location\.pathname\) \|\| parseContentQuery\(window\.location\.search\)/.test(app), 'a reel / post / video / profile address shows the public page to someone who is not logged in');
check(/route\?\.kind === 'profile'\) setSharedProfileUsername/.test(app) && /route\?\.kind === 'reel'\) setSharedReelId/.test(app), 'and opens inside the app, on the same thing, once they are logged in');
check(['public-login', 'public-signup', 'public-like', 'public-comment', 'public-cta', 'public-missing', 'public-error', 'public-video', 'public-profile'].every((id) => pub.includes(`data-testid="${id}"`)), 'the page has log in / sign up, like, comment, a prompt, and the not-available and error states');
check(/recordPublicView\(item\.kind, item\.id\)/.test(pub) && /counted\.current/.test(pub), 'a view is counted once, when the video is played');
const api = read('src/services/publicContent.ts');
check(/'public_reel'/.test(api) && /'public_video'/.test(api) && /'public_post'/.test(api) && /'public_profile'/.test(api) && /'record_public_view'/.test(api), 'the page uses only the five public functions');
check(/hint=\{bootNotice \|\| undefined\}/.test(app) && /data-testid="auth-hint"/.test(read('src/components/Auth/AuthView.tsx')) && /Log in to open \$\{feature\.title\}\./.test(app), 'an address of a page, opened while logged out, says "Log in to open NOOB Reels." on the sign-in page');
const m5 = read('supabase/migrations/20261020000005_public_content.sql');
check(/public_account_ok/.test(m5) && /account_type <> 'private'/.test(m5) && /not p\.is_suspended/.test(m5) && /revoke all on public\.public_content_views from anon, authenticated/.test(m5), 'the database only answers for public, not suspended accounts, and keeps its table of views closed');

section('5. Pages for search engines');
for (const f of FEATURE_PAGES) {
  const file = `public/features/${f.slug}.html`;
  const ok = fs.existsSync(file) && (() => { const s = read(file); return /<title>[^<]{20,}<\/title>/.test(s) && new RegExp(`rel="canonical" href="https://noobsocials\\.com/features/${f.slug}"`).test(s) && s.includes(`href="${f.path}"`) && /application\/ld\+json/.test(s) && /index, follow/.test(s); })();
  check(ok, `/features/${f.slug}: its own title, address, words, a button to open it, and structured data`);
}
check(fs.existsSync('public/features/index.html') && FEATURE_PAGES.every((f) => read('public/features/index.html').includes(`/features/${f.slug}`)), 'the list of features links to every one');
const sm = read('public/sitemap.xml');
check(FEATURE_PAGES.every((f) => sm.includes(`https://noobsocials.com/features/${f.slug}</loc>`)) && sm.includes('https://noobsocials.com/features</loc>'), 'every feature page is in the site map');
check(/SiteNavigationElement/.test(html) && /<a href="\/features">All features<\/a>/.test(html) && /href="\/features"/.test(read('public/about.html')), 'the home page and About point to them');
check(/Visit Details \(also if you have no account\)/.test(read('public/privacy.html')), 'the privacy page says what is recorded when someone only opens NOOB');

section('6. The support help desk');
const modal = read('src/components/Support/CustomerSupportModal.tsx');
check(/useFullPage\(true\)/.test(modal) && /fixed inset-0 z-50 sd-root/.test(modal) && !/bg-black\/85 backdrop-blur-xl flex items-center justify-center p-3 sm:p-4 animate-in/.test(modal), 'support is a page of its own: solid, nothing of the page behind shows through');
check(/<SupportChatPanel/.test(modal) && /onSend=\{handleSendMessage\}/.test(modal) && /onSelectTransaction=\{handleSelectTransaction\}/.test(modal) && /onPaymentIssue=\{handlePaymentIssueQuickAction\}/.test(modal), 'the chat screen is the new design and keeps every real function (the AI, voice, payment lookup, ending and rating)');
check(/activeSupportTab === 'call_us'/.test(modal) && /activeSupportTab === 'safety_report'/.test(modal) && /activeSupportTab === 'ticket'/.test(modal) && /activeSupportTab === 'faq'/.test(modal), 'the call, safety, ticket and FAQ tabs are as they were');
check(SUPPORT_TOPICS.length === 9 && STARTER_PROMPTS.length === 3 && filterTopics(SUPPORT_TOPICS, 'SHOP').length === 1 && filterTopics(SUPPORT_TOPICS, '').length === 9 && filterTopics(SUPPORT_TOPICS, 'zzz').length === 0, 'the topics can be searched');
const fn = read('supabase/functions/dynamic-handler/index.ts');
check(/Deno\.env\.get\('GROQ_API_KEY'\)/.test(fn) && !/gsk_[A-Za-z0-9]{10,}/.test(fn + modal + read('src/services/supabaseApi.ts')), 'the AI still answers through Groq with the key kept only on the server (never in the app)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
