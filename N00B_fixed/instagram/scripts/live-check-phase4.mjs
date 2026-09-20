// Live check of phase 4 (delegated admin access, push registration, shop names/stock/versions/orders/account details,
// "hide my profile") on a real Supabase project, through the PUBLIC API only (publishable key) — exactly what the
// website does. It creates TWO brand-new throwaway accounts (never shared with any browser session), exercises
// everything that can not harm real data, and deletes both accounts (and everything they made) at the end. Before
// an account is deleted the script confirms it is signed in as the throwaway it created. Real accounts, real products
// and real orders are never touched: no order is placed (that would take real stock and notify the shop), and
// every admin-only power is only tested for being REFUSED.
//
//   $env:SUPABASE_URL = "https://<ref>.supabase.co"
//   $env:SUPABASE_PUBLISHABLE_KEY = "sb_publishable_..."
//   node scripts/live-check-phase4.mjs
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY first.'); process.exit(1); }

let passed = 0, failed = 0;
const check = (ok, label, detail = '') => { if (ok) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const fresh = () => createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const rpc = async (c, fn, args = {}) => { const { data, error } = await c.rpc(fn, args); if (error) throw Object.assign(new Error(error.message), { code: error.code }); return data; };
const fails = async (fn, re) => { try { await fn(); return false; } catch (e) { return re.test(`${e.message} ${e.code}`); } };

const stamp = Date.now().toString(36);
const PW = 'Test-pass-1234';
async function makeUser(tag) {
  const c = fresh();
  const username = `l4${tag}_${stamp}`;
  const { data, error } = await c.auth.signUp({
    email: `${crypto.randomUUID()}@users.nooob.xyz`, password: PW,
    options: { data: { username, first_name: 'Live', last_name: tag, email: `l4${tag}@example.com`, mobile_number: '9000000009', date_of_birth: '2005-05-05', bio: 'automated check', agreed_to_terms: true } }
  });
  if (error || !data.session) throw new Error(`sign-up failed: ${error?.message || 'no session (is "Confirm email" still on?)'}`);
  const me = await rpc(c, 'get_my_user');
  if (me.username !== username) throw new Error('signed in as the wrong account — stopping');
  return { c, id: data.user.id, username };
}

const A = await makeUser('a');
const B = await makeUser('b');
const created = [A, B];
const ZERO = '00000000-0000-0000-0000-000000000000';
try {
  // =====================================================================================
  section('Notifications (push registration)');
  const vapid = await rpc(A.c, 'get_vapid_public_key');
  check(typeof vapid === 'string' && vapid.length >= 80 && /^[A-Za-z0-9_-]+$/.test(vapid), 'the push key is stored: this is what made "Notifications: Off - Something went wrong" appear until now');
  const anon = fresh();
  check(await fails(() => rpc(anon, 'get_vapid_public_key'), /permission denied/), 'a logged-out visitor can not read it');
  check(await fails(() => rpc(A.c, 'push_claim', { p_secret: 'x', p_id: ZERO }), /permission denied|Could not find/), 'the push sender functions can not be called from a browser');
  check(await fails(() => rpc(A.c, 'push_forget', { p_secret: 'x', p_id: ZERO }), /permission denied|Could not find/), '...neither can the one that forgets a dead subscription');
  const noSub = await rpc(A.c, 'remove_push_subscription');
  check(noSub.success === true, 'switching notifications off works even when they were never on');
  await rpc(A.c, 'toggle_follow', { p_target: B.id });
  const notes = (await rpc(B.c, 'my_notifications')).notifications;
  check(notes.some((n) => n.type === 'new_follower' && n.actorUsername === A.username), 'a new follower produces a notification for the other person');

  // =====================================================================================
  section('Admin access for other people (a normal member must be refused everything)');
  const me = await rpc(A.c, 'get_my_user');
  check(Array.isArray(me.adminPermissions) && me.adminPermissions.length === 0 && !me.isAdmin, 'a new account has no admin powers');
  const refusedAdmin = [
    ['admin_set_permissions', { p_user: B.id, p_permissions: ['manage_store'] }], ['admin_audit_log', {}], ['admin_staff_list', {}],
    ['admin_store_orders', {}], ['admin_set_store_order_status', { p_id: ZERO, p_status: 'confirmed' }],
    ['create_store_product', { p: { price: 10, description: 'x', media: [{ type: 'photo', url: 'p.jpg' }] } }],
    ['update_store_product', { p_id: ZERO, p: { price: 10, description: 'x', media: [{ type: 'photo', url: 'p.jpg' }] } }],
    ['delete_store_product', { p_id: ZERO }]
  ];
  for (const [fn, args] of refusedAdmin) check(await fails(() => rpc(A.c, fn, args), /Only the (main )?NOOB admin(istrator)?|Access denied|permission denied/i), `${fn} is refused for a normal member`);
  check(await fails(() => rpc(A.c, 'set_group_send_policy', { p_chat: ZERO, p_only_admins: true }), /not found|group|admin|Could not|permission/i), 'the "only admins can send" switch refuses a chat that is not yours');

  // =====================================================================================
  section('Shop: names, stock and versions on the real shelf');
  const shelf = await rpc(A.c, 'list_store_products');
  check(Array.isArray(shelf), 'the shelf loads');
  check(shelf.every((p) => typeof p.title === 'string' && p.title.length > 0 && typeof p.name === 'string'), `every product has a name or a title to show (${shelf.length} products on the shelf)`);
  check(shelf.every((p) => Array.isArray(p.options) && Array.isArray(p.variants) && 'stock' in p && typeof p.inStock === 'boolean'), 'every product carries its options, versions, stock and in-stock flag');
  check(shelf.every((p) => p.description && p.price > 0 && Array.isArray(p.media)), 'the existing products kept their price, description and pictures');

  // =====================================================================================
  section('Shop: account details (contact details and address)');
  check(JSON.stringify((await rpc(A.c, 'get_shop_details')).details) === '{}', 'nothing is saved to begin with');
  const contact = { fullName: '  Live Check ', phone: '+91 98765 43210', altPhone: '99999 11111', email: 'live@example.com', addressLine1: '12 MG Road', addressLine2: '', landmark: 'Near the temple', city: 'Pune', state: 'Maharashtra', pincode: '411001', deliveryNotes: 'Ring twice' };
  const saved = await rpc(A.c, 'save_shop_details', { p: contact });
  check(saved.success && saved.details.fullName === 'Live Check' && saved.details.city === 'Pune', 'details are saved and tidied');
  check((await rpc(A.c, 'get_shop_details')).details.pincode === '411001', 'they can be read back');
  check(JSON.stringify((await rpc(B.c, 'get_shop_details')).details) === '{}', 'nobody else sees them');
  check(await fails(() => rpc(A.c, 'save_shop_details', { p: { phone: '12' } }), /valid phone/), 'a bad phone number is refused');
  check(await fails(() => rpc(A.c, 'save_shop_details', { p: { email: 'nope' } }), /valid email/), 'a bad email is refused');
  check(!!(await A.c.from('shop_details').select('*').limit(1)).error, 'the table can not be read directly');
  check(!!(await anon.from('shop_details').select('*').limit(1)).error, '...nor by a logged-out visitor');

  // =====================================================================================
  section('Shop: orders (only the refusals — no real order is placed)');
  const order = (p) => rpc(A.c, 'place_store_order', { p });
  check(await fails(() => order({ items: [], deliveryMethod: 'pickup', contact }), /cart is empty/), 'an empty cart is refused');
  check(await fails(() => order({ items: [{ productId: ZERO, quantity: 1 }], deliveryMethod: 'pickup', contact }), /no longer available/), 'a product that does not exist is refused');
  check(await fails(() => order({ items: [{ productId: ZERO, quantity: 0 }], deliveryMethod: 'pickup', contact }), /not valid/), 'a quantity of 0 is refused');
  check(await fails(() => order({ items: [{ productId: ZERO, quantity: 1 }], deliveryMethod: 'courier', contact }), /pickup or delivery/), 'an unknown delivery method is refused');
  check(await fails(() => order({ items: [{ productId: ZERO, quantity: 1 }], deliveryMethod: 'pickup', contact: {} }), /full name/), 'no name is refused');
  check(await fails(() => order({ items: [{ productId: ZERO, quantity: 1 }], deliveryMethod: 'delivery', contact: { fullName: 'Live Check', phone: '9876543210' } }), /delivery address/), 'delivery without an address is refused');
  check((await rpc(A.c, 'my_store_orders')).orders.length === 0, 'a new account has no orders');
  check(await fails(() => rpc(A.c, 'cancel_my_store_order', { p_id: ZERO }), /Order not found/), 'cancelling an order that is not yours is refused');
  check(!!(await A.c.from('store_orders').select('*').limit(1)).error && !!(await A.c.from('store_order_items').select('*').limit(1)).error, 'the order tables can not be read directly');
  check(!!(await A.c.from('store_orders').insert({ delivery_method: 'pickup', subtotal: 0, total: 0 })).error, 'and can not be written directly');

  // =====================================================================================
  section('Hide my profile from someone');
  const slides = [{ mediaUrl: 'posts/live-check-hide.jpg', objectKey: 'posts/live-check-hide.jpg', mediaType: 'image', caption: 'x' }];
  const post = await rpc(A.c, 'create_post', { p_slides: slides, p_caption: 'live check hide', p_category: 'tech', p_hashtags: [], p_audio: null, p_web_link: null });
  const sees = async (u) => (await rpc(u.c, 'feed_posts')).some((p) => p.id === post.id);
  const finds = async (u) => (await rpc(u.c, 'search_users', { p_search: A.username })).some((x) => x.id === A.id);
  check(await sees(B) && await finds(B), 'before hiding: B sees A\'s post and finds A in search');
  check(await fails(() => rpc(A.c, 'hide_profile_from', { p_user: A.id }), /someone other than yourself/), 'you can not hide from yourself');
  check(await fails(() => rpc(A.c, 'hide_profile_from', { p_user: ZERO }), /not found/), 'or from someone who does not exist');
  const h = await rpc(A.c, 'hide_profile_from', { p_user: B.id });
  check(h.success && h.hiddenFromIds.length === 1 && h.hiddenFromIds[0] === B.id, 'A hides the profile from B');
  check(!(await sees(B)) && !(await finds(B)), 'now B can not see A\'s post and can not find A');
  check((await B.c.from('posts').select('id').eq('id', post.id)).data.length === 0, '...even by asking for the post directly');
  check(await fails(() => rpc(B.c, 'toggle_follow', { p_target: A.id }), /can't follow this account/), 'B can not follow A');
  check((await rpc(A.c, 'get_my_user')).hiddenFromIds.join() === B.id && (await rpc(B.c, 'get_my_user')).hiddenFromIds.length === 0, 'A\'s own record lists who they hid from; B\'s says nothing');
  const listed = (await rpc(A.c, 'my_hidden_from')).users;
  check(listed.length === 1 && listed[0].username === B.username && (await rpc(B.c, 'my_hidden_from')).users.length === 0, 'the list shows B\'s name to A only');
  check(!!(await A.c.from('profile_hides').select('*').limit(1)).error && !!(await anon.from('profile_hides').select('*').limit(1)).error, 'the hidden list itself can not be read directly by anyone');
  check(await sees(A) && (await rpc(A.c, 'search_users', { p_search: B.username })).some((x) => x.id === B.id), 'A still sees everything, including B');
  const u = await rpc(A.c, 'unhide_profile_from', { p_user: B.id });
  check(u.success && u.hiddenFromIds.length === 0 && await sees(B) && await finds(B), 'unhiding gives B everything back');

  // =====================================================================================
  section('Shop: address book (several saved addresses, one default)');
  const addr = { label: 'Home', fullName: 'Live Check', phone: '+91 98765 43210', addressLine1: '12 MG Road', addressLine2: 'Shivaji Nagar', city: 'Pune', state: 'Maharashtra', pincode: '411001' };
  const saveAddr = (c, p) => rpc(c, 'save_shop_address', { p });
  check((await rpc(A.c, 'my_shop_addresses')).addresses.length === 0, 'a new account has no saved addresses');
  const ad1 = await saveAddr(A.c, addr);
  check(ad1.success && ad1.address.isDefault === true && ad1.addresses.length === 1, 'the first address becomes the default automatically');
  const ad2 = await saveAddr(A.c, { ...addr, label: 'Work', addressLine1: 'Tech Park, Tower B', city: 'Mumbai', pincode: '400051' });
  check(ad2.address.isDefault === false && ad2.addresses.length === 2 && ad2.addresses[0].id === ad1.address.id, 'a second address is not the default, and the default is listed first');
  const sd = await rpc(A.c, 'set_default_shop_address', { p_id: ad2.address.id });
  check(sd.addresses[0].id === ad2.address.id && sd.addresses.filter((a) => a.isDefault).length === 1, 'the default can be changed (and there is only ever one)');
  const ed = await saveAddr(A.c, { ...addr, id: ad1.address.id, label: 'Flat', city: 'Pune West' });
  check(ed.address.city === 'Pune West' && ed.address.label === 'Flat' && ed.addresses.length === 2, 'an address can be edited');
  check(await fails(() => saveAddr(A.c, { ...addr, pincode: '' }), /pincode/i), 'an address without a pincode is refused');
  check(await fails(() => saveAddr(A.c, { ...addr, phone: '12' }), /valid phone/i), '...and one with a bad phone number');
  check(await fails(() => saveAddr(B.c, { ...addr, id: ad1.address.id }), /Address not found/), 'nobody can change someone else\'s address');
  check(await fails(() => rpc(B.c, 'delete_shop_address', { p_id: ad1.address.id }), /Address not found/), '...or remove it');
  check((await rpc(B.c, 'my_shop_addresses')).addresses.length === 0, 'and B sees none of A\'s addresses');
  check(!!(await A.c.from('shop_addresses').select('*').limit(1)).error && !!(await anon.from('shop_addresses').select('*').limit(1)).error, 'the table can not be read directly, by anyone');
  check(await fails(() => rpc(anon, 'my_shop_addresses'), /permission denied/), 'a logged-out visitor can not use the address book');
  const rm = await rpc(A.c, 'delete_shop_address', { p_id: ad2.address.id });
  check(rm.addresses.length === 1 && rm.addresses[0].isDefault === true && rm.addresses[0].id === ad1.address.id, 'removing the default promotes the remaining address to default');
  const rm2 = await rpc(A.c, 'delete_shop_address', { p_id: ad1.address.id });
  check(rm2.addresses.length === 0, 'removing the last one leaves none');

  // =====================================================================================
  section('Staying logged in (the check the app runs every 30 seconds)');
  const row = await A.c.from('profiles').select('is_suspended').eq('id', A.id).maybeSingle();
  check(!row.error && row.data && row.data.is_suspended === false, 'a signed-in person can read their own "suspended" flag, and it is false: the app has no reason to say "suspended"');
  const someoneElse = await A.c.from('profiles').select('id').eq('id', B.id).maybeSingle();
  check(!someoneElse.error && !!someoneElse.data, 'the account lookup works for other accounts too (so a missing row really means something)');
} catch (err) {
  failed++;
  console.log(`  FAIL unexpected error: ${err.message}`);
} finally {
  // Tidy up: each account is deleted ONLY after confirming we are signed in as the throwaway we created.
  for (const u of created) {
    try {
      const me = await rpc(u.c, 'get_my_user');
      if (me.username !== u.username) { console.log(`  note: refusing to delete — signed in as ${me.username}, expected ${u.username}`); continue; }
      await rpc(u.c, 'delete_my_account', { p_password: PW });
    } catch (e) { console.log(`  note: could not delete throwaway account ${u.username}: ${e.message}`); }
  }
  // Confirm nothing was left behind (a fresh observer account looks for our test names, then removes itself).
  try {
    const obs = fresh();
    const oname = `l4o_${stamp}`;
    const { data } = await obs.auth.signUp({ email: `${crypto.randomUUID()}@users.nooob.xyz`, password: PW,
      options: { data: { username: oname, first_name: 'Obs', last_name: 'X', email: 'obs@example.com', mobile_number: '9000000010', date_of_birth: '2005-05-05', bio: 'observer', agreed_to_terms: true } } });
    if (data?.session) {
      const left = await rpc(obs, 'search_users', { p_search: 'l4' });
      const mine = left.filter((x) => new RegExp(`^l4[ab]_${stamp}$`).test(x.username));
      check(mine.length === 0, 'no throwaway account is left behind');
      const me = await rpc(obs, 'get_my_user');
      if (me.username === oname) await rpc(obs, 'delete_my_account', { p_password: PW });
    }
  } catch (e) { console.log(`  note: leftover check could not run: ${e.message}`); }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(process.exitCode), 500);
