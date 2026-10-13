import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NotebookPen, Pin, Plus, Search } from 'lucide-react';
import { studyApi } from '../../../services/studyApi';
import { useStudy } from '../StudyContext';
import { goStudy } from '../studyStore';
import type { PageProps } from '../StudyApp';
import { Btn, Chip, Empty, ErrorBox, Loading, Page, SubjectTag } from '../ui';
import { fmtWhen } from './testsCommon';

type NoteRow = Extract<Awaited<ReturnType<typeof studyApi.notes>>, { ok: true }>['data']['notes'][number];

// The notepad: the student's own notes, private to them (the administrator can never see them). Each one saves itself as it is written.
const Notes: React.FC<PageProps> = () => {
  const { subjects, subjectName, colorOf, me } = useStudy();
  const [rows, setRows] = useState<NoteRow[] | null>(null);
  const [count, setCount] = useState({ n: 0, max: 300 });
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async (q: string, s: string | null) => {
    const my = ++seq.current;
    const r = await studyApi.notes(s, q);
    if (my !== seq.current) return;      // a newer search is already on its way
    if (r.ok) { setRows(r.data.notes); setCount({ n: r.data.count, max: r.data.countMax }); setError(null); } else setError(r.error);
  }, []);
  useEffect(() => { const t = window.setTimeout(() => void load(search, subject), search ? 250 : 0); return () => window.clearTimeout(t); }, [search, subject, load]);

  const tz = me?.profile?.timezone;
  return (
    <Page title="Notepad" subtitle={count.n + ' of ' + count.max + ' notes'} right={<button className="st-icon-btn" onClick={() => goStudy('note')} aria-label="New note"><Plus size={18} /></button>}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: 16, color: 'var(--st-faint)' }} />
          <input className="st-input" style={{ paddingLeft: 38 }} placeholder="Search your notes" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search your notes" maxLength={80} />
        </div>
        {subjects.length > 0 && (
          <div className="st-hscroll" role="group" aria-label="Filter by subject">
            <Chip on={subject === null} onClick={() => setSubject(null)}>All</Chip>
            {subjects.map((s) => <Chip key={s.id} on={subject === s.id} onClick={() => setSubject(subject === s.id ? null : s.id)}>{s.name}</Chip>)}
          </div>
        )}
        {error && <ErrorBox text={error} onRetry={() => void load(search, subject)} />}
        {!rows && !error && <Loading rows={3} />}
        {rows && rows.length === 0 && (
          search || subject
            ? <div className="st-card-flat"><p className="st-small st-muted">No notes match that.</p></div>
            : <Empty icon={<NotebookPen size={26} />} title="Your notepad is empty" text="Write anything: a formula, a plan, a thought. Notes save themselves and only you can read them." action={<Btn kind="primary" onClick={() => goStudy('note')}><Plus size={16} /> New note</Btn>} />
        )}
        <div style={{ display: 'grid', gap: 8 }}>
          {rows?.map((n) => (
            <button key={n.id} className="st-row-btn" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 4 }} onClick={() => goStudy('note', { id: n.id })}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                {n.pinned && <Pin size={14} style={{ color: 'var(--st-accent)', flex: 'none' }} />}
                <span className="st-title st-h3" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{n.title || 'Untitled note'}</span>
              </span>
              {n.preview && <span className="st-small st-muted" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>{n.preview}</span>}
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {n.subjectId && <SubjectTag name={subjectName(n.subjectId)} color={colorOf(n.subjectId)} />}
                <span className="st-tiny st-faint">{fmtWhen(n.updatedAt, tz)}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="st-tiny st-faint">Your notes are private. Not even the administrator of NOOB STUDY can read them.</p>
      </div>
    </Page>
  );
};
export default Notes;
