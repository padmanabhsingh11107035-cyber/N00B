import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ChevronDown, ChevronUp, Loader2, RefreshCw } from 'lucide-react';
import { fetchUserLocations, type UserLocations } from '../../services/adminLedgerApi';
import { agoShort, buildDots, placeLabel, type UserLocationRow } from '../../utils/userLocations';
import { UserDataMap, type DotMode } from './UserDataMap';
import { UserDataRain, reducedMotion } from './UserDataRain';
import './adminUserData.css';

// Admin panel -> "User's data": a green hacker-style world map with a yellow dot for the place each person signed up (ring) and was last seen (filled). Admin only: the database
// refuses everyone else. The places are APPROXIMATE (the city the connection came from, or the city typed on the profile): no IP address is ever sent to this page and nothing new is collected.
const BOOT = '> user_data --map';
const PAGE = 150;

type Phase = { s: 'loading' } | { s: 'denied' } | { s: 'error'; msg: string } | { s: 'ready'; data: UserLocations; at: number };

// the phone's Back button closes this page, like every other page of the app (one history entry while it is open)
let live = 0;
let owned = 0;
function useBackToClose(onBack: () => void) {
  const cb = useRef(onBack);
  cb.current = onBack;
  useEffect(() => {
    live++;
    if (owned === 0) { try { window.history.pushState({ noobUserData: 1 }, ''); owned = 1; } catch { /* no history: the on-screen Back still works */ } }
    const onPop = () => { owned = 0; cb.current(); };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      live--;
      window.setTimeout(() => {
        if (live > 0 || owned === 0) return;
        owned = 0;
        try { if ((window.history.state as { noobUserData?: number } | null)?.noobUserData) window.history.back(); } catch { /* not important */ }
      }, 0);
    };
  }, []);
  return useCallback(() => {
    if (owned > 0) { try { window.history.back(); return; } catch { /* fall through */ } }
    cb.current();
  }, []);
}

const sortKey = (r: UserLocationRow) => Date.parse(r.last?.at || '') || 0;

