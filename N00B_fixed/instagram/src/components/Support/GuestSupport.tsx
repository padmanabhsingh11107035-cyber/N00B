import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCheck, Loader2, Mail, Send, ShieldCheck, X } from 'lucide-react';
import './supportDesk.css';
import './guestSupport.css';
import { SupportHeader } from './SupportHub';
import { useFullPage } from '../../utils/fullPage';
import { useVisibleArea, visibleAreaStyle } from '../../utils/useVisualViewport';
import type { User } from '../../types';
import {
  askGuestSupportAssistant, guestSupportBegin, guestSupportCheckEmail, guestSupportCheckId, guestSupportClose, guestSupportRequestCode, guestSupportStatus, guestSupportVerifyCode
} from '../../services/api';
import {
  BLOCKED_TEXT, GUEST_USES, ISSUES, SAVED_KEY, UNAVAILABLE_TEXT, beginAnswer, browserId, codeAllowed, codeCheckAnswer, codeFromText, codeRequestAnswer, codeSentText, emailAnswer, findEmail, greeting,
  hideId, idAnswer, idPrompt, intentOf, isEmail, loadSaved, maskEmail, redact, type IssueKind, type SavedChat
} from './guestSupportLogic';

// The help chat on the LOGIN page, for people who are not logged in (see guestSupportLogic.ts for the words and the rules, and the "recover-account" function + migration 20261029000001 for the
// server side, which holds every limit and every secret). It asks for the email of the account, then the problem, then the User ID (or "I forgot my ID"); then the helper can email a
// 6-digit code and, when it is typed in the box that opens, logs the person in. What is typed is shown on the screen as typed, but only a hidden version of it (a***@g***.com, @an•••) is ever
// kept (while the tab is open) or sent to the helper's AI; the code is never kept anywhere.

/** `text` is what may be kept and sent on; `shown` (only when it differs) is what the person typed, on the screen and nowhere else */
interface Msg { id: string; from: 'bot' | 'user'; text: string; time: string; shown?: string }
type Step = 'email' | 'issue' | 'id' | 'chat';
type IdState = 'none' | 'matched' | 'forgot' | 'mismatch';

