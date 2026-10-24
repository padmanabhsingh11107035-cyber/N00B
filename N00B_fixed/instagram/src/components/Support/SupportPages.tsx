import React from 'react';
import { CheckCircle2, ChevronRight, FileText, Loader2, Search, ShieldAlert, ShieldCheck, User as UserIcon } from 'lucide-react';
import type { User } from '../../types';
import { CallTileIcon, ReportTileIcon, TicketTileIcon } from './SupportIcons';

// The other screens of the help desk, in the same look as the chat: Call us, FAQs, Report someone and Raise a ticket. They only draw what CustomerSupportModal hands them.

// ------------------------------------------------------------------ Call us
export const CallPage: React.FC<{ username: string; onStart: () => void }> = ({ username, onStart }) => (
  <div className="sd-page" data-testid="support-call-page">
    <div className="sd-hero">
      <CallTileIcon />
      <h2>Talk to NOOB support</h2>
      <p>A live voice call with the NOOB AI voice assistant. Say what is wrong and it answers out loud.</p>
    </div>
    <div className="sd-note">
      <b>How it works:</b> tap the green button, allow the microphone, and just speak. The call is connected to your account (@{username}). Nothing of it is kept as a chat log. If your phone cannot listen, you can type instead.
    </div>
    <button type="button" className="sd-btn green" style={{ width: '100%', flex: 'none' }} onClick={onStart} data-testid="support-start-call">Call now</button>
  </div>
);

// ------------------------------------------------------------------ FAQs
export const FaqPage: React.FC<{ faqs: Array<{ q: string; a: string }>; onOpenTerms?: () => void; onOpenPrivacy?: () => void }> = ({ faqs, onOpenTerms, onOpenPrivacy }) => (
  <div className="sd-page" data-testid="support-faq-page">
    <div className="sd-faq">
      {faqs.map((f) => (
        <details key={f.q}>
          <summary><span>{f.q}</span><ChevronRight /></summary>
          <div className="ans">{f.a}</div>
        </details>
      ))}
    </div>
    {(onOpenTerms || onOpenPrivacy) && (
      <div className="sd-links">
        {onOpenTerms && <button type="button" className="sd-link" onClick={onOpenTerms}><FileText />Terms &amp; Conditions<ChevronRight className="sd-chev" /></button>}
        {onOpenPrivacy && <button type="button" className="sd-link" onClick={onOpenPrivacy}><ShieldCheck />Privacy Policy<ChevronRight className="sd-chev" /></button>}
      </div>
    )}
  </div>
);

// ------------------------------------------------------------------ Report someone (Trust & Safety)
interface ReportProps {
  targetId: string; setTargetId: (v: string) => void;
  reason: string; setReason: (v: string) => void;
  details: string; setDetails: (v: string) => void;
  successMsg: string; errorMsg: string; clearError: () => void; submitting: boolean;
  searchOpen: boolean; setSearchOpen: (v: boolean) => void; searching: boolean; choices: User[]; onPick: (u: User) => void;
  fieldRef: React.RefObject<HTMLDivElement | null>;
  onSubmit: (e: React.FormEvent) => void;
  onAnother: () => void;
}

