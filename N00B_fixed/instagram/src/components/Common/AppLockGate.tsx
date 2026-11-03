import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScanFace, KeyRound, Loader2, ArrowLeft } from 'lucide-react';
import type { User } from '../../types';
import { LOCK_PAGES, lockNeeded, markUnlocked, startLock, subscribeLock, verifyFace, type LockPage } from '../../utils/appLock';
import { verifyMyPassword } from '../../services/api';

// The cover that hides NOOB (or one page of it) until the phone has recognised the person's face / finger (utils/appLock.ts). Set up in Settings and activity > App lock.

const useLockVersion = (): number => {
  const [v, setV] = useState(0);
  useEffect(() => subscribeLock(() => setV((n) => n + 1)), []);
  return v;
};

const LockCover: React.FC<{ user: User; title: string; text: string; onLeave?: () => void; inline?: boolean; autoTry?: boolean }> = ({ user, title, text, onLeave, inline, autoTry }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const tried = useRef(false);

  const tryFace = useCallback(async () => {
    setBusy(true); setError('');
    const ok = await verifyFace(user.id);
    setBusy(false);
    if (ok) markUnlocked(); else setError('Not recognised. Try again, or use your password.');
  }, [user.id]);

  useEffect(() => {
    if (!autoTry || tried.current || document.visibilityState !== 'visible') return;
    tried.current = true;
    void tryFace();
  }, [autoTry, tryFace]);

  const unlockWithPassword = async () => {
    setBusy(true); setError('');
    const res = await verifyMyPassword(user.username, password);
    setBusy(false);
    if (res.ok) { setPassword(''); markUnlocked(); } else setError(res.error || 'Incorrect password.');
  };

  return (
    <div
      className={`${inline ? 'absolute' : 'fixed'} inset-0 z-[400] flex flex-col items-center justify-center gap-5 px-8 text-center bg-black/85 backdrop-blur-2xl text-white`}
      role="dialog" aria-modal="true" aria-label={title} data-testid="app-lock-cover"
    >
      <img src="/noob-logo-circle.png" alt="" width={64} height={64} className="rounded-2xl opacity-95" draggable={false} />
      <div>
        <h2 className="text-xl font-black tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-white/65 max-w-[18rem]">{text}</p>
      </div>
      <button onClick={tryFace} disabled={busy} className="h-12 px-6 rounded-2xl bg-white text-black font-black text-sm flex items-center gap-2 cursor-pointer active:scale-[.97] transition-transform disabled:opacity-60" data-testid="app-lock-unlock">
        {busy && !usePassword ? <Loader2 className="w-5 h-5 animate-spin" /> : <ScanFace className="w-5 h-5" />} Unlock with Face ID
      </button>
      {usePassword ? (
        <form className="w-full max-w-xs flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); void unlockWithPassword(); }}>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your NOOB password" className="h-11 rounded-xl bg-white/10 border border-white/20 px-3 text-sm outline-none focus:border-white/60" />
          <button type="submit" disabled={busy || !password} className="h-11 rounded-xl bg-white/15 border border-white/25 font-bold text-sm disabled:opacity-50 cursor-pointer">{busy ? 'Checking…' : 'Unlock with password'}</button>
        </form>
      ) : (
        <button onClick={() => setUsePassword(true)} className="text-xs text-white/60 underline underline-offset-4 flex items-center gap-1.5 cursor-pointer"><KeyRound className="w-3.5 h-3.5" /> Can’t use Face ID? Use your password</button>
      )}
      {error && <p className="text-xs text-rose-300" role="alert">{error}</p>}
      {onLeave && <button onClick={onLeave} className="text-xs text-white/50 flex items-center gap-1 cursor-pointer"><ArrowLeft className="w-3.5 h-3.5" /> Go back to Home</button>}
    </div>
  );
};

/** Mounted once in the app: covers everything (the whole-app lock) or the open page (a page lock). */
export const AppLockGate: React.FC<{ user: User | null; activeTab: string; onLeave: () => void }> = ({ user, activeTab, onLeave }) => {
  useLockVersion();
  useEffect(() => { if (user) startLock(user.id); }, [user]);
  if (!user) return null;
  const page = LOCK_PAGES.some((p) => p.id === activeTab) ? (activeTab as LockPage) : null;
  const need = lockNeeded(user.id, page);
  if (need === 'app') return <LockCover user={user} title="NOOB is locked" text="Use Face ID, your fingerprint or your phone’s code to open it." autoTry />;
  if (need === 'page') return <LockCover user={user} title={`${LOCK_PAGES.find((p) => p.id === page)?.label ?? 'This page'} is locked`} text="Use Face ID, your fingerprint or your phone’s code to see it." onLeave={onLeave} autoTry />;
  return null;
};

/** Put inside a page that is not one of the tabs (Settings and activity, Family Map): covers that page while it is locked. */
export const PageLock: React.FC<{ user: User; page: LockPage; onLeave?: () => void }> = ({ user, page, onLeave }) => {
  useLockVersion();
  if (lockNeeded(user.id, page) !== 'page') return null;
  return <LockCover user={user} title={`${LOCK_PAGES.find((p) => p.id === page)?.label ?? 'This page'} is locked`} text="Use Face ID, your fingerprint or your phone’s code to see it." onLeave={onLeave} autoTry />;
};
