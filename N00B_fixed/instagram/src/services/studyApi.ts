import { supabase } from './supabase';
import type { StudyMe, StudyDashboard, StudyTask, StudyExam, StudySession, StudyProfile, TaskStatus } from '../utils/studyTypes';
import type { ChosenSubject } from '../utils/studyCatalog';
import type { StudyConversation, StudyMessage, StudyMaterial, MaterialHit, MaterialChunk, MaterialKind, StudyQuiz, QuizQuestion, QuizAttemptResult, StudyMistake, StudyDeck, StudyCard, StudyTopic } from '../utils/studyTypes';

// NOOB STUDY: every call goes to a database function that works for the signed-in student alone (see supabase/migrations/20261014…).
// A call never throws: it returns { ok, data } or { ok: false, error }, where the error is a plain sentence a student can read.

// (both fields exist on both shapes so the code reads the same under the project's lenient TypeScript settings)
export interface SketchStroke { t: 'pen' | 'eraser'; c: string; w: number; p: Array<[number, number]>; m?: 's' | 'h' }
export interface StudyProgress {
  days: number;
  totals: { minutes: number; activeDays: number; tasksDone: number; quizzes: number; cards: number; openMistakes: number };
  minutesByDay: Array<{ d: string; n: number }>; minutesBySubject: Array<{ label: string; n: number }>; mistakesBySubject: Array<{ label: string; n: number }>;
  quizScores: Array<{ at: string; title: string; percent: number }>; testScores: Array<{ at: string; name: string; subject: string; percent: number }>; topicStatus: Array<{ label: string; n: number }>;
}
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

// the private store for pictures and documents ("study"): files go when the records that point at them go
async function removeKeys(keys: unknown): Promise<void> {
  const list = (Array.isArray(keys) ? keys : []).filter((k): k is string => typeof k === 'string' && k.length > 0);
  if (list.length) { try { await supabase.storage.from('study').remove(list); } catch { /* the records are gone; a stray file is private and unguessable */ } }
}

export interface StudyGate { mode: 'off' | 'coming_soon' | 'on'; message: string; admissionsOpen: boolean; features: Record<string, boolean>; isAdmin: boolean; admission: StudyAdmission | null }
export interface StudyAdmission { admissionNo: string; fullName: string; birthYear: number | null; level: string; classYear: string; board: string; institution: string; city: string; state: string; country: string; phone: string; guardianName: string; guardianPhone: string; goal: string; heardFrom: string; status: 'admitted' | 'blocked'; admittedAt: string }
export type AdmissionForm = Partial<Omit<StudyAdmission, 'admissionNo' | 'status' | 'admittedAt'>> & { consent?: boolean };

export interface RoomSummary { id: string; name: string; topic: string; goal: string; role: 'owner' | 'member'; members: number }
export interface RoomMember { userId: string; username: string; displayName: string; avatar: string | null; role: 'owner' | 'member'; isMe: boolean; sharesMinutes: boolean; minutes: number | null; studyingNow: boolean | null }
export type CheerKind = 'cheer' | 'proud' | 'break' | 'start';
export interface RoomDetail {
  room: { id: string; name: string; topic: string; goal: string; goalMinutes: number | null; code: string | null; role: 'owner' | 'member'; memberCount: number; maxMembers: number };
  members: RoomMember[]; totalMinutes: number; sharingCount: number;
  me: { shareMinutes: boolean; shareStatus: boolean };
  cheers: Array<{ id: number; kind: CheerKind; from: string; to: string | null; mine: boolean; toMe: boolean; at: string }>;
}

