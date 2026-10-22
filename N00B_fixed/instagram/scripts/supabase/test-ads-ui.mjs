// NOOB Ads, the app side: the rules in src/utils/ads.ts and how the pieces are wired (apply form, admin Ads page with a switch per page, the banner at the top of Home, Feed and Reels).
// (The database side is tested in test-ads-db.mjs.) Usage: node scripts/supabase/test-ads-ui.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const A = await import(pathToFileURL(path.resolve('src/utils/ads.ts')).href);

section('1. What an advertiser chooses');
check(JSON.stringify(A.AD_WHERE_OPTIONS.map((o) => o.id)) === '["reels","feed","home","all"]', 'where: Reels, Feed, Home or All (four choices)');
check(JSON.stringify(A.AD_DURATIONS.map((d) => d.days)) === '[1,3,7,14,30]' && A.durationText(7) === '1 week' && A.durationText(30) === '1 month', 'how long: 1 day, 3 days, 1 week, 2 weeks, 1 month');
check(JSON.stringify(A.pagesOf('all')) === '["reels","feed","home"]' && JSON.stringify(A.pagesOf('feed')) === '["feed"]', '"All" means the three pages');
check(A.pagesText(['reels', 'feed', 'home']) === 'Reels, Feed and Home' && A.pagesText(['home', 'reels']) === 'Home and Reels' && A.pagesText([]) === 'No page', 'pages in words');
const day = 86_400_000, now = Date.parse('2026-10-22T10:00:00Z');
check(/contact you soon/.test(A.statusText({ status: 'pending', endsAt: null, approvedPages: [] }, now)), 'a waiting request says the NOOB team will contact them');
check(A.statusText({ status: 'approved', endsAt: new Date(now + 2.2 * day).toISOString(), approvedPages: ['reels', 'home'] }, now) === 'Running on Reels and Home, 3 days left' && A.statusText({ status: 'approved', endsAt: new Date(now + 1000).toISOString(), approvedPages: ['feed'] }, now) === 'Running on Feed, 1 day left', 'a running ad says where and how long is left');
check(A.statusText({ status: 'approved', endsAt: new Date(now - 1000).toISOString(), approvedPages: ['feed'] }, now) === 'Finished' && A.statusText({ status: 'rejected', endsAt: null, approvedPages: [] }, now) === 'Not approved', 'finished and not approved');
check(A.nextAdIndex(0, 3) === 1 && A.nextAdIndex(2, 3) === 0 && A.nextAdIndex(0, 1) === 0 && A.nextAdIndex(5, 0) === 0, 'several ads take turns');

section('2. The apply form (business accounts)');
const modal = read('src/components/Ads/AdApplyModal.tsx');
check(/We have received your files\./.test(modal) && /The NOOB team will contact you soon\./.test(modal), 'after sending it says: we have received your files, the NOOB team will contact you soon');
check(/accept="image\/\*,video\/\*"/.test(modal) && /An ad is a picture or a video/.test(modal), 'only a picture or a video can be chosen');
check(/AD_DURATIONS\.map/.test(modal) && /AD_WHERE_OPTIONS\.map/.test(modal) && /How long should it be shown\?/.test(modal) && /Where should it be shown\?/.test(modal), 'it asks how long, and where (Reels / Feed / Home / All)');
check(/Ads are for business accounts/.test(modal) && /accountType === 'business' \|\| currentUser\.isBusiness/.test(modal), 'an account that is not a business account is told how to get one');
check(/safeExternalUrl\(link\)/.test(modal), 'the link is checked before it is sent');
const entry = read('src/components/Ads/AdsEntryCard.tsx'), sub = read('src/components/Settings/pages/subscription.tsx');
check(/Apply for ads/.test(entry) && /if \(!\(currentUser\.accountType === 'business' \|\| currentUser\.isBusiness\)\) return null/.test(entry) && /<AdsEntryCard currentUser=\{ctx\.currentUser\} \/>/.test(sub), 'in the subscription page a business account sees "Apply for ads"; nobody else sees it');

section('3. The admin\'s Ads page');
const panel = read('src/components/Modals/AdminAdsPanel.tsx'), admin = read('src/components/Modals/AdminControlModal.tsx');
check(/'daily' \| 'storage' \| 'ads' \| 'settings'/.test(admin) && /activeTab === 'ads' && main \? \(\s*<AdminAdsPanel/.test(admin) && /Megaphone className="w-4 h-4" \/> Ads/.test(admin), 'it is a page of its own in the admin panel (main admin only)');
check(['reels', 'feed', 'home'].every((p) => AdPagesLabelled(panel, p)) && /AD_PAGES\.map\(\(p\) => <PageSwitch/.test(panel), 'one switch for each page (Reels, Feed, Home), any mix');
function AdPagesLabelled(src, p) { return new RegExp(`id: '${p}'`).test(read('src/utils/ads.ts')) && /testId=\{`ad-switch-\$\{p\.id\}`\}/.test(src); }
check(/pages: d\.pages, days: d\.days, note: d\.note/.test(panel) && /disabled=\{busy === r\.id \|\| d\.pages\.length === 0\}/.test(panel), 'approving sends the pages that are switched on and the days, and needs at least one page');
check(/mailto:\$\{r\.businessEmail\}/.test(panel) && /tel:\$\{r\.businessPhone\}/.test(panel), 'the admin sees how to reach the advertiser');
check(/adminFetchAdApplications\('pending'\)/.test(admin) && /Ads\{adsPending > 0/.test(admin), 'the tab shows how many requests wait');

section('4. Where the ad appears');
const feed = read('src/components/Feed/FeedView.tsx'), videos = read('src/components/Videos/HomeVideoFeedView.tsx'), reels = read('src/components/Reels/ReelsView.tsx');
check(/<AdBanner page="home"[^>]*\/>\s*\{\/\* 2\. Stories Tray \*\/\}/.test(feed), 'Home: at the top, above the stories');
check(/<\/header>\s*\{\/\*[^*]*\*\/\}?\s*<AdBanner page="feed"/.test(videos) || /<AdBanner page="feed"/.test(videos), 'Feed: at the top of the page');
check(/<AdBanner page="reels" compact \/>/.test(reels), 'Reels: a strip over the top of the reel');
const banner = read('src/components/Ads/AdBanner.tsx');
check(/Sponsored/.test(banner) && /safeExternalUrl\(ad\.link\)/.test(banner) && /if \(!ad\) return null;/.test(banner), 'an ad always says Sponsored, opens only a safe link, and when there is no ad nothing is drawn');
check(/addEventListener\(n, stop/.test(banner) && /'touchstart'/.test(banner), 'on Reels a touch on the strip never turns the page');
check(/fetchActiveAds\(page\)/.test(banner) && /AD_CACHE_MS = 5 \* 60 \* 1000/.test(read('src/services/supabaseApi.ts')), 'the ads of a page are asked for once and kept for a few minutes');

section('5. Files');
const api = read('src/services/supabaseApi.ts');
check(/'team' \| 'ads';/.test(api) && /uploadMediaFile\(input\.file, 'ads'/.test(api) && /\/\^\(image\|video\)\\\//.test(api), 'ad files go to their own "ads" folder, pictures and videos only');
check(/'ads'\)/.test(read('supabase/migrations/20261022000006_ads.sql')) && /media_url ~ '\^ads\/\[A-Za-z0-9\._-\]\+\$'/.test(read('supabase/migrations/20261022000006_ads.sql')), 'and the database accepts only a file from that folder');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
