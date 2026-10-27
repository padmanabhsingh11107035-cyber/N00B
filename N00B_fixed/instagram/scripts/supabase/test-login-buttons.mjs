// The login / sign-up screen's buttons (src/components/Auth): "Continue with Apple" is on both forms, below Google, and only says "coming soon";
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

section('1. Continue with Apple');
check((auth.match(/<SocialLoginButtons /g) || []).length === 1, 'the social buttons are on the log-in form (creating an account is its own page, with a Back button to them)');
check(/apple: \{\s*name: 'Apple'[^}]*solid: '#000000'/.test(social) && /force-white-text ring-1 ring-white\/60/.test(social), 'it is black with a white edge and white text');
check(/dd-btn group relative overflow-hidden w-full py-2\.5 font-bold text-sm rounded-2xl/.test(social) && /button\(\{ id: 'apple', supabaseId: 'apple' \}/.test(social), 'it is built by the same code as Google / Facebook / Discord, so it has exactly their shape, size and finish');
check(/apple: \{ left: appleLeft, right: appleRight, leftMore: appleLeftMore, rightMore: appleRightMore, tone: 'text-white' \}/.test(doodles) && !/AW = \{[^}]*#(?!fff)/i.test(doodles), 'it has its own doodles, all white');
check(/\(\) => setAppleSoon\(true\)/.test(social) && !/signInWithProvider\([^)]*apple/i.test(social) && /p\.id !== 'apple'/.test(social), 'tapping it never starts a real sign-in (and a real Apple provider, if one is ever switched on, is not shown twice)');
const iGoogle = social.indexOf('{google && button(google)}'), iApple = social.indexOf("button({ id: 'apple'"), iOthers = social.indexOf('{others.map');
check(iGoogle > 0 && iApple > iGoogle && iOthers > iApple, 'it sits directly below Google, above Facebook and Discord');
check(/aspect-square/.test(social) && /createPortal\(/.test(social) && /<h3[^>]*>Coming soon<\/h3>/.test(social), 'tapping it opens a square "Coming soon" card drawn over the page');
check(/e\.key === 'Escape'/.test(social) && /onClick=\{\(\) => setAppleSoon\(false\)\}/.test(social) && /e\.stopPropagation\(\)/.test(social), 'the card closes with Okay, a tap outside it, or Esc — and not when you tap on the card itself');
check(!/mt-1\.5 text-center text-xs font-bold text-white/.test(social), 'the old one-line message under the button is gone');

section('2. The Install button looks like the login buttons');
check(/<ButtonDoodles provider="install" \/>/.test(auth) && /install: \{ left: instLeft/.test(doodles), 'it has its own hand-drawn doodles');
check(/dd-btn/.test(auth) && /dd-gloss/.test(auth) && /dd-shine/.test(auth) && /border-dashed/.test(auth), 'it has the same gloss, shine and dashed stitching');
check(/background: 'linear-gradient\(100deg, var\(--color-noob\) 0%, var\(--color-noob-strong\) 100%\)'/.test(auth) && !/from-\[#047857\]/.test(auth), 'it is the white accent button (black in Light mode), not green or orange');

section('3. The buttons never fall back to Google alone');
const api = read('src/services/supabaseApi.ts');
check(/DEFAULT_SOCIAL_PROVIDERS[^=]*= \[\s*\{ id: 'google'[^\]]*\{ id: 'facebook'[^\]]*\{ id: 'discord'/.test(api), 'the default list is Google, Facebook and Discord');
check(/useState<EnabledSocialProvider\[\]>\(\(\) => cachedSocialProviders\(\)\)/.test(social), 'they show from the first moment (saved list or the default), not after the settings load');
check(/return cachedSocialProviders\(\);/.test(api) && !/\[\{ id: 'google', supabaseId: 'google' \}\];/.test(api), 'when the settings can not be read, the saved list or the three are used, not Google alone');
check(/socialProvidersPromise = null; \/\/ try again next time/.test(api) && /window\.setTimeout\(load, 6000\)/.test(social), 'a failed read is not remembered: it is tried again');
check(/setItem\(SOCIAL_CACHE_KEY/.test(api) && /KNOWN_SOCIAL\.includes\(p\.id\)/.test(api), 'the last good list is saved on the device, and a damaged saved list is ignored');

section('4. Every social sign-in happens on noobsocials.com');
check(/redirectTo: oauthRedirectTo\(\)/.test(api) && /window\.location\.origin/.test(read('src/services/nativeAuth.ts')), 'a sign-in comes back to the address it started on');
check(/isOnOtherNoobAddress\(\)\) \{\s*window\.location\.assign\(`\$\{MAIN_SITE\}\/\?social=\$\{encodeURIComponent\(p\.id\)\}`\)/.test(social), 'on nooob.xyz, tapping a provider opens noobsocials.com/?social=<provider> instead of signing in there');
check(/params\.get\('social'\)/.test(social) && /params\.delete\('social'\)/.test(social) && /void start\(wanted\)/.test(social), 'on arrival the sign-in starts by itself and ?social= is removed from the address bar (no loop)');
check(/x\.id !== 'apple'/.test(social) && /if \(isOnOtherNoobAddress\(\)\) return;/.test(social), 'Apple (coming soon) is never auto-started, and the old address never starts one from the hand-off');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
