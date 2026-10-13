import { supabase } from './supabase';

// The administrator's side of NOOB STUDY. Every call is checked by the database: only the main administrator gets an answer. None of these ever returns a
// student's chats, pictures, notes or sketches (they are not in the database functions at all).
export type StudyMode = 'off' | 'coming_soon' | 'on';
export const STUDY_PARTS: Array<{ key: string; label: string; hint: string }> = [
  { key: 'tutor', label: 'AI tutor', hint: 'Chat, photo doubts, voice' },
  { key: 'tests', label: 'Weekly tests', hint: 'The 10-question test for each subject' },
  { key: 'practice', label: 'Practice', hint: 'Quizzes, mistakes, flashcards' },
  { key: 'library', label: 'Notes and library', hint: 'Documents, summaries' },
  { key: 'research', label: 'Official sources and past papers', hint: 'Web research, paper patterns' },
  { key: 'rooms', label: 'Study rooms', hint: 'Studying with friends' },
  { key: 'notepad', label: 'Notepad and sketch board', hint: 'Notes and drawings' }
];

export interface StudySettings { mode: StudyMode; message: string; admissionsOpen: boolean; features: Record<string, boolean>; updatedAt: string | null; updatedBy: string | null }
export interface DayPoint { d: string; n: number }
export interface LabelCount { label: string; n: number }
export interface StudyOverview {
  days: number;
  totals: Record<string, number | null>;
  series: { admissions: DayPoint[]; active: DayPoint[]; minutes: DayPoint[]; questions: DayPoint[] };
  tests: DayPoint[]; scoreHistogram: LabelCount[]; byLevel: LabelCount[]; byBoard: LabelCount[]; bySubject: LabelCount[]; aiByKind: LabelCount[];
}
export interface StudentRow { userId: string; username: string; admissionNo: string; fullName: string; level: string; board: string; institution: string; city: string; status: 'admitted' | 'blocked'; admittedAt: string; onboardingDone: boolean; minutes7: number; lastActive: string | null; testsTaken: number; avgScore: number | null }
export interface StudentDetail {
  admission: { admissionNo: string; fullName: string; birthYear: number | null; level: string; classYear: string; board: string; institution: string; city: string; state: string; country: string; phone: string; guardianName: string; guardianPhone: string; goal: string; heardFrom: string; status: 'admitted' | 'blocked'; admittedAt: string };
  user: { userId: string; username: string; displayName: string; email: string | null };
  profile: { language: string; timezone: string; stream: string; onboardingDone: boolean; goals: Record<string, unknown>; habits: Record<string, unknown> };
  subjects: Array<{ name: string; kind: string }>;
  counts: Record<string, number>;
  minutesByDay: DayPoint[]; minutesBySubject: LabelCount[];
  tests: Array<{ name: string; subject: string; score: number; max: number; at: string }>;
  quizzes: Array<{ title: string; percent: number; at: string }>;
  activity: Array<{ kind: string; minutes: number; at: string }>;
}

// (both shapes list both fields, so the code reads the same under the project's lenient TypeScript settings)
type Out<T> = { ok: true; data: T; error?: undefined } | { ok: false; error: string; data?: undefined };
async function call<T>(fn: string, args?: Record<string, unknown>): Promise<Out<T>> {
  try {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) return { ok: false, error: error.message || 'Something went wrong.' };
    return { ok: true, data: data as T };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Something went wrong.' }; }
}

export const adminStudy = {
  settings: () => call<StudySettings>('admin_study_settings_get'),
  saveSettings: (mode: StudyMode, message: string, admissionsOpen: boolean, features: Record<string, boolean>) => call<StudySettings>('admin_study_settings_save', { p_mode: mode, p_message: message, p_admissions_open: admissionsOpen, p_features: features }),
  overview: (days: number) => call<StudyOverview>('admin_study_overview', { p_days: days }),
  students: (search: string, limit: number, offset: number) => call<{ total: number; students: StudentRow[] }>('admin_study_students', { p_search: search, p_limit: limit, p_offset: offset }),
  student: (userId: string) => call<StudentDetail>('admin_study_student', { p_user: userId }),
  setStatus: (userId: string, status: 'admitted' | 'blocked') => call<{ success: boolean; status: string }>('admin_study_set_student_status', { p_user: userId, p_status: status })
};
