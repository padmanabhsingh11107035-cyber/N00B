// @ts-nocheck
// Canned answers for the fake backend (see README.md). Every rpc is a function (args, ctx) => JSON; return undefined for "null".
// ctx = { state: 'full'|'empty'|'loading'|'error', admin: boolean, voted: boolean, user }.
// An rpc that is not in this table answers null and logs  [harness] no mock for rpc "<name>"  to the console.

const H = 3600e3, D = 24 * H;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const ahead = (ms: number) => new Date(Date.now() + ms).toISOString();
const day = (n: number) => new Date(Date.now() - n * D).toISOString().slice(0, 10);

export const FAKE_USER_ID = '7b0c1e52-3f1a-4c55-9a52-0d6d2f4b8e11';
export const makeUser = (admin: boolean) => ({
  id: FAKE_USER_ID, username: admin ? 'noob' : 'aarav.sharma', displayName: admin ? 'NOOB' : 'Aarav Sharma',
  email: 'aarav@example.com', avatar: '/noob-logo-circle.png', bio: 'Cricket, chai and bad puns.', accountType: 'public', isVerified: true, verificationTier: 'standard',
  followersCount: 1284, followingCount: 312, postsCount: 47, noobPoints: 187500000, isAdmin: admin, adminPermissions: admin ? [] : undefined, agreedToTerms: true
});

// people (Indian names, local pictures)
const PEOPLE = [
  { userId: 'p1', username: 'priya.nair', displayName: 'Priya Nair', avatar: '/avatars/amara.webp', isVerified: true },
  { userId: 'p2', username: 'rohan_k', displayName: 'Rohan Kulkarni', avatar: '/noob-logo-circle.png', isVerified: false },
  { userId: 'p3', username: 'ananya.iyer', displayName: 'Ananya Iyer', avatar: '/avatars/azura.webp', isVerified: false },
  { userId: 'p4', username: 'vikram.singh', displayName: 'Vikram Singh', avatar: '/avatars/amara-top.webp', isVerified: true }
];

