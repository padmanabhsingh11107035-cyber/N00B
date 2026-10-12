// "Export Data" (Profile > ⋮ > Settings & account controls): a plain, readable text copy of what a person gave NOOB and made on it.
//
// It is built from a fixed LIST of fields that are the person's own details (name, contact details they entered, bio, links, settings, their
// posts and reels). Nothing else is ever read from the account record: no password (NOOB never has it in readable form anyway), no login
// token, no internal IDs, no IP address, no device or notification registrations, no chat encryption keys, no admin or moderation flags,
// and nothing that belongs to somebody else. Fields that are not on the list can not appear, whatever the account record contains.

export interface ExportUser {
  [key: string]: any;
}

const line = (label: string, value: unknown): string => {
  const text = Array.isArray(value) ? value.filter(Boolean).join(', ') : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value ?? '').trim();
  return text ? `${label}: ${text}` : '';
};

const when = (iso?: string): string => {
  const t = Date.parse(String(iso ?? ''));
  return Number.isFinite(t) ? new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
};

const section = (title: string, rows: string[]): string => {
  const body = rows.filter(Boolean);
  return body.length ? `${title}\n${'-'.repeat(title.length)}\n${body.join('\n')}\n` : '';
};

const num = (n: unknown): string => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('en-US') : '');

export function buildDataExport(user: ExportUser, posts: ExportUser[] = [], reels: ExportUser[] = [], now: Date = new Date()): string {
  const parts: string[] = [];
  const created = now.toLocaleString('en-GB', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  parts.push(`NOOB — your data\nCreated on ${created}\n\nThis is a readable copy of the details you gave NOOB and what you shared. It never contains your password or your login.\n`);

  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.displayName;
  parts.push(section('ACCOUNT', [
    line('Name', name),
    line('Display name', user.displayName),
    line('Username', user.username ? `@${user.username}` : ''),
    line('Email', user.email),
    line('Mobile number', user.mobileNumber ? `${user.countryCode || ''} ${user.mobileNumber}`.trim() : ''),
    line('Date of birth', user.dateOfBirth),
    line('Gender', user.gender),
    line('Pronouns', user.pronouns),
    line('City', user.city),
    line('Website', user.website),
    line('Bio', user.bio),
    line('Account type', user.accountType ? String(user.accountType).replace(/^./, (c) => c.toUpperCase()) : ''),
    line('Verified', !!user.isVerified)
  ]));

  const links = [...(Array.isArray(user.externalLinks) ? user.externalLinks : []), ...(Array.isArray(user.customLinks) ? user.customLinks : [])]
    .filter((l: any) => l && l.url).map((l: any) => `  - ${l.title ? `${l.title}: ` : ''}${l.url}`);
  const social = user.socialLinks && typeof user.socialLinks === 'object'
    ? Object.entries(user.socialLinks).filter(([, v]) => !!v).map(([k, v]) => `  - ${k.replace(/^./, (c) => c.toUpperCase())}: ${v}`)
    : [];
  parts.push(section('ABOUT YOU', [
    line('Interests', user.interests),
    social.length ? `Social accounts:\n${social.join('\n')}` : '',
    links.length ? `Links:\n${links.join('\n')}` : '',
    line('Business category', user.businessCategory),
    line('Business email', user.businessEmail),
    line('Business phone', user.businessPhone),
    line('Business address', user.businessAddress)
  ]));

  const planName = user.proTier ? String(user.proTier).replace(/^./, (c) => c.toUpperCase()) : '';
  parts.push(section('NOOB', [
    line('NOOB Pro', planName ? `${planName} (${user.proBilling === 'yearly' ? 'yearly' : 'monthly'}${user.proAutoRenew === false ? ', does not renew automatically' : ', renews automatically'})` : 'Free plan'),
    user.proRenewsAt ? line(user.proAutoRenew === false ? 'Pro ends on' : 'Pro renews on', when(user.proRenewsAt)) : '',
    line('NOOB Points', num(user.noobPoints)),
    line('Games won', num(user.gamesWonCount)),
    line('Games played', num(user.gamesPlayedCount)),
    line('Followers', num(user.followersCount)),
    line('Following', num(user.followingCount)),
    line('Posts', num(user.postsCount))
  ]));

  const privacy = user.privacySettings && typeof user.privacySettings === 'object' ? user.privacySettings : {};
  parts.push(section('PRIVACY SETTINGS', [
    line('Account type', user.accountType),
    user.accountType === 'private' ? line('Accept follow requests automatically', privacy.autoAcceptFollowRequests !== false) : '',
    line('Hide tagged photos from my profile', !!privacy.hideTaggedPhotos),
    line('Words that are filtered out', Array.isArray(privacy.blockedWords) ? privacy.blockedWords : [])
  ]));

  const postLines = posts.map((p, i) => {
    const bits = [`${i + 1}. ${when(p.createdAt)}`];
    if (p.caption) bits.push(`   ${String(p.caption).replace(/\s+/g, ' ').trim()}`);
    const extra = [p.location ? `at ${p.location}` : '', Array.isArray(p.hashtags) && p.hashtags.length ? p.hashtags.map((h: string) => (h.startsWith('#') ? h : `#${h}`)).join(' ') : ''].filter(Boolean).join(' · ');
    if (extra) bits.push(`   ${extra}`);
    bits.push(`   ${num(p.likesCount) || '0'} likes · ${num(p.commentsCount) || '0'} comments`);
    return bits.join('\n');
  });
  parts.push(postLines.length ? section(`YOUR POSTS (${postLines.length}, the most recent ones)`, postLines) : '');

  const reelLines = reels.map((r, i) => {
    const bits = [`${i + 1}. ${when(r.createdAt)}`];
    if (r.caption) bits.push(`   ${String(r.caption).replace(/\s+/g, ' ').trim()}`);
    bits.push(`   ${num(r.viewsCount) || '0'} views · ${num(r.likesCount) || '0'} likes · ${num(r.commentsCount) || '0'} comments`);
    return bits.join('\n');
  });
  parts.push(reelLines.length ? section(`YOUR REELS (${reelLines.length}, the most recent ones)`, reelLines) : '');

  parts.push('Your messages, wallet history and photos are not part of this text file.\n');
  return parts.filter(Boolean).join('\n');
}
