// Live check of the shop-settings function (the "Orders ON/OFF" switch and the delivery charge) on a real Supabase project, through
// the PUBLIC API only (publishable key). It creates ONE brand-new throwaway account (a normal member), checks that the function
// exists, that it REFUSES a normal member (naming the account that was signed in), that nothing changed, and deletes the account.
// It never turns the shop on or off: that power is only for the real administrator account.
//
//   $env:SUPABASE_URL = "https://<ref>.supabase.co"
//   $env:SUPABASE_PUBLISHABLE_KEY = "sb_publishable_..."
//   node scripts/live-check-shop-settings.mjs
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY first.'); process.exit(1); }

let passed = 0, failed = 0;
const check = (ok, label, detail = '') => { if (ok) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const fresh = () => createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const PW = 'Test-pass-1234';
const username = `ss_${Date.now().toString(36)}`;
const c = fresh();
const { data: su, error: suErr } = await c.auth.signUp({
  email: `${crypto.randomUUID()}@users.nooob.xyz`, password: PW,
  options: { data: { username, first_name: 'Live', last_name: 'Settings', email: 'ss@example.com', mobile_number: '9000000012', date_of_birth: '2005-05-05', bio: 'automated check', agreed_to_terms: true } }
});
if (suErr || !su.session) throw new Error(`sign-up failed: ${suErr?.message || 'no session'}`);
const me = await c.rpc('get_my_user');
if (me.data?.username !== username) throw new Error('signed in as the wrong account — stopping');

try {
  section('The shop-settings function');
  const before = await c.rpc('get_app_settings');
  check(!before.error && typeof before.data?.storeEnabled === 'boolean', 'the current settings can be read');

  const off = await c.rpc('set_shop_settings', { p_enabled: false, p_fee: null });
  check(!!off.error && /not the main NOOB administrator/.test(off.error.message) && off.error.message.includes(`@${username}`), 'a normal member is refused, and the message names the account that is signed in', off.error?.message);
  const fee = await c.rpc('set_shop_settings', { p_enabled: null, p_fee: 1 });
  check(!!fee.error && /not the main NOOB administrator/.test(fee.error.message), 'and can not change the delivery charge either', fee.error?.message);

  const after = await c.rpc('get_app_settings');
  check(after.data?.storeEnabled === before.data?.storeEnabled && after.data?.storeDeliveryFee === before.data?.storeDeliveryFee, 'the shop settings are exactly as they were');

  const direct = await c.from('app_settings').update({ store_enabled: false }).eq('id', 1).select('id');
  check((direct.data || []).length === 0, 'writing straight into the settings table still changes nothing for a member');

  const anon = fresh();
  const visitor = await anon.rpc('set_shop_settings', { p_enabled: false, p_fee: null });
  check(!!visitor.error && /permission denied/i.test(visitor.error.message), 'a visitor who is not logged in can not call it');
} finally {
  const who = await c.rpc('get_my_user');
  if (who.data?.username === username) {
    const del = await c.rpc('delete_my_account', { p_password: PW });
    console.log(`\nthrowaway account ${del.error ? 'NOT deleted: ' + del.error.message : 'deleted'}`);
  } else console.log('\nnot deleting: the signed-in account is not the throwaway');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
