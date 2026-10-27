// The words and the grouping of the call list (Messages page > Calls): pure, so each sentence can be tested.
export interface CallLogRow { id: string; chatId: string; actorId: string | null; actorUsername?: string | null; kind: 'ended' | 'missed' | 'declined'; durationSeconds: number | null; createdAt: string }

export const clock = (secs: number | null | undefined): string => {
  const s = Math.max(0, Math.floor(secs || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** what a line says to ME: who rang, and how it went */
export function callLine(r: CallLogRow, me: string): { text: string; tone: 'ok' | 'bad'; incoming: boolean } {
  const mine = r.actorId === me;
  if (r.kind === 'ended') return { text: `Call · ${clock(r.durationSeconds)}`, tone: 'ok', incoming: false };
  if (r.kind === 'missed') return mine ? { text: 'Not answered', tone: 'ok', incoming: false } : { text: 'Missed call', tone: 'bad', incoming: true };
  return mine ? { text: 'You declined', tone: 'ok', incoming: true } : { text: 'Declined', tone: 'ok', incoming: false };
}

const dayKey = (d: Date): string => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (dayKey(d) === dayKey(now)) return 'Today';
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (dayKey(d) === dayKey(y)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
export function groupByDay(rows: CallLogRow[], now = new Date()): { day: string; label: string; rows: CallLogRow[] }[] {
  const out: { day: string; label: string; rows: CallLogRow[] }[] = [];
  for (const r of rows) {
    const k = dayKey(new Date(r.createdAt));
    const last = out[out.length - 1];
    if (last && last.day === k) last.rows.push(r); else out.push({ day: k, label: dayLabel(r.createdAt, now), rows: [r] });
  }
  return out;
}
