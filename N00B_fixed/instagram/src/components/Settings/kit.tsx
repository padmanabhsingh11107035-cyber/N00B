import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, Info, Loader2, Search, X } from 'lucide-react';
import type { User } from '../../types';
import { fetchUsers } from '../../services/api';
import { NoobStackLoader } from '../Common/NoobStackLoader';
import './settings.css';

// The small building blocks every page of "Settings and activity" is made from, so all of them look and behave the same: a page with a Back button, sections
// drawn as rounded cards, rows (with an icon, a value and a chevron, or a switch), choices, notes, and a list of people with a search to add more.
// The look is the app's own black-and-white doodle style (stitched card edges, bold white text, white accent) - nothing here comes from anywhere else.

/** true once the page has been scrolled a little: the bar on top then shows its hairline and shadow (the mark is a 1 px strip at the very top of the page) */
export function useStuck() {
  const mark = useRef<HTMLDivElement | null>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = mark.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [mark, stuck] as const;
}

export const PageShell: React.FC<{ title: string; onBack: () => void; children: React.ReactNode; right?: React.ReactNode; subtitle?: string }> = ({ title, onBack, children, right, subtitle }) => {
  const [mark, stuck] = useStuck();
  return (
    <div className="nst-root min-h-full">
      <div ref={mark} className="h-px -mb-px" aria-hidden="true" />
      <header className={`nst-header${stuck ? ' is-stuck' : ''}`}>
        <div className="nst-header-in">
          <button type="button" onClick={onBack} aria-label="Back" data-testid="settings-back" className="nst-back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="nst-htitle">{title}</h1>
            {subtitle && <p className="nst-hsub">{subtitle}</p>}
          </div>
          {right}
        </div>
      </header>
      <div className="nst-body">{children}</div>
    </div>
  );
};

// a small hand-drawn doodle in front of every section title (one of six, the same one for the same title)
const DOODLES = [
  'M12 3.4l2.5 5.3 5.7.7-4.2 4 1.1 5.7L12 16.3 6.9 19.1 8 13.4 3.8 9.4l5.7-.7z',
  'M3 15c1.8-5.4 3.7-5.4 5.5-.4s3.7 5.4 5.5.3 3.7-5.2 6-.4',
  'M12 20.2s-7.2-4.5-7.2-9.9A4.1 4.1 0 0 1 12 7.7a4.1 4.1 0 0 1 7.2 2.6c0 5.4-7.2 9.9-7.2 9.9z',
  'M12 3.5v4.2M12 16.3v4.2M3.5 12h4.2M16.3 12h4.2M6 6l2.9 2.9M15.1 15.1 18 18M18 6l-2.9 2.9M8.9 15.1 6 18',
  'M5 15.5c-2.2-3 .6-8 4.8-6.6 3.8 1.3 2.3 6.4-1.3 5.6-2.9-.6-2-4.4.7-4.3 3.2.1 5.9 2.8 9.8 1.1',
  'M4 17.5c4.2-.8 6.6-5 7.6-10.2M11.6 7.3l-.3 5.4M11.6 7.3l5.2 2'
];
const doodleFor = (text: string): string => { let h = 0; for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return DOODLES[h % DOODLES.length]; };

export const Section: React.FC<{ title?: string; note?: string; children: React.ReactNode; index?: number }> = ({ title, note, children, index }) => (
  <section className="nst-sec" style={index === undefined ? undefined : ({ ['--i' as string]: Math.min(index, 9) } as React.CSSProperties)}>
    {title && <h2><svg viewBox="0 0 24 24" aria-hidden="true"><path d={doodleFor(title)} /></svg>{title}</h2>}
    <div className="nst-card">{children}</div>
    {note && <p className="nst-note-line">{note}</p>}
  </section>
);

export interface RowProps {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  sub?: string;
  value?: string;
  /** May return a promise: the row then shows a small spinner at once and ignores further taps until it is done. */
  onClick?: () => unknown;
  danger?: boolean;
  right?: React.ReactNode;
  chevron?: boolean;
  disabled?: boolean;
  testId?: string;
}