// ---------------------------------------------------------------- NOOB Draw
const P = (id, kind, label, subtitle, rarity, weight, amount = null, ref = null) => ({ id, kind, label, subtitle, rarity, weight, amount, ref });
const PACKS = [
  { id: 'rookie', name: 'Rookie Spin', tagline: 'Free points, every week', price: 100000000, lastSpinAt: ago(9 * D), availableAt: null, prizes: [
    P('rk_1m', 'points', '1,000,000 Points', 'NOOB Points', 'common', 3200, 1e6), P('rk_2m', 'points', '2,000,000 Points', 'NOOB Points', 'common', 2600, 2e6),
    P('rk_5m', 'points', '5,000,000 Points', 'NOOB Points', 'uncommon', 1800, 5e6), P('rk_10m', 'points', '10,000,000 Points', 'NOOB Points', 'uncommon', 1000, 1e7),
    P('rk_25m', 'points', '25,000,000 Points', 'NOOB Points', 'rare', 600, 2.5e7), P('rk_stk', 'stickers', 'Starter Stickers', '3 exclusive animated stickers', 'rare', 400, null, 'spark,coin,clover'),
    P('rk_50m', 'points', '50,000,000 Points', 'NOOB Points', 'epic', 200, 5e7), P('rk_pro', 'pro', 'NOOB Pro Starter', '7 days of Pro', 'epic', 120),
    P('rk_100m', 'points', '100,000,000 Points', 'NOOB Points', 'legendary', 80, 1e8)] },
  { id: 'neon', name: 'Neon Spin', tagline: 'Stickers & live profiles', price: 100000000, lastSpinAt: null, availableAt: null, prizes: [
    P('nn_2m', 'points', '2,000,000 Points', 'NOOB Points', 'common', 3000, 2e6), P('nn_5m', 'points', '5,000,000 Points', 'NOOB Points', 'common', 2000, 5e6),
    P('nn_stk1', 'stickers', 'Neon Stickers', '4 exclusive animated stickers', 'uncommon', 1800, null, 'bolt,neon-heart,ghost,eye'), P('nn_10m', 'points', '10,000,000 Points', 'NOOB Points', 'uncommon', 1000, 1e7),
    P('nn_av1', 'live_avatar', 'Neon Pulse', 'Live profile picture', 'rare', 500, null, 'neon_pulse'), P('nn_av2', 'live_avatar', 'Aurora Wave', 'Live profile picture', 'rare', 400, null, 'aurora_wave'),
    P('nn_25m', 'points', '25,000,000 Points', 'NOOB Points', 'rare', 500, 2.5e7), P('nn_av3', 'live_avatar', 'Cyber Grid', 'Live profile picture', 'epic', 300, null, 'cyber_grid'),
    P('nn_stk2', 'stickers', 'Golden Stickers', '6 exclusive animated stickers', 'epic', 250, null, 'crown,gem,trophy,rocket,star,flame'),
    P('nn_av4', 'live_avatar', 'Holographic', 'Live profile picture', 'legendary', 150, null, 'holographic_foil')] },
  { id: 'royal', name: 'Royal Spin', tagline: 'NOOB Pro plans', price: 100000000, lastSpinAt: ago(2 * D), availableAt: ahead(5 * D + 3 * H), prizes: [
    P('ry_5m', 'points', '5,000,000 Points', 'NOOB Points', 'common', 3000, 5e6), P('ry_10m', 'points', '10,000,000 Points', 'NOOB Points', 'common', 2000, 1e7),
    P('ry_st7', 'pro', 'NOOB Pro Starter', '7 days of Pro', 'uncommon', 2000), P('ry_pl7', 'pro', 'NOOB Pro Plus', '7 days of Pro', 'rare', 1200), P('ry_pr7', 'pro', 'NOOB Pro', '7 days of Pro', 'rare', 800),
    P('ry_el7', 'pro', 'NOOB Pro Elite', '7 days of Pro', 'epic', 450), P('ry_ul7', 'pro', 'NOOB Pro Ultimate', '7 days of Pro', 'epic', 300),
    P('ry_pr30', 'pro', 'NOOB Pro', '30 days of Pro', 'legendary', 150), P('ry_ul30', 'pro', 'NOOB Pro Ultimate', '30 days of Pro', 'legendary', 100)] },
  { id: 'inferno', name: 'Inferno Spin', tagline: 'Millions of points', price: 100000000, lastSpinAt: ago(4 * D), availableAt: ahead(3 * D + 11 * H + 20 * 60e3), prizes: [
    P('if_10m', 'points', '10,000,000 Points', 'NOOB Points', 'common', 3000, 1e7), P('if_20m', 'points', '20,000,000 Points', 'NOOB Points', 'common', 2200, 2e7),
    P('if_30m', 'points', '30,000,000 Points', 'NOOB Points', 'uncommon', 1800, 3e7), P('if_50m', 'points', '50,000,000 Points', 'NOOB Points', 'uncommon', 1200, 5e7),
    P('if_100m', 'points', '100,000,000 Points', 'NOOB Points', 'rare', 900, 1e8), P('if_200m', 'points', '200,000,000 Points', 'NOOB Points', 'rare', 500, 2e8),
    P('if_300m', 'points', '300,000,000 Points', 'NOOB Points', 'epic', 200, 3e8), P('if_500m', 'points', '500,000,000 Points', 'NOOB Points', 'epic', 100, 5e8),
    P('if_750m', 'points', '750,000,000 Points', 'NOOB Points', 'legendary', 70, 7.5e8), P('if_1b', 'points', '1,000,000,000 Points', 'NOOB Points', 'legendary', 30, 1e9)] },
  { id: 'galaxy', name: 'Galaxy Spin', tagline: 'Legendary prizes', price: 250000000, lastSpinAt: ago(1 * D), availableAt: ahead(6 * D + 1 * H), prizes: [
    P('gx_25m', 'points', '25,000,000 Points', 'NOOB Points', 'common', 3000, 2.5e7), P('gx_50m', 'points', '50,000,000 Points', 'NOOB Points', 'common', 2500, 5e7),
    P('gx_100m', 'points', '100,000,000 Points', 'NOOB Points', 'uncommon', 1700, 1e8), P('gx_stk', 'stickers', 'Golden Stickers', '6 exclusive animated stickers', 'rare', 900, null, 'crown,gem,trophy,rocket,star,flame'),
    P('gx_el7', 'pro', 'NOOB Pro Elite', '7 days of Pro', 'rare', 700), P('gx_ul30', 'pro', 'NOOB Pro Ultimate', '30 days of Pro', 'epic', 400),
    P('gx_av', 'live_avatar', 'Royal Crown', 'Live profile picture', 'epic', 300, null, 'royal_crown'), P('gx_500m', 'points', '500,000,000 Points', 'NOOB Points', 'epic', 250, 5e8),
    P('gx_el30', 'pro', 'NOOB Pro Elite', '30 days of Pro', 'legendary', 120), P('gx_1b', 'points', '1,000,000,000 Points', 'NOOB Points', 'legendary', 70, 1e9),
    P('gx_ul90', 'pro', 'NOOB Pro Ultimate', '90 days of Pro', 'legendary', 40)] }
];
const withOdds = (pack) => { const t = pack.prizes.reduce((s, p) => s + p.weight, 0); return { ...pack, prizes: pack.prizes.map(({ weight, ...p }) => ({ ...p, odds: Math.round((weight / t) * 1000) / 10 })) }; };

