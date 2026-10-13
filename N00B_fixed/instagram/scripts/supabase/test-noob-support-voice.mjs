// Tests how the NOOB AI support assistant speaks (src/utils/supportSpeech.ts and its use in the voice call): that no punctuation is ever read out aloud,
// that "NOOB" is a word and not four letters, that money and numbers are said the way a person says them, that the most human voice the phone has is
// chosen for each sentence's language, that the answer is said piece by piece with pauses, and that the microphone is off while the assistant speaks.
// Small stand-ins for the phone's voice and clock: no browser needed.
//
// Usage: node scripts/supabase/test-noob-support-voice.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const S = await import(pathToFileURL(path.resolve('src/utils/supportSpeech.ts')).href);

const say = (written) => S.splitForSpeech(S.prepareSpeech(written)).map((p) => p.text).join(' | ');
const marksIn = (s) => (s.match(/[.,;:!?]/g) || []).filter((_, i, a) => a.length > 0).length;
// a mark is allowed only INSIDE a number (3.5, 9:30)
const strayMarks = (s) => { const bad = []; for (let i = 0; i < s.length; i++) if ('.,;:!?'.includes(s[i]) && !(/\d/.test(s[i - 1] || '') && /\d/.test(s[i + 1] || ''))) bad.push(s[i]); return bad; };

section('1. The words: what a voice should say');
{
  const t = S.prepareSpeech('Hello **@asha_k**! Your order #42 costs ₹1,250, and NOOB works 24/7 🎮✨ (really).');
  check(t.includes('at asha k') && !t.includes('@') && !t.includes('_'), '"@asha_k" is said "at asha k"', t);
  check(t.includes('number 42') && !t.includes('#'), '"#42" is "number 42"');
  check(t.includes('1250 rupees') && !t.includes('₹'), '"₹1,250" is "1250 rupees"', t);
  check(t.includes('24 by 7') && t.includes('Noob') && !t.includes('NOOB'), '"24/7" is "24 by 7" and "NOOB" is a word, so it is not spelled N O O B', t);
  check(!/[*🎮✨()]/u.test(t), 'bold marks, emoji and brackets are gone', t);
  check(S.prepareSpeech('Rs 450 or Rs. 99.50 or INR 1000').includes('450 rupees') && S.prepareSpeech('Rs. 99.50').includes('99.50 rupees') && S.prepareSpeech('INR 1000').includes('1000 rupees'), 'Rs, Rs. and INR are rupees');
  check(S.prepareSpeech('We saw Wars 5 times').includes('Wars 5') && !S.prepareSpeech('We saw Wars 5 times').includes('rupees'), 'an ordinary word ending in "rs" followed by a number is left alone');
  check(S.prepareSpeech('You got +10,000,000 points and 5% off').includes('plus 10000000 points') && S.prepareSpeech('5% off').includes('5 percent'), '"+10,000,000" is one number ("plus 10000000"), and "5%" is "5 percent"');
  check(S.prepareSpeech('This is end-to-end encrypted').includes('end to end encrypted'), '"end-to-end" is "end to end"');
  check(S.prepareSpeech('Open https://nooob.xyz/shop now and www.example.com too').trim() === 'Open now and too', 'links are never read out', S.prepareSpeech('Open https://nooob.xyz/shop now and www.example.com too'));
  check(S.prepareSpeech('Enter the OTP and your PIN, then say OK. It is IMPORTANT.') === 'Enter the O T P and your P I N, then say okay. It is Important.', 'OTP and PIN are spelled out, OK is "okay", capitals used for shouting become normal words', S.prepareSpeech('Enter the OTP and your PIN, then say OK. It is IMPORTANT.'));
  check(S.prepareSpeech('NOOB AI helps').startsWith('Noob A I helps'), '"NOOB AI" is "Noob A I"', S.prepareSpeech('NOOB AI helps'));
  check(S.prepareSpeech('Wait — what? Hmm... fine') === 'Wait, what? Hmm, fine', 'a dash and "..." become a short pause, not a word', S.prepareSpeech('Wait — what? Hmm... fine'));
  check(S.prepareSpeech('आपका ऑर्डर तैयार है।') === 'आपका ऑर्डर तैयार है.', 'the Hindi full stop (danda) becomes an ordinary one', S.prepareSpeech('आपका ऑर्डर तैयार है।'));
  check(S.prepareSpeech('- first\n- second\n1. third') === 'first. second. third', 'list marks are dropped and the lines become sentences', S.prepareSpeech('- first\n- second\n1. third'));
  check(S.prepareSpeech('') === '' && S.prepareSpeech(null) === '' && S.prepareSpeech(undefined) === '' && S.prepareSpeech('🎮✨') === '', 'nothing to say gives nothing, never an error');
  check(S.prepareSpeech('Rate 3.5 stars at 9:30 on 10,000 days') === 'Rate 3.5 stars at 9:30 on 10000 days', 'a decimal and a time are kept as they are');
}

