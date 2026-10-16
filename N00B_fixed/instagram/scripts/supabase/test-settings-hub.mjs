// Tests migration 20261017000001 ("Settings and activity"): the account settings the server enforces - on a REAL Postgres (PGlite) with every migration applied.
// Notifications, comments (who, blocked, restricted, limited, hidden words, mentions), chats and story replies, read receipts, sharing, tags, hidden stories, like counts,
// the lists of people, and the lists the pages show. Every default must leave things exactly as they were.
//
// Usage: node scripts/supabase/test-settings-hub.mjs
import { createTestDb, asUser, asAnon } from './pg-test-env.mjs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const expectFail = async (fn, pattern, label) => {
  try { await fn(); check(false, label, '(expected an error, but it succeeded)'); }
  catch (e) { check(pattern.test(e.message), label, `(got: ${e.message})`); }
};
const section = (t) => console.log(`\n${t}`);

const db = await createTestDb();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const mkUser = async (name, patch = {}) => {
  const id = (await q(`select gen_random_uuid() as id`))[0].id;
  await q(`insert into auth.users (id, email, encrypted_password) values ($1, $2, 'x')`, [id, `${name}@users.nooob.xyz`]);
  if (!(await q(`select 1 from public.profiles where id = $1`, [id])).length) await q(`insert into public.profiles (id, username, display_name) values ($1, $2, $2)`, [id, name]);
  for (const [col, val] of Object.entries(patch)) await q(`update public.profiles set ${col} = $2 where id = $1`, [id, val]);
  return id;
};
const call = (uid, sql, params = []) => asUser(db, uid, async () => (await db.query(sql, params)).rows);
const rpc = async (uid, fn, ...args) => (await call(uid, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args))[0].r;
const setS = (uid, patch) => rpc(uid, 'set_my_settings', JSON.stringify(patch));
const follow = (a, b, ago = '30 days') => q(`insert into public.follows (follower_id, followee_id, created_at) values ($1, $2, now() - $3::interval) on conflict do nothing`, [a, b, ago]);

const admin = await mkUser('boss', { is_admin: true });
const ann = await mkUser('ann');
const bob = await mkUser('bob');
const cat = await mkUser('cat');
const dan = await mkUser('dan');

section('1. Defaults, and saving a setting');
const first = await rpc(ann, 'my_settings');
check(first.settings['notif.likes'] === true && first.settings['comments.who'] === 'everyone' && first.settings['msg.who'] === 'connected' && first.settings['tags.who'] === 'everyone', 'a new account has every default (everything as it always was)');
check(first.settings['notif.pauseUntil'] === null && first.settings['limit.until'] === null && first.settings['notif.quiet'].on === false, 'with nothing paused, limited or quiet');
check(Object.keys(first.counts).length === 0, 'and empty lists');
await setS(ann, { 'notif.likes': false, 'comments.who': 'followers' });
const after = await rpc(ann, 'my_settings');
check(after.settings['notif.likes'] === false && after.settings['comments.who'] === 'followers' && after.settings['notif.comments'] === true, 'a change is saved and the rest stays as it was');
check((await rpc(bob, 'my_settings')).settings['notif.likes'] === true, 'and is only that person\'s');
await expectFail(() => setS(ann, { 'nothing.here': true }), /not a setting/, 'an unknown setting is refused');
await expectFail(() => setS(ann, { 'notif.likes': 'yes' }), /not valid/, 'a value of the wrong kind is refused');
await expectFail(() => setS(ann, { 'comments.who': 'robots' }), /not allowed/, 'a choice that is not on the list is refused');
await expectFail(() => setS(ann, { 'comments.who': 5 }), /not allowed/, 'so is a number where a choice belongs');
await expectFail(() => setS(ann, { 'limit.until': 'tomorrow-ish' }), /valid date/, 'a date that is not a date is refused');
await expectFail(() => setS(ann, { 'limit.until': new Date(Date.now() + 90 * 864e5).toISOString() }), /too far/, 'and one too far ahead');
await expectFail(() => setS(ann, { 'notif.quiet': { on: true, from: '25:00', to: '07:00', tz: 0 } }), /Quiet hours/, 'quiet hours must be real times');
await expectFail(() => setS(ann, { 'notif.quiet': { on: true, from: '22:00', to: '07:00', tz: 9000 } }), /Quiet hours/, '... with a real time zone');
await expectFail(() => setS(ann, 'not an object'), /Nothing to save|not a setting/, 'something that is not a set of settings is refused');
await expectFail(async () => (await asAnon(db, async () => db.query(`select public.my_settings()`))), /permission denied/i, 'a visitor cannot read settings');
await expectFail(() => call(ann, `select * from public.user_settings`), /permission denied/i, 'nobody can read the table directly');
await expectFail(() => call(ann, `update public.user_settings set prefs = '{}'`), /permission denied/i, '... or write to it');
await setS(ann, { 'notif.likes': true, 'comments.who': 'everyone' });

