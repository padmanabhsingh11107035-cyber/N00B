// Speed and reliability: (1) the People list never turns a failure into "nobody is here" - it retries, shares one request, keeps what it knows and offers Retry; (2) Home and Explore
// stay alive between tab switches (instant, at the same place, nothing rebuilt or fetched again); (3) every minigame is its own file, loaded when its game opens; (4) online games do
// not pile up requests on a slow connection; (5) the start-up does not wait for the heaviest request.
// (Tried in a real browser too: the people request failing three times shows "Could not load people" + Try again and a retry fills the list; Home comes back at scroll 900 and
// Explore at 300 after tab switches; a lazily loaded game starts and plays.)
// Usage: node scripts/supabase/test-speed-and-reliability.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const api = read('src/services/supabaseApi.ts');
const apiIndex = read('src/services/api.ts');
const explore = read('src/components/Explore/ExploreView.tsx');
const app = read('src/App.tsx');
const layers = read('src/utils/pageLayers.tsx');
const modal = read('src/components/Games/GamePlayModal.tsx');

section('1. The people list (pure logic)');
const P = await import(pathToFileURL(path.resolve('src/utils/peopleList.ts')).href);
const u = (id, extra = {}) => ({ id, username: id, ...extra });
check(P.realPeople([u('a'), u('noob_ai'), u('x', { isAi: true }), u('u_noob_ai')]).map((x) => x.id).join() === 'a', "NOOB's own AI account is never listed");
check(P.realPeople(null).length === 0 && P.realPeople(undefined).length === 0, 'no list is an empty list, not a crash');
const many = Array.from({ length: 40 }, (_, i) => u('p' + i));
const sh = P.shufflePeople([u('pin1', { pinned: true }), u('pin2', { pinned: true }), ...many]);
check(sh.length === 42 && sh[0].id === 'pin1' && sh[1].id === 'pin2', 'pinned accounts stay first, in their order');
check(new Set(sh.map((x) => x.id)).size === 42, 'shuffling loses and repeats nobody');
check(sh.slice(2).map((x) => x.id).join() !== many.map((x) => x.id).join(), 'everyone else is shuffled');
const seq = [0.9, 0.1, 0.5]; let k = 0;
check(P.shufflePeople(many, () => seq[k++ % 3]).length === 40, 'shuffling accepts a fixed source of randomness (testable)');
const shown = [u('c'), u('a'), u('b')];
const merged = P.mergePeople(shown, [u('a', { bio: 'new' }), u('d'), u('b'), u('c')]);
check(merged.slice(0, 3).map((x) => x.id).join() === 'c,a,b', 'a fresh answer keeps the order already on screen (the list never jumps)');
check(merged[1].bio === 'new', '... with the newest details');
check(merged.length === 4 && merged[3].id === 'd', '... and a new person is added at the end');
check(P.mergePeople([u('a'), u('gone')], [u('a')]).map((x) => x.id).join() === 'a', 'someone who left is removed');

