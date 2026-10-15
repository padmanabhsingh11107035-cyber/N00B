// The login / sign-up screen's buttons (src/components/Auth): "Sign in with Apple" is on both forms, below Google, and only says "coming soon";
// the Install button is built like the Google / Facebook / Discord buttons.
// Usage: node scripts/supabase/test-login-buttons.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const social = read('src/components/Auth/SocialLoginButtons.tsx');
const auth = read('src/components/Auth/AuthView.tsx');
const doodles = read('src/components/Auth/ButtonDoodles.tsx');

section('1. Sign in with Apple');
check((auth.match(/<SocialLoginButtons /g) || []).length === 2, 'the social buttons are on both the log-in and the sign-up form');
check(/<span>Sign in with Apple<\/span>/.test(social) && /bg-black/.test(social) && /rounded-full/.test(social), 'a black pill that says "Sign in with Apple"');
check(/onClick=\{\(\) => setAppleSoon\(true\)\}/.test(social) && /Sign in with Apple is coming soon/.test(social), 'tapping it only shows "coming soon"');
check(!/signInWithProvider\([^)]*apple/i.test(social) && /p\.id !== 'apple'/.test(social), 'it never starts a real sign-in, and a real Apple provider (if one is ever switched on) is not shown twice');
const iGoogle = social.indexOf('{google && button(google)}'), iApple = social.indexOf('{appleButton}'), iOthers = social.indexOf('{others.map');
check(iGoogle > 0 && iApple > iGoogle && iOthers > iApple, 'it sits directly below Google, above Facebook and Discord');
check(/clearTimeout\(t\)/.test(social) && /setAppleSoon\(false\)/.test(social), 'the message goes away by itself');

section('2. The Install button looks like the login buttons');
check(/<ButtonDoodles provider="install" \/>/.test(auth) && /install: \{ left: instLeft/.test(doodles), 'it has its own hand-drawn doodles');
check(/dd-btn/.test(auth) && /dd-gloss/.test(auth) && /dd-shine/.test(auth) && /border-dashed/.test(auth), 'it has the same gloss, shine and dashed stitching');
check(/from-\[#047857\]/.test(auth) && !/from-\[#d97757\]/.test(auth.slice(auth.indexOf('noob-install-wrap'), auth.indexOf('noob-install-wrap') + 3500)), 'it is green, not the orange of the Log In button');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
