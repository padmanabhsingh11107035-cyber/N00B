import { supabase, MEDIA_BUCKET } from './supabase';
import type { StudyMe, StudyDashboard, StudyTask, StudyExam, StudySession, StudyProfile, TaskStatus } from '../utils/studyTypes';
import type { ChosenSubject } from '../utils/studyCatalog';

// NOOB STUDY: every call goes to a database function that works for the signed-in student alone (see supabase/migrations/20261014…).
// A call never throws: it returns { ok, data } or { ok: false, error }, where the error is a plain sentence a student can read.

// (both fields exist on both shapes so the code reads the same under the project's lenient TypeScript settings)
export type Result<T> = { ok: true; data: T; error?: undefined } | { ok: false; error: string; data?: undefined };

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<Result<T>> {
  try {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) return { ok: false, error: friendly(error.message) };
    return { ok: true, data: data as T };
  } catch (err) {
    return { ok: false, error: friendly(err instanceof Error ? err.message : '') };
  }
}

// The database already writes its refusals as sentences for students; only technical noise is replaced.
export function friendly(message: string): string {
  const m = String(message || '').trim();
  if (!m) return 'Something went wrong. Please try again.';
  if (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(m)) return 'You seem to be offline. Please check your connection and try again.';
  if (/could not find the function|schema cache|does not exist/i.test(m)) return 'This part of NOOB STUDY is still being set up. Please try again a little later.';
  if (/JWT|not authenticated|Please log in/i.test(m)) return 'Please log in again to continue.';
  return m;
}

export const newRef = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(16)}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`);

export const studyApi = {
  me: () => call<StudyMe>('study_me'),
  saveProfile: (patch: Partial<StudyProfile>, step?: number) => call<StudyMe>('study_save_profile', { p_patch: patch, p_step: step ?? null }),
  setSubjects: (subjects: ChosenSubject[]) => call<StudyMe>('study_set_subjects', { p_subjects: subjects }),
  completeOnboarding: () => call<StudyMe>('study_complete_onboarding'),
  dashboard: () => call<StudyDashboard>('study_dashboard'),

  tasks: (filter: 'open' | 'upcoming' | 'overdue' | 'done' | 'all' = 'open', subjectId: string | null = null, limit = 60, offset = 0) =>
    call<{ tasks: StudyTask[]; limit: number; offset: number }>('study_tasks_list', { p_filter: filter, p_subject: subjectId, p_limit: limit, p_offset: offset }),
  saveTask: (task: Partial<StudyTask> & { clientRef?: string }) => call<StudyTask>('study_task_save', { p_task: task }),
  taskStatus: (id: string, status: TaskStatus) => call<StudyTask>('study_task_status', { p_id: id, p_status: status }),
  deleteTask: (id: string) => call<{ deleted: boolean; attachment: string | null }>('study_task_delete', { p_id: id }),

  exams: (includePast = false) => call<{ exams: StudyExam[] }>('study_exams_list', { p_include_past: includePast }),
  saveExam: (exam: Partial<StudyExam> & { clientRef?: string }) => call<StudyExam>('study_exam_save', { p_exam: exam }),
  deleteExam: (id: string) => call<{ deleted: boolean }>('study_exam_delete', { p_id: id }),

  sessions: (fromIso: string, toIso: string) => call<{ sessions: StudySession[] }>('study_sessions_list', { p_from: fromIso, p_to: toIso }),
  saveSession: (session: Partial<StudySession> & { clientRef?: string }) => call<StudySession>('study_session_save', { p_session: session }),
  sessionStatus: (id: string, status: StudySession['status']) => call<StudySession>('study_session_status', { p_id: id, p_status: status }),
  deleteSession: (id: string) => call<{ deleted: boolean }>('study_session_delete', { p_id: id }),
  replacePlan: (plan: Partial<StudySession>[], fromIso: string, toIso: string) =>
    call<{ made: number; kept: number; sessions: StudySession[] }>('study_sessions_replace_plan', { p_plan: plan, p_from: fromIso, p_to: toIso }),

  focusStart: (subjectId: string | null, plannedMin: number, kind: 'focus' | 'break' = 'focus') =>
    call<{ id: string; startedAt: string; plannedMin: number; kind: string }>('study_focus_start', { p_subject: subjectId, p_planned: plannedMin, p_kind: kind }),
  focusFinish: (id: string, focusSeconds: number, completed: boolean) =>
    call<{ id: string; status: 'completed' | 'interrupted'; focusSeconds: number; already: boolean }>('study_focus_finish', { p_id: id, p_focus_seconds: Math.round(focusSeconds), p_completed: completed }),

  // 'activity': the focus history and activity log. 'all': everything of NOOB STUDY for this person (the NOOB account is untouched).
  deleteMyData: async (scope: 'activity' | 'all'): Promise<Result<{ removedFiles: string[] }>> => {
    const res = await call<{ removedFiles: string[] }>('study_delete_my_data', { p_scope: scope });
    if (res.ok) {
      const keys = (res.data.removedFiles || []).filter((k) => typeof k === 'string' && k.length > 0);
      if (keys.length) { try { await supabase.storage.from(MEDIA_BUCKET).remove(keys); } catch { /* the records are gone; a stray file is harmless and unguessable */ } }
    }
    return res;
  }
};
