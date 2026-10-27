// Mood Status, the app side (the database side is tested on a real Postgres in test-mood-status.mjs): the eight moods, the picker, the note, who can see it, the 24-hour clearing,
// updating and removing, the lists, and the chip on a profile. (Tried in a real browser too: picking and sharing a mood, the card, both lists and the filter, the profile chip.)
// Usage: node scripts/supabase/test-mood-status-ui.mjs
import fs from 'node:fs';
import { MOODS, VISIBILITY_OPTIONS, EXPIRY_OPTIONS, MOOD_NOTE_MAX, moodInfo } from '../../src/utils/moods.ts';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const page = read('src/components/Fun/MoodClassic.tsx');
const cards = read('src/components/Profile/ProfileFunCards.tsx');
const profile = read('src/components/Profile/ProfileView.tsx');
const api = read('src/services/supabaseApi.ts');
const apiIndex = read('src/services/api.ts');
const sql = read('supabase/migrations/20261016000003_mood_status.sql');

section('1. The moods');
check(MOODS.map((m) => m.label).join('|') === 'Happy|Confident|Tired|Sad|Angry|Excited|Bored|Loved', 'the eight moods, in the order they are offered');
check(MOODS.map((m) => m.emoji).join('') === '\u{1F60A}\u{1F60E}\u{1F634}\u{1F614}\u{1F621}\u{1F929}\u{1F636}❤️', 'each with its emoji');
check(MOODS.every((m) => new RegExp(`'${m.id}'`).test(sql)), 'every mood is also one the database accepts');
check(moodInfo('excited').emoji === '\u{1F929}' && moodInfo('nonsense').label === 'nonsense', 'an unknown mood is shown as plain text, never breaks the page');
check(MOOD_NOTE_MAX === 80 && /char_length\(note\) <= 80/.test(sql), 'a note is at most 80 characters, here and in the database');
check(VISIBILITY_OPTIONS.map((v) => v.id).join() === 'followers,everyone,only_me' && /\('everyone', 'followers', 'only_me'\)/.test(sql), 'who can see it: followers (the default), everyone, only me');
check(EXPIRY_OPTIONS.map((o) => o.hours).join() === '24,' && /p_expire_hours int default 24/.test(sql), 'it can clear itself after 24 hours (the default) or stay until changed');

section('2. Setting a mood');
check(/role="radiogroup" aria-label="Mood"/.test(page) && /role="radio"\s*aria-checked=\{on\}/.test(page), 'the moods are a group of radio buttons (keyboard and screen reader friendly)');
check(/Nothing is shared until you press the button below\./.test(page), 'it says that nothing is shared until the button is pressed');
check(/useState<MoodVisibility>\('followers'\)/.test(page) && /useState<number \| null>\(24\)/.test(page), 'the pre-selected choices are the careful ones: followers only, clearing after 24 hours');
check(/disabled=\{!changed \|\| saving\}/.test(page) && /\(mine \? 'Update my mood' : 'Share my mood'\)|\{mine \? 'Update my mood' : 'Share my mood'\}/.test(page), 'the button is off until a mood is picked or something changed');
check(/setMyMood\(\{ mood: pick, note, visibility, expireHours \}\)/.test(page), 'it sends the mood, the note, who can see it and how long it stays');
check(/maxLength|chars\.slice\(0, MOOD_NOTE_MAX\)/.test(page) && /\{count\} \/ \{MOOD_NOTE_MAX\}/.test(page), 'the note has a counter and stops at 80 characters');
check(/Saved\. Only you can see this mood\./.test(page) && /Your mood is shared\./.test(page), 'the confirmation says what happened, including "only you"');

section('3. My mood');
check(/Your mood right now/.test(page) && /Seen by: \{visLabel\}/.test(page) && /expiryText\(mine\.expiresAt\)/.test(page) && /Updated \{timeAgo\(mine\.updatedAt\)\}/.test(page), 'my mood is shown with who sees it, when it clears and when it was set');
check(/clearMyMood\(\)/.test(page) && /Remove my mood/.test(page), 'it can be removed at any time');
check(/mine\.visibility !== 'only_me' && \(/.test(page) && /shareCardAsStory\(\{ eyebrow: 'Mood'/.test(page), 'it can be shared as a Story (an action the person takes, and not offered for a private mood)');

section('4. The lists');
check(/kind === 'friends' \? fetchFriendMoods/.test(page) && /fetchCommunityMoods/.test(page), 'the moods of the people I follow, and the community\'s');
check(/aria-label="Filter by mood"/.test(page) && /mood: filter \?\? undefined/.test(page), 'the community list can be filtered by mood');
check(/Load more/.test(page) && /const seen = new Set\(list\.map\(\(x\) => x\.userId\)\)/.test(page), 'a page at a time, never showing a person twice');
check(/onOpenProfile\?\.\(asUser\(p\)\)/.test(page), 'tapping a person opens their profile');
check(/<SkeletonCards/.test(page) && /<ErrorState/.test(page) && /<EmptyState/.test(page), 'loading placeholders, an error with "Try again", and empty states');
check(/<LoginPrompt what="share how you feel/.test(page), 'a visitor is asked to log in');
check(!/dangerouslySetInnerHTML|innerHTML/.test(page + cards), 'a note is always drawn as text');
check(!/localStorage|sessionStorage/.test(page + cards), 'no mood is kept in the browser');

section('5. On a profile');
check(/export const ProfileMoodChip/.test(cards) && /isOwnProfile \? fetchMyMood\(\) : fetchUserMood\(userId\)/.test(cards), 'the chip asks the database for the mood the person looking may see');
check(/if \(!isOwnProfile \|\| !onOpenFunPage\) return null;/.test(cards) && /\+ Set your mood/.test(cards), 'someone else with no (visible) mood shows nothing; on my own profile a quiet "Set your mood" opens the page');
check(/\{!isTargetBlocked && <ProfileMoodChip userId=\{targetUser\.id\} isOwnProfile=\{isOwnProfile\} onOpenFunPage=\{onOpenFunPage\} \/>\}/.test(profile), 'it sits under the name and is not shown on the profile of someone you blocked');

section('6. Privacy (in the database)');
check(/revoke all on public\.user_moods from public, anon, authenticated;/.test(sql), 'the table can not be read from the app');
check(/if m\.visibility = 'only_me' then return false; end if;/.test(sql) && /return public\.can_view_author\(m\.user_id\);/.test(sql) && /if m\.expires_at is not null and m\.expires_at <= now\(\) then return false; end if;/.test(sql), '"only me" is seen by nobody else, "everyone" follows the profile\'s own rules (a private account stays private), an expired mood is gone');
check(/p\.account_type <> 'private'/.test(sql), 'the community list leaves private accounts out');

section('7. The API');
check(/'mood_set', \{ p_mood: input\.mood, p_note: input\.note, p_visibility: input\.visibility, p_expire_hours: input\.expireHours \}/.test(api) && !/\.from\('user_moods'\)/.test(api), 'every call goes through a database function');
check(/setMyMood,\s*clearMyMood,\s*fetchMyMood,\s*fetchUserMood,\s*fetchFriendMoods,\s*fetchCommunityMoods/.test(apiIndex) && /MoodStatus,\s*MoodPerson,\s*MoodPage/.test(apiIndex), 'the API index exports them');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