export const studyApi = {
  // is NOOB STUDY open, and has this student been admitted? (works even when it is closed, so the screen can say "coming soon")
  gate: () => call<StudyGate>('study_gate_me'),
  saveAdmission: (form: AdmissionForm) => call<StudyAdmission>('study_admission_save', { p_form: form }),
  publicStatus: () => call<{ mode: 'off' | 'coming_soon' | 'on'; message: string; admissionsOpen: boolean; features: Record<string, boolean> }>('study_public_status'),
  testsStatus: () => call<{ weekKey: string; weekTitle: string; subjects: Array<{ subjectId: string; subject: string; covered: number; testId: string | null; state: 'locked' | 'available' | 'ready' | 'done' | 'expired'; score: number | null; max: number | null; takenAt: string | null }> }>('study_tests_status'),
  test: (id: string) => call<{ id: string; name: string; subject: string; weekKey: string; status: 'ready' | 'done' | 'expired'; score: number | null; max: number | null; takenAt: string | null; questions: Array<{ question: string; options: string[] }> | null }>('study_test_get', { p_id: id }),
  submitTest: (id: string, answers: Array<number | null>, durationSec: number) =>
    call<{ score: number; max: number; percent: number; already: boolean; name?: string; review: Array<{ i: number; question: string; options: string[]; chosen: number | null; answer: number; correct: boolean; explanation: string }> }>('study_test_submit', { p_id: id, p_answers: answers, p_duration: Math.round(durationSec) }),
  testsHistory: (limit = 50) => call<{ tests: Array<{ id: string; name: string; subject: string; score: number; max: number; percent: number; takenAt: string }> }>('study_tests_history', { p_limit: limit }),
  progress: (days = 30) => call<StudyProgress>('study_progress', { p_days: days }),
  notes: (subjectId: string | null = null, search = '') => call<{ notes: Array<{ id: string; title: string; subjectId: string | null; pinned: boolean; preview: string; updatedAt: string }>; count: number; countMax: number }>('study_notes_list', { p_subject: subjectId, p_search: search }),
  note: (id: string) => call<{ id: string; title: string; body: string; subjectId: string | null; pinned: boolean; updatedAt: string }>('study_note_get', { p_id: id }),
  saveNote: (note: { id?: string; clientRef?: string; title?: string; body?: string; subjectId?: string | null; pinned?: boolean }) => call<{ id: string; updatedAt: string }>('study_note_save', { p_note: note }),
  deleteNote: (id: string) => call<{ deleted: boolean }>('study_note_delete', { p_id: id }),
  sketches: () => call<{ sketches: Array<{ id: string; title: string; paper: string; strokes: number; updatedAt: string }>; count: number; countMax: number }>('study_sketches_list'),
  sketch: (id: string) => call<{ id: string; title: string; strokes: SketchStroke[]; width: number; height: number; paper: string; updatedAt: string }>('study_sketch_get', { p_id: id }),
  saveSketch: (sk: { id?: string; clientRef?: string; title?: string; strokes: SketchStroke[]; width: number; height: number; paper: string }) => call<{ id: string; updatedAt: string }>('study_sketch_save', { p_sketch: sk }),
  deleteSketch: (id: string) => call<{ deleted: boolean }>('study_sketch_delete', { p_id: id }),

  rooms: () => call<{ rooms: RoomSummary[] }>('study_rooms_list'),
  roomCreate: (name: string, topic: string, goal: string, goalMinutes: number | null) => call<{ id: string; name: string; code: string }>('study_room_create', { p_name: name, p_topic: topic, p_goal: goal, p_goal_minutes: goalMinutes }),
  roomJoin: (code: string) => call<{ success: boolean; error?: string; id?: string; name?: string; already?: boolean }>('study_room_join', { p_code: code }),
  room: (id: string) => call<RoomDetail>('study_room_get', { p_id: id }),
  roomSettings: (id: string, shareMinutes: boolean | null, shareStatus: boolean | null) => call<{ shareMinutes: boolean; shareStatus: boolean }>('study_room_settings', { p_id: id, p_share_minutes: shareMinutes, p_share_status: shareStatus }),
  roomUpdate: (id: string, name: string, topic: string, goal: string, goalMinutes: number | null) => call<{ id: string; name: string }>('study_room_update', { p_id: id, p_name: name, p_topic: topic, p_goal: goal, p_goal_minutes: goalMinutes }),
  roomNewCode: (id: string) => call<{ code: string }>('study_room_regenerate_code', { p_id: id }),
  roomRemoveMember: (id: string, userId: string) => call<{ success: boolean; removed: boolean }>('study_room_remove_member', { p_id: id, p_user: userId }),
  roomLeave: (id: string) => call<{ success: boolean; left: boolean }>('study_room_leave', { p_id: id }),
  roomDelete: (id: string) => call<{ success: boolean; deleted: boolean }>('study_room_delete', { p_id: id }),
  roomCheer: (id: string, to: string | null, kind: CheerKind) => call<{ success: boolean }>('study_room_cheer', { p_id: id, p_to: to, p_kind: kind }),

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

  // ---- the library: documents kept as text, searched and read, never stored as files
  materials: (subjectId: string | null = null) =>
    call<{ materials: StudyMaterial[]; charsUsed: number; charsMax: number; count: number; countMax: number }>('study_materials_list', { p_subject: subjectId }),
  material: (id: string, after = -1, limit = 12) => call<{ material: StudyMaterial; chunks: MaterialChunk[]; more: boolean }>('study_material_get', { p_id: id, p_after: after, p_limit: limit }),
  createMaterial: (title: string, subjectId: string | null, kind: MaterialKind, sourceName: string, pages: number | null, ref: string) =>
    call<StudyMaterial>('study_material_create', { p_title: title, p_subject: subjectId, p_kind: kind, p_source_name: sourceName, p_pages: pages, p_ref: ref }),
  addChunks: (id: string, chunks: Array<{ page: number | null; text: string }>) => call<{ added: number; material: StudyMaterial }>('study_material_add_chunks', { p_id: id, p_chunks: chunks }),
  finishMaterial: (id: string, note = '') => call<StudyMaterial>('study_material_finish', { p_id: id, p_note: note }),
  updateMaterial: (id: string, title: string, subjectId: string | null) => call<StudyMaterial>('study_material_update', { p_id: id, p_title: title, p_subject: subjectId }),
  deleteMaterial: (id: string) => call<{ deleted: boolean }>('study_material_delete', { p_id: id }),
  searchMaterials: (query: string, subjectId: string | null = null, materialId: string | null = null, limit = 10) =>
    call<{ hits: MaterialHit[] }>('study_material_search', { p_query: query, p_subject: subjectId, p_material: materialId, p_limit: limit }),

  // ---- practice: quizzes, mistakes, flashcards, topics
  saveQuiz: (quiz: { clientRef: string; title: string; topic?: string; subjectId?: string | null; materialId?: string | null; difficulty?: string; source?: string; questions: QuizQuestion[] }) =>
    call<StudyQuiz>('study_quiz_save', { p_quiz: quiz }),
  quizzes: (subjectId: string | null = null, limit = 30) => call<{ quizzes: StudyQuiz[] }>('study_quizzes_list', { p_subject: subjectId, p_limit: limit }),
  quiz: (id: string) => call<StudyQuiz>('study_quiz_get', { p_id: id }),
  deleteQuiz: (id: string) => call<{ deleted: boolean }>('study_quiz_delete', { p_id: id }),
  submitAttempt: (quizId: string, answers: unknown[], marks: Record<number, number>, durationSec: number, ref: string) =>
    call<QuizAttemptResult>('study_quiz_attempt_save', { p_quiz: quizId, p_answers: answers, p_marks: marks, p_duration: Math.round(durationSec), p_ref: ref }),
  mistakes: (subjectId: string | null = null, openOnly = true, limit = 50) => call<{ mistakes: StudyMistake[]; open: number }>('study_mistakes_list', { p_subject: subjectId, p_open_only: openOnly, p_limit: limit }),
  resolveMistake: (id: string, resolved: boolean) => call<StudyMistake>('study_mistake_resolve', { p_id: id, p_resolved: resolved }),
  deleteMistake: (id: string) => call<{ deleted: boolean }>('study_mistake_delete', { p_id: id }),
  quizFromMistakes: (subjectId: string | null = null, limit = 10) => call<StudyQuiz>('study_quiz_from_mistakes', { p_subject: subjectId, p_limit: limit }),
  decks: (subjectId: string | null = null) => call<{ decks: StudyDeck[]; dueTotal: number }>('study_decks_list', { p_subject: subjectId }),
  saveDeck: (deck: { id?: string; clientRef?: string; title: string; subjectId?: string | null; materialId?: string | null }) => call<StudyDeck>('study_deck_save', { p_deck: deck }),
  deleteDeck: (id: string) => call<{ deleted: boolean }>('study_deck_delete', { p_id: id }),
  addCards: (deckId: string, cards: Array<{ front: string; back: string }>) => call<{ added: number; skipped: number; deck: StudyDeck }>('study_cards_add', { p_deck: deckId, p_cards: cards }),
  cards: (deckId: string, limit = 100, offset = 0) => call<{ deck: StudyDeck; cards: StudyCard[] }>('study_cards_list', { p_deck: deckId, p_limit: limit, p_offset: offset }),
  saveCard: (card: { id: string; front: string; back: string }) => call<StudyCard>('study_card_save', { p_card: card }),
  deleteCard: (id: string) => call<{ deleted: boolean }>('study_card_delete', { p_id: id }),
  dueCards: (deckId: string | null = null, limit = 30) => call<{ cards: StudyCard[]; dueTotal: number }>('study_cards_due', { p_deck: deckId, p_limit: limit }),
  reviewCard: (id: string, quality: 1 | 2 | 3 | 4) => call<StudyCard>('study_card_review', { p_card: id, p_quality: quality }),
  reviewDone: (deckId: string | null, count: number, seconds: number) => call<{ success: boolean }>('study_review_done', { p_deck: deckId, p_count: count, p_seconds: Math.round(seconds) }),
  topics: (subjectId: string) => call<{ topics: StudyTopic[] }>('study_topics_list', { p_subject: subjectId }),
  saveTopic: (topic: { id?: string; subjectId?: string; title?: string; status?: string; note?: string }) => call<StudyTopic>('study_topic_save', { p_topic: topic }),
  addTopics: (subjectId: string, titles: string[]) => call<{ added: number; skipped: number }>('study_topics_add_many', { p_subject: subjectId, p_titles: titles }),
  deleteTopic: (id: string) => call<{ deleted: boolean }>('study_topic_delete', { p_id: id }),

  // plan settings, and adding a plan's sessions without replacing anything (used for one exam's revision)
  planPrefs: () => call<{ saved: boolean; restDays: number[]; horizonDays: number }>('study_plan_prefs_get'),
  savePlanPrefs: (restDays: number[], horizonDays: number) => call<{ saved: boolean; restDays: number[]; horizonDays: number }>('study_plan_prefs_save', { p_rest: restDays, p_horizon: horizonDays }),
  addPlan: (plan: Partial<StudySession>[]) => call<{ made: number; clashed: number }>('study_sessions_add_plan', { p_plan: plan }),

  focusStart: (subjectId: string | null, plannedMin: number, kind: 'focus' | 'break' = 'focus') =>
    call<{ id: string; startedAt: string; plannedMin: number; kind: string }>('study_focus_start', { p_subject: subjectId, p_planned: plannedMin, p_kind: kind }),
  focusFinish: (id: string, focusSeconds: number, completed: boolean) =>
    call<{ id: string; status: 'completed' | 'interrupted'; focusSeconds: number; already: boolean }>('study_focus_finish', { p_id: id, p_focus_seconds: Math.round(focusSeconds), p_completed: completed }),

  // ---- the tutor's chats
  aiStatus: () => call<Record<string, { limit: number; used: number; remaining: number }>>('study_ai_status'),
  convs: (subjectId: string | null = null, limit = 30, before: string | null = null) =>
    call<{ conversations: StudyConversation[]; more: boolean }>('study_conv_list', { p_subject: subjectId, p_limit: limit, p_before: before }),
  conv: (id: string, limit = 40, before: string | null = null) =>
    call<{ conversation: StudyConversation; messages: StudyMessage[]; more: boolean }>('study_conv_get', { p_id: id, p_limit: limit, p_before: before }),
  newConv: (subjectId: string | null, mode: 'chat' | 'teach' | 'photo' | 'voice' | 'document' = 'chat', title = '', topic = '') =>
    call<StudyConversation>('study_conv_create', { p_subject: subjectId, p_mode: mode, p_title: title, p_topic: topic }),
  renameConv: (id: string, title: string) => call<StudyConversation>('study_conv_rename', { p_id: id, p_title: title }),
  convContext: (id: string, subjectId: string | null, topic: string) => call<StudyConversation>('study_conv_set_context', { p_id: id, p_subject: subjectId, p_topic: topic }),
  deleteConv: async (id: string): Promise<Result<{ deleted: boolean; files: string[] }>> => {
    const res = await call<{ deleted: boolean; files: string[] }>('study_conv_delete', { p_id: id });
    if (res.ok) await removeKeys(res.data.files);
    return res;
  },

  // 'activity': the focus history and activity log. 'all': everything of NOOB STUDY for this person (the NOOB account is untouched).
  deleteMyData: async (scope: 'activity' | 'all' | 'conversations' | 'library' | 'practice' | 'notepad'): Promise<Result<{ removedFiles: string[] }>> => {
    const res = await call<{ removedFiles: string[] }>('study_delete_my_data', { p_scope: scope });
    if (res.ok) await removeKeys(res.data.removedFiles);
    return res;
  }
};
