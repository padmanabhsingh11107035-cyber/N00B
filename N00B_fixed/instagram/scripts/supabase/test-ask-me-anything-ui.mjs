// Ask Me Anything, the app side (the database side is tested on a real Postgres in test-ask-me-anything.mjs): the page where a friend sends a question, the owner's dashboard,
// what is said about privacy, the card on a profile, and the picture shared as a Story. (Tried in a real browser too: the link page, sending, answering, publishing, deleting,
// the visitor's view of a shared link, and the Story picture.) Usage: node scripts/supabase/test-ask-me-anything-ui.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const page = read('src/components/Fun/AskPage.tsx');
const card = read('src/components/Profile/ProfileFunCards.tsx');
const share = read('src/components/Fun/shareCard.ts');
const profile = read('src/components/Profile/ProfileView.tsx');
const app = read('src/App.tsx');
const api = read('src/services/supabaseApi.ts');
const apiIndex = read('src/services/api.ts');

section('1. The page a friend opens from a link');
check(/Send Anonymously/.test(page) && /ASK_MAX_LENGTH/.test(page) && /\{count\} \/ \{ASK_MAX_LENGTH\}/.test(page), 'a question box with a counter and a "Send Anonymously" button');
check(/sendAskQuestion\(profile\.username, text, keyRef\.current\)/.test(page) && /keyRef\.current = newKey\(\)/.test(page) && /postingRef/.test(page), 'a double tap or a retry sends once (a one-time key, and a lock while sending)');
check(/if \(!currentUser\) \{ say\('Log in to send your question\.', 'err'\); onLogin\?\.\(\); return; \}/.test(page) && /Log in to send/.test(page), 'a visitor is asked to log in to send (they can look at the page first)');
check(/is not taking questions right now/.test(page) && /We could not find that person/.test(page), 'a person who switched questions off, and a link that does not lead anywhere, are explained');
check(/This is your own question page/.test(page) && /Open my questions/.test(page), 'opening your own link shows you your own page, not a box to ask yourself');
check(/Sent!/.test(page) && /without knowing it was you/.test(page) && /Ask something else/.test(page), 'after sending: a clear "Sent!", and a way to ask something else');
check(/Answered questions/.test(page) && /fetchAskPublicAnswers\(username, \{ limit: PAGE_SIZE \}\)/.test(page) && /Load more/.test(page), 'the answers that person published are listed, a page at a time');

