// The Android app as a real app (its screens are inside the app file, not the website) and its sign-in link. Usage: node --liftoff-only scripts/supabase/test-native-app.mjs
import fs from 'node:fs';
import { parseAuthReturn, NATIVE_AUTH_REDIRECT } from '../../src/services/nativeAuth.ts';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

section('1. The app carries its own screens');
const cap = JSON.parse(read('capacitor.config.json'));
check(!cap.server.url && cap.webDir === 'dist' && cap.server.androidScheme === 'https', 'no website address is loaded: the built screens inside the app are shown');
const wf = read('../../.github/workflows/android-build.yml');
check(/N00B_fixed\/instagram\/src\/\*\*/.test(wf) && /group: android-build/.test(wf) && /cancel-in-progress: false/.test(wf), 'every change to the screens builds a new app file, one build at a time');
check(/android:scheme="com\.noob\.social"/.test(wf), 'the build gives the app its own link for coming back from a sign-in');

section('2. Coming back from "Continue with ..."');
check(NATIVE_AUTH_REDIRECT === 'com.noob.social://auth', 'the return link is the app\'s own');
const t = parseAuthReturn('com.noob.social://auth#access_token=AAA&refresh_token=BBB&expires_in=3600');
check(t.kind === 'tokens' && t.accessToken === 'AAA' && t.refreshToken === 'BBB', 'the tokens are read from the link');
check(parseAuthReturn('com.noob.social://auth?code=XYZ').kind === 'code', 'a code is read from the link');
check(parseAuthReturn('com.noob.social://auth?error=access_denied&error_description=Denied').kind === 'error', 'a refusal is told, not signed in');
check(parseAuthReturn('https://evil.example/#access_token=A&refresh_token=B').kind === 'none' && parseAuthReturn('other.app://auth#access_token=A&refresh_token=B').kind === 'none', 'a link that is not NOOB\'s own signs nobody in');
check(parseAuthReturn('garbage').kind === 'none', 'a damaged link is ignored');
const api = read('src/services/supabaseApi.ts');
check((api.match(/redirectTo: oauthRedirectTo\(\)/g) || []).length === 2 && (api.match(/openNativeAuthPage/g) || []).length >= 3, 'both sign-in starts use it, and open the phone\'s own browser tab in the app');

section('3. The sign-in and sign-up pages');
const auth = read('src/components/Auth/AuthView.tsx');
check((auth.match(/variant="row"/g) || []).length === 1 && /auth-social-top/.test(auth) && /Or sign up with/.test(auth) && /Or log in with/.test(auth), 'round social buttons at the top of both pages');
const soc = read('src/components/Auth/SocialLoginButtons.tsx');
check(/id: 'apple', supabaseId: 'apple'/.test(soc) && /social-row/.test(soc), 'Apple, Google, Facebook and the other enabled ones are in the round row');
check(/\.auth-v2 form button\[type="submit"\] \{ background: #ff856d/.test(read('src/index.css')), 'the coral button and grey inputs are in the style sheet');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
