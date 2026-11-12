// Tappable @mentions (captions, comments, bios) and timed chat mutes (migration 20261112000005).
//   1. the mention rule (src/utils/mentions.ts), pure function;
//   2. linkify drawing @name as a button (rendered for real), not inside e-mail addresses or web addresses, and the chat opting out;
//   3. the wiring (App.tsx opener, API lookup) and the mute-until SQL / client.
// Usage: node --liftoff-only scripts/supabase/test-mentions.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSync, build } from 'esbuild';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

section('1. The mention rule (pure function)');
const out = path.resolve('node_modules/.cache-mentions.mjs');
buildSync({ entryPoints: [path.resolve('src/utils/mentions.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const M = await import(pathToFileURL(out).href);
const names = (t) => M.findMentions(t).map((m) => m.username);
check(same(names('hi @sam and @Raj_01'), ['sam', 'Raj_01']), 'names are found, case kept');
check(same(names('@first word'), ['first']), 'a mention at the very start');
check(same(names('mail me at a@b.com or sam@site.xyz'), []), 'an e-mail address is not a mention');
check(same(names('see https://x.com/@page and site.com/@me'), []), 'an @ inside a web address is not a mention');
check(same(names('(@sam) "@lee," @end.'), ['sam', 'lee', 'end']), 'brackets, quotes and punctuation around a name do not matter');
check(same(names('thanks @sam.'), ['sam']) && same(names('thanks @a.b.'), ['a.b']), 'a trailing dot is punctuation, an inner dot is part of the name');
check(same(names('@@x @ y @.. @_'), ['_']) || same(names('@@x @ y @.. @_'), []), 'lonely @, @@ and dots are not names');
check(same(names('#tag@x a#b @ok'), ['ok']), 'an @ right after a letter or # is not a mention');
check(names('@' + 'a'.repeat(40)).length === 1 && names('@' + 'a'.repeat(40))[0].length === 30, 'a name is at most 30 characters');
const t = 'go @sam now';
const f = M.findMentions(t);
check(f.length === 1 && t.slice(f[0].start, f[0].end) === '@sam', 'start/end cover "@name" exactly');

section('2. linkify draws @name as a button (rendered for real)');
const lout = path.resolve('node_modules/.cache-linkified-m.mjs');
buildSync({ entryPoints: [path.resolve('src/components/Common/Linkified.tsx')], bundle: true, format: 'esm', platform: 'node', outfile: lout, logLevel: 'error', external: ['react', 'react-dom'], jsx: 'automatic' });
const { linkify } = await import(pathToFileURL(lout).href);
const { renderToStaticMarkup } = await import('react-dom/server');
const React = (await import('react')).default;
const render = (txt, o) => renderToStaticMarkup(React.createElement('p', null, linkify(txt, o)));
const html = render('Hi @Sam, #robots, mail a@b.com, site.com/@x and www.a.com/@y #cad @lee.');
check((html.match(/data-testid="noob-mention"/g) || []).length === 2 && /data-username="sam"/.test(html) && /data-username="lee"/.test(html), 'two mentions became buttons (@Sam, @lee)');
check((html.match(/data-testid="noob-hashtag"/g) || []).length === 2, 'hashtags still work next to mentions');
check(/>@Sam<\/button>,/.test(html) && /@lee<\/button>\./.test(html), 'the text of the button is exactly "@name", punctuation stays outside');
check(!/data-username="b"/.test(html) && !/data-username="x"/.test(html) && !/data-username="y"/.test(html), 'e-mail addresses and web addresses give no mention');
check(!/noob-mention/.test(render('hi @sam', { mentions: false })), 'linkify(text, { mentions: false }) leaves @names alone (used by the chat)');
check(render('plain text') === '<p>plain text</p>', 'plain text is untouched');

section('3. Wiring');
const app = read('src/App.tsx'), links = read('src/utils/inAppLinks.ts'), api = read('src/services/supabaseApi.ts'), chat = read('src/components/Chat/ChatView.tsx');
check(/setMentionHandler\(openMentionProfile\)/.test(app) && /No such user/.test(app) && /fetchUserByUsername\(name\)/.test(app) && /handleNavigateToUserProfile\(user\)/.test(app), 'App: opener registered, opens the profile, says "No such user"');
check(/export function openMention/.test(links) && /export function setMentionHandler/.test(links), 'inAppLinks: opener');
check(/export async function fetchUserByUsername/.test(api) && /=== name/.test(api), 'API: exact username lookup');
check(/linkify\(text, \{ mentions: false \}\)/.test(chat), 'ChatView keeps its own member mentions');

section('4. Timed mute (SQL text + client)');
const sql = read('supabase/migrations/20261112000005_chat_mute_until.sql'), mapi = read('src/services/chatMuteApi.ts');
check(/create table if not exists public\.chat_mute_until/.test(sql) && /enable row level security/.test(sql) && !/create policy/i.test(sql), 'SQL: new table, RLS on, no policies');
check(!/drop table|drop column|alter table public\.(?!chat_mute_until)|delete from public\.chat_members|truncate/i.test(sql), 'SQL: additive, touches no existing table definition');
check(/is_chat_member\(p_chat\)/.test(sql) && /where chat_id = p_chat and user_id = me/.test(sql), 'SQL: member check, own row only');
check(/t\.user_id = me/.test(sql) && /cron\.unschedule\('noob-expire-chat-mutes'\)/.test(sql) && /extname = 'pg_cron'/.test(sql) && /raise notice/.test(sql), 'SQL: expiry only for the caller, cron guarded and re-runnable');
check(/rpc\('set_chat_muted_for'/.test(mapi) && /rpc\('set_chat_muted', /.test(mapi) && /muteExpired/.test(mapi), 'client: new function with fallback to the plain one');
const A = path.resolve('node_modules/.cache-mutes.mjs');
await build({ entryPoints: [path.resolve('src/services/chatMuteApi.ts')], bundle: true, format: 'esm', platform: 'node', outfile: A, logLevel: 'error', plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /\/supabase$/ }, () => ({ path: 'stub', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const supabase = {};', loader: 'js' })); } }] });
const C = await import(pathToFileURL(A).href);
const now = Date.parse('2026-11-12T10:00:00Z');
check(C.muteExpired('2026-11-12T09:00:00Z', now) && !C.muteExpired('2026-11-12T11:00:00Z', now) && !C.muteExpired(null, now), 'an end time in the past counts as unmuted; none = always');
check(/^Muted until /.test(C.muteUntilLabel('2026-11-20T11:00:00Z')) && C.muteUntilLabel(null) === 'Muted', 'label');

console.log(`
${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
