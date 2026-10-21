import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mail, ShieldAlert, ShieldCheck } from 'lucide-react';
import { ToggleRow } from './kit';
import { checkEnableLoginApproval, fetchMyLoginApproval, startEnableLoginApproval, turnOffLoginApproval, type LoginApprovalTicket } from '../../services/api';
import { getDeviceLabel } from '../../utils/deviceId';

// "Login approval by email" as a switch: shown in the profile's three-dots menu (near the bottom) and under Your NOOB account → Password and security.
// ON  = after the right password, NOOB emails "Is this you?" with two buttons; "Yes, it's me" logs the waiting device in, "No, it's not me" shows Access denied there.
// Turning it ON is itself confirmed by an email (so an address that cannot receive mail can never lock the person out); turning it OFF asks for the password again.

type Dialog =
  | { kind: 'on'; done: () => void }
  | { kind: 'off'; done: () => void };

const POLL_MS = 2000;
const RESEND_AFTER_MS = 20000;
const overlay = 'fixed inset-0 z-[90] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4';
const card = 'w-full max-w-sm bg-zinc-900 border border-white/10 rounded-3xl p-6 text-center shadow-2xl';

export const LoginApprovalRow: React.FC = () => {
  const [info, setInfo] = useState<{ enabled: boolean; hasEmail: boolean } | null | 'unavailable'>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useEffect(() => {
    let live = true;
    void fetchMyLoginApproval().then((r) => { if (live) setInfo(r || 'unavailable'); });
    return () => { live = false; };
  }, []);

  const enabled = info !== null && info !== 'unavailable' && info.enabled;
  const setEnabled = useCallback((on: boolean) => setInfo((i) => (i && i !== 'unavailable' ? { ...i, enabled: on } : i)), []);

  // the switch waits for the dialog: it stays where it was put until the dialog is closed, then shows what is really saved
  const change = (next: boolean) => new Promise<void>((resolve) => { setDialog({ kind: next ? 'on' : 'off', done: resolve }); });
  const close = () => { const d = dialog; setDialog(null); d?.done(); };

  return (
    <>
      <ToggleRow
        icon={ShieldCheck}
        label="Login approval by email"
        sub={info === 'unavailable' ? 'Not available right now. Please try again later.' : 'After your password, NOOB emails “Is this you?” with two buttons. Yes logs you in, No blocks it.'}
        on={enabled}
        disabled={info === null || info === 'unavailable'}
        onChange={change}
        testId="login-approval-toggle"
      />
      {dialog?.kind === 'on' && <TurnOn hasEmail={info !== null && info !== 'unavailable' && info.hasEmail} onTurnedOn={() => setEnabled(true)} onClose={close} />}
      {dialog?.kind === 'off' && <TurnOff onTurnedOff={() => setEnabled(false)} onClose={close} />}
    </>
  );
};

