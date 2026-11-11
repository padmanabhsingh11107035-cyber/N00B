import React, { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { getPublicForm, submitPublicForm, type PublicForm } from '../../services/formsApi';
import type { FunLocation } from '../../utils/funRoutes';
import type { User } from '../../types';
import { FormRenderer } from './FormRenderer';
import { FormsDashboard } from './FormsDashboard';
import { FormEditor } from './FormEditor';
import { FormResponses } from './FormResponses';
import './forms.css';

// NOOB Forms. /forms = my forms, /forms/<id> = the editor, /forms/<id>/responses = the answers, /f/<address> = the form itself, for anybody (no account needed).
interface Props {
  currentUser: User | null;
  location: FunLocation;
  onNavigate: (loc: FunLocation) => void;
  onBack: () => void;
  onHome: () => void;
  onLogin?: () => void;
}

const Page: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="frm-root fixed inset-0 edge-own z-[96] overflow-y-auto overflow-x-hidden overscroll-contain no-doodle">{children}</div>;

export const FormsHub: React.FC<Props> = ({ currentUser, location, onNavigate, onBack, onHome, onLogin }) => {
  if (location.feature === 'form') return <PublicFormPage slug={location.target ?? ''} signedIn={!!currentUser} onHome={onHome} onJoin={onLogin ?? onHome} />;
  if (!currentUser) {
    return <Page><div className="frm-center"><div className="frm-center-card"><span className="frm-empty-art"><FileText className="w-9 h-9" aria-hidden="true" /></span><p className="t">Log in to build forms.</p><p className="s">Forms are saved to your account, so only you and the people you invite can open them.</p><button type="button" onClick={onLogin ?? onBack} className="frm-btn primary">Log in</button></div></div></Page>;
  }
  if (location.target && location.sub === 'responses') return <Page><FormResponses formId={location.target} onBack={() => onNavigate({ feature: 'forms' })} /></Page>;
  if (location.target) return <Page><FormEditor formId={location.target} onBack={() => onNavigate({ feature: 'forms' })} onResponses={() => onNavigate({ feature: 'forms', target: location.target, sub: 'responses' })} /></Page>;
  return <Page><FormsDashboard meId={currentUser.id} onBack={onBack} onOpen={(id) => onNavigate({ feature: 'forms', target: id })} onResponses={(id) => onNavigate({ feature: 'forms', target: id, sub: 'responses' })} /></Page>;
};

const PublicFormPage: React.FC<{ slug: string; signedIn: boolean; onHome: () => void; onJoin: () => void }> = ({ slug, signedIn, onHome, onJoin }) => {
  const [form, setForm] = useState<PublicForm | null>(null);
  const [error, setError] = useState('');
  const load = () => { setError(''); getPublicForm(slug).then(setForm).catch((e) => setError(e instanceof Error ? e.message : 'This form could not be opened.')); };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [slug]);
  useEffect(() => { if (form?.title) { const old = document.title; document.title = form.title; return () => { document.title = old; }; } return undefined; }, [form?.title]);

  const utm = (): Record<string, string> | undefined => {
    try {
      const p = new URLSearchParams(window.location.search); const o: Record<string, string> = {};
      for (const k of ['source', 'medium', 'campaign']) { const v = p.get('utm_' + k); if (v) o[k] = v; }
      return Object.keys(o).length ? o : undefined;
    } catch { return undefined; }
  };
  const notice = (title: string, text: string, retry?: boolean) => (
    <Page>
      <div className="frm-page frm-notice">
        <div className="frm-bar"><div className="frm-bar-in"><button type="button" onClick={onHome} aria-label="Open the NOOB app" className="frm-noob">NOOB</button><span className="frm-sub flex-1 text-right">Forms by NOOB</span></div></div>
        <div className="frm-center"><div className="frm-center-card"><span className="frm-empty-art"><FileText className="w-9 h-9" aria-hidden="true" /></span><h1 className="t">{title}</h1><p className="s">{text}</p>{retry && <button type="button" onClick={load} className="frm-btn primary">Try again</button>}</div></div>
      </div>
    </Page>
  );
  if (error) return notice('Could not open this form', error, true);
  if (!form) return <Page><div className="frm-center"><div className="frm-center-card" role="status"><span className="frm-spinner" aria-hidden="true" /><p className="s">Opening the form…</p></div></div></Page>;
  if (form.state === 'notfound') return notice('Form not found', 'This link does not lead to a form, or the owner has taken it down.');
  if (form.state === 'notopen') return notice(form.title ?? 'Not open yet', 'This form is not open yet. Please come back later.');
  if (form.state === 'closed') return notice(form.title ?? 'Closed', form.settings?.closedMessage || 'This form is not taking answers any more.');
  return (
    <div className="fixed inset-0 edge-own z-[96] overflow-y-auto overscroll-contain frm-pub" data-testid="public-form">
      <FormRenderer
        form={{ id: form.id, title: form.title ?? '', description: form.description, questions: form.questions ?? [], theme: form.theme, settings: form.settings }}
        onSubmit={(answers) => submitPublicForm(slug, answers, form.settings?.collectCampaign ? utm() : undefined)}
        onOpenNoob={onHome}
        onJoin={signedIn ? undefined : onJoin}
      />
    </div>
  );
};

export default FormsHub;
