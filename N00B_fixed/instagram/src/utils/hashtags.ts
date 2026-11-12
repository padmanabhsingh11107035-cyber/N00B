// The ONE hashtag rule of the app (the database has the same rule in public.extract_hashtags, supabase/migrations/20261112000001_hashtags_and_edit_post.sql):
// a tag is "#" + 1-50 letters / digits / underscores with at least one letter, and the "#" must not follow a letter, digit, "_", "/", "&" or another "#"
// (so "site.com/page#section" and "a#b" are not tags). Pure functions only (no React), so they can be tested on their own.

export const HASHTAG_MAX_PER_POST = 30;
export const CAPTION_MAX = 2200;

const SOURCE = String.raw`(^|[^\p{L}\p{N}_/&#])#([\p{L}\p{N}_]{1,50})`;

export interface HashtagMatch { start: number; end: number; tag: string }

/** Where the hashtags are inside a piece of text: start/end cover "#tag" itself (not the character before it); `tag` is without the "#", as typed. */
export function findHashtags(text: string | null | undefined): HashtagMatch[] {
  if (!text) return [];
  const out: HashtagMatch[] = [];
  for (const m of text.matchAll(new RegExp(SOURCE, 'gu'))) {
    const tag = m[2];
    if (!/\p{L}/u.test(tag)) continue;   // "#123" and "#_" are not tags
    const start = (m.index ?? 0) + m[1].length;
    out.push({ start, end: start + 1 + tag.length, tag });
  }
  return out;
}

/** The tags of a caption: "#lower-case", without repeats, in order of first appearance (what the database stores). */
export function extractHashtags(text: string | null | undefined, max = HASHTAG_MAX_PER_POST): string[] {
  const seen = new Set<string>();
  for (const m of findHashtags(text)) seen.add('#' + m.tag.toLowerCase());
  return [...seen].slice(0, max);
}

/** "#Tag", "tag", " #TAG " -> "tag" (the way a tag is looked up) */
export const normalizeTag = (tag: string): string => String(tag || '').trim().replace(/^#+/, '').toLowerCase();

/** A tag worth opening a page for */
export const isValidTag = (tag: string): boolean => /^[\p{L}\p{N}_]{1,50}$/u.test(normalizeTag(tag)) && /\p{L}/u.test(normalizeTag(tag));
