import { addDaysYmd, utcToLocalInput, weekdayOf, ymdIn, zonedToUtc } from './studyTime';
import type { Priority, SessionActivity, StudyExam, StudySession, StudyTask } from './studyTypes';

// NOOB STUDY: the timetable maker. It is plain, explainable arithmetic (no guessing, no randomness): the same facts always give the same plan, and every
// session says WHY it is there. It uses only what the student told us (time per day, days per week, parts of the day, days to keep free, subjects) and
// what is recorded in the app (tasks, exams, sessions, recent study time). It never touches a session that is done, skipped or that the student made
// or moved by hand; those only make the plan work around them. Nothing here talks to a server, so it is tested exhaustively without one.

export interface PlanSubject { id: string; name: string; hard?: boolean; strong?: boolean }
export interface PlanInput {
  tz: string;
  now: Date;
  fromYmd: string;                          // the first day to plan (today, or a later day)
  days: number;                             // how many days to plan (1 to 28)
  dailyMinutes: number;                     // the study time the student can give a study day
  sessionMinutes: number;                   // the length of one study session
  daysPerWeek: number;                      // used to choose the free days when `restDays` is not given
  restDays?: number[];                      // weekdays kept completely free (0 = Sunday ... 6 = Saturday)
  partOfDay: string[];                      // 'morning' | 'afternoon' | 'evening' | 'night' | 'flexible'
  subjects: PlanSubject[];
  tasks: StudyTask[];
  exams: StudyExam[];
  existing: StudySession[];                 // the sessions that already exist around this period
  recentMinutes?: Record<string, number>;   // minutes studied per subject in the last 7 days
  replaceAi?: boolean;                      // true (the default): planned sessions an earlier plan made are being replaced, so they do not block time
  onlyExamId?: string | null;               // plan the revision for this one exam only
}
export interface PlannedSession { subjectId: string | null; topic: string; startsAt: string; durationMin: number; objective: string; activity: SessionActivity; priority: Priority; why: string }
export interface PlanResult { sessions: PlannedSession[]; totalMinutes: number; studyDays: number; warnings: string[]; summary: string }

export const MAX_PLAN_DAYS = 28;
export const MAX_PLAN_SESSIONS = 200;
const MAX_PER_DAY = 8;
const BREAK = 10;                          // minutes of rest kept between two sessions
const MIN_SESSION = 15;
const WINDOWS: Record<string, [number, number]> = { morning: [7 * 60, 12 * 60], afternoon: [13 * 60, 17 * 60], evening: [17 * 60 + 30, 21 * 60], night: [21 * 60, 23 * 60 + 30] };
const PART_ORDER = ['morning', 'afternoon', 'evening', 'night'];
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const down5 = (n: number) => Math.floor(n / 5) * 5;
const up5 = (n: number) => Math.ceil(n / 5) * 5;
const dn = (ymd: string): number => { const [y, m, d] = ymd.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000); };
export const daysBetween = (a: string, b: string): number => dn(b) - dn(a);

// the free days: more days per week means fewer free days; the weekend goes first, then the middle of the week
const REST_ORDER = [0, 6, 3, 5, 2, 1, 4];
export function defaultRestDays(daysPerWeek: number): number[] {
  const n = clamp(Math.round(Number(daysPerWeek) || 5), 1, 7);
  return REST_ORDER.slice(0, 7 - n).sort((a, b) => a - b);
}

// the parts of the day to use, in the order of the student's liking
export function windowsFor(parts: string[]): Array<[number, number]> {
  const chosen = (parts || []).filter((p) => p in WINDOWS);
  const order = chosen.length && !(parts || []).includes('flexible') ? PART_ORDER.filter((p) => chosen.includes(p)) : ['evening', 'afternoon', 'morning'];
  return order.map((p) => WINDOWS[p]);
}
export const windowMinutes = (parts: string[]): number => windowsFor(parts).reduce((a, [s, e]) => a + (e - s), 0);