const drawState = (ctx) => {
  const empty = ctx.state === 'empty';
  const packs = PACKS.map((p, i) => withOdds(empty ? { ...p, lastSpinAt: null, availableAt: ahead((i + 1) * D) } : p));
  return {
    now: new Date().toISOString(), freePeriod: 'week', packs,
    history: empty ? [] : [
      { pack: 'rookie', packName: 'Rookie Spin', label: '10,000,000 Points', rarity: 'uncommon', kind: 'points', message: '10,000,000 points were added to your balance.', at: ago(9 * D) },
      { pack: 'royal', packName: 'Royal Spin', label: 'NOOB Pro Plus', rarity: 'rare', kind: 'pro', message: '7 days of NOOB Pro Plus are now active.', at: ago(2 * D) },
      { pack: 'inferno', packName: 'Inferno Spin', label: '100,000,000 Points', rarity: 'rare', kind: 'points', message: null, at: ago(4 * D), paid: true, cost: 100000000 },
      { pack: 'galaxy', packName: 'Galaxy Spin', label: 'Golden Stickers', rarity: 'rare', kind: 'stickers', message: 'Six stickers were added to your sticker tray.', at: ago(1 * D) }
    ],
    ticker: empty ? [] : [
      { username: 'priya.nair', label: '500,000,000 Points', rarity: 'epic', packName: 'Galaxy Spin', at: ago(40 * 60e3) }, { username: 'rohan_k', label: 'Cyber Grid', rarity: 'epic', packName: 'Neon Spin', at: ago(3 * H) },
      { username: 'ananya.iyer', label: '1,000,000,000 Points', rarity: 'legendary', packName: 'Inferno Spin', at: ago(5 * H) }, { username: 'vikram.singh', label: 'NOOB Pro Ultimate', rarity: 'legendary', packName: 'Royal Spin', at: ago(9 * H) },
      { username: 'meera_d', label: '5,000,000 Points', rarity: 'uncommon', packName: 'Rookie Spin', at: ago(11 * H) }
    ],
    unlockedAvatars: empty ? [] : [{ id: 'neon_pulse', name: 'Neon Pulse', url: '/live-avatars/neon-pulse.svg' }, { id: 'aurora_wave', name: 'Aurora Wave', url: '/live-avatars/aurora-wave.svg' }]
  };
};

// ---------------------------------------------------------------- This or That
const totQ = (n, a, b, ea, eb, rA, myVote) => ({ id: 'tq' + n, seq: n, optionA: a, optionB: b, emojiA: ea, emojiB: eb, day: day(41 - n), isToday: n === 41, myVote: myVote ?? null, results: myVote !== undefined || n < 41 ? { a: rA, b: Math.max(0, 1000 + n * 7 - rA), total: 1000 + n * 7 } : null });
const TOT_PREV = () => [
  totQ(40, 'Chai', 'Coffee', '☕', '🧋', 612, 'a'), totQ(39, 'Beach holiday with friends', 'Mountain trek alone at sunrise', '🏖️', '🏔️', 388, 'b'), totQ(38, 'Cricket', 'Football', '🏏', '⚽', 701, 'a'),
  totQ(37, 'Biryani', 'Pizza', '🍛', '🍕', 543, 'a'), totQ(36, 'Reply instantly', 'Reply after two hours', '⚡', '🐢', 291, 'b'), totQ(35, 'Rain', 'Sunshine', '🌧️', '☀️', 478, 'a')
];
let totVote = null;
const totToday = (ctx) => (ctx.state === 'empty' ? null : totQ(41, 'Night owl', 'Early bird', '🦉', '🐦', 436, ctx.voted || totVote ? (totVote || 'a') : undefined));