/** Runs a tap's action and says at once whether it is still working (so a button never looks dead while the server answers). */
function useBusy(): [boolean, (run: (() => unknown) | undefined) => void] {
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const start = (run: (() => unknown) | undefined) => {
    if (!run || busy) return;
    const r = run();
    if (r && typeof (r as Promise<unknown>).then === 'function') {
      setBusy(true);
      void Promise.resolve(r).catch(() => undefined).finally(() => { if (alive.current) setBusy(false); });
    }
  };
  return [busy, start];
}

const PRESS = 'active:scale-[.985] touch-manipulation';

export const Row: React.FC<RowProps> = ({ icon: Icon, label, sub, value, onClick, danger, right, chevron = true, disabled, testId }) => {
  const [busy, start] = useBusy();
  const inner = (
    <>
      {Icon && (
        <span className={`nst-ico${danger ? ' nst-ico--danger' : ''}`}>
          <Icon className="w-5 h-5" />
        </span>
      )}
      <span className="nst-words">
        <span className={`nst-label ${danger ? 'text-red-400' : 'text-white'}`}>{label}</span>
        {sub && <span className="nst-sub">{sub}</span>}
      </span>
      {value && <span className="nst-value">{value}</span>}
      {right}
      {onClick && busy && <Loader2 className="w-5 h-5 shrink-0 text-zinc-300 animate-spin" aria-label="Working" />}
      {onClick && !busy && chevron && !right && <ChevronRight className="nst-chev" />}
    </>
  );
  if (!onClick) return <div className="nst-row" data-testid={testId}>{inner}</div>;
  return (
    <button type="button" onClick={() => start(onClick)} disabled={disabled} aria-busy={busy} data-testid={testId} className={`nst-row ${PRESS} cursor-pointer disabled:opacity-50 disabled:cursor-default`}>
      {inner}
    </button>
  );
};

/** a short buzz under the finger on phones that can (not everywhere) */
const buzz = (ms = 6): void => { try { navigator.vibrate?.(ms); } catch { /* not on this device */ } };

export const Switch: React.FC<{ on: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }> = ({ on, onChange, label, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    disabled={disabled}
    onClick={(e) => { e.stopPropagation(); buzz(); onChange(!on); }}
    className="nst-switch"
  >
    <i><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.4 8.6 6.6 11.7 12.6 4.7" /></svg></i>
  </button>
);

/**
 * A row with a switch on the right. The switch moves the moment it is tapped; if the change is saved by something that takes a while (it returns a promise) it stays where the
 * person put it until that is done, and goes back by itself if saving failed (the page then says why).
 */
export const ToggleRow: React.FC<{ icon?: RowProps['icon']; label: string; sub?: string; on: boolean; onChange: (next: boolean) => unknown; disabled?: boolean; testId?: string }> = ({ icon, label, sub, on, onChange, disabled, testId }) => {
  const [pending, setPending] = useState<boolean | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const shown = pending ?? on;
  const flip = (next: boolean) => {
    if (disabled) return;
    setPending(next);
    void Promise.resolve(onChange(next)).catch(() => undefined).finally(() => { if (alive.current) setPending(null); });
  };
  return (
    <Row icon={icon} label={label} sub={sub} testId={testId} onClick={disabled ? undefined : () => flip(!shown)} chevron={false} right={<Switch on={shown} onChange={flip} label={label} disabled={disabled} />} />
  );
};

/** One choice out of a few, shown as rows with a round marker. */
export function Choice<T extends string>({ value, onChange, options, disabled }: { value: T; onChange: (next: T) => unknown; options: Array<{ value: T; label: string; sub?: string }>; disabled?: boolean }) {
  // the marker moves the moment a choice is tapped, and goes back if saving it failed
  const [pending, setPending] = useState<T | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const shown = pending ?? value;
  const pick = (next: T) => {
    setPending(next);
    void Promise.resolve(onChange(next)).catch(() => undefined).finally(() => { if (alive.current) setPending(null); });
  };
  return (
    <>
      {options.map((o) => {
        const on = o.value === shown;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            data-testid={`choice-${o.value}`}
            onClick={() => { if (!on) pick(o.value); }}
            className={`nst-row ${PRESS} cursor-pointer disabled:opacity-50`}
          >
            <span className="nst-words">
              <span className="nst-label text-white">{o.label}</span>
              {o.sub && <span className="nst-sub">{o.sub}</span>}
            </span>
            <span className="nst-radio" data-on={on}><i /></span>
          </button>
        );
      })}
    </>
  );
}

