import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, NotebookPen, PenTool, Trophy, BookPlus, Camera, CalendarPlus, FileUp, Layers, ListPlus, MessageCircleQuestion, Plus, Settings2, Sparkles, Timer, UserRound, X, Target } from 'lucide-react';
import { studyApi } from '../../../services/studyApi';
import type { StudyDashboard, StudySession, StudyTask } from '../../../utils/studyTypes';
import { addDaysYmd, dueLabel, greetingFor, hourIn, lastDays, longDate, minutesLabel, shortWeekday, ymdIn } from '../../../utils/studyTime';
import { levelLabel } from '../../../utils/studyCatalog';
import { useStudy } from '../StudyContext';
import { leaveStudy, goStudy } from '../studyStore';
import { hasRoute, type PageProps } from '../StudyApp';
import { ExamRow, SessionRow, TaskRow, TaskSheet } from '../parts';
import { Btn, Card, Empty, ErrorBox, Loading, Orb, SubjectTag, colorVars, subjectColor } from '../ui';

// The student's home: what is planned today, what is waiting, what is coming, and how the week went, all from what was really saved.
// Nothing here is filled in for show: an empty day says so kindly.
const Home: React.FC<PageProps> = () => {
  const { me, user, tz, subjects, toast, subjectName } = useStudy();
  const [dash, setDash] = useState<StudyDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ task?: StudyTask | null; defaults?: Partial<StudyTask> } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await studyApi.dashboard();
    if (r.ok) { setDash(r.data); setError(null); } else setError(r.error);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const profile = me?.profile;
  const first = (profile?.displayName || user.displayName || '').split(' ')[0];
  const now = new Date();
  const tutorName = profile?.tutor?.name?.trim() || 'your AI tutor';
  const todayYmd = ymdIn(now, tz);
  const setupDone = !!profile?.onboardingDone;

  const toggleTask = async (t: StudyTask) => {
    if (busyId) return;
    setBusyId(t.id);
    const r = await studyApi.taskStatus(t.id, t.status === 'done' ? 'todo' : 'done');
    setBusyId(null);
    if (!r.ok) { toast(r.error); return; }
    if (r.data.status === 'done') toast('Nice. One more done.');
    void load();
  };
  const toggleSession = async (s: StudySession, status: StudySession['status']) => {
    if (busyId) return;
    setBusyId(s.id);
    const r = await studyApi.sessionStatus(s.id, status);
    setBusyId(null);
    if (!r.ok) { toast(r.error); return; }
    if (status === 'done') toast('Session done. Well done.');
    void load();
  };

  const doneToday = useMemo(() => (dash ? dash.tasksToday.filter((t) => t.status === 'done').length + dash.sessionsToday.filter((s) => s.status === 'done').length : 0), [dash]);
  const totalToday = dash ? dash.tasksToday.length + dash.sessionsToday.length : 0;

  const actions = [
    { label: 'Ask a question', icon: <MessageCircleQuestion size={20} />, page: 'tutor' },
    { label: 'Photo doubt', icon: <Camera size={20} />, page: 'photo' },
    { label: 'Upload notes', icon: <FileUp size={20} />, page: 'library' },
    { label: 'Make a timetable', icon: <CalendarPlus size={20} />, page: 'planGen' },
    { label: 'Focus session', icon: <Timer size={20} />, page: 'focus' },
    { label: 'Flashcards', icon: <Layers size={20} />, page: 'decks' },
    { label: 'Practice', icon: <Target size={20} />, page: 'practice' },
    { label: 'Weekly test', icon: <Trophy size={20} />, page: 'tests' },
    { label: 'My progress', icon: <BarChart3 size={20} />, page: 'progress' },
    { label: 'Notepad', icon: <NotebookPen size={20} />, page: 'notes' },
    { label: 'Sketch board', icon: <PenTool size={20} />, page: 'sketch' },
    { label: 'Study room', icon: <UserRound size={20} />, page: 'rooms' }
  ].filter((a) => hasRoute(a.page));

  const week = dash ? lastDays(dash.today, 7).map((d) => ({ d, m: dash.week.find((w) => String(w.date).slice(0, 10) === d)?.minutes || 0 })) : [];
  const weekMax = Math.max(30, ...week.map((w) => w.m));

  return (
    <>
      <div className="st-head">
        <Orb size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="st-title st-h3">NOOB STUDY</p>
        </div>
        {hasRoute('profile') && <button className="st-icon-btn" onClick={() => goStudy('profile')} aria-label="Profile and settings"><Settings2 size={18} /></button>}
        <button className="st-icon-btn" onClick={leaveStudy} aria-label="Back to NOOB" title="Back to NOOB"><X size={18} /></button>
      </div>
      <div className="st-scroll"><div className="st-wrap st-wrap-wide" style={{ display: 'grid', gap: 16, paddingBottom: 30 }}>
        <div className="st-in">
          <p className="st-eyebrow">{longDate(now, tz)}</p>
          <h1 className="st-title st-h1" style={{ marginTop: 4 }}>{greetingFor(hourIn(now, tz))}{first ? `, ${first}` : ''}</h1>
          <div className="st-hscroll" style={{ marginTop: 10 }}>
            {profile?.level && <span className="st-pill">{levelLabel(profile.level)}{profile.board ? ` · ${profile.board}` : ''}</span>}
            {subjects.map((s) => <SubjectTag key={s.id} name={s.name} />)}
          </div>
        </div>

        {!setupDone && (
          <Card tint>
            <p className="st-title st-h3">Finish your set-up</p>
            <p className="st-small st-muted" style={{ marginTop: 4 }}>A few more answers and everything here becomes personal: your subjects, your timetable, your tutor.</p>
            <div style={{ marginTop: 12 }}><Btn kind="primary" small onClick={() => goStudy('onboarding')}>Continue</Btn></div>
          </Card>
        )}

        {hasRoute('tutor') && (
          <button className="st-card-tint st-in" onClick={() => goStudy('tutor')} style={{ display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', cursor: 'pointer', color: 'inherit' }}>
            <Orb size={52} float />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="st-title st-h3" style={{ display: 'block' }}>Ask {tutorName}</span>
              <span className="st-small st-muted">Stuck on something? Type, talk or send a photo.</span>
            </span>
            <Sparkles size={20} style={{ color: 'var(--st-accent)' }} />
          </button>
        )}

        {error && <ErrorBox text={error} onRetry={() => void load()} />}
        {!dash && !error && <Loading rows={3} />}

        {dash && (
          <>
            <section style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 className="st-title st-h2">Today</h2>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {totalToday > 0 && <span className="st-pill">{doneToday} of {totalToday} done</span>}
                  <Btn small onClick={() => setSheet({ defaults: { dueAt: null } })}><Plus size={15} /> Add</Btn>
                </div>
              </div>
              {dash.sessionsToday.map((s) => <SessionRow key={s.id} session={s} busy={busyId === s.id} onStatus={(x, st) => void toggleSession(x, st)} onOpen={hasRoute('day') ? () => goStudy('day', { date: todayYmd }) : undefined} />)}
              {dash.tasksToday.map((t) => <TaskRow key={t.id} task={t} busy={busyId === t.id} onToggle={(x) => void toggleTask(x)} onEdit={(x) => setSheet({ task: x })} />)}
              {totalToday === 0 && (
                <Empty icon={<ListPlus size={26} />} title="A quiet day so far" text="Nothing is planned for today. Add one small thing, or let a timetable do the planning."
                  action={<><Btn small kind="primary" onClick={() => setSheet({})}>Add a task</Btn>{hasRoute('planGen') && <Btn small onClick={() => goStudy('planGen')}>Make a timetable</Btn>}</>} />
              )}
            </section>

            {dash.overdue.length > 0 && (
              <section style={{ display: 'grid', gap: 10 }}>
                <div><h2 className="st-title st-h2">Waiting for you</h2><p className="st-small st-muted">These slipped by. No stress: finish one, move one, or let one go.</p></div>
                {dash.overdue.slice(0, 4).map((t) => <TaskRow key={t.id} task={t} busy={busyId === t.id} onToggle={(x) => void toggleTask(x)} onEdit={(x) => setSheet({ task: x })} />)}
                {dash.overdue.length > 4 && hasRoute('tasks') && <Btn kind="ghost" small onClick={() => goStudy('tasks', { filter: 'overdue' })}>See all {dash.overdue.length}</Btn>}
              </section>
            )}

            {(dash.exams.length > 0 || dash.upcoming.length > 0) && (
              <section style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h2 className="st-title st-h2">Coming up</h2>
                  {hasRoute('exams') && <Btn small kind="ghost" onClick={() => goStudy('exams')}>Exams</Btn>}
                </div>
                {dash.exams.slice(0, 3).map((e) => <ExamRow key={e.id} exam={e} onOpen={hasRoute('exams') ? () => goStudy('exams') : undefined} />)}
                {dash.upcoming.slice(0, 3).map((t) => <TaskRow key={t.id} task={t} busy={busyId === t.id} onToggle={(x) => void toggleTask(x)} onEdit={(x) => setSheet({ task: x })} />)}
              </section>
            )}

            <section style={{ display: 'grid', gap: 10 }}>
              <h2 className="st-title st-h2">Your week</h2>
              <Card>
                {dash.stats.minutes7 + dash.stats.tasksDone7 === 0 ? (
                  <p className="st-small st-muted">Your week will fill in as you study. Even 10 minutes counts.</p>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 96 }} role="img" aria-label="Minutes studied in the last 7 days">
                      {week.map((w) => (
                        <div key={w.d} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, height: '100%', justifyContent: 'flex-end' }}>
                          <div style={{ width: '100%', maxWidth: 30, borderRadius: 9, height: `${Math.max(6, (w.m / weekMax) * 100)}%`, background: w.d === todayYmd ? 'linear-gradient(180deg, var(--st-accent2), var(--st-accent))' : 'var(--st-surface2)', opacity: w.m ? 1 : 0.6 }} title={`${w.m} min`} />
                          <span className="st-tiny" style={{ color: w.d === todayYmd ? 'var(--st-accent)' : 'var(--st-faint)', fontWeight: 800 }}>{shortWeekday(w.d)}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12 }}>
                      <span className="st-small"><b>{minutesLabel(dash.stats.minutes7)}</b> <span className="st-muted">studied</span></span>
                      <span className="st-small"><b>{dash.stats.tasksDone7}</b> <span className="st-muted">tasks done</span></span>
                      <span className="st-small"><b>{dash.stats.activeDays7}</b> <span className="st-muted">of 7 days active</span></span>
                    </div>
                    {dash.stats.streak >= 2 && <p className="st-small st-muted" style={{ marginTop: 8 }}>{dash.stats.streak} days in a row. Rest days are fine too.</p>}
                  </>
                )}
              </Card>
            </section>

            {dash.subjects.length > 0 && (
              <section style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h2 className="st-title st-h2">Your subjects</h2>
                  <Btn small kind="ghost" onClick={() => goStudy('subjects')}>All</Btn>
                </div>
                <div className="st-grid2 st-grid2-lg">
                  {dash.subjects.map((s) => {
                    const c = subjectColor(s.name);
                    return (
                      <button key={s.id} className="st-card-flat" onClick={() => goStudy('subject', { id: s.id })} style={{ ...colorVars(c), textAlign: 'left', cursor: 'pointer', color: 'inherit', display: 'grid', gap: 6, borderTop: '3px solid var(--c)' }}>
                        <span className="st-title st-h3">{s.name}</span>
                        <span className="st-tiny st-muted">{s.minutes7 > 0 ? `${minutesLabel(s.minutes7)} this week` : 'Nothing yet this week'}</span>
                        <span className="st-tiny st-faint">{s.pendingTasks > 0 ? `${s.pendingTasks} to do` : 'All clear'}{s.nextSession ? ` · next: ${s.nextSession.topic || dueLabel(s.nextSession.startsAt, tz)}` : ''}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {actions.length > 0 && (
              <section style={{ display: 'grid', gap: 10 }}>
                <h2 className="st-title st-h2">Quick actions</h2>
                <div className="st-grid2 st-grid2-lg">
                  {actions.map((a) => (
                    <button key={a.page} className="st-row-btn" onClick={() => goStudy(a.page)}>
                      <span style={{ color: 'var(--st-accent)' }}>{a.icon}</span><span className="st-title st-h3">{a.label}</span>
                    </button>
                  ))}
                  <button className="st-row-btn" onClick={() => setSheet({ defaults: { kind: 'homework' } })}><span style={{ color: 'var(--st-accent)' }}><BookPlus size={20} /></span><span className="st-title st-h3">Add homework</span></button>
                </div>
              </section>
            )}
          </>
        )}
      </div></div>

      {sheet && (
        <TaskSheet task={sheet.task} defaults={sheet.defaults} onClose={() => setSheet(null)} onSaved={() => void load()} onDeleted={() => void load()} />
      )}
    </>
  );
};
export default Home;
