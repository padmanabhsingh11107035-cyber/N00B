// Tests the locking of chat pictures, videos and voice notes (src/e2ee/media.ts) with the real WebCrypto, and how the chat glue (src/e2ee/messages.ts +
// service.ts payloads) sends and opens them: round trips at every chunk boundary, every kind of tampering, wrong keys, that the key never appears in what is
// stored, that a locked chat never sends a readable file, and that old plain media messages still come back as before.
//
// Usage: node scripts/supabase/test-e2ee-media.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const load = (p) => import(pathToFileURL(path.resolve(p)).href);
const MEDIA = await load('src/e2ee/media.ts');
const C = await load('src/e2ee/crypto.ts');
const E = await load('src/e2ee/service.ts');
const M = await load('src/e2ee/messages.ts');
const fails = async (fn, code) => { try { await fn(); return false; } catch (e) { return code ? e.code === code : true; } };
const bytesOf = async (blob) => new Uint8Array(await blob.arrayBuffer());
const same = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
const rand = (n) => { const u = new Uint8Array(n); for (let i = 0; i < n; i += 65536) crypto.getRandomValues(u.subarray(i, Math.min(n, i + 65536))); return u; };
const CS = MEDIA.SEAL_CHUNK;
const T = MEDIA.SEAL_TAG;

section('1. Round trips at every chunk boundary');
for (const [label, n] of [['an empty file', 0], ['1 byte', 1], ['one chunk minus 1', CS - 1], ['exactly one chunk', CS], ['one chunk + 1 byte', CS + 1], ['exactly two chunks', 2 * CS], ['two chunks + 1', 2 * CS + 1], ['5 MB of random bytes', 5 * 1024 * 1024]]) {
  const plain = rand(n);
  const { blob, desc } = await MEDIA.sealBlob(new Blob([plain], { type: 'image/jpeg' }), { dur: undefined });
  const stored = await bytesOf(blob);
  const opened = await MEDIA.openBlob(blob, desc);
  check(blob.size === MEDIA.sealedSize(n) && blob.size === n + T * Math.max(1, Math.ceil(n / CS)), `${label}: stored size is size + 16 per chunk`);
  check(same(await bytesOf(opened), plain) && opened.type === 'image/jpeg', `${label}: opens to exactly the same bytes and type`);
  if (n >= 64) check(Buffer.from(stored).indexOf(Buffer.from(plain.subarray(0, 64))) === -1, `${label}: the original bytes do not appear in the stored file`);
}

section('2. The key, nonces and what is stored');
const plain = rand(3 * CS + 123);
const a = await MEDIA.sealBlob(new Blob([plain], { type: 'video/mp4' }));
const b = await MEDIA.sealBlob(new Blob([plain], { type: 'video/mp4' }));
const stA = await bytesOf(a.blob), stB = await bytesOf(b.blob);
check(a.desc.k !== b.desc.k && a.desc.iv !== b.desc.iv, 'two files (even identical ones) get different keys and nonces');
check(!same(stA, stB), 'the same file locked twice looks completely different');
check(Buffer.from(stA).indexOf(Buffer.from(C.unb64(a.desc.k))) === -1 && Buffer.from(stA).indexOf(Buffer.from(C.unb64(a.desc.iv))) === -1, 'neither the key nor the nonce prefix appears in the stored file');
check(a.blob.type === 'application/octet-stream', 'the stored file is an opaque blob (no picture / video type)');
check(C.unb64(a.desc.k).length === 32 && C.unb64(a.desc.iv).length === 8 && a.desc.cs === CS && a.desc.sz === plain.length && a.desc.ct === 'video/mp4' && a.desc.v === 1, 'descriptor: 256-bit key, 64-bit nonce prefix, chunk size, size, original type');
check(a.desc.k !== undefined && !JSON.stringify(a.desc).includes('data:'), 'descriptor carries no file content');

