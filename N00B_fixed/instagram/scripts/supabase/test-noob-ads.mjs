// Google (AdMob) native ads in the Android app: the phone-side plugin, the build wiring and the page-side box. Nothing here may ever cost the app its start or anybody's data.
// Usage: node --liftoff-only scripts/supabase/test-noob-ads.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const java = read('android-overrides/NoobAdsPlugin.java'), main = read('android-overrides/MainActivity.java'), wf = read('../../.github/workflows/android-build.yml');
const ads = read('src/ads/noobAds.ts'), slot = read('src/components/Ads/AdSlot.tsx'), mix = read('src/components/Feed/HomeMix.tsx'), feed = read('src/components/Feed/FeedView.tsx'), feat = read('src/utils/features.ts'), filt = read('src/utils/homeFilter.ts');

console.log('1. The build (a missing app id would stop the app at start-up)');
check(/com\.google\.android\.gms\.ads\.APPLICATION_ID" android:value="ca-app-pub-1264107433589197~4159216677"/.test(wf) && /grep -q 'com\.google\.android\.gms\.ads\.APPLICATION_ID" android:value="ca-app-pub-1264107433589197~4159216677"'/.test(wf), 'the workflow writes the AdMob app id into the manifest and the build stops if it is missing');
check(/play-services-ads:23\.6\.0/.test(wf) && /grep -q 'play-services-ads:23\.6\.0' android\/app\/build\.gradle/.test(wf), 'the workflow adds the Google Mobile Ads SDK and checks it is there');
check(/registerPlugin\(NoobAdsPlugin\.class\)/.test(main) && /cp android-overrides\/NoobAdsPlugin\.java/.test(wf) && /registerPlugin\(NoobAdsPlugin\.class\)' android\/app\/src\/main\/java\/com\/noob\/social\/MainActivity\.java/.test(wf), 'the plugin is copied in, registered, and the build checks it is');
check(ads.includes("ca-app-pub-1264107433589197~4159216677") && ads.includes('ca-app-pub-1264107433589197/6154824629') && ads.includes('ca-app-pub-1264107433589197/2163608729'), 'the app id and the two ad units are the ones made in AdMob');

console.log('\n2. The phone-side plugin');
const jcode = strip(java);
check(/@CapacitorPlugin\(name = "NoobAds"\)/.test(java) && /public void start\(/.test(java) && /public void place\(/.test(java) && /public void remove\(/.test(java), 'the plugin offers start, place and remove');
const methods = jcode.split('@PluginMethod').slice(1);
check(methods.length === 3 && methods.every((m) => /try \{/.test(m) && /catch \(Throwable/.test(m)), 'every call from the page is wrapped: a problem becomes "no ad", never an error that stops the app');
check(/runOnUiThread/.test(jcode) && /catch \(Throwable ignored\)/.test(jcode) && /onAdFailedToLoad/.test(jcode) && /failed = true/.test(jcode), 'the screen work is wrapped too, and "no ad" (no fill, offline) just marks the box as failed');
check(/handleOnDestroy/.test(jcode) && /destroySlot/.test(jcode) && /\.destroy\(\)/.test(jcode), 'every ad is released when the screen is destroyed or the page asks');
check(/MAX_SLOTS = 6/.test(jcode), 'at most 6 ad boxes at a time');
check(/setMaxAdContentRating\(RequestConfiguration\.MAX_AD_CONTENT_RATING_T\)/.test(jcode), 'adult ads are kept away (the app has teenagers)');
check(/badge\.setText\("Ad"\)/.test(jcode) && /setCallToActionView/.test(jcode) && /setMediaView/.test(jcode) && /setNativeAd\(ad\)/.test(jcode), 'the card shows the "Ad" label, Google\'s button and the picture/video, registered with the ad as AdMob requires');
check(/setCornerRadius\(radius\)/.test(jcode) && /setClipToOutline\(true\)/.test(jcode), 'the ad is in a box with curved edges');
check(/web\.dispatchTouchEvent\(forWeb\)/.test(jcode) && /ACTION_CANCEL/.test(jcode) && /moved = true/.test(jcode), 'a swipe that starts on the ad scrolls the page (the ad gets "cancel", so finishing a scroll is never a tap on the ad)');
check(!/SharedPreferences|openFileOutput|deleteFile|getDatabasePath|SQLite|\.delete\(/.test(jcode), 'the plugin never touches files, settings or databases of the app');

console.log('\n3. The page side');
const scode = strip(slot) + strip(ads);
check(/adsAvailable\(\)/.test(slot) && /Capacitor\.getPlatform\(\) === 'android'/.test(ads) && /Capacitor\.isNativePlatform\(\)/.test(ads), 'the website and the iPhone app show no ads and no empty box');
check(/Europe/.test(ads) && /consent/i.test(ads), 'Europe is left out until a consent form exists');
check(/if \(gone\) return null;/.test(slot) && /state === 'failed'\) setGone\(true\)/.test(slot) && /12000/.test(slot), 'when there is no ad the box closes and leaves no gap; after 12 seconds without an ad it closes anyway');
check(/elementFromPoint/.test(slot) && /visible = false/.test(slot) && /removeAd\(slot\)/.test(slot), 'nothing is drawn while a page or sheet covers the box, and the ad is released when the box leaves');
check(!/localStorage|sessionStorage|supabase|indexedDB|fetch\(/.test(scode), 'the ad code does not read or write the app\'s data or the server');
check(/AD_UNIT_TEST_NATIVE/.test(mix) && /isMainAdmin\(currentUser\) \? AD_UNIT_TEST_NATIVE : AD_UNIT_HOME/.test(mix), 'the administrator always sees Google\'s test ad, never a real one (tapping your own ads can end the AdMob account)');
check(/AD_SLOT_IDS/.test(mix) && /kind: 'ad'/.test(mix) && /adsOn/.test(mix), 'two ad boxes are mixed in between the posts on Home');
check(/featOn\('ads'\) && adsAvailable\(\)/.test(feed) && /key: 'ads'/.test(feat), 'the administrator can switch the ads off (Pages tab) and they vanish without an app update');
check(/item\.kind === 'ad'/.test(filt), 'a filter on Home by kind hides the ad boxes');

console.log('\n4. Reels');
const reels = read('src/components/Reels/ReelsView.tsx'), host = read('src/components/Ads/ReelsAdHost.tsx'), rcss = read('src/components/Reels/reels.css');
check(/<ReelsAdHost swipes=\{swipes\} isAdmin=\{isMainAdmin\(currentUser\)\} onOpenChange=\{setAdOpen\}/.test(reels) && /setSwipes\(\(n\) => n \+ 1\)/.test(reels), 'Reels counts the swipes and hosts the ad page');
check(/anyModalOpen = showComments \|\| showReelOptionsMenu \|\| showLikesViewsSheet \|\| adOpen/.test(reels) && /renderCard\(currentReel, !adOpen\)/.test(reels), 'while the ad page is up the reels ignore swipes and the reel under it waits (paused)');
check(!/setLocalReels\(/.test(strip(host)) && !/localReels/.test(strip(host)), 'the ad page never changes the list of reels');
check(/EVERY = 6/.test(host) && /ASK_AT = 3/.test(host) && /ready && swipes > 0 && phase === 0/.test(host), 'an ad page comes every sixth swipe, and only when the ad is already READY (otherwise nothing comes up)');
check(/useFeatureOn\('ads'\) && adsAvailable\(\)/.test(host) && /isAdmin \? AD_UNIT_TEST_NATIVE : AD_UNIT_REELS/.test(host), 'it follows the ads switch of the administrator and the Android-only rule; the administrator sees test ads');
check(/y0 - y1 > 70\) close\(\)/.test(host) && /data-testid="reels-ad-skip"/.test(host), 'a swipe up, or Skip, goes back to the reels');
check(/\.rad-page \{[^}]*z-index: 45/.test(rcss) && /\.rad-hidden \{[^}]*pointer-events: none/.test(rcss), 'styles for the ad page and the unseen box used while the ad is asked for');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
