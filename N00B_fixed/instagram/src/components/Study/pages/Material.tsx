import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpenText, Layers, MessageCircle, MoreHorizontal, NotebookPen, Pencil, Search, Sparkles, Target, Trash2, X } from 'lucide-react';
import { studyApi } from '../../../services/studyApi';
import { generateNotes } from '../../../services/studyAi';
import { saveMaterial } from '../../../services/studyLibrary';
import { chunkText } from '../../../utils/studyChunks';
import type { MaterialChunk, MaterialHit, StudyMaterial } from '../../../utils/studyTypes';
import { useStudy } from '../StudyContext';
import { backStudy, goStudy } from '../studyStore';
import { hasRoute, type PageProps } from '../StudyApp';
import { Markdown } from '../Markdown';
import { Btn, Card, ErrorBox, Field, Loading, Page, Sheet, SubjectTag } from '../ui';
import { KIND_LABEL, Snippet } from './Library';

// One document: what it is, ask the tutor about it, a summary or revision notes made from it (with their sources), search inside it, and read it.
const Material: React.FC<PageProps> = ({ params }) => {
  const { me, subjects, subjectName, colorOf, toast } = useStudy();
  const id = String(params.id || '');
  const at = typeof params.at === 'number' ? params.at : null;
  const [mat, setMat] = useState<StudyMaterial | null>(null);
  const [chunks, setChunks] = useState<MaterialChunk[]>([]);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<'rename' | 'delete' | null>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<MaterialHit[] | null>(null);
  const [made, setMade] = useState<{ title: string; text: string; sources: Array<{ n: number; title: string | null; page: number | null }> } | null>(null);
  const [making, setMaking] = useState<'summary' | 'notes' | null>(null);
  const [makeError, setMakeError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const mark = useRef<HTMLDivElement | null>(null);
  const lang = me?.profile?.tutor?.language || me?.profile?.language || 'en';

  const load = useCallback(async (from: number, append: boolean) => {
    const r = await studyApi.material(id, from, 12);
    if (!r.ok) { setError(r.error); return; }
    setError(null); setMat(r.data.material); setMore(r.data.more);
    setChunks((c) => (append ? [...c, ...r.data.chunks] : r.data.chunks));
  }, [id]);
  useEffect(() => { void load(at != null ? at - 1 : -1, false); }, [load, at]);
  useEffect(() => { if (at != null) mark.current?.scrollIntoView({ block: 'center' }); }, [chunks, at]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) { setHits(null); return; }
    const t = window.setTimeout(async () => { const r = await studyApi.searchMaterials(term, null, id, 8); setHits(r.ok ? r.data.hits : []); }, 350);
    return () => window.clearTimeout(t);
  }, [q, id]);

  const loadMore = async () => {
    if (loadingMore || !chunks.length) return;
    setLoadingMore(true);
    await load(chunks[chunks.length - 1].idx, true);
    setLoadingMore(false);
  };
  const make = async (kind: 'summary' | 'notes') => {
    if (making || !mat) return;
    setMaking(kind); setMakeError(null); setMade(null);
    const r = await generateNotes({ kind, materialId: mat.id, subject: mat.subjectId ? subjectName(mat.subjectId) : undefined, topic: mat.title, language: lang });
    setMaking(null);
    if (!r.ok) { setMakeError(r.error); return; }
    setMade({ title: (kind === 'summary' ? 'Summary: ' : 'Revision notes: ') + mat.title, text: r.data.text, sources: r.data.citations || [] });
  };
  const saveMade = async () => {
    if (!made || saving) return;
    setSaving(true);
    const chunksOut = chunkText(made.text);
    const r = await saveMaterial({ title: made.title.slice(0, 140), subjectId: mat?.subjectId || null, kind: 'notes', prepared: { kind: 'notes', sourceName: '', pages: null, chunks: chunksOut, note: 'Made by the AI tutor from "' + (mat?.title || 'a document') + '". Please check it.', suggestedTitle: made.title } }, () => undefined);
    setSaving(false);
    if (!r.ok) { toast(r.error); return; }
    toast('Saved to your library.');
    setMade(null);
  };

  const subj = mat?.subjectId ? subjects.find((s) => s.id === mat.subjectId) : null;
  return (
    <Page title={mat?.title || 'Document'} subtitle={mat ? (KIND_LABEL[mat.kind] || 'Notes') + (mat.pages ? ' · ' + mat.pages + ' pages' : '') : undefined}
      right={mat && <button className="st-icon-btn" onClick={() => setMenu((v) => !v)} aria-label="More"><MoreHorizontal size={18} /></button>}>
      <div style={{ display: 'grid', gap: 14 }}>
        {error && <ErrorBox text={error} onRetry={() => void load(-1, false)} />}
        {!mat && !error && <Loading rows={3} />}
        {menu && mat && (
          <Card><div style={{ display: 'grid', gap: 8 }}>
            <Btn onClick={() => { setMenu(false); setSheet('rename'); }}><Pencil size={16} /> Rename or change subject</Btn>
            <Btn kind="warn" onClick={() => { setMenu(false); setSheet('delete'); }}><Trash2 size={16} /> Delete this document</Btn>
          </div></Card>
        )}
        {mat && (
          <>
            {mat.status !== 'ready' && (
              <div className="st-notice st-notice-warn" role="alert">{mat.status === 'processing' ? 'This document was not finished adding, so it cannot be searched yet. Please delete it and add it again.' : mat.note || 'No readable text was found in this document.'}</div>
            )}
            <Card tint>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                {subj && <SubjectTag name={subj.name} color={colorOf(subj.id)} />}
                <span className="st-small st-muted">{Math.round(mat.charCount / 1000)} thousand letters · {mat.chunkCount} pieces</span>
              </div>
              {mat.note && mat.status === 'ready' && <p className="st-small st-muted" style={{ marginTop: 6 }}>{mat.note}</p>}
            </Card>
            {mat.status === 'ready' && (
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                {hasRoute('chat') && <Btn kind="primary" onClick={() => goStudy('chat', { material: mat.id, materialTitle: mat.title, subject: mat.subjectId || undefined })}><MessageCircle size={16} /> Ask the tutor</Btn>}
                <Btn onClick={() => void make('summary')} busy={making === 'summary'} disabled={!!making}><BookOpenText size={16} /> Summary</Btn>
                <Btn onClick={() => void make('notes')} busy={making === 'notes'} disabled={!!making}><NotebookPen size={16} /> Revision notes</Btn>
                {hasRoute('practice') && <Btn onClick={() => goStudy('practice', { material: mat.id, materialTitle: mat.title, subject: mat.subjectId || undefined })}><Target size={16} /> Make a quiz</Btn>}
                {hasRoute('decks') && <Btn onClick={() => goStudy('decks', { material: mat.id, materialTitle: mat.title, subject: mat.subjectId || undefined })}><Layers size={16} /> Flashcards</Btn>}
              </div>
            )}
            {makeError && <ErrorBox text={makeError} />}
            {made && (
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span className="st-title st-h3" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Sparkles size={17} style={{ color: 'var(--st-accent)' }} /> {made.title}</span>
                  <button className="st-icon-btn" onClick={() => setMade(null)} aria-label="Close" style={{ width: 34, height: 34 }}><X size={15} /></button>
                </div>
                <div style={{ marginTop: 10 }}><Markdown text={made.text} /></div>
                {made.sources.length > 0 && <p className="st-tiny st-faint" style={{ marginTop: 10 }}>Made from {made.sources.map((s) => '[' + s.n + '] ' + (s.page ? 'page ' + s.page : 'a section')).join(', ')} of this document.</p>}
                <p className="st-tiny st-faint" style={{ marginTop: 6 }}>Written by the AI tutor from your document. It can make mistakes, so please check what matters.</p>
                <div style={{ marginTop: 12 }}><Btn small busy={saving} onClick={() => void saveMade()}>Save as a note</Btn></div>
              </Card>
            )}
            {mat.status === 'ready' && (
              <>
                <div style={{ position: 'relative' }}>
                  <Search size={17} style={{ position: 'absolute', left: 14, top: 14, color: 'var(--st-faint)' }} />
                  <input className="st-input" style={{ paddingLeft: 40 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search inside this document" aria-label="Search inside this document" />
                </div>
                {hits && hits.length === 0 && <p className="st-small st-muted">Nothing found in this document.</p>}
                {hits?.map((h, i) => (
                  <button key={i} className="st-row-btn" onClick={() => { setQ(''); goStudy('material', { id: mat.id, at: h.idx }); }} style={{ alignItems: 'flex-start' }}>
                    <span style={{ textAlign: 'left', minWidth: 0 }}>
                      <span className="st-tiny st-faint">{h.page ? 'page ' + h.page : 'section'}</span>
                      <span className="st-small" style={{ display: 'block', overflowWrap: 'anywhere' }}><Snippet text={h.snippet} /></span>
                    </span>
                  </button>
                ))}
                <div style={{ display: 'grid', gap: 10 }}>
                  <p className="st-label">Read it</p>
                  {at != null && <Btn small kind="ghost" onClick={() => goStudy('material', { id: mat.id })}>Back to the start</Btn>}
                  {chunks.map((c) => (
                    <div key={c.idx} ref={c.idx === at ? mark : undefined} className="st-card-flat" style={c.idx === at ? { borderColor: 'var(--st-accent)' } : undefined}>
                      {c.page && <p className="st-tiny st-faint" style={{ marginBottom: 4 }}>Page {c.page}</p>}
                      <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.6 }} className="st-small">{c.text}</p>
                    </div>
                  ))}
                  {more && <Btn kind="ghost" busy={loadingMore} onClick={() => void loadMore()}>Show more</Btn>}
                </div>
              </>
            )}
          </>
        )}
      </div>
      {sheet === 'rename' && mat && <RenameSheet mat={mat} onClose={() => setSheet(null)} onDone={(m) => { setMat(m); setSheet(null); toast('Saved.'); }} />}
      {sheet === 'delete' && mat && (
        <Sheet title="Delete this document?" onClose={() => setSheet(null)}>
          <p className="st-small st-muted">"{mat.title}" and its text will be removed for good. Chats that used it stay, but will no longer show its pages.</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Btn kind="ghost" onClick={() => setSheet(null)}>Keep it</Btn>
            <Btn kind="primary" style={{ flex: 1 }} onClick={async () => { const r = await studyApi.deleteMaterial(mat.id); if (r.ok) { toast('Deleted.'); backStudy(); } else toast(r.error); }}>Delete</Btn>
          </div>
        </Sheet>
      )}
    </Page>
  );
};

const RenameSheet: React.FC<{ mat: StudyMaterial; onClose: () => void; onDone: (m: StudyMaterial) => void }> = ({ mat, onClose, onDone }) => {
  const { subjects } = useStudy();
  const [title, setTitle] = useState(mat.title);
  const [subjectId, setSubjectId] = useState(mat.subjectId || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    const r = await studyApi.updateMaterial(mat.id, title, subjectId || null);
    setBusy(false);
    if (r.ok) onDone(r.data); else setError(r.error);
  };
  return (
    <Sheet title="Rename" onClose={onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label="Name"><input className="st-input" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} /></Field>
        {subjects.length > 0 && <Field label="Subject"><select className="st-input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">No subject</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
        {error && <div className="st-notice st-notice-warn" role="alert">{error}</div>}
        <Btn kind="primary" busy={busy} disabled={!title.trim()} onClick={() => void save()}>Save</Btn>
      </div>
    </Sheet>
  );
};

export default Material;
