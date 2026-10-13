import { studyApi, type Result } from '../../services/studyApi';
import { addDaysYmd, startOfDay, weekdayOf } from '../../utils/studyTime';
import { defaultRestDays, type PlanInput, type PlanSubject } from '../../utils/studyPlanner';
import type { StudyExam, StudyMe, StudySession, StudyTask } from '../../utils/studyTypes';

// What the plan screens share: gathering the facts the timetable maker needs, and turning the student's profile into its input.

export interface PlanPrefs { saved: boolean; restDays: number[]; horizonDays: number }
export interface PlanFacts { sessions: StudySession[]; tasks: StudyTask[]; exams: StudyExam[]; prefs: PlanPrefs; recent: Record<string, number> }

// the Monday that starts the week of `ymd`
export const mondayOf = (ymd: string): string => addDaysYmd(ymd, -((weekdayOf(ymd) + 6) % 7));

const mentions = (text: string | undefined, name: string): boolean => {
  const t = (text || '').toLowerCase(), n = name.toLowerCase().trim();
  return !!t && !!n && t.includes(n);
};

// Subjects the student called hard or strong, in their own words (set-up: "topics I find difficult", "subjects I am strong in")
export function planSubjects(me: StudyMe | null): PlanSubject[] {
  const g = me?.profile?.goals || {};
  return (me?.subjects || []).map((s) => ({ id: s.id, name: s.name, hard: mentions(g.difficultTopics, s.name), strong: mentions(g.strongSubjects, s.name) }));
}

export const rangeIso = (fromYmd: string, days: number, tz: string) => ({ from: startOfDay(fromYmd, tz).toISOString(), to: startOfDay(addDaysYmd(fromYmd, days), tz).toISOString() });

export async function loadFacts(fromYmd: string, days: number, tz: string): Promise<Result<PlanFacts>> {
  const wide = rangeIso(addDaysYmd(fromYmd, -1), days + 2, tz);
  const [s, t, e, p, d] = await Promise.all([studyApi.sessions(wide.from, wide.to), studyApi.tasks('open', null, 100, 0), studyApi.exams(false), studyApi.planPrefs(), studyApi.dashboard()]);
  if (!s.ok) return { ok: false, error: s.error };
  if (!t.ok) return { ok: false, error: t.error };
  if (!e.ok) return { ok: false, error: e.error };
  const recent: Record<string, number> = {};
  if (d.ok) for (const x of d.data.subjects) recent[x.id] = x.minutes7;
  return { ok: true, data: { sessions: s.data.sessions, tasks: t.data.tasks, exams: e.data.exams, prefs: p.ok ? p.data : { saved: false, restDays: [], horizonDays: 7 }, recent } };
}

export interface PlanSettings { dailyMinutes: number; sessionMinutes: number; daysPerWeek: number; partOfDay: string[]; restDays: number[]; horizonDays: number }
export function settingsFrom(me: StudyMe | null, prefs: PlanPrefs): PlanSettings {
  const h = me?.profile?.habits || {};
  const daysPerWeek = h.daysPerWeek || 5;
  return {
    dailyMinutes: h.dailyMinutes || 60, sessionMinutes: h.sessionMinutes || 25, daysPerWeek, partOfDay: h.partOfDay || [],
    restDays: prefs.saved ? prefs.restDays : defaultRestDays(daysPerWeek), horizonDays: prefs.horizonDays || 7
  };
}

export function inputFrom(me: StudyMe | null, facts: PlanFacts, set: PlanSettings, tz: string, now: Date, fromYmd: string, days: number): PlanInput {
  return {
    tz, now, fromYmd, days, dailyMinutes: set.dailyMinutes, sessionMinutes: set.sessionMinutes, daysPerWeek: set.daysPerWeek, restDays: set.restDays,
    partOfDay: set.partOfDay, subjects: planSubjects(me), tasks: facts.tasks, exams: facts.exams, existing: facts.sessions, recentMinutes: facts.recent
  };
}

// "Wed, 14 Oct" for a calendar day written as YYYY-MM-DD
export const dayTitle = (ymd: string): string =>
  new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)), 12)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