export const Note: React.FC<{ children: React.ReactNode; tone?: 'info' | 'good' | 'bad' }> = ({ children, tone = 'info' }) => (
  <div role="status" data-tone={tone} className="nst-note">
    <Info className="w-4 h-4 shrink-0 mt-0.5" />
    <div className="min-w-0">{children}</div>
  </div>
);

/** Loading inside a page: NOOB's burger, only for as long as the page is really waiting (no minimum, no maximum time). */
export const Spinner: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
  <div role="status" aria-label={label} className="h-[190px] flex items-center justify-center overflow-hidden">
    <div className="origin-center scale-[.62]"><NoobStackLoader mode="quick" subtitle={label} /></div>
  </div>
);

/** Loading a whole page (the hub itself, a page that has to be fetched): the burger, big, in the middle. */
export const PageLoading: React.FC = () => (
  <div role="status" aria-label="Loading" className="fixed inset-0 z-[45] bg-page doodle-wallpaper flex items-center justify-center text-white">
    <NoobStackLoader mode="quick" subtitle="Loading…" />
  </div>
);

export const Empty: React.FC<{ icon?: RowProps['icon']; title: string; text?: string }> = ({ icon: Icon, title, text }) => (
  <div className="px-6 py-10 text-center">
    {Icon && <Icon className="w-9 h-9 mx-auto text-zinc-500 mb-3" />}
    <p className="text-sm font-bold text-white">{title}</p>
    {text && <p className="text-xs text-zinc-400 mt-1 leading-relaxed max-w-xs mx-auto">{text}</p>}
  </div>
);

export const Avatar: React.FC<{ user: Pick<User, 'avatar' | 'username'>; size?: number }> = ({ user, size = 40 }) => (
  <img src={user.avatar || '/noob-logo.svg.jpeg'} alt="" loading="lazy" draggable={false} className="rounded-full object-cover bg-zinc-800 border border-white/15 shrink-0" style={{ width: size, height: size }} />
);

export const SmallButton: React.FC<{ onClick: () => unknown; children: React.ReactNode; tone?: 'plain' | 'solid' | 'danger'; disabled?: boolean; testId?: string }> = ({ onClick, children, tone = 'plain', disabled, testId }) => {
  const [busy, start] = useBusy();
  return (
    <button
      type="button"
      onClick={() => start(onClick)}
      disabled={disabled || busy}
      aria-busy={busy}
      data-testid={testId}
      className={`nst-pill shrink-0 min-w-[3.5rem] inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-[12.5px] font-extrabold active:scale-95 touch-manipulation cursor-pointer disabled:opacity-60 ${tone === 'solid' ? 'bg-white text-black hover:bg-zinc-200' : tone === 'danger' ? 'border border-red-500/50 text-red-400 hover:bg-red-500/10' : 'border border-white/30 text-white hover:border-white/70'}`}
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-label="Working" /> : children}
    </button>
  );
};

/**
 * A list of people with a search box to find more. `people` is who is on the list now; `onAdd` / `onRemove` change it (and must return a promise: the row shows a small
 * busy state until it settles). Searching asks the server (the same search as Explore), so anyone can be found, not only people already loaded.
 */
