import React, { useEffect, useRef, useState } from 'react';
import { adminReauthConfirm } from '../../services/supabaseApi';

// "Confirm your password": shown before a dangerous admin action (changing a balance, suspending an account). The server checks the password and then allows those actions for 10 minutes.
// `requestAdminPassword()` resolves true when the password was accepted and false when the admin cancelled.
export const ADMIN_REAUTH_EVENT = 'noob-admin-reauth';

export function requestAdminPassword(): Promise<boolean> {
  return new Promise((resolve) => { window.dispatchEvent(new CustomEvent(ADMIN_REAUTH_EVENT, { detail: { resolve } })); });
}

export const AdminReauthHost: React.FC = () => {
  const [pending, setPending] = useState<null | ((ok: boolean) => void)>(null);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const resolve = (e as CustomEvent).detail?.resolve as (ok: boolean) => void;
      setPending((prev) => { if (prev) prev(false); return resolve; });
      setPw(''); setError('');
    };
    window.addEventListener(ADMIN_REAUTH_EVENT, on);
    return () => window.removeEventListener(ADMIN_REAUTH_EVENT, on);
  }, []);
  useEffect(() => { if (pending) setTimeout(() => ref.current?.focus(), 50); }, [pending]);
  if (!pending) return null;
  const finish = (ok: boolean) => { const r = pending; setPending(null); setPw(''); r(ok); };
  const submit = async () => {
    if (busy || !pw) return;
    setBusy(true); setError('');
    const res = await adminReauthConfirm(pw);
    setBusy(false);
    if (res.success) finish(true); else setError(res.error || 'That did not work.');
  };
  return (
    <div data-noob-sheet="1" className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/70" onClick={() => { if (!busy) finish(false); }} data-testid="admin-reauth">
      <div role="dialog" aria-label="Confirm your password" className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-zinc-950 border border-white/10 p-4 text-zinc-200" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-white">Confirm your password</h3>
        <p className="text-xs text-zinc-400 mt-1">This action is protected. Enter your password once; it stays unlocked for 10 minutes.</p>
        <input ref={ref} type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} placeholder="Your password" aria-label="Your password" data-testid="admin-reauth-input" className="mt-3 w-full rounded-xl bg-zinc-900 border border-zinc-800 p-3 text-base text-white outline-none focus:border-zinc-500" />
        {error && <p role="alert" className="mt-2 text-xs text-red-400" data-testid="admin-reauth-error">{error}</p>}
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => finish(false)} disabled={busy} className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-sm font-semibold cursor-pointer disabled:opacity-50">Cancel</button>
          <button type="button" onClick={submit} disabled={busy || !pw} className="flex-1 rounded-xl bg-[#0C831F] py-2.5 text-sm font-bold text-white cursor-pointer disabled:opacity-50" data-testid="admin-reauth-go">Confirm</button>
        </div>
      </div>
    </div>
  );
};
