import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CircleHelp, Layers, MessageCircle, RotateCw, Target, Trophy, X } from 'lucide-react';
import { newRef, studyApi } from '../../../services/studyApi';
import { answerText, checkObjective, isOpenQuestion, percentMessage, QUESTION_LABEL } from '../../../utils/studyQuiz';
import type { QuizAttemptResult, QuizQuestion, StudyQuiz } from '../../../utils/studyTypes';
import { useStudy } from '../StudyContext';
import { backStudy, goStudy, replaceStudy } from '../studyStore';
import { hasRoute, type PageProps } from '../StudyApp';
import { InlineText, Markdown } from '../Markdown';
import { Btn, Card, Chip, ErrorBox, Head, Loading, ProgressBar, Sheet, SubjectTag } from '../ui';

// Doing a quiz, one question at a time, calmly. After each answer the student sees whether it was right and WHY. Written answers are marked by the
// student against the model answer (honestly: not yet, partly, got it). The real marking is saved by the database, which also files wrong answers
// under "mistakes". Nothing here is timed or ranked against anyone.
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
type Phase = 'intro' | 'run' | 'done';

const Quiz: React.FC<PageProps> = ({ params }) => {
  const { subjectName, colorOf, toast } = useStudy();
  const id = String(params.id || '');
  const [quiz, setQuiz] = useState<StudyQuiz | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<unknown[]>([]);
  const [revealed, setRevealed] = useState<boolean[]>([]);
  const [marks, setMarks] = useState<Record<number, number>>({});
  const [result, setResult] = useState<QuizAttemptResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [leave, setLeave] = useState(false);
  const [busy, setBusy] = useState(false);
  const started = useRef(0);
  const attemptRef = useRef(newRef());

  useEffect(() => {
    let alive = true;
    void studyApi.quiz(id).then((r) => { if (!alive) return; if (r.ok) setQuiz(r.data); else setError(r.error); });
    return () => { alive = false; };
  }, [id]);

  const qs: QuizQuestion[] = quiz?.questions || [];
  const q = qs[idx];
  const start = () => {
    setAnswers(qs.map(() => null)); setRevealed(qs.map(() => false)); setMarks({}); setIdx(0); setResult(null); setSubmitError(null);
    attemptRef.current = newRef(); started.current = Date.now(); setPhase('run');
  };
  const setAnswer = (v: unknown) => setAnswers((a) => a.map((x, i) => (i === idx ? v : x)));
  const reveal = () => setRevealed((r) => r.map((x, i) => (i === idx ? true : x)));
  const finish = async () => {
    if (!quiz || submitting) return;
    setSubmitting(true); setSubmitError(null);
    const r = await studyApi.submitAttempt(quiz.id, answers.map((a) => (a === undefined ? null : a)), marks, (Date.now() - started.current) / 1000, attemptRef.current);
    setSubmitting(false);
    if (!r.ok) { setSubmitError(r.error); return; }
    setResult(r.data); setPhase('done');
  };
  const next = () => { if (idx + 1 >= qs.length) void finish(); else setIdx(idx + 1); };

  const answered = (() => {
    if (!q) return false;
    const a = answers[idx];
    return q.type === 'mcq' ? typeof a === 'number' : q.type === 'tf' ? typeof a === 'boolean' : typeof a === 'string' && a.trim() !== '';
  })();
  const open = q ? isOpenQuestion(q) : false;
  const rev = !!revealed[idx];
  const right = q && rev && !open ? checkObjective(q, answers[idx]) : null;
  const canNext = rev && (!open || marks[idx] !== undefined);

  const onBack = () => { if (phase === 'run' && answers.some((a) => a !== null)) setLeave(true); else backStudy(); };

  const wrongOnes = useMemo(() => (result && quiz ? qs.map((qq, i) => ({ qq, i, r: result.results[i] })).filter((x) => x.r && x.r.correct === false) : []), [result, quiz]); // eslint-disable-line react-hooks/exhaustive-deps
  const practiseMistakes = async () => {
    if (busy || !quiz) return;
    setBusy(true);
    const r = await studyApi.quizFromMistakes(quiz.subjectId, 10);
    setBusy(false);
    if (!r.ok) { toast(r.error); return; }
    replaceStudy('quiz', { id: r.data.id });
  };
  const makeCards = async () => {
    if (busy || !quiz || !wrongOnes.length) return;
    setBusy(true);
    const d = await studyApi.saveDeck({ clientRef: newRef(), title: ('Mistakes: ' + quiz.title).slice(0, 100), subjectId: quiz.subjectId });
    if (!d.ok) { setBusy(false); toast(d.error); return; }
    const a = await studyApi.addCards(d.data.id, wrongOnes.map(({ qq }) => ({ front: qq.question.slice(0, 300), back: (answerText(qq) + (qq.explanation ? '. ' + qq.explanation : '')).slice(0, 600) })));
    setBusy(false);
    if (!a.ok) { toast(a.error); return; }
    toast(a.data.added + (a.data.added === 1 ? ' flashcard made.' : ' flashcards made.'));
    if (hasRoute('deck')) goStudy('deck', { id: d.data.id });
  };

  if (error) return <><Head title="Quiz" /><div className="st-scroll"><div className="st-wrap"><ErrorBox text={error} /></div></div></>;
  if (!quiz) return <><Head title="Quiz" /><div className="st-scroll"><div className="st-wrap"><Loading rows={3} /></div></div></>;

  return (
    <>
      <Head title={quiz.title} subtitle={phase === 'run' ? 'Question ' + (idx + 1) + ' of ' + qs.length : phase === 'done' ? 'Your result' : qs.length + ' questions'} onBack={onBack} />
      <div className="st-scroll">
        <div className="st-wrap" style={{ display: 'grid', gap: 14 }}>

          {phase === 'intro' && (
            <>
              <Card tint>
                <p className="st-title st-h2">{quiz.title}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 8 }}>
                  {quiz.subjectId && <SubjectTag name={subjectName(quiz.subjectId)} color={colorOf(quiz.subjectId)} />}
                  <span className="st-small st-muted">{qs.length} questions · {quiz.difficulty === 'mixed' ? 'mixed levels' : quiz.difficulty}</span>
                </div>
                {quiz.attempts > 0 && <p className="st-small st-muted" style={{ marginTop: 8 }}>Done {quiz.attempts} {quiz.attempts === 1 ? 'time' : 'times'}{quiz.best != null ? '. Best: ' + quiz.best + '%' : ''}.</p>}
              </Card>
              <div className="st-notice"><p className="st-small">Take your time. There is no clock and nobody sees your answers. After each question you will see why the answer is right.</p></div>
              <Btn kind="primary" onClick={start}><Target size={17} /> {quiz.attempts > 0 ? 'Do it again' : 'Start'}</Btn>
            </>
          )}

          {phase === 'run' && q && (
            <>
              <ProgressBar value={((idx + (rev ? 1 : 0)) / qs.length) * 100} label="Quiz progress" />
              <Card>
                <p className="st-tiny st-faint">{QUESTION_LABEL[q.type] || 'Question'}{q.type === 'short' || q.type === 'case' ? ' · ' + (q.marks || 1) + (q.marks === 1 || !q.marks ? ' mark' : ' marks') : ''}</p>
                <div style={{ marginTop: 6 }}><Markdown text={q.question} /></div>
              </Card>

              {q.type === 'mcq' && (
                <div style={{ display: 'grid', gap: 8 }} role="radiogroup" aria-label="Choose one answer">
                  {(q.options || []).map((o, i) => {
                    const chosen = answers[idx] === i;
                    const isRight = rev && i === q.answer;
                    const isWrong = rev && chosen && i !== q.answer;
                    return (
                      <button key={i} role="radio" aria-checked={chosen} disabled={rev} onClick={() => setAnswer(i)} className="st-row-btn"
                        style={{ textAlign: 'left', borderColor: isRight ? 'var(--st-ok)' : isWrong ? 'var(--st-warn)' : chosen ? 'var(--st-accent)' : undefined, background: isRight ? 'rgba(80,200,140,.12)' : isWrong ? 'rgba(255,170,90,.1)' : undefined }}>
                        <span className="st-pill" style={{ flex: 'none' }}>{LETTERS[i]}</span>
                        <span style={{ minWidth: 0, flex: 1, overflowWrap: 'anywhere' }}><InlineText text={o} /></span>
                        {isRight && <Check size={18} style={{ color: 'var(--st-ok)', flex: 'none' }} />}
                        {isWrong && <X size={18} style={{ color: 'var(--st-warn)', flex: 'none' }} />}
                      </button>
                    );
                  })}
                </div>
              )}
              {q.type === 'tf' && (
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }} role="radiogroup" aria-label="True or false">
                  {[true, false].map((v) => {
                    const chosen = answers[idx] === v;
                    const isRight = rev && v === q.answer;
                    const isWrong = rev && chosen && v !== q.answer;
                    return <button key={String(v)} role="radio" aria-checked={chosen} disabled={rev} onClick={() => setAnswer(v)} className="st-row-btn" style={{ justifyContent: 'center', borderColor: isRight ? 'var(--st-ok)' : isWrong ? 'var(--st-warn)' : chosen ? 'var(--st-accent)' : undefined }}>{v ? 'True' : 'False'}</button>;
                  })}
                </div>
              )}
              {(q.type === 'numerical' || q.type === 'fill') && (
                <div>
                  <input className="st-input" inputMode={q.type === 'numerical' ? 'decimal' : 'text'} disabled={rev} value={typeof answers[idx] === 'string' ? (answers[idx] as string) : ''} onChange={(e) => setAnswer(e.target.value)}
                    placeholder={q.type === 'numerical' ? 'Type the number' + (q.unit ? ' (in ' + q.unit + ')' : '') : 'Type the missing word'} aria-label="Your answer" maxLength={200} />
                </div>
              )}
              {open && (
                <textarea className="st-input" disabled={rev} value={typeof answers[idx] === 'string' ? (answers[idx] as string) : ''} onChange={(e) => setAnswer(e.target.value)} placeholder="Write your answer in your own words" aria-label="Your answer" style={{ minHeight: 120 }} maxLength={1500} />
              )}

              {!rev && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <Btn kind="ghost" onClick={() => { setAnswer(null); reveal(); }}><CircleHelp size={16} /> I am not sure</Btn>
                  <Btn kind="primary" style={{ flex: 1 }} disabled={!answered} onClick={reveal}>{open ? 'Show the model answer' : 'Check my answer'}</Btn>
                </div>
              )}

              {rev && (
                <div style={{ display: 'grid', gap: 10 }}>
                  {!open && (
                    <div className="st-notice" role="status" style={{ borderColor: right ? 'var(--st-ok)' : 'var(--st-warn)' }}>
                      <p className="st-title st-h3">{marks[idx] === 1 ? 'Marked right by you' : right ? 'Right. Well done.' : answered ? 'Not quite. That is how we learn.' : 'No problem. Here is the answer.'}</p>
                      {!right && <p className="st-small" style={{ marginTop: 4 }}>The answer: <b><InlineText text={answerText(q)} /></b></p>}
                    </div>
                  )}
                  {open && (
                    <Card>
                      <p className="st-label">A model answer</p>
                      <div style={{ marginTop: 6 }}><Markdown text={String(q.answer)} /></div>
                      <p className="st-small st-muted" style={{ marginTop: 10 }}>Compare it with yours. How did you do?</p>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {[{ v: 0, t: 'Not yet' }, { v: 0.5, t: 'Partly' }, { v: 1, t: 'Got it' }].map((m) => <Chip key={m.v} on={marks[idx] === m.v} onClick={() => setMarks((x) => ({ ...x, [idx]: m.v }))}>{m.t}</Chip>)}
                      </div>
                    </Card>
                  )}
                  {q.type === 'fill' && !right && marks[idx] === undefined && answered && (
                    <Chip onClick={() => setMarks((x) => ({ ...x, [idx]: 1 }))}>My answer is right too (spelling or another word)</Chip>
                  )}
                  <Card>
                    <p className="st-label">Why</p>
                    <div style={{ marginTop: 6 }}><Markdown text={q.explanation} /></div>
                    {q.steps && q.steps.length > 0 && <ol className="st-small st-muted" style={{ margin: '10px 0 0', paddingLeft: 20, display: 'grid', gap: 4 }}>{q.steps.map((s, i) => <li key={i}><InlineText text={s} /></li>)}</ol>}
                  </Card>
                  {submitError && <ErrorBox text={submitError} onRetry={() => void finish()} />}
                  <Btn kind="primary" busy={submitting} disabled={!canNext} onClick={next}>{idx + 1 >= qs.length ? 'See my result' : 'Next question'}</Btn>
                </div>
              )}
            </>
          )}

          {phase === 'done' && result && (
            <>
              <Card tint style={{ textAlign: 'center' }}>
                <Trophy size={30} style={{ color: 'var(--st-accent)', margin: '0 auto' }} />
                <p className="st-title" style={{ fontSize: 44, lineHeight: 1.1, marginTop: 8 }}>{result.percent}%</p>
                <p className="st-small st-muted" style={{ marginTop: 4 }}>{result.score} out of {result.max} marks</p>
                <p className="st-small" style={{ marginTop: 10 }}>{percentMessage(result.percent)}</p>
              </Card>
              {wrongOnes.length > 0 && (
                <div className="st-notice"><p className="st-small">{wrongOnes.length === 1 ? 'One answer' : wrongOnes.length + ' answers'} went to your list of mistakes. Practise {wrongOnes.length === 1 ? 'it' : 'them'} and they will leave the list.</p></div>
              )}
              <div style={{ display: 'grid', gap: 8 }}>
                {wrongOnes.length > 0 && <Btn kind="primary" busy={busy} onClick={() => void practiseMistakes()}><Target size={16} /> Practise my mistakes</Btn>}
                {wrongOnes.length > 0 && hasRoute('decks') && <Btn busy={busy} onClick={() => void makeCards()}><Layers size={16} /> Make flashcards from them</Btn>}
                <Btn onClick={start}><RotateCw size={16} /> Try this quiz again</Btn>
                <Btn kind="ghost" onClick={() => goStudy('practice')}>Back to practice</Btn>
              </div>
              <p className="st-label" style={{ marginTop: 6 }}>Each question</p>
              {qs.map((qq, i) => {
                const r = result.results[i];
                const good = r?.correct === true;
                const a = answers[i];
                const shown = qq.type === 'mcq' ? (typeof a === 'number' ? (qq.options || [])[a] : '') : qq.type === 'tf' ? (typeof a === 'boolean' ? (a ? 'True' : 'False') : '') : typeof a === 'string' ? a : '';
                return (
                  <Card key={i}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ width: 26, height: 26, borderRadius: 99, display: 'grid', placeItems: 'center', flex: 'none', background: good ? 'rgba(80,200,140,.18)' : r?.correct === false ? 'rgba(255,170,90,.18)' : 'var(--st-surface2)', color: good ? 'var(--st-ok)' : 'var(--st-warn)' }}>{good ? <Check size={15} /> : r?.correct === false ? <X size={15} /> : <CircleHelp size={15} />}</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <Markdown text={qq.question} />
                        <p className="st-small st-muted" style={{ marginTop: 8, overflowWrap: 'anywhere' }}>Your answer: {shown || 'none'}</p>
                        {!good && <p className="st-small" style={{ marginTop: 4, overflowWrap: 'anywhere' }}>Right answer: <b><InlineText text={answerText(qq)} /></b></p>}
                        <details style={{ marginTop: 8 }}><summary className="st-small" style={{ cursor: 'pointer' }}>Why</summary><div style={{ marginTop: 6 }}><Markdown text={qq.explanation} /></div></details>
                        {!good && hasRoute('chat') && <div style={{ marginTop: 8 }}><Btn small kind="ghost" onClick={() => goStudy('chat', { seed: 'Please explain this question step by step, and why the right answer is right: ' + qq.question + '\nRight answer: ' + answerText(qq), subject: quiz.subjectId || undefined })}><MessageCircle size={14} /> Ask the tutor</Btn></div>}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </>
          )}
        </div>
      </div>
      {leave && (
        <Sheet title="Leave this quiz?" onClose={() => setLeave(false)}>
          <p className="st-small st-muted">Your answers so far will not be saved. You can start the quiz again any time.</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Btn kind="ghost" onClick={() => setLeave(false)}>Keep going</Btn>
            <Btn kind="primary" style={{ flex: 1 }} onClick={() => { setLeave(false); backStudy(); }}>Leave</Btn>
          </div>
        </Sheet>
      )}
    </>
  );
};
export default Quiz;
