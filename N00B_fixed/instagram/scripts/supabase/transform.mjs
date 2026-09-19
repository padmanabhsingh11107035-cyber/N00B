// Pure translation of the raw MongoDB backup (scripts/backup-mongo.mjs) into
// rows for the Supabase schema (supabase/migrations/*). No network, no
// database, no writes — the same input always gives the same output, which is
// what lets it be tested against the real backup and re-run safely.
//
// Design rules:
//   * Nothing is silently dropped. Every old field is mapped to a column, kept
//     in an "extra"/"legacy" JSON column, or on the explicit DROPPED list below
//     (things that are recomputed or that are per-viewer state).
//   * Ids are deterministic (UUID v5 of the old id), so re-running produces the
//     same ids and "insert only what's missing" is safe.
//   * Anything that can't be mapped cleanly is reported as a warning/skip
//     instead of being guessed at.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const LOGIN_EMAIL_DOMAIN = 'users.nooob.xyz'; // must match resolve_login_email() in the migration
const NAMESPACE = '6f0e5b64-7c1f-4d3a-9b1e-2d8a5c9f0a11';

// ---------------------------------------------------------------- ids
function uuidV5(name) {
  const ns = Buffer.from(NAMESPACE.replace(/-/g, ''), 'hex');
  const h = crypto.createHash('sha1').update(Buffer.concat([ns, Buffer.from(name, 'utf8')])).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}
export const uuidFor = (kind, legacyId) => uuidV5(`${kind}:${legacyId}`);
export const loginEmailFor = (userUuid) => `${userUuid}@${LOGIN_EMAIL_DOMAIN}`;

// ---------------------------------------------------------------- loading
const COLLECTIONS = [
  'users', 'posts', 'reels', 'stories', 'highlights', 'comments', 'notifications', 'chats', 'messages',
  'gameScores', 'coupons', 'settings', 'supportReviews', 'reelHistory', 'musicTracks', 'customStickers',
  'storeProducts', 'collections', 'reports', 'chatReviews', 'scratchCards'
];
export function loadBackup(dir) {
  const raw = {};
  for (const name of COLLECTIONS) {
    const file = path.join(dir, `${name}.json`);
    if (fs.existsSync(file)) raw[name] = JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return raw;
}

// ---------------------------------------------------------------- small helpers
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (v === undefined || v === null || v === '' ? null : String(v));
const arr = (v) => (Array.isArray(v) ? v : []);
const bool = (v) => v === true;
const int = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d);
const pick = (obj, consumed) => {
  const rest = {};
  for (const [k, v] of Object.entries(obj)) if (!consumed.has(k) && v !== undefined) rest[k] = v;
  return rest;
};