// ---------------------------------------------------------------- Ask Me Anything
let ASK = null;
const askData = () => ASK ?? (ASK = [
  { id: 'aq1', body: 'What is the one song you have on repeat this week?', createdAt: ago(25 * 60e3), answer: null, answeredAt: null, answerPublic: false, reported: false },
  { id: 'aq2', body: 'Be honest, do you actually like cricket or do you just play it because everyone does?', createdAt: ago(3 * H), answer: null, answeredAt: null, answerPublic: false, reported: false },
  { id: 'aq3', body: 'Kya tum kabhi apni pehli kamai se kuch kharida tha? Kya?', createdAt: ago(9 * H), answer: null, answeredAt: null, answerPublic: false, reported: true },
  { id: 'aq4', body: 'hi 👋', createdAt: ago(1.2 * D), answer: null, answeredAt: null, answerPublic: false, reported: false },
  { id: 'aq5', body: 'Which game on NOOB should I try first? I only have 10 minutes a day.', createdAt: ago(2 * D), answer: 'Brick Escape. It is quick, it is clever, and the first ten levels fit inside one chai break.', answeredAt: ago(1.8 * D), answerPublic: true, reported: false },
  { id: 'aq6', body: 'Best street food in your city?', createdAt: ago(3 * D), answer: 'Pav bhaji from the cart outside the station. No contest. 🔥', answeredAt: ago(2.9 * D), answerPublic: true, reported: false },
  { id: 'aq7', body: 'Do you ever get tired of being online?', createdAt: ago(4 * D), answer: 'Yes. That is why I keep my phone in another room after 10 pm.', answeredAt: ago(3.5 * D), answerPublic: false, reported: false }
]);
const askInbox = (a, ctx) => {
  if (ctx.state === 'empty') return { questions: [], hasMore: false, counts: { new: 0, answered: 0 } };
  const all = askData(); const f = a.p_filter || 'new';
  const list = all.filter((q) => (f === 'all' ? true : f === 'answered' ? !!q.answer : !q.answer));
  return { questions: list, hasMore: false, counts: { new: all.filter((q) => !q.answer).length, answered: all.filter((q) => !!q.answer).length } };
};

// ---------------------------------------------------------------- Public Polls
const POLL_DEFS = [
  { id: 'pl1', seq: 12, q: 'Which festival do you look forward to the most?', opts: [['Diwali', 4210], ['Holi', 3188], ['Eid', 1904], ['Navratri', 2650], ['Christmas', 870]], by: 0, createdH: 3, endsH: 21, rule: 'after_vote' },
  { id: 'pl2', seq: 11, q: 'Best time to study?', opts: [['Early morning', 912], ['Late night', 1306]], by: 1, createdH: 30, endsH: 18, rule: 'always' },
  { id: 'pl3', seq: 10, q: 'Should NOOB add a daily streak for Ask Me Anything answers?', opts: [['Yes, please', 540], ['No, keep it relaxed', 211], ['Only a small badge', 388]], by: 3, createdH: 12, endsH: 60, rule: 'after_end' },
  { id: 'pl4', seq: 9, q: 'Which is the better snack for a long bus ride: a packet of masala chips, a box of homemade parathas, or fresh fruit from the stall at the last stop?', opts: [['Masala chips', 702], ['Parathas', 1480], ['Fresh fruit', 233]], by: 2, createdH: 100, endsH: -20, rule: 'always' },
  { id: 'pl5', seq: 8, q: 'Phone on silent during class?', opts: [['Always', 1802], ['Sometimes', 640], ['Never', 77]], by: 0, createdH: 200, endsH: -90, rule: 'always' },
  { id: 'pl6', seq: 7, q: 'Favourite NOOB corner?', opts: [['Reels', 3120], ['Games', 2411], ['Chat', 1966], ['Music Hub', 842], ['Draw', 1204], ['Studio', 503]], by: 'me', createdH: 50, endsH: 120, rule: 'after_vote' }
];
const POLL_VOTES = { pl2: 'pl2_o0', pl4: 'pl4_o1' };
const pollOf = (d, ctx) => {
  const ended = d.endsH <= 0; const myVote = (ctx.voted ? POLL_VOTES[d.id] || d.id + '_o0' : POLL_VOTES[d.id]) || null;
  const shown = ended || d.rule === 'always' || (d.rule === 'after_vote' && !!myVote);
  const mine = d.by === 'me'; const creator = mine ? { userId: FAKE_USER_ID, username: ctx.user.username, displayName: ctx.user.displayName, avatar: ctx.user.avatar, isVerified: true } : PEOPLE[d.by];
  const total = d.opts.reduce((s, o) => s + o[1], 0);
  return { id: d.id, seq: d.seq, question: d.q, options: d.opts.map((o, i) => ({ id: d.id + '_o' + i, position: i, label: o[0], votes: shown ? o[1] : null })), creator, createdAt: ago(d.createdH * H), endsAt: ahead(d.endsH * H),
    ended, status: ended ? 'completed' : 'active', resultsVisibility: d.rule, resultsShown: shown, totalVotes: shown ? total : null, myVote, isMine: mine };
};
const pollList = (a, ctx) => {
  if (ctx.state === 'empty') return { polls: [], hasMore: false };
  const tab = a.p_tab || 'active'; const polls = POLL_DEFS.map((d) => pollOf(d, ctx)).filter((p) => (tab === 'mine' ? p.isMine : tab === 'ended' ? p.ended : !p.ended));
  return { polls, hasMore: false };
};

