// The Share sheet (friends + apps), the row of friends at the top of Reels, and the addresses a post / reel / video / profile is shared with.
// The real sheet and row are driven in a real browser by the scratchpad check (share_check.mjs); this is what must keep holding on every change.
// Usage: node --liftoff-only scripts/supabase/test-share-sheet.mjs
import fs from 'node:fs';
import { TAB_PATHS, tabFromPath, cleanPath, contentPath, contentUrl, parseContentPath, parseContentQuery, isKnownPath, safeNextPath, FEATURE_PAGES } from '../../src/utils/routes.ts';
import { appLink, friendsFromChats, filterFriends, toggleFriend, topFriends, shareText, whatsappLink, MAX_FRIENDS_AT_ONCE } from '../../src/utils/shareTargets.ts';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8');

section('1. Addresses');
check(Object.keys(TAB_PATHS).length === 9 && new Set(Object.values(TAB_PATHS)).size === 9, 'every page of the bottom bar has its own address');
check(tabFromPath('/explore') === 'explore' && tabFromPath('/Reels/') === 'reels' && tabFromPath('/') === 'feed' && tabFromPath('/me') === 'profile' && tabFromPath('/home') === 'feed' && tabFromPath('/nope') === null, 'an address names its page (any case, with or without the last slash)');
check(cleanPath('//Explore///?a=1#b') === '/explore' && cleanPath('') === '/', 'addresses are tidied before they are compared');
check(contentPath('reel', 'abc') === '/reel/abc' && contentPath('post', 'p1') === '/p/p1' && contentPath('video', 'v1') === '/v/v1' && contentPath('profile', 'maya') === '/u/maya', 'a reel, post, video and profile each have a short address');
check(contentUrl('reel', 'abc', 'https://nooob.xyz') === 'https://nooob.xyz/reel/abc', 'the link is the whole address');
check(JSON.stringify(parseContentPath('/reel/abc123')) === '{"kind":"reel","id":"abc123"}' && parseContentPath('/p/x1y2').kind === 'post' && parseContentPath('/v/vid_1').kind === 'video' && parseContentPath('/u/maya.k').id === 'maya.k' && parseContentPath('/u/@maya').id === 'maya', 'those addresses are read back');
check(parseContentPath('/reel/') === null && parseContentPath('/reel/a') === null && parseContentPath('/reel/a b') === null && parseContentPath('/reel/../x') === null && parseContentPath('/reel/%E0%A4%A') === null && parseContentPath('/u/' + 'x'.repeat(50)) === null, 'a broken or odd address is not accepted as one');
check(parseContentPath('/reel/ABCdef') !== null && parseContentPath('/reel/ABCdef').id === 'ABCdef', 'the id keeps its capital letters');
check(JSON.stringify(parseContentQuery('?reel=r1')) === '{"kind":"reel","id":"r1"}' && parseContentQuery('?post=p1').kind === 'post' && parseContentQuery('?profile=maya').kind === 'profile' && parseContentQuery('?x=1') === null, 'the older "?reel=" links still open');
check(isKnownPath('/') && isKnownPath('/reels') && isKnownPath('/reel/abc') && isKnownPath('/about') && isKnownPath('/anonymous') && isKnownPath('/features/reels') && isKnownPath('/features'), 'every real page is a known address');
check(!isKnownPath('/this-page-does-not-exist') && !isKnownPath('/reel') && !isKnownPath('/features/nothing') && isKnownPath('/polls/abc', [(p) => p.startsWith('/polls/')]), 'anything else is a page not found (the Fun pages are added by their own rule)');
check(FEATURE_PAGES.length >= 6 && FEATURE_PAGES.every((f) => f.title && f.description.length > 20 && f.path.startsWith('/')), 'there is a page for each thing NOOB does');
check(safeNextPath('/reels') === '/reels' && safeNextPath('//evil.com') === null && safeNextPath('https://evil.com') === null && safeNextPath('/\\evil.com') === null && safeNextPath(null) === null && safeNextPath('/a\nb') === null, 'after logging in only an address of this site is ever followed');

