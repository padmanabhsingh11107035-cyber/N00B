// Tests "several accounts at the same time, one per tab": where each account's login is kept, which account a tab uses, what happens
// when one tab logs in or out while others are open, the move from the old single saved login, and — with the REAL login library
// against a fake server — that two tabs can be logged in as two different accounts and never disturb each other.
//
// Usage: node scripts/supabase/test-tabsessions.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const T = await import(pathToFileURL(path.resolve('src/services/tabSessions.ts')).href);

// stand-ins for the browser's storages: `local` is shared by all tabs, each tab has its own `session` storage
const makeKV = () => {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) };
};
const now = () => Math.floor(Date.now() / 1000);
const sessionOf = (id, username, extra = {}) => ({
  access_token: `acc-${id}-${Math.random().toString(36).slice(2)}`, refresh_token: `ref-${id}-${Math.random().toString(36).slice(2)}`, token_type: 'bearer', expires_in: 3600, expires_at: now() + 3600,
  user: { id, aud: 'authenticated', app_metadata: {}, user_metadata: { username }, created_at: new Date().toISOString() }, ...extra
});
const tabOn = (local) => { const tab = makeKV(); return { tab, s: T.createTabSessions(local, tab, () => [...local.m.keys()]) }; };
const idIn = (raw) => (raw ? JSON.parse(raw).user.id : null);

section('1. One tab, one account');
let local = makeKV();
let A = tabOn(local);
check(A.s.read() === null && A.s.currentAccount() === null && A.s.savedAccounts().length === 0, 'nothing saved: no account, nothing to read');
A.s.write(JSON.stringify(sessionOf('u-ann', 'ann')));
check(A.s.currentAccount() === 'u-ann' && idIn(A.s.read()) === 'u-ann', 'logging in saves the login and this tab uses that account');
check(local.getItem(T.SLOT_PREFIX + 'u-ann') !== null && local.getItem(T.LAST_KEY) === 'u-ann', 'the login is kept in its own slot, and new tabs will start with it');
const renewed = sessionOf('u-ann', 'ann');
A.s.write(JSON.stringify(renewed));
check(A.s.read() === JSON.stringify(renewed) && A.s.savedAccounts().length === 1, 'a renewed login replaces the old one (still one account)');
A.s.write('not json'); A.s.write(JSON.stringify({ user: { id: 'x' } })); A.s.write(JSON.stringify({ refresh_token: 'r' })); A.s.write('null');
check(A.s.savedAccounts().length === 1 && idIn(A.s.read()) === 'u-ann', 'rubbish is never saved as a login');

section('2. A second tab');
let B = tabOn(local);
check(B.s.currentAccount() === 'u-ann' && idIn(B.s.read()) === 'u-ann', 'a brand-new tab starts with the account used last (so a link opened in a new tab is already logged in)');
check(B.tab.getItem(T.TAB_KEY) === 'u-ann', '...and remembers it');

section('3. Different accounts in different tabs at the same time');
B.s.unbind();
check(B.s.currentAccount() === null && B.s.read() === null, 'tab B goes to the login screen (adding another account) without logging anyone out');
check(idIn(A.s.read()) === 'u-ann' && A.s.currentAccount() === 'u-ann', '...and tab A is completely unaffected');
B.s.write(JSON.stringify(sessionOf('u-bob', 'bob')));
check(B.s.currentAccount() === 'u-bob' && idIn(B.s.read()) === 'u-bob', 'tab B logs in as bob');
check(A.s.currentAccount() === 'u-ann' && idIn(A.s.read()) === 'u-ann', 'tab A is STILL ann: no sign-out, no switch');
check(A.s.savedAccounts().map((x) => x.username).join() === 'ann,bob', 'both accounts are saved on this browser');
check(local.getItem(T.LAST_KEY) === 'u-bob', 'a new tab would start with bob, the account that logged in last');
let C = tabOn(local);
check(C.s.currentAccount() === 'u-bob', '...and it does');
A.s.write(JSON.stringify(sessionOf('u-ann', 'ann')));
B.s.write(JSON.stringify(sessionOf('u-bob', 'bob')));
check(A.s.currentAccount() === 'u-ann' && B.s.currentAccount() === 'u-bob' && idIn(A.s.read()) === 'u-ann' && idIn(B.s.read()) === 'u-bob', 'both tabs renew their logins over and over: each stays its own account');
A.s.write(JSON.stringify(sessionOf('u-bob', 'bob')));
check(A.s.currentAccount() === 'u-ann', 'a renewal for another account that finishes late never moves a tab to that account');

