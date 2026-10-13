import React, { useState } from 'react';
import { Check, Info, SkipForward, Trash2 } from 'lucide-react';
import { newRef, studyApi } from '../../services/studyApi';
import type { SessionActivity, StudySession } from '../../utils/studyTypes';
import { minutesLabel, utcToLocalInput, zonedToUtc } from '../../utils/studyTime';
import { useStudy } from './StudyContext';
import { Btn, Chip, Field, Sheet } from './ui';

export const ACTIVITY_LABEL: Record<SessionActivity, string> = {
  study: 'Learn', revise: 'Revise', practice: 'Practise', homework: 'Homework', review_mistakes: 'Fix mistakes', read: 'Read', flashcards: 'Flashcards'
};

// One study session: look at it, see why it is there, change it, mark it done or skipped, or remove it. A session the plan made becomes the student's
// own as soon as they change it, so making a new plan never undoes their edit (the database does this too, so it holds on every device).
export const SessionSheet: React.FC<{
  session?: StudySession | null; defaultStart?: string; onClose: () => void; onChanged: () => void;
}> = ({ session, defaultStart, onClose, onChanged }) => {
  const { subjects, tz, toast } = useStudy();
  const [ref] = useState(newRef);
  const [subjectId, setSubjectId] = useState(session?.subjectId || '');
  const [topic, setTopic] = useState(session?.topic || '');
  const [start, setStart] = useState(session ? utcToLocalInput(session.startsAt, tz) : defaultStart || '');
  const [dur, setDur] = useState(session?.durationMin || 30);
  const [activity, setActivity] = useState<SessionActivity>(session?.activity || 'study');
  const [objective, setObjective] = useState(session?.objective || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const fromPlan = session?.source === 'ai';

  const save = async () => {
    if (busy) return;
    if (!start) { setError('Please choose when the session starts.'); return; }
    setBusy(true); setError(null);
    const r = await studyApi.saveSession({
      ...(session ? { id: session.id } : { clientRef: ref }),
      subjectId: subjectId || null, topic: topic.trim(), startsAt: zonedToUtc(start, tz).toISOString(), durationMin: dur, activity, objective: objective.trim()
    });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    toast(session ? 'Saved.' : 'Session added.');
    onChanged(); onClose();
  };
  const mark = async (status: StudySession['status']) => {
    if (!session || busy) return;
    setBusy(true); setError(null);
    const r = await studyApi.sessionStatus(session.id, status);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    toast(status === 'done' ? 'Session done. Well done.' : status === 'skipped' ? 'Skipped. That is okay.' : 'Back on the plan.');
    onChanged(); onClose();
  };
  const remove = async () => {
    if (!session || busy) return;
    setBusy(true);
    const r = await studyApi.deleteSession(session.id);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    toast('Removed.');
    onChanged(); onClose();
  };

  return (
    <Sheet title={session ? 'Study session' : 'Add a session'} onClose={onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        {session && session.why && (
          <div className="st-notice" style={{ display: 'flex', gap: 10 }}>
            <Info size={18} style={{ flex: 'none', marginTop: 2, color: 'var(--st-accent)' }} />
            <div><p className="st-small"><b>{fromPlan ? 'Why this is here' : 'Your note'}</b></p><p className="st-small st-muted" style={{ marginTop: 2 }}>{session.why}</p></div>
          </div>
        )}
        {session && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn small kind={session.status === 'done' ? 'plain' : 'primary'} busy={busy} onClick={() => void mark(session.status === 'done' ? 'planned' : 'done')}><Check size={15} /> {session.status === 'done' ? 'Mark as not done' : 'Mark as done'}</Btn>
            {session.status !== 'done' && <Btn small kind="ghost" busy={busy} onClick={() => void mark(session.status === 'skipped' ? 'planned' : 'skipped')}><SkipForward size={15} /> {session.status === 'skipped' ? 'Put it back' : 'Skip it'}</Btn>}
          </div>
        )}
        <Field label="What will you work on?"><input className="st-input" value={topic} maxLength={140} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Chapter 5, laws of motion" /></Field>
        {subjects.length > 0 && (
          <Field label="Subject"><select className="st-input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">No subject</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        )}
        <Field label="When?"><input className="st-input" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="How long?"><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{[15, 25, 30, 45, 60, 90].map((m) => <Chip key={m} on={dur === m} onClick={() => setDur(m)}>{minutesLabel(m)}</Chip>)}</div></Field>
        <Field label="What kind of session?"><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{(Object.keys(ACTIVITY_LABEL) as SessionActivity[]).map((a) => <Chip key={a} on={activity === a} onClick={() => setActivity(a)}>{ACTIVITY_LABEL[a]}</Chip>)}</div></Field>
        <Field label="Goal for this session (optional)"><textarea className="st-input" value={objective} maxLength={300} onChange={(e) => setObjective(e.target.value)} style={{ minHeight: 60 }} /></Field>
        {fromPlan && <p className="st-tiny st-faint">Made by your plan. If you change it, it becomes yours, and making a new plan will not move it.</p>}
        {error && <div className="st-notice st-notice-warn" role="alert">{error}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          {session && (confirm
            ? <Btn kind="warn" busy={busy} onClick={() => void remove()}>Yes, remove</Btn>
            : <Btn kind="ghost" onClick={() => setConfirm(true)} aria-label="Remove this session"><Trash2 size={16} /></Btn>)}
          <Btn kind="primary" style={{ flex: 1 }} busy={busy} onClick={() => void save()}>{session ? 'Save changes' : 'Add session'}</Btn>
        </div>
      </div>
    </Sheet>
  );
};
