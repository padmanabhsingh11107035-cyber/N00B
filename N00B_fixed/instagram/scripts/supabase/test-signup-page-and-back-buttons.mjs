// (1) Create Account opens sign-up as its OWN page: a Back button, no Continue-with buttons (they stay on the log-in page), and the phone's back button / browser Back returns to
// log-in like any page. (2) The plain pages (About, Privacy Policy, Terms, Delete your data) have a Back button that goes to the page before.
// (Tried in a real browser too: Create Account -> page with Back and no social buttons; browser Back and the Back button both return to log-in; Forward returns to sign-up;
// About -> Privacy -> Back returns to About.)
// Usage: node scripts/supabase/test-signup-page-and-back-buttons.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const auth = read('src/components/Auth/AuthView.tsx');
const backJs = read('public/back-button.js');

section('1. Sign-up is its own page');
check(/const openSignupPage = \(\) => \{[\s\S]{0,200}setMode\('signup'\);[\s\S]{0,200}window\.history\.pushState\(\{ noobAuth: 'signup' \}, ''\)/.test(auth), 'Create Account switches to sign-up and adds a browser-history step, so it is a real page');
check(/onClick=\{openSignupPage\}[\s\S]{0,300}Create Account/.test(auth), 'the Create Account link uses it');
check(/const backToLogin = \(\) => \{[\s\S]{0,260}window\.history\.back\(\)[\s\S]{0,160}setMode\('login'\)/.test(auth), 'Back goes back through the history (and falls back to a plain switch)');
check(/window\.addEventListener\('popstate', onPop\)/.test(auth) && /noobAuth\?: string/.test(auth) && /setMode\(onSignup \? 'signup' : 'login'\)/.test(auth), "the phone's back button, a back swipe and the browser's Back / Forward move between the two pages");
check(/data-testid="signup-back"/.test(auth) && /<ArrowLeft className="w-4 h-4" \/> Back/.test(auth) && /\{mode === 'signup' && \(\s*<div className="mb-3">/.test(auth), 'a clear Back button at the top of the sign-up page, only there');
check(!/mode === 'signup' && signupsEnabled && signupStep === 'form' && \(\s*<div className="mb-4">\s*<SocialLoginButtons/.test(auth), 'the Continue with buttons are gone from the sign-up page');
check((auth.match(/<SocialLoginButtons/g) || []).length === 1 && /\{mode === 'login' && \(\s*<form onSubmit=\{handleLoginSubmit\}/.test(auth), '... and stay on the log-in page, which is the only place they are drawn');
check(/Or sign up with/.test(auth) && /variant=\"row\"/.test(auth), 'the sign-up page shows the round social buttons at the top, with Or sign up with under them');
check(!/setMode\('login'\)\}\s*className/.test(auth) && (auth.match(/onClick=\{backToLogin\}/g) || []).length >= 3, 'every other "back to log in" link uses the same logic');
check(/<div key=\{mode\} className="animate-in fade-in duration-200 /.test(auth), 'the change of page is a short fade');
check(/lucide-react'/.test(auth) && /\bArrowLeft,/.test(auth.split("from 'lucide-react'")[0]), 'the arrow icon is imported');
check(/window\.scrollTo\(\{ top: 0, left: 0, behavior: 'instant'/.test(auth), 'each page starts at its top');
check(/Create New Account/.test(auth) && /Join NOOB Now/.test(auth) && /Verify & Create Account/.test(auth), 'the sign-up form itself (and its code step) is unchanged');

section('2. Back buttons on the plain pages');
check(/\[data-back\]/.test(backJs) && /history\.back\(\)/.test(backJs) && /document\.referrer/.test(backJs) && /origin === location\.origin/.test(backJs), 'back-button.js goes to the previous page when it was a page of this site');
check(/if \(sameSite && history\.length > 1\) \{ e\.preventDefault\(\); history\.back\(\); \}/.test(backJs), '... and otherwise leaves the link to take the visitor home');
for (const name of ['about', 'privacy', 'terms', 'data-deletion']) {
  const html = read(`public/${name}.html`);
  check((html.match(/class="back"[^>]*data-back href="\/"/g) || []).length === 2, `${name}: a Back button at the top and one at the bottom`);
  check(/<script src="\/back-button\.js" defer><\/script>\s*<\/body>/.test(html), `${name}: loads the script from the site itself (allowed by its security rules)`);
  check(/\.back\{display:inline-flex|\.back\{display:inline-flex/.test(html.replace(/\s+/g, '')) || /\.back\{display:inline-flex/.test(html.replace(/\s+/g, '')), `${name}: the button is styled`);
  check(!/<script>(?!\s*<\/script>)[\s\S]*?<\/script>/.test(html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')), `${name}: no script written inside the page`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
