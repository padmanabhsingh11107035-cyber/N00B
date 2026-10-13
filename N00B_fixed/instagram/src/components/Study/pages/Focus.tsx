import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Coffee, Pause, Play, Square, Timer } from 'lucide-react';
import { studyApi } from '../../../services/studyApi';
import { BREAK_CHOICES, FOCUS_CHOICES, clampMinutes, focusedSec, isFinished, parseRun, pauseRun, progress, remainingSec, resumeRun, reviveRun, touchRun, type Run } from '../../../utils/studyFocus';
import { clock, minutesLabel } from '../../../utils/studyTime';
import { loadPrefs } from '../../../utils/studyPrefs';
import { ringAlarm } from '../../../utils/studyAlarm';
import { speechLang } from '../../../utils/studyCatalog';
import { useStudy } from '../StudyContext';
import { Btn, Chip, Field, Page } from '../ui';
import type { PageProps } from '../StudyApp';

// A calm focus timer. It counts real time, survives a reload, records only what was really focused, and never scolds:
// stopping early is saved as it was, and a break has a slow breathing circle.
type View = { mode: 'idle' } | { mode: 'run'; run: Run } | { mode: 'done'; kind: 'focus' | 'break'; minutes: number; completed: boolean };

const Focus: React.FC<PageProps> = ({ params }) => {
  const { user, subjects, toast, me } = useStudy();
  const key = `noob.study.focus.${user.id}`;
  const [view, setView] = useState<View>({ mode: 'idle' });
  const [minutes, setMinutes] = useState(25);
  const [custom, setCustom] = useState('');
  const [subjectId, setSubjectId] = useState<string>(typeof params.subject === 'string' ? params.subject : '');
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const finishing = useRef(false);
  const save = (r: Run | null) => { try { if (r) localStorage.setItem(key, JSON.stringify(r)); else localStorage.removeItem(key); } catch { /* private mode: it just will not survive a reload */ } };

  const finish = useCallback(async (run: Run, completed: boolean) => {
    if (finishing.current) return;
    finishing.current = true;
    const at = Date.now();
    const secs = focusedSec(run, at);
    save(null);
    const res = await studyApi.focusFinish(run.id, secs, completed);
    if (!res.ok) toast(res.error);
    const recorded = res.ok ? res.data.status === 'completed' : false;
    setView({ mode: 'done', kind: run.kind, minutes: Math.round(secs / 60), completed: completed && (res.ok ? recorded : false) });
    // a session that ran its full time rings the student's chosen alarm (a session the student stopped themselves stays quiet)
    if (completed) ringAlarm(loadPrefs(), run.kind === 'break' ? 'Break is over. Ready when you are.' : 'Time is up. Well done! Take a short break.', speechLang(me?.profile?.tutor?.language || me?.profile?.language));
    setConfirmStop(false);
    finishing.current = false;
  }, [toast]); // eslint-disable-line react-hooks/exhaustive-deps

  // a session saved before the app closed: carry on if it was only just left, otherwise close it honestly where it was last seen
  useEffect(() => {
    let raw: string | null = null;
    try { raw = localStorage.getItem(key); } catch { /* none */ }
    const stored = parseRun(raw);
    if (!stored) return;
    const rev = reviveRun(stored, Date.now());
    if (rev.action === 'resume') { setView({ mode: 'run', run: stored }); return; }
    save(null);
    void studyApi.focusFinish(stored.id, rev.focusSeconds, false).then(() => setView({ mode: 'done', kind: stored.kind, minutes: Math.round(rev.focusSeconds / 60), completed: false }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // the clock: re-read real time every second; note "last seen" every few seconds, and when the app is hidden or closed
  useEffect(() => {
    if (view.mode !== 'run') return;
    const run = view.run;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (run.pausedAt === null && isFinished(run, t)) void finish(run, true);
    };
    const id = window.setInterval(tick, 1000);
    const seen = window.setInterval(() => save(touchRun(run, Date.now())), 5000);
    const onHide = () => save(touchRun(run, Date.now()));
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    tick();
    return () => { window.clearInterval(id); window.clearInterval(seen); document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', onHide); };
  }, [view, finish]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async (kind: 'focus' | 'break', mins: number) => {
    if (busy) return;
    setBusy(true);
    const m = clampMinutes(mins, kind === 'break' ? 30 : 180);
    const res = await studyApi.focusStart(kind === 'focus' ? subjectId || null : null, m, kind);
    setBusy(false);
    if (!res.ok) { toast(res.error); return; }
    const t = Date.now();
    const run: Run = { id: res.data.id, kind, plannedSec: m * 60, startedAt: t, pausedMs: 0, pausedAt: null, subjectId: kind === 'focus' ? subjectId || null : null, lastSeen: t };
    save(run); setNow(t); setView({ mode: 'run', run });
  };
  const setRun = (r: Run) => { save(r); setView({ mode: 'run', run: r }); };

  if (view.mode === 'done') {
    const focusDone = view.kind === 'focus';
    return (
      <Page title="Focus">
        <div className="st-card st-in" style={{ textAlign: 'center', padding: '30px 20px' }}>
          <span style={{ width: 72, height: 72, borderRadius: 24, display: 'inline-grid', placeItems: 'center', background: 'var(--st-accent-soft)', color: 'var(--st-accent)' }}>{focusDone ? <Timer size={34} /> : <Coffee size={34} />}</span>
          <h2 className="st-title st-h1" style={{ marginTop: 16 }}>{!focusDone ? 'Break over' : view.completed ? 'Well done' : 'That is okay'}</h2>
          <p className="st-muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
            {!focusDone ? 'Ready when you are.' : view.completed ? `You focused for ${minutesLabel(view.minutes)}. That is saved.` : view.minutes > 0 ? `You focused for ${minutesLabel(view.minutes)}. It is saved just as it was. Every minute counts.` : 'Nothing was saved this time. You can start again whenever you like.'}
          </p>
          <div style={{ display: 'grid', gap: 10, marginTop: 22 }}>
            {focusDone && <Btn kind="primary" block busy={busy} onClick={() => void start('break', 5)}><Coffee size={16} /> Take a 5 minute break</Btn>}
            <Btn block onClick={() => setView({ mode: 'idle' })}>{focusDone ? 'Another session' : 'Back to focus'}</Btn>
          </div>
        </div>
      </Page>
    );
  }

  if (view.mode === 'run') {
    const run = view.run;
    const left = remainingSec(run, now);
    const p = progress(run, now);
    const R = 112, C = 2 * Math.PI * R;
    const isBreak = run.kind === 'break';
    return (
      <Page title={isBreak ? 'Break' : 'Focus'} subtitle={run.subjectId ? subjects.find((s) => s.id === run.subjectId)?.name : undefined}>
        <div style={{ display: 'grid', placeItems: 'center', gap: 22, paddingTop: 10 }}>
          <div style={{ position: 'relative', width: 264, height: 264 }} role="timer" aria-live="off" aria-label={`${clock(left)} left`}>
            {isBreak && <div className="st-tutor-orb st-breathe" style={{ position: 'absolute', inset: 40, opacity: 0.55 }} aria-hidden="true" />}
            <svg width="264" height="264" viewBox="0 0 264 264" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }} aria-hidden="true">
              <circle cx="132" cy="132" r={R} fill="none" stroke="var(--st-surface2)" strokeWidth="12" />
              <circle cx="132" cy="132" r={R} fill="none" stroke="var(--st-accent)" strokeWidth="12" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - p)} style={{ transition: 'stroke-dashoffset .9s linear' }} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
              <div>
                <div className="st-title" style={{ fontSize: 54, fontVariantNumeric: 'tabular-nums' }}>{clock(left)}</div>
                <div className="st-small st-muted">{run.pausedAt !== null ? 'Paused. No rush.' : isBreak ? 'Breathe in… and out…' : 'Stay with one thing'}</div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {run.pausedAt === null
              ? <Btn onClick={() => setRun(pauseRun(run, Date.now()))}><Pause size={16} /> Pause</Btn>
              : <Btn kind="primary" onClick={() => setRun(resumeRun(run, Date.now()))}><Play size={16} /> Resume</Btn>}
            {confirmStop
              ? <><Btn kind="warn" busy={busy} onClick={() => void finish(run, false)}>Stop and save {minutesLabel(Math.round(focusedSec(run, Date.now()) / 60))}</Btn><Btn kind="ghost" onClick={() => setConfirmStop(false)}>Keep going</Btn></>
              : <Btn kind="ghost" onClick={() => setConfirmStop(true)}><Square size={15} /> Stop</Btn>}
          </div>
          <p className="st-tiny st-faint" style={{ textAlign: 'center', maxWidth: 300 }}>If you leave the app for a long time, the session is saved as it was, never as finished.</p>
        </div>
      </Page>
    );
  }

  return (
    <Page title="Focus" subtitle="One thing at a time">
      <div style={{ display: 'grid', gap: 18 }}>
        <div className="st-card-tint" style={{ textAlign: 'center' }}>
          <div className="st-title" style={{ fontSize: 56, fontVariantNumeric: 'tabular-nums' }}>{clock(minutes * 60)}</div>
          <p className="st-small st-muted">A session of {minutesLabel(minutes)}. Pause any time.</p>
        </div>
        <Field label="How long?">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {FOCUS_CHOICES.map((m) => <Chip key={m} on={minutes === m && !custom} onClick={() => { setMinutes(m); setCustom(''); }}>{m} min</Chip>)}
            <input className="st-input" style={{ width: 110, minHeight: 40 }} inputMode="numeric" placeholder="Other" value={custom} aria-label="Custom minutes"
              onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 3); setCustom(v); if (v) setMinutes(clampMinutes(Number(v))); }} />
          </div>
        </Field>
        {subjects.length > 0 && <Field label="What are you studying? (optional)"><select className="st-input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">Anything</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
        <Btn kind="primary" block busy={busy} onClick={() => void start('focus', minutes)}><Play size={18} /> Start focusing</Btn>
        <div className="st-card-flat"><p className="st-small st-muted">Your focus time is saved only for the time you really focus. Stopping early is fine: it is saved as it was. Then a short break helps. {BREAK_CHOICES.join(', ')} minutes are the usual.</p></div>
      </div>
    </Page>
  );
};
export default Focus;
