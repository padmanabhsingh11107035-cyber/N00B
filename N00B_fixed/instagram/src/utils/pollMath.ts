/** Whole percentages that add up to exactly 100 (the "largest remainder" way), so a poll never shows 99% or 101% in total. No votes at all gives zeros. */
export function percents(votes: number[]): number[] {
  const total = votes.reduce((a, b) => a + b, 0);
  if (total <= 0) return votes.map(() => 0);
  const raw = votes.map((v) => (v / total) * 100);
  const base = raw.map(Math.floor);
  let left = 100 - base.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) { if (left <= 0) break; base[i] += 1; left -= 1; }
  return base;
}