section('2. Lists of people');
const add = (uid, kind, who, extra = {}) => rpc(uid, 'settings_list_add', kind, who, JSON.stringify(extra));
check((await add(ann, 'restricted', bob)).count === 1, 'someone can be restricted');
await add(ann, 'restricted', bob);
check((await rpc(ann, 'settings_list', 'restricted')).length === 1, 'adding twice does not duplicate');
check((await rpc(ann, 'settings_list', 'restricted'))[0].username === 'bob', 'the list shows who');
check((await rpc(bob, 'settings_list', 'restricted')).length === 0, 'and is private to the owner');
await expectFail(() => add(ann, 'restricted', ann), /yourself/, 'you cannot add yourself');
await expectFail(() => add(ann, 'robots', bob), /does not exist/, 'a list that does not exist is refused');
await expectFail(() => add(ann, 'muted', '00000000-0000-4000-8000-000000000001'), /not found/, 'neither can someone who does not exist be added');
await add(ann, 'muted', cat, { posts: true, stories: false });
const muted = (await rpc(ann, 'settings_list', 'muted'))[0];
check(muted.mutePosts === true && muted.muteStories === false, 'a muted account remembers whether posts, stories or both');
await add(ann, 'muted', cat, { posts: false, stories: true });
check((await rpc(ann, 'settings_list', 'muted'))[0].mutePosts === false && (await rpc(ann, 'settings_list', 'muted'))[0].muteStories === true, 'and can be changed');
await expectFail(() => add(ann, 'muted', cat, { posts: false, stories: false }), /Choose posts/, 'muting nothing is refused');
check((await rpc(ann, 'my_settings')).counts.muted === 1 && (await rpc(ann, 'my_settings')).counts.restricted === 1, 'the counts are reported');
check((await rpc(ann, 'settings_list_remove', 'restricted', bob)).count === 0 && (await rpc(ann, 'settings_list', 'restricted')).length === 0, 'removing works');
await rpc(ann, 'settings_list_remove', 'muted', cat);
for (let i = 0; i < 100; i++) { const u = await mkUser('fav' + i); await q(`insert into public.user_lists (user_id, kind, target_id) values ($1, 'favourite', $2)`, [ann, u]); }
await expectFail(() => add(ann, 'favourite', dan), /list is full/, 'favourites are capped at 100');
await q(`delete from public.user_lists where user_id = $1`, [ann]);

