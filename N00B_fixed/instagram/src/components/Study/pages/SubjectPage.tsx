import React, { useCallback, useEffect, useState } from 'react';
import { BookMarked, Camera, FileUp, Layers, MessageCircleQuestion, Plus, Target, Timer } from 'lucide-react';
import { studyApi } from '../../../services/studyApi';
import type { DashSubject, StudyExam, StudyTask } from '../../../utils/studyTypes';
import { dueLabel, minutesLabel } from '../../../utils/studyTime';
import { useStudy } from '../StudyContext';
import { goStudy } from '../studyStore';
import { hasRoute, type PageProps } from '../StudyApp';
import { ExamRow, TaskRow, TaskSheet } from '../parts';
import { Btn, Card, Empty, Loading, Page, colorVars, subjectColor } from '../ui';

// One subject's own space: what is due, what is coming, how the week went, and a way into the tutor with this subject already chosen.
const SubjectPage: React.FC<PageProps> = ({ params }) => {
  const { subjects, tz, toast } = useStudy();
  const subject = subjects.find((s) => s.id === params.id);
  const [tasks, setTasks] = useState<StudyTask[] | null>(null);
  const [exams, setExams] = useState<StudyExam[]>([]);
  const [stat, setStat] = useState<DashSubject | null>(null);
  const [sheet, setSheet] = useState<{ task?: StudyTask | null } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!subject) return;
    const [t, e, d] = await Promise.all([studyApi.tasks('open', subject.id, 30), studyApi.exams(), studyApi.dashboard()]);
    if (t.ok) setTasks(t.data.tasks);
    if (e.ok) setExams(e.data.exams.filter((x) => x.subjectId === subject.id));
    if (d.ok) setStat(d.data.subjects.find((x) => x.id === subject.id) || null);
  }, [subject?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load]);

  if (!subject) return <Page title="Subject"><Empty title="This subject is not in your list" text="It may have been taken out. Your tasks and history for it are safe." action={<Btn small kind="primary" onClick={() => goStudy('subjects')}>My subjects</Btn>} /></Page>;
  const c = subjectColor(subject.name);
  const toggle = async (t: StudyTask) => {
    if (busyId) return;
    setBusyId(t.id);
    const r = await studyApi.taskStatus(t.id, t.status === 'done' ? 'todo' : 'done');
    setBusyId(null);
    if (!r.ok) { toast(r.error); return; }
    if (r.data.status === 'done') toast('Nice. One more done.');
    void load();
  };
  const actions = [
    { label: `Ask about ${subject.name}`, icon: <MessageCircleQuestion size={19} />, page: 'tutor', p: { subject: subject.id } },
    { label: 'Photo doubt', icon: <Camera size={19} />, page: 'photo', p: { subject: subject.id } },
    { label: 'Practise', icon: <Target size={19} />, page: 'practice', p: { subject: subject.id } },
    { label: 'Flashcards', icon: <Layers size={19} />, page: 'decks', p: { subject: subject.id } },
    { label: 'My notes', icon: <FileUp size={19} />, page: 'library', p: { subject: subject.id } },
    { label: 'Topics', icon: <BookMarked size={19} />, page: 'topics', p: { subject: subject.id } },
    { label: 'Focus', icon: <Timer size={19} />, page: 'focus', p: { subject: subject.id } }
  ].filter((a) => hasRoute(a.page));

  return (
    <Page title={subject.name} subtitle={subject.kind === 'custom' ? 'Your own subject' : undefined} right={<Btn small kind="primary" onClick={() => setSheet({})}><Plus size={15} /> Task</Btn>}>
      <div style={{ display: 'grid', gap: 16, ...colorVars(c) }}>
        <Card tint style={{ borderTop: '3px solid var(--c)' }}>
          <p className="st-eyebrow">This week</p>
          <p className="st-title st-h2" style={{ marginTop: 4 }}>{stat && stat.minutes7 > 0 ? `${minutesLabel(stat.minutes7)} of study` : 'A fresh start'}</p>
          <p className="st-small st-muted" style={{ marginTop: 4 }}>
            {stat?.nextSession ? `Next planned: ${stat.nextSession.topic || 'study session'} · ${dueLabel(stat.nextSession.startsAt, tz)}` : stat && stat.minutes7 === 0 ? 'No study recorded yet. Ten minutes is a good start.' : 'Keep going at your own pace.'}
          </p>
        </Card>
        {actions.length > 0 && <div className="st-grid2">{actions.map((a) => <button key={a.page} className="st-row-btn" onClick={() => goStudy(a.page, a.p)}><span style={{ color: 'var(--c)' }}>{a.icon}</span><span className="st-title st-h3">{a.label}</span></button>)}</div>}
        {exams.length > 0 && <section style={{ display: 'grid', gap: 10 }}><h2 className="st-title st-h2">Exams</h2>{exams.map((e) => <ExamRow key={e.id} exam={e} onOpen={hasRoute('exams') ? () => goStudy('exams') : undefined} />)}</section>}
        <section style={{ display: 'grid', gap: 10 }}>
          <h2 className="st-title st-h2">To do</h2>
          {!tasks && <Loading rows={2} />}
          {tasks && tasks.length === 0 && <Empty title="All clear here" text={`Nothing waiting in ${subject.name}. Add a task when something comes up.`} action={<Btn small onClick={() => setSheet({})}>Add a task</Btn>} />}
          {tasks?.map((t) => <TaskRow key={t.id} task={t} busy={busyId === t.id} onToggle={(x) => void toggle(x)} onEdit={(x) => setSheet({ task: x })} />)}
        </section>
      </div>
      {sheet && <TaskSheet task={sheet.task} defaults={{ subjectId: subject.id }} onClose={() => setSheet(null)} onSaved={() => void load()} onDeleted={() => void load()} />}
    </Page>
  );
};
export default SubjectPage;
