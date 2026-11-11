import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, ArrowLeft, BarChart3, Copy, FileText, FolderInput, LayoutGrid, List, Plus, RotateCcw, Search, Sparkles, Star, Trash2, X } from 'lucide-react';
import { aiCall, createForm, deleteFormForever, duplicateForm, formLink, listForms, myRoles, updateMeta, type FormRow } from '../../services/formsApi';
import { BLANK_DRAFT, QTYPES, TEMPLATES, fixTemplateLogic, fromAiForm, importDefinition, type FormDraft } from '../../utils/forms';
import './forms.css';

const PALETTE = ['#1ee6a1', '#7c5cff', '#ff4d8d', '#ffae42', '#38bdf8', '#fb7185'];
/** a steady colour for each form: decoration only, taken from its id */
const accentOf = (id: string): string => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return PALETTE[h % PALETTE.length]; };

// "My forms": search, filters, sort, grid or list, folders, stars, archive and trash (nothing is deleted for good until it is in the trash and you say so), templates and a blank form.

type Filter = 'all' | 'draft' | 'published' | 'starred' | 'shared' | 'archived' | 'trash';
type Sort = 'modified' | 'created' | 'name' | 'responses';
const FILTERS: Array<[Filter, string]> = [['all', 'All'], ['draft', 'Drafts'], ['published', 'Published'], ['starred', 'Starred'], ['shared', 'Shared with me'], ['archived', 'Archived'], ['trash', 'Trash']];

interface Props { meId: string; onOpen: (id: string) => void; onResponses: (id: string) => void; onBack: () => void }