section('2. A failure is an error, never "nobody is here"');
check(/export function fetchUsersStrict\(search\?: string\): Promise<User\[\]>/.test(api) && /throw lastError;/.test(api), 'there is a version of the call that throws when it fails');
check(/const USERS_RETRY_MS = \[400, 1200\];/.test(api) && /for \(let attempt = 0; attempt <= USERS_RETRY_MS\.length; attempt\+\+\)/.test(api), 'a blip is tried again twice (after 0.4 s and 1.2 s) before it counts');
check(/if \(!session\) throw new ApiError\('Not signed in'\);/.test(api), 'not being signed in is answered at once, without waiting for retries');
check(/const running = usersInFlight\.get\(key\);\s*if \(running\) return running;/.test(api) && /usersInFlight\.delete\(key\)/.test(api), 'the same request asked twice at once is one request');
check(/if \(!key\) usersDirectory = \{ uid: session\.user\.id, at: Date\.now\(\), list \};/.test(api), 'the last full list is kept for this account');
check(/return usersDirectory && uid && usersDirectory\.uid === uid \?/.test(api), '... and is never shown to a different account');
check(/export async function fetchUsers\(search\?: string\): Promise<User\[\]> \{\s*try \{\s*return await fetchUsersStrict\(search\);\s*\} catch \{\s*return \[\];/.test(api), 'the old call (for look-ups) still never throws');
check(/fetchUsersStrict,\s*peekUsersDirectory,/.test(apiIndex), 'the API index exports both');
check(/const \[usersList, setUsersList\] = useState<User\[\]>\(\(\) => \{\s*const known = peekUsersDirectory\(currentUser\?\.id\);/.test(explore), 'Explore starts from the people already known, so they show at once');
check(/const \[loadingUsers, setLoadingUsers\] = useState\(usersList\.length === 0\);/.test(explore), 'the first frame is "loading", never a flash of "no people found"');
check(/const id = \+\+usersRequest\.current;/.test(explore) && (explore.match(/if \(id !== usersRequest\.current\) return;/g) || []).length === 2, 'only the newest request may change the screen');
check(/setUsersFailed\(true\)/.test(explore) && /Could not load people/.test(explore) && /Try again/.test(explore), 'a failure with nothing to show says so and offers Try again');
check(/usersList\.length === 0 && usersFailed \?/.test(explore), '... while a failure with people already on screen keeps them');
check(/window\.setTimeout\(\(\) => \{ void loadUsers\(searchQuery\); \}, 250\)/.test(explore), 'a typed search waits for a pause in typing');
check(/window\.addEventListener\('online', retry\)/.test(explore) && /document\.addEventListener\('visibilitychange', retry\)/.test(explore), 'coming back online / back to the tab tries again by itself');
check(!/Math\.random\(\) - 0\.5/.test(explore), 'no more biased sort-shuffle');

section('3. Home and Explore stay alive');
check(/export const KeepAliveTab/.test(layers) && /display: hidden \? 'none' : 'contents'/.test(layers.slice(layers.indexOf('KeepAliveTab'))), 'a tab can be kept alive and hidden');
check(/if \(!hidden\) held\.current = children;/.test(layers), 'while hidden it is not drawn again when the app changes something in the background');
check(/if \(hidden\) paused\.current = pauseMedia\(ref\.current\);\s*else \{ resumeMedia\(paused\.current\);/.test(layers), 'whatever plays by itself is paused while hidden and resumed on return');
check(/export const PageHiddenScope/.test(layers) && /value=\{above \|\| hidden\}/.test(layers), 'the page inside is told it is hidden (usePageHidden)');
check(/export function useTabScroll\(active: string, keepAlive: readonly string\[\], enabled: boolean\)/.test(layers), "each tab's scroll place is remembered");
check(/const top = keepAlive\.includes\(active\) \? places\.current\.get\(active\) \?\? 0 : 0;/.test(layers), 'kept tabs come back at their place, every other tab starts at its top');
check(/const KEEP_ALIVE_TABS: readonly NavTab\[\] = \['feed', 'explore'\];/.test(app), 'Home and Explore are the kept tabs (Reels, Videos, Music, Games, Chat are not: they play media or hold connections)');
check(/\{kept\.has\('feed'\) && \(\s*<KeepAliveTab hidden=\{activeTab !== 'feed'\}>\s*<FeedView/.test(app) && /\{kept\.has\('explore'\) && \(\s*<KeepAliveTab hidden=\{activeTab !== 'explore'\}>/.test(app), 'they are drawn once visited, hidden when another tab shows');
check(/if \(visitedTabs\.current\.uid !== currentUser\.id\) visitedTabs\.current = \{ uid: currentUser\.id, tabs: new Set<NavTab>\(\) \};/.test(app), 'another account starts clean: nothing of the last one is kept');
check(/useTabScroll\(activeTab, KEEP_ALIVE_TABS, pageLayers\.layers\.length === 0 && !fullPageOpen\)/.test(app), 'the place is only noted while the tab itself is showing');

section('4. Every game is its own file');
check(!/^import \{ (CyberSnakeGame|TicTacToeGame|ChessGame|LudoGame|MonopolyGame|SnakesAndLaddersGame|RockPaperScissorsGame|SpeedMathGame|MemoryMatchGame|ReactionTapGame|ColorRushGame|GenericArcadeGame|ChessOnlineMatch) \} from '\.\/minigames/m.test(modal), 'the game window no longer imports every game up front');
check((modal.match(/lazyTab\(\(\) => import\('\.\/minigames\//g) || []).length >= 13, 'every game engine is loaded on demand (13 when this was written, more now)');
check(/for \(const load of GAME_PRELOADS\[game\.id\] \?\? \[preloadGeneric\]\) void load\(\)\.catch\(\(\) => undefined\);/.test(modal), "the chosen game's file starts loading as soon as its window opens");
check(/<React\.Suspense fallback=\{<GameLoading \/>\}>\s*<div className="space-y-3">/.test(modal), "a small spinner covers the moment a game's file is on its way");
check(['cyber_snake', 'snake', 'pac_grid', 'tictactoe', 'chess_blitz', 'snakes_ladders', 'ludo_classic', 'monopoly_noob', 'rps', 'speed_math', 'memory_match', 'reaction_tap', 'bubble_blitz'].every((id) => new RegExp('\\b' + id + ': \\[').test(modal)), 'every game id has its file(s) listed for preloading');

section('5. Online games and start-up');
check((modal.match(/setInterval\(pollOnce\(async \(\) => \{/g) || []).length === 4 && !/setInterval\(async/.test(modal), 'all four online polls (matchmaking, waiting for a friend, waiting for a result, live board) skip a turn while the last answer is still on its way');
check(/if \(busy\) return;\s*busy = true;\s*void ask\(\)\.finally\(\(\) => \{ busy = false; \}\);/.test(modal), 'pollOnce never runs two at once and always lets go afterwards');
check(!/fetchHomeStoryTray\(\),\s*fetchReels\(\),\s*fetchUsers\(\)/.test(app) && /if \(user\) void fetchUsers\(\)\.then\(\(list\) => \{ if \(list\.length\) setRegisteredUsers\(list\); \}\);/.test(app), 'the first screen no longer waits for the heaviest request (the people list)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
