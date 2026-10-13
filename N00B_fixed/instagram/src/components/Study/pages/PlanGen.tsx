import React, { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Info, Sparkles } from 'lucide-react';
import { studyApi } from '../../../services/studyApi';
import { daysBetween, planStudy, MAX_PLAN_DAYS, type PlanResult } from '../../../utils/studyPlanner';
import { PARTS_OF_DAY } from '../../../utils/studyCatalog';
import { clockText, minutesLabel, ymdIn } from '../../../utils/studyTime';
import { useStudy } from '../StudyContext';
import { goStudy } from '../studyStore';
import type { PageProps } from '../StudyApp';
import { dayTitle, inputFrom, loadFacts, rangeIso, settingsFrom, type PlanFacts, type PlanSettings } from '../planData';
import { ACTIVITY_LABEL } from '../SessionSheet';
import { Btn, Card, Chip, ErrorBox, Field, Loading, Page, SubjectTag, Toggle } from '../ui';

// Make a plan: the student sees and can change the facts the plan uses (time, free days, parts of the day), then sees the whole plan, with the reason
// for each session, BEFORE anything is saved. Saving replaces only the sessions an earlier plan made and nobody has touched.
const HORIZONS = [{ d: 3, t: '3 days' }, { d: 7, t: 'A week' }, { d: 14, t: '2 weeks' }, { d: 28, t: '4 weeks' }];
// Monday first, as a week is read; the number is the day's place in the week (0 = Sunday)
const WEEK = [{ n: 1, t: 'Mon' }, { n: 2, t: 'Tue' }, { n: 3, t: 'Wed' }, { n: 4, t: 'Thu' }, { n: 5, t: 'Fri' }, { n: 6, t: 'Sat' }, { n: 0, t: 'Sun' }];

