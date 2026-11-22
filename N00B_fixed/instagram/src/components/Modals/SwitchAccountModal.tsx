import React, { useEffect, useState } from 'react';
import { ArrowLeft, Check, KeyRound, Loader2, Trash2, UserPlus } from 'lucide-react';
import { tabSessions } from '../../services/supabase';
import { fetchCurrentUser, fetchLinkedAccounts, fetchUserById, signInLinkedAccount, type LinkedAccount } from '../../services/supabaseApi';
import { useVisibleArea, visibleAreaStyle } from '../../utils/useVisualViewport';

// What the saved accounts look like right now (picture and name). The saved login only knows the user name, so the pictures are asked for when the sheet opens; the last answer is kept on this
// device, so the next time they show at once and are then refreshed.
interface AccountCard { avatar: string; displayName: string }
const CARDS_KEY = 'noob.accountCards.v1';
const readCards = (): Record<string, AccountCard> => {
  try { const v = JSON.parse(localStorage.getItem(CARDS_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
};
const writeCards = (cards: Record<string, AccountCard>) => { try { localStorage.setItem(CARDS_KEY, JSON.stringify(cards)); } catch { /* private window: it still shows for now */ } };

/** The round picture of an account: its profile picture, or its first letter until there is one (or when the picture cannot be loaded). */
const AccountFace: React.FC<{ avatar?: string; username: string; size?: number }> = ({ avatar, username, size = 40 }) => {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [avatar]);
  const box = { width: size, height: size } as const;
  return avatar && !broken ? (
    <img src={avatar} alt="" style={box} className="rounded-full object-cover shrink-0 bg-zinc-800 border border-white/10" referrerPolicy="no-referrer" onError={() => setBroken(true)} data-testid="account-picture" />
  ) : (
    <span style={{ ...box, fontSize: Math.round(size * 0.4) }} className="rounded-full bg-zinc-800 flex items-center justify-center font-black text-zinc-300 shrink-0" translate="no">{username.slice(0, 1).toUpperCase()}</span>
  );
};

interface SwitchAccountModalProps {
  onClose: () => void;
}

// The accounts logged in on this browser. Every tab can use a different one at the same time: choosing one here changes only THIS
// tab; "Add another account" opens the login page in this tab without logging anybody out (the other tabs are not affected).
// Below them: the person's OTHER accounts (the same email address or mobile number). The first time, the account's password is asked; the login is then
// kept on this device, so switching to it never asks again (until it is removed from the list or logged out).
export const SwitchAccountModal: React.FC<SwitchAccountModalProps> = ({ onClose }) => {
  const area = useVisibleArea();        // the part of the screen above the keyboard: the page fills exactly that, so it sits tightly on the keyboard
  const [accounts, setAccounts] = useState(() => tabSessions.savedAccounts());
  const [removingId, setRemovingId] = useState<string | null>(null); // tap once to arm, tap again to confirm
  const currentId = tabSessions.currentAccount();
  const [cards, setCards] = useState<Record<string, AccountCard>>(readCards);
  const [linked, setLinked] = useState<LinkedAccount[]>([]);
  const [linkedState, setLinkedState] = useState<'loading' | 'ok' | 'missing' | 'error'>('loading');
  const [opening, setOpening] = useState<string | null>(null);   // the linked account whose password is being asked
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Switching ends with a full reload of the app, which takes a few seconds on a phone: from the first tap this says what is happening (a spinner and the name), so the button never looks dead.
  const [switching, setSwitching] = useState<{ label: string } | null>(null);

  // the current picture and name of every saved account: this account's own profile, and the others' public profile (one by one, each shown as soon as it arrives)
  useEffect(() => {
    let live = true;
    const put = (id: string, u: { avatar?: string; displayName?: string } | null) => {
      if (!live || !u || (!u.avatar && !u.displayName)) return;
      setCards((cur) => {
        const next = { ...cur, [id]: { avatar: u.avatar || cur[id]?.avatar || '', displayName: u.displayName || cur[id]?.displayName || '' } };
        writeCards(next);
        return next;
      });
    };
    tabSessions.savedAccounts().forEach((a) => {
      const ask = a.id === currentId ? fetchCurrentUser() : fetchUserById(a.id);
      ask.then((u) => put(a.id, u)).catch(() => undefined);
    });
    return () => { live = false; };
  }, [currentId]);

  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setLinkedState('loading');
    fetchLinkedAccounts().then((res) => { if (live) { setLinked(res.accounts); setLinkedState(res.state); } });
    return () => { live = false; };
  }, [retry]);
  // the other accounts that are not on this device yet
  const notYet = linked.filter((l) => !accounts.some((a) => a.id === l.id));
  const cardOf = (id: string): AccountCard | undefined => cards[id] || (() => { const l = linked.find((x) => x.id === id); return l ? { avatar: l.avatar, displayName: l.displayName } : undefined; })();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The spinner is drawn first (one short pause), then the switch and the reload happen.
  const goReload = (label: string, doSwitch: () => boolean) => {
    setSwitching({ label });
    window.setTimeout(() => { if (doSwitch()) window.location.reload(); else setSwitching(null); }, 80);
  };
  const use = (id: string) => {
    if (switching) return;
    if (id === currentId) return onClose();
    const name = accounts.find((a) => a.id === id)?.username;
    goReload(name ? `Switching to @${name}…` : 'Switching account…', () => tabSessions.switchTo(id));
  };
  const signIn = async (acct: LinkedAccount) => {
    if (busy) return;
    setBusy(true);
    setError('');
    const res = await signInLinkedAccount(acct.username, password);
    setBusy(false);
    if (!res.success || !res.id) { setError(res.error || 'Could not sign in.'); return; }
    setPassword('');
    const newId = res.id;
    if (tabSessions.switchTo(newId)) { setSwitching({ label: `Switching to @${acct.username}…` }); window.setTimeout(() => window.location.reload(), 80); }
    else { setAccounts(tabSessions.savedAccounts()); setOpening(null); }
  };
  const addAnother = () => {
    if (switching) return;
    goReload('Opening the log-in page…', () => { tabSessions.unbind(); return true; });
  };
  // Forgets a saved login on THIS browser only — the account itself is untouched and can be logged back into any time.
  const forget = (id: string) => {
    tabSessions.forget(id);
    setAccounts(tabSessions.savedAccounts());
    setRemovingId(null);
  };

  const current = accounts.find((a) => a.id === currentId);
  const others = accounts.filter((a) => a.id !== currentId);
  const nameOf = (id: string, username: string): string => { const n = cardOf(id)?.displayName; return n && n !== username ? n : ''; };

  return (
    <div className="fixed inset-0 z-[125] bg-zinc-950 text-white flex flex-col" role="dialog" aria-modal="true" aria-label="Switch account" aria-busy={!!switching} style={visibleAreaStyle(area)} data-testid="switch-account-page">
      {switching && (
        <div className="absolute inset-0 z-20 bg-zinc-950/90 backdrop-blur-sm flex flex-col items-center justify-center gap-3 text-center px-6" role="status" aria-live="polite" data-testid="switching-overlay">
          <Loader2 className="w-9 h-9 text-white animate-spin" />
          <p className="text-[16px] font-bold text-white" translate="no">{switching.label}</p>
          <p className="text-[13px] text-zinc-400">This takes a few seconds. Please wait.</p>
        </div>
      )}

      {/* the bar: a clear way back, and the title */}
      <header className="shrink-0 flex items-center gap-2 px-2 h-14 border-b border-white/10">
        <button type="button" onClick={onClose} aria-label="Back" data-testid="switch-account-back" className="w-11 h-11 rounded-full flex items-center justify-center text-white cursor-pointer active:bg-white/10">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-[18px] font-bold">Switch account</h1>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="w-full max-w-[560px] mx-auto pb-6">
          {/* the account this tab uses now */}
          {current && (
            <div className="flex flex-col items-center text-center px-6 pt-7 pb-6" data-testid="current-account">
              <span className="relative">
                <AccountFace avatar={cardOf(current.id)?.avatar} username={current.username} size={84} />
                <span className="absolute -right-0.5 -bottom-0.5 w-7 h-7 rounded-full bg-[#0095f6] border-[3px] border-zinc-950 flex items-center justify-center"><Check className="w-4 h-4 text-white" strokeWidth={3} /></span>
              </span>
              <p className="mt-3 text-[18px] font-bold truncate max-w-full" translate="no">{nameOf(current.id, current.username) || `@${current.username}`}</p>
              <p className="text-[14px] text-zinc-400 truncate max-w-full" translate="no">@{current.username}</p>
              <p className="mt-1 text-[13px] text-zinc-500">You are using this account in this tab</p>
            </div>
          )}

          {/* the other accounts saved on this device */}
          {(others.length > 0 || !current) && (
            <>
              <h2 className="px-5 pb-1 pt-2 text-[13px] font-semibold uppercase tracking-wide text-zinc-500">On this device</h2>
              <ul>
                {others.map((a) => {
                  const confirming = removingId === a.id;
                  return (
                    <li key={a.id} className={`flex items-center gap-3 pl-5 pr-3 min-h-[68px] border-b border-white/5 ${confirming ? 'bg-red-500/10' : ''}`}>
                      <button type="button" onClick={() => use(a.id)} disabled={!!switching} className="flex-1 min-w-0 flex items-center gap-3.5 py-2.5 text-left cursor-pointer disabled:opacity-60">
                        <AccountFace avatar={cardOf(a.id)?.avatar} username={a.username} size={48} />
                        <span className="flex-1 min-w-0">
                          <span className="block text-[16px] font-semibold truncate" translate="no">{nameOf(a.id, a.username) || `@${a.username}`}</span>
                          <span className="block text-[13px] text-zinc-400 truncate" translate="no">{confirming ? 'Remove this account from the list?' : `@${a.username}`}</span>
                        </span>
                      </button>
                      {confirming ? (
                        <span className="flex items-center gap-1.5 shrink-0">
                          <button type="button" onClick={() => forget(a.id)} className="px-3.5 h-9 rounded-full bg-red-500 text-white text-[13px] font-bold cursor-pointer">Remove</button>
                          <button type="button" onClick={() => setRemovingId(null)} className="px-3.5 h-9 rounded-full bg-white/10 text-white text-[13px] font-semibold cursor-pointer">Cancel</button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => setRemovingId(a.id)} title="Remove from this device (does not delete the account)" aria-label={`Remove @${a.username} from this device`} className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-500 active:text-red-400 active:bg-red-500/10 cursor-pointer shrink-0">
                          <Trash2 className="w-[18px] h-[18px]" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {accounts.length === 0 && <p className="text-center text-[14px] text-zinc-500 py-8">No saved accounts on this device.</p>}
            </>
          )}

          {/* your other accounts (same email address or mobile number) */}
          <h2 className="px-5 pb-1 pt-7 text-[13px] font-semibold uppercase tracking-wide text-zinc-500">Your other accounts</h2>
          {linkedState !== 'ok' || notYet.length === 0 ? (
            <div className="px-5 pt-1" data-testid="linked-accounts-status">
              <p className="text-[14px] text-zinc-400 leading-snug" role="status">
                {linkedState === 'loading' && 'Looking for your other accounts…'}
                {linkedState === 'ok' && (linked.length > 0 ? 'All your other accounts are already on this device.' : 'No other account uses the same email address or mobile number as this one.')}
                {linkedState === 'missing' && 'Finding your other accounts is not switched on yet.'}
                {linkedState === 'error' && 'Could not look up your other accounts right now.'}
              </p>
              {(linkedState === 'error' || linkedState === 'missing') && (
                <button type="button" onClick={() => setRetry((n) => n + 1)} className="mt-2 text-[14px] font-semibold text-[#0095f6] cursor-pointer">Try again</button>
              )}
            </div>
          ) : (
            <div data-testid="linked-accounts">
              <p className="px-5 pb-2 text-[13px] text-zinc-500 leading-snug">You enter the password only the first time. After that this device remembers the account.</p>
              <ul>
                {notYet.map((l) => {
                  const open = opening === l.id;
                  return (
                    <li key={l.id} className="border-b border-white/5">
                      <button type="button" onClick={() => { setOpening(open ? null : l.id); setPassword(''); setError(''); }} className="w-full flex items-center gap-3.5 pl-5 pr-4 min-h-[68px] text-left cursor-pointer active:bg-white/5">
                        <AccountFace avatar={l.avatar} username={l.username} size={48} />
                        <span className="flex-1 min-w-0">
                          <span className="block text-[16px] font-semibold truncate" translate="no">{l.displayName && l.displayName !== l.username ? l.displayName : `@${l.username}`}</span>
                          <span className="block text-[13px] text-zinc-400 truncate" translate="no">@{l.username}{open ? '' : ' · tap to switch'}</span>
                        </span>
                        <KeyRound className="w-[18px] h-[18px] text-zinc-500 shrink-0" />
                      </button>
                      {open && (
                        <form className="px-5 pb-4 space-y-2.5" onSubmit={(e) => { e.preventDefault(); void signIn(l); }}>
                          <input
                            type="password"
                            autoFocus
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => { setPassword(e.target.value); setError(''); }}
                            placeholder={`Password of @${l.username}`}
                            className="w-full h-12 bg-zinc-900 border border-white/15 rounded-xl px-4 text-[16px] text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/50"
                          />
                          {error && <p className="text-[13px] text-red-400" role="alert">{error}</p>}
                          <button type="submit" disabled={busy || !!switching || !password} className="w-full h-12 flex items-center justify-center gap-2 rounded-xl bg-[#0095f6] text-white text-[15px] font-bold disabled:opacity-50 cursor-pointer">
                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            {busy ? 'Signing in…' : 'Switch to this account'}
                          </button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-white/10 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),14px)]">
        <div className="w-full max-w-[560px] mx-auto">
          <button type="button" onClick={addAnother} disabled={!!switching} data-testid="add-another-account" className="w-full h-12 flex items-center justify-center gap-2 rounded-xl bg-[#0095f6] text-white text-[15px] font-bold cursor-pointer active:brightness-90 disabled:opacity-60">
            <UserPlus className="w-5 h-5" />
            Add another account
          </button>
        </div>
      </div>
    </div>
  );
};
