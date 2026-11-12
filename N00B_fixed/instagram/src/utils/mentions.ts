// The ONE @mention rule of the app: a username is 1-30 of a-z, 0-9, "_" and "." (the sign-up rule, case does not matter), and the "@" must not follow a letter, digit, "_", ".", "/", "&", "@", "#" or "-"
// (so an email address "a@b.com" and "site.com/@page" are not mentions). A "." at the end of the name is punctuation ("hi @sam.") and is not part of it. Pure functions only (no React).

const SOURCE = String.raw`(^|[^\p{L}\p{N}_./&@#-])@([A-Za-z0-9_.]{1,30})`;

export interface MentionMatch { start: number; end: number; username: string }

/** Where the @mentions are inside a piece of text: start/end cover "@name" itself; `username` is without the "@" and without a trailing ".". */
export function findMentions(text: string | null | undefined): MentionMatch[] {
  if (!text) return [];
  const out: MentionMatch[] = [];
  for (const m of text.matchAll(new RegExp(SOURCE, 'gu'))) {
    const username = m[2].replace(/\.+$/, '');
    if (!username || !/[A-Za-z0-9]/.test(username)) continue;
    const start = (m.index ?? 0) + m[1].length;
    out.push({ start, end: start + 1 + username.length, username });
  }
  return out;
}
