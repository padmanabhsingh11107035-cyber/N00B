import { clipSince, createEngine, dayKey, dayStartFromKey, seqOf, startOfDay, type Engine, type Sample, type Seg } from './timeline.ts';

// NOOB Family Map, the DAY REPORT on the phone: feeds the phone's places into the engine (timeline.ts), keeps today's stays and trips on the phone so a restart loses nothing, and sends them (locked, see
// sealed.ts) to the rooms that get the report. The rules it keeps (each one is tested):
//   * it records only while at least one room gets the report (the person switched it on and shares the location); when that stops, everything of it on the phone is erased at once;
//   * a room gets only what happened SINCE it got the report (a person who joins a room, or switches the report on at 3 pm, does not hand over the morning);
//   * everything of the phone is of TODAY only: when the clocks pass 00:00 (or the phone is opened on a later day) yesterday's report is gone from the phone;
//   * the network is spoken to about once a minute (and when a stay or trip ends); a part that did not arrive is sent again; a stay or trip that disappeared (two stays that turned out to be one) is removed.
export interface RecorderStore { read(): string | null; write(v: string): void; erase(): void }
export interface PushItem { seq: number; seg: Seg | null }
export interface RecorderDeps {
  now: () => number;
  zone: () => string;
  store: RecorderStore;
  /** true while a service keeps the location running even when the app is closed */
  presence: () => boolean;
  /** the rooms that get my day report right now (null: could not be asked, nothing changes) */
  rooms: () => Promise<string[] | null>;
  /** locks and sends the given parts of the day to one room; false = it did not arrive */
  push: (roomId: string, day: string, tz: string, items: PushItem[]) => Promise<boolean>;
}
export interface DayRecorder {
  add(f: Sample): void;
  tick(): Promise<void>;
  refresh(): Promise<void>;
  flush(force?: boolean): Promise<void>;
  save(): void;
  clear(): void;
  rooms(): string[];
  /** what is on the phone right now (for the person's own view and for tests) */
  snapshot(): Seg[];
}

const ROOMS_MS = 60000, FLUSH_MS = 60000, SAVE_MS = 20000, HOLD_MS = 120000, SOON_MS = 5000;
const fingerprint = (s: Seg): string => (s.k === 's' ? `s|${s.a}|${s.b}|${s.r}|${s.open ? 1 : 0}` : `t|${s.a}|${s.b}|${s.d}|${s.path.length}|${s.open ? 1 : 0}`);

export function createRecorder(deps: RecorderDeps): DayRecorder {
  let engine: Engine | null = null;
  let eligible: string[] = [];
  let known = false, eligibleAt = 0;
  let since: Record<string, number> = {};
  let sent: Record<string, Record<string, string>> = {};
  let bookDay = '';
  let lastFlush = 0, lastSave = 0, dirty = false, busy = false, closedSeen = 0;

  const wipe = (): void => { engine = null; since = {}; sent = {}; bookDay = ''; closedSeen = 0; dirty = false; deps.store.erase(); };
  const save = (): void => {
    if (!engine || !eligible.length) return;
    const now = deps.now();
    try { deps.store.write(JSON.stringify({ v: 1, tz: engine.tz(), day: engine.day(), since, sent, engine: engine.state(now) })); lastSave = now; dirty = false; } catch { /* storage full or off: the report goes on in memory */ }
  };

  // today's report from before a restart (anything of another day or another time zone is erased, not read)
  try {
    const raw = deps.store.read();
    if (raw) {
      const j = JSON.parse(raw), now = deps.now(), tz = deps.zone();
      if (j && j.v === 1 && j.tz === tz && j.day === dayKey(now, tz) && j.engine) {
        engine = createEngine({ tz, presence: deps.presence, restore: j.engine, now });
        since = j.since && typeof j.since === 'object' ? j.since : {};
        sent = j.sent && typeof j.sent === 'object' ? j.sent : {};
        bookDay = j.day;
      } else deps.store.erase();
    }
  } catch { deps.store.erase(); }

  async function refresh(): Promise<void> {
    const now = deps.now();
    let r: string[] | null = null;
    try { r = await deps.rooms(); } catch { r = null; }
    eligibleAt = now;
    if (r === null) return;
    known = true;
    eligible = r;
    for (const room of r) if (!(room in since)) since[room] = now;
    for (const room of Object.keys(since)) if (!r.includes(room)) { delete since[room]; delete sent[room]; }
    if (!r.length) wipe(); else dirty = true;
  }

  async function flush(force = false): Promise<void> {
    const now = deps.now();
    if (busy || !engine || !eligible.length) return;
    if (now - lastFlush < (force ? SOON_MS : FLUSH_MS)) return;
    busy = true; lastFlush = now;
    try {
      const day = engine.day(), tz = engine.tz(), start = dayStartFromKey(day, tz);
      if (start == null) return;
      const segs = engine.snapshot();
      for (const room of eligible) {
        const from = since[room] ?? now, book = (sent[room] ??= {});
        const items: { seq: number; seg: Seg | null; fp: string }[] = [], have = new Set<string>();
        for (const s of segs) {
          const c = clipSince(s, from);
          if (!c || (c.open && now - c.a < HOLD_MS)) continue; // a stay or trip that has only just begun is held back (it may turn out to be nothing)
          const seq = seqOf(c, start), fp = fingerprint(c);
          have.add(String(seq));
          if (book[seq] !== fp) items.push({ seq, seg: c, fp });
        }
        for (const k of Object.keys(book)) if (!have.has(k)) items.push({ seq: Number(k), seg: null, fp: '' });
        if (!items.length) continue;
        const ok = await deps.push(room, day, tz, items.map(({ seq, seg }) => ({ seq, seg })));
        if (ok) for (const it of items) { if (it.seg) book[it.seq] = it.fp; else delete book[it.seq]; }
      }
      save();
    } finally { busy = false; }
  }

  return {
    add(f) {
      if (!eligible.length) return;
      const tz = deps.zone();
      if (engine && engine.tz() !== tz) wipe(); // a new time zone is a new day: the old report is not carried over
      if (!eligible.length) return;
      if (!engine) { engine = createEngine({ tz, presence: deps.presence }); bookDay = ''; }
      engine.add(f);
      dirty = true;
    },
    async tick() {
      const now = deps.now();
      if (!known || now - eligibleAt >= ROOMS_MS) await refresh();
      if (!eligible.length || !engine) return;
      engine.tick(now);
      if (engine.day() && engine.day() !== bookDay) {
        // a new day: nothing of the old one is sent or kept; every room gets the new day from its 00:00
        if (bookDay) { sent = {}; const s0 = startOfDay(now, engine.tz()); for (const r of Object.keys(since)) since[r] = s0; }
        bookDay = engine.day();
        dirty = true;
      }
      if (dirty && now - lastSave >= SAVE_MS) save();
      const closed = engine.closedCount(), force = closed !== closedSeen;
      closedSeen = closed;
      await flush(force);
    },
    refresh,
    flush,
    save,
    clear: wipe,
    rooms: () => eligible.slice(),
    snapshot: () => (engine ? engine.snapshot() : [])
  };
}
