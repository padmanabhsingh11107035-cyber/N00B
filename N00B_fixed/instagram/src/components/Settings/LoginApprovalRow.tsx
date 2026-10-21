import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { ToggleRow } from './kit';
import { fetchMyLoginApproval, turnOffLoginApproval, turnOnLoginApproval } from '../../services/api';

// "Login approval by email" as a switch: shown in the profile's three-dots menu (near the bottom) and under Your NOOB account → Password and security.
// ON  = after the right password on the login page, NOOB emails "Is this you?" with two buttons; "Yes, it's me" logs the waiting device in, "No, it's not me" shows Access denied there.
//       Switching it on sends NO email: the only email is the one a login sends. It is off for every account until its owner switches it on.
// OFF = asks for the password again (so a stranger on an unlocked phone can not take the protection away).

type Dialog = { kind: 'off'; done: () => void } | { kind: 'problem'; text: string };

const overlay = 'fixed inset-0 z-[90] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4';
const card = 'w-full max-w-sm bg-zinc-900 border border-white/10 rounded-3xl p-6 text-center shadow-2xl';

export const LoginApprovalRow: React.FC = () => {
  const [info, setInfo] = useState<{ enabled: boolean; hasEmail: boolean } | null | 'unavailable'>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  useEffect(() => {
    let live = true;
    void fetchMyLoginApproval().then((r) => { if (live) setInfo(r || 'unavailable'); });
    return () => { live = false; };
  }, []);

  const enabled = info !== null && info !== 'unavailable' && info.enabled;
  const setEnabled = useCallback((on: boolean) => setInfo((i) => (i && i !== 'unavailable' ? { ...i, enabled: on } : i)), []);

  // ON: the switch moves at once and stays if it was saved; if it could not be (no email on the account, no network), it goes back and says why.
  // OFF: the switch waits for the password dialog.
  const change = async (next: boolean) => {
    if (next) {
      const res = await turnOnLoginApproval();
      if (res.success) setEnabled(true);
      else setDialog({ kind: 'problem', text: res.error || 'Could not turn it on. Please try again.' });
      return;
    }
    await new Promise<void>((resolve) => { setDialog({ kind: 'off', done: resolve }); });
  };
  const close = () => { const d = dialog; setDialog(null); if (d?.kind === 'off') d.done(); };

  return (
    <>
      <ToggleRow
        icon={ShieldCheck}
        label="Login approval by email"
        sub={info === 'unavailable' ? 'Not available right now. Please try again later.' : 'When you log in with the right password, NOOB emails “Is this you?” with two buttons. Yes logs you in, No blocks it. Off until you turn it on.'}
        on={enabled}
        disabled={info === null || info === 'unavailable'}
        onChange={change}
        testId="login-approval-toggle"
      />
      {dialog?.kind === 'off' && <TurnOff onTurnedOff={() => setEnabled(false)} onClose={close} />}
      {dialog?.kind === 'problem' && (
        <div className={overlay} role="dialog" aria-modal="true" aria-label="Could not turn it on" data-testid="approval-problem-dialog">
          <div className={card}>
            <div className="w-16 h-16 mx-auto rounded-full bg-red-500/15 border border-red-500/50 flex items-center justify-center"><ShieldAlert className="w-8 h-8 text-red-400" /></div>
            <h2 className="mt-4 text-xl font-black text-white">Could not turn it on</h2>
            <p className="mt-2 text-sm text-red-300 leading-relaxed" role="alert">{dialog.text}</p>
            <button type="button" onClick={close} className="mt-5 w-full py-2.5 rounded-full bg-white text-black text-xs font-extrabold cursor-pointer hover:bg-zinc-200" data-testid="approval-problem-close">Done</button>
          </div>
        </div>
      )}
    </>
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
