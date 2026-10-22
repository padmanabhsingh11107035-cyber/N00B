// The app side of Anonymous Messages (the database side is tested on a real Postgres in test-anonymous-messages.mjs): the menu entry, the page, the address, the privacy of
// what the page reads and draws, and the API calls. Usage: node scripts/supabase/test-anonymous-ui.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const feed = read('src/components/Feed/FeedView.tsx');
const app = read('src/App.tsx');
const page = read('src/components/Anonymous/AnonymousMessagesPage.tsx');
const api = read('src/services/supabaseApi.ts');
const apiIndex = read('src/services/api.ts');
const css = read('src/index.css');
const sql = read('supabase/migrations/20261015000002_anonymous_messages.sql');

section('1. The Home menu entry and the address');
check(/ariaLabel="Anonymous Messages"/.test(feed) && /title="Anonymous Messages"/.test(feed) && /blurb="Your words, without your name"/.test(feed), 'the three-line menu has an "Anonymous Messages" entry');
check(/onClick=\{\(\) => \{ markMenuEntry\('anonymous'\); setShowNoobMenu\(false\); openAnonymous\(\); \}\}/.test(feed), 'it closes the menu and opens the page (and remembers the button, to come back to it)');
check(/React\.lazy\(\(\) => loadAnonymousPage\(\)/.test(feed) && /onPointerDown=\{\(\) => \{ void loadAnonymousPage\(\); \}\}/.test(feed), 'the page is loaded on demand (and starts loading the moment the entry is pressed)');
check(/window\.location\.pathname\.replace\(\/\\\/\+\$\/, ''\) === '\/anonymous'/.test(feed) && /replaceState\(null, '', '\/anonymous'/.test(feed) && /replaceState\(null, '', '\/' \+ window\.location\.search\)/.test(feed), '/anonymous opens it directly, and closing goes back to the home address');
check(/\{showAnonymous && \(\s*<ErrorBoundary showErrorDetails>\s*<React\.Suspense fallback=\{<LazyFallback \/>\}>\s*<AnonymousMessagesPage currentUser=\{currentUser\} onClose=\{closeAnonymous\} \/>/.test(feed), 'the page sits in an error boundary, so a fault there can never take Home down');
check(/<OurTeamPage/.test(feed) && /showOurTeam/.test(feed), 'the existing menu pages are untouched');

section('2. Reading it before logging in');
check(/const \[anonPublic, setAnonPublic\] = useState\(\(\) => window\.location\.pathname\.replace\(\/\\\/\+\$\/, ''\) === '\/anonymous'\)/.test(app), 'the app notices the /anonymous address');
check(/if \(!currentUser\) \{[\s\S]*?if \(anonPublic\) \{[\s\S]*?<AnonymousMessagesPage currentUser=\{null\} onClose=\{leaveAnonymous\} onLogin=\{leaveAnonymous\} \/>/.test(app), 'a visitor who is not logged in can read it, and is sent to the login screen to share');
check(/<AuthView onAuthSuccess/.test(app), 'the normal login screen is still there for everyone else');

section('3. Nothing about an author reaches the page');
check(/export interface AnonMessage \{ id: string; body: string; createdAt: string \}/.test(api), 'the public message type is {id, body, createdAt} and nothing else');
const NL = String.fromCharCode(10);
const code = page.split(NL).filter((l) => !/^\s*(\/\/|\{\/\*)/.test(l) && /[<>{}=;(]/.test(l)).join(NL).replace(/'[^'\n]*'|`[^`\n]*`|>[^<>{}\n]*</g, '""');
check(!/\b(author|authorId|author_id|userId|user_id|username|avatar|email)\b/i.test(code.replace(/currentUser|isMainAdmin/g, '')), 'the page code never reads an author, username, picture, e-mail or user id from a message');
check(/\{m\.body\}/.test(page) && !/dangerouslySetInnerHTML|innerHTML/.test(page), 'a message is drawn as text, never as HTML');
check(/whitespace-pre-wrap break-words/.test(page), 'line breaks are kept and long words cannot break the layout');
check(!/localStorage|sessionStorage|indexedDB/.test(page), 'nothing about a message is kept in the browser');
check(/anon_messages_feed/.test(api) && !/\.from\('anon_/.test(api), 'the API only uses the database functions, never the tables directly');
check(/revoke all on public\.anon_messages, public\.anon_message_reports, public\.anon_message_bans from public, anon, authenticated/.test(sql) && /PRIVATE: never returned by any function/.test(sql), 'the author column cannot be read by the app at all');

section('4. What the page shows');
check(/Anonymous Messages<\/h1>/.test(page) && /Your words, without your name\./.test(page), 'heading "Anonymous Messages" and the subtitle');
check(/No anonymous messages yet\. Be the first to share!/.test(page), 'the empty state');
check(/Share Anonymously/.test(page) && /Publish Anonymously/.test(page), 'the "Share Anonymously" and "Publish Anonymously" buttons');
check(/Anonymous means what other people can see/.test(page) && !/untraceable|cannot be traced|can't be traced|100% anonymous/i.test(page), 'it says what anonymous means and never promises untraceable');
check(/ANON_MAX_LENGTH/.test(page) && /\{count\} \/ \{ANON_MAX_LENGTH\}/.test(page) && /const count = codePoints\(text\)/.test(page) && /Array\.from\(/.test(page), 'a live counter out of 1000, counting real characters (an emoji is one)');
check(/Write a message first\./.test(page) && /count <= ANON_MAX_LENGTH/.test(page) && /disabled=\{!canPublish\}/.test(page), 'empty and too-long messages cannot be published');
check(/Published anonymously\./.test(page), 'a success notice');
check(/animate-pulse/.test(page) && /role="status" aria-label="Loading messages"/.test(page), 'skeleton cards while loading');
check(/Load more/.test(page) && /hasMore/.test(page), 'a Load more button until the last page');
check(/role="dialog" aria-modal="true" aria-label="Report this message"/.test(page) && /aria-label="Report this message"/.test(page), 'a report button and dialog on every message');
check(/aria-label="Close Anonymous Messages"/.test(page) && !/aria-label="Refresh messages"/.test(page) && !/setInterval/.test(page), 'a named close button, and no refresh button or timer (only Home refreshes)');
check(/const isAdmin = !!currentUser && isMainAdmin\(currentUser\)/.test(page) && /\{isAdmin && /.test(page), 'removal controls are drawn for the main administrator only');
check(/postingRef/.test(page) && /keyRef/.test(page), 'a double tap cannot publish twice');
check(/\.no-doodle \{ outline: none !important; background-image: none !important; \}/.test(css), 'message cards opt out of the pop-up doodle edge so the text stays clean');

section('5. The API');
check(/rpc<AnonPage<AnonMessage>>\('anon_messages_feed', \{\s*p_limit: opts\.limit \?\? 20,\s*p_before: opts\.before\?\.createdAt \?\? null,\s*p_before_id: opts\.before\?\.id \?\? null/.test(api), 'reading sends only a page size and a keyset cursor');
check(/rpc<AnonMessage & \{ duplicate\?: boolean \}>\('anon_message_post', \{ p_body: body, p_client_key: clientKey \}\)/.test(api), 'publishing sends only the text and a one-time key');
check(/'anon_message_report', \{ p_message: messageId, p_reason: reason \}/.test(api), 'reporting sends the message and a reason');
check(/'admin_anon_message_remove'/.test(api) && /'admin_anon_message_dismiss'/.test(api) && /'anon_messages_admin_feed'/.test(api), 'the administrator calls exist');
check(/fetchAnonMessages,\s*postAnonMessage,\s*reportAnonMessage/.test(apiIndex) && /AnonMessage,\s*AnonAdminMessage,\s*AnonPage/.test(apiIndex), 'the API index exports them');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
