// Tests the parts of "Our Team" that run on the phone: the form rules, the initials, the card colours, the read-more rule, and that the page is
// reachable from the Home menu and the admin panel is wired. Pure logic (src/utils/ourTeam.ts) plus checks of the wiring: no browser or database.
//
// Usage: node scripts/supabase/test-our-team-ui.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const M = await import(pathToFileURL(path.resolve('src/utils/ourTeam.ts')).href);
const { TEAM_LIMITS, initials, accentFor, TEAM_ACCENTS, cardNumber, needsReadMore, DESCRIPTION_PREVIEW_CHARS, memberCountLabel, validateTeamForm, isTeamPhotoKey, TEAM_JOIN_LINK, teamJoinRequested, followState, followLabel } = M;
const read = (f) => fs.readFileSync(f, 'utf8');

section('1. Initials (shown when a member has no photo yet)');
check(initials('Asha Rao') === 'AR' && initials('  asha   kumari   rao ') === 'AR', 'first and last word: "Asha Rao" -> AR, extra spaces ignored');
check(initials('Madonna') === 'M' && initials('') === '?' && initials('   ') === '?', 'one word -> one letter, nothing -> "?"');
check(initials('Élodie Çelik') === 'ÉÇ' && initials('😀 Smile') === '😀S', 'accents and emoji are kept whole');

section('2. Card colours and numbers');
check(TEAM_ACCENTS.length === 6 && TEAM_ACCENTS.every((a) => a.from.startsWith('#') && a.to.startsWith('#') && a.glow.startsWith('rgba')), 'six colour pairs, each with a ring and a glow');
check(accentFor(0) === TEAM_ACCENTS[0] && accentFor(6) === TEAM_ACCENTS[0] && accentFor(7) === TEAM_ACCENTS[1], 'they repeat after six');
check(accentFor(-1) === TEAM_ACCENTS[5], 'never undefined, even for a bad index');
check(cardNumber(0) === '01' && cardNumber(8) === '09' && cardNumber(11) === '12', 'card numbers: 01, 09, 12');
check(memberCountLabel(1) === '1 member' && memberCountLabel(0) === '0 members' && memberCountLabel(12) === '12 members', 'the member count reads naturally');

section('3. Read more');
check(!needsReadMore('') && !needsReadMore('Short and sweet.') && !needsReadMore('x'.repeat(DESCRIPTION_PREVIEW_CHARS)), 'a short description is shown in full');
check(needsReadMore('x'.repeat(DESCRIPTION_PREVIEW_CHARS + 1)) && !needsReadMore(`  ${'x'.repeat(DESCRIPTION_PREVIEW_CHARS)}  `), 'a long one gets "Read more" (spaces around it do not count)');

section('4. The admin form asks for everything');
const ok = { name: 'Asha Rao', qualification: 'B.Tech', description: 'Leads the app.', hasPhoto: true };
check(validateTeamForm(ok) === null, 'a complete form is fine');
check(/photo/i.test(validateTeamForm({ ...ok, hasPhoto: false })), 'no photo: it asks for one');
check(/name/i.test(validateTeamForm({ ...ok, name: '   ' })), 'no name: it asks for it');
check(/qualification/i.test(validateTeamForm({ ...ok, qualification: '' })), 'no qualification: it asks for it');
check(/description/i.test(validateTeamForm({ ...ok, description: ' ' })), 'no description: it asks for it');
check(/at most 80/.test(validateTeamForm({ ...ok, name: 'n'.repeat(81) })) && validateTeamForm({ ...ok, name: 'n'.repeat(80) }) === null, 'the name stops at 80 characters');
check(/at most 160/.test(validateTeamForm({ ...ok, qualification: 'q'.repeat(161) })) && validateTeamForm({ ...ok, qualification: 'q'.repeat(160) }) === null, 'the qualification stops at 160');
check(/at most 1200/.test(validateTeamForm({ ...ok, description: 'd'.repeat(1201) })) && validateTeamForm({ ...ok, description: 'd'.repeat(1200) }) === null, 'the description stops at 1200');
check(TEAM_LIMITS.name === 80 && TEAM_LIMITS.qualification === 160 && TEAM_LIMITS.description === 1200, 'and the limits are the same as the database\'s');
const sql = read('supabase/migrations/20261013000001_our_team.sql');
check(sql.includes('between 1 and 80') && sql.includes('<= 160') && sql.includes('<= 1200'), 'the database enforces those same numbers');

