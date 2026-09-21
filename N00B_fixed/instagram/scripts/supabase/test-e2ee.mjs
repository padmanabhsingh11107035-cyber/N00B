// Tests the end-to-end encryption maths (src/e2ee/crypto.ts) with the real WebCrypto: keys, locking and opening messages for several
// devices and people, everything an attacker (or the server) might try (changing a message, moving it to another chat, pretending to be
// somebody else, reading it without a key), the security codes, and the passphrase backup of a device's keys.
//
// Usage: node scripts/supabase/test-e2ee.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const C = await import(pathToFileURL(path.resolve('src/e2ee/crypto.ts')).href);
const fails = async (fn, code) => { try { await fn(); return false; } catch (e) { return code ? e.code === code : true; } };

const alice = await C.generateDeviceKey('Alice phone');
const alice2 = await C.generateDeviceKey('Alice laptop');
const bob = await C.generateDeviceKey('Bob phone');
const carol = await C.generateDeviceKey('Carol phone');
const mallory = await C.generateDeviceKey('Mallory');
const rec = (...ks) => ks.map((k) => ({ kid: k.kid, publicJwk: k.publicJwk }));
const directory = (...ks) => async (kid) => ks.find((k) => k.kid === kid)?.publicJwk ?? null;
const CHAT = '11111111-1111-1111-1111-111111111111';

section('1. Device keys');
check(/^[0-9a-f]{16}$/.test(alice.kid) && alice.kid === (await C.kidOf(alice.publicJwk)), 'a key\'s short id is made from its public key');
check(new Set([alice.kid, alice2.kid, bob.kid, carol.kid, mallory.kid]).size === 5, 'every key is different');
check(C.isPublicJwk(alice.publicJwk) && !('d' in alice.publicJwk) && typeof alice.privateJwk.d === 'string', 'the public half carries no secret; the private half does');
check(!C.isPublicJwk(null) && !C.isPublicJwk({}) && !C.isPublicJwk({ ...alice.publicJwk, crv: 'P-384' }) && !C.isPublicJwk({ ...alice.publicJwk, x: 'short' }) && !C.isPublicJwk({ ...alice.publicJwk, kty: 'RSA' }), 'a made-up or wrong-type public key is refused');

section('2. Locking and opening');
const text = 'Meet me at 6? 😀 नमस्ते — "quotes" & <tags>';
const env = await C.seal(text, { chatId: CHAT, sender: alice, recipients: rec(alice, alice2, bob) });
const ringOf = (...ks) => ks;
const openAs = (k, e = env, chat = CHAT, dir = directory(alice, alice2, bob, carol, mallory)) => C.open(e, { chatId: chat, ring: ringOf(k), senderPublic: dir });
check(await openAs(bob) === text, 'the recipient opens it (any text, emoji, other scripts)');
check(await openAs(alice) === text && await openAs(alice2) === text, 'the sender\'s own devices open it too (both of them)');
check(env.v === 1 && env.skid === alice.kid && Object.keys(env.keys).sort().join() === [alice.kid, alice2.kid, bob.kid].sort().join(), 'the envelope names the sender\'s key and holds one locked key per device');
const json = JSON.stringify(env);
check(!json.includes('Meet me') && !json.includes('नमस्ते') && !json.includes(alice.privateJwk.d) && !json.includes(bob.privateJwk.d), 'the locked message contains neither the text nor any private key');
const env2 = await C.seal(text, { chatId: CHAT, sender: alice, recipients: rec(alice, bob) });
check(env2.ct !== env.ct && env2.iv !== env.iv && env2.epk.x !== env.epk.x && env2.keys[bob.kid].w !== env.keys[bob.kid].w, 'the same text locked twice looks completely different each time');
const big = 'x'.repeat(50_000) + '😀';
check(await C.open(await C.seal(big, { chatId: CHAT, sender: alice, recipients: rec(alice, bob) }), { chatId: CHAT, ring: [bob], senderPublic: directory(alice) }) === big, 'a very long message works');
check(await C.open(await C.seal('', { chatId: CHAT, sender: alice, recipients: rec(alice, bob) }), { chatId: CHAT, ring: [bob], senderPublic: directory(alice) }) === '', 'an empty text works');

