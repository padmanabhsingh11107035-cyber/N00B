import React, { useEffect, useState } from 'react';
import { BookOpen, PencilLine } from 'lucide-react';
import { studyApi } from '../../../services/studyApi';
import type { DashSubject } from '../../../utils/studyTypes';
import { subjectsProblem, type ChosenSubject } from '../../../utils/studyCatalog';
import { minutesLabel } from '../../../utils/studyTime';
import { useStudy } from '../StudyContext';
import { goStudy } from '../studyStore';
import { SubjectPicker } from '../SubjectPicker';
import { Btn, Empty, Loading, Page, Sheet, colorVars, subjectColor } from '../ui';
import type { PageProps } from '../StudyApp';

// The student's subjects (one to six). Taking one out never deletes its tasks or history; choosing it again brings them back.
const Subjects: React.FC<PageProps> = () => {
  const { me, setMe, toast } = useStudy();
  const [stats, setStats] = useState<DashSubject[] | null>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => { void studyApi.dashboard().then((r) => { if (r.ok) setStats(r.data.subjects); }); }, [me?.subjects.length]);

  return (
    <Page title="My subjects" hideBack right={<Btn small onClick={() => setEditing(true)}><PencilLine size={14} /> Edit</Btn>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {!me && <Loading />}
        {me && me.subjects.length === 0 && <Empty icon={<BookOpen size={28} />} title="No subjects yet" text="Choose between 1 and 6 subjects, and each one gets its own study space." action={<Btn kind="primary" small onClick={() => setEditing(true)}>Choose subjects</Btn>} />}
        <div className="st-grid2 st-grid2-lg">
          {me?.subjects.map((s) => {
            const c = subjectColor(s.name);
            const st = stats?.find((x) => x.id === s.id);
            return (
              <button key={s.id} className="st-card-flat" onClick={() => goStudy('subject', { id: s.id })} style={{ ...colorVars(c), textAlign: 'left', cursor: 'pointer', color: 'inherit', display: 'grid', gap: 8, borderTop: '3px solid var(--c)', padding: 16 }}>
                <span className="st-title st-h2">{s.name}</span>
                {s.kind === 'custom' && <span className="st-pill" style={{ width: 'fit-content' }}>Custom</span>}
                <span className="st-small st-muted">{st ? (st.minutes7 > 0 ? `${minutesLabel(st.minutes7)} this week` : 'Nothing yet this week') : ' '}</span>
                <span className="st-tiny st-faint">{st ? (st.pendingTasks > 0 ? `${st.pendingTasks} to do` : 'All clear') : ' '}</span>
              </button>
            );
          })}
        </div>
      </div>
      {editing && me && <EditSubjects initial={me.subjects.map((s) => ({ name: s.name, kind: s.kind }))} onClose={() => setEditing(false)} onSaved={(m) => { setMe(m); toast('Subjects updated.'); }} />}
    </Page>
  );
};

const EditSubjects: React.FC<{ initial: ChosenSubject[]; onClose: () => void; onSaved: (m: import('../../../utils/studyTypes').StudyMe) => void }> = ({ initial, onClose, onSaved }) => {
  const { me } = useStudy();
  const [list, setList] = useState<ChosenSubject[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const problem = subjectsProblem(list);
    if (problem) { setError(problem); return; }
    setBusy(true); setError(null);
    const r = await studyApi.setSubjects(list);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    onSaved(r.data); onClose();
  };
  return (
    <Sheet title="Choose your subjects" onClose={onClose}>
      <SubjectPicker level={me?.profile?.level || null} stream={me?.profile?.stream || null} value={list} onChange={setList} error={error} setError={setError} />
      <p className="st-tiny st-faint" style={{ margin: '12px 0' }}>Taking a subject out keeps its tasks and history safe. If you add it back, everything is there.</p>
      <Btn kind="primary" block busy={busy} onClick={() => void save()}>Save subjects</Btn>
    </Sheet>
  );
};
export default Subjects;
