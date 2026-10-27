// The redesigned NOOB help desk (Customer Support): the "Need help?" screen with coloured tiles, a chat in the style of a delivery app's support chat that uses the whole screen, the five
// colourful faces to rate the help, and the call / FAQ / report / ticket screens. The AI, its knowledge, the Groq key and the database tables are NOT part of the redesign and must be as they were.
// Usage: node scripts/supabase/test-support-desk.mjs
import fs from 'node:fs';
import path from 'node:path';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(dir, e.name))) : [path.join(dir, e.name)]));

const D = 'src/components/Support/';
const modal = read(D + 'CustomerSupportModal.tsx'), hub = read(D + 'SupportHub.tsx'), chat = read(D + 'SupportChatPanel.tsx'), rating = read(D + 'SupportRatingSheet.tsx');
const pages = read(D + 'SupportPages.tsx'), icons = read(D + 'SupportIcons.tsx'), css = read(D + 'supportDesk.css');

section('1. Opening support shows the options');
check(/const \[activeSupportTab, setActiveSupportTab\] = useState<SupportScreen>\('home'\);/.test(modal) && !/useResumeState<'ai_chat'/.test(modal), 'support always opens on the "Need help?" screen (the conversation is still kept)');
const tileIds = [...hub.matchAll(/\{ id: '(\w+)', label: '([^']+)'/g)].map((m) => m[1]);
check(tileIds.join() === 'chat,call,faq,report,ticket,payment', 'six tiles: chat, call, FAQs, report, ticket, payment help', tileIds.join());
check(/Need help\?/.test(hub) && /Popular topics/.test(hub) && /SUPPORT_TOPICS\.filter/.test(hub), 'with a "Need help?" heading and the popular topics under them');
const iconNames = ['ChatTileIcon', 'CallTileIcon', 'FaqTileIcon', 'ReportTileIcon', 'TicketTileIcon', 'PaymentTileIcon'];
check(iconNames.every((n) => new RegExp('export const ' + n).test(icons) && hub.includes(n)), 'each tile has its own icon');
const fills = (name) => { const body = icons.slice(icons.indexOf('export const ' + name), icons.indexOf('\n);', icons.indexOf('export const ' + name))); return new Set([...body.matchAll(/(?:fill|stroke|stopColor)="(#[0-9a-fA-F]{6})"/g)].map((m) => m[1].toLowerCase())); };
check(iconNames.every((n) => fills(n).size >= 3), 'and every one is drawn in at least three colours (not a grey outline)');
check(new Set(iconNames.map((n) => [...fills(n)][0])).size === 6, 'a different main colour for each');
check(/openChatWith\(t\.prompt\)/.test(modal) && /t\.action === 'report'\) setActiveSupportTab\('safety_report'\)/.test(modal) && /openPaymentHelp/.test(modal), 'a topic opens the chat with its question, the report topic opens the report form, payment help lists the payments');
check(/onBack = \(\) => \{ if \(activeSupportTab === 'home'\) onClose\(\); else setActiveSupportTab\('home'\); \}/.test(modal), 'back goes to the options, and from the options out of help');

