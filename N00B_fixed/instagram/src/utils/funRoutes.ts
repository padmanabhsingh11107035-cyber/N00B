import { MAIN_SITE } from './siteUrl.ts';

// The four "Fun" pages in the three-line menu - This or That, Ask Me Anything, Mood Status, Public Polls - and their addresses. Each has its own address so it can be opened and
// shared directly (the Ask page of one person, or one poll, is the thing people send to friends):
//   /this-or-that      /ask   (my questions)      /ask/<username>   (ask that person)      /mood      /polls      /polls/<id>
export type FunFeature = 'this-or-that' | 'ask' | 'mood' | 'polls';

/** NOOB Forms live beside the Fun pages: /forms (my forms), /forms/<id> (the editor), /forms/<id>/responses, and /f/<address> (a form anyone can fill, no account) */
export type FormsFeature = 'forms' | 'form';
export interface FunLocation {
  feature: FunFeature | FormsFeature;
  /** Ask: the username whose page is shown; Polls: the id of the poll that is open; Forms: the id of the form; Form: its address */
  target?: string;
  /** Forms: 'responses' = the answers of the form */
  sub?: 'responses';
}

export const FUN_FEATURES: ReadonlyArray<{ id: FunFeature; label: string; short: string; path: string; blurb: string }> = [
  { id: 'this-or-that', label: 'This or That', short: 'This or That', path: '/this-or-that', blurb: 'Pick a side and see what everyone chose' },
  { id: 'ask', label: 'Ask Me Anything', short: 'Ask Me', path: '/ask', blurb: 'Get anonymous questions from friends' },
  { id: 'mood', label: 'Mood Status', short: 'Mood', path: '/mood', blurb: 'Share how you feel, your way' },
  { id: 'polls', label: 'Public Polls', short: 'Polls', path: '/polls', blurb: 'Ask the community and watch votes arrive' }
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USERNAME = /^[A-Za-z0-9._]{1,30}$/;

export const isPollId = (s: string): boolean => UUID.test(s);
export const isUsername = (s: string): boolean => USERNAME.test(s);

const FORM_SLUG = /^[a-z0-9]{8,24}$/;
export const isFormSlug = (s: string): boolean => FORM_SLUG.test(s);

export function funPath(loc: FunLocation): string {
  if (loc.feature === 'form') return loc.target && isFormSlug(loc.target) ? `/f/${loc.target}` : '/forms';
  if (loc.feature === 'forms') return loc.target && isPollId(loc.target) ? `/forms/${loc.target}${loc.sub === 'responses' ? '/responses' : ''}` : '/forms';
  const base = FUN_FEATURES.find((f) => f.id === loc.feature)?.path ?? '/';
  if (loc.feature === 'ask' && loc.target && isUsername(loc.target)) return `${base}/${encodeURIComponent(loc.target)}`;
  if (loc.feature === 'polls' && loc.target && isPollId(loc.target)) return `${base}/${loc.target}`;
  return base;
}

/** The page an address stands for, or null when it is not one of ours. */
export function parseFunPath(pathname: string): FunLocation | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  const head = parts[0].toLowerCase();
  if (head === 'forms') {
    if (parts.length === 1) return { feature: 'forms' };
    if (isPollId(parts[1]) && parts.length === 2) return { feature: 'forms', target: parts[1].toLowerCase() };
    if (isPollId(parts[1]) && parts.length === 3 && parts[2] === 'responses') return { feature: 'forms', target: parts[1].toLowerCase(), sub: 'responses' };
    return null;
  }
  if (head === 'f') return parts.length === 2 && isFormSlug(parts[1].toLowerCase()) ? { feature: 'form', target: parts[1].toLowerCase() } : null;
  const feature = FUN_FEATURES.find((f) => f.path === `/${head}`)?.id;
  if (!feature) return null;
  if (parts.length === 1) return { feature };
  if (parts.length !== 2) return null;
  let target = '';
  try { target = decodeURIComponent(parts[1]); } catch { return null; }
  if (feature === 'ask' && isUsername(target)) return { feature, target };
  if (feature === 'polls' && isPollId(target)) return { feature, target: target.toLowerCase() };
  return null;
}

/** The full link people share: always NOOB's main address (every address of the site answers, but the one that is shown and shared is the same for everyone). */
export function funShareUrl(loc: FunLocation, origin: string = MAIN_SITE): string {
  return `${origin}${funPath(loc)}`;
}
