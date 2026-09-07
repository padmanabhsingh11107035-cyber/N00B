/**
 * Utility function to format NOOB points compactly
 */
export function formatNoobPoints(points: number = 0): string {
  if (points >= 1_000_000) {
    return `${(points / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (points >= 1_000) {
    return `${(points / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return points.toLocaleString();
}
