import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, Plus, Sparkles } from 'lucide-react';
import { studyApi } from '../../../services/studyApi';
import { missedSessions, nextFreeSlot } from '../../../utils/studyPlanner';
import type { StudySession } from '../../../utils/studyTypes';
import { addDaysYmd, minutesLabel, startOfDay, weekdayOf, ymdIn } from '../../../utils/studyTime';
import { useStudy } from '../StudyContext';
import { goStudy } from '../studyStore';
import { hasRoute, type PageProps } from '../StudyApp';
import { SessionRow } from '../parts';
import { SessionSheet } from '../SessionSheet';
import { dayTitle, loadFacts, mondayOf, settingsFrom, type PlanPrefs } from '../planData';
import { Btn, Card, Empty, ErrorBox, Loading, Page, ProgressBar } from '../ui';

// The week at a glance: every day with its sessions, what was missed (and a kind way to move it), and the way to make or change the plan.
const Plan: React.FC<PageProps> = () => {
  const { me, tz, toast } = useStudy();
  const now = new Date();
  const todayYmd = ymdIn(now, tz);
  const [week, setWeek] = useState(() => mondayOf(todayYmd));
  const [sessions, setSessions] = useState<StudySession[] | null>(null);
  const [missed, setMissed] = useState<StudySession[]>([]);
  const [prefs, setPrefs] = useState<PlanPrefs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ session?: StudySession | null; start?: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [fixing, setFixing] = useState(false);

  const load = useCallback(async () => {
    const [w, m, p] = await Promise.all([
      studyApi.sessions(startOfDay(week, tz).toISOString(), startOfDay(addDaysYmd(week, 7), tz).toISOString()),
      studyApi.sessions(startOfDay(addDaysYmd(todayYmd, -14), tz).toISOString(), new Date().toISOString()),
      studyApi.planPrefs()
    ]);
    if (!w.ok) { setError(w.error); return; }
    setError(null); setSessions(w.data.sessions);
    if (m.ok) setMissed(missedSessions(m.data.sessions, new Date()));
    if (p.ok) setPrefs(p.data);
  }, [week, tz, todayYmd]);
  useEffect(() => { setSessions(null); void load(); }, [week]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const rest = useMemo(() => new Set(prefs?.saved ? prefs.restDays : []), [prefs]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysYmd(week, i)), [week]);
  const byDay = useMemo(() => {
    const m: Record<string, StudySession[]> = {};
    for (const s of sessions || []) (m[ymdIn(s.startsAt, tz)] ||= []).push(s);
    return m;
  }, [sessions, tz]);
  const live = (sessions || []).filter((s) => s.status !== 'skipped');
  const planned = live.reduce((a, s) => a + s.durationMin, 0);
  const done = live.filter((s) => s.status === 'done').reduce((a, s) => a + s.durationMin, 0);
  const thisWeek = week === mondayOf(todayYmd);

  const toggle = async (s: StudySession, status: StudySession['status']) => {
    if (busyId) return;
    setBusyId(s.id);
    const r = await studyApi.sessionStatus(s.id, status);
    setBusyId(null);
    if (!r.ok) { toast(r.error); return; }
    if (status === 'done') toast('Session done. Well done.');
    void load();
  };

  // Missed sessions are moved to the next free time that suits the student, one after the other (each move counts as busy for the next).
  const moveMissed = async () => {
    if (fixing || !missed.length) return;
    setFixing(true);
    const facts = await loadFacts(todayYmd, 14, tz);
    if (!facts.ok) { setFixing(false); toast(facts.error); return; }
    const set = settingsFrom(me, facts.data.prefs);
    let existing = facts.data.sessions.filter((s) => !missed.some((m) => m.id === s.id));
    let moved = 0;
    for (const m of missed) {
      const at = nextFreeSlot({ tz, now: new Date(), fromYmd: todayYmd, dailyMinutes: set.dailyMinutes, sessionMinutes: set.sessionMinutes, daysPerWeek: set.daysPerWeek, restDays: set.restDays, partOfDay: set.partOfDay, existing }, m.durationMin);
      if (!at) continue;
      const r = await studyApi.saveSession({ id: m.id, startsAt: at });
      if (r.ok) { moved += 1; existing = [...existing, r.data]; }
    }
    setFixing(false);
    toast(moved === missed.length ? 'Moved to the next free times.' : moved ? 'Moved ' + moved + '. The rest did not fit in the next two weeks.' : 'No free time was found in the next two weeks. You can skip them instead.');
    void load();
  };
  const skipMissed = async () => {
    if (fixing || !missed.length) return;
    setFixing(true);
    for (const m of missed) await studyApi.sessionStatus(m.id, 'skipped');
    setFixing(false);
    toast('Skipped. That is okay.');
    void load();
  };

  const range = dayTitle(days[0]) + ' to ' + dayTitle(days[6]);
  return (
    <Page title="My plan" subtitle={range} hideBack right={hasRoute('planGen') ? <Btn small kind="primary" onClick={() => goStudy('planGen')}><Sparkles size={15} /> Make plan</Btn> : undefined}>
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <ErrorBox text={error} onRetry={() => void load()} />}

        {missed.length > 0 && (
          <Card tint>
            <p className="st-title st-h3">{missed.length === 1 ? 'One session did not happen' : missed.length + ' sessions did not happen'}</p>
            <p className="st-small st-muted" style={{ marginTop: 4 }}>That is okay, it happens to everyone. Move {missed.length === 1 ? 'it' : 'them'} to the next free time, or let {missed.length === 1 ? 'it' : 'them'} go.</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <Btn small kind="primary" busy={fixing} onClick={() => void moveMissed()}>Move {missed.length === 1 ? 'it' : 'them'} for me</Btn>
              <Btn small kind="ghost" disabled={fixing} onClick={() => void skipMissed()}>Skip {missed.length === 1 ? 'it' : 'them'}</Btn>
            </div>
          </Card>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <button className="st-icon-btn" onClick={() => setWeek(addDaysYmd(week, -7))} aria-label="Earlier week"><ChevronLeft size={18} /></button>
          <button className="st-chip" data-on={thisWeek ? 'true' : 'false'} onClick={() => setWeek(mondayOf(todayYmd))} aria-label="Go to this week">{thisWeek ? 'This week' : 'Back to this week'}</button>
          <button className="st-icon-btn" onClick={() => setWeek(addDaysYmd(week, 7))} aria-label="Later week"><ChevronRight size={18} /></button>
        </div>

        {!sessions && !error && <Loading rows={4} />}
        {sessions && (
          <>
            {live.length > 0 && (
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span className="st-title st-h3">{minutesLabel(planned)} planned</span>
                  <span className="st-small st-muted">{minutesLabel(done)} done</span>
                </div>
                <div style={{ marginTop: 10 }}><ProgressBar value={planned ? (done / planned) * 100 : 0} label="Study time done this week" /></div>
              </Card>
            )}
            {live.length === 0 && (
              <Empty icon={<CalendarPlus size={28} />} title={thisWeek ? 'Your week is open' : 'Nothing planned for this week'}
                text="Let NOOB STUDY make a gentle plan around your time, your exams and what is due, or add a session yourself."
                action={<>{hasRoute('planGen') && <Btn kind="primary" small onClick={() => goStudy('planGen')}><Sparkles size={15} /> Make my plan</Btn>}<Btn small onClick={() => setSheet({ start: todayYmd + 'T17:30' })}><Plus size={15} /> Add a session</Btn></>} />
            )}
            {days.map((ymd) => {
              const list = byDay[ymd] || [];
              const isToday = ymd === todayYmd;
              const minutes = list.filter((s) => s.status !== 'skipped').reduce((a, s) => a + s.durationMin, 0);
              const isRest = rest.has(weekdayOf(ymd));
              return (
                <div key={ymd} className="st-card" style={{ display: 'grid', gap: 10, ...(isToday ? { borderColor: 'var(--st-accent)' } : null) }}>
                  <button onClick={() => hasRoute('day') && goStudy('day', { date: ymd })} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'none', border: 0, padding: 0, color: 'inherit', textAlign: 'left', cursor: hasRoute('day') ? 'pointer' : 'default' }} aria-label={'Open ' + dayTitle(ymd)}>
                    <span className="st-title st-h3">{dayTitle(ymd)}{isToday && <span className="st-chip" data-on="true" style={{ marginLeft: 8, padding: '2px 9px', fontSize: 11 }}>Today</span>}</span>
                    <span className="st-tiny st-muted">{minutes ? minutesLabel(minutes) : isRest ? 'Rest day' : 'Free'}</span>
                  </button>
                  {list.map((s) => <SessionRow key={s.id} session={s} busy={busyId === s.id} onStatus={(x, st) => void toggle(x, st)} onOpen={() => setSheet({ session: s })} />)}
                  {list.length === 0 && <p className="st-small st-faint">{isRest ? 'A day to rest. Rest is part of learning well.' : 'Nothing planned.'}</p>}
                  <button className="st-btn st-btn-ghost st-btn-sm" onClick={() => setSheet({ start: ymd + 'T17:30' })} aria-label={'Add a session on ' + dayTitle(ymd)}><Plus size={14} /> Add</button>
                </div>
              );
            })}
          </>
        )}
        <p className="st-tiny st-faint" style={{ textAlign: 'center' }}>Tap a day to see all of it.</p>
      </div>
      {sheet && <SessionSheet session={sheet.session} defaultStart={sheet.start} onClose={() => setSheet(null)} onChanged={() => void load()} />}
    </Page>
  );
};

export default Plan;
