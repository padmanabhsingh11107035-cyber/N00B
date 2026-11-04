// The text compressor (src/utils/textPack.ts) must be lossless in every case, never make text bigger, and read old unpacked text unchanged.
// It is also used inside src/e2ee/crypto.ts. Usage: node --liftoff-only scripts/supabase/test-text-pack.mjs
import fs from 'node:fs';
const { packText, unpackText, packBytes, unpackBytes, isPacked } = await import('../../src/utils/textPack.ts');
let passed = 0, failed = 0;
const check = (c, l) => { if (c) { passed++; console.log(`  ok   ${l}`); } else { failed++; console.log(`  FAIL ${l}`); } };
const te = new TextEncoder();
const same = (s) => unpackText(packText(s)) === s;

console.log('\n1. Nothing is ever lost');
const samples = ['', ' ', 'a', 'ok', 'x'.repeat(47), 'x'.repeat(48), 'x'.repeat(49), 'hello world '.repeat(200), 'नमस्ते दोस्तों, आप कैसे हैं? '.repeat(40), 'こんにちは世界 '.repeat(60), '😀👍🏽🧑‍🧑‍🧒‍🧒 '.repeat(50), 'line one\nline two\r\nline three\t\ttabbed\n'.repeat(30), '{"a":1,"b":[1,2,3],"c":"text"}'.repeat(40), '\u0001NP1 looks like the mark but is plain text, long enough to be tried '.repeat(5), 'a\u0000b\u0000c'.repeat(40)];
samples.push('NP1', 'NP1 short', 'NP0 stored lookalike', 'NP1' + 'z'.repeat(100));
check(samples.every(same), 'text in many languages, emoji, line breaks, NUL, and text that begins like the packed mark comes back exactly');
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const alphabet = 'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJ .,!?\n😊é中あ।नम';
let fuzzOk = true;
for (let i = 0; i < 400; i++) { let s = ''; const n = Math.floor(rnd() * 600); for (let k = 0; k < n; k++) s += [...alphabet][Math.floor(rnd() * [...alphabet].length)]; if (!same(s)) { fuzzOk = false; break; } }
check(fuzzOk, '400 random texts of up to 600 characters all come back exactly');
let rawOk = true;
for (let i = 0; i < 200; i++) { const b = new Uint8Array(Math.floor(rnd() * 400)); for (let k = 0; k < b.length; k++) b[k] = Math.floor(rnd() * 256); const back = unpackBytes(packBytes(b)); if (back.length !== b.length || back.some((v, k) => v !== b[k])) { rawOk = false; break; } }
check(rawOk, '200 random byte strings (even ones that are not text) come back exactly');

console.log('\n2. Never bigger');
check(samples.every((s) => packText(s).length <= te.encode(s).length + (s.startsWith('NP') ? 4 : 0)), 'the stored form is never bigger than the plain text (text that itself begins with the mark gets 4 bytes, so it can never be mistaken for packed data)');
check(!isPacked(packText('hi there')) && !isPacked(packText('x'.repeat(47))), 'short text is left as it is');

console.log('\n3. It really shrinks');
const chat = 'Hello bhai, kya haal hai? Kal milte hain, thik hai? I am really happy that you are coming tomorrow, please bring the photos and the video from today, thanks a lot!';
const ratio = packText(chat).length / te.encode(chat).length;
check(ratio < 0.8, `a normal chat message gets ${Math.round((1 - ratio) * 100)}% smaller`);
const long = fs.readFileSync('src/components/Games/GamePlayModal.tsx', 'utf8').slice(0, 20000);
const lr = packText(long).length / te.encode(long).length;
check(lr < 0.4, `long text (20 000 characters of code) gets ${Math.round((1 - lr) * 100)}% smaller`);
const hi = 'नमस्ते दोस्तों, आज का दिन बहुत अच्छा है। हम सब मिलकर खेलेंगे और मज़े करेंगे। '.repeat(5);
check(packText(hi).length / te.encode(hi).length < 0.35, 'Hindi text shrinks a lot too');

console.log('\n4. Old text and damaged data');
check(unpackText(te.encode('an old message that was never packed')) === 'an old message that was never packed', 'text that was never packed is read as it is');
const good = packText(chat); const bad = good.slice(0, good.length - 6);
let threw = false; try { unpackText(bad); } catch { threw = true; }
check(isPacked(good) && threw, 'damaged packed data is refused (the lock around it fails closed) instead of giving wrong text');

console.log('\n5. Where it is used');
const crypto = fs.readFileSync('src/e2ee/crypto.ts', 'utf8');
check(/packText\(plaintext\)/.test(crypto) && /unpackText\(/.test(crypto) && /from '..\/utils\/textPack\.ts'/.test(crypto), 'messages are packed before they are locked and unpacked after they are opened');
const pk = fs.readFileSync('package.json', 'utf8');
check(/"pako"/.test(pk), 'its library (pako) is a declared dependency');
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
