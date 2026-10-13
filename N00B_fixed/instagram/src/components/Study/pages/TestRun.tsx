import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Layers, MessageCircle, Trophy, X } from 'lucide-react';
import { newRef, studyApi } from '../../../services/studyApi';
import { useStudy } from '../StudyContext';
import { backStudy, goStudy, replaceStudy } from '../studyStore';
import { hasRoute, type PageProps } from '../StudyApp';
import { InlineText, Markdown } from '../Markdown';
import { Btn, Card, ErrorBox, Head, Loading, ProgressBar, Sheet, SubjectTag, subjectColor, colorVars } from '../ui';
import { clearDraft, fmtWhen, loadDraft, saveDraft, testMessage } from './testsCommon';

type TestData = Extract<Awaited<ReturnType<typeof studyApi.test>>, { ok: true }>['data'];
type Submitted = Extract<Awaited<ReturnType<typeof studyApi.submitTest>>, { ok: true }>['data'];
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

// Taking this week's test: one question at a time, any order, change an answer until you hand in. The marks are worked out by the database. The right
// answers and the reasons are shown ONCE after handing in (the test's questions are removed from NOOB when it is handed in), so there is a way to keep
// the missed ones as flashcards.
const TestRun: React.FC<PageProps> = ({ params }) => {
  const { me, toast } = useStudy();
  const id = String(params.id || '');
  const [test, setTest] = useState<TestData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Array<number | null>>([]);
  const [confirm, setConfirm] = useState(false);
  const [leave, setLeave] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<Submitted | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(Date.now());

  useEffect(() => {
    let alive = true;
    void studyApi.test(id).then((r) => {
      if (!alive) return;
      if (!r.ok) { setError(r.error); return; }
      setTest(r.data);
      if (r.data.questions) setAnswers(loadDraft(id, r.data.questions.length));
    });
    return () => { alive = false; };
  }, [id]);

  const qs = test?.questions || [];
  const q = qs[idx];
  const answeredCount = answers.filter((a) => a !== null).length;
  const pick = (i: number) => setAnswers((a) => { const n = a.map((x, k) => (k === idx ? i : x)); saveDraft(id, n); return n; });

  const submit = async () => {
    if (!test || submitting) return;
    setSubmitting(true); setSubmitError(null);
    const r = await studyApi.submitTest(test.id, answers, (Date.now() - started.current) / 1000);
    setSubmitting(false);
    if (!r.ok) { setSubmitError(r.error); setConfirm(false); return; }
    clearDraft(id);
    setConfirm(false);
    setResult(r.data);
  };

  const missed = useMemo(() => (result ? result.review.filter((x) => !x.correct) : []), [result]);
  const makeCards = async () => {
    if (busy || !test || !missed.length) return;
    setBusy(true);
    const d = await studyApi.saveDeck({ clientRef: newRef(), title: ('Missed: ' + test.name).slice(0, 100) });
    if (!d.ok) { setBusy(false); toast(d.error); return; }
    const a = await studyApi.addCards(d.data.id, missed.map((m) => ({ front: m.question.slice(0, 300), back: ((m.options[m.answer] || '') + (m.explanation ? '. ' + m.explanation : '')).slice(0, 600) })));
    setBusy(false);
    if (!a.ok) { toast(a.error); return; }
    toast(a.data.added + (a.data.added === 1 ? ' flashcard made.' : ' flashcards made.'));
    if (hasRoute('deck')) goStudy('deck', { id: d.data.id });
  };

  const onBack = () => { if (!result && answeredCount > 0) setLeave(true); else backStudy(); };

  if (error) return <><Head title="Weekly test" /><div className="st-scroll"><div className="st-wrap"><ErrorBox text={error} /></div></div></>;
  if (!test) return <><Head title="Weekly test" /><div className="st-scroll"><div className="st-wrap"><Loading rows={3} /></div></div></>;

  const c = subjectColor(test.subject);

  // already handed in (or the week is over): only the marks exist
  if (!result && test.status !== 'ready') {
    return (
      <>
        <Head title={test.name} onBack={() => replaceStudy('tests')} />
        <div className="st-scroll"><div className="st-wrap" style={{ display: 'grid', gap: 14 }}>
          {test.status === 'done' ? (
            <Card tint style={{ textAlign: 'center' }}>
              <Trophy size={28} style={{ color: 'var(--st-accent)', margin: '0 auto' }} />
              <p className="st-title" style={{ fontSize: 40, lineHeight: 1.1, marginTop: 8 }}>{test.score} / {test.max}</p>
              <p className="st-small st-muted" style={{ marginTop: 6 }}>Taken {fmtWhen(test.takenAt, me?.profile?.timezone)}</p>
              <p className="st-tiny st-faint" style={{ marginTop: 10 }}>The questions are not kept after a test is handed in. Your next test comes next week.</p>
            </Card>
          ) : <div className="st-notice"><p className="st-small">This week’s test ended before it was handed in. A new one is ready next week.</p></div>}
          <Btn kind="primary" onClick={() => replaceStudy('tests')}>Back to weekly tests</Btn>
        </div></div>
      </>
    );
  }

  // the result, with the review that is shown once
  if (result) {
    const pct = result.percent;
    return (
      <>
        <Head title={result.name || test.name} subtitle="Your result" onBack={() => replaceStudy('tests')} />
        <div className="st-scroll"><div className="st-wrap" style={{ display: 'grid', gap: 14 }}>
          <Card tint style={{ textAlign: 'center' }}>
            <Trophy size={30} style={{ color: 'var(--st-accent)', margin: '0 auto' }} />
            <p className="st-title" style={{ fontSize: 46, lineHeight: 1.1, marginTop: 8 }}>{result.score} / {result.max}</p>
            <p className="st-small st-muted" style={{ marginTop: 4 }}>{pct}%</p>
            <p className="st-small" style={{ marginTop: 10 }}>{testMessage(pct)}</p>
          </Card>
          <div className="st-notice st-notice-warn"><p className="st-small">This review is shown <b>once</b>. When you leave, only your marks, the test’s name and the time stay on NOOB. Make flashcards from what you missed if you want to keep them.</p></div>
          <div style={{ display: 'grid', gap: 8 }}>
            {missed.length > 0 && hasRoute('decks') && <Btn kind="primary" busy={busy} onClick={() => void makeCards()}><Layers size={16} /> Make flashcards from the {missed.length} I missed</Btn>}
            <Btn kind="ghost" onClick={() => replaceStudy('tests')}>Back to weekly tests</Btn>
            {hasRoute('testHistory') && <Btn kind="ghost" onClick={() => replaceStudy('testHistory')}>My test history</Btn>}
          </div>
          <p className="st-label" style={{ marginTop: 4 }}>Each question</p>
          {result.review.map((m) => (
            <Card key={m.i}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ width: 26, height: 26, borderRadius: 99, display: 'grid', placeItems: 'center', flex: 'none', background: m.correct ? 'rgba(80,200,140,.18)' : 'rgba(255,170,90,.18)', color: m.correct ? 'var(--st-ok)' : 'var(--st-warn)' }}>{m.correct ? <Check size={15} /> : <X size={15} />}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Markdown text={m.question} />
                  <p className="st-small st-muted" style={{ marginTop: 8, overflowWrap: 'anywhere' }}>Your answer: {m.chosen !== null ? LETTERS[m.chosen] + '. ' : ''}{m.chosen !== null ? <InlineText text={m.options[m.chosen] || ''} /> : 'none'}</p>
                  {!m.correct && <p className="st-small" style={{ marginTop: 4, overflowWrap: 'anywhere' }}>Right answer: <b>{LETTERS[m.answer]}. <InlineText text={m.options[m.answer] || ''} /></b></p>}
                  {m.explanation && <details style={{ marginTop: 8 }}><summary className="st-small" style={{ cursor: 'pointer' }}>Why</summary><div style={{ marginTop: 6 }}><Markdown text={m.explanation} /></div></details>}
                  {!m.correct && hasRoute('chat') && <div style={{ marginTop: 8 }}><Btn small kind="ghost" onClick={() => goStudy('chat', { seed: 'Please explain this question step by step, and why the right answer is right: ' + m.question + '\nRight answer: ' + (m.options[m.answer] || '') })}><MessageCircle size={14} /> Ask the tutor</Btn></div>}
                </div>
              </div>
            </Card>
          ))}
        </div></div>
      </>
    );
  }

  // taking the test
  return (
    <>
      <Head title={test.name} subtitle={'Question ' + (idx + 1) + ' of ' + qs.length + ' · ' + answeredCount + ' answered'} onBack={onBack} />
      <div className="st-scroll"><div className="st-wrap" style={{ display: 'grid', gap: 14 }}>
        <ProgressBar value={(answeredCount / Math.max(1, qs.length)) * 100} label="Questions answered" />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Jump to a question">
          {qs.map((_, i) => (
            <button key={i} type="button" onClick={() => setIdx(i)} aria-label={'Question ' + (i + 1) + (answers[i] !== null ? ', answered' : '')} aria-current={i === idx ? 'true' : undefined}
              style={{ width: 32, height: 32, borderRadius: 10, fontSize: 12.5, fontWeight: 800, cursor: 'pointer', border: '1px solid ' + (i === idx ? 'var(--st-accent)' : 'var(--st-border)'), background: answers[i] !== null ? 'var(--st-accent-soft)' : 'var(--st-surface)', color: 'var(--st-text)' }}>{i + 1}</button>
          ))}
        </div>
        {q && (
          <>
            <Card>
              <div style={colorVars(c)}><SubjectTag name={test.subject} color={c} /></div>
              <div style={{ marginTop: 10 }}><Markdown text={q.question} /></div>
            </Card>
            <div style={{ display: 'grid', gap: 8 }} role="radiogroup" aria-label="Choose one answer">
              {q.options.map((o, i) => {
                const chosen = answers[idx] === i;
                return (
                  <button key={i} role="radio" aria-checked={chosen} onClick={() => pick(i)} className="st-row-btn" style={{ textAlign: 'left', borderColor: chosen ? 'var(--st-accent)' : undefined, background: chosen ? 'var(--st-accent-soft)' : undefined }}>
                    <span className="st-pill" style={{ flex: 'none' }}>{LETTERS[i]}</span>
                    <span style={{ minWidth: 0, flex: 1, overflowWrap: 'anywhere' }}><InlineText text={o} /></span>
                    {chosen && <Check size={18} style={{ color: 'var(--st-accent)', flex: 'none' }} />}
                  </button>
                );
              })}
            </div>
            {answers[idx] !== null && <div><Btn small kind="ghost" onClick={() => setAnswers((a) => { const n = a.map((x, k) => (k === idx ? null : x)); saveDraft(id, n); return n; })}>Clear my answer</Btn></div>}
          </>
        )}
        {submitError && <ErrorBox text={submitError} onRetry={() => setConfirm(true)} />}
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn kind="ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)}><ChevronLeft size={16} /> Back</Btn>
          {idx + 1 < qs.length
            ? <Btn kind="primary" style={{ flex: 1 }} onClick={() => setIdx(idx + 1)}>Next <ChevronRight size={16} /></Btn>
            : <Btn kind="primary" style={{ flex: 1 }} onClick={() => setConfirm(true)}>Hand in</Btn>}
        </div>
        {idx + 1 < qs.length && answeredCount === qs.length && <Btn onClick={() => setConfirm(true)}>Hand in the test</Btn>}
      </div></div>

      {confirm && (
        <Sheet title="Hand in your test?" onClose={() => setConfirm(false)}>
          <p className="st-small st-muted">{answeredCount === qs.length ? 'You answered every question.' : (qs.length - answeredCount) + (qs.length - answeredCount === 1 ? ' question is' : ' questions are') + ' not answered yet. Those will count as not answered.'} After you hand in, you cannot change your answers or take this subject’s test again this week.</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Btn kind="ghost" onClick={() => setConfirm(false)}>Keep going</Btn>
            <Btn kind="primary" style={{ flex: 1 }} busy={submitting} onClick={() => void submit()}>Hand in</Btn>
          </div>
        </Sheet>
      )}
      {leave && (
        <Sheet title="Leave this test?" onClose={() => setLeave(false)}>
          <p className="st-small st-muted">Your answers are kept on this phone until you hand in, so you can come back to this test and carry on.</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Btn kind="ghost" onClick={() => setLeave(false)}>Keep going</Btn>
            <Btn kind="primary" style={{ flex: 1 }} onClick={() => { setLeave(false); backStudy(); }}>Leave</Btn>
          </div>
        </Sheet>
      )}
    </>
  );
};
export default TestRun;