section('3. Notifications');
const notify = (target, type, actor = bob) => q(`insert into public.notifications (target_user_id, actor_id, type, message) values ($1, $2, $3, 'x')`, [target, actor, type]);
const count = async (uid, type) => (await q(`select count(*)::int n from public.notifications where target_user_id = $1 and type = $2`, [uid, type]))[0].n;
await notify(cat, 'post_like');
check(await count(cat, 'post_like') === 1, 'by default every notification arrives');
await setS(cat, { 'notif.likes': false });
await notify(cat, 'post_like'); await notify(cat, 'post_comment');
check(await count(cat, 'post_like') === 1 && await count(cat, 'post_comment') === 1, 'with Likes switched off no new like notification is made, comments still are');
await notify(cat, 'admin_direct'); await notify(cat, 'store_order'); await notify(cat, 'system');
check(await count(cat, 'admin_direct') === 1 && await count(cat, 'store_order') === 1 && await count(cat, 'system') === 1, 'messages from the team, orders and safety notices always arrive');
await q(`insert into public.notifications (target_user_id, type, message) values (null, 'admin_broadcast', 'to everyone')`);
check((await q(`select count(*)::int n from public.notifications where type = 'admin_broadcast'`))[0].n === 1, 'a message to everyone is never filtered');
for (const [type, key] of [['new_follower', 'notif.follows'], ['follow_request_received', 'notif.follows'], ['new_message', 'notif.messages'], ['mention', 'notif.mentions'], ['live_lounge_meeting', 'notif.live'], ['game_challenge', 'notif.games'], ['points_transfer', 'notif.points'], ['suggested_user', 'notif.suggestions'], ['birthday_follower_alert', 'notif.birthdays']]) {
  const who = await mkUser('n_' + type);
  await setS(who, { [key]: false });
  await notify(who, type);
  check(await count(who, type) === 0, `${key} off: no "${type}" notification`);
  await setS(who, { [key]: true });
  await notify(who, type);
  check(await count(who, type) === 1, `${key} on again: it arrives`);
}
const paused = await mkUser('paused');
await setS(paused, { 'notif.pauseUntil': new Date(Date.now() + 3600e3).toISOString() });
await notify(paused, 'post_like'); await notify(paused, 'new_follower'); await notify(paused, 'admin_direct');
check(await count(paused, 'post_like') === 0 && await count(paused, 'new_follower') === 0 && await count(paused, 'admin_direct') === 1, 'paused: nothing from people arrives, the team\'s messages still do');
await setS(paused, { 'notif.pauseUntil': null });
await notify(paused, 'post_like');
check(await count(paused, 'post_like') === 1, 'resuming brings them back');
await q(`update public.user_settings set prefs = prefs || jsonb_build_object('notif.pauseUntil', (now() - interval '1 hour')::text) where user_id = $1`, [paused]);
await notify(paused, 'post_like');
check(await count(paused, 'post_like') === 2, 'a pause that has run out ends by itself');

section('3b. Quiet hours hold the phone alert');
const quiet = await mkUser('quiet');
const isQuiet = async (uid, at) => (await q(`select public.in_quiet_hours($1, $2::timestamptz) as r`, [uid, at]))[0].r;
check(await isQuiet(quiet, '2026-10-17T23:30:00Z') === false, 'off by default');
await setS(quiet, { 'notif.quiet': { on: true, from: '23:00', to: '07:00', tz: 0 } });
check(await isQuiet(quiet, '2026-10-17T23:30:00Z') === true && await isQuiet(quiet, '2026-10-18T03:00:00Z') === true && await isQuiet(quiet, '2026-10-18T07:00:00Z') === false && await isQuiet(quiet, '2026-10-18T12:00:00Z') === false, 'a night that crosses midnight');
await setS(quiet, { 'notif.quiet': { on: true, from: '23:00', to: '07:00', tz: 330 } });
check(await isQuiet(quiet, '2026-10-17T18:00:00Z') === true && await isQuiet(quiet, '2026-10-17T12:00:00Z') === false, 'in the person\'s own time zone (India, +5:30: 23:30 is 18:00 UTC)');
await setS(quiet, { 'notif.quiet': { on: true, from: '13:00', to: '15:00', tz: 0 } });
check(await isQuiet(quiet, '2026-10-17T14:00:00Z') === true && await isQuiet(quiet, '2026-10-17T16:00:00Z') === false, 'and a window inside one day');
await setS(quiet, { 'notif.quiet': { on: false, from: '13:00', to: '15:00', tz: 0 } });
check(await isQuiet(quiet, '2026-10-17T14:00:00Z') === false, 'switched off again');
await q(`insert into public.push_subscriptions (user_id, endpoint, subscription) values ($1, 'https://push.example/a', '{"endpoint":"https://push.example/a"}'::jsonb), ($2, 'https://push.example/b', '{"endpoint":"https://push.example/b"}'::jsonb) on conflict do nothing`, [quiet, bob]).catch(async () => {
  await q(`insert into public.push_subscriptions (user_id, subscription) values ($1, '{"endpoint":"https://push.example/a"}'::jsonb), ($2, '{"endpoint":"https://push.example/b"}'::jsonb)`, [quiet, bob]);
});
await setS(quiet, { 'notif.quiet': { on: true, from: '00:00', to: '23:59', tz: 0 } });
const secret = (await q(`select value from public.internal_config where key = 'push_secret'`))[0].value;
await q(`insert into public.notifications (target_user_id, actor_id, type, message) values (null, $1, 'admin_broadcast', 'hello')`, [admin]);
const nid = (await q(`select id from public.notifications where type = 'admin_broadcast' order by created_at desc limit 1`))[0].id;
const claim = (await q(`select public.push_claim($1, $2) as r`, [secret, nid]))[0].r;
check(claim.claimed === true && claim.recipients.every((r) => r.userId !== quiet) && claim.recipients.some((r) => r.userId === bob), 'a person in quiet hours gets no phone alert; everyone else still does');

