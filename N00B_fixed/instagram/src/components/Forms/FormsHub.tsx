import React, { useEffect, useState } from 'react';
import { getPublicForm, submitPublicForm, type PublicForm } from '../../services/formsApi';
import type { FunLocation } from '../../utils/funRoutes';
import type { User } from '../../types';
import { FormRenderer } from './FormRenderer';
import { FormsDashboard } from './FormsDashboard';
import { FormEditor } from './FormEditor';
import { FormResponses } from './FormResponses';

// NOOB Forms. /forms = my forms, /forms/<id> = the editor, /forms/<id>/responses = the answers, /f/<address> = the form itself, for anybody (no account needed).
interface Props {
  currentUser: User | null;
  location: FunLocation;
  onNavigate: (loc: FunLocation) => void;
  onBack: () => void;
  onHome: () => void;
  onLogin?: () => void;
}

const Page: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="fixed inset-0 z-[96] overflow-y-auto overscroll-contain bg-black text-white">{children}</div>;

export const FormsHub: React.FC<Props> = ({ currentUser, location, onNavigate, onBack, onHome, onLogin }) => {
  if (location.feature === 'form') return <PublicFormPage slug={location.target ?? ''} signedIn={!!currentUser} onHome={onHome} onJoin={onLogin ?? onHome} />;
  if (!currentUser) {
    return <Page><div className="p-10 text-center space-y-3"><p className="font-semibold">Log in to build forms.</p><button type="button" onClick={onLogin ?? onBack} className="px-5 h-10 rounded-full bg-white text-black font-bold cursor-pointer">Log in</button></div></Page>;
  }
  if (location.target && location.sub === 'responses') return <Page><FormResponses formId={location.target} onBack={() => onNavigate({ feature: 'forms' })} /></Page>;
  if (location.target) return <Page><FormEditor formId={location.target} onBack={() => onNavigate({ feature: 'forms' })} onResponses={() => onNavigate({ feature: 'forms', target: location.target, sub: 'responses' })} /></Page>;
  return <Page><FormsDashboard onBack={onBack} onOpen={(id) => onNavigate({ feature: 'forms', target: id })} onResponses={(id) => onNavigate({ feature: 'forms', target: id, sub: 'responses' })} /></Page>;
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
      <div className="min-h-full flex flex-col">
        <div className="px-4 py-2.5 border-b border-zinc-800"><button type="button" onClick={onHome} aria-label="Open the NOOB app" className="px-3.5 py-1.5 rounded-full bg-white text-black text-sm font-black cursor-pointer">NOOB</button></div>
        <div className="flex-1 flex items-center justify-center p-6 text-center"><div className="max-w-sm space-y-3"><h1 className="text-xl font-bold">{title}</h1><p className="text-zinc-400">{text}</p>{retry && <button type="button" onClick={load} className="px-5 h-10 rounded-full bg-white text-black font-bold cursor-pointer">Try again</button>}</div></div>
      </div>
    </Page>
  );
  if (error) return notice('Could not open this form', error, true);
  if (!form) return <Page><div className="p-10 text-center text-zinc-400" role="status">Opening the form…</div></Page>;
  if (form.state === 'notfound') return notice('Form not found', 'This link does not lead to a form, or the owner has taken it down.');
  if (form.state === 'notopen') return notice(form.title ?? 'Not open yet', 'This form is not open yet. Please come back later.');
  if (form.state === 'closed') return notice(form.title ?? 'Closed', form.settings?.closedMessage || 'This form is not taking answers any more.');
  return (
    <div className="fixed inset-0 z-[96] overflow-y-auto overscroll-contain" data-testid="public-form">
      <FormRenderer
        form={{ title: form.title ?? '', description: form.description, questions: form.questions ?? [], theme: form.theme, settings: form.settings }}
        onSubmit={(answers) => submitPublicForm(slug, answers, form.settings?.collectCampaign ? utm() : undefined)}
        onOpenNoob={onHome}
        onJoin={signedIn ? undefined : onJoin}
      />
    </div>
  );
};

export default FormsHub;
