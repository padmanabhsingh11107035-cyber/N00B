// "Settings and activity": the full-screen hub the profile's three dots open. Checks that every row has a real page behind it, every page link goes somewhere, the profile gives the hub
// everything it asks for, the choices really reach the places that obey them (feed, story tray, likes, chats, presence, links, uploads), and the small rules of the device settings
// and the time reminders. (The server half is tested in test-settings-hub.mjs.)
// Usage: node --liftoff-only scripts/supabase/test-settings-hub-ui.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

// a small stand-in for the browser's storage, before the modules that read it are loaded
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } };

const registry = read('src/components/Settings/registry.ts');
const pagesIndex = read('src/components/Settings/pages/index.tsx');
const types = read('src/components/Settings/types.ts');
const hub = read('src/components/Settings/SettingsHub.tsx');
const profile = read('src/components/Profile/ProfileView.tsx');
const pageFiles = ['account', 'activity', 'interact', 'see', 'app', 'support', 'update', 'chats', 'subscription', 'searchsong'].map((n) => [n, read(`src/components/Settings/pages/${n}.tsx`)]);
const allPages = pageFiles.map(([, s]) => s).join('\n');

section('1. Every row opens something real');
const pageKeys = new Set([...pagesIndex.matchAll(/^\s{2}'?([a-z-]+)'?: (?:[A-Z]\w+|list\()/gm)].map((m) => m[1]));
const rows = [...registry.matchAll(/\{ id: '([a-z-]+)', section: '([^']+)', label: '([^']+)'[^\n]*\}/g)].map((m) => ({ id: m[1], section: m[2], label: m[3], line: m[0] }));
check(rows.length >= 45, `the list has ${rows.length} rows`);
check(pageKeys.size >= 40, `${pageKeys.size} pages are registered`);
const dead = rows.filter((r) => { const pg = r.line.match(/page: '([a-z-]+)'/); return pg && !pageKeys.has(pg[1]); });
check(dead.length === 0, 'every row that names a page names one that exists', dead.map((r) => r.id).join(', '));
const actionKeys = [...types.slice(types.indexOf('interface SettingsActions'), types.indexOf('interface SettingsContext')).matchAll(/^\s{2}(\w+): \(/gm)].map((m) => m[1]);
const badAction = rows.filter((r) => { const a = r.line.match(/action: '(\w+)'/); return a && !actionKeys.includes(a[1]); });
check(badAction.length === 0, 'every row that names an action names one the profile can do', badAction.map((r) => r.id).join(', '));
const linked = new Set([...allPages.matchAll(/\bgo\('([a-z-]+)'\)/g)].map((m) => m[1]));
const lost = [...linked].filter((k) => !pageKeys.has(k));
check(lost.length === 0, 'every page link inside a page goes to a page that exists', lost.join(', '));
const reachable = new Set([...rows.map((r) => (r.line.match(/page: '([a-z-]+)'/) || [])[1]).filter(Boolean), ...linked]);
const orphan = [...pageKeys].filter((k) => !reachable.has(k));
check(orphan.length === 0, 'and every page can be reached from the list or from another page', orphan.join(', '));
const exported = [...pagesIndex.matchAll(/^\s{2}'?[a-z-]+'?: ([A-Z]\w+),?$/gm)].map((m) => m[1]);
check(exported.every((n) => new RegExp(`export const ${n}\\b`).test(allPages)), 'every page the index names is a real component', exported.filter((n) => !new RegExp(`export const ${n}\\b`).test(allPages)).join(', '));

section('2. All of Instagram’s settings that make sense here, in NOOB’s own look');
const labels = rows.map((r) => r.label.toLowerCase());
for (const want of ['your noob account', 'saved', 'archive', 'your activity', 'notifications', 'time management', 'account privacy', 'close friends', 'blocked', 'story privacy', 'activity status',
  'messages and story replies', 'tags and mentions', 'comments', 'sharing and reuse', 'restricted', 'limit interactions', 'hidden words', 'follow and invite friends', 'favourites', 'muted accounts',
  'content preferences', 'like and share counts', 'device permissions', 'archiving and downloading', 'accessibility', 'language and translations', 'media quality', 'app and website permissions',
  'orders and payments', 'help', 'privacy centre', 'account status', 'about', 'log out', 'add profile']) check(labels.includes(want), `"${want}" is there`);
check(!/meta account|meta ai|threads|family cent|instagram for ipad|ads payments|meta one|more from meta/i.test(registry), 'the Meta items are not there');
check(/'More from NOOB'/.test(registry) && ['wallet', 'profile finder using qr', 'my qr code', 'live profile picture', 'get verified', 'calculator', 'follow us on'].every((l) => labels.includes(l)), "NOOB's own extras sit in a \"More from NOOB\" section");
check(/show: \(c\) => c\.isStaff/.test(registry) && /label: 'Log out'[^\n]*show: \(c\) => c\.canLogout/.test(registry), 'the admin panel row is for staff only and Log out only where logging out is possible');
check(!/\b(bg-blue|text-blue|from-blue|bg-purple|from-purple|bg-pink|text-pink)\b/.test(allPages + read('src/components/Settings/kit.tsx') + hub), 'the pages use only the app’s black-and-white theme');

section('3. The hub');
check(/ArrowLeft/.test(hub) && /Settings and activity/.test(hub) && /data-testid="settings-search"/.test(hub), 'a Back arrow, the title and a search box');
check(/fixed inset-0 z-\[45\]/.test(hub) && /useFullPage\(true\)/.test(hub), 'it fills the whole screen and hides the bottom bar');
check(/pushState\(\{ noobSettings/.test(hub) && /addEventListener\('popstate'/.test(hub) && /history\.go\(-/.test(hub), "the phone's Back button goes up one page, and leaving Settings takes its history entries off");
check(/e\.key === 'Escape'/.test(hub), 'Escape goes back too');
check(/searchRows\(rows, query\.trim\(\)\)/.test(hub) && /every word must be found|words\.every/.test(registry), 'the search finds rows by label, text and keywords');
check(/<Suspense fallback=\{<PageLoading \/>\}>/.test(hub), 'if something has to be fetched, the burger shows while it is');

section('4. The profile gives the hub what it asks for');
for (const k of actionKeys) check(new RegExp(`\\b${k}: `).test(profile.slice(profile.indexOf('const settingsContext'))), `the profile does "${k}"`);
check(/if \(isOwnProfile\) \{ setShowThreeDotsMenu\(false\); setShowSettingsHub\(true\); \} else setShowThreeDotsMenu\(!showThreeDotsMenu\)/.test(profile), 'on your own profile the three dots open Settings and activity');
check(/data-testid="profile-three-dots"/.test(profile) && /title=\{isOwnProfile \? 'Settings and activity' : 'Options'\}/.test(profile), 'and say so');
check(/\{showSettingsHub && isOwnProfile && \(/.test(profile) && /React\.lazy\(\(\) => import\('\.\.\/Settings\/SettingsHub'\)/.test(profile), 'the hub is drawn only for your own profile and loaded when first needed');
check(/Actions for other user profiles/.test(profile) && /Report @/.test(profile) && /Share Profile/.test(profile), "other people's profiles keep their small menu (block, hide, report, share)");
check(!/Settings & Account Controls/.test(profile) && !/handleSavePrivacySettings/.test(profile) && !/Update Password/.test(profile), 'the old Settings window is gone: everything it did has a page');
check(/openProfessionalDashboard: \(\) => \{ setShowSettingsHub\(false\); onOpenProfessionalDashboard\(\); \}/.test(profile) && /logout: \(\) => \{ setShowSettingsHub\(false\); onLogout\?\.\(\); \}/.test(profile), 'leaving for another page or logging out closes Settings first');
check(/canLogout: !!onLogout/.test(profile) && /canDeleteAccount: !!onDeleteMyAccount/.test(profile) && /isStaff: isStaff\(currentUser\)/.test(profile), 'logging out, deleting and the admin row follow what the person may do');
check(/const closeAll = useCallback/.test(hub) && /actions: \{ \.\.\.parentCtx\.actions, close: closeAll \}/.test(hub), 'closing from inside a page goes through the hub');

section('5. The choices reach the places that obey them');
const app = read('src/App.tsx');
const feed = read('src/components/Feed/FeedView.tsx');
const postCard = read('src/components/Feed/PostCard.tsx');
const reels = read('src/components/Reels/ReelsView.tsx');
const watch = read('src/components/Feed/FeedVideoWatchView.tsx');
const chat = read('src/components/Chat/ChatView.tsx');
const api = read('src/services/supabaseApi.ts');
const inApp = read('src/utils/inAppBrowser.ts');
check(/resetSettingsStore\(\);\s*resetFeedLists\(\);\s*if \(!currentUser\?\.id\) return;\s*void loadSettings\(true\);\s*void loadFeedLists\(\);/.test(app), "the account's settings and lists are forgotten when the account changes and read for the new one");
check(/startPresenceHeartbeat\(currentUser\.id, platform, !getSettings\(\)\['activity\.status'\]\)/.test(app) && /\[currentUser\?\.id, activityStatusOn\]/.test(app), 'Activity status off: this session is announced as hidden, and re-announced when the switch changes');
check(/hidden\?: boolean/.test(api) && /export const looksOnline/.test(api) && /\.\.\.\(hidden \? \{ hidden: true \} : \{\}\)/.test(api), 'a hidden session carries a "hidden" mark');
check(/activityStatusOn && looksOnline\(onlinePresence\[userId\]\)/.test(chat), 'chats show nobody as online when the mark is there, and nobody at all if you hid yours');
check(/<TimeReminder \/>/.test(app) && /startTimeTracking\(\)/.test(read('src/components/Settings/TimeReminder.tsx')), 'the daily limit and sleep reminders are on screen while signed in, and time is counted');
check(/isPostMuted\(p\.userId\)/.test(feed) && /isFavourite\(p\.userId\)/.test(feed) && /data-testid="feed-favourites"/.test(feed), 'the feed leaves out muted accounts and has a Favourites tab');
check(/activeFeedFilter === 'favourites' && favouriteCount\(\) === 0\) setActiveFeedFilter\('foryou'\)/.test(feed), 'the Favourites tab is dropped if the last favourite is removed');
check(/isStoryMuted\(st\.userId\)/.test(app) && /!suggestedAccounts \? \[\]/.test(app) && /buildStoryTray\(trayStories,/.test(app), 'the story tray leaves out muted stories, and the suggested circles when Suggested accounts is off');
check(/likeCountHiddenFor\(post\.isLikeCountHidden, post\.userId, currentUser\.id, hideOthersCounts\)/.test(postCard) && /likeCountHiddenFor\(reel\.isLikeCountHidden/.test(reels) && /likeCountHiddenFor\(activePost\.isLikeCountHidden/.test(watch), 'like counts of other people are hidden on posts, reels and videos when you ask');
check(/if \(!getDevicePrefs\(\)\.openLinksInApp\) return;/.test(inApp), 'links open in the browser instead of inside NOOB when you ask');
check(/uploadImageSettings\(/.test(api) && /videoMayAutoplay|shouldAutoplayVideo/.test(postCard), 'uploads use the chosen quality, and videos wait to be tapped when the data saver or "never" is chosen');
check(/import '\.\/utils\/devicePrefs\.ts'/.test(read('src/main.tsx')), 'the device choices (text size, motion, contrast, bold) are applied before anything is drawn');
const css = read('src/index.css');
for (const sel of ['data-reduce-motion', 'data-text-size', 'data-contrast', 'data-bold']) check(css.includes(`[${sel}`), `the page has styles for ${sel}`);

section('6. The pages do what they say');
const interact = read('src/components/Settings/pages/interact.tsx');
check(/notif\.pauseUntil/.test(interact) && /Pause for 1 hour/.test(interact) && /Resume notifications/.test(interact), 'Notifications: pause for a while and resume');
for (const k of ['likes', 'comments', 'follows', 'messages', 'mentions', 'live', 'games', 'points', 'suggestions', 'birthdays']) check(new RegExp(`'notif\\.${k}'`).test(interact), `Notifications: ${k} can be switched off`);
check(/notif\.quiet/.test(interact) && /type="time"/.test(interact), 'Notifications: quiet hours with a start and an end');
check(/'msg\.who'/.test(interact) && /'msg\.storyReplies'/.test(interact) && /'msg\.readReceipts'/.test(interact), 'Messages: who may start a chat, who may reply to stories, read receipts');
check(/'tags\.who'/.test(interact) && /'mentions\.who'/.test(interact), 'Tags and mentions: who may tag and who may @mention');
check(/'comments\.who'/.test(interact) && /comments\.hideOffensive/.test(interact) && /go\('comment-block'\)/.test(interact) && /go\('restricted'\)/.test(interact), 'Comments: who may comment, offensive comments, blocked commenters, restricted');
check(/'share\.toMessages'/.test(interact), 'Sharing: sending your posts into chats can be switched off');
check(/limit\.until/.test(interact) && /limit\.audience/.test(interact) && /DURATIONS/.test(interact), 'Limit interactions: who, and for how long');
check(/blockedWords/.test(interact) && /maxLength=\{40\}/.test(interact) && /words\.length >= 50/.test(interact), 'Hidden words: add and remove words, up to 50');
check(/\?profile=\$\{encodeURIComponent\(me\.username\)\}/.test(interact) && /navigator\.share/.test(interact) && /toggleFollowUser/.test(interact), 'Follow and invite: your link (copy, share), QR codes, and people you may know');
const see = read('src/components/Settings/pages/see.tsx');
check(/updateMute/.test(see) && /Mute posts and reels/.test(see) && /Mute stories/.test(see) && /refreshFeedLists/.test(see), 'Muted accounts: posts, stories or both, and the feed hears about it');
check(/'likes\.hideOthers'/.test(see) && /'likes\.hideMine'/.test(see), 'Like and share counts: on other people’s posts, and on all of yours');
check(/suggestedAccounts/.test(see), 'Content preferences: suggested accounts');
const appPages = read('src/components/Settings/pages/app.tsx');
check(/navigator\.permissions\?\.query/.test(appPages) && /getUserMedia/.test(appPages) && /Notification\.requestPermission/.test(appPages) && /getCurrentPosition/.test(appPages), 'Device permissions: shows camera, microphone, location and notifications, and can ask for them');
check(/stream\.getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/.test(appPages), 'asking for the camera or microphone records nothing');
check(/caches\.delete/.test(appPages) && !/localStorage\.clear|indexedDB\.deleteDatabase|sessionStorage\.clear/.test(appPages), 'Clear cache removes only saved copies of pages and pictures - never the login or the chat keys');
check(/setThemePreference/.test(appPages) && /textSize/.test(appPages) && /reduceMotion/.test(appPages) && /highContrast/.test(appPages) && /boldText/.test(appPages), 'Accessibility: appearance, text size, bold, contrast, motion');
check(/dataSaver/.test(appPages) && /autoplay/.test(appPages) && /uploadQuality/.test(appPages) && /openLinksInApp/.test(appPages), 'Media quality: data saver, autoplay, upload quality; App and website: links');
const activityPages = read('src/components/Settings/pages/activity.tsx');
check(/SearchesPage/.test(activityPages) && /clearSearches\(\)/.test(activityPages) && /forgetSearch\(q\)/.test(activityPages) && /go\('searches'\)/.test(activityPages), 'Your activity: recent searches, remove one or clear all');
check(/BREAK_CHOICES/.test(activityPages) && /breakEveryMin/.test(activityPages) && /Coffee/.test(read('src/components/Settings/TimeReminder.tsx')), 'Time management: a "take a break" reminder');
check(/openSuggestionBox/.test(read('src/components/Settings/pages/support.tsx')) && /<SuggestionBoxModal userId=\{currentUser\.id\}/.test(profile), 'Help: report a problem or send an idea opens the Suggestion Box');
const support = read('src/components/Settings/pages/support.tsx');
check(/<OrdersView canManage=\{false\} \/>/.test(support) && /openWallet/.test(support), 'Orders and payments: your orders and the wallet');
check(/FAQ/.test(support) && /aria-expanded/.test(support) && /openSupport/.test(support), 'Help: common questions and the support assistant');
check(/fetchAccountStatus/.test(support) && /good standing/.test(support), 'Account Status: your standing and your record');
const account = read('src/components/Settings/pages/account.tsx');
check(/openDeleteAccount/.test(account) && /ctx\.canDeleteAccount/.test(account) && /openExport/.test(account), 'Your NOOB account: edit, password, devices, verification, download, delete');
check(/Business accounts are always public/.test(account) && /autoAcceptFollowRequests/.test(account), 'Account privacy: private/public (business stays public) and follow requests');

section('7. Device choices (the rules)');
const D = await import('../../src/utils/devicePrefs.ts');
const clean = D.cleanDevicePrefs({ textSize: 'huge', autoplay: 'sometimes', dailyLimitMin: 7, uploadQuality: 'ultra', sleepMode: { on: true, from: '25:99', to: '07:30' }, reduceMotion: 'yes', boldText: true });
check(clean.textSize === 'default' && clean.autoplay === 'always' && clean.dailyLimitMin === 0 && clean.uploadQuality === 'standard', 'nonsense values fall back to the defaults');
check(clean.sleepMode.on === true && clean.sleepMode.from === '23:00' && clean.sleepMode.to === '07:30', 'a bad time falls back, a good one is kept');
check(clean.reduceMotion === false && clean.boldText === true, 'only a real true/false is accepted');
check(JSON.stringify(D.cleanDevicePrefs(null)) === JSON.stringify(D.DEFAULT_DEVICE_PREFS) && JSON.stringify(D.cleanDevicePrefs('x')) === JSON.stringify(D.DEFAULT_DEVICE_PREFS), 'damaged storage gives the defaults');
check(D.DEFAULT_DEVICE_PREFS.openLinksInApp === true && D.DEFAULT_DEVICE_PREFS.autoplay === 'always' && D.DEFAULT_DEVICE_PREFS.uploadQuality === 'standard' && D.DEFAULT_DEVICE_PREFS.dataSaver === false, 'by default NOOB behaves exactly as before');
D.setDevicePrefs({ dataSaver: true, textSize: 'large' });
check(D.getDevicePrefs().dataSaver === true && JSON.parse(store.get('noob.devicePrefs.v1')).textSize === 'large', 'a choice is kept on the device');
check(D.shouldAutoplayVideo({ ...D.DEFAULT_DEVICE_PREFS }) === true && D.shouldAutoplayVideo({ ...D.DEFAULT_DEVICE_PREFS, autoplay: 'never' }) === false && D.shouldAutoplayVideo({ ...D.DEFAULT_DEVICE_PREFS, dataSaver: true }) === false, 'videos start by themselves unless "never" or the data saver');
const std = D.uploadImageSettings('other', D.DEFAULT_DEVICE_PREFS), hi = D.uploadImageSettings('other', { ...D.DEFAULT_DEVICE_PREFS, uploadQuality: 'high' }), saver = D.uploadImageSettings('other', { ...D.DEFAULT_DEVICE_PREFS, dataSaver: true, uploadQuality: 'high' });
check(hi.maxSide > std.maxSide && saver.maxSide <= std.maxSide && saver.quality < std.quality, 'higher quality is bigger, and the data saver is smallest even if "high" was chosen');
check(D.uploadImageSettings('avatar', D.DEFAULT_DEVICE_PREFS).maxSide === 640, 'profile pictures keep their usual size');

section('8. Time spent and reminders (the rules)');
const T = await import('../../src/utils/timeSpent.ts');
const at = (h, m = 0, d = 10) => new Date(2026, 9, d, h, m, 0);
const sleep = { on: true, from: '23:00', to: '07:00' };
check(T.sleepNightKey(sleep, at(23, 30)) === '2026-10-10' && T.sleepNightKey(sleep, at(2, 0, 11)) === '2026-10-10', 'a night that crosses midnight is one night (23:30 and 02:00 belong together)');
check(T.sleepNightKey(sleep, at(12)) === null && T.sleepNightKey(sleep, at(7, 0)) === null && T.sleepNightKey({ ...sleep, on: false }, at(23, 30)) === null, 'daytime, the exact end, and "off" are not night');
check(T.sleepNightKey({ on: true, from: '09:00', to: '09:00' }, at(9, 0)) === null, 'a window of no length never fires');
check(T.sleepNightKey({ on: true, from: '13:00', to: '15:00' }, at(14, 0)) === '2026-10-10', 'a window inside one day works');
const prefs = { ...D.DEFAULT_DEVICE_PREFS, dailyLimitMin: 30, sleepMode: sleep };
check(T.dueReminder(prefs, at(14), {}, 29 * 60) === null, 'before the limit: nothing');
const lim = T.dueReminder(prefs, at(14), {}, 30 * 60);
check(lim && lim.kind === 'limit' && lim.minutes === 30, 'at the limit: the limit reminder');
check(T.dueReminder(prefs, at(14), { limitDay: '2026-10-10' }, 90 * 60) === null, 'after "OK" it does not come back today');
check(T.dueReminder(prefs, at(14, 5, 11), { limitDay: '2026-10-10' }, 31 * 60)?.kind === 'limit', 'but it does tomorrow');
check(T.dueReminder(prefs, at(23, 15), {}, 0)?.kind === 'sleep', 'at night: the sleep reminder');
check(T.dueReminder(prefs, at(23, 15), { sleepNight: '2026-10-10' }, 0) === null, 'once per night');
check(T.dueReminder(prefs, at(23, 15), { snoozeUntil: at(23, 30).getTime() }, 0) === null && T.dueReminder(prefs, at(23, 31), { snoozeUntil: at(23, 30).getTime() }, 0)?.kind === 'sleep', 'snoozed for a while, then again');
check(T.dueReminder({ ...prefs, dailyLimitMin: 0, sleepMode: { ...sleep, on: false } }, at(23, 15), {}, 99999) === null, 'with both off, never');
const brk = { ...D.DEFAULT_DEVICE_PREFS, breakEveryMin: 20 };
check(T.dueReminder(brk, at(14), {}, 0, 19 * 60) === null && T.dueReminder(brk, at(14), {}, 0, 20 * 60)?.kind === 'break' && T.dueReminder(brk, at(14), {}, 0, 20 * 60)?.minutes === 20, 'take a break: nothing before the time in a row, a reminder at it');
check(T.dueReminder({ ...brk, breakEveryMin: 0 }, at(14), {}, 0, 9999) === null, 'take a break is off by default');
check(T.dueReminder({ ...brk, dailyLimitMin: 30 }, at(14), {}, 30 * 60, 20 * 60)?.kind === 'limit' && T.dueReminder({ ...brk, sleepMode: sleep }, at(23, 15), {}, 0, 20 * 60)?.kind === 'sleep', 'the daily limit and sleep mode come before a break reminder');
check(T.dueReminder(brk, at(14, 0), { snoozeUntil: at(14, 15).getTime() }, 0, 20 * 60) === null, 'a snoozed reminder waits');
T.resetTimeSpentForTests();
const t0 = Date.parse('2026-10-20T10:00:00');
for (let i = 0; i < 6; i++) T.tickUse(5, t0 + i * 5000);
check(T.continuousSeconds() === 30, 'time in a row adds up while the app is open');
T.tickUse(5, t0 + 6 * 60 * 1000);
check(T.continuousSeconds() === 5, 'leaving for more than five minutes counts as a break');
T.dismissReminder({ kind: 'break', minutes: 20 }, new Date(t0));
check(T.continuousSeconds() === 0, 'pressing OK on the reminder starts the count again');
check(D.cleanDevicePrefs({ breakEveryMin: 25 }).breakEveryMin === 0 && D.cleanDevicePrefs({ breakEveryMin: 30 }).breakEveryMin === 30 && D.BREAK_CHOICES.includes(10), 'only the offered break times are accepted');
T.resetTimeSpentForTests();
check(T.formatDuration(0) === '0 min' && T.formatDuration(20) === 'less than a minute' && T.formatDuration(5 * 60) === '5 min' && T.formatDuration(3600) === '1 h' && T.formatDuration(3600 + 25 * 60) === '1 h 25 min', 'durations read naturally');
T.resetTimeSpentForTests();
const now = at(10, 0, 20);
T.addSeconds(600, now); T.addSeconds(300, now);
check(T.secondsOn(T.dayKey(now)) === 900, 'time adds up within a day');
const week = T.lastDays(7, now);
check(week.length === 7 && week[6].day === '2026-10-20' && week[6].seconds === 900 && week[0].day === '2026-10-14' && week[0].seconds === 0, 'the last seven days, oldest first, today last');
T.addSeconds(86400 * 3, now);
check(T.secondsOn(T.dayKey(now)) === 86399, 'a day can never count more than a day');
T.addSeconds(10, new Date(2026, 11, 25));
check(T.secondsOn('2026-10-20') === 0, 'days older than 30 are forgotten');

section('9. Chats wear the sign-in doodles; every device starts dark');
const cssAll = read('src/index.css');
const chatRule = (cssAll.match(/\.chat-wallpaper \{[^}]*\}/) || [''])[0];
const loginRule = (cssAll.match(/\.doodle-wallpaper-login \{[^}]*\}/) || [''])[0];
check(/background-image: var\(--doodle-login\)/.test(chatRule) && /background-size: 120px 120px/.test(chatRule) && /background-color: var\(--page\)/.test(chatRule), 'the chat wallpaper is the sign-in page doodle: same picture, same 120 px tile, on the page colour');
check(/background-image: var\(--doodle-login\)/.test(loginRule) && /background-size: 120px 120px/.test(loginRule), 'and the sign-in page still uses the same one, so the two always match');
check(!/data-theme="light"\] \.chat-wallpaper/.test(cssAll) && !/chat-wallpaper \{[^}]*base64/.test(cssAll), 'the old chat-only pattern is gone (the doodle follows Dark and Light by itself)');
check(/var pref = saved === 'dark' \|\| saved === 'light' \|\| saved === 'system' \? saved : 'dark';/.test(read('public/theme-init.js')) && /return 'dark';/.test(read('src/utils/theme.ts')), 'with nothing chosen the app is dark, whatever the device uses; Light and System only if the person picks them (Settings and activity > Accessibility)');

section('10. Quick, and never looking dead');
const kit = read('src/components/Settings/kit.tsx');
const stackLoader = read('src/components/Common/NoobStackLoader.tsx');
check(/import \{ NoobStackLoader \} from '\.\.\/Common\/NoobStackLoader'/.test(kit) && /export const Spinner[\s\S]{0,400}<NoobStackLoader mode="quick"/.test(kit) && /export const PageLoading[\s\S]{0,400}<NoobStackLoader mode="quick"/.test(kit), 'waiting inside a page, and a whole page waiting, show the NOOB burger');
check(/export const NoobStackLoader/.test(stackLoader) && /QUICK_LAYER_MS/.test(stackLoader) && !/setTimeout\([^)]*minimum|MIN_MS|minDuration/i.test(kit), 'the burger shows only for as long as the page really waits: no minimum and no maximum time');
check(/const LazyFallback: React\.FC = \(\) => <BurgerLoading \/>;/.test(profile) && /import \{ BurgerLoading \} from '\.\.\/Common\/BurgerLoading'/.test(profile) && /<NoobStackLoader mode="quick"/.test(read('src/components/Common/BurgerLoading.tsx')), 'the windows the profile loads on demand wait behind the burger too');
check(!/lazy\(/.test(pagesIndex) && !/React\.lazy/.test(pagesIndex) && /import \{ AccountPage[^}]*\} from '\.\/account'/.test(pagesIndex), 'tapping a row opens its page at once: every page comes in the same file as the hub');
check(/const preloadSettingsHub = \(\) => \{ void import\('\.\.\/Settings\/SettingsHub'\); \};/.test(profile) && /requestIdleCallback\(preloadSettingsHub\)/.test(profile) && /onPointerEnter=\{isOwnProfile \? preloadSettingsHub/.test(profile) && /onTouchStart=\{isOwnProfile \? preloadSettingsHub/.test(profile), 'the hub is fetched in the background while the profile is on screen, and again as a finger touches the three dots');
check(/active:scale-90/.test(profile.slice(profile.indexOf('data-testid="profile-three-dots"') - 900, profile.indexOf('data-testid="profile-three-dots"') + 50)), 'the three dots visibly press down at the touch');
check(/active:scale-\[\.985\]/.test(kit) && /touch-manipulation/.test(kit), 'every row presses down at the touch (no wait for a double-tap)');
check(/function useBusy\(\)/.test(kit) && /<Loader2 className="w-5 h-5 shrink-0 text-zinc-300 animate-spin"/.test(kit) && /aria-busy=\{busy\}/.test(kit), 'a row whose action takes a while shows a spinner the moment it is tapped, and ignores a second tap');
check(/const \[pending, setPending\] = useState<boolean \| null>\(null\)/.test(kit) && /const shown = pending \?\? on/.test(kit) && /\.finally\(\(\) => \{ if \(alive\.current\) setPending\(null\); \}\)/.test(kit), 'a switch moves the moment it is tapped and goes back by itself if saving failed');
check(/const \[pending, setPending\] = useState<T \| null>\(null\)/.test(kit) && /const shown = pending \?\? value/.test(kit), 'a choice marker moves the moment it is tapped, too');
check(/export const SmallButton[\s\S]{0,900}active:scale-95[\s\S]{0,700}<Loader2/.test(kit), 'small buttons press down and show a spinner while they work');
const handlerVoids = (allPages.match(/(?:onClick|onChange)=\{\(\w*\) => void /g) || []).length;
check(handlerVoids <= 2, 'the page buttons hand their promise to the button, so it can show it is working', `(${handlerVoids} left)`);
check(/getCachedList\(kind\)/.test(account) && /getCachedList\('muted'\)/.test(read('src/components/Settings/pages/see.tsx')) && /export function warmLists/.test(read('src/services/settingsApi.ts')) && /warmLists\(\)/.test(hub), 'lists of people that were opened before (or warmed in the background) show at once, and refresh quietly');
check(/Promise\.all\(ids\.map\(/.test(account) && /if \(ready\.length > 0\) \{ setPeople\(ready\); return; \}/.test(interact), 'Blocked asks for everybody at the same time, and Invite starts from the people the app already has');
check(/const OrdersView = lazy\(/.test(read('src/components/Settings/pages/support.tsx')), 'the orders list (a big part of the shop) is fetched only when that page is opened');
check(/animate-in fade-in duration-150/.test(hub), 'a page fades in instead of jumping');

section('10b. About NOOB stays inside the app');
check(/'about-noob': AboutNoobPage/.test(pagesIndex) && /export const AboutNoobPage/.test(read('src/components/Settings/pages/support.tsx')) && /go\('about-noob'\)/.test(read('src/components/Settings/pages/support.tsx')), 'the About row opens the About NOOB page inside Settings, so Back comes back to the page before');
check(!/window\.open\('\/about'/.test(profile + allPages) && !/openAbout/.test(types), 'nothing in Settings opens the website any more');
const aboutSrc = read('src/components/Settings/pages/support.tsx');
const featureTitles = ['Share and watch', 'Chat and call', 'Play', 'Go live', 'Fun and community', 'Create and learn', 'Shop and rewards', 'Privacy and safety'];
const publicAbout = read('public/about.html');
check(featureTitles.every((t) => aboutSrc.includes(`title: '${t}'`)) && /Why students\?/.test(aboutSrc), 'it tells the same story as the website’s About page: who we are, the eight groups of things you can do, why students');
const websiteItems = [...publicAbout.matchAll(/<li>([^<]+)<\/li>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
const missing = websiteItems.filter((t) => !aboutSrc.includes(t.replace(/'/g, "\\'")) && !aboutSrc.includes(t));
check(missing.length === 0, 'every feature the website lists is listed here too', missing.join(' | '));
check(/\/noob-icon-192\.png/.test(aboutSrc) && !/noob-logo\.svg\.jpeg/.test(aboutSrc) && fs.existsSync('public/noob-icon-192.png'), 'the About pages show the NOOB logo');
check(/openTeamJoin/.test(aboutSrc) && /instagram\.com\/nooob\.xyz/.test(aboutSrc) && /getDevicePrefs\(\)\.openLinksInApp/.test(aboutSrc), 'Follow us on Instagram (inside NOOB’s own browser unless links are set to open outside) and Join the NOOB team are there');

section('11. Instants and Daily NOOB are the only things deleted by a clock');
check(!/instants-archive|InstantsArchivePage|fetchInstantsArchive/.test(allPages + registry + pagesIndex), 'no Instants archive in Settings: Instants are deleted for good after 24 hours');
check(fs.existsSync('supabase/migrations/20261017000002_instants_24h.sql') && /purge_expired_instants/.test(read('supabase/migrations/20261017000002_instants_24h.sql')), 'the migration that deletes finished Instants (and their pictures) exists');
const allSql = fs.readdirSync('supabase/migrations').map((f) => [f, read(`supabase/migrations/${f}`)]);
const clockDeletes = allSql.filter(([, t]) => /delete from public\.(posts|reels|stories|long_videos|post_slides|messages|comments|chats|profiles)\b[^;]*(interval '(30|31|60|90)|30 days)/i.test(t)).map(([f]) => f);
check(clockDeletes.length === 0, 'nothing in the database deletes posts, reels, stories, videos, messages or comments because of their age', clockDeletes.join(', '));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
