// Tests the home-page story tray ordering (src/utils/storyTray.ts): rainbow (unseen) first, suggestions with a plus, grey (seen) last,
// and that the full-screen viewer's list lines up with the circles.
//
// Usage: node scripts/supabase/test-story-tray-model.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);

const data = new Map();
globalThis.localStorage = { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => { data.set(k, String(v)); }, removeItem: (k) => { data.delete(k); } };
const T = await import(pathToFileURL(path.resolve('src/utils/storyTray.ts')).href);

let n = 0;
const story = (userId, minutesAgo, extra = {}) => ({ id: `s${++n}`, userId, username: `u_${userId}`, userAvatar: `/a/${userId}.jpg`, isVerified: false, mediaUrl: 'x', mediaType: 'image', durationSeconds: 5,
  createdAt: new Date(Date.now() - minutesAgo * 60000).toISOString(), expiresAt: '', isCloseFriendsOnly: false, isViewed: false, ...extra });
const sug = (id) => ({ id, username: `sug_${id}`, avatar: `/a/${id}.jpg`, accountType: 'public' });

section('1. Order: you, unseen, suggestions, seen');
const stories = [
  story('seenA', 10, { isViewed: true }), story('newB', 30), story('newC', 5), story('me', 50), story('seenD', 2, { isViewed: true }), story('newE', 90),
];
const model = T.buildStoryTray(stories, [sug('x1'), sug('x2'), sug('x3')], 'me', new Set(), new Set());
const names = model.items.map((i) => i.userId);
check(names.join(',') === 'newC,newB,newE,x1,x2,x3,seenD,seenA', 'unseen (newest first), then suggestions in the given order, then seen', names.join(','));
check(model.items.filter((i) => i.kind === 'story').every((i) => i.ring === (i.userId.startsWith('seen') ? 'seen' : 'unseen')), 'rainbow for unseen, grey for seen');
check(model.items.filter((i) => i.kind === 'suggestion').every((i) => i.ring === 'none' && i.startIndex === -1), 'suggested accounts have no ring and no story');
check(model.own.hasStory && model.own.ring === 'unseen', 'my own story has a ring');

section('2. People I follow come first');
const followed = T.buildStoryTray(stories, [], 'me', new Set(['newE']), new Set());
check(followed.items[0].userId === 'newE', 'a followed person with a new story is ahead of newer strangers');

section('3. The viewer list lines up with the circles');
const vs = model.viewerStories;
check(vs.length === stories.length, 'every story is in the viewer list once');
check(vs[0].userId === 'me', 'my story plays first');
check(model.items.filter((i) => i.kind === 'story').every((i) => vs[i.startIndex].userId === i.userId), 'each circle starts at its own person\'s story');
const order = vs.map((s) => s.userId);
check(order.join(',') === 'me,newC,newB,newE,seenD,seenA', 'stories are played person after person, in circle order', order.join(','));

section('4. A person with several stories');
const multi = [story('p', 120), story('p', 60, { isViewed: true }), story('p', 5), story('q', 1, { isViewed: true })];
const m = T.buildStoryTray(multi, [], 'me');
const p = m.items.find((i) => i.userId === 'p');
check(m.viewerStories.filter((s) => s.userId === 'p').map((s) => s.createdAt).every((c, i, a) => i === 0 || a[i - 1] <= c), 'a person\'s stories play oldest first');
check(p.ring === 'unseen', 'one unseen story is enough for a rainbow ring');
check(m.viewerStories[p.startIndex].isViewed === false && m.viewerStories[p.startIndex].userId === 'p', 'it opens on a story not yet seen');
check(m.items.findIndex((i) => i.userId === 'p') < m.items.findIndex((i) => i.userId === 'q'), 'the fully seen person goes after');
const allSeen = T.buildStoryTray([story('r', 3, { isViewed: true }), story('r', 2, { isViewed: true })], [], 'me');
check(allSeen.items[0].ring === 'seen' && allSeen.viewerStories[allSeen.items[0].startIndex].userId === 'r', 'all seen: grey ring, opens at the start');

section('5. Suggestions are tidied');
const dup = T.buildStoryTray([story('a', 1)], [sug('a'), sug('me'), sug('z'), sug('z')], 'me');
check(dup.items.map((i) => `${i.kind}:${i.userId}`).join(',') === 'story:a,suggestion:z', 'no repeats, never me, and nobody who already has a story');
check(T.buildStoryTray([], [], 'me').items.length === 0 && !T.buildStoryTray([], [], 'me').own.hasStory, 'an empty tray is fine');
const sameStory = story('k', 1);
check(T.buildStoryTray([sameStory, sameStory], [], 'me').viewerStories.length === 1, 'a story repeated in the data counts once');

section('6. My own ring');
const mine = [story('me', 30), story('me', 10)];
const own1 = T.buildStoryTray(mine, [], 'me', new Set(), new Set());
check(own1.own.ring === 'unseen' && own1.own.startIndex === 0, 'not looked at yet: rainbow');
const own2 = T.buildStoryTray(mine, [], 'me', new Set(), new Set([mine[0].id]));
check(own2.own.ring === 'unseen' && own2.own.startIndex === 1, 'one new story added after looking: rainbow, starts at the new one');
const own3 = T.buildStoryTray(mine, [], 'me', new Set(), new Set(mine.map((s) => s.id)));
check(own3.own.ring === 'seen', 'looked at all of them: grey');
check(T.buildStoryTray([], [], 'me').own.ring === 'none', 'no story: no ring');
T.saveOwnSeenStoryIds(new Set(['a', 'b']));
check([...T.loadOwnSeenStoryIds()].join(',') === 'a,b', 'looking at my own story is remembered on this phone');
data.set('noob.ownStoriesSeen.v1', '{not json'); check(T.loadOwnSeenStoryIds().size === 0, 'damaged storage is ignored');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
