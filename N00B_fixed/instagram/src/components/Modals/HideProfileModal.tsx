import React, { useEffect, useRef, useState } from 'react';
import { EyeOff, Eye, Loader2, Search, UserRound } from 'lucide-react';
import { NzHeader } from '../Common/NzPage';
import { User } from '../../types';
import { fetchUsers, fetchHiddenFrom, hideProfileFrom, unhideProfileFrom, HiddenFromUser } from '../../services/api';

interface HideProfileModalProps {
  currentUser: User;
  onClose: () => void;
  onUserUpdated?: (user: User) => void;
}

const Avatar: React.FC<{ src?: string }> = ({ src }) =>
  src ? <img src={src} alt="" /> : <div className="nz-av"><UserRound className="w-5 h-5" /></div>;

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
    <div className="nz-page fixed inset-0 z-[120]" role="dialog" aria-modal="true" aria-label="Hide my profile from">
      <div className="nz-panel">
        <NzHeader icon={<EyeOff size={20} />} title="Hide my profile from…" subtitle="The people you choose can't see your profile, posts, reels, stories or followers, can't find you in search and can't follow you. They aren't told." onBack={onClose} />
        <div className="nz-scroll">
          {error && <div role="alert" className="nz-note" data-kind="err" style={{ marginBottom: 12 }}>{error}</div>}

          <p className="nz-label">Hidden from ({hidden.length})</p>
          {loadingHidden ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : hidden.length === 0 ? (
            <div className="nz-note">Nobody yet. Pick people below.</div>
          ) : (
            hidden.map((h) => (
              <div key={h.id} className="nz-person">
                <Avatar src={h.avatar} />
                <div className="nz-names"><b>{h.displayName || h.username}</b><span>@{h.username}</span></div>
                <button type="button" className="nz-pill" data-kind="ghost" onClick={() => show(h)} disabled={busyId === h.id}><Eye size={15} /> Show again</button>
              </div>
            ))
          )}

          <p className="nz-label">Choose who to hide from</p>
          <div className="nz-search">
            <Search size={18} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or username" aria-label="Search people" />
          </div>
          {searching && choices.length === 0 ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : choices.length === 0 ? (
            <div className="nz-note">{query.trim() ? 'Nobody found.' : 'No one else to choose from.'}</div>
          ) : (
            choices.slice(0, 40).map((u) => (
              <div key={u.id} className="nz-person">
                <Avatar src={u.avatar} />
                <div className="nz-names"><b>{u.displayName || u.username}</b><span>@{u.username}</span></div>
                <button type="button" className="nz-pill" onClick={() => hide(u)} disabled={busyId === u.id}><EyeOff size={15} /> Hide</button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
