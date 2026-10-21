import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mail, ShieldAlert } from 'lucide-react';
import { checkLoginApproval, startLoginApproval, type LoginApprovalTicket } from '../../services/api';
import type { User } from '../../types';

// The screen a login waits on when the account asks for an approval by email: the right password was entered, an email with two buttons ("Yes, it's me" / "No, it's not me")
// was sent, and this screen asks the server every couple of seconds whether it was answered. Yes = this device is signed in at once (onApproved). No = "Access denied".
// Nothing is signed in while it waits.

interface Props {
  ticket: LoginApprovalTicket;
  identifier: string;
  password: string;
  /** what the email says about this device */
  device: string;
  onApproved: (user: User) => void;
  /** back to the login form */
  onClose: () => void;
  /** a new email was sent (Resend): the new question to wait for */
  onNewTicket: (ticket: LoginApprovalTicket) => void;
}

type Phase = 'waiting' | 'denied' | 'expired' | 'suspended';
const POLL_MS = 2000;
const RESEND_AFTER_MS = 20000;

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const LoginApprovalWait: React.FC<Props> = ({ ticket, identifier, password, device, onApproved, onClose, onNewTicket }) => {
  const [phase, setPhase] = useState<Phase>('waiting');
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [resendAt, setResendAt] = useState(() => Date.now() + RESEND_AFTER_MS);
  const [resending, setResending] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const alive = useRef(true);
  const done = useRef(false);
  const asking = useRef(false);
  const timer = useRef<number | null>(null);
  // the parent may pass a new function on every render: asking must not restart because of that
  const approved = useRef(onApproved);
  approved.current = onApproved;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const ask = useCallback(async () => {
    if (asking.current || done.current || !alive.current) return;
    asking.current = true;
    try {
      const res = await checkLoginApproval(ticket, password);
      if (!alive.current || done.current) return;
      if (res.status === 'approved' && res.user) { done.current = true; setSigningIn(true); approved.current(res.user); return; }
      if (res.status === 'denied') { done.current = true; setPhase('denied'); return; }
      if (res.status === 'suspended') { done.current = true; setMessage(res.error || 'This account has been suspended by NOOB Administrator.'); setPhase('suspended'); return; }
      if (res.status === 'expired') { done.current = true; setMessage(res.error || null); setPhase('expired'); return; }
      // pending, or a failed ask (no network...): ask again shortly
    } finally {
      asking.current = false;
    }
    if (alive.current && !done.current) timer.current = window.setTimeout(() => { void ask(); }, POLL_MS);
  }, [ticket, password]);

  // ask as soon as this question is on screen, then every couple of seconds; a tab that was in the background asks again the moment it is back
  useEffect(() => {
    done.current = false;
    setPhase('waiting');
    setMessage(null);
    setResendAt(Date.now() + RESEND_AFTER_MS);
    timer.current = window.setTimeout(() => { void ask(); }, 1200);
    const onVisible = () => { if (document.visibilityState === 'visible' && !done.current) { if (timer.current) window.clearTimeout(timer.current); void ask(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ask, ticket.challengeId]);

  // the clock (time left, and when Resend can be used)
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (phase === 'waiting' && now >= ticket.expiresAt && !done.current) { done.current = true; setPhase('expired'); }
  }, [now, phase, ticket.expiresAt]);

  const resend = async () => {
    if (resending) return;
    setResending(true);
    setMessage(null);
    const res = await startLoginApproval({ identifier, password, device });
    if (!alive.current) return;
    setResending(false);
    if (res.success && res.ticket) { onNewTicket(res.ticket); return; }
    if (res.success && !res.required) { setMessage('Login approval was switched off. Please log in again.'); setPhase('expired'); return; }
    setMessage(res.error || 'Could not send the email. Please try again.');
    if (res.retryAfter) setResendAt(Date.now() + res.retryAfter * 1000);
  };

  const wait = Math.max(0, resendAt - now);
  const shell = 'fixed inset-0 z-[75] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4';
  const card = 'w-full max-w-sm bg-zinc-900 border border-white/10 rounded-3xl p-6 text-center shadow-2xl';

  if (phase === 'denied') {
    return (
      <div className={shell} role="alertdialog" aria-modal="true" aria-label="Access denied" data-testid="approval-denied">
        <div className={card}>
          <div className="w-16 h-16 mx-auto rounded-full bg-red-500/15 border border-red-500/50 flex items-center justify-center"><ShieldAlert className="w-8 h-8 text-red-400" /></div>
          <h2 className="mt-4 text-2xl font-black text-red-400">Access denied</h2>
          <p className="mt-2 text-sm text-zinc-300 leading-relaxed">“No, it&rsquo;s not me” was tapped in the email, so nobody was logged in. If this was not you, change your password in Settings once you are in.</p>
          <button type="button" onClick={onClose} className="mt-5 w-full py-3 rounded-full bg-white text-black text-sm font-extrabold cursor-pointer hover:bg-zinc-200" data-testid="approval-back">Back to login</button>
        </div>
      </div>
    );
  }

  if (phase === 'expired' || phase === 'suspended') {
    return (
      <div className={shell} role="alertdialog" aria-modal="true" aria-label={phase === 'suspended' ? 'Account suspended' : 'Request expired'} data-testid="approval-expired">
        <div className={card}>
          <div className="w-16 h-16 mx-auto rounded-full bg-zinc-800 border border-white/15 flex items-center justify-center"><Mail className="w-8 h-8 text-zinc-300" /></div>
          <h2 className="mt-4 text-xl font-black text-white">{phase === 'suspended' ? 'Account suspended' : 'This request ran out'}</h2>
          <p className="mt-2 text-sm text-zinc-300 leading-relaxed">{message || 'Nobody tapped a button in time, so nobody was logged in. Log in again to get a new email.'}</p>
          <button type="button" onClick={onClose} className="mt-5 w-full py-3 rounded-full bg-white text-black text-sm font-extrabold cursor-pointer hover:bg-zinc-200" data-testid="approval-back">Back to login</button>
        </div>
      </div>
    );
  }

  return (
    <div className={shell} role="dialog" aria-modal="true" aria-label="Check your email" data-testid="approval-waiting">
      <div className={card}>
        <div className="w-16 h-16 mx-auto rounded-full bg-noob/15 border border-noob/50 flex items-center justify-center">
          {signingIn ? <Loader2 className="w-8 h-8 text-noob animate-spin" /> : <Mail className="w-8 h-8 text-noob" />}
        </div>
        <h2 className="mt-4 text-xl font-black text-white">{signingIn ? 'Logging you in…' : 'Is this you? Check your email'}</h2>
        {signingIn ? (
          <p className="mt-2 text-sm text-zinc-300">Approved. One moment.</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-zinc-300 leading-relaxed">
              We sent two buttons to <strong className="text-white" translate="no">{ticket.maskedEmail || 'your email'}</strong>. Tap <strong className="text-emerald-400">Yes, it&rsquo;s me</strong> and you are logged in here straight away. Keep this page open.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-zinc-400" role="status" aria-live="polite">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Waiting for your answer · {clock(ticket.expiresAt - now)}</span>
            </div>
            {message && <p className="mt-3 text-xs text-red-400" role="alert">{message}</p>}
            <p className="mt-4 text-[11px] text-zinc-500 leading-relaxed">Not there? Look in your spam folder. A new email makes the old one stop working.</p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => void resend()} disabled={resending || wait > 0} className="flex-1 py-2.5 rounded-full border border-white/25 text-white text-xs font-extrabold cursor-pointer hover:border-white/60 disabled:opacity-45 disabled:cursor-default" data-testid="approval-resend">
                {resending ? 'Sending…' : wait > 0 ? `Send again (${Math.ceil(wait / 1000)}s)` : 'Send again'}
              </button>
              <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-full bg-white text-black text-xs font-extrabold cursor-pointer hover:bg-zinc-200" data-testid="approval-cancel">Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
