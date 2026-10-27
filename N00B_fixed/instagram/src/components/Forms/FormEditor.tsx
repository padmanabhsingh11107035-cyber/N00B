import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BarChart3, Download, ChevronDown, ChevronUp, Copy, Eye, GripVertical, Link2, Palette, Plus, Redo2, Settings as Cog, Share2, Trash2, Undo2, X } from 'lucide-react';
import { addCollaborator, addWebhook, aiCall, deleteWebhook, getForm, listCollaborators, listWebhooks, myRole, publishForm, removeCollaborator, saveDraft, sendWebhooksNow, setWebhook, updateMeta, formLink, type Collaborator, type Delivery, type FormRole, type FormRow, type Webhook } from '../../services/formsApi';
import {
  QTYPES, exportDefinition, THEMES, THEME_FONTS, blankQuestion, canScore, changeType, contrastRatio, hasOptions, isAnswerable, losesSettings, newId, publishProblems, resolveTheme,
  type FormDraft, type FormQuestion, type FormSettings, type FormTheme, type Presentation, type QType
} from '../../utils/forms';
import { FormRenderer } from './FormRenderer';

// The form editor: questions (add, edit, reorder with the mouse or with the arrow buttons, copy, delete, show-if rules), design (20 themes and your own colours), settings,
// sharing, and Publish. Every change is kept in a history (Undo / Redo) and saved by itself a moment after you stop typing. The saved copy is never overwritten by an old screen.

type Tab = 'questions' | 'design' | 'settings' | 'share';
type Save = 'saved' | 'saving' | 'offline' | 'failed' | 'conflict';
interface Snap { title: string; description: string; draft: FormDraft }

interface Props { formId: string; onBack: () => void; onResponses: () => void; onOpenPreview?: () => void }