section('4. Comments: who can comment');
const mkPost = async (owner) => (await q(`insert into public.posts (user_id, caption) values ($1, 'p') returning id`, [owner]))[0].id;
const post = await mkPost(ann);
const comment = (uid, postId, text) => rpc(uid, 'add_comment', postId, text);
const visible = async (uid, postId) => (await rpc(uid, 'post_comments', postId)).comments.map((c) => c.text);
check((await comment(bob, post, 'hi ann')).success === true, 'by default anyone can comment');
await follow(bob, ann);                                   // bob follows ann
await setS(ann, { 'comments.who': 'off' });
await expectFail(() => comment(cat, post, 'x'), /turned off/, 'Off: nobody can comment');
await expectFail(() => comment(bob, post, 'x'), /turned off/, '... not even a follower');
check((await comment(ann, post, 'my own post')).success === true, '... except the owner');
check((await comment(admin, post, 'team note')).success === true, 'and the NOOB team');
await setS(ann, { 'comments.who': 'followers' });
check((await comment(bob, post, 'follower here')).success === true, 'Followers: a follower can comment');
await expectFail(() => comment(cat, post, 'x'), /Only followers/, '... someone who does not follow cannot');
await setS(ann, { 'comments.who': 'following' });
await expectFail(() => comment(bob, post, 'x'), /Only people this account follows/, 'People you follow: a follower you do not follow cannot');
await follow(ann, cat);                                   // ann follows cat
check((await comment(cat, post, 'ann follows me')).success === true, '... someone you follow can');
await setS(ann, { 'comments.who': 'both' });
check((await comment(bob, post, 'both: follower')).success === true && (await comment(cat, post, 'both: followed')).success === true, 'Both: followers and people you follow');
await expectFail(() => comment(dan, post, 'x'), /Only followers and people/, '... nobody else');
await setS(ann, { 'comments.who': 'everyone' });