// minutes after the local midnight that starts `baseYmd`
function localMinutes(date: Date, tz: string, baseYmd: string): number {
  const s = utcToLocalInput(date, tz);
  return (dn(s.slice(0, 10)) - dn(baseYmd)) * 1440 + Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16));
}
type Gap = [number, number];
function subtract(gaps: Gap[], busy: Gap[]): Gap[] {
  let out = gaps.map((g): Gap => [g[0], g[1]]);
  for (const [bs, be] of busy) {
    const next: Gap[] = [];
    for (const [s, e] of out) {
      if (be <= s || bs >= e) { next.push([s, e]); continue; }
      if (bs > s) next.push([s, bs]);
      if (be < e) next.push([be, e]);
    }
    out = next;
  }
  return out;
}
const gapTotal = (gaps: Gap[]) => gaps.reduce((a, [s, e]) => a + Math.max(0, down5(e) - up5(s)), 0);

interface Day { ymd: string; study: boolean; gaps: Gap[]; budget: number; count: number; bySubject: Record<string, number>; last: string | null; examCap?: number }

const sameLabel = (id: string | null) => id || '·';
function activityText(a: SessionActivity, subject: string): string {
  const name = subject || 'this subject';
  switch (a) {
    case 'practice': return 'Try some questions on ' + name + ', then check your answers.';
    case 'revise': return 'Look over what you already know in ' + name + ' and mend small gaps.';
    case 'review_mistakes': return 'Go back over mistakes in ' + name + ' and understand each one.';
    case 'read': return 'Read your notes or textbook for ' + name + ' calmly.';
    case 'homework': return 'Work on your ' + name + ' homework.';
    case 'flashcards': return 'Go through your ' + name + ' flashcards.';
    default: return 'Learn something new in ' + name + ', one idea at a time.';
  }
}
const FILL_CYCLE: SessionActivity[] = ['study', 'practice', 'revise', 'read'];
const HARD_CYCLE: SessionActivity[] = ['study', 'practice', 'study', 'revise'];
function taskActivity(t: StudyTask): SessionActivity {
  return t.kind === 'homework' ? 'homework' : t.kind === 'revision' || t.kind === 'exam_prep' ? 'revise' : t.kind === 'practice' ? 'practice' : 'study';
}
function inDays(d: number): string { return d <= 0 ? 'today' : d === 1 ? 'tomorrow' : 'in ' + d + ' days'; }

