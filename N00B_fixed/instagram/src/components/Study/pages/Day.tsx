import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Moon, Plus } from 'lucide-react';
import { studyApi } from '../../../services/studyApi';
import type { StudyExam, StudySession, StudyTask } from '../../../utils/studyTypes';
import { addDaysYmd, minutesLabel, startOfDay, weekdayOf, ymdIn } from '../../../utils/studyTime';
import { useStudy } from '../StudyContext';
import { ExamRow, SessionRow, TaskRow, TaskSheet } from '../parts';
import { SessionSheet } from '../SessionSheet';
import { dayTitle, type PlanPrefs } from '../planData';
import type { PageProps } from '../StudyApp';
import { Btn, Empty, ErrorBox, Loading, Page } from '../ui';

// One day in full: its study sessions, what is due that day, and any exam. A day can have sessions added, moved, finished or skipped here.
const Day: React.FC<PageProps> = ({ params }) => {
  const { tz, toast } = useStudy();
  const todayYmd = ymdIn(new Date(), tz);
  const [date, setDate] = useState(() => (typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : todayYmd));
  const [sessions, setSessions] = useState<StudySession[] | null>(null);
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [exams, setExams] = useState<StudyExam[]>([]);
  const [prefs, setPrefs] = useState<PlanPrefs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ session?: StudySession | null } | null>(null);
  const [taskSheet, setTaskSheet] = useState<StudyTask | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, t, e, p] = await Promise.all([
      studyApi.sessions(startOfDay(date, tz).toISOString(), startOfDay(addDaysYmd(date, 1), tz).toISOString()),
      studyApi.tasks('open', null, 100, 0), studyApi.exams(false), studyApi.planPrefs()
    ]);
    if (!s.ok) { setError(s.error); return; }
    setError(null); setSessions(s.data.sessions);
    if (t.ok) setTasks(t.data.tasks.filter((x) => x.dueAt && ymdIn(x.dueAt, tz) === date));
    if (e.ok) setExams(e.data.exams.filter((x) => ymdIn(x.examAt, tz) === date));
    if (p.ok) setPrefs(p.data);
  }, [date, tz]);
  useEffect(() => { setSessions(null); void load(); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSession = async (s: StudySession, status: StudySession['status']) => {
    if (busyId) return;
    setBusyId(s.id);
    const r = await studyApi.sessionStatus(s.id, status);
    setBusyId(null);
    if (!r.ok) { toast(r.error); return; }
    if (status === 'done') toast('Session done. Well done.');
    void load();
  };
  const toggleTask = async (t: StudyTask) => {
    if (busyId) return;
    setBusyId(t.id);
    const r = await studyApi.taskStatus(t.id, t.status === 'done' ? 'todo' : 'done');
    setBusyId(null);
    if (!r.ok) { toast(r.error); return; }
    void load();
  };

  const rest = !!prefs?.saved && prefs.restDays.includes(weekdayOf(date));
  const minutes = (sessions || []).filter((s) => s.status !== 'skipped').reduce((a, s) => a + s.durationMin, 0);
  const label = date === todayYmd ? 'Today' : date === addDaysYmd(todayYmd, 1) ? 'Tomorrow' : date === addDaysYmd(todayYmd, -1) ? 'Yesterday' : dayTitle(date);
  const sub = [label !== dayTitle(date) ? dayTitle(date) : '', minutes ? minutesLabel(minutes) + ' planned' : ''].filter(Boolean).join(' · ');
  return (
    <Page title={label} subtitle={sub || undefined}
      right={<span style={{ display: 'flex', gap: 4 }}>
        <button className="st-icon-btn" onClick={() => setDate(addDaysYmd(date, -1))} aria-label="Day before"><ChevronLeft size={18} /></button>
        <button className="st-icon-btn" onClick={() => setDate(addDaysYmd(date, 1))} aria-label="Next day"><ChevronRight size={18} /></button>
      </span>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <ErrorBox text={error} onRetry={() => void load()} />}
        {!sessions && !error && <Loading rows={3} />}
        {exams.map((e) => <ExamRow key={e.id} exam={e} />)}
        {sessions && rest && sessions.length === 0 && (
          <div className="st-card-flat" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Moon size={22} style={{ color: 'var(--st-accent)', flex: 'none' }} />
            <div><p className="st-title st-h3">A rest day</p><p className="st-small st-muted">You kept this day free. Rest is part of learning well.</p></div>
          </div>
        )}
        {sessions && sessions.length === 0 && !rest && <Empty title="No study sessions" text="Nothing is planned for this day. You can add a session, or make a plan for the week." />}
        {sessions?.map((s) => <SessionRow key={s.id} session={s} busy={busyId === s.id} onStatus={(x, st) => void toggleSession(x, st)} onOpen={() => setSheet({ session: s })} />)}
        {sessions && <Btn kind="primary" onClick={() => setSheet({})}><Plus size={16} /> Add a session</Btn>}
        {tasks.length > 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            <p className="st-label">Due this day</p>
            {tasks.map((t) => <TaskRow key={t.id} task={t} busy={busyId === t.id} onToggle={(x) => void toggleTask(x)} onEdit={(x) => setTaskSheet(x)} />)}
          </div>
        )}
      </div>
      {sheet && <SessionSheet session={sheet.session} defaultStart={date + 'T17:30'} onClose={() => setSheet(null)} onChanged={() => void load()} />}
      {taskSheet && <TaskSheet task={taskSheet} onClose={() => setTaskSheet(null)} onSaved={() => void load()} onDeleted={() => void load()} />}
    </Page>
  );
};
export default Day;
