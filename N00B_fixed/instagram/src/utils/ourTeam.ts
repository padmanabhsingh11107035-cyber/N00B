// "Our Team": the shapes the server sends, the limits, and the small pure rules the page and the admin form share.
// Kept apart from the screens so they can be tested without a browser (scripts/supabase/test-our-team-ui.mjs).

export interface TeamMember {
  id: string;
  name: string;
  qualification: string;
  description: string;
  photo: string | null;     // the picture's address, ready to show
  photoKey: string | null;  // the stored file ("team/…"), what is saved back when the member is edited
  position: number;
  pinned: boolean;         // pinned to the top: only the main administrator is ever told (everyone else always gets false)
  // The NOOB account behind the card (everyone who joined through the form has one; the administrator can link anyone). null: none.
  userId: string | null;
  username: string | null;
  avatar: string | null;
  isVerified: boolean;
  isMe: boolean;
  following: boolean;      // I follow this person
  requested: boolean;      // I asked to follow them (private account)
  blocked: boolean;        // either of us blocked the other: no Follow button
}

export const TEAM_LIMITS = { name: 80, qualification: 160, description: 1200 } as const;

// Only files this page itself uploaded are ever deleted from storage when a member is removed or a photo replaced.
export const isTeamPhotoKey = (key: string | null | undefined): key is string => typeof key === 'string' && /^team\/[A-Za-z0-9._-]+$/.test(key);

// "Asha Rao" -> "AR", "Madonna" -> "M": what a card shows while a member has no photo.
export function initials(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = Array.from(parts[0])[0] || '';
  const last = parts.length > 1 ? Array.from(parts[parts.length - 1])[0] || '' : '';
  return (first + last).toUpperCase();
}

// Every card gets its own colour pair (ring, glow and chip), repeating after six.
export interface TeamAccent { from: string; to: string; glow: string }
export const TEAM_ACCENTS: TeamAccent[] = [
  { from: '#fbbf24', to: '#f472b6', glow: 'rgba(251,191,36,0.45)' },
  { from: '#a78bfa', to: '#38bdf8', glow: 'rgba(167,139,250,0.45)' },
  { from: '#34d399', to: '#22d3ee', glow: 'rgba(52,211,153,0.42)' },
  { from: '#fb7185', to: '#f59e0b', glow: 'rgba(251,113,133,0.42)' },
  { from: '#60a5fa', to: '#c084fc', glow: 'rgba(96,165,250,0.45)' },
  { from: '#f0abfc', to: '#fde68a', glow: 'rgba(240,171,252,0.42)' }
];
export const accentFor = (index: number): TeamAccent => TEAM_ACCENTS[((index % TEAM_ACCENTS.length) + TEAM_ACCENTS.length) % TEAM_ACCENTS.length];

// "01", "02" … the number in the corner of a card.
export const cardNumber = (index: number): string => String(index + 1).padStart(2, '0');

// A long description shows its first lines and a "Read more"; a short one shows in full.
export const DESCRIPTION_PREVIEW_CHARS = 150;
export const needsReadMore = (description: string): boolean => String(description || '').trim().length > DESCRIPTION_PREVIEW_CHARS;

export const memberCountLabel = (n: number): string => (n === 1 ? '1 member' : `${n} members`);

// The admin form asks for all four things; the first thing that is missing or too long is named.
export interface TeamForm { name: string; qualification: string; description: string; hasPhoto: boolean }
export function validateTeamForm(f: TeamForm): string | null {
  const name = f.name.trim(), qualification = f.qualification.trim(), description = f.description.trim();
  if (!f.hasPhoto) return 'Please add a photo.';
  if (!name) return 'Please write the name.';
  if (name.length > TEAM_LIMITS.name) return `The name can be at most ${TEAM_LIMITS.name} characters.`;
  if (!qualification) return 'Please write the qualification.';
  if (qualification.length > TEAM_LIMITS.qualification) return `The qualification can be at most ${TEAM_LIMITS.qualification} characters.`;
  if (!description) return 'Please write a short description.';
  if (description.length > TEAM_LIMITS.description) return `The description can be at most ${TEAM_LIMITS.description} characters.`;
  return null;
}

// ---- the link people open to join the team page (shared by the administrator)
export const TEAM_JOIN_LINK = 'https://nooob.xyz/?team=join';
export const teamJoinRequested = (search: string): boolean => {
  try { return new URLSearchParams(search).get('team') === 'join'; } catch { return false; }
};

// "Follow on NOOB" for a card: what the button says, whether there is one, and what a tap does.
export type FollowState = 'none' | 'follow' | 'requested' | 'following';
export function followState(m: Pick<TeamMember, 'userId' | 'isMe' | 'blocked' | 'following' | 'requested'>): FollowState {
  if (!m.userId || m.isMe || m.blocked) return 'none';
  if (m.following) return 'following';
  if (m.requested) return 'requested';
  return 'follow';
}
export const followLabel = (state: FollowState): string => (state === 'following' ? 'Following' : state === 'requested' ? 'Requested' : state === 'follow' ? 'Follow on NOOB' : '');

// ---- applications (the person's own, and what the administrator sees)
export type ApplicationStatus = 'pending' | 'approved' | 'rejected';
export interface MyTeamApplication {
  open: boolean;           // applications are being taken
  onTeam: boolean;         // already on the page
  application: { status: ApplicationStatus; name: string; qualification: string; description: string; photo: string | null; photoUrl: string | null } | null;
}
export interface TeamApplicationRow {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatar: string | null;
  name: string;
  qualification: string;
  description: string;
  photo: string | null;
  photoUrl: string | null;
  status: ApplicationStatus;
  createdAt: string;
  decidedAt: string | null;
  onTeam: boolean;
}
export interface TeamAdminState { open: boolean; autoPublish: boolean; applications: TeamApplicationRow[] }