export function planStudy(raw: PlanInput): PlanResult {
  const tz = raw.tz;
  const days = clamp(Math.round(raw.days) || 7, 1, MAX_PLAN_DAYS);
  const daily = clamp(down5(Number(raw.dailyMinutes) || 60), MIN_SESSION, 480);
  const sessionLen = clamp(down5(Number(raw.sessionMinutes) || 25), MIN_SESSION, 90);
  const replaceAi = raw.replaceAi !== false;
  const rest = new Set((raw.restDays && raw.restDays.length ? raw.restDays : raw.restDays ? [] : defaultRestDays(raw.daysPerWeek)).filter((d) => d >= 0 && d <= 6));
  const windows = windowsFor(raw.partOfDay);
  const warnings: string[] = [];
  const out: PlannedSession[] = [];
  const subjects = (raw.subjects || []).slice().sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const subjName = (id: string | null) => subjects.find((s) => s.id === id)?.name || '';
  const fromYmd = raw.fromYmd;
  const endYmd = addDaysYmd(fromYmd, days - 1);
  const todayYmd = ymdIn(raw.now, tz);
  const only = raw.onlyExamId || null;

  // what is already there: it blocks time and uses up the day's budget; it is never changed
  const kept = (raw.existing || []).filter((s) => !(replaceAi && s.status === 'planned' && s.source === 'ai'));
  const exams = (raw.exams || []).filter((e) => { const d = daysBetween(todayYmd, ymdIn(e.examAt, tz)); return d >= 0; });

  // ---- the days
  const list: Day[] = [];
  const nowAt = raw.now.getTime();
  for (let i = 0; i < days; i++) {
    const ymd = addDaysYmd(fromYmd, i);
    const busy: Gap[] = [];
    let used = 0;
    for (const s of kept) {
      if (s.status === 'skipped') continue;
      const a = localMinutes(new Date(s.startsAt), tz, ymd);
      const b = a + s.durationMin;
      if (b + BREAK <= 0 || a - BREAK >= 1440) continue;
      busy.push([a - BREAK, b + BREAK]);
      if (a >= 0 && a < 1440) used += s.durationMin;
    }
    let gaps = subtract(windows.map((w): Gap => [w[0], w[1]]), busy);
    if (ymd === todayYmd) gaps = subtract(gaps, [[-1, localMinutes(new Date(nowAt + 10 * 60000), tz, ymd)]]);
    const examHere = exams.some((e) => ymdIn(e.examAt, tz) === ymd);
    const examNext = exams.some((e) => ymdIn(e.examAt, tz) === addDaysYmd(ymd, 1));
    const isStudy = !rest.has(weekdayOf(ymd)) && !examHere;
    const budget = isStudy ? Math.max(0, (examNext ? Math.min(daily, Math.max(30, down5(daily * 0.6))) : daily) - used) : 0;
    list.push({ ymd, study: isStudy, gaps, budget, count: 0, bySubject: {}, last: null });
  }
  const studyDays = list.filter((d) => d.study);
  if (!studyDays.length) warnings.push('Every day in this period is a free day, so nothing was planned. Choose fewer free days to get a plan.');
  const usableMinutes = windowMinutes(raw.partOfDay);
  if (usableMinutes < daily) warnings.push('The times of day you chose have room for about ' + Math.floor(usableMinutes / 60) + ' h ' + (usableMinutes % 60 ? (usableMinutes % 60) + ' min ' : '') + 'a day, so I planned within that. Pick more parts of the day if you can study longer.');

  // put one session into a day, in the first gap it fits (a little shorter if that is all the room there is)
  const place = (d: Day, want: number, why: string, base: Omit<PlannedSession, 'startsAt' | 'durationMin' | 'why'>): boolean => {
    if (!d.study || d.count >= MAX_PER_DAY || out.length >= MAX_PLAN_SESSIONS) return false;
    const room = Math.min(d.budget, want);
    if (room < MIN_SESSION) return false;
    const len = down5(room);
    let at = -1; let dur = len;
    for (const [s, e] of d.gaps) { const st = up5(s); if (e - st >= len) { at = st; break; } }
    if (at < 0) {
      let best = 0; let bestAt = -1;
      for (const [s, e] of d.gaps) { const st = up5(s); const r = down5(e - st); if (r > best) { best = r; bestAt = st; } }
      if (best < MIN_SESSION) return false;
      at = bestAt; dur = Math.min(len, best);
    }
    d.gaps = subtract(d.gaps, [[at - BREAK, at + dur + BREAK]]);
    d.budget -= dur; d.count += 1;
    const sid = sameLabel(base.subjectId);
    d.bySubject[sid] = (d.bySubject[sid] || 0) + 1; d.last = sid;
    out.push({ ...base, startsAt: zonedToUtc(d.ymd + 'T' + String(Math.floor(at / 60)).padStart(2, '0') + ':' + String(at % 60).padStart(2, '0'), tz).toISOString(), durationMin: dur, why: why.slice(0, 400) });
    return true;
  };
  const minutesFor = new Map<string, number>();                                  // minutes planned per subject (for fairness)
  const note = (id: string | null, m: number) => { const k = sameLabel(id); minutesFor.set(k, (minutesFor.get(k) || 0) + m); };

  // ---- 1. exams: a few calm revision sessions spread over the days before each one
  for (const e of exams.slice().sort((a, b) => a.examAt.localeCompare(b.examAt))) {
    if (only && e.id !== only) continue;
    const examYmd = ymdIn(e.examAt, tz);
    if (examYmd > addDaysYmd(endYmd, 1) && !only) continue;                           // an exam the day after this period still needs its last revision inside it
    const left = daysBetween(todayYmd, examYmd);
    const usable = studyDays.filter((d) => d.ymd >= fromYmd && d.ymd < examYmd && d.ymd <= endYmd && d.budget >= MIN_SESSION);
    if (!usable.length) { if (left <= 14) warnings.push('There was no free study day before "' + e.title + '", so no revision was planned for it. You can add a session by hand.'); continue; }
    const k = Math.min(usable.length, clamp(Math.ceil(Math.max(left, 1) / 2), 1, 5));
    const chosen: Day[] = [];
    for (let i = 0; i < k; i++) { const idx = k === 1 ? usable.length - 1 : Math.round((i * (usable.length - 1)) / (k - 1)); if (!chosen.includes(usable[idx])) chosen.push(usable[idx]); }
    const name = subjName(e.subjectId);
    let made = 0;
    chosen.forEach((d, i) => {
      const lastOne = i === chosen.length - 1;
      const act: SessionActivity = lastOne && chosen.length > 1 ? 'revise' : i === 0 && left >= 7 ? 'study' : i % 2 === 1 ? 'review_mistakes' : 'practice';
      const dl = daysBetween(d.ymd, examYmd);
      const why = e.title + ' is ' + inDays(daysBetween(todayYmd, examYmd)) + '. ' + (lastOne && chosen.length > 1 ? 'A calm last look the day before.' : dl <= 3 ? 'Practice close to the day helps it stay.' : 'Starting early keeps it light.');
      const ok = place(d, clamp(sessionLen, 20, 60), why, { subjectId: e.subjectId, topic: e.title.slice(0, 140), objective: activityText(act, name), activity: act, priority: left <= 7 ? 'high' : 'normal' });
      if (ok) { note(e.subjectId, out[out.length - 1].durationMin); made += 1; }
    });
    if (made < chosen.length) warnings.push(made ? 'Only ' + made + ' of ' + chosen.length + ' revision sessions for "' + e.title + '" fit. You can add more by hand.' : 'There was no free time before "' + e.title + '" for revision. You can add a session by hand.');
  }

  // ---- 2. tasks that are due: placed before their deadline, the soonest first
  if (!only) {
    const open = (raw.tasks || []).filter((t) => t.status !== 'done' && t.dueAt);
    const keyed = open.map((t) => ({ t, due: ymdIn(t.dueAt as string, tz), hour: Number(utcToLocalInput(t.dueAt as string, tz).slice(11, 13)) }))
      .filter((x) => x.due <= addDaysYmd(endYmd, 1))
      .sort((a, b) => a.due.localeCompare(b.due) || (a.t.priority === 'high' ? -1 : 0) - (b.t.priority === 'high' ? -1 : 0) || a.t.id.localeCompare(b.t.id));
    for (const { t, due, hour } of keyed) {
      const doneMin = kept.filter((s) => s.status === 'done' && s.topic === t.title && (s.subjectId || null) === (t.subjectId || null)).reduce((a, s) => a + s.durationMin, 0);
      const est = Math.max(0, clamp(t.estMinutes || (t.kind === 'homework' ? 40 : 30), 10, 240) - doneMin);
      if (est < 10) continue;
      const chunks = Math.ceil(est / 60);
      const each = Math.max(MIN_SESSION, up5(est / chunks));
      let deadline = hour < 9 ? addDaysYmd(due, -1) : due;
      const overdue = due < todayYmd || (due === todayYmd && hour < 9);
      if (deadline < fromYmd) deadline = fromYmd;
      if (deadline > endYmd) deadline = endYmd;
      const startDay = addDaysYmd(deadline, -2) < fromYmd ? fromYmd : addDaysYmd(deadline, -2);
      const order = [...list.filter((d) => d.ymd >= startDay && d.ymd <= deadline), ...list.filter((d) => d.ymd < startDay).reverse(), ...list.filter((d) => d.ymd > deadline)];
      const dueText = overdue ? 'This is overdue. It is a good one to clear first.' : 'Due ' + (daysBetween(todayYmd, due) <= 1 ? inDays(daysBetween(todayYmd, due)) : WEEKDAY_NAMES[weekdayOf(due)]) + '.';
      const fits = (d: Day) => d.study && d.count < MAX_PER_DAY && d.budget >= MIN_SESSION && d.gaps.some(([gs, ge]) => ge - up5(gs) >= MIN_SESSION);
      let remaining = est; let guard = 0; let cursor = 0; let lastYmd = '';
      const act = taskActivity(t);
      const prio: Priority = t.priority === 'high' || overdue || daysBetween(todayYmd, due) <= 1 ? 'high' : 'normal';
      while (remaining >= 10 && guard++ < chunks + 4) {
        let idx = order.findIndex((d, i) => i >= cursor && fits(d));
        if (idx < 0) idx = order.findIndex(fits);
        if (idx < 0) break;
        const want = Math.min(each, Math.max(MIN_SESSION, up5(remaining)));
        if (!place(order[idx], want, dueText, { subjectId: t.subjectId, topic: t.title.slice(0, 140), objective: activityText(act, subjName(t.subjectId)), activity: act, priority: prio })) break;
        const got = out[out.length - 1].durationMin;
        remaining -= got; cursor = idx + 1; lastYmd = order[idx].ymd;
        note(t.subjectId, got);
      }
      if (remaining >= 10) warnings.push('"' + t.title + '" could not fully fit in before it is due. Try a longer study time, fewer free days, or more parts of the day.');
      else if (lastYmd > deadline && !overdue) warnings.push('"' + t.title + '" had to be placed after its due day, because every earlier day was full.');
    }
  }

  // ---- 3. the rest of the time: the subjects that need it most, taking turns
  if (!only && subjects.length) {
    const weight = new Map<string, number>();
    for (const s of subjects) {
      let w = 1;
      let tw = 0;
      for (const t of raw.tasks || []) {
        if (t.status === 'done' || t.subjectId !== s.id) continue;
        const d = t.dueAt ? daysBetween(todayYmd, ymdIn(t.dueAt, tz)) : 99;
        tw += d < 0 ? 3 : d <= 2 ? 2.5 : d <= 7 ? 1.5 : 0.5;
      }
      w += Math.min(6, tw);
      let ew = 0;
      for (const e of exams) { if (e.subjectId !== s.id) continue; const d = daysBetween(todayYmd, ymdIn(e.examAt, tz)); if (d > 45) continue; ew += 6 * (1 - d / 45) + (d <= 3 ? 2 : d <= 7 ? 1 : 0); }
      w += Math.min(8, ew);
      if (s.hard) w *= 1.35;
      if (s.strong) w *= 0.8;
      if (raw.recentMinutes && (raw.recentMinutes[s.id] || 0) === 0) w += 0.6;
      weight.set(s.id, w);
    }
    const totalW = subjects.reduce((a, s) => a + (weight.get(s.id) || 1), 0);
    const planned = out.reduce((a, s) => a + s.durationMin, 0);
    const capacity = list.reduce((a, d) => a + (d.study ? Math.min(d.budget, gapTotal(d.gaps)) : 0), 0) + planned;
    const noDue = new Map<string, StudyTask[]>();
    for (const t of (raw.tasks || []).slice().sort((a, b) => a.id.localeCompare(b.id))) {
      if (t.status === 'done' || !t.subjectId) continue;
      const far = !t.dueAt || daysBetween(todayYmd, ymdIn(t.dueAt, tz)) > days;
      if (far) noDue.set(t.subjectId, [...(noDue.get(t.subjectId) || []), t]);
    }
    const turns = new Map<string, number>();
    for (const d of list) {
      if (!d.study) continue;
      let guard = 0;
      const perSubject = Math.max(2, Math.ceil((d.budget / sessionLen) / subjects.length));        // a long study day lets each subject have a few more turns
      while (d.budget >= MIN_SESSION && d.count < MAX_PER_DAY && out.length < MAX_PLAN_SESSIONS && guard++ < 12) {
        if (!d.gaps.some(([s, e]) => e - up5(s) >= MIN_SESSION)) break;
        const cand = subjects.map((s) => ({ s, deficit: (weight.get(s.id) || 1) / totalW * capacity - (minutesFor.get(s.id) || 0), n: d.bySubject[s.id] || 0 }));
        const allowed = cand.filter((c) => subjects.length < 2 || (c.n < perSubject && sameLabel(c.s.id) !== d.last));
        const pool = allowed.length ? allowed : cand.filter((c) => subjects.length < 2 || c.n < perSubject);
        if (!pool.length) break;
        pool.sort((a, b) => b.deficit - a.deficit || (weight.get(b.s.id) || 1) - (weight.get(a.s.id) || 1) || a.s.name.localeCompare(b.s.name));
        const pick = pool[0].s;
        const turn = turns.get(pick.id) || 0;
        const pending = noDue.get(pick.id) || [];
        const task = pending.length ? pending[turn % pending.length] : null;
        const act: SessionActivity = task ? taskActivity(task) : (pick.hard ? HARD_CYCLE : FILL_CYCLE)[turn % 4];
        const recentZero = raw.recentMinutes && (raw.recentMinutes[pick.id] || 0) === 0;
        const why = task ? 'From your task list: "' + task.title + '".' : pick.hard ? 'You said ' + pick.name + ' is a harder one, so it gets a little more time.' : recentZero && turn === 0 ? pick.name + ' has had little time this week.' : 'Every subject gets its turn, so nothing is left behind.';
        const ok = place(d, sessionLen, why, { subjectId: pick.id, topic: task ? task.title.slice(0, 140) : '', objective: activityText(act, pick.name), activity: act, priority: 'normal' });
        if (!ok) break;
        turns.set(pick.id, turn + 1);
        note(pick.id, out[out.length - 1].durationMin);
      }
    }
  } else if (!only && !subjects.length) {
    warnings.push('You have not added any subjects yet, so only your tasks and exams were planned. Add your subjects to get a full plan.');
  }

  out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const totalMinutes = out.reduce((a, s) => a + s.durationMin, 0);
  const usedDays = new Set(out.map((s) => ymdIn(s.startsAt, tz))).size;
  const hours = Math.floor(totalMinutes / 60), mins = totalMinutes % 60;
  const time = [hours ? hours + ' h' : '', mins || !hours ? mins + ' min' : ''].filter(Boolean).join(' ');
  const summary = out.length ? out.length + (out.length === 1 ? ' session' : ' sessions') + ', ' + time + ' over ' + usedDays + (usedDays === 1 ? ' day' : ' days') : 'Nothing could be planned';
  return { sessions: out, totalMinutes, studyDays: usedDays, warnings, summary };
}

