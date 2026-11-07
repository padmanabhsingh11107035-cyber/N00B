// The NOOB menu, redrawn like the reference picture (dark and light): icon at the left, then the words, small headings and thin lines between groups, an orange circle for counts.
//  - a PHONE keeps the three lines on Home; they open the full list as a drawer
//  - a TABLET / LAPTOP / COMPUTER (768 px wide and up) has the long strip of icons on the left from the start, no three lines, no bottom bar, and an Extend button that shows the words
//  - both draw the very same pages (Home publishes the list, the strip reads it)
// Checked against the real source files (no browser needed).
// Usage: node scripts/supabase/test-side-menu-fit.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';

let passed = 0, failed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const app = read('src/App.tsx'), css = read('src/index.css'), feed = read('src/components/Feed/FeedView.tsx');
const menu = read('src/components/Navigation/SideMenu.tsx'), store = read('src/utils/menuEntries.ts'), nav = read('src/components/Navigation/FloatingNavBar.tsx');

section('1. One list, drawn the same way everywhere');
check(/export const MenuList/.test(menu) && /nmenu-ico/.test(menu) && /nmenu-text/.test(menu) && /nmenu-badge/.test(menu) && /nmenu-label/.test(menu), 'MenuList draws the icon first, then the words, a count in a circle and a heading for each group');
check(/compact/.test(menu) && /\{!compact && <span className="nmenu-text">/.test(menu) && /title=\{title\}/.test(menu) && /aria-label=\{item\.label\}/.test(menu), 'the icon-only strip shows no words but keeps the name as a tooltip and for screen readers');
check(/nmenu-dot/.test(menu) && /compact && item\.badge/.test(menu), 'in the strip a count becomes a small orange dot on the icon');
check(/data-menu-entry=\{item\.entryId\}/.test(menu) && /aria-current=\{item\.active \? 'page' : undefined\}/.test(menu), 'rows keep data-menu-entry (to come back to the pressed one) and mark the open page');

section('2. The look: dark and light');
check(/\.nmenu \{[^}]*--nm-bg: #1c1d21[^}]*--nm-accent: #ff5a2d/.test(css), 'dark: a dark card with orange for the counts, as in the picture');
check(/:root\[data-theme="light"\] \.nmenu \{[^}]*--nm-bg: #fffdf8[^}]*--nm-text: #55565c[^}]*--nm-hi: #0a0a0a/.test(css), 'light: a cream card with dark words and icons (its own variables, nothing is white on white)');
check(/\.nmenu-item \{[^}]*color: var\(--nm-text\)/.test(css) && /\.nmenu-group \+ \.nmenu-group \{[^}]*border-top: 1px solid var\(--nm-line\)/.test(css) && /\.nmenu-label \{[^}]*text-transform: uppercase/.test(css), 'rows, thin lines between groups and small capital headings use those variables');
check(/\.nmenu-ico svg \{[^}]*stroke-width: 1\.6/.test(css) && /\.nmenu-item\.is-active \.nmenu-ico svg \{[^}]*stroke-width: 2\.4/.test(css), 'the icons are thin line icons like the bottom bar, and heavier on the open page (same 1.6 / 2.4)');
check(!/<Gift className="[^"]*text-black/.test(feed) && /icon: <Gift \/>/.test(feed) && /icon: <Flame \/>/.test(feed), 'the menu uses plain line icons (no coloured tiles any more)');
check(/\.nmenu-panel\.is-open \{ width: 248px; \}/.test(css) && /\.nmenu-panel \{[^}]*width: 56px/.test(css) && /\.nmenu-panel \{[^}]*border-radius: 16px/.test(css), 'the strip is a narrow rounded card (56 px), 248 px when extended');

section('3. Phone: three lines + drawer');
check(/className="md:hidden p-1 -ml-1[^"]*"\s+title="More from NOOB"/.test(feed), 'the three lines on Home are only on a phone (hidden from 768 px wide)');
check(/<MenuList groups=\{menuGroups\} \/>/.test(feed) && /className="nmenu md:hidden fixed inset-0 z-\[95\] flex flex-col/.test(feed) && /data-noob-keep="1"/.test(feed), 'pressing them opens the full list as a page that fills the screen (never on a tablet or computer)');
check(/<MenuList groups=\{menuGroups\} \/>/.test(feed) && /id: 'noob'/.test(feed) && /id: 'fun'/.test(feed) && /id: 'more'/.test(feed) && /id: 'more-pages'/.test(feed), 'with the same groups as before: More pages, NOOB, Fun & community, More from NOOB');
check(/window\.matchMedia\?\.\('\(min-width: 768px\)'\)\.matches\) return;/.test(feed), 'a page closed on a tablet or computer does not pop a three-line menu open');

section('4. Tablet / laptop / computer: the long strip');
check(/<aside\s+className=\{`hidden md:block[^`]* sticky top-0 h-dvh/.test(app) && /data-testid="desktop-side-menu"/.test(app), 'the strip is there from 768 px wide, as tall as the window');
check(/useState<boolean>\(\(\) => \{ try \{ return localStorage\.getItem\('noob\.sideMenu'\) === 'open' && window\.matchMedia\('\(min-width: 1280px\)'\)\.matches; \} catch \{ return false; \} \}\)/.test(app), 'it starts as icons only; an extended strip is remembered, on screens from 1280 px wide');
check(/data-testid="side-menu-toggle"/.test(app) && /aria-label=\{sideExtended \? 'Collapse the menu' : 'Extend the menu'\}/.test(app) && /<PanelLeftClose \/> : <PanelLeftOpen \/>/.test(app), 'an Extend / Collapse button shows the words next to the icons');
check(/<MenuList groups=\{sideGroups\} compact=\{!sideExtended\} \/>/.test(app) && /<MenuList groups=\{sideFootGroups\} compact=\{!sideExtended\} \/>/.test(app), 'icons only when collapsed, full rows when extended');
check(/className="xl:hidden fixed inset-0 cursor-default"/.test(app) && /closeNarrowStrip/.test(app), 'under 1280 px wide the extended strip opens over the page: a tap outside it, or choosing a page, closes it');
check(/id: 'home'/.test(app) && /id: 'explore'/.test(app) && /id: 'reels'/.test(app) && /id: 'videos'/.test(app) && /id: 'create'[^\n]*<CirclePlus \/>/.test(app) && /id: 'chat'[^\n]*unreadChatCount/.test(app) && /id: 'games'/.test(app) && /id: 'music'/.test(app), 'it lists every page of the bottom bar (and Feed, Music), Chat with its count');
check(/id: 'notifications'[^\n]*unreadNotificationCount/.test(app) && /id: 'wallet'/.test(app) && /id: 'subscriptions'/.test(app) && /currentUser\.isBusiness && \{ id: 'insights'/.test(app), 'then the account: Notifications with their count, Wallet, Subscriptions, Insights (business accounts)');
check(/\.\.\.homeMenuGroups\.map/.test(app) && /pressHomeEntry/.test(app) && /useMenuGroups\(\)/.test(app), 'then the same pages as the three-line menu (Draw, Studio, Fun pages, Daily, Shop ...); from another page the strip goes Home first');
check(/id: 'profile'[^\n]*currentUser\.avatar/.test(app) && /id: 'logout'[^\n]*handleLogout/.test(app) && /data-testid="desktop-side-profile"/.test(app), 'the profile picture and Log out stay at the bottom, in view');
check(/pointer-events-auto md:hidden/.test(nav), 'the bottom bar is gone from 768 px wide (the strip replaces it)');

section('5. Published list');
check(/publishMenuGroups\(menuGroups\.filter\(\(g\) => g\.id !== 'more-pages'\)\)/.test(feed) && /clearMenuGroups\(\)/.test(feed), 'Home publishes its list for the strip (the phone-only "More pages: Feed" is left out: the strip has its own Feed button)');
check(/useSyncExternalStore/.test(store) && /export const menuItemClick/.test(store) && /latest = next/.test(store), 'the strip reads it, always with the newest handlers');
check(/featOn\('draw'\)/.test(feed) && /featOn\('studio'\)/.test(feed) && /featOn\('daily'\)/.test(feed) && /featOn\('shop'\)/.test(feed) && /featOn\('creations'\)/.test(feed), 'the administrator\'s page switches still hide the entries, in the strip too');

section('6. Drawn for real (full rows, then the icon-only strip)');
const out = path.resolve('node_modules/.cache-side-menu.mjs');
buildSync({ entryPoints: [path.resolve('src/components/Navigation/SideMenu.tsx')], bundle: true, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', outfile: out, logLevel: 'error' });
const { MenuList } = await import(pathToFileURL(out).href);
const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');
const icon = React.createElement('svg', { 'data-i': 1 });
const groups = [
  { id: 'pages', title: 'Pages', items: [{ id: 'home', label: 'Home', icon, active: true, onClick: () => {} }, { id: 'chat', label: 'Chat', icon, badge: 4, onClick: () => {}, entryId: 'chat' }] },
  { id: 'empty', title: 'Nothing', items: [] },
  { id: 'more', title: 'More', items: [{ id: 'food', label: 'Food', icon, tag: 'Soon' }] },
];
const full = renderToStaticMarkup(React.createElement(MenuList, { groups }));
check(full.includes('>Pages<') && full.includes('>More<') && !full.includes('Nothing'), 'full rows: a heading for each group that has rows, none for an empty group');
check(/nmenu-ico"><svg[^>]*><\/svg><\/span><span class="nmenu-text">Home</.test(full), 'the icon comes first (at the left), then the words');
check(/class="nmenu-badge">4</.test(full) && /class="nmenu-tag">Soon</.test(full) && /aria-current="page"/.test(full) && /data-menu-entry="chat"/.test(full), 'the count is an orange circle, the tag a small word, the open page is marked, the entry id is kept');
check(/<div class="nmenu-item is-off"/.test(full), 'a row with no action (Soon) is not a button');
const strip = renderToStaticMarkup(React.createElement(MenuList, { groups, compact: true }));
check(!strip.includes('nmenu-text') && !strip.includes('nmenu-label') && strip.includes('title="Chat"') && /nmenu-dot/.test(strip) && !strip.includes('nmenu-badge'), 'icon-only strip: no words, no headings, the name as a tooltip, the count as a dot');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
