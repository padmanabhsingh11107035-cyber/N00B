import React, { useEffect, useState } from 'react';
import { Check, Users, UserPlus, X } from 'lucide-react';
import { tabSessions } from '../../services/supabase';

interface SwitchAccountModalProps {
  onClose: () => void;
}

// The accounts logged in on this browser. Every tab can use a different one at the same time: choosing one here changes only THIS
// tab; "Add another account" opens the login page in this tab without logging anybody out (the other tabs are not affected).
export const SwitchAccountModal: React.FC<SwitchAccountModalProps> = ({ onClose }) => {
  const [accounts] = useState(() => tabSessions.savedAccounts());
  const currentId = tabSessions.currentAccount();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const use = (id: string) => {
    if (id === currentId) return onClose();
    if (tabSessions.switchTo(id)) window.location.reload();
  };
  const addAnother = () => {
    tabSessions.unbind();
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-[125] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true" aria-label="Switch account">
      <div className="w-full max-w-md max-h-[90vh] flex flex-col bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden">
        <header className="p-4 border-b border-zinc-800 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4 text-cyan-300" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-black text-white">Accounts on this browser</h3>
            <p className="text-[11px] text-zinc-400 leading-snug mt-0.5">
              Every tab can use a different account at the same time. Pick one for this tab, or add another account. Nobody is logged out.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 cursor-pointer shrink-0" aria-label="Close">
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {accounts.map((a) => {
            const here = a.id === currentId;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => use(a.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-left cursor-pointer transition-colors border ${here ? 'bg-cyan-500/15 border-cyan-400/40' : 'border-transparent hover:bg-white/5'}`}
              >
                <span className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-black text-zinc-300 shrink-0" translate="no">
                  {a.username.slice(0, 1).toUpperCase()}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-white truncate" translate="no">@{a.username}</span>
                  <span className="block text-[11px] text-zinc-500">{here ? 'Used in this tab' : 'Use in this tab'}</span>
                </span>
                {here && <Check className="w-4 h-4 text-cyan-300 shrink-0" />}
              </button>
            );
          })}
          {accounts.length === 0 && <p className="text-center text-xs text-zinc-500 py-6">No saved accounts on this browser.</p>}
        </div>

        <div className="p-3 border-t border-zinc-800">
          <button
            type="button"
            onClick={addAnother}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 text-white text-sm font-black cursor-pointer hover:brightness-110 transition"
          >
            <UserPlus className="w-4 h-4" />
            Add another account
          </button>
        </div>
      </div>
    </div>
  );
};
