// Tests what the support chat / voice call does by itself: recognising a request to END the chat or the call (so the session ends
// and the 5-star review is offered), and NOT ending it for ordinary questions. Pure logic (src/components/Support/supportIntents.ts).
//
// Usage: node scripts/supabase/test-support.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const { wantsToEndSession: ends, goodbyeMessage, goodbyeSpoken } = await import(pathToFileURL(path.resolve('src/components/Support/supportIntents.ts')).href);

section('1. Requests to end the chat or the call');
const yes = [
  'end chat', 'End the chat', 'end this chat please', 'please end the call', 'End call', 'end the call now', 'can you end the chat',
  'could you please close this chat', 'close the conversation', 'stop the call', 'finish the session', 'quit chat', 'exit the chat', 'leave the chat',
  'hang up', 'hang up the call', 'please hangup', 'cut the call', 'disconnect the call', 'disconnect', 'please disconnect now',
  'end my call', 'end our conversation', 'end support chat', 'end voice call', 'End Call.', 'END CHAT!!!'
];
for (const t of yes) check(ends(t), `"${t}" ends the session`);
const bye = ['bye', 'Bye bye', 'goodbye', 'good bye', 'ok bye', 'thanks bye', 'thank you bye', 'see you', 'take care', 'gtg', "that's all", 'thats all', "that's all, thanks", "I'm done", 'i am done', 'nothing else', 'no more questions', 'no more questions thanks'];
for (const t of bye) check(ends(t), `"${t}" (a goodbye) ends the session`);
const hindi = ['call band karo', 'chat band kar do', 'call kaat do', 'phone rakh do', 'band karo', 'bas itna hi', 'alvida', 'कॉल बंद करो', 'चैट बंद कर दो', 'फोन रख दो', 'अलविदा'];
for (const t of hindi) check(ends(t), `"${t}" (Hindi) ends the session`);

section('2. Ordinary questions and messages do NOT end it');
const no = [
  'how do I end my call', 'how do i end the chat?', 'what happens when I end the call', 'why did the call end', 'where is the end chat button', 'explain how to close the session',
  'how can I close my account', 'I want to delete my account', 'cancel my order', 'how do I cancel an order', 'stop notifications', 'how to stop getting notifications',
  'my chat is not loading', 'the call quality is bad', 'I cannot end the game', 'end of the month billing', 'what is NOOB Pro', 'thanks', 'thank you so much', 'hello', 'hi there', 'help',
  'does the shop sell physical products', 'is the shop open', 'how do I leave a group chat', 'quit smoking tips',
  '', '   ', 'a'.repeat(200) + ' end chat'
];
for (const t of no) check(!ends(t), `"${t.length > 40 ? t.slice(0, 40) + '…' : t}" does not end it`);
check(!ends(null) && !ends(undefined) && !ends(42), 'nothing / odd input never ends it and never crashes');
check(!ends('please tell me how to end the call'), '"tell me how to end the call" is a question');

section('3. The goodbye');
const g = goodbyeMessage('asha', 'chat');
check(g.includes('@asha') && /ending this chat/.test(g) && /5 stars/.test(g) && g.includes('⭐⭐⭐⭐⭐'), 'the chat goodbye names the person, says it is ending, and asks for 5 stars');
check(/ending this call/.test(goodbyeMessage('asha', 'call')), 'and says "call" for a call');
const s = goodbyeSpoken('asha');
check(/asha/.test(s) && /five stars/.test(s) && !/[☀-➿\u{1F300}-\u{1FAFF}@]/u.test(s), 'the spoken goodbye asks for five stars and has no emoji or "@" to be read out loud');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
