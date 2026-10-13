import React, { useCallback, useEffect, useState } from 'react';
import { ListChecks, Plus } from 'lucide-react';
import { studyApi } from '../../../services/studyApi';
import type { StudyTask } from '../../../utils/studyTypes';
import { useStudy } from '../StudyContext';
import { TaskRow, TaskSheet } from '../parts';
import { Btn, Chip, Empty, ErrorBox, Loading, Page } from '../ui';
import type { PageProps } from '../StudyApp';

// Homework and tasks: add, edit, tick off, delete. Long lists load a page at a time.
type Filter = 'open' | 'upcoming' | 'overdue' | 'done' | 'all';
const FILTERS: Array<{ id: Filter; label: string }> = [{ id: 'open', label: 'To do' }, { id: 'upcoming', label: 'Coming up' }, { id: 'overdue', label: 'Waiting' }, { id: 'done', label: 'Done' }, { id: 'all', label: 'Everything' }];
const PAGE = 30;

const Tasks: React.FC<PageProps> = ({ params }) => {
  const { subjects, toast } = useStudy();
  const [filter, setFilter] = useState<Filter>((FILTERS.some((f) => f.id === params.filter) ? params.filter : 'open') as Filter);
  const [subject, setSubject] = useState<string>(typeof params.subject === 'string' ? params.subject : '');
  const [tasks, setTasks] = useState<StudyTask[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ task?: StudyTask | null } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (append = false, from = 0) => {
    const r = await studyApi.tasks(filter, subject || null, PAGE, from);
    if (!r.ok) { setError(r.error); return; }
    setError(null);
    setMore(r.data.tasks.length === PAGE);
    setTasks((cur) => (append && cur ? [...cur, ...r.data.tasks] : r.data.tasks));
  }, [filter, subject]);
  useEffect(() => { setTasks(null); void load(); }, [load]);

  const toggle = async (t: StudyTask) => {
    if (busyId) return;
    setBusyId(t.id);
    const r = await studyApi.taskStatus(t.id, t.status === 'done' ? 'todo' : 'done');
    setBusyId(null);
    if (!r.ok) { toast(r.error); return; }
    if (r.data.status === 'done') toast('Nice. One more done.');
    void load();
  };

  return (
    <Page title="Homework and tasks" right={<Btn small kind="primary" onClick={() => setSheet({})}><Plus size={15} /> Add</Btn>}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="st-hscroll">{FILTERS.map((f) => <Chip key={f.id} on={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</Chip>)}</div>
        {subjects.length > 1 && (
          <select className="st-input" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject"><option value="">All subjects</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        )}
        {error && <ErrorBox text={error} onRetry={() => void load()} />}
        {!tasks && !error && <Loading rows={4} />}
        {tasks && tasks.length === 0 && (
          <Empty icon={<ListChecks size={28} />} title={filter === 'done' ? 'Nothing finished yet' : filter === 'overdue' ? 'Nothing is waiting for you' : 'No tasks here'}
            text={filter === 'overdue' ? 'You are all caught up.' : 'Add homework, revision or anything you want to remember.'} action={<Btn kind="primary" small onClick={() => setSheet({})}>Add a task</Btn>} />
        )}
        {tasks?.map((t) => <TaskRow key={t.id} task={t} busy={busyId === t.id} onToggle={(x) => void toggle(x)} onEdit={(x) => setSheet({ task: x })} />)}
        {more && <Btn kind="ghost" onClick={() => void load(true, tasks?.length || 0)}>Show more</Btn>}
      </div>
      {sheet && <TaskSheet task={sheet.task} defaults={subject ? { subjectId: subject } : undefined} onClose={() => setSheet(null)} onSaved={() => void load()} onDeleted={() => void load()} />}
    </Page>
  );
};
export default Tasks;
