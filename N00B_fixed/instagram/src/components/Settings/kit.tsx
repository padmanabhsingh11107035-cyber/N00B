import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, Info, Loader2, Search, X } from 'lucide-react';
import type { User } from '../../types';
import { fetchUsers } from '../../services/api';

// The small building blocks every page of "Settings and activity" is made from, so all of them look and behave the same: a page with a Back button, sections
// drawn as rounded cards, rows (with an icon, a value and a chevron, or a switch), choices, notes, and a list of people with a search to add more.
// The look is the app's own black-and-white doodle style (stitched card edges, bold white text, white accent) - nothing here comes from anywhere else.

export const PageShell: React.FC<{ title: string; onBack: () => void; children: React.ReactNode; right?: React.ReactNode; subtitle?: string }> = ({ title, onBack, children, right, subtitle }) => (
  <div className="min-h-full">
    <header className="sticky top-0 z-10 bg-page/95 backdrop-blur-md border-b border-white/10">
      <div className="max-w-2xl mx-auto px-3 sm:px-4 h-16 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          data-testid="settings-back"
          className="w-10 h-10 shrink-0 rounded-full border border-white/25 bg-zinc-900/90 hover:border-white/60 flex items-center justify-center text-white cursor-pointer transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-black tracking-tight text-white truncate">{title}</h1>
          {subtitle && <p className="text-[11px] text-zinc-400 truncate -mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
    </header>
    <div className="max-w-2xl mx-auto px-3 sm:px-4 pb-24">{children}</div>
  </div>
);

export const Section: React.FC<{ title?: string; note?: string; children: React.ReactNode }> = ({ title, note, children }) => (
  <section className="mt-5">
    {title && <h2 className="px-2 pb-2 text-[11px] font-extrabold uppercase tracking-[.14em] text-zinc-400">{title}</h2>}
    <div className="relative rounded-3xl bg-zinc-950/95 border border-white/15 overflow-hidden divide-y divide-white/10">{children}</div>
    {note && <p className="px-3 pt-2 text-[11.5px] leading-relaxed text-zinc-400">{note}</p>}
  </section>
);

export interface RowProps {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  sub?: string;
  value?: string;
  onClick?: () => void;
  danger?: boolean;
  right?: React.ReactNode;
  chevron?: boolean;
  disabled?: boolean;
  testId?: string;
}

export const Row: React.FC<RowProps> = ({ icon: Icon, label, sub, value, onClick, danger, right, chevron = true, disabled, testId }) => {
  const inner = (
    <>
      {Icon && (
        <span className={`w-9 h-9 shrink-0 rounded-xl border flex items-center justify-center ${danger ? 'border-red-500/40 bg-red-500/10 text-red-400' : 'border-white/20 bg-zinc-900 text-white'}`}>
          <Icon className="w-[18px] h-[18px]" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] font-bold leading-snug ${danger ? 'text-red-400' : 'text-white'}`}>{label}</span>
        {sub && <span className="block text-xs text-zinc-400 leading-snug mt-0.5">{sub}</span>}
      </span>
      {value && <span className="shrink-0 max-w-[40%] truncate text-[13px] text-zinc-400">{value}</span>}
      {right}
      {onClick && chevron && !right && <ChevronRight className="w-5 h-5 shrink-0 text-zinc-500" />}
    </>
  );
  if (!onClick) return <div className="flex items-center gap-3 px-4 py-3.5" data-testid={testId}>{inner}</div>;
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-testid={testId} className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/[.04] active:bg-white/[.07] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default">
      {inner}
    </button>
  );
};

export const Switch: React.FC<{ on: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }> = ({ on, onChange, label, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    disabled={disabled}
    onClick={(e) => { e.stopPropagation(); onChange(!on); }}
    className={`relative w-11 h-6 shrink-0 rounded-full border transition-colors cursor-pointer disabled:opacity-50 ${on ? 'bg-white border-white' : 'bg-zinc-800 border-white/25'}`}
  >
    <span className={`absolute top-[2px] w-[18px] h-[18px] rounded-full transition-all ${on ? 'left-[22px] bg-black' : 'left-[2px] bg-white'}`} />
  </button>
);

/** A row with a switch on the right. */
export const ToggleRow: React.FC<{ icon?: RowProps['icon']; label: string; sub?: string; on: boolean; onChange: (next: boolean) => void; disabled?: boolean; testId?: string }> = ({ icon, label, sub, on, onChange, disabled, testId }) => (
  <Row icon={icon} label={label} sub={sub} testId={testId} onClick={disabled ? undefined : () => onChange(!on)} chevron={false} right={<Switch on={on} onChange={onChange} label={label} disabled={disabled} />} />
);

/** One choice out of a few, shown as rows with a round marker. */
export function Choice<T extends string>({ value, onChange, options, disabled }: { value: T; onChange: (next: T) => void; options: Array<{ value: T; label: string; sub?: string }>; disabled?: boolean }) {
  return (
    <>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            data-testid={`choice-${o.value}`}
            onClick={() => { if (!on) onChange(o.value); }}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/[.04] transition-colors cursor-pointer disabled:opacity-50"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold text-white leading-snug">{o.label}</span>
              {o.sub && <span className="block text-xs text-zinc-400 leading-snug mt-0.5">{o.sub}</span>}
            </span>
            <span className={`w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center ${on ? 'border-white' : 'border-zinc-600'}`}>{on && <span className="w-2.5 h-2.5 rounded-full bg-white" />}</span>
          </button>
        );
      })}
    </>
  );
}

export const Note: React.FC<{ children: React.ReactNode; tone?: 'info' | 'good' | 'bad' }> = ({ children, tone = 'info' }) => (
  <div role="status" className={`mt-4 flex gap-2.5 rounded-2xl border border-dashed px-3.5 py-3 text-[12.5px] leading-relaxed ${tone === 'bad' ? 'border-red-500/40 bg-red-500/10 text-red-300' : tone === 'good' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-white/25 bg-white/[.03] text-zinc-300'}`}>
    <Info className="w-4 h-4 shrink-0 mt-0.5" />
    <div className="min-w-0">{children}</div>
  </div>
);

export const Spinner: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
  <div role="status" className="py-16 flex items-center justify-center gap-2 text-zinc-400 text-sm"><Loader2 className="w-5 h-5 animate-spin" /> {label}</div>
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

export const SmallButton: React.FC<{ onClick: () => void; children: React.ReactNode; tone?: 'plain' | 'solid' | 'danger'; disabled?: boolean; testId?: string }> = ({ onClick, children, tone = 'plain', disabled, testId }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    data-testid={testId}
    className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-extrabold transition-colors cursor-pointer disabled:opacity-50 ${tone === 'solid' ? 'bg-white text-black hover:bg-zinc-200' : tone === 'danger' ? 'border border-red-500/50 text-red-400 hover:bg-red-500/10' : 'border border-white/30 text-white hover:border-white/70'}`}
  >
    {children}
  </button>
);

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
                    : <SmallButton tone="solid" disabled={busy === u.id || full} onClick={() => void run(u.id, async () => { await onAdd(u); setQuery(''); setFound([]); })}>{busy === u.id ? '…' : addLabel}</SmallButton>}
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
                <SmallButton disabled={busy === p.id} onClick={() => void run(p.id, () => onRemove(p.id))}>{busy === p.id ? '…' : removeLabel}</SmallButton>
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
