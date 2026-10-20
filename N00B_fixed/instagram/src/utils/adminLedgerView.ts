// The words and the spreadsheet for the admin pages User logs, Accounts and Visitors: one place, so each sentence can be tested on its own.
import type { UserLogEvent, AuditIssue, LedgerRow, SiteVisit } from '../services/adminLedgerApi';

const num = (n: number | null | undefined) => (n === null || n === undefined ? '' : Number(n).toLocaleString('en-IN'));

// ---------------------------------------------------------------------------------------------- User logs
export function describeEvent(e: UserLogEvent): { name: string; label: string; sentence: string; tone: string; badge: string } {
  const name = e.displayName || (e.username ? `@${e.username}` : e.email || 'Unknown');
  const handle = e.username ? `@${e.username}` : '';
  if (e.kind === 'joined') {
    return { name: e.displayName ? `${e.displayName} ${handle}`.trim() : handle || name, label: 'Joined', tone: 'bg-emerald-500/15 text-emerald-300', badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      sentence: `Joined NOOB${e.detail ? ` (signed up on ${e.detail})` : ''}.` };
  }
  if (e.kind === 'deleted') {
    const who = e.how === 'self' ? 'The person deleted their own account.'
      : e.how === 'admin' ? `The admin / team deleted this account${e.by ? ` (@${e.by})` : ''}.`
      : 'Deleted straight in the database (not from the app).';
    const label = e.how === 'self' ? 'Deleted by themselves' : e.how === 'admin' ? 'Deleted by admin / team' : 'Deleted (database)';
    return { name: e.displayName ? `${e.displayName} ${handle}`.trim() : handle || name, label, sentence: who, tone: 'bg-rose-500/15 text-rose-300',
      badge: e.how === 'self' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-rose-500/15 text-rose-300 border-rose-500/30' };
  }
  return { name, label: 'Never finished', sentence: `Signed in${e.detail ? ` with ${e.detail}` : ''} but did not finish creating the profile, so there is no account yet.`, tone: 'bg-zinc-700/40 text-zinc-300', badge: 'bg-zinc-700/40 text-zinc-300 border-zinc-600' };
}

const cell = (v: unknown) => {
  const t = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const toCsv = (head: string[], rows: unknown[][]) => [head, ...rows].map((r) => r.map(cell).join(',')).join('\n');

export const logsToCsv = (events: UserLogEvent[]) =>
  toCsv(['Event', 'When', 'Name', 'Username', 'Email', 'How', 'By', 'Joined at'], events.map((e) => [e.kind, e.at, e.displayName, e.username, e.email, e.how, e.by, e.joinedAt]));

// ---------------------------------------------------------------------------------------------- Accounts
export const ledgerToCsv = (rows: LedgerRow[]) =>
  toCsv(['When', 'Username', 'Name', 'Amount', 'Reason', 'Balance after', 'Payment ID'], rows.map((r) => [r.at, r.username, r.displayName, r.amount, r.reason, r.balanceAfter, r.transferId]));

/** What an audit finding means, in plain words, and whether one tap can settle it. */
export function describeIssue(i: AuditIssue): { title: string; text: string; fixable: boolean } {
  const d = i.detail || {};
  const who = i.username ? `@${i.username}` : 'an account';
  switch (i.kind) {
    case 'balance_mismatch':
      return { title: 'Balance does not match the ledger', fixable: true,
        text: `${who} has ${num(d.balance)} points, but the last line of their ledger says ${num(d.ledgerBalance)} (${d.difference > 0 ? '+' : ''}${num(d.difference)}). Points moved without a ledger line.` };
    case 'chain_break':
      return { title: 'A ledger line does not follow from the one before', fixable: true,
        text: `${who}: ${num(d.breaks)} line${d.breaks === 1 ? '' : 's'} where the balance does not add up (${d.totalGap > 0 ? '+' : ''}${num(d.totalGap)} in all)${d.example?.reason ? `, for example "${d.example.reason}"` : ''}.` };
    case 'negative_balance':
      return { title: 'Negative balance', fixable: false, text: `${who} is at ${num(d.balance)} points. Use Adjust points on that account to decide what is right.` };
    case 'transfer_mismatch':
      return { title: 'A payment has the wrong number of halves', fixable: false, text: `Payment ${String(d.transferId || '').slice(0, 8).toUpperCase()} has ${num(d.lines)} line${d.lines === 1 ? '' : 's'} adding up to ${num(d.net)} instead of two lines that cancel out.` };
    case 'no_ledger':
      return { title: 'Points with no ledger', fixable: true, text: `${who} has ${num(d.balance)} points that were never written in a ledger (usually from before the ledger existed).` };
    default:
      return { title: i.kind, text: JSON.stringify(d), fixable: false };
  }
}

// ---------------------------------------------------------------------------------------------- Visitors
export const PLATFORM_LABEL: Record<string, string> = { app: 'Android app', pwa: 'Home-screen app', web: 'Browser' };

export function placeOf(v: Pick<SiteVisit, 'city' | 'region' | 'country'>): string {
  return [v.city, v.region, v.country].filter((x, i, a) => x && a.indexOf(x) === i).join(', ') || 'Unknown place';
}

export const visitsToCsv = (rows: SiteVisit[]) =>
  toCsv(['Last seen', 'First seen', 'Visits', 'Account', 'Name', 'Email', 'Device', 'Browser', 'System', 'Opened as', 'Place', 'IP address', 'Language', 'Time zone', 'Screen', 'Came from', 'First page', 'Last page'],
    rows.map((v) => [v.lastSeen, v.firstSeen, v.visits, v.username ? `@${v.username}` : 'Guest', v.displayName, v.email, v.device, v.browser, v.os, v.platform ? PLATFORM_LABEL[v.platform] : '', placeOf(v), v.ip, v.language, v.timezone, v.screen, v.referrer, v.landingPath, v.lastPath]));
