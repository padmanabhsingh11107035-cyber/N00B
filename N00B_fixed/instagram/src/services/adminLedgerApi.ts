import { supabase } from './supabase';

// The main administrator's three new pages (User logs, Accounts, Visitors) and one user's transactions. Every answer comes from a function that checks, in the database, that the
// person asking really is allowed (the main administrator; for one user's transactions: anyone who may see accounts).
type Out<T> = { ok: true; data: T; error?: undefined } | { ok: false; error: string; data?: undefined };

const needsUpdate = (m: string) => /could not find the function|schema cache|does not exist/i.test(m);
async function call<T>(fn: string, args: Record<string, unknown>, what: string): Promise<Out<T>> {
  try {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) return { ok: false, error: needsUpdate(error.message) ? `${what} needs its database update. Run the newest migration, then try again.` : error.message };
    return { ok: true, data: data as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Something went wrong.' };
  }
}

// ---------------------------------------------------------------- user logs
export type UserLogKind = 'joined' | 'deleted' | 'unfinished';
export interface UserLogEvent {
  kind: UserLogKind; at: string; userId: string | null; username: string | null; displayName: string | null; avatar: string | null; email: string | null;
  detail: string | null; how: 'self' | 'admin' | 'system' | null; by: string | null; joinedAt: string | null;
}
export interface UserLogs {
  events: UserLogEvent[]; total: number;
  summary: { joined: number; joinedLast7Days: number; deleted: number; deletedBySelf: number; deletedByAdmin: number; deletedBySystem: number; unfinished: number };
}
export const fetchUserLogs = (o: { limit?: number; offset?: number; search?: string; kind?: 'all' | UserLogKind } = {}) =>
  call<UserLogs>('admin_user_logs', { p_limit: o.limit ?? 100, p_offset: o.offset ?? 0, p_search: o.search || null, p_kind: o.kind || 'all' }, 'User logs');

// ---------------------------------------------------------------- the ledger
export interface LedgerRow { id: string; at: string; userId: string; username: string | null; displayName: string | null; avatar: string | null; amount: number; reason: string; balanceAfter: number | null; transferId: string | null }
export interface Ledger { rows: LedgerRow[]; totals: { count: number; credited: number; debited: number; circulation: number; users: number } }
export const fetchLedger = (o: { limit?: number; offset?: number; search?: string; direction?: 'all' | 'in' | 'out'; from?: string; to?: string } = {}) =>
  call<Ledger>('admin_accounts_ledger', { p_limit: o.limit ?? 100, p_offset: o.offset ?? 0, p_search: o.search || null, p_direction: o.direction || 'all', p_from: o.from || null, p_to: o.to || null }, 'Accounts');

export interface UserTransactions { balance: number | null; count: number; credited: number; debited: number; rows: Array<Omit<LedgerRow, 'userId' | 'username' | 'displayName' | 'avatar'>> }
export const fetchUserTransactions = (userId: string, limit = 200) => call<UserTransactions>('admin_user_transactions', { p_user: userId, p_limit: limit }, 'The transactions list');

// ---------------------------------------------------------------- the audit
export interface AuditIssue { id: string; userId: string | null; username: string | null; kind: 'balance_mismatch' | 'chain_break' | 'negative_balance' | 'transfer_mismatch' | 'no_ledger' | string; severity: 'error' | 'info'; detail: Record<string, any>; resolvedAt: string | null; resolution: string | null }
export interface AuditSummary { id: string; runAt: string; kind: 'weekly' | 'manual'; status: 'clean' | 'issues'; errors: number; notes: number }
export interface AccountingOverview {
  circulation: number; users: number; transactions: number;
  audit: (AuditSummary & { usersChecked: number; transactionsChecked: number; totalPoints: number }) | null;
  issues: AuditIssue[]; audits: AuditSummary[];
}
export const fetchAccountingOverview = (auditId?: string) => call<AccountingOverview>('admin_accounting_overview', { p_audit: auditId || null }, 'The audit');
export const runAccountingAudit = () => call<AccountingOverview>('admin_run_accounting_audit', {}, 'The audit');
export const fixAccountingIssue = (issueId: string, note?: string) => call<{ success: boolean; already?: boolean }>('admin_fix_accounting_issue', { p_issue: issueId, p_note: note || null }, 'The audit');

// ---------------------------------------------------------------- visitors
export interface SiteVisit {
  visitorId: string; firstSeen: string; lastSeen: string; visits: number; userId: string | null; username: string | null; displayName: string | null; avatar: string | null; email: string | null;
  browser: string | null; os: string | null; device: string | null; platform: 'app' | 'pwa' | 'web' | null; language: string | null; timezone: string | null; screen: string | null;
  referrer: string | null; landingPath: string | null; lastPath: string | null; country: string | null; region: string | null; city: string | null; ip: string | null; isBot: boolean;
}
export interface SiteVisits {
  rows: SiteVisit[]; total: number;
  summary: { devices: number; today: number; members: number; guests: number; bots: number; visits: number; countries: Array<{ country: string; devices: number }> };
}
export const fetchSiteVisits = (o: { limit?: number; offset?: number; search?: string; who?: 'people' | 'all' | 'guests' | 'members' | 'bots' } = {}) =>
  call<SiteVisits>('admin_site_visits', { p_limit: o.limit ?? 100, p_offset: o.offset ?? 0, p_search: o.search || null, p_who: o.who || 'people' }, 'Visitors');