section('5. Only this page\'s own files are ever deleted from storage');
check(isTeamPhotoKey('team/1760-abc.jpg') && isTeamPhotoKey('team/a_b-c.d.png'), 'a file in the team folder');
check(!isTeamPhotoKey('avatars/1760-abc.jpg') && !isTeamPhotoKey('team/../avatars/x.jpg') && !isTeamPhotoKey('team/') && !isTeamPhotoKey('') && !isTeamPhotoKey(null) && !isTeamPhotoKey(undefined), 'nothing else: other folders, path tricks, empty values');

section('6. The wiring');
const feed = read('src/components/Feed/FeedView.tsx');
const drawIdx = feed.indexOf('NOOB Draw: the weekly free prize spins, at the very top of the menu');
const teamIdx = feed.indexOf('Our Team: the people behind NOOB');
const dailyIdx = feed.indexOf("setShowDailyNoob(true)");
check(drawIdx > 0 && teamIdx > drawIdx && teamIdx < dailyIdx, 'the Home menu: NOOB Draw first, then Our Team, then the rest');
check(/setShowOurTeam\(true\)/.test(feed) && /<OurTeamPage\s+currentUser=\{currentUser\}\s+onClose=\{\(\) => setShowOurTeam\(false\)\}/.test(feed) && /React\.lazy\(\(\) => import\('\.\.\/Team\/OurTeamPage'\)\)/.test(feed), 'the menu item opens the page, which is fetched only when opened');
check(/space-y-1 h-full overflow-y-auto overscroll-contain/.test(feed) && /shrink-0 flex items-center justify-between mb-4/.test(feed), 'the Home menu scrolls when its page buttons do not all fit, with the NOOB title and the close button staying put');
const page = read('src/components/Team/OurTeamPage.tsx');
check(/fetchTeamMembers/.test(page) && /Try again/.test(page) && /aria-busy/.test(page) && /coming together/.test(page), 'the page handles loading, a failed load and an empty team');
check(/onError=\{\(\) => setBroken\(true\)\}/.test(page) && /initials\(member\.name\)/.test(page), 'a photo that fails to load falls back to the initials');
check(/Escape/.test(page) && /aria-label="Close"/.test(page), 'it can be closed with the button and with Escape');
const modal = read('src/components/Modals/AdminControlModal.tsx');
check(/'team' \| (?:'\w+' \| )*'settings'/.test(modal) && /setActiveTab\('team'\)/.test(modal) && /activeTab === 'team' && main \? \(\s*<AdminTeamPanel onPendingChange=\{setTeamPendingCount\} \/>/.test(modal), 'the admin panel has an "Our Team" tab, for the main administrator only');
check(/team_member_added/.test(modal) && /team_member_removed/.test(modal), 'its changes read well in the activity log');
const panel = read('src/components/Modals/AdminTeamPanel.tsx');
check(/validateTeamForm/.test(panel) && /uploadTeamPhoto/.test(panel) && /type="file" accept="image\/\*"/.test(panel) && /discardTeamPhoto/.test(panel), 'the form needs all four things, uploads the photo, and cleans up photos it did not use');
const api = read('src/services/supabaseApi.ts');
check(/uploadMediaFile\(file, 'team'\)/.test(api) && /'songs' \| 'team'/.test(api), 'photos go to the "team" folder (which the upload rules allow)');
check(/rpc<any>\('admin_team_save'/.test(api) && /rpc<any>\('team_list'\)/.test(api) && /rpc<any>\('admin_team_delete'/.test(api) && /rpc<any>\('admin_team_move'/.test(api), 'the four database functions are called by their real names');

section('7. The joining link');
check(TEAM_JOIN_LINK === 'https://noobsocials.com/?team=join', 'the link to share is https://noobsocials.com/?team=join');
check(teamJoinRequested('?team=join') && teamJoinRequested('?x=1&team=join') && !teamJoinRequested('') && !teamJoinRequested('?team=other') && !teamJoinRequested('?join=team'), 'only ?team=join opens the form (the older ?join=team still opens the private staff form)');

section('8. "Follow on NOOB"');
const card = (o = {}) => ({ userId: 'u1', isMe: false, blocked: false, following: false, requested: false, ...o });
check(followState(card()) === 'follow' && followLabel('follow') === 'Follow on NOOB', 'a linked member you do not follow: "Follow on NOOB"');
check(followState(card({ following: true })) === 'following' && followLabel('following') === 'Following', 'one you follow: "Following"');
check(followState(card({ requested: true })) === 'requested' && followLabel('requested') === 'Requested', 'a private account you asked: "Requested"');
check(followState(card({ following: true, requested: true })) === 'following', 'following wins over a leftover request');
check(followState(card({ userId: null })) === 'none' && followLabel('none') === '', 'a card with no linked account has no button');
check(followState(card({ isMe: true })) === 'none' && followState(card({ blocked: true })) === 'none', 'none for yourself, and none when either of you blocked the other');

section('9. The link is remembered for a day (sign-in may leave the page and come back)');
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } };
const J = await import(pathToFileURL(path.resolve('src/components/Team/teamJoinStore.ts')).href);
const t0 = 1_800_000_000_000;
check(J.hasRememberedTeamJoin(t0) === false, 'nothing remembered at first');
J.rememberTeamJoin(t0);
check(J.hasRememberedTeamJoin(t0 + 3600_000) === true && J.hasRememberedTeamJoin(t0 + 23 * 3600_000) === true, 'remembered for the next hours');
check(J.hasRememberedTeamJoin(t0 + 25 * 3600_000) === false, 'forgotten after a day (an old link does not pop up weeks later)');
J.forgetTeamJoin();
check(J.hasRememberedTeamJoin(t0 + 1000) === false, 'and forgotten once it has been used');
globalThis.localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
check(J.hasRememberedTeamJoin() === false && (J.rememberTeamJoin(), true) && (J.forgetTeamJoin(), true), 'private browsing (storage blocked) never breaks anything');

section('10. The wiring of the form, the admin side and the follow button');
const app = read('src/App.tsx');
check(/teamJoinRequested\(window\.location\.search\)/.test(app) && /rememberTeamJoin\(\)/.test(app) && /hasRememberedTeamJoin\(\)/.test(app), 'the app notices the link, also one remembered from before sign-in');
check(/if \(!pendingTeamPageJoin \|\| !currentUser\) return;[\s\S]*openTeamJoin\(\);[\s\S]*searchParams\.delete\('team'\)/.test(app), 'the form opens only once someone is signed in, and the link is cleaned from the address bar');
check(/<TeamJoinHost currentUser=\{currentUser\} \/>/.test(app), 'the form is mounted once, in the app');
const join = read('src/components/Team/TeamJoinPage.tsx');
check(/Account ID \{currentUser\.id\}/.test(join) && /@\{currentUser\.username\}/.test(join) && /Added automatically/.test(join), 'the form shows the account that will be attached (@User ID and account ID), taken from the login');
check(/submitTeamJoin\(\{ name: name\.trim\(\), qualification: qualification\.trim\(\), description: description\.trim\(\), photoKey \}\)/.test(join) && !/userId|user_id/.test(read('src/services/supabaseApi.ts').split('export async function submitTeamJoin')[1].split('}')[0]), 'the account is never sent from the phone: only name, qualification, description and photo');
check(/Use my profile picture/.test(join) && /Applications are closed/.test(join) && /already on the team/.test(join) && /waiting for review/.test(join), 'the form handles: the profile picture, closed applications, already on the team, and a pending one');
const panel2 = read('src/components/Modals/AdminTeamPanel.tsx');
check(/TEAM_JOIN_LINK/.test(panel2) && /navigator\.clipboard\.writeText\(TEAM_JOIN_LINK\)/.test(panel2) && /Add to the team page/.test(panel2) && /Turn down/.test(panel2), 'the admin panel shows the link with Copy, and Add / Turn down for each application');
check(/Add new people to the page straight away/.test(panel2) && /Off: you approve each person first \(recommended\)/.test(panel2) && /Applications are open/.test(panel2), 'and the two switches (publish straight away is OFF unless you turn it on)');
check(/NOOB User ID/.test(panel2) && /username: draft\.username/.test(panel2), 'a member added by hand can be linked to a NOOB account by User ID');
check(/fetchTeamApplications\(\)\.then/.test(read('src/components/Modals/AdminControlModal.tsx')) && /teamPendingCount > 0/.test(read('src/components/Modals/AdminControlModal.tsx')), 'the "Our Team" tab shows how many applications wait');
const teamPage = read('src/components/Team/OurTeamPage.tsx');
check(/toggleFollowUser\(m\.userId\)/.test(teamPage) && /followLabel\(fstate\)/.test(teamPage) && /@\{member\.username\}/.test(teamPage), 'each linked card shows the @User ID and a Follow on NOOB button that does the normal follow');
check(/onOpenProfile=\{\(m\) =>/.test(feed) && /onNavigateToProfile\(known \|\|/.test(feed), 'tapping the @User ID opens their NOOB profile');
const apiSrc2 = read('src/services/supabaseApi.ts');
check(['team_my_application', 'team_apply', 'admin_team_page_applications', 'admin_team_decide', 'admin_team_settings', 'admin_team_application_erase'].every((f) => apiSrc2.includes(`rpc<any>('${f}'`)), 'the six new database functions are called by their real names');
const sql2 = read('supabase/migrations/20261013000002_team_join.sql');
check(/create table if not exists public\.team_page_applications/.test(sql2) && !/create table[^;]*public\.team_applications\b/.test(sql2), 'the new table has its own name and leaves the private staff-application table alone');

section('11. Removing someone for good (their data only, never their account)');
const panel3 = read('src/components/Modals/AdminTeamPanel.tsx');
check(/Delete \{m\.name\} for good\?/.test(panel3) && /Yes, delete permanently/.test(panel3) && /Their NOOB account is not touched/.test(panel3), 'removing a member asks first, says what is erased and that the account is not touched');
check(/Delete their data/.test(panel3) && /Delete everything \{a\.name\} filled in\?/.test(panel3) && /eraseTeamApplication\(a\.id\)/.test(panel3), 'every application has "Delete their data", with the same question first');
check(/a\.onTeam \? ', and they come off the team page'/.test(panel3), 'and it says so when they are on the page');
check(/deleteTeamMember\(m\.id\)/.test(panel3) && /setAdminState\(res\.state\)/.test(panel3), 'after a removal both lists are refreshed (the form is gone from Applications too)');
const api3 = read('src/services/supabaseApi.ts');
const eraseSrc = api3.slice(api3.indexOf('const removeTeamFiles'), api3.indexOf('export async function moveTeamMember'));
check(/await supabase\.storage\.from\(MEDIA_BUCKET\)\.remove\(list\)/.test(eraseSrc) && /isTeamPhotoKey\(k as string\)/.test(eraseSrc), 'the photo files are really deleted (waited for), and only files of the team folder');
check(/could not be deleted from storage/.test(eraseSrc) && /warning: warning \|\| undefined/.test(eraseSrc), 'if a file could not be deleted, the administrator is told');
check(/rpc<any>\('admin_team_delete'/.test(eraseSrc) && /rpc<any>\('admin_team_application_erase'/.test(eraseSrc), 'both removals go through the database function that erases the data');
const sql3 = read('supabase/migrations/20261013000002_team_join.sql');
const eraseSql = sql3.slice(sql3.indexOf('create or replace function public.team_erase'), sql3.indexOf('revoke execute on function public.team_erase'));
check(/delete from public\.team_members/.test(eraseSql) && /delete from public\.team_page_applications/.test(eraseSql) && /- 'name'/.test(eraseSql), 'the database erases the card, the joining form and their name in the activity log');
check(!/(delete from|update)\s+public\.(profiles|follows|notifications|posts|profile_private)/.test(eraseSql) && !/auth\.users/.test(eraseSql), 'and never touches the account (profile, followers, notifications, posts)');

section('12. Pinning');
const api4 = read('src/services/supabaseApi.ts');
check(/rpc<any>\('admin_team_pin', \{ p_id: id, p_pinned: pinned \}\)/.test(api4) && /pinned: m\.pinned === true/.test(api4), 'the app calls the pin function, and treats anything but a clear "true" as not pinned');
const panel4 = read('src/components/Modals/AdminTeamPanel.tsx');
check(/pinTeamMember\(m\.id, !m\.pinned\)/.test(panel4) && /Pin \$\{m\.name\} to the top/.test(panel4) && /Unpin \$\{m\.name\}/.test(panel4), 'every row has a Pin / Unpin button');
check(/\{m\.pinned && <Pin [^>]*aria-label="Pinned" \/>\}/.test(panel4), 'a pinned row carries a small pin next to the name');
check(/disabled=\{i === 0 \|\| team\[i - 1\]\.pinned !== m\.pinned\}/.test(panel4) && /disabled=\{i === team\.length - 1 \|\| team\[i \+ 1\]\.pinned !== m\.pinned\}/.test(panel4), 'the up/down arrows are off at the edge of the pinned group and of the rest');
check(/number=\{cardNumber\(i\)\}/.test(panel4) && /The number on the team page/.test(panel4), 'each row shows the number the person has on the page');
const page4 = read('src/components/Team/OurTeamPage.tsx');
check(/\{member\.pinned && \(/.test(page4) && /Only you can see this pin/.test(page4), 'the page shows a pin mark on a card only when the person is told it is pinned (the administrator)');
check(!/pinned/.test(read('src/components/Team/TeamJoinPage.tsx')), 'nothing about pins reaches the joining form');
const sql4 = read('supabase/migrations/20261013000003_team_pin.sql');
check(/'pinned', t\.pinned and me\.is_main/.test(sql4) && /order by t\.pinned desc, t\.position/.test(sql4), 'the database orders pinned people first for everyone, and sends the flag only to the main administrator');
check(/team_member_pinned/.test(read('src/components/Modals/AdminControlModal.tsx')) && /team_member_unpinned/.test(read('src/components/Modals/AdminControlModal.tsx')), 'pins and unpins read well in the activity log');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
