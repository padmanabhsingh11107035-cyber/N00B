import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, PartyPopper, Plus } from 'lucide-react';
import { studyApi, newRef } from '../../../services/studyApi';
import type { StudyExam, StudyGoals, StudyHabits, StudyProfile, StudyTask, TutorPrefs } from '../../../utils/studyTypes';
import {
  COUNTRIES, GOALS, LANGUAGES, LEARNING_STYLES, LEVELS, ONBOARDING_STEPS, PARTS_OF_DAY, REMINDER_OPTIONS, STREAMS, TUTOR_STYLES,
  boardsFor, classYearOptions, isCollegeLevel, isSchoolLevel, isSeniorLevel, languageLabel, levelLabel, missingForPlan,
  subjectsProblem, type ChosenSubject
} from '../../../utils/studyCatalog';
import { browserTimeZone, dueLabel, timeZoneList, zonedToUtc } from '../../../utils/studyTime';
import { useStudy } from '../StudyContext';
import { backStudy, leaveStudy, replaceStudy } from '../studyStore';
import { hasRoute, type PageProps } from '../StudyApp';
import { Btn, Chip, Field, ProgressBar, SubjectTag } from '../ui';
import { SubjectPicker } from '../SubjectPicker';

// The set-up form: seven short steps, saved after each one (so leaving halfway loses nothing), with plain checks and no scary walls of questions.
// Only what is needed is required. The subjects step enforces one to six, here and in the database.

interface Draft {
  displayName: string; country: string; language: string; timezone: string; level: string; institution: string;
  board: string; classYear: string; stream: string; course: string; specialization: string;
  goals: StudyGoals; habits: StudyHabits; tutor: TutorPrefs;
}
const PROBLEMS = ['Staying focused', 'Remembering things', 'Understanding concepts', 'Managing my time', 'Starting at all', 'Exam stress', 'Getting bored'];

function initialDraft(p: StudyProfile | null, fallbackName: string): Draft {
  return {
    displayName: p?.displayName || fallbackName, country: p?.country || '', language: p?.language || 'en', timezone: p?.timezone || browserTimeZone(),
    level: p?.level || '', institution: p?.institution || '', board: p?.board || '', classYear: p?.classYear || '', stream: p?.stream || '',
    course: p?.course || '', specialization: p?.specialization || '',
    goals: p?.goals || {}, habits: { dailyMinutes: 60, daysPerWeek: 5, sessionMinutes: 25, ...(p?.habits || {}) },
    tutor: { language: p?.language || 'en', style: 'friendly', length: 'detailed', level: 'beginner', examples: 'real', mode: 'mixed', reminders: 'gentle', ...(p?.tutor || {}) }
  };
}

// what a step is missing before "Continue" works (a plain sentence, or null)
function stepProblem(step: number, d: Draft, subjects: ChosenSubject[]): string | null {
  if (step === 0) {
    if (!d.displayName.trim()) return 'Please tell us what to call you.';
    if (!d.language) return 'Please choose your language.';
  }
  if (step === 1) {
    if (!d.level) return 'Please choose your education level.';
    if (isSeniorLevel(d.level) && !d.stream) return 'Please choose your stream.';
    if (isCollegeLevel(d.level) && d.course.trim().length < 2) return 'Please write your course or degree.';
  }
  if (step === 2) return subjectsProblem(subjects);
  return null;
}

const Step: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="st-in" style={{ display: 'grid', gap: 16 }}>{children}</div>;
const Chips: React.FC<{ children: React.ReactNode }> = ({ children }) => <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{children}</div>;

