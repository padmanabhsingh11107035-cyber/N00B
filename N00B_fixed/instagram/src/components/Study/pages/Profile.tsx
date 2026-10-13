import React from 'react';
import { BadgeCheck, ChevronRight, Palette, PencilLine, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { languageLabel, levelLabel } from '../../../utils/studyCatalog';
import { minutesLabel } from '../../../utils/studyTime';
import { useStudy } from '../StudyContext';
import { goStudy } from '../studyStore';
import { Btn, Card, Empty, Orb, Page, SubjectTag } from '../ui';
import { hasRoute, type PageProps } from '../StudyApp';

// What NOOB STUDY knows about the student, in plain words, with a way to change every part of it.
const Profile: React.FC<PageProps> = () => {
  const { me, user, gate } = useStudy();
  const p = me?.profile;
  if (!p) return <Page title="Profile"><Empty title="Your profile is empty" text="Set up your study space and it will show up here." action={<Btn small kind="primary" onClick={() => goStudy('onboarding')}>Set up</Btn>} /></Page>;
  const edit = (step: number) => goStudy('onboarding', { step });
  const Row: React.FC<{ title: string; step: number; children: React.ReactNode }> = ({ title, step, children }) => (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <p className="st-title st-h3">{title}</p>
        <Btn small kind="ghost" onClick={() => edit(step)}><PencilLine size={13} /> Edit</Btn>
      </div>
      {children}
    </Card>
  );
  const Line: React.FC<{ k: string; v?: React.ReactNode }> = ({ k, v }) => (v ? <p className="st-small" style={{ marginTop: 4 }}><span className="st-faint">{k}: </span>{v}</p> : null);
  return (
    <Page title="Profile and settings">
      <div style={{ display: 'grid', gap: 14 }}>
        <Card tint style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Orb size={54} />
          <div style={{ minWidth: 0 }}>
            <p className="st-title st-h2">{p.displayName || user.displayName}</p>
            <p className="st-small st-muted">{levelLabel(p.level)}{p.classYear ? ` · ${isNaN(Number(p.classYear)) ? p.classYear : `Class/Year ${p.classYear}`}` : ''}</p>
          </div>
        </Card>
        <Row title="About you" step={0}>
          <Line k="Country" v={p.country} /><Line k="Learning language" v={languageLabel(p.language)} /><Line k="Time zone" v={p.timezone} /><Line k="School or college" v={p.institution} />
        </Row>
        <Row title="Your studies" step={1}>
          <Line k="Board" v={p.board} /><Line k="Stream" v={p.stream} /><Line k="Course" v={p.course} /><Line k="Specialization" v={p.specialization} />
        </Row>
        <Row title="Your subjects" step={2}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>{me?.subjects.map((s) => <SubjectTag key={s.id} name={s.name} />)}</div>
        </Row>
        <Row title="Your goals" step={3}>
          <Line k="Goals" v={(p.goals.mainGoals || []).join(', ')} /><Line k="Exam" v={p.goals.exam} /><Line k="Target" v={p.goals.targets} /><Line k="Hardest part" v={p.goals.biggestProblem} />
          {!(p.goals.mainGoals || []).length && !p.goals.exam && <p className="st-small st-faint">Nothing added yet.</p>}
        </Row>
        <Row title="Your routine" step={4}>
          <Line k="Each day" v={p.habits.dailyMinutes ? minutesLabel(p.habits.dailyMinutes) : ''} /><Line k="Days a week" v={p.habits.daysPerWeek} /><Line k="Session" v={p.habits.sessionMinutes ? `${p.habits.sessionMinutes} min` : ''} /><Line k="Best time" v={(p.habits.partOfDay || []).join(', ')} />
        </Row>
        <Row title="Your tutor" step={5}>
          <Line k="Name" v={p.tutor.name || 'Not named yet'} /><Line k="Language" v={languageLabel(p.tutor.language || p.language)} /><Line k="Style" v={p.tutor.style} /><Line k="Answers" v={p.tutor.length} />
        </Row>
        {gate?.admission && (
          <button className="st-row-btn" onClick={() => goStudy('admission')}><BadgeCheck size={20} style={{ color: 'var(--st-accent)' }} /><span style={{ flex: 1 }}><span className="st-title st-h3" style={{ display: 'block' }}>My admission</span><span className="st-tiny st-muted">Number {gate.admission.admissionNo}. Change your details</span></span><ChevronRight size={18} /></button>
        )}
        {hasRoute('appearance') && (
          <button className="st-row-btn" onClick={() => goStudy('appearance')}><Palette size={20} style={{ color: 'var(--st-accent)' }} /><span style={{ flex: 1 }}><span className="st-title st-h3" style={{ display: 'block' }}>Looks and sounds</span><span className="st-tiny st-muted">Colours, chat theme, voices, alarm</span></span><ChevronRight size={18} /></button>
        )}
        <button className="st-row-btn" onClick={() => goStudy('settings')}><SlidersHorizontal size={20} style={{ color: 'var(--st-accent)' }} /><span style={{ flex: 1 }}><span className="st-title st-h3" style={{ display: 'block' }}>Settings</span><span className="st-tiny st-muted">Tutor, reminders, time zone</span></span><ChevronRight size={18} /></button>
        <button className="st-row-btn" onClick={() => goStudy('privacy')}><ShieldCheck size={20} style={{ color: 'var(--st-accent)' }} /><span style={{ flex: 1 }}><span className="st-title st-h3" style={{ display: 'block' }}>Privacy and your data</span><span className="st-tiny st-muted">What is saved, and how to delete it</span></span><ChevronRight size={18} /></button>
      </div>
    </Page>
  );
};
export default Profile;