section('3. Tampering, truncation, wrong key');
const flipAt = async (st, desc, pos) => { const c = st.slice(); c[pos] ^= 1; return MEDIA.openBlob(new Blob([c]), desc); };
check(await fails(() => flipAt(stA, a.desc, 0), 'damaged'), 'a changed bit in the first chunk is caught');
check(await fails(() => flipAt(stA, a.desc, CS + 5000), 'damaged'), 'a changed bit in a middle chunk is caught');
check(await fails(() => flipAt(stA, a.desc, stA.length - 1), 'damaged'), 'a changed bit in the last tag is caught');
const chunkLen = CS + T;
const piece = (st, i) => st.slice(i * chunkLen, Math.min(st.length, (i + 1) * chunkLen));
const join = (...ps) => new Blob(ps);
check(await fails(() => MEDIA.openBlob(join(piece(stA, 1), piece(stA, 0), piece(stA, 2), piece(stA, 3)), a.desc), 'damaged'), 'two chunks swapped (reordered) are caught');
check(await fails(() => MEDIA.openBlob(join(piece(stA, 0), piece(stA, 0), piece(stA, 2), piece(stA, 3)), a.desc), 'damaged'), 'a chunk repeated in place of another is caught');
check(await fails(() => MEDIA.openBlob(join(piece(stA, 0), piece(stA, 1), piece(stA, 2)), a.desc), 'damaged'), 'a dropped last chunk (truncation) is caught');
check(await fails(() => MEDIA.openBlob(join(stA, new Uint8Array(16)), a.desc), 'damaged'), 'extra bytes at the end are caught');
check(await fails(() => MEDIA.openBlob(new Blob([stA.slice(0, stA.length - 1)]), a.desc), 'damaged'), 'a file cut by one byte is caught');
check(await fails(() => MEDIA.openBlob(a.blob, { ...a.desc, sz: a.desc.sz - 1 }), 'damaged'), 'a wrong total length in the descriptor is caught');
check(await fails(() => MEDIA.openBlob(a.blob, { ...a.desc, k: b.desc.k }), 'damaged'), 'a wrong key fails');
check(await fails(() => MEDIA.openBlob(a.blob, { ...a.desc, iv: b.desc.iv }), 'damaged'), 'a wrong nonce prefix fails');
check(await fails(() => MEDIA.openBlob(b.blob, a.desc), 'damaged'), 'the right descriptor of ANOTHER file fails');
check(await fails(() => MEDIA.openBlob(a.blob, { ...a.desc, k: 'AAAA' }), 'bad-input'), 'a malformed key in the descriptor is refused');
check(await fails(() => MEDIA.sealBlob(new Blob(['<svg onload=1>'], { type: 'image/svg+xml' })), 'bad-input') && await fails(() => MEDIA.sealBlob(new Blob(['x'], { type: 'application/zip' })), 'bad-input'), 'only picture / video / audio types can be locked (not svg, not a zip)');
const empty = await MEDIA.sealBlob(new Blob([], { type: 'audio/webm' }));
check(await fails(() => MEDIA.openBlob(new Blob([]), empty.desc), 'damaged'), 'an empty file where a locked one should be is caught');

section('4. Descriptor and payload');
const d = await MEDIA.sealBlob(new Blob([rand(100)], { type: 'audio/webm' }), { dur: '0:07' });
check(d.desc.dur === '0:07' && MEDIA.parseDescriptor(JSON.parse(JSON.stringify(d.desc)))?.k === d.desc.k, 'descriptor survives JSON and keeps the voice-note length');
check(MEDIA.parseDescriptor(null) === null && MEDIA.parseDescriptor({}) === null && MEDIA.parseDescriptor({ ...d.desc, sz: -1 }) === null && MEDIA.parseDescriptor({ ...d.desc, sz: 1e12 }) === null && MEDIA.parseDescriptor({ ...d.desc, cs: 10 }) === null && MEDIA.parseDescriptor({ ...d.desc, ct: 'text/html' }) === null && MEDIA.parseDescriptor({ ...d.desc, v: 2 }) === null, 'made-up or dangerous descriptors are refused');
check(MEDIA.isSealedKey('chat/1700-abc.sealed') && !MEDIA.isSealedKey('chat/../x.sealed') && !MEDIA.isSealedKey('posts/1.sealed') && !MEDIA.isSealedKey('chat/a.jpg') && !MEDIA.isSealedKey('https://x/y.sealed'), 'only chat/<name>.sealed counts as a locked file name');
const pl = { t: '', m: 'chat/1-a.sealed', mt: 'audio', s: d.desc };
const back = E.decodePayload(E.encodePayload(pl));
check(back.m === pl.m && back.mt === 'audio' && back.s.k === d.desc.k, 'a payload with a locked file round-trips');
check(E.decodePayload(JSON.stringify({ t: 'x', m: 'chat/1-a.sealed', mt: 'image', s: { ...d.desc, k: 'bad' } })).m === undefined, 'a payload with a broken descriptor shows no attachment');
check(E.decodePayload(JSON.stringify({ t: 'x', m: 'posts/photo.jpg', mt: 'image', s: d.desc })).s === undefined, 'a descriptor pointing outside chat/*.sealed is ignored');
check(E.decodePayload(JSON.stringify({ t: 'hi' })).t === 'hi' && E.decodePayload(E.encodePayload({ t: 'g', m: 'https://x.test/a.gif', mt: 'image' })).m === 'https://x.test/a.gif', 'text and GIF payloads are unchanged');
check(E.decodePayload('just text').t === 'just text', 'a payload that is not JSON is still plain text');