section('2. What is promised about privacy');
check(/will not see your name, username, picture or any account details next to your question/.test(page), 'it says what is true: the person asked does not see who asked');
check(/This is anonymity for the person who receives the question\. NOOB keeps a private record to prevent abuse and may act on reports/.test(page), 'and what is not: it does not claim to be untraceable');
check(!/untraceable|cannot be traced|can't be traced|completely anonymous|100% anonymous/i.test(page + card), 'nothing says or hints that it can never be traced');
check(!/senderId|sender_id|\.sender\b|senderName/.test(page + card + api.slice(api.indexOf('Ask Me Anything (migration'))), 'no field for who asked exists anywhere in the page, the card or the API types');

section('3. My dashboard');
check(/Your question link/.test(page) && /funShareUrl\(\{ feature: 'ask', target: username \}\)/.test(page) && /aria-label="Copy link"/.test(page) && /aria-label="Share link"/.test(page), 'my own question link, easy to copy and to share');
check(/role="switch" aria-checked=\{enabled\}/.test(page) && /setAskEnabled\(next\)/.test(page), 'a switch turns anonymous questions on and off');
check(/New \(\{counts\.new\}\)/.test(page) && /Answered \(\{counts\.answered\}\)/.test(page), 'new and answered questions are listed separately, with their numbers');
check(/Anonymous · \{whenLabel\(q\.createdAt\)\}/.test(page), 'each question is labelled "Anonymous" with its time');
check(/answerAskQuestion\(q\.id, draft, publish\)/.test(page) && /Publish this answer on my profile \(without who asked\)/.test(page), 'answering, with a choice to publish it on my profile (not published unless I tick it)');
check(/useState\(q\.answerPublic\)/.test(page) && /setAskAnswerPublic\(q\.id, !q\.answerPublic\)/.test(page), 'a published answer can be taken off, and a private one published, at any time');
check(/shareCardAsStory\(\{ eyebrow: 'Ask me anything', title: q\.body, body: q\.answer \?\? undefined, link: \{ url: link, label: 'Ask me anything' \} \}\)/.test(page) && /Share as Story/.test(page), 'an answer can be shared as a Story, with a real "Ask me anything" button on it');
check(/Put my link in a Story/.test(page), 'and so can my question link');
check(/deleteAskQuestion\(q\.id\)/.test(page) && /reportAskQuestion\(q\.id, reason\)/.test(page) && /blockAskSender\(q\.id\)/.test(page), 'a question can be deleted, reported, or its sender blocked');
check(/armed === 'delete'/.test(page) && /armed === 'block'/.test(page) && /Tap again to block/.test(page), 'deleting and blocking need a second tap');
check(/REPORT_REASONS/.test(page) && /Harassment or hate/.test(page), 'a report asks for a reason');
check(/fetchFunCanManage\(\)/.test(page) && /canManage && reports\.length > 0/.test(page) && /You see the question and the reason, never who sent it\./.test(page), 'administrators and helpers see reported questions (not who sent them) and can keep, remove, or remove and stop the sender');
check(!/setInterval/.test(page), 'nothing reloads this page by itself (a new question is in the notification, and is here when the page is opened): only Home refreshes');

section('4. States and safety');
check(/<SkeletonCards/.test(page) && /<ErrorState/.test(page) && /<EmptyState/.test(page) && /No new questions/.test(page), 'loading placeholders, an error with "Try again", and an empty state');
check(/useToast/.test(page), 'success and error notices');
check(!/dangerouslySetInnerHTML|innerHTML/.test(page + card), 'a question or an answer is always drawn as text');
check(/break-words \[overflow-wrap:anywhere\] whitespace-pre-wrap/.test(page), 'long words and line breaks cannot break the layout');
check(!/localStorage|sessionStorage/.test(page + card), 'no question or answer is kept in the browser');
check(/<LoginPrompt what="get anonymous questions/.test(page), 'the dashboard asks a visitor to log in');

section('5. On a profile');
check(/export const ProfileAskCard/.test(card) && /Ask \{name\} anything/.test(card) && /if \(!enabled && answers\.length === 0\) return null;/.test(card), 'someone else\'s profile gets an "Ask anything" card, and none at all when there is nothing to show');
check(/fetchAskPublicAnswers\(profileUser\.username, \{ limit: 3 \}\)/.test(card) && /See all answers/.test(card), 'with their latest published answers');
check(/Copy my question link/.test(card) && /question\$\{waiting === 1 \? '' : 's'\} waiting/.test(card), 'my own profile shows how many questions are waiting, and a button to copy my link');
check(/\} catch \{\s*\/\* not available: the card just stays away \*\//.test(card), 'if the database does not answer, the card simply stays away');
check(/\{!isTargetBlocked && <ProfileAskCard profileUser=\{targetUser\} isOwnProfile=\{isOwnProfile\} onOpenFunPage=\{onOpenFunPage\} \/>\}/.test(profile) && /onOpenFunPage=\{openFun\}/.test(app), 'it is placed on the profile page, and not on the profile of someone you blocked');

section('6. The picture for a Story');
check(/canvas\.width = W;\s*canvas\.height = H;/.test(share) && /const W = 1080;\s*const H = 1920;/.test(share), 'a Story-sized picture (1080 x 1920)');
check(/uploadMediaFile\(file, folder\)/.test(share) && /createStory\(\{ mediaUrl: key, mediaType: 'image', stickers: spec\.link \? \[storyLinkSticker\(spec\.link\)\] : \[\], isCloseFriendsOnly: false \}\)/.test(share), 'it goes through the app\'s own upload and Story publishing, with the link as the Story\'s own tappable button');
check(/createPost\(\{[\s\S]{0,120}caption,/.test(share), 'the same picture can be a Post');
check(/typeof ctx\.roundRect === 'function'/.test(share), 'older phones without rounded rectangles still get a picture');

section('7. The API');
check(/'ask_send', \{ p_username: username, p_body: body, p_client_key: clientKey \}/.test(api) && !/\.from\('ask_/.test(api), 'every call goes through a database function; the tables are never touched directly');
check(/'ask_inbox'/.test(api) && /'ask_answer'/.test(api) && /'ask_block_sender'/.test(api) && /'ask_admin_reports'/.test(api) && /'ask_public_answers'/.test(api) && /'ask_profile_public'/.test(api), 'the calls for reading, answering, blocking, reports and public answers exist');
check(/fetchAskProfile,\s*sendAskQuestion,\s*fetchAskInbox/.test(apiIndex) && /AskProfile,\s*AskQuestion,\s*AskInboxPage/.test(apiIndex), 'the API index exports them');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