export const ReportPage: React.FC<ReportProps> = (p) => (
  <div className="sd-page" data-testid="support-report-page">
    <div className="sd-hero" style={{ paddingTop: 8 }}>
      <ReportTileIcon />
      <h2>Report someone</h2>
      <p>NOOB has zero tolerance for bullying, hate, threats, spam and fake accounts. Tell us who it is and the safety team will act, and the account is blocked for you at once.</p>
    </div>
    {p.successMsg ? (
      <div className="sd-done" data-testid="support-report-done">
        <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#1faa4b" /><path d="M14 25l7 7 13-15" fill="none" stroke="#fff" strokeWidth="4.200" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <h3>Action confirmed</h3>
        <p>{p.successMsg}</p>
        <button type="button" className="sd-btn ghost" onClick={p.onAnother}>Report another account</button>
      </div>
    ) : (
      <form className="sd-form" onSubmit={p.onSubmit}>
        {p.errorMsg && <div className="sd-alert" role="alert"><ShieldAlert /><span>{p.errorMsg}</span></div>}
        <div ref={p.fieldRef} style={{ position: 'relative' }}>
          <label className="sd-label" htmlFor="sd-report-who">Their @username or ID</label>
          <div className="sd-search">
            <Search />
            <input
              id="sd-report-who" type="text" required autoComplete="off" className="sd-input red" placeholder="Type or pick a name"
              value={p.targetId}
              onFocus={() => p.setSearchOpen(true)}
              onChange={(e) => { p.setTargetId(e.target.value); p.setSearchOpen(true); p.clearError(); }}
            />
          </div>
          {p.searchOpen && (
            <div className="sd-pop">
              {p.searching && p.choices.length === 0 ? (
                <p><Loader2 className="animate-spin" style={{ width: 16, height: 16, display: 'inline-block' }} /></p>
              ) : p.choices.length === 0 ? (
                <p>{p.targetId.trim() ? 'Nobody found.' : 'No accounts to show.'}</p>
              ) : p.choices.map((u) => (
                <button key={u.id} type="button" onClick={() => p.onPick(u)}>
                  {u.avatar ? <img src={u.avatar} alt="" /> : <span className="ph"><UserIcon style={{ width: 15, height: 15 }} /></span>}
                  <span><strong>{u.displayName || u.username}</strong><span>@{u.username}</span></span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="sd-label" htmlFor="sd-report-reason">What happened</label>
          <select id="sd-report-reason" className="sd-select red" value={p.reason} onChange={(e) => p.setReason(e.target.value)}>
            <option value="Cyber Bullying & Harassment">Cyber bullying &amp; harassment</option>
            <option value="Hate Speech & Toxicity">Hate speech &amp; toxicity</option>
            <option value="Threats & Intimidation">Threats &amp; intimidation</option>
            <option value="Spam & Scam">Spam &amp; scam</option>
            <option value="Impersonation">Impersonation</option>
          </select>
        </div>
        <div>
          <label className="sd-label" htmlFor="sd-report-details">Tell us more</label>
          <textarea id="sd-report-details" className="sd-area red" rows={4} required placeholder="Describe what happened..." value={p.details} onChange={(e) => p.setDetails(e.target.value)} />
        </div>
        <button type="submit" className="sd-btn red" disabled={!p.targetId.trim() || p.submitting} style={{ flex: 'none' }}>
          <ShieldAlert />{p.submitting ? 'Checking and sending...' : 'Report and block'}
        </button>
      </form>
    )}
  </div>
);

// ------------------------------------------------------------------ Raise a ticket (it goes to the NOOB team's Suggestion Box, where they answer it)
interface TicketProps {
  category: string; setCategory: (v: string) => void;
  subject: string; setSubject: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  sending: boolean; error: string; sent: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onAnother: () => void;
  onOpenBox?: () => void;
}

export const TicketPage: React.FC<TicketProps> = (p) => (
  <div className="sd-page" data-testid="support-ticket-page">
    <div className="sd-hero" style={{ paddingTop: 8 }}>
      <TicketTileIcon />
      <h2>Raise a ticket</h2>
      <p>Something we should look at? Write it down and the NOOB team will read it and reply.</p>
    </div>
    {p.sent ? (
      <div className="sd-done" data-testid="support-ticket-done">
        <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#1faa4b" /><path d="M14 25l7 7 13-15" fill="none" stroke="#fff" strokeWidth="4.200" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <h3>Ticket sent</h3>
        <p>The NOOB team has it. Their reply will show in the Suggestion Box (Home menu), where you can see all your earlier messages.</p>
        {p.onOpenBox && <button type="button" className="sd-btn line" onClick={p.onOpenBox}>Open the Suggestion Box</button>}
        <button type="button" className="sd-btn ghost" onClick={p.onAnother}>Raise another ticket</button>
      </div>
    ) : (
      <form className="sd-form" onSubmit={p.onSubmit}>
        {p.error && <div className="sd-alert" role="alert"><ShieldAlert /><span>{p.error}</span></div>}
        <div>
          <label className="sd-label" htmlFor="sd-ticket-cat">What is it about</label>
          <select id="sd-ticket-cat" className="sd-select" value={p.category} onChange={(e) => p.setCategory(e.target.value)}>
            <option>Terms &amp; Copyright Inquiries</option>
            <option>Account Security &amp; Bot Defense</option>
            <option>Media Upload &amp; Automated MIME Routing</option>
            <option>Mini-Games Score &amp; Leaderboard</option>
            <option>Music Hub Track Uploads</option>
            <option>Other / General Support</option>
          </select>
        </div>
        <div>
          <label className="sd-label" htmlFor="sd-ticket-subject">Subject</label>
          <input id="sd-ticket-subject" type="text" required maxLength={120} className="sd-input" placeholder="A few words about it" value={p.subject} onChange={(e) => p.setSubject(e.target.value)} />
        </div>
        <div>
          <label className="sd-label" htmlFor="sd-ticket-desc">Tell us more</label>
          <textarea id="sd-ticket-desc" required rows={5} maxLength={1500} className="sd-area" placeholder="Explain what is going on..." value={p.description} onChange={(e) => p.setDescription(e.target.value)} />
        </div>
        <button type="submit" className="sd-btn green" disabled={p.sending} style={{ flex: 'none' }}>
          {p.sending ? <><Loader2 className="animate-spin" />Sending...</> : <><CheckCircle2 />Send ticket</>}
        </button>
      </form>
    )}
  </div>
);

