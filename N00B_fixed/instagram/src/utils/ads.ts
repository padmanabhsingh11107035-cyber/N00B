// NOOB Ads: the small rules shared by the apply form, the admin page and the banners (the database does the real checking, see supabase/migrations/20261022000006_ads.sql).
export type AdPage = 'reels' | 'feed' | 'home';
export const AD_PAGES: ReadonlyArray<{ id: AdPage; label: string }> = [
  { id: 'reels', label: 'Reels' },
  { id: 'feed', label: 'Feed' },
  { id: 'home', label: 'Home' }
];
/** what the applicant chooses between: one page, or all three */
export type AdWhere = AdPage | 'all';
export const AD_WHERE_OPTIONS: ReadonlyArray<{ id: AdWhere; label: string; hint: string }> = [
  { id: 'reels', label: 'Reels', hint: 'Shown at the top of the Reels page' },
  { id: 'feed', label: 'Feed', hint: 'Shown at the top of the Feed (videos) page' },
  { id: 'home', label: 'Home', hint: 'Shown at the top of the Home page' },
  { id: 'all', label: 'All', hint: 'Reels, Feed and Home' }
];
export const AD_DURATIONS: ReadonlyArray<{ days: number; label: string }> = [
  { days: 1, label: '1 day' },
  { days: 3, label: '3 days' },
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
  { days: 30, label: '1 month' }
];

/** an ad is either ONE video or 1 to 10 photos; the photos change by themselves, the next one after 1 second */
export type AdMediaKind = 'image' | 'video';
export const AD_MAX_PHOTOS = 10;
export const AD_SLIDE_MS = 1000;
/** how long one ad stays before the next ad takes its turn (an ad with many photos stays until all of them have been shown once) */
export const AD_TURN_MS = 9000;
export const adTurnMs = (a: { mediaType: AdMediaKind; mediaUrls: string[] }): number => (a.mediaType === 'image' ? Math.max(AD_TURN_MS, a.mediaUrls.length * AD_SLIDE_MS) : AD_TURN_MS);
/** "3 photos", "1 photo" or "Video" */
export const mediaText = (a: { mediaType: AdMediaKind; mediaUrls: string[] }): string => (a.mediaType === 'video' ? 'Video' : `${a.mediaUrls.length} photo${a.mediaUrls.length === 1 ? '' : 's'}`);

export const pagesOf = (where: AdWhere): AdPage[] => (where === 'all' ? ['reels', 'feed', 'home'] : [where]);
export const pageLabel = (p: string): string => AD_PAGES.find((x) => x.id === p)?.label || p;
export const pagesText = (pages: string[]): string => (pages.length === 3 ? 'Reels, Feed and Home' : pages.map(pageLabel).join(' and ') || 'No page');
export const durationText = (days: number): string => AD_DURATIONS.find((d) => d.days === days)?.label || `${days} days`;

export type AdStatus = 'pending' | 'approved' | 'rejected' | 'ended';
export interface AdApplication {
  id: string;
  title: string;
  link: string | null;
  mediaUrl: string;
  /** every file of the ad in order (the first one is mediaUrl): 1 to 10 photos, or one video */
  mediaUrls: string[];
  mediaType: AdMediaKind;
  durationDays: number;
  requestedPages: AdPage[];
  approvedPages: AdPage[];
  status: AdStatus;
  adminNote: string;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  reviewedAt: string | null;
}
/** a row of the admin's list: the request plus who sent it and how to reach them */
export interface AdminAdRow extends AdApplication {
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  isVerified: boolean;
  businessCategory: string | null;
  businessEmail: string | null;
  businessPhone: string | null;
}
export interface ActiveAd {
  id: string;
  title: string;
  link: string | null;
  mediaUrl: string;
  mediaUrls: string[];
  mediaType: AdMediaKind;
  endsAt: string;
  advertiser: { username: string; displayName: string; avatar: string; isVerified: boolean };
}

/** the words under a request, in the sender's own list */
export function statusText(a: Pick<AdApplication, 'status' | 'endsAt' | 'approvedPages'>, now = Date.now()): string {
  if (a.status === 'pending') return 'Received. The NOOB team will contact you soon.';
  if (a.status === 'rejected') return 'Not approved';
  const ends = a.endsAt ? Date.parse(a.endsAt) : NaN;
  if (a.status === 'approved' && Number.isFinite(ends) && ends > now) {
    const left = Math.max(1, Math.ceil((ends - now) / 86_400_000));
    return `Running on ${pagesText(a.approvedPages)}, ${left} day${left === 1 ? '' : 's'} left`;
  }
  return 'Finished';
}

/** the next ad to show when there are several: they take turns, one after the other */
export function nextAdIndex(current: number, count: number): number {
  return count <= 0 ? 0 : (current + 1) % count;
}
