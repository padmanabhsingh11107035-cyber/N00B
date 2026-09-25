import React, { useEffect, useState } from 'react';
import { Check, Trash2, UserPlus } from 'lucide-react';
import { tabSessions } from '../../services/supabase';

interface SwitchAccountModalProps {
  onClose: () => void;
}

// The accounts logged in on this browser. Every tab can use a different one at the same time: choosing one here changes only THIS
// tab; "Add another account" opens the login page in this tab without logging anybody out (the other tabs are not affected).
export const SwitchAccountModal: React.FC<SwitchAccountModalProps> = ({ onClose }) => {
  const [accounts, setAccounts] = useState(() => tabSessions.savedAccounts());
  const [removingId, setRemovingId] = useState<string | null>(null); // tap once to arm, tap again to confirm
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
  // Forgets a saved login on THIS browser only — the account itself is untouched and can be logged back into any time.
  const forget = (id: string) => {
    tabSessions.forget(id);
    setAccounts(tabSessions.savedAccounts());
    setRemovingId(null);
  };

  return (
    <div
      className="fixed inset-0 z-[125] bg-black/60 backdrop-blur-sm flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Switch account"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md h-[60vh] flex flex-col bg-zinc-950 border-t border-x border-zinc-800 rounded-t-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pt-2.5 pb-1 flex items-center justify-center shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-zinc-700" />
        </div>
        <header className="px-4 pb-3 border-b border-zinc-800 shrink-0">
          <h3 className="text-sm font-black text-white text-center">Switch account</h3>
        </header>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {accounts.map((a) => {
            const here = a.id === currentId;
            const confirming = removingId === a.id;
            return (
              <div
                key={a.id}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl transition-colors border ${here ? 'bg-cyan-500/15 border-cyan-400/40' : confirming ? 'bg-red-500/10 border-red-500/40' : 'border-transparent hover:bg-white/5'}`}
              >
                <button type="button" onClick={() => use(a.id)} className="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer">
                  <span className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-black text-zinc-300 shrink-0" translate="no">
                    {a.username.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-white truncate" translate="no">@{a.username}</span>
                    <span className="block text-[11px] text-zinc-500">
                      {confirming ? 'Remove this account from the list?' : here ? 'Used in this tab' : 'Use in this tab'}
                    </span>
                  </span>
                </button>
                {here && <Check className="w-4 h-4 text-cyan-300 shrink-0" />}
                {!here && confirming && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => forget(a.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-red-500 text-white text-[11px] font-black cursor-pointer"
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemovingId(null)}
                      className="px-2.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-[11px] font-bold cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {!here && !confirming && (
                  <button
                    type="button"
                    onClick={() => setRemovingId(a.id)}
                    className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 cursor-pointer shrink-0"
                    title="Remove from this browser (does not delete the account)"
                    aria-label={`Remove @${a.username} from this browser`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
          {accounts.length === 0 && <p className="text-center text-xs text-zinc-500 py-6">No saved accounts on this browser.</p>}
        </div>

        <div className="p-3 border-t border-zinc-800 shrink-0">
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
