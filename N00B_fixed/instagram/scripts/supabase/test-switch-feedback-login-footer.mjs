// 1. "Switch account": the switch ends with a full reload of the app (a few seconds on a phone); from the first tap the sheet now shows a spinner and the name, so the button never looks
// dead. 2. The links at the bottom of the log-in page wrap inside a phone's width instead of running off both edges. Usage: node scripts/supabase/test-switch-feedback-login-footer.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const modal = read('src/components/Modals/SwitchAccountModal.tsx'), auth = read('src/components/Auth/AuthView.tsx');

section('1. Switch account shows at once that it is working');
check(/const \[switching, setSwitching\] = useState<\{ label: string \} \| null>\(null\);/.test(modal), 'the sheet knows when a switch has begun');
check(/data-testid="switching-overlay"/.test(modal) && /<Loader2 className="w-9 h-9 text-cyan-300 animate-spin" \/>/.test(modal) && /This takes a few seconds\. Please wait\./.test(modal), 'it covers the sheet with a spinner and "This takes a few seconds. Please wait."');
check(/Switching to @\$\{name\}…/.test(modal) && /Opening the log-in page…/.test(modal), 'and says which account it is switching to (or that it opens the log-in page)');
check(/const goReload = \(label: string, doSwitch: \(\) => boolean\) => \{\s*setSwitching\(\{ label \}\);\s*window\.setTimeout\(\(\) => \{ if \(doSwitch\(\)\) window\.location\.reload\(\); else setSwitching\(null\); \}, 80\);/.test(modal), 'the spinner is drawn first, then the switch and the reload (a short pause so it is really seen)');
check(/if \(switching\) return;\s*if \(id === currentId\) return onClose\(\);/.test(modal), 'a second tap while it works does nothing');
check(/disabled=\{!!switching\} className="flex-1 min-w-0/.test(modal) && /disabled=\{!!switching\}\s*className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-gradient-to-r/.test(modal), 'the account rows and "Add another account" are switched off meanwhile');
check(/setSwitching\(\{ label: `Switching to @\$\{acct\.username\}…` \}\); window\.setTimeout\(\(\) => window\.location\.reload\(\), 80\);/.test(modal) && /disabled=\{busy \|\| !!switching \|\| !password\}/.test(modal), 'signing in to another of your accounts keeps showing the spinner until the reload (it used to switch back to the plain button)');
check(/aria-busy=\{!!switching\}/.test(modal) && /role="status" aria-live="polite"/.test(modal), 'screen readers are told too');

section('2. The links at the bottom of the log-in page');
check(/data-testid="login-footer-links"/.test(auth) && /flex flex-wrap items-center justify-center gap-x-3\.5 gap-y-1\.5 px-3/.test(auth), 'they wrap onto several lines, centred, with side room');
check(!/flex items-center justify-center gap-4 text-xs text-zinc-500 mb-1/.test(auth), 'the old single row that ran off both edges is gone');
const links = (auth.match(/className="whitespace-nowrap hover:text-zinc-300 transition-colors cursor-pointer"/g) || []).length;
check(links >= 4 && /whitespace-nowrap hover:text-zinc-300 transition-colors cursor-pointer" data-testid="login-android-app"/.test(auth), 'each link stays in one piece (a link never breaks in the middle)');
check((auth.match(/<span aria-hidden="true" className="hidden sm:inline">•<\/span>/g) || []).length >= 3 && !/<span>•<\/span>/.test(auth), 'the dots between them show only where they all fit on one line');
check(/\[text-shadow:0_1px_6px_rgba\(0,0,0,0\.95\)\]/.test(auth) && /text-zinc-400/.test(auth.slice(auth.indexOf('login-footer-links') - 200, auth.indexOf('login-footer-links') + 50)), 'and they are a little brighter with a soft shadow, so the doodles behind do not hide them');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
