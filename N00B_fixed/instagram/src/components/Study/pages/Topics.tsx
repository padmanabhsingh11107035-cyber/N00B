import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardList, MessageCircle, Plus, Target, Trash2 } from 'lucide-react';
import { studyApi } from '../../../services/studyApi';
import type { StudyTopic } from '../../../utils/studyTypes';
import { useStudy } from '../StudyContext';
import { goStudy } from '../studyStore';
import { hasRoute, type PageProps } from '../StudyApp';
import { Btn, Card, Chip, Empty, ErrorBox, Field, Loading, Page, ProgressBar, Sheet } from '../ui';

// A subject's topics: the student's OWN list (typed or pasted from their syllabus or the index of their book). NOOB STUDY never invents an official
// syllabus. The student marks where each topic stands, honestly, and the bar shows how much is confident.
const STATUS: Array<{ id: StudyTopic['status']; label: string }> = [{ id: 'not_started', label: 'Not started' }, { id: 'learning', label: 'Learning' }, { id: 'confident', label: 'Confident' }];

const Topics: React.FC<PageProps> = ({ params }) => {
  const { subjects, subjectName, toast } = useStudy();
  const [subjectId, setSubjectId] = useState<string>(typeof params.subject === 'string' ? params.subject : subjects[0]?.id || '');
  const [topics, setTopics] = useState<StudyTopic[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [paste, setPaste] = useState(false);

  const load = useCallback(async () => {
    if (!subjectId) return;
    const r = await studyApi.topics(subjectId);
    if (r.ok) { setTopics(r.data.topics); setError(null); } else setError(r.error);
  }, [subjectId]);
  useEffect(() => { setTopics(null); void load(); }, [load]);

  const add = async () => {
    const t = title.trim();
    if (!t || adding) return;
    setAdding(true);
    const r = await studyApi.saveTopic({ subjectId, title: t });
    setAdding(false);
    if (!r.ok) { toast(r.error); return; }
    setTitle(''); setTopics((l) => [...(l || []), r.data]);
  };
  const setStatus = async (t: StudyTopic, status: StudyTopic['status']) => {
    if (t.status === status) return;
    setTopics((l) => (l || []).map((x) => (x.id === t.id ? { ...x, status } : x)));
    const r = await studyApi.saveTopic({ id: t.id, status });
    if (!r.ok) { toast(r.error); void load(); }
  };
  const remove = async (t: StudyTopic) => {
    const r = await studyApi.deleteTopic(t.id);
    if (r.ok) setTopics((l) => (l || []).filter((x) => x.id !== t.id)); else toast(r.error);
  };

  const confident = (topics || []).filter((t) => t.status === 'confident').length;
  const learning = (topics || []).filter((t) => t.status === 'learning').length;
  const name = subjectId ? subjectName(subjectId) : '';
  return (
    <Page title="Topics" subtitle={name || 'Choose a subject'} right={<Btn small kind="ghost" onClick={() => setPaste(true)} disabled={!subjectId}><ClipboardList size={15} /> Paste a list</Btn>}>
      <div style={{ display: 'grid', gap: 14 }}>
        {subjects.length > 1 && (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>{subjects.map((s) => <Chip key={s.id} on={subjectId === s.id} onClick={() => setSubjectId(s.id)}>{s.name}</Chip>)}</div>
        )}
        {error && <ErrorBox text={error} onRetry={() => void load()} />}
        {!subjectId && <Empty title="Add a subject first" text="Topics belong to a subject. Add your subjects from the Subjects tab." />}
        {subjectId && (
          <>
            {topics && topics.length > 0 && (
              <Card tint>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span className="st-title st-h3">{confident} of {topics.length} confident</span>
                  <span className="st-small st-muted">{learning} learning</span>
                </div>
                <div style={{ marginTop: 10 }}><ProgressBar value={(confident / topics.length) * 100} label="Topics you are confident in" /></div>
              </Card>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="st-input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add(); }} placeholder="Add a topic, like Laws of motion" aria-label="New topic" />
              <Btn kind="primary" busy={adding} disabled={!title.trim()} onClick={() => void add()} aria-label="Add the topic"><Plus size={16} /></Btn>
            </div>
            {!topics && !error && <Loading rows={3} />}
            {topics && topics.length === 0 && (
              <Empty icon={<ClipboardList size={26} />} title="No topics yet" text="Write the topics of this subject, from your syllabus or the contents page of your book, and mark how each one feels. This is your own list: NOOB STUDY does not make up a syllabus for you." />
            )}
            {topics?.map((t) => (
              <Card key={t.id}>
                <p className="st-title st-h3" style={{ overflowWrap: 'anywhere' }}>{t.title}</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }} role="radiogroup" aria-label={'How ' + t.title + ' feels'}>
                  {STATUS.map((s) => <Chip key={s.id} on={t.status === s.id} onClick={() => void setStatus(t, s.id)}>{s.label}</Chip>)}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {hasRoute('chat') && <Btn small kind="ghost" onClick={() => goStudy('chat', { seed: 'Explain ' + t.title + ' in ' + name + ' in simple words, with one example.', subject: subjectId })}><MessageCircle size={14} /> Learn it</Btn>}
                  {hasRoute('practice') && <Btn small kind="ghost" onClick={() => goStudy('practice', { subject: subjectId, topic: t.title })}><Target size={14} /> Quiz me</Btn>}
                  <button className="st-icon-btn" onClick={() => void remove(t)} aria-label={'Remove ' + t.title} style={{ width: 34, height: 34, borderRadius: 11 }}><Trash2 size={14} /></button>
                </div>
              </Card>
            ))}
          </>
        )}
      </div>
      {paste && <PasteTopics subjectId={subjectId} onClose={() => setPaste(false)} onDone={(n) => { setPaste(false); toast(n + (n === 1 ? ' topic added.' : ' topics added.')); void load(); }} />}
    </Page>
  );
};

const PasteTopics: React.FC<{ subjectId: string; onClose: () => void; onDone: (added: number) => void }> = ({ subjectId, onClose, onDone }) => {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const lines = text.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean).slice(0, 100);
    if (!lines.length) { setError('Please paste at least one topic.'); return; }
    setBusy(true); setError(null);
    const r = await studyApi.addTopics(subjectId, lines);
    setBusy(false);
    if (r.ok) onDone(r.data.added); else setError(r.error);
  };
  return (
    <Sheet title="Paste a list of topics" onClose={busy ? () => undefined : onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label="One topic on each line" hint="Numbers and bullets at the start are removed. Up to 100 at a time."><textarea className="st-input" value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 170 }} placeholder={'1. Laws of motion\n2. Work and energy\n3. Gravitation'} /></Field>
        {error && <div className="st-notice st-notice-warn" role="alert">{error}</div>}
        <Btn kind="primary" busy={busy} onClick={() => void save()}>Add these topics</Btn>
      </div>
    </Sheet>
  );
};
export default Topics;
