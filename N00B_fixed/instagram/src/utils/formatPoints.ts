/**
 * Utility function to format NOOB points compactly
 */
export function formatNoobPoints(points: number = 0): string {
  if (points >= 1_000_000_000_000) {
    return `${(points / 1_000_000_000_000).toFixed(1).replace(/\.0$/, '')}T`;
  }
  if (points >= 1_000_000_000) {
    return `${(points / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  }
  if (points >= 1_000_000) {
    return `${(points / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (points >= 1_000) {
    return `${(points / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return points.toLocaleString();
}

/**
 * Turns a payment's raw transferId (a uuid) into the short, human "Payment ID" shown on a receipt —
 * e.g. "NOOB-7F3A1C9E". Same input always gives the same output, so it's safe to compute wherever a
 * transferId is shown (the success screen, the wallet history, customer support), without storing it
 * separately anywhere.
 */
export function formatPaymentId(transferId: string): string {
  return `NOOB-${transferId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}