section('3. People who must NOT be able to read it');
check(await fails(() => openAs(carol), 'no-key'), 'somebody who is not a recipient has no key for it');
check(await fails(() => openAs(mallory), 'no-key'), '...neither does an attacker');
const stolenWrap = { ...env, keys: { ...env.keys, [carol.kid]: env.keys[bob.kid] } };
check(await fails(() => openAs(carol, stolenWrap), 'damaged'), 'a locked key copied for somebody else does not open for them');
check(await fails(() => openAs(bob, env, '22222222-2222-2222-2222-222222222222'), 'damaged'), 'the message moved into ANOTHER chat does not open');

section('4. Changing or forging a message');
const flip = (s) => (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
check(await fails(() => openAs(bob, { ...env, ct: flip(env.ct) }), 'damaged'), 'a changed message does not open');
check(await fails(() => openAs(bob, { ...env, iv: flip(env.iv) }), 'damaged'), 'a changed nonce does not open');
check(await fails(() => openAs(bob, { ...env, keys: { ...env.keys, [bob.kid]: { ...env.keys[bob.kid], w: flip(env.keys[bob.kid].w) } } }), 'damaged'), 'a changed locked key does not open');
check(await fails(() => openAs(bob, { ...env, epk: env2.epk }), 'damaged'), 'a swapped throw-away key does not open');
const fake = await C.seal('Send me your password', { chatId: CHAT, sender: mallory, recipients: rec(mallory, bob) });
check(await openAs(bob, fake) === 'Send me your password', '(a message really from Mallory opens, as her own)');
const forged = { ...fake, skid: alice.kid };
check(await fails(() => openAs(bob, forged), 'damaged'), 'Mallory can NOT make a message look like it is from Alice (it fails to open)');
check(await fails(() => C.open(fake, { chatId: CHAT, ring: [bob], senderPublic: async () => alice.publicJwk }), 'unverified-sender') || await fails(() => C.open(fake, { chatId: CHAT, ring: [bob], senderPublic: async () => alice.publicJwk }), 'damaged'), 'a server that hands out Alice\'s key for Mallory\'s message gets nowhere');
check(await fails(() => C.open(env, { chatId: CHAT, ring: [bob], senderPublic: async () => null }), 'unverified-sender'), 'when the sender\'s key can not be found, the message is not opened');
check(await fails(() => C.open(env, { chatId: CHAT, ring: [bob], senderPublic: async () => mallory.publicJwk }), 'unverified-sender'), 'a key that does not match the sender\'s key id is refused');
check(await fails(() => C.open(null, { chatId: CHAT, ring: [bob], senderPublic: directory(alice) }), 'damaged') && await fails(() => C.open({ v: 2 }, { chatId: CHAT, ring: [bob], senderPublic: directory(alice) }), 'damaged') && await fails(() => C.open({ ...env, keys: [] }, { chatId: CHAT, ring: [bob], senderPublic: directory(alice) }), 'damaged'), 'rubbish instead of an envelope is refused, not crashed on');

section('5. Bad requests to lock a message');
check(await fails(() => C.seal('x', { chatId: CHAT, sender: alice, recipients: [] }), 'bad-input'), 'nobody to lock it for: refused');
check(await fails(() => C.seal('x', { chatId: CHAT, sender: alice, recipients: rec(bob) }), 'bad-input'), 'the sender must be able to read their own message: refused otherwise');
check(await fails(() => C.seal('x', { chatId: CHAT, sender: alice, recipients: [...rec(alice), { kid: bob.kid, publicJwk: carol.publicJwk }] }), 'bad-input'), 'a public key that does not match its id is refused');
const dup = await C.seal('x', { chatId: CHAT, sender: alice, recipients: [...rec(alice, bob), ...rec(bob)] });
check(Object.keys(dup.keys).length === 2, 'the same device listed twice is locked for once');
const group = [alice, ...await Promise.all(Array.from({ length: 60 }, () => C.generateDeviceKey()))];
const t0 = Date.now();
const gEnv = await C.seal('hello group', { chatId: CHAT, sender: alice, recipients: rec(...group) });
check(Object.keys(gEnv.keys).length === 61 && JSON.stringify(gEnv).length < 60000 && await C.open(gEnv, { chatId: CHAT, ring: [group[42]], senderPublic: directory(alice) }) === 'hello group', `a group of 61 devices: ${JSON.stringify(gEnv).length} bytes, opens for any member (${Date.now() - t0} ms)`);
check(await fails(() => C.seal('x', { chatId: CHAT, sender: alice, recipients: rec(alice, ...Array.from({ length: 205 }, () => bob)) }), 'bad-input') === false, '(repeats of one device are not counted as many)');

section('6. Security codes');
const code = await C.securityCode([alice.kid, alice2.kid], [bob.kid]);
check(/^(\d{5} ){11}\d{5}$/.test(code), 'twelve groups of five digits: ' + code);
check(code === await C.securityCode([bob.kid], [alice2.kid, alice.kid]), 'both people see the same number, whatever the order');
check(code !== await C.securityCode([alice.kid, alice2.kid], [carol.kid]) && code !== await C.securityCode([alice.kid], [bob.kid]), 'the number changes when anybody\'s keys change');
check(await C.keySetFingerprint([bob.kid, alice.kid]) === await C.keySetFingerprint([alice.kid, bob.kid]) && await C.keySetFingerprint([bob.kid]) !== await C.keySetFingerprint([bob.kid, carol.kid]), 'a person\'s set of keys has a fingerprint, so "their keys changed" can be noticed');

section('7. The passphrase backup');
const good = 'correct horse battery staple';
check(C.passphraseProblem(good) === null && C.passphraseProblem('short') !== null && C.passphraseProblem('aaaaaaaaaaaa') !== null && C.passphraseProblem('1234567890') !== null && C.passphraseProblem('12345678901') !== null && C.passphraseProblem('Password123') !== null, 'weak passphrases are refused (too short, repeated, digits only, well known)');
const ring = [alice, alice2];
const t1 = Date.now();
const backup = await C.makeBackup(ring, good, 100_000);
check(C.isBackup(backup) && !JSON.stringify(backup).includes(alice.privateJwk.d) && !JSON.stringify(backup).includes('Alice'), 'the backup holds no readable key or name');
const back = await C.readBackup(backup, good);
check(back.length === 2 && back[0].kid === alice.kid && back[1].privateJwk.d === alice2.privateJwk.d, `the right passphrase gives every key back (${Date.now() - t1} ms)`);
const restoredOpens = await C.open(env, { chatId: CHAT, ring: [back[1]], senderPublic: directory(alice) });
check(restoredOpens === text, 'a restored key opens old messages');
check(await fails(() => C.readBackup(backup, 'correct horse battery stapl'), 'damaged') && await fails(() => C.readBackup(backup, ''), 'damaged'), 'a wrong passphrase gives nothing');
check(await fails(() => C.readBackup({ ...backup, ct: flip(backup.ct) }, good), 'damaged') && await fails(() => C.readBackup({ ...backup, iterations: 1 }, good), 'damaged') && await fails(() => C.readBackup(null, good), 'damaged'), 'a damaged or silly backup is refused');
check(await fails(() => C.makeBackup(ring, 'weak', 100_000), 'bad-input'), 'a backup can not be made with a weak passphrase');
const b2 = await C.makeBackup(ring, good, 100_000);
check(b2.salt !== backup.salt && b2.iv !== backup.iv && b2.ct !== backup.ct, 'two backups of the same keys look different');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