const PlanGen: React.FC<PageProps> = ({ params }) => {
  const { me, tz, toast, reload, subjectName, colorOf } = useStudy();
  const examId = typeof params.exam === 'string' ? params.exam : null;
  const todayYmd = ymdIn(new Date(), tz);
  const [set, setSet] = useState<PlanSettings | null>(null);
  const [examTitle, setExamTitle] = useState<string | null>(null);
  const [examDays, setExamDays] = useState<number | null>(null);
  const [remember, setRemember] = useState(true);
  const [result, setResult] = useState<{ plan: PlanResult; facts: PlanFacts; days: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [p, e] = await Promise.all([studyApi.planPrefs(), examId ? studyApi.exams(false) : Promise.resolve(null)]);
      if (!alive) return;
      setSet(settingsFrom(me, p.ok ? p.data : { saved: false, restDays: [], horizonDays: 7 }));
      if (examId) {
        const found = e && e.ok ? e.data.exams.find((x) => x.id === examId) : null;
        if (!found) { setError('That exam was not found. It may have been removed.'); return; }
        setExamTitle(found.title);
        setExamDays(clamp(daysBetween(todayYmd, ymdIn(found.examAt, tz)), 1, MAX_PLAN_DAYS));
      }
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (patch: Partial<PlanSettings>) => { setSet((s) => (s ? { ...s, ...patch } : s)); setResult(null); };
  const days = examId ? examDays || 7 : set?.horizonDays || 7;

  const generate = async () => {
    if (!set || busy) return;
    setBusy(true); setError(null);
    const f = await loadFacts(todayYmd, days, tz);
    setBusy(false);
    if (!f.ok) { setError(f.error); return; }
    const plan = planStudy({ ...inputFrom(me, f.data, set, tz, new Date(), todayYmd, days), onlyExamId: examId, replaceAi: !examId });
    setResult({ plan, facts: f.data, days });
  };

  const apply = async () => {
    if (!result || !set || saving) return;
    setSaving(true); setError(null);
    const sessions = result.plan.sessions.map((s) => ({ ...s }));
    const range = rangeIso(todayYmd, result.days, tz);
    const r = examId ? await studyApi.addPlan(sessions) : await studyApi.replacePlan(sessions, range.from, range.to);
    if (!r.ok) { setSaving(false); setError(r.error); return; }
    if (remember) {
      await studyApi.savePlanPrefs(set.restDays, examId ? set.horizonDays : result.days);
      const h = me?.profile?.habits || {};
      const dpw = 7 - set.restDays.length;
      if (h.dailyMinutes !== set.dailyMinutes || h.sessionMinutes !== set.sessionMinutes || h.daysPerWeek !== dpw || (h.partOfDay || []).join() !== set.partOfDay.join()) {
        await studyApi.saveProfile({ habits: { ...h, dailyMinutes: set.dailyMinutes, sessionMinutes: set.sessionMinutes, daysPerWeek: dpw, partOfDay: set.partOfDay } });
        await reload();
      }
    }
    setSaving(false);
    const made = 'made' in r.data ? r.data.made : 0;
    const clashed = 'clashed' in r.data ? r.data.clashed : 0;
    toast(made ? 'Your plan is ready. ' + made + (made === 1 ? ' session added.' : ' sessions added.') + (clashed ? ' ' + clashed + ' skipped to avoid clashes.' : '') : 'Nothing new was added.');
    goStudy('plan');
  };

  const byDay = useMemo(() => {
    const m: Array<{ ymd: string; list: PlanResult['sessions'] }> = [];
    for (const s of result?.plan.sessions || []) {
      const d = ymdIn(s.startsAt, tz);
      const last = m[m.length - 1];
      if (last && last.ymd === d) last.list.push(s); else m.push({ ymd: d, list: [s] });
    }
    return m;
  }, [result, tz]);

  if (!set) return <Page title="Make my plan">{error ? <ErrorBox text={error} /> : <Loading rows={3} />}</Page>;
  const dailyLabel = minutesLabel(set.dailyMinutes);
  const kept = result ? result.facts.sessions.filter((s) => !(s.status === 'planned' && s.source === 'ai' && !examId)).length : 0;
  return (
    <Page title={examId ? 'Revision plan' : 'Make my plan'} subtitle={examTitle || 'Built around your time'}>
      <div style={{ display: 'grid', gap: 16 }}>
        {error && <ErrorBox text={error} />}
        {!result && (
          <>
            <Card tint>
              <div style={{ display: 'flex', gap: 12 }}>
                <Sparkles size={22} style={{ color: 'var(--st-accent)', flex: 'none', marginTop: 2 }} />
                <p className="st-small st-muted">{examId
                  ? 'I will spread a few calm revision sessions over the days before this exam, on days you can study. You see everything before it is saved.'
                  : 'I use your time, your free days, your exams and what is due. Every session says why it is there, and you see the whole plan before it is saved. Anything you added, moved, finished or skipped stays exactly as it is.'}</p>
              </div>
            </Card>
            {!examId && (
              <Field label="How far ahead?"><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{HORIZONS.map((h) => <Chip key={h.d} on={set.horizonDays === h.d} onClick={() => change({ horizonDays: h.d })}>{h.t}</Chip>)}</div></Field>
            )}
            <Field label={'Study time each day: ' + dailyLabel} hint="Only what you can really do. A smaller plan you keep is better than a big one you drop.">
              <input type="range" min={15} max={480} step={15} value={set.dailyMinutes} onChange={(e) => change({ dailyMinutes: Number(e.target.value) })} style={{ width: '100%', accentColor: 'var(--st-accent)' }} aria-label="Study minutes per day" />
            </Field>
            <Field label="One session lasts"><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{[15, 25, 30, 45, 60, 90].map((m) => <Chip key={m} on={set.sessionMinutes === m} onClick={() => change({ sessionMinutes: m })}>{minutesLabel(m)}</Chip>)}</div></Field>
            <Field label="When do you like to study?" hint="Pick all that fit. Sessions only go in these times.">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{PARTS_OF_DAY.map((p) => {
                const on = set.partOfDay.includes(p.id);
                return <Chip key={p.id} on={on} onClick={() => change({ partOfDay: on ? set.partOfDay.filter((x) => x !== p.id) : [...set.partOfDay, p.id] })}>{p.label}</Chip>;
              })}</div>
            </Field>
            <Field label="Days to keep free" hint="Nothing is planned on these days. Rest helps you remember more.">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{WEEK.map((d) => {
                const on = set.restDays.includes(d.n);
                return <Chip key={d.n} on={on} onClick={() => change({ restDays: on ? set.restDays.filter((x) => x !== d.n) : [...set.restDays, d.n], daysPerWeek: 7 - (on ? set.restDays.length - 1 : set.restDays.length + 1) })}>{d.t}</Chip>;
              })}</div>
            </Field>
            <Toggle on={remember} onChange={setRemember} label="Remember these choices" hint="So the next plan starts from them. You can change them any time." />
            <Btn kind="primary" busy={busy} onClick={() => void generate()}><CalendarCheck size={17} /> Show me the plan</Btn>
          </>
        )}

        {result && (
          <>
            <Card tint>
              <p className="st-title st-h3">{result.plan.summary}</p>
              {result.plan.sessions.length > 0 && <p className="st-small st-muted" style={{ marginTop: 4 }}>Nothing is saved until you press "Use this plan".{kept > 0 ? ' ' + kept + (kept === 1 ? ' session you already have stays' : ' sessions you already have stay') + ' as they are.' : ''}</p>}
            </Card>
            {result.plan.warnings.map((w, i) => (
              <div key={i} className="st-notice" style={{ display: 'flex', gap: 10 }}><Info size={18} style={{ flex: 'none', marginTop: 2, color: 'var(--st-accent)' }} /><span className="st-small">{w}</span></div>
            ))}
            {byDay.map((d) => (
              <div key={d.ymd} className="st-card" style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="st-title st-h3">{dayTitle(d.ymd)}</span>
                  <span className="st-tiny st-muted">{minutesLabel(d.list.reduce((a, s) => a + s.durationMin, 0))}</span>
                </div>
                {d.list.map((s, i) => (
                  <div key={i} className="st-card-flat" style={{ display: 'grid', gap: 4 }}>
                    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      <span className="st-title st-h3">{clockText(new Date(s.startsAt), tz)}</span>
                      <span className="st-tiny st-muted">{minutesLabel(s.durationMin)} · {ACTIVITY_LABEL[s.activity]}</span>
                      {s.subjectId && <SubjectTag name={subjectName(s.subjectId)} color={colorOf(s.subjectId)} />}
                    </span>
                    {s.topic && <span className="st-small" style={{ overflowWrap: 'anywhere' }}>{s.topic}</span>}
                    <span className="st-tiny st-faint">{s.why}</span>
                  </div>
                ))}
              </div>
            ))}
            {error && <ErrorBox text={error} />}
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn kind="ghost" onClick={() => setResult(null)} disabled={saving}>Change settings</Btn>
              <Btn kind="primary" style={{ flex: 1 }} busy={saving} disabled={!result.plan.sessions.length} onClick={() => void apply()}>Use this plan</Btn>
            </div>
          </>
        )}
      </div>
    </Page>
  );
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export default PlanGen;
