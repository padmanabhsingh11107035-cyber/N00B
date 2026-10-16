// The buttons on a story: what was wrong and the rules that now hold.
//   * Typing an answer inside a question sticker did not hold the story (it moved on after about 4 seconds, taking the sticker with it): it now holds, like typing a reply does.
//   * The @mention sticker opened the profile BEHIND the story (the story stayed on top, so the button looked dead): the story closes, like the name at the top does.
//   * The quiz cheered for answer number 2 whatever the right answer was, and let you change your answer: it checks the real right answer, once.
//   * The slider kept its value from one story to the next.
//   * The owner had to hunt for the answers to a question: the sticker now says how many came in.
//   * A question can be ANONYMOUS ("Tell me a secret"): the answers carry no name and no picture (the database leaves them out; see test-story-questions-anonymous.mjs).
//   * The "Send me anonymous messages" BUTTON opens the Anonymous Messages page, and a story with it is not saved to highlights (see test-anon-story-no-highlight.mjs).
//
// Usage: node scripts/supabase/test-story-buttons.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

const viewer = read('src/components/Stories/StoryViewerModal.tsx');
const creator = read('src/components/Stories/CreateStoryModal.tsx');
const api = read('src/services/supabaseApi.ts');
const sql = read('supabase/migrations/20261018000001_story_questions_anonymous.sql');

section('1. A question sticker holds the story while you type');
check(/const \[isStickerFocused, setIsStickerFocused\] = useState\(false\)/.test(viewer), 'the story knows when a sticker has the keyboard');
check(/onFocus=\{\(\) => setIsStickerFocused\(true\)\}[\s\S]{0,120}onBlur=\{\(\) => setIsStickerFocused\(false\)\}/.test(viewer), 'the answer box sets it on focus and clears it on blur');
check(/if \(isPaused \|\| isCommentFocused \|\| isStickerFocused \|\| openQuestionResultsKey !== null/.test(viewer), 'the timer that moves the story on stops while typing, and while the owner reads the answers');
check(/const handleNext = \(\) => \{\s*if \(isCommentFocused \|\| isStickerFocused\) return;/.test(viewer) && /const handlePrev = \(\) => \{\s*if \(isCommentFocused \|\| isStickerFocused\) return;/.test(viewer), 'a tap on the edge of the picture does not move the story while someone is typing');
check(/setIsStickerFocused\(false\);\s*setOpenQuestionResultsKey\(null\);\s*\}, \[currentIndex\]\)/.test(viewer), 'moving to another story clears all of it');
check(/questionSending\[key\]/.test(viewer) && /<Loader2 className="animate-spin"/.test(viewer) && /onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/.test(viewer), 'Send shows it is working, ignores a second tap, and does not drop the keyboard before the tap lands');
check(/setQuestionDrafts\(\(prev\) => \(\{ \.\.\.prev, \[key\]: '' \}\)\)/.test(viewer) && /Sent anonymously ✓/.test(viewer), 'after sending the box is emptied and says it was sent (anonymously, if it was)');

section('2. The other sticker buttons');
check(/if \(!onNavigateToProfile\) return; void goToProfile\(sticker\.data\?\.userId\); onClose\(\);/.test(viewer), 'the @mention sticker opens the profile and closes the story (it used to open it behind the story)');
check(/if \(quizSelected !== null\) return;/.test(viewer) && /index === correct/.test(viewer) && !/index === 1\)/.test(viewer), 'the quiz cheers for the real right answer, and takes one answer');
check(/setSliderVal\(75\);/.test(viewer), 'the slider starts again on every story');
check(/onNavigateToHashtag\?\.\(sticker\.data\?\.tag\)/.test(viewer) && /openInApp\(sticker\.data\?\.url\)/.test(viewer), 'the hashtag and link stickers still do what they did');