// ---------------------------------------------------------------------------------------------------------------- turning it on: an email with the two buttons
const TurnOn: React.FC<{ hasEmail: boolean; onTurnedOn: () => void; onClose: () => void }> = ({ hasEmail, onTurnedOn, onClose }) => {
  const [phase, setPhase] = useState<'sending' | 'waiting' | 'on' | 'denied' | 'expired' | 'error'>(hasEmail ? 'sending' : 'error');
  const [error, setError] = useState<string | null>(hasEmail ? null : 'Add an email address to your account first (Edit profile), so there is somewhere to send the question.');
  const [ticket, setTicket] = useState<LoginApprovalTicket | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const alive = useRef(true);
  const finished = useRef(false);
  const turned = useRef(onTurnedOn);
  turned.current = onTurnedOn;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const send = useCallback(async () => {
    setPhase('sending');
    setError(null);
    const res = await startEnableLoginApproval(getDeviceLabel());
    if (!alive.current) return;
    if (res.success && res.ticket) {
      finished.current = false;
      setTicket(res.ticket);
      setPhase('waiting');
      setResendAt(Date.now() + RESEND_AFTER_MS);
      return;
    }
    setError(res.error || 'Could not send the email. Please try again.');
    if (res.retryAfter) setResendAt(Date.now() + res.retryAfter * 1000);
    setPhase('error');
  }, []);

  useEffect(() => { if (hasEmail) void send(); }, [hasEmail, send]);

  // ask every couple of seconds whether the email was answered
  useEffect(() => {
    if (phase !== 'waiting' || !ticket) return;
    let timer = 0;
    const ask = async () => {
      const r = await checkEnableLoginApproval(ticket);
      if (!alive.current || finished.current) return;
      if (r === 'approved') { finished.current = true; turned.current(); setPhase('on'); return; }
      if (r === 'denied') { finished.current = true; setPhase('denied'); return; }
      if (r === 'expired') { finished.current = true; setPhase('expired'); return; }
      timer = window.setTimeout(() => void ask(), POLL_MS);
    };
    timer = window.setTimeout(() => void ask(), 1500);
    return () => window.clearTimeout(timer);
  }, [phase, ticket]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);

  const wait = Math.max(0, resendAt - now);
  return (
    <div className={overlay} role="dialog" aria-modal="true" aria-label="Turn on login approval" data-testid="approval-on-dialog">
      <div className={card}>
        {phase === 'on' ? (
          <>
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/15 border border-emerald-500/50 flex items-center justify-center"><ShieldCheck className="w-8 h-8 text-emerald-400" /></div>
            <h2 className="mt-4 text-xl font-black text-emerald-400">Login approval is on</h2>
            <p className="mt-2 text-sm text-zinc-300 leading-relaxed">From now on, after the right password, you get an email with “Yes, it’s me” and “No, it’s not me”.</p>
          </>
        ) : phase === 'denied' ? (
          <>
            <div className="w-16 h-16 mx-auto rounded-full bg-zinc-800 border border-white/15 flex items-center justify-center"><ShieldAlert className="w-8 h-8 text-zinc-300" /></div>
            <h2 className="mt-4 text-xl font-black text-white">Left off</h2>
            <p className="mt-2 text-sm text-zinc-300">You tapped “No”, so login approval was not turned on.</p>
          </>
        ) : phase === 'expired' ? (
          <>
            <div className="w-16 h-16 mx-auto rounded-full bg-zinc-800 border border-white/15 flex items-center justify-center"><Mail className="w-8 h-8 text-zinc-300" /></div>
            <h2 className="mt-4 text-xl font-black text-white">The email ran out</h2>
            <p className="mt-2 text-sm text-zinc-300">Nobody tapped “Yes” in time, so nothing was changed.</p>
          </>
        ) : phase === 'error' ? (
          <>
            <div className="w-16 h-16 mx-auto rounded-full bg-red-500/15 border border-red-500/50 flex items-center justify-center"><ShieldAlert className="w-8 h-8 text-red-400" /></div>
            <h2 className="mt-4 text-xl font-black text-white">Could not turn it on</h2>
            <p className="mt-2 text-sm text-red-300 leading-relaxed" role="alert">{error}</p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 mx-auto rounded-full bg-noob/15 border border-noob/50 flex items-center justify-center">
              {phase === 'sending' ? <Loader2 className="w-8 h-8 text-noob animate-spin" /> : <Mail className="w-8 h-8 text-noob" />}
            </div>
            <h2 className="mt-4 text-xl font-black text-white">{phase === 'sending' ? 'Sending the email…' : 'Check your email'}</h2>
            <p className="mt-2 text-sm text-zinc-300 leading-relaxed">
              {phase === 'sending' ? 'One moment.' : <>We sent two buttons to <strong className="text-white" translate="no">{ticket?.maskedEmail || 'your email'}</strong>. Tap <strong className="text-emerald-400">Yes, it’s me</strong> there to turn login approval on. This also proves the email reaches you. Look in spam if it is not there.</>}
            </p>
            {phase === 'waiting' && (
              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-zinc-400" role="status"><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Waiting for your answer…</span></div>
            )}
          </>
        )}
        <div className="mt-5 flex gap-2">
          {(phase === 'waiting' || phase === 'error' || phase === 'expired') && hasEmail && (
            <button type="button" onClick={() => void send()} disabled={wait > 0} className="flex-1 py-2.5 rounded-full border border-white/25 text-white text-xs font-extrabold cursor-pointer hover:border-white/60 disabled:opacity-45 disabled:cursor-default" data-testid="approval-on-resend">
              {wait > 0 ? `Send again (${Math.ceil(wait / 1000)}s)` : 'Send again'}
            </button>
          )}
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-full bg-white text-black text-xs font-extrabold cursor-pointer hover:bg-zinc-200" data-testid="approval-on-close">
            {phase === 'on' || phase === 'denied' || phase === 'expired' || phase === 'error' ? 'Done' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------------------------- turning it off: the password again
const TurnOff: React.FC<{ onTurnedOff: () => void; onClose: () => void }> = ({ onTurnedOff, onClose }) => {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [off, setOff] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    const res = await turnOffLoginApproval(password);
    if (!alive.current) return;
    setBusy(false);
    if (res.success) { onTurnedOff(); setOff(true); return; }
    setError(res.error || 'Could not turn it off. Please try again.');
  };

  return (
    <div className={overlay} role="dialog" aria-modal="true" aria-label="Turn off login approval" data-testid="approval-off-dialog">
      <form onSubmit={(e) => void submit(e)} className={card}>
        {off ? (
          <>
            <div className="w-16 h-16 mx-auto rounded-full bg-zinc-800 border border-white/15 flex items-center justify-center"><ShieldCheck className="w-8 h-8 text-zinc-300" /></div>
            <h2 className="mt-4 text-xl font-black text-white">Login approval is off</h2>
            <p className="mt-2 text-sm text-zinc-300">Your password alone logs you in again.</p>
            <button type="button" onClick={onClose} className="mt-5 w-full py-2.5 rounded-full bg-white text-black text-xs font-extrabold cursor-pointer hover:bg-zinc-200" data-testid="approval-off-close">Done</button>
          </>
        ) : (
          <>
            <div className="w-16 h-16 mx-auto rounded-full bg-zinc-800 border border-white/15 flex items-center justify-center"><ShieldAlert className="w-8 h-8 text-zinc-300" /></div>
            <h2 className="mt-4 text-xl font-black text-white">Turn off login approval?</h2>
            <p className="mt-2 text-sm text-zinc-300 leading-relaxed">Then your password alone logs in to this account. Enter your password to confirm.</p>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" aria-label="Your password" autoFocus className="mt-4 w-full bg-black/40 text-sm text-white px-4 py-3 rounded-2xl border border-white/15 focus:border-white/50 outline-none placeholder:text-zinc-500" data-testid="approval-off-password" />
            {error && <p className="mt-2 text-xs text-red-400" role="alert">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-full border border-white/25 text-white text-xs font-extrabold cursor-pointer hover:border-white/60">Keep it on</button>
              <button type="submit" disabled={!password || busy} className="flex-1 py-2.5 rounded-full bg-red-600 text-white text-xs font-extrabold cursor-pointer hover:bg-red-500 disabled:opacity-45 disabled:cursor-default" data-testid="approval-off-submit">{busy ? 'Turning off…' : 'Turn off'}</button>
            </div>
          </>
        )}
      </form>
    </div>
  );
};
