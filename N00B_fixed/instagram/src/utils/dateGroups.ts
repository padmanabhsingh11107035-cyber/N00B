// The day headings of a history list, the way YouTube writes them: "Today", "Yesterday", the weekday for the rest of the week, then the date.
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function dayGroupLabel(value: string | number | Date, now: Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Earlier';
  const diff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return date.toLocaleDateString('en-GB', { weekday: 'long' });
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

/** Items in the order given, split into runs that share a day heading. */
export function groupByDay<T>(items: T[], dateOf: (item: T) => string | number | Date | undefined | null, now: Date = new Date()): { label: string; items: T[] }[] {
  const out: { label: string; items: T[] }[] = [];
  for (const item of items) {
    const raw = dateOf(item);
    const label = raw === undefined || raw === null ? 'Earlier' : dayGroupLabel(raw, now);
    const last = out[out.length - 1];
    if (last && last.label === label) last.items.push(item);
    else out.push({ label, items: [item] });
  }
  return out;
}