export const FormsDashboard: React.FC<Props> = ({ meId, onOpen, onResponses, onBack }) => {
  const [roles, setRoles] = useState<Record<string, 'editor' | 'viewer'>>({});
  useEffect(() => { void myRoles().then(setRoles).catch(() => undefined); }, []);
  const [forms, setForms] = useState<FormRow[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [folder, setFolder] = useState('');
  const [sort, setSort] = useState<Sort>('modified');
  const [grid, setGrid] = useState(() => { try { return localStorage.getItem('noob_forms_view') !== 'list'; } catch { return true; } });
  const [gallery, setGallery] = useState(false);
  const [ai, setAi] = useState(false);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => { setError(''); try { setForms(await listForms()); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load your forms.'); } }, []);
  useEffect(() => { void load(); }, [load]);
  const setView = (g: boolean) => { setGrid(g); try { localStorage.setItem('noob_forms_view', g ? 'grid' : 'list'); } catch { /* the choice is only a convenience */ } };

  const folders = useMemo(() => [...new Set((forms ?? []).map((f) => f.folder).filter((x): x is string => !!x))].sort(), [forms]);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = (forms ?? []).filter((f) => {
      const trashed = !!f.deleted_at, archived = !!f.archived_at;
      if (filter === 'trash') { if (!trashed) return false; } else if (trashed) return false;
      if (filter === 'archived') { if (!archived) return false; } else if (archived) return false;
      if (filter === 'draft' && f.status !== 'draft') return false;
      if (filter === 'published' && f.status === 'draft') return false;
      if (filter === 'starred' && !f.starred) return false;
      if (filter === 'shared' && f.owner_id === meId) return false;
      if (folder && f.folder !== folder) return false;
      return !term || f.title.toLowerCase().includes(term) || f.description.toLowerCase().includes(term);
    });
    return list.sort((a, b) => sort === 'name' ? a.title.localeCompare(b.title) : sort === 'responses' ? b.response_count - a.response_count : sort === 'created' ? b.created_at.localeCompare(a.created_at) : b.updated_at.localeCompare(a.updated_at));
  }, [forms, q, filter, folder, sort]);

  const run = async (key: string, fn: () => Promise<unknown>, done?: string) => { setBusy(key); setNote(''); try { await fn(); await load(); if (done) setNote(done); } catch (e) { setNote(e instanceof Error ? e.message : 'That did not work. Please try again.'); } finally { setBusy(''); } };
  const create = (title: string, description: string, draft: ReturnType<typeof BLANK_DRAFT>) => run('new', async () => { const f = await createForm({ title, description, draft }); onOpen(f.id); });

  const live = (forms ?? []).filter((f) => !f.deleted_at && !f.archived_at);
  const stats = { total: live.length, open: live.filter((f) => f.status === 'published').length, answers: live.reduce((n, f) => n + (f.response_count || 0), 0) };

  return (
    <div className="frm-page max-w-full overflow-x-hidden" data-testid="forms-dashboard">
      <div className="frm-bar">
        <div className="frm-bar-in">
          <button type="button" onClick={onBack} aria-label="Back" className="frm-round"><ArrowLeft className="w-5 h-5" /></button>
          <span className="frm-logo" aria-hidden="true"><FileText className="w-5 h-5" /></span>
          <div className="min-w-0 flex-1"><h1 className="frm-h1">Forms</h1><p className="frm-sub">Ask, collect, understand</p></div>
          <button type="button" onClick={() => setView(!grid)} aria-label={grid ? 'Show as a list' : 'Show as a grid'} className="frm-round">{grid ? <List className="w-5 h-5" /> : <LayoutGrid className="w-5 h-5" />}</button>
        </div>
      </div>

      <div className="frm-wrap">
        <section className="frm-hero" aria-label="Your forms at a glance">
          <div className="frm-hero-glow" aria-hidden="true" />
          <p className="frm-hero-kicker">NOOB Forms</p>
          <h2 className="frm-hero-title">Make a form in <span>seconds</span>.</h2>
          <div className="frm-stats" aria-label="Totals">
            <div><b>{forms ? stats.total : '-'}</b><span>forms</span></div>
            <div><b>{forms ? stats.open : '-'}</b><span>open</span></div>
            <div><b>{forms ? stats.answers : '-'}</b><span>answers</span></div>
          </div>
        </section>

        <label className="frm-search"><Search className="w-[18px] h-[18px]" aria-hidden="true" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search your forms" /></label>

        <section aria-label="Start a new form" className="frm-start">
          <div className="frm-row-head"><h2>Start a new form</h2><button type="button" onClick={() => setGallery(true)} className="frm-link" data-testid="forms-templates">Template gallery</button></div>
          <div className="frm-tiles no-scrollbar">
            <button type="button" disabled={busy === 'new'} onClick={() => void create('Untitled form', '', BLANK_DRAFT())} className="frm-tile" style={{ ['--c' as string]: '#1ee6a1' } as React.CSSProperties} data-testid="forms-new"><span className="frm-tile-art"><Plus className="w-9 h-9" strokeWidth={2} /></span><span className="frm-tile-name">Blank form</span></button>
            <button type="button" onClick={() => setAi(true)} className="frm-tile" style={{ ['--c' as string]: '#7c5cff' } as React.CSSProperties} data-testid="forms-ai"><span className="frm-tile-art"><Sparkles className="w-8 h-8" strokeWidth={2} /></span><span className="frm-tile-name">Create with AI</span></button>
            <label className="frm-tile" style={{ ['--c' as string]: '#ffae42' } as React.CSSProperties}><span className="frm-tile-art"><FolderInput className="w-8 h-8" strokeWidth={2} /></span><span className="frm-tile-name">Import a file</span><input type="file" accept="application/json,.json" className="sr-only" data-testid="forms-import" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; if (f.size > 1_000_000) { setNote('That file is too big for a form.'); return; } void f.text().then((tx) => { const d = importDefinition(tx); return create(d.title, d.description, d.draft); }).catch((err) => setNote(err instanceof Error ? err.message : 'Could not read the file.')); }} /></label>
            {TEMPLATES.slice(0, 4).map((tp, k) => <button key={tp.id} type="button" onClick={() => { const bd = tp.build(); void create(bd.title, bd.description, { ...bd.draft, questions: fixTemplateLogic(bd.draft.questions) }); }} className="frm-tile is-template" style={{ ['--c' as string]: PALETTE[(k + 2) % PALETTE.length] } as React.CSSProperties}><span className="frm-tile-art"><span className="frm-tile-desc">{tp.description}</span></span><span className="frm-tile-name">{tp.name}</span></button>)}
          </div>
        </section>

        <div className="frm-filters">
          <div className="frm-chips no-scrollbar" role="tablist">{FILTERS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={filter === id} onClick={() => setFilter(id)} className={`frm-chip ${filter === id ? 'on' : ''}`}>{label}</button>)}</div>
          <div className="frm-selects">
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort" className="frm-select"><option value="modified">Last changed</option><option value="created">Newest</option><option value="name">A to Z</option><option value="responses">Most answers</option></select>
            {folders.length > 0 && <select value={folder} onChange={(e) => setFolder(e.target.value)} aria-label="Folder" className="frm-select"><option value="">All folders</option>{folders.map((f) => <option key={f}>{f}</option>)}</select>}
          </div>
        </div>

        <div className="frm-list-wrap">
          {note && <p role="status" className="frm-note"><span>{note}</span><button type="button" aria-label="Dismiss" onClick={() => setNote('')} className="cursor-pointer"><X className="w-4 h-4" /></button></p>}
          {error && <div role="alert" className="frm-alert">{error} <button type="button" onClick={() => void load()} className="underline font-bold cursor-pointer">Try again</button></div>}
          {!forms && !error && <div className="frm-grid" role="status" aria-label="Loading">{[0, 1, 2].map((i) => <div key={i} className="frm-skel animate-pulse" style={{ ['--i' as string]: i } as React.CSSProperties} />)}</div>}
          {forms && shown.length === 0 && (
            <div className="frm-empty"><span className="frm-empty-art"><FileText className="w-9 h-9" aria-hidden="true" /></span><p className="t">{forms.length === 0 ? 'You have no forms yet' : 'No forms here'}</p><p className="s">{forms.length === 0 ? 'Start with a blank form or pick a template.' : 'Change the search or the filter.'}</p>{forms.length === 0 && <button type="button" onClick={() => setGallery(true)} className="frm-btn primary">Browse templates</button>}</div>)}
          <div className={grid ? 'frm-grid' : 'frm-stack'}>
            {shown.map((f, idx) => (
              <article key={f.id} className={`frm-fcard ${grid ? '' : 'is-row'}`} style={{ ['--c' as string]: accentOf(f.id), ['--i' as string]: idx } as React.CSSProperties} data-testid="forms-card">
                <button type="button" onClick={() => (f.deleted_at ? undefined : roles[f.id] === 'viewer' ? onResponses(f.id) : onOpen(f.id))} className="frm-fcard-main">
                  <span className="frm-fcard-band" />
                  <span className="frm-fcard-body">
                    <span className="frm-fcard-top">
                      <span className={`frm-status ${f.status === 'published' ? 'open' : f.status === 'closed' ? 'closed' : 'draft'}`}>{f.status === 'published' ? 'Open' : f.status === 'closed' ? 'Closed' : 'Draft'}</span>
                      <span className="frm-fcard-count"><b>{f.response_count}</b> {f.response_count === 1 ? 'answer' : 'answers'}</span>
                    </span>
                    <span className="frm-fcard-title">{f.title || 'Untitled form'}</span>
                    {grid && <span className="frm-fcard-desc">{f.description || 'No description'}</span>}
                    <span className="frm-fcard-meta">
                      <span>Changed {new Date(f.updated_at).toLocaleDateString()}</span>{f.folder && <span>📁 {f.folder}</span>}{f.owner_id !== meId && <span className="frm-shared">Shared with you · {roles[f.id] ?? 'editor'}</span>}
                    </span>
                  </span>
                </button>
                <div className="frm-fcard-actions">
                  {f.deleted_at ? (<>
                    <IconBtn label="Restore" onClick={() => void run(f.id, () => updateMeta(f.id, { deleted_at: null }), 'Restored.')}><RotateCcw className="w-4 h-4" /></IconBtn>
                    <IconBtn label="Delete for good" danger onClick={() => { if (window.confirm(`Delete "${f.title}" and its ${f.response_count} answers for good? This cannot be undone.`)) void run(f.id, () => deleteFormForever(f.id), 'Deleted for good.'); }}><Trash2 className="w-4 h-4" /></IconBtn>
                  </>) : (<>
                    {f.owner_id === meId && <IconBtn label={f.starred ? 'Remove star' : 'Star'} on={f.starred} onClick={() => void run(f.id, () => updateMeta(f.id, { starred: !f.starred }))}><Star className="w-4 h-4" fill={f.starred ? 'currentColor' : 'none'} /></IconBtn>}
                    <IconBtn label="Answers" onClick={() => onResponses(f.id)}><BarChart3 className="w-4 h-4" /></IconBtn>
                    <IconBtn label="Duplicate" onClick={() => void run(f.id, () => duplicateForm(f), 'Copied: the questions, theme and settings (not the answers).')}><Copy className="w-4 h-4" /></IconBtn>
                    {f.owner_id === meId && <IconBtn label="Move to a folder" onClick={() => { const v = window.prompt('Folder name (empty to remove)', f.folder ?? ''); if (v !== null) void run(f.id, () => updateMeta(f.id, { folder: v.trim().slice(0, 60) || null })); }}><FolderInput className="w-4 h-4" /></IconBtn>}
                    {f.slug && f.status !== 'draft' && <IconBtn label="Copy link" onClick={() => { void navigator.clipboard?.writeText(formLink(f.slug!)).then(() => setNote('Link copied.')).catch(() => window.prompt('Copy this link:', formLink(f.slug!))); }}><span className="text-[11px] font-bold px-1">Link</span></IconBtn>}
                    {f.owner_id === meId && <IconBtn label={f.archived_at ? 'Unarchive' : 'Archive'} onClick={() => void run(f.id, () => updateMeta(f.id, { archived_at: f.archived_at ? null : new Date().toISOString() }), f.archived_at ? 'Unarchived.' : 'Archived.')}><Archive className="w-4 h-4" /></IconBtn>}
                    {f.owner_id === meId && <IconBtn label="Move to trash" danger onClick={() => void run(f.id, () => updateMeta(f.id, { deleted_at: new Date().toISOString() }), 'Moved to the trash. You can restore it from the Trash tab.')}><Trash2 className="w-4 h-4" /></IconBtn>}
                  </>)}
                </div>
              </article>))}
          </div>
        </div>
      </div>

      {ai && <AiCreate onClose={() => setAi(false)} onUse={(t, d, draft) => { setAi(false); void create(t, d, draft); }} />}
      {gallery && <Gallery onClose={() => setGallery(false)} onPick={(t) => { const b = t.build(); setGallery(false); void create(b.title, b.description, { ...b.draft, questions: fixTemplateLogic(b.draft.questions) }); }} />}
    </div>
  );
};

