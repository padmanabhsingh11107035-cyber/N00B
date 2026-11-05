// Batch of 2026-11-03: the Pro Ultimate quiet look at a story, the install button rules (none on an iPhone, none once the Android app is installed), the top strip painted in the page's colour,
// and the Messages header colour #0E4B37. Usage: node --liftoff-only scripts/supabase/test-peek-install-strip.mjs
import fs from 'node:fs';
let passed = 0, failed = 0;
const check = (c, l, d = '') => { if (c) { passed++; console.log(`  ok   ${l}`); } else { failed++; console.log(`  FAIL ${l} ${d}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split('\r').join('');
const tray = read('src/components/Stories/StoryTray.tsx'), viewer = read('src/components/Stories/StoryViewerModal.tsx'), app = read('src/App.tsx');
console.log('\n1. Quiet look (NOOB Pro Ultimate)');
check(/proTier !== 'ultimate'\) return;/.test(tray) && /setTimeout\(\(\) => \{ peekFired\.current = true;[^}]*onOpenStoryViewer\(item\.startIndex, true\)/.test(tray) && /, 450\)/.test(tray), 'only Ultimate: press and hold a circle for 0.45 s opens that story as a quiet look');
check(/if \(peekFired\.current\) \{ peekFired\.current = false; return; \}/.test(tray) && /onContextMenu=\{\(e\) => \{ if \(currentUser\.proTier === 'ultimate'\) e\.preventDefault/.test(tray), 'letting go does not also open it normally, and the phone\'s press menu does not pop up');
check(/if \(isHighlight \|\| peek \|\| !story \|\| story\.userId === currentUser\.id\) return;\n\s+recordStoryView/.test(viewer), 'a quiet look records no view (no name in "Seen by", the ring stays unseen)');
check(/story-peek-pill/.test(viewer) && /won’t see you/.test(viewer), 'a small pill says it is a quiet look');
check(/setStoryPeek\(peek && currentUser\?\.proTier === 'ultimate' && list\[index\]\.userId !== currentUser\?\.id\)/.test(app) && /peek=\{storyPeek\}/.test(app), 'the app checks the plan again and never uses it on your own story');
console.log('\n2. Install button');
const pwa = read('src/utils/pwaInstall.ts'), invite = read('src/components/Common/InstallInvite.tsx'), page = read('src/components/Profile/InstallAndPermissionsPage.tsx'), auth = read('src/components/Auth/AuthView.tsx');
check(/noob_app_installed/.test(pwa) && /remember\(true\)/.test(pwa) && /installed = false; remember\(false\)/.test(pwa) && /rememberedInstall\(\) && !deferredPrompt/.test(pwa), 'an installed Android app is remembered (installed, or opened as an app) and forgotten when the browser offers the install again');
check(/!isIos\(currentPushEnv\(\)\)\)/.test(invite), 'the install invitation never opens on an iPhone');
check(/onIos \? " hidden" : ""/.test(page), 'the Install card in settings is hidden on an iPhone');
check(/const hideInstall = !installElsewhere && \(appInstalled \|\| isAppleMobile\(\)\)/.test(auth), 'the login screen has no install button on an iPhone or when installed');
console.log('\n3. Top strip and Messages colour');
const strip = read('src/utils/statusStrip.ts'), main = read('src/main.tsx'), css = read('src/index.css'), chat = read('src/components/Chat/ChatView.tsx');
check(/elementFromPoint\(Math\.floor\(window\.innerWidth \/ 2\), 3\)/.test(strip) && /setAttribute\('content', colour\)/.test(strip) && /style\.backgroundColor = colour/.test(strip) && /pointer: coarse/.test(strip), 'on a touch screen the strip behind the clock / Dynamic Island takes the colour drawn at the top edge of the open page');
check(/MutationObserver/.test(strip) && /'scroll', queue/.test(strip) && /setStripColour/.test(strip) && /noob-top-edge/.test(strip) && /initStatusStrip\(\);/.test(main), 'it follows page changes and scrolling, lets Messages set its own colour (also drawn by a thin bar at the top edge), and starts with the app');
check(/--head: #0E4B37;/.test(css) && /'#0E4B37'/.test(chat) && !/02351f/.test(css + chat), 'the Messages header green is #0E4B37 everywhere');
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
