// The safety net for Supabase's Cached Egress: any picture, video or song handed Supabase's own storage address is changed to the cached /m/ address before the browser asks.
// Usage: node scripts/supabase/test-media-guard.mjs
import fs from 'node:fs';
import { cachedFromDirect } from '../../src/utils/mediaGuard.ts';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8');

const P = 'https://abffssydapumuhwgzeck.supabase.co/storage/v1/object/public/media/';

section('1. The address change');
check(cachedFromDirect(P + 'posts/1-a.jpg', P, '') === '/m/posts/1-a.jpg', "Supabase's own address becomes /m/<key>");
check(cachedFromDirect(P + 'reels/x%20y.mp4?t=1#a', P, 'https://noobsocials.com') === 'https://noobsocials.com/m/reels/x%20y.mp4', 'the key keeps its own encoding, a query or fragment is dropped, and the app (Android) gets the full address');
check(cachedFromDirect('/m/posts/1-a.jpg', P, '') === '/m/posts/1-a.jpg' && cachedFromDirect('https://images.unsplash.com/a.jpg', P, '') === 'https://images.unsplash.com/a.jpg' && cachedFromDirect('blob:abc', P, '') === 'blob:abc' && cachedFromDirect('data:image/png;base64,AAAA', P, '') === 'data:image/png;base64,AAAA', 'every other address is left exactly as it is');
check(cachedFromDirect(P, P, '') === P && cachedFromDirect('x', '', '') === 'x' && cachedFromDirect(undefined, P, '') === undefined, 'nothing after the prefix, no prefix, or no value: untouched');
check(cachedFromDirect('https://abffssydapumuhwgzeck.supabase.co/storage/v1/object/public/other/a.jpg', P, '') === 'https://abffssydapumuhwgzeck.supabase.co/storage/v1/object/public/other/a.jpg', "another bucket is not NOOB's media: untouched");

section('2. Where it is installed');
const guard = read('src/utils/mediaGuard.ts'), main = read('src/main.tsx'), supa = read('src/services/supabase.ts'), sw = read('public/sw.js'), chat = read('src/components/Chat/ChatView.tsx');
check(/installMediaGuard\(rewriteDirectMedia\)/.test(main) && /export function rewriteDirectMedia/.test(supa) && /cachedFromDirect\(value, DIRECT_PREFIX, mediaOrigin\(\)\)/.test(supa), 'the app installs it first thing, with this site\'s own prefix (and the full address inside the Android app)');
check(/Element\.prototype\.setAttribute/.test(guard) && /HTMLImageElement/.test(guard) && /HTMLMediaElement/.test(guard) && /HTMLSourceElement/.test(guard) && /'poster'/.test(guard), 'pictures, videos, songs, sources and posters are covered (the attribute and the property)');
check(/DIRECT_MEDIA = /.test(sw) && /fetch\(self\.location\.origin \+ '\/m\/' \+ direct\[1\]/.test(sw) && /Range: range/.test(sw), 'the service worker is a second net (backgrounds in styles, anything else): the same file from /m/, the piece asked for passed on');
check(/document\.visibilityState !== 'visible'\) return;[^\n]*\n\s*const users = await fetchTypingUsers/.test(chat), 'a chat tab nobody is looking at no longer asks for "typing" every 1.5 seconds');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