export const PeopleList: React.FC<{
  people: Array<Pick<User, 'id' | 'username' | 'displayName' | 'avatar'> & { isVerified?: boolean }>;
  currentUserId: string;
  onAdd?: (user: User) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
  addLabel?: string;
  removeLabel?: string;
  emptyTitle: string;
  emptyText?: string;
  searchPlaceholder?: string;
  max?: number;
  testId?: string;
  /** Anything to show under a person on the list (for example switches for what is muted). */
  renderExtra?: (person: { id: string }) => React.ReactNode;
}> = ({ people, currentUserId, onAdd, onRemove, addLabel = 'Add', removeLabel = 'Remove', emptyTitle, emptyText, searchPlaceholder = 'Search people', max, testId, renderExtra }) => {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const seq = useRef(0);
  const onList = useMemo(() => new Set(people.map((p) => p.id)), [people]);

  useEffect(() => {
    const q = query.trim().replace(/^@/, '');
    if (!onAdd || q.length < 2) { setFound([]); setSearching(false); return; }
    const mine = ++seq.current;
    setSearching(true);
    const t = window.setTimeout(async () => {
      const list = await fetchUsers(q);
      if (mine !== seq.current) return;
      setFound(list.filter((u) => u.id !== currentUserId).slice(0, 20));
      setSearching(false);
    }, 250);
    return () => window.clearTimeout(t);
  }, [query, onAdd, currentUserId]);

  const run = async (id: string, fn: () => Promise<unknown>) => { setBusy(id); try { await fn(); } finally { setBusy(null); } };
  const full = typeof max === 'number' && people.length >= max;

  return (
    <div data-testid={testId}>
      {onAdd && (
        <div className="p-3">
          <label className="relative block">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="w-full bg-zinc-900 border border-white/15 focus:border-white/50 rounded-full pl-10 pr-9 py-2.5 text-sm text-white outline-none placeholder:text-zinc-500"
            />
            {query && <button type="button" aria-label="Clear" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>}
          </label>
          {full && <p className="text-[11.5px] text-amber-300 mt-2 px-1">The list is full ({max}). Remove someone to add another person.</p>}
          {(searching || found.length > 0) && (
            <div className="mt-2 rounded-2xl border border-white/15 overflow-hidden divide-y divide-white/10 bg-black/40">
              {searching && <div className="px-4 py-3 text-xs text-zinc-400 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…</div>}
              {found.map((u) => (
                <div key={u.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Avatar user={u} />
                  <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-white truncate">@{u.username}</span><span className="block text-xs text-zinc-400 truncate">{u.displayName}</span></span>
                  {onList.has(u.id)
                    ? <span className="text-xs font-bold text-zinc-400">On the list</span>
                    : <SmallButton tone="solid" disabled={busy === u.id || full} onClick={() => run(u.id, async () => { await onAdd(u); setQuery(''); setFound([]); })}>{busy === u.id ? '…' : addLabel}</SmallButton>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {people.length === 0 ? (
        <Empty title={emptyTitle} text={emptyText} />
      ) : (
        <div className="divide-y divide-white/10">
          {people.map((p) => (
            <div key={p.id} data-testid="people-row">
              <div className="flex items-center gap-3 px-4 py-3">
                <Avatar user={p} />
                <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-white truncate">@{p.username}</span><span className="block text-xs text-zinc-400 truncate">{p.displayName}</span></span>
                <SmallButton disabled={busy === p.id} onClick={() => run(p.id, () => onRemove(p.id))}>{busy === p.id ? '…' : removeLabel}</SmallButton>
              </div>
              {renderExtra?.(p)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/** A short message that goes away by itself. Returns [message element, show(text, tone)]. */
export function useFlash(): [React.ReactNode, (text: string, tone?: 'info' | 'good' | 'bad') => void] {
  const [msg, setMsg] = useState<{ text: string; tone: 'info' | 'good' | 'bad' } | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const show = (text: string, tone: 'info' | 'good' | 'bad' = 'good') => {
    setMsg({ text, tone });
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), tone === 'bad' ? 6000 : 3200);
  };
  return [msg ? <Note tone={msg.tone}>{msg.text}</Note> : null, show];
}
