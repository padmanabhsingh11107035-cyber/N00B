// A Follow / Requested button changes AT ONCE when tapped (what the tap will most likely turn into), and the server's answer is put in when it comes;
// a failed follow puts the old state back. Usage: node --liftoff-only scripts/supabase/test-follow-instant.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const F = await import(pathToFileURL(path.resolve('src/utils/followPredict.ts')).href);
const none = { isFollowing: false, isFollowRequested: false };

section('1. What a tap turns into');
check(JSON.stringify(F.predictFollowToggle(none, { accountType: 'public' })) === JSON.stringify({ isFollowing: true, isFollowRequested: false }), 'a public account: Following');
check(JSON.stringify(F.predictFollowToggle(none, { accountType: 'business' })) === JSON.stringify({ isFollowing: true, isFollowRequested: false }), 'a business account: Following');
check(JSON.stringify(F.predictFollowToggle(none, { accountType: 'private' })) === JSON.stringify({ isFollowing: false, isFollowRequested: true }), 'a private account: Requested');
check(JSON.stringify(F.predictFollowToggle(none, { accountType: 'private', privacySettings: { autoAcceptFollowRequests: false } })) === JSON.stringify({ isFollowing: false, isFollowRequested: true }), 'a private account that approves by hand: Requested');
check(JSON.stringify(F.predictFollowToggle(none, { accountType: 'private', privacySettings: { autoAcceptFollowRequests: true } })) === JSON.stringify({ isFollowing: true, isFollowRequested: false }), 'a private account that is known to accept by itself: Following');
check(JSON.stringify(F.predictFollowToggle({ isFollowing: true, isFollowRequested: false }, { accountType: 'private' })) === JSON.stringify(none), 'tapping Following undoes it');
check(JSON.stringify(F.predictFollowToggle({ isFollowing: false, isFollowRequested: true }, { accountType: 'private' })) === JSON.stringify(none), 'tapping Requested takes the request back');
check(F.predictFollowersCount(10, none, { isFollowing: true, isFollowRequested: false }) === 11 && F.predictFollowersCount(10, none, { isFollowing: false, isFollowRequested: true }) === 10 && F.predictFollowersCount(10, { isFollowing: true, isFollowRequested: false }, none) === 9 && F.predictFollowersCount(0, { isFollowing: true, isFollowRequested: false }, none) === 0, 'only an accepted follow changes the follower count (never below 0)');

section('2. Every Follow button uses it');
const app = read('src/App.tsx');
check(/const followInFlight = useRef\(new Map<string, Promise<any>>\(\)\);/.test(app) && /if \(running\) return running;/.test(app), 'a second tap while the first is travelling joins it');
check(/const guess = predictFollowToggle\(before, target\);\s*\n\s*apply\(guess, predictFollowersCount\(target\.followersCount, before, guess\)\);/.test(app), 'the app\'s lists change before the server answers');
check(/if \(res && res\.success === false\) \{\s*\n\s*if \(target\) apply\(before, target\.followersCount\);/.test(app) && /apply\(\{ isFollowing: !!res\.isFollowing, isFollowRequested: !!res\.isFollowRequested \}, res\.followersCount\);/.test(app), 'a failed follow puts the old state back; the real answer is put in');
const profile = read('src/components/Profile/ProfileView.tsx');
check(/const guess = predictFollowToggle\(before, targetUser\);\s*\n\s*setIsTargetFollowing\(guess\.isFollowing\);/.test(profile) && /setIsTargetFollowing\(before\.isFollowing\);/.test(profile), 'a profile\'s button: at once, and back if it failed');
check(/const guess = predictFollowToggle\(before, person\);/.test(read('src/components/Explore/ExploreView.tsx')), 'Explore\'s people list');
check(/predictFollowToggle\(\{ isFollowing: !!prev\?\.isFollowing, isFollowRequested: !!prev\?\.isFollowRequested \}, u\)/.test(read('src/components/Common/LikesViewsSheet.tsx')), 'the likes / views list (it used to say "Following" for a private account before "Requested")');
check(/predictFollowToggle\(/.test(read('src/components/Stories/StoryTray.tsx')) && /predictFollowToggle\(/.test(read('src/components/Settings/pages/interact.tsx')) && /const wasOn = !!m\.following \|\| !!m\.requested;/.test(read('src/components/Team/OurTeamPage.tsx')), 'story suggestions, the invite page and the team page');
const reels = read('src/components/Reels/ReelsView.tsx');
check(/\{following \? 'Noobed' : requestedIds\.has\(reel\.userId\) \? 'Requested' : 'Noob'\}/.test(reels) && /if \(!isFollowingCreator\) setRequested\(id, !wasRequested\);/.test(reels), 'the Reels page now says "Requested" too (it only knew Follow / Following), at once');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