section('4. Logging out');
A.s.remove();
check(A.s.currentAccount() === null && A.s.read() === null && local.getItem(T.SLOT_PREFIX + 'u-ann') === null, 'tab A logs out of ann: her saved login is removed and A shows the login screen');
check(B.s.currentAccount() === 'u-bob' && idIn(B.s.read()) === 'u-bob', 'tab B (bob) is not affected');
check(local.getItem(T.LAST_KEY) === 'u-bob', 'new tabs start with the account that is still saved');
let D = tabOn(local);
check(D.s.currentAccount() === 'u-bob', 'a new tab starts as bob');
A.s.unbind(); A.s.write(JSON.stringify(sessionOf('u-ann', 'ann'))); // ann logs in again in tab A
let E = tabOn(local); E.s.switchTo('u-ann');
check(E.s.currentAccount() === 'u-ann', 'a tab can switch to any saved account');
A.s.remove(); // ann logs out of the browser: tab E, which also used ann, is signed out
check(E.s.read() === null && E.s.currentAccount() === null, 'a second tab that used the same account notices it was logged out (its login is gone)');
check(B.s.currentAccount() === 'u-bob', '...while bob is untouched');
B.s.remove();
check(local.getItem(T.LAST_KEY) === null && tabOn(local).s.currentAccount() === null && B.s.savedAccounts().length === 0, 'when the last account logs out nobody is logged in anywhere, and a new tab shows the login screen');
check(tabOn(local).s.savedAccounts().length === 0, '(nothing left behind)');

section('4b. "Switch account" → removing one account from the list (not logging out, not deleting)');
local = makeKV();
A = tabOn(local);
A.s.write(JSON.stringify(sessionOf('u-ann', 'ann')));
B = tabOn(local); B.s.unbind(); B.s.write(JSON.stringify(sessionOf('u-bob', 'bob')));
let F = tabOn(local); F.s.unbind(); F.s.write(JSON.stringify(sessionOf('u-cy', 'cy')));
check(A.s.savedAccounts().map((x) => x.username).join() === 'ann,bob,cy', '(three accounts saved, to start)');
F.s.forget('u-cy');
check(A.s.savedAccounts().map((x) => x.username).join() === 'ann,bob', 'forgetting cy removes only her from the list');
check(F.s.currentAccount() === null && F.s.read() === null, 'the tab that WAS cy is signed out of her (shown the login screen)');
check(A.s.currentAccount() === 'u-ann' && B.s.currentAccount() === 'u-bob', '...while ann and bob, in their own tabs, are completely unaffected');
A.s.forget('u-bob');
check(B.s.currentAccount() === null && B.s.read() === null, 'forgetting bob from tab A also signs OUT tab B, which was using bob (same as a normal log-out)');
check(A.s.currentAccount() === 'u-ann', '...but the tab doing the forgetting (ann) is untouched');
check(local.getItem(T.LAST_KEY) === 'u-ann', 'a new tab now starts with whichever account is left');
check(tabOn(local).s.currentAccount() === 'u-ann', '...and it does');
A.s.forget('u-does-not-exist');
check(A.s.savedAccounts().map((x) => x.username).join() === 'ann', 'forgetting an id that is not saved does nothing');
A.s.forget('u-ann');
check(A.s.currentAccount() === null && A.s.savedAccounts().length === 0 && local.getItem(T.LAST_KEY) === null, 'forgetting the very last account leaves nobody logged in anywhere (a real account is never touched by this — only what THIS browser remembers)');

section('5. After logging out, a reload does not log in as somebody else');
local = makeKV();
A = tabOn(local);
A.s.write(JSON.stringify(sessionOf('u-ann', 'ann')));
B = tabOn(local); B.s.unbind(); B.s.write(JSON.stringify(sessionOf('u-bob', 'bob')));
A.s.remove();
check(A.s.currentAccount() === null, 'tab A logged out: a reload of A (same tab storage) still shows the login screen, not bob');
check(tabOn(local).s.currentAccount() === 'u-bob', '(a brand-new tab would start as bob, the only saved account)');
check(A.s.switchTo('u-nobody') === false && A.s.currentAccount() === null, 'switching to an account that is not saved does nothing');
check(A.s.switchTo('u-bob') === true && A.s.currentAccount() === 'u-bob', 'switching to a saved one works');

