import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Plus, Trash2 } from 'lucide-react';
import { newRef, studyApi } from '../../../services/studyApi';
import type { StudyExam } from '../../../utils/studyTypes';
import { countdown, dueLabel, utcToLocalInput, zonedToUtc } from '../../../utils/studyTime';
import { useStudy } from '../StudyContext';
import { goStudy } from '../studyStore';
import { hasRoute, type PageProps } from '../StudyApp';
import { ExamRow } from '../parts';
import { Btn, Empty, ErrorBox, Field, Loading, Page, Sheet } from '../ui';

// Exams and their countdowns, counted in the student's own time zone. A date is only ever one the student typed: none is guessed.
const Exams: React.FC<PageProps> = () => {
  const { subjects, tz, toast } = useStudy();
  const [exams, setExams] = useState<StudyExam[] | null>(null);
  const [past, setPast] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ exam?: StudyExam | null } | null>(null);

  const load = useCallback(async () => {
    const r = await studyApi.exams(past);
    if (r.ok) { setExams(r.data.exams); setError(null); } else setError(r.error);
  }, [past]);
  useEffect(() => { void load(); }, [load]);

  return (
    <Page title="Exams" subtitle="Dates you added, counted on your own clock" right={<Btn small kind="primary" onClick={() => setSheet({})}><Plus size={15} /> Add</Btn>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <ErrorBox text={error} onRetry={() => void load()} />}
        {!exams && !error && <Loading rows={3} />}
        {exams && exams.length === 0 && <Empty icon={<CalendarClock size={28} />} title="No exams added" text="Add an exam you are sure about, and a gentle countdown will appear on your home screen." action={<Btn kind="primary" small onClick={() => setSheet({})}>Add an exam</Btn>} />}
        {exams?.map((e) => (
          <div key={e.id} style={{ display: 'grid', gap: 8 }}>
            <ExamRow exam={e} onOpen={(x) => setSheet({ exam: x })} />
            {hasRoute('planGen') && !countdown(e.examAt, tz).past && <Btn small kind="ghost" onClick={() => goStudy('planGen', { exam: e.id })}>Plan my revision for this</Btn>}
          </div>
        ))}
        <Btn kind="ghost" small onClick={() => setPast((v) => !v)}>{past ? 'Hide past exams' : 'Show past exams'}</Btn>
      </div>
      {sheet && <ExamSheet exam={sheet.exam} onClose={() => setSheet(null)} onChanged={() => void load()} subjects={subjects} tz={tz} toast={toast} />}
    </Page>
  );
};

const ExamSheet: React.FC<{ exam?: StudyExam | null; onClose: () => void; onChanged: () => void; subjects: { id: string; name: string }[]; tz: string; toast: (t: string) => void }> = ({ exam, onClose, onChanged, subjects, tz, toast }) => {
  const [ref] = useState(newRef);
  const [title, setTitle] = useState(exam?.title || '');
  const [subjectId, setSubjectId] = useState(exam?.subjectId || '');
  const [at, setAt] = useState(exam ? utcToLocalInput(exam.examAt, tz) : '');
  const [notes, setNotes] = useState(exam?.notes || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const save = async () => {
    if (busy) return;
    if (!title.trim()) { setError('Please write the name of the exam.'); return; }
    if (!at) { setError('Please choose the date of the exam.'); return; }
    setBusy(true); setError(null);
    const r = await studyApi.saveExam({ ...(exam ? { id: exam.id } : { clientRef: ref }), title: title.trim(), subjectId: subjectId || null, examAt: zonedToUtc(at, tz).toISOString(), notes });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    toast(exam ? 'Saved.' : 'Exam added.'); onChanged(); onClose();
  };
  const remove = async () => {
    if (!exam || busy) return;
    setBusy(true);
    const r = await studyApi.deleteExam(exam.id);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    toast('Removed.'); onChanged(); onClose();
  };
  return (
    <Sheet title={exam ? 'Edit exam' : 'Add an exam'} onClose={onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label="Name"><input className="st-input" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Physics unit test" /></Field>
        {subjects.length > 0 && <Field label="Subject"><select className="st-input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">No subject</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
        <Field label="Date and time" hint={at ? dueLabel(zonedToUtc(at, tz).toISOString(), tz) : 'Only add a date you are sure about.'}><input className="st-input" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
        <Field label="Notes (optional)"><textarea className="st-input" value={notes} maxLength={600} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 70 }} placeholder="Chapters, room, anything to remember" /></Field>
        {error && <div className="st-notice st-notice-warn" role="alert">{error}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          {exam && (confirm ? <Btn kind="warn" busy={busy} onClick={() => void remove()}>Yes, delete</Btn> : <Btn kind="ghost" onClick={() => setConfirm(true)} aria-label="Delete this exam"><Trash2 size={16} /></Btn>)}
          <Btn kind="primary" style={{ flex: 1 }} busy={busy} onClick={() => void save()}>{exam ? 'Save' : 'Add exam'}</Btn>
        </div>
      </div>
    </Sheet>
  );
};
export default Exams;
