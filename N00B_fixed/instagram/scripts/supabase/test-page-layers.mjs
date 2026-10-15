// "Go to previous page": a profile opens as a LAYER on top of the page that was showing (Home, Explore, Reels, Chat, another profile...), the page underneath stays alive and
// comes back exactly as it was (same order, same scroll), the phone's back button does the same, and the Reels stay quiet underneath. (The behaviour itself was also
// tried in a real browser: scroll, inner scroll, shuffled order, nested layers, phone back, tab taps, double taps, media.) Usage: node scripts/supabase/test-page-layers.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const layers = read('src/utils/pageLayers.tsx');
const app = read('src/App.tsx');
const profile = read('src/components/Profile/ProfileView.tsx');
const reels = read('src/components/Reels/ReelsView.tsx');

section('1. The layers');
check(/export function usePageLayers<T extends \{ id: string \}>\(page: string\)/.test(layers) && /export const PageLayerSlot/.test(layers), 'one hook keeps the layers, one slot component draws a page or a layer');
check(/cur\[cur\.length - 1\]\.data\.id === data\.id\) return;/.test(layers), 'opening the profile that is already on top does nothing (no double layer)');
check(/style=\{\{ display: hidden \? 'none' : 'contents' \}\}/.test(layers), 'a page underneath is kept alive but hidden; the one on top lays out as if there were no wrapper');
check(/MAX_LAYERS = 20/.test(layers) && /cur\.length >= MAX_LAYERS/.test(layers), 'there is a ceiling, so nothing can pile up forever');
check(/useLayoutEffect\(\(\) => \{[\s\S]{0,200}if \(count > before\) \{\s*window\.scrollTo\(\{ left: 0, top: 0, behavior: 'instant'/.test(layers), 'a layer that arrives starts at its top');

section('2. The page underneath comes back exactly as it was');
check(/export function captureScroll\(root: Element \| null, page: string\)/.test(layers) && /root\.querySelectorAll\('\*'\)\.forEach/.test(layers) && /el\.scrollTop > 0 \|\| el\.scrollLeft > 0/.test(layers), 'the page\'s scroll AND every scrolling box inside it (lists, rows of pills, the chat) are remembered');
check(/export function restoreScroll\(snap: ScrollSnapshot\)/.test(layers) && /requestAnimationFrame\(apply\)/.test(layers), 'and put back, once more after the layout has settled');
check(/snap\.page === pageRef\.current/.test(layers), 'a remembered place is never applied to a different page');
check(!/useState\(\(\) => .*shuffle|Math\.random/.test(layers), 'nothing is reshuffled or reloaded: the page is not rebuilt, so its order and state are simply still there');
check(/const visiblePosts = useMemo\(\(\) => posts\.filter\(\(p\) => !p\.isArchived\), \[posts\]\);/.test(app) && (app.match(/posts=\{visiblePosts\}/g) || []).length === 2, 'Home and Explore get the same list object until the posts really change, so drawing the app again never makes them start over');

section('3. The phone\'s back button');
check(/window\.history\.pushState\(\{ noobLayer: cur\.length \+ 1 \}, ''\)/.test(layers) && /history\.scrollRestoration = 'manual'/.test(layers), 'each layer adds one history entry, and the browser does not scroll by itself');
check(/addEventListener\('popstate', onPop\)/.test(layers) && /historyDepth\.current = Math\.max\(0, historyDepth\.current - 1\);\s*popOne\(\);/.test(layers), 'the phone\'s back button / swipe / browser Back closes one layer');
check(/window\.history\.back\(\)/.test(layers) && /backPending/.test(layers) && /\}, 500\);/.test(layers), 'the on-screen button goes through the same history, ignores a double tap, and never leaves anyone stuck');
check(/window\.history\.go\(-n\)/.test(layers) && /ignorePops\.current \+= 1;/.test(layers), 'closing all layers at once also puts the browser history back (and ignores its own echo)');
check(/\(e\.state as \{ noobLayer\?: number \} \| null\)\?\.noobLayer/.test(layers), 'Forward into a layer that is gone steps back over it');

section('4. Media');
check(/function pauseMedia\(root/.test(layers) && /!m\.paused && !m\.ended/.test(layers), 'whatever is playing under a layer is paused');
check(/if \(!m\.isConnected \|\| !\(m\.loop \|\| m\.autoplay\)\) return;/.test(layers), 'only what starts by itself starts again; a voice message someone pressed play on stays paused');
check(/export const usePageHidden/.test(layers) && /const playing = isPlaying && !pageHidden;/.test(reels) && /\}, \[playing, currentReel\?\.id\]\);/.test(reels) && /pageHiddenRef\.current\) return;/.test(reels), 'the Reels (one shared player and song) are told they are hidden: silent underneath, playing again on return, and a tap on the profile cannot unmute them');

section('5. In the app');
check(/const \[activeTab, setActiveTabState\] = useState<NavTab>\('feed'\);/.test(app) && /const pageLayers = usePageLayers<User>\(activeTab\);/.test(app), 'the layers follow the page that is showing');
check(/const setActiveTab = useCallback\(\(tab: NavTab\) => \{ clearPageLayers\(\{ restore: false \}\); setActiveTabState\(tab\); \}, \[clearPageLayers\]\);/.test(app), 'every jump to a page ("open this post", "message this person"...) closes the layers first');
check(!/viewingProfileUser|setViewingProfileUser/.test(app), 'the old "viewing profile" state (which replaced the page) is gone');
check(/setActiveTab\('profile'\);\s*\} else \{[^}]*pageLayers\.push\(user\);/.test(app), 'someone else\'s profile is pushed as a layer; my own is the Profile tab');
check(/pageLayers\.update\(user\);\s*return;/.test(app) && /pageLayers\.patch\(userId, \(u\) => \(\{/.test(app), 'newer details and follow changes reach the open profile');
check(/else if \(pageLayers\.layers\.length > 0 && tab === activeTab\) \{[^}]*pageLayers\.clear\(\{ restore: true \}\);/.test(app), 'tapping the tab you are already on returns to your page at your place');
check(/<PageLayerSlot layerId=\{0\} hidden=\{pageLayers\.layers\.length > 0\} register=\{pageLayers\.register\}>/.test(app) && /\{pageLayers\.layers\.map\(\(layer, i\) => \(\s*<PageLayerSlot key=\{layer\.id\} layerId=\{layer\.id\} hidden=\{i !== pageLayers\.layers\.length - 1\}/.test(app), 'the page and each profile layer are drawn in their own slot; only the top one shows');
check(/const pageTab: NavTab = pageLayers\.layers\.length > 0 \? 'profile' : activeTab;/.test(app) && /hideOnMobile=\{activeTab === 'chat' && chatConversationOpenOnMobile && pageLayers\.layers\.length === 0\}/.test(app), 'the layout follows what is showing, and the bottom bar stays while a profile is open over an open chat');
check(/onGoBack=\{pageLayers\.back\}/.test(app) && /\{activeTab === 'profile' && renderProfileView\(null\)\}/.test(app), 'the profile page (mine or another\'s) is one piece of code with a "go back" for layers');

section('6. The button');
check(/onGoBack\?: \(\) => void;/.test(profile) && /onClick=\{onGoBack\}\s*aria-label="Go to previous page"/.test(profile) && /<span>Go to previous page<\/span>/.test(profile), 'the profile banner says "Go to previous page" (not "Back to My Profile")');
check(!/Back to My Profile/.test(profile), 'the old wording is gone');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
