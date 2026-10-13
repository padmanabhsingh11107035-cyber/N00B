import React, { useCallback, useEffect, useState } from 'react';
import { Check, Layers, MessageCircle, RotateCcw, Target, Trash2 } from 'lucide-react';
import { newRef, studyApi } from '../../../services/studyApi';
import type { StudyMistake } from '../../../utils/studyTypes';
import { useStudy } from '../StudyContext';
import { goStudy } from '../studyStore';
import { hasRoute, type PageProps } from '../StudyApp';
import { InlineText, Markdown } from '../Markdown';
import { Btn, Card, Chip, Empty, ErrorBox, Loading, Page, SubjectTag } from '../ui';

// Mistakes are the most useful thing a student has. Here they are kept kindly: the question, the right answer, why, and a way to practise them until
// they leave the list. "I know this now" moves one to the learnt pile (it can be brought back); answering it right in a quiz does that too.
const Mistakes: React.FC<PageProps> = ({ params }) => {
  const { subjects, subjectName, colorOf, toast } = useStudy();
  const [subject, setSubject] = useState<string>(typeof params.subject === 'string' ? params.subject : '');
  const [showLearnt, setShowLearnt] = useState(false);
  const [list, setList] = useState<StudyMistake[] | null>(null);
  const [open, setOpen] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await studyApi.mistakes(subject || null, !showLearnt, 60);
    if (r.ok) { setList(r.data.mistakes); setOpen(r.data.open); setError(null); } else setError(r.error);
  }, [subject, showLearnt]);
  useEffect(() => { setList(null); void load(); }, [load]);

  const toggle = async (m: StudyMistake) => {
    const r = await studyApi.resolveMistake(m.id, !m.resolved);
    if (!r.ok) { toast(r.error); return; }
    toast(m.resolved ? 'Back on the list.' : 'Moved to what you have learnt. Well done.');
    void load();
  };
  const remove = async (m: StudyMistake) => {
    const r = await studyApi.deleteMistake(m.id);
    if (r.ok) { setList((l) => (l || []).filter((x) => x.id !== m.id)); toast('Removed.'); } else toast(r.error);
  };
  const practise = async () => {
    if (busy) return;
    setBusy(true);
    const r = await studyApi.quizFromMistakes(subject || null, 10);
    setBusy(false);
    if (!r.ok) { toast(r.error); return; }
    goStudy('quiz', { id: r.data.id });
  };
  const cards = async () => {
    const mine = (list || []).filter((m) => !m.resolved);
    if (busy || !mine.length) return;
    setBusy(true);
    const d = await studyApi.saveDeck({ clientRef: newRef(), title: 'My mistakes' + (subject ? ': ' + subjectName(subject) : ''), subjectId: subject || null });
    if (!d.ok) { setBusy(false); toast(d.error); return; }
    const a = await studyApi.addCards(d.data.id, mine.slice(0, 60).map((m) => ({ front: m.question.slice(0, 300), back: (m.correctAnswer + (m.explanation ? '. ' + m.explanation : '')).slice(0, 600) })));
    setBusy(false);
    if (!a.ok) { toast(a.error); return; }
    toast(a.data.added + (a.data.added === 1 ? ' flashcard made.' : ' flashcards made.'));
    if (hasRoute('deck')) goStudy('deck', { id: d.data.id });
  };

  return (
    <Page title="My mistakes" subtitle={open === 1 ? '1 to learn from' : open + ' to learn from'}>
      <div style={{ display: 'grid', gap: 14 }}>
        {error && <ErrorBox text={error} onRetry={() => void load()} />}
        {subjects.length > 0 && (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
            <Chip on={!subject} onClick={() => setSubject('')}>All</Chip>
            {subjects.map((s) => <Chip key={s.id} on={subject === s.id} onClick={() => setSubject(s.id)}>{s.name}</Chip>)}
          </div>
        )}
        <div className="st-notice"><p className="st-small">A mistake is not a failure. It is the exact thing that is worth learning next. Practise these and they will leave this list.</p></div>
        {open > 0 && !showLearnt && (
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
            <Btn kind="primary" busy={busy} onClick={() => void practise()}><Target size={16} /> Practise</Btn>
            {hasRoute('decks') ? <Btn busy={busy} onClick={() => void cards()}><Layers size={16} /> Flashcards</Btn> : <span />}
          </div>
        )}
        {!list && !error && <Loading rows={3} />}
        {list && list.length === 0 && (
          <Empty icon={<Check size={28} />} title={showLearnt ? 'Nothing learnt yet' : 'No mistakes right now'} text={showLearnt ? 'When you answer a mistake right, or tell us you know it now, it appears here.' : 'When you get an answer wrong in a quiz it will appear here, with the right answer and why. That is good news for now.'}
            action={hasRoute('practice') ? <Btn small kind="primary" onClick={() => goStudy('practice')}>Do a quiz</Btn> : undefined} />
        )}
        {list?.map((m) => (
          <Card key={m.id}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
              {m.subjectId && <SubjectTag name={subjectName(m.subjectId)} color={colorOf(m.subjectId)} />}
              {m.wrongCount > 1 && <span className="st-pill">missed {m.wrongCount} times</span>}
              {m.resolved && <span className="st-pill" style={{ color: 'var(--st-ok)' }}>learnt</span>}
            </div>
            <Markdown text={m.question} />
            {m.studentAnswer && <p className="st-small st-muted" style={{ marginTop: 8, overflowWrap: 'anywhere' }}>You said: {m.studentAnswer}</p>}
            <p className="st-small" style={{ marginTop: 6, overflowWrap: 'anywhere' }}>Right answer: <b><InlineText text={m.correctAnswer} /></b></p>
            {m.explanation && <details style={{ marginTop: 8 }}><summary className="st-small" style={{ cursor: 'pointer' }}>Why</summary><div style={{ marginTop: 6 }}><Markdown text={m.explanation} /></div></details>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <Btn small onClick={() => void toggle(m)}>{m.resolved ? <><RotateCcw size={14} /> Bring back</> : <><Check size={14} /> I know this now</>}</Btn>
              {hasRoute('chat') && <Btn small kind="ghost" onClick={() => goStudy('chat', { seed: 'Please explain this to me step by step, and why the right answer is right: ' + m.question + '\nRight answer: ' + m.correctAnswer, subject: m.subjectId || undefined })}><MessageCircle size={14} /> Explain</Btn>}
              <button className="st-icon-btn" onClick={() => void remove(m)} aria-label="Remove this mistake" style={{ width: 34, height: 34, borderRadius: 11 }}><Trash2 size={14} /></button>
            </div>
          </Card>
        ))}
        <Btn kind="ghost" small onClick={() => setShowLearnt((v) => !v)}>{showLearnt ? 'Show what I still need to learn' : 'Show what I have learnt'}</Btn>
      </div>
    </Page>
  );
};
export default Mistakes;