section('2. The chat has the whole screen');
check(/\.sd-chat \{[^}]*flex: 1; min-height: 0; display: flex; flex-direction: column/.test(css) && /\.sd-thread \{ flex: 1; min-height: 0; overflow-y: auto/.test(css), 'the conversation takes all the space between the slim bar and the typing bar');
check(!/support-topics|support-quickfix|YOUR NOOB HELP DESK/.test(chat) && !/User Context Bar|Tab Navigation/.test(modal), 'no side columns, no second bar and no tab strip take space from it any more');
check(/\.sd-head \{[^}]*min-height: calc\(58px/.test(css) && /\.sd-composer \{[^}]*padding: 8px 10px calc\(8px \+ env\(safe-area-inset-bottom\)\)/.test(css), 'the top bar is 58px and the typing bar is one row');
check(/<span className="sd-who">\{BOT_NAME\}<\/span>/.test(chat) && /const BOT_NAME = 'NoobBuddy'/.test(chat) && /CheckCheck/.test(chat) && /sd-day/.test(chat), 'a bold name above the helper\'s words, a time with two ticks under yours, and the day on top');
check(/sd-assist" data-testid="support-assist">NOOB AI support is assisting you now/.test(chat) && /\.sd-assist \{[^}]*background: #fff6cf/.test(css), 'the yellow "assisting you now" strip');
check(/sd-down/.test(chat) && /away > 160/.test(chat) && /\.sd-down \{[^}]*color: #0c831f/.test(css), 'a green arrow brings you back down when you have scrolled up');
check(/\.sd-bubble \{[^}]*background: #e4edf8/.test(css) && /\.sd-msg\.me \.sd-bubble \{ background: #e8ecf1/.test(css), 'light blue-grey bubbles (the helper\'s) and light grey (yours)');
check(/\.sd-send \{[^}]*background: #0c831f/.test(css) && /placeholder="Type a message\.\.\."/.test(chat), 'a green send button and a "Type a message..." box');
check(/id="ai-support-form"/.test(chat) && /onKeyDown=\{\(e\) => \{ if \(e\.key === 'Enter' && !e\.shiftKey\)/.test(chat), 'Enter sends (and the chips can send a question by form)');
check(/withBold/.test(chat) && /<strong key=\{i\}>/.test(chat) && !/dangerouslySetInnerHTML/.test(chat + modal + pages + hub + rating), 'the assistant\'s **bold** words show bold, as plain React text (never as html)');
check(/data-testid="support-speak"/.test(chat) && /speakText\(m\.text, m\.id\)/.test(chat), 'every answer can be read out loud');
check(/webkitSpeechRecognition/.test(chat) && /p\.setInputMessage\(\(baseRef\.current \+ said\)\.slice\(0, 600\)\)/.test(chat), 'the microphone in the typing bar really writes what is said into the box');
check(/transactions/.test(chat) && /onSelectTransaction/.test(chat) && /transactionDetail/.test(chat) && /handleSelectTransaction/.test(modal), 'the payment list and a payment\'s details still show inside the chat');

section('3. Rating: five doodle faces');
check(/How would you like to rate my assistance\?/.test(rating), 'it asks "How would you like to rate my assistance?"');
const kinds = [...icons.matchAll(/value: (\d), kind: '(\w+)'/g)].map((m) => m[1] + m[2]);
check(kinds.join() === '1angry,2sad,3okay,4happy,5love', 'five faces from angry to loves it', kinds.join());
const faceBody = icons.slice(icons.indexOf('export const RatingFace'), icons.indexOf('export const FACES'));
const faceHex = new Set([...faceBody.matchAll(/#[0-9a-fA-F]{3,6}/g)].map((m) => m[0].toLowerCase()));
check([...faceHex].every((h) => ['#fff', '#a9a9a9'].includes(h)) && /currentColor/.test(faceBody) && /var\(--ring/.test(faceBody), 'drawn as grey doodle line art (a thin round outline, white face, drawn features): no fill colours of their own');
check(['angry', 'sad', 'okay', 'happy', 'love'].every((k) => new RegExp("kind === '" + k + "'").test(faceBody)) && /HEART\(16\)/.test(faceBody) && /M16 36\.500Q24 28\.500 32 36\.500/.test(faceBody), 'angry (slanted brows), crying (a tear), neutral (a flat mouth), grinning, and heart eyes');
check(/sd-faces \$\{rating \? 'picked' : ''\}/.test(rating) && /\.sd-face\.sel \{ --ring: #1c1c1c; color: #1c1c1c; transform: scale\(1\.22\)/.test(css), 'the face you tap turns dark and grows, the others fade');
check(/disabled=\{!rating\}/.test(rating) && /onSubmit\(rating, feedback\)/.test(rating), 'you must choose a face to send, and can add words');
check(/submitSupportReview\(rating, feedback\)/.test(modal) && /fetchSupportRatingSummary/.test(modal) && /setActiveSupportTab\('home'\)/.test(modal), 'the rating goes to the same place as before and you land on the options after');
check(/flat=\{activeSupportTab === 'ai_chat'\}/.test(modal) && /\.sd-rate\.flat/.test(css) && /ratingOpen/.test(chat), 'inside the chat it replaces the typing bar; after a call it opens over the screen');
check(/endChatNow/.test(modal) && /finishChatByRequest/.test(modal) && /setShowReviewModal\(true\)/.test(modal), 'ending the chat (the button, or saying bye) and ending a call both open it');
check(/This conversation has been closed/.test(chat) && /Start a new chat/.test(chat) && /setReviewSubmitted\(false\)/.test(modal), 'after the end: "This conversation has been closed", and a new chat can be started and rated again');

section('4. The other screens work');
check(/export const CallPage/.test(pages) && /onClick=\{onStart\}/.test(pages) && /<CallPage username=\{currentUser\.username\} onStart=\{handleStartCall\}/.test(modal), 'Call us starts the live voice call');
check(/handleStartCall/.test(modal) && /startVoiceListening/.test(modal) && /handleAskCallQuestion/.test(modal) && /data-testid="voice-info"/.test(modal), 'the voice call is as it was (listening, answering out loud, the voice shown in small print)');
check(/<FaqPage faqs=\{FAQs\}/.test(modal) && (modal.match(/^\s+q: '/gm) || []).length === 9, 'FAQs show all nine questions, each opens its answer');
check(/handleSafetyReportSubmit/.test(modal) && /submitSafetyReport\(\{/.test(modal) && /fetchUsers\(q\)/.test(modal) && /<ReportPage/.test(modal), 'Report someone searches the accounts and reports and blocks, as before');
check(/submitAppSuggestion\('issue'/.test(modal) && /<TicketPage/.test(modal) && !/TKT-/.test(modal), 'a ticket is really sent (to the NOOB team\'s Suggestion Box, where it is answered), not given a made-up number');

section('5. Nothing behind it changed');
const fn = read('supabase/functions/dynamic-handler/index.ts');
check(/Deno\.env\.get\('GROQ_API_KEY'\)/.test(fn), 'the AI still answers through the Groq key kept on the server');
check(/askAiSupportAssistant\(messageForAssistant, history\)/.test(modal) && /askAiSupportAssistant\(cleanQuery, history, 'call'\)/.test(modal), 'the chat and the call ask the same assistant function, with the same history');
check(!/gsk_[A-Za-z0-9]{10,}/.test([modal, hub, chat, rating, pages, icons].join('\n')), 'no key in the screens');
check(!fs.readdirSync('supabase/migrations').some((f) => /^2026102[4-9]/.test(f) && /support/i.test(f)), 'no new table or change in the database for it');

section('6. Looks the same in the dark and the light theme, and is its own');
check(!/zinc-|text-white|bg-black|bg-zinc/.test([hub, chat, rating, pages].join('\n')), 'the new screens use no theme colours (those flip in light mode)');
check(!/:root|\[data-theme|prefers-color-scheme/.test(css) && /color-scheme: light/.test(css), 'the stylesheet does not depend on the theme');
check(/:where\(\.sd-root\) button \{ cursor: pointer; border: 0; background: none/.test(css), 'the button reset is light enough not to hide the buttons\' own colours');
const named = walk('src').filter((f) => /\.(tsx?|css)$/.test(f)).filter((f) => /blinkit/i.test(fs.readFileSync(f, 'utf8')));
check(named.length === 0, 'no name or logo of another company in the app', named.join(', '));
check(/<SupportHub/.test(modal) && /useFullPage\(true\)/.test(modal) && /visibleAreaStyle\(visibleArea\)/.test(modal), 'it is a page of its own that fits the visible screen (also with the keyboard up)');
check(/<div className="fixed inset-0 z-50 sd-root" data-testid="support-page">/.test(modal) && /<div className="sd-stage" style=\{visibleAreaStyle\(visibleArea\)\}>/.test(modal) && /\.sd-stage \{ position: absolute; left: 0; right: 0; top: 0; bottom: 0;/.test(css), 'the page itself covers the whole screen (also under a see-through phone keyboard): only the inner stage is cut to the visible area, so nothing behind shows through the glass');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