section('4b. Comments that are hidden (shown only to their author)');
const hiddenCount = async (postId) => (await q(`select count(*)::int n from public.comments where post_id = $1 and hidden_reason is not null`, [postId]))[0].n;
const p2 = await mkPost(ann);
await add(ann, 'comment_block', dan);
await comment(dan, p2, 'blocked person');
await comment(bob, p2, 'normal comment');
check((await visible(bob, p2)).join() === 'normal comment', 'a blocked commenter\'s comment is not shown to others');
check((await visible(dan, p2)).includes('blocked person'), '... but its author still sees it (and does not know)');
check((await visible(ann, p2)).join() === 'normal comment', 'the owner does not see it either');
check((await q(`select hidden_reason from public.comments where post_id = $1 and user_id = $2`, [p2, dan]))[0].hidden_reason === 'blocked', 'it is kept, marked blocked');
check((await q(`select count(*)::int n from public.notifications where target_user_id = $1 and type = 'post_comment' and actor_id = $2`, [ann, dan]))[0].n === 0, 'and the owner is not notified about it');
check((await q(`select count(*)::int n from public.notifications where target_user_id = $1 and type = 'post_comment' and actor_id = $2`, [ann, bob]))[0].n >= 1, 'a normal comment still notifies');
await rpc(ann, 'settings_list_remove', 'comment_block', dan);
await comment(dan, p2, 'now allowed');
check((await visible(bob, p2)).includes('now allowed'), 'after removing the block new comments show');
await add(ann, 'restricted', cat);
await comment(cat, p2, 'restricted person');
check(!(await visible(bob, p2)).includes('restricted person') && (await visible(cat, p2)).includes('restricted person'), 'Restricted: the comment is hidden from others, visible to its author');
check((await q(`select hidden_reason from public.comments where post_id = $1 and user_id = $2`, [p2, cat]))[0].hidden_reason === 'restricted', '... marked restricted');
await rpc(ann, 'settings_list_remove', 'restricted', cat);

const p3 = await mkPost(ann);
await setS(ann, { 'limit.until': new Date(Date.now() + 86400e3).toISOString(), 'limit.audience': 'non_followers' });
await comment(dan, p3, 'from a stranger');
await comment(bob, p3, 'from a follower');
check((await visible(cat, p3)).join() === 'from a follower', 'Limit interactions: comments from people who do not follow are hidden, a follower\'s are not');
await follow(dan, ann, '1 day');
await comment(dan, p3, 'new follower');
check((await visible(cat, p3)).includes('new follower'), 'someone who has just followed is not limited when "non-followers" is chosen');
await setS(ann, { 'limit.audience': 'recent_followers' });
await comment(dan, p3, 'recent follower');
check(!(await visible(cat, p3)).includes('recent follower'), '... but is when "recent followers" is chosen (followed for less than 7 days)');
await setS(ann, { 'limit.until': new Date(Date.now() - 1000).toISOString().replace(/\..*/, 'Z') }).catch(() => undefined);
await q(`update public.user_settings set prefs = prefs || jsonb_build_object('limit.until', (now() - interval '1 minute')::text) where user_id = $1`, [ann]);
await comment(cat, p3, 'after the limit ended');
check((await visible(bob, p3)).includes('after the limit ended'), 'when the limit time has passed, comments show again');
await setS(ann, { 'limit.until': null, 'limit.audience': 'non_followers' });

const p4 = await mkPost(ann);
await q(`update public.profiles set privacy_settings = jsonb_build_object('hideTaggedPhotos', false, 'blockedWords', jsonb_build_array('scam', 'free money')) where id = $1`, [ann]);
await comment(dan, p4, 'This is a SCAM!');
await comment(dan, p4, 'get FREE MONEY now');
await comment(dan, p4, 'a scampi dinner');
await comment(dan, p4, 'lovely photo');
check((await visible(bob, p4)).sort().join('|') === 'a scampi dinner|lovely photo', 'Hidden words: your own list hides comments with those words (whole words, any capitals), not part of other words');
await setS(ann, { 'comments.hideOffensive': true });
await comment(dan, p4, 'you are such an idiot');
await comment(dan, p4, 'what a lovely idiom');
check(!(await visible(bob, p4)).includes('you are such an idiot') && (await visible(bob, p4)).includes('what a lovely idiom'), 'Hide offensive comments hides common insults, not innocent words');
await setS(ann, { 'comments.hideOffensive': false });
await comment(dan, p4, 'you idiot');
check((await visible(bob, p4)).includes('you idiot'), 'and is off by default');
check((await comment(admin, p4, 'scam stopped')).success === true && (await visible(bob, p4)).includes('scam stopped'), 'the NOOB team is never hidden');