section('5. Sending and opening through the chat glue (real locking of the message, fake server)');
const CHAT = '33333333-3333-3333-3333-333333333333';
const alice = await C.generateDeviceKey('Alice'), bob = await C.generateDeviceKey('Bob');
const rec = (...ks) => ks.map((k) => ({ kid: k.kid, publicJwk: k.publicJwk }));
const dir = async (kid) => [alice, bob].find((k) => k.kid === kid)?.publicJwk ?? null;
const cache = new Map();
const state = { info: { encryptable: true, mustLock: false, reason: 'ok', isGroup: false, missing: [], members: [] } };
const svc = (me, ring) => ({
  async chatCryptoForSend() { if (state.fail) throw new Error('offline'); return state.info; },
  async encrypt(chatId, payload) { const env = await C.seal(E.encodePayload(payload), { chatId, sender: me, recipients: rec(alice, bob) }); cache.set(JSON.stringify(env), payload); return env; },
  async open(chatId, id, sender, env) { try { return { ok: true, payload: E.decodePayload(await C.open(env, { chatId, ring: [ring], senderPublic: dir })) }; } catch (e) { return { ok: false, code: e.code || 'damaged' }; } },
  payloadOf(id) { return null; }
});
const sender = M.bindMessages(svc(alice, alice));
const receiver = M.bindMessages(svc(alice, bob));
const KEY = 'chat/1700000000000-abc1234.sealed';
const photo = rand(20000);
const sealedPhoto = await MEDIA.sealBlob(new Blob([photo], { type: 'image/jpeg' }), { w: 640, h: 480 });
const sent = await sender.prepareSend(CHAT, { sealed: { key: KEY, desc: sealedPhoto.desc }, mediaType: 'image' });
const wire = JSON.stringify(sent);
check(sent && sent.e2ee && !wire.includes(KEY) && !wire.includes(sealedPhoto.desc.k) && !wire.includes('image/jpeg') && !('mediaUrl' in sent), 'what goes to the server holds neither the file key, the file name nor its type (only the locked envelope)');
const asRow = { id: 'm1', chatId: CHAT, senderId: 'u-alice', e2ee: sent.e2ee, createdAt: new Date().toISOString() };
const got = await receiver.unlockOne(CHAT, asRow);
check(got.encrypted && got.sealed?.key === KEY && got.mediaType === 'image' && !got.mediaUrl && !got.locked && got.text === '', 'the receiver gets a message with a locked attachment (no readable address)');
check(same(await bytesOf(await MEDIA.openBlob(sealedPhoto.blob, got.sealed.desc)), photo), '...and the descriptor in it opens the stored file');
const voice = await MEDIA.sealBlob(new Blob([rand(5000)], { type: 'audio/webm' }), { dur: '0:09' });
const vSent = await sender.prepareSend(CHAT, { sealed: { key: 'chat/2-v.sealed', desc: voice.desc }, mediaType: 'audio', audioDuration: '0:09' });
const vGot = await receiver.unlockOne(CHAT, { id: 'm2', chatId: CHAT, senderId: 'u-alice', e2ee: vSent.e2ee });
check(vGot.mediaType === 'audio' && vGot.audioDuration === '0:09' && vGot.sealed?.desc.ct === 'audio/webm', 'a voice note keeps its type and its length');
const tampered = { ...sent.e2ee, ct: (sent.e2ee.ct[0] === 'A' ? 'B' : 'A') + sent.e2ee.ct.slice(1) };
const bad = await receiver.unlockOne(CHAT, { id: 'm3', chatId: CHAT, senderId: 'u-alice', e2ee: tampered });
check(bad.locked && !bad.sealed, 'a changed locked message shows as locked, with no attachment');
check(M.quoteOf(got) === 'Photo' && M.quoteOf(vGot) === 'Voice message' && M.sealedLabel('video') === 'Video', 'quotes and labels say Photo / Video / Voice message, never the content');

