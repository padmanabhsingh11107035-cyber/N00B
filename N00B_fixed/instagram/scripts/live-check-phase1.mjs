// Live check of the phase-1 functions on a real Supabase project, through the PUBLIC API only
// (the publishable key) — exactly what the website will do. READ-ONLY by default: it logs in
// as real accounts using the passwords in the local backup and only reads. Nothing is changed.
//
//   $env:SUPABASE_URL = "https://<ref>.supabase.co"
//   $env:SUPABASE_PUBLISHABLE_KEY = "sb_publishable_..."
//   node scripts/live-check-phase1.mjs
//
// Add --write to also run the write tests with a brand-new throwaway account (needs "Confirm email"
// switched off in the project's Auth settings). Those tests create real rows in the project.
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadBackup, buildImportPlan } from './supabase/transform.mjs';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY first.'); process.exit(1); }
if (!key.startsWith('sb_publishable_') && !/^eyJ/.test(key)) { console.error('That does not look like a publishable/anon key. Refusing to continue.'); process.exit(1); }

const backupsRoot = 'backups';
const dir = process.argv.slice(2).find((a) => !a.startsWith('--'))
  || path.join(backupsRoot, fs.readdirSync(backupsRoot).filter((d) => fs.existsSync(path.join(backupsRoot, d, 'users.json'))).sort().pop());
const raw = loadBackup(dir);
const plan = buildImportPlan(raw, {});
const write = process.argv.includes('--write');

