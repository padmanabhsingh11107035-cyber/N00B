import React, { useCallback, useEffect, useState } from 'react';
import { BookMarked, Layers, Sparkles, Target, Trash2, X } from 'lucide-react';
import { newRef, studyApi } from '../../../services/studyApi';
import { generateQuiz } from '../../../services/studyAi';
import type { StudyMaterial, StudyQuiz } from '../../../utils/studyTypes';
import { useStudy } from '../StudyContext';
import { goStudy } from '../studyStore';
import { hasRoute, type PageProps } from '../StudyApp';
import { Btn, Card, Chip, Empty, ErrorBox, Field, Loading, Page, SubjectTag } from '../ui';

// Practice: make a quiz on a topic (or from the student's own notes), do saved quizzes again, and learn from mistakes. The AI writes the questions and
// the app checks their shape (and the sums); the marking is done by the app, not guessed. Nothing here is shown as a real exam paper.
const COUNTS = [5, 10, 15];
const LEVELS: Array<{ id: 'easy' | 'medium' | 'hard'; label: string }> = [{ id: 'easy', label: 'Easy' }, { id: 'medium', label: 'Medium' }, { id: 'hard', label: 'Hard' }];
const KINDS: Array<{ id: string; label: string }> = [{ id: 'mcq', label: 'Multiple choice' }, { id: 'mixed', label: 'A mix' }, { id: 'short', label: 'Written answers' }, { id: 'numerical', label: 'Numbers' }, { id: 'fill', label: 'Fill the blank' }];

