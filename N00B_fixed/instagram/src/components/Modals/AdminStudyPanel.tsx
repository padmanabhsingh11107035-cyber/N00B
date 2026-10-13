import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Ban, BadgeCheck, GraduationCap, Loader2, Search, ShieldCheck, Undo2 } from 'lucide-react';
import { adminStudy, STUDY_PARTS, type StudentDetail, type StudentRow, type StudyMode, type StudyOverview, type StudySettings } from '../../services/adminStudyApi';
import { BarChart, Donut, LineChart, Stat, dayLabel, dayTick } from '../charts/Charts';

// Admin panel -> NOOB STUDY. Three parts: the switch (on, coming soon, off, and each part), the numbers and graphs, and the students (their admission, marks and
// study time). The administrator can NEVER see a student's chats with the AI, the pictures they send, or their notes: those are not available here at all.
const card = 'p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800';
const field = 'w-full rounded-xl bg-zinc-900 border border-zinc-700 focus:border-amber-400 outline-none px-3 py-2.5 text-xs text-white placeholder:text-zinc-500';
const when = (iso: string | null): string => { try { return iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never'; } catch { return ''; } };
const LEVEL: Record<string, string> = { class_6_8: 'Class 6-8', class_9_10: 'Class 9-10', class_11: 'Class 11', class_12: 'Class 12', diploma: 'Diploma', undergraduate: 'Undergraduate', postgraduate: 'Postgraduate', other: 'Other' };
const KIND: Record<string, string> = { chat: 'Tutor questions', vision: 'Photo questions', transcribe: 'Voice typing', generate: 'Quizzes and tests', research: 'Research' };
const MODES: Array<{ id: StudyMode; label: string; hint: string; tone: string }> = [
  { id: 'on', label: 'On', hint: 'Open to every student', tone: 'border-emerald-400 text-emerald-300 bg-emerald-400/10' },
  { id: 'coming_soon', label: 'Coming soon', hint: 'Students see a "coming soon" page', tone: 'border-amber-400 text-amber-300 bg-amber-400/10' },
  { id: 'off', label: 'Off', hint: 'Switched off for students', tone: 'border-rose-400 text-rose-300 bg-rose-400/10' }
];

const Switch: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string; hint: string }> = ({ on, onChange, label, hint }) => (
  <button type="button" onClick={() => onChange(!on)} className="w-full flex items-center gap-3 text-left cursor-pointer" role="switch" aria-checked={on}>
    <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-white">{label}</span><span className="block text-[11px] text-zinc-400 leading-snug">{hint}</span></span>
    <span className={`relative w-10 h-6 rounded-full shrink-0 transition-colors ${on ? 'bg-amber-400' : 'bg-zinc-700'}`}><span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} /></span>
  </button>
);