const AiCreate: React.FC<{ onClose: () => void; onUse: (title: string, description: string, draft: FormDraft) => void }> = ({ onClose, onUse }) => {
  const [prompt, setPrompt] = useState('');
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [made, setMade] = useState<ReturnType<typeof fromAiForm> | null>(null);
  const go = async () => {
    setBusy(true); setErr(''); setMade(null);
    try { const r = await aiCall<{ form: unknown }>({ action: 'generate', prompt, count }); setMade(fromAiForm(r.form)); }
    catch (e) { setErr(e instanceof Error ? e.message : 'The AI helper could not answer right now.'); }
    finally { setBusy(false); }
  };
  return (
    <div className="frm-scrim" role="dialog" aria-modal="true" aria-label="Create a form with AI">
      <div className="frm-sheet no-doodle space-y-3">
        <div className="frm-grab" aria-hidden="true" />
        <div className="flex items-center gap-2"><h2 className="font-extrabold text-lg flex-1">Create with AI</h2><button type="button" onClick={onClose} aria-label="Close" className="frm-round sm"><X className="w-4 h-4" /></button></div>
        {!made ? (<>
          <label className="block text-xs font-semibold text-zinc-300">Describe the form you need
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={1500} rows={5} placeholder="A customer satisfaction survey for an online clothing store, with product quality, delivery, and an optional final comment" className="mt-1 w-full bg-zinc-800/70 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-normal outline-none focus-visible:ring-2 ring-white/40" data-testid="ai-prompt" /></label>
          <label className="block text-xs font-semibold text-zinc-300">About how many questions: {count}<input type="range" min={3} max={30} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full" /></label>
          <p className="text-[11px] text-zinc-400">Only what you type here is sent to an AI service. Nothing from your other forms or answers is sent. You will see the form first and nothing is created until you say so.</p>
          {err && <p role="alert" className="text-sm text-red-300">{err}</p>}
          <button type="button" disabled={busy || prompt.trim().length < 5} onClick={() => void go()} className="frm-btn primary block-btn">{busy ? 'Writing your form…' : 'Make the form'}</button>
        </>) : (<>
          <div className="rounded-2xl bg-zinc-800/60 p-3"><p className="font-bold">{made.title}</p><p className="text-xs text-zinc-400">{made.description}</p>
            <ol className="mt-2 space-y-1 text-sm list-decimal pl-5">{made.draft.questions.map((q, i) => <li key={i} className={q.type === 'section' ? 'font-bold list-none -ml-5 mt-2' : ''}>{q.title} <span className="text-[11px] text-zinc-500">{q.type === 'section' ? 'new page' : QTYPES.find((t) => t.type === q.type)?.label}{q.required ? ' · required' : ''}</span></li>)}</ol></div>
          <div className="flex gap-2"><button type="button" onClick={() => setMade(null)} className="frm-btn ghost flex-1">Try again</button><button type="button" onClick={() => onUse(made.title, made.description, made.draft)} className="frm-btn primary flex-1" data-testid="ai-use">Use this form</button></div>
          <p className="text-[11px] text-zinc-400">You can change everything in the editor. Read it before you publish: the AI can make mistakes.</p>
        </>)}
      </div>
    </div>
  );
};