// Old records have a few "pre-ISO" timestamps; anything unparseable is null (and reported).
function isoOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const d = new Date(typeof v === 'number' ? v : String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function normalizePhone(countryCodeRaw, mobileRaw) {
  const cc = (String(countryCodeRaw || '').match(/\+\d{1,4}/) || [])[0] || null;
  let digits = String(mobileRaw || '').replace(/\D/g, '');
  const ccDigits = cc ? cc.slice(1) : '';
  // "+91 99743 39443" typed into a field that already has +91 selected
  if (ccDigits && digits.length > 10 && digits.startsWith(ccDigits)) digits = digits.slice(ccDigits.length);
  return { country_code: cc, mobile_number: digits || null };
}

// ---------------------------------------------------------------- plan
export function buildImportPlan(raw, { withChats = false } = {}) {
  const warnings = [];
  const skipped = [];
  const warn = (m) => warnings.push(m);
  const skip = (m) => skipped.push(m);
  const inlineFiles = []; // images that lived inside the database; must be saved as real files

  const users = arr(raw.users);
  const posts = arr(raw.posts);
  const reels = arr(raw.reels);
  const notifications = arr(raw.notifications);
  const chats = arr(raw.chats);
  const messagesByChat = isObj(raw.messages) ? raw.messages : {};
  const commentsByParent = isObj(raw.comments) ? raw.comments : {};

  const userUuid = new Map(users.map((u) => [u.id, uuidFor('user', u.id)]));
  const userByName = new Map(users.map((u) => [String(u.username).toLowerCase(), userUuid.get(u.id)]));
  const postUuid = new Map(posts.map((p) => [p.id, uuidFor('post', p.id)]));
  const reelUuid = new Map(reels.map((r) => [r.id, uuidFor('reel', r.id)]));
  const chatUuid = new Map(chats.map((c) => [c.id, uuidFor('chat', c.id)]));
  const earliestUser = users.map((u) => isoOrNull(u.createdAt)).filter(Boolean).sort()[0] || new Date().toISOString();

  // Stored media value -> what goes in the database. B2 keys and https/"/path"
  // values pass through; an expired presigned B2 URL is reduced to its key;
  // an image embedded in the database becomes a proper file key and is queued
  // in inlineFiles so it gets saved as a real file.
  function mediaRef(value, folder, nameHint) {
    if (!value) return null;
    if (value.startsWith('data:')) {
      const m = /^data:([a-z0-9.+/-]+);base64,/i.exec(value.slice(0, 100));
      if (!m) { warn(`Unreadable inline media for ${nameHint} — left empty.`); return null; }
      const ext = (m[1].split('/')[1] || 'bin').split('+')[0].replace('jpeg', 'jpg');
      const key = `${folder}/inline-${nameHint}.${ext}`;
      inlineFiles.push({ key, mime: m[1], buffer: Buffer.from(value.slice(m[0].length), 'base64') });
      return key;
    }
    if (/^https?:\/\//.test(value)) {
      const u = new URL(value);
      if (/backblazeb2\.com$/.test(u.host)) return decodeURIComponent(u.pathname.split('/').slice(2).join('/'));
    }
    return value;
  }

  const tables = {
    profiles: [], profile_private: [], push_subscriptions: [], follows: [], follow_requests: [], blocks: [],
    posts: [], post_slides: [], post_likes: [], post_saves: [], post_views: [],
    reels: [], reel_likes: [], reel_saves: [], reel_views: [], comments: [],
    chats: [], chat_members: [], messages: [],
    notifications: [], notification_reads: [],
    game_scores: [], noob_transactions: [], coupons: [], app_settings: [], support_reviews: [], legacy_import: []
  };
  const authUsers = [];

  // ----------------------------------------------------------- users
  // Old fields that are deliberately NOT copied 1:1 (recomputed, per-viewer, or handled elsewhere).
  const USER_DROPPED = new Set(['followersCount', 'followingCount', 'postsCount', 'pendingSentRequests', 'isFollowing', 'isFollower', 'isFollowRequested', 'followers']);
  const USER_MAPPED = new Set([
    'id', 'username', 'displayName', 'firstName', 'lastName', 'email', 'password', 'avatar', 'bio', 'accountType',
    'isVerified', 'verificationTier', 'isAdmin', 'isSuspended', 'suspendedReason', 'noobPoints', 'gamesWonCount',
    'gamesPlayedCount', 'isBusiness', 'followingIds', 'blockedUserIds', 'privacySettings', 'ipAddress',
    'noobTransactions', 'proTier', 'proBilling', 'proAutoRenew', 'proRenewsAt', 'countryCode', 'mobileNumber',
    'dateOfBirth', 'gender', 'businessCategory', 'businessEmail', 'businessPhone', 'businessAddress',
    'agreedToTerms', 'followRequests', 'externalLinks', 'customLinks', 'businessAddresses', 'crossProfiles',
    'createdAt', 'website', 'city', 'pronouns', 'interests', 'socialLinks', 'pushSubscription', 'pushTokens',
    'purchasedItemIds', 'isAi', 'isLiveAvatar', 'statusNote'
  ]);
  const USER_CONSUMED = new Set([...USER_MAPPED, ...USER_DROPPED]);

  for (const u of users) {
    const id = userUuid.get(u.id);
    const phone = normalizePhone(u.countryCode, u.mobileNumber);
    const dob = /^\d{4}-\d{2}-\d{2}/.test(u.dateOfBirth || '') ? u.dateOfBirth.slice(0, 10) : null;
    if (u.dateOfBirth && !dob) warn(`${u.username}: date of birth "${u.dateOfBirth}" isn't a valid date — kept only in the private "legacy" column.`);
    if (!u.password) warn(`${u.username}: has no saved password — a random one is set and they must use "forgot password".`);
    if (u.verificationTier && !['standard', 'plus', 'premium', 'max'].includes(u.verificationTier)) warn(`${u.username}: unknown verification tier "${u.verificationTier}" kept in extra.`);
    if (u.proBilling && !['monthly', 'yearly'].includes(u.proBilling)) warn(`${u.username}: unknown pro billing "${u.proBilling}" kept in extra.`);
    const validTier = ['standard', 'plus', 'premium', 'max'].includes(u.verificationTier) ? u.verificationTier : null;
    const validBilling = ['monthly', 'yearly'].includes(u.proBilling) ? u.proBilling : null;
    const createdAt = isoOrNull(u.createdAt) || earliestUser;
    if (!u.createdAt) warn(`${u.username}: no join date saved — using the earliest account date.`);

    const extra = pick(u, USER_CONSUMED);
    if (u.verificationTier && !validTier) extra.verificationTier = u.verificationTier;
    if (u.proBilling && !validBilling) extra.proBilling = u.proBilling;

    authUsers.push({
      id,
      email: loginEmailFor(id),
      password: u.password || crypto.randomBytes(18).toString('base64url'),
      user_metadata: { username: u.username, legacy_id: u.id }
    });

    tables.profiles.push({
      id, legacy_id: u.id, username: u.username, display_name: u.displayName || u.username,
      avatar: mediaRef(u.avatar, 'avatars', u.id) || '/noob-logo.svg.jpeg',
      bio: u.bio || '', account_type: ['public', 'private', 'business'].includes(u.accountType) ? u.accountType : 'public',
      is_business: bool(u.isBusiness), business_category: str(u.businessCategory),
      is_verified: bool(u.isVerified), verification_tier: validTier,
      is_admin: bool(u.isAdmin), is_ai: bool(u.isAi), is_suspended: bool(u.isSuspended), is_live_avatar: bool(u.isLiveAvatar),
      website: str(u.website), city: str(u.city), pronouns: str(u.pronouns),
      interests: arr(u.interests).map(String), social_links: isObj(u.socialLinks) ? u.socialLinks : {},
      external_links: arr(u.externalLinks), custom_links: arr(u.customLinks), cross_profiles: arr(u.crossProfiles),
      privacy_settings: isObj(u.privacySettings) ? u.privacySettings : {}, status_note: isObj(u.statusNote) ? u.statusNote : null,
      noob_points: int(u.noobPoints), games_won_count: int(u.gamesWonCount), games_played_count: int(u.gamesPlayedCount),
      pro_tier: str(u.proTier), pro_billing: validBilling, pro_auto_renew: bool(u.proAutoRenew), pro_renews_at: isoOrNull(u.proRenewsAt),
      purchased_item_ids: arr(u.purchasedItemIds).map(String),
      extra, created_at: createdAt
    });

    tables.profile_private.push({
      user_id: id, email: str(u.email), first_name: str(u.firstName), last_name: str(u.lastName),
      country_code: phone.country_code, mobile_number: phone.mobile_number, date_of_birth: dob, gender: str(u.gender),
      business_email: str(u.businessEmail), business_phone: str(u.businessPhone), business_address: str(u.businessAddress),
      business_addresses: arr(u.businessAddresses).map(String), ip_address: str(u.ipAddress),
      agreed_to_terms: bool(u.agreedToTerms), suspended_reason: str(u.suspendedReason), push_tokens: arr(u.pushTokens).map(String),
      legacy: { countryCode: u.countryCode ?? null, mobileNumber: u.mobileNumber ?? null, dateOfBirth: u.dateOfBirth ?? null }
    });

    if (u.pushSubscription) tables.push_subscriptions.push({ user_id: id, subscription: u.pushSubscription });

    // social graph
    for (const fid of arr(u.followingIds)) {
      if (!userUuid.has(fid)) { skip(`follow ${u.username} -> unknown account ${fid}`); continue; }
      if (fid === u.id) continue;
      tables.follows.push({ follower_id: id, followee_id: userUuid.get(fid) });
    }
    for (const bid of arr(u.blockedUserIds)) {
      if (userUuid.has(bid) && bid !== u.id) tables.blocks.push({ blocker_id: id, blocked_id: userUuid.get(bid) });
      else skip(`block ${u.username} -> unknown account ${bid}`);
    }
    for (const r of arr(u.followRequests)) {
      const rid = typeof r === 'string' ? r : r?.userId;
      if (!userUuid.has(rid) || rid === u.id) { skip(`follow request to ${u.username} from unknown account ${rid}`); continue; }
      tables.follow_requests.push({ requester_id: userUuid.get(rid), target_id: id, created_at: isoOrNull(r?.requestedAt) || createdAt });
    }

    for (const t of arr(u.noobTransactions)) {
      tables.noob_transactions.push({
        id: uuidFor('tx', `${u.id}:${t.id}`), legacy_id: `${u.id}:${t.id}`, user_id: id, amount: int(t.amount),
        reason: t.reason || '', balance_after: Number.isFinite(Number(t.balanceAfter)) ? int(t.balanceAfter) : null,
        created_at: isoOrNull(t.timestamp) || createdAt
      });
    }
  }
  // pendingSentRequests is the mirror image of followRequests — cross-check instead of importing twice
  {
    const fromRequests = new Set(tables.follow_requests.map((r) => `${r.requester_id}>${r.target_id}`));
    const fromPending = new Set();
    for (const u of users) for (const p of arr(u.pendingSentRequests)) {
      const target = typeof p === 'string' ? p : p?.userId || p?.id || p?.targetUserId;
      if (userUuid.has(target)) fromPending.add(`${userUuid.get(u.id)}>${userUuid.get(target)}`);
    }
    for (const k of fromPending) if (!fromRequests.has(k)) {
      const [a, b] = k.split('>');
      tables.follow_requests.push({ requester_id: a, target_id: b, created_at: earliestUser });
      warn('A pending follow request was only recorded on the sender\'s side — added so it isn\'t lost.');
    }
  }

  // ----------------------------------------------------------- posts
  const POST_MAPPED = new Set([
    'id', 'userId', 'caption', 'location', 'category', 'hashtags', 'audioTrack', 'webLink', 'textBgStyle', 'scheduledFor',
    'isArchived', 'isPinnedToProfile', 'isCommentsDisabled', 'isLikeCountHidden', 'isSponsored', 'isCollab', 'collabUsername',
    'taggedUsers', 'hasAiLabel', 'sharesCount', 'createdAt', 'slides', 'likedBy', 'savedBy', 'viewedBy'
  ]);
  // author copies, per-viewer flags and counters recomputed from the real rows
  const POST_DROPPED = new Set(['username', 'userAvatar', 'isVerified', 'displayName', 'isLiked', 'isSaved', 'likesCount', 'commentsCount', 'savesCount', 'collabUserAvatar', 'collabUserDisplayName']);
  const POST_CONSUMED = new Set([...POST_MAPPED, ...POST_DROPPED]);

  for (const p of posts) {
    const uid = userUuid.get(p.userId);
    if (!uid) { skip(`post ${p.id}: author ${p.userId} not found`); postUuid.delete(p.id); continue; }
    const pid = postUuid.get(p.id);
    tables.posts.push({
      id: pid, legacy_id: p.id, user_id: uid, caption: p.caption || '', location: str(p.location), category: str(p.category),
      hashtags: arr(p.hashtags).map(String), audio_track: p.audioTrack ?? null, web_link: str(p.webLink), text_bg_style: str(p.textBgStyle),
      scheduled_for: isoOrNull(p.scheduledFor), is_archived: bool(p.isArchived), is_pinned_to_profile: bool(p.isPinnedToProfile),
      is_comments_disabled: bool(p.isCommentsDisabled), is_like_count_hidden: bool(p.isLikeCountHidden), is_sponsored: bool(p.isSponsored),
      is_collab: bool(p.isCollab), collab_username: str(p.collabUsername), tagged_users: arr(p.taggedUsers), has_ai_label: bool(p.hasAiLabel),
      shares_count: int(p.sharesCount), extra: pick(p, POST_CONSUMED), created_at: isoOrNull(p.createdAt) || earliestUser
    });
    arr(p.slides).forEach((s, i) => {
      const media = s.objectKey ? mediaRef(s.objectKey, 'posts', s.id) : mediaRef(s.mediaUrl, 'posts', s.id);
      if (!media) { skip(`post ${p.id} slide ${i + 1}: no media`); return; }
      tables.post_slides.push({
        id: uuidFor('slide', `${p.id}:${s.id}`), post_id: pid, position: i, media_url: media,
        media_type: ['image', 'video', 'code'].includes(s.mediaType) ? s.mediaType : 'image',
        caption: str(s.caption), filter: str(s.filter), tagged_users: arr(s.taggedUsers), product_tags: arr(s.productTags)
      });
    });
    const each = (list, table, col) => {
      for (const who of new Set(arr(list))) {
        if (userUuid.has(who)) tables[table].push({ post_id: pid, user_id: userUuid.get(who) });
        else skip(`${col} on post ${p.id}: unknown account ${who}`);
      }
    };
    each(p.likedBy, 'post_likes', 'like');
    each(p.savedBy, 'post_saves', 'save');
    each(p.viewedBy, 'post_views', 'view');
  }

  // ----------------------------------------------------------- reels
  const REEL_MAPPED = new Set([
    'id', 'userId', 'videoUrl', 'thumbnailUrl', 'caption', 'audioTrack', 'hashtags', 'durationSeconds', 'category', 'webLink',
    'isTrialReel', 'isCollab', 'collabUsername', 'taggedUsers', 'viewsCount', 'sharesCount', 'createdAt', 'likedBy', 'viewedBy', 'savedBy'
  ]);
  const REEL_DROPPED = new Set(['username', 'userAvatar', 'isVerified', 'isLiked', 'isSaved', 'isFollowing', 'likesCount', 'commentsCount', 'savesCount', 'collabUserAvatar', 'collabUserDisplayName', 'aiTranslationAvailable']);
  const REEL_CONSUMED = new Set([...REEL_MAPPED, ...REEL_DROPPED]);
  for (const r of reels) {
    const uid = userUuid.get(r.userId);
    if (!uid) { skip(`reel ${r.id}: author ${r.userId} not found`); reelUuid.delete(r.id); continue; }
    const rid = reelUuid.get(r.id);
    const video = mediaRef(r.videoUrl, 'reels', r.id);
    if (!video) { skip(`reel ${r.id}: no video`); reelUuid.delete(r.id); continue; }
    if (int(r.savesCount) > 0 && !arr(r.savedBy).length) warn(`Reel ${r.id} had ${r.savesCount} save(s) but the old data doesn't say who saved it, so the saves can't be carried over.`);
    tables.reels.push({
      id: rid, legacy_id: r.id, user_id: uid, video_url: video, thumbnail_url: mediaRef(r.thumbnailUrl, 'reels', `${r.id}-thumb`), caption: r.caption || '',
      audio_title: str(r.audioTrack?.title), audio_artist: str(r.audioTrack?.artist), audio_cover_url: mediaRef(r.audioTrack?.coverUrl, 'covers', `${r.id}-audio`),
      hashtags: arr(r.hashtags).map(String), duration_seconds: Number.isFinite(Number(r.durationSeconds)) ? int(r.durationSeconds) : null,
      category: str(r.category), web_link: str(r.webLink), is_trial_reel: bool(r.isTrialReel), is_collab: bool(r.isCollab),
      collab_username: str(r.collabUsername), tagged_users: arr(r.taggedUsers), views_count: int(r.viewsCount), shares_count: int(r.sharesCount),
      extra: pick(r, REEL_CONSUMED), created_at: isoOrNull(r.createdAt) || earliestUser
    });
    const each = (list, table, col) => {
      for (const who of new Set(arr(list))) {
        if (userUuid.has(who)) tables[table].push({ reel_id: rid, user_id: userUuid.get(who) });
        else skip(`${col} on reel ${r.id}: unknown account ${who}`);
      }
    };
    each(r.likedBy, 'reel_likes', 'like');
    each(r.savedBy, 'reel_saves', 'save');
    each(r.viewedBy, 'reel_views', 'view');
  }

  // ----------------------------------------------------------- comments
  for (const [parentId, list] of Object.entries(commentsByParent)) {
    const isReel = parentId.startsWith('r_');
    const parent = isReel ? reelUuid.get(parentId) : postUuid.get(parentId);
    for (const c of arr(list)) {
      const uid = userUuid.get(c.userId);
      if (!parent || !uid) { skip(`comment ${c.id} on ${parentId}: ${!parent ? 'parent' : 'author'} not found`); continue; }
      tables.comments.push({
        id: uuidFor('comment', c.id), legacy_id: c.id, post_id: isReel ? null : parent, reel_id: isReel ? parent : null,
        user_id: uid, text: c.text || '', likes_count: int(c.likesCount), is_pinned: bool(c.isPinned), created_at: isoOrNull(c.createdAt) || earliestUser
      });
    }
  }

  // ----------------------------------------------------------- chats (Global Lounge always; the rest only with --with-chats)
  const chatsToImport = chats.filter((c) => c.isGlobalDefault || withChats);
  const importedChatIds = new Set(chatsToImport.map((c) => c.id));
  for (const c of chatsToImport) {
    const cid = chatUuid.get(c.id);
    const createdAt = isoOrNull(c.createdAt) || earliestUser;
    tables.chats.push({
      id: cid, legacy_id: c.id, name: str(c.name), avatar: mediaRef(c.avatar, 'avatars', `chat-${c.id}`), description: str(c.description),
      is_group: bool(c.isGroup), is_global_default: bool(c.isGlobalDefault), creator_id: userUuid.get(c.creatorId) || null,
      theme_color: c.themeColor || '#00FF66', vanish_mode: bool(c.vanishMode), read_receipts_enabled: c.readReceiptsEnabled !== false,
      extra: { legacyCreatedAt: c.createdAt ?? null, isPinned: bool(c.isPinned), isMuted: bool(c.isMuted), unreadCount: int(c.unreadCount) },
      created_at: createdAt
    });
    if (!c.isGlobalDefault) {
      const admins = new Set(arr(c.adminIds));
      for (const p of arr(c.participants)) {
        if (!userUuid.has(p.id)) { skip(`chat ${c.id}: member ${p.id} not found`); continue; }
        tables.chat_members.push({ chat_id: cid, user_id: userUuid.get(p.id), is_admin: admins.has(p.id) || c.creatorId === p.id });
      }
    }
    for (const m of arr(messagesByChat[c.id])) {
      tables.messages.push({
        id: uuidFor('message', m.id), legacy_id: m.id, chat_id: cid, sender_id: userUuid.get(m.senderId) || null, text: m.text || '',
        media_url: mediaRef(m.mediaUrl, 'posts', `msg-${m.id}`), media_type: str(m.mediaType), reactions: arr(m.reactions), reply_to: m.replyTo ?? null,
        is_edited: bool(m.isEdited), is_pinned: bool(m.isPinned), status: m.status || 'sent',
        extra: userUuid.has(m.senderId) ? {} : { legacySenderId: m.senderId ?? null },
        created_at: isoOrNull(m.createdAt) || createdAt
      });
    }
  }
  if (!withChats) {
    const skippedChats = chats.filter((c) => !c.isGlobalDefault).length;
    const skippedMsgs = Object.entries(messagesByChat).filter(([id]) => !importedChatIds.has(id)).reduce((n, [, l]) => n + arr(l).length, 0);
    if (skippedChats || skippedMsgs) warn(`Chats not imported (as requested): ${skippedChats} chat(s), ${skippedMsgs} message(s) — still safe in the raw backup. Use --with-chats to include them.`);
  }

  // ----------------------------------------------------------- notifications
  const NOTIF_MAPPED = new Set(['id', 'type', 'targetUserId', 'actorId', 'senderId', 'title', 'message', 'postId', 'reelId', 'chatId', 'actionStatus', 'createdAt', 'readByUserIds']);
  // actor/sender name + avatar are copies of the profile (joined via actor_id now)
  const NOTIF_DROPPED = new Set(['targetUsername', 'senderUsername', 'senderDisplayName', 'senderAvatar', 'senderIsVerified', 'actorUsername', 'actorDisplayName', 'actorAvatar']);
  const NOTIF_CONSUMED = new Set([...NOTIF_MAPPED, ...NOTIF_DROPPED]);
  for (const n of notifications) {
    let target = null;
    if (n.targetUserId && n.targetUserId !== 'all') {
      target = userUuid.get(n.targetUserId) || userByName.get(String(n.targetUserId).toLowerCase()) || null;
      if (!target) { skip(`notification ${n.id} (${n.type}) for an account that no longer exists (${n.targetUserId})`); continue; }
    }
    const actorLegacy = n.actorId || n.senderId;
    const nid = uuidFor('notification', n.id);
    const data = pick(n, NOTIF_CONSUMED);
    if (n.chatId && !chatUuid.has(n.chatId)) data.legacyChatId = n.chatId;
    tables.notifications.push({
      id: nid, legacy_id: n.id, target_user_id: target, actor_id: userUuid.get(actorLegacy) || null, type: n.type || 'system',
      title: str(n.title), message: str(n.message), post_id: postUuid.get(n.postId) || null, reel_id: reelUuid.get(n.reelId) || null,
      chat_id: importedChatIds.has(n.chatId) ? chatUuid.get(n.chatId) : null,
      action_status: ['pending', 'accepted', 'declined'].includes(n.actionStatus) ? n.actionStatus : null,
      data, created_at: isoOrNull(n.createdAt) || earliestUser
    });
    for (const rid of new Set(arr(n.readByUserIds))) if (userUuid.has(rid)) tables.notification_reads.push({ notification_id: nid, user_id: userUuid.get(rid) });
  }

  // ----------------------------------------------------------- games, coupons, settings, reviews, leftovers
  for (const g of arr(raw.gameScores)) {
    const uid = userByName.get(String(g.username).toLowerCase());
    if (!uid) { skip(`game score ${g.id}: player "${g.username}" not found`); continue; }
    tables.game_scores.push({
      id: uuidFor('score', g.id), legacy_id: g.id, user_id: uid, game_id: g.gameId, game_title: str(g.gameTitle), score: int(g.score),
      points_awarded: int(g.noobsPoints), result: ['win', 'tie', 'loss'].includes(g.result) ? g.result : null, opponent: str(g.opponent),
      created_at: isoOrNull(g.date) || earliestUser
    });
  }
  for (const c of arr(raw.coupons)) {
    const target = c.targetUsername ? (userByName.get(String(c.targetUsername).toLowerCase()) || null) : null;
    if (c.targetUsername && !target) warn(`Coupon ${c.code}: its target user "${c.targetUsername}" no longer exists — imported as inactive.`);
    tables.coupons.push({
      id: uuidFor('coupon', c.id), legacy_id: c.id, code: c.code, title: str(c.title), type: str(c.type), discount_percent: Number.isFinite(Number(c.discountPercent)) ? Number(c.discountPercent) : null,
      terms: str(c.terms), target_user_id: target, created_by: userUuid.get(c.createdBy) || userByName.get(String(c.createdBy).toLowerCase()) || null,
      active: bool(c.active) && !(c.targetUsername && !target), created_at: isoOrNull(c.createdAt) || earliestUser
    });
  }
  {
    const s = isObj(raw.settings) ? { ...raw.settings } : {};
    const storeEnabled = s.storeEnabled !== false;
    const fee = Number.isFinite(Number(s.storeDeliveryFee)) ? Number(s.storeDeliveryFee) : 0;
    delete s.storeEnabled; delete s.storeDeliveryFee;
    tables.app_settings.push({ id: 1, settings: s, store_enabled: storeEnabled, store_delivery_fee: fee });
  }
  arr(raw.supportReviews).forEach((r, i) => {
    tables.support_reviews.push({
      id: uuidFor('review', `${i}:${r.username}:${r.timestamp}`), user_id: userByName.get(String(r.username).toLowerCase()) || null,
      rating: Math.min(5, Math.max(1, int(r.rating, 5))), feedback: str(r.feedback), created_at: isoOrNull(r.timestamp) || earliestUser
    });
  });
  if (arr(raw.reelHistory).length) tables.legacy_import.push({ key: 'reelHistory', data: raw.reelHistory });

  // Collections that exist in the old app but are empty in this backup — a loud
  // reminder if that ever stops being true, so they can't be forgotten.
  for (const name of ['stories', 'highlights', 'musicTracks', 'customStickers', 'storeProducts', 'collections', 'reports', 'chatReviews', 'scratchCards']) {
    if (arr(raw[name]).length) warn(`The backup contains ${raw[name].length} item(s) in "${name}", which this import doesn't handle yet — they're safe in the raw backup but NOT imported.`);
  }

  const counts = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length]));
  return { authUsers, tables, inlineFiles, report: { counts, warnings, skipped } };
}
