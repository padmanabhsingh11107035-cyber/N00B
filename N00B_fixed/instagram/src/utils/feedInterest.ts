// "Interested" / "Not interested" on a post or reel (the three-dot sheet): kept on this phone, so the post is hidden from the feeds right away and stays hidden, and the person's
// "Interested" ones are remembered too. Small lists (the newest 500 of each), never sent anywhere.
type Kind = 'post' | 'reel';
const key = (k: Kind, w: 'no' | 'yes') => `noob_interest_${w}_${k}`;
const read = (k: string): string[] => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };
const write = (k: string, v: string[]): void => { try { localStorage.setItem(k, JSON.stringify(v.slice(-500))); } catch { /* not remembered */ } };

import { supabase } from '../services/supabase';

const AUTHORS_KEY = 'noob_interest_hidden_authors';
const readAuthors = (): string[] => read(AUTHORS_KEY);
/** accounts this person does not want to see ("I do not like this account"): their posts and reels are filtered out */
export const hiddenAuthorIds = (): Set<string> => new Set(readAuthors());

/** Sends the answer to the server (so it follows the person to every phone); a failure (or the table not being there yet) changes nothing on this phone. */
function push(kind: Kind, id: string, value: 'no' | 'yes' | null, reasons: string[] = []): void {
  try { void supabase.rpc('set_feed_interest', { p_kind: kind, p_item: id, p_value: value, p_reasons: reasons }).then(() => undefined, () => undefined); } catch { /* kept on the phone */ }
}

/** Reads the person's answers from the server and adds them to this phone's (once per start of the app); resolves true when something came. */
export async function syncInterest(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('my_feed_interest');
    if (error || !data) return false;
    const d = data as { no?: Array<{ kind: Kind; id: string }>; yes?: Array<{ kind: Kind; id: string }>; hiddenAuthors?: string[] };
    (['post', 'reel'] as Kind[]).forEach((k) => {
      const no = new Set(read(key(k, 'no')));
      (d.no || []).filter((x) => x.kind === k).forEach((x) => no.add(String(x.id)));
      write(key(k, 'no'), [...no]);
      const yes = new Set(read(key(k, 'yes')));
      (d.yes || []).filter((x) => x.kind === k).forEach((x) => yes.add(String(x.id)));
      write(key(k, 'yes'), [...yes]);
    });
    write(AUTHORS_KEY, (d.hiddenAuthors || []).map(String));
    return true;
  } catch { return false; }
}

export function setInterest(kind: Kind, id: string, value: 'no' | 'yes' | null): void {
  push(kind, id, value);
  const no = read(key(kind, 'no')).filter((x) => x !== id);
  const yes = read(key(kind, 'yes')).filter((x) => x !== id);
  if (value === 'no') no.push(id);
  if (value === 'yes') yes.push(id);
  write(key(kind, 'no'), no);
  write(key(kind, 'yes'), yes);
}
export const notInterested = (kind: Kind, id: string): boolean => read(key(kind, 'no')).includes(id);
export const interested = (kind: Kind, id: string): boolean => read(key(kind, 'yes')).includes(id);
/** the ids of everything the person said "Not interested" to (for filtering a list) */
export const notInterestedIds = (kind: Kind): Set<string> => new Set(read(key(kind, 'no')));

/** Why a post or reel was marked "Not interested" (kept on this phone only: the newest 200 answers). */
export function saveReasons(kind: Kind, id: string, reasons: string[], authorId?: string): void {
  if (!reasons.length) return;
  push(kind, id, 'no', reasons);   // the server keeps the reasons, and hides the account when "I do not like this account" was ticked
  if (authorId && reasons.some((r) => /account/i.test(r))) write(AUTHORS_KEY, [...new Set([...readAuthors(), authorId])]);
  try {
    const all = JSON.parse(localStorage.getItem('noob_interest_reasons') || '[]');
    const list = Array.isArray(all) ? all : [];
    list.push({ kind, id, reasons, at: Date.now() });
    localStorage.setItem('noob_interest_reasons', JSON.stringify(list.slice(-200)));
  } catch { /* not remembered */ }
}