// ---------------------------------------------------------------- the switch
const Control: React.FC = () => {
  const [s, setS] = useState<StudySettings | null>(null);
  const [mode, setMode] = useState<StudyMode>('coming_soon');
  const [message, setMessage] = useState('');
  const [adm, setAdm] = useState(true);
  const [feat, setFeat] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await adminStudy.settings();
    if (!r.ok) { setError(r.error); return; }
    setS(r.data); setMode(r.data.mode); setMessage(r.data.message); setAdm(r.data.admissionsOpen); setFeat(r.data.features || {});
  }, []);
  useEffect(() => { void load(); }, [load]);
  const save = async () => {
    setBusy(true); setError(null); setNote(null);
    const r = await adminStudy.saveSettings(mode, message, adm, Object.fromEntries(STUDY_PARTS.map((p) => [p.key, feat[p.key] !== false])));
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setS(r.data); setNote('Saved. It takes effect at once, for everybody.');
  };
  if (!s && !error) return <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-amber-300 mx-auto" /></div>;
  const dirty = !!s && (s.mode !== mode || s.message !== message || s.admissionsOpen !== adm || STUDY_PARTS.some((p) => (s.features[p.key] !== false) !== (feat[p.key] !== false)));
  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3" role="alert">{error}</p>}
      <div className={card}>
        <p className="text-xs font-black text-white mb-1">Is NOOB STUDY open?</p>
        <p className="text-[11px] text-zinc-400 mb-3">The administrator can always open it to try it, whatever is chosen here. It is the same page in the NOOB menu and at coaching.nooob.xyz.</p>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="NOOB STUDY state">
          {MODES.map((m) => (
            <button key={m.id} role="radio" aria-checked={mode === m.id} onClick={() => setMode(m.id)} className={`rounded-xl border px-2 py-3 text-center cursor-pointer transition-colors ${mode === m.id ? m.tone : 'border-zinc-700 text-zinc-400 hover:text-white'}`}>
              <span className="block text-xs font-black">{m.label}</span><span className="block text-[10px] mt-1 leading-tight opacity-80">{m.hint}</span>
            </button>
          ))}
        </div>
        <label className="block mt-4 text-[11px] font-bold text-zinc-300">Message for students (optional)
          <textarea className={field + ' mt-1 min-h-[64px]'} maxLength={200} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. Opening on 1 November. Get ready!" />
        </label>
      </div>
      <div className={card + ' space-y-3.5'}>
        <p className="text-xs font-black text-white">What students can use</p>
        <Switch on={adm} onChange={setAdm} label="New admissions" hint="Switch off to stop new students joining (students already admitted carry on)." />
        <div className="h-px bg-zinc-800" />
        {STUDY_PARTS.map((p) => <Switch key={p.key} on={feat[p.key] !== false} onChange={(v) => setFeat((f) => ({ ...f, [p.key]: v }))} label={p.label} hint={p.hint} />)}
      </div>
      <button onClick={() => void save()} disabled={busy || !dirty} className="w-full py-3 rounded-2xl bg-amber-400 text-black text-sm font-black disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save changes
      </button>
      {note && <p className="text-[11px] text-emerald-300 text-center" role="status">{note}</p>}
      {s?.updatedAt && <p className="text-[10px] text-zinc-500 text-center">Last changed {when(s.updatedAt)}{s.updatedBy ? ' by ' + s.updatedBy : ''}</p>}
    </div>
  );
};