section('6. From the old single saved login');
local = makeKV();
const legacy = sessionOf('u-old', 'olduser');
local.setItem('sb-abffssydapumuhwgzeck-auth-token', JSON.stringify(legacy));
local.setItem('unrelated', 'x');
A = tabOn(local);
A.s.migrateLegacy();
check(A.s.savedAccounts().length === 1 && A.s.savedAccounts()[0].username === 'olduser' && A.s.currentAccount() === 'u-old', 'the old saved login becomes the first saved account (nobody is logged out by the update)');
check(local.getItem('sb-abffssydapumuhwgzeck-auth-token') === null && local.getItem('unrelated') === 'x', 'the old copy is removed (so an old open tab can not renew a moved login), and nothing else is touched');
A.s.migrateLegacy();
check(A.s.savedAccounts().length === 1, 'running it again changes nothing');
local.setItem('sb-abffssydapumuhwgzeck-auth-token', JSON.stringify(sessionOf('u-old', 'olduser')));
const before = local.getItem(T.SLOT_PREFIX + 'u-old');
A.s.migrateLegacy();
check(local.getItem(T.SLOT_PREFIX + 'u-old') === before, 'an account already saved is never overwritten by an old copy');
local.setItem('sb-abffssydapumuhwgzeck-auth-token', 'garbage');
A.s.migrateLegacy();
check(local.getItem('sb-abffssydapumuhwgzeck-auth-token') === null && A.s.savedAccounts().length === 1, 'a damaged old login is simply dropped');

section('7. The real login library, two tabs, two accounts (fake server)');
const PW = { ann: sessionOf('u-ann', 'ann'), bob: sessionOf('u-bob', 'bob') };
let renewalCalls = 0;
const server = async (input, init) => {
  const url = String(input);
  if (url.includes('grant_type=password')) {
    const email = JSON.parse(init.body).email;
    const who = email.startsWith('ann') ? 'ann' : 'bob';
    return new Response(JSON.stringify(PW[who]), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url.includes('grant_type=refresh_token')) {
    renewalCalls++;
    const rt = JSON.parse(init.body).refresh_token;
    const who = rt.includes('u-ann') ? 'ann' : 'bob';
    const next = sessionOf(`u-${who}`, who);
    return new Response(JSON.stringify(next), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return new Response('{}', { status: 404 });
};
local = makeKV();
const clientFor = (tabApi, key) => {
  const storage = {
    getItem: (k) => (k === key ? tabApi.s.read() : tabApi.tab.getItem(k)),
    setItem: (k, v) => (k === key ? tabApi.s.write(v) : tabApi.tab.setItem(k, v)),
    removeItem: (k) => (k === key ? tabApi.s.remove() : tabApi.tab.removeItem(k))
  };
  return createClient('https://x.supabase.co', 'anon', { global: { fetch: server }, auth: { storageKey: key, storage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false } });
};
const tabA = tabOn(local), tabB = tabOn(local);
const ca = clientFor(tabA, 'sb-tab-a'), cb = clientFor(tabB, 'sb-tab-b');
const quiet = console.error; console.error = () => {};
let r = await ca.auth.signInWithPassword({ email: 'ann@x.io', password: 'pw' });
check(!r.error && r.data.session.user.id === 'u-ann' && tabA.s.currentAccount() === 'u-ann', 'tab A logs in as ann');
r = await cb.auth.signInWithPassword({ email: 'bob@x.io', password: 'pw' });
check(!r.error && r.data.session.user.id === 'u-bob' && tabB.s.currentAccount() === 'u-bob', 'tab B logs in as bob');
let ga = await ca.auth.getSession(), gb = await cb.auth.getSession();
check(ga.data.session?.user.id === 'u-ann' && gb.data.session?.user.id === 'u-bob', 'each tab\'s login library sees ITS OWN account');
check(local.getItem(T.SLOT_PREFIX + 'u-ann') !== null && local.getItem(T.SLOT_PREFIX + 'u-bob') !== null, 'both logins are saved at the same time');
// force a renewal in both tabs
tabA.s.write(JSON.stringify({ ...sessionOf('u-ann', 'ann'), expires_at: now() - 20 }));
tabB.s.write(JSON.stringify({ ...sessionOf('u-bob', 'bob'), expires_at: now() - 20 }));
ga = await ca.auth.getSession(); gb = await cb.auth.getSession();
check(renewalCalls === 2 && ga.data.session?.user.id === 'u-ann' && gb.data.session?.user.id === 'u-bob', 'both tabs renew their own login (the renewal for ann goes with ann\'s token, bob\'s with bob\'s)');
check(tabA.s.currentAccount() === 'u-ann' && tabB.s.currentAccount() === 'u-bob', '...and neither tab moved');
await ca.auth.signOut({ scope: 'local' });
ga = await ca.auth.getSession(); gb = await cb.auth.getSession();
check(ga.data.session === null && gb.data.session?.user.id === 'u-bob', 'ann logs out in tab A: A is signed out, tab B is still bob');
check(local.getItem(T.SLOT_PREFIX + 'u-ann') === null && local.getItem(T.SLOT_PREFIX + 'u-bob') !== null, 'only ann\'s saved login was removed');
await ca.auth.stopAutoRefresh(); await cb.auth.stopAutoRefresh();
await new Promise((res) => setTimeout(res, 100));
console.error = quiet;

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