const Onboarding: React.FC<PageProps> = ({ params }) => {
  const { me, user, setMe, reload, toast, tz } = useStudy();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(me?.profile || null, user.displayName || ''));
  const [subjects, setSubjects] = useState<ChosenSubject[]>(() => (me?.subjects || []).map((s) => ({ name: s.name, kind: s.kind })));
  const editing = !!me?.profile?.onboardingDone;
  const [step, setStep] = useState(() => {
    if (typeof params.step === 'number' || (typeof params.step === 'string' && params.step !== '')) return Math.max(0, Math.min(6, Number(params.step) || 0));
    return Math.max(0, Math.min(6, me?.profile?.onboardingStep && !me.profile.onboardingDone ? Math.min(me.profile.onboardingStep, 6) : 0));
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setGoals = (g: Partial<StudyGoals>) => setDraft((d) => ({ ...d, goals: { ...d.goals, ...g } }));
  const setHabits = (h: Partial<StudyHabits>) => setDraft((d) => ({ ...d, habits: { ...d.habits, ...h } }));
  const setTutor = (t: Partial<TutorPrefs>) => setDraft((d) => ({ ...d, tutor: { ...d.tutor, ...t } }));
  const zones = useMemo(() => { const l = timeZoneList(); return l.includes(draft.timezone) ? l : [draft.timezone, ...l]; }, [draft.timezone]);
  const problem = stepProblem(step, draft, subjects);

  // what each step saves
  const patchFor = (s: number): Partial<StudyProfile> => {
    const d = draft;
    if (s === 0) return { displayName: d.displayName, country: d.country, language: d.language, timezone: d.timezone, institution: d.institution };
    if (s === 1) return { level: d.level, board: d.board, classYear: d.classYear, stream: isSeniorLevel(d.level) ? d.stream : '', course: isCollegeLevel(d.level) ? d.course : '', specialization: isCollegeLevel(d.level) ? d.specialization : '' };
    if (s === 3) return { goals: d.goals };
    if (s === 4) return { habits: d.habits };
    if (s === 5) return { tutor: d.tutor };
    return {};
  };

  const save = async (s: number, next: number): Promise<boolean> => {
    setBusy(true); setError(null);
    if (s === 2) {
      const r = await studyApi.setSubjects(subjects);
      if (!r.ok) { setBusy(false); setError(r.error); return false; }
      setMe(r.data);
    }
    const patch = patchFor(s);
    const res = await studyApi.saveProfile(patch, next);
    setBusy(false);
    if (!res.ok) { setError(res.error); return false; }
    setMe(res.data);
    return true;
  };

  const next = async () => {
    if (problem) { setError(problem); return; }
    if (await save(step, step + 1)) { setStep(step + 1); window.scrollTo?.(0, 0); }
  };
  const finish = async () => {
    setBusy(true); setError(null);
    for (const s of [0, 1, 3, 4, 5]) {
      const r = await studyApi.saveProfile(patchFor(s), 7);
      if (!r.ok) { setBusy(false); setError(r.error); return; }
    }
    const done = await studyApi.completeOnboarding();
    setBusy(false);
    if (!done.ok) { setError(done.error); return; }
    setMe(done.data);
    await reload();
    if (editing) { toast('Saved.'); backStudy(); return; }
    setFinished(true);
  };
  const prev = () => { setError(null); if (step > 0) setStep(step - 1); else backStudy(); };

  useEffect(() => { setError(null); const el = document.querySelector('.st-scroll'); if (el) el.scrollTop = 0; }, [step]);

  if (finished) {
    const name = draft.displayName.split(' ')[0] || 'friend';
    return (
      <div className="st-scroll"><div className="st-wrap" style={{ textAlign: 'center', paddingTop: 48 }}>
        <div className="st-in">
          <span style={{ width: 84, height: 84, borderRadius: 28, display: 'inline-grid', placeItems: 'center', background: 'var(--st-accent-soft)', color: 'var(--st-accent)' }}><PartyPopper size={40} /></span>
          <h1 className="st-title st-h1" style={{ marginTop: 18 }}>You are all set, {name}!</h1>
          <p className="st-muted" style={{ marginTop: 10, lineHeight: 1.55 }}>Your study space knows your subjects and how you like to learn. Nothing is graded here. Go at your own pace.</p>
        </div>
        <div style={{ display: 'grid', gap: 10, marginTop: 26 }}>
          {hasRoute('planGen') && <Btn kind="primary" block onClick={() => replaceStudy('planGen')}>Make my first timetable</Btn>}
          <Btn kind={hasRoute('planGen') ? 'plain' : 'primary'} block onClick={() => replaceStudy('home')}>Start exploring <ArrowRight size={16} /></Btn>
        </div>
      </div></div>
    );
  }

  const d = draft;
  const meta = ONBOARDING_STEPS[step];
  const boards = boardsFor(d.level);
  const years = classYearOptions(d.level);
  const missing = missingForPlan({ level: d.level, habits: d.habits as Record<string, unknown> }, subjects.length);
  const lastStep = step === 6;

  return (
    <>
      <div className="st-head">
        <button className="st-icon-btn" onClick={prev} aria-label="Back">←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="st-tiny st-faint">Step {step + 1} of {ONBOARDING_STEPS.length}</p>
          <ProgressBar value={((step + 1) / ONBOARDING_STEPS.length) * 100} label="Set-up progress" />
        </div>
        <button className="st-btn st-btn-sm st-btn-ghost" onClick={leaveStudy}>Later</button>
      </div>
      <div className="st-scroll"><div className="st-wrap" style={{ paddingBottom: 120 }}>
        <div style={{ marginBottom: 16 }}>
          <h1 className="st-title st-h1">{meta.title}</h1>
          <p className="st-muted" style={{ marginTop: 4 }}>{meta.subtitle}</p>
        </div>

        {step === 0 && (
          <Step>
            <Field label="What should we call you?"><input className="st-input" value={d.displayName} maxLength={60} onChange={(e) => set('displayName', e.target.value)} autoComplete="given-name" /></Field>
            <Field label="Country"><select className="st-input" value={d.country} onChange={(e) => set('country', e.target.value)}><option value="">Prefer not to say</option>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Language you like to learn in" hint="You can still ask in any language and change this any time."><select className="st-input" value={d.language} onChange={(e) => { set('language', e.target.value); setTutor({ language: e.target.value }); }}>{LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label} ({l.native})</option>)}</select></Field>
            <Field label="Time zone" hint="So reminders, deadlines and countdowns use your own clock."><select className="st-input" value={d.timezone} onChange={(e) => set('timezone', e.target.value)}>{zones.map((z) => <option key={z}>{z}</option>)}</select></Field>
            <Field label="School or college (optional)"><input className="st-input" value={d.institution} maxLength={120} onChange={(e) => set('institution', e.target.value)} placeholder="You can leave this empty" /></Field>
          </Step>
        )}

        {step === 1 && (
          <Step>
            <Field label="Where are you in your studies?">
              <div className="st-grid2">{LEVELS.map((l) => (
                <button key={l.id} type="button" className="st-row-btn" data-on={d.level === l.id} onClick={() => { set('level', l.id); setDraft((x) => ({ ...x, level: l.id, board: '', classYear: '', stream: '', course: '' })); }}
                  style={d.level === l.id ? { borderColor: 'var(--st-accent)', background: 'var(--st-accent-soft)' } : undefined} aria-pressed={d.level === l.id}>
                  <span><span className="st-title st-h3" style={{ display: 'block' }}>{l.label}</span><span className="st-tiny st-muted">{l.hint}</span></span>
                </button>))}</div>
            </Field>
            {isSchoolLevel(d.level) && (
              <>
                {years.length > 1 && <Field label="Class"><Chips>{years.map((y) => <Chip key={y.id} on={d.classYear === y.id} onClick={() => set('classYear', y.id)}>{y.label}</Chip>)}</Chips></Field>}
                <Field label="Board or curriculum" hint="Pick the closest one. It only helps the tutor match your syllabus."><select className="st-input" value={d.board} onChange={(e) => set('board', e.target.value)}><option value="">Not sure / skip</option>{boards.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select></Field>
              </>
            )}
            {isSeniorLevel(d.level) && <Field label="Stream"><Chips>{STREAMS.map((s) => <Chip key={s.id} on={d.stream === s.id} onClick={() => set('stream', s.id)}>{s.label}</Chip>)}</Chips></Field>}
            {isCollegeLevel(d.level) && (
              <>
                <Field label="Course or degree"><input className="st-input" value={d.course} maxLength={120} onChange={(e) => set('course', e.target.value)} placeholder="e.g. B.Sc Computer Science" /></Field>
                <Field label={`Year`}><Chips>{years.map((y) => <Chip key={y.id} on={d.classYear === y.id} onClick={() => set('classYear', y.id)}>{y.label}</Chip>)}</Chips></Field>
                <Field label="Specialization (optional)"><input className="st-input" value={d.specialization} maxLength={120} onChange={(e) => set('specialization', e.target.value)} /></Field>
              </>
            )}
            {d.level === 'other' && <p className="st-small st-muted">Learning on your own is great. On the next step you can choose what you are learning.</p>}
          </Step>
        )}

        {step === 2 && (
          <Step>
            <SubjectPicker level={d.level} stream={d.stream} value={subjects} onChange={setSubjects} error={null} setError={setError} />
          </Step>
        )}

        {step === 3 && (
          <Step>
            <Field label="What would you like from NOOB STUDY? (pick any)"><Chips>{GOALS.map((g) => {
              const on = (d.goals.mainGoals || []).includes(g);
              return <Chip key={g} on={on} onClick={() => setGoals({ mainGoals: on ? (d.goals.mainGoals || []).filter((x) => x !== g) : [...(d.goals.mainGoals || []), g] })}>{g}</Chip>;
            })}</Chips></Field>
            <Field label="Any exam you are preparing for? (optional)"><input className="st-input" value={d.goals.exam || ''} maxLength={120} onChange={(e) => setGoals({ exam: e.target.value })} placeholder="e.g. Class 12 boards, JEE, NEET, CUET" /></Field>
            <Field label="A grade or result you are aiming for (optional)"><input className="st-input" value={d.goals.targets || ''} maxLength={120} onChange={(e) => setGoals({ targets: e.target.value })} placeholder="e.g. 85% in Physics" /></Field>
            <Field label="Which topics feel difficult? (optional)" hint="No judgement. This only helps the tutor start in the right place."><textarea className="st-input" value={d.goals.difficultTopics || ''} maxLength={400} onChange={(e) => setGoals({ difficultTopics: e.target.value })} /></Field>
            <Field label="Which subjects do you feel strongest in? (optional)"><input className="st-input" value={d.goals.strongSubjects || ''} maxLength={200} onChange={(e) => setGoals({ strongSubjects: e.target.value })} /></Field>
            <Field label="What is the hardest part of studying for you?"><Chips>{PROBLEMS.map((p) => <Chip key={p} on={d.goals.biggestProblem === p} onClick={() => setGoals({ biggestProblem: d.goals.biggestProblem === p ? '' : p })}>{p}</Chip>)}</Chips></Field>
            <Field label="A career or profession that interests you (optional)"><input className="st-input" value={d.goals.career || ''} maxLength={120} onChange={(e) => setGoals({ career: e.target.value })} /></Field>
            <Field label="Anything you want to learn beyond your syllabus? (optional)"><input className="st-input" value={d.goals.beyondSyllabus || ''} maxLength={200} onChange={(e) => setGoals({ beyondSyllabus: e.target.value })} placeholder="e.g. coding, music theory, chess" /></Field>
            <Field label="Skills you would like to build (optional)"><input className="st-input" value={d.goals.skills || ''} maxLength={200} onChange={(e) => setGoals({ skills: e.target.value })} /></Field>
          </Step>
        )}

        {step === 4 && (
          <HabitsStep draft={d} setHabits={setHabits} subjectsList={subjects} tz={d.timezone || tz} />
        )}

        {step === 5 && (
          <Step>
            <Field label="Give your tutor a name (optional)"><input className="st-input" value={d.tutor.name || ''} maxLength={30} onChange={(e) => setTutor({ name: e.target.value })} placeholder="Nova" /></Field>
            <Field label="Language for explanations"><select className="st-input" value={d.tutor.language || d.language} onChange={(e) => setTutor({ language: e.target.value })}>{LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label} ({l.native})</option>)}</select></Field>
            <Field label="How should it talk to you?"><div className="st-grid2">{TUTOR_STYLES.map((t) => (
              <button key={t.id} type="button" className="st-row-btn" onClick={() => setTutor({ style: t.id })} aria-pressed={d.tutor.style === t.id} style={d.tutor.style === t.id ? { borderColor: 'var(--st-accent)', background: 'var(--st-accent-soft)' } : undefined}>
                <span><span className="st-title st-h3" style={{ display: 'block' }}>{t.label}</span><span className="st-tiny st-muted">{t.hint}</span></span></button>))}</div></Field>
            <Field label="Answer length"><Chips><Chip on={d.tutor.length === 'short'} onClick={() => setTutor({ length: 'short' })}>Short</Chip><Chip on={d.tutor.length === 'detailed'} onClick={() => setTutor({ length: 'detailed' })}>Detailed</Chip></Chips></Field>
            <Field label="Level of explanations"><Chips><Chip on={d.tutor.level === 'beginner'} onClick={() => setTutor({ level: 'beginner' })}>Beginner friendly</Chip><Chip on={d.tutor.level === 'advanced'} onClick={() => setTutor({ level: 'advanced' })}>Advanced</Chip></Chips></Field>
            <Field label="Style of examples"><Chips><Chip on={d.tutor.examples === 'real'} onClick={() => setTutor({ examples: 'real' })}>Real-life examples</Chip><Chip on={d.tutor.examples === 'formal'} onClick={() => setTutor({ examples: 'formal' })}>More formal</Chip></Chips></Field>
            <Field label="How do you like to learn with it?"><Chips>{(['text', 'voice', 'mixed'] as const).map((m) => <Chip key={m} on={d.tutor.mode === m} onClick={() => setTutor({ mode: m })}>{m === 'text' ? 'Mostly typing' : m === 'voice' ? 'Mostly talking' : 'A bit of both'}</Chip>)}</Chips></Field>
            <Field label="Reminders"><Chips>{REMINDER_OPTIONS.map((r) => <Chip key={r.id} on={d.tutor.reminders === r.id} onClick={() => setTutor({ reminders: r.id })}>{r.label}</Chip>)}</Chips></Field>
            <Field label="Anything that helps you learn better? (optional)" hint="For example: short sentences, larger text, or dyslexia-friendly explanations."><input className="st-input" value={d.tutor.accessibility || ''} maxLength={200} onChange={(e) => setTutor({ accessibility: e.target.value })} /></Field>
          </Step>
        )}

        {step === 6 && (
          <Step>
            <ReviewCard title="About you" onEdit={() => setStep(0)} lines={[d.displayName, d.country, `${languageLabel(d.language)} · ${d.timezone}`, d.institution]} />
            <ReviewCard title="Your studies" onEdit={() => setStep(1)} lines={[levelLabel(d.level), d.classYear && `Class / year ${d.classYear}`, d.board, d.stream, d.course, d.specialization]} />
            <div className="st-card-flat"><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><p className="st-title st-h3">Your subjects</p><button className="st-btn st-btn-sm st-btn-ghost" onClick={() => setStep(2)}>Edit</button></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>{subjects.map((sb) => <SubjectTag key={sb.name} name={sb.name} />)}</div></div>
            <ReviewCard title="Your goals" onEdit={() => setStep(3)} lines={[(d.goals.mainGoals || []).join(', '), d.goals.exam && `Exam: ${d.goals.exam}`, d.goals.biggestProblem && `Hardest: ${d.goals.biggestProblem}`]} empty="No goals yet. That is fine." />
            <ReviewCard title="Your routine" onEdit={() => setStep(4)} lines={[`${d.habits.dailyMinutes || 0} min a day, ${d.habits.daysPerWeek || 0} days a week`, `Sessions of ${d.habits.sessionMinutes || 25} min`, (d.habits.partOfDay || []).join(', ')]} />
            <ReviewCard title="Your tutor" onEdit={() => setStep(5)} lines={[d.tutor.name || 'Your AI tutor', `${languageLabel(d.tutor.language || d.language)} · ${d.tutor.style} · ${d.tutor.length} answers`]} />
            {missing.length > 0 && <div className="st-notice st-notice-warn">To build a good timetable we still need: {missing.join(', ')}.</div>}
          </Step>
        )}

        {error && <div className="st-notice st-notice-warn" role="alert" style={{ marginTop: 14 }}>{error}</div>}
      </div></div>

      <div className="st-nav" style={{ gap: 10, padding: '10px 16px max(12px, env(safe-area-inset-bottom))' }}>
        {step > 0 && <Btn onClick={prev} style={{ flex: '0 0 auto' }}>Back</Btn>}
        {lastStep
          ? <Btn kind="primary" style={{ flex: 1 }} busy={busy} onClick={() => void finish()}><Check size={18} /> {editing ? 'Save changes' : 'Finish set-up'}</Btn>
          : <Btn kind="primary" style={{ flex: 1 }} busy={busy} disabled={!!problem} onClick={() => void next()}>Continue <ArrowRight size={16} /></Btn>}
      </div>
    </>
  );
};