// ---------------------------------------------------------------- the numbers
const Overview: React.FC = () => {
  const [days, setDays] = useState(30);
  const [o, setO] = useState<StudyOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setO(null); void adminStudy.overview(days).then((r) => { if (r.ok) { setO(r.data); setError(null); } else setError(r.error); }); }, [days]);
  if (error) return <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3" role="alert">{error}</p>;
  if (!o) return <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-amber-300 mx-auto" /></div>;
  const t = o.totals;
  const num = (k: string) => Number(t[k] ?? 0);
  const pts = (a: Array<{ d: string; n: number }>) => a.map((p) => ({ x: dayLabel(p.d), y: Number(p.n) }));
  return (
    <div className="space-y-3 text-white">
      <div className="flex gap-2">{[7, 30, 90].map((d) => <button key={d} onClick={() => setDays(d)} className={`flex-1 py-2 rounded-xl text-xs font-bold border cursor-pointer ${days === d ? 'border-amber-400 text-amber-300 bg-amber-400/10' : 'border-zinc-700 text-zinc-400'}`}>{d} days</button>)}</div>
      <div className={card + ' grid grid-cols-2 gap-x-4 gap-y-4'}>
        <Stat value={num('admissions')} label="Students admitted" hint={num('admissionsToday') + ' today, ' + num('admissions7') + ' this week'} />
        <Stat value={num('onboarded')} label="Finished set-up" />
        <Stat value={num('active7')} label="Active this week" />
        <Stat value={Math.round(num('minutes7') / 60 * 10) / 10 + ' h'} label="Studied this week" hint={Math.round(num('minutes30') / 60) + ' h in 30 days'} />
        <Stat value={num('tutorQuestions7')} label="Tutor questions this week" />
        <Stat value={num('testsTaken')} label="Weekly tests taken" hint={t.testsAvg != null ? 'average ' + t.testsAvg + '%' : 'none yet'} />
        <Stat value={num('quizzes7')} label="Quizzes this week" />
        <Stat value={num('tasksDone7')} label="Tasks done this week" />
        <Stat value={num('openMistakes')} label="Mistakes being learned" />
        <Stat value={num('rooms')} label="Study rooms" hint={num('documents') + ' documents, ' + num('decks') + ' decks'} />
        {num('blocked') > 0 && <Stat value={num('blocked')} label="Paused students" tone="#fda4af" />}
      </div>
      <div className={card}><p className="text-xs font-black mb-2">New admissions each day</p><LineChart points={pts(o.series.admissions)} label="Admissions" /></div>
      <div className={card}><p className="text-xs font-black mb-2">Students active each day</p><LineChart points={pts(o.series.active)} label="Active students" color="#7fd1ac" /></div>
      <div className={card}><p className="text-xs font-black mb-2">Minutes studied each day</p><BarChart bars={o.series.minutes.map((p, i) => ({ label: dayTick(p.d, i), value: Number(p.n) }))} label="Study minutes" unit=" min" gap={days > 30 ? 1 : 3} showValues={false} /></div>
      <div className={card}><p className="text-xs font-black mb-2">Tutor questions each day</p><LineChart points={pts(o.series.questions)} label="Tutor questions" color="#6fb1f2" /></div>
      <div className={card}><p className="text-xs font-black mb-2">Weekly tests taken each day</p><BarChart bars={o.tests.map((p, i) => ({ label: dayTick(p.d, i), value: Number(p.n) }))} label="Tests taken" gap={days > 30 ? 1 : 3} showValues={false} color="#f2c46d" /></div>
      <div className={card}><p className="text-xs font-black mb-1">Weekly test marks (histogram)</p><p className="text-[10px] text-zinc-500 mb-2">How many tests scored in each tenth of the marks.</p><BarChart bars={o.scoreHistogram.map((b) => ({ label: b.label, value: Number(b.n) }))} label="Test marks" gap={3} color="#b9a8f2" /></div>
      <div className={card}><p className="text-xs font-black mb-2">Students by class</p><Donut slices={o.byLevel.map((b) => ({ label: LEVEL[b.label] || b.label, value: Number(b.n) }))} label="Students by class" unit=" students" /></div>
      <div className={card}><p className="text-xs font-black mb-2">Students by board</p><Donut slices={o.byBoard.map((b) => ({ label: b.label, value: Number(b.n) }))} label="Students by board" unit=" students" /></div>
      <div className={card}><p className="text-xs font-black mb-2">Study time by subject</p><Donut slices={o.bySubject.map((b) => ({ label: b.label, value: Number(b.n) }))} label="Study time by subject" unit=" min" /></div>
      <div className={card}><p className="text-xs font-black mb-2">What the AI is used for</p><Donut slices={o.aiByKind.map((b) => ({ label: KIND[b.label] || b.label, value: Number(b.n) }))} label="AI use" unit=" requests" /></div>
      <p className="text-[10px] text-zinc-500 flex gap-1.5 items-start"><ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px" /> These numbers are counted, never read: nothing from a student's chats, pictures, notes or sketches is used to make them.</p>
    </div>
  );
};

