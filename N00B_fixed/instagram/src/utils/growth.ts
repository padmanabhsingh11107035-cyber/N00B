// The numbers behind the admin's growth card (real counts only; nothing is added to the total).

export const MILESTONES = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];
export const LONG_GOAL = 50000;

export interface Growth { total: number; today: number; week: number; month: number }

/** counts the accounts that joined today (since midnight), in the last 7 days and in the last 30 days */
export function growthStats(createdAts: (string | undefined | null)[], now: number = Date.now()): Growth {
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  const midnight = d.getTime();
  let today = 0, week = 0, month = 0;
  for (const c of createdAts) {
    const t = c ? new Date(c).getTime() : NaN;
    if (!Number.isFinite(t)) continue;
    if (t >= midnight) today++;
    if (t >= now - 7 * 86400000) week++;
    if (t >= now - 30 * 86400000) month++;
  }
  return { total: createdAts.length, today, week, month };
}

export function nextMilestone(total: number): number {
  return MILESTONES.find((m) => m > total) ?? Math.ceil((total + 1) / 1000000) * 1000000;
}