export const FormEditor: React.FC<Props> = ({ formId, onBack, onResponses }) => {
  const [row, setRow] = useState<FormRow | null>(null);
  const [loadError, setLoadError] = useState('');
  const [state, setState] = useState<Snap | null>(null);
  const [tab, setTab] = useState<Tab>('questions');
  const [open, setOpen] = useState<string | null>(null);
  const [save, setSave] = useState<Save>('saved');
  const [preview, setPreview] = useState(false);
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [role, setRole] = useState<FormRole>('owner');
  useEffect(() => { void myRole(formId).then(setRole).catch(() => undefined); }, [formId]);
  const hist = useRef<{ past: Snap[]; future: Snap[]; at: number }>({ past: [], future: [], at: 0 });
  const known = useRef('');
  const dirty = useRef(false);
  const saving = useRef(false);
  const [, bump] = useState(0);

  useEffect(() => {
    let alive = true;
    getForm(formId).then((f) => {
      if (!alive) return;
      if (!f) { setLoadError('This form was not found.'); return; }
      setRow(f); known.current = f.updated_at; setState({ title: f.title, description: f.description, draft: normalise(f.draft) });
    }).catch((e) => alive && setLoadError(e instanceof Error ? e.message : 'Could not open this form.'));
    return () => { alive = false; };
  }, [formId]);

  const change = useCallback((fn: (s: Snap) => Snap, coalesce = false) => {
    setState((cur) => {
      if (!cur) return cur;
      const next = fn(cur);
      if (next === cur) return cur;
      const h = hist.current, now = Date.now();
      if (!coalesce || now - h.at > 800 || !h.past.length) { h.past.push(cur); if (h.past.length > 100) h.past.shift(); }
      h.at = now; h.future = []; dirty.current = true; setSave('saving'); bump((x) => x + 1);
      return next;
    });
  }, []);
  const undo = () => setState((cur) => { const h = hist.current; const prev = h.past.pop(); if (!cur || !prev) return cur; h.future.push(cur); dirty.current = true; setSave('saving'); bump((x) => x + 1); return prev; });
  const redo = () => setState((cur) => { const h = hist.current; const nxt = h.future.pop(); if (!cur || !nxt) return cur; h.past.push(cur); dirty.current = true; setSave('saving'); bump((x) => x + 1); return nxt; });

  // saving: a moment after the last change; a failed save is tried again, and the screen keeps everything meanwhile
  const flush = useCallback(async (): Promise<boolean> => {
    if (!state || !dirty.current || saving.current) return !dirty.current;
    saving.current = true; setSave('saving');
    const sent = state;
    try {
      if (!navigator.onLine) throw new Error('offline');
      const r = await saveDraft(formId, { title: sent.title.slice(0, 200), description: sent.description.slice(0, 2000), draft: sent.draft }, known.current);
      if (!r.ok) { setSave('conflict'); saving.current = false; return false; }
      known.current = r.updated_at;
      if (state === sent) dirty.current = false;
      setSave(dirty.current ? 'saving' : 'saved'); saving.current = false; return !dirty.current;
    } catch (e) { saving.current = false; setSave(!navigator.onLine ? 'offline' : 'failed'); return false; }
  }, [state, formId]);
  useEffect(() => {
    if (!state || !dirty.current || save === 'conflict') return;
    const t = window.setTimeout(() => { void flush(); }, save === 'failed' || save === 'offline' ? 5000 : 1000);
    return () => window.clearTimeout(t);
  }, [state, save, flush]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current) { e.preventDefault(); e.returnValue = ''; } };
    const online = () => { if (dirty.current) void flush(); };
    window.addEventListener('beforeunload', warn); window.addEventListener('online', online);
    return () => { window.removeEventListener('beforeunload', warn); window.removeEventListener('online', online); };
  }, [flush]);

  const leave = async (then: () => void) => { if (dirty.current) { const ok = await flush(); if (!ok && !window.confirm('Your latest changes are not saved yet. Leave anyway?')) return; } then(); };

  const publish = async () => {
    if (!state || !row) return;
    const p = publishProblems(state.title, state.draft);
    setProblems(p);
    if (p.length) { setTab('questions'); return; }
    setBusy(true);
    try {
      if (dirty.current && !(await flush())) { setNote('Your changes could not be saved, so the form was not published. Please try again.'); return; }
      const r = await publishForm(formId);
      if (!r.ok) { setProblems(r.problems ?? ['The form could not be published']); return; }
      const f = await getForm(formId);
      if (f) { setRow(f); known.current = f.updated_at; }
      setTab('share'); setNote('Published. Anyone with the link can fill it.');
    } catch (e) { setNote(e instanceof Error ? e.message : 'Could not publish.'); }
    finally { setBusy(false); }
  };
  const setStatus = async (status: 'published' | 'closed' | 'draft') => {
    if (!row) return; setBusy(true);
    try { await updateMeta(formId, { status }); const f = await getForm(formId); if (f) { setRow(f); known.current = f.updated_at; } setNote(status === 'closed' ? 'The form is closed: new answers are refused.' : status === 'published' ? 'The form is open again.' : 'The form is a draft again: the link shows "not found".'); }
    catch (e) { setNote(e instanceof Error ? e.message : 'Could not change the form.'); } finally { setBusy(false); }
  };

  if (loadError) return <div className="p-8 text-center"><p className="text-red-400 mb-3" role="alert">{loadError}</p><button type="button" onClick={onBack} className="px-4 py-2 rounded-full bg-zinc-800 cursor-pointer">Back to my forms</button></div>;
  if (!state || !row) return <div className="p-10 text-center text-zinc-400" role="status">Opening the form…</div>;
  if (role === 'viewer') return <div className="p-10 text-center space-y-3"><p className="font-semibold">You can see the answers of this form, not change it.</p><button type="button" onClick={onResponses} className="px-5 h-10 rounded-full bg-white text-black font-bold cursor-pointer">Open the answers</button> <button type="button" onClick={onBack} className="px-5 h-10 rounded-full border border-zinc-700 cursor-pointer">Back</button></div>;

  const { draft } = state;
  const qs = draft.questions;
  const setQs = (fn: (q: FormQuestion[]) => FormQuestion[], coalesce = false) => change((s) => ({ ...s, draft: { ...s.draft, questions: fn(s.draft.questions) } }), coalesce);
  const patchQ = (id: string, p: Partial<FormQuestion>, coalesce = true) => setQs((q) => q.map((x) => (x.id === id ? { ...x, ...p } : x)), coalesce);
  const move = (i: number, to: number) => setQs((q) => { if (to < 0 || to >= q.length) return q; const c = [...q]; const [m] = c.splice(i, 1); c.splice(to, 0, m); return c; });
  const addQ = (type: QType, at?: number) => { const q = blankQuestion(type); setQs((l) => { const c = [...l]; c.splice(at ?? c.length, 0, q); return c; }); setOpen(q.id); };
  const dup = (i: number) => setQs((l) => { const c = [...l]; const src = c[i]; const copy: FormQuestion = { ...src, id: newId(), options: src.options?.map((o) => ({ ...o, id: newId() })), title: src.title }; c.splice(i + 1, 0, copy); return c; });
  const del = (id: string) => setQs((l) => l.filter((q) => q.id !== id).map((q) => (q.showIf?.q === id ? { ...q, showIf: null } : q)));
  const setSettings = (p: Partial<FormSettings>) => change((s) => ({ ...s, draft: { ...s.draft, settings: { ...s.draft.settings, ...p } } }), true);
  const setTheme = (p: Partial<FormTheme>) => change((s) => ({ ...s, draft: { ...s.draft, theme: { ...s.draft.theme, ...p } } }), true);
  const unpublished = row.published ? JSON.stringify(row.published) !== JSON.stringify(draft) : true;
  const live = row.status === 'published' || row.status === 'closed';
  const saveText = { saved: 'Saved', saving: 'Saving…', offline: 'Offline: will save when you are back', failed: 'Not saved: trying again', conflict: 'Changed in another window' }[save];

  return (
    <div className="min-h-full text-white" data-testid="form-editor">
      <div className="sticky top-0 z-30 bg-zinc-900/95 backdrop-blur border-b border-zinc-800">
        <div className="max-w-3xl mx-auto px-3 pt-2.5 pb-2 flex items-center gap-2">
          <button type="button" onClick={() => void leave(onBack)} aria-label="Back to my forms" className="w-9 h-9 shrink-0 rounded-full border border-zinc-700 flex items-center justify-center cursor-pointer"><ArrowLeft className="w-4 h-4" /></button>
          <input value={state.title} onChange={(e) => change((s) => ({ ...s, title: e.target.value }), true)} maxLength={200} aria-label="Form title" className="flex-1 min-w-0 bg-transparent text-base font-bold outline-none focus-visible:ring-2 ring-white/40 rounded px-1" />
          <span className={`hidden sm:inline text-[11px] ${save === 'saved' ? 'text-zinc-400' : save === 'saving' ? 'text-zinc-300' : 'text-amber-300'}`} role="status" data-testid="form-save-state">{saveText}</span>
          <button type="button" onClick={undo} disabled={!hist.current.past.length} aria-label="Undo" className="w-9 h-9 rounded-full border border-zinc-700 flex items-center justify-center disabled:opacity-35 cursor-pointer"><Undo2 className="w-4 h-4" /></button>
          <button type="button" onClick={redo} disabled={!hist.current.future.length} aria-label="Redo" className="w-9 h-9 rounded-full border border-zinc-700 flex items-center justify-center disabled:opacity-35 cursor-pointer"><Redo2 className="w-4 h-4" /></button>
          <button type="button" onClick={() => { const u = URL.createObjectURL(new Blob([exportDefinition(state.title, state.description, draft)], { type: 'application/json' })); const a = document.createElement('a'); a.href = u; a.download = `${state.title.replace(/[^\w-]+/g, '-').slice(0, 40) || 'form'}.noobform.json`; document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(u), 1000); }} aria-label="Save the form as a file" title="Save the form as a file" className="hidden sm:flex w-9 h-9 rounded-full border border-zinc-700 items-center justify-center cursor-pointer"><Download className="w-4 h-4" /></button>
          <button type="button" onClick={() => setPreview(true)} aria-label="Preview" className="w-9 h-9 rounded-full border border-zinc-700 flex items-center justify-center cursor-pointer"><Eye className="w-4 h-4" /></button>
          <button type="button" onClick={() => void publish()} disabled={busy} className="px-4 h-9 rounded-full bg-white text-black text-sm font-bold cursor-pointer disabled:opacity-60" data-testid="form-publish">{live && !unpublished ? 'Published' : live ? 'Publish changes' : 'Publish'}</button>
        </div>
        <div className="max-w-3xl mx-auto px-3 pb-2 flex gap-1.5 overflow-x-auto no-scrollbar" role="tablist">
          {([['questions', 'Questions', null], ['design', 'Design', Palette], ['settings', 'Settings', Cog], ['share', 'Share', Share2]] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`h-8 px-3.5 rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${tab === id ? 'bg-white text-black' : 'border border-zinc-700 text-zinc-300'}`}>{Icon && <Icon className="w-3.5 h-3.5" />}{label}</button>))}
          {row.response_count > 0 || live ? <button type="button" onClick={() => void leave(onResponses)} className="h-8 px-3.5 rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap border border-zinc-700 text-zinc-300 cursor-pointer"><BarChart3 className="w-3.5 h-3.5" />Responses ({row.response_count})</button> : null}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-3 py-4 pb-28 space-y-3">
        {save === 'conflict' && <div role="alert" className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-200 text-sm">This form was changed in another window, so this screen stopped saving to protect it. <button type="button" className="underline font-bold cursor-pointer" onClick={() => window.location.reload()}>Reload</button> to get the newest version.</div>}
        {note && <div role="status" className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-sm flex justify-between gap-2"><span>{note}</span><button type="button" aria-label="Dismiss" onClick={() => setNote('')} className="cursor-pointer"><X className="w-4 h-4" /></button></div>}
        {problems.length > 0 && <div role="alert" className="p-3 rounded-xl bg-red-500/10 border border-red-500/40 text-red-200 text-sm"><p className="font-bold mb-1">Fix these before publishing:</p><ul className="list-disc pl-5">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul></div>}

        {tab === 'questions' && (
          <>
            <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-2" style={{ borderTop: `6px solid ${resolveTheme(draft.theme).primary}` }}>
              <input value={state.title} onChange={(e) => change((s) => ({ ...s, title: e.target.value }), true)} maxLength={200} aria-label="Title" className="w-full bg-transparent text-2xl font-bold outline-none border-b border-transparent focus:border-zinc-600" />
              <textarea value={state.description} onChange={(e) => change((s) => ({ ...s, description: e.target.value }), true)} maxLength={2000} rows={2} placeholder="Form description" aria-label="Form description" className="w-full bg-transparent text-sm text-zinc-300 outline-none resize-y border-b border-transparent focus:border-zinc-600" />
            </div>
            {qs.map((q, i) => (
              <QuestionCard key={q.id} q={q} i={i} all={qs} count={qs.length} quiz={!!draft.settings.quiz?.enabled} open={open === q.id} onOpen={() => setOpen(open === q.id ? null : q.id)}
                onPatch={(p) => patchQ(q.id, p)} onChangeType={(t) => { if (losesSettings(q, t) && !window.confirm('Changing the type removes settings that do not fit the new type (the options). Continue?')) return; setQs((l) => l.map((x) => (x.id === q.id ? changeType(x, t) : x)), false); }}
                onUp={() => move(i, i - 1)} onDown={() => move(i, i + 1)} onDup={() => dup(i)} onDel={() => del(q.id)} onDrop={(from) => move(from, i)} />
            ))}
            <AddBar onAdd={(t) => addQ(t)} />
            <AiReview qs={qs} />
          </>
        )}

        {tab === 'design' && <DesignTab theme={draft.theme} onTheme={setTheme} onReset={() => change((s) => ({ ...s, draft: { ...s.draft, theme: { id: s.draft.theme.id } } }))} onPickTheme={(id) => change((s) => ({ ...s, draft: { ...s.draft, theme: { id } } }))} preview={<div className="max-h-[430px] overflow-auto rounded-2xl border border-zinc-800"><FormRenderer form={{ title: state.title, description: state.description, questions: qs, theme: draft.theme, settings: draft.settings }} preview onSubmit={async () => ({ ok: true })} /></div>} />}
        {tab === 'settings' && <SettingsTab s={draft.settings} onChange={setSettings} />}
        {tab === 'share' && <ShareTab row={row} role={role} unpublished={unpublished} busy={busy} onPublish={() => void publish()} onStatus={(st) => void setStatus(st)} />}
      </div>

      {preview && (
        <div className="fixed inset-0 z-[120] bg-black/80 flex flex-col" role="dialog" aria-modal="true" aria-label="Preview">
          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-zinc-900">
            <div className="flex gap-1.5">{(['desktop', 'tablet', 'mobile'] as const).map((d) => <button key={d} type="button" onClick={() => setDevice(d)} className={`px-3 h-8 rounded-full text-xs font-bold capitalize cursor-pointer ${device === d ? 'bg-white text-black' : 'border border-zinc-700'}`}>{d}</button>)}</div>
            <button type="button" onClick={() => setPreview(false)} aria-label="Close preview" className="w-9 h-9 rounded-full border border-zinc-700 flex items-center justify-center cursor-pointer"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-auto flex justify-center p-3">
            <div className="w-full overflow-auto rounded-xl" style={{ maxWidth: device === 'mobile' ? 390 : device === 'tablet' ? 768 : 1000 }}>
              <FormRenderer key={JSON.stringify(draft).length} form={{ title: state.title, description: state.description, questions: qs, theme: draft.theme, settings: draft.settings }} preview onSubmit={async () => ({ ok: true })} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const normalise = (d: FormDraft | null | undefined): FormDraft => ({ questions: Array.isArray(d?.questions) ? d!.questions : [], settings: d?.settings ?? {}, theme: d?.theme ?? { id: 'classic' } });

const inp = 'w-full bg-zinc-800/70 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus-visible:ring-2 ring-white/40';
const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <label className="block text-xs font-semibold text-zinc-300 space-y-1"><span>{label}</span>{children}</label>;

const AddBar: React.FC<{ onAdd: (t: QType) => void }> = ({ onAdd }) => {
  const [open, setOpen] = useState(false);
  const groups = [...new Set(QTYPES.map((t) => t.group))];
  return (
    <div className="rounded-2xl border border-dashed border-zinc-700 p-3">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid="form-add-question" className="w-full flex items-center justify-center gap-2 py-2 font-bold cursor-pointer"><Plus className="w-4 h-4" />Add question</button>
      {open && <div className="mt-2 space-y-3">{groups.map((g) => <div key={g}><p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">{g}</p><div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">{QTYPES.filter((t) => t.group === g).map((t) => <button key={t.type} type="button" onClick={() => { onAdd(t.type); setOpen(false); }} className="text-left px-3 py-2 rounded-lg bg-zinc-800/70 hover:bg-zinc-700 cursor-pointer"><span className="block text-sm font-semibold">{t.label}</span><span className="block text-[11px] text-zinc-400">{t.hint}</span></button>)}</div></div>)}</div>}
    </div>
  );
};

interface QCProps { q: FormQuestion; i: number; all: FormQuestion[]; count: number; quiz: boolean; open: boolean; onOpen: () => void; onPatch: (p: Partial<FormQuestion>) => void; onChangeType: (t: QType) => void; onUp: () => void; onDown: () => void; onDup: () => void; onDel: () => void; onDrop: (from: number) => void }
const QuestionCard: React.FC<QCProps> = ({ q, i, all, count, quiz, open, onOpen, onPatch, onChangeType, onUp, onDown, onDup, onDel, onDrop }) => {
  const label = QTYPES.find((t) => t.type === q.type)?.label ?? q.type;
  const earlier = all.slice(0, i).filter((x) => isAnswerable(x.type));
  const dep = earlier.find((x) => x.id === q.showIf?.q);
  const setOpt = (id: string, text: string) => onPatch({ options: q.options?.map((o) => (o.id === id ? { ...o, label: text } : o)) });
  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800" draggable={open ? false : true} onDragStart={(e) => e.dataTransfer.setData('text/plain', String(i))} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const f = Number(e.dataTransfer.getData('text/plain')); if (Number.isInteger(f)) onDrop(f); }} data-testid="form-question-card">
      <div className="flex items-center gap-1.5 px-2 pt-2">
        <GripVertical className="w-4 h-4 text-zinc-600 shrink-0 cursor-grab" aria-hidden="true" />
        <button type="button" onClick={onOpen} aria-expanded={open} className="flex-1 min-w-0 text-left px-1 py-2 cursor-pointer"><span className="block font-semibold truncate">{q.title || 'Untitled'}{q.required && <span className="text-red-400"> *</span>}</span><span className="block text-[11px] text-zinc-400">{label}{q.showIf ? ' · shown only if…' : ''}</span></button>
        <button type="button" onClick={onUp} disabled={i === 0} aria-label="Move up" className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-30 cursor-pointer"><ChevronUp className="w-4 h-4" /></button>
        <button type="button" onClick={onDown} disabled={i === count - 1} aria-label="Move down" className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-30 cursor-pointer"><ChevronDown className="w-4 h-4" /></button>
      </div>
      {open && (
        <div className="p-4 pt-2 space-y-3">
          <Row label={q.type === 'section' ? 'Page title' : 'Question'}><input value={q.title} onChange={(e) => onPatch({ title: e.target.value })} maxLength={300} className={inp} data-testid="q-title" /></Row>
          {q.type !== 'section' && q.type !== 'hidden' && <AiTools q={q} onPatch={onPatch} />}
          <Row label="Description (optional)"><input value={q.description ?? ''} onChange={(e) => onPatch({ description: e.target.value })} maxLength={600} className={inp} /></Row>
          <div className="grid grid-cols-2 gap-3">
            <Row label="Type"><select value={q.type} onChange={(e) => onChangeType(e.target.value as QType)} className={inp}>{QTYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}</select></Row>
            {isAnswerable(q.type) && <label className="flex items-end gap-2 pb-2 text-sm font-semibold cursor-pointer"><input type="checkbox" checked={!!q.required} onChange={(e) => onPatch({ required: e.target.checked })} className="w-4 h-4" />Required</label>}
          </div>
          {hasOptions(q.type) && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-zinc-300">Options</p>
              {q.options?.map((o, k) => (
                <div key={o.id} className="flex items-center gap-1.5">
                  <input value={o.label} onChange={(e) => setOpt(o.id, e.target.value)} maxLength={200} aria-label={`Option ${k + 1}`} className={inp} />
                  {q.type === 'image_choice' && <input value={o.img ?? ''} onChange={(e) => onPatch({ options: q.options?.map((x) => (x.id === o.id ? { ...x, img: e.target.value.trim() } : x)) })} maxLength={500} placeholder="Picture link (https://…)" aria-label={`Picture of option ${k + 1}`} className={inp} />}
                  <button type="button" aria-label="Move option up" disabled={k === 0} onClick={() => { const c = [...(q.options ?? [])]; [c[k - 1], c[k]] = [c[k], c[k - 1]]; onPatch({ options: c }); }} className="w-8 h-8 shrink-0 flex items-center justify-center disabled:opacity-30 cursor-pointer"><ChevronUp className="w-4 h-4" /></button>
                  <button type="button" aria-label="Move option down" disabled={k === (q.options?.length ?? 0) - 1} onClick={() => { const c = [...(q.options ?? [])]; [c[k + 1], c[k]] = [c[k], c[k + 1]]; onPatch({ options: c }); }} className="w-8 h-8 shrink-0 flex items-center justify-center disabled:opacity-30 cursor-pointer"><ChevronDown className="w-4 h-4" /></button>
                  <button type="button" aria-label="Delete option" onClick={() => onPatch({ options: q.options?.filter((x) => x.id !== o.id) })} className="w-8 h-8 shrink-0 flex items-center justify-center text-zinc-400 hover:text-red-400 cursor-pointer"><X className="w-4 h-4" /></button>
                </div>))}
              <div className="flex flex-wrap gap-3 items-center">
                <button type="button" onClick={() => onPatch({ options: [...(q.options ?? []), { id: newId(), label: `Option ${(q.options?.length ?? 0) + 1}` }] })} className="text-sm font-bold underline cursor-pointer">Add option</button>
                <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={!!q.allowOther} onChange={(e) => onPatch({ allowOther: e.target.checked })} />Add "Other"</label>
              </div>
            </div>)}
          {(['short', 'paragraph', 'number', 'checkboxes', 'scale', 'rating', 'heart'] as QType[]).includes(q.type) && (
            <div className="grid grid-cols-2 gap-3">
              <Row label={q.type === 'short' || q.type === 'paragraph' ? 'Fewest characters' : q.type === 'checkboxes' ? 'Choose at least' : q.type === 'number' ? 'Smallest number' : 'From'}><input type="number" value={q.min ?? ''} onChange={(e) => onPatch({ min: e.target.value === '' ? undefined : Number(e.target.value) })} className={inp} /></Row>
              <Row label={q.type === 'short' || q.type === 'paragraph' ? 'Most characters' : q.type === 'checkboxes' ? 'Choose at most' : q.type === 'number' ? 'Largest number' : 'To'}><input type="number" value={q.max ?? ''} onChange={(e) => onPatch({ max: e.target.value === '' ? undefined : Number(e.target.value) })} className={inp} /></Row>
            </div>)}
          {(q.type === 'scale' || q.type === 'nps') && <div className="grid grid-cols-2 gap-3"><Row label="Label at the low end"><input value={q.minLabel ?? ''} onChange={(e) => onPatch({ minLabel: e.target.value })} maxLength={40} className={inp} /></Row><Row label="Label at the high end"><input value={q.maxLabel ?? ''} onChange={(e) => onPatch({ maxLabel: e.target.value })} maxLength={40} className={inp} /></Row></div>}
          {q.type === 'image_choice' && <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={!!q.multi} onChange={(e) => onPatch({ multi: e.target.checked, correct: undefined })} />People can pick more than one picture</label>}
          {q.type === 'ranking' && <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={!!q.partial} onChange={(e) => onPatch({ partial: e.target.checked })} />People may rank only some of the options</label>}
          {q.type === 'grid' && <GridEditor q={q} onPatch={onPatch} />}
          {q.type === 'file_upload' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Row label="Accepted kinds (pdf,png,jpg; empty = any)"><input value={q.accept ?? ''} onChange={(e) => onPatch({ accept: e.target.value.replace(/[^A-Za-z0-9,]/g, '').slice(0, 80) })} className={inp} /></Row>
              <Row label="Most files"><input type="number" min={1} max={10} value={q.max ?? 3} onChange={(e) => onPatch({ max: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })} className={inp} /></Row>
              <Row label="Biggest file (MB, 10 at most)"><input type="number" min={1} max={10} value={q.maxSizeMb ?? 10} onChange={(e) => onPatch({ maxSizeMb: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })} className={inp} /></Row>
              <p className="sm:col-span-3 text-xs text-zinc-400">Files are private: only you and the people you share the form with can open them.</p>
            </div>)}
          {q.type === 'hidden' && <Row label="Link parameter: a link ending in ?ref=abc fills this field with abc (people never see it)"><input value={q.param ?? ''} onChange={(e) => onPatch({ param: e.target.value.replace(/[^A-Za-z0-9_]/g, '').slice(0, 30) })} className={inp} /></Row>}
          {q.type === 'calculated' && <Row label="Formula. #1, #2 … are the answers of the 1st, 2nd … question (numbers). For example (#1 + #2) * 2"><input value={q.formula ?? ''} onChange={(e) => onPatch({ formula: e.target.value.slice(0, 200) })} className={inp} /></Row>}
          {quiz && canScore(q.type) && <QuizFields q={q} onPatch={onPatch} />}
          {isAnswerable(q.type) && q.type !== 'hidden' && <EndRule q={q} onPatch={onPatch} />}
          {q.type !== 'section' && (
            <div className="rounded-xl border border-zinc-800 p-3 space-y-2">
              <p className="text-xs font-semibold text-zinc-300">Show this only if…</p>
              {earlier.length === 0 ? <p className="text-xs text-zinc-500">Add a question above this one to use it in a rule.</p> : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select aria-label="Question" value={q.showIf?.q ?? ''} onChange={(e) => onPatch({ showIf: e.target.value ? { q: e.target.value, op: 'notEmpty' } : null })} className={inp}><option value="">Always show</option>{earlier.map((x) => <option key={x.id} value={x.id}>{x.title || 'Untitled'}</option>)}</select>
                  {q.showIf && <select aria-label="Condition" value={q.showIf.op} onChange={(e) => onPatch({ showIf: { ...q.showIf!, op: e.target.value as never } })} className={inp}>{[['eq', 'is'], ['neq', 'is not'], ['contains', 'contains'], ['notEmpty', 'is answered'], ['empty', 'is empty'], ['gt', 'is more than'], ['lt', 'is less than']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
                  {q.showIf && !['empty', 'notEmpty'].includes(q.showIf.op) && (dep && hasOptions(dep.type)
                    ? <select aria-label="Value" value={String(q.showIf.value ?? '')} onChange={(e) => onPatch({ showIf: { ...q.showIf!, value: e.target.value } })} className={inp}><option value="">Choose…</option>{dep.options?.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
                    : <input aria-label="Value" value={String(q.showIf.value ?? '')} onChange={(e) => onPatch({ showIf: { ...q.showIf!, value: ['gt', 'lt'].includes(q.showIf!.op) || ['scale', 'rating', 'nps', 'number'].includes(dep?.type ?? '') ? Number(e.target.value) : e.target.value } })} className={inp} />)}
                </div>)}
            </div>)}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onDup} className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full border border-zinc-700 text-sm cursor-pointer"><Copy className="w-4 h-4" />Duplicate</button>
            <button type="button" onClick={onDel} className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full border border-red-500/50 text-red-300 text-sm cursor-pointer" data-testid="q-delete"><Trash2 className="w-4 h-4" />Delete</button>
          </div>
        </div>)}
    </div>
  );
};

const AiTools: React.FC<{ q: FormQuestion; onPatch: (p: Partial<FormQuestion>) => void }> = ({ q, onPatch }) => {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const text = async (mode: 'rewrite' | 'simplify' | 'translate') => {
    const language = mode === 'translate' ? window.prompt('Translate into which language?', 'Hindi') : undefined;
    if (mode === 'translate' && !language) return;
    setBusy(mode); setErr('');
    try { const r = await aiCall<{ text: string }>({ action: 'improve', text: q.title, mode, language }); if (r.text) onPatch({ title: r.text }); }
    catch (e) { setErr(e instanceof Error ? e.message : 'The AI helper could not answer.'); } finally { setBusy(''); }
  };
  const options = async () => {
    setBusy('options'); setErr('');
    try { const r = await aiCall<{ options: string[] }>({ action: 'options', question: q.title, count: 5 }); if (r.options.length) onPatch({ options: [...(q.options ?? []), ...r.options.map((label) => ({ id: newId(), label }))] }); }
    catch (e) { setErr(e instanceof Error ? e.message : 'The AI helper could not answer.'); } finally { setBusy(''); }
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-zinc-400">AI:</span>
      {([['rewrite', 'Rewrite'], ['simplify', 'Simplify'], ['translate', 'Translate']] as const).map(([m, l]) => <button key={m} type="button" disabled={!!busy || !q.title.trim()} onClick={() => void text(m)} className="px-2.5 h-7 rounded-full border border-emerald-400/40 text-emerald-300 font-bold disabled:opacity-40 cursor-pointer">{busy === m ? '…' : l}</button>)}
      {(q.type === 'multiple_choice' || q.type === 'checkboxes' || q.type === 'dropdown') && <button type="button" disabled={!!busy || !q.title.trim()} onClick={() => void options()} className="px-2.5 h-7 rounded-full border border-emerald-400/40 text-emerald-300 font-bold disabled:opacity-40 cursor-pointer">{busy === 'options' ? '…' : 'Suggest options'}</button>}
      {err && <span role="alert" className="text-red-300 w-full">{err}</span>}
      <span className="w-full text-[11px] text-zinc-500">Only this question's words are sent to an AI service when you press one of these.</span>
    </div>
  );
};

const AiReview: React.FC<{ qs: FormQuestion[] }> = ({ qs }) => {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<{ issues: Array<{ question: number; problem: string; suggestion: string }>; advice: string } | null>(null);
  const go = async () => {
    setBusy(true); setErr('');
    try { setRes(await aiCall({ action: 'review', questions: qs.filter((q) => isAnswerable(q.type)).map((q) => ({ title: q.title, type: q.type })) })); }
    catch (e) { setErr(e instanceof Error ? e.message : 'The AI helper could not answer.'); } finally { setBusy(false); }
  };
  const real = qs.filter((q) => isAnswerable(q.type));
  return (
    <div className="rounded-2xl border border-zinc-800 p-4 space-y-2">
      <button type="button" disabled={busy || real.length < 2} onClick={() => void go()} className="px-4 h-9 rounded-full border border-emerald-400/40 text-emerald-300 text-sm font-bold disabled:opacity-40 cursor-pointer">{busy ? 'Reading your form…' : 'Check my form with AI'}</button>
      <p className="text-[11px] text-zinc-500">Finds unclear, leading, double or repeated questions. The titles of your questions are sent to an AI service when you press this.</p>
      {err && <p role="alert" className="text-sm text-red-300">{err}</p>}
      {res && (<div className="space-y-2 text-sm">{res.issues.length === 0 ? <p>No problems found.</p> : <ul className="space-y-2">{res.issues.map((i, k) => <li key={k} className="rounded-lg bg-zinc-800/60 p-2"><b>{real[i.question - 1]?.title ?? `Question ${i.question}`}</b><br />{i.problem}<br /><span className="text-emerald-300">Try: {i.suggestion}</span></li>)}</ul>}{res.advice && <p className="text-zinc-300">{res.advice}</p>}</div>)}
    </div>
  );
};

const PeoplePanel: React.FC<{ formId: string }> = ({ formId }) => {
  const [people, setPeople] = useState<Collaborator[] | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [err, setErr] = useState('');
  const load = useCallback(() => { listCollaborators(formId).then(setPeople).catch((e) => setErr(e instanceof Error ? e.message : 'Could not load the people.')); }, [formId]);
  useEffect(() => { load(); }, [load]);
  const add = async () => { setErr(''); try { await addCollaborator(formId, name, role); setName(''); load(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not add this person.'); } };
  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3" data-testid="form-people">
      <p className="font-bold">Work on it together</p>
      <p className="text-xs text-zinc-400">An editor changes the questions and the design and can publish. A viewer only reads the answers. Only you can close, delete or share the form.</p>
      <div className="flex flex-wrap gap-2"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Their NOOB User ID" aria-label="User ID" className={inp + ' flex-1 min-w-[10rem]'} /><select value={role} onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')} aria-label="Role" className={inp + ' w-32'}><option value="editor">Editor</option><option value="viewer">Viewer</option></select><button type="button" disabled={!name.trim()} onClick={() => void add()} className="px-4 h-10 rounded-lg bg-white text-black text-sm font-bold disabled:opacity-40 cursor-pointer">Add</button></div>
      {err && <p role="alert" className="text-sm text-red-300">{err}</p>}
      {people && people.length > 0 && <ul className="space-y-1">{people.map((p) => <li key={p.user_id} className="flex items-center gap-2 text-sm"><span className="flex-1 min-w-0 truncate">@{p.username}</span><span className="text-xs text-zinc-400 capitalize">{p.role}</span><button type="button" aria-label={`Remove ${p.username}`} onClick={() => void removeCollaborator(formId, p.user_id).then(load).catch((e) => setErr(e instanceof Error ? e.message : 'Could not remove.'))} className="p-1 text-zinc-400 hover:text-red-400 cursor-pointer"><X className="w-4 h-4" /></button></li>)}</ul>}
    </div>
  );
};

const WebhookPanel: React.FC<{ formId: string }> = ({ formId }) => {
  const [data, setData] = useState<{ hooks: Webhook[]; deliveries: Delivery[] } | null>(null);
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [shown, setShown] = useState('');
  const load = useCallback(() => { listWebhooks(formId).then(setData).catch((e) => setErr(e instanceof Error ? e.message : 'Could not load.')); }, [formId]);
  useEffect(() => { load(); }, [load]);
  const guard = async (fn: () => Promise<unknown>) => { setErr(''); try { await fn(); load(); } catch (e) { setErr(e instanceof Error ? e.message : 'That did not work.'); } };
  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3" data-testid="form-webhooks">
      <p className="font-bold">Web hooks</p>
      <p className="text-xs text-zinc-400">Every new answer is sent to your web address as JSON, signed with the secret in the header <code>X-NOOB-Signature</code> (HMAC-SHA256 of the body). Only https addresses on the public internet are allowed. A failed delivery is tried again up to 5 times.</p>
      <div className="flex gap-2"><input value={url} onChange={(e) => setUrl(e.target.value.trim())} placeholder="https://example.com/hook" aria-label="Web hook address" className={inp} /><button type="button" disabled={!url} onClick={() => void guard(async () => { await addWebhook(formId, url); setUrl(''); })} className="px-4 h-10 shrink-0 rounded-lg bg-white text-black text-sm font-bold disabled:opacity-40 cursor-pointer">Add</button></div>
      {err && <p role="alert" className="text-sm text-red-300">{err}</p>}
      {data?.hooks.map((h) => (
        <div key={h.id} className="rounded-lg bg-zinc-800/60 p-2.5 text-sm space-y-1">
          <p className="break-all">{h.url}</p>
          <div className="flex flex-wrap gap-2 items-center text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={h.active} onChange={(e) => void guard(() => setWebhook(h.id, { active: e.target.checked }))} />On</label>
            <button type="button" onClick={() => setShown(shown === h.id ? '' : h.id)} className="underline cursor-pointer">{shown === h.id ? 'Hide the secret' : 'Show the secret'}</button>
            <button type="button" onClick={() => { if (window.confirm('Delete this web hook?')) void guard(() => deleteWebhook(h.id)); }} className="underline text-red-300 cursor-pointer">Delete</button>
          </div>
          {shown === h.id && <p className="font-mono text-xs break-all">{h.secret}</p>}
        </div>))}
      {data && data.hooks.length > 0 && <button type="button" onClick={() => { setInfo(''); void sendWebhooksNow(formId).then((r) => { setInfo(`Sent ${r.sent}, failed ${r.failed}.`); load(); }).catch((e) => setErr(e instanceof Error ? e.message : 'Could not send.')); }} className="px-3 h-8 rounded-full border border-zinc-700 text-xs font-bold cursor-pointer">Send what is waiting now</button>}
      {info && <p role="status" className="text-xs text-emerald-300">{info}</p>}
      {data && data.deliveries.length > 0 && <ul className="text-xs space-y-0.5 text-zinc-400">{data.deliveries.map((d) => <li key={d.id}>{new Date(d.created_at).toLocaleString()} · {d.status}{d.http_status ? ` (${d.http_status})` : ''}{d.last_error ? ` · ${d.last_error}` : ''}</li>)}</ul>}
    </div>
  );
};

const GridEditor: React.FC<{ q: FormQuestion; onPatch: (p: Partial<FormQuestion>) => void }> = ({ q, onPatch }) => {
  const list = (key: 'rows' | 'cols', title: string) => (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-zinc-300">{title}</p>
      {q[key]?.map((o, k) => (
        <div key={o.id} className="flex items-center gap-1.5">
          <input value={o.label} onChange={(e) => onPatch({ [key]: q[key]?.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)) })} maxLength={120} aria-label={`${title} ${k + 1}`} className={inp} />
          <button type="button" aria-label="Delete" onClick={() => onPatch({ [key]: q[key]?.filter((x) => x.id !== o.id) })} className="w-8 h-8 shrink-0 flex items-center justify-center text-zinc-400 hover:text-red-400 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>))}
      <button type="button" onClick={() => onPatch({ [key]: [...(q[key] ?? []), { id: newId(), label: `${key === 'rows' ? 'Row' : 'Column'} ${(q[key]?.length ?? 0) + 1}` }] })} className="text-sm font-bold underline cursor-pointer">Add</button>
    </div>);
  return (
    <div className="space-y-3">
      {list('rows', 'Rows')}{list('cols', 'Columns')}
      <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={!!q.multi} onChange={(e) => onPatch({ multi: e.target.checked })} />People can pick more than one column in a row (checkbox grid)</label>
    </div>
  );
};

const QuizFields: React.FC<{ q: FormQuestion; onPatch: (p: Partial<FormQuestion>) => void }> = ({ q, onPatch }) => {
  const multi = q.type === 'checkboxes' || (q.type === 'image_choice' && q.multi);
  const single = q.type === 'multiple_choice' || q.type === 'dropdown' || (q.type === 'image_choice' && !q.multi);
  const list = Array.isArray(q.correct) ? q.correct : [];
  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
      <p className="text-xs font-bold text-emerald-300">Quiz: points and the right answer</p>
      <div className="grid grid-cols-2 gap-3">
        <Row label="Points for a right answer (0 = not scored)"><input type="number" min={0} max={100} value={q.points ?? ''} onChange={(e) => onPatch({ points: e.target.value === '' ? undefined : Math.max(0, Math.min(100, Number(e.target.value))) })} className={inp} data-testid="q-points" /></Row>
        {single && <Row label="The right answer"><select value={typeof q.correct === 'string' ? q.correct : ''} onChange={(e) => onPatch({ correct: e.target.value || undefined })} className={inp} data-testid="q-correct"><option value="">Choose…</option>{q.options?.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></Row>}
        {q.type === 'thumbs' && <Row label="The right answer"><select value={typeof q.correct === 'string' ? q.correct : ''} onChange={(e) => onPatch({ correct: e.target.value || undefined })} className={inp}><option value="">Choose…</option><option value="up">Thumbs up</option><option value="down">Thumbs down</option></select></Row>}
        {['number', 'scale', 'rating', 'nps', 'heart'].includes(q.type) && <Row label="The right number"><input type="number" value={typeof q.correct === 'number' ? q.correct : ''} onChange={(e) => onPatch({ correct: e.target.value === '' ? undefined : Number(e.target.value) })} className={inp} /></Row>}
        {['short', 'paragraph', 'email', 'phone', 'url'].includes(q.type) && <Row label="Right answers (separate with commas)"><input value={Array.isArray(q.correct) ? q.correct.join(', ') : typeof q.correct === 'string' ? q.correct : ''} onChange={(e) => { const w = e.target.value.split(',').map((x) => x.trim()).filter(Boolean); onPatch({ correct: w.length > 1 ? w : w[0] }); }} className={inp} /></Row>}
      </div>
      {multi && (
        <div className="space-y-1"><p className="text-xs text-zinc-300">Tick every right option</p>{q.options?.map((o) => <label key={o.id} className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={list.includes(o.id)} onChange={(e) => onPatch({ correct: e.target.checked ? [...list, o.id] : list.filter((x) => x !== o.id) })} />{o.label}</label>)}</div>)}
      {q.type === 'ranking' && <button type="button" onClick={() => onPatch({ correct: q.options?.map((o) => o.id) })} className="text-sm underline cursor-pointer">{Array.isArray(q.correct) ? 'Right order: the order of the options above (tap to set again)' : 'Use the order of the options above as the right order'}</button>}
      <Row label="Explanation shown after sending (optional)"><input value={q.explanation ?? ''} onChange={(e) => onPatch({ explanation: e.target.value })} maxLength={400} className={inp} /></Row>
    </div>
  );
};

const EndRule: React.FC<{ q: FormQuestion; onPatch: (p: Partial<FormQuestion>) => void }> = ({ q, onPatch }) => {
  const e = q.endIf;
  const choice = hasOptions(q.type) && q.type !== 'ranking';
  return (
    <div className="rounded-xl border border-zinc-800 p-3 space-y-2">
      <p className="text-xs font-semibold text-zinc-300">End the form after this question if the answer…</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <select aria-label="End rule" value={e?.op ?? ''} onChange={(ev) => onPatch({ endIf: ev.target.value ? { op: ev.target.value as never, value: e?.value } : null })} className={inp}><option value="">Never (go on to the next question)</option>{[['eq', 'is'], ['neq', 'is not'], ['contains', 'contains'], ['gt', 'is more than'], ['lt', 'is less than']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        {e && (choice
          ? <select aria-label="End value" value={String(e.value ?? '')} onChange={(ev) => onPatch({ endIf: { ...e, value: ev.target.value } })} className={inp}><option value="">Choose…</option>{q.options?.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
          : <input aria-label="End value" value={String(e.value ?? '')} onChange={(ev) => onPatch({ endIf: { ...e, value: ['gt', 'lt'].includes(e.op) || ['scale', 'rating', 'nps', 'number', 'heart'].includes(q.type) ? Number(ev.target.value) : ev.target.value } })} className={inp} />)}
      </div>
    </div>
  );
};

const DesignTab: React.FC<{ theme: FormTheme; onTheme: (p: Partial<FormTheme>) => void; onPickTheme: (id: string) => void; onReset: () => void; preview: React.ReactNode }> = ({ theme, onTheme, onPickTheme, onReset, preview }) => {
  const t = resolveTheme(theme);
  const ratio = contrastRatio(t.primary, t.card);
  const hexField = (label: string, key: 'primary' | 'background' | 'text', value: string) => (
    <Row label={label}><span className="flex gap-2"><input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(e) => onTheme({ [key]: e.target.value })} aria-label={label + ' picker'} className="w-10 h-9 rounded cursor-pointer bg-transparent" /><input value={theme[key] ?? ''} placeholder={/^#/.test(value) ? value : 'from the theme'} onChange={(e) => onTheme({ [key]: e.target.value.trim() })} maxLength={7} className={inp} aria-label={label + ' hex'} /></span></Row>);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Themes">
        {Object.entries(THEMES).map(([id, th]) => (
          <button key={id} type="button" role="radio" aria-checked={(theme.id ?? 'classic') === id} onClick={() => onPickTheme(id)} className={`rounded-xl p-2 text-left cursor-pointer border-2 ${(theme.id ?? 'classic') === id ? 'border-white' : 'border-transparent'}`} style={{ background: th.bg, color: th.text }}>
            <span className="block h-7 rounded-md" style={{ background: th.card, border: `1px solid ${th.border}`, borderTop: `5px solid ${th.primary}` }} />
            <span className="block text-[11px] font-bold mt-1 truncate">{th.name}</span>
          </button>))}
      </div>
      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{hexField('Main colour', 'primary', t.primary)}{hexField('Page background', 'background', t.bg)}{hexField('Text colour', 'text', t.text)}</div>
        <div className="grid grid-cols-2 gap-3">
          <Row label="Font"><select value={Object.entries(THEME_FONTS).find(([, v]) => v === (theme.font ?? ''))?.[0] ?? 'Default'} onChange={(e) => onTheme({ font: THEME_FONTS[e.target.value] })} className={inp}>{Object.keys(THEME_FONTS).map((k) => <option key={k}>{k}</option>)}</select></Row>
          <Row label={`Rounded corners: ${t.radius}px`}><input type="range" min={0} max={32} value={t.radius} onChange={(e) => onTheme({ radius: Number(e.target.value) })} className="w-full" /></Row>
        </div>
        {ratio < 3 && <p role="status" className="text-xs text-amber-300">The main colour is hard to see on the cards (contrast {ratio.toFixed(1)}:1; 3:1 is the least). Pick a darker or lighter colour.</p>}
        <button type="button" onClick={onReset} className="text-sm underline cursor-pointer">Reset my colours</button>
      </div>
      <div><p className="text-xs font-semibold text-zinc-300 mb-1.5">Live preview</p>{preview}</div>
    </div>
  );
};

const SettingsTab: React.FC<{ s: FormSettings; onChange: (p: Partial<FormSettings>) => void }> = ({ s, onChange }) => (
  <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-4">
    <Row label="How people fill it">
      <select value={s.presentation ?? 'classic'} onChange={(e) => onChange({ presentation: e.target.value as Presentation })} className={inp}><option value="classic">Classic: all questions on one page</option><option value="pages">Pages: a new page at each "New page"</option><option value="conversational">One question at a time</option></select>
    </Row>
    <div className="flex flex-wrap gap-5 text-sm">
      <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={s.showProgress !== false} onChange={(e) => onChange({ showProgress: e.target.checked })} />Show progress</label>
      <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={!!s.numbering} onChange={(e) => onChange({ numbering: e.target.checked })} />Number the questions</label>
      <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={!!s.collectCampaign} onChange={(e) => onChange({ collectCampaign: e.target.checked })} />Keep campaign tags from the link (utm_source, utm_medium, utm_campaign)</label>
    </div>
    <div className="rounded-xl border border-zinc-800 p-3 space-y-3">
      <label className="flex items-center gap-2 text-sm font-bold cursor-pointer"><input type="checkbox" checked={!!s.quiz?.enabled} onChange={(e) => onChange({ quiz: { ...s.quiz, enabled: e.target.checked } })} data-testid="quiz-toggle" />This is a quiz (points and right answers)</label>
      {s.quiz?.enabled && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Row label="Pass mark in % (optional)"><input type="number" min={1} max={100} value={s.quiz.passScore ?? ''} onChange={(e) => onChange({ quiz: { ...s.quiz, passScore: e.target.value === '' ? null : Math.max(1, Math.min(100, Number(e.target.value))) } })} className={inp} /></Row>
          <Row label="After sending, people see"><select value={s.quiz.showScore ?? 'after'} onChange={(e) => onChange({ quiz: { ...s.quiz, showScore: e.target.value as 'after' | 'never' } })} className={inp}><option value="after">Their score</option><option value="never">Nothing (only you see the scores)</option></select></Row>
          <label className="flex items-center gap-2 text-sm cursor-pointer sm:col-span-2"><input type="checkbox" checked={!!s.quiz.showAnswers} onChange={(e) => onChange({ quiz: { ...s.quiz, showAnswers: e.target.checked } })} />Also show the right answers and explanations (after sending, never before)</label>
          <p className="text-xs text-zinc-400 sm:col-span-2">Set the points and the right answer inside each question. The right answers are never sent to people before they have sent their own.</p>
        </div>)}
    </div>
    <Row label="Message after sending"><input value={s.confirmMessage ?? ''} onChange={(e) => onChange({ confirmMessage: e.target.value })} maxLength={300} placeholder="Your response was sent." className={inp} /></Row>
    <Row label="Go to this address after sending (optional, https://…)"><input value={s.redirectUrl ?? ''} onChange={(e) => onChange({ redirectUrl: e.target.value.trim() })} maxLength={300} className={inp} /></Row>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Row label="Opens on (optional)"><input type="datetime-local" value={toLocal(s.opensAt)} onChange={(e) => onChange({ opensAt: e.target.value ? new Date(e.target.value).toISOString() : null })} className={inp} /></Row>
      <Row label="Closes on (optional)"><input type="datetime-local" value={toLocal(s.closesAt)} onChange={(e) => onChange({ closesAt: e.target.value ? new Date(e.target.value).toISOString() : null })} className={inp} /></Row>
      <Row label="Stop after this many answers"><input type="number" min={1} value={s.maxResponses ?? ''} onChange={(e) => onChange({ maxResponses: e.target.value === '' ? null : Math.max(1, Math.floor(Number(e.target.value))) })} className={inp} /></Row>
    </div>
    <p className="text-xs text-zinc-400">These settings are part of the published copy: press "Publish changes" after changing them. Answers are anonymous unless you ask for a name or an email. NOOB keeps nothing about the visit except the campaign tags above, and only when you switch that on.</p>
  </div>
);
const toLocal = (iso?: string | null) => { if (!iso) return ''; const d = new Date(iso); if (Number.isNaN(d.getTime())) return ''; const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

const ShareTab: React.FC<{ row: FormRow; role: FormRole; unpublished: boolean; busy: boolean; onPublish: () => void; onStatus: (s: 'published' | 'closed' | 'draft') => void }> = ({ row, role, unpublished, busy, onPublish, onStatus }) => {
  const [copied, setCopied] = useState('');
  const [qr, setQr] = useState('');
  useEffect(() => { if (!row.slug || row.status === 'draft') return; let alive = true; void import('qrcode').then((m) => m.toDataURL(formLink(row.slug!), { width: 360, margin: 2 })).then((u) => alive && setQr(u)).catch(() => undefined); return () => { alive = false; }; }, [row.slug, row.status]);
  const link = row.slug ? formLink(row.slug) : '';
  const embed = link ? `<iframe src="${link}" width="100%" height="720" style="border:0;max-width:700px" title="${row.title.replace(/"/g, '&quot;')}" loading="lazy"></iframe>` : '';
  const copy = async (text: string, what: string) => { try { await navigator.clipboard.writeText(text); setCopied(what); window.setTimeout(() => setCopied(''), 1800); } catch { window.prompt('Copy this:', text); } };
  if (!row.slug || row.status === 'draft') return <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6 text-center space-y-3"><p className="font-semibold">This form is not published yet.</p><p className="text-sm text-zinc-400">Publish it to get a link anyone can open, with no account.</p><button type="button" disabled={busy} onClick={onPublish} className="px-5 h-10 rounded-full bg-white text-black font-bold cursor-pointer">Publish</button></div>;
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
        <p className="text-xs font-semibold text-zinc-300">Link: anyone can open it, no account needed</p>
        <div className="flex gap-2"><input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className={inp} aria-label="Public link" data-testid="form-link" /><button type="button" onClick={() => void copy(link, 'link')} className="px-4 h-10 shrink-0 rounded-lg bg-white text-black text-sm font-bold cursor-pointer inline-flex items-center gap-1.5"><Link2 className="w-4 h-4" />{copied === 'link' ? 'Copied' : 'Copy'}</button></div>
        <div className="flex flex-wrap gap-2">
          <a href={link} target="_blank" rel="noopener noreferrer" className="px-4 h-9 rounded-full border border-zinc-700 text-sm font-semibold inline-flex items-center cursor-pointer">Open the form</a>
          {typeof navigator.share === 'function' && <button type="button" onClick={() => void navigator.share({ title: row.title, url: link }).catch(() => undefined)} className="px-4 h-9 rounded-full border border-zinc-700 text-sm font-semibold cursor-pointer">Share…</button>}
        </div>
        {qr && <div className="flex items-center gap-3 pt-1"><img src={qr} alt="QR code of the form link" width={120} height={120} className="rounded-lg bg-white p-1" /><a href={qr} download={`${row.title.replace(/[^\w-]+/g, '-').slice(0, 30) || 'form'}-qr.png`} className="px-4 h-9 rounded-full border border-zinc-700 text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer"><Download className="w-4 h-4" />Save the QR code</a></div>}
        <p className="text-xs font-semibold text-zinc-300 pt-1">Put it on a website</p>
        <textarea readOnly rows={3} value={embed} onFocus={(e) => e.currentTarget.select()} className={inp + ' font-mono text-xs'} aria-label="Embed code" />
        <button type="button" onClick={() => void copy(embed, 'embed')} className="px-4 h-9 rounded-full border border-zinc-700 text-sm font-semibold cursor-pointer">{copied === 'embed' ? 'Copied' : 'Copy embed code'}</button>
      </div>
      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
        <p className="text-sm"><b>Status:</b> {row.status === 'closed' ? 'Closed: new answers are refused' : 'Open: taking answers'} · version {row.version}{unpublished && ' · you have changes that are not published'}</p>
        <div className="flex flex-wrap gap-2">
          {unpublished && <button type="button" disabled={busy} onClick={onPublish} className="px-4 h-9 rounded-full bg-white text-black text-sm font-bold cursor-pointer">Publish changes</button>}
          {role === 'owner' && (row.status === 'published' ? <button type="button" disabled={busy} onClick={() => onStatus('closed')} className="px-4 h-9 rounded-full border border-zinc-700 text-sm font-semibold cursor-pointer" data-testid="form-close">Stop taking answers</button> : <button type="button" disabled={busy} onClick={() => onStatus('published')} className="px-4 h-9 rounded-full border border-zinc-700 text-sm font-semibold cursor-pointer">Open it again</button>)}
          {role === 'owner' && <button type="button" disabled={busy} onClick={() => { if (window.confirm('Unpublish? The link will show "not found". Your answers are kept.')) onStatus('draft'); }} className="px-4 h-9 rounded-full border border-zinc-700 text-sm font-semibold cursor-pointer">Unpublish</button>}
        </div>
      </div>
      {role === 'owner' && <PeoplePanel formId={row.id} />}
      {role === 'owner' && <WebhookPanel formId={row.id} />}
    </div>
  );
};

export default FormEditor;