// ---------------------------------------------------------------- the students
const Students: React.FC = () => {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ total: number; students: StudentRow[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const PAGE = 20;
  useEffect(() => {
    const t = window.setTimeout(() => { void adminStudy.students(q, PAGE, page * PAGE).then((r) => { if (r.ok) { setData(r.data); setError(null); } else setError(r.error); }); }, q ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [q, page, open]);
  if (open) return <Student userId={open} onBack={() => setOpen(null)} />;
  return (
    <div className="space-y-3 text-white">
      <div className="relative">
        <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
        <input className={field + ' pl-9'} value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search by name, username, admission number, school or city" aria-label="Search students" />
      </div>
      {error && <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3" role="alert">{error}</p>}
      {!data && !error && <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-amber-300 mx-auto" /></div>}
      {data && data.students.length === 0 && <p className="text-xs text-zinc-400 text-center py-8">{q ? 'No student matches that.' : 'No student has been admitted yet.'}</p>}
      {data?.students.map((s) => (
        <button key={s.userId} onClick={() => setOpen(s.userId)} className={card + ' w-full text-left cursor-pointer hover:border-amber-400/50 transition-colors'}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0"><p className="text-sm font-black truncate">{s.fullName}</p><p className="text-[11px] text-zinc-400 truncate">@{s.username} · {s.admissionNo} · {LEVEL[s.level] || s.level}{s.city ? ' · ' + s.city : ''}</p></div>
            {s.status === 'blocked' && <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-black shrink-0">PAUSED</span>}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2.5 text-[11px]">
            <span><b className="text-white">{Math.round(s.minutes7 / 6) / 10} h</b> <span className="text-zinc-500">this week</span></span>
            <span><b className="text-white">{s.testsTaken}</b> <span className="text-zinc-500">tests{s.avgScore != null ? ', avg ' + s.avgScore + '%' : ''}</span></span>
            <span className="text-zinc-500 truncate">{s.lastActive ? 'seen ' + when(s.lastActive) : 'not started'}</span>
          </div>
        </button>
      ))}
      {data && data.total > PAGE && (
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="px-3 py-2 rounded-xl border border-zinc-700 disabled:opacity-40 cursor-pointer">Earlier</button>
          <span>{page * PAGE + 1}-{Math.min(data.total, (page + 1) * PAGE)} of {data.total}</span>
          <button disabled={(page + 1) * PAGE >= data.total} onClick={() => setPage((p) => p + 1)} className="px-3 py-2 rounded-xl border border-zinc-700 disabled:opacity-40 cursor-pointer">Later</button>
        </div>
      )}
    </div>
  );
};

const Student: React.FC<{ userId: string; onBack: () => void }> = ({ userId, onBack }) => {
  const [d, setD] = useState<StudentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const r = await adminStudy.student(userId); if (r.ok) { setD(r.data); setError(null); } else setError(r.error); }, [userId]);
  useEffect(() => { void load(); }, [load]);
  const flip = async () => {
    if (!d) return;
    setBusy(true);
    const r = await adminStudy.setStatus(userId, d.admission.status === 'blocked' ? 'admitted' : 'blocked');
    setBusy(false);
    if (r.ok) void load(); else setError(r.error);
  };
  return (
    <div className="space-y-3 text-white">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-bold text-zinc-300 hover:text-white cursor-pointer"><ArrowLeft className="w-4 h-4" /> All students</button>
      {error && <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3" role="alert">{error}</p>}
      {!d && !error && <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-amber-300 mx-auto" /></div>}
      {d && (
        <>
          <div className={card}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><p className="text-base font-black">{d.admission.fullName}</p><p className="text-[11px] text-zinc-400">@{d.user.username} · {d.admission.admissionNo}</p></div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${d.admission.status === 'blocked' ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'}`}>{d.admission.status === 'blocked' ? 'PAUSED' : 'ADMITTED'}</span>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 mt-3 text-[11px]">
              {([['Class', LEVEL[d.admission.level] || d.admission.level], ['Year', d.admission.classYear], ['Board', d.admission.board], ['School or college', d.admission.institution], ['City', d.admission.city], ['State', d.admission.state], ['Country', d.admission.country], ['Born', d.admission.birthYear], ['Phone', d.admission.phone], ['Guardian', d.admission.guardianName], ['Guardian phone', d.admission.guardianPhone], ['Email', d.user.email], ['Goal', d.admission.goal], ['Heard from', d.admission.heardFrom], ['Admitted', when(d.admission.admittedAt)], ['Time zone', d.profile.timezone]] as Array<[string, string | number | null]>).filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="min-w-0"><dt className="text-zinc-500">{k}</dt><dd className="font-bold text-white break-words">{String(v)}</dd></div>
              ))}
            </dl>
            <button onClick={() => void flip()} disabled={busy} className={`mt-4 w-full py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${d.admission.status === 'blocked' ? 'bg-emerald-400 text-black' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'}`}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : d.admission.status === 'blocked' ? <Undo2 className="w-4 h-4" /> : <Ban className="w-4 h-4" />} {d.admission.status === 'blocked' ? 'Let them back in' : 'Pause their access to NOOB STUDY'}
            </button>
          </div>
          <div className={card + ' grid grid-cols-3 gap-x-3 gap-y-4'}>
            <Stat value={d.counts.tasksDone} label="Tasks done" hint={d.counts.tasksOpen + ' open'} />
            <Stat value={d.counts.sessionsDone} label="Sessions done" />
            <Stat value={d.counts.examsUpcoming} label="Exams ahead" />
            <Stat value={d.counts.quizzes} label="Quizzes" />
            <Stat value={d.counts.openMistakes} label="Mistakes to learn" />
            <Stat value={d.counts.aiQuestions30} label="Tutor questions (30 d)" />
            <Stat value={d.counts.documents} label="Documents" />
            <Stat value={d.counts.decks} label="Flashcard decks" />
            <Stat value={d.counts.rooms} label="Study rooms" />
          </div>
          <div className={card}><p className="text-xs font-black mb-2">Minutes studied, last 30 days</p><BarChart bars={d.minutesByDay.map((p, i) => ({ label: dayTick(p.d, i), value: Number(p.n) }))} label="Study minutes" unit=" min" gap={1} showValues={false} /></div>
          <div className={card}><p className="text-xs font-black mb-2">By subject</p><Donut slices={d.minutesBySubject.map((b) => ({ label: b.label, value: Number(b.n) }))} label="Study time by subject" unit=" min" /></div>
          <div className={card}>
            <p className="text-xs font-black mb-2">Weekly test marks</p>
            {d.tests.length === 0 ? <p className="text-[11px] text-zinc-500">No test taken yet.</p> : (
              <>
                <LineChart points={[...d.tests].reverse().map((t) => ({ x: dayLabel(t.at), y: Math.round((t.score / t.max) * 100) }))} label="Test marks" unit="%" max={100} color="#b9a8f2" />
                <ul className="mt-2 divide-y divide-zinc-800">{d.tests.map((t, i) => <li key={i} className="py-2 flex items-center justify-between gap-2 text-[11px]"><span className="min-w-0 truncate">{t.name}</span><span className="shrink-0 text-zinc-400">{t.score}/{t.max} · {when(t.at)}</span></li>)}</ul>
              </>
            )}
          </div>
          {d.quizzes.length > 0 && <div className={card}><p className="text-xs font-black mb-2">Recent quizzes</p><ul className="divide-y divide-zinc-800">{d.quizzes.map((z, i) => <li key={i} className="py-2 flex items-center justify-between gap-2 text-[11px]"><span className="min-w-0 truncate">{z.title}</span><span className="shrink-0 text-zinc-400">{z.percent}% · {when(z.at)}</span></li>)}</ul></div>}
          <div className={card}>
            <p className="text-xs font-black mb-2">Latest activity</p>
            {d.activity.length === 0 ? <p className="text-[11px] text-zinc-500">Nothing yet.</p> : <ul className="divide-y divide-zinc-800">{d.activity.slice(0, 15).map((a, i) => <li key={i} className="py-1.5 flex items-center justify-between gap-2 text-[11px]"><span>{a.kind.replace(/_/g, ' ')}{a.minutes ? ', ' + a.minutes + ' min' : ''}</span><span className="text-zinc-500">{when(a.at)}</span></li>)}</ul>}
          </div>
          <p className="text-[10px] text-zinc-500 flex gap-1.5 items-start"><ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px" /> Opening this record is written to your activity log. A student's chats with the AI, pictures, notes and sketches can never be seen here.</p>
        </>
      )}
    </div>
  );
};

export const AdminStudyPanel: React.FC = () => {
  const [tab, setTab] = useState<'control' | 'overview' | 'students'>('control');
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-white"><GraduationCap className="w-5 h-5 text-amber-300" /><h3 className="text-sm font-black">NOOB STUDY</h3><BadgeCheck className="w-4 h-4 text-zinc-600" /></div>
      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-zinc-900 border border-zinc-800" role="tablist">
        {([['control', 'Control'], ['overview', 'Numbers'], ['students', 'Students']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`py-2 rounded-xl text-xs font-bold cursor-pointer ${tab === id ? 'bg-amber-400 text-black' : 'text-zinc-400 hover:text-white'}`}>{label}</button>
        ))}
      </div>
      {tab === 'control' ? <Control /> : tab === 'overview' ? <Overview /> : <Students />}
    </div>
  );
};
