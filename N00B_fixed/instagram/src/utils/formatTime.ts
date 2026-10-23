/**
 * Messages/notifications are stored as ISO timestamps (UTC) so every
 * viewer sees them in their OWN local time, not whichever timezone the
 * server happens to run in. These helpers turn that stored ISO string
 * into display text. Some older records predate this and still hold a
 * pre-formatted string (e.g. "3:45 PM") or the literal "Just now" — those
 * aren't valid dates, so both helpers fall back to showing the raw value
 * rather than "Invalid Date".
 */

function parseTimestamp(value?: string | null): Date | null {
  if (!value) return null;
  // The database writes microseconds ("…:26.87493+00:00"); some phone browsers (Safari) only read up to 3 digits and call the whole date invalid, which showed
  // the raw text instead of "5h ago". Cut the fraction to 3 digits first.
  const date = new Date(String(value).replace(/(\.\d{3})\d+/, '$1'));
  return isNaN(date.getTime()) ? null : date;
}

/** Exact clock time in the viewer's local timezone, e.g. "3:45 PM" ("15:45" when `hour12` is false: Settings > Chats > Time in chats). */
export function formatClockTime(value?: string | null, hour12?: boolean): string {
  const date = parseTimestamp(value);
  if (!date) return value || '';
  // the 24-hour clock says 00:05 after midnight (never 24:05), which is what hourCycle 'h23' is for
  return date.toLocaleTimeString([], hour12 === undefined ? { hour: '2-digit', minute: '2-digit' } : hour12 ? { hour: '2-digit', minute: '2-digit', hour12: true } : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

/** Exact absolute date + time in the viewer's local timezone, e.g. "13 Sep 2026, 4:48 PM". */
export function formatExactDateTime(value?: string | null): string {
  const date = parseTimestamp(value);
  if (!date) return value || '';
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

/** Relative time for feeds/notifications, e.g. "5m ago", "3h ago", "Sep 10". */
export function formatRelativeTime(value?: string | null): string {
  const date = parseTimestamp(value);
  if (!date) return value || '';

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 5) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString([], sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}
