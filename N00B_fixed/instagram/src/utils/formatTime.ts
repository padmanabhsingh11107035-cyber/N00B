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
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

/** Exact clock time in the viewer's local timezone, e.g. "3:45 PM". */
export function formatClockTime(value?: string | null): string {
  const date = parseTimestamp(value);
  if (!date) return value || '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
