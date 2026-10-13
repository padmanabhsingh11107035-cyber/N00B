import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { studyApi, type StudyProgress } from '../../../services/studyApi';
import { BarChart, Donut, LineChart, PALETTE, Stat, dayLabel, dayTick } from '../../charts/Charts';
import { minutesLabel } from '../../../utils/studyTime';
import { goStudy } from '../studyStore';
import { hasRoute, type PageProps } from '../StudyApp';
import { Btn, Card, Chip, ErrorBox, Loading, Page } from '../ui';

const TOPIC_LABEL: Record<string, { label: string; color: string }> = {
  not_started: { label: 'Not started', color: '#85817a' },
  learning: { label: 'Learning', color: '#f2c46d' },
  confident: { label: 'Confident', color: '#7fd1ac' }
};
const RANGES = [{ d: 7, l: '7 days' }, { d: 30, l: '30 days' }, { d: 90, l: '90 days' }];

// My progress: the student's own study, in charts. Everything here is counted from what they did in the app, nothing is guessed or filled in.
const Progress: React.FC<PageProps> = () => {
  const [days, setDays] = useState(30);
  const [p, setP] = useState<StudyProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (d: number) => {
    const r = await studyApi.progress(d);
    if (r.ok) { setP(r.data); setError(null); } else setError(r.error);
  }, []);
  useEffect(() => { setP(null); void load(days); }, [days, load]);

  // each bar is labelled by its date (the month too on the first bar and the 1st of a month), so the labels stay short enough to read
  const perDay = useMemo(() => (p?.minutesByDay || []).map((x, i) => ({ label: dayTick(x.d, i), value: x.n })), [p]);
  const weekdays = useMemo(() => {
    // the same minutes, added up by weekday (which days of the week the student studies most)
    const sums = [0, 0, 0, 0, 0, 0, 0];
    for (const x of p?.minutesByDay || []) { const dt = new Date(String(x.d).slice(0, 10) + 'T12:00:00Z'); if (!isNaN(dt.getTime())) sums[(dt.getUTCDay() + 6) % 7] += x.n; }
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, i) => ({ label, value: sums[i] }));
  }, [p]);
  const scores = useMemo(() => {
    const all = [
      ...(p?.quizScores || []).map((s) => ({ at: s.at, y: s.percent })),
      ...(p?.testScores || []).map((s) => ({ at: s.at, y: s.percent }))
    ].sort((a, b) => a.at.localeCompare(b.at));
    return all.map((s) => ({ x: dayLabel(s.at), y: s.y }));
  }, [p]);
  const empty = !!p && p.totals.minutes === 0 && p.totals.quizzes === 0 && p.totals.tasksDone === 0 && p.quizScores.length === 0 && p.testScores.length === 0 && p.topicStatus.length === 0;

  return (
    <Page title="My progress" subtitle={'The last ' + days + ' days'} wide>
      <div style={{ display: 'grid', gap: 14 }}>
        <div className="st-hscroll" role="group" aria-label="Period">
          {RANGES.map((r) => <Chip key={r.d} on={days === r.d} onClick={() => setDays(r.d)}>{r.l}</Chip>)}
        </div>
        {error && <ErrorBox text={error} onRetry={() => void load(days)} />}
        {!p && !error && <Loading rows={3} />}
        {p && (
          <>
            <Card>
              <div className="st-grid3" style={{ rowGap: 16 }}>
                <Stat value={minutesLabel(p.totals.minutes)} label="studied" />
                <Stat value={p.totals.activeDays} label={p.totals.activeDays === 1 ? 'day active' : 'days active'} hint={'of ' + p.days} />
                <Stat value={p.totals.tasksDone} label={p.totals.tasksDone === 1 ? 'task done' : 'tasks done'} />
                <Stat value={p.totals.quizzes} label={p.totals.quizzes === 1 ? 'quiz or test' : 'quizzes and tests'} />
                <Stat value={p.totals.cards} label="flashcards revised" />
                <Stat value={p.totals.openMistakes} label="mistakes to practise" tone={p.totals.openMistakes ? 'var(--st-warn)' : undefined} />
              </div>
            </Card>
            {empty && (
              <div className="st-notice"><p className="st-small">Nothing to chart yet. Finish a focus session, a task or a quiz and your graphs will start to fill in. They only ever show what you really did.</p></div>
            )}
            <div className="st-split">
              <Card><p className="st-label">Minutes studied each day</p>{days <= 30 ? <BarChart bars={perDay} label="Minutes studied" unit=" min" color={PALETTE[0]} gap={days > 14 ? 2 : 5} /> : <LineChart points={perDay.map((x) => ({ x: x.label, y: x.value }))} label="Minutes studied" unit=" min" />}</Card>
              <Card><p className="st-label">Which days you study most (minutes)</p><BarChart bars={weekdays} label="Minutes by weekday" unit=" min" color={PALETTE[1]} /></Card>
              <Card><p className="st-label">Time for each subject</p><Donut slices={p.minutesBySubject.map((s, i) => ({ label: s.label, value: s.n, color: PALETTE[i % PALETTE.length] }))} label="Time by subject" unit=" min" centre={minutesLabel(p.totals.minutes)} /></Card>
              <Card><p className="st-label">Where your topics stand</p><Donut slices={p.topicStatus.map((s) => ({ label: (TOPIC_LABEL[s.label] || { label: s.label }).label, value: s.n, color: (TOPIC_LABEL[s.label] || { color: PALETTE[4] }).color }))} label="Topic progress" unit=" topics" /></Card>
              <Card><p className="st-label">Quiz and test scores (%)</p><LineChart points={scores} label="Quiz and test scores" unit="%" max={100} color={PALETTE[2]} /></Card>
              <Card><p className="st-label">Mistakes still to practise</p><BarChart bars={p.mistakesBySubject.map((s, i) => ({ label: s.label, value: s.n, color: PALETTE[(i + 5) % PALETTE.length] }))} label="Open mistakes by subject" /></Card>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {hasRoute('testHistory') && <Btn onClick={() => goStudy('testHistory')}>Test history</Btn>}
              {hasRoute('mistakes') && p.totals.openMistakes > 0 && <Btn onClick={() => goStudy('mistakes')}>Practise my mistakes</Btn>}
            </div>
            <p className="st-tiny st-faint">These numbers are yours. The administrator of NOOB STUDY can see your study time and marks to help students, never your chats, pictures, notes or sketches.</p>
          </>
        )}
      </div>
    </Page>
  );
};
export default Progress;
