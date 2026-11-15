// Laptop / computer pages (2026-11-15): the doodle only in the middle column, a wide Create window, chat full screen with the colour the person chose, a centred Notifications column,
// a two-column Wallet, side-by-side Subscriptions; and the new Daily NOOB page (dark and light). A phone keeps its layouts.
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8').split(String.fromCharCode(13)).join('');
let passed = 0, failed = 0;
const check = (ok, name) => { if (ok) { passed++; console.log('  ok   ' + name); } else { failed++; console.log('  FAIL ' + name); } };
const app = read('src/App.tsx'), css = read('src/index.css'), nz = read('src/components/Common/nzPage.css');
check(/the doodle shows only inside the middle column itself/.test(app) && !/data-page'\) === 'feed'\) \{\s*const box/.test(app), 'the doodle is measured from the middle column of every page, not only Home');
check(/@media \(min-width: 1024px\) and \(pointer: fine\) \{\s*\.cs-sheet \{ max-width: 780px;/.test(nz) && /\.cs-list \{ display: grid; grid-template-columns: 1fr 1fr;/.test(nz), 'Create is a wide window with two columns on a laptop; the phone list is not inside that block');
check(/data-shell="1"/.test(app) && /\[data-shell\] \{ padding: 0 !important; gap: 0 !important; \}/.test(css) && /#chat-view-container \{[^}]*height: 100dvh !important;[^}]*border-radius: 0 !important/.test(css), 'chat on a laptop fills the screen (only the left menu stays)');
check(!/\.msg-page \{ --head: #7c4dff;/.test(css) && !/msg-head\.force-dark, html\[data-page="chat"\]:not\(\[data-nodeskchat\]\) \.msg-page \.msg-head \{ background: linear-gradient/.test(css), 'the chat top on a laptop follows the colour the person picked (no fixed violet)');
check(/--nt-col: min\(760px, calc\(100% - 48px\)\)/.test(css) && /\.nt-chips \{ width: var\(--nt-col\); margin: 0 auto;[^}]*flex-wrap: wrap; justify-content: center/.test(css), 'Notifications: header, filters and list share one centred column; the filters wrap');
check(/className="wl-col-a"/.test(read('src/components/Profile/AccountsStatisticsModal.tsx')) && /\.wl-wrap \{ max-width: 1080px !important;[^}]*display: grid !important; grid-template-columns: minmax\(330px, 410px\)/.test(css), 'Wallet: two columns on a tablet and bigger');
check(/\.pro-light \[data-testid="pro-cards"\] > div:first-child \{ display: grid; grid-auto-flow: column;/.test(css), 'Subscriptions: the plans stand side by side on a tablet and bigger');
const dn = read('src/components/Daily/DailyNoobView.tsx'), dcss = read('src/components/Daily/dailyNoob.css');
check(/className="dn edge-own" data-noob-keep="1"/.test(dn) && /data-testid="daily-back"/.test(dn) && /import '\.\/dailyNoob\.css';/.test(dn), 'Daily NOOB is a full page with a back button');
check(/\.dn \{ --dn-bg: #0e0b0a;/.test(dcss) && /:root\[data-theme="light"\] \.dn \{ --dn-bg: #fbf5ec;/.test(dcss) && /forceStripColour\(document\.documentElement\.getAttribute\('data-theme'\) === 'light' \? '#fbf5ec' : '#0e0b0a'\)/.test(dn), 'Daily NOOB has its own dark and light colours, and the strip behind the clock follows');
check(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(dn.slice(dn.indexOf('return ('))), 'Daily NOOB uses drawn icons, no emoji pictures');
check(/handleVote/.test(dn) && /handleSubmit/.test(dn) && /handleCrown/.test(dn) && /handleDelete/.test(dn) && /fetchDailyChampions/.test(dn), 'everything the old page could do is still there: enter, vote, delete, crown, hall of fame');
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