section('6. A locked chat never sends a readable file');
await sender.prepareSend(CHAT, { storedMedia: 'chat/1-plain.jpg', mediaType: 'image' }).then(() => check(false, 'a readable stored photo in a locked chat is refused'), (e) => check(/locked first/.test(e.message), 'a readable stored photo in a locked chat is refused'));
await sender.prepareSend(CHAT, { storedMedia: 'chat/1-v.webm', mediaType: 'audio', audioDuration: '0:03' }).then(() => check(false, 'a readable voice note in a locked chat is refused'), (e) => check(/locked first/.test(e.message), 'a readable voice note in a locked chat is refused'));
await sender.prepareSend(CHAT, { sealed: { key: 'posts/x.jpg', desc: sealedPhoto.desc }, mediaType: 'image' }).then(() => check(false, 'a locked file with a wrong name is refused'), () => check(true, 'a locked file with a wrong name is refused'));
await sender.prepareSend(CHAT, { sealed: { key: KEY, desc: { ...sealedPhoto.desc, k: 'x' } }, mediaType: 'image' }).then(() => check(false, 'a broken descriptor is refused'), () => check(true, 'a broken descriptor is refused'));
state.fail = true;
await sender.prepareSend(CHAT, { sealed: { key: KEY, desc: sealedPhoto.desc }, mediaType: 'image' }).then(() => check(false, 'if the chat can not be checked the attachment fails'), (e) => check(/Could not check/.test(e.message), 'if the chat can not be checked the attachment fails'));
state.fail = false;
state.info = { ...state.info, encryptable: false, mustLock: true };
await sender.prepareSend(CHAT, { storedMedia: 'chat/1-plain.jpg', mediaType: 'image' }).then(() => check(false, 'a device that can not keep keys refuses plain media'), () => check(true, 'a device that can not keep keys refuses plain media'));
state.info = { ...state.info, encryptable: false, mustLock: false, reason: 'public' };
check((await sender.prepareSend(CHAT, { storedMedia: 'chat/1-plain.jpg', mediaType: 'image' })) === null && (await sender.prepareSend(CHAT, { storedMedia: 'chat/1-v.webm', mediaType: 'audio', audioDuration: '0:03' })) === null, 'a chat that is not locked (public Lounge) sends media exactly as before');
await sender.prepareSend(CHAT, { sealed: { key: KEY, desc: sealedPhoto.desc }, mediaType: 'image' }).then(() => check(false, 'a locked file is never sent readable if the chat stopped being lockable'), (e) => check(/no longer be locked/.test(e.message), 'a locked file is never sent readable if the chat stopped being lockable'));
state.info = { ...state.info, encryptable: true, reason: 'ok' };
check((await sender.prepareSend(CHAT, { storedMedia: 'stickers/s1.png', mediaType: 'sticker' })) === null, 'a custom sticker file (a public sticker, not a chat attachment) goes as before');
check((await sender.prepareSend(CHAT, { storedMedia: 'https://media.giphy.com/media/abc/giphy.gif', mediaType: 'image' }))?.e2ee, 'a GIF link is still locked as before');
check((await sender.prepareSend(CHAT, { text: 'hello' }))?.e2ee, 'text is still locked as before');

section('7. Old messages');
const oldPlain = { id: 'o1', chatId: CHAT, senderId: 'u-bob', text: 'look', mediaUrl: 'https://x.test/p/photo.jpg', mediaType: 'image' };
check((await receiver.unlockOne(CHAT, oldPlain)) === oldPlain, 'an old plain (unlocked) photo message comes back untouched');
const oldGif = await sender.prepareSend(CHAT, { storedMedia: 'https://media.giphy.com/a.gif', mediaType: 'image' });
const gifBack = await receiver.unlockOne(CHAT, { id: 'o2', chatId: CHAT, senderId: 'u-alice', e2ee: oldGif.e2ee });
check(gifBack.mediaUrl === 'https://media.giphy.com/a.gif' && !gifBack.sealed, 'an old locked GIF message still opens as a normal picture');
const edited = await (async () => { const s = svc(alice, alice); const before = { t: '', m: KEY, mt: 'image', s: sealedPhoto.desc }; s.payloadOf = () => before; let got; s.encrypt = async (c, p) => { got = p; return {}; }; await M.bindMessages(s).prepareEdit(CHAT, 'm1', 'caption'); return got; })();
check(edited.s?.k === sealedPhoto.desc.k && edited.m === KEY && edited.t === 'caption', 'editing the caption of a locked attachment keeps the attachment');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
