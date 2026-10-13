// NOOB STUDY: the shapes the server sends and the app uses.

export interface StudyGoals { mainGoals?: string[]; career?: string; exam?: string; targets?: string; difficultTopics?: string; strongSubjects?: string; beyondSyllabus?: string; skills?: string; biggestProblem?: string }
export interface StudyHabits { studyTimes?: string; dailyMinutes?: number; daysPerWeek?: number; sessionMinutes?: number; partOfDay?: string[]; learningStyles?: string[]; commitments?: string; examNote?: string }
export interface TutorPrefs { name?: string; language?: string; style?: string; length?: 'short' | 'detailed'; level?: 'beginner' | 'advanced'; examples?: 'real' | 'formal'; mode?: 'text' | 'voice' | 'mixed'; accessibility?: string; reminders?: string; voice?: string; teachMode?: boolean }
export interface StudyPrivacy { recommendations?: boolean; trackActivity?: boolean; useHistory?: boolean }

export interface StudyProfile {
  displayName: string; country: string; language: string; timezone: string; level: string | null;
  institution: string; board: string; classYear: string; stream: string; course: string; specialization: string;
  goals: StudyGoals; habits: StudyHabits; tutor: TutorPrefs; privacy: StudyPrivacy;
  onboardingStep: number; onboardingDone: boolean;
}
export interface StudySubject { id: string; name: string; kind: 'catalogue' | 'custom'; position: number }
export interface StudyMe { profile: StudyProfile | null; subjects: StudySubject[] }

export type TaskStatus = 'todo' | 'doing' | 'done';
export type TaskKind = 'task' | 'homework' | 'revision' | 'practice' | 'exam_prep';
export type Priority = 'low' | 'normal' | 'high';
export interface StudyTask {
  id: string; subjectId: string | null; title: string; description: string; kind: TaskKind; dueAt: string | null; priority: Priority;
  estMinutes: number | null; status: TaskStatus; completedAt: string | null; attachment: string | null; createdAt: string; updatedAt: string;
}
export interface StudyExam { id: string; subjectId: string | null; title: string; examAt: string; notes: string }

export type SessionActivity = 'study' | 'revise' | 'practice' | 'homework' | 'review_mistakes' | 'read' | 'flashcards';
export interface StudySession {
  id: string; subjectId: string | null; topic: string; startsAt: string; durationMin: number; objective: string; activity: SessionActivity;
  priority: Priority; status: 'planned' | 'done' | 'skipped'; source: 'manual' | 'ai'; why: string;
}

export interface DashSubject { id: string; name: string; kind: string; pendingTasks: number; minutes7: number; lastActivity: string | null; nextSession: { topic: string; startsAt: string } | null }
export interface StudyDashboard {
  today: string; timezone: string;
  tasksToday: StudyTask[]; overdue: StudyTask[]; upcoming: StudyTask[]; sessionsToday: StudySession[]; exams: StudyExam[];
  week: { date: string; minutes: number }[]; subjects: DashSubject[];
  stats: { activeDays7: number; minutes7: number; tasksDone7: number; streak: number };
}

export interface StudyConversation { id: string; title: string; subjectId: string | null; mode: 'chat' | 'teach' | 'photo' | 'voice' | 'document'; topic: string; materialId: string | null; createdAt: string; lastMessageAt: string; preview: string }
export interface StudyMessage { id: string; role: 'user' | 'assistant'; content: string; attachments: Array<{ key: string; kind: 'image' }>; meta: Record<string, unknown>; createdAt: string }
