// Pure logic of the usage alert (no network): percentages of the Supabase free plan and the warning threshold.
export const LIMITS = { db_bytes: 500 * 1024 * 1024, storage_bytes: 1024 * 1024 * 1024 }; // free plan: 500 MB database, 1 GB storage
export const WARN_AT = 0.8;

export function evaluateUsage(probe, { limits = LIMITS, warnAt = WARN_AT } = {}) {
  const items = [
    { key: 'db_bytes', label: 'Database size' },
    { key: 'storage_bytes', label: 'File storage' },
  ].map(({ key, label }) => {
    const used = Number(probe?.[key]);
    if (!Number.isFinite(used) || used < 0) throw new Error(`usage probe returned no valid number for ${key}`);
    const limit = limits[key];
    const pct = (used / limit) * 100;
    return { key, label, used, limit, pct, warn: used / limit >= warnAt };
  });
  return { items, warn: items.some((i) => i.warn) };
}

export const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;

export function describe(result) {
  return result.items.map((i) => `${i.label}: ${mb(i.used)} of ${mb(i.limit)} (${i.pct.toFixed(1)}%)${i.warn ? '  <-- WARNING' : ''}`).join('\n');
}
