import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, ClipboardPaste, FileText, FileUp, Image as ImageIcon, Plus, Search, X } from 'lucide-react';
import { studyApi } from '../../../services/studyApi';
import { prepareFile, prepareImages, preparePasted, saveMaterial, type Prepared } from '../../../services/studyLibrary';
import type { MaterialHit, StudyMaterial } from '../../../utils/studyTypes';
import { useStudy } from '../StudyContext';
import { goStudy } from '../studyStore';
import type { PageProps } from '../StudyApp';
import { Btn, Card, Chip, Empty, ErrorBox, Field, Loading, Page, ProgressBar, Sheet, SubjectTag } from '../ui';

// The student's library: notes, textbook pages and past papers, kept as text on NOOB (the file itself is never saved), searchable, and private.
export const KIND_LABEL: Record<string, string> = { notes: 'Notes', pdf: 'PDF', text: 'Text', image: 'Photos', pyq: 'Past paper', research: 'Research' };
const million = (n: number) => (n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + ' million' : n >= 1000 ? Math.round(n / 1000) + ' thousand' : String(n));

// the search result's text, with the matching words (marked ⟦like this⟧ by the server) shown in bold
export const Snippet: React.FC<{ text: string }> = ({ text }) => (
  <>{text.split(/(⟦[^⟧]*⟧)/).map((part, i) => (part.startsWith('⟦') ? <b key={i} style={{ color: 'var(--st-accent)' }}>{part.replace(/[⟦⟧]/g, '')}</b> : <React.Fragment key={i}>{part}</React.Fragment>))}</>
);