// ---------------------------------------------------------------- Anonymous messages
const ANON = [
  ['Exams are coming and I have not opened a single book. Anyone else?', 14 * 60e3], ['Thank you to whoever fixed the broken swing in the park. It made my little sister so happy.', 2 * H],
  ['Sometimes I just want to say I am proud of my best friend and never find the words. So: I am proud of you, S.', 5 * H], ['Why is the canteen samosa suddenly so small? Asking for a hungry nation.', 8 * H],
  ['I deleted my streak on purpose. Feels lighter.', 1.1 * D], ['To the person who left a note on my cycle: yes, I will fix the brake today. 😅', 1.4 * D],
  ['Does anyone else think the 7 am class should be illegal?', 2 * D], ['Be kind. Everyone is carrying something you cannot see.', 3 * D]
].map(([body, ms], i) => ({ id: 'an' + (i + 1), body, createdAt: ago(ms) }));
const anonFeed = (ctx) => (ctx.state === 'empty' ? { messages: [], hasMore: false } : { messages: ANON, hasMore: false });
const anonAdmin = (ctx) => (ctx.state === 'empty' ? { messages: [], hasMore: false } : { messages: ANON.map((m, i) => ({ ...m, hidden: i === 3, reportCount: [0, 0, 0, 3, 0, 1, 0, 0][i], reasons: i === 3 ? ['Spam or advertising', 'Something else', 'Spam or advertising'] : i === 5 ? ['Harassment or hate'] : [] })), hasMore: false });

// ---------------------------------------------------------------- NOOB Forms
const o = (id, label) => ({ id, label });
const QS = [
  { id: 'q1', type: 'short', title: 'Your name', required: true }, { id: 'q2', type: 'email', title: 'Email address', required: true },
  { id: 'q3', type: 'multiple_choice', title: 'Which session will you attend?', required: true, options: [o('a', 'Morning (9 am)'), o('b', 'Afternoon (2 pm)'), o('c', 'Evening (6 pm)')] },
  { id: 'q4', type: 'scale', title: 'How excited are you?', min: 1, max: 5, minLabel: 'Meh', maxLabel: 'Very!' },
  { id: 'q5', type: 'checkboxes', title: 'What should we bring?', options: [o('x', 'Snacks'), o('y', 'Speakers'), o('z', 'Board games')], allowOther: true },
  { id: 'q6', type: 'paragraph', title: 'Anything else we should know?', placeholder: 'Type here' }
];
const DRAFT = { questions: QS, settings: { presentation: 'classic', showProgress: true, confirmMessage: 'Thank you! See you there.' }, theme: { id: 'classic' } };
const FORM = (id, title, description, status, count, daysAgo) => ({ owner_id: FAKE_USER_ID, id, title, description, slug: status === 'draft' ? null : 'cs-' + id, status, draft: DRAFT, published: status === 'draft' ? null : DRAFT, version: 1, response_count: count, starred: id === 'f1',
  folder: null, archived_at: null, deleted_at: null, published_at: status === 'draft' ? null : ago(daysAgo * D), created_at: ago((daysAgo + 5) * D), updated_at: ago(daysAgo * D) });