section('4c. @mentions');
const p5 = await mkPost(bob);
const mentions = async (uid) => (await q(`select count(*)::int n from public.notifications where target_user_id = $1 and type = 'mention'`, [uid]))[0].n;
await comment(ann, p5, 'hello @cat, look!');
check(await mentions(cat) === 1, 'a mention tells the person');
await comment(ann, p5, 'hello @cat and @cat again');
check(await mentions(cat) === 2, 'once per comment');
await comment(ann, p5, 'thanks @bob');
check((await q(`select count(*)::int n from public.notifications where target_user_id = $1 and type = 'mention'`, [bob]))[0].n === 0, 'the owner of the post is told as a comment, not as a mention too');
await setS(cat, { 'mentions.who': 'following' });
await expectFail(() => comment(ann, p5, 'hi @cat'), /cannot mention @cat/, 'Mentions from people you follow only: a stranger cannot');
await follow(cat, ann);
check((await comment(ann, p5, 'hi again @cat')).success === true, '... a person you follow can');
await setS(cat, { 'mentions.who': 'nobody' });
await expectFail(() => comment(ann, p5, 'hi @cat'), /cannot mention @cat/, 'No one: nobody can mention');
check((await comment(ann, p5, 'hi @not_a_person')).success === true, 'a name that is nobody is just text');
await setS(cat, { 'notif.mentions': false, 'mentions.who': 'everyone' });
await comment(ann, p5, 'quiet mention @cat');
check(await mentions(cat) === 3, 'a person who switched Mentions off is not notified');

section('5. Messages');
const newChat = (uid, other) => rpc(uid, 'create_chat', [other]);
const chatsBetween = async (a, b) => (await q(`select count(*)::int n from public.chats c where not c.is_group and (select count(*) from public.chat_members m where m.chat_id = c.id and m.user_id in ($1, $2)) = 2`, [a, b]))[0].n;
const e1 = await mkUser('e1'), e2 = await mkUser('e2'), e3 = await mkUser('e3');
check((await newChat(e1, e2)).success === true, 'by default anyone can start a chat (as before)');
await setS(e2, { 'msg.who': 'nobody' });
await expectFail(() => newChat(e3, e2), /not taking new messages/, 'No one: a new chat cannot be started');
check((await newChat(e1, e2)).success === true && await chatsBetween(e1, e2) === 1, '... but the chat that already exists carries on');
check((await newChat(admin, e2)).success === true, 'the NOOB team can always write');
await setS(e2, { 'msg.who': 'following' });
await expectFail(() => newChat(e3, e2), /not taking new messages/, 'People you follow: a stranger cannot start a chat');
await follow(e2, e3);
check((await newChat(e3, e2)).success === true, '... someone you follow can');
await setS(e2, { 'msg.who': 'connected' });
const e4 = await mkUser('e4');
await setS(e2, { 'limit.until': new Date(Date.now() + 3600e3).toISOString() });
await expectFail(() => newChat(e4, e2), /not taking new messages/, 'Limit interactions also holds back new chats from strangers');
await setS(e2, { 'limit.until': null });
check((await newChat(e4, e2)).success === true, '... until it ends');

section('5b. Story replies');
const story = (await q(`insert into public.stories (user_id, media_url) values ($1, 'stories/s.jpg') returning id`, [ann]))[0].id;
const reply = (uid) => rpc(uid, 'add_story_comment', story, 'nice');
check((await reply(bob)).success === true, 'by default everyone can reply');
await setS(ann, { 'msg.storyReplies': 'following' });
await expectFail(() => reply(dan), /Only people this account follows/, 'People you follow: others cannot');
check((await reply(cat)).success === true, '... someone ann follows can');
await setS(ann, { 'msg.storyReplies': 'off' });
await expectFail(() => reply(cat), /turned off/, 'Off: nobody can');
check((await rpc(ann, 'add_story_comment', story, 'my own story')).success === true && (await reply(admin)).success === true, '... except the owner and the team');
await setS(ann, { 'msg.storyReplies': 'everyone' });

