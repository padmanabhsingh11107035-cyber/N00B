/** Which account to go to: the next one after the one used last time, so repeated double-taps rotate through all of them. */
export function pickNext<T extends { id: string }>(candidates: T[], lastId: string | null): T | null {
  if (!candidates.length) return null;
  const at = lastId ? candidates.findIndex((c) => c.id === lastId) : -1;
  return candidates[(at + 1) % candidates.length];
}
