// Repost state for many cards in ONE request. Every post card / reel asks "did I repost this, and how many did?" - asked one by one that was
// N requests per screen. The batcher collects the questions that arrive within ~30 ms, asks once (repost_states, at most 100 ids), and keeps
// the answers in a Map so a card that is drawn again does not ask again. A toggle updates (or drops) the remembered answer.
export type RepostKindName = 'post' | 'reel' | 'story';
export interface RepostState { isReposted: boolean; count: number }
export type RepostFetcher = (kind: RepostKindName, ids: string[]) => Promise<Record<string, RepostState>>;

export const REPOST_BATCH_MS = 30;
export const REPOST_BATCH_MAX = 100;

export function createRepostBatcher(fetcher: RepostFetcher, delayMs = REPOST_BATCH_MS) {
  const cache = new Map<string, RepostState>();
  const waiting = new Map<string, Array<(s: RepostState) => void>>();   // key -> callers waiting for the answer
  const pending = new Set<string>();                                    // keys collected for the next request
  let timer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;                                                   // bumped by invalidate/set so an older answer cannot overwrite a newer one
  const keyOf = (k: RepostKindName, id: string) => `${k}:${id}`;
  const empty = (): RepostState => ({ isReposted: false, count: 0 });

  const flush = () => {
    timer = null;
    const keys = [...pending];
    pending.clear();
    const byKind = new Map<RepostKindName, string[]>();
    for (const key of keys) {
      const i = key.indexOf(':');
      const kind = key.slice(0, i) as RepostKindName;
      byKind.set(kind, [...(byKind.get(kind) || []), key.slice(i + 1)]);
    }
    for (const [kind, ids] of byKind) {
      for (let at = 0; at < ids.length; at += REPOST_BATCH_MAX) {
        const chunk = ids.slice(at, at + REPOST_BATCH_MAX);
        const gen = generation;
        void fetcher(kind, chunk).catch(() => ({} as Record<string, RepostState>)).then((answers) => {
          for (const id of chunk) {
            const key = keyOf(kind, id);
            const got = answers[id];
            if (got && gen === generation && !cache.has(key)) cache.set(key, { isReposted: !!got.isReposted, count: Number(got.count) || 0 });
            const state = cache.get(key) ?? got ?? empty();
            const cbs = waiting.get(key) || [];
            waiting.delete(key);
            cbs.forEach((cb) => cb(state));
          }
        });
      }
    }
  };

  return {
    /** The answer for one post / reel / story. Questions asked close together travel in one request. */
    get(kind: RepostKindName, id: string): Promise<RepostState> {
      const key = keyOf(kind, id);
      const hit = cache.get(key);
      if (hit) return Promise.resolve(hit);
      return new Promise((resolve) => {
        waiting.set(key, [...(waiting.get(key) || []), resolve]);
        pending.add(key);
        if (!timer) timer = setTimeout(flush, delayMs);
      });
    },
    /** After a toggle the server told us the new answer: remember it. */
    set(kind: RepostKindName, id: string, state: RepostState): void { generation++; cache.set(keyOf(kind, id), state); },
    /** Forget one answer (asked again next time). */
    invalidate(kind: RepostKindName, id: string): void { generation++; cache.delete(keyOf(kind, id)); },
    clear(): void { generation++; cache.clear(); },
  };
}

/** 1200 -> 1.2K, 15300 -> 15K, 2500000 -> 2.5M. Under 1000 the number as it is. */
export function formatCompactCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n < 1000) return String(Math.floor(n));
  const unit = (v: number, s: string) => { const r = v >= 10 ? Math.floor(v) : Math.floor(v * 10) / 10; return `${r}${s}`.replace('.0', ''); };
  if (n < 1e6) { const v = n / 1e3; return v >= 999.95 ? '1M' : unit(v, 'K'); }
  if (n < 1e9) return unit(n / 1e6, 'M');
  return unit(n / 1e9, 'B');
}