section('5c. Sharing into messages and read receipts');
const f1 = await mkUser('f1'), f2 = await mkUser('f2');
const chat = (await newChat(f1, f2)).chat.id;
const sharedPost = await mkPost(f2);
const share = (uid, c) => rpc(uid, 'send_message', c, JSON.stringify({ sharedPostId: sharedPost, sharedPostType: 'post' }));
check((await share(f1, chat)).success !== false, 'by default a post can be shared in a chat');
await setS(f2, { 'share.toMessages': false });
await expectFail(() => share(f1, chat), /turned off sharing/, 'with sharing switched off by its owner, it cannot');
check((await rpc(f2, 'send_message', chat, JSON.stringify({ sharedPostId: sharedPost, sharedPostType: 'post' }))).success !== false, '... the owner can still share their own post');
await setS(f2, { 'share.toMessages': true });
const mine = (await rpc(f1, 'send_message', chat, JSON.stringify({ text: 'did you see it?' }))).message?.id;
const statusFor = async (uid, mid) => (await call(uid, `select public.message_json(m)->>'status' as s from public.messages m where m.id = $1`, [mid]))[0].s;
await q(`update public.chat_members set last_read_at = now() + interval '1 second' where chat_id = $1 and user_id = $2`, [chat, f2]);
check(await statusFor(f1, mine) === 'read', 'the sender sees "read" once the other person opened the chat');
await setS(f2, { 'msg.readReceipts': false });
check(await statusFor(f1, mine) === 'sent', 'with read receipts switched off by the reader, the sender sees "sent"');
await setS(f2, { 'msg.readReceipts': true });
check(await statusFor(f1, mine) === 'read', 'and "read" again when switched back on');

section('6. Tags');
const g1 = await mkUser('g1'), g2 = await mkUser('g2'), g3 = await mkUser('g3');
const tagPost = async (poster, tags, collab = null) => (await q(`insert into public.posts (user_id, caption, tagged_users, collab_username, is_collab) values ($1, 't', $2::jsonb, $3, $4) returning id, tagged_users, collab_username, is_collab`, [poster, JSON.stringify(tags), collab, !!collab]))[0];
const people = (...ids) => ids.map((id, i) => ({ userId: id, username: 'u' + i, x: 50, y: 50 }));
check((await tagPost(g1, people(g2, g3))).tagged_users.length === 2, 'by default anyone can be tagged');
await setS(g2, { 'tags.who': 'nobody' });
check((await tagPost(g1, people(g2, g3))).tagged_users.map((t) => t.userId).join() === g3, 'No one: that person is left out of the tags');
await setS(g2, { 'tags.who': 'following' });
check((await tagPost(g1, people(g2))).tagged_users.length === 0, 'People you follow: a stranger cannot tag');
await follow(g2, g1);
check((await tagPost(g1, people(g2))).tagged_users.length === 1, '... someone you follow can');
check((await tagPost(g2, people(g2))).tagged_users.length === 1, 'tagging yourself is always fine');
await setS(g2, { 'tags.who': 'nobody' });
const withCollab = await tagPost(g1, [], 'g2');
check(withCollab.collab_username === null && withCollab.is_collab === false, 'a collaborator invitation to someone who allows no tags is dropped');
const reel = (await q(`insert into public.reels (user_id, video_url, tagged_users) values ($1, 'reels/r.mp4', $2::jsonb) returning tagged_users`, [g1, JSON.stringify(people(g2, g3))]))[0];
check(reel.tagged_users.length === 1, 'the same for reels');
const slide = (await q(`insert into public.post_slides (post_id, position, media_url, media_type, tagged_users) values ($1, 0, 'posts/x.jpg', 'image', $2::jsonb) returning tagged_users`, [(await mkPost(g1)), JSON.stringify(people(g2, g3))]))[0];
check(slide.tagged_users.length === 1, '... and for each picture of a post');
check((await tagPost(admin, people(g2))).tagged_users.length === 1, 'the NOOB team is never held back');

