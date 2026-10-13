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
const { TEAM_LIMITS, initials, accentFor, TEAM_ACCENTS, cardNumber, needsReadMore, DESCRIPTION_PREVIEW_CHARS, memberCountLabel, validateTeamForm, isTeamPhotoKey } = M;
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
check(/setShowOurTeam\(true\)/.test(feed) && /<OurTeamPage currentUser=\{currentUser\} onClose=\{\(\) => setShowOurTeam\(false\)\}/.test(feed) && /React\.lazy\(\(\) => import\('\.\.\/Team\/OurTeamPage'\)\)/.test(feed), 'the menu item opens the page, which is fetched only when opened');
const page = read('src/components/Team/OurTeamPage.tsx');
check(/fetchTeamMembers/.test(page) && /Try again/.test(page) && /aria-busy/.test(page) && /coming together/.test(page), 'the page handles loading, a failed load and an empty team');
check(/onError=\{\(\) => setBroken\(true\)\}/.test(page) && /initials\(member\.name\)/.test(page), 'a photo that fails to load falls back to the initials');
check(/Escape/.test(page) && /aria-label="Close"/.test(page), 'it can be closed with the button and with Escape');
const modal = read('src/components/Modals/AdminControlModal.tsx');
check(/'team' \| 'settings'/.test(modal) && /setActiveTab\('team'\)/.test(modal) && /activeTab === 'team' && main \? \(\s*<AdminTeamPanel \/>/.test(modal), 'the admin panel has an "Our Team" tab, for the main administrator only');
check(/team_member_added/.test(modal) && /team_member_removed/.test(modal), 'its changes read well in the activity log');
const panel = read('src/components/Modals/AdminTeamPanel.tsx');
check(/validateTeamForm/.test(panel) && /uploadTeamPhoto/.test(panel) && /type="file" accept="image\/\*"/.test(panel) && /discardTeamPhoto/.test(panel), 'the form needs all four things, uploads the photo, and cleans up photos it did not use');
const api = read('src/services/supabaseApi.ts');
check(/uploadMediaFile\(file, 'team'\)/.test(api) && /'songs' \| 'team'/.test(api), 'photos go to the "team" folder (which the upload rules allow)');
check(/rpc<any>\('admin_team_save'/.test(api) && /rpc<any>\('team_list'\)/.test(api) && /rpc<any>\('admin_team_delete'/.test(api) && /rpc<any>\('admin_team_move'/.test(api), 'the four database functions are called by their real names');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
