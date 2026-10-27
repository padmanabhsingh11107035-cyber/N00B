// A pretend Supabase for LOOKING at the app on this computer when the real one is switched off or should not be touched (a design preview, nothing more).
//   node scripts/dev/mock-backend.mjs            (listens on 127.0.0.1:54399)
//   VITE_SUPABASE_URL=http://127.0.0.1:54399 VITE_SUPABASE_PUBLISHABLE_KEY=mock npx vite --port 5173 --host 127.0.0.1
// Log in with any User ID and any password. It answers only what the app asks for on its first screens: one person (you), a few chats with messages, call lines and notes.
// Everything it holds is made up, lives in memory and is gone when it stops. It never talks to the real project and holds no real data or key.
import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT || 54399);
const HOST = '127.0.0.1';
const now = Date.now();
const iso = (minsAgo) => new Date(now - minsAgo * 60_000).toISOString();

const svg = (txt, a, b) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="128" height="128" fill="url(#g)"/><text x="64" y="82" font-size="56" font-family="Arial" font-weight="700" text-anchor="middle" fill="#fff">${txt}</text></svg>`);
const person = (id, username, displayName, a, b, extra = {}) => ({
  id, username, displayName, avatar: svg(displayName[0], a, b), bio: 'Here for fun', isVerified: false, accountType: 'public', followersCount: 120, followingCount: 80, postsCount: 6,
  followers: [], following: [], blockedUsers: [], followRequests: [], closeFriends: [], notificationsCount: 0, noobPoints: 5000000, ...extra
});
const ME = person('00000000-0000-4000-8000-000000000001', 'you', 'You', '#10b981', '#0ea5e9', { email: 'me@example.com', isAdmin: false, language: 'en' });

const RIYA = person('00000000-0000-4000-8000-000000000002', 'riya', 'Riya Shah', '#f97316', '#ec4899', { isVerified: true });
const ARJUN = person('00000000-0000-4000-8000-000000000003', 'arjun', 'Arjun Mehta', '#6366f1', '#0ea5e9');
const MEERA = person('00000000-0000-4000-8000-000000000004', 'meera', 'Meera Patel', '#84cc16', '#10b981');
const DEV = person('00000000-0000-4000-8000-000000000005', 'dev', 'Dev Joshi', '#f43f5e', '#f59e0b');
// the people in the chats follow each other with you, so their one-to-one chats show in the list
ME.following = [RIYA.id, ARJUN.id, MEERA.id, DEV.id]; ME.followers = [...ME.following]; ME.followingIds = [...ME.following];

const msg = (chatId, id, from, text, minsAgo, status = 'read', extra = {}) => ({ id: `m-${chatId}-${id}`, chatId, senderId: from.id, senderUsername: from.username, senderDisplayName: from.displayName, senderAvatar: from.avatar, text, createdAt: iso(minsAgo), status, ...extra });
const C1 = 'c0000000-0000-4000-8000-000000000001', C2 = 'c0000000-0000-4000-8000-000000000002', C3 = 'c0000000-0000-4000-8000-000000000003', C4 = 'c0000000-0000-4000-8000-000000000004', C5 = 'c0000000-0000-4000-8000-000000000005';
const messages = {
  [C1]: [
    msg(C1, 1, ME, "Hey! I'm free tonight. What's everyone up to?", 190, 'read'),
    msg(C1, 2, RIYA, 'Big test tomorrow! Anyone wanna study together tonight?', 186, 'read', { reactions: [{ emoji: '👍', count: 3, users: [ME.id, ARJUN.id, MEERA.id] }] }),
    msg(C1, 3, ME, 'Yes! I just finished a study guide', 180, 'read'),
    msg(C1, 4, ARJUN, 'Meet at the library at 5?', 175, 'read'),
    msg(C1, 5, MEERA, "I'm in!", 174, 'read'),
    msg(C1, 6, ME, 'Great! What about Dev?', 170, 'read'),
    msg(C1, 7, ME, 'In the meantime, can anyone help with this question?', 169, 'sent'),
    msg(C1, 8, DEV, 'Wait! What test?!', 160, 'read', { reactions: [{ emoji: '😳', count: 1, users: [RIYA.id] }] })
  ],
  [C2]: [msg(C2, 1, RIYA, 'Typing…', 8, 'read'), msg(C2, 2, ME, 'Sent you the notes 📒', 5, 'sent')],
  [C3]: [msg(C3, 1, ARJUN, 'I believe that this is the best…', 130, 'read')],
  [C4]: [msg(C4, 1, ME, 'See you tomorrow!', 700, 'read')],
  [C5]: [msg(C5, 1, DEV, '😍😍😍', 1500, 'read')]
};
const last = (id) => messages[id][messages[id].length - 1];
const chats = [
  { id: C1, isGroup: true, name: 'Study Group', avatar: svg('S', '#f59e0b', '#ef4444'), participants: [ME, RIYA, ARJUN, MEERA, DEV], lastMessage: last(C1), unreadCount: 2, isPinned: true, themeColor: '#00FF66', isEncryptable: false },
  { id: C2, isGroup: false, participants: [ME, RIYA], lastMessage: last(C2), unreadCount: 1, themeColor: '#00FF66', isEncryptable: false },
  { id: C3, isGroup: false, participants: [ME, ARJUN], lastMessage: last(C3), unreadCount: 0, themeColor: '#00FF66', isEncryptable: false },
  { id: C4, isGroup: false, participants: [ME, MEERA], lastMessage: last(C4), unreadCount: 0, themeColor: '#00FF66', isEncryptable: false },
  { id: C5, isGroup: true, name: 'Weekend Trip', avatar: svg('W', '#06b6d4', '#6366f1'), participants: [ME, DEV, ARJUN], lastMessage: last(C5), unreadCount: 0, themeColor: '#00FF66', isEncryptable: false }
];
let callLogs = [
  { id: 'cl1', chatId: C2, actorId: RIYA.id, actorUsername: 'riya', kind: 'missed', durationSeconds: null, createdAt: iso(25) },
  { id: 'cl2', chatId: C3, actorId: ME.id, actorUsername: 'you', kind: 'ended', durationSeconds: 342, createdAt: iso(300) },
  { id: 'cl3', chatId: C1, actorId: ARJUN.id, actorUsername: 'arjun', kind: 'ended', durationSeconds: 1280, createdAt: iso(1500) },
  { id: 'cl4', chatId: C4, actorId: ME.id, actorUsername: 'you', kind: 'missed', durationSeconds: null, createdAt: iso(1700) },
  { id: 'cl5', chatId: C2, actorId: ME.id, actorUsername: 'you', kind: 'declined', durationSeconds: null, createdAt: iso(3000) }
];
let notes = [
  { id: 'n1', body: 'Study plan\n☐ Maths chapter 4\n☑ Physics notes\n☐ Chemistry lab file', created_at: iso(900), updated_at: iso(60) },
  { id: 'n2', body: 'Shopping list\n• milk\n• eggs\n• bread', created_at: iso(3000), updated_at: iso(2000) }
];

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ME.id, role: 'authenticated', exp: Math.floor(now / 1000) + 86400 * 30, aud: 'authenticated' })}.mock`;
const authUser = { id: ME.id, aud: 'authenticated', role: 'authenticated', email: 'noob@users.nooob.xyz', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: iso(100000) };
const session = () => ({ access_token: jwt(), refresh_token: 'mock-refresh', token_type: 'bearer', expires_in: 86400 * 30, expires_at: Math.floor(Date.now() / 1000) + 86400 * 30, user: authUser });

