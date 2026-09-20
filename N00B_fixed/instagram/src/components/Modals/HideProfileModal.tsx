import React, { useEffect, useRef, useState } from 'react';
import { EyeOff, Eye, Loader2, Search, X, UserRound } from 'lucide-react';
import { User } from '../../types';
import { fetchUsers, fetchHiddenFrom, hideProfileFrom, unhideProfileFrom, HiddenFromUser } from '../../services/api';

interface HideProfileModalProps {
  currentUser: User;
  onClose: () => void;
  onUserUpdated?: (user: User) => void;
}

const Avatar: React.FC<{ src?: string }> = ({ src }) =>
  src ? (
    <img src={src} alt="" className="w-9 h-9 rounded-full object-cover bg-zinc-800 shrink-0" />
  ) : (
    <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
      <UserRound className="w-4 h-4 text-zinc-500" />
    </div>
  );

// "Hide my profile from…": choose the people who should not be able to see this profile. They are not told.
export const HideProfileModal: React.FC<HideProfileModalProps> = ({ currentUser, onClose, onUserUpdated }) => {
  const [hidden, setHidden] = useState<HiddenFromUser[]>([]);
  const [loadingHidden, setLoadingHidden] = useState(true);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetchHiddenFrom();
      if (!alive) return;
      if (res.success) setHidden(res.users);
      else setError(res.error || 'Could not load the list.');
      setLoadingHidden(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // search as you type (a moment after you stop); the latest search wins if several are in flight
  useEffect(() => {
    const mine = ++seq.current;
    setSearching(true);
    const t = window.setTimeout(async () => {
      const list = await fetchUsers(query.trim());
      if (mine !== seq.current) return;
      setResults(list);
      setSearching(false);
    }, query.trim() ? 250 : 0);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const syncIds = (ids?: string[]) => {
    if (ids && onUserUpdated) onUserUpdated({ ...currentUser, hiddenFromIds: ids });
  };

  const hide = async (u: User) => {
    setBusyId(u.id);
    setError(null);
    const res = await hideProfileFrom(u.id);
    setBusyId(null);
    if (res.success) {
      setHidden((prev) => [{ id: u.id, username: u.username, displayName: u.displayName, avatar: u.avatar, isVerified: u.isVerified, hiddenAt: new Date().toISOString() }, ...prev.filter((h) => h.id !== u.id)]);
      syncIds(res.hiddenFromIds);
    } else setError(res.error || 'Could not hide your profile.');
  };

  const show = async (h: HiddenFromUser) => {
    setBusyId(h.id);
    setError(null);
    const res = await unhideProfileFrom(h.id);
    setBusyId(null);
    if (res.success) {
      setHidden((prev) => prev.filter((x) => x.id !== h.id));
      syncIds(res.hiddenFromIds);
    } else setError(res.error || 'Could not show your profile again.');
  };

  const hiddenIds = new Set(hidden.map((h) => h.id));
  const choices = results.filter((u) => u.id !== currentUser.id && !hiddenIds.has(u.id) && !u.isAdmin);

  return (
    <div className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true" aria-label="Hide my profile from">
      <div className="w-full max-w-md max-h-[90vh] flex flex-col bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden">
        <header className="p-4 border-b border-zinc-800 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center shrink-0">
            <EyeOff className="w-4 h-4 text-violet-300" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-black text-white">Hide my profile from…</h3>
            <p className="text-[11px] text-zinc-400 leading-snug mt-0.5">
              The people you choose can&apos;t see your profile, posts, reels, stories or followers, can&apos;t find you in search and can&apos;t follow you. They aren&apos;t told.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 cursor-pointer shrink-0" aria-label="Close">
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {error && (
            <div role="alert" className="text-xs font-semibold text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
              {error}
            </div>
          )}

          <section className="space-y-2">
            <h4 className="text-[11px] font-black text-zinc-300 uppercase tracking-wide">Hidden from ({hidden.length})</h4>
            {loadingHidden ? (
              <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
            ) : hidden.length === 0 ? (
              <p className="text-xs text-zinc-500">Nobody yet. Pick people below.</p>
            ) : (
              hidden.map((h) => (
                <div key={h.id} className="flex items-center gap-3 bg-zinc-900/60 border border-zinc-800 rounded-xl p-2.5">
                  <Avatar src={h.avatar} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">{h.displayName || h.username}</p>
                    <p className="text-[10px] text-zinc-500 truncate">@{h.username}</p>
                  </div>
                  <button
                    onClick={() => show(h)}
                    disabled={busyId === h.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-500/40 text-emerald-300 text-[11px] font-bold hover:bg-emerald-500/10 cursor-pointer disabled:opacity-50"
                  >
                    <Eye className="w-3.5 h-3.5" /> Show again
                  </button>
                </div>
              ))
            )}
          </section>

          <section className="space-y-2">
            <h4 className="text-[11px] font-black text-zinc-300 uppercase tracking-wide">Choose who to hide from</h4>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or username"
                aria-label="Search people"
                className="w-full bg-zinc-900 text-xs text-white pl-8 pr-3 py-2.5 rounded-xl border border-zinc-800 outline-none focus:border-violet-400/60"
              />
            </div>
            {searching && choices.length === 0 ? (
              <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
            ) : choices.length === 0 ? (
              <p className="text-xs text-zinc-500">{query.trim() ? 'Nobody found.' : 'No one else to choose from.'}</p>
            ) : (
              choices.slice(0, 40).map((u) => (
                <div key={u.id} className="flex items-center gap-3 bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-2.5">
                  <Avatar src={u.avatar} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">{u.displayName || u.username}</p>
                    <p className="text-[10px] text-zinc-500 truncate">@{u.username}</p>
                  </div>
                  <button
                    onClick={() => hide(u)}
                    disabled={busyId === u.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-violet-400/50 text-violet-300 text-[11px] font-bold hover:bg-violet-500/10 cursor-pointer disabled:opacity-50"
                  >
                    <EyeOff className="w-3.5 h-3.5" /> Hide
                  </button>
                </div>
              ))
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