const FORMS = () => [FORM('f1', 'Diwali get-together RSVP', 'Tell us who is coming and what you will bring.', 'published', 128, 2), FORM('f2', 'Customer feedback', 'How was your order from the NOOB shop?', 'published', 36, 9),
  FORM('f3', 'Club registration 2026', 'Cricket, chess and coding club.', 'closed', 412, 40), FORM('f4', 'Untitled form', '', 'draft', 0, 0)];


// ---------------------------------------------------------------- Mood Status
// &mood=none = I have no mood set; &long=1 = very long note / names; state=empty = nobody shares a mood
const moodQ = (k) => new URLSearchParams(location.search).get(k);
let moodMine = undefined;
const myMood = (ctx) => {
  if (moodMine !== undefined) return moodMine;
  if (ctx.state === 'empty' || moodQ('mood') === 'none') return null;
  return { mood: 'happy', note: moodQ('long') === '1' ? 'Finally finished the whole semester project and the demo went far better than anyone in the team expected, so tonight is chai and a very long walk' : 'Chai, cricket and a free evening', updatedAt: ago(2 * H), visibility: 'followers', expiresAt: ahead(11 * H) };
};
const MOOD_PEOPLE = () => {
  const long = moodQ('long') === '1';
  return [
    { ...PEOPLE[0], mood: 'excited', note: long ? 'Got the internship offer from the company I wanted most, still shaking, calling everyone I know right now!!' : 'Got the internship offer!', updatedAt: ago(12 * 60e3) },
    { ...PEOPLE[1], displayName: long ? 'Rohan Kulkarni-Deshpande the Third of Pune' : 'Rohan Kulkarni', mood: 'tired', note: '', updatedAt: ago(1.5 * H) },
    { ...PEOPLE[2], mood: 'loved', note: 'Mom made rajma chawal', updatedAt: ago(3 * H) },
    { ...PEOPLE[3], mood: 'angry', note: 'Third power cut today', updatedAt: ago(5 * H) },
    { userId: 'p5', username: 'meera.j', displayName: 'Meera Joshi', avatar: '', isVerified: false, mood: 'bored', note: '', updatedAt: ago(9 * H) },
    { userId: 'p6', username: 'kabir.m', displayName: 'Kabir Mehta', avatar: '', isVerified: false, mood: 'confident', note: 'Presentation at 10', updatedAt: ago(20 * H) }
  ];
};
const moodPage = (ctx, filter) => (ctx.state === 'empty' ? { moods: [], hasMore: false } : { moods: MOOD_PEOPLE().filter((m) => !filter || m.mood === filter), hasMore: false });

