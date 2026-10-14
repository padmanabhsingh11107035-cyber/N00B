import React, { useEffect, useState } from 'react';
import { Check, KeyRound, Loader2, Trash2, UserPlus } from 'lucide-react';
import { tabSessions } from '../../services/supabase';
import { fetchLinkedAccounts, signInLinkedAccount, type LinkedAccount } from '../../services/supabaseApi';

interface SwitchAccountModalProps {
  onClose: () => void;
}

// The accounts logged in on this browser. Every tab can use a different one at the same time: choosing one here changes only THIS
// tab; "Add another account" opens the login page in this tab without logging anybody out (the other tabs are not affected).
// Below them: the person's OTHER accounts (the same email address or mobile number). The first time, the account's password is asked; the login is then
// kept on this device, so switching to it never asks again (until it is removed from the list or logged out).
export const SwitchAccountModal: React.FC<SwitchAccountModalProps> = ({ onClose }) => {
  const [accounts, setAccounts] = useState(() => tabSessions.savedAccounts());
  const [removingId, setRemovingId] = useState<string | null>(null); // tap once to arm, tap again to confirm
  const currentId = tabSessions.currentAccount();
  const [linked, setLinked] = useState<LinkedAccount[]>([]);
  const [linkedState, setLinkedState] = useState<'loading' | 'ok' | 'missing' | 'error'>('loading');
  const [opening, setOpening] = useState<string | null>(null);   // the linked account whose password is being asked
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setLinkedState('loading');
    fetchLinkedAccounts().then((res) => { if (live) { setLinked(res.accounts); setLinkedState(res.state); } });
    return () => { live = false; };
  }, [retry]);
  // the other accounts that are not on this device yet
  const notYet = linked.filter((l) => !accounts.some((a) => a.id === l.id));

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
  const signIn = async (acct: LinkedAccount) => {
    if (busy) return;
    setBusy(true);
    setError('');
    const res = await signInLinkedAccount(acct.username, password);
    setBusy(false);
    if (!res.success || !res.id) { setError(res.error || 'Could not sign in.'); return; }
    setPassword('');
    if (tabSessions.switchTo(res.id)) window.location.reload();
    else { setAccounts(tabSessions.savedAccounts()); setOpening(null); }
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

          {linkedState !== 'ok' || notYet.length === 0 ? (
            <div className="pt-3" data-testid="linked-accounts-status">
              <p className="px-1 text-[11px] font-bold uppercase tracking-wide text-zinc-500">Your other accounts</p>
              <p className="px-1 pt-1 text-[11px] text-zinc-500" role="status">
                {linkedState === 'loading' && 'Looking for your other accounts…'}
                {linkedState === 'ok' && (linked.length > 0 ? 'All your other accounts are already on this device.' : 'No other account uses the same email address or mobile number as this one.')}
                {linkedState === 'missing' && 'Finding your other accounts is not switched on yet.'}
                {linkedState === 'error' && 'Could not look up your other accounts right now.'}
              </p>
              {(linkedState === 'error' || linkedState === 'missing') && (
                <button type="button" onClick={() => setRetry((n) => n + 1)} className="mt-1.5 px-1 text-[11px] font-bold text-cyan-300 hover:text-cyan-200 cursor-pointer">Try again</button>
              )}
            </div>
          ) : (
            <div className="pt-3 space-y-1.5" data-testid="linked-accounts">
              <p className="px-1 text-[11px] font-bold uppercase tracking-wide text-zinc-500">Your other accounts</p>
              <p className="px-1 pb-1 text-[11px] text-zinc-500">These use the same email address or mobile number. You enter the password only the first time; after that this device remembers the account.</p>
              {notYet.map((l) => {
                const open = opening === l.id;
                return (
                  <div key={l.id} className={`rounded-2xl border transition-colors ${open ? 'bg-cyan-500/10 border-cyan-400/40' : 'border-transparent hover:bg-white/5'}`}>
                    <button type="button" onClick={() => { setOpening(open ? null : l.id); setPassword(''); setError(''); }} className="w-full flex items-center gap-3 px-3.5 py-3 text-left cursor-pointer">
                      {l.avatar ? (
                        <img src={l.avatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 bg-zinc-800" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-black text-zinc-300 shrink-0" translate="no">{l.username.slice(0, 1).toUpperCase()}</span>
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold text-white truncate" translate="no">@{l.username}</span>
                        <span className="block text-[11px] text-zinc-500">{open ? 'Enter its password to switch' : 'Tap to switch (password asked once)'}</span>
                      </span>
                      <KeyRound className="w-4 h-4 text-zinc-500 shrink-0" />
                    </button>
                    {open && (
                      <form className="px-3.5 pb-3 space-y-2" onSubmit={(e) => { e.preventDefault(); void signIn(l); }}>
                        <input
                          type="password"
                          autoFocus
                          autoComplete="current-password"
                          value={password}
                          onChange={(e) => { setPassword(e.target.value); setError(''); }}
                          placeholder={`Password of @${l.username}`}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-cyan-400"
                        />
                        {error && <p className="text-[11px] text-red-400" role="alert">{error}</p>}
                        <button type="submit" disabled={busy || !password} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-cyan-500 text-black text-sm font-black disabled:opacity-50 cursor-pointer">
                          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                          {busy ? 'Signing in…' : 'Switch to this account'}
                        </button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-zinc-800 shrink-0">
          <button
            type="button"
            onClick={addAnother}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-gradient-to-r from-noob to-noob-strong text-white text-sm font-black cursor-pointer hover:brightness-110 transition"
          >
            <UserPlus className="w-4 h-4" />
            Add another account
          </button>
        </div>
      </div>
    </div>
  );
};