section('3. The owner and the answers');
check(/data-testid="question-answer-count"/.test(viewer) && /tap to read/.test(viewer) && /No answers yet/.test(viewer), 'the owner’s question sticker says how many answers came in');
check(/story\.userId !== currentUser\.id \|\| !story\.stickers\?\.some\(\(s\) => s\.type === 'question'\)/.test(viewer) && /fetchStoryQuestionResults\(id\)/.test(viewer), 'they are read quietly when the owner opens the story');

section('4. Anonymous questions');
check(/placeholder=\{anonymousQuestion \? 'Send an anonymous message\.\.\.' : 'Type your answer\.\.\.'\}/.test(viewer) && /Anonymous question/.test(viewer), 'a viewer sees "Send an anonymous message" on an anonymous question');
check(/a\.anonymous \? 'Anonymous' : `@\$\{a\.username\}`/.test(viewer), 'the owner reads "Anonymous", never a name');
check(/anonymous\?: boolean/.test(api) && /Array\.isArray\(value\) \)? ?\{ out\[pos\] = value; continue; \}|Array\.isArray\(value\)\) \{ out\[pos\] = value; continue; \}/.test(api) && /\.\.\.a, anonymous/.test(api), 'the app understands both the new and the old answer from the server');
check(/Tell me a secret/.test(creator) && /Ask me anything/.test(creator) && /data-testid="question-anonymous-switch"/.test(creator) && /role="switch"/.test(creator), 'when making a question you can pick a ready-made one (Ask me anything, Tell me a secret) and switch Anonymous answers on or off');
check(/\.\.\.\(layer\.anonymous \? \{ anonymous: true \} : \{\}\)/.test(creator) && /useState\(false\)/.test(creator), 'it is saved with the sticker, and a question names its askers unless you switch Anonymous answers on');
check(/'anonymous', anon/.test(sql) && /case when anon then 'Anonymous' else p\.username end/.test(sql) && /case when anon then '' else p\.avatar end/.test(sql), 'the database leaves the name and the picture out of an anonymous question’s answers');
check(/msg\.storyReplies/.test(sql) && /limit_applies/.test(sql) && /already sent 5 answers/.test(sql), 'answers follow "Who can reply to your story", "Limit interactions" and a limit of 5 per person');
check(/revoke execute on function public\.story_by_id\(uuid\) from public, anon/.test(sql), 'and a stranger can no longer ask for a story by its address');

section('5. The "Send me anonymous messages" button');
const openAnon = read('src/utils/openAnonymous.ts');
const app = read('src/App.tsx');
const feed = read('src/components/Feed/FeedView.tsx');
check(/OPEN_ANONYMOUS_EVENT = 'noob:open-anonymous'/.test(openAnon) && /requestOpenAnonymousMessages/.test(openAnon), 'one call, from anywhere, asks for the Anonymous Messages page');
check(/sticker\.type === 'anon_messages'/.test(viewer) && /data-testid="story-anon-button"/.test(viewer) && /requestOpenAnonymousMessages\(\); onClose\(\);/.test(viewer), 'tapping the button on a story closes the story and asks for that page');
check(/e\.stopPropagation\(\); requestOpenAnonymousMessages/.test(viewer), 'the tap does not also move the story on');
check(/addEventListener\(OPEN_ANONYMOUS_EVENT, open\)/.test(app) && /setActiveStoryViewerIndex\(null\); setActiveTab\('feed'\)/.test(app), 'the app leaves the story and goes home');
check(/addEventListener\(OPEN_ANONYMOUS_EVENT, open\)/.test(feed) && /const open = \(\) => openAnonymous\(\)/.test(feed), 'and the home page shows the Anonymous Messages page');
check(/data-testid="add-anon-button"/.test(creator) && /type: 'anon_messages'/.test(creator) && /anonButtonLayers\.forEach/.test(creator) && /anonButtonLayers\.map\(\(layer\) => \(\s*<EditableStickerLayer/.test(creator), 'when making a story you can add the button, move and resize it, and it is saved with the story');
check(/'anon_messages'/.test(read('src/types.ts')), 'it is a known sticker type');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
