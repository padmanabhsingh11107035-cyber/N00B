// The phone's side of private chat media: services/authedMedia.ts (download with the sign-in token, memory-only cache, blob addresses) and where the app uses it.
// Usage: node scripts/supabase/test-chat-media-client.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

const M = await import(pathToFileURL(path.resolve('src/services/authedMedia.ts')).href);
const KEY = 'chat/1700000000001-aaaaaaa.jpg';

section('1. Which addresses are plain chat files');
check(M.chatMediaKeyOf(KEY) === KEY && M.chatMediaKeyOf(`/m/${KEY}`) === KEY && M.chatMediaKeyOf(`/media/${KEY}`) === KEY, 'a key, /m/<key> and /media/<key>');
check(M.chatMediaKeyOf(`https://noobsocials.com/m/${KEY}?v=1`) === KEY && M.chatMediaKeyOf(`https://abffssydapumuhwgzeck.supabase.co/storage/v1/object/public/media/${KEY}`) === KEY, 'a full address, with or without a query');
check(M.chatMediaKeyOf('chat/1700000000001-aaaaaaa.sealed') === null, 'a locked file is not handled here (it is ciphertext)');
check(['posts/1.jpg', 'https://i.giphy.com/media/x.gif', 'data:image/png;base64,AA', 'blob:abc', '', null, undefined, 'chat/../x', 'chat/a/b.jpg', 'stickers/chat/x.png'].every((v) => M.chatMediaKeyOf(v) === null), 'posts, GIF links, data/blob addresses, nothing and strange names are not chat files');

section('2. Downloading');
let calls = [];
let reply = () => new Response(new Blob(['hello']), { status: 200 });
let token = 'tok-1';
M.configureAuthedMedia({ token: async () => token, apikey: 'PUBLIC_KEY', origin: '', retryDelayMs: 1, fetchImpl: async (url, init) => { calls.push({ url: String(url), init }); return reply(url, init); } });
const made = [], revoked = [];
const realCreate = URL.createObjectURL, realRevoke = URL.revokeObjectURL;
URL.createObjectURL = (b) => { const u = realCreate(b); made.push(u); return u; };
URL.revokeObjectURL = (u) => { revoked.push(u); realRevoke(u); };

let u = await M.fetchChatMediaBlob(`/m/${KEY}`);
check(u.startsWith('blob:') && calls.length === 1, 'a chat file comes back as a blob address after one download');
check(calls[0].url === `/m/${KEY}` && calls[0].init.headers.Authorization === 'Bearer tok-1' && calls[0].init.headers.apikey === 'PUBLIC_KEY', "the download carries the person's sign-in token and the public key");
check(calls[0].init.cache === 'no-store' && calls[0].init.credentials === 'omit', 'the browser is told not to keep it and to send no cookies');
M.releaseChatMediaUrl(u);
check(revoked.includes(u), 'releasing the address revokes it');
const u2 = await M.fetchChatMediaBlob(KEY);
check(calls.length === 1 && u2 !== u, 'asked again: served from memory (no second download), with a new address');
M.releaseChatMediaUrl(u2);

section('3. Nothing public, ever');
M.clearChatMediaCache(); calls = [];
check(!M.hasChatMedia(KEY), 'signing out forgets the downloaded files');
token = null;
let err = await M.fetchChatMediaBlob(KEY).then(() => null, (e) => e);
check(err && err.status === 401 && calls.length === 0, 'with nobody signed in nothing is fetched at all');
token = 'tok-2'; reply = () => new Response('no', { status: 404 });
err = await M.fetchChatMediaBlob(KEY).then(() => null, (e) => e);
check(err && err.status === 404 && calls.length === 2, 'a "not found" is tried once more (a file sent a moment ago), then reported');
check(calls.every((c) => c.url === `/m/${KEY}` && !/supabase\.co|storage\/v1/.test(c.url)), 'and it is never fetched from any other address (no public fallback for chat/ files)');
calls = []; reply = () => new Response('no', { status: 401 });
err = await M.fetchChatMediaBlob(KEY).then(() => null, (e) => e);
check(err && err.status === 401 && calls.every((c) => c.url === `/m/${KEY}`), 'a refusal (401) is also only retried at the same private address');
calls = []; reply = () => { throw new Error('offline'); };
err = await M.fetchChatMediaBlob(KEY).then(() => null, (e) => e);
check(err && err.status === 0 && calls.length === 1, 'no connection: a readable error, not a crash');
err = await M.fetchChatMediaBlob('posts/1.jpg').then(() => null, (e) => e);
check(err && err.name === 'ChatMediaError', 'something that is not a chat file is refused by this helper (callers use the normal path for those)');

