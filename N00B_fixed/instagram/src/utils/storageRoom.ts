// Per-person storage limit (migration 20261114000013). The database says how much a person already uses and what their limit is (null = no limit for them, or the limit is switched
// off); this decides whether one more file fits. Anything unclear means "yes": a question that can not be answered must never stop an upload.
export interface StorageUsage { usedBytes: number; capBytes: number | null }

export const STORAGE_FULL_MESSAGE = 'Storage full: delete something to upload more.';

const mb = (bytes: number) => `${Math.max(0, Math.round(bytes / 1024 / 1024))} MB`;

/** null = the file may go up; otherwise the message to show. Never throws. */
export function storageRefusal(usage: unknown, fileBytes: number): string | null {
  try {
    const u = usage as Partial<StorageUsage> | null | undefined;
    if (!u || typeof u.capBytes !== 'number' || !(u.capBytes > 0)) return null;
    const used = typeof u.usedBytes === 'number' && u.usedBytes >= 0 ? u.usedBytes : 0;
    const size = Number.isFinite(fileBytes) && fileBytes > 0 ? fileBytes : 0;
    if (used + size <= u.capBytes) return null;
    return `${STORAGE_FULL_MESSAGE} You are using ${mb(used)} of ${mb(u.capBytes)}.`;
  } catch {
    return null;
  }
}