const Practice: React.FC<PageProps> = ({ params }) => {
  const { me, subjects, subjectName, colorOf, toast } = useStudy();
  const lang = me?.profile?.tutor?.language || me?.profile?.language || 'en';
  const [subject, setSubject] = useState<string>(typeof params.subject === 'string' ? params.subject : '');
  const [topic, setTopic] = useState(typeof params.topic === 'string' ? params.topic : '');
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [material, setMaterial] = useState<string>(typeof params.material === 'string' ? params.material : '');
  const [count, setCount] = useState(10);
  const [level, setLevel] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [kind, setKind] = useState('mcq');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quizzes, setQuizzes] = useState<StudyQuiz[] | null>(null);
  const [open, setOpen] = useState<number>(0);
  const [due, setDue] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [z, m, d, mat] = await Promise.all([studyApi.quizzes(null, 40), studyApi.mistakes(null, true, 1), studyApi.decks(null), studyApi.materials(null)]);
    if (!z.ok) { setLoadError(z.error); return; }
    setLoadError(null); setQuizzes(z.data.quizzes);
    if (m.ok) setOpen(m.data.open);
    if (d.ok) setDue(d.data.dueTotal);
    if (mat.ok) setMaterials(mat.data.materials.filter((x) => x.status === 'ready'));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const mat = materials.find((x) => x.id === material);
  const matTitle = mat?.title || (typeof params.materialTitle === 'string' ? params.materialTitle : '');
  const canMake = !busy && (topic.trim().length >= 2 || !!material);

  const make = async () => {
    if (!canMake) return;
    setBusy(true); setError(null);
    const subjectText = subject ? subjectName(subject) : undefined;
    const r = await generateQuiz({ subject: subjectText, topic: topic.trim() || matTitle || undefined, count, difficulty: level, format: kind, materialId: material || null, language: lang });
    if (!r.ok) { setBusy(false); setError(r.error); return; }
    const saved = await studyApi.saveQuiz({ clientRef: newRef(), title: (topic.trim() || matTitle || 'Practice quiz').slice(0, 140), topic: topic.trim().slice(0, 140), subjectId: subject || null, materialId: material || null, difficulty: level, source: 'ai', questions: r.data.questions });
    setBusy(false);
    if (!saved.ok) { setError(saved.error); return; }
    if (r.data.dropped > 0) toast(r.data.dropped + (r.data.dropped === 1 ? ' question' : ' questions') + ' did not pass the checks and were left out.');
    goStudy('quiz', { id: saved.data.id });
  };
  const fromMistakes = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    const r = await studyApi.quizFromMistakes(subject || null, 10);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    goStudy('quiz', { id: r.data.id });
  };
  const remove = async (z: StudyQuiz) => {
    const r = await studyApi.deleteQuiz(z.id);
    if (r.ok) { setQuizzes((q) => (q || []).filter((x) => x.id !== z.id)); toast('Quiz deleted.'); } else toast(r.error);
  };

  return (
    <Page title="Practice" subtitle="Quizzes at your level" hideBack={false}>
      <div style={{ display: 'grid', gap: 16 }}>
        {loadError && <ErrorBox text={loadError} onRetry={() => void load()} />}
        <Card tint>
          <p className="st-title st-h3" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Sparkles size={18} style={{ color: 'var(--st-accent)' }} /> Make a quiz</p>
          <div style={{ display: 'grid', gap: 14, marginTop: 12 }}>
            {subjects.length > 0 && (
              <Field label="Subject"><div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}><Chip on={!subject} onClick={() => setSubject('')}>Any</Chip>{subjects.map((s) => <Chip key={s.id} on={subject === s.id} onClick={() => setSubject(s.id)}>{s.name}</Chip>)}</div></Field>
            )}
            <Field label="Topic"><input className="st-input" value={topic} maxLength={140} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Laws of motion" /></Field>
            {materials.length > 0 && (
              <Field label="From my notes (optional)" hint="Questions are then written only from that document.">
                <div style={{ display: 'flex', gap: 8 }}>
                  <select className="st-input" value={material} onChange={(e) => setMaterial(e.target.value)}><option value="">Not from my notes</option>{materials.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select>
                  {material && <button className="st-icon-btn" onClick={() => setMaterial('')} aria-label="Do not use my notes"><X size={16} /></button>}
                </div>
              </Field>
            )}
            <Field label="How many questions"><div style={{ display: 'flex', gap: 8 }}>{COUNTS.map((n) => <Chip key={n} on={count === n} onClick={() => setCount(n)}>{n}</Chip>)}</div></Field>
            <Field label="How hard"><div style={{ display: 'flex', gap: 8 }}>{LEVELS.map((l) => <Chip key={l.id} on={level === l.id} onClick={() => setLevel(l.id)}>{l.label}</Chip>)}</div></Field>
            <Field label="What kind"><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{KINDS.map((k) => <Chip key={k.id} on={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</Chip>)}</div></Field>
            {error && <ErrorBox text={error} />}
            <Btn kind="primary" busy={busy} disabled={!canMake} onClick={() => void make()}><Target size={17} /> Make my quiz</Btn>
            <p className="st-tiny st-faint">The AI writes the questions and can make mistakes. The app checks that each question is complete, checks the sums, and does the marking.</p>
          </div>
        </Card>

        {open > 0 && (
          <Card>
            <p className="st-title st-h3">{open === 1 ? '1 mistake to learn from' : open + ' mistakes to learn from'}</p>
            <p className="st-small st-muted" style={{ marginTop: 4 }}>Mistakes are how you learn. Practise them until they stop coming back.</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <Btn small kind="primary" busy={busy} onClick={() => void fromMistakes()}>Practise them</Btn>
              {hasRoute('mistakes') && <Btn small kind="ghost" onClick={() => goStudy('mistakes')}><BookMarked size={15} /> See them</Btn>}
            </div>
          </Card>
        )}
        {due > 0 && hasRoute('review') && (
          <Card>
            <p className="st-title st-h3">{due === 1 ? '1 flashcard is ready' : due + ' flashcards are ready'}</p>
            <div style={{ marginTop: 10 }}><Btn small onClick={() => goStudy('review')}><Layers size={15} /> Review them</Btn></div>
          </Card>
        )}

        <div style={{ display: 'grid', gap: 10 }}>
          <p className="st-label">Your quizzes</p>
          {!quizzes && !loadError && <Loading rows={2} />}
          {quizzes && quizzes.length === 0 && <Empty icon={<Target size={26} />} title="No quizzes yet" text="Make your first one above. It is saved here so you can do it again later." />}
          {quizzes?.map((z) => (
            <div key={z.id} className="st-card-flat" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => goStudy('quiz', { id: z.id })} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 0, color: 'inherit', padding: 0, cursor: 'pointer' }}>
                <span className="st-title st-h3" style={{ display: 'block', overflowWrap: 'anywhere' }}>{z.title}</span>
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 5 }}>
                  {z.subjectId && <SubjectTag name={subjectName(z.subjectId)} color={colorOf(z.subjectId)} />}
                  <span className="st-tiny st-muted">{z.count} questions{z.source === 'mistakes' ? ' · from mistakes' : ''}{z.attempts ? ' · done ' + z.attempts + (z.attempts === 1 ? ' time' : ' times') + (z.best != null ? ' · best ' + z.best + '%' : '') : ' · not tried yet'}</span>
                </span>
              </button>
              <button className="st-icon-btn" onClick={() => void remove(z)} aria-label={'Delete ' + z.title} style={{ width: 36, height: 36 }}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      </div>
    </Page>
  );
};
export default Practice;
