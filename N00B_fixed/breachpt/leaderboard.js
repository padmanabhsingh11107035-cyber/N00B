// The score board of this game is kept on this device only (no account, no network). It keeps the shape the game was written for:
// every call answers with a Result, so the game never waits for anything online.
const KEY = 'noob.breachpoint.board';
const MAX = 200;

export function createLeaderboardClient({ boardId, rulesVersion, storage } = {}) {
  if (typeof boardId !== 'string' || typeof rulesVersion !== 'string') throw new Error('invalid_options');
  let name = 'OPERATOR';
  const runs = new WeakMap();
  const store = () => { try { return storage ?? globalThis.localStorage; } catch { return undefined; } };
  const load = () => { try { const v = JSON.parse(store()?.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter((r) => r && Number.isFinite(r.score)) : []; } catch { return []; } };
  const save = (list) => { try { store()?.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch { /* the board lives for this visit only */ } };
  const view = (limit = 20) => {
    const list = load().sort((a, b) => b.score - a.score);
    return {
      namespace: 'device', boardId, rulesVersion, trust: 'client_reported',
      entries: list.slice(0, limit).map((r, i) => ({ playerId: 'me', displayName: r.name || 'OPERATOR', score: r.score, rank: i + 1, achievedAt: r.at })),
      myRank: list.length ? { rank: 1, score: list[0].score } : null,
    };
  };
  const ok = (value) => ({ ok: true, value });
  const send = (ticket, record) => {
    const list = load();
    list.push({ name, score: record.payload.score, at: new Date().toISOString() });
    list.sort((a, b) => b.score - a.score);
    save(list);
    return { receipt: { runId: ticket.runId, score: record.payload.score, accepted: true, trust: 'client_reported' }, leaderboard: ok(view()) };
  };
  return Object.freeze({
    list: async (limit = 20) => ok(view(limit)),
    ensureGuest: async (displayName) => { if (typeof displayName === 'string' && displayName) name = displayName; return ok(undefined); },
    beginRun: async () => { const ticket = Object.freeze({ runId: 'local' }); runs.set(ticket, { payload: null }); return ok(ticket); },
    submitRun: async (ticket, score, durationMs) => {
      const record = runs.get(ticket);
      if (!record) return { ok: false, error: 'run_not_owned' };
      if (!Number.isSafeInteger(score) || Math.abs(score) > 1e9 || !Number.isSafeInteger(durationMs) || durationMs < 0) return { ok: false, error: 'invalid_score' };
      if (record.payload && (record.payload.score !== score || record.payload.durationMs !== durationMs)) return { ok: false, error: 'submission_conflict' };
      if (!record.payload) { record.payload = Object.freeze({ score, durationMs }); return ok(send(ticket, record)); }
      return ok(send(ticket, record));
    },
    retryRun: async (ticket) => {
      const record = runs.get(ticket);
      if (!record?.payload) return { ok: false, error: 'submission_not_started' };
      return ok({ receipt: { runId: ticket.runId, score: record.payload.score, accepted: true, trust: 'client_reported' }, leaderboard: ok(view()) });
    },
  });
}
