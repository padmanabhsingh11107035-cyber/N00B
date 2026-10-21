import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, ShieldAlert, ShieldCheck, TimerOff } from 'lucide-react';
import { answerLoginApproval } from '../../services/api';

// The page the two buttons in the "Is this you?" email open (/login-approval#c=<question>&t=<secret>&a=yes|no). The secret is after the # so it never reaches a server log or a referrer.
// Opening the page only READS the address: nothing is decided by a plain visit (email scanners that fetch links see an empty page). The tap counts when this page sends it, which
// it does by itself a moment after it opens in a real, visible browser; anything else (a hidden or automated browser) has to press the button.

type Step = 'ready' | 'sending' | 'approved' | 'denied' | 'expired' | 'already' | 'invalid' | 'error';

function readLink(): { id: string; token: string; answer: 'yes' | 'no' } | null {
  try {
    const q = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const id = q.get('c') || '';
    const token = q.get('t') || '';
    const a = q.get('a');
    if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f]{40,128}$/i.test(token) || (a !== 'yes' && a !== 'no')) return null;
    return { id, token, answer: a };
  } catch { return null; }
}

const LoginApprovalPage: React.FC = () => {
  const [link] = useState(readLink);
  const [step, setStep] = useState<Step>(link ? 'ready' : 'invalid');
  const [purpose, setPurpose] = useState('login');
  const [result, setResult] = useState('');
  const sent = useRef(false);

  useEffect(() => {
    document.title = 'Is this you? | NOOB';
    let meta = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    if (!meta) { meta = document.createElement('meta'); meta.name = 'robots'; document.head.appendChild(meta); }
    meta.content = 'noindex, nofollow';
  }, []);

  const send = useCallback(async () => {
    if (!link || sent.current) return;
    sent.current = true;
    setStep('sending');
    const res = await answerLoginApproval(link.id, link.token);
    // the secret is not needed any more: take it off the address
    try { window.history.replaceState(null, '', window.location.pathname); } catch { /* not important */ }
    if (res.purpose) setPurpose(res.purpose);
    if (res.result) setResult(res.result);
    if (res.status === 'error') { sent.current = false; setStep('error'); return; }
    setStep(res.status);
  }, [link]);

  // a real, visible browser: send the tap by itself; otherwise wait for the button
  useEffect(() => {
    if (!link) return;
    const automated = (navigator as Navigator & { webdriver?: boolean }).webdriver === true;
    if (automated) return;
    const t = window.setTimeout(() => { if (document.visibilityState === 'visible') void send(); }, 900);
    return () => window.clearTimeout(t);
  }, [link, send]);

  const yes = link?.answer === 'yes';
  const enabling = purpose === 'enable';
  const card = 'w-full max-w-sm bg-zinc-900 border border-white/10 rounded-3xl p-6 text-center shadow-2xl';
  const icon = (tone: 'good' | 'bad' | 'plain', node: React.ReactNode) => (
    <div className={`w-16 h-16 mx-auto rounded-full border flex items-center justify-center ${tone === 'good' ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-400' : tone === 'bad' ? 'bg-red-500/15 border-red-500/50 text-red-400' : 'bg-zinc-800 border-white/15 text-zinc-300'}`}>{node}</div>
  );

  let body: React.ReactNode;
  if (step === 'approved') {
    body = (
      <>
        {icon('good', <CheckCircle2 className="w-8 h-8" />)}
        <h1 className="mt-4 text-2xl font-black text-emerald-400">{enabling ? 'Login approval is on' : 'Approved'}</h1>
        <p className="mt-2 text-sm text-zinc-300 leading-relaxed">{enabling ? 'From now on, a login to your account needs your approval by email. You can turn it off again in Settings.' : 'The device that is waiting logs in by itself now. You can close this page.'}</p>
      </>
    );
  } else if (step === 'denied') {
    body = (
      <>
        {icon('bad', <ShieldAlert className="w-8 h-8" />)}
        <h1 className="mt-4 text-2xl font-black text-red-400">{enabling ? 'Left off' : 'Access denied'}</h1>
        <p className="mt-2 text-sm text-zinc-300 leading-relaxed">{enabling ? 'Login approval was not turned on. Nothing changed.' : 'Nobody was logged in. If this was not you, someone may know your password: change it as soon as you can (Settings → Your NOOB account → Change password).'}</p>
      </>
    );
  } else if (step === 'expired') {
    body = (
      <>
        {icon('plain', <TimerOff className="w-8 h-8" />)}
        <h1 className="mt-4 text-xl font-black text-white">This request ran out</h1>
        <p className="mt-2 text-sm text-zinc-300 leading-relaxed">It was older than 10 minutes, or a newer email replaced it. Nothing was changed.</p>
      </>
    );
  } else if (step === 'already') {
    body = (
      <>
        {icon('plain', <ShieldCheck className="w-8 h-8" />)}
        <h1 className="mt-4 text-xl font-black text-white">Already answered</h1>
        <p className="mt-2 text-sm text-zinc-300 leading-relaxed">This question was already answered{result === 'denied' ? ' (access was denied)' : result === 'approved' || result === 'used' ? ' (it was approved)' : ''}, and it can only be answered once. Nothing was changed now.</p>
      </>
    );
  } else if (step === 'invalid') {
    body = (
      <>
        {icon('plain', <ShieldAlert className="w-8 h-8" />)}
        <h1 className="mt-4 text-xl font-black text-white">This link does not work</h1>
        <p className="mt-2 text-sm text-zinc-300 leading-relaxed">It may be incomplete or old. Use the buttons in the newest email NOOB sent you.</p>
      </>
    );
  } else {
    body = (
      <>
        {icon(yes ? 'good' : 'bad', step === 'sending' ? <Loader2 className="w-8 h-8 animate-spin" /> : yes ? <ShieldCheck className="w-8 h-8" /> : <ShieldAlert className="w-8 h-8" />)}
        <h1 className="mt-4 text-xl font-black text-white">{step === 'sending' ? 'Sending your answer…' : yes ? 'Confirm: yes, it’s me' : 'Confirm: no, it’s not me'}</h1>
        <p className="mt-2 text-sm text-zinc-300 leading-relaxed">
          {step === 'error' ? 'We could not reach NOOB. Check your connection and press the button to try again.' : step === 'sending' ? 'One moment.' : yes ? 'This logs the waiting device in.' : 'This blocks the login.'}
        </p>
        {step !== 'sending' && (
          <button
            type="button"
            onClick={() => void send()}
            data-testid="approval-answer"
            className={`mt-5 w-full py-3.5 rounded-full text-sm font-extrabold cursor-pointer text-white ${yes ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'}`}
          >
            {yes ? 'Yes, it’s me' : 'No, it’s not me'}
          </button>
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen w-full bg-page text-white flex flex-col items-center justify-center p-4" data-testid="login-approval-page">
      <div className="flex items-center gap-2.5 mb-5">
        <img src="/noob-logo-circle.png" alt="" width={36} height={36} className="w-9 h-9 rounded-full" />
        <span className="text-xl font-black tracking-tight">NOOB</span>
      </div>
      <div className={card} role="status" aria-live="polite">{body}</div>
      {step !== 'ready' && step !== 'sending' && (
        <a href="/" className="mt-5 text-xs text-zinc-400 underline hover:text-white">Open NOOB</a>
      )}
    </div>
  );
};

export default LoginApprovalPage;