export const AdminUserDataPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const back = useBackToClose(onBack);
  const [phase, setPhase] = useState<Phase>({ s: 'loading' });
  const [mode, setMode] = useState<DotMode>('both');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [openList, setOpenList] = useState(false);
  const [focus, setFocus] = useState<{ userId: string; nonce: number } | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [typed, setTyped] = useState(() => (reducedMotion() ? BOOT : ''));
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const [tick, setTick] = useState(0);
  const alive = useRef(true);

  const load = useCallback(async () => {
    setPhase({ s: 'loading' });
    const r = await fetchUserLocations(2000);
    if (!alive.current) return;
    if (r.ok) setPhase({ s: 'ready', data: r.data, at: Date.now() });
    else if (/access denied|permission|administrator|not allowed|42501/i.test(r.error)) setPhase({ s: 'denied' });
    else setPhase({ s: 'error', msg: r.error });
  }, []);
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; }; }, [load]);

  // typed boot line (stops on its own; instant with reduced motion)
  useEffect(() => {
    if (typed.length >= BOOT.length) return;
    const t = window.setTimeout(() => setTyped(BOOT.slice(0, typed.length + 1)), 55);
    return () => window.clearTimeout(t);
  }, [typed]);

  // nothing animates while the tab is hidden
  useEffect(() => {
    const on = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  const rows = phase.s === 'ready' ? phase.data.rows : [];
  const built = useMemo(() => buildDots(rows), [rows]);
  const placedUsers = useMemo(() => { const s = new Set<string>(); for (const d of built.dots) s.add(d.row.id); return s.size; }, [built]);
  const sorted = useMemo(() => [...rows].sort((a, b) => sortKey(b) - sortKey(a) || (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0)), [rows]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, '');
    if (!q) return sorted;
    return sorted.filter((r) => `${r.username || ''} ${r.displayName || ''} ${placeLabel(r.last)} ${placeLabel(r.signup)}`.toLowerCase().includes(q));
  }, [sorted, query]);

  // the log prints real lines about the loaded data, one by one
  const logLines = useMemo(() => {
    if (phase.s !== 'ready') return [] as { tag: string; text: string }[];
    const src = sorted.slice(0, 60);
    return src.map((r) => ({ tag: 'LOC', text: `${r.username || '?'}  ${r.last ? placeLabel(r.last) : r.signup ? `${placeLabel(r.signup)} (signup)` : '--  unplaced'}${r.last?.at ? `  last seen ${agoShort(r.last.at)} ago` : ''}` }));
  }, [phase, sorted]);
  const [logAt, setLogAt] = useState(0);
  useEffect(() => {
    if (!logLines.length || hidden || reducedMotion()) return;
    const t = window.setInterval(() => setLogAt((n) => n + 1), 1200);
    return () => window.clearInterval(t);
  }, [logLines.length, hidden]);
  const shownLog = useMemo(() => {
    if (!logLines.length) return [];
    const upto = reducedMotion() ? Math.min(logLines.length, 4) : (logAt % logLines.length) + 1;
    const start = Math.max(0, upto - 6);
    return logLines.slice(start, upto);
  }, [logLines, logAt]);
  useEffect(() => { const t = window.setInterval(() => { if (!document.hidden) setTick((n) => n + 1); }, 60000); return () => window.clearInterval(t); }, []);
  void tick;

  const stamp = phase.s === 'ready' ? new Date(phase.at).toTimeString().slice(0, 8) : '--:--:--';
  const place = (r: UserLocationRow) => (r.last ? placeLabel(r.last) : r.signup ? `${placeLabel(r.signup)} (signup)` : null);

  return createPortal(
    <div className={`ud-root edge-own${hidden ? ' ud-hidden' : ''}`} data-noob-keep="1" data-testid="admin-user-data" role="region" aria-label="User's data">
      <UserDataRain />
      <header className="ud-head">
        <button className="ud-btn" onClick={back} aria-label="Back to the admin panel" data-testid="ud-back"><ArrowLeft size={18} /> Back</button>
        <div className="ud-title">
          <h1>User's data</h1>
          <p className="ud-boot" aria-hidden="true">{typed}<span className="ud-cursor" /></p>
        </div>
        <button className="ud-btn" onClick={() => void load()} disabled={phase.s === 'loading'} aria-label="Refresh the data" title="Refresh" data-testid="ud-refresh">
          {phase.s === 'loading' ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
        </button>
      </header>

      <div className="ud-bar">
        <span className="ud-stat"><b data-testid="ud-placed">{placedUsers}</b><span>placed</span></span>
        <span className="ud-stat warn"><b data-testid="ud-unplaced">{built.unplaced.users}</b><span>unplaced</span></span>
        <span className="ud-stat"><b data-testid="ud-total">{rows.length}</b><span>total</span></span>
        <span className="ud-legend"><span><i />signed up</span><span><i className="fill" />last seen</span></span>
        <div className="ud-seg" role="group" aria-label="Which dots to show">
          {([['signup', 'Signed up'], ['last', 'Last seen'], ['both', 'Both']] as [DotMode, string][]).map(([id, label]) => (
            <button key={id} aria-pressed={mode === id} onClick={() => setMode(id)} data-testid={`ud-mode-${id}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="ud-main">
        <UserDataMap dots={built.dots} mode={mode} focus={focus} onPick={setCurrent}>
          {phase.s === 'loading' && <div className="ud-state" role="status"><Loader2 size={26} className="animate-spin" color="#00ff66" /><h2>LOADING</h2><p>&gt; reading places...</p></div>}
          {phase.s === 'denied' && <div className="ud-state bad" role="alert" data-testid="ud-denied"><h2>ACCESS DENIED</h2><p>Only the NOOB administrator can open this page.</p><button className="ud-btn" onClick={back}>Back</button></div>}
          {phase.s === 'error' && <div className="ud-state bad" role="alert" data-testid="ud-error"><h2>CONNECTION ERROR</h2><p>{phase.msg}</p><button className="ud-btn" onClick={() => void load()}>Try again</button></div>}
          {phase.s === 'ready' && rows.length === 0 && <div className="ud-state" data-testid="ud-empty"><h2>NO DATA</h2><p>No users to show yet.</p></div>}
        </UserDataMap>

        <aside className={`ud-side${openList ? ' open' : ''}`}>
          <div className="ud-log" aria-hidden="true" data-testid="ud-log">
            {shownLog.length === 0 && <div>&gt; {phase.s === 'ready' ? 'no lines' : 'waiting for data...'}</div>}
            {shownLog.map((l, i) => <div key={`${logAt}-${i}`}><b>{l.tag}</b><em>{l.text}</em></div>)}
          </div>
          <section className="ud-users" aria-label="Users">
            <div className="ud-users-bar">
              <input className="ud-search" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); if (!openList) setOpenList(true); }} placeholder="search user or place" aria-label="Search users" spellCheck={false} autoComplete="off" data-testid="ud-search" />
              <button className="ud-btn ud-toggle" onClick={() => setOpenList((o) => !o)} aria-expanded={openList} aria-label={openList ? 'Hide the list of users' : 'Show the list of users'} data-testid="ud-toggle-list">
                {openList ? <ChevronDown size={18} /> : <ChevronUp size={18} />} {filtered.length}
              </button>
            </div>
            <div className="ud-list" data-testid="ud-list">
              {phase.s === 'ready' && filtered.length === 0 && <div className="ud-empty">&gt; no match</div>}
              {filtered.slice(0, limit).map((r) => {
                const p = place(r);
                return (
                  <button key={r.id} className="ud-row" aria-current={current === r.id} onClick={() => { setFocus({ userId: r.id, nonce: Date.now() }); setCurrent(r.id); }} data-testid="ud-row">
                    <span className="u">@{r.username || '?'}</span>
                    <span className={`p${p ? '' : ' none'}`}>{p || 'unplaced'}</span>
                    <span className="t">{agoShort(r.last?.at)}</span>
                  </button>
                );
              })}
              {filtered.length > limit && <button className="ud-more" onClick={() => setLimit((n) => n + PAGE)}>show {Math.min(PAGE, filtered.length - limit)} more</button>}
            </div>
          </section>
        </aside>
      </div>

      <footer className="ud-status">
        <span>SRC <b>admin_user_locations</b></span>
        <span>ROWS <b>{rows.length}</b></span>
        <span>SYNC <b>{stamp}</b></span>
        <span>approximate location from connection, no IP shown</span>
      </footer>
    </div>,
    document.body
  );
};