const time = (): string => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
/** the helper writes **bold** words: shown bold (as React text, never as html) */
function withBold(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*)/g).map((part, i) => (/^\*\*[^*\n]+\*\*$/.test(part) ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
}
const CODE_MINUTES = 10;
const COOLDOWN_MS = 45000;
/** after these answers nothing more can be done with the code box, so it is closed */
const PANEL_CLOSING = ['case_locked', 'bad_case', 'suspended', 'rate_limited'];

export const GuestSupport: React.FC<{ onClose: () => void; onLoggedIn: (user: User) => void }> = ({ onClose, onLoggedIn }) => {
  useFullPage(true);
  const visibleArea = useVisibleArea();
  const browser = useRef(browserId());
  const uid = useRef(0);
  const nid = (): string => `g${Date.now().toString(36)}${(uid.current++).toString(36)}`;

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [step, setStep] = useState<Step>('email');
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [ended, setEnded] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ready, setReady] = useState(false);
  const [remaining, setRemaining] = useState(GUEST_USES);
  const [email, setEmail] = useState('');                      // what was typed: only in this screen's memory
  const [masked, setMasked] = useState('');
  const [typedBad, setTypedBad] = useState(false);              // the last email had no account: the "I don't have an account yet" way is offered
  const [account, setAccount] = useState({ found: false, many: false, suspended: false });
  const [idState, setIdState] = useState<IdState>('none');
  const [chatCase, setChatCase] = useState<{ caseId: string; caseKey: string } | null>(null);
  const [emailIn, setEmailIn] = useState('');
  const [issueIn, setIssueIn] = useState('');
  const [idIn, setIdIn] = useState('');
  const [chatIn, setChatIn] = useState('');
  const [codeIn, setCodeIn] = useState('');
  const [otp, setOtp] = useState<{ open: boolean; sentAt: number | null; until: number; error: string | null; left: number }>({ open: false, sentAt: null, until: 0, error: null, left: 3 });
  const [tick, setTick] = useState(Date.now());
  const endRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const verifying = useRef(false);
  const done = useRef(false);

  const say = useCallback((text: string) => setMsgs((m) => [...m, { id: nid(), from: 'bot', text, time: time() }]), []);
  const hear = useCallback((text: string, shown?: string) => setMsgs((m) => [...m, { id: nid(), from: 'user', text, time: time(), ...(shown && shown !== text ? { shown } : {}) }]), []);

  // ---- starting: a chat that was open in this tab is taken up again (no new use is spent); else the browser's allowance is asked
  useEffect(() => {
    let alive = true;
    (async () => {
      let saved: SavedChat | null = null;
      try { saved = loadSaved(sessionStorage.getItem(SAVED_KEY)); } catch { /* storage blocked: a new chat */ }
      if (saved) {
        setChatCase({ caseId: saved.caseId, caseKey: saved.caseKey });
        setMasked(saved.masked); setAccount({ found: saved.accountFound, many: saved.many, suspended: saved.suspended }); setIdState(saved.idState); setRemaining(saved.remaining);
        setStep(saved.step === 'issue' ? 'chat' : saved.step); setMsgs(saved.messages);
        if (saved.codeSentAt && Date.now() - saved.codeSentAt < CODE_MINUTES * 60 * 1000) setOtp({ open: true, sentAt: saved.codeSentAt, until: saved.codeSentAt + COOLDOWN_MS, error: null, left: saved.sendsLeft });
        setReady(true);
        return;
      }
      const st = await guestSupportStatus(browser.current);
      if (!alive) return;
      if (st.status === 'limit_reached') { setBlocked(true); setRemaining(0); } else if (st.status === 'ok') {
        const left = Number(st.remaining ?? GUEST_USES);
        setRemaining(left);
        setMsgs([{ id: nid(), from: 'bot', text: greeting(left), time: time() }]);
      } else {
        setMsgs([{ id: nid(), from: 'bot', text: UNAVAILABLE_TEXT, time: time() }]);
      }
      setReady(true);
    })();
    return () => { alive = false; };
  }, []);

  // ---- what is remembered while this tab is open (never the email, never the code; the messages only in their hidden form)
  useEffect(() => {
    if (!chatCase || ended || done.current) return;
    const save: SavedChat = {
      v: 1, savedAt: Date.now(), caseId: chatCase.caseId, caseKey: chatCase.caseKey, masked, step: step === 'email' || step === 'issue' ? 'chat' : step, accountFound: account.found, many: account.many,
      suspended: account.suspended, idState, remaining, codeSentAt: otp.open ? otp.sentAt : null, sendsLeft: otp.left,
      messages: msgs.slice(-60).map((m) => ({ id: m.id, from: m.from, text: m.text, time: m.time }))
    };
    try { sessionStorage.setItem(SAVED_KEY, JSON.stringify(save)); } catch { /* storage full or blocked: the chat just does not survive a reload */ }
  }, [chatCase, masked, step, account, idState, remaining, otp, msgs, ended]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy, otp.open, step]);
  useEffect(() => { if (!otp.open) return; const t = window.setInterval(() => setTick(Date.now()), 1000); return () => window.clearInterval(t); }, [otp.open]);
  useEffect(() => { if (!confirmEnd) return; const t = window.setTimeout(() => setConfirmEnd(false), 4000); return () => window.clearTimeout(t); }, [confirmEnd]);
  const wait = Math.max(0, Math.ceil((otp.until - tick) / 1000));

  // ---- 1. the email
  const submitEmail = async (raw: string): Promise<void> => {
    const typed = findEmail(raw) || raw.trim();
    if (!typed || busy) return;
    setEmailIn('');
    if (!isEmail(typed)) { hear(redact(typed), typed); say(emailAnswer('invalid_email').text); return; }
    hear(maskEmail(typed), typed);
    setBusy(true);
    const res = await guestSupportCheckEmail(browser.current, typed);
    setBusy(false);
    if (res.status === 'limit_reached') { setBlocked(true); say(BLOCKED_TEXT); return; }
    if (res.status === 'found') {
      const m = res.maskedEmail || maskEmail(typed);
      setEmail(typed.toLowerCase()); setMasked(m); setTypedBad(false);
      setAccount({ found: true, many: res.many === true, suspended: res.suspended === true });
      say(emailAnswer('found', { masked: m, many: res.many === true, suspended: res.suspended === true }).text);
      setStep('issue');
      return;
    }
    if (res.status === 'no_account') { setEmail(typed.toLowerCase()); setTypedBad(true); }
    say(emailAnswer(res.status, { typed }).text);
  };
  const withoutAccount = (): void => {
    if (!email) return;
    hear("I don't have an account yet");
    setMasked(maskEmail(email)); setAccount({ found: false, many: false, suspended: false }); setTypedBad(false);
    say('No problem! I can still help you without logging in. What do you need help with? Pick one below or write it in your own words.');
    setStep('issue');
  };

  // ---- 2. the problem (this is the moment a use of the browser's 3 is spent)
  const submitIssue = async (text: string, kind: IssueKind): Promise<void> => {
    const typed = text.trim();
    if (busy) return;
    if (typed.length < 3) { say(beginAnswer('invalid_issue').text); return; }
    const issue = redact(typed);
    hear(issue, typed); setIssueIn('');
    setBusy(true);
    const res = await guestSupportBegin(browser.current, email, issue, kind);
    setBusy(false);
    const out = beginAnswer(res.status);
    if (!out.ok || !res.caseId || !res.caseKey) {
      if (res.status === 'limit_reached') setBlocked(true);
      say(out.text);
      return;
    }
    setChatCase({ caseId: res.caseId, caseKey: res.caseKey }); setRemaining(Number(res.remaining ?? 0));
    const found = res.accountFound === true;
    setAccount((a) => ({ ...a, found, many: res.many === true }));
    if (found) { say(idPrompt(res.many === true)); setStep('id'); }
    else { say('Thank you. There is no NOOB account with this email, so I can not log anyone in, but I can answer questions about NOOB and about creating an account. What would you like to know?'); setStep('chat'); }
  };

  // ---- 3. the User ID
  /** "I forgot my ID": true when the server accepted it (the code may then be asked for without the ID) */
  const forgotId = async (echo?: { text: string; shown?: string }, quiet = false): Promise<boolean> => {
    if (!chatCase || busy) return false;
    if (echo) hear(echo.text, echo.shown);
    setBusy(true);
    const res = await guestSupportCheckId(browser.current, chatCase, '', true);
    setBusy(false);
    if (!(quiet && res.status === 'forgot')) say(idAnswer(res.status, masked).text);   // quiet: the code is sent next, so no "Shall I send it?"
    if (res.status === 'forgot') { setIdState('forgot'); setStep('chat'); return true; }
    return false;
  };
  const submitId = async (raw: string): Promise<void> => {
    const t = raw.trim();
    if (!t || !chatCase || busy) return;
    setIdIn('');
    const intent = intentOf(t);
    if (intent === 'forgot_id') { await forgotId({ text: redact(t), shown: t }); return; }
    if (intent === 'code') {   // "send me the OTP" before any ID: that is the same as not having the ID
      hear(redact(t), t);
      if (account.many) { say(idAnswer('need_id', masked).text); return; }
      if (await forgotId(undefined, true)) await requestCode('forgot');
      return;
    }
    hear(hideId(t), t.startsWith('@') ? t : `@${t}`);
    setBusy(true);
    const res = await guestSupportCheckId(browser.current, chatCase, t, false);
    setBusy(false);
    say(idAnswer(res.status, masked).text);
    if (res.status === 'match') { setIdState('matched'); setStep('chat'); } else if (res.status === 'mismatch') setIdState('mismatch');
  };
  const skipId = (): void => { hear('Just answer my question'); setStep('chat'); say('Sure. Ask me anything about NOOB. If you want me to log you in later, just say "send me a code".'); };

  // ---- 4. the emailed code, and the box it is typed in
  const requestCode = async (idOverride?: IdState): Promise<void> => {
    if (!chatCase || busy) return;
    const ok = codeAllowed({ accountFound: account.found, many: account.many, idState: idOverride ?? idState, suspended: account.suspended });
    if (!ok.ok) {
      const why = ok.why === 'suspended' ? 'suspended' : ok.why === 'need_id' ? 'need_id' : ok.why === 'no_account' ? 'no_account' : 'id_required';
      say(codeRequestAnswer(why).text);
      if (why === 'need_id' || why === 'id_required') setStep('id');   // the ID step comes first
      return;
    }
    setBusy(true);
    const res = await guestSupportRequestCode(browser.current, chatCase);
    setBusy(false);
    if (res.status === 'sent') {
      const now = Date.now();
      setOtp({ open: true, sentAt: now, until: now + COOLDOWN_MS, error: null, left: Number(res.sendsLeft ?? 0) }); setCodeIn('');
      say(codeSentText(res.maskedEmail || masked, Number(res.sendsLeft ?? 0)));
      return;
    }
    if (res.status === 'cooldown') {
      const s = Math.max(1, Number(res.seconds) || 45);
      setOtp((o) => ({ ...o, open: true, sentAt: o.sentAt ?? Date.now(), until: Date.now() + s * 1000, error: null }));
    }
    say(codeRequestAnswer(res.status, res.seconds).text);
  };
  const verifyCode = useCallback(async (value: string, fromChat = false): Promise<void> => {
    if (!chatCase || verifying.current || value.length !== 6) return;
    verifying.current = true; setBusy(true); setOtp((o) => ({ ...o, error: null }));
    const res = await guestSupportVerifyCode(browser.current, chatCase, value);
    setBusy(false); verifying.current = false;
    if (res.status === 'ok' && res.user) {
      done.current = true;
      try { sessionStorage.removeItem(SAVED_KEY); } catch { /* nothing kept */ }
      say("✅ That's right! You're in. Logging you in now…");
      window.setTimeout(() => onLoggedIn(res.user as User), 700);
      return;
    }
    const out = codeCheckAnswer(res.status);
    setCodeIn('');
    setOtp((o) => ({ ...o, error: out.text.replace(/\*\*/g, ''), open: PANEL_CLOSING.includes(res.status) ? false : o.open }));
    if (out.fatal || fromChat) say(out.text);
    window.setTimeout(() => codeRef.current?.focus(), 60);
  }, [chatCase, onLoggedIn, say]);
  useEffect(() => { if (otp.open && codeIn.length === 6) void verifyCode(codeIn); }, [codeIn, otp.open, verifyCode]);

  // ---- 5. talking to the helper
  const sendChat = async (raw: string): Promise<void> => {
    const text = raw.trim();
    if (!text || busy || !chatCase) return;
    setChatIn('');
    const typedCode = otp.sentAt ? codeFromText(text) : null;
    if (typedCode) { hear('••••••'); await verifyCode(typedCode, true); return; }   // the code typed as a message works too (and is not kept)
    hear(redact(text), text);
    const other = findEmail(text);
    if (other && email && other !== email) { say(`I can only help with the email this chat started with (**${masked}**). To use another email, close this chat and open Help again.`); return; }
    const intent = intentOf(text);
    if (intent === 'forgot_id') {
      if (account.found && idState !== 'matched' && idState !== 'forgot') await forgotId();
      else say('You are already past that step. Say "send me a code" and I will email it.');
      return;
    }
    if (intent === 'code') { await requestCode(); return; }
    setBusy(true);
    const history = msgs.slice(-6).map((m) => ({ sender: m.from, text: m.text }));
    const res = await askGuestSupportAssistant(redact(text), history, { ...chatCase, browser: browser.current });
    setBusy(false);
    say(res.reply || UNAVAILABLE_TEXT);
  };

  const endChat = async (): Promise<void> => {
    if (!chatCase) return;
    if (!confirmEnd) { setConfirmEnd(true); return; }   // a second tap within 4 seconds ends it
    setConfirmEnd(false); setBusy(true);
    await guestSupportClose(browser.current, chatCase);
    setBusy(false);
    try { sessionStorage.removeItem(SAVED_KEY); } catch { /* nothing kept */ }
    setEnded(true); setOtp((o) => ({ ...o, open: false })); say('This chat has ended. Thank you for contacting NOOB Support! 💚');
  };

  const canCode = codeAllowed({ accountFound: account.found, many: account.many, idState, suspended: account.suspended }).ok;

  // Drawn straight into the page (not inside the login screen), so the login screen's dark form styles (.auth-v2 input / textarea) do not reach this chat
  return createPortal(
    <div className="fixed inset-0 z-50 sd-root" data-testid="guest-support-page">
      <div className="sd-stage" style={visibleAreaStyle(visibleArea)}>
        <div className="sd-panel">
          <SupportHeader
            title="NOOB Support"
            subtitle={blocked && !chatCase ? 'Guest help' : `Guest help · ${remaining} of ${GUEST_USES} left`}
            avatar="/noob-support-logo.png"
            onBack={onClose}
            closeIcon
            right={chatCase && !ended ? <button type="button" className="sd-head-link red" onClick={() => void endChat()} disabled={busy} data-testid="guest-end">{confirmEnd ? 'Tap again to end' : 'End chat'}</button> : undefined}
          />

          {blocked && !chatCase ? (
            <div className="gs-blocked" data-testid="guest-blocked" role="alert">
              <ShieldCheck />
              <h2>Guest help is used up</h2>
              <p>{BLOCKED_TEXT}</p>
              <button type="button" className="sd-btn green" onClick={onClose}>Back to log in</button>
            </div>
          ) : (
            <div className="sd-chat" data-testid="guest-chat">
              <div className="sd-thread" aria-live="polite" aria-relevant="additions text" data-testid="guest-thread">
                {msgs[0] && <div className="sd-day">Today, {msgs[0].time}</div>}
                {msgs.map((m) => {
                  const mine = m.from === 'user';
                  return (
                    <div key={m.id} className={`sd-msg ${mine ? 'me' : 'bot'}`} data-testid={mine ? 'guest-msg-user' : 'guest-msg-bot'}>
                      <div className="sd-bubble">
                        {!mine && <span className="sd-who">NoobBuddy</span>}
                        <div className="sd-text">{withBold(m.shown ?? m.text)}</div>
                      </div>
                      <div className="sd-meta"><span>{m.time}</span>{mine && <CheckCheck aria-label="Sent" />}</div>
                    </div>
                  );
                })}
                {busy && (
                  <div className="sd-msg bot" role="status" aria-label="NoobBuddy is typing"><div className="sd-bubble"><span className="sd-who">NoobBuddy</span><span className="sd-dots"><span /><span /><span /></span></div></div>
                )}
                {ended && <div className="sd-closed">This conversation has been closed</div>}
                <div ref={endRef} />
              </div>

              {!ready && <div className="sd-assist"><Loader2 className="animate-spin" style={{ width: 14, height: 14, display: 'inline', marginRight: 6 }} />Getting ready…</div>}

              {/* the box for the emailed code: it opens when the code has been sent */}
              {otp.open && !ended && (
                <div className="gs-otp" data-testid="guest-otp-panel" role="group" aria-label="Enter your code">
                  <div className="gs-otp-head"><ShieldCheck /><strong>Enter your code</strong><button type="button" className="gs-x" onClick={() => setOtp((o) => ({ ...o, open: false }))} aria-label="Hide the code box"><X /></button></div>
                  <p>I sent a 6-digit code to <b>{masked}</b>. Type it here to log in.</p>
                  <input
                    ref={codeRef} className="gs-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} value={codeIn} autoFocus
                    onChange={(e) => setCodeIn(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" aria-label="6-digit code" data-testid="guest-code-input" disabled={busy}
                  />
                  {otp.error && <p className="gs-error" role="alert" data-testid="guest-code-error">{otp.error}</p>}
                  <div className="gs-row">
                    <button type="button" className="sd-btn green" disabled={codeIn.length !== 6 || busy} onClick={() => void verifyCode(codeIn)} data-testid="guest-code-submit">{busy ? <Loader2 className="animate-spin" /> : 'Log me in'}</button>
                    <button type="button" className="sd-btn line" disabled={wait > 0 || busy} onClick={() => void requestCode()} data-testid="guest-code-resend">{wait > 0 ? `New code in ${wait}s` : 'Send a new code'}</button>
                  </div>
                </div>
              )}

              {/* what the person can do now: the bar at the bottom changes with the step */}
              {!ended && ready && (
                <div className="gs-dock" data-testid={`guest-step-${step}`}>
                  {step === 'email' && (
                    <>
                      {typedBad && <div className="gs-actions"><button type="button" className="sd-chip" onClick={withoutAccount} disabled={busy} data-testid="guest-no-account">I don&apos;t have an account yet</button></div>}
                      <form className="sd-composer" noValidate onSubmit={(e) => { e.preventDefault(); void submitEmail(emailIn); }}>
                        <div className="sd-field gs-field"><input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={254} value={emailIn} onChange={(e) => setEmailIn(e.target.value)} placeholder="Your email address" aria-label="Your email address" data-testid="guest-email-input" autoFocus /></div>
                        <button type="submit" className="sd-send" disabled={!emailIn.trim() || busy} aria-label="Continue" data-testid="guest-email-send"><Send /></button>
                      </form>
                    </>
                  )}
                  {step === 'issue' && (
                    <>
                      <div className="gs-actions" data-testid="guest-issues">
                        {ISSUES.filter((i) => i.text).map((i) => (<button key={i.kind} type="button" className="sd-chip" disabled={busy} onClick={() => void submitIssue(i.text, i.kind)}>{i.label}</button>))}
                      </div>
                      <form className="sd-composer" onSubmit={(e) => { e.preventDefault(); void submitIssue(issueIn, 'other'); }}>
                        <div className="sd-field gs-field"><textarea rows={1} maxLength={600} value={issueIn} onChange={(e) => setIssueIn(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submitIssue(issueIn, 'other'); } }} placeholder="Or describe the problem..." aria-label="Describe the problem" data-testid="guest-issue-input" /></div>
                        <button type="submit" className="sd-send" disabled={issueIn.trim().length < 3 || busy} aria-label="Send" data-testid="guest-issue-send"><Send /></button>
                      </form>
                    </>
                  )}
                  {step === 'id' && (
                    <>
                      <div className="gs-actions">
                        <button type="button" className="sd-chip" onClick={() => void forgotId({ text: 'I forgot my ID' })} disabled={busy || account.many} data-testid="guest-forgot-id">I forgot my ID</button>
                        <button type="button" className="sd-chip" onClick={skipId} disabled={busy} data-testid="guest-skip-id">Just answer my question</button>
                      </div>
                      <form className="sd-composer" onSubmit={(e) => { e.preventDefault(); void submitId(idIn); }}>
                        <div className="sd-field gs-field"><input type="text" autoCapitalize="none" autoCorrect="off" autoComplete="username" spellCheck={false} maxLength={41} value={idIn} onChange={(e) => setIdIn(e.target.value)} placeholder="Your User ID (@username)" aria-label="Your User ID" data-testid="guest-id-input" autoFocus /></div>
                        <button type="submit" className="sd-send" disabled={!idIn.trim() || busy} aria-label="Check my ID" data-testid="guest-id-send"><Send /></button>
                      </form>
                    </>
                  )}
                  {step === 'chat' && (
                    <>
                      {account.found && (
                        <div className="gs-actions" data-testid="guest-quick">
                          {canCode && <button type="button" className="sd-chip" onClick={() => void requestCode()} disabled={busy} data-testid="guest-send-code"><Mail style={{ width: 14, height: 14 }} />{otp.sentAt ? 'Email me a new code' : 'Email me a login code'}</button>}
                          {!canCode && !account.suspended && <button type="button" className="sd-chip" onClick={() => setStep('id')} disabled={busy} data-testid="guest-back-to-id">Verify my account</button>}
                          {otp.sentAt && !otp.open && <button type="button" className="sd-chip" onClick={() => setOtp((o) => ({ ...o, open: true }))} data-testid="guest-open-code">I have my code</button>}
                        </div>
                      )}
                      <form className="sd-composer" onSubmit={(e) => { e.preventDefault(); void sendChat(chatIn); }}>
                        <div className="sd-field gs-field"><textarea rows={1} maxLength={600} value={chatIn} onChange={(e) => setChatIn(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendChat(chatIn); } }} placeholder="Type a message... (try: send me a code)" aria-label="Your message" data-testid="guest-chat-input" /></div>
                        <button type="submit" className="sd-send" disabled={!chatIn.trim() || busy} aria-label="Send message" data-testid="guest-chat-send"><Send /></button>
                      </form>
                    </>
                  )}
                </div>
              )}
              {ended && <div className="sd-composer"><button type="button" className="sd-btn green" onClick={onClose}>Back to log in</button></div>}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
