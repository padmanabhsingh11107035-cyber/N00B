// "last seen today at 5:42 PM", "last seen yesterday at 11:20 AM", "last seen 12 Oct 2026 at 5:42 PM" - the person's last seen, in the viewer's own time zone.
// `hour12` follows the chat setting (12-hour or 24-hour clock); `now` is only there so the wording can be tested.
export function formatLastSeen(value?: string | null, hour12: boolean = true, now: number = Date.now()): string {
  if (!value) return '';
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return '';
  const time = at.toLocaleTimeString([], hour12 ? { hour: 'numeric', minute: '2-digit', hour12: true } : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date(now)) - startOfDay(at)) / 86400000);
  if (now - at.getTime() < 60000) return 'last seen just now';
  if (days <= 0) return `last seen today at ${time}`;
  if (days === 1) return `last seen yesterday at ${time}`;
  const date = at.toLocaleDateString([], at.getFullYear() === new Date(now).getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  return `last seen ${date} at ${time}`;
}
