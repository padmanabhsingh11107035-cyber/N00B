import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';
import { studyApi } from '../../../services/studyApi';
import { BarChart, Donut, LineChart, Stat, dayLabel, PALETTE } from '../../charts/Charts';
import { useStudy } from '../StudyContext';
import { goStudy } from '../studyStore';
import { hasRoute, type PageProps } from '../StudyApp';
import { Btn, Card, Empty, ErrorBox, Loading, Page, SubjectTag, subjectColor } from '../ui';
import { fmtWhen } from './testsCommon';

type Row = { id: string; name: string; subject: string; score: number; max: number; percent: number; takenAt: string };

// The test history: for each weekly test only its name, the subject, the marks and the date and time. Nothing else exists to show.
const TestHistory: React.FC<PageProps> = () => {
  const { me } = useStudy();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tz = me?.profile?.timezone;

  const load = useCallback(async () => {
    const r = await studyApi.testsHistory(200);
    if (r.ok) { setRows(r.data.tests); setError(null); } else setError(r.error);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const stats = useMemo(() => {
    const list = rows || [];
    if (!list.length) return null;
    const avg = Math.round(list.reduce((a, r) => a + r.percent, 0) / list.length);
    const best = list.reduce((a, r) => (r.percent > a.percent ? r : a), list[0]);
    const bySubject = new Map<string, { sum: number; n: number }>();
    for (const r of list) { const e = bySubject.get(r.subject) || { sum: 0, n: 0 }; e.sum += r.percent; e.n += 1; bySubject.set(r.subject, e); }
    return { avg, best, subjects: [...bySubject.entries()].map(([label, e]) => ({ label, value: Math.round(e.sum / e.n) })) };
  }, [rows]);
  const line = useMemo(() => [...(rows || [])].reverse().map((r) => ({ x: dayLabel(r.takenAt), y: r.percent })), [rows]);
  const bands = useMemo(() => {
    const b = [{ label: '0-39', value: 0 }, { label: '40-59', value: 0 }, { label: '60-79', value: 0 }, { label: '80-100', value: 0 }];
    for (const r of rows || []) b[r.percent < 40 ? 0 : r.percent < 60 ? 1 : r.percent < 80 ? 2 : 3].value += 1;
    return b;
  }, [rows]);

  return (
    <Page title="Test history" subtitle="Name, marks, date and time">
      <div style={{ display: 'grid', gap: 14 }}>
        {error && <ErrorBox text={error} onRetry={() => void load()} />}
        {!rows && !error && <Loading rows={3} />}
        {rows && rows.length === 0 && (
          <Empty icon={<Trophy size={26} />} title="No tests taken yet" text="Take this week’s test and your marks will be kept here, week after week." action={hasRoute('tests') ? <Btn kind="primary" onClick={() => goStudy('tests')}>Weekly tests</Btn> : undefined} />
        )}
        {rows && stats && (
          <>
            <Card>
              <div className="st-grid3">
                <Stat value={rows.length} label={rows.length === 1 ? 'test taken' : 'tests taken'} />
                <Stat value={stats.avg + '%'} label="average" />
                <Stat value={stats.best.percent + '%'} label="best" hint={stats.best.subject} />
              </div>
            </Card>
            {line.length > 1 && <Card><p className="st-label">Your marks over time (%)</p><LineChart points={line} label="Test marks" unit="%" max={100} color={PALETTE[0]} /></Card>}
            <div className="st-split">
              <Card><p className="st-label">By subject (average %)</p><BarChart bars={stats.subjects.map((s, i) => ({ label: s.label, value: s.value, color: PALETTE[i % PALETTE.length] }))} label="Average by subject" unit="%" height={150} /></Card>
              <Card><p className="st-label">How your tests went</p><Donut slices={bands.map((b, i) => ({ label: b.label + '%', value: b.value, color: ['#e57fa8', '#f2c46d', '#6fb1f2', '#7fd1ac'][i] }))} label="Tests by marks" size={110} centre={String(rows.length)} unit=" tests" /></Card>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {rows.map((r) => {
                const c = subjectColor(r.subject);
                return (
                  <div key={r.id} className="st-card-flat" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p className="st-title st-h3" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</p>
                      <div style={{ marginTop: 4 }}><SubjectTag name={r.subject} color={c} /></div>
                      <p className="st-tiny st-faint" style={{ marginTop: 4 }}>{fmtWhen(r.takenAt, tz)}</p>
                    </div>
                    <div style={{ textAlign: 'right', flex: 'none' }}>
                      <p className="st-title" style={{ fontSize: 22 }}>{r.score}/{r.max}</p>
                      <p className="st-tiny st-faint">{r.percent}%</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="st-tiny st-faint">Only the name, subject, marks and time of each test are kept. The questions and your answers are removed when a test is handed in.</p>
          </>
        )}
      </div>
    </Page>
  );
};
export default TestHistory;