let passed = 0, failed = 0;
const check = (ok, label, detail = '') => { if (ok) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const fresh = () => createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const rpc = async (client, fn, args = {}) => { const { data, error } = await client.rpc(fn, args); if (error) throw Object.assign(new Error(error.message), { code: error.code, details: error.details }); return data; };
const denied = async (fn) => { try { await fn(); return false; } catch (e) { return /permission denied|not authenticated|row-level security|JWT|42501|Unauthorized/i.test(`${e.message} ${e.code}`); } };

async function login(rawUser) {
  const auth = plan.authUsers.find((a) => a.user_metadata.legacy_id === rawUser.id);
  const c = fresh();
  const { error } = await c.auth.signInWithPassword({ email: auth.email, password: auth.password });
  if (error) throw new Error(`login failed for one account: ${error.message}`);
  return { client: c, id: auth.id };
}

const ordinaryRaw = raw.users.find((u) => !u.isAdmin && u.accountType === 'public' && (u.password || '').length >= 6);
const adminRaw = raw.users.find((u) => u.isAdmin);

section('Logged out (the public key alone)');
const anon = fresh();
check((await rpc(anon, 'check_signup', { p: { firstName: 'T', username: 'x', email: 'a@b.co', password: 'p', bio: 'b', mobileNumber: '1', dateOfBirth: '2000-01-01', agreedToTerms: true } })).ok === true, 'the sign-up pre-check works');
check((await rpc(anon, 'username_taken', { candidate: ordinaryRaw.username })) === true, 'the username-availability check works');
check(/@users\.nooob\.xyz$/.test(await rpc(anon, 'resolve_login_email', { identifier: ordinaryRaw.username })), 'typing a username finds the login account');
check(await denied(() => rpc(anon, 'feed_posts')), 'a logged-out visitor can NOT read the feed');
check(await denied(() => rpc(anon, 'get_my_user')), 'a logged-out visitor can NOT read anyone\'s record');
check(await denied(() => rpc(anon, 'toggle_follow', { p_target: plan.authUsers[1].id })), 'a logged-out visitor can NOT follow');

section('Logged in as an ordinary user');
const { client: u, id: uid } = await login(ordinaryRaw);
const me = await rpc(u, 'get_my_user');
check(me.id === uid && me.username === ordinaryRaw.username && !!me.email && Array.isArray(me.followingIds) && Array.isArray(me.noobTransactions), 'my own record loads (with contact details and wallet history)');
check(me.password === undefined, 'no password is ever sent');
const feed = await rpc(u, 'feed_posts');
check(Array.isArray(feed) && feed.length > 0 && feed.every((p) => p.username && Array.isArray(p.slides) && p.slides.length > 0), `the feed loads (${feed.length} posts, each with author and pictures)`);
check(feed.every((p, i) => i === 0 || new Date(feed[i - 1].createdAt) >= new Date(p.createdAt)), 'the feed is newest first');
const everyone = await rpc(u, 'search_users', { p_search: '' });
// (people keep joining after go-live, so "at least the imported accounts")
check(everyone.length >= raw.users.length && everyone.every((p) => p.email === undefined && p.mobileNumber === undefined), `search lists all ${everyone.length} people (${raw.users.length} imported), without anyone's email or phone`);
check((await rpc(u, 'search_users', { p_search: ordinaryRaw.username })).some((p) => p.id === uid), 'searching by username finds them');
const notes = await rpc(u, 'my_notifications');
check(Array.isArray(notes.notifications), `notifications load (${notes.notifications.length})`);
const someComment = raw.comments && Object.keys(raw.comments).find((k) => k.startsWith('p_'));
if (someComment) {
  const dbPost = (await u.from('posts').select('id').eq('legacy_id', someComment).maybeSingle()).data;
  if (dbPost) check((await rpc(u, 'post_comments', { p_post: dbPost.id })).comments.length === raw.comments[someComment].length, 'a post\'s comments load');
}
check((await rpc(u, 'liked_posts')).length === raw.posts.filter((p) => (p.likedBy || []).includes(ordinaryRaw.id)).length, 'my liked posts match the backup');
check((await rpc(u, 'saved_posts')).length === raw.posts.filter((p) => (p.savedBy || []).includes(ordinaryRaw.id)).length, 'my saved posts match the backup');
check(await denied(() => rpc(u, 'award_points', { p_user: uid, p_amount: 999999, p_reason: 'gift' })), 'I can NOT give myself points');
check(await denied(() => rpc(u, 'notify_user', { p_target: plan.authUsers[1].id, p_type: 'system', p_actor: uid, p_message: 'forged' })), 'I can NOT forge a notification');
check(!!(await u.from('posts').insert({ user_id: uid, caption: 'sneaky' })).error, 'I can NOT publish by writing to the table directly');
check(!!(await u.from('profiles').update({ noob_points: 999999 }).eq('id', uid)).error || (await u.from('profiles').select('noob_points').eq('id', uid).single()).data.noob_points === me.noobPoints, 'I can NOT change my own points');
check(((await u.from('profile_private').select('user_id')).data || []).length === 1, 'I can see ONLY my own private details');
await u.auth.signOut();

section('Logged in as the admin');
const { client: ad } = await login(adminRaw);
check(((await ad.from('profile_private').select('user_id')).data || []).length >= raw.users.length, 'the admin can see everyone\'s private details (for support)');
check((await rpc(ad, 'get_my_user')).isAdmin === true, 'the admin flag is on');
await ad.auth.signOut();

if (write) {
  section('Write tests (a brand-new throwaway account — creates real rows)');
  const stamp = Date.now().toString(36);
  const email = `${crypto.randomUUID()}@users.nooob.xyz`;
  const c = fresh();
  const { data, error } = await c.auth.signUp({
    email, password: 'Test-pass-1234',
    options: { data: { username: `livetest_${stamp}`, first_name: 'Live', last_name: 'Test', email: 'livetest@example.com', mobile_number: '9000000001', date_of_birth: '2005-05-05', bio: 'automated check', agreed_to_terms: true } }
  });
  check(!error && !!data.user, 'sign-up creates a login account', error ? `(${error.message})` : '');
  if (data?.session) {
    const meNew = await rpc(c, 'get_my_user');
    check(meNew.username === `livetest_${stamp}` && meNew.followingIds.length === 1, 'the profile was created automatically and follows the NOOB account');
    const post = await rpc(c, 'create_post', { p_slides: [{ mediaUrl: 'posts/livetest.jpg', mediaType: 'image' }], p_caption: 'live test', p_category: 'tech', p_hashtags: [] });
    check(post.userId === meNew.id && post.slides.length === 1, 'publishing a post works');
    check((await rpc(c, 'get_my_user')).noobPoints === 25, 'and earns 25 points');
    let limited = false; try { await rpc(c, 'create_post', { p_slides: [{ mediaUrl: 'posts/livetest2.jpg' }], p_caption: 'again' }); } catch (e) { limited = /one post or reel per day/.test(e.message); }
    check(limited, 'a second post the same day is refused');
    const liked = await rpc(c, 'toggle_post_like', { p_post: post.id });
    check(liked.isLiked === true, 'liking works');
    const cm = await rpc(c, 'add_comment', { p_post: post.id, p_text: 'hello' });
    check(cm.comment.text === 'hello', 'commenting works');
    // media storage: upload as a signed-in user, view through the public address, folder rules, cleanup
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    const fileKey = `posts/livetest-${stamp}.png`;
    const up = await c.storage.from('media').upload(fileKey, png, { contentType: 'image/png', upsert: false });
    check(!up.error, 'a signed-in user can upload a picture', up.error ? `(${up.error.message})` : '');
    const back = await fetch(`${url}/storage/v1/object/public/media/${fileKey}`);
    check(back.ok && Buffer.from(await back.arrayBuffer()).length === png.length, 'the picture is viewable at its public address');
    const wrong = await c.storage.from('media').upload(`secret/livetest-${stamp}.png`, png, { contentType: 'image/png' });
    check(!!wrong.error, 'uploading into an unknown folder is refused');
    const anonUp = await fresh().storage.from('media').upload(`posts/anon-${stamp}.png`, png, { contentType: 'image/png' });
    check(!!anonUp.error, 'a logged-out visitor can NOT upload');
    const rm = await c.storage.from('media').remove([fileKey]);
    check(!rm.error && (rm.data || []).length === 1, 'you can delete your own file');
    let inlineRefused = false; try { await rpc(c, 'update_my_profile', { p: { avatar: 'data:image/jpeg;base64,' + 'A'.repeat(40000) } }); } catch (e) { inlineRefused = /too large/i.test(e.message); }
    check(inlineRefused, 'a huge inline photo is refused by the database');
    const del = await rpc(c, 'delete_my_account', { p_password: 'Test-pass-1234' });
    check(del.success === true, 'deleting the throwaway account works (cleans up after itself)');
  } else {
    console.log('  note: no session came back — "Confirm email" is probably still ON in Authentication settings, so write tests were skipped.');
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