const rpcAnswers = {
  // NOOB Forms preview: one made-up form at /f/abcdefgh12 (answers are not stored)
  form_public_get: () => ({ state: 'open', title: 'Customer feedback', description: 'Tell us how we did. It takes one minute.', version: 1, theme: { id: 'noob' }, settings: { presentation: 'classic', showProgress: true, confirmMessage: 'We read every answer.' },
    questions: [
      { id: 'q1', type: 'short', title: 'Your name', required: true },
      { id: 'q2', type: 'rating', title: 'How would you rate your experience?', required: true, min: 1, max: 5 },
      { id: 'q3', type: 'multiple_choice', title: 'How did you hear about us?', options: [{ id: 'a', label: 'Friends' }, { id: 'b', label: 'Social media' }, { id: 'c', label: 'Search' }], allowOther: true },
      { id: 'q4', type: 'nps', title: 'Would you recommend us?', min: 0, max: 10, minLabel: 'Not likely', maxLabel: 'Very likely' },
      { id: 'q5', type: 'paragraph', title: 'Anything we can improve?' }] }),
  form_public_submit: () => ({ ok: true, id: '00000000-0000-4000-8000-0000000000aa' }),
  resolve_login_email: () => 'noob@users.nooob.xyz',
  login_approval_needed: () => false,
  username_taken: () => true,
  get_my_user: () => ME,
  my_chats: () => chats,
  chat_messages: (a) => ({ messages: messages[a.p_chat] || [], hiddenIds: [] }),
  my_unread_chat_summary: () => ({ unreadChats: 2, unreadMessages: 3 }),
  my_call_logs: () => callLogs,
  delete_my_call_logs: (a) => { const before = callLogs.length; callLogs = a.p_ids ? callLogs.filter((r) => !a.p_ids.includes(r.id)) : []; return before - callLogs.length; },
  public_platform_settings: () => ({ signupsEnabled: true, maintenanceEnabled: false, maintenanceMessage: '', disabledFeatures: [] }),
  touch_last_seen: () => null, save_my_device_info: () => null, save_my_location: () => null,
  chat_last_seen: () => [], list_instants_inbox: () => [], instant_inbox: () => [],
  get_notifications: () => [], my_notifications: () => []
};
const listLike = /^(list_|get_|my_|fetch_|search_|explore_|feed|reels|stories)/;

