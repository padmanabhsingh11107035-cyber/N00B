import React, { useCallback, useEffect, useState } from 'react';
import { PenTool, Plus } from 'lucide-react';
import { studyApi } from '../../../services/studyApi';
import { PAPERS } from '../../../utils/studySketch';
import { useStudy } from '../StudyContext';
import { goStudy } from '../studyStore';
import type { PageProps } from '../StudyApp';
import { Btn, Empty, ErrorBox, Loading, Page } from '../ui';
import { fmtWhen } from './testsCommon';

type Row = Extract<Awaited<ReturnType<typeof studyApi.sketches>>, { ok: true }>['data']['sketches'][number];

// The sketch board's list: the student's own drawings, private to them.
const Sketches: React.FC<PageProps> = () => {
  const { me } = useStudy();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [count, setCount] = useState({ n: 0, max: 100 });
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await studyApi.sketches();
    if (r.ok) { setRows(r.data.sketches); setCount({ n: r.data.count, max: r.data.countMax }); setError(null); } else setError(r.error);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const tz = me?.profile?.timezone;

  return (
    <Page title="Sketch board" subtitle={count.n + ' of ' + count.max + ' sketches'} right={<button className="st-icon-btn" onClick={() => goStudy('draw')} aria-label="New sketch"><Plus size={18} /></button>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <ErrorBox text={error} onRetry={() => void load()} />}
        {!rows && !error && <Loading rows={3} />}
        {rows && rows.length === 0 && <Empty icon={<PenTool size={26} />} title="A blank board is waiting" text="Draw a diagram, work out a sum, or sketch an idea. Pens, an eraser, undo, and four kinds of paper. Only you can see your sketches." action={<Btn kind="primary" onClick={() => goStudy('draw')}><Plus size={16} /> New sketch</Btn>} />}
        <div className="st-grid2">
          {rows?.map((s) => (
            <button key={s.id} className="st-row-btn" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }} onClick={() => goStudy('draw', { id: s.id })}>
              <span style={{ display: 'block', height: 70, borderRadius: 12, border: '1px solid var(--st-border)', background: s.paper === 'dark' ? '#15171f' : '#fffdf9', position: 'relative', overflow: 'hidden' }} aria-hidden="true">
                <PenTool size={26} style={{ position: 'absolute', inset: 0, margin: 'auto', color: s.paper === 'dark' ? '#f4f1ec' : '#1f1f24', opacity: 0.35 }} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span className="st-title st-h3" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title || 'Untitled sketch'}</span>
                <span className="st-tiny st-faint" style={{ display: 'block' }}>{PAPERS.find((p) => p.id === s.paper)?.label || 'Plain'} paper · {s.strokes} {s.strokes === 1 ? 'line' : 'lines'}</span>
                <span className="st-tiny st-faint" style={{ display: 'block' }}>{fmtWhen(s.updatedAt, tz)}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="st-tiny st-faint">Your sketches are private. Not even the administrator of NOOB STUDY can see them.</p>
      </div>
    </Page>
  );
};
export default Sketches;
