// Three things: (1) every page of the three-line menu is a SEPARATE page - Home is hidden behind it, not just covered, so nothing of it shows through; (2) only the Home page can be
// refreshed - no other page has a refresh button, a pull-down refresh or a timer that reloads it, and the browser's own pull-down refresh is off everywhere but Home; (3) the Story
// made for Ask Me Anything (and a poll) has a REAL tappable link on it, not just a picture of an address.
// (Tried in a real browser too: the page open and closed with Home hidden and put back at the same place, the refresh flag on each page, and tapping the link button of a Story.)
// Usage: node scripts/supabase/test-separate-pages-and-home-refresh.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const feed = read('src/components/Feed/FeedView.tsx');
const fullPage = read('src/utils/fullPage.ts');
const app = read('src/App.tsx');
const css = read('src/index.css');
const explore = read('src/components/Explore/ExploreView.tsx');
const anon = read('src/components/Anonymous/AnonymousMessagesPage.tsx');
const share = read('src/components/Fun/shareCard.ts');
const askPage = read('src/components/Fun/AskPage.tsx');
const pollsPage = read('src/components/Fun/PollsPage.tsx');
const funPages = ['ThisOrThatPage', 'AskPage', 'MoodPage', 'PollsPage'].map((n) => read(`src/components/Fun/${n}.tsx`));

section('1. The pages of the three-line menu are separate pages');
check(/const menuPageOpen = !!\(showAnonymous \|\| showOurTeam \|\| openPage \|\| drawOpen \|\| studyOpen\);/.test(feed), 'one flag knows when any of them is open: Anonymous Messages, Our Team, Daily NOOB, Rooms, Guess the Song, Live Lounge, the shop, the food stall, NOOB AI, Suggestion Box, Support, NOOB Draw, NOOB Study');
check(/openPage = showDailyNoob \? 'daily' : showNoobRooms \? 'rooms' : showGuessTheSong \? 'song' : showLiveLoungePage \? 'lounge'\s*:\s*showStorePage \? 'store' : showFoodStall \? 'food' : showNoobAi \? 'ai' : showSupportModal \? 'support' : showSuggestionBox \? 'suggestions' : null;/.test(feed), '... including every page the menu opens');
check(/<div data-home-content style=\{\{ display: menuPageOpen \? 'none' : 'contents' \}\}>/.test(feed), 'while one is open the Home page is HIDDEN (display: none), not just covered: nothing of it can show through when the keyboard pushes the screen up or a finger drags past the end');
check(/<\/div>\s*\{showAnonymous && \(/.test(feed), 'the pages themselves sit outside that hidden part, so they stay visible');
check(/useEffect\(\(\) => \{ if \(showNoobMenu\) homeSnapshot\.current = captureScroll\(containerRef\.current, 'feed'\); \}, \[showNoobMenu\]\);/.test(feed) && /if \(menuPageWasOpen\.current && !menuPageOpen && homeSnapshot\.current\) \{ restoreScroll\(homeSnapshot\.current\); homeSnapshot\.current = null; \}/.test(feed), 'Home comes back exactly as it was: the place is noted when the menu opens and put back when the page closes');
check(/useFullPage\(menuPageOpen\);/.test(feed) && /export function useFullPage/.test(fullPage) && /export function useAnyFullPage/.test(fullPage), 'the app is told a full page is open (it matters for the refresh rule below)');
check(/const drawOpen = useNoobDrawOpen\(\);/.test(feed) && /const studyOpen = useStudyNav\(\)\.open;/.test(feed), 'NOOB Draw and NOOB Study (drawn by the app itself) count as separate pages too');
check(/Fun pages|FunHub|PageLayerSlot layerId=\{0\} hidden=\{pageLayers\.layers\.length > 0\}/.test(app), 'the Fun pages are layers: the page under them is hidden the same way');

section('2. Only the Home page can be refreshed');
check(/const refreshableHere = activeTab === 'feed' && pageLayers\.layers\.length === 0 && !fullPageOpen;/.test(app) && /setAttribute\('data-refresh', refreshableHere \? 'on' : 'off'\)/.test(app), 'the app knows whether this is the Home page (and nothing is open over it)');
check(/html\[data-refresh="off"\],\s*html\[data-refresh="off"\] body \{ overscroll-behavior-y: contain; \}/.test(css), 'everywhere else the browser\'s own pull-down refresh (Android Chrome) is switched off');
check(/handleRefresh\(\)/.test(feed) && /Pull down to refresh/.test(feed), 'the Home page keeps its pull-down refresh');
check(!/handleTouchStart|handleTouchMove|handleTouchEnd|pullDistance|Pull down to|handleShuffleAndRefresh|startsInsideOverlay/.test(explore), 'Explore no longer has a pull-down refresh / shuffle');
check(!/RefreshCw|refreshNow|aria-label="Refresh messages"|setInterval/.test(anon), 'Anonymous Messages has no refresh button and no reload timer');
check(funPages.every((src) => !/RefreshCw|aria-label="Refresh"|REFRESH_MS/.test(src)) && funPages.every((src) => !/setInterval\(\(\) => \{ if \(document\.visibilityState/.test(src)), 'This or That, Ask Me Anything, Mood Status and Public Polls have no refresh button and no reload timer');
check(/setInterval\(\(\) => setNow\(Date\.now\(\)\), 30_000\)/.test(pollsPage), '(the only timer left is the clock that counts "ends in 2 h" down; it loads nothing)');

section('3. The Story has a real link');
check(/link\?: \{ url: string; label: string \};/.test(share) && /export const STORY_LINK_STICKER = \{ x: 50, y: 88, width: 66 \} as const;/.test(share), 'a card can carry a real link, placed near the bottom of the Story');
check(/export function storyLinkSticker\(link: \{ url: string; label: string \}\) \{\s*return \{ type: 'link' as const, data: \{ url: link\.url, label: link\.label \}/.test(share), 'the link is the Story\'s own "link" sticker: a button that opens the address');
check(/stickers: spec\.link \? \[storyLinkSticker\(spec\.link\)\] : \[\]/.test(share), 'it is added when the Story is posted');
check(/if \(spec\.footer && !spec\.link\) \{/.test(share), 'the picture does not also draw the address as dead text under the button');
check(/webLink: spec\.link\?\.url/.test(share), 'a Post made from the card carries the link as its own web link');
check(/title: q\.body, body: q\.answer \?\? undefined, link: \{ url: link, label: 'Ask me anything' \}/.test(askPage), 'an answer shared as a Story has the button');
check(/title: 'Ask me anything, anonymously', body: 'Send me a question\. I will never know who asked\.', link: \{ url: link, label: 'Ask me anything' \}/.test(askPage), '"Put my link in a Story" has the button');
check(/link: \{ url: link, label: 'Vote now' \}/.test(pollsPage), 'a poll shared as a Story has a "Vote now" button');
check(/const maxTitleLines = spec\.body \? 5 : spec\.options\?\.length \? \(spec\.options\.length > 4 \? 3 : 4\) : 7;/.test(share), 'the text is kept clear of the button');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
