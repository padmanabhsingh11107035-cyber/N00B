// Every device starts in Dark mode, whatever the device's own light/dark setting is. Light and System are used only if the person chose them.
// Checks the real code: src/utils/theme.ts, public/theme-init.js (runs before the first paint), the NOOB STUDY colour mode and the static legal pages.
//
// Usage: node scripts/supabase/test-default-dark.mjs
import fs from 'node:fs';
import vm from 'node:vm';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

// a tiny browser: a phone that is set to LIGHT mode
function phone({ saved, systemDark = false, storageBlocked = false }) {
  const attrs = {};
  const store = new Map(saved ? [['noob_theme', saved]] : []);
  const localStorage = storageBlocked
    ? { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }
    : { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); } };
  const meta = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  const document = {
    documentElement: { setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: (k) => attrs[k] ?? null },
    body: { classList: { toggle() {} } },
    head: { appendChild() {} },
    querySelector: (q) => (q === 'meta[name="theme-color"]' ? meta : null),
    createElement: () => meta
  };
  const window = { matchMedia: (q) => ({ matches: /dark/.test(q) ? systemDark : !systemDark, addEventListener() {} }), addEventListener() {} };
  return { attrs, store, localStorage, document, window };
}

section('1. Before the first paint (public/theme-init.js) on a phone set to LIGHT mode');
const init = read('public/theme-init.js');
for (const [label, opts, want] of [
  ['a first-time visitor', {}, 'dark'],
  ['a visitor whose phone is in dark mode', { systemDark: true }, 'dark'],
  ['someone who chose Light', { saved: 'light' }, 'light'],
  ['someone who chose Dark', { saved: 'dark' }, 'dark'],
  ['someone who chose System (phone is light)', { saved: 'system' }, 'light'],
  ['someone who chose System (phone is dark)', { saved: 'system', systemDark: true }, 'dark'],
  ['a damaged saved value', { saved: 'purple' }, 'dark'],
  ['a phone that blocks storage', { storageBlocked: true }, 'dark']
]) {
  const p = phone(opts);
  vm.runInNewContext(init, { localStorage: p.localStorage, document: p.document, window: p.window });
  check(p.attrs['data-theme'] === want, `${label}: ${want}`, p.attrs['data-theme']);
}

section('2. The app itself (src/utils/theme.ts)');
{
  let n = 0;
  const load = async (opts) => {
    const p = phone(opts);
    globalThis.localStorage = p.localStorage; globalThis.document = p.document; globalThis.window = p.window;
    const T = await import(`../../src/utils/theme.ts?run=${++n}`);
    return { p, T };
  };
  for (const [label, opts, want, wantPref] of [
    ['a first-time visitor on a LIGHT phone', {}, 'dark', 'dark'],
    ['a phone that blocks storage', { storageBlocked: true }, 'dark', 'dark'],
    ['someone who chose System on a light phone', { saved: 'system' }, 'light', 'system'],
    ['someone who chose Light', { saved: 'light' }, 'light', 'light']
  ]) {
    const { p, T } = await load(opts);
    T.applyTheme();
    check(p.attrs['data-theme'] === want && p.attrs['data-theme-pref'] === wantPref, `${label}: ${want}`, `${p.attrs['data-theme']}/${p.attrs['data-theme-pref']}`);
  }
  const { p, T } = await load({});
  T.setThemePreference('light');
  check(p.attrs['data-theme'] === 'light' && p.store.get('noob_theme') === 'light', 'the person can switch to Light, and it is remembered');
  T.setThemePreference('dark');
  check(p.attrs['data-theme'] === 'dark', 'and back to Dark');
}

section('3. NOOB STUDY');
{
  const sp = read('src/utils/studyPrefs.ts');
  check(/DEFAULT_PREFS: StudyPrefs = \{ theme: 'dark'/.test(sp), 'NOOB STUDY starts in dark too');
}

section('4. The static pages (privacy, terms, data deletion)');
for (const f of ['privacy', 'terms', 'data-deletion']) {
  const h = read(`public/${f}.html`);
  check(/:root\{color-scheme:dark;--bg:#0a0a0a/.test(h) && !/prefers-color-scheme/.test(h), `${f}.html is dark whatever the phone's setting is`);
}
check(/<meta name="theme-color" content="#0a0a0a"/.test(read('index.html')) && /theme-init\.js/.test(read('index.html')), 'the app page loads the dark-first start-up script');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
