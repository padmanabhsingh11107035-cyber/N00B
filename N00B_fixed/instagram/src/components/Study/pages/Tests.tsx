import React, { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, CheckCircle2, History, Lock, Play, Sparkles, Trophy } from 'lucide-react';
import { studyApi } from '../../../services/studyApi';
import { startTest } from '../../../services/studyAi';
import { useStudy } from '../StudyContext';
import { goStudy } from '../studyStore';
import { hasRoute, type PageProps } from '../StudyApp';
import { Btn, Card, ErrorBox, Loading, Page, SubjectTag, colorVars, subjectColor } from '../ui';
import { fmtWhen } from './testsCommon';

type Status = Awaited<ReturnType<typeof studyApi.testsStatus>> extends infer R ? (R extends { ok: true; data: infer D } ? D : never) : never;
type Row = Status['subjects'][number];

// This week's tests: one for each subject, ten multiple-choice questions on what the student has really studied in the app. Made by the AI when asked,
// the same test all week, a new one next week. Only the marks, the test's name and the time are kept.
const Tests: React.FC<PageProps> = () => {
  const { me, toast } = useStudy();
  const [data, setData] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [making, setMaking] = useState<string | null>(null);
  const tz = me?.profile?.timezone;

  const load = useCallback(async () => {
    const r = await studyApi.testsStatus();
    if (r.ok) { setData(r.data); setError(null); } else setError(r.error);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const make = async (row: Row) => {
    if (making) return;
    setMaking(row.subjectId);
    const r = await startTest(row.subjectId, me?.profile?.tutor?.language || me?.profile?.language);
    setMaking(null);
    if (!r.ok) { toast(r.error); void load(); return; }
    if (r.data.status === 'done') { toast('You have already taken this week’s test for ' + row.subject + '.'); void load(); return; }
    goStudy('test', { id: r.data.testId });
  };

  return (
    <Page title="Weekly tests" subtitle={data?.weekTitle || 'Ten questions for each subject'}>
      <div style={{ display: 'grid', gap: 14 }}>
        <Card tint>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--st-accent)', marginTop: 2 }}><Trophy size={22} /></span>
            <div>
              <p className="st-title st-h3">A fresh test every week</p>
              <p className="st-small st-muted" style={{ marginTop: 4 }}>Ten multiple-choice questions for each of your subjects, made only from what you have studied here. You get a new set every week, never the same questions twice.</p>
            </div>
          </div>
        </Card>
        <div className="st-notice"><p className="st-small">Only your marks, the test’s name and the time you took it are saved. Your answers and the questions are not kept after you hand in, so look through the review properly, it is shown once.</p></div>

        {error && <ErrorBox text={error} onRetry={() => void load()} />}
        {!data && !error && <Loading rows={3} />}
        {data && data.subjects.length === 0 && (
          <div className="st-card-flat"><p className="st-small st-muted">Add your subjects first, and your tests will appear here.</p><div style={{ marginTop: 10 }}><Btn small kind="primary" onClick={() => goStudy('subjects')}>My subjects</Btn></div></div>
        )}

        {data?.subjects.map((s) => {
          const c = subjectColor(s.subject);
          const pct = s.score != null && s.max ? Math.round((s.score / s.max) * 100) : null;
          return (
            <div key={s.subjectId} className="st-card" style={{ ...colorVars(c), display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <SubjectTag name={s.subject} color={c} />
                <span className="st-tiny st-faint">{s.state === 'locked' ? 'Nothing studied yet' : s.covered + (s.covered === 1 ? ' topic studied' : ' topics studied')}</span>
              </div>

              {s.state === 'locked' && (
                <>
                  <p className="st-small st-muted"><Lock size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> Study something in {s.subject} first: mark a topic as “learning”, finish a focus session, ask the tutor, or add notes. Then your test can be made.</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {hasRoute('tutor') && <Btn small onClick={() => goStudy('chat', { subject: s.subjectId })}><Sparkles size={14} /> Ask the tutor</Btn>}
                    {hasRoute('subject') && <Btn small kind="ghost" onClick={() => goStudy('subject', { id: s.subjectId })}>Open {s.subject}</Btn>}
                  </div>
                </>
              )}
              {s.state === 'available' && (
                <>
                  <p className="st-small st-muted">Your test for this week is not made yet. It takes a few seconds.</p>
                  <Btn kind="primary" busy={making === s.subjectId} disabled={!!making} onClick={() => void make(s)}><Sparkles size={16} /> Make this week’s test</Btn>
                </>
              )}
              {s.state === 'ready' && s.testId && (
                <>
                  <p className="st-small st-muted">Ready. Ten questions, no clock you need to watch, and you can leave and come back before you hand in.</p>
                  <Btn kind="primary" onClick={() => goStudy('test', { id: s.testId! })}><Play size={16} /> Start the test</Btn>
                </>
              )}
              {s.state === 'done' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <CheckCircle2 size={22} style={{ color: 'var(--st-ok)', flex: 'none' }} />
                  <div style={{ minWidth: 0 }}>
                    <p className="st-title st-h3">{s.score} out of {s.max}{pct != null ? ' · ' + pct + '%' : ''}</p>
                    <p className="st-tiny st-faint">{s.takenAt ? 'Taken ' + fmtWhen(s.takenAt, tz) : 'Done this week'}. Your next test comes next week.</p>
                  </div>
                </div>
              )}
              {s.state === 'expired' && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <CalendarCheck size={18} style={{ color: 'var(--st-faint)', flex: 'none', marginTop: 1 }} />
                  <p className="st-small st-muted">This week’s test ended before it was taken. That is fine. A new one is ready next week.</p>
                </div>
              )}
            </div>
          );
        })}

        {hasRoute('testHistory') && <Btn kind="ghost" onClick={() => goStudy('testHistory')}><History size={16} /> My test history</Btn>}
      </div>
    </Page>
  );
};
export default Tests;