section('4. Memory only, and capped');
M.clearChatMediaCache(); calls = []; reply = () => new Response(new Blob(['x']), { status: 200 });
await Promise.all([M.fetchChatMediaBlob(KEY), M.fetchChatMediaBlob(KEY)]);
check(calls.length === 1, 'the same file asked twice at the same moment is downloaded once');
M.clearChatMediaCache();
M.rememberChatMedia('chat/1700000000002-bbbbbbb.mp4', new Blob([new Uint8Array(60 * 1024 * 1024)]));
M.rememberChatMedia('chat/1700000000003-ccccccc.mp4', new Blob([new Uint8Array(60 * 1024 * 1024)]));
check(M.chatMediaCacheStats().bytes <= M.CHAT_MEDIA_CACHE_BYTES && !M.hasChatMedia('chat/1700000000002-bbbbbbb.mp4') && M.hasChatMedia('chat/1700000000003-ccccccc.mp4'), 'the memory cache is capped; the oldest file goes first');
M.rememberChatMedia('posts/1.jpg', new Blob(['x']));
check(M.chatMediaCacheStats().files === 1, 'only chat files are remembered');
M.clearChatMediaCache();
check(M.chatMediaCacheStats().files === 0, 'cleared');
calls = []; reply = () => new Response(new Blob(['x']), { status: 200 });
const ctl = new AbortController(); ctl.abort();
err = await M.fetchChatMediaBlob(KEY, { signal: ctl.signal }).then(() => null, (e) => e);
check(err && err.name === 'AbortError' && calls.length === 0, 'a picture that already left the screen is not even downloaded');
URL.createObjectURL = realCreate; URL.revokeObjectURL = realRevoke;

section('5. Where the app uses it');
const view = read('src/components/Chat/ChatView.tsx'), comp = read('src/components/Chat/ChatMedia.tsx'), sup = read('src/services/supabase.ts'), api = read('src/services/supabaseApi.ts');
check(/<ChatMedia src=\{m\.mediaUrl\} kind="audio"/.test(view) && /<ChatMedia src=\{m\.mediaUrl\} kind="video"/.test(view) && /<ChatMedia src=\{m\.mediaUrl\} kind="image"/.test(view), 'ChatView shows chat voice notes, videos and pictures through ChatMedia');
check(!/<video[^>]*src=\{m\.mediaUrl\}/.test(view) && !/<audio[^>]*src=\{m\.mediaUrl\}/.test(view), 'no chat <video>/<audio> still points straight at the address');
check((view.match(/alt="GIF \/ Attachment"/g) || []).length === 1 && /chatMediaKeyOf\(m\.mediaUrl\) \? \(\s*<ChatMedia[^>]*kind="image"[^>]*\/>\s*\) : \(\s*<img/.test(view), 'the one plain <img> left is the GIF branch, reached only when the address is not a chat file (stickers are in the stickers/ folder)');
check(/mediaMayLoad\(cs\['chat\.autoLoad'\]\)/.test(view) && /media-tap-to-load/.test(view), 'the "tap to load / auto-load" setting still decides when a file is fetched');
check(/releaseChatMediaUrl\(made\)/.test(comp) && /abort\.abort\(\)/.test(comp) && /Loading\.\.\./.test(comp) && /Tap to try again/.test(comp), 'ChatMedia shows "Loading...", releases its address and stops the download when it leaves the screen, and can retry');
check(!/giphy|supabase\.co/.test(comp), 'ChatMedia has no public fallback address');
check(/clearChatMediaCache\(\)/.test(sup) && /SIGNED_OUT/.test(sup), 'signing out clears the downloaded files');
check(/configureAuthedMedia\(\{ token:/.test(api) && /rememberChatMedia\(uploaded\.objectKey, file\)/.test(view), 'the app gives the helper its token, and a file you just sent is shown from memory');
check(/VITE_CHAT_PRIVATE_BUCKET/.test(api) && /=== '1'/.test(api) && /folder === 'chat'/.test(api), 'new chat files go to the private bucket only when the build switch is 1 (default off)');

section('6. The service worker and the host rules');
const sw = read('public/sw.js'), headers = read('public/_headers');
const swMedia = sw.split('\n').filter((l) => /\/m\//.test(l) && /caches|cache\./.test(l));
check(swMedia.length === 0, 'no service-worker line both mentions /m/ and a cache');
check(!/^\s*\/m\//m.test(headers) && !/^\s*\/media\//m.test(headers), 'public/_headers has no cache rule for /m/ or /media/ (the Worker sets its own headers)');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
