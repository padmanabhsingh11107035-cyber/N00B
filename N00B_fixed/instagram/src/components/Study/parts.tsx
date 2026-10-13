import React, { useState } from 'react';
import { Check, Clock, Pencil, Trash2 } from 'lucide-react';
import { newRef, studyApi } from '../../services/studyApi';
import type { Priority, StudyExam, StudySession, StudyTask, TaskKind, TaskStatus } from '../../utils/studyTypes';
import { clockText, countdown, dueLabel, minutesLabel, utcToLocalInput, zonedToUtc } from '../../utils/studyTime';
import { useStudy } from './StudyContext';
import { Btn, Chip, Field, Sheet, SubjectTag, colorVars } from './ui';

// Pieces several NOOB STUDY screens share: a task line, the add/edit task sheet, a planned session line, an exam line.

export const KIND_LABEL: Record<TaskKind, string> = { task: 'Task', homework: 'Homework', revision: 'Revision', practice: 'Practice', exam_prep: 'Exam prep' };
export const STATUS_LABEL: Record<TaskStatus, string> = { todo: 'Not started', doing: 'In progress', done: 'Done' };
export const PRIORITY_LABEL: Record<Priority, string> = { low: 'Relaxed', normal: 'Normal', high: 'Important' };

export const TaskRow: React.FC<{ task: StudyTask; onToggle: (t: StudyTask) => void; onEdit: (t: StudyTask) => void; busy?: boolean; showDue?: boolean }> = ({ task, onToggle, onEdit, busy, showDue = true }) => {
  const { tz, colorOf, subjectName } = useStudy();
  const done = task.status === 'done';
  const sName = subjectName(task.subjectId);
  const overdue = !done && !!task.dueAt && new Date(task.dueAt).getTime() < Date.now();
  return (
    <div className="st-card-flat" style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: done ? 0.6 : 1 }}>
      <button className="st-check" data-on={done ? 'true' : 'false'} disabled={busy} onClick={() => onToggle(task)} aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`} aria-pressed={done}><Check size={16} strokeWidth={3} /></button>
      <button onClick={() => onEdit(task)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 0, color: 'inherit', cursor: 'pointer', padding: 0 }} aria-label={`Edit ${task.title}`}>
        <span className="st-title st-h3" style={{ display: 'block', textDecoration: done ? 'line-through' : 'none', overflowWrap: 'anywhere' }}>{task.title}</span>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 5 }}>
          {sName && <SubjectTag name={sName} color={colorOf(task.subjectId)} />}
          {showDue && task.dueAt && <span className="st-tiny" style={{ color: overdue ? 'var(--st-warn)' : 'var(--st-muted)', fontWeight: 700 }}><Clock size={11} style={{ display: 'inline', verticalAlign: '-1px' }} /> {dueLabel(task.dueAt, tz)}</span>}
          {task.estMinutes ? <span className="st-tiny st-faint">{minutesLabel(task.estMinutes)}</span> : null}
          {task.priority === 'high' && !done && <span className="st-pill" style={{ color: 'var(--st-warn)' }}>Important</span>}
          {task.status === 'doing' && <span className="st-pill">In progress</span>}
        </span>
      </button>
      <button className="st-icon-btn" onClick={() => onEdit(task)} aria-label="Edit" style={{ width: 34, height: 34, borderRadius: 11 }}><Pencil size={14} /></button>
    </div>
  );
};

// Add or change a task. A date typed here is read in the student's own time zone. Saving twice never makes two (the clientRef).
export const TaskSheet: React.FC<{ task?: StudyTask | null; defaults?: Partial<StudyTask>; onClose: () => void; onSaved: (t: StudyTask) => void; onDeleted?: (id: string) => void }> = ({ task, defaults, onClose, onSaved, onDeleted }) => {
  const { subjects, tz, toast } = useStudy();
  const [ref] = useState(newRef);
  const [title, setTitle] = useState(task?.title || '');
  const [subjectId, setSubjectId] = useState<string>(task?.subjectId || defaults?.subjectId || '');
  const [kind, setKind] = useState<TaskKind>(task?.kind || defaults?.kind || 'task');
  const [due, setDue] = useState(task?.dueAt ? utcToLocalInput(task.dueAt, tz) : defaults?.dueAt ? utcToLocalInput(defaults.dueAt, tz) : '');
  const [priority, setPriority] = useState<Priority>(task?.priority || 'normal');
  const [est, setEst] = useState<number | null>(task?.estMinutes ?? null);
  const [status, setStatus] = useState<TaskStatus>(task?.status || 'todo');
  const [desc, setDesc] = useState(task?.description || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async () => {
    if (busy) return;
    if (!title.trim()) { setError('Please write what the task is.'); return; }
    setBusy(true); setError(null);
    const payload = {
      ...(task ? { id: task.id } : { clientRef: ref }),
      title: title.trim(), subjectId: subjectId || null, kind, priority, estMinutes: est, description: desc,
      dueAt: due ? zonedToUtc(due, tz).toISOString() : null, status
    } as Partial<StudyTask> & { clientRef?: string };
    const res = await studyApi.saveTask(payload);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    toast(task ? 'Saved.' : 'Added. One step at a time.');
    onSaved(res.data);
    onClose();
  };
  const remove = async () => {
    if (!task || busy) return;
    setBusy(true);
    const res = await studyApi.deleteTask(task.id);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    toast('Removed.');
    onDeleted?.(task.id);
    onClose();
  };

  return (
    <Sheet title={task ? 'Edit task' : 'Add a task'} onClose={onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label="What is it?"><input className="st-input" autoFocus={!task} value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Solve NCERT exercise 4.2" /></Field>
        <Field label="Type"><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{(Object.keys(KIND_LABEL) as TaskKind[]).map((k) => <Chip key={k} on={kind === k} onClick={() => setKind(k)}>{KIND_LABEL[k]}</Chip>)}</div></Field>
        {subjects.length > 0 && (
          <Field label="Subject"><select className="st-input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">No subject</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        )}
        <Field label="When is it due? (optional)"><input className="st-input" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <Field label="How long might it take?"><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{[15, 30, 45, 60, 90, 120].map((m) => <Chip key={m} on={est === m} onClick={() => setEst(est === m ? null : m)}>{minutesLabel(m)}</Chip>)}</div></Field>
        <Field label="How important?"><div style={{ display: 'flex', gap: 8 }}>{(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => <Chip key={p} on={priority === p} onClick={() => setPriority(p)}>{PRIORITY_LABEL[p]}</Chip>)}</div></Field>
        {task && <Field label="Progress"><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => <Chip key={s} on={status === s} onClick={() => setStatus(s)}>{STATUS_LABEL[s]}</Chip>)}</div></Field>}
        <Field label="Notes (optional)"><textarea className="st-input" value={desc} maxLength={1000} onChange={(e) => setDesc(e.target.value)} style={{ minHeight: 70 }} /></Field>
        {error && <div className="st-notice st-notice-warn" role="alert">{error}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          {task && (confirmDelete
            ? <Btn kind="warn" busy={busy} onClick={() => void remove()}>Yes, delete</Btn>
            : <Btn kind="ghost" onClick={() => setConfirmDelete(true)} aria-label="Delete this task"><Trash2 size={16} /></Btn>)}
          <Btn kind="primary" style={{ flex: 1 }} busy={busy} onClick={() => void save()}>{task ? 'Save' : 'Add task'}</Btn>
        </div>
      </div>
    </Sheet>
  );
};

export const SessionRow: React.FC<{ session: StudySession; onStatus: (s: StudySession, status: StudySession['status']) => void; onOpen?: (s: StudySession) => void; busy?: boolean }> = ({ session, onStatus, onOpen, busy }) => {
  const { tz, colorOf, subjectName } = useStudy();
  const done = session.status === 'done', skipped = session.status === 'skipped';
  const name = subjectName(session.subjectId);
  return (
    <div className="st-card-flat" style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: done || skipped ? 0.6 : 1, ...(name ? colorVars(colorOf(session.subjectId)) : null), borderLeft: '4px solid var(--c, var(--st-accent))' }}>
      <button className="st-check" data-on={done ? 'true' : 'false'} disabled={busy} onClick={() => onStatus(session, done ? 'planned' : 'done')} aria-label={done ? 'Mark as not done' : 'Mark as done'} aria-pressed={done}><Check size={16} strokeWidth={3} /></button>
      <button onClick={() => onOpen?.(session)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 0, color: 'inherit', cursor: onOpen ? 'pointer' : 'default', padding: 0 }}>
        <span className="st-title st-h3" style={{ display: 'block', textDecoration: done || skipped ? 'line-through' : 'none' }}>{session.topic || name || 'Study session'}</span>
        <span className="st-tiny st-muted" style={{ display: 'block', marginTop: 3 }}>{clockText(new Date(session.startsAt), tz)} · {minutesLabel(session.durationMin)}{name && session.topic ? ` · ${name}` : ''}{skipped ? ' · skipped' : ''}</span>
        {session.objective && <span className="st-tiny st-faint" style={{ display: 'block', marginTop: 2 }}>{session.objective}</span>}
      </button>
    </div>
  );
};

export const ExamRow: React.FC<{ exam: StudyExam; onOpen?: (e: StudyExam) => void }> = ({ exam, onOpen }) => {
  const { tz, subjectName, colorOf } = useStudy();
  const c = countdown(exam.examAt, tz);
  const name = subjectName(exam.subjectId);
  return (
    <button className="st-row-btn" onClick={() => onOpen?.(exam)} style={name ? colorVars(colorOf(exam.subjectId)) : undefined}>
      <span style={{ minWidth: 54, textAlign: 'center', padding: '7px 8px', borderRadius: 14, background: c.soon ? 'var(--st-accent-soft)' : 'var(--st-surface2)', color: c.soon ? 'var(--st-accent)' : 'var(--st-muted)' }}>
        <span className="st-title" style={{ display: 'block', fontSize: c.days > 1 ? 20 : 13 }}>{c.days > 1 ? c.days : c.label}</span>
        {c.days > 1 && <span className="st-tiny" style={{ fontWeight: 800 }}>days</span>}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span className="st-title st-h3" style={{ display: 'block', overflowWrap: 'anywhere' }}>{exam.title}</span>
        <span className="st-tiny st-muted">{dueLabel(exam.examAt, tz)}{name ? ` · ${name}` : ''}</span>
      </span>
    </button>
  );
};