// ---------------------------------------------------------------- the table of rpc answers
export const rpcMocks = {
  mood_my: (a, ctx) => myMood(ctx) ?? null,
  mood_friends: (a, ctx) => moodPage(ctx),
  mood_community: (a, ctx) => moodPage(ctx, a.p_mood),
  mood_set: (a) => (moodMine = { mood: a.p_mood, note: a.p_note, visibility: a.p_visibility, updatedAt: new Date().toISOString(), expiresAt: a.p_expire_hours ? ahead(a.p_expire_hours * H) : null }),
  mood_set_until: (a) => (moodMine = { mood: a.p_mood, note: a.p_note, visibility: a.p_visibility, updatedAt: new Date().toISOString(), expiresAt: a.p_expires_at }),
  mood_clear: () => { moodMine = null; return null; },
  noob_draw_state: (a, ctx) => drawState(ctx),
  noob_draw_spin: (a, ctx) => {
    const pack = PACKS.find((p) => p.id === a.p_pack) || PACKS[0]; const prize = pack.prizes[Math.min(4, pack.prizes.length - 1)];
    return { success: true, paid: !!a.p_paid, prize: { id: prize.id, kind: prize.kind, label: prize.label, subtitle: prize.subtitle, rarity: prize.rarity, amount: prize.amount, ref: prize.ref, applied: 'ok', message: prize.kind === 'points' ? `${prize.label} were added to your balance.` : `${prize.label} is yours.`, presetId: prize.kind === 'live_avatar' ? prize.ref : undefined },
      user: { ...ctx.user, noobPoints: ctx.user.noobPoints + (prize.amount || 0) } };
  },
  apply_live_avatar: (a, ctx) => ({ user: { ...ctx.user, isLiveAvatar: true, avatar: '/live-avatars/' + String(a.p_preset || 'neon_pulse').replace(/_/g, '-') + '.svg' } }),

  fun_can_manage: (a, ctx) => !!ctx.admin,
  tot_today: (a, ctx) => totToday(ctx) ?? null,
  tot_previous: (a, ctx) => (ctx.state === 'empty' ? { questions: [], hasMore: false } : { questions: TOT_PREV(), hasMore: false }),
  tot_vote: (a, ctx) => { totVote = a.p_choice; return totQ(41, 'Night owl', 'Early bird', '🦉', '🐦', a.p_choice === 'a' ? 437 : 436, a.p_choice); },
  tot_admin_list: () => ({ questions: [totQ(43, 'Sweet', 'Spicy', '🍬', '🌶️', 0), totQ(42, 'Movie night', 'Game night', '🎬', '🎮', 0)].map((q) => ({ ...q, results: null, day: day(-1), isToday: false })), hasMore: false }),

  ask_my_settings: (a, ctx) => ({ enabled: true, username: ctx.user.username }),
  ask_inbox: askInbox,
  ask_profile_public: (a, ctx) => { const p = PEOPLE.find((x) => x.username === a.p_username) || { userId: 'p9', username: a.p_username, displayName: String(a.p_username).replace(/[._]/g, ' '), avatar: '/avatars/amara.webp', isVerified: false }; return { ...p, enabled: true }; },
  ask_public_answers: () => ({ answers: askData().filter((q) => q.answer && q.answerPublic).map((q) => ({ id: q.id, question: q.body, answer: q.answer, answeredAt: q.answeredAt })), hasMore: false }),
  ask_send: () => null,
  ask_answer: (a) => { const q = askData().find((x) => x.id === a.p_question); Object.assign(q, { answer: a.p_answer, answeredAt: new Date().toISOString(), answerPublic: !!a.p_public }); return q; },
  ask_set_public: (a) => { const q = askData().find((x) => x.id === a.p_question); q.answerPublic = !!a.p_public; return q; },
  ask_delete: (a) => { ASK = askData().filter((x) => x.id !== a.p_question); return null; },
  ask_report: () => null, ask_block_sender: () => null, ask_set_enabled: (a) => ({ enabled: !!a.p_enabled }),
  ask_admin_reports: () => ({ reports: [{ id: 'aq3', body: 'Kya tum kabhi apni pehli kamai se kuch kharida tha? Kya?', createdAt: ago(9 * H), reportedAt: ago(2 * H), reason: 'Something else', toUsername: 'aarav.sharma' }] }),

  poll_list: pollList,
  poll_get: (a, ctx) => { const d = POLL_DEFS.find((x) => x.id === a.p_poll); return d ? pollOf(d, ctx) : null; },
  poll_vote: (a, ctx) => { const d = POLL_DEFS.find((x) => x.id === a.p_poll); POLL_VOTES[d.id] = a.p_option; return pollOf(d, ctx); },
  poll_create: (a, ctx) => ({ ...pollOf(POLL_DEFS[5], ctx), question: a.p_question }),
  poll_admin_reports: () => ({ reports: [] }), poll_report: () => ({ ok: true, hidden: false }), poll_remove: () => null,

  anon_messages_feed: (a, ctx) => anonFeed(ctx),
  anon_messages_admin_feed: (a, ctx) => anonAdmin(ctx),
  anon_message_post: (a) => ({ id: 'an_new', body: a.p_body, createdAt: new Date().toISOString() }),
  anon_message_report: () => ({ ok: true, hidden: false }),

  form_role: () => 'owner', form_publish: () => null, form_collab_list: () => [],
  form_public_get: (a, ctx) => (ctx.state === 'empty' ? { state: 'notfound' } : { state: 'open', id: 'f1', title: 'Diwali get-together RSVP', description: 'Tell us who is coming and what you will bring.', version: 1, questions: QS, theme: DRAFT.theme, settings: DRAFT.settings }),
  form_public_submit: () => ({ ok: true, result: null }),

  // generic things the shell asks on start
  get_app_settings: () => ({}), is_account_suspended: () => false, list_music_tracks: () => []
};

// PostgREST tables (GET). Return an array of rows (the fake fetch picks the first one for single-row requests).
export const tableMocks = {
  forms: (query, ctx) => (ctx.state === 'empty' ? [] : FORMS().filter((f) => !query.get('id') || query.get('id') === 'eq.' + f.id)),
  form_collaborators: () => [], form_responses: () => [], form_webhooks: () => [], form_webhook_deliveries: () => []
};