section('2. Friends and apps');
const chat = (id, uid, name, at, extra = {}) => ({ id, isGroup: false, participants: [{ id: 'me', username: 'me' }, { id: uid, username: name.toLowerCase(), displayName: name }], lastMessage: at ? { createdAt: new Date(at).toISOString() } : undefined, ...extra });
const chats = [chat('c1', 'u1', 'Rahil', 1000), chat('c2', 'u2', 'Akash', 5000), chat('c3', 'u3', 'Mokshada', 0), chat('g', 'u9', 'Group', 9000, { isGroup: true }), chat('ai', 'ai', 'NOOB AI', 8000, { isAi: true }), chat('gl', 'gl', 'Global', 7000, { isGlobalDefault: true }), chat('c1b', 'u1', 'Rahil', 100)];
const friends = friendsFromChats(chats, 'me');
check(friends.map((f) => f.user.displayName).join() === 'Akash,Rahil,Mokshada', 'friends are the people with a direct chat, the newest chat first (no group, AI or Global chat, nobody twice)', friends.map((f) => f.user.displayName).join());
check(filterFriends(friends, 'ra').map((f) => f.user.username).join() === 'rahil' && filterFriends(friends, '@AKA').length === 1 && filterFriends(friends, '').length === 3 && filterFriends(friends, 'zzz').length === 0, 'search finds by name or @username, in any case');
let sel = new Set();
for (let i = 0; i < 7; i++) sel = toggleFriend(sel, 'c' + i);
check(sel.size === MAX_FRIENDS_AT_ONCE && MAX_FRIENDS_AT_ONCE === 5 && toggleFriend(sel, 'c0').size === 4, 'up to five can be picked; picking one again unpicks it');
check(topFriends(friends, 2).length === 2 && topFriends(friends).length === 3 && topFriends(friends, 0).length === 0, 'the top of Reels shows the first few');
const content = { url: 'https://nooob.xyz/reel/abc', text: 'Watch this reel by @maya on NOOB' };
check(appLink('whatsapp', content) === 'https://wa.me/?text=' + encodeURIComponent('Watch this reel by @maya on NOOB https://nooob.xyz/reel/abc') && whatsappLink(content).startsWith('https://wa.me/'), 'WhatsApp gets the words and the link');
check(appLink('x', content).startsWith('https://twitter.com/intent/tweet?text=') && appLink('x', content).endsWith('&url=' + encodeURIComponent(content.url)), 'X gets a ready post');
check(appLink('telegram', content).startsWith('https://t.me/share/url?url=') && appLink('facebook', content) === 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(content.url), 'Telegram and Facebook get the link');
check(appLink('messages', content).startsWith('sms:?&body=') && appLink('email', content).startsWith('mailto:?subject=') && appLink('instagram', content) === null, 'Messages and Email open the phone\'s own apps; Instagram has no link of its own');
check(shareText('reel', 'maya') === 'Watch this reel by @maya on NOOB' && shareText('video') === 'Have a look at this video on NOOB', 'the words that go with the link');
check(!/<script|javascript:/i.test(appLink('whatsapp', { url: 'https://x/"><script>', text: '<b>' })), 'what is shared is encoded, never put into the address raw');

section('3. How the pieces are wired');
const sheet = read('src/components/Common/SharePostSheet.tsx');
const reels = read('src/components/Reels/ReelsView.tsx');
const strip = read('src/components/Reels/ReelFriendsStrip.tsx');
check(/MAX_FRIENDS_AT_ONCE/.test(sheet) && /data-testid="share-search"/.test(sheet) && /data-testid="share-send"/.test(sheet) && /sharedPostId: itemId, sharedPostType: type/.test(sheet), 'the sheet has search, friends to pick, and sends the item to each');
check(['whatsapp', 'instagram', 'x', 'facebook', 'telegram', 'messages', 'email'].every((id) => new RegExp(`id: '${id}'`).test(sheet)) && /navigator\.share/.test(sheet) && /Copy link/.test(sheet), 'it has WhatsApp, Instagram, X, Facebook, Telegram, Messages, Email, Copy link and More');
check(/contentUrl\(/.test(sheet) && /noopener,noreferrer/.test(sheet), 'links are the short addresses, and other sites open without being able to reach back');
for (const f of ['src/components/Feed/PostCard.tsx', 'src/components/Feed/FeedVideoWatchView.tsx', 'src/components/Reels/ReelsView.tsx', 'src/components/Videos/HomeVideoFeedView.tsx']) {
  const s = read(f);
  check(/<SharePostSheet [^>]*currentUser=\{currentUser\} itemId=/.test(s) && !/SharePostToChatModal/.test(s), `${f.split('/').pop()} opens the new sheet`);
}
check(!fs.existsSync('src/components/Common/SharePostToChatModal.tsx'), 'the old two-step "Send in Chat" window is gone');
check(/<ReelFriendsStrip currentUser=\{currentUser\} reelId=\{currentReel\?\.id\} \/>/.test(reels) && reels.indexOf('<ReelFriendsStrip') < reels.indexOf('reel-sound-button'), 'the faces are in the title bar of Reels, before the sound button');
check(/topFriends\(friendsFromChats\(chats, currentUser\.id\), 4\)/.test(strip) && /sharedPostId: reelId, sharedPostType: 'reel'/.test(strip) && /if \(busy \|\| sent\[key\]\) return;/.test(strip), 'four faces; a tap sends the reel on the screen, once');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
