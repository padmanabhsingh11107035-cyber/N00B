// The small support chat box on computers and tablets: a message typed there opens the chat page and goes to the AI.
// Usage: node --liftoff-only scripts/supabase/test-support-popup.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

const pop = read('src/components/Support/SupportPopup.tsx'), css = read('src/components/Support/supportPopup.css'), app = read('src/App.tsx'), modal = read('src/components/Support/CustomerSupportModal.tsx');
check(/Hi, how can we help\?/.test(pop) && /Write your message/.test(pop) && /onSend\(t\)/.test(pop) && /min-width: 768px/.test(pop), 'the box says "Hi, how can we help?", has a message line, and is for wide screens (768 px and up)');
check(/:root\[data-theme="light"\] \.spp-wrap/.test(css) && /\.spp-form \{[^}]*border-radius: 999px/.test(css), 'rounded message line, dark and light');
check(/wideScreen && supportPopup && !showCustomerSupportModal/.test(app) && /if \(wideScreen\) setSupportPopup\(\(o\) => !o\); else setShowCustomerSupportModal\(true\)/.test(app), 'on a computer or tablet the round picture opens the box, on a phone it still opens the help page');
check(/setSupportSeed\(text\); setSupportPopup\(false\); setShowCustomerSupportModal\(true\)/.test(app) && /initialMessage=\{supportSeed \|\| undefined\}/.test(app), 'sending opens the support chat with that message');
check(/initialMessage \? 'ai_chat'/.test(modal) && /handleSendMessage\(undefined, initialMessage\)/.test(modal) && /seedSent\.current/.test(modal) && /askAiSupportAssistant\(messageForAssistant, history\)/.test(modal), 'the chat opens on the AI chat and the message is sent once, to the AI');
check(/noob_support_popup_seen/.test(app) && /6000/.test(app), 'the box shows itself once per visit, a few seconds after the app opens');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