const IconBtn: React.FC<{ label: string; onClick: () => void; danger?: boolean; on?: boolean; children: React.ReactNode }> = ({ label, onClick, danger, on, children }) => (
  <button type="button" onClick={onClick} aria-label={label} title={label} className={`frm-icon ${danger ? 'danger' : on ? 'on' : ''}`}>{children}</button>
);

const Gallery: React.FC<{ onClose: () => void; onPick: (t: (typeof TEMPLATES)[number]) => void }> = ({ onClose, onPick }) => {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const cats = ['All', ...new Set(TEMPLATES.map((t) => t.category))];
  const list = TEMPLATES.filter((t) => (cat === 'All' || t.category === cat) && (!q || (t.name + t.description).toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="frm-scrim" role="dialog" aria-modal="true" aria-label="Templates">
      <div className="frm-sheet is-wide no-doodle">
        <div className="frm-grab" aria-hidden="true" />
        <div className="flex items-center gap-2 mb-3"><h2 className="font-extrabold text-lg flex-1">Templates</h2><button type="button" onClick={onClose} aria-label="Close" className="frm-round sm"><X className="w-4 h-4" /></button></div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates" aria-label="Search templates" className="frm-input mb-2" />
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-3">{cats.map((c) => <button key={c} type="button" onClick={() => setCat(c)} className={`frm-chip ${cat === c ? 'on' : ''}`}>{c}</button>)}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{list.map((t) => <button key={t.id} type="button" onClick={() => onPick(t)} className="frm-tpl" data-testid="template"><span className="block font-bold">{t.name}</span><span className="block text-xs text-zinc-400 mt-0.5">{t.description}</span><span className="block text-[10px] text-zinc-500 mt-2 uppercase tracking-wider">{t.category} · {t.build().draft.questions.filter((x) => x.type !== 'section').length} questions</span></button>)}{list.length === 0 && <p className="text-sm text-zinc-400 col-span-full text-center py-8">No template matches.</p>}</div>
      </div>
    </div>
  );
};

export default FormsDashboard;