section('1b. Emoji and signs are never said');
{
  const e = S.prepareSpeech('😊 Hello ❤️ there 🔥👍🏽🇮🇳 ✅ done ✔ ok ✓ ★ → • ™ © ® 1️⃣ 👨‍👩‍👧 🙏 ☎ ⚠ ⭐');
  check(/^[\p{L}\p{N}\s.,;:!?']*$/u.test(e) && e.startsWith('Hello there done ok'), 'emoji of every kind, ticks, stars, arrows and signs are all dropped: only the words are left', JSON.stringify(e));
  let leaked = 0, tried = 0;
  const ranges = [[0x1F300, 0x1FAFF], [0x2190, 0x21FF], [0x2300, 0x23FF], [0x2460, 0x24FF], [0x25A0, 0x27BF], [0x2900, 0x29FF], [0x2B00, 0x2BFF], [0x1F1E6, 0x1F1FF], [0x2000, 0x206F]];
  for (const [a, b] of ranges) for (let cp = a; cp <= b; cp++) {
    const ch = String.fromCodePoint(cp);
    if (/[\p{L}\p{N}\p{M}\s]/u.test(ch)) continue;                   // letters, numbers, marks and spaces are meant to stay
    if (cp === 0x2013 || cp === 0x2014 || cp === 0x2026) continue;   // the two dashes and the ellipsis become a short pause, on purpose
    tried++;
    if (S.prepareSpeech('a ' + ch + ' b') !== 'a b') leaked++;
  }
  check(tried > 3000 && leaked === 0, tried + ' different emoji, arrows, boxes and signs: none of them gets through to the voice', 'leaked=' + leaked);
  check(S.prepareSpeech('Great job 🎉!') === 'Great job!' && S.prepareSpeech('Hi 😀😀😀') === 'Hi', 'a sentence keeps its own mark; a message of only emoji is empty');
  check(S.prepareSpeech('आप कैसे हैं 😊 धन्यवाद') === 'आप कैसे हैं धन्यवाद', 'Hindi letters and vowel marks are kept whole');
}

section('1c. Abbreviations are said as words');
{
  const t = S.prepareSpeech('Try tools, e.g. a hammer, i.e. something heavy, etc. Dr. Rao meets you at 9 a.m. today vs. tomorrow. Mr. Rao and Mrs. Rao.');
  check(t.includes('for example') && t.includes('that is') && t.includes('and so on') && t.includes('Doctor Rao') && t.includes('9 a m') && t.includes('versus') && t.includes('Mister Rao') && t.includes('Missus Rao'), 'e.g. i.e. etc. Dr. a.m. vs. Mr. Mrs. become the words they stand for', t);
  check(S.splitForSpeech(S.prepareSpeech('Try a tool, e.g. a hammer. Then rest.')).length === 2, 'the dots of an abbreviation do not cut a sentence in two');
}

section('1d. The server cleans the call replies the same way');
{
  const src = fs.readFileSync('supabase/functions/dynamic-handler/index.ts', 'utf8').split(String.fromCharCode(13)).join('');
  const i = src.indexOf('function speakSafe');
  const code = src.slice(i, src.indexOf('\n}\n', i) + 3).replace('(s: string): string', '(s)');
  const speakSafe = new Function(code + '\nreturn speakSafe;')();
  const out = speakSafe('**Sure!** 😊🔥 Your order #42 costs ₹450 ✅ — see you 👋\n• item one\n• item two');
  check(!/[\p{Extended_Pictographic}*#₹•—]/u.test(out) && out.includes('number 42') && out.includes('rupees') && !/\n/.test(out), 'the support function strips every emoji and sign from a spoken reply before it is sent', out);
  check(/LANGUAGE QUALITY/.test(src) && /correct, natural grammar/.test(src) && /\$\{voiceRules\}\$\{languageQuality\}/.test(src), 'the assistant is told, in every reply, to write correct and natural grammar');
  check(/accept: plausibleSupportReply, temperature: 0\.4/.test(src), 'and answers at a calmer setting, so the grammar and the facts stay steady');
  check(/SPOKEN: say "rupees" instead of the symbol/.test(src) && /never use emoji, symbols, abbreviations, brackets or web addresses/.test(src), 'on a call it is also told to write numbers and names the way they are said');
}

section('2. Pieces: no punctuation is left to be read aloud');
{
  const pcs = S.splitForSpeech(S.prepareSpeech('Hello there! Your order is ready. Would you like to pay now? Please confirm.'));
  check(pcs.length === 4 && pcs[0].text === 'Hello there' && pcs[2].text === 'Would you like to pay now' && pcs[2].question && !pcs[0].question, 'four sentences are four pieces; the question is marked so its voice can lift', JSON.stringify(pcs));
  check(pcs.slice(0, -1).every((p) => p.pauseMs === 380) && pcs[pcs.length - 1].pauseMs === 0, 'a pause between sentences, none after the last');
  const long = 'Your order has been packed with care, checked twice by our team, handed to the delivery partner this morning, and it should reach you before the evening tea time today.';
  const lp = S.splitForSpeech(S.prepareSpeech(long));
  check(lp.length >= 2 && lp.slice(0, -1).every((p) => p.pauseMs === 170 || p.pauseMs === 380), 'a long sentence is cut where a person would breathe (at its commas) with a short pause', JSON.stringify(lp.map((p) => p.text)));
  check(lp.every((p) => strayMarks(p.text).length === 0), 'and no comma is left inside any piece');
  check(S.splitForSpeech('It scored 3.5 out of 5. Nice').length === 2 && S.splitForSpeech('It scored 3.5 out of 5. Nice')[0].text === 'It scored 3.5 out of 5', 'a decimal point does not end a sentence');
  check(S.splitForSpeech('Come at 9:30, please.').map((p) => p.text).join('|') === 'Come at 9:30 please', 'a time keeps its colon, the comma goes');
  const noStop = S.splitForSpeech('word '.repeat(120).trim());
  check(noStop.length >= 2 && noStop.every((p) => p.text.length <= 220), 'a very long run of words with no punctuation is still cut into pieces a voice can say');
  check(S.splitForSpeech('').length === 0 && S.splitForSpeech('   ').length === 0 && S.splitForSpeech('.,!?').length === 0, 'only punctuation or nothing gives no pieces');
  // fuzz: whatever comes in, no piece contains a punctuation mark outside a number
  const chars = ['a', 'b', 'Hello', 'NOOB', '.', ',', '!', '?', ';', ':', '...', '—', '-', '(', ')', '"', "'", '1', '2.5', '9:30', '10,000', '₹', '#', '@', '*', '_', '\n', ' ', '  ', '।', '😀', '/', '%', '&', '+', '=', 'आप', 'https://x.y/z'];
  let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let bad = 0, empties = 0;
  for (let n = 0; n < 1500; n++) {
    let t = ''; const len = 1 + Math.floor(rnd() * 40);
    for (let k = 0; k < len; k++) t += chars[Math.floor(rnd() * chars.length)] + (rnd() < 0.5 ? ' ' : '');
    let out;
    try { out = S.splitForSpeech(S.prepareSpeech(t)); } catch (e) { bad++; continue; }
    if (out.some((p) => strayMarks(p.text).length > 0 || !p.text.trim() || /[*_#@₹]/.test(p.text) || /https?:/.test(p.text))) bad++;
    if (!out.length) empties++;
  }
  check(bad === 0, '1500 random messages (full of commas, dashes, brackets, emoji, links and symbols): never an error, never a stray mark in a piece', 'bad=' + bad);
  void marksIn; void empties;
}

section('3. The language of each piece');
{
  check(S.languageOf('Your order is ready') === 'en-IN' && S.languageOf('आपका ऑर्डर तैयार है') === 'hi-IN' && S.languageOf('તમારો ઓર્ડર તૈયાર છે') === 'gu-IN' && S.languageOf('உங்கள் ஆர்டர்') === 'ta-IN' && S.languageOf('మీ ఆర్డర్') === 'te-IN' && S.languageOf('আপনার অর্ডার') === 'bn-IN', 'English stays English (Indian accent); each Indian script gets its own language');
  check(S.languageOf('Aapka order ready hai') === 'en-IN', 'Hindi written in English letters is read with the Indian English voice, which pronounces it best');
  check(S.languageOf('x', 'en-US') === 'en-US', 'the fallback language can be chosen');
}

section('4. The most human voice the phone has');
{
  const V = (name, lang, local = true) => ({ name, lang, localService: local });
  const all = [V('Google US English', 'en-US', false), V('Microsoft Neerja Online (Natural) - English (India)', 'en-IN', false), V('Rishi', 'en-IN'), V('Samantha', 'en-US'), V('Zarvox', 'en-US'), V('Veena', 'en-IN'), V('Google हिन्दी', 'hi-IN', false), V('Lekha', 'hi-IN')];
  check(S.pickBestVoice(all, 'en-IN').name.includes('Neerja'), 'a natural (neural) Indian voice beats everything else');
  const no1 = all.filter((v) => !v.name.includes('Neerja'));
  check(S.pickBestVoice(no1, 'en-IN').name === 'Veena', 'without it, a woman\'s voice in the Indian accent beats a man\'s ("Rishi") and a foreign accent');
  const no2 = no1.filter((v) => v.name !== 'Veena');
  check(S.pickBestVoice(no2, 'en-IN').name === 'Google US English', 'then a network voice (Google) beats a built-in one');
  check(S.pickBestVoice([V('Zarvox', 'en-US'), V('Bells', 'en-US'), V('Whisper', 'en-US')], 'en-US') === null, 'a funny voice (Zarvox, Bells...) is never chosen: the phone\'s own default is used instead');
  check(S.pickBestVoice(all, 'hi-IN').name === 'Google हिन्दी', 'Hindi gets a Hindi voice');
  check(S.pickBestVoice(all, 'ta-IN') === null && S.pickBestVoice([], 'en-IN') === null, 'a language the phone has no voice for gives none (never a voice of another language)');
  check(S.scoreVoice(V('Aria Online (Natural)', 'en-US', false), 'en-US') > S.scoreVoice(V('Samantha', 'en-US'), 'en-US'), 'Microsoft\'s natural voices score above Apple\'s compact ones');
  check(S.scoreVoice(V('Samantha (Enhanced)', 'en-US'), 'en-US') > S.scoreVoice(V('Samantha', 'en-US'), 'en-US'), 'an Enhanced voice scores above the compact one of the same name');
}

section('5. Saying it, piece by piece');
// a clock and a phone's voice that can be driven by hand
const makeWorld = ({ voices = [], throwOnSpeak = false } = {}) => {
  let now = 0; const timers = []; let nextId = 1;
  const spoken = []; let cancels = 0;
  const synth = { speaking: false, pending: false, getVoices: () => voices, cancel() { cancels++; synth.speaking = false; synth.pending = false; }, speak(u) { if (throwOnSpeak) throw new Error('no voice'); spoken.push(u); synth.pending = true; } };
  class Utterance { constructor(text) { this.text = text; } }
  const deps = { synth, Utterance, setTimer: (fn, ms) => { const id = nextId++; timers.push({ id, at: now + ms, fn }); return id; }, clearTimer: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); } };
  const advance = (ms) => { const until = now + ms; for (;;) { timers.sort((a, b) => a.at - b.at || a.id - b.id); const t = timers[0]; if (!t || t.at > until) break; timers.shift(); now = t.at; t.fn(); } now = until; };
  const begin = (u) => { synth.pending = false; synth.speaking = true; u.onstart && u.onstart(); };
  const finish = (u) => { synth.speaking = false; u.onend && u.onend(); };
  return { deps, spoken, advance, begin, finish, synth, get cancels() { return cancels; }, get now() { return now; } };
};
{
  const w = makeWorld({ voices: [{ name: 'Microsoft Neerja Online (Natural)', lang: 'en-IN', localService: false }, { name: 'Veena', lang: 'en-IN', localService: true }, { name: 'Google हिन्दी', lang: 'hi-IN', localService: false }] });
  const sp = S.createSpeaker(w.deps);
  const log = [];
  sp.speak('Hello there. आपका ऑर्डर तैयार है! Bye.', { onStart: () => log.push('start'), onEnd: () => log.push('end'), startDelayMs: 350 });
  w.advance(100);
  check(w.spoken.length === 0, 'it waits the start delay (the phone needs a moment after the microphone is switched off)');
  w.advance(300);
  check(w.spoken.length === 1 && w.spoken[0].text === 'Hello there' && w.spoken[0].voice.name.includes('Neerja') && w.spoken[0].lang === 'en-IN', 'the first sentence is said in the natural Indian voice', JSON.stringify(w.spoken.map((u) => u.text)));
  check(w.spoken[0].rate <= 1.05 && w.spoken[0].pitch === 1 && w.spoken[0].volume === 1, 'at a natural speed and pitch (not the high, hurried voice it used to have)');
  w.begin(w.spoken[0]);
  check(log.join() === 'start', 'the screen is told when speaking really begins');
  w.finish(w.spoken[0]);
  w.advance(100);
  check(w.spoken.length === 1, 'a short pause between sentences: the next one has not started yet');
  w.advance(400);
  check(w.spoken.length === 2 && w.spoken[1].text === 'आपका ऑर्डर तैयार है' && w.spoken[1].voice.name.includes('हिन्दी') && w.spoken[1].lang === 'hi-IN', 'the Hindi sentence is said in a Hindi voice', JSON.stringify(w.spoken.map((u) => [u.text, u.lang])));
  w.begin(w.spoken[1]); w.finish(w.spoken[1]); w.advance(500);
  check(w.spoken.length === 3 && w.spoken[2].text === 'Bye' && w.spoken[2].voice.name.includes('Neerja'), 'and back to English for the next');
  w.begin(w.spoken[2]); w.finish(w.spoken[2]); w.advance(10);
  check(log.join() === 'start,end', 'onEnd comes exactly once, at the very end');
  check(w.spoken.every((u) => !/[.,;:!?]/.test(u.text)), 'not one piece sent to the voice has a punctuation mark in it');
}
{
  const w = makeWorld({ voices: [{ name: 'Veena', lang: 'en-IN', localService: true }] });
  const sp = S.createSpeaker(w.deps);
  let ended = 0;
  sp.speak('First thing. Second thing.', { onEnd: () => ended++ });
  w.advance(10);
  w.begin(w.spoken[0]);
  sp.stop();
  w.advance(5000);
  check(w.spoken.length === 1 && ended === 0 && w.cancels >= 1, 'stop() ends it at once: the rest is never said, and the phone\'s voice is cancelled');
  w.spoken[0].onerror && w.spoken[0].onerror({ error: 'canceled' });
  w.advance(5000);
  check(w.spoken.length === 1, 'the "cancelled" report of the stopped piece does not start the next one');
}
{
  const w = makeWorld({ voices: [{ name: 'Veena', lang: 'en-IN', localService: true }] });
  const sp = S.createSpeaker(w.deps);
  const ends = [];
  sp.speak('Old answer one. Old answer two.', { onEnd: () => ends.push('old') });
  w.advance(10); w.begin(w.spoken[0]);
  sp.speak('New answer.', { onEnd: () => ends.push('new') });
  w.advance(10);
  w.finish(w.spoken[0]);            // the old piece reports its end late
  w.advance(2000);
  check(w.spoken.map((u) => u.text).join('|') === 'Old answer one|New answer' && ends.length === 0, 'a new answer replaces the old one: the old one never carries on, and never ends the new one');
  w.begin(w.spoken[1]); w.finish(w.spoken[1]); w.advance(10);
  check(ends.join() === 'new', 'only the new answer reports its end');
}
{
  const w = makeWorld({ voices: [{ name: 'Veena', lang: 'en-IN', localService: true }] });
  const sp = S.createSpeaker(w.deps);
  let ended = 0;
  sp.speak('Piece one. Piece two.', { onEnd: () => ended++ });
  w.advance(10); w.begin(w.spoken[0]);
  w.synth.speaking = false; w.synth.pending = false;      // the engine finished but never told us
  w.advance(300);
  w.advance(500);
  check(w.spoken.length === 2, 'if a phone never reports the end of a piece, the answer still moves on');
  w.advance(3000);
  check(w.spoken.length === 2 && ended === 0, 'a second piece that never starts is waited for a while (the engine may be slow)...');
  w.advance(10000);
  check(ended === 1, '...and then given up on (after 12 seconds), so the call never waits for a voice that has gone silent');
}
{
  // a phone that lets the first request fall (nothing starts, nothing is waiting): it is asked once more, and only once
  const w = makeWorld({ voices: [{ name: 'Veena', lang: 'en-IN', localService: true }] });
  const orig = w.synth.speak.bind(w.synth);
  let calls = 0;
  w.synth.speak = (u) => { calls++; if (calls === 1) { w.spoken.push(u); return; } orig(u); };    // the first one is lost (pending stays false)
  S.createSpeaker(w.deps).speak('Only one piece here.', {});
  w.advance(1500);
  check(w.spoken.length === 1, 'it does not ask again at once: a voice can be slow to start');
  w.advance(500);
  check(w.spoken.length === 2 && w.spoken[1].text === 'Only one piece here', 'if nothing has started after a moment, the phone is asked once more');
  w.advance(1000);
  check(w.spoken.length === 2, '...and only once');
}
{
  const w = makeWorld({ throwOnSpeak: true });
  const sp = S.createSpeaker(w.deps);
  let ended = 0;
  sp.speak('Anything.', { onEnd: () => ended++ });
  w.advance(10);
  check(ended === 1, 'a phone whose voice fails reports the end once (the call goes on listening)');
  const w2 = makeWorld();
  let e2 = 0;
  const r = S.createSpeaker(w2.deps).speak('🎮✨ ...', { onEnd: () => e2++ });
  check(r === false && e2 === 1 && w2.spoken.length === 0, 'an answer with nothing to say reports the end at once and says nothing');
}

{
  const w = makeWorld({ voices: [{ name: 'Veena', lang: 'en-IN', localService: true }] });
  S.createSpeaker(w.deps).speak('Hello there. Bye.', {});
  check(w.spoken.length === 1 && w.spoken[0].text === 'Hello there', 'with no start delay the first piece is said at once, inside the tap that asked for it (an iPhone only lets a page speak when a tap asked)');
}

section('6. The voice call uses it, and the microphone is off while the assistant speaks');
{
  const modal = fs.readFileSync('src/components/Support/CustomerSupportModal.tsx', 'utf8');
  const speakText = modal.slice(modal.indexOf('const speakText = '), modal.indexOf('const stopSpeaking = '));
  check(/createSpeaker\(/.test(speakText) && /speakerRef\.current\.speak\(text/.test(speakText) && !/new SpeechSynthesisUtterance\(cleanSpeech\)/.test(modal), 'the assistant speaks through the new speaker, not the old one-shot voice');
  check(speakText.indexOf('stopMicNow()') > -1 && speakText.indexOf('stopMicNow()') < speakText.indexOf('.speak(text'), 'the microphone is switched OFF before the voice starts (on iPhones the voice cannot be heard while the microphone listens)');
  check(/isSpeakingRef\.current = true/.test(speakText), 'no listening session can start while the answer is being said');
  check(/resumeListeningSoon\(400\)/.test(speakText), 'and listening starts again when the answer is finished');
  const ask = modal.slice(modal.indexOf('const handleAskCallQuestion'), modal.indexOf('const handleEndCall'));
  check(ask.indexOf('stopMicNow()') > -1 && ask.indexOf('stopMicNow()') < ask.indexOf('askAiSupportAssistant'), 'the microphone is also off while the answer is being fetched');
  check(/isSpeakerOnRef\.current && voiceEnabledRef\.current/.test(ask) && !/isSpeakerOn && voiceEnabled/.test(modal), 'the two voice switches are read live, not as they were when the listening session began');
  check(/resumeListeningSoon\(\)/.test(ask), 'if nothing is to be said out loud, listening carries on');
  check(/isCallProcessingRef\.current = false;\s*\n\s*setIsCallProcessing\(false\)/.test(ask), 'the "working on it" flag is always cleared, even when nothing re-draws the screen');
  check(/if \(voiceEnabled\) interruptSpeech\(\)/.test(modal) && /if \(!on\) interruptSpeech\(\)/.test(modal), 'switching the voice off stops it talking at once (and the call goes on listening)');
  check(/recognition\.lang = 'en-IN'/.test(modal), 'the assistant listens for the Indian English accent');
  check(/setAudioMode\('playback'\)/.test(speakText) && /setAudioMode\('auto'\)/.test(modal) && /audioSession/.test(modal), 'on an iPhone the page asks for "playback" sound while the assistant speaks (full volume, loudspeaker) and goes back to normal for listening');
  check(/recognitionRef\.current \? 700 : 0/.test(speakText), 'after closing the microphone it waits long enough for the phone to change its sound over');
  check(/I'm listening, so please tell me what you need help with/.test(modal) && !/regarding \$\{cleanQuery\}/.test(modal) && !/Our mini-games grant \+10,000,000/.test(modal), 'the first words, and the words said when something goes wrong, are clear and grammatical (they no longer read the question back or recite unrelated facts)');
  check(!/(?<=\()\?<[=!]/.test(fs.readFileSync('src/utils/supportSpeech.ts', 'utf8').replace(/\/\/[^\n]*/g, '')) && !/\(\?<[=!]/.test(fs.readFileSync('src/utils/supportSpeech.ts', 'utf8').replace(/\/\/[^\n]*/g, '')), 'the speech code uses no regex look-behind (older iPhones refuse to load a page that contains one)');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
