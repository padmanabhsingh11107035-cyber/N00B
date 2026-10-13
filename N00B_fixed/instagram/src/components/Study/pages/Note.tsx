import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, Pin, PinOff, Square, Trash2, Volume2 } from 'lucide-react';
import { newRef, studyApi } from '../../../services/studyApi';
import { speechLang } from '../../../utils/studyCatalog';
import { loadPrefs } from '../../../utils/studyPrefs';
import { canSpeak, speak, stopSpeaking } from '../../../utils/studyVoice';
import { useStudy } from '../StudyContext';
import { backStudy, goStudy, replaceStudy } from '../studyStore';
import { hasRoute, type PageProps } from '../StudyApp';
import { Btn, Chip, ErrorBox, Head, Loading, Sheet } from '../ui';

const MAX = 50000;
type SaveState = 'saved' | 'saving' | 'dirty' | 'error';

// Writing one note. It saves itself a moment after the student stops typing, and again when they leave, so nothing is lost. Notes are private.
const Note: React.FC<PageProps> = ({ params }) => {
  const { subjects, me, toast } = useStudy();
  const [noteId, setNoteId] = useState<string | null>(typeof params.id === 'string' && params.id ? params.id : null);
  const [loaded, setLoaded] = useState(!noteId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [subjectId, setSubjectId] = useState<string | null>(typeof params.subject === 'string' ? params.subject : null);
  const [pinned, setPinned] = useState(false);
  const [state, setState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reading, setReading] = useState(false);
  const ref = useRef(newRef());
  const idRef = useRef<string | null>(noteId);
  const latest = useRef({ title, body, subjectId, pinned });
  latest.current = { title, body, subjectId, pinned };
  const dirty = useRef(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<number | null>(null);
  const gone = useRef(false);

  useEffect(() => {
    if (!noteId) return;
    let alive = true;
    void studyApi.note(noteId).then((r) => {
      if (!alive) return;
      if (!r.ok) { setLoadError(r.error); return; }
      setTitle(r.data.title); setBody(r.data.body); setSubjectId(r.data.subjectId); setPinned(r.data.pinned); setLoaded(true);
    });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // one save at a time; if the student typed more while it was saving, another save follows straight away
  const flush = useCallback(async (): Promise<void> => {
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; }
    if (inFlight.current) { await inFlight.current; }
    if (!dirty.current || gone.current) return;
    const snap = latest.current;
    if (!idRef.current && !snap.title.trim() && !snap.body.trim()) { dirty.current = false; setState('saved'); return; }   // an empty new note is never saved
    dirty.current = false;
    setState('saving');
    let failed = false;
    const job = (async () => {
      const r = await studyApi.saveNote({ id: idRef.current || undefined, clientRef: idRef.current ? undefined : ref.current, title: snap.title, body: snap.body, subjectId: snap.subjectId, pinned: snap.pinned });
      if (!r.ok) { failed = true; dirty.current = true; setSaveError(r.error); setState('error'); return; }
      idRef.current = r.data.id; setNoteId(r.data.id);
      setSaveError(null);
      setState(dirty.current ? 'dirty' : 'saved');
    })();
    inFlight.current = job;
    await job;
    inFlight.current = null;
    if (dirty.current && !gone.current && !failed) await flush();
  }, []);

  const touch = () => {
    dirty.current = true; setState('dirty');
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void flush(); }, 1200);
  };
  useEffect(() => {
    const hide = () => { if (document.visibilityState === 'hidden') void flush(); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', hide);
    return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', hide); if (!gone.current && dirty.current) void flush(); stopSpeaking(); };
  }, [flush]);

  const leave = async () => { await flush(); backStudy(); };
  const remove = async () => {
    gone.current = true;
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (inFlight.current) await inFlight.current;
    if (idRef.current) {
      const r = await studyApi.deleteNote(idRef.current);
      if (!r.ok) { gone.current = false; toast(r.error); setConfirmDelete(false); return; }
    }
    toast('Note deleted.');
    replaceStudy('notes');
  };
  const read = () => {
    if (reading) { stopSpeaking(); setReading(false); return; }
    const p = loadPrefs().studyVoice;
    setReading(true);
    speak((title ? title + '. ' : '') + body, speechLang(me?.profile?.tutor?.language || me?.profile?.language), { preferredVoice: p.name, rate: p.rate, pitch: p.pitch, onEnd: () => setReading(false) });
  };

  if (loadError) return <><Head title="Note" /><div className="st-scroll"><div className="st-wrap"><ErrorBox text={loadError} /></div></div></>;
  if (!loaded) return <><Head title="Note" /><div className="st-scroll"><div className="st-wrap"><Loading rows={2} /></div></div></>;

  const status = state === 'saving' ? 'Saving…' : state === 'dirty' ? 'Typing…' : state === 'error' ? 'Not saved' : (idRef.current ? 'Saved' : 'New note');
  return (
    <>
      <Head title={title || 'New note'} subtitle={status} onBack={() => void leave()}
        right={<>
          <button className="st-icon-btn" aria-label={pinned ? 'Unpin note' : 'Pin note'} onClick={() => { setPinned(!pinned); touch(); }}>{pinned ? <PinOff size={17} /> : <Pin size={17} />}</button>
        </>} />
      <div className="st-scroll">
        <div className="st-wrap" style={{ display: 'grid', gap: 12 }}>
          {saveError && <ErrorBox text={saveError} onRetry={() => { dirty.current = true; void flush(); }} />}
          <input className="st-input" placeholder="Title" value={title} maxLength={140} onChange={(e) => { setTitle(e.target.value); touch(); }} aria-label="Title" style={{ fontWeight: 800, fontSize: 17 }} />
          {subjects.length > 0 && (
            <div className="st-hscroll" role="group" aria-label="Subject">
              <Chip on={subjectId === null} onClick={() => { setSubjectId(null); touch(); }}>No subject</Chip>
              {subjects.map((s) => <Chip key={s.id} on={subjectId === s.id} onClick={() => { setSubjectId(s.id); touch(); }}>{s.name}</Chip>)}
            </div>
          )}
          <textarea className="st-input" style={{ minHeight: '46vh', lineHeight: 1.6, resize: 'vertical' }} placeholder="Write here…" value={body} maxLength={MAX} onChange={(e) => { setBody(e.target.value); touch(); }} aria-label="Note" autoFocus={!noteId} />
          <p className="st-tiny st-faint" style={{ textAlign: 'right' }}>{body.length.toLocaleString()} / {MAX.toLocaleString()}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canSpeak() && body.trim() && <Btn small onClick={read}>{reading ? <><Square size={14} /> Stop</> : <><Volume2 size={14} /> Read it to me</>}</Btn>}
            {hasRoute('chat') && body.trim() && <Btn small onClick={() => goStudy('chat', { seed: 'Please help me understand and revise these notes of mine:\n\n' + body.slice(0, 4000), subject: subjectId || undefined })}><MessageCircle size={14} /> Ask the tutor</Btn>}
            {idRef.current && <Btn small kind="warn" onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> Delete</Btn>}
          </div>
          <p className="st-tiny st-faint">Private to you. If you ask the tutor about a note, the part you send goes to the AI like any other question.</p>
        </div>
      </div>
      {confirmDelete && (
        <Sheet title="Delete this note?" onClose={() => setConfirmDelete(false)}>
          <p className="st-small st-muted">It is removed for good. This cannot be undone.</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Btn kind="ghost" onClick={() => setConfirmDelete(false)}>Keep it</Btn>
            <Btn kind="primary" style={{ flex: 1 }} onClick={() => void remove()}>Delete</Btn>
          </div>
        </Sheet>
      )}
    </>
  );
};
export default Note;
