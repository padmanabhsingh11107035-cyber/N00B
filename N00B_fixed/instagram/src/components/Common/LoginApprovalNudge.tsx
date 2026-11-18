import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { fetchMyLoginApproval, turnOnLoginApproval } from '../../services/api';

// A friendly, one-tap suggestion to protect the account: "Login approval by email" (after the password, an email asks "Is this you?" - nothing to install).
// Shown at most once every 14 days, only to people who have an email on the account and have not turned it on, and only after the app has been open for a while,
// so it never gets in the way of the first screen. "Not now" hides it for 14 days; turning it on is the same one-tap switch as in Settings.
const KEY = 'noob_login_approval_nudge_until';
const QUIET_MS = 14 * 24 * 3600 * 1000;
const DELAY_MS = 45_000;

export const LoginApprovalNudge: React.FC<{ userId: string }> = ({ userId }) => {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const key = `${KEY}:${userId}`;

  useEffect(() => {
    let live = true;
    try { const until = Number(localStorage.getItem(key) || 0); if (until > Date.now()) return; } catch { /* storage blocked: still fine to ask once */ }
    const t = window.setTimeout(async () => {
      const info = await fetchMyLoginApproval().catch(() => null);
      if (live && info && !info.enabled && info.hasEmail) setShow(true);
    }, DELAY_MS);
    return () => { live = false; window.clearTimeout(t); };
  }, [key]);

  const later = () => { try { localStorage.setItem(key, String(Date.now() + QUIET_MS)); } catch { /* ignore */ } setShow(false); };
  const turnOn = async () => {
    if (busy) return;
    setBusy(true); setError('');
    const res = await turnOnLoginApproval();
    setBusy(false);
    if (res.success) { setDone(true); try { localStorage.setItem(key, String(Date.now() + 10 * 365 * 24 * 3600 * 1000)); } catch { /* ignore */ } window.setTimeout(() => setShow(false), 2500); }
    else setError(res.error || 'Could not turn it on. You can try later in Settings.');
  };

  if (!show) return null;
  return (
    <div className="fixed inset-x-3 z-[120] mx-auto max-w-md rounded-2xl bg-zinc-900 border border-white/10 p-4 text-zinc-200 shadow-2xl" style={{ bottom: 'calc(var(--nav-h, 64px) + env(safe-area-inset-bottom, 0px) + 12px)' }} role="dialog" aria-label="Protect your account" data-testid="login-approval-nudge">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 shrink-0 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center"><ShieldCheck className="w-5 h-5 text-emerald-400" /></div>
        <div className="min-w-0 flex-1">
          {done ? (
            <p className="text-sm font-bold text-white" data-testid="nudge-done">Done. Your account is now protected.</p>
          ) : (
            <>
              <p className="text-sm font-bold text-white">Protect your account</p>
              <p className="text-xs text-zinc-400 mt-0.5">After your password, we email “Is this you?” with one tap. Nobody can get in without your email. Nothing to install.</p>
              {error && <p role="alert" className="text-xs text-red-400 mt-1.5" data-testid="nudge-error">{error}</p>}
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={later} disabled={busy} className="flex-1 rounded-xl border border-zinc-700 py-2 text-xs font-semibold cursor-pointer disabled:opacity-50" data-testid="nudge-later">Not now</button>
                <button type="button" onClick={turnOn} disabled={busy} className="flex-1 rounded-xl bg-[#0C831F] py-2 text-xs font-bold text-white cursor-pointer disabled:opacity-50" data-testid="nudge-on">Turn on</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