const ReviewCard: React.FC<{ title: string; lines: Array<string | false | undefined>; onEdit: () => void; empty?: string }> = ({ title, lines, onEdit, empty }) => {
  const shown = lines.filter(Boolean) as string[];
  return (
    <div className="st-card-flat">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><p className="st-title st-h3">{title}</p><button className="st-btn st-btn-sm st-btn-ghost" onClick={onEdit}>Edit</button></div>
      {shown.length ? shown.map((l, i) => <p key={i} className="st-small st-muted" style={{ marginTop: 3 }}>{l}</p>) : <p className="st-small st-faint" style={{ marginTop: 3 }}>{empty || 'Nothing added.'}</p>}
    </div>
  );
};

// ---- the routine step, with the exams and homework a student already knows about
const HabitsStep: React.FC<{ draft: Draft; setHabits: (h: Partial<StudyHabits>) => void; subjectsList: ChosenSubject[]; tz: string }> = ({ draft, setHabits, subjectsList, tz }) => {
  const { subjects: saved, toast } = useStudy();
  const h = draft.habits;
  const [exams, setExams] = useState<StudyExam[]>([]);
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [examTitle, setExamTitle] = useState(''); const [examDate, setExamDate] = useState('');
  const [taskTitle, setTaskTitle] = useState(''); const [taskDate, setTaskDate] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void studyApi.exams().then((r) => { if (r.ok) setExams(r.data.exams); });
    void studyApi.tasks('open', null, 20).then((r) => { if (r.ok) setTasks(r.data.tasks.filter((t) => t.kind === 'homework')); });
  }, []);
  const addExam = async () => {
    if (!examTitle.trim() || !examDate) { toast('Please write the exam and choose its date.'); return; }
    setBusy(true);
    const r = await studyApi.saveExam({ clientRef: newRef(), title: examTitle.trim(), examAt: zonedToUtc(`${examDate}T09:00`, tz).toISOString() });
    setBusy(false);
    if (!r.ok) { toast(r.error); return; }
    setExams((x) => [...x, r.data].sort((a, b) => a.examAt.localeCompare(b.examAt))); setExamTitle(''); setExamDate('');
  };
  const addTask = async () => {
    if (!taskTitle.trim()) { toast('Please write what the homework is.'); return; }
    setBusy(true);
    const r = await studyApi.saveTask({ clientRef: newRef(), title: taskTitle.trim(), kind: 'homework', dueAt: taskDate ? zonedToUtc(`${taskDate}T18:00`, tz).toISOString() : null });
    setBusy(false);
    if (!r.ok) { toast(r.error); return; }
    setTasks((x) => [...x, r.data]); setTaskTitle(''); setTaskDate('');
  };
  const dm = h.dailyMinutes || 60;
  return (
    <Step>
      <Field label="When do you like to study?" hint="Pick all that fit."><Chips>{PARTS_OF_DAY.map((p) => {
        const on = (h.partOfDay || []).includes(p.id);
        return <Chip key={p.id} on={on} onClick={() => setHabits({ partOfDay: on ? (h.partOfDay || []).filter((x) => x !== p.id) : [...(h.partOfDay || []), p.id] })}>{p.label}</Chip>;
      })}</Chips></Field>
      <Field label={`Time you can really study each day: ${Math.floor(dm / 60) ? `${Math.floor(dm / 60)} h ` : ''}${dm % 60 ? `${dm % 60} min` : ''}`.trim()} hint="Be honest. A small plan you keep beats a big one you skip.">
        <input type="range" min={15} max={480} step={15} value={dm} onChange={(e) => setHabits({ dailyMinutes: Number(e.target.value) })} style={{ width: '100%', accentColor: 'var(--st-accent)' }} aria-label="Study minutes per day" />
      </Field>
      <Field label="Days a week you can study"><Chips>{[1, 2, 3, 4, 5, 6, 7].map((n) => <Chip key={n} on={h.daysPerWeek === n} onClick={() => setHabits({ daysPerWeek: n })}>{n}</Chip>)}</Chips></Field>
      <Field label="A study session that suits you"><Chips>{[15, 25, 30, 45, 60].map((n) => <Chip key={n} on={h.sessionMinutes === n} onClick={() => setHabits({ sessionMinutes: n })}>{n} min</Chip>)}</Chips></Field>
      <Field label="How do you learn best? (any)"><Chips>{LEARNING_STYLES.map((l) => {
        const on = (h.learningStyles || []).includes(l.id);
        return <Chip key={l.id} on={on} onClick={() => setHabits({ learningStyles: on ? (h.learningStyles || []).filter((x) => x !== l.id) : [...(h.learningStyles || []), l.id] })}>{l.label}</Chip>;
      })}</Chips></Field>
      <Field label="Other things that take your time (optional)" hint="Sports, classes, family. We will plan around them."><input className="st-input" value={h.commitments || ''} maxLength={200} onChange={(e) => setHabits({ commitments: e.target.value })} /></Field>

      <div className="st-card-flat" style={{ display: 'grid', gap: 10 }}>
        <p className="st-title st-h3">Upcoming exams (optional)</p>
        {exams.map((x) => <div key={x.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span className="st-small">{x.title}</span><span className="st-small st-muted">{dueLabel(x.examAt, tz)}</span></div>)}
        <div style={{ display: 'grid', gap: 8 }}>
          <input className="st-input" placeholder="Exam name" value={examTitle} maxLength={140} onChange={(e) => setExamTitle(e.target.value)} aria-label="Exam name" />
          <div style={{ display: 'flex', gap: 8 }}><input className="st-input" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} aria-label="Exam date" /><Btn busy={busy} onClick={() => void addExam()}><Plus size={16} />Add</Btn></div>
        </div>
        <p className="st-tiny st-faint">Only add dates you are sure about. You can change them later.</p>
      </div>
      <div className="st-card-flat" style={{ display: 'grid', gap: 10 }}>
        <p className="st-title st-h3">Homework or deadlines (optional)</p>
        {tasks.map((x) => <div key={x.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span className="st-small">{x.title}</span><span className="st-small st-muted">{dueLabel(x.dueAt, tz)}</span></div>)}
        <div style={{ display: 'grid', gap: 8 }}>
          <input className="st-input" placeholder="What is it?" value={taskTitle} maxLength={140} onChange={(e) => setTaskTitle(e.target.value)} aria-label="Homework" />
          <div style={{ display: 'flex', gap: 8 }}><input className="st-input" type="date" value={taskDate} onChange={(e) => setTaskDate(e.target.value)} aria-label="Due date" /><Btn busy={busy} onClick={() => void addTask()}><Plus size={16} />Add</Btn></div>
        </div>
      </div>
      {saved.length === 0 && subjectsList.length === 0 && <p className="st-tiny st-faint">Tip: choose your subjects first so homework can be sorted by subject.</p>}
    </Step>
  );
};

export default Onboarding;
