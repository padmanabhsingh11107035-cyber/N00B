import React, { useEffect } from 'react';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import './legal.css';

// The frame of every legal page (Terms, Privacy Policy, End-to-end encryption): one full screen of its own, like the reference design the owner chose. An arrow (back to the
// page before), "Help" (straight to Customer Support), a pink "Hello" card, one big rounded document card, and a single "Understood" button. It follows the app's dark /
// light theme (html[data-theme]), in a rose colour of its own. The page never changes size: a fixed top bar, one scrolling document, and a fixed bottom button.

export interface LegalSection {
  id: string;
  title: string;
  /** trusted, written-in-the-app html (never user text) */
  html: string;
  /** used by tests */
  testId?: string;
}

interface Props {
  title: string;
  meta: string;
  lead: string;
  sections: LegalSection[];
  ariaLabel: string;
  onClose: () => void;
  /** where "Help" goes when the page is not opened from inside the help desk: Customer Support (the app listens for noob-open-support) */
  onHelp?: () => void;
  agreeLabel?: string;
}

export const OPEN_SUPPORT_EVENT = 'noob-open-support';

export const LegalShell: React.FC<Props> = ({ title, meta, lead, sections, ariaLabel, onClose, onHelp, agreeLabel = 'Understood' }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Help: leave this page, then ask the app to open Customer Support (the page that is open when the person is logged in, or the login page's help chat when they are not)
  const help = () => {
    if (onHelp) { onHelp(); return; }
    onClose();
    window.setTimeout(() => window.dispatchEvent(new CustomEvent(OPEN_SUPPORT_EVENT)), 0);
  };

  return (
    <div className="lg-root" role="dialog" aria-modal="true" aria-label={ariaLabel} data-testid="legal-page">
      <header className="lg-bar">
        <button type="button" className="lg-back" onClick={onClose} aria-label="Back" data-testid="legal-back"><ArrowLeft /></button>
        <button type="button" className="lg-help" onClick={help} data-testid="legal-help">Help</button>
      </header>

      <div className="lg-scroll">
        <div className="lg-col">
          <div className="lg-hello" data-testid="legal-hello">
            <b>Hello <span aria-hidden="true">👋</span></b>
            <p>{lead}</p>
          </div>

          <article className="lg-doc">
            <h1>{title}</h1>
            <p className="lg-meta">{meta}</p>
            {sections.map((s, i) => (
              <section key={s.id} className="lg-sec" data-testid={s.testId}>
                <h2>{i + 1}. {s.title}</h2>
                <div className="lg-body" dangerouslySetInnerHTML={{ __html: s.html }} />
              </section>
            ))}
          </article>
        </div>
      </div>

      <footer className="lg-foot">
        <button type="button" onClick={onClose} data-testid="legal-understood"><CheckCircle2 />{agreeLabel}</button>
      </footer>
    </div>
  );
};
