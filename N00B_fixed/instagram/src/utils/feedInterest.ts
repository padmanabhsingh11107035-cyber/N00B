// "Interested" / "Not interested" on a post or reel (the three-dot sheet): kept on this phone, so the post is hidden from the feeds right away and stays hidden, and the person's
// "Interested" ones are remembered too. Small lists (the newest 500 of each), never sent anywhere.
type Kind = 'post' | 'reel';
const key = (k: Kind, w: 'no' | 'yes') => `noob_interest_${w}_${k}`;
const read = (k: string): string[] => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };
const write = (k: string, v: string[]): void => { try { localStorage.setItem(k, JSON.stringify(v.slice(-500))); } catch { /* not remembered */ } };

export function setInterest(kind: Kind, id: string, value: 'no' | 'yes' | null): void {
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
