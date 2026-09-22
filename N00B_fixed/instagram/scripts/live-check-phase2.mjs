// Live check of phase 2 (stories, reels, music, stickers, collections, chat + Realtime) on a real Supabase
// project, through the PUBLIC API only (publishable key) — exactly what the website does.
// It creates TWO brand-new throwaway accounts, exercises everything (including live message delivery between
// them), and deletes both accounts (and everything they made) at the end. Real accounts are never touched.
//
//   $env:SUPABASE_URL = "https://<ref>.supabase.co"
//   $env:SUPABASE_PUBLISHABLE_KEY = "sb_publishable_..."
//   node scripts/live-check-phase2.mjs
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY first.'); process.exit(1); }

let passed = 0, failed = 0;
const check = (ok, label, detail = '') => { if (ok) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const fresh = () => createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }, realtime: { params: { eventsPerSecond: 10 } } });
const rpc = async (c, fn, args = {}) => { const { data, error } = await c.rpc(fn, args); if (error) throw Object.assign(new Error(error.message), { code: error.code }); return data; };
const fails = async (fn, re) => { try { await fn(); return false; } catch (e) { return re.test(`${e.message} ${e.code}`); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const stamp = Date.now().toString(36);
const PW = 'Test-pass-1234';
async function makeUser(tag) {
  const c = fresh();
  const { data, error } = await c.auth.signUp({
    email: `${crypto.randomUUID()}@users.nooob.xyz`, password: PW,
    options: { data: { username: `lt${tag}_${stamp}`, first_name: 'Live', last_name: tag, email: `lt${tag}@example.com`, mobile_number: '9000000003', date_of_birth: '2005-05-05', bio: 'automated check', agreed_to_terms: true } }
  });
  if (error || !data.session) throw new Error(`sign-up failed: ${error?.message || 'no session (is "Confirm email" still on?)'}`);
  return { c, id: data.user.id, username: `lt${tag}_${stamp}` };
}

const A = await makeUser('a');
const B = await makeUser('b');
const cleanupNotes = [];
let lounge = null;
try {
  // =====================================================================================
  section('Stories');
  const st = await rpc(A.c, 'create_story', { p_media_url: 'stories/livetest.jpg', p_media_type: 'image', p_stickers: [], p_close_friends: false });
  check(st.userId === A.id && st.comments.length === 0, 'a story is created');
  check((await rpc(B.c, 'active_stories')).some((s) => s.id === st.id), 'another person sees it');
  check((await rpc(B.c, 'record_story_view', { p_story: st.id })).viewsCount === 1, 'viewing it is counted');
  check((await rpc(A.c, 'story_viewers', { p_story: st.id })).users.length === 1, 'the owner sees who viewed');
  check(await fails(() => rpc(B.c, 'story_viewers', { p_story: st.id }), /Only the story owner/), 'others can not see the viewer list');
  check((await rpc(B.c, 'add_story_comment', { p_story: st.id, p_text: 'nice' })).comment.text === 'nice', 'commenting on a story works');
  // Every story auto-saves into that day's highlight now — no manual create_highlight step
  // (retired), and a highlight keeps working after the story itself is deleted (see delete_story
  // below and the 22 Sep story/highlight redesign).
  const hlBefore = await rpc(A.c, 'my_highlights');
  check(hlBefore.length === 1 && hlBefore[0].items.some((it) => it.id === st.id), 'the story auto-saved into today\'s highlight');
  check(await fails(() => rpc(A.c, 'create_highlight', { p_title: 'Live', p_cover_url: '', p_story_ids: [st.id] }), /permission denied/), 'the old manual create-highlight path is retired');
  // A raw query-builder call resolves to {data, error} instead of throwing, so `fails()`
  // (built for the throwing `rpc()` wrapper) can't be used here — check `error` directly.
  const directDelete = await A.c.from('stories').delete().eq('id', st.id);
  check(!!directDelete.error && /permission denied/.test(directDelete.error.message), 'a direct delete on stories is refused', `(got: ${directDelete.error?.message || 'no error — it succeeded!'})`);
  check((await rpc(A.c, 'delete_story', { p_story: st.id })).success === true, 'the owner can delete the story via delete_story');
  check((await rpc(A.c, 'my_highlights')).length === 0, 'that was the only story of the day, so the now-empty highlight is gone too');

  // =====================================================================================
  section('Reels');
  const reel = await rpc(A.c, 'create_reel', { p_video_url: 'reels/livetest.mp4', p_thumbnail_url: '', p_caption: 'live', p_audio: null, p_hashtags: ['x'], p_category: 'others' });
  check(reel.userId === A.id && reel.viewsCount === 1, 'a reel is created');
  check(await fails(() => rpc(A.c, 'create_reel', { p_video_url: 'reels/second.mp4' }), /one post or reel per day/), 'a second one the same day is refused');
  check((await rpc(B.c, 'feed_reels')).some((r) => r.id === reel.id), 'it shows in the reels feed');
  check((await rpc(B.c, 'toggle_reel_like', { p_reel: reel.id })).likesCount === 1, 'liking works');
  check((await rpc(B.c, 'add_reel_comment', { p_reel: reel.id, p_text: 'wow' })).comment.postId === reel.id, 'commenting works');
  await rpc(B.c, 'record_reel_view', { p_reel: reel.id });
  check((await rpc(B.c, 'reel_history')).some((r) => r.id === reel.id) && (await rpc(A.c, 'reel_history')).length === 0, 'watch history is personal');
  check(await fails(() => rpc(B.c, 'reel_viewers', { p_reel: reel.id }), /Only the reel owner/), 'only the owner sees who viewed');
  check(((await A.c.from('reels').delete().eq('id', reel.id).select('id')).data || []).length === 1, 'the owner can delete the reel');
  check(!!(await A.c.from('reels').insert({ user_id: A.id, video_url: 'x' })).error, 'writing to the reels table directly is refused');

  // =====================================================================================
  section('Music, stickers, collections');
  const trk = await rpc(A.c, 'upload_music_track', { p: { title: 'Live song', audioUrl: 'music/livetest.mp3' } });
  check(trk.track.title === 'Live song', 'a track is uploaded');
  check((await rpc(B.c, 'toggle_music_like', { p_track: trk.track.id })).likesCount === 1, 'liking a track works');
  check(await fails(() => rpc(B.c, 'rename_music_track', { p_track: trk.track.id, p_title: 'x' }), /Only the publisher/), 'only the uploader can rename it');
  check(((await A.c.from('music_tracks').delete().eq('id', trk.track.id).select('id')).data || []).length === 1, 'the uploader can delete it');
  const stk = await rpc(A.c, 'add_sticker', { p_key: 'stickers/livetest.png', p_title: 'S' });
  check((await rpc(A.c, 'my_stickers')).length === 1 && (await rpc(B.c, 'my_stickers')).length === 0, 'stickers are private to their owner');
  await A.c.from('custom_stickers').delete().eq('id', stk.sticker.id);
  const anyPost = (await rpc(A.c, 'feed_posts', { p_limit: 1 }))[0];
  const col = await rpc(A.c, 'create_collection', { p_name: 'Live faves', p_cover_url: null });
  const added = await rpc(A.c, 'add_post_to_collection', { p_collection: col.collection.id, p_post: anyPost.id });
  check(added.collection.postsCount === 1 && (await rpc(B.c, 'my_collections')).length === 0, 'a collection holds saved posts and is private');

  // =====================================================================================
  section('Chat — including live delivery between two people');
  lounge = (await rpc(A.c, 'my_chats')).find((c) => c.isGlobalDefault);
  check(!!lounge && lounge.isPinned, 'the Global Lounge is there for everyone');
  const chat = (await rpc(A.c, 'create_chat', { p_participant_ids: [B.id], p_is_group: false })).chat;
  check(chat.participants.length === 2 && (await rpc(B.c, 'create_chat', { p_participant_ids: [A.id], p_is_group: false })).chat.id === chat.id, 'a 1:1 chat is created once, from either side');

  // B listens LIVE for new messages the way the app does
  let liveEvents = 0;
  let ready = false;
  const listener = B.c.channel(`live-${stamp}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => { liveEvents++; }).subscribe((s) => { if (s === 'SUBSCRIBED') ready = true; });
  for (let i = 0; i < 40 && !ready; i++) await wait(250); // wait until the server says the subscription is ready
  await wait(1000); // and let the database side settle
  const sent = (await rpc(A.c, 'send_message', { p_chat: chat.id, p: { text: 'hello live' } })).message;
  let waited = 0;
  while (liveEvents === 0 && waited < 8000) { await wait(250); waited += 250; }
  check(liveEvents > 0, `the message arrives LIVE for the other person (${waited} ms)`);
  check((await rpc(B.c, 'my_chats')).find((c) => c.id === chat.id).unreadCount === 1, 'they see 1 unread');
  check((await rpc(B.c, 'chat_messages', { p_chat: chat.id })).messages.some((m) => m.id === sent.id), 'opening the chat shows the message');
  check((await rpc(A.c, 'chat_messages', { p_chat: chat.id })).messages[0].status === 'read', 'the sender sees blue ticks');
  const notif = (await rpc(B.c, 'my_notifications')).notifications.find((n) => n.type === 'new_message');
  check(!!notif && notif.chatId === chat.id, 'a "new message" notification is created');
  await B.c.removeChannel(listener);

  // typing indicators travel over Realtime broadcast
  let typed = false;
  const roomB = B.c.channel(`typing-${stamp}`, { config: { broadcast: { self: false } } }).on('broadcast', { event: 'typing' }, () => { typed = true; }).subscribe();
  const roomA = A.c.channel(`typing-${stamp}`, { config: { broadcast: { self: false } } }).subscribe();
  await wait(2500);
  await roomA.send({ type: 'broadcast', event: 'typing', payload: { isTyping: true } });
  for (let i = 0; i < 20 && !typed; i++) await wait(250);
  check(typed, 'a "typing…" signal reaches the other person live');
  await A.c.removeChannel(roomA); await B.c.removeChannel(roomB);

  const lm = (await rpc(A.c, 'send_message', { p_chat: lounge.id, p: { text: 'live check' } })).message;
  check((await rpc(B.c, 'chat_messages', { p_chat: lounge.id })).messages.some((m) => m.id === lm.id), 'a Global Lounge message is visible to everyone');
  check(!!(await A.c.from('messages').insert({ chat_id: chat.id, sender_id: A.id, text: 'sneaky' })).error, 'writing to the messages table directly is refused');
  check(((await A.c.from('messages').delete().eq('id', lm.id).select('id')).data || []).length === 1, 'you can delete your own message');

  const group = (await rpc(A.c, 'create_chat', { p_participant_ids: [B.id], p_is_group: true, p_name: 'Live group' })).chat;
  check(group.creatorId === A.id && group.adminIds.includes(A.id) && !group.adminIds.includes(B.id), 'a group is created; the creator is admin');
  check(await fails(() => rpc(B.c, 'manage_group_admin', { p_chat: group.id, p_target: B.id, p_action: 'make_admin' }), /Only group admins/), 'a member can NOT make themselves admin');
  check(!!(await B.c.from('chat_members').update({ is_admin: true }).eq('chat_id', group.id).eq('user_id', B.id)).error, '...nor by editing the table');
  check((await rpc(A.c, 'manage_group_admin', { p_chat: group.id, p_target: B.id, p_action: 'make_admin' })).adminIds.includes(B.id), 'an admin can promote a member');
  const blk = await rpc(A.c, 'block_user', { p_user: B.id });
  check(blk.blockedUserIds.includes(B.id) && await fails(() => rpc(B.c, 'send_message', { p_chat: chat.id, p: { text: 'hi' } }), /can't message/), 'blocking stops messages');
  await rpc(A.c, 'unblock_user', { p_user: B.id });
  check((await rpc(A.c, 'toggle_chat_flag', { p_chat: chat.id, p_flag: 'pin' })).isPinned === true, 'pinning a chat works');
  check((await rpc(A.c, 'delete_chat', { p_chat: group.id })).success === true, 'a group can be deleted');
} catch (err) {
  failed++;
  console.log(`  FAIL unexpected error: ${err.message}`);
} finally {
  // tidy up: remove everything the throwaway accounts made (their messages first — messages outlive accounts otherwise)
  for (const u of [A, B]) {
    try { await u.c.from('messages').delete().eq('sender_id', u.id); } catch { /* best effort */ }
    try { await rpc(u.c, 'delete_my_account', { p_password: PW }); } catch (e) { console.log(`  note: could not delete throwaway account ${u.username}: ${e.message}`); }
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(process.exitCode), 500);