const Library: React.FC<PageProps> = ({ params }) => {
  const { subjects, subjectName, colorOf, user, toast } = useStudy();
  const [subject, setSubject] = useState<string>(typeof params.subject === 'string' ? params.subject : '');
  const [list, setList] = useState<{ materials: StudyMaterial[]; charsUsed: number; charsMax: number; count: number; countMax: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<MaterialHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(params.add === true || params.add === 'pyq');
  const seq = useRef(0);

  const load = useCallback(async () => {
    const r = await studyApi.materials(subject || null);
    if (r.ok) { setList(r.data); setError(null); } else setError(r.error);
  }, [subject]);
  useEffect(() => { void load(); }, [load]);

  // search as the student types (a short pause first), and only the newest answer is shown
  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) { setHits(null); setSearching(false); return; }
    setSearching(true);
    const mine = ++seq.current;
    const t = window.setTimeout(async () => {
      const r = await studyApi.searchMaterials(term, subject || null, null, 12);
      if (mine !== seq.current) return;
      setSearching(false);
      if (r.ok) setHits(r.data.hits); else { setHits([]); toast(r.error); }
    }, 350);
    return () => window.clearTimeout(t);
  }, [q, subject]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (id: string, at?: number) => goStudy('material', at != null ? { id, at } : { id });
  const full = !!list && list.count >= list.countMax;
  return (
    <Page title="Notes and library" subtitle="Private, and only yours" right={<Btn small kind="primary" disabled={full} onClick={() => setAdding(true)}><Plus size={15} /> Add</Btn>}>
      <div style={{ display: 'grid', gap: 14 }}>
        {error && <ErrorBox text={error} onRetry={() => void load()} />}
        <div style={{ position: 'relative' }}>
          <Search size={17} style={{ position: 'absolute', left: 14, top: 14, color: 'var(--st-faint)' }} />
          <input className="st-input" style={{ paddingLeft: 40 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your notes" aria-label="Search your notes" />
          {q && <button className="st-icon-btn" onClick={() => setQ('')} aria-label="Clear the search" style={{ position: 'absolute', right: 6, top: 6, width: 34, height: 34 }}><X size={15} /></button>}
        </div>
        {subjects.length > 0 && (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
            <Chip on={!subject} onClick={() => setSubject('')}>All</Chip>
            {subjects.map((s) => <Chip key={s.id} on={subject === s.id} onClick={() => setSubject(s.id)}>{s.name}</Chip>)}
          </div>
        )}

        {q.trim().length >= 3 ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {searching && <Loading rows={2} />}
            {!searching && hits && hits.length === 0 && <Empty icon={<Search size={26} />} title="Nothing found" text="Try other words from your notes. Only documents that have finished adding are searched." />}
            {!searching && hits?.map((h, i) => (
              <button key={i} className="st-row-btn" style={{ alignItems: 'flex-start' }} onClick={() => open(h.materialId, h.idx)}>
                <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                  <span className="st-title st-h3" style={{ display: 'block', overflowWrap: 'anywhere' }}>{h.title}{h.page ? <span className="st-pill" style={{ marginLeft: 8 }}>page {h.page}</span> : null}</span>
                  <span className="st-small st-muted" style={{ display: 'block', marginTop: 4, overflowWrap: 'anywhere' }}><Snippet text={h.snippet} /></span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <>
            {!list && !error && <Loading rows={3} />}
            {list && list.materials.length === 0 && (
              <Empty icon={<FileUp size={28} />} title={subject ? 'No notes for this subject yet' : 'Your library is empty'}
                text="Add a PDF, photos of your notes, or paste text. The tutor can then answer from your own notes and show where it found each answer. Only the words are saved, never the file, and nobody else can see them."
                action={<Btn kind="primary" small onClick={() => setAdding(true)}><Plus size={15} /> Add notes</Btn>} />
            )}
            {list?.materials.map((m) => (
              <button key={m.id} className="st-row-btn" onClick={() => open(m.id)} style={{ alignItems: 'flex-start' }}>
                <span style={{ width: 40, height: 40, borderRadius: 13, display: 'grid', placeItems: 'center', background: 'var(--st-surface2)', color: 'var(--st-accent)', flex: 'none' }}>{m.kind === 'image' ? <ImageIcon size={19} /> : <FileText size={19} />}</span>
                <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                  <span className="st-title st-h3" style={{ display: 'block', overflowWrap: 'anywhere' }}>{m.title}</span>
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 5 }}>
                    {m.subjectId && <SubjectTag name={subjectName(m.subjectId)} color={colorOf(m.subjectId)} />}
                    <span className="st-tiny st-muted">{KIND_LABEL[m.kind] || 'Notes'}{m.pages ? ' · ' + m.pages + (m.pages === 1 ? ' page' : ' pages') : ''}{m.status === 'ready' ? ' · ' + million(m.charCount) + ' letters' : ''}</span>
                    {m.status === 'processing' && <span className="st-pill">Not finished</span>}
                    {m.status === 'failed' && <span className="st-pill" style={{ color: 'var(--st-warn)' }}>No text found</span>}
                  </span>
                </span>
              </button>
            ))}
            {list && list.materials.length > 0 && (
              <p className="st-tiny st-faint" style={{ textAlign: 'center' }}>{list.count} of {list.countMax} documents · {million(list.charsUsed)} of {million(list.charsMax)} letters used</p>
            )}
          </>
        )}
      </div>
      {adding && <AddSheet userId={user.id} defaultSubject={subject} defaultPyq={params.add === 'pyq'} onClose={() => setAdding(false)} onSaved={(m) => { setAdding(false); void load(); toast('Added to your library.'); open(m.id); }} />}
    </Page>
  );
};

type Source = 'file' | 'photos' | 'paste';
const AddSheet: React.FC<{ userId: string; defaultSubject: string; defaultPyq?: boolean; onClose: () => void; onSaved: (m: StudyMaterial) => void }> = ({ userId, defaultSubject, defaultPyq, onClose, onSaved }) => {
  const { subjects } = useStudy();
  const [source, setSource] = useState<Source | null>(null);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState(defaultSubject);
  const [pyq, setPyq] = useState(!!defaultPyq);
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ text: string; f: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const picRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const note = (text: string, f = 0) => setProgress({ text, f });
  const accept = (p: Prepared) => { setPrepared(p); if (!title) setTitle(p.suggestedTitle); setError(null); };
  const onFile = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f || busy) return;
    setBusy(true); setError(null); setSource('file');
    const r = await prepareFile(f, note);
    setBusy(false); setProgress(null);
    if (r.ok) accept(r.data); else { setError(r.error); setPrepared(null); }
  };
  const onPics = async (files: FileList | null) => {
    const list = Array.from(files || []);
    if (!list.length || busy) return;
    setBusy(true); setError(null); setSource('photos');
    const r = await prepareImages(list, note);
    setBusy(false); setProgress(null);
    if (r.ok) accept(r.data); else { setError(r.error); setPrepared(null); }
  };
  const usePasted = () => {
    const r = preparePasted(pasted);
    if (r.ok) accept(r.data); else setError(r.error);
  };
  const save = async () => {
    if (!prepared || busy) return;
    setBusy(true); setError(null);
    const r = await saveMaterial({ title, subjectId: subjectId || null, kind: pyq ? 'pyq' : undefined, prepared }, note);
    setBusy(false); setProgress(null);
    if (r.ok) onSaved(r.data); else setError(r.error);
  };
  const letters = prepared ? prepared.chunks.reduce((a, c) => a + c.text.length, 0) : 0;

  return (
    <Sheet title="Add to your library" onClose={busy ? () => undefined : onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        {!prepared && (
          <>
            <div style={{ display: 'grid', gap: 10 }}>
              <Btn onClick={() => fileRef.current?.click()} disabled={busy}><FileUp size={17} /> A PDF or text file</Btn>
              <Btn onClick={() => picRef.current?.click()} disabled={busy}><ImageIcon size={17} /> Pictures of pages</Btn>
              <Btn onClick={() => camRef.current?.click()} disabled={busy}><Camera size={17} /> Take a photo of a page</Btn>
              <Btn onClick={() => setSource('paste')} disabled={busy}><ClipboardPaste size={17} /> Paste text</Btn>
            </div>
            <input ref={fileRef} type="file" accept=".pdf,application/pdf,.txt,.md,.markdown,.csv,.tsv,.tex,text/*" hidden onChange={(e) => { void onFile(e.target.files); e.target.value = ''; }} />
            <input ref={picRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void onPics(e.target.files); e.target.value = ''; }} />
            <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void onPics(e.target.files); e.target.value = ''; }} />
            {source === 'paste' && (
              <Field label="Paste your notes here"><textarea className="st-input" value={pasted} onChange={(e) => setPasted(e.target.value)} style={{ minHeight: 140 }} placeholder="Paste text from your notes or textbook" />
                <div style={{ marginTop: 10 }}><Btn kind="primary" block onClick={usePasted}>Continue</Btn></div></Field>
            )}
            <p className="st-tiny st-faint">PDF files are read on your phone. Only the words are saved on NOOB, never the file. Pictures of pages are read by the AI tutor (one photo question of your day each), and the pictures are deleted right after.</p>
          </>
        )}
        {busy && progress && (
          <div role="status"><p className="st-small">{progress.text}</p><div style={{ marginTop: 8 }}><ProgressBar value={progress.f * 100} label="Progress" /></div></div>
        )}
        {prepared && (
          <>
            <Card tint><p className="st-small"><b>{prepared.chunks.length} pieces of text</b> found{prepared.pages ? ' on ' + prepared.pages + (prepared.pages === 1 ? ' page' : ' pages') : ''} ({Math.round(letters / 1000)} thousand letters).</p>{prepared.note && <p className="st-small st-muted" style={{ marginTop: 4 }}>{prepared.note}</p>}</Card>
            <Field label="Name"><input className="st-input" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chapter 5, laws of motion" /></Field>
            {subjects.length > 0 && <Field label="Subject"><select className="st-input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">No subject</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
            <Chip on={pyq} onClick={() => setPyq((v) => !v)}>This is a past question paper</Chip>
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn kind="ghost" disabled={busy} onClick={() => { setPrepared(null); setSource(null); setPasted(''); }}>Back</Btn>
              <Btn kind="primary" style={{ flex: 1 }} busy={busy} disabled={!title.trim()} onClick={() => void save()}>Save to my library</Btn>
            </div>
          </>
        )}
        {error && <div className="st-notice st-notice-warn" role="alert">{error}</div>}
      </div>
    </Sheet>
  );
};

export default Library;