const readBody = (req) => new Promise((res) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => { try { res(JSON.parse(Buffer.concat(c).toString() || 'null')); } catch { res(null); } }); });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${HOST}`);
  const send = (code, body, type = 'application/json') => {
    res.writeHead(code, { 'content-type': type, 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*', 'cache-control': 'no-store' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  if (req.method === 'OPTIONS') return send(204);
  const p = url.pathname;
  if (p === '/auth/v1/health') return send(200, { name: 'mock' });
  if (p === '/auth/v1/settings') return send(200, { external: { google: true, email: true }, disable_signup: false });
  if (p === '/auth/v1/token') { await readBody(req); return send(200, session()); }
  if (p === '/auth/v1/user') return send(200, authUser);
  if (p === '/auth/v1/logout') return send(204);
  if (p.startsWith('/rest/v1/rpc/')) {
    const fn = p.slice('/rest/v1/rpc/'.length);
    const args = (await readBody(req)) || {};
    const h = rpcAnswers[fn];
    return send(200, h ? h(args) : listLike.test(fn) ? [] : null);
  }
  if (p === '/rest/v1/profile_notes') {
    if (req.method === 'GET') return send(200, notes);
    const body = (await readBody(req)) || {};
    const wantsObject = /pgrst\.object/.test(String(req.headers.accept || ''));
    if (req.method === 'POST') { const n = { id: 'n' + (notes.length + 1) + Math.random().toString(36).slice(2, 5), body: body.body || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; notes.unshift(n); return send(201, wantsObject ? n : [n]); }
    if (req.method === 'PATCH') { const id = (url.searchParams.get('id') || '').replace('eq.', ''); const n = notes.find((x) => x.id === id); if (n) { n.body = body.body ?? n.body; n.updated_at = new Date().toISOString(); } return send(200, wantsObject ? n || {} : n ? [n] : []); }
    if (req.method === 'DELETE') { const id = (url.searchParams.get('id') || '').replace('eq.', ''); notes = notes.filter((x) => x.id !== id); return send(204); }
  }
  if (p.startsWith('/rest/v1/')) return send(200, req.method === 'GET' ? [] : null);
  if (p.startsWith('/functions/v1/')) { await readBody(req); return send(200, { success: true }); }
  return send(404, { message: 'mock: nothing here' });
});
server.listen(PORT, HOST, () => console.log(`Mock backend (made-up data only) on http://${HOST}:${PORT}`));
