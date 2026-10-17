// The bottom bar is flat and full width like YouTube's: line icons with small labels, a circled plus for Create in the middle, the picture
// for "You" at the end; the pages that do not fit are in the menu on Home. Usage: node scripts/supabase/test-bottom-nav-flat.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const nav = read('src/components/Navigation/FloatingNavBar.tsx');
const css = read('src/index.css');
const app = read('src/App.tsx');

section('1. What is on the bar');
const ids = [...nav.matchAll(/id="nav-item-(\w+)"/g)].map((m) => m[1]);
check(ids.join(',') === 'feed,explore,reels,post,chat,games,profile', 'Home, Explore, Reels, Create (the middle), Chat, Games, You — in that order', ids.join(','));
check(/grid-cols-7/.test(nav), 'seven equal columns');
check(/CirclePlus/.test(nav) && /id="nav-item-post"[^>]*title="Create a post, reel or story"[^>]*onClick=\{\(\) => onSelectTab\('post'\)\}/.test(nav), 'Create is a circled plus with no label, and opens the same picker as before');
check(!/id="nav-item-post"[^>]*active=/.test(nav), 'Create is never the "open" page');
check(/label="You" title="My Profile"/.test(nav) && /nav-ava/.test(nav), 'the last one is "You", with the person\'s own picture');
check(/unreadChatCount > 0/.test(nav), 'the unread count stays on Chat');
check(/onPressTab\?\.\(id\.slice\('nav-item-'\.length\)/.test(nav), 'touching an icon still starts its page downloading');
check(/aria-current=\{active \? 'page' : undefined\}/.test(nav), 'the open page is marked for screen readers');

section('2. The look');
check(/className=\{`fixed bottom-0 left-1\/2 -translate-x-1\/2 z-40 w-full max-w-\[480px\] md:max-w-2xl[^`]*xl:hidden/.test(nav), 'flat, at the very bottom, the full width of the page, and still hidden where the side menu takes over');
check(/#floating-bottom-nav \.nav-row \{ height: 60px; \}/.test(css), 'the bar is tall enough that the labels are never squeezed (the icons keep their size)');
check(/text-\[10px\]/.test(nav) && /w-6 h-6/.test(nav), 'small labels under 24-pixel icons');
check(/#floating-bottom-nav \{\s*height: var\(--nav-h\);\s*padding-bottom: max\(env\(safe-area-inset-bottom, 0px\), 10px\);[^\n]*\n\s*background-color: var\(--page\);\s*border-top: 1px solid/.test(css), 'page-coloured bar with a hairline on top, never less than 10px clear of the screen\'s bottom edge');
check(/--nav-h: calc\(61px \+ max\(env\(safe-area-inset-bottom, 0px\), 10px\)\)/.test(css), 'the bar\'s height is one variable everything else can use');
check(/\.nav-item\.is-active \.nav-ico \{ stroke-width: 2\.4; \}/.test(css) && /\.nav-item\.is-active \.nav-lbl \{ font-weight: 700; \}/.test(css), 'the open page has a heavier icon and a bold label');
check(/\.nav-create \{ stroke-width: 1\.3; \}/.test(css), 'the circled plus is thin');
check(/#floating-bottom-nav\[data-tab="reels"\] \{\s*--color-noob: #ffffff;\s*background-color: #0f0f11;/.test(css) && /data-tab=\{activeTab\}/.test(nav), 'on Reels the bar is the page\'s own near-black');

section('3. Everything else stays clear of it');
const chat = read('src/components/Chat/ChatView.tsx');
const reels = read('src/components/Reels/ReelsView.tsx');
const mini = read('src/components/Music/FloatingMiniPlayer.tsx');
check(!/calc\(100vh-80px\)/.test(chat) && (chat.match(/calc\(100vh-var\(--nav-h\)\)/g) || []).length === 2 && /h-\[calc\(100vh-var\(--nav-h\)\)\]/.test(app), 'the chat list and its placeholder end exactly at the bar');
check((reels.match(/pb-\[var\(--nav-h\)\]/g) || []).length === 2 && !/pb-20/.test(reels), 'the Reels page ends exactly at the bar');
check(/bottom-\[calc\(var\(--nav-h\)\+0\.5rem\)\]/.test(mini), 'the little music player floats just above the bar');

section('4. The pages that are not on the bar');
const feed = read('src/components/Feed/FeedView.tsx');
check(/\{onOpenTab && !musicHidden && \(\s*<button\s+onClick=\{\(\) => onOpenTab\('music'\)\}\s+data-testid="feed-music-button"/.test(feed) && !/<Plus /.test(feed), 'the round button at the top of Home is the Music page now (the plus moved to the bar), and is gone while Music is hidden');
check(/onOpenTab=\{handleSelectNavTab\}/.test(app) && /hideOnMobile=/.test(app) && !/hideMusic/.test(app), 'the menu on Home opens Videos and Music (and the bar no longer needs to know about Music)');
check(/TAB_PRELOADS/.test(app) && /\['videos', preload/.test(app) && /\['music', preload/.test(app), 'Videos and Music are still fetched in the background');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
