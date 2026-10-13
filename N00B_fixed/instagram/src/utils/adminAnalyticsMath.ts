// The numbers behind the administrator's analytics graphs, kept apart from the screen and the database call so they can be tested.
export interface DayPoint { d: string; n: number }
export interface LabelCount { label: string; n: number }
export interface PlatformOverview {
  days: number;
  generatedAt: string;
  totals: Record<string, number>;
  series: Record<'users' | 'posts' | 'reels' | 'stories' | 'messages' | 'comments' | 'orders' | 'games' | 'reports' | 'signIns' | 'active', DayPoint[]>;
  breakdowns: Record<'accountTypes' | 'ordersByStatus' | 'reportsByStatus' | 'postsByCategory' | 'messageTypes' | 'topGames', LabelCount[]>;
}

// whole-number maths used by the panel (kept here so it can be tested)
export const sumSeries = (s: DayPoint[]): number => s.reduce((a, p) => a + (Number(p.n) || 0), 0);
// the change between the first and second half of a period, as a percentage (null when there is nothing to compare with)
export function trend(s: DayPoint[]): number | null {
  if (s.length < 4) return null;
  const half = Math.floor(s.length / 2);
  const before = sumSeries(s.slice(0, half)), after = sumSeries(s.slice(s.length - half));
  if (before === 0) return after === 0 ? 0 : null;
  return Math.round(((after - before) / before) * 100);
}
// a CSV of the daily numbers for a spreadsheet (one row per day, one column per series)
export function toCsv(o: PlatformOverview): string {
  const keys = Object.keys(o.series) as Array<keyof PlatformOverview['series']>;
  const days = o.series[keys[0]].map((p) => p.d);
  const rows = [['date', ...keys].join(',')];
  days.forEach((d, i) => rows.push([d, ...keys.map((k) => o.series[k][i]?.n ?? 0)].join(',')));
  return rows.join('\n');
}