section('7. Hide my story from...');
const h1 = await mkUser('h1'), h2 = await mkUser('h2');
const hs = (await q(`insert into public.stories (user_id, media_url) values ($1, 'stories/h.jpg') returning id`, [h1]))[0].id;
const trayAuthors = async (uid) => (await rpc(uid, 'home_story_tray')).stories.map((s) => s.userId);
check((await trayAuthors(h2)).includes(h1), 'by default a public account\'s story is in everyone\'s tray');
await add(h1, 'story_hide', h2);
check(!(await trayAuthors(h2)).includes(h1), 'hidden from someone: it is not in their tray');
check((await trayAuthors(bob)).includes(h1), '... but still is in everyone else\'s');
await expectFail(() => rpc(h2, 'story_by_id', hs), /cannot see this story/, 'and cannot be opened by a direct link either');
check((await rpc(h1, 'story_by_id', hs)) !== null, 'the owner always sees it');
await rpc(h1, 'settings_list_remove', 'story_hide', h2);
check((await trayAuthors(h2)).includes(h1), 'removing the person brings it back');

section('8. Like counts');
const l1 = await mkUser('l1');
const lp1 = await mkPost(l1);
await setS(l1, { 'likes.hideMine': true });
check((await q(`select is_like_count_hidden h from public.posts where id = $1`, [lp1]))[0].h === true, 'hiding on all my posts applies to the posts I already have');
const lp2 = await mkPost(l1);
check((await q(`select is_like_count_hidden h from public.posts where id = $1`, [lp2]))[0].h === true, '... and to new ones');
const lr = (await q(`insert into public.reels (user_id, video_url) values ($1, 'reels/l.mp4') returning is_like_count_hidden h`, [l1]))[0];
check(lr.h === true, '... and to reels');
check((await q(`select is_like_count_hidden h from public.posts where id = $1`, [await mkPost(bob)]))[0].h === false, 'other people\'s posts are not touched');
await setS(l1, { 'likes.hideMine': false });
check((await q(`select count(*)::int n from public.posts where user_id = $1 and is_like_count_hidden`, [l1]))[0].n === 0, 'switching it off shows them again');

section('9. What the pages list');
const mc = await rpc(bob, 'my_comments');
check(Array.isArray(mc) && mc.length >= 3 && mc[0].kind === 'post' && typeof mc[0].text === 'string' && mc.every((c) => c.id && c.targetId), 'my comments: newest first, with what they were on');
check(mc.every((c, i) => i === 0 || new Date(mc[i - 1].createdAt) >= new Date(c.createdAt)), '... in order');
check((await rpc(ann, 'my_comments')).every((c) => c.text !== undefined), 'for anyone');
await q(`insert into public.stories (user_id, media_url, created_at) values ($1, 'stories/old.jpg', now() - interval '3 days')`, [ann]);
const arch = await rpc(ann, 'my_stories_archive');
check(arch.length >= 2 && arch[0].mediaUrl && 'viewsCount' in arch[0], 'the stories archive lists every story I posted, including old ones');
check((await rpc(bob, 'my_stories_archive')).every((s) => s.mediaUrl !== 'stories/old.jpg'), 'and only mine');
const status = await rpc(ann, 'my_account_status');
check(status.standing === 'good' && status.reportsAgainstHandled === 0 && status.memberSince, 'account status: in good standing, nothing reviewed against it');
await q(`insert into public.reports (reporter_id, target_id, reason, status) values ($1, $2, 'spam', 'resolved'), ($1, $2, 'spam', 'pending_review')`, [bob, ann]);
check((await rpc(ann, 'my_account_status')).reportsAgainstHandled === 1, 'only reports that were reviewed are counted');
await q(`update public.profiles set is_suspended = true where id = $1`, [dan]);
await expectFail(() => setS(dan, { 'notif.likes': false }), /Not authenticated/, 'a suspended account cannot save settings');
await expectFail(async () => (await asAnon(db, async () => db.query(`select public.my_comments()`))), /permission denied/i, 'a visitor cannot read any of these');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
