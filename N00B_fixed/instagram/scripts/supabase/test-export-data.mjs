// Tests the "Export Data" text (Profile > ⋮ > Settings & account controls): readable text, the person's own details only, and nothing private
// leaks into it. Pure logic (src/utils/exportMyData.ts): no database or browser needed.
//
// Usage: node scripts/supabase/test-export-data.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const { buildDataExport } = await import(pathToFileURL(path.resolve('src/utils/exportMyData.ts')).href);

// an account record as the app really holds it: the person's details AND things that must never be in an export
const SECRETS = {
  password: 'hunter2-SECRET', passwordHash: '$2a$10$abcdefghijklmnopqrstuv', accessToken: 'eyJhbGciOi.TOKEN.PART', refreshToken: 'REFRESH-TOKEN-123',
  ipAddress: '203.0.113.77', id: '9b2f6c1e-1111-4222-8333-444455556666', legacyId: 'legacy-777', pushSubscription: { endpoint: 'https://fcm.googleapis.com/ENDPOINT-XYZ', keys: { auth: 'AUTHKEY', p256dh: 'P256KEY' } },
  pushTokens: ['FCM-DEVICE-TOKEN-1'], deviceId: 'DEVICE-ABC', e2eePrivateKey: 'E2EE-PRIVATE-KEY', e2eeBackup: 'BACKUP-BLOB', adminPermissions: ['moderate_content'], isAdmin: true,
  isSuspended: false, suspendedReason: 'REASON-HIDDEN', blockedUserIds: ['blocked-user-id-1'], hiddenFromIds: ['hidden-id-2'], followingIds: ['follow-id-3'], followers: ['follower-id-4'],
  lastSeenPlatform: 'web', pushKind: 'chrome', apiKey: 'API-KEY-999', secret: 'TOP-SECRET'
};
const user = {
  ...SECRETS,
  username: 'ann', displayName: 'Ann Lee', firstName: 'Ann', lastName: 'Lee', email: 'ann@example.com', countryCode: '+91', mobileNumber: '9876543210', dateOfBirth: '2001-02-03',
  gender: 'female', pronouns: 'she/her', city: 'Pune', website: 'https://ann.example', bio: 'I make robots.', accountType: 'private', isVerified: true,
  interests: ['robots', 'music'], socialLinks: { instagram: 'ann.makes', github: 'annlee' }, externalLinks: [{ title: 'Portfolio', url: 'https://ann.example/work' }], customLinks: [],
  proTier: 'plus', proBilling: 'yearly', proAutoRenew: true, proRenewsAt: '2027-10-12T00:00:00Z', noobPoints: 1234567, gamesWonCount: 12, gamesPlayedCount: 40,
  followersCount: 321, followingCount: 45, postsCount: 7, privacySettings: { hideTaggedPhotos: true, blockedWords: ['spam', 'scam'], autoAcceptFollowRequests: false }
};
const posts = [{ createdAt: '2026-10-01T10:00:00Z', caption: 'My first   robot\nmade today', location: 'Pune', hashtags: ['robots', '#tech'], likesCount: 5, commentsCount: 2, id: 'post-internal-id', userId: SECRETS.id }];
const reels = [{ createdAt: '2026-10-02T10:00:00Z', caption: 'Spin!', viewsCount: 1500, likesCount: 20, commentsCount: 1, id: 'reel-internal-id', videoUrl: 'reels/secret-file.mp4' }];
const text = buildDataExport(user, posts, reels, new Date('2026-10-12T12:00:00Z'));

section('1. It is readable text');
check(typeof text === 'string' && !text.trim().startsWith('{') && !text.includes('":'), 'plain text, not code (no JSON braces or "key": value)');
for (const needle of ['NOOB — your data', 'ACCOUNT', 'ABOUT YOU', 'NOOB\n', 'PRIVACY SETTINGS', 'YOUR POSTS (1', 'YOUR REELS (1']) check(text.includes(needle), `has "${needle.trim()}"`);

section('2. The person\'s own details are there');
for (const needle of ['Name: Ann Lee', 'Username: @ann', 'Email: ann@example.com', 'Mobile number: +91 9876543210', 'Date of birth: 2001-02-03', 'Gender: female', 'City: Pune', 'Website: https://ann.example', 'Bio: I make robots.', 'Account type: Private', 'Verified: Yes',
  'Interests: robots, music', 'Instagram: ann.makes', 'Portfolio: https://ann.example/work', 'NOOB Pro: Plus (yearly, renews automatically)', 'NOOB Points: 1,234,567', 'Followers: 321', 'Following: 45',
  'Accept follow requests automatically: No', 'Hide tagged photos from my profile: Yes', 'Words that are filtered out: spam, scam', 'My first robot made today', 'at Pune', '#robots #tech', '5 likes · 2 comments', '1,500 views · 20 likes · 1 comments']) {
  check(text.includes(needle), `has "${needle}"`);
}

section('3. Nothing private leaks');
for (const [key, value] of Object.entries(SECRETS)) {
  const flat = typeof value === 'string' ? [value] : JSON.stringify(value).match(/[A-Za-z0-9_.:\/-]{6,}/g) || [];
  check(flat.every((v) => !text.includes(v)), `${key}: its value is not in the export`);
}
check(!/password|token|ip address|secret|encrypt|push|device/i.test(text.replace('never contains your password or your login', '').replace('Your password and login', '')), 'no such words at all, apart from the line that says they are NOT included');
check(!text.includes('post-internal-id') && !text.includes('reel-internal-id') && !text.includes('secret-file.mp4'), 'no internal post / reel ids or file names');

section('4. Odd accounts do not break it');
const bare = buildDataExport({ username: 'zed' }, [], [], new Date('2026-10-12T12:00:00Z'));
check(bare.includes('Username: @zed') && !bare.includes('undefined') && !bare.includes('null') && !bare.includes('YOUR POSTS'), 'a nearly empty account: just what exists, no "undefined"');
check(buildDataExport({}, undefined, undefined).includes('NOOB — your data'), 'an empty record still gives a file');
const pub = buildDataExport({ username: 'p', accountType: 'public', privacySettings: { autoAcceptFollowRequests: false } });
check(!pub.includes('Accept follow requests automatically'), 'the follow-request line only appears for a private account');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