// The next time a session of `durationMin` fits (used to move a session that was missed). Free days and busy times are respected.
export function nextFreeSlot(input: Omit<PlanInput, 'days' | 'subjects' | 'tasks' | 'exams'>, durationMin: number, searchDays = 14): string | null {
  return planSlotOnly(input, clamp(down5(durationMin) || MIN_SESSION, MIN_SESSION, 240), searchDays);
}
function planSlotOnly(input: Omit<PlanInput, 'days' | 'subjects' | 'tasks' | 'exams'>, dur: number, searchDays: number): string | null {
  const tz = input.tz;
  const rest = new Set((input.restDays && input.restDays.length ? input.restDays : input.restDays ? [] : defaultRestDays(input.daysPerWeek)));
  const windows = windowsFor(input.partOfDay);
  const kept = (input.existing || []).filter((s) => s.status !== 'skipped' && !(input.replaceAi !== false && s.status === 'planned' && s.source === 'ai'));
  const todayYmd = ymdIn(input.now, tz);
  for (let i = 0; i < searchDays; i++) {
    const ymd = addDaysYmd(input.fromYmd, i);
    if (rest.has(weekdayOf(ymd))) continue;
    const busy: Gap[] = [];
    for (const s of kept) { const a = localMinutes(new Date(s.startsAt), tz, ymd); const b = a + s.durationMin; if (b + BREAK <= 0 || a - BREAK >= 1440) continue; busy.push([a - BREAK, b + BREAK]); }
    let gaps = subtract(windows.map((w): Gap => [w[0], w[1]]), busy);
    if (ymd === todayYmd) gaps = subtract(gaps, [[-1, localMinutes(new Date(input.now.getTime() + 10 * 60000), tz, ymd)]]);
    for (const [s, e] of gaps) { const st = up5(s); if (e - st >= dur) return zonedToUtc(ymd + 'T' + String(Math.floor(st / 60)).padStart(2, '0') + ':' + String(st % 60).padStart(2, '0'), tz).toISOString(); }
  }
  return null;
}

// Sessions that were planned for a time that has passed and were neither done nor skipped.
export const missedSessions = (sessions: StudySession[], now: Date): StudySession[] =>
  sessions.filter((s) => s.status === 'planned' && new Date(s.startsAt).getTime() + s.durationMin * 60000 < now.getTime() - 5 * 60000)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
