// The small support chat box on computers and tablets: a message typed there opens the chat page and goes to the AI.
// Usage: node --liftoff-only scripts/supabase/test-support-popup.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

const pop = read('src/components/Support/SupportPopup.tsx'), css = read('src/components/Support/supportPopup.css'), app = read('src/App.tsx'), modal = read('src/components/Support/CustomerSupportModal.tsx');
check(/Hi, how can we help\?/.test(pop) && /Write your message/.test(pop) && /onSend\(t\)/.test(pop) && /min-width: 768px/.test(pop), 'the box says "Hi, how can we help?", has a message line, and is for wide screens (768 px and up)');
check(/:root\[data-theme="light"\] \.spp-wrap/.test(css) && /\.spp-form \{[^}]*border-radius: 999px/.test(css), 'rounded message line, dark and light');
check(/wideScreen && supportPopup && !showCustomerSupportModal/.test(app) && /if \(wideScreen\) \{ if \(supportPopup\) closeSupportPopup\(\);/.test(app) && /\} else setShowCustomerSupportModal\(true\)/.test(app), 'on a computer or tablet the round picture opens the box, on a phone it still opens the help page');
check(/setSupportSeed\(text\); closeSupportPopup\(\); setShowCustomerSupportModal\(true\)/.test(app) && /initialMessage=\{supportSeed \|\| undefined\}/.test(app), 'sending opens the support chat with that message');
check(/initialMessage \? 'ai_chat'/.test(modal) && /handleSendMessage\(undefined, initialMessage\)/.test(modal) && /seedSent\.current/.test(modal) && /askAiSupportAssistant\(messageForAssistant, history\)/.test(modal), 'the chat opens on the AI chat and the message is sent once, to the AI');
check(/noob_support_popup_closed/.test(app) && /if \(!closed\) setSupportPopup\(true\)/.test(app) && !/6000/.test(app.slice(app.indexOf('supportPopup, setSupportPopup'), app.indexOf('supportPopup, setSupportPopup') + 900)), 'the box is there from the start and stays until its cross is pressed');

const auth = read('src/components/Auth/AuthView.tsx'), guest = read('src/components/Support/GuestSupport.tsx');
check(/<SupportPopup open low onClose=\{closeGuestPopup\}/.test(auth) && /wideLogin && guestPopup && guestHelpOn/.test(auth) && /noob_guest_popup_closed/.test(auth) && /if \(!closed\) setGuestPopup\(true\)/.test(auth), 'the login page has the same box (computers and tablets), there from the start until its cross is pressed');
check(/setGuestSeed\(text\); closeGuestPopup\(\); setGuestHelpOpen\(true\)/.test(auth) && /initialMessage=\{guestSeed \|\| undefined\}/.test(auth), 'a message typed on the login page opens the help chat with it');
check(/initialMessage\?: string/.test(guest) && /step === 'issue' && !busy/.test(guest) && /void submitIssue\(text, 'other'\)/.test(guest) && /seed\.current = ''/.test(guest), 'the help chat keeps that message, asks for the email first, then sends it as the problem once');
check(/open && !low/.test(pop), 'on the login page the box does not take the cursor from the login form');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
